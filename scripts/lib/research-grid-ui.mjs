// Functions are serialized into the existing page factory. React and the trusted
// content renderers are supplied by that factory, never by an iframe.
export function workbenchRefreshTooltip(lastSuccess,now=Date.now()) {
  const at=new Date(lastSuccess).getTime()
  if(!lastSuccess||!Number.isFinite(at))return {relative:'尚未刷新',absolute:'暂无成功刷新记录'}
  const seconds=Math.max(0,Math.floor((now-at)/1000))
  const relative='上次刷新：'+(seconds<60?'刚刚':seconds<3600?Math.floor(seconds/60)+' 分钟前':seconds<86400?Math.floor(seconds/3600)+' 小时前':Math.floor(seconds/86400)+' 天前')
  return {relative,absolute:new Date(at).toLocaleString('zh-CN',{month:'long',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
}
export function workbenchGridPattern(width) {
  const m=createResearchGrid().metrics(width)
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+m.step+'" height="'+m.step+'" viewBox="0 0 '+m.step+' '+m.step+'"><rect x="0.5" y="0.5" width="'+(m.cell-1)+'" height="'+(m.cell-1)+'" fill="none" stroke="#8a9099" stroke-opacity="0.24"/></svg>'
  return 'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")'
}
export function WorkbenchIcon({name}) {
  const paths={refresh:'M12.8 5.6A6 6 0 1 0 14 9M12.8 2.4v3.3H9.5M8 4.3V8l2.4 1.6',ask:'M4 2.5h8a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2v-2A1.5 1.5 0 0 1 2 10V4a1.5 1.5 0 0 1 1.5-1.5M8 5v4M6 7h4',more:'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.1M2.5 8h.1M2.5 12h.1',close:'M4 4l8 8M12 4l-8 8',expand:'M6 2H2v4M10 14h4v-4M2 2l4 4M14 14l-4-4',duplicate:'M6 5V2h8v9h-3M2 5h8v9H2z',branch:'M4 2v8c0 2 2 2 4 2h4M4 6h5l3-4M3 2h2M11 2h2',summary:'M3 2h7l3 3v9H3zM9 2v4h4M5 8h6M5 11h6',plus:'M8 3v10M3 8h10',download:'M8 2v8M5 7l3 3 3-3M3 11v3h10v-3',link:'M6 10l4-4M5 9l-1 1a3 3 0 0 0 4 4l2-2M7 5l1-1a3 3 0 0 1 4 4l-2 2',voice:'M6 3a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0zM3.5 7v1a4.5 4.5 0 0 0 9 0V7M8 12.5V15M5 15h6'}
  Object.assign(paths,{schedule:'M5 2v3M11 2v3M2 6h12M3 3h10v11H3zM6 9h1M9 9h1M6 12h1',rename:'M3 11l7.8-7.8 2 2L5 13l-3 1zM9.5 4.5l2 2',edit:'M3 2h6l3 3v3M9 2v4h4M3 2v12h5M9 12l3.5-3.5 1.5 1.5-3.5 3.5-2 .5z',data:'M13 4c0 1.1-2.2 2-5 2S3 5.1 3 4s2.2-2 5-2 5 .9 5 2zM3 4v7c0 1.1 2.2 2 5 2M13 4v3M3 7.5c0 1.1 2.2 2 5 2M11 10v2l1.5 1M14.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',settings:'M2 4h3M8 4h6M2 8h7M12 8h2M2 12h2M7 12h7M5 2v4h3V2zM9 6v4h3V6zM4 10v4h3v-4z',remove:'M2.5 4h11M6 4V2h4v2M4 4l.7 10h6.6L12 4M6.5 7v4M9.5 7v4'})
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
    selected&&react_jsx_runtime.jsx('span',{className:'ew-grid-selection-ring','aria-hidden':true}),
    tip&&react_dom.createPortal(react_jsx_runtime.jsxs('span',{role:'tooltip',className:'ew-grid-tooltip',style:{display:'flex',left:Math.max(8,tip.left),top:tip.top},children:tip.kind==='refresh'?[react_jsx_runtime.jsx('span',{children:error||time.relative}),react_jsx_runtime.jsx('time',{children:time.absolute})]:[react_jsx_runtime.jsx('span',{children:'将组件加入右侧会话上下文，基于其内容进行问答'})]}),document.body)
  ]})
}
// The original React menu owns editing and refresh permissions. Register its
// current callbacks on the trusted host trigger; never clone or move React DOM.
export function useWorkbenchSettings({triggerRef,sessionId,node,disabled,editingPrompt,onEdit,onRefresh,onSetRefresh,onProvenance,onFrameAction,onOpenBrowser}) {
  react.useLayoutEffect(()=>{
    const trigger=triggerRef.current;if(!trigger)return
    const shared=sherlockShared(sessionId),entry=(icon,label,run,blocked=false,writes=true)=>({icon,label,run,disabled:!!blocked,writes})
    const actions=node.kind==='web-link'?[
      entry('rename','修改名称',()=>onFrameAction?.(node,'rename')),
      ...(researchCanvasArtifactContentEditable(node)?[entry('edit','编辑内容',()=>onFrameAction?.(node,'edit'))]:[]),
      entry('refresh','刷新',()=>onRefresh?.(node)),
      entry('link','浏览器打开',()=>onOpenBrowser?onOpenBrowser():window.open(node.url,'_blank','noopener,noreferrer'),false,false)
    ]:node.creationMode==='selection'?[
      entry('branch','查看创建来源',onProvenance,false,false)
    ]:[
      entry('edit','编辑需求',onEdit,disabled),
      entry('refresh',shared?'重新生成':'刷新数据',()=>shared?onRefresh?.(node,node.containerPrompt):openComponentData(sessionId,node,'refresh'),disabled),
      entry('schedule','设定定时任务',()=>openComponentSchedule(sessionId,node),editingPrompt),
      shared?entry('data',node.refreshMinutes?'关闭旧自动刷新':'共享组件暂不支持数据自动更新',()=>onSetRefresh?.(node,0),editingPrompt||!node.refreshMinutes):entry('data','数据源与自动更新',()=>openComponentData(sessionId,node))
    ]
    trigger.__eworkWorkbenchSettings=actions
    return()=>{if(trigger.__eworkWorkbenchSettings===actions)delete trigger.__eworkWorkbenchSettings}
  },[triggerRef,sessionId,node,disabled,editingPrompt,onEdit,onRefresh,onSetRefresh,onProvenance,onFrameAction,onOpenBrowser])
}
export function WorkbenchMenu({target,workspace,readOnly,onClose,onDerived,onLegacy}) {
  const [detail,setDetail]=react.useState(null),ref=react.useRef(null),subRef=react.useRef(null),mindRef=react.useRef(null),settingsRef=react.useRef(null),leaveTimer=react.useRef(null)
  const cancelLeave=()=>{clearTimeout(leaveTimer.current);leaveTimer.current=null}
  const leave=()=>{cancelLeave();leaveTimer.current=setTimeout(()=>setDetail(null),200)}
  const card=()=>document.querySelector('[data-research-node-id="'+CSS.escape(target.node.id)+'"]')
  const settings=card()?.querySelector('[data-research-container-more]')?.__eworkWorkbenchSettings
  const openDetail=(kind,focus=false)=>{
    if(kind==='mind'&&readOnly)return
    cancelLeave();const menu=ref.current?.getBoundingClientRect(),row=(kind==='mind'?mindRef:settingsRef).current?.getBoundingClientRect();if(!menu||!row)return
    const width=kind==='mind'?116:248,height=kind==='mind'?117:(settings?.length||4)*33+14,left=menu.right+4+width<=window.innerWidth-8?menu.right+4:Math.max(8,menu.left-width-4)
    setDetail({kind,left,top:Math.max(8,Math.min(row.top,window.innerHeight-height-8)),width})
    if(focus)window.requestAnimationFrame(()=>subRef.current?.querySelector('button:not(:disabled)')?.focus())
  }
  react.useEffect(()=>{const outside=e=>{if(!ref.current?.contains(e.target)&&!subRef.current?.contains(e.target)&&!e.target?.closest?.('[data-workbench-more]'))onClose()};const key=e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);const scroll=e=>{if(!ref.current?.contains(e?.target)&&!subRef.current?.contains(e?.target))onClose()};window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);return()=>{cancelLeave();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true)}},[onClose])
  const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
  const choose=action=>{onClose();action?.()}
  const row=(icon,label,action,disabled=readOnly)=>jsxs('button',{type:'button',role:'menuitem',disabled,onMouseEnter:leave,onClick:()=>choose(action),children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label})]},label)
  const flyout=(kind,icon,label,trigger,disabled=false)=>jsxs('button',{ref:trigger,type:'button',role:'menuitem','aria-label':label,'aria-haspopup':'menu','aria-expanded':detail?.kind===kind,disabled,onMouseEnter:()=>openDetail(kind),onClick:()=>openDetail(kind),onKeyDown:e=>{if(e.key==='ArrowRight'){e.preventDefault();openDetail(kind,true)}},children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label}),jsx('span',{children:'›'})]})
  const style={left:Math.max(8,Math.min(window.innerWidth-214,target.left)),top:Math.max(8,Math.min(window.innerHeight-420,target.top))}
  return react_dom.createPortal(jsxs(react.Fragment,{children:[jsxs('div',{ref,className:'ew-grid-menu',role:'menu','aria-label':'组件更多操作',style,onMouseLeave:leave,children:[
    row('duplicate','复制组件',()=>{workspace.copySelectedNodes().then(()=>workspace.pasteClipboardNodes(null)).catch(error=>console.error(error))}),
    row('expand','放大阅读',()=>card()?.querySelector('[data-research-container-expand]')?.click(),false),
    row('rename','重命名',()=>onLegacy(target.node,target.event,'rename')),
    row('edit','编辑与导出',()=>onLegacy(target.node,target.event),false),
    jsx('div',{className:'ew-grid-divider'}),
    flyout('mind','branch','思维导图',mindRef,readOnly),
    row('summary','总结提炼',()=>onDerived('summary')),
    row('plus','基于所选创建',()=>onDerived('create')),
    jsx('div',{className:'ew-grid-divider'}),
    row('data','数据源与自动更新',()=>openComponentData(target.sessionId,target.node),false),
    settings?.length>0&&flyout('settings','settings','组件设置',settingsRef),
    row('remove','移除组件',()=>workspace.removeNodes([target.node.id]))
  ]}),detail&&jsx('div',{ref:subRef,className:'ew-grid-menu ew-grid-submenu',role:'menu','aria-label':detail.kind==='mind'?'思维导图详细度':'组件设置',style:{left:detail.left,top:detail.top,width:detail.width},onMouseEnter:cancelLeave,onMouseLeave:leave,onKeyDown:e=>{if(e.key==='ArrowLeft'){e.preventDefault();cancelLeave();setDetail(null);(detail.kind==='mind'?mindRef:settingsRef).current?.focus()}},children:detail.kind==='mind'?RESEARCH_MIND_MAP_DETAIL_OPTIONS.map(option=>jsx('button',{type:'button',role:'menuitem',onClick:()=>choose(()=>onDerived('mind-map',option.value)),children:option.label},option.value)):settings?.map(action=>jsxs('button',{type:'button',role:'menuitem',disabled:readOnly&&action.writes||action.disabled,onClick:()=>choose(()=>{if((!readOnly||!action.writes)&&!action.disabled)action.run?.()}),children:[jsx(WorkbenchIcon,{name:action.icon}),jsx('span',{children:action.label})]},action.label))})]}),document.body)
}

export function handleWorkbenchMultiSelect(root,workspace,event) {
  if(event.button!==0||!event.shiftKey&&!event.metaKey||event.target?.closest?.('input,textarea,[contenteditable=true]'))return false
  const card=event.target?.closest?.('[data-research-node-id]');if(!card||card.hasAttribute('open'))return false
  event.preventDefault();event.stopImmediatePropagation();root.ownerDocument.defaultView.getSelection()?.removeAllRanges()
  workspace.updateSelection([card.getAttribute('data-research-node-id')],'toggle');return true
}
export function WorkbenchChromeLayer({rootRef,workspace,sessionId,snapshot,readOnly,onAsk,onDerived,onLegacy,voiceTarget}) {
  const [hosts,setHosts]=react.useState([]),[menu,setMenu]=react.useState(null)
  const close=react.useCallback(()=>setMenu(null),[])
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const reconcile=()=>{const nodes=[...snapshot.files,...snapshot.artifacts],next=[]
    for(const node of nodes){const card=root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');if(!card)continue;card.toggleAttribute('data-research-voice-target',node.id===voiceTarget);let host=card.querySelector(':scope > .ew-grid-chrome-host');if(!host){host=document.createElement('div');host.className='ew-grid-chrome-host';card.appendChild(host)}for(const frame of card.querySelectorAll('iframe[data-research-html-artifact]'))frame.contentWindow?.postMessage({type:'sherlock-workbench-selection',selected:card.hasAttribute('open')||snapshot.selection.selectedNodeIds.includes(node.id)},'*');next.push({node,host,expanded:card.hasAttribute('open'),blocked:card.hasAttribute('data-research-geometry-blocked')})}
    setHosts(previous=>previous.length===next.length&&next.every((n,i)=>previous[i].host===n.host&&previous[i].node===n.node&&previous[i].expanded===n.expanded&&previous[i].blocked===n.blocked)?previous:next)
    };reconcile();root.addEventListener('load',reconcile,true);const observer=new MutationObserver(reconcile);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['open','data-research-geometry-blocked']});return()=>{observer.disconnect();root.removeEventListener('load',reconcile,true)}
  },[snapshot.files,snapshot.artifacts,snapshot.selection,rootRef,voiceTarget])
  const resizable=readOnly?[]:hosts.filter(n=>!n.expanded&&!n.blocked&&snapshot.selection.selectedNodeIds.includes(n.node.id)).map(n=>n.node)
  return react_jsx_runtime.jsxs(react.Fragment,{children:[...hosts.map(({node,host})=>react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchChrome,{node,sessionId,readOnly,selected:snapshot.selection.selectedNodeIds.includes(node.id),onAsk,onMore:(n,e)=>{if(!workspace.getSnapshot().selection.selectedNodeIds.includes(n.id))workspace.updateSelection([n.id],'replace');setMenu({node:n,sessionId,event:{clientX:e.clientX,clientY:e.clientY},left:e.currentTarget.getBoundingClientRect().right-206,top:e.currentTarget.getBoundingClientRect().bottom+5})},onRemove:n=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"]');if(card?.open)card.querySelector('[data-research-container-expand]')?.click();else workspace.removeNodes([n.id])}}),host,node.id)),rootRef.current&&react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchResizeControls,{nodes:resizable,width:snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000}),rootRef.current),menu&&react_jsx_runtime.jsx(WorkbenchMenu,{target:menu,workspace,readOnly,onClose:close,onDerived,onLegacy})]})
}
export function WorkbenchResizeControls({nodes,width}) {
  const gap=createResearchGrid().metrics(width).gap
  return react_jsx_runtime.jsx('div',{className:'ew-grid-resize-layer',children:nodes.flatMap(node=>['x','y'].map(axis=>react_jsx_runtime.jsx('button',{type:'button',className:'ew-grid-resize ew-grid-resize-'+axis,'aria-label':axis==='x'?'调整组件宽度':'调整组件高度',title:axis==='x'?'拖动调整宽度':'拖动调整高度','data-workbench-resize':node.id,'data-workbench-resize-axis':axis,style:axis==='x'?{left:node.x+node.width/2,top:node.y-18,width:gap}:{left:node.x-18,top:node.y+node.height/2,height:gap},children:react_jsx_runtime.jsx('span',{'aria-hidden':true,style:axis==='x'?{width:Math.min(5,gap)}:{height:Math.min(5,gap)}})},node.id+'-'+axis)))})
}
export function handleWorkbenchWheel(root,workspace,event) {
  if(event.target?.closest?.('[role=menu],[role=dialog][open],.ew-grid-menu,[data-research-create-popover],[data-research-global-toolbar]'))return
  const card=event.target?.closest?.('[data-research-node-id]'),preview=event.target?.closest?.('[data-research-preview-interactive]')
  const selected=card&&workspace.getSnapshot().selection.selectedNodeIds.includes(card.getAttribute('data-research-node-id'))
  if(!event.__sherlockCanvasPan&&selected&&preview&&!event.metaKey&&!event.ctrlKey&&researchPreviewCanConsumeWheel(event.target,preview,event.deltaX||0,event.deltaY||0))return
  event.preventDefault();event.stopPropagation()
  const unit=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1
  root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),root.scrollTop+(Number.isFinite(event.deltaY)?event.deltaY*unit:0)))
  const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})
}
export function installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly) {
  const grid=createResearchGrid(),view=root.ownerDocument.defaultView
  let op=null,frame=0,pending=null,autoFrame=0,lastPointer=null
  const preview=document.createElement('div');preview.className='ew-grid-placeholder';preview.hidden=true;root.appendChild(preview)
  const width=()=>Math.max(240,Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))
  const point=e=>{const r=root.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top+root.scrollTop}}
  const allowed=(cells,before=op.before)=>!cells.some(c=>{const old=before.find(n=>n.id===c.id),card=root.querySelector('[data-research-node-id="'+CSS.escape(c.id)+'"]');return card?.hasAttribute('data-research-geometry-blocked')&&old&&['x','y','w','h'].some(k=>old[k]!==c[k])})
  const paint=()=>{frame=0;if(!pending||!op)return;workspace.applyWorkbenchCells(pending,false);pending=null}
  const show=c=>{const n=grid.project([{id:c.id}], [c], width())[0];Object.assign(preview.style,{left:n.x-n.width/2+'px',top:n.y-n.height/2+'px',width:n.width+'px',height:n.height+'px'});preview.hidden=false}
  const update=e=>{
    if(!op)return
    const p=point(e),m=grid.metrics(width());let target
    if(op.kind==='draw')target=grid.draw(op.start,p,m)
    else{const c=op.cell,dx=(p.x-op.start.x)/m.step,dy=(p.y-op.start.y)/m.rowStep,min=grid.minimum(op.geometry.find(n=>n.id===c.id),m);target=op.kind==='resize'?grid.bounded({...c,w:op.axis==='y'?c.w:Math.max(min.w,c.w+Math.round(dx)),h:op.axis==='x'?c.h:Math.max(min.h,c.h+Math.round(dy))}):grid.bounded({...c,x:c.x+Math.round(dx),y:c.y+Math.round(dy)})}
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
    if(commit&&op.kind!=='draw'&&['x','y','w','h'].every(k=>op.target[k]===op.cell[k]))commit=false
    const original=op.canonicalBefore.find(c=>c.id===op.cell?.id)
    const committedTarget=commit&&op.kind!=='draw'?{...op.target,x:op.kind==='resize'||op.target.x===op.cell.x?original.x:op.target.x,y:op.kind==='resize'?original.y:Math.max(0,original.y+op.target.y-op.cell.y),...(op.kind==='move'?{w:original.w,h:original.h}:op.axis==='x'?{h:original.h}:{w:original.w})}:op.target
    const proposedCommit=commit?grid.place(op.canonicalBefore,committedTarget,committedTarget.id):null
    const committed=commit&&op.kind!=='draw'?grid.compact(proposedCommit):proposedCommit
    if(commit&&!allowed(committed,op.canonicalBefore))commit=false
    if(commit&&op.kind==='draw'){
      workspace.applyWorkbenchCells(op.canonicalBefore,false)
      const n=grid.project([{id:'__draft__'}],[op.target],width())[0]
      const node=workspace.createContainerDraft({x:n.x,y:n.y,width:n.width,height:n.height,sizeMode:'manual'})
      if(node)workspace.applyWorkbenchCells(grid.place(op.canonicalBefore,{...op.target,id:node.id},node.id),false)
      workspace.persist();selectTool('select')
    }else if(commit){workspace.applyWorkbenchCells(committed,false);workspace.persist()}
    else{workspace.applyWorkbenchCells(op.canonicalBefore,false);workspace.cancelPointerGeometry([...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts])}
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
    if(toolRef.current==='select'&&handleWorkbenchMultiSelect(root,workspace,e))return
    if(e.button!==0||e.target?.closest?.('[data-research-global-toolbar],[role=menu],[role=dialog],.ew-grid-menu'))return
    const handle=e.target?.closest?.('[data-workbench-drag-handle]'),resize=e.target?.closest?.('[data-workbench-resize]'),card=e.target?.closest?.('[data-research-node-id]')||(resize&&root.querySelector('[data-research-node-id="'+CSS.escape(resize.getAttribute('data-workbench-resize'))+'"]'))
    const draw=toolRef.current==='component'&&!resize
    if(readOnly||!draw&&(!handle&&!resize)||e.target?.closest?.('input,textarea,button,a,select,[contenteditable=true]')&&!resize)return
    if(card?.hasAttribute('data-research-geometry-blocked')||card?.hasAttribute('open'))return
    const current=workspace.getSnapshot(),canonicalBefore=workspace.getWorkbenchCells(),before=workspace.getWorkbenchVisibleCells(),id=(resize||handle)?.getAttribute(resize?'data-workbench-resize':'data-workbench-drag-handle')
    if(!draw&&!before.some(c=>c.id===id))return
    e.preventDefault();e.stopImmediatePropagation();root.focus({preventScroll:true});root.setPointerCapture?.(e.pointerId)
    if(id&&!current.selection.selectedNodeIds.includes(id))workspace.updateSelection([id],'replace')
    op={kind:draw?'draw':resize?'resize':'move',axis:resize?.getAttribute('data-workbench-resize-axis'),pointerId:e.pointerId,start:point(e),before,canonicalBefore,cell:before.find(c=>c.id===id),geometry:[...current.files,...current.artifacts]}
    if(!draw&&!op.cell){op=null;return}
    root.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e
    update(e);autoFrame=view.requestAnimationFrame(autoScroll)
  }
  const move=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();lastPointer=e;update(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)}
  const up=e=>{if(!op)return;e.preventDefault();e.stopImmediatePropagation();finish(true,e)}
  const cancel=e=>{if(op){e?.stopImmediatePropagation?.();finish(false,e)}}
  const key=e=>{if(e.key==='Shift'&&!e.target?.closest?.('input,textarea,[contenteditable=true]'))root.setAttribute('data-grid-multiselect','');if(op&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}}
  const keyUp=e=>{if(e.key==='Shift')root.removeAttribute('data-grid-multiselect')}
  const click=e=>{if(toolRef.current==='select'&&(e.shiftKey||e.metaKey)&&e.target?.closest?.('[data-research-node-id]')&&!e.target?.closest?.('input,textarea,[contenteditable=true]')){e.preventDefault();e.stopImmediatePropagation()}}
  const blur=e=>{root.removeAttribute('data-grid-multiselect');cancel(e)}
  root.addEventListener('pointerdown',down,true);root.addEventListener('click',click,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);root.addEventListener('lostpointercapture',cancel,true);view.addEventListener('blur',blur);view.addEventListener('keydown',key,true);view.addEventListener('keyup',keyUp,true)
  return()=>{finish(false);preview.remove();root.removeAttribute('data-grid-multiselect');root.removeEventListener('pointerdown',down,true);root.removeEventListener('click',click,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('lostpointercapture',cancel,true);view.removeEventListener('blur',blur);view.removeEventListener('keydown',key,true);view.removeEventListener('keyup',keyUp,true)}
}
export function WorkbenchContextMenu({canvasRoot,point,onClose,className,style,children,...props}) {
  const ref=react.useRef(null)
  react.useLayoutEffect(()=>{
    const menu=ref.current,root=canvasRoot.current;if(!menu||!root)return
    const view=root.ownerDocument.defaultView
    const place=()=>{
      const bounds=root.getBoundingClientRect(),inset=12
      const right=Math.min(bounds.right,view.innerWidth)-inset,bottom=Math.min(bounds.bottom,view.innerHeight)-inset
      menu.style.maxWidth=Math.max(0,right-bounds.left-inset)+'px'
      const size=menu.getBoundingClientRect()
      const left=Math.max(bounds.left+inset,Math.min(bounds.left+point.left,right-size.width))
      let top=Math.max(bounds.top+inset,Math.min(bounds.top+point.top,bottom-size.height))
      const toolbar=root.ownerDocument.querySelector('[data-ework-toolbar]')?.getBoundingClientRect()
      if(toolbar&&left<toolbar.right&&left+size.width>toolbar.left&&top<toolbar.bottom&&top+size.height>toolbar.top){
        const room=Math.max(0,toolbar.top-bounds.top-inset-8)
        menu.style.maxHeight=room+'px';top=Math.max(bounds.top+inset,toolbar.top-Math.min(size.height,room)-8)
      }else menu.style.maxHeight=Math.max(0,bottom-bounds.top-inset)+'px'
      Object.assign(menu.style,{left:left+'px',top:top+'px'})
    }
    place();view.addEventListener('resize',place)
    return()=>view.removeEventListener('resize',place)
  },[canvasRoot,point])
  react.useEffect(()=>{
    const doc=canvasRoot.current?.ownerDocument;if(!doc)return
    const outside=e=>{if(!ref.current?.contains(e.target)&&e.target?.closest?.('.ew-grid-download-menu')?.__eworkCanvasRoot!==canvasRoot.current)onClose()}
    doc.addEventListener('pointerdown',outside,true)
    return()=>doc.removeEventListener('pointerdown',outside,true)
  },[canvasRoot,onClose])
  return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,ref,className:className+' ew-grid-context-menu',style:{...style,position:'fixed'},onKeyDown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();canvasRoot.current?.focus({preventScroll:true})}},children}),document.body)
}
export function WorkbenchDownloadMenu({canvasRoot,onClose,onMouseEnter,onMouseLeave,className,children,...props}) {
  const anchor=react.useRef(null),popup=react.useRef(null)
  react.useLayoutEffect(()=>{
    const element=popup.current,parent=anchor.current?.parentElement;if(!element||!parent)return
    element.__eworkCanvasRoot=canvasRoot.current
    const r=parent.getBoundingClientRect(),size=element.getBoundingClientRect()
    const left=r.right+6+size.width<=window.innerWidth-8?r.right+6:Math.max(8,r.left-size.width-6)
    Object.assign(element.style,{left:left+'px',top:Math.max(8,Math.min(r.top,window.innerHeight-size.height-8))+'px'})
    onMouseEnter?.()
  },[canvasRoot])
  return react_jsx_runtime.jsxs(react.Fragment,{children:[react_jsx_runtime.jsx('span',{ref:anchor,'aria-hidden':true,style:{display:'block',height:0}}),react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,ref:popup,className:className+' ew-grid-download-menu',onMouseEnter,onMouseLeave,onKeyDown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();canvasRoot.current?.focus({preventScroll:true})}},children}),document.body)]})
}
export function WorkbenchToolbar({rootRef,sessionId,availableWidth,children,...props}) {
  const [bounds,setBounds]=react.useState(null)
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const measure=()=>{const r=root.getBoundingClientRect(),next={left:r.left+Math.min(r.width,availableWidth||r.width)/2,bottom:Math.max(20,window.innerHeight-r.bottom+20)};setBounds(previous=>previous&&previous.left===next.left&&previous.bottom===next.bottom?previous:next)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root);if(root.parentElement)observer.observe(root.parentElement)
    window.addEventListener('resize',measure)
    return()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[rootRef,availableWidth])
  return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':'','data-ework-toolbar-owner':sessionId,style:{position:'fixed',left:bounds?.left||0,bottom:bounds?.bottom||20,top:'auto',visibility:bounds?'visible':'hidden'},children}),document.body)
}
export function workbenchAvailableWidth(root,bounds,panelBounds) {
  return Math.max(240,Math.min(root.clientWidth||bounds.width,researchCanvasUnobscuredWidth(bounds,panelBounds)))
}
export function useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef,selectTool,readOnly}) {
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    root.setAttribute('data-ework-grid','')
    const measure=()=>{const bounds=root.getBoundingClientRect();if(!(bounds.width>0))return;const panel=root.ownerDocument.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)'),width=workbenchAvailableWidth(root,bounds,panel?.getBoundingClientRect());workspace.setWorkbenchWidth(width);const size={width:bounds.width,height:bounds.height,availableWidth:width,visibleHeight:Math.max(0,Math.min(bounds.height,window.innerHeight-bounds.top))},previous=workspace.getSnapshot().canvasSize;if(Object.keys(size).some(k=>previous[k]!==size[k]))workspace.setCanvasSize(size)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root)
    window.addEventListener('resize',measure)
    const scroll=()=>{const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})}
    root.addEventListener('scroll',scroll,{passive:true})
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);root.removeEventListener('scroll',scroll);root.removeAttribute('data-ework-grid')}
  },[workspace,sessionId,readOnly])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const nodes=[...snapshot.files,...snapshot.artifacts],bottom=Math.max(12,...nodes.map(n=>n.y+n.height/2))+Math.max(520,root.clientHeight||snapshot.canvasSize.height||700)
    const layer=root.querySelector('[data-research-content-layer]');if(layer){const width=snapshot.canvasSize.availableWidth||root.clientWidth;layer.style.height=bottom+'px';layer.style.width=width+'px';layer.style.setProperty('--grid-step',createResearchGrid().metrics(width).step+'px');layer.style.setProperty('--grid-pattern',workbenchGridPattern(width))}
    const viewport=snapshot.viewport;if(Math.abs(root.scrollTop+viewport.y)>.5&&!root.hasAttribute('data-grid-operation'))root.scrollTop=Math.max(0,-viewport.y)
  },[snapshot])
  react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly)},[workspace,sessionId,readOnly])
}
