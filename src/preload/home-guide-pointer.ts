export type HomeGuidePointerAction={target:HTMLElement;action?:'move'|'click'|'drag';fromTarget?:HTMLElement}
type Point={x:number;y:number}
type Options={runId:string;signal:AbortSignal;wait(ms:number):Promise<void>;waitUntilPlaying():Promise<void>}

/** A visual actor only. The owning scenario performs its real action after acknowledgement. */
export function createHomeGuidePointer(document:Document,options:Options){
 const win=document.defaultView!,element=document.createElement('div');element.className='odyssey-home-guide-pointer';element.dataset.homeGuidePointer=options.runId;element.setAttribute('aria-hidden','true');element.hidden=true
 element.innerHTML='<span class="odyssey-home-guide-pointer-pulse"></span><svg viewBox="0 0 25 32" width="25" height="32"><path d="M3 2.5v23l6.3-5.7 4.6 10 4.5-2.1-4.8-9.6 8.5-.5Z" fill="#fff" stroke="#202329" stroke-width="1.6" stroke-linejoin="round"/></svg>'
 document.body.append(element)
 let position:Point|undefined,busy=false,closed=false,state='idle'
 const aborted=()=>Object.assign(Error('操作已取消。'),{name:'AbortError'})
 let rejectInterrupt!:(error:Error)=>void
 const interrupted=new Promise<never>((_resolve,reject)=>{rejectInterrupt=reject});void interrupted.catch(()=>{})
 const stop=()=>{if(closed)return;closed=true;element.hidden=true;rejectInterrupt(aborted())}
 options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop()
 const ensure=()=>{if(closed||options.signal.aborted)throw aborted()}
 const gate=async()=>{ensure();await Promise.race([options.waitUntilPlaying(),interrupted]);ensure()}
 const wait=async(ms:number)=>{await gate();await Promise.race([options.wait(ms),interrupted]);await gate()}
 const point=(target:HTMLElement):Point=>{
  if(!target?.isConnected||target.closest('[hidden],[inert]')||['hidden','collapse'].includes(win.getComputedStyle(target).visibility))throw Error('操作目标不可用，请重新打开。')
  const box=target.getBoundingClientRect();let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(win.innerWidth,box.right),bottom=Math.min(win.innerHeight,box.bottom)
  for(let node:HTMLElement|null=target;node;node=node.parentElement){
   const style=win.getComputedStyle(node)
   if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')throw Error('操作目标不可用，请重新打开。')
   if(node!==target){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}
  }
  if(right<=left||bottom<=top)throw Error('操作目标不可用，请先滚动到目标。')
  const text=target.matches('textarea,input:not([type=button]):not([type=checkbox]),[contenteditable=true]')
  return text?{x:left+Math.min(22,(right-left)/3),y:top+Math.min(18,(bottom-top)/3)}:{x:(left+right)/2,y:(top+bottom)/2}
 }
 const paint=(next:Point,phase:string)=>{position=next;state=phase;element.hidden=false;element.dataset.state=phase;element.style.transform=`translate3d(${next.x}px,${next.y}px,0)`}
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true
 const travel=async(target:HTMLElement,duration:number,phase='moving')=>{
  const destination=point(target),start=position??{x:Math.max(8,destination.x-64),y:Math.max(8,destination.y-40)},steps=reduced()?1:Math.max(1,Math.ceil(duration/16))
  paint(start,phase)
  for(let index=1;index<=steps;index++){
   await wait(reduced()?0:duration/steps);ensure();const end=point(target),t=index/steps,eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
   paint({x:start.x+(end.x-start.x)*eased,y:start.y+(end.y-start.y)*eased},phase)
  }
 }
 return{
  snapshot:()=>({...position,state}),
  hide(){element.hidden=true},
  async perform(action:HomeGuidePointerAction){
   ensure();if(busy)throw Error('上一项指针操作尚未完成。');busy=true
   try{
    await gate();const target=point(action.target)
    if(action.action==='drag'){
     if(!action.fromTarget)throw Error('连接操作缺少起点。')
     await travel(action.fromTarget,320);paint(point(action.fromTarget),'pressed');await wait(reduced()?0:80)
     await travel(action.target,780,'dragging');paint(point(action.target),'released');await wait(reduced()?0:160)
    }else{
     const distance=position?Math.hypot(target.x-position.x,target.y-position.y):120
     await travel(action.target,Math.max(280,Math.min(620,230+distance*.4)))
     if(action.action!=='move'){paint(point(action.target),'pressed');await wait(reduced()?0:80);paint(point(action.target),'released');await wait(reduced()?0:160)}
    }
    ensure();paint(point(action.target),'idle')
   }finally{busy=false;if(!closed){state='idle';element.dataset.state='idle'}}
  },
  dispose(){stop();options.signal.removeEventListener('abort',stop);element.remove()}
 }
}
