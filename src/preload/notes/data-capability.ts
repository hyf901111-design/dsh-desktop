import type {CapabilityDataEffect} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import type {NoteDataRefreshGuard} from './data-refresh-guard'
type Lease={nodeId:string;blockId:string;current():boolean;applied():void}
export function createNoteDataCapability(options:{editor:any;selected():string[];refreshGuard?:NoteDataRefreshGuard;request(method:string,args:any):Promise<any>;persist():Promise<void>;report(requestId:string,effect:CapabilityDataEffect):Promise<unknown>}){
 const leases=new Map<string,Lease>()
 const authorize=(value:any)=>{if(value.guardId===undefined)return;const lease=leases.get(value.guardId);if(!lease||!lease.current()||value.selectedIds?.length!==1||value.selectedIds[0]!==lease.nodeId)throw Error('所选组件或笔记已变化，本次数据操作已停止。')}
 const onApplied=(value:any,blockId:string)=>{const lease=leases.get(value.guardId);if(lease?.blockId===blockId)lease.applied()}
 return {authorize,onApplied,cancel:(guardId:string)=>{void options.request('component-data-capability-cancel',{executionId:guardId}).catch(()=>{})},async execute(input:any,current:()=>boolean,advance:()=>void){
  const bound=input.context?.selectedBlockIds,selection=()=>Array.isArray(bound)&&bound.length===1&&JSON.stringify(options.selected())===JSON.stringify(bound)
  if(!selection()||!current())throw Error('选中组件已变化，请重新发送请求。')
  const block=options.editor.getBlock(bound[0]);if(block?.type!=='research')throw Error('组件已移除，请重新发送请求。')
  const node=JSON.parse(block.props.payload)
  if(typeof node.id!=='string'||!node.id||node.id.length>256)throw Error('所选笔记组件不可用，请重新选择。')
  if(node.containerSpec?.type==='financial-widget')return {status:'unavailable',message:'原生金融控件暂不支持此数据能力。'}
  if(node.noteDraft||['draft','queued','running','retrying'].includes(node.generationStatus))throw Error('组件正在生成，请稍后重试。')
  let payload=block.props.payload,applied=false,trustedRefreshes=0,effect:CapabilityDataEffect|undefined
  const fresh=()=>current()&&selection()&&options.editor.getBlock(block.id)?.props.payload===payload
  const publish=async(next:CapabilityDataEffect)=>{effect=next;await options.report(input.requestId,next).catch(()=>{})}
  const receipt=(status:string,message:string,data?:any)=>({status,message,...effect?{effect}:{},...data?{data}:{}})
  const guardId=input.requestId
  // Subscribe before the initial save: an automatic refresh may complete while
  // persistence is pending, before the host operation's lease has been installed.
  const offRefresh=options.refreshGuard?.subscribe(delta=>{
   if(delta.generationId!==input.generationId||!current()||!selection())return
   trustedRefreshes++
   if(delta.blockId===block.id&&delta.nodeId===node.id&&delta.beforePayload===payload)payload=delta.afterPayload
  })
  const persist=async()=>{
   const before=trustedRefreshes
   try{await options.persist()}catch(error){
    // The save may have captured the previous automatic value. Re-save once,
    // only after an exact trusted delta and while every identity guard holds.
    if(before===trustedRefreshes||!fresh())throw error
    await options.persist()
   }
  }
  const cancel=()=>{if(!fresh())void options.request('component-data-capability-cancel',{executionId:guardId}).catch(()=>{})}
  const offSelection=options.editor.onSelectionChange?.(cancel)
  try{
   await persist();if(!fresh())throw Error('所选组件或笔记已变化，本次数据操作已停止。')
   leases.set(guardId,{nodeId:node.id,blockId:block.id,current:fresh,applied:()=>{applied=true;payload=options.editor.getBlock(block.id).props.payload;advance();effect={kind:'data',state:'applied',blockId:block.id,operation:'refresh'};void options.report(input.requestId,effect).catch(()=>{})}})
   const result=await options.request('component-data-capability',{executionId:guardId,nodeId:node.id,...input.args})
   if(applied&&effect){await publish(effect);if(!fresh())return receipt('cancelled','数据已应用，尚未确认保存。');await persist();await publish({...effect,state:'saved',lastSuccess:result?.lastSuccess})}
   if(input.args.action==='configure')await publish({kind:'data',state:'saved',blockId:block.id,operation:'configure',enabled:result.enabled,intervalMinutes:result.intervalMinutes,lastSuccess:result.lastSuccess})
   if(!fresh())return receipt('cancelled',effect?.state==='saved'?'组件数据已保存；后续操作已取消。':'所选组件或笔记已变化，本次数据操作已停止。')
   if(input.args.action==='inspect')return receipt(result.bound===false?'unavailable':'succeeded',result.bound===false?'当前组件尚未绑定数据接口。':'已读取所选组件的数据绑定。',result)
   if(input.args.action==='configure'){
    return receipt('succeeded','刷新设置已保存；尚未执行取数。',result)
   }
   if(result?.status==='refreshing')return receipt('pending','组件已有刷新任务正在进行，本次未重复启动。',result)
   if(!['success','unchanged'].includes(result?.status))return receipt('failed','刷新未成功，已保留原有内容及上次成功记录。'+(result?.error||''),result)
   if(!effect)await publish({kind:'data',state:'saved',blockId:block.id,operation:'refresh',lastSuccess:result.lastSuccess})
   return receipt('succeeded',result.status==='unchanged'?'已完成取数，数据未变化。':'组件数据已刷新并保存。',result)
  }catch(error){return receipt(fresh()?'failed':'cancelled',String((error as Error).message))}
  finally{leases.delete(guardId);offSelection?.();offRefresh?.()}
 }}
}
