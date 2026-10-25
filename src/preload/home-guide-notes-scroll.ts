/** Keep the real editor mounted while returning to the title on the guide clock. */
export async function returnHomeNotesToTop(area:HTMLElement,options:{signal:AbortSignal;reducedMotion:boolean;wait(ms:number):Promise<void>}){
 const assert=()=>{options.signal.throwIfAborted();if(!area.isConnected)throw new DOMException('笔记已离开。','AbortError')}
 assert()
 const start=area.scrollTop,previous=area.style.scrollBehavior
 const duration=Math.max(720,Math.min(1200,Math.sqrt(start)*28)),steps=options.reducedMotion||start<1?1:Math.ceil(duration/16)
 area.style.scrollBehavior='auto'
 try{
  for(let index=1;index<=steps;index++){
   await options.wait(options.reducedMotion?0:duration/steps);assert()
   const t=index/steps,eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
   area.scrollTop=start*(1-eased)
  }
  assert();area.scrollTop=0
 }finally{if(area.style.scrollBehavior==='auto')area.style.scrollBehavior=previous}
}
