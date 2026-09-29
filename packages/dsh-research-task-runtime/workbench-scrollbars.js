// Shared by native card bodies and opaque HTML sandboxes. Native scrollbars stay
// hidden: these controls paint over the viewport and never change content width.
export function isWorkbenchScrollbarMessage(data, kind) {
  if(!data||typeof data!=='object'||Array.isArray(data))return false
  const keys=Object.keys(data),finite=n=>Number.isFinite(n)&&n>=0&&n<=1e7
  if(kind==='ready')return data.type==='sherlock-workbench-scrollbar-ready'&&keys.length===1
  if(kind==='bind')return data.type==='sherlock-workbench-scrollbar-bind'&&keys.length===1
  if(kind==='scroll')return data.type==='sherlock-workbench-scrollbar-scroll'&&keys.length===3&&['x','y'].includes(data.axis)&&finite(data.position)
  if(kind!=='metrics'||data.type!=='sherlock-workbench-scrollbar-metrics'||keys.length!==2||!data.axes||typeof data.axes!=='object'||Array.isArray(data.axes)||Object.keys(data.axes).length!==2)return false
  return ['x','y'].every(axis=>{const m=data.axes[axis];return m===null||m&&typeof m==='object'&&!Array.isArray(m)&&Object.keys(m).length===3&&['client','total','position'].every(k=>finite(m[k]))&&m.client>0&&m.total>m.client&&m.position<=m.total-m.client+1})
}

export function installWorkbenchScrollbars(container, viewport, selected, scrollports, frameForCard) {
  const doc=container.ownerDocument,view=doc.defaultView,layer=doc.createElement('div'),parts=new Map(),observed=new Set()
  layer.dataset.workbenchScrollOverlay='';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:95;overflow:hidden'
  const fullscreen=container===doc.documentElement
  if(fullscreen)layer.style.position='fixed'
  container.append(layer)
  let frame=0,drag=null,destroyed=false,dirty=true,candidates=[],delegated=false,lastReport='',remoteFrame=null
  const remote=new Map()
  const schedule=()=>{if(!destroyed&&!frame)frame=view.requestAnimationFrame(paint)}
  const rescan=()=>{dirty=true;schedule()}
  const bind=()=>{const target=frameForCard?.();if(target!==remoteFrame){remoteFrame=target;remote.clear()}target?.contentWindow?.postMessage({type:'sherlock-workbench-scrollbar-bind'},'*')}
  const receive=event=>{
    const data=event.data
    if(fullscreen){
      if(event.source!==view.parent||view.parent===view)return
      if(isWorkbenchScrollbarMessage(data,'bind')){delegated=true;lastReport='';rescan()}
      else if(delegated&&selected()&&isWorkbenchScrollbarMessage(data,'scroll')){const p=parts.get(data.axis);if(p?.owner){p.owner[data.axis==='x'?'scrollLeft':'scrollTop']=Math.min(data.position,p.owner[data.axis==='x'?'scrollWidth':'scrollHeight']-p.owner[data.axis==='x'?'clientWidth':'clientHeight']);schedule()}}
      return
    }
    const target=frameForCard?.();if(!target||event.source!==target.contentWindow)return
    if(isWorkbenchScrollbarMessage(data,'ready')){bind();return}
    if(!isWorkbenchScrollbarMessage(data,'metrics'))return
    if(target!==remoteFrame){remoteFrame=target;remote.clear()}
    for(const axis of ['x','y']){
      const m=data.axes[axis];if(!m){remote.delete(axis);continue}
      const horizontal=axis==='x',size=horizontal?'clientWidth':'clientHeight',total=horizontal?'scrollWidth':'scrollHeight',at=horizontal?'scrollLeft':'scrollTop'
      let proxy=remote.get(axis)
      if(!proxy){proxy={};Object.defineProperty(proxy,'isConnected',{get:()=>target.isConnected&&target===frameForCard?.()});Object.defineProperty(proxy,at,{get:()=>proxy.position,set:value=>{proxy.position=Math.max(0,Math.min(proxy[total]-proxy[size],value));if(selected())target.contentWindow?.postMessage({type:'sherlock-workbench-scrollbar-scroll',axis,position:proxy.position},'*')}});remote.set(axis,proxy)}
      proxy[size]=m.client;proxy[total]=m.total;proxy.position=m.position
    }
    rescan()
  }
  view.addEventListener('message',receive)
  const resize=new view.ResizeObserver(rescan)
  resize.observe(container)
  const mutation=new view.MutationObserver(records=>{if(records.some(r=>!layer.contains(r.target)&&r.target!==layer))rescan()})
  mutation.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-selected','data-workbench-selected','data-sherlock-theme']})
  function paint(){
    frame=0;if(destroyed)return
    const active=selected();layer.hidden=!active||delegated;if(!active){dirty=true;return}
    const port=viewport();if(!port)return
    const base=fullscreen?{left:0,top:0}:container.getBoundingClientRect(),portBounds=port.getBoundingClientRect(),bounds=fullscreen?{left:0,top:0,right:view.innerWidth,bottom:view.innerHeight}:{left:base.left,top:portBounds.top,right:base.right,bottom:portBounds.bottom}
    const axes={x:null,y:null}
    if(dirty)candidates=[...new Set(scrollports())].filter(el=>el&&!layer.contains(el)&&!el.closest?.('[data-workbench-scroll-overlay]'))
    for(const el of observed)if(!candidates.includes(el)){resize.unobserve(el);observed.delete(el)}
    for(const el of candidates)if(!observed.has(el)){observed.add(el);resize.observe(el)}
    for(const axis of ['y','x']){
      const horizontal=axis==='x',size=horizontal?'clientWidth':'clientHeight',total=horizontal?'scrollWidth':'scrollHeight',at=horizontal?'scrollLeft':'scrollTop'
      const owner=remote.get(axis)||(!dirty&&parts.get(axis)?.owner?.isConnected?parts.get(axis).owner:candidates.filter(el=>{
        if(el[total]<=el[size]+1)return false
        const style=view.getComputedStyle(el),mode=horizontal?style.overflowX:style.overflowY,r=el===doc.scrollingElement?bounds:el.getBoundingClientRect()
        return el[total]>el[size]+1&&(el===doc.scrollingElement||/auto|scroll|overlay/.test(mode))&&r.right>bounds.left&&r.left<bounds.right&&r.bottom>bounds.top&&r.top<bounds.bottom
      }).sort((a,b)=>Number(b===port)-Number(a===port)||(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0])
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
      axes[axis]={client:owner[size],total:owner[total],position:owner[at]}
      const span=Math.max(0,(horizontal?bounds.right-bounds.left:bounds.bottom-bounds.top)-12),length=Math.min(span,Math.max(28,span*owner[size]/owner[total])),travel=span-length,offset=travel*owner[at]/Math.max(1,owner[total]-owner[size])
      part.length=length;part.travel=travel
      Object.assign(part.track.style,horizontal?{left:bounds.left-base.left+6+'px',top:bounds.bottom-base.top-10+'px',width:span+'px',height:'10px'}:{left:bounds.right-base.left-10+'px',top:bounds.top-base.top+6+'px',width:'10px',height:span+'px'})
      Object.assign(part.thumb.style,horizontal?{left:offset+'px',top:'3px',width:length+'px',height:'5px'}:{top:offset+'px',left:'3px',height:length+'px',width:'5px'})
      part.track.setAttribute('aria-valuemin','0');part.track.setAttribute('aria-valuemax',String(owner[total]-owner[size]));part.track.setAttribute('aria-valuenow',String(Math.round(owner[at])))
    }
    dirty=false
    if(fullscreen&&delegated){const encoded=JSON.stringify(axes);if(encoded!==lastReport){lastReport=encoded;view.parent.postMessage({type:'sherlock-workbench-scrollbar-metrics',axes},'*')}}
  }
  const scrollEvents=fullscreen?doc:container
  scrollEvents.addEventListener('scroll',schedule,true);view.addEventListener('resize',schedule)
  if(fullscreen&&view.parent!==view)view.parent.postMessage({type:'sherlock-workbench-scrollbar-ready'},'*')
  bind()
  schedule()
  return {refresh(){bind();rescan()},destroy(){destroyed=true;view.cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();scrollEvents.removeEventListener('scroll',schedule,true);view.removeEventListener('resize',schedule);view.removeEventListener('message',receive);layer.remove()}}
}
