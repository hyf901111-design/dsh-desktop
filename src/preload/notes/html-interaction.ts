import {validResearchInteractionEvent,validResearchInteractionState} from '../../../packages/dsh-research-task-runtime/html-artifact.js'

type Editor={isEditable:boolean;getBlock(id:string):any;updateBlock(id:string,value:any):unknown}
type Options={editor:Editor;current():boolean;persist():Promise<unknown>}
type Input={blockId:string;nodeId:string;html:string;version:string;event:any}
export type NoteHtmlInteractionState={version:string;events:Record<string,any>}
const record=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const eventFingerprint=(value:Record<string,any>)=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])))
const changed=()=>Error('笔记或组件已变化，本次交互未保存。')

/** Persist only the journal of one exact Notes HTML block, never a canvas node. */
export function createNoteHtmlInteraction({editor,current,persist}:Options){
 let queue:Promise<unknown>=Promise.resolve()
 const perform=async(input:Input,guard:()=>boolean):Promise<NoteHtmlInteractionState>=>{
  const target=()=>{
   if(!current()||!guard())throw changed()
   if(!editor.isEditable)throw Error('笔记当前不可编辑。')
   const block=editor.getBlock(input.blockId)
   if(block?.id!==input.blockId||block.type!=='research'||typeof block.props?.payload!=='string')throw changed()
   let node:any;try{node=JSON.parse(block.props.payload)}catch{throw changed()}
   if(!record(node)||node.id!==input.nodeId||node.containerSpec?.type!=='html'||node.containerSpec.html!==input.html)throw changed()
   if(node.config!==undefined&&!record(node.config))throw Error('组件交互配置格式无效。')
   return {block,node,payload:block.props.payload as string}
  }
  const journal=(node:Record<string,any>):NoteHtmlInteractionState|undefined=>{
   const state=node.config?.interactionState
   if(state!==undefined&&!validResearchInteractionState(state))throw Error('组件交互记录格式无效，已保留原内容。')
   return state
  }
  const original=target(),saved=journal(original.node)
  const events=saved?.version===input.version?saved.events:{}
  const existing=Object.hasOwn(events,input.event.id)?events[input.event.id]:undefined
  if(existing&&eventFingerprint(existing)!==eventFingerprint(input.event))throw Error('组件交互标识已被其他操作使用，请重试。')
  const next={version:input.version,events:existing?events:{...events,[input.event.id]:input.event}}
  if(!validResearchInteractionState(next))throw Error('组件交互记录已满，当前操作未保存。')
  let writtenPayload:string|undefined,durable=false
  try{
   if(!existing){
    writtenPayload=JSON.stringify({...original.node,config:{...original.node.config,interactionState:next}})
    editor.updateBlock(input.blockId,{props:{payload:writtenPayload}})
   }
   // A duplicate may be an earlier unconfirmed write. It also needs a durable
   // save before the iframe may clear its pending event.
   await persist()
   durable=true
   const latest=target(),state=journal(latest.node)
   if(state?.version!==input.version||!state.events[input.event.id]||eventFingerprint(state.events[input.event.id])!==eventFingerprint(input.event))throw changed()
   return clone(state)
  }catch(error){
   if(writtenPayload!==undefined&&!durable){
    try{
     const latest=editor.getBlock(input.blockId)
     // Only undo this operation's exact payload. Newer edits (including a new
     // HTML component) belong to their author and must never be overwritten.
     if(latest?.type==='research'&&latest.props?.payload===writtenPayload)editor.updateBlock(input.blockId,{props:{payload:original.payload}})
    }catch{/* A disposed editor cannot accept rollback; preserve the original failure. */}
   }
   throw error
  }
 }
 return {commit(input:Input,guard:()=>boolean=()=>true):Promise<NoteHtmlInteractionState>{
  let captured:Input
  try{
   if(!input||!validId(input.blockId)||!validId(input.nodeId)||typeof input.html!=='string'||typeof input.version!=='string'||!input.version.trim()||input.version.length>80||!validResearchInteractionEvent(input.event))throw Error('组件交互参数无效。')
   captured={blockId:input.blockId,nodeId:input.nodeId,html:input.html,version:input.version,event:clone(input.event)}
   if(!validResearchInteractionEvent(captured.event))throw Error('组件交互参数无效。')
  }catch(error){return Promise.reject(error)}
  const result=queue.then(()=>perform(captured,guard))
  queue=result.then(()=>undefined,()=>undefined)
  return result
 }}
}
