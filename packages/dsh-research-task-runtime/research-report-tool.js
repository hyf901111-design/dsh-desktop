import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash} from 'node:crypto'
import {lstat,opendir,readFile,realpath,stat} from 'node:fs/promises'
import {basename,isAbsolute,join,relative,resolve,sep} from 'node:path'
import {bundledSkillEnabled} from './bundled-skill-preferences.js'

const SLUG='ework-equity-research',MAX_INPUT=4*1024*1024,MAX_OUTPUT=64*1024*1024,JOB_TIMEOUT_MS=90_000
const FIXED_OUTPUTS=new Map([['manifest','run.json'],['validation','validation.json'],['evidence','evidence.json'],['calculations','calculations.json'],['quality','report-quality.json']])
const ARTIFACT_TYPES=new Set(['html','pdf',...FIXED_OUTPUTS.keys()])
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
const inside=(root,path)=>{const part=relative(root,path);return part!==''&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part)}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const live=(ctx,agent,cwd)=>!!agent&&typeof agent.id==='string'&&ctx.agents?.get(agent.id)===agent&&agent.session?.id===agent.id&&(!cwd||agent.session.header?.cwd===cwd)
const fail=message=>{throw Error(message)}

function argumentsFor(args){
 if(!object(args)||Object.keys(args).some(key=>!['command','input','out'].includes(key))||!['doctor','validate','run'].includes(args.command))fail('研报工具只接受固定 doctor、validate、run 命令及其文件参数。')
 const expected=args.command==='doctor'?['command']:args.command==='validate'?['command','input']:['command','input','out']
 if(Object.keys(args).length!==expected.length||expected.some(key=>!Object.hasOwn(args,key)))fail('研报命令参数无效。')
 if(args.input!==undefined&&(typeof args.input!=='string'||!args.input.trim()||args.input.length>2048||isAbsolute(args.input)||/^[A-Za-z]:/.test(args.input)||/[\\\u0000-\u001f]/.test(args.input)||args.input.split('/').some(part=>part==='..')))fail('input 必须是当前会话工作区内的相对 packet 文件路径。')
 if(args.out!==undefined&&(typeof args.out!=='string'||!args.out.trim()||args.out.length>120||Buffer.byteLength(args.out)>240||/[\\/\u0000-\u001f:]/.test(args.out)||args.out==='.'||args.out.includes('..')||/[. ]$/.test(args.out)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(args.out)))fail('out 必须是工作区根目录下一层全新的目录名。')
 return args
}

async function executionRoot(ctx,exec){
 const agent=exec.agent,cwd=agent?.session?.header?.cwd,header=agent?.session?.header
 if(!live(ctx,agent)||header?.origin==='subagent'||header?.delegationDepth!==undefined&&header.delegationDepth!==0)fail('研报生成需要当前用户主会话。')
 if(typeof cwd!=='string'||!isAbsolute(cwd)||cwd.includes('\0'))fail('当前会话未绑定有效工作区。')
 const workspace=await ctx.workspaceRegistry?.resolveByPath(cwd)
 const root=await realpath(cwd)
 if(!workspace||typeof workspace.id!=='string'||await realpath(workspace.path)!==root||!(await stat(root)).isDirectory()||!live(ctx,agent,cwd))fail('当前会话的已注册工作区已变化或不可用。')
 return{agent,cwd,root,workspace}
}

function assertCurrent(ctx,identity,signal){
 signal?.throwIfAborted()
 if(!live(ctx,identity.agent,identity.cwd)||!bundledSkillEnabled(ctx,SLUG))fail('当前会话或内置研报技能已变化，请重新运行。')
}

async function builtinCli(env){
 if(typeof env.DSH_BUNDLED_SKILL_DIR!=='string'||!isAbsolute(env.DSH_BUNDLED_SKILL_DIR))fail('客户端内置研报资源未就绪。')
 const bundle=await realpath(env.DSH_BUNDLED_SKILL_DIR),root=join(bundle,SLUG),script=join(root,'scripts','research.mjs')
 if(await realpath(root)!==root||await realpath(script)!==script||!(await stat(script)).isFile())fail('研报引擎必须来自客户端固定内置资源。')
 return script
}

async function policyFor(ctx,identity,command){
 const service=ctx.get?.('sandboxPolicy'),sandbox=ctx.get?.('sandbox')
 if(!service){
  if(sandbox||ctx.get?.('shell')?.sandboxMode!==undefined||ctx.get?.('fs')?.sandboxMode!==undefined)fail('当前会话缺少文件沙箱策略，未运行研报引擎。')
  return undefined
 }
 const policy=await service.resolve({session:identity.agent.session})
 if(!policy||!['read-only','workspace-write','danger-full-access'].includes(policy.mode)||typeof policy.workspaceRoot!=='string'||await realpath(policy.workspaceRoot)!==identity.root||policy.sessionId!==undefined&&policy.sessionId!==identity.agent.id)fail('当前会话沙箱工作区不匹配，未运行研报引擎。')
 if(command==='run'&&policy.mode==='read-only')fail('当前会话为只读模式，不能创建研报文件。')
 if(policy.mode!=='danger-full-access'&&!sandbox?.confine)fail('当前会话缺少可执行的文件沙箱，未运行研报引擎。')
 return{...policy,workspaceRoot:identity.root,sessionId:identity.agent.id}
}

function privateCliEnvironment(env){
 let endpoint
 try{endpoint=new URL(env.SHERLOCK_RESEARCH_CONTEXT_URL)}catch{fail('客户端 PDF 服务未就绪。')}
 if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!endpoint.port||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||typeof env.SHERLOCK_RESEARCH_CONTEXT_TOKEN!=='string'||!env.SHERLOCK_RESEARCH_CONTEXT_TOKEN)fail('客户端 PDF 服务未就绪。')
 // ctx.subprocess merges explicit entries after its normal credential scrub.
 // Tombstone the rest of the ambient environment; the fixed CLI needs no
 // account/integration bridge, NODE_OPTIONS, NODE_PATH or model-provided env.
 const child=Object.fromEntries([...new Set([...Object.keys(process.env),...Object.keys(env),'NODE_OPTIONS','NODE_PATH'])].map(key=>[key,undefined]))
 for(const key of['PATH','Path','HOME','USERPROFILE','TMPDIR','TEMP','TMP','SystemRoot','SYSTEMROOT','WINDIR','LANG','LC_ALL','LC_CTYPE','TZ'])if(typeof env[key]==='string')child[key]=env[key]
 return{...child,SHERLOCK_RESEARCH_CONTEXT_URL:endpoint.origin,SHERLOCK_RESEARCH_CONTEXT_TOKEN:env.SHERLOCK_RESEARCH_CONTEXT_TOKEN}
}

async function boundedRead(file,limit=MAX_OUTPUT){
 const info=await lstat(file)
 if(!info.isFile()||info.isSymbolicLink()||info.size>limit)throw Error('研报输出文件无效或过大。')
 const bytes=await readFile(file)
 if(bytes.length>limit)throw Error('研报输出文件过大。')
 return bytes
}

function reportBasename(name,type){
 return typeof name==='string'&&Buffer.byteLength(name)<=240&&name===name.normalize('NFC')&&!/^[. ]|[<>:"/\\|?*\p{Cc}\p{Cf}\u2028\u2029]/u.test(name)&&!/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)&&name.endsWith('.'+type)&&name.length>type.length+1
}

function manifestNames(manifest){
 const names=manifest?.artifacts
 if(!object(names)||names.manifest!=='run.json'||Object.keys(names).length>ARTIFACT_TYPES.size)throw Error('研报交付文件映射无效。')
 for(const[key,name]of Object.entries(names))if(!ARTIFACT_TYPES.has(key)||(FIXED_OUTPUTS.has(key)?name!==FIXED_OUTPUTS.get(key):!reportBasename(name,key)))throw Error('研报交付文件名无效。')
 if(names.pdf&&(!names.html||names.pdf.slice(0,-4)!==names.html.slice(0,-5)))throw Error('HTML 与 PDF 必须使用同一正式报告名。')
 return names
}

async function resultArtifacts(root,out){
 if(!out)return{}
 const directory=join(root,out)
 try{if(await realpath(directory)!==directory)return{}}catch{return{}}
 const artifacts={}
 const add=async(key,name)=>{try{const info=await lstat(join(directory,name));if(info.isFile()&&!info.isSymbolicLink())artifacts[key]=join(directory,name)}catch{}}
 for(const[key,name]of FIXED_OUTPUTS)await add(key,name)
 if(artifacts.manifest)try{
  const names=manifestNames(JSON.parse(await boundedRead(artifacts.manifest,1024*1024)))
  for(const key of['html','pdf'])if(names[key])await add(key,names[key])
  return artifacts
 }catch{}
 // Cancellation can precede run.json. Recover only unambiguous safe regular
 // report files from a bounded listing; these paths never establish success.
 const candidates={html:[],pdf:[]};let entries=0
 try{for await(const entry of await opendir(directory)){
  if(++entries>16)return artifacts
  if(!entry.isFile()||entry.isSymbolicLink())continue
  for(const type of['html','pdf'])if(reportBasename(entry.name,type))candidates[type].push(entry.name)
 }}catch{return artifacts}
 for(const type of['html','pdf'])if(candidates[type].length===1)await add(type,candidates[type][0])
 return artifacts
}

async function verifiedManifest(artifacts,inputSha256){
 if(!artifacts.manifest)return undefined
 const manifest=JSON.parse(await boundedRead(artifacts.manifest,1024*1024))
 if(!object(manifest)||manifest.inputSha256!==inputSha256||!object(manifest.outputs)||Object.keys(manifest.outputs).length>=ARTIFACT_TYPES.size)throw Error('研报运行记录与输入不匹配。')
 const names=manifestNames(manifest),typesByName=new Map(Object.entries(names).map(([key,name])=>[name,key]))
 if(Object.keys(artifacts).some(key=>!Object.hasOwn(names,key)))throw Error('研报实际文件未列入交付映射。')
 for(const[key,name]of Object.entries(names))if(!artifacts[key]||basename(artifacts[key])!==name||key!=='manifest'&&!Object.hasOwn(manifest.outputs,name))throw Error('研报文件映射缺少实际文件或摘要。')
 const dual=manifest.delivery?.pdf?.status==='generated'
 if(dual&&['html','pdf','evidence','calculations','validation','quality'].some(key=>!names[key]||!Object.hasOwn(manifest.outputs,names[key])))throw Error('双格式报告缺少必需的输出摘要。')
 for(const[name,expected]of Object.entries(manifest.outputs)){
  const key=typesByName.get(name)
  if(!key||key==='manifest'||!artifacts[key]||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||hash(await boundedRead(artifacts[key],key==='pdf'?32*1024*1024:MAX_OUTPUT))!==expected)throw Error('研报交付文件摘要校验失败。')
 }
 if(dual){
  const pdf=await boundedRead(artifacts.pdf,32*1024*1024)
  if(pdf.subarray(0,5).toString('ascii')!=='%PDF-'||manifest.delivery.pdf.bytes!==pdf.length||manifest.delivery.pdf.sha256!==hash(pdf)||manifest.outputs[names.pdf]!==manifest.delivery.pdf.sha256)throw Error('PDF 交付记录与实际字节不一致。')
 }
 return manifest
}

const diagnostics=value=>Array.isArray(value)?value.slice(0,100).filter(object).map(row=>Object.fromEntries(['severity','code','path','message'].filter(key=>typeof row[key]==='string').map(key=>[key,row[key].slice(0,4000)]))):[]

/** A capability for the client-owned CLI, not a second Bash or credential export. */
export function registerResearchReportTool(ctx,{env=process.env,timeoutMs=JOB_TIMEOUT_MS}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>JOB_TIMEOUT_MS)throw Error('研报执行时限无效。')
 const active=new Map();let disposed=false
 const unregister=ctx.tools.register(defineTool({
  name:'research_report',
  description:'执行 EWork 内置研报引擎。先 doctor 检查，再 validate 核验当前工作区 packet，run 默认同时生成易方达风格 HTML 与 PDF、证据台账、计算及运行记录。input 为当前会话工作区内相对 packet 路径；out 只接受工作区根下一层的新目录名，不含斜杠且不得已存在。引擎和 PDF 凭据由客户端内部绑定，不传脚本、环境变量、URL、其他会话或格式参数。只读会话不能 run。根据真实 exitCode、status、delivery 和 artifacts 报告完成或失败，不能将只有 HTML 说成双格式完成；不要查找凭据或改 Bash 环境。',
  parameters:{command:{type:'string',required:true,enum:['doctor','validate','run']},input:{type:'string',description:'validate/run必填，当前会话工作区内的相对packet JSON路径。'},out:{type:'string',description:'仅run必填，工作区根目录下一层全新的输出目录名，例如茅台研报-01。'}},
  output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
  execute:async(args,exec)=>{
   argumentsFor(args)
   if(disposed)fail('研报工具已停止。')
   if(active.size>=2)fail('研报引擎忙碌，请稍后重试。')
   const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs)
   let handle,identity,inputPath,inputSha256
   const state={controller,done:undefined};active.set(controller,state)
   exec.signal?.addEventListener('abort',abort,{once:true});if(exec.signal?.aborted)abort()
   const operation=async()=>{
    identity=await executionRoot(ctx,exec)
    assertCurrent(ctx,identity,controller.signal)
    const script=await builtinCli(env),policy=await policyFor(ctx,identity,args.command),childEnv=privateCliEnvironment(env)
    if(args.input!==undefined){
     const lexical=resolve(identity.root,args.input);inputPath=await realpath(lexical)
     if(!inside(identity.root,lexical)||!inside(identity.root,inputPath))fail('input 不能通过符号链接跳出当前会话工作区。')
     inputSha256=hash(await boundedRead(inputPath,MAX_INPUT))
    }
    if(args.out!==undefined){try{await lstat(join(identity.root,args.out));fail('out 已存在，请选择全新的输出目录名。')}catch(error){if(error.code!=='ENOENT')throw error}}
    let argv=[process.execPath,script,args.command,...inputPath?['--input',inputPath]:[],...args.out?['--out',join(identity.root,args.out)]:[]]
    if(policy&&policy.mode!=='danger-full-access')argv=ctx.get('sandbox').confine(argv,policy).argv
    assertCurrent(ctx,identity,controller.signal)
    // Re-resolve a registered workspace immediately before the only effect boundary.
    const current=await ctx.workspaceRegistry.resolveByPath(identity.cwd)
    if(!current||current.id!==identity.workspace.id||await realpath(current.path)!==identity.root)fail('当前会话的工作区已变化。')
    assertCurrent(ctx,identity,controller.signal)
    if(!ctx.subprocess?.spawn)fail('客户端托管进程服务未就绪。')
    handle=ctx.subprocess.spawn({argv,cwd:identity.root,stdio:{stdin:'ignore',stdout:{maxBytes:2*1024*1024},stderr:{maxBytes:8192}},graceMs:250,signal:controller.signal,env:childEnv})
    let outcome
    try{outcome=await handle.done}catch{return{ok:false,command:args.command,status:controller.signal.aborted?'cancelled':'failed',exitCode:null,artifactVerification:'unverified',artifacts:await resultArtifacts(identity.root,args.out),error:'研报引擎进程未能完成。'}}
    const artifacts=await resultArtifacts(identity.root,args.out)
    if(controller.signal.aborted)return{ok:false,command:args.command,status:exec.signal?.aborted?'cancelled':'timeout',exitCode:outcome.exitCode,artifactVerification:'unverified',artifacts,error:exec.signal?.aborted?'研报生成已取消；已生成文件予以保留。':'研报生成超时；已生成文件予以保留。'}
    assertCurrent(ctx,identity,controller.signal)
    const stdout=handle.collected?.stdout?.readFrom(0)
    let result
    try{if(!stdout||stdout.lossy)throw Error();result=JSON.parse(stdout.text)}catch{return{ok:false,command:args.command,status:'failed',exitCode:outcome.exitCode,artifactVerification:'unverified',artifacts,error:'研报引擎返回的运行记录无效。'}}
    if(args.command==='doctor')return{ok:outcome.exitCode===0&&result.ok===true,command:'doctor',exitCode:outcome.exitCode,engineVersion:result.engineVersion,node:result.node,defaultFormats:result.defaultFormats,pdfRuntimeConfigured:result.pdfRuntimeConfigured===true}
    if(args.command==='validate')return{ok:outcome.exitCode===0&&result.ok===true,command:'validate',exitCode:outcome.exitCode,synthetic:result.synthetic===true,diagnostics:diagnostics(result.diagnostics)}
    let manifest
    try{manifest=await verifiedManifest(artifacts,inputSha256)}catch{return{ok:false,command:'run',status:'integrity-failed',exitCode:outcome.exitCode,artifactVerification:'unverified',artifacts,error:'研报输入或交付文件摘要不一致，不能确认完成。'}}
    const complete=outcome.exitCode===0&&result.ok===true&&manifest?.delivery?.pdf?.status==='generated'&&manifest.delivery.completed?.includes('html')&&manifest.delivery.completed?.includes('pdf')&&artifacts.html&&artifacts.pdf
    return{ok:!!complete,command:'run',exitCode:outcome.exitCode,status:manifest?.status??'blocked',delivery:manifest?.delivery,researchCoverage:manifest?.researchCoverage,artifactVerification:manifest?'verified':'unverified',artifacts,diagnostics:diagnostics(result.diagnostics),...!complete?{error:'研报尚未完成双格式交付，请查看校验和运行记录。'}:{}}
   }
   const task=operation();state.done=task
   try{
    const result=await task
    // Never expose private transport credentials, even in an unexpected child diagnostic.
    const serialized=JSON.stringify(result)
    return env.SHERLOCK_RESEARCH_CONTEXT_TOKEN?serialized.split(env.SHERLOCK_RESEARCH_CONTEXT_TOKEN).join('[redacted]'):serialized
   }finally{clearTimeout(timer);exec.signal?.removeEventListener('abort',abort);if(controller.signal.aborted)handle?.terminate();active.delete(controller)}
  }
 }))
 return async()=>{disposed=true;unregister();for(const state of active.values())state.controller.abort();await Promise.allSettled([...active.values()].map(state=>state.done))}
}
