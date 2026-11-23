import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash} from 'node:crypto'
import {constants} from 'node:fs'
import {lstat,open,realpath,stat} from 'node:fs/promises'
import {isAbsolute,relative,resolve,sep} from 'node:path'
import {unzipSync} from 'fflate'
import {loadPdfLibrary} from './pdf-library.js'

export const PRESENTATION_FILES_TOOL='presentation_files'
const MAX_BYTES=128*1024*1024,MAX_XML=2*1024*1024
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=256
const turnId=value=>Number.isSafeInteger(value)?String(value):validId(value)?value:undefined
const inside=(root,path)=>{const part=relative(root,path);return part!==''&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part)}
const failure=()=>Error('文件登记上下文已变化，请在当前会话重新登记。')
const account=ctx=>{const bridge=ctx.get?.('eworkIntegrations');return bridge?bridge.snapshot:undefined}

function identity(ctx,exec,env){
 const agent=exec.agent,session=agent?.session,events=session?.events,header=session?.header
 if(!validId(exec.callId)||!validId(agent?.id)||session?.id!==agent.id||ctx.agents?.get(agent.id)!==agent||header?.origin==='subagent'||header?.delegationDepth!==undefined&&header.delegationDepth!==0||!Array.isArray(events))throw failure()
 const start=events.findLast(event=>event?.type==='turn/start'),turn=turnId(start?.data?.turn)
 const user=events.findLast(event=>event?.type==='user/message'&&event.data?.source?.kind==='user')
 const latest=events.findLast(event=>event?.type==='user/message')
 if(turn&&events.indexOf(latest)>events.indexOf(start)&&latest?.data?.source?.kind==='goal')throw Error('目标自动续轮不使用文件登记工具；请在最终回复提供精确的 Markdown 文件链接，不要重复调用登记。')
 if(!turn||!user||events.indexOf(user)<events.indexOf(start)||events.some(event=>event?.type==='turn/end'&&turnId(event.data?.turn)===turn))throw failure()
 const currentAccount=account(ctx)
 if((ctx.get?.('eworkIntegrations')||env.EWORK_INTEGRATION_BRIDGE)&&(!validId(currentAccount?.ownerAccountId)||!validId(currentAccount?.runtimeEpoch)))throw failure()
 if(typeof header.cwd!=='string'||!isAbsolute(header.cwd)||/[\p{Cc}\p{Cf}]/u.test(header.cwd))throw failure()
 return{agent,session,start,user,turn,cwd:header.cwd,owner:currentAccount?.ownerAccountId,epoch:currentAccount?.runtimeEpoch}
}

function assertCurrent(ctx,exec,owner,disposed){
 exec.signal?.throwIfAborted()
 const events=owner.session.events,currentAccount=account(ctx)
 if(disposed()||ctx.agents?.get(owner.agent.id)!==owner.agent||owner.agent.session!==owner.session||owner.session.header?.cwd!==owner.cwd||!Array.isArray(events)||events.findLast(event=>event?.type==='turn/start')!==owner.start||events.findLast(event=>event?.type==='user/message'&&event.data?.source?.kind==='user')!==owner.user||events.some(event=>event?.type==='turn/end'&&turnId(event.data?.turn)===owner.turn)||currentAccount?.ownerAccountId!==owner.owner||currentAccount?.runtimeEpoch!==owner.epoch)throw failure()
}

async function policy(ctx,owner,root){
 const service=ctx.get?.('sandboxPolicy')
 if(!service)throw Error('当前会话缺少文件访问策略，未登记文件。')
 const value=await service.resolve({session:owner.session})
 if(!value||!['read-only','workspace-write','danger-full-access'].includes(value.mode)||typeof value.workspaceRoot!=='string'||await realpath(value.workspaceRoot)!==root||value.sessionId!==undefined&&value.sessionId!==owner.agent.id)throw Error('当前会话文件访问策略不匹配，未登记文件。')
}

function pathsFor(args,root,cwd){
 if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).some(key=>!['paths','complete'].includes(key))||('complete' in args && typeof args.complete!=='boolean')||!Array.isArray(args.paths)||args.paths.length<1||args.paths.length>4)throw Error('请明确提供当前工作区的 PPTX/PDF 文件路径。')
 const result=[]
 for(const path of args.paths){
  if(typeof path!=='string'||!path||path.length>2048||path!==path.trim()||/[\p{Cc}\p{Cf}\\]/u.test(path)||/^[A-Za-z][\w+.-]*:|^~|^\/\//.test(path)||path.split('/').some(part=>part==='..')||!/\.(?:pptx|pdf)$/i.test(path))throw Error('只接受工作区内无路径穿越的 PPTX/PDF 文件路径。')
  let normalized=resolve(root,path)
  // Canonicalize the approved workspace root alias (/tmp, /var) only.
  // Nested-directory and file symlinks are still rejected before reading.
  if(isAbsolute(path)&&inside(cwd,normalized))normalized=resolve(root,relative(cwd,normalized))
  if(!result.includes(normalized))result.push(normalized)
 }
 if(result.length>2||new Set(result.map(path=>path.split('.').at(-1).toLowerCase())).size!==result.length)throw Error('每次只登记一个指定的 PPTX 和一个 PDF，不自动选择其他草稿。')
 return result
}

function presentationFormat(bytes){
 const names=new Set(['[Content_Types].xml','ppt/presentation.xml'])
 const seen=new Set();let entries
 try{entries=unzipSync(bytes,{filter:entry=>{if(!names.has(entry.name))return false;if(seen.has(entry.name)||!Number.isSafeInteger(entry.originalSize)||entry.originalSize<1||entry.originalSize>MAX_XML)throw Error('invalid package');seen.add(entry.name);return true}})}catch{throw Error('PPTX 文件包无法读取，未登记。')}
 const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes)
 let types,document
 try{types=decode(entries['[Content_Types].xml']);document=decode(entries['ppt/presentation.xml'])}catch{throw Error('文件不是可读取的 PPTX 演示文稿。')}
 const overrides=types.match(/<(?:\w+:)?Override\b[^>]*>/g)??[]
 if(!overrides.some(tag=>/\bPartName\s*=\s*["']\/ppt\/presentation\.xml["']/.test(tag)&&/\bContentType\s*=\s*["']application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation\.main\+xml["']/.test(tag))||!/<(?:\w+:)?presentation\b/.test(document)||!document.includes('http://schemas.openxmlformats.org/presentationml/2006/main'))throw Error('文件不是可读取的 PPTX 演示文稿。')
}

async function pdfFormat(bytes,signal){
 if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('文件不是可读取的 PDF。')
 const {getDocument}=await loadPdfLibrary()
 signal?.throwIfAborted()
 const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,verbosity:0})
 let destroy
 const close=()=>destroy??=Promise.resolve().then(()=>task.destroy()).catch(()=>{})
 const stop=()=>{void close()};signal?.addEventListener('abort',stop,{once:true})
 try{const document=await task.promise;signal?.throwIfAborted();if(!Number.isSafeInteger(document.numPages)||document.numPages<1)throw Error('empty PDF')}
 catch(error){signal?.throwIfAborted();throw Error('PDF 结构无法读取，未登记。')}
 finally{signal?.removeEventListener('abort',stop);await close()}
}

/** Explicit read-only publication. File availability never establishes quality acceptance. */
export function registerPresentationFiles(ctx,{env=process.env}={}){
 let disposed=false
 const active=new Set()
 const unregister=ctx.tools.register(defineTool({
  name:PRESENTATION_FILES_TOOL,
  description:'在当前用户主会话登记本轮指定的 PPTX/PDF，最终显示文件卡片。保存后调用一次，paths 指定当前工作区内一个 PPTX 和/或一个 PDF；不扫描旧稿、不写文件、不启动桌面操作。宿主核对普通文件与真实格式。登记只表示可读取，质量门禁及原生验收仍须如实说明。目标自动续轮改用最终 Markdown 文件链接，不反复调用。',
  parameters:{complete:{type:'boolean',description:'仅当本轮所有交付和用户要求的核验均已完成时置 true。登记成功后结束本轮，失败仍可修正；中间预览或还有其他工作时省略。'},paths:{type:'array',required:true,items:{type:'string'},description:'本轮交付文件的精确相对或绝对路径，最多一个 PPTX 和一个 PDF。'}},
  output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
  presentCall:()=>({card:'generic',kind:'read',title:'登记演示文稿交付文件'}),
  async execute(args,exec){
   if(disposed||active.size>=2)throw Error('文件登记暂不可用，请稍后重试。')
   const controller=new AbortController(),abort=()=>controller.abort();active.add(controller);exec.signal?.addEventListener('abort',abort,{once:true})
   const timer=setTimeout(abort,30000),signal=AbortSignal.any([controller.signal,...exec.signal?[exec.signal]:[]])
   const execution={...exec,signal}
   try{
    const owner=identity(ctx,execution,env),check=()=>assertCurrent(ctx,execution,owner,()=>disposed)
    check()
    const workspace=await ctx.workspaceRegistry?.resolveByPath(owner.cwd),root=await realpath(owner.cwd)
    if(!workspace||!validId(workspace.id)||typeof workspace.path!=='string'||await realpath(workspace.path)!==root||!(await stat(root)).isDirectory())throw Error('当前会话的已注册工作区不可用。')
    const paths=pathsFor(args,root,owner.cwd)
    check();await policy(ctx,owner,root);check()
    const files=[],identities=[]
    for(const path of paths){
     if(!inside(root,path)||await realpath(path)!==path)throw Error('文件须位于当前工作区，不能通过符号链接或其他目录登记。')
     const info=await lstat(path);check()
     if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>MAX_BYTES)throw Error('文件不是可读取的普通文件，或超过 128MB。')
     const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
     try{
      const before=await handle.stat()
      if(before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size||before.mtimeMs!==info.mtimeMs)throw failure()
      const bytes=await handle.readFile({signal});check()
      if(bytes.length!==info.size||bytes.length>MAX_BYTES)throw failure()
      const format=path.split('.').at(-1).toLowerCase()
      if(format==='pptx')presentationFormat(bytes);else await pdfFormat(bytes,signal)
      const after=await handle.stat(),latest=await lstat(path)
      if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||latest.dev!==after.dev||latest.ino!==after.ino||latest.size!==after.size||latest.mtimeMs!==after.mtimeMs||await realpath(path)!==path)throw failure()
      files.push({format,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
      identities.push({path,dev:after.dev,ino:after.ino,size:after.size,mtimeMs:after.mtimeMs})
     }finally{await handle.close()}
    }
    await policy(ctx,owner,root);check()
    if((await ctx.workspaceRegistry.resolveByPath(owner.cwd))?.id!==workspace.id)throw failure()
    if(await realpath(owner.cwd)!==root)throw failure()
    for(const expected of identities){const latest=await lstat(expected.path);if(!latest.isFile()||latest.isSymbolicLink()||latest.dev!==expected.dev||latest.ino!==expected.ino||latest.size!==expected.size||latest.mtimeMs!==expected.mtimeMs||await realpath(expected.path)!==expected.path)throw failure()}
    check()
    if(args.complete===true)exec.concludeTurn()
    return JSON.stringify({kind:'ework-presentation-files',version:1,tool:PRESENTATION_FILES_TOOL,ok:true,status:'available',...(args.complete===true && {complete:true}),sessionId:owner.agent.id,turnId:owner.turn,callId:exec.callId,qualityVerification:'not-evaluated',files})
   }finally{clearTimeout(timer);exec.signal?.removeEventListener('abort',abort);active.delete(controller)}
  }
 }))
 return()=>{disposed=true;for(const controller of active)controller.abort();unregister()}
}
