import type {CapabilityReceipt,ClientCapabilityArguments} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
type Args=ClientCapabilityArguments['notes.components.data']
const summary=(receipt:CapabilityReceipt)=>{
 const data=receipt.data as any
 return data?.bound===true&&typeof data.nodeId==='string'&&data.nodeId&&Number.isInteger(data.revision)&&data.revision>0?data:undefined
}

/** This closure belongs to one generate request and its captured selected block.
 * Rebase only refresh calls over this request's own confirmed configure edges.
 * The resulting revision still passes the unchanged service/engine CAS checks.
 */
export function createNoteDataRevisionHandler(blockId:string|undefined,invoke:(args:Args)=>Promise<CapabilityReceipt>){
 let nodeId:string|undefined,revision:number|undefined
 const edges=new Map<number,number>()
 return async(args:Args):Promise<CapabilityReceipt>=>{
  let effective=args
  if(args.action==='refresh'&&revision!==undefined&&args.revision!==undefined){
   let next=args.revision
   for(let count=0;count<16&&edges.has(next);count++)next=edges.get(next)!
   if(next===revision&&next!==args.revision)effective={...args,revision:next}
  }
  const result=await invoke(effective),data=summary(result)
  if(args.action==='inspect'){
   edges.clear();nodeId=result.status==='succeeded'?data?.nodeId:undefined;revision=nodeId?data.revision:undefined
  }else if(args.action==='configure'){
   const effect=result.effect
   if(result.status==='succeeded'&&nodeId&&revision!==undefined&&data?.nodeId===nodeId&&args.revision===revision&&data.revision===revision+1&&
      effect&&'operation'in effect&&effect.kind==='data'&&effect.operation==='configure'&&effect.state==='saved'&&effect.blockId===blockId&&
      typeof data.enabled==='boolean'&&Number.isInteger(data.intervalMinutes)&&data.intervalMinutes>=0&&data.intervalMinutes<=10080&&
      effect.enabled===data.enabled&&effect.intervalMinutes===data.intervalMinutes){
    edges.set(revision,data.revision);revision=data.revision
   }else{edges.clear();revision=undefined;nodeId=undefined}
  }
  return result
 }
}
