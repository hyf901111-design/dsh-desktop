export type HomePresentationGuideStep='brief'|'send'|'plan'|'layout'|'deliver'|'open'
export type HomePresentationGuide={runStep(step:HomePresentationGuideStep):Promise<void>;dispose():void}

/** A request adapter only: the native page owns all InputBar, TodoPanel and Office UI. */
export async function mountHomePresentationGuide(document:Document,host:HTMLElement,options:{kind?:string;signal:AbortSignal;sessionId:string;runId:string;cwd?:string;fresh?:boolean;wait?:(ms:number)=>Promise<void>;waitUntilPlaying?:()=>Promise<void>}):Promise<HomePresentationGuide>{
 const win=document.defaultView
 if(!win||options.signal.aborted||!host.isConnected)throw new DOMException('演示已结束。','AbortError')
 const kind=options.kind==='report'?'report':undefined
 const hostId=host.id||'home-presentation-host-'+crypto.randomUUID(),originalId=host.id,pending=new Set<()=>void>()
 host.id=hostId
 let stopped=false,index=0,busy=false,playing=false
 const playback=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.runId===options.runId&&value.sessionId===options.sessionId)playing=value.playing===true}
 win.addEventListener('sherlock:home-guide-playback',playback)
 const exchange=(command:string)=>new Promise<void>((resolve,reject)=>{
  if(stopped){reject(new DOMException('演示已结束。','AbortError'));return}
  const requestId=crypto.randomUUID(),detail={requestId,runId:options.runId,sessionId:options.sessionId,command,hostId,...(kind?{kind}:{}),...(command==='mount'?{cwd:options.cwd,fresh:options.fresh}:{} )}
  const clean=()=>{win.clearInterval(timer);win.removeEventListener('sherlock:home-guide-presentation-reply',receive);pending.delete(cancel)}
  const cancel=()=>{clean();reject(new DOMException('演示已结束。','AbortError'))}
  const receive=(event:Event)=>{const reply=(event as CustomEvent).detail;if(reply?.requestId!==requestId||reply.runId!==options.runId||reply.sessionId!==options.sessionId)return;clean();reply.ok?resolve():reject(Error(reply.message||'原生演示未能完成，请重试。'))}
  let remaining=kind==='report'?45_000:15_000,last=win.performance.now()
  const timer=win.setInterval(()=>{const now=win.performance.now();if(command==='mount'||playing&&!document.hidden)remaining-=now-last;last=now;if(remaining<=0){clean();reject(Error('原生演示暂未就绪，请重试。'))}},250)
  pending.add(cancel);win.addEventListener('sherlock:home-guide-presentation-reply',receive)
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-presentation-request',{detail}))
 })
 const dispose=()=>{
  if(stopped)return;stopped=true;options.signal.removeEventListener('abort',dispose);win.removeEventListener('sherlock:home-guide-playback',playback)
  for(const cancel of pending)cancel()
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-presentation-request',{detail:{requestId:crypto.randomUUID(),runId:options.runId,sessionId:options.sessionId,command:'dispose',hostId,...(kind?{kind}:{})}}))
  if(!originalId&&host.id===hostId)host.removeAttribute('id')
 }
 options.signal.addEventListener('abort',dispose,{once:true})
 try{await exchange('mount')}catch(error){dispose();throw error}
 return{async runStep(step){
  if(stopped||options.signal.aborted||!host.isConnected)throw new DOMException('演示已结束。','AbortError')
  if(busy||(['brief','send','plan','layout','deliver','open'] as const)[index]!==step)throw Error('演示步骤顺序已变化，请重新播放。')
  busy=true;try{await options.waitUntilPlaying?.();if(stopped)throw new DOMException('演示已结束。','AbortError');await exchange(step);index++}catch(error){dispose();throw error}finally{busy=false}
 },dispose}
}
