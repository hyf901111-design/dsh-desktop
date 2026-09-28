// Functions are serialized into the existing page factory. React and the trusted
// content renderers are supplied by that factory, never by an iframe.
export function workbenchRefreshTooltip(lastSuccess,now=Date.now()) {
  const at=new Date(lastSuccess).getTime()
  if(!lastSuccess||!Number.isFinite(at))return {relative:'尚未刷新',absolute:'暂无成功刷新记录'}
  const seconds=Math.max(0,Math.floor((now-at)/1000))
  const relative=seconds<60?'Last refresh a few seconds ago':seconds<3600?'Last refresh '+Math.floor(seconds/60)+(Math.floor(seconds/60)===1?' minute':' minutes')+' ago':seconds<86400?'Last refresh '+Math.floor(seconds/3600)+' hours ago':'Last refresh '+Math.floor(seconds/86400)+' days ago'
  return {relative,absolute:new Date(at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true})}
}
export function WorkbenchIcon({name}) {
  const paths={refresh:'M12.8 5.6A6 6 0 1 0 14 9M12.8 2.4v3.3H9.5M8 4.3V8l2.4 1.6',ask:'M4 2.5h8a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2v-2A1.5 1.5 0 0 1 2 10V4a1.5 1.5 0 0 1 1.5-1.5M8 5v4M6 7h4',more:'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.1M2.5 8h.1M2.5 12h.1',close:'M4 4l8 8M12 4l-8 8',expand:'M6 2H2v4M10 14h4v-4M2 2l4 4M14 14l-4-4',duplicate:'M6 5V2h8v9h-3M2 5h8v9H2z',branch:'M4 2v8c0 2 2 2 4 2h4M4 6h5l3-4M3 2h2M11 2h2',summary:'M3 2h7l3 3v9H3zM9 2v4h4M5 8h6M5 11h6',plus:'M8 3v10M3 8h10',download:'M8 2v8M5 7l3 3 3-3M3 11v3h10v-3',link:'M6 10l4-4M5 9l-1 1a3 3 0 0 0 4 4l2-2M7 5l1-1a3 3 0 0 1 4 4l-2 2',voice:'M6 3a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0zM3.5 7v1a4.5 4.5 0 0 0 9 0V7M8 12.5V15M5 15h6'}
  return react_jsx_runtime.jsx('svg',{width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.35,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:react_jsx_runtime.jsx('path',{d:paths[name]||paths.more})})
}
export function WorkbenchChrome({node,sessionId,selected,readOnly,onAsk,onMore,onRemove,onExpand}) {
  const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(sessionId,node.id,fn),[sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(sessionId,node.id),[sessionId,node.id]))
  const [busy,setBusy]=react.useState(false),[error,setError]=react.useState(''),[now,setNow]=react.useState(Date.now()),[tip,setTip]=react.useState(null)
  const time=workbenchRefreshTooltip(binding?.lastSuccess||node.lastSuccessfulAt||(node.generationStatus==='completed'?node.generationCompletedAt:null),now)
  const refresh=async()=>{
    if(busy||readOnly)return
    setBusy(true);setError('')
    try{
      if(node.kind==='web-link'){
        const frame=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]')
        const reload=frame?.querySelector('.rScV5Q_webFrameControls button')
        if(reload)reload.click();else throw Error('网页尚未载入，请稍后刷新')
      }else if(binding){await window.dshDesktop.componentData.request(sessionId,{action:'refresh',nodeId:node.id});const rows=await window.dshDesktop.componentData.request(sessionId,{action:'list'});componentDataStatusStore.publish(sessionId,rows)}
      else openComponentData(sessionId,node)
      setNow(Date.now());window.dispatchEvent(new Event('sherlock:component-data-changed'))
    }catch(e){setError(e?.message||'刷新失败，保留上次数据')}finally{setBusy(false)}
  }
  const button=(name,label,onClick,extra={})=>react_jsx_runtime.jsx('button',{type:'button','aria-label':label,onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();onClick?.(e)},...extra,children:react_jsx_runtime.jsx(WorkbenchIcon,{name})})
  const hover=kind=>e=>{setNow(Date.now());const r=e.currentTarget.getBoundingClientRect();setTip({kind,left:Math.min(r.left,window.innerWidth-340),top:r.bottom+6})}
  return react_jsx_runtime.jsxs(react.Fragment,{children:[
    react_jsx_runtime.jsxs('header',{className:'ew-grid-header','data-workbench-drag-handle':node.id,children:[
      react_jsx_runtime.jsx('span',{className:'ew-grid-refresh',onMouseEnter:hover('refresh'),onMouseLeave:()=>setTip(null),onFocus:hover('refresh'),onBlur:()=>setTip(null),children:button('refresh','刷新组件',refresh,{disabled:readOnly||busy,'data-workbench-refresh':node.id,'data-busy':busy||binding?.status==='refreshing'||undefined})}),
      react_jsx_runtime.jsx('span',{className:'ew-grid-title',title:node.displayName||node.title||node.name,children:node.displayName||node.title||node.name||'组件'}),
      button('ask','针对组件提问',()=>onAsk(node),{'data-workbench-ask':node.id,onMouseEnter:hover('ask'),onMouseLeave:()=>setTip(null),onFocus:hover('ask'),onBlur:()=>setTip(null)}),
      button('more','组件更多操作',e=>onMore(node,e),{'data-workbench-more':node.id,'aria-haspopup':'menu'}),
      button('close','移除组件',()=>onRemove(node),{disabled:readOnly})
    ]}),
    react_jsx_runtime.jsx('button',{className:'ew-grid-resize',type:'button','aria-label':'调整组件大小','data-workbench-resize':node.id,disabled:readOnly,children:react_jsx_runtime.jsx(WorkbenchIcon,{name:'expand'})}),
    tip&&react_dom.createPortal(react_jsx_runtime.jsxs('span',{role:'tooltip',className:'ew-grid-tooltip',style:{display:'flex',left:Math.max(8,tip.left),top:tip.top},children:tip.kind==='refresh'?[react_jsx_runtime.jsx('span',{children:error||time.relative}),react_jsx_runtime.jsx('time',{children:time.absolute})]:[react_jsx_runtime.jsx('span',{children:'将组件加入右侧会话上下文，基于其内容进行问答'})]}),document.body)
  ]})
}
export function WorkbenchMenu({target,workspace,readOnly,onClose,onDerived,onLegacy}) {
  const [detail,setDetail]=react.useState(false),ref=react.useRef(null)
  react.useEffect(()=>{const outside=e=>{if(!ref.current?.contains(e.target)&&!e.target?.closest?.('[data-workbench-more]'))onClose()};const key=e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);const scroll=()=>onClose();window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true)}},[onClose])
  const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
  const choose=action=>{onClose();action()}
  const row=(icon,label,action,disabled=readOnly)=>jsxs('button',{type:'button',role:'menuitem',disabled,onClick:()=>choose(action),children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label})]},label)
  const card=()=>document.querySelector('[data-research-node-id="'+CSS.escape(target.node.id)+'"]')
  const style={left:Math.max(8,Math.min(window.innerWidth-214,target.left)),top:Math.max(8,Math.min(window.innerHeight-420,target.top))}
  return react_dom.createPortal(jsxs('div',{ref,className:'ew-grid-menu',role:'menu','aria-label':'组件更多操作',style,children:[
    row('duplicate','复制组件',()=>{workspace.copySelectedNodes().then(()=>workspace.pasteClipboardNodes(null)).catch(error=>console.error(error))}),
    row('expand','放大阅读',()=>card()?.querySelector('[data-research-container-expand]')?.click(),false),
    row('more','重命名',()=>onLegacy(target.node,target.event,'rename')),
    row('more','编辑与导出',()=>onLegacy(target.node,target.event),false),
    jsx('div',{className:'ew-grid-divider'}),
    jsxs('button',{type:'button',role:'menuitem','aria-label':'思维导图','aria-expanded':detail,disabled:readOnly,onClick:()=>setDetail(!detail),children:[jsx(WorkbenchIcon,{name:'branch'}),jsx('span',{children:'思维导图'}),jsx('span',{children:'›'})]}),
    detail&&jsx('div',{className:'ew-grid-submenu',children:RESEARCH_MIND_MAP_DETAIL_OPTIONS.map(option=>jsx('button',{type:'button',role:'menuitem',onClick:()=>choose(()=>onDerived('mind-map',option.value)),children:option.label},option.value))}),
    row('summary','总结提炼',()=>onDerived('summary')),
    row('plus','基于所选创建',()=>onDerived('create')),
    jsx('div',{className:'ew-grid-divider'}),
    row('more','数据源与自动更新',()=>openComponentData(target.sessionId,target.node),false),
    card()?.querySelector('[data-research-container-more]')&&row('more','组件设置',()=>{const trigger=card()?.querySelector('[data-research-container-more]');const anchor=card()?.querySelector('[data-workbench-more]');if(trigger&&anchor){trigger.getBoundingClientRect=()=>anchor.getBoundingClientRect();trigger.click()}},false),
    row('close','移除组件',()=>workspace.removeNodes([target.node.id]))
  ]}),document.body)
}
export function WorkbenchChromeLayer({rootRef,workspace,sessionId,snapshot,readOnly,onAsk,onDerived,onLegacy,voiceTarget}) {
  const [hosts,setHosts]=react.useState([]),[menu,setMenu]=react.useState(null)
  const close=react.useCallback(()=>setMenu(null),[])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const reconcile=()=>{const nodes=[...snapshot.files,...snapshot.artifacts],next=[]
    for(const node of nodes){const card=root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');if(!card)continue;card.toggleAttribute('data-research-voice-target',node.id===voiceTarget);let host=card.querySelector(':scope > .ew-grid-chrome-host');if(!host){host=document.createElement('div');host.className='ew-grid-chrome-host';card.appendChild(host)}next.push({node,host})}
    setHosts(previous=>previous.length===next.length&&next.every((n,i)=>previous[i].host===n.host&&previous[i].node===n.node)?previous:next)
    };reconcile();const observer=new MutationObserver(reconcile);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect()
  },[snapshot.files,snapshot.artifacts,rootRef,voiceTarget])
  return react_jsx_runtime.jsxs(react.Fragment,{children:[...hosts.map(({node,host})=>react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchChrome,{node,sessionId,readOnly,selected:snapshot.selection.selectedNodeIds.includes(node.id),onAsk,onMore:(n,e)=>{if(!workspace.getSnapshot().selection.selectedNodeIds.includes(n.id))workspace.updateSelection([n.id],'replace');setMenu({node:n,sessionId,event:{clientX:e.clientX,clientY:e.clientY},left:e.currentTarget.getBoundingClientRect().right-206,top:e.currentTarget.getBoundingClientRect().bottom+5})},onRemove:n=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"]');if(card?.open)card.querySelector('[data-research-container-expand]')?.click();else workspace.removeNodes([n.id])}}),host,node.id)),menu&&react_jsx_runtime.jsx(WorkbenchMenu,{target:menu,workspace,readOnly,onClose:close,onDerived,onLegacy})]})
}
export function installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly) {
  const grid=createResearchGrid(),view=root.ownerDocument.defaultView
  let op=null,frame=0,pending=null,autoFrame=0,lastPointer=null
  const preview=document.createElement('div');preview.className='ew-grid-placeholder';preview.hidden=true;root.appendChild(preview)
  const width=()=>Math.max(240,Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))
  const point=e=>{const r=root.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top+root.scrollTop}}
  const allowed=cells=>!cells.some(c=>{const old=op.before.find(n=>n.id===c.id),card=root.querySelector('[data-research-node-id="'+CSS.escape(c.id)+'"]');return card?.hasAttribute('data-research-geometry-blocked')&&old&&['x','y','w','h'].some(k=>old[k]!==c[k])})
  const paint=()=>{frame=0;if(!pending||!op)return;workspace.applyWorkbenchCells(pending,false);pending=null}
  const show=c=>{const n=grid.project([{id:c.id}], [c], width())[0];Object.assign(preview.style,{left:n.x-n.width/2+'px',top:n.y-n.height/2+'px',width:n.width+'px',height:n.height+'px'});preview.hidden=false}
  const update=e=>{
    if(!op)return
    const p=point(e),m=grid.metrics(width());let target
    if(op.kind==='draw')target=grid.draw(op.start,p,m)
    else{const c=op.cell,dx=(p.x-op.start.x)/m.step,dy=(p.y-op.start.y)/35;target=op.kind==='resize'?grid.bounded({...c,w:c.w+Math.round(dx),h:c.h+Math.round(dy)}):grid.bounded({...c,x:c.x+Math.round(dx),y:c.y+Math.round(dy)})}
    const proposed=grid.place(op.before,target,target.id).filter(c=>c.id!=='__draft__')
    if(!allowed(proposed))return
    op.target=target;show(target)
    pending=proposed
    if(!frame)frame=view.requestAnimationFrame(paint)
  }
  const finish=(commit,event)=>{
    if(!op||event?.pointerId!==undefined&&event.pointerId!==op.pointerId)return
    if(frame)view.cancelAnimationFrame(frame);frame=0
    if(autoFrame)view.cancelAnimationFrame(autoFrame);autoFrame=0;lastPointer=null
    if(commit&&event){update(event);if(frame)view.cancelAnimationFrame(frame);frame=0}
    if(commit&&!op.target)commit=false
    if(commit&&op.kind==='draw'){
      workspace.applyWorkbenchCells(op.before,false)
      const n=grid.project([{id:'__draft__'}],[op.target],width())[0]
      const node=workspace.createContainerDraft({x:n.x,y:n.y,width:n.width,height:n.height,sizeMode:'manual'})
      if(node)workspace.applyWorkbenchCells(grid.place(op.before,{...op.target,id:node.id},node.id),false)
      workspace.persist();selectTool('select')
    }else if(commit){if(pending)workspace.applyWorkbenchCells(pending,false);const compacted=grid.compact(workspace.getWorkbenchCells());if(allowed(compacted))workspace.applyWorkbenchCells(compacted,false);workspace.persist()}
    else{workspace.applyWorkbenchCells(op.before,false);workspace.cancelPointerGeometry([...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts])}
    const pointerId=op.pointerId;op=null;
    if(root.hasPointerCapture?.(pointerId))root.releasePointerCapture(pointerId)
    pending=null;preview.hidden=true;root.removeAttribute('data-grid-operation');root.querySelectorAll('[data-grid-active]').forEach(e=>e.removeAttribute('data-grid-active'))
  }
  const autoScroll=()=>{
    autoFrame=0;if(!op||!lastPointer)return
    const bounds=root.getBoundingClientRect(),y=lastPointer.clientY-bounds.top
    const delta=y<48?-Math.ceil((48-y)/4):y>bounds.height-64?Math.ceil((y-bounds.height+64)/4):0
    if(delta){const before=root.scrollTop;root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),before+delta));if(root.scrollTop!==before){update(lastPointer);autoFrame=view.requestAnimationFrame(autoScroll)}}
  }
  const down=e=>{
    if(e.button!==0||e.target?.closest?.('[data-research-global-toolbar],[role=menu],[role=dialog],.ew-grid-menu'))return
    const handle=e.target?.closest?.('[data-workbench-drag-handle]'),resize=e.target?.closest?.('[data-workbench-resize]'),card=e.target?.closest?.('[data-research-node-id]')
    const draw=toolRef.current==='component'
    if(readOnly||!draw&&(!handle&&!resize)||e.target?.closest?.('input,textarea,button,a,select,[contenteditable=true]')&&!resize)return
    if(card?.hasAttribute('data-research-geometry-blocked')||card?.hasAttribute('open'))return
    const current=workspace.getSnapshot(),before=workspace.getWorkbenchCells(),id=(resize||handle)?.getAttribute(resize?'data-workbench-resize':'data-workbench-drag-handle')
    if(!draw&&!before.some(c=>c.id===id))return
    e.preventDefault();e.stopImmediatePropagation();root.focus({preventScroll:true});root.setPointerCapture?.(e.pointerId)
    if(id&&!current.selection.selectedNodeIds.includes(id))workspace.updateSelection([id],'replace')
    op={kind:draw?'draw':resize?'resize':'move',pointerId:e.pointerId,start:point(e),before,cell:before.find(c=>c.id===id),geometry:[...current.files,...current.artifacts]}
    if(!draw&&!op.cell){op=null;return}
    root.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e
    update(e);autoFrame=view.requestAnimationFrame(autoScroll)
  }
  const move=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();lastPointer=e;update(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)}
  const up=e=>{if(!op)return;e.preventDefault();e.stopImmediatePropagation();finish(true,e)}
  const cancel=e=>{if(op){e?.stopImmediatePropagation?.();finish(false,e)}}
  const key=e=>{if(op&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}}
  root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);root.addEventListener('lostpointercapture',cancel,true);view.addEventListener('blur',cancel);view.addEventListener('keydown',key,true)
  return()=>{finish(false);preview.remove();root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('lostpointercapture',cancel,true);view.removeEventListener('blur',cancel);view.removeEventListener('keydown',key,true)}
}
export function WorkbenchToolbar({rootRef,sessionId,availableWidth,children,...props}) {
  const [bounds,setBounds]=react.useState(null)
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const measure=()=>{const r=root.getBoundingClientRect(),next={left:r.left+Math.min(r.width,availableWidth||r.width)/2,bottom:Math.max(20,window.innerHeight-r.bottom+20)};setBounds(previous=>previous&&previous.left===next.left&&previous.bottom===next.bottom?previous:next)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root);if(root.parentElement)observer.observe(root.parentElement)
    window.addEventListener('resize',measure)
    return()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[rootRef,availableWidth])
  return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':'','data-ework-toolbar-owner':sessionId,style:{position:'fixed',left:bounds?.left||0,bottom:bounds?.bottom||20,top:'auto',visibility:bounds?'visible':'hidden'},children}),document.body)
}
export function useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef,selectTool,readOnly}) {
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    root.setAttribute('data-ework-grid','')
    const measure=()=>{const s=workspace.getSnapshot(),width=Math.max(240,Math.min(root.clientWidth||s.canvasSize.width||800,s.canvasSize.availableWidth||Infinity));workspace.setWorkbenchWidth(width)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root)
    const scroll=()=>{const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})}
    root.addEventListener('scroll',scroll,{passive:true})
    return()=>{observer.disconnect();root.removeEventListener('scroll',scroll);root.removeAttribute('data-ework-grid')}
  },[workspace,sessionId,readOnly])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const nodes=[...snapshot.files,...snapshot.artifacts],bottom=Math.max(12,...nodes.map(n=>n.y+n.height/2))+100
    const layer=root.querySelector('[data-research-content-layer]');if(layer){layer.style.height=bottom+'px';layer.style.width=(snapshot.canvasSize.availableWidth||root.clientWidth)+'px'}
    const viewport=snapshot.viewport;if(Math.abs(root.scrollTop+viewport.y)>.5&&!root.hasAttribute('data-grid-operation'))root.scrollTop=Math.max(0,-viewport.y)
  },[snapshot])
  react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly)},[workspace,sessionId,readOnly])
}
