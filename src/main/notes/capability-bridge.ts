import {randomUUID} from 'node:crypto'
import {noteCapabilityReceiptMessage} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import type {ClientCapabilityContext,CapabilityEffect,CapabilityStyleEffect,CapabilityExportEffect,CapabilityCreateEffect,CapabilityChallengeEffect,CapabilityDataEffect,CapabilityNativeBlocksEffect} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
type Pending={owner:string;sessionId:string;action:string;resolve(value:any):void;reject(error:Error):void;cleanup():void;signal:AbortSignal;current():boolean;context:ClientCapabilityContext;generationId:string;allowPreview:boolean;cancelled?:boolean;effect?:CapabilityEffect}
const nativeWrite=(action:string)=>action==='notes.blocks.apply'||action==='notes.blocks.undo'
const nativeAction=(action:string)=>nativeWrite(action)||action==='notes.blocks.read'
const effectId=(value:any)=>typeof value==='string'&&value.length>0&&value.length<=256
function effectValue(value:any,action:string):CapabilityStyleEffect|CapabilityCreateEffect|CapabilityChallengeEffect|CapabilityDataEffect|CapabilityNativeBlocksEffect|undefined{
 if(nativeWrite(action)){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(key=>!['kind','state','actionId','changedBlockIds','revision'].includes(key))||value.kind!=='native-blocks'||!['applied','saved'].includes(value.state)||!effectId(value.actionId)||!effectId(value.revision)||!Array.isArray(value.changedBlockIds)||!value.changedBlockIds.every(effectId)||new Set(value.changedBlockIds).size!==value.changedBlockIds.length||Buffer.byteLength(JSON.stringify(value))>8*1024*1024)return
  return{kind:'native-blocks',state:value.state,actionId:value.actionId,changedBlockIds:[...value.changedBlockIds],revision:value.revision}
 }
 if(value?.kind==='native-blocks')return
 if(action==='notes.components.create')return value&&['placeholder','applied','saved'].includes(value.state)&&typeof value.blockId==='string'&&value.blockId.length>0&&value.blockId.length<=256?{state:value.state,blockId:value.blockId}:undefined
 if(action==='notes.components.data')return value?.kind==='data'&&['applied','saved'].includes(value.state)&&['configure','refresh'].includes(value.operation)&&typeof value.blockId==='string'&&value.blockId.length>0&&value.blockId.length<=256&&[value.enabled===undefined||typeof value.enabled==='boolean',value.intervalMinutes===undefined||Number.isInteger(value.intervalMinutes)&&value.intervalMinutes>=0&&value.intervalMinutes<=10080,value.lastSuccess===undefined||Number.isFinite(value.lastSuccess)].every(Boolean)?{kind:'data',state:value.state,operation:value.operation,blockId:value.blockId,...value.enabled===undefined?{}:{enabled:value.enabled},...value.intervalMinutes===undefined?{}:{intervalMinutes:value.intervalMinutes},...value.lastSuccess===undefined?{}:{lastSuccess:value.lastSuccess}}:undefined
 if(action==='notes.challenge.configure')return value?.kind==='challenge'&&['applied','saved'].includes(value.state)&&Number.isInteger(value.settings?.level)&&value.settings.level>=0&&value.settings.level<=4&&typeof value.settings.commentsExpanded==='boolean'&&['off','idle','waiting','running','paused','limited','failed'].includes(value.phase)?{kind:'challenge',state:value.state,settings:{level:value.settings.level,commentsExpanded:value.settings.commentsExpanded},phase:value.phase}:undefined
 if(!['notes.components.style','notes.components.layout','notes.blocks.align','notes.components.apply'].includes(action))return
 if(!value||!['applied','saved'].includes(value.state)||!Array.isArray(value.changedBlockIds)||value.changedBlockIds.length>10000||value.changedBlockIds.some((id:any)=>typeof id!=='string'||id.length>256))return
 return {state:value.state,changedBlockIds:[...value.changedBlockIds],...(action==='notes.components.layout'?{kind:'layout' as const}:action==='notes.blocks.align'?{kind:'alignment' as const}:action==='notes.components.apply'?{kind:'content' as const}:{})}
}
const effectMessage=(effect:CapabilityEffect)=>'actionId' in effect?`${effect.state==='saved'?'已保存':'已应用但未确认保存'} ${effect.changedBlockIds.length} 个笔记块`:'operation' in effect?noteCapabilityReceiptMessage({status:'pending',effect,message:''})!:'settings' in effect?noteCapabilityReceiptMessage({status:'pending',effect,message:''})!:'blockId' in effect?`${effect.state==='saved'?'已生成并保存组件':effect.state==='applied'?'已生成组件，尚未确认保存':'已插入组件占位块，尚未生成完成'}`:'path' in effect?effect.state==='saved'?`文件已保存：${effect.path}`:`文件写入已开始，保存结果尚未确认：${effect.path}`:`${effect.state==='saved'?'已保存':'已应用但未确认保存'} ${effect.changedBlockIds.length} ${effect.kind==='alignment'?'个块的对齐方式':effect.kind==='layout'?'个组件的布局':effect.kind==='content'?'个组件的内容':'个组件的样式'}`
const cancelledReceipt=(effect?:CapabilityEffect)=>({status:'cancelled',...effect?{effect,...'blockId' in effect?{blockId:effect.blockId}:'path' in effect?{path:effect.path}:'changedBlockIds' in effect?{changedBlockIds:effect.changedBlockIds}:{}}:{},message:effect?effectMessage(effect)+'；后续操作已取消。':'操作已取消，尚无已确认的应用结果；请检查原笔记当前状态。'})
/** Fixed renderer transport. Cancellation may stop future work, never erase a
 * recorded effect. A style acknowledgement after abort belongs only to the
 * original account/session/request and cannot authorize another operation.
 */
export class NotesCapabilityBridge{
 private pending=new Map<string,Pending>()
 constructor(private send:(value:any)=>void){}
 request(action:'context'|'context.acquire'|'notes.export'|'notes.components.style'|'notes.components.layout'|'notes.components.create'|'notes.blocks.align'|'notes.blocks.read'|'notes.blocks.apply'|'notes.blocks.undo'|'notes.components.inspect'|'notes.components.apply'|'notes.challenge.configure'|'notes.components.data',args:any,context:ClientCapabilityContext,generationId:string,signal:AbortSignal,current:()=>boolean,allowPreview=false):Promise<any>{
  signal.throwIfAborted();if(!current())throw Error('笔记会话已变化。')
  const requestId=randomUUID()
  return new Promise((resolve,reject)=>{
   const notifyCancel=()=>{try{this.send({requestId,sessionId:context.sessionId,owner:context.owner,cancel:true})}catch{}}
   const finishCancelled=()=>{const job=this.pending.get(requestId);if(!job)return;job.cleanup();this.pending.delete(requestId);resolve(cancelledReceipt(job.effect))}
   const end=(error:Error)=>{
    const job=this.pending.get(requestId);if(!job)return
    if(nativeWrite(action)||['notes.components.style','notes.components.layout','notes.export','notes.components.create','notes.blocks.align','notes.components.apply','notes.challenge.configure','notes.components.data'].includes(action)){
     if(job.cancelled)return
     job.cancelled=true;clearTimeout(timer);notifyCancel()
     // Let an in-flight save report its actual outcome. A missing renderer is
     // bounded and the latest acknowledged phase stays visible in the receipt.
     timer=setTimeout(finishCancelled,5000)
    }else{job.cleanup();this.pending.delete(requestId);notifyCancel();reject(error)}
   }
   let timer=setTimeout(()=>end(Error('笔记操作未及时确认，请查看文档当前状态。')),action==='notes.components.create'?250000:100000)
   const abort=()=>end(Error('笔记操作已取消。')),cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
   this.pending.set(requestId,{owner:context.owner,sessionId:context.sessionId,action,resolve,reject,cleanup,signal,current,context,generationId,allowPreview});signal.addEventListener('abort',abort,{once:true})
   try{this.send({requestId,generationId,action,args,context,owner:context.owner,sessionId:context.sessionId})}catch{end(Error('笔记窗口不可用。'))}
  })
 }
 exportEffect(requestId:string,owner:string,sessionId:string,effect:CapabilityExportEffect){
  const job=this.pending.get(requestId)
  if(!job||job.action!=='notes.export'||job.owner!==owner||job.sessionId!==sessionId)return false
  if(job.effect?.state==='saved'&&effect.state!=='saved')return false
  job.effect={...effect};return true
 }
 private canAdvance(previous:CapabilityEffect|undefined,next:CapabilityEffect){
  if(!previous)return true
  if(previous.state==='saved'&&next.state!=='saved')return false
  if('actionId' in previous||'actionId' in next)return 'actionId' in previous&&'actionId' in next&&previous.actionId===next.actionId&&previous.revision===next.revision&&JSON.stringify(previous.changedBlockIds)===JSON.stringify(next.changedBlockIds)
  if('operation' in previous||'operation' in next)return 'operation' in previous&&'operation' in next&&previous.operation===next.operation&&previous.blockId===next.blockId
  if('settings' in previous||'settings' in next)return 'settings' in previous&&'settings' in next&&previous.settings.level===next.settings.level&&previous.settings.commentsExpanded===next.settings.commentsExpanded
  if('blockId' in previous)return 'blockId' in next&&previous.blockId===next.blockId&&!(previous.state==='applied'&&next.state==='placeholder')
  return true
 }
 dataExecution(requestId:string,owner:string,sessionId:string){const job=this.pending.get(requestId);return job?.action==='notes.components.data'&&this.allowed(requestId,owner,sessionId)?{signal:job.signal,context:job.context}:undefined}
 allowed(requestId:string,owner:string,sessionId:string){const job=this.pending.get(requestId);return !!job&&job.owner===owner&&job.sessionId===sessionId&&!job.signal.aborted&&!job.cancelled&&job.current()}
 respond(input:any,owner:string){
  const job=this.pending.get(input.requestId)
  if(!job||job.owner!==owner||job.sessionId!==input.sessionId)return {ok:false}
  if(input.effect!==undefined){
   const effect=effectValue(input.effect,job.action)
   if(!effect||!this.canAdvance(job.effect,effect))return {ok:false}
   job.effect=effect;return {ok:true}
  }
  const effect=effectValue(input.result?.effect,job.action)
  if(input.result?.effect!==undefined&&(nativeAction(job.action)||input.result.effect?.kind==='native-blocks')&&!effect)return {ok:false}
  if(effect){if(!this.canAdvance(job.effect,effect))return {ok:false};job.effect=effect}
  const prepared=job.allowPreview&&nativeWrite(job.action)&&!job.effect&&input.result?.effect===undefined&&input.result?.status==='succeeded'&&input.result.data?.pendingPreview===true&&input.result.data.actionId===job.generationId&&Object.keys(input.result.data).every(key=>['pendingPreview','actionId','unchanged'].includes(key))
  if(nativeWrite(job.action)&&input.result?.status==='succeeded'&&job.effect?.state!=='saved'&&!prepared)return {ok:false}
  const result=nativeWrite(job.action)&&job.effect?{...input.result,effect:job.effect,changedBlockIds:'changedBlockIds' in job.effect?[...job.effect.changedBlockIds]:[]}:input.result
  job.cleanup();this.pending.delete(input.requestId)
  if(job.cancelled)job.resolve(cancelledReceipt(job.effect))
  else if(!job.current()){
   if(job.effect)job.resolve(cancelledReceipt(job.effect))
   else job.reject(Error('账号或会话已变化。'))
  }else if(typeof input.error==='string'){
   if(job.effect)job.resolve({...cancelledReceipt(job.effect),status:'failed',message:effectMessage(job.effect)+'。'+input.error.slice(0,1000)})
   else job.reject(Error(input.error.slice(0,1000)))
  }else job.resolve(result)
  return{ok:true}
 }
 dispose(){for(const job of this.pending.values()){job.cleanup();if(job.effect)job.resolve(cancelledReceipt(job.effect));else job.reject(Error('笔记操作服务已停止。'))}this.pending.clear()}
}
