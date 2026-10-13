import { createHash, randomUUID } from 'node:crypto'
import { open, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { editPptxContent, readPptxContent, type PptxContent, type PptxEdit } from './content'
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust'

export type PptxEditIdentity = { authorizationId: string; sessionId: string; nodeId: string }
type EditSource = { path: string; root: string; identity?: PptxEditIdentity }
type Options = {
 resolveWorkspace(id: string): Promise<string | null>
 resolveCapability(value: string): Promise<EditSource | null>
 resolveEditIdentity?(value: PptxEditIdentity): Promise<EditSource | null>
 refreshPreview?(value: PptxEditIdentity): Promise<string | null>
}
export type PptxDocument = PptxContent & { id: string; name: string; version: string; editToken?: string; previewUrl?: string }
type Result = { ok: true; document: PptxDocument } | { ok: false; code: string; error: string }
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')
const contains = (root: string, target: string) => { const relative = path.relative(root,target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) }
const conflict = () => ({ok:false as const,code:'conflict',error:'原 PPTX 已被其他编辑器修改。编辑稿已保留，请重新打开文件后核对内容。'})

export class PptxEditorService {
 private readonly queues = new Map<string, Promise<unknown>>()
 private readonly editSessions = new Map<string, { identity: PptxEditIdentity; target: string }>()
 constructor(private readonly options: Options) {}
 private async resolve(value: unknown): Promise<{ target: string; identity?: PptxEditIdentity; editToken?: string }> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PPTX 编辑请求无效。')
  const input=value as Record<string,unknown>
  let candidate:EditSource|null=null, session:{identity:PptxEditIdentity;target:string}|undefined
  if (typeof input.editToken === 'string') {
   session = this.editSessions.get(input.editToken)
   if (!session) throw Error('PPTX 编辑授权已失效，请重新打开文件。')
   candidate = await this.options.resolveEditIdentity?.(session.identity) ?? null
   if (!candidate) this.editSessions.delete(input.editToken)
  }
  else if(typeof input.sourceUrl==='string')candidate=await this.options.resolveCapability(input.sourceUrl)
  else if(typeof input.sessionId==='string'&&input.sessionId.length>0&&input.sessionId.length<=512&&typeof input.path==='string'&&input.path.length>0&&input.path.length<=8192&&!input.path.includes('\0')){
   const root=await this.options.resolveWorkspace(input.sessionId)
   if(root)candidate={root,path:path.resolve(root,input.path)}
  }
  if(!candidate)throw Error('PPTX 文件授权已失效，请重新打开文件。')
  const root=await realpath(candidate.root),target=await realpath(candidate.path)
  if(!contains(root,target)||path.extname(target).toLowerCase()!=='.pptx')throw Error('此文件不在已授权的 PPTX 工作区内。')
  if (session && target !== session.target) throw Error('PPTX 编辑路径已变化，请重新打开。')
  return { target, ...((session?.identity ?? candidate.identity) ? { identity: session?.identity ?? candidate.identity } : {}), ...(session ? { editToken: input.editToken as string } : {}) }
 }
 private async read(target:string):Promise<Buffer>{
  const file=await open(target,'r')
  try{const info=await file.stat();if(!info.isFile()||info.size>64*1024*1024)throw Error('PPTX 文件过大或不可读取。');const bytes=await file.readFile();if(bytes.length>64*1024*1024)throw Error('PPTX 文件过大。');return bytes}finally{await file.close()}
 }
 private document(target:string,bytes:Uint8Array,editToken?:string):PptxDocument{return{...readPptxContent(bytes),id:hash(target),name:path.basename(target),version:hash(bytes),...(editToken?{editToken}:{})}}
 private async result(document:PptxDocument,identity?:PptxEditIdentity):Promise<Result>{
  if(identity && this.options.refreshPreview){const url=await this.options.refreshPreview(identity);if(url)document.previewUrl=url}
  return {ok:true,document}
 }
 async open(value:unknown):Promise<Result>{
  try{
   const resolved = await this.resolve(value), document = this.document(resolved.target, await this.read(resolved.target), resolved.editToken)
   if (!document.editToken && resolved.identity && this.options.resolveEditIdentity) {
    const existing = [...this.editSessions].find(([,session]) => session.identity.authorizationId === resolved.identity!.authorizationId && session.target === resolved.target)
    if (existing) document.editToken = existing[0]
    else {
     if (this.editSessions.size >= 1024) throw Error('已打开的 PPTX 编辑文件过多，请重新打开应用。')
     document.editToken = randomUUID()
     this.editSessions.set(document.editToken, { identity: resolved.identity, target: resolved.target })
    }
   }
   return this.result(document,resolved.identity)
  }catch(error){return{ok:false,code:'unavailable',error:error instanceof Error?error.message:'无法打开 PPTX 内容。'}}
 }
 async save(value:unknown):Promise<Result>{
  try{
   const resolved=await this.resolve(value),target=resolved.target,input=value as {version?:unknown;edits?:unknown}
   if(typeof input.version!=='string'||!/^[a-f0-9]{64}$/.test(input.version)||!Array.isArray(input.edits))throw Error('PPTX 保存请求无效。')
   const previous=this.queues.get(target)??Promise.resolve()
   const operation=previous.catch(()=>{}).then(async():Promise<Result>=>{
    // Resolve again inside the queue: a removed authorization must not write.
    if((await this.resolve(value)).target!==target)throw Error('PPTX 文件路径已变化，请重新打开。')
    const current=await this.read(target)
    if(hash(current)!==input.version)return conflict()
    const result=Buffer.from(editPptxContent(current,input.edits as PptxEdit[])),document=this.document(target,result,resolved.editToken)
    if(result.equals(current))return this.result(document,resolved.identity)
    const before=await stat(target),temporary=path.join(path.dirname(target),`.${path.basename(target)}.${randomUUID()}.tmp`)
    try{
     const file=await open(temporary,'wx',before.mode&0o777)
     try{await file.writeFile(result);await file.sync()}finally{await file.close()}
     const fresh=await stat(target)
     if((await this.resolve(value)).target!==target||before.ino!==fresh.ino||hash(await this.read(target))!==input.version)return conflict()
     await rename(temporary,target)
     return this.result(document,resolved.identity)
    }finally{await rm(temporary,{force:true})}
   })
   this.queues.set(target,operation)
   try{return await operation}finally{if(this.queues.get(target)===operation)this.queues.delete(target)}
  }catch(error){return{ok:false,code:'save-failed',error:error instanceof Error?error.message:'PPTX 保存失败，编辑稿已保留。'}}
 }
}
export function registerPptxEditorHandlers(options:{ipcMain:{removeHandler(channel:string):void;handle(channel:string,handler:(event:any,value:unknown)=>unknown):unknown};getMainWindow():TrustedWindow|undefined;service:PptxEditorService}){
 for(const action of ['open','save'] as const){const channel=`pptx:editor:${action}`;options.ipcMain.removeHandler(channel);registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,value:unknown)=>options.service[action](value))}
}
