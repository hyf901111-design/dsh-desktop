// Shared by native card bodies and opaque HTML sandboxes. Native scrollbars stay
// hidden: these controls paint over the viewport and never change content width.
export function installWorkbenchScrollbars(container, viewport, selected, scrollports) {
  const doc=container.ownerDocument,view=doc.defaultView,layer=doc.createElement('div'),parts=new Map(),observed=new Set()
  layer.dataset.workbenchScrollOverlay='';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:95;overflow:hidden'
  const fullscreen=container===doc.documentElement
  if(fullscreen)layer.style.position='fixed'
  container.append(layer)
  let frame=0,drag=null,destroyed=false,dirty=true,candidates=[]
  const schedule=()=>{if(!destroyed&&!frame)frame=view.requestAnimationFrame(paint)}
  const rescan=()=>{dirty=true;schedule()}
  const resize=new view.ResizeObserver(rescan)
  resize.observe(container)
  const mutation=new view.MutationObserver(records=>{if(records.some(r=>!layer.contains(r.target)&&r.target!==layer))rescan()})
  mutation.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-selected','data-workbench-selected','data-sherlock-theme']})
  function paint(){
    frame=0;if(destroyed)return
    layer.hidden=!selected();if(layer.hidden){dirty=true;return}
    const port=viewport();if(!port)return
    const base=fullscreen?{left:0,top:0}:container.getBoundingClientRect(),bounds=fullscreen?{left:0,top:0,right:view.innerWidth,bottom:view.innerHeight}:port.getBoundingClientRect()
    if(dirty)candidates=[...new Set(scrollports())].filter(el=>el&&!layer.contains(el)&&!el.closest?.('[data-workbench-scroll-overlay]'))
    for(const el of observed)if(!candidates.includes(el)){resize.unobserve(el);observed.delete(el)}
    for(const el of candidates)if(!observed.has(el)){observed.add(el);resize.observe(el)}
    for(const axis of ['y','x']){
      const horizontal=axis==='x',size=horizontal?'clientWidth':'clientHeight',total=horizontal?'scrollWidth':'scrollHeight',at=horizontal?'scrollLeft':'scrollTop'
      const owner=!dirty&&parts.get(axis)?.owner?.isConnected?parts.get(axis).owner:candidates.filter(el=>{
        if(el[total]<=el[size]+1)return false
        const style=view.getComputedStyle(el),mode=horizontal?style.overflowX:style.overflowY,r=el===doc.scrollingElement?bounds:el.getBoundingClientRect()
        return el[total]>el[size]+1&&(el===doc.scrollingElement||/auto|scroll|overlay/.test(mode))&&r.right>bounds.left&&r.left<bounds.right&&r.bottom>bounds.top&&r.top<bounds.bottom
      }).sort((a,b)=>Number(b===port)-Number(a===port)||(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0]
      let part=parts.get(axis)
      if(!owner){if(part)part.track.hidden=true;continue}
      if(!part){
        const track=doc.createElement('div'),thumb=doc.createElement('span')
        track.dataset.workbenchScrollbar=axis;track.setAttribute('data-research-preview-interactive','');track.setAttribute('role','scrollbar');track.setAttribute('aria-label',horizontal?'水平滚动':'垂直滚动');track.setAttribute('aria-orientation',horizontal?'horizontal':'vertical');track.tabIndex=0
        track.style.cssText='position:absolute;pointer-events:auto;touch-action:none;background:transparent;outline:none';thumb.style.cssText='display:block;position:absolute;border-radius:4px;background:var(--grid-scroll-thumb,var(--sherlock-scroll-thumb,#74778055));pointer-events:none'
        track.append(thumb);layer.append(track);part={track,thumb};parts.set(axis,part)
        track.addEventListener('pointerdown',event=>{
          event.preventDefault();event.stopPropagation();track.setPointerCapture?.(event.pointerId)
          const current=part.owner,r=track.getBoundingClientRect(),position=(horizontal?event.clientX-r.left:event.clientY-r.top),offset=(current[at]/Math.max(1,current[total]-current[size]))*part.travel
          drag={part,pointer:event.pointerId,origin:horizontal?event.clientX:event.clientY,offset:position>=offset&&position<=offset+part.length?offset:position-part.length/2}
          setOffset(drag.offset)
        })
        const setOffset=value=>{const p=parts.get(axis);p.owner[at]=Math.max(0,Math.min(p.travel,value))/Math.max(1,p.travel)*(p.owner[total]-p.owner[size]);schedule()}
        track.addEventListener('pointermove',event=>{if(drag?.part===part&&drag.pointer===event.pointerId){event.preventDefault();event.stopPropagation();setOffset(drag.offset+(horizontal?event.clientX:event.clientY)-drag.origin)}})
        for(const type of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(type,()=>{if(drag?.part===part)drag=null})
        track.addEventListener('keydown',event=>{const direction=['ArrowDown','ArrowRight','PageDown','End'].includes(event.key)?1:['ArrowUp','ArrowLeft','PageUp','Home'].includes(event.key)?-1:0;if(!direction)return;event.preventDefault();event.stopPropagation();part.owner[at]=event.key==='Home'?0:event.key==='End'?part.owner[total]:part.owner[at]+direction*(event.key.startsWith('Page')?part.owner[size]:40);schedule()})
      }
      part.owner=owner;part.track.hidden=false
      const span=Math.max(0,(horizontal?bounds.right-bounds.left:bounds.bottom-bounds.top)-12),length=Math.min(span,Math.max(28,span*owner[size]/owner[total])),travel=span-length,offset=travel*owner[at]/Math.max(1,owner[total]-owner[size])
      part.length=length;part.travel=travel
      Object.assign(part.track.style,horizontal?{left:bounds.left-base.left+6+'px',top:bounds.bottom-base.top-10+'px',width:span+'px',height:'10px'}:{left:bounds.right-base.left-10+'px',top:bounds.top-base.top+6+'px',width:'10px',height:span+'px'})
      Object.assign(part.thumb.style,horizontal?{left:offset+'px',top:'3px',width:length+'px',height:'5px'}:{top:offset+'px',left:'3px',height:length+'px',width:'5px'})
      part.track.setAttribute('aria-valuemin','0');part.track.setAttribute('aria-valuemax',String(owner[total]-owner[size]));part.track.setAttribute('aria-valuenow',String(Math.round(owner[at])))
    }
    dirty=false
  }
  container.addEventListener('scroll',schedule,true);view.addEventListener('resize',schedule)
  schedule()
  return {refresh:rescan,destroy(){destroyed=true;view.cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();container.removeEventListener('scroll',schedule,true);view.removeEventListener('resize',schedule);layer.remove()}}
}
