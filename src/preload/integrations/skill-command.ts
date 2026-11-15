import type {SkillCommandSegment} from '../../shared/integration-ui'
import type {InputTriggerSource} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {SKILL_REFERENCE_SOURCE,decodeSkillReference} from '../../shared/skill-reference'
type Session={sessionId:string;skillCommandSegment?:SkillCommandSegment}
type Skill={id:string;label:string;detail:string;revision:number}
type Option=Pick<Skill,'id'|'label'|'detail'>
type Contribution={name:string;description:string;available(session:Session):boolean;ui:{kind:'popupSelect';options(session:Session,signal:AbortSignal):Promise<Option[]>;onSelect(option:Option,session:Session):Promise<void>}}

/** Uses the native command popup, including its search, keyboard and dismissal. */
export function installSkillCommand(deps:{document?:Document;command:{register(value:Contribution):()=>void};inputTriggers?:{registerSource(value:InputTriggerSource):()=>void};sessions:{subagentAddress(id:string):unknown}}) {
 const document=deps.document??globalThis.document,win=document.defaultView!
 const catalogs=new Map<string,{rows:Skill[];signal:AbortSignal}>(),pending=new Set<()=>void>()
 const exchange=(action:'list'|'use'|'resolve'|'labels',args:Record<string,unknown>,signal?:AbortSignal)=>new Promise<unknown>((resolve,reject)=>{
  if(signal?.aborted){reject(Error('技能菜单已关闭。'));return}
  const requestId=win.crypto.randomUUID()
  const cleanup=()=>{clearTimeout(timer);win.removeEventListener('sherlock:skill-menu-reply',onReply);signal?.removeEventListener('abort',cancel);pending.delete(cancel)}
  const cancel=()=>{cleanup();win.dispatchEvent(new win.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action:'cancel'}}));reject(Error('页面已变化，请重新选择技能。'))}
  const onReply=(event:Event)=>{const reply=(event as CustomEvent).detail;if(reply?.requestId!==requestId)return;cleanup();if(reply.ok)resolve(reply.result);else reject(Error(reply.error||'技能列表暂不可用。'))}
  const timer=setTimeout(cancel,10000)
  pending.add(cancel);signal?.addEventListener('abort',cancel,{once:true});win.addEventListener('sherlock:skill-menu-reply',onReply)
  win.dispatchEvent(new win.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action,...args}}))
 })
 let stopped=false
 const refreshLabels=()=>{void exchange('labels',{}).then(result=>{if(!stopped)win.dispatchEvent(new win.CustomEvent('sherlock:skill-presentation',{detail:result}))},()=>{})}
 const reset=()=>{catalogs.clear();for(const cancel of [...pending])cancel();if(!stopped)refreshLabels()}
 win.addEventListener('sherlock:skill-menu-reset',reset)
 refreshLabels();const labelTimer=win.setInterval(refreshLabels,10000)
 const localeObserver=new win.MutationObserver(refreshLabels)
 localeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']})
 const unregisterReference=deps.inputTriggers?.registerSource({trigger:'/',name:SKILL_REFERENCE_SOURCE,order:3,candidates:async()=>[],onPick:()=>undefined,codec:{
  clipboardText:(ref:string)=>`/${decodeSkillReference(ref).label}`,
  serialize:async(ref:string,signal:AbortSignal)=>{
   const reference=decodeSkillReference(ref)
   const result=await exchange('resolve',{reference},signal) as {invocationName:string}
   if(result?.invocationName!==reference.invocationName)throw Error('技能引用已变化，请重新选择技能。')
   return `/${result.invocationName}`
  }
 }})
 const unregister=deps.command.register({name:'skills',description:'选择在对话中使用的技能',available:session=>deps.sessions.subagentAddress(session.sessionId)===undefined,ui:{kind:'popupSelect',
  options:async(session,signal)=>{
   if(deps.sessions.subagentAddress(session.sessionId)!==undefined)throw Error('请返回主对话选择技能。')
   const rows=await exchange('list',{},signal) as Skill[]
   if(!Array.isArray(rows) || rows.some(s=>typeof s.id!=='string' || typeof s.label!=='string' || typeof s.detail!=='string' || !Number.isSafeInteger(s.revision)))throw Error('技能列表无效，请重新打开。')
   catalogs.set(session.sessionId,{rows,signal})
   return rows.map(({id,label,detail})=>({id,label,detail}))
  },
  onSelect:async(option,session)=>{
   if(deps.sessions.subagentAddress(session.sessionId)!==undefined)throw Error('请返回主对话选择技能。')
   const catalog=catalogs.get(session.sessionId),skill=catalog?.rows.find(s=>s.id===option.id)
   if(!skill)throw Error('技能列表已变化，请重新打开。')
   // The flyout segment also owns DOM nodes and callbacks in the renderer.
   // Only pass the draft range (or typed token) across the Electron worlds.
   const segment=session.skillCommandSegment
   let commandSegment:SkillCommandSegment|undefined
   if(segment?.via==='menu'){
    const {start,end,draftRev}=segment.span
    commandSegment={via:'menu',span:{start,end,draftRev}}
   }else if(segment?.via==='enter')commandSegment={via:'enter',token:segment.token}
   await exchange('use',{skill,sessionId:session.sessionId,commandSegment},catalog!.signal)
  }
 }})
 return ()=>{stopped=true;localeObserver.disconnect();win.clearInterval(labelTimer);unregister();unregisterReference?.();reset();win.removeEventListener('sherlock:skill-menu-reset',reset)}
}
