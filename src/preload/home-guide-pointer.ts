import {createHomeGuideHover} from './home-guide-hover'
export type HomeGuidePointerFrame={x:number;y:number;phase:'moving'|'pressed'|'dragging'|'released'|'idle'}
type Point={x:number;y:number}
export type HomeGuidePointerAction={
 target:HTMLElement;action?:'move'|'click'|'drag';fromTarget?:HTMLElement
 canvasPoints?:{from():Point;to():Point}
 targetPoint?():Point
 hover?:'target'|'none'
 onClick?():void
 onFrame?(frame:HomeGuidePointerFrame):void
}
type Options={runId:string;signal:AbortSignal;initialPosition?:Point;wait(ms:number):Promise<void>;waitUntilPlaying():Promise<void>}

export function homeGuideTargetPoint(document:Document,target:HTMLElement):Point{
 const win=document.defaultView!
  if(!target?.isConnected||target.ownerDocument!==document||(target as HTMLButtonElement).disabled||target.getAttribute('aria-disabled')==='true'||target.closest('[hidden],[inert]')||['hidden','collapse'].includes(win.getComputedStyle(target).visibility))throw Error('操作目标不可用，请重新打开。')
  const box=target.getBoundingClientRect();let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(win.innerWidth,box.right),bottom=Math.min(win.innerHeight,box.bottom)
  const topLayer=target.closest(':popover-open,dialog:modal')
  for(let node:HTMLElement|null=target;node;node=node.parentElement){
   const style=win.getComputedStyle(node)
   if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')throw Error('操作目标不可用，请重新打开。')
   if(node!==target){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}
   // Native popovers and modal dialogs paint outside the clipping of their DOM parents.
   if(node===topLayer)break
  }
  if(right<=left||bottom<=top)throw Error('操作目标不可用，请先滚动到目标。')
  if(target.hasAttribute('data-bn-thread-id')){
   // An inline mark can wrap over multiple lines. Its union rectangle includes
   // unmarked whitespace, so aim at a visible text fragment, never the union.
   for(const rect of target.getClientRects()){
    const a=Math.max(left,rect.left),b=Math.min(right,rect.right),c=Math.max(top,rect.top),d=Math.min(bottom,rect.bottom)
    if(b<=a||d<=c)continue
    const result={x:a+Math.min(12,(b-a)/2),y:(c+d)/2},hit=document.elementFromPoint(result.x,result.y)
    if(hit&&(hit===target||target.contains(hit)))return result
   }
   throw Error('文字标记尚未完整显示，请先滚动到标记。')
  }
  const text=target.matches('textarea,input:not([type=button]):not([type=checkbox]),[contenteditable=true]')
  return text?{x:left+Math.min(22,(right-left)/3),y:top+Math.min(18,(bottom-top)/3)}:{x:(left+right)/2,y:(top+bottom)/2}
 }

/** Visual cursor; the owning scenario handles native gestures through frame callbacks. */
export function createHomeGuidePointer(document:Document,options:Options){
 const hover=createHomeGuideHover(document,options.runId)
 const win=document.defaultView!,element=document.createElement('div');element.className='odyssey-home-guide-pointer';element.dataset.homeGuidePointer=options.runId;element.setAttribute('aria-hidden','true');element.hidden=true
 element.innerHTML='<span class="odyssey-home-guide-pointer-pulse"></span><svg viewBox="0 0 18 20" width="18" height="20"><path d="M2.75 2.5C2.06 2.5 1.64 3.04 1.72 3.75L3.02 15.05C3.13 16.03 4.32 16.28 4.82 15.43L7.43 10.98L12.78 9.14C13.71 8.82 13.81 7.55 12.94 7.09L3.45 2.66C3.2 2.52 2.95 2.48 2.75 2.5Z" fill="#45474A" stroke="#D7D8DA" stroke-opacity=".92" stroke-width="1.35" stroke-linejoin="round"/></svg>'
 document.body.append(element)
 let position:Point|undefined=options.initialPosition?{...options.initialPosition}:undefined,busy=false,closed=false,state='idle'
 // Native slash/skill menus are manual popovers. A body z-index cannot paint
 // above that top layer; keep this non-interactive visual in the same layer.
 const topLayer=typeof element.showPopover==='function'&&typeof element.hidePopover==='function'
 if(topLayer)element.setAttribute('popover','manual')
 const hideLayer=()=>{if(topLayer&&element.matches(':popover-open'))element.hidePopover()}
 const raiseLayer=(reorder=false)=>{if(!topLayer||closed||!element.isConnected||element.hidden)return;if(reorder)hideLayer();if(!element.matches(':popover-open'))element.showPopover()}
 const beforeToggle=(event:Event)=>{
  const menu=event.target
  if(!topLayer||menu===element||(event as ToggleEvent).newState!=='open'||!(menu instanceof win.HTMLElement)||menu.hasAttribute('data-home-guide-pointer'))return
  // Manual menus may enter the top layer after the cursor. Reorder this
  // non-interactive visual before paint, without moving or focusing the menu.
  win.queueMicrotask(()=>{if(menu.isConnected&&menu.matches('[popover=manual]:popover-open'))raiseLayer(true)})
 }
 if(topLayer)document.addEventListener('beforetoggle',beforeToggle,true)
 let draggedFile:{node:HTMLElement;origin:Point;transform:string}|undefined
 let onFrame:HomeGuidePointerAction['onFrame'],validateDrag:(()=>void)|undefined
 let hoverMode:HomeGuidePointerAction['hover']
 const aborted=()=>Object.assign(Error('操作已取消。'),{name:'AbortError'})
 let rejectInterrupt!:(error:Error)=>void
 const interrupted=new Promise<never>((_resolve,reject)=>{rejectInterrupt=reject});void interrupted.catch(()=>{})
 const stop=()=>{if(closed)return;closed=true;hideLayer();element.hidden=true;hover.dispose();document.removeEventListener('beforetoggle',beforeToggle,true);rejectInterrupt(aborted())}
 options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop()
 const ensure=()=>{if(closed||options.signal.aborted)throw aborted()}
 const gate=async()=>{ensure();await Promise.race([options.waitUntilPlaying(),interrupted]);ensure()}
 const wait=async(ms:number)=>{await gate();await Promise.race([options.wait(ms),interrupted]);await gate()}
 const point=(target:HTMLElement):Point=>homeGuideTargetPoint(document,target)
 const paint=(next:Point,phase:HomeGuidePointerFrame['phase'])=>{validateDrag?.();if(!hoverMode||hoverMode==='target'&&phase!=='moving'&&phase!=='dragging')hover.update(next.x,next.y);if(draggedFile){if(!draggedFile.node.isConnected)throw aborted();draggedFile.node.style.transform=`translate3d(${next.x-draggedFile.origin.x}px,${next.y-draggedFile.origin.y}px,0)`}position=next;state=phase;element.hidden=false;raiseLayer();element.dataset.state=phase;element.style.transform=`translate3d(${next.x}px,${next.y}px,0)`;onFrame?.({...next,phase})}
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true
 const travel=async(readPoint:()=>Point,duration:number,phase:HomeGuidePointerFrame['phase']='moving')=>{
  duration*=1.3
  const destination=readPoint(),start=position??{x:Math.max(8,destination.x-64),y:Math.max(8,destination.y-40)},steps=reduced()?1:Math.max(1,Math.ceil(duration/16))
  paint(start,phase)
  for(let index=1;index<=steps;index++){
   await wait(reduced()?0:duration/steps);ensure();const end=readPoint(),t=index/steps,eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
   const dx=end.x-start.x,dy=end.y-start.y,distance=Math.hypot(dx,dy),bend=phase==='moving'&&!reduced()?Math.min(20,distance*.12):0
   // A shallow approach arc shares the existing eased clock. Precision drags
   // keep their exact selected/drop path and onFrame coordinates unchanged.
   if(!bend){paint({x:start.x+dx*eased,y:start.y+dy*eased},phase);continue}
   const control={x:Math.max(0,Math.min(win.innerWidth,(start.x+end.x)/2-dy/distance*bend)),y:Math.max(0,Math.min(win.innerHeight,(start.y+end.y)/2+dx/distance*bend))}
   paint({x:(1-eased)**2*start.x+2*(1-eased)*eased*control.x+eased**2*end.x,y:(1-eased)**2*start.y+2*(1-eased)*eased*control.y+eased**2*end.y},phase)
  }
 }
 return{
  snapshot:()=>({...position,state}),
  hide(){hideLayer();element.hidden=true;hover.clear()},
  async perform(action:HomeGuidePointerAction){
   ensure();if(busy)throw Error('上一项指针操作尚未完成。');busy=true;onFrame=action.onFrame;hoverMode=action.hover
   if(hoverMode==='none')hover.clear()
   let completed=false
   const readCanvasPoint=(read:()=>Point)=>{
    if(!action.target.isConnected||action.target.ownerDocument!==document)throw aborted()
    const {x,y}=read()
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('表格选区尚未显示。')
    return {x:Math.max(0,Math.min(win.innerWidth-1,x)),y:Math.max(0,Math.min(win.innerHeight-1,y))}
   }
   const readTarget=()=>action.targetPoint?readCanvasPoint(action.targetPoint):action.canvasPoints?readCanvasPoint(action.canvasPoints.to):point(action.target)
   let clickPosition:Point|undefined
   try{
    await gate();const target=readTarget()
    if(action.action==='drag'){
     if(!action.fromTarget)throw Error('连接操作缺少起点。')
     const source=action.fromTarget,canvas=source.closest('[data-research-canvas]'),guide=canvas?.closest<HTMLElement>('[data-home-guide]')
     const readSource=()=>action.canvasPoints?readCanvasPoint(action.canvasPoints.from):point(source)
     if(source.dataset.financialPort==='output'&&action.target.dataset.financialPort==='input'&&guide?.dataset.homeGuide===options.runId){const target=action.target;validateDrag=()=>{point(source);point(target);if(document.documentElement.dataset.homeGuidePointerRun&&document.documentElement.dataset.homeGuidePointerRun!==options.runId||source.closest('[data-research-canvas]')!==canvas||target.closest('[data-research-canvas]')!==canvas||guide.dataset.homeGuide!==options.runId)throw aborted()}}
     await travel(readSource,320)
     if(source.dataset.homeGuideDragFile===options.runId)draggedFile={node:source,origin:readSource(),transform:source.style.transform}
     paint(readSource(),'pressed');await wait(reduced()?0:104)
     await travel(readTarget,780,'dragging');paint(readTarget(),'released');await wait(reduced()?0:208)
    }else{
     const distance=position?Math.hypot(target.x-position.x,target.y-position.y):120
     await travel(readTarget,Math.max(280,Math.min(620,230+distance*.4)))
     if(action.action!=='move'){
      paint(readTarget(),'pressed');await wait(reduced()?0:104)
      const releasedAt=readTarget()
      paint(releasedAt,'released')
      if(action.onClick){action.onClick();clickPosition=releasedAt}
      await wait(reduced()?0:208)
     }
    }
    ensure();paint(clickPosition??readTarget(),'idle');completed=true
   }finally{onFrame=undefined;validateDrag=undefined;hoverMode=undefined;if(!completed)hover.clear();if(draggedFile&&!completed)draggedFile.node.style.transform=draggedFile.transform;draggedFile=undefined;busy=false;if(!closed){state='idle';element.dataset.state='idle'}}
  },
  dispose(){stop();options.signal.removeEventListener('abort',stop);element.remove()}
 }
}
