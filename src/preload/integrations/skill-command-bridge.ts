import type {IntegrationBridge,SkillCommandSegment} from '../../shared/integration-ui'
import {decodeSkillReference} from '../../shared/skill-reference'

const REQUEST='sherlock:skill-menu-request',REPLY='sherlock:skill-menu-reply'
/** Isolated preload owns listing and the existing verified composer transfer. */
export function installSkillCommandBridge(document:Document,bridge:Pick<IntegrationBridge,'request'|'useSkill'>) {
 const win=document.defaultView!
 const pending=new Map<string,AbortController>()
 let generation=0,disposed=false
 const onRequest=async(event:Event)=>{
  const data=(event as CustomEvent).detail
  if(!data || typeof data.requestId!=='string' || data.requestId.length>100)return
  if(data.action==='cancel'){pending.get(data.requestId)?.abort();pending.delete(data.requestId);return}
  if(!['list','use','resolve'].includes(data.action) || disposed || pending.has(data.requestId))return
  const controller=new AbortController(),epoch=generation;pending.set(data.requestId,controller)
  let result:unknown,error:string|undefined
  try {
   if(data.action==='list'){
    const reply=await bridge.request({type:'snapshot'})
    if(reply.type!=='snapshot')throw Error('技能列表暂不可用，请重试。')
    result=reply.snapshot.rows.filter(row=>row.kind==='skill' && row.enabled && row.status!=='已停用').map(row=>({id:row.id,label:row.name,detail:row.description,revision:row.revision}))
   } else if(data.action==='resolve'){
    const reference=decodeSkillReference(JSON.stringify(data.reference))
    const detail=await bridge.request({type:'skill-detail',id:reference.id,revision:reference.revision})
    if(detail.type!=='skill-detail'||detail.id!==reference.id||detail.revision!==reference.revision||detail.invocationName!==reference.invocationName)throw Error('技能已变化，请重新选择技能。')
    if(!detail.enabled||detail.usable===false)throw Error(detail.unavailableReason||'请先启用技能。')
    result={invocationName:detail.invocationName}
   } else {
    if(!bridge.useSkill || typeof data.sessionId!=='string' || !data.sessionId || !data.skill || typeof data.skill.id!=='string' || typeof data.skill.label!=='string' || !Number.isSafeInteger(data.skill.revision) || data.skill.revision<0)throw Error('技能选择无效，请重新打开菜单。')
    await bridge.useSkill({id:data.skill.id,revision:data.skill.revision,name:data.skill.label,invocationName:'',sessionId:data.sessionId,commandSegment:data.commandSegment as SkillCommandSegment|undefined,signal:controller.signal})
   }
  }catch(reason){error=reason instanceof Error?reason.message:'技能操作失败，请重试。'}
  if(pending.get(data.requestId)!==controller)return
  pending.delete(data.requestId)
  if(disposed || controller.signal.aborted || generation!==epoch)return
  win.dispatchEvent(new win.CustomEvent(REPLY,{detail:{requestId:data.requestId,ok:!error,result,error}}))
 }
 win.addEventListener(REQUEST,onRequest)
 const reset=()=>{generation++;for(const controller of pending.values())controller.abort();pending.clear();win.dispatchEvent(new win.CustomEvent('sherlock:skill-menu-reset'))}
 return {reset,dispose:()=>{disposed=true;reset();win.removeEventListener(REQUEST,onRequest)}}
}
