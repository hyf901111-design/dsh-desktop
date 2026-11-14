import { createHash, randomUUID } from 'node:crypto'
import { open, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { editPptxContent, type PptxEdit } from './content'
import { readPptxScene, editPptxScene, type PptxScene, type PptxNodeChange } from './scene'
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust'

export type PptxEditIdentity = { authorizationId: string; sessionId: string; nodeId: string }
type EditSource = { path: string; root: string; identity?: PptxEditIdentity }
type Options = {
 resolveWorkspace(id: string): Promise<string | null>
 resolveCapability(value: string): Promise<EditSource | null>
 resolveEditIdentity?(value: PptxEditIdentity): Promise<EditSource | null>
 refreshPreview?(value: PptxEditIdentity): Promise<string | null>
 commitManaged?(identity: PptxEditIdentity, target: string, version: string, bytes: Buffer): Promise<boolean | undefined>
}
export type PptxDocument = PptxScene & { id: string; name: string; version: string; editToken?: string; basisToken?: string; previewUrl?: string }
type Result = { ok: true; document: PptxDocument } | { ok: false; code: string; error: string }
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')
const contains = (root: string, target: string) => { const relative = path.relative(root,target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) }
const conflict = () => ({ok:false as const,code:'conflict',error:'原 PPTX 已被其他编辑器修改。编辑稿已保留，请重新打开文件后核对内容。'})

export class PptxEditorService {
 private readonly bases = new Map<string,{target:string;bytes:Buffer;document:PptxDocument;version:string}>()
 private basisBytes = 0
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
 private document(target:string,bytes:Uint8Array,editToken?:string):PptxDocument{return{...readPptxScene(bytes),id:hash(target),name:path.basename(target),version:hash(bytes),...(editToken?{editToken}:{})}}
 private rememberBasis(target:string,bytes:Buffer,document:PptxDocument):void {
  // Reopening unchanged bytes must not fill the bounded cache with duplicates
  // and evict the earlier cumulative baseline used by an existing editor's undo.
  for(const [key,value] of this.bases){if(value.target===target&&value.version===document.version&&value.bytes.equals(bytes)){this.bases.delete(key);this.bases.set(key,value);document.basisToken=key;return}}
  while(this.bases.size>=32||this.basisBytes+bytes.length>128*1024*1024){const oldest=this.bases.keys().next().value;if(!oldest)break;this.basisBytes-=this.bases.get(oldest)!.bytes.length;this.bases.delete(oldest)}
  const key=randomUUID();document.basisToken=key;this.bases.set(key,{target,bytes,document:structuredClone(document),version:document.version});this.basisBytes+=bytes.length
 }
 private basis(input:{basisToken?:unknown;version?:unknown},target:string){
  if(input.basisToken===undefined)return undefined
  const value=typeof input.basisToken==='string'?this.bases.get(input.basisToken):undefined
  if(!value||value.target!==target||value.version!==input.version)throw Error('PPTX 编辑基线已失效，修改稿已保留，请重新读取文件。')
  this.bases.delete(input.basisToken as string);this.bases.set(input.basisToken as string,value);return value
 }
 private basisDocument(target:string,bytes:Buffer,basis:ReturnType<PptxEditorService['basis']>,editToken?:string):PptxDocument {
  if(!basis)return this.document(target,bytes,editToken)
  const {editToken:_editToken,previewUrl:_previewUrl,...original}=structuredClone(basis.document)
  return{...original,version:hash(bytes),...(editToken?{editToken}:{})}
 }
 private async result(document:PptxDocument,identity?:PptxEditIdentity):Promise<Result>{
  if(identity && this.options.refreshPreview){try{const url=await this.options.refreshPreview(identity);if(url)document.previewUrl=url}catch{/* The file operation already succeeded; a preview renewal must not turn it into a false save failure. */}}
  return {ok:true,document}
 }
 async open(value:unknown):Promise<Result>{
  try{
   const resolved = await this.resolve(value), bytes=await this.read(resolved.target), document = this.document(resolved.target,bytes,resolved.editToken)
   if (!document.editToken && resolved.identity && this.options.resolveEditIdentity) {
    const existing = [...this.editSessions].find(([,session]) => session.identity.authorizationId === resolved.identity!.authorizationId && session.target === resolved.target)
    if (existing) document.editToken = existing[0]
    else {
     if (this.editSessions.size >= 1024) throw Error('已打开的 PPTX 编辑文件过多，请重新打开应用。')
     document.editToken = randomUUID()
     this.editSessions.set(document.editToken, { identity: resolved.identity, target: resolved.target })
    }
   }
   this.rememberBasis(resolved.target,bytes,document)
   return this.result(document,resolved.identity)
  }catch(error){return{ok:false,code:'unavailable',error:error instanceof Error?error.message:'无法打开 PPTX 内容。'}}
 }
 async preview(value:unknown):Promise<{ok:true;bytes:Uint8Array}|{ok:false;code:string;error:string}>{
  try{
   const {target}=await this.resolve(value),input=value as {version?:unknown;basisToken?:unknown;edits?:unknown;objects?:unknown}
   if(typeof input.version!=='string'||!/^[a-f0-9]{64}$/.test(input.version)||!Array.isArray(input.edits))throw Error('PPTX 草稿请求无效。')
   const current=await this.read(target);if(hash(current)!==input.version)return conflict()
   const base=this.basis(input,target),bytes=editPptxScene(editPptxContent(base?.bytes??current,input.edits as PptxEdit[]),(input.objects??[]) as PptxNodeChange[])
   await this.resolve(value)
   return{ok:true,bytes}
  }catch(error){return{ok:false,code:'preview-failed',error:error instanceof Error?error.message:'无法渲染 PPTX 草稿。'}}
 }
 async save(value:unknown):Promise<Result>{
  try{
   const resolved=await this.resolve(value),target=resolved.target,input=value as {version?:unknown;basisToken?:unknown;edits?:unknown;objects?:unknown}
   if(typeof input.version!=='string'||!/^[a-f0-9]{64}$/.test(input.version)||!Array.isArray(input.edits))throw Error('PPTX 保存请求无效。')
   const previous=this.queues.get(target)??Promise.resolve()
   const operation=previous.catch(()=>{}).then(async():Promise<Result>=>{
    // Resolve again inside the queue: a removed authorization must not write.
    if((await this.resolve(value)).target!==target)throw Error('PPTX 文件路径已变化，请重新打开。')
    const current=await this.read(target)
    if(hash(current)!==input.version)return conflict()
    const base=this.basis(input,target),text=editPptxContent(base?.bytes??current,input.edits as PptxEdit[]), result=Buffer.from(editPptxScene(text,(input.objects??[]) as PptxNodeChange[])),document=this.basisDocument(target,result,base,resolved.editToken)
    if(result.equals(current))return this.result(document,resolved.identity)
    if (resolved.identity && this.options.commitManaged) {
     const saved = await this.options.commitManaged(resolved.identity, target, input.version as string, result)
     if (saved !== undefined) {
      if (!saved) return conflict()
      if (base) base.version = document.version
      return this.result(document, resolved.identity)
     }
    }
    const before=await stat(target),temporary=path.join(path.dirname(target),`.${path.basename(target)}.${randomUUID()}.tmp`)
    try{
     const file=await open(temporary,'wx',before.mode&0o777)
     try{await file.writeFile(result);await file.sync()}finally{await file.close()}
     const fresh=await stat(target)
     if((await this.resolve(value)).target!==target||before.ino!==fresh.ino||hash(await this.read(target))!==input.version)return conflict()
     await rename(temporary,target)
     if(base)base.version=document.version
     return this.result(document,resolved.identity)
    }finally{await rm(temporary,{force:true})}
   })
   this.queues.set(target,operation)
   try{return await operation}finally{if(this.queues.get(target)===operation)this.queues.delete(target)}
  }catch(error){return{ok:false,code:'save-failed',error:error instanceof Error?error.message:'PPTX 保存失败，编辑稿已保留。'}}
 }
}
export function registerPptxEditorHandlers(options:{ipcMain:{removeHandler(channel:string):void;handle(channel:string,handler:(event:any,value:unknown)=>unknown):unknown};getMainWindow():TrustedWindow|undefined;service:PptxEditorService}){
 for(const action of ['open','save','preview'] as const){const channel=`pptx:editor:${action}`;options.ipcMain.removeHandler(channel);registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,value:unknown)=>options.service[action](value))}
}
