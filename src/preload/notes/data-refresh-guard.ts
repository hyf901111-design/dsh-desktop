import type {NoteContent} from '../../shared/workspace-notes'

export const noteCapabilityFingerprint=(content:Pick<NoteContent,'title'|'blocks'>)=>JSON.stringify([content.title,content.blocks])
type Ticket={generationId:string;blockId:string;nodeId:string;beforePayload:string;beforeFingerprint:string}
export type NoteDataRefreshDelta=Ticket&{afterPayload:string;afterFingerprint:string;guardId?:string}
const record=(value:any)=>!!value&&typeof value==='object'&&!Array.isArray(value)
function target(blocks:readonly any[],id:string):any|undefined{
 let found:any,count=0
 const visit=(items:readonly any[])=>{for(const block of items){if(block.id===id){found=block;count++}visit(block.children??[])}}
 visit(blocks);return count===1&&found.type==='research'&&typeof found.props?.payload==='string'?found:undefined
}
function withPayload(blocks:readonly any[],id:string,payload:string):any[]{
 return blocks.map(block=>({...block,...block.id===id?{props:{...block.props,payload}}:{},...block.children?{children:withPayload(block.children,id,payload)}:{}}))
}

/** Only the host data sink may advance this separate, generation-bound baseline. */
export function createNoteDataRefreshGuard(){
 let generationId='',fingerprint=''
 const listeners=new Set<(delta:NoteDataRefreshDelta)=>void>()
 return {
  begin(id:string,content:NoteContent){generationId=id;fingerprint=noteCapabilityFingerprint(content)},
  expected(id:string){return id===generationId?fingerprint:undefined},
  advanceOwn(id:string,before:string,after:string){if(id===generationId&&fingerprint===before)fingerprint=after},
  subscribe(listener:(delta:NoteDataRefreshDelta)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
  before(content:NoteContent,blockId:string,nodeId:string):Ticket|undefined{
   const block=target(content.blocks,blockId)
   if(!block)return
   try{if(JSON.parse(block.props.payload)?.id!==nodeId)return}catch{return}
   return{generationId,blockId,nodeId,beforePayload:block.props.payload,beforeFingerprint:noteCapabilityFingerprint(content)}
  },
  applied(id:string,ticket:Ticket|undefined,content:NoteContent,guardId?:string){
   if(!ticket||!id||id!==generationId||ticket.generationId!==id||fingerprint!==ticket.beforeFingerprint)return false
   const block=target(content.blocks,ticket.blockId)
   if(!block)return false
   const afterPayload=block.props.payload,afterFingerprint=noteCapabilityFingerprint(content)
   if(afterFingerprint===fingerprint)return false
   try{
    const before=JSON.parse(ticket.beforePayload),after=JSON.parse(afterPayload)
    if(!record(before)||!record(after)||before.id!==ticket.nodeId||after.id!==ticket.nodeId||!record(before.containerSpec)||!record(after.containerSpec))return false
    const {containerSpec:oldSpec,...oldNode}=before,{containerSpec:newSpec,...newNode}=after
    if(JSON.stringify(oldNode)!==JSON.stringify(newNode))return false
   }catch{return false}
   // Restoring just this payload must restore the *entire* prior document.
   // A human edit before or inside the transaction can never be laundered.
   if(noteCapabilityFingerprint({...content,blocks:withPayload(content.blocks,ticket.blockId,ticket.beforePayload)})!==ticket.beforeFingerprint)return false
   const delta={...ticket,generationId:id,afterPayload,afterFingerprint,...guardId?{guardId}:{}}
   fingerprint=afterFingerprint
   for(const listener of listeners)listener(delta)
   return true
  }
 }
}
export type NoteDataRefreshGuard=ReturnType<typeof createNoteDataRefreshGuard>
