import {detachConversationComponentNode} from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import type {ConversationComponentMenuCapabilities} from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import type {TrustedWindow} from '../ipc-trust'
import {canSaveCustomComponent,type ComponentLibraryStore} from '../state/component-library'
import {sanitizeResearchClipboardNode,type ResearchCanvasClipboard} from '../state/research-canvas-clipboard'
import {saveResearchCanvasExport,type ResearchCanvasExportDependencies} from '../state/research-canvas-export'
import {noteLibrarySpec} from './component-library'
import type {NotesStore} from './store'

type Method='component-menu-capabilities'|'component-copy'|'component-library-save'|'component-export'
type Options={store:NotesStore;owner():string;canRead(sessionId:string):boolean;canWrite(sessionId:string):boolean;getWindow():TrustedWindow|undefined;documentIdentity(sessionId:string):string|undefined;clipboard():ResearchCanvasClipboard|undefined;library?():ComponentLibraryStore|undefined;exportFiles?:Pick<ResearchCanvasExportDependencies,'showSaveDialog'|'writeFile'>}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const id=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value)

/** Finite UI actions over an exact saved Notes block; never consult a canvas. */
export function createNoteComponentActions(options:Options){
 return async(method:Method,input:unknown):Promise<unknown>=>{
  const record=input as Record<string,any>,extra=method==='component-export'?['kind','format',record?.kind==='text'?'content':'base64']:[]
  const keys=['sessionId','owner','blockId','nodeId','expectedPayload',...extra]
  if(!object(record)||Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key))||Object.keys(record).some(key=>!keys.includes(key))||!['sessionId','owner','blockId','nodeId'].every(key=>id(record[key]))||typeof record.expectedPayload!=='string'||!record.expectedPayload||Buffer.byteLength(record.expectedPayload)>4*1024*1024)throw Error('笔记组件菜单参数无效。')
  const {sessionId,owner,blockId,nodeId,expectedPayload}=record,window=options.getWindow(),documentId=options.documentIdentity(sessionId)
  if(!window||window.isDestroyed()||owner!==options.owner()||!options.canRead(sessionId)||!documentId)throw Error('当前笔记组件尚未就绪或宿主身份已失效。')
  const mainFrame=window.webContents.mainFrame,frame={processId:mainFrame.processId,routingId:mainFrame.routingId}
  const saved=options.store.load(owner,sessionId).saved
  const find=(blocks:any[]):any[]=>blocks.flatMap(block=>[...(block.id===blockId?[block]:[]),...find(block.children??[])])
  const readNode=()=>{
   const latest=options.store.load(owner,sessionId).saved,blocks=find(latest.blocks),block=blocks[0]
   if(latest.revision!==saved.revision||blocks.length!==1||block?.type!=='research'||block.props?.payload!==expectedPayload)throw Error('笔记组件尚未保存、已变化或已移除。')
   let node:any;try{node=JSON.parse(block.props.payload)}catch{}
   if(!object(node)||node.id!==nodeId||!noteLibrarySpec(node.containerSpec))throw Error('笔记组件内容已变化或不可用。')
   return node
  }
  const check=(write=false)=>{
   const current=options.getWindow(),currentFrame=current?.webContents.mainFrame
   if(!current||current!==window||current.isDestroyed()||currentFrame?.processId!==frame.processId||currentFrame?.routingId!==frame.routingId||options.owner()!==owner||!options.canRead(sessionId)||options.documentIdentity(sessionId)!==documentId||write&&!options.canWrite(sessionId))throw Error('笔记组件宿主已变化或当前不可编辑，操作已取消。')
   return readNode()
  }
  const node=check(),clipboard=options.clipboard(),library=options.library?.(),files=options.exportFiles
  const guard=(write=false)=>()=>{try{check(write);return true}catch{return false}}
  // Notes blocks have no canvas coordinates. A detached clipboard/library
  // snapshot receives its own neutral origin without editing the saved block.
  const snapshot=(value:any)=>detachConversationComponentNode({...value,x:0,y:0})
  let copyable=false;try{sanitizeResearchClipboardNode(snapshot(node));copyable=true}catch{}
  const capabilities:ConversationComponentMenuCapabilities={copy:!!clipboard&&copyable,saveLibrary:!!library&&options.canWrite(sessionId)&&canSaveCustomComponent(node),exportContent:!!files,rename:options.canWrite(sessionId)}
  if(method==='component-menu-capabilities')return capabilities
  if(method==='component-copy'){
   if(!capabilities.copy)throw Error('组件剪贴板暂不可用。')
   const result=await clipboard!.copy({sessionId,nodes:[snapshot(check())]},guard());check();return result
  }
  if(method==='component-library-save'){
   if(!capabilities.saveLibrary)throw Error('当前组件不可编辑或组件库暂不可用。')
   const result=await library!.add(snapshot(check(true)),undefined,owner,guard(true));check(true);return result
  }
  if(method!=='component-export'||!files||record.kind!=='text'&&record.kind!=='binary'||record.kind==='text'&&record.format!=='svg'||record.kind==='binary'&&!['png','jpg'].includes(record.format))throw Error('组件导出暂不可用或格式无效。')
  const suggestedName=String(node.displayName||node.title||'组件').slice(0,120)
  const request=record.kind==='text'?{kind:'text' as const,format:'svg' as const,content:record.content,suggestedName}:{kind:'binary' as const,format:record.format as 'png'|'jpg',base64:record.base64,suggestedName}
  return saveResearchCanvasExport(request,{
   showSaveDialog:async value=>{check();return files.showSaveDialog(value)},
   writeFile:async(...args)=>{check();return files.writeFile(...args)},
   copyFile:async()=>{throw Error('此入口不复制源文件。')},resolveExportSource:async()=>null
  })
 }
}
