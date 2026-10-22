import {randomUUID} from 'node:crypto'
import type {ClientCapabilityContext} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {createNoteCapabilityHandlers} from './capability-handlers'
import {createNoteDataRevisionHandler} from './data-revisions'
import type {NotesCapabilityBridge} from './capability-bridge'
const id=(value:any)=>typeof value==='string'&&value.length>0&&value.length<=256
const ids=(value:any)=>Array.isArray(value)&&value.length<=1000&&value.every(id)
type Ready={owner:string;documentId:string;window:unknown;expires:number}
export type NoteDocumentLease={context:ClientCapabilityContext;handlers:ReturnType<typeof createNoteCapabilityHandlers>;current():boolean;dispose():void}
export type NoteDocumentAdapter={identity(sessionId:string):string|undefined;acquire(input:{sessionId:string;turnId:string;sourceInstruction:string;current():boolean;signal:AbortSignal}):Promise<NoteDocumentLease>}
/** This adapter never loads a document by a model target. Only a ready, visible
 * NotesEditor may capture its own context through the existing Notes bridge. */
export class NotesDocumentCapabilityAdapter implements NoteDocumentAdapter{
 private editors=new Map<string,Ready>()
 constructor(private options:{owner():string;window():unknown;canRead(id:string):boolean;canWrite(id:string):boolean;bridge:NotesCapabilityBridge;notify(value:any):void;prepare(context:any,sessionId:string,signal:AbortSignal,current:()=>boolean):Promise<any>;componentData:boolean}){}
 ready(input:any,owner:string){
  if(Object.keys(input).some(k=>!['owner','sessionId','documentId','active'].includes(k))||!id(input.documentId)||typeof input.active!=='boolean')throw Error('笔记文档上下文无效。')
  const old=this.editors.get(input.sessionId)
  if(!input.active){if(old?.owner===owner&&old.documentId===input.documentId)this.editors.delete(input.sessionId);return{ok:true}}
  this.editors.set(input.sessionId,{owner,documentId:input.documentId,window:this.options.window(),expires:Date.now()+35000});return{ok:true}
 }
 identity(sessionId:string){const value=this.editors.get(sessionId);return value&&value.expires>Date.now()&&value.owner===this.options.owner()&&value.window===this.options.window()&&this.options.canRead(sessionId)?value.documentId:undefined}
 async acquire(input:Parameters<NoteDocumentAdapter['acquire']>[0]):Promise<NoteDocumentLease>{
  const owner=this.options.owner(),window=this.options.window(),deadline=Date.now()+4000
  while(!this.identity(input.sessionId)&&Date.now()<deadline){input.signal.throwIfAborted();if(!input.current())throw Error('当前会话已变化。');await new Promise(r=>setTimeout(r,20))}
  const documentId=this.identity(input.sessionId);if(!documentId)throw Error('当前笔记编辑器尚未就绪，请稍后重新读取能力目录。')
  const generationId='harness:'+randomUUID(),controller=new AbortController()
  const current=()=>!controller.signal.aborted&&input.current()&&this.options.owner()===owner&&this.options.window()===window&&this.identity(input.sessionId)===documentId
  let context:ClientCapabilityContext={owner,sessionId:input.sessionId,documentId,mode:'notes',editable:this.options.canWrite(input.sessionId),selectedBlockIds:[],selectedParagraphIds:[]}
  const dispose=()=>{controller.abort();try{this.options.notify({sessionId:context.sessionId,owner,generationId,documentId,release:true})}catch{}}
  try{
  const captured=await this.options.bridge.request('context.acquire',{},context,generationId,input.signal,current)
  if(!current()||captured?.status!=='succeeded'||captured.context?.documentId!==documentId||!ids(captured.context.selectedBlockIds)||!ids(captured.context.selectedParagraphIds))throw Error('笔记文档上下文未确认，请重新读取能力目录。')
  context={...context,selectedBlockIds:captured.context.selectedBlockIds,selectedParagraphIds:captured.context.selectedParagraphIds}
  const references=await this.options.prepare(captured.requestContext?.context,input.sessionId,input.signal,current)
  if(!current())throw Error('当前会话已变化。')
  const renderer=(action:any,args:any)=>{
   return this.options.bridge.request(action,args,context,generationId,controller.signal,current)
  }
  // Each operation supplies its own caller signal; catalog transport completion
  // must not own the lifetime of this document lease.
  const handlers=createNoteCapabilityHandlers({context,renderer,canWrite:()=>current()&&this.options.canWrite(input.sessionId),componentData:this.options.componentData?createNoteDataRevisionHandler(context.selectedBlockIds[0],args=>renderer('notes.components.data',args)):undefined,requestContext:{...captured.requestContext,context:references},sourceInstruction:input.sourceInstruction})
  // Bind the actual execution signal to every handler, including data/export.
  const wrapped=Object.fromEntries(Object.entries(handlers).map(([key,handler])=>[key,async(args:any,ctx:any,signal?:AbortSignal,requestId?:string)=>{
   signal?.throwIfAborted();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true})
   try{return await (handler as any)(args,ctx,signal,requestId)}finally{signal?.removeEventListener('abort',abort)}
  }])) as typeof handlers
  return{context,handlers:wrapped,current,dispose}
  }catch(error){dispose();throw error}
 }
 dispose(){this.editors.clear()}
}
