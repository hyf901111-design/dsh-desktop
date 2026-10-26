export type HomeGuidePointerFrame={x:number;y:number;phase:'moving'|'pressed'|'dragging'|'released'|'idle'}
export type HomeGuidePointerAction={target:HTMLElement;action?:'move'|'click'|'drag';fromTarget?:HTMLElement;onFrame?(frame:HomeGuidePointerFrame):void}
type Point={x:number;y:number}
type Options={runId:string;signal:AbortSignal;wait(ms:number):Promise<void>;waitUntilPlaying():Promise<void>}

/** A visual actor only. The owning scenario performs its real action after acknowledgement. */
export function createHomeGuidePointer(document:Document,options:Options){
 const win=document.defaultView!,element=document.createElement('div');element.className='odyssey-home-guide-pointer';element.dataset.homeGuidePointer=options.runId;element.setAttribute('aria-hidden','true');element.hidden=true
 element.innerHTML='<span class="odyssey-home-guide-pointer-pulse"></span><svg viewBox="0 0 18 20" width="18" height="20"><path d="M2.75 2.5C2.06 2.5 1.64 3.04 1.72 3.75L3.02 15.05C3.13 16.03 4.32 16.28 4.82 15.43L7.43 10.98L12.78 9.14C13.71 8.82 13.81 7.55 12.94 7.09L3.45 2.66C3.2 2.52 2.95 2.48 2.75 2.5Z" fill="#45474A" stroke="#D7D8DA" stroke-opacity=".92" stroke-width="1.35" stroke-linejoin="round"/></svg>'
 document.body.append(element)
 let position:Point|undefined,busy=false,closed=false,state='idle'
 type Connection={source:HTMLElement;target:HTMLElement;canvas:HTMLElement;guide:HTMLElement;svg:SVGSVGElement;path:SVGPathElement}
 let connection:Connection|undefined
 let draggedFile:{node:HTMLElement;origin:Point;transform:string}|undefined
 let onFrame:HomeGuidePointerAction['onFrame']
 const clearConnection=()=>{connection?.svg.remove();connection=undefined}
 const aborted=()=>Object.assign(Error('操作已取消。'),{name:'AbortError'})
 let rejectInterrupt!:(error:Error)=>void
 const interrupted=new Promise<never>((_resolve,reject)=>{rejectInterrupt=reject});void interrupted.catch(()=>{})
 const stop=()=>{if(closed)return;closed=true;element.hidden=true;clearConnection();rejectInterrupt(aborted())}
 options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop()
 const ensure=()=>{if(closed||options.signal.aborted)throw aborted()}
 const gate=async()=>{ensure();await Promise.race([options.waitUntilPlaying(),interrupted]);ensure()}
 const wait=async(ms:number)=>{await gate();await Promise.race([options.wait(ms),interrupted]);await gate()}
 const point=(target:HTMLElement):Point=>{
  if(!target?.isConnected||target.ownerDocument!==document||(target as HTMLButtonElement).disabled||target.getAttribute('aria-disabled')==='true'||target.closest('[hidden],[inert]')||['hidden','collapse'].includes(win.getComputedStyle(target).visibility))throw Error('操作目标不可用，请重新打开。')
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
 const ownedPort=(port:HTMLElement,side:string)=>port.dataset.financialPort===side&&!!port.dataset.financialPortNode&&port.closest<HTMLElement>('[data-research-node-id]')?.dataset.researchNodeId===port.dataset.financialPortNode&&!!port.closest('[data-financial-widget]')
 const beginConnection=(source:HTMLElement,target:HTMLElement)=>{
  const canvas=source.closest<HTMLElement>('[data-research-canvas]'),guide=canvas?.closest<HTMLElement>('[data-home-guide]')
  if(!canvas||target.closest('[data-research-canvas]')!==canvas||!guide||guide.dataset.kind!=='board'||guide.dataset.homeGuide!==options.runId||!ownedPort(source,'output')||!ownedPort(target,'input')||source.dataset.financialPortNode===target.dataset.financialPortNode)return
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path')
  svg.dataset.homeGuideConnection=options.runId;svg.setAttribute('aria-hidden','true');svg.style.cssText='position:fixed;inset:0;z-index:2147482999;pointer-events:none;overflow:hidden'
  for(const[name,value]of Object.entries({fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}))path.setAttribute(name,value)
  svg.append(path);document.body.append(svg);connection={source,target,canvas,guide,svg,path}
 }
 const paintConnection=(next:Point,phase:string)=>{
  const link=connection;if(!link)return
  const marker=document.documentElement.dataset.homeGuidePointerRun
  if(marker&&marker!==options.runId||!link.canvas.isConnected||!ownedPort(link.source,'output')||!ownedPort(link.target,'input')||link.source.closest('[data-research-canvas]')!==link.canvas||link.target.closest('[data-research-canvas]')!==link.canvas||link.canvas.closest('[data-home-guide]')!==link.guide||link.guide.dataset.kind!=='board'||link.guide.dataset.homeGuide!==options.runId)throw aborted()
  const from=point(link.source);point(link.target)
  const bounds=link.canvas.getBoundingClientRect();let left=Math.max(0,bounds.left),top=Math.max(0,bounds.top),right=Math.min(win.innerWidth,bounds.right),bottom=Math.min(win.innerHeight,bounds.bottom)
  for(let parent=link.canvas.parentElement;parent;parent=parent.parentElement){const style=win.getComputedStyle(parent),box=parent.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,box.left);right=Math.min(right,box.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom)}}
  if(right<=left||bottom<=top)throw Error('操作目标不可用，请先滚动到目标。')
  const bend=Math.hypot(next.x-from.x,next.y-from.y)<1?0:Math.max(40,Math.min(160,Math.abs(next.x-from.x)/2))
  link.svg.setAttribute('width',String(win.innerWidth));link.svg.setAttribute('height',String(win.innerHeight));link.svg.setAttribute('viewBox',`0 0 ${win.innerWidth} ${win.innerHeight}`)
  link.svg.style.clipPath=`inset(${top}px ${win.innerWidth-right}px ${win.innerHeight-bottom}px ${left}px)`
  link.svg.style.color=win.getComputedStyle(link.source).getPropertyValue('--fw-accent').trim()||win.getComputedStyle(link.canvas).getPropertyValue('--fw-accent').trim()||'#249bfa'
  link.svg.dataset.state=phase
  // Match the native draft curve while keeping its free end on the visual
  // pointer; the real workspace still owns the final persisted connection.
  link.path.setAttribute('d',`M ${from.x} ${from.y} C ${from.x+bend} ${from.y} ${next.x-bend} ${next.y} ${next.x} ${next.y}`)
 }
 const paint=(next:Point,phase:HomeGuidePointerFrame['phase'])=>{paintConnection(next,phase);if(draggedFile){if(!draggedFile.node.isConnected)throw aborted();draggedFile.node.style.transform=`translate3d(${next.x-draggedFile.origin.x}px,${next.y-draggedFile.origin.y}px,0)`}position=next;state=phase;element.hidden=false;element.dataset.state=phase;element.style.transform=`translate3d(${next.x}px,${next.y}px,0)`;onFrame?.({...next,phase})}
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true
 const travel=async(target:HTMLElement,duration:number,phase:HomeGuidePointerFrame['phase']='moving')=>{
  const destination=point(target),start=position??{x:Math.max(8,destination.x-64),y:Math.max(8,destination.y-40)},steps=reduced()?1:Math.max(1,Math.ceil(duration/16))
  paint(start,phase)
  for(let index=1;index<=steps;index++){
   await wait(reduced()?0:duration/steps);ensure();const end=point(target),t=index/steps,eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
   paint({x:start.x+(end.x-start.x)*eased,y:start.y+(end.y-start.y)*eased},phase)
  }
 }
 return{
  snapshot:()=>({...position,state}),
  hide(){element.hidden=true;clearConnection()},
  async perform(action:HomeGuidePointerAction){
   ensure();if(busy)throw Error('上一项指针操作尚未完成。');busy=true;onFrame=action.onFrame
   let completed=false
   try{
    await gate();const target=point(action.target)
    if(action.action==='drag'){
     if(!action.fromTarget)throw Error('连接操作缺少起点。')
     await travel(action.fromTarget,320);beginConnection(action.fromTarget,action.target)
     if(action.fromTarget.dataset.homeGuideDragFile===options.runId)draggedFile={node:action.fromTarget,origin:point(action.fromTarget),transform:action.fromTarget.style.transform}
     paint(point(action.fromTarget),'pressed');await wait(reduced()?0:80)
     await travel(action.target,780,'dragging');paint(point(action.target),'released');await wait(reduced()?0:160)
    }else{
     const distance=position?Math.hypot(target.x-position.x,target.y-position.y):120
     await travel(action.target,Math.max(280,Math.min(620,230+distance*.4)))
     if(action.action!=='move'){paint(point(action.target),'pressed');await wait(reduced()?0:80);paint(point(action.target),'released');await wait(reduced()?0:160)}
    }
    ensure();paint(point(action.target),'idle');completed=true
   }finally{onFrame=undefined;if(draggedFile&&!completed)draggedFile.node.style.transform=draggedFile.transform;draggedFile=undefined;clearConnection();busy=false;if(!closed){state='idle';element.dataset.state='idle'}}
  },
  dispose(){stop();options.signal.removeEventListener('abort',stop);element.remove()}
 }
}
