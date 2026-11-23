// Shared by native card bodies and opaque HTML sandboxes. Native scrollbars stay
// hidden. Tables reserve a gutter below the rows for the horizontal control.
export function isWorkbenchScrollbarMessage(data, kind) {
  if(!data||typeof data!=='object'||Array.isArray(data))return false
  const keys=Object.keys(data),finite=n=>Number.isFinite(n)&&n>=0&&n<=1e7
  if(kind==='ready')return data.type==='sherlock-workbench-scrollbar-ready'&&keys.length===1
  if(kind==='bind')return data.type==='sherlock-workbench-scrollbar-bind'&&keys.length===1
  if(kind==='scroll')return data.type==='sherlock-workbench-scrollbar-scroll'&&keys.length===3&&['x','y'].includes(data.axis)&&finite(data.position)
  if(kind!=='metrics'||data.type!=='sherlock-workbench-scrollbar-metrics'||keys.length!==2||!data.axes||typeof data.axes!=='object'||Array.isArray(data.axes)||Object.keys(data.axes).length!==2)return false
  return ['x','y'].every(axis=>{
    const m=data.axes[axis]
    if(m===null)return true
    if(!m||typeof m!=='object'||Array.isArray(m)||!['client','total','position'].every(k=>finite(m[k]))||m.client<=0||m.total<=m.client||m.position>m.total-m.client+1)return false
    if(!Object.hasOwn(m,'tableBounds'))return Object.keys(m).length===3
    const bounds=m.tableBounds
    return axis==='x'&&Object.keys(m).length===4&&bounds&&typeof bounds==='object'&&!Array.isArray(bounds)&&Object.keys(bounds).length===4
      &&['left','top','right','bottom'].every(k=>finite(bounds[k]))&&bounds.right>bounds.left&&bounds.bottom>bounds.top
  })
}

export function installWorkbenchScrollbars(container, viewport, selected, scrollports, frameForCard) {
  const doc=container.ownerDocument,view=doc.defaultView,layer=doc.createElement('div'),parts=new Map(),observed=new Set()
  layer.dataset.workbenchScrollOverlay='';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:95;overflow:hidden'
  const fullscreen=container===doc.documentElement
  if(fullscreen)layer.style.position='fixed'
  container.append(layer)
  let frame=0,drag=null,destroyed=false,dirty=true,candidates=[],delegated=false,lastReport='',remoteFrame=null
  const remote=new Map(), tableGutters=new Map(), lastPositions=new WeakMap(), scrolledOwners=new Map()
  const gutterHeight=12, trackGap=2
  const clearOwner=part=>{
    if(!part)return
    part.owner=null;part.track.hidden=true
    if(drag?.part===part)drag=null
  }
  const reserveTableGutter=element=>{
    if(tableGutters.has(element))return
    const margin=parseFloat(view.getComputedStyle(element).marginBottom)||0
    if(margin>=gutterHeight)return
    const old=element.style.getPropertyValue('margin-bottom')
    const priority=element.style.getPropertyPriority('margin-bottom')
    element.style.setProperty('margin-bottom',gutterHeight+'px','important')
    tableGutters.set(element,()=>{
      if(element.style.getPropertyValue('margin-bottom')===gutterHeight+'px'&&element.style.getPropertyPriority('margin-bottom')==='important')
        element.style.setProperty('margin-bottom',old,priority)
    })
  }
  const visibleTableGutter=(rect,outer,scale)=>{
    if(rect.bottom+gutterHeight*scale>outer.bottom+1)return null
    return clip(rect,outer)
  }
  const isTablePort=element=>element.matches?.('table,.fund-native-table-wrap,.odyssey-native-table-grid,.rScV5Q_containerTableScroll,.market-table-wrap,.dv-table-wrap,.hws-table-scroll,:has(> table)')
  const clip=(inner,outer)=>{
    const box={left:Math.max(inner.left,outer.left),top:Math.max(inner.top,outer.top),right:Math.min(inner.right,outer.right),bottom:Math.min(inner.bottom,outer.bottom)}
    return box.right>box.left&&box.bottom>box.top?box:null
  }
  const report=axes=>{
    const encoded=JSON.stringify(axes)
    if(encoded===lastReport)return
    lastReport=encoded
    view.parent.postMessage({type:'sherlock-workbench-scrollbar-metrics',axes},'*')
  }
  const schedule=()=>{if(!destroyed&&!frame)frame=view.requestAnimationFrame(paint)}
  const rescan=()=>{dirty=true;schedule()}
  const onScroll=event=>{
    const element=event.target===doc?doc.scrollingElement:event.target
    if(!element||!container.contains(element)||layer.contains(element))return
    const previous=lastPositions.get(element),x=element.scrollLeft,y=element.scrollTop
    if(x!==(previous?.x??0))scrolledOwners.set('x',element)
    if(y!==(previous?.y??0))scrolledOwners.set('y',element)
    lastPositions.set(element,{x,y})
    if(!observed.has(element))dirty=true
    schedule()
  }
  const bind=(ready=false)=>{
    const target=frameForCard?.()
    if(target===remoteFrame&&!ready)return
    remoteFrame=target;remote.clear()
    target?.contentWindow?.postMessage({type:'sherlock-workbench-scrollbar-bind'},'*')
  }
  const receive=event=>{
    const data=event.data
    if(fullscreen){
      if(event.source!==view.parent||view.parent===view)return
      if(isWorkbenchScrollbarMessage(data,'bind')){delegated=true;lastReport='';rescan()}
      else if(delegated&&selected()&&isWorkbenchScrollbarMessage(data,'scroll')){const p=parts.get(data.axis);if(p?.owner){p.owner[data.axis==='x'?'scrollLeft':'scrollTop']=Math.min(data.position,p.owner[data.axis==='x'?'scrollWidth':'scrollHeight']-p.owner[data.axis==='x'?'clientWidth':'clientHeight']);schedule()}}
      return
    }
    const target=frameForCard?.();if(!target||event.source!==target.contentWindow)return
    if(isWorkbenchScrollbarMessage(data,'ready')){bind(true);rescan();return}
    if(!isWorkbenchScrollbarMessage(data,'metrics'))return
    if(target!==remoteFrame){remoteFrame=target;remote.clear()}
    for(const axis of ['x','y']){
      const m=data.axes[axis];if(!m){remote.delete(axis);continue}
      const horizontal=axis==='x',size=horizontal?'clientWidth':'clientHeight',total=horizontal?'scrollWidth':'scrollHeight',at=horizontal?'scrollLeft':'scrollTop'
      let proxy=remote.get(axis)
      if(!proxy){proxy={};Object.defineProperty(proxy,'isConnected',{get:()=>target.isConnected&&target===frameForCard?.()});Object.defineProperty(proxy,at,{get:()=>proxy.position,set:value=>{proxy.position=Math.max(0,Math.min(proxy[total]-proxy[size],value));if(selected())target.contentWindow?.postMessage({type:'sherlock-workbench-scrollbar-scroll',axis,position:proxy.position},'*')}});remote.set(axis,proxy)}
      if(proxy.position!==undefined&&proxy.position!==m.position)scrolledOwners.delete(axis)
      proxy[size]=m.client;proxy[total]=m.total;proxy.position=m.position;proxy.tableBounds=m.tableBounds
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
    const active=selected(),port=active&&viewport();layer.hidden=!port||delegated
    if(!port){dirty=true;for(const part of parts.values())clearOwner(part);if(delegated)report({x:null,y:null});return}
    const base=fullscreen?{left:0,top:0}:container.getBoundingClientRect(),portBounds=port.getBoundingClientRect(),bounds=fullscreen?{left:0,top:0,right:view.innerWidth,bottom:view.innerHeight}:{left:base.left,top:portBounds.top,right:base.right,bottom:portBounds.bottom}
    const axes={x:null,y:null}
    const scaleX=fullscreen?1:base.width/(container.offsetWidth||1)||1
    const scaleY=fullscreen?1:base.height/(container.offsetHeight||1)||1
    for(const [element,restore] of tableGutters)if(!element.isConnected){restore();tableGutters.delete(element)}
    if(dirty){
      const next=new Set([...scrollports(),...scrolledOwners.values()].filter(el=>el?.isConnected&&container.contains(el)&&!el.closest?.('[data-workbench-scroll-overlay]')))
      for(const el of observed)if(!next.has(el)){resize.unobserve(el);observed.delete(el)}
      for(const el of next)if(!observed.has(el)){
        observed.add(el);resize.observe(el)
        if(!lastPositions.has(el))lastPositions.set(el,{x:el.scrollLeft,y:el.scrollTop})
      }
      candidates=[...next]
    }
    for(const axis of ['y','x']){
      const horizontal=axis==='x',size=horizontal?'clientWidth':'clientHeight',total=horizontal?'scrollWidth':'scrollHeight',at=horizontal?'scrollLeft':'scrollTop'
      const usable=el=>{
        if(el?.nodeType!==1||!el.isConnected||!container.contains(el)||el[size]<=0||el[total]<=el[size]+1)return false
        const style=view.getComputedStyle(el),mode=horizontal?style.overflowX:style.overflowY,r=el===doc.scrollingElement?bounds:el.getBoundingClientRect()
        return (el===doc.scrollingElement||/auto|scroll|overlay/.test(mode))&&r.right>bounds.left&&r.left<bounds.right&&r.bottom>bounds.top&&r.top<bounds.bottom
      }
      const last=scrolledOwners.get(axis)
      if(last&&!usable(last))scrolledOwners.delete(axis)
      if(remote.has(axis)&&!remote.get(axis).isConnected)remote.delete(axis)
      let part=parts.get(axis)
      const current=part?.owner
      const held=drag?.part===part&&current&&(current===remote.get(axis)||usable(current))
      let owner=held?current:scrolledOwners.get(axis)||remote.get(axis)
      if(!owner&&!dirty&&usable(current))owner=current
      if(!owner)owner=candidates.filter(usable).sort((a,b)=>(horizontal?Number(Boolean(isTablePort(b)))-Number(Boolean(isTablePort(a))):0)||Number(b===port)-Number(a===port)||(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0]
      if(drag&&drag.part===part&&owner!==current)drag=null
      if(!owner){clearOwner(part);continue}
      if(!part){
        const track=doc.createElement('div'),thumb=doc.createElement('span')
        track.dataset.workbenchScrollbar=axis;track.setAttribute('data-research-preview-interactive','');track.setAttribute('role','scrollbar');track.setAttribute('aria-label',horizontal?'水平滚动':'垂直滚动');track.setAttribute('aria-orientation',horizontal?'horizontal':'vertical');track.tabIndex=0
        track.style.cssText='position:absolute;pointer-events:auto;touch-action:none;background:transparent;outline:none';thumb.style.cssText='display:block;position:absolute;border-radius:4px;pointer-events:none'
        track.append(thumb);layer.append(track);part={track,thumb};parts.set(axis,part)
        track.addEventListener('pointerdown',event=>{
          if(!part.owner||part.track.hidden||!selected())return
          event.preventDefault();event.stopPropagation();track.setPointerCapture?.(event.pointerId)
          const current=part.owner,r=track.getBoundingClientRect(),position=(horizontal?event.clientX-r.left:event.clientY-r.top)/part.scale,offset=(current[at]/Math.max(1,current[total]-current[size]))*part.travel
          drag={part,pointer:event.pointerId,origin:horizontal?event.clientX:event.clientY,offset:position>=offset&&position<=offset+part.length?offset:position-part.length/2}
          setOffset(drag.offset)
        })
        const setOffset=value=>{const p=parts.get(axis);p.owner[at]=Math.max(0,Math.min(p.travel,value))/Math.max(1,p.travel)*(p.owner[total]-p.owner[size]);schedule()}
        track.addEventListener('pointermove',event=>{if(drag?.part===part&&drag.pointer===event.pointerId){event.preventDefault();event.stopPropagation();setOffset(drag.offset+((horizontal?event.clientX:event.clientY)-drag.origin)/part.scale)}})
        for(const type of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(type,()=>{if(drag?.part===part){drag=null;schedule()}})
        track.addEventListener('keydown',event=>{const direction=['ArrowDown','ArrowRight','PageDown','End'].includes(event.key)?1:['ArrowUp','ArrowLeft','PageUp','Home'].includes(event.key)?-1:0;if(!direction||!part.owner||part.track.hidden||!selected())return;event.preventDefault();event.stopPropagation();part.owner[at]=event.key==='Home'?0:event.key==='End'?part.owner[total]:part.owner[at]+direction*(event.key.startsWith('Page')?part.owner[size]:40);schedule()})
      }
      part.owner=owner;part.track.hidden=false
      // Use the table viewport, including for a table inside an opaque iframe.
      // The sandbox reports its clipped viewport in iframe CSS pixels.
      const isRemote=owner===remote.get(axis),tablePort=horizontal&&(isRemote?Boolean(owner.tableBounds):isTablePort(owner))
      let tableBounds=null
      if(tablePort&&isRemote){
        const rect=remoteFrame.getBoundingClientRect(),local=owner.tableBounds
        const sx=rect.width/(remoteFrame.clientWidth||1),sy=rect.height/(remoteFrame.clientHeight||1)
        tableBounds=visibleTableGutter({left:rect.left+local.left*sx,top:rect.top+local.top*sy,right:rect.left+local.right*sx,bottom:rect.top+local.bottom*sy},bounds,scaleY)
      }else if(tablePort){
        reserveTableGutter(owner)
        const outer=owner===port&&!fullscreen
          ? {...bounds,bottom:Math.min(base.bottom,owner.getBoundingClientRect().bottom+gutterHeight*scaleY)}
          : bounds
        tableBounds=visibleTableGutter(owner.getBoundingClientRect(),outer,scaleY)
      }
      const client=owner[size],extent=owner[total],range=extent-client
      if(client<=0||range<=1||tablePort&&!tableBounds){clearOwner(part);continue}
      const position=Math.max(0,Math.min(range,owner[at]))
      axes[axis]={client,total:extent,position,...(fullscreen&&tableBounds?{tableBounds}:{})}
      const trackBounds=tableBounds||bounds
      const scale=horizontal?scaleX:scaleY
      const span=Math.max(0,(horizontal?trackBounds.right-trackBounds.left:trackBounds.bottom-trackBounds.top)/scale-12)
      const length=Math.min(span,Math.max(28,span*client/extent)),travel=span-length,offset=travel*position/range
      part.length=length;part.travel=travel;part.scale=scale
      part.track.toggleAttribute('data-workbench-table-scrollbar',Boolean(tablePort))
      part.thumb.style.background=tablePort?'var(--grid-muted,var(--sherlock-control-muted,#777781))':'var(--grid-scroll-thumb,var(--sherlock-scroll-thumb,var(--ework-scroll-thumb,#0000001a)))'
      Object.assign(part.track.style,horizontal?{left:(trackBounds.left-base.left)/scaleX+6+'px',top:(trackBounds.bottom-base.top)/scaleY+(tablePort?trackGap:-10)+'px',width:span+'px',height:'10px'}:{left:(bounds.right-base.left)/scaleX-10+'px',top:(bounds.top-base.top)/scaleY+6+'px',width:'10px',height:span+'px'})
      Object.assign(part.thumb.style,horizontal?{left:offset+'px',top:'3px',width:length+'px',height:'5px'}:{top:offset+'px',left:'3px',height:length+'px',width:'5px'})
      part.track.setAttribute('aria-valuemin','0');part.track.setAttribute('aria-valuemax',String(range));part.track.setAttribute('aria-valuenow',String(Math.round(position)))
    }
    dirty=false
    if(delegated)report(axes)
  }
  const scrollEvents=fullscreen?doc:container
  scrollEvents.addEventListener('scroll',onScroll,true);view.addEventListener('resize',schedule)
  if(fullscreen&&view.parent!==view)view.parent.postMessage({type:'sherlock-workbench-scrollbar-ready'},'*')
  bind()
  schedule()
  return {refresh(){bind();rescan()},destroy(){destroyed=true;view.cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();scrollEvents.removeEventListener('scroll',onScroll,true);view.removeEventListener('resize',schedule);view.removeEventListener('message',receive);for(const restore of tableGutters.values())restore();tableGutters.clear();layer.remove()}}
}
