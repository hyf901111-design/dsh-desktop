import { HOME_WORKBENCH_STEPS } from '../../packages/dsh-research-task-runtime/home-workbench-contract.js'
import type { HomeGuideAdapter, HomeGuideMountOptions } from './home-guides'

type Options = Pick<HomeGuideMountOptions, 'signal'|'sessionId'|'runId'|'cwd'|'fresh'|'waitUntilPlaying'>
const abortError=()=>new DOMException('演示已结束。','AbortError')

/** Only coordinates requests. Native InputBar and ResearchCanvas own every visible state. */
export async function mountHomeWorkbenchGuide(document:Document,host:HTMLElement,options:Options):Promise<HomeGuideAdapter & {flush():Promise<void>}>{
 const win=document.defaultView
 if(!win||options.signal.aborted||!host.isConnected)throw abortError()
 const originalId=host.id,hostId=originalId||'home-workbench-host-'+crypto.randomUUID(),pending=new Set<()=>void>()
 host.id=hostId
 let stopped=false,index=0,busy=false,playing=false
 const base=()=>({requestId:crypto.randomUUID(),runId:options.runId,sessionId:options.sessionId,kind:'workbench',hostId})
 const playback=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.runId===options.runId&&value.sessionId===options.sessionId)playing=value.playing===true}
 win.addEventListener('sherlock:home-guide-playback',playback)
 const exchange=(command:string)=>new Promise<void>((resolve,reject)=>{
  if(stopped||options.signal.aborted){reject(abortError());return}
  const detail={...base(),command,...(command==='mount'?{cwd:options.cwd,fresh:options.fresh}:{})}
  const clean=()=>{win.clearInterval(timer);win.removeEventListener('sherlock:home-guide-workbench-reply',receive);pending.delete(cancel)}
  const cancel=()=>{clean();reject(abortError())}
  const receive=(event:Event)=>{
   const reply=(event as CustomEvent).detail
   if(reply?.requestId!==detail.requestId||reply.runId!==options.runId||reply.sessionId!==options.sessionId)return
   clean();reply.ok===true?resolve():reject(Error(reply.message||'工作台演示未能完成，请重试。'))
  }
  let remaining=command==='mount'||command==='flush'?15000:45000,last=win.performance.now()
  const timer=win.setInterval(()=>{
   const now=win.performance.now()
   // A stopped timeline still has to save before navigation can finish.
   if(command==='mount'||command==='flush'||playing&&!document.hidden)remaining-=now-last
   last=now
   if(remaining<=0){clean();reject(Error(command==='flush'?'工作台尚未完成保存，请重试。':'工作台演示暂未就绪，请重试。'))}
  },250)
  pending.add(cancel);win.addEventListener('sherlock:home-guide-workbench-reply',receive)
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-workbench-request',{detail}))
 })
 const dispose=()=>{
  if(stopped)return
  stopped=true;options.signal.removeEventListener('abort',dispose);win.removeEventListener('sherlock:home-guide-playback',playback)
  for(const cancel of pending)cancel()
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-workbench-request',{detail:{...base(),command:'dispose'}}))
  if(!originalId&&host.id===hostId)host.removeAttribute('id')
 }
 options.signal.addEventListener('abort',dispose,{once:true})
 try{await exchange('mount')}catch(error){dispose();throw error}
 return{
  async runStep(step:string){
   if(stopped||options.signal.aborted||!host.isConnected)throw abortError()
   if(busy||HOME_WORKBENCH_STEPS[index]?.id!==step)throw Error('演示步骤顺序已变化，请重新播放。')
   busy=true
   try{await options.waitUntilPlaying();if(stopped||options.signal.aborted)throw abortError();await exchange(step);index++}
   // Keep the request channel alive after a failed action: the native actor
   // retains a save receipt that close() must confirm before disposal.
   finally{busy=false}
  },
  flush:()=>exchange('flush'),
  dispose
 }
}
