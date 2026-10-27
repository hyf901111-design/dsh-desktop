// Literal source keeps the production Node installer and transformed test runner byte-identical.
const SOURCE=String.raw`function useEWorkCommandPopupSurface(ref,state){
 (0,react.useLayoutEffect)(()=>{
  const element=ref.current
  if(!element||!state.open||state.confirming!==null||state.command==="skills")return
  const anchor=element.parentElement,doc=element.ownerDocument,win=doc.defaultView
  if(!anchor||!win||!element.showPopover||element.hasAttribute("popover"))return
  const keys=["position","inset","left","top","right","bottom","margin","width","min-width","max-width"]
  const prior=keys.map(key=>[key,element.style.getPropertyValue(key),element.style.getPropertyPriority(key)])
  let frame=0,disposed=false
  const place=()=>{
   frame=0;if(disposed||!element.isConnected||!anchor.isConnected)return
   const rect=anchor.getBoundingClientRect(),available=Math.max(1,Math.min(rect.width||win.innerWidth-16,win.innerWidth-16))
   element.style.position="fixed";element.style.inset="auto";element.style.margin="0"
   element.style.width="max-content";element.style.minWidth=Math.min(220,available)+"px";element.style.maxWidth=available+"px"
   const box=element.getBoundingClientRect()
   element.style.left=Math.max(8,Math.min(rect.left,win.innerWidth-box.width-8))+"px"
   element.style.top=Math.max(8,Math.min(rect.top-box.height-4,win.innerHeight-box.height-8))+"px"
  }
  const schedule=()=>{if(!disposed&&!frame)frame=win.requestAnimationFrame(place)}
  element.dataset.eworkCommandSurface="";element.setAttribute("popover","manual")
  try{element.showPopover();place()}catch(error){delete element.dataset.eworkCommandSurface;element.removeAttribute("popover");for(const[key,value,priority]of prior)value?element.style.setProperty(key,value,priority):element.style.removeProperty(key);throw error}
  const resize=new win.ResizeObserver(schedule);resize.observe(element);resize.observe(anchor)
  win.addEventListener("resize",schedule);win.addEventListener("scroll",schedule,true)
  return()=>{
   disposed=true;resize.disconnect();win.cancelAnimationFrame(frame)
   win.removeEventListener("resize",schedule);win.removeEventListener("scroll",schedule,true)
   element.hidePopover();element.removeAttribute("popover");delete element.dataset.eworkCommandSurface
   for(const[key,value,priority]of prior)value?element.style.setProperty(key,value,priority):element.style.removeProperty(key)
  }
 },[ref,state.open,state.confirming,state.command==="skills"])
}`
const START='/* ework:command-popup-surface:v1 */',END='/* ework:command-popup-surface:end */',BLOCK=START+'\n'+SOURCE+'\n'+END
const CALL='useEWorkCommandPopupSurface(cardRef,state);',ANCHOR='useExpandedCommandMenu(cardRef,state,state.command === "skills");'
const count=(source,text)=>source.split(text).length-1
export function stripCommandPopupSurface(source){
 const starts=count(source,START),ends=count(source,END),calls=count(source,CALL)
 if(!starts&&!ends&&!calls){if(source.includes('useEWorkCommandPopupSurface'))throw Error('Command popup surface orphaned.');return source}
 if(starts!==1||ends!==1||calls!==1||count(source,BLOCK)!==1||count(source,ANCHOR+'\n'+CALL)!==1)throw Error('Command popup surface installed source drifted or duplicated.')
 const clean=source.replace(BLOCK+'\n','').replace(ANCHOR+'\n'+CALL,ANCHOR)
 if(clean.includes('useEWorkCommandPopupSurface')||clean.includes('ework:command-popup-surface'))throw Error('Command popup surface inverse traces remain.')
 return clean
}
export function patchCommandPopupSurface(source){
 source=stripCommandPopupSurface(source)
 if(count(source,ANCHOR)!==1||count(source,'function PopupSelectView(')!==1)throw Error('Command popup surface native anchor drifted.')
 return source.replace(ANCHOR,ANCHOR+'\n'+CALL).replace('function PopupSelectView(',BLOCK+'\nfunction PopupSelectView(')
}
