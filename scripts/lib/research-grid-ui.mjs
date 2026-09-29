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
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+m.step+'" height="'+m.step+'" viewBox="0 0 '+m.step+' '+m.step+'"><path d="M '+m.step+' 0 H 0 V '+m.step+'" fill="none" stroke="#8a9099" stroke-opacity="0.2" stroke-width="1"/></svg>'
  return 'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")'
}
export function revealWorkbenchNode(root,workspace,id) {
  if(!root||!id)return
  const view=root.ownerDocument.defaultView,request={id};root.__eworkReveal=request
  view.requestAnimationFrame(()=>{
    if(root.__eworkReveal!==request||!root.isConnected)return
    delete root.__eworkReveal
    const node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
    if(!node)return
    const height=root.clientHeight||workspace.getSnapshot().canvasSize.height,top=node.y-node.height/2,bottom=node.y+node.height/2,usable=Math.max(100,height-86)
    if(top>=root.scrollTop+12&&bottom<=root.scrollTop+usable)return
    const next=Math.max(0,bottom-top>usable-24?top-12:bottom-usable+12)
    root.scrollTo({top:next,behavior:view.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
    // Headless DOM and older hosts may not dispatch a scroll event.
    if(Math.abs(root.scrollTop-next)<1)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})
  })
}
export function WorkbenchIcon({name}) {
  // Every glyph uses the same optical frame and rounded stroke family.
  return react_jsx_runtime.jsx('span',{className:'ew-grid-icon ew-grid-icon-'+name,'data-workbench-icon':name,'aria-hidden':true})
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
        const nativeReload=frame?.querySelector('[data-research-native-web]')?.__eworkReloadWeb
        if(nativeReload)nativeReload();else if(reload)reload.click();else throw Error('网页尚未载入，请稍后刷新')
      }else if(binding){await window.dshDesktop.componentData.request(sessionId,{action:'refresh',nodeId:node.id});const rows=await window.dshDesktop.componentData.request(sessionId,{action:'list'});componentDataStatusStore.publish(sessionId,rows)}
      else openComponentData(sessionId,node)
      setNow(Date.now());window.dispatchEvent(new Event('sherlock:component-data-changed'))
    }catch(e){setError(e?.message||'刷新失败，保留上次数据')}finally{setBusy(false)}
  }
  const button=(name,label,onClick,extra={})=>react_jsx_runtime.jsx('button',{type:'button','aria-label':label,onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();onClick?.(e)},...extra,children:react_jsx_runtime.jsx(WorkbenchIcon,{name})})
  const hover=kind=>e=>{setNow(Date.now());const r=e.currentTarget.getBoundingClientRect();setTip({kind,left:Math.min(r.left,window.innerWidth-340),top:r.bottom+6})}
  return react_jsx_runtime.jsxs(react.Fragment,{children:[
    react_jsx_runtime.jsxs('header',{className:'ew-grid-header','data-workbench-drag-handle':node.id,children:[
      react_jsx_runtime.jsx('span',{className:'ew-grid-refresh',onMouseEnter:hover('refresh'),onMouseLeave:()=>setTip(null),onFocus:hover('refresh'),onBlur:()=>setTip(null),children:button('refresh','刷新组件',refresh,{disabled:readOnly||busy||binding?.status==='refreshing','data-workbench-refresh':node.id,'data-busy':busy||binding?.status==='refreshing'||undefined,'data-refresh-current':!!binding?.lastSuccess&&now-new Date(binding.lastSuccess).getTime()<60000||undefined})}),
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
export async function exportWorkbenchContent(card,node,format) {
  if(!['svg','png','jpg'].includes(format)||!card)throw Error('组件当前不可导出')
  const doc=card.ownerDocument,view=doc.defaultView,body=card.querySelector('[data-research-preview-body]')||card.querySelector('[data-research-native-web]')
  if(!body)throw Error('请等待组件内容加载完成')
  const frame=body.querySelector('iframe[data-research-html-artifact]')
  let svg
  if(frame){
    svg=await new Promise((resolve,reject)=>{
      const id='export-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),timer=view.setTimeout(()=>{cleanup();reject(Error('组件导出超时，请等待内容加载完成后重试'))},8000)
      const cleanup=()=>{view.clearTimeout(timer);view.removeEventListener('message',receive)}
      const receive=e=>{const d=e.data;if(e.source!==frame.contentWindow||d?.type!=='sherlock-workbench-export-result'||d.id!==id||Object.keys(d).length!==3||typeof d.svg!=='string'||d.svg.length>8*1024*1024)return;cleanup();d.svg?resolve(d.svg):reject(Error('组件内容无法导出'))}
      view.addEventListener('message',receive);frame.contentWindow.postMessage({type:'sherlock-workbench-export',id},'*')
    })
  }else{
    const bounds=body.getBoundingClientRect();if(!(bounds.width>0&&bounds.height>0))throw Error('请等待组件内容显示完成')
    svg=serializeWorkbenchContent(body,bounds.width,bounds.height)
  }
  // A sandbox may report only passive SVG. Never mount its markup in the host.
  if(!isPassiveWorkbenchSvg(svg,s=>new view.DOMParser().parseFromString(s,'image/svg+xml')))throw Error('组件导出内容无效')
  const suggestedName=(node.displayName||node.title||node.name||'组件').slice(0,120)+'.'+format
  let request={kind:'text',format:'svg',suggestedName,content:svg}
  if(format!=='svg'){
    const image=new view.Image(),source='data:image/svg+xml;base64,'+view.btoa(unescape(encodeURIComponent(svg)))
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('组件图片生成失败'));image.src=source})
    const canvas=doc.createElement('canvas'),scale=Math.min(2,Math.sqrt(24000000/(image.width*image.height)));if(!Number.isFinite(scale)||image.width<1||image.height<1||image.width>16384||image.height>16384)throw Error('组件导出尺寸过大');canvas.width=Math.floor(image.width*scale);canvas.height=Math.floor(image.height*scale)
    const context=canvas.getContext('2d');if(!context)throw Error('组件图片生成失败')
    if(format==='jpg'){context.fillStyle=doc.body.hasAttribute('data-ds-dark-theme')?'#131316':'#ffffff';context.fillRect(0,0,canvas.width,canvas.height)}
    context.drawImage(image,0,0,canvas.width,canvas.height)
    request={kind:'binary',format,suggestedName,base64:canvas.toDataURL(format==='jpg'?'image/jpeg':'image/png',.94).split(',')[1]}
  }
  const save=view.dshDesktop?.researchCanvasExport?.save;if(!save)throw Error('当前客户端不支持导出')
  const result=await save(request);if(result?.status==='error')throw Error(result.message||'保存失败，请重试')
  return result
}
export function WorkbenchMenu({target,workspace,readOnly,onClose,onDerived,onLegacy,onEditSelected}) {
  const [detail,setDetail]=react.useState(null),[exporting,setExporting]=react.useState(false),[exportError,setExportError]=react.useState(''),ref=react.useRef(null),subRef=react.useRef(null),mindRef=react.useRef(null),settingsRef=react.useRef(null),exportRef=react.useRef(null),leaveTimer=react.useRef(null)
  const trigger=kind=>kind==='mind'?mindRef:kind==='export'?exportRef:settingsRef
  const cancelLeave=()=>{clearTimeout(leaveTimer.current);leaveTimer.current=null}
  const leave=()=>{cancelLeave();leaveTimer.current=setTimeout(()=>setDetail(null),200)}
  const card=()=>document.querySelector('[data-research-node-id="'+CSS.escape(target.node.id)+'"]')
  const settings=card()?.querySelector('[data-research-container-more]')?.__eworkWorkbenchSettings
  const openDetail=(kind,focus=false)=>{
    if(kind==='mind'&&readOnly)return
    cancelLeave();const menu=ref.current?.getBoundingClientRect(),row=trigger(kind).current?.getBoundingClientRect();if(!menu||!row)return
    const width=kind==='settings'?248:116,height=kind==='settings'?(settings?.length||4)*33+14:117,left=menu.right+4+width<=window.innerWidth-8?menu.right+4:Math.max(8,menu.left-width-4)
    setDetail({kind,left,top:Math.max(8,Math.min(row.top,window.innerHeight-height-8)),width})
    if(focus)window.requestAnimationFrame(()=>subRef.current?.querySelector('button:not(:disabled)')?.focus())
  }
  react.useEffect(()=>{const outside=e=>{if(!ref.current?.contains(e.target)&&!subRef.current?.contains(e.target)&&!e.target?.closest?.('[data-workbench-more]'))onClose()};const key=e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);const scroll=e=>{const scroller=e?.target;if(scroller===window||scroller===document||scroller===document.documentElement||scroller===document.body||scroller===card()?.closest('[data-research-canvas]'))onClose()};window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);return()=>{cancelLeave();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true)}},[onClose])
  const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
  const choose=action=>{onClose();action?.()}
  const exportAs=async format=>{if(exporting)return;cancelLeave();setExporting(true);setExportError('');try{await exportWorkbenchContent(card(),target.node,format);onClose()}catch(e){setExportError(e?.message||'导出失败，请重试')}finally{setExporting(false)}}
  const row=(icon,label,action,disabled=readOnly,attributes={})=>jsxs('button',{...attributes,type:'button',role:'menuitem',disabled,onMouseEnter:leave,onClick:()=>choose(action),children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label})]},label)
  const flyout=(kind,icon,label,trigger,disabled=false)=>jsxs('button',{ref:trigger,type:'button',role:'menuitem','aria-label':label,'aria-haspopup':'menu','aria-expanded':detail?.kind===kind,disabled,onMouseEnter:()=>openDetail(kind),onClick:()=>openDetail(kind),onKeyDown:e=>{if(e.key==='ArrowRight'){e.preventDefault();openDetail(kind,true)}},children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label}),jsx('span',{children:'›'})]})
  const style={left:Math.max(8,Math.min(window.innerWidth-214,target.left)),top:Math.max(8,Math.min(window.innerHeight-(target.node.creationMode==='selection'?486:420),target.top)),maxHeight:'calc(100vh - 16px)',overflowY:'auto'}
  return react_dom.createPortal(jsxs(react.Fragment,{children:[jsxs('div',{ref,className:'ew-grid-menu',role:'menu','aria-label':'组件更多操作',style,onMouseLeave:leave,children:[
    row('duplicate','复制组件',()=>{workspace.copySelectedNodes().then(()=>workspace.pasteClipboardNodes(null)).catch(error=>console.error(error))}),
    row('expand','放大阅读',()=>card()?.querySelector('[data-research-container-expand]')?.click(),false),
    row('rename','重命名',()=>onLegacy(target.node,target.event,'rename')),
    target.node.creationMode==='selection'&&row('rename','编辑需求',()=>onEditSelected?.(target.node),readOnly||RESEARCH_ACTIVE_GENERATION_STATUSES.has(target.node.generationStatus),{'data-workbench-edit-selected-create':target.node.id}),
    target.node.creationMode==='selection'&&row('branch','查看基准',()=>{
      const root=card()?.closest('[data-research-canvas]'),current=workspace.getSnapshot(),live=new Set([...current.files,...current.artifacts].map(n=>n.id)),ids=(target.node.sourceNodeIds||[]).filter(id=>live.has(id))
      if(!ids.length)return;workspace.updateSelection(ids,'replace');root?.querySelector('[data-research-node-id="'+CSS.escape(ids[0])+'"]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});root?.focus({preventScroll:true})
    },!(target.node.sourceNodeIds||[]).some(id=>[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts].some(n=>n.id===id)),{'data-workbench-view-source':target.node.id}),
    flyout('export','download','导出',exportRef),
    jsx('div',{className:'ew-grid-divider'}),
    flyout('mind','branch','思维导图',mindRef,readOnly),
    row('summary','总结提炼',()=>onDerived('summary')),
    row('plus','基于所选创建',()=>onDerived('create',undefined,target.node.id)),
    jsx('div',{className:'ew-grid-divider'}),
    row('data','数据源与自动更新',()=>openComponentData(target.sessionId,target.node),false),
    settings?.length>0&&flyout('settings','settings','组件设置',settingsRef),
    row('remove','移除组件',()=>workspace.removeNodes([target.node.id]))
  ]}),detail&&jsx('div',{ref:subRef,className:'ew-grid-menu ew-grid-submenu',role:'menu','aria-label':detail.kind==='mind'?'思维导图详细度':detail.kind==='export'?'导出格式':'组件设置',style:{left:detail.left,top:detail.top,width:detail.width},onMouseEnter:cancelLeave,onMouseLeave:leave,onKeyDown:e=>{if(e.key==='ArrowLeft'){e.preventDefault();cancelLeave();setDetail(null);trigger(detail.kind).current?.focus()}},children:detail.kind==='export'?[...['svg','png','jpg'].map(format=>jsx('button',{type:'button',role:'menuitem',disabled:exporting,onClick:()=>exportAs(format),children:format.toUpperCase()},format)),exportError&&jsx('span',{role:'alert',children:exportError})]:detail.kind==='mind'?RESEARCH_MIND_MAP_DETAIL_OPTIONS.map(option=>jsx('button',{type:'button',role:'menuitem',onClick:()=>choose(()=>onDerived('mind-map',option.value)),children:option.label},option.value)):settings?.map(action=>jsxs('button',{type:'button',role:'menuitem',disabled:readOnly&&action.writes||action.disabled,onClick:()=>choose(()=>{if((!readOnly||!action.writes)&&!action.disabled)action.run?.()}),children:[jsx(WorkbenchIcon,{name:action.icon}),jsx('span',{children:action.label})]},action.label))})]}),document.body)
}

export function handleWorkbenchMultiSelect(root,workspace,event) {
  if(event.button!==0||!event.shiftKey&&!event.metaKey||event.target?.closest?.('input,textarea,[contenteditable=true]'))return false
  const card=event.target?.closest?.('[data-research-node-id]');if(!card||card.hasAttribute('open'))return false
  event.preventDefault();event.stopImmediatePropagation();root.ownerDocument.defaultView.getSelection()?.removeAllRanges()
  workspace.updateSelection([card.getAttribute('data-research-node-id')],'toggle');return true
}
export function WorkbenchChromeLayer({rootRef,workspace,sessionId,snapshot,readOnly,onAsk,onDerived,onLegacy,onEditSelected}) {
  const [hosts,setHosts]=react.useState([]),[menu,setMenu]=react.useState(null)
  const close=react.useCallback(()=>setMenu(null),[])
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const reconcile=()=>{const nodes=[...snapshot.files,...snapshot.artifacts],next=[]
    for(const node of nodes){const card=root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');if(!card)continue;let host=card.querySelector(':scope > .ew-grid-chrome-host');if(!host){host=document.createElement('div');host.className='ew-grid-chrome-host';card.appendChild(host)}for(const frame of card.querySelectorAll('iframe[data-research-html-artifact]'))frame.contentWindow?.postMessage({type:'sherlock-workbench-selection',selected:card.hasAttribute('open')||snapshot.selection.selectedNodeIds.includes(node.id)},'*');next.push({node,host,expanded:card.hasAttribute('open'),blocked:card.hasAttribute('data-research-geometry-blocked')})}
    setHosts(previous=>previous.length===next.length&&next.every((n,i)=>previous[i].host===n.host&&previous[i].node===n.node&&previous[i].expanded===n.expanded&&previous[i].blocked===n.blocked)?previous:next)
    };reconcile();root.addEventListener('load',reconcile,true);const observer=new MutationObserver(reconcile);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['open','data-research-geometry-blocked']});return()=>{observer.disconnect();root.removeEventListener('load',reconcile,true)}
  },[snapshot.files,snapshot.artifacts,snapshot.selection,rootRef])
  const resizable=readOnly?[]:hosts.filter(n=>!n.expanded&&!n.blocked&&snapshot.selection.selectedNodeIds.includes(n.node.id)).map(n=>n.node)
  const visibleHeight=rootRef.current?.clientHeight||snapshot.canvasSize.visibleHeight||0,contentBottom=Math.max(0,...[...snapshot.files,...snapshot.artifacts].map(n=>n.y+n.height/2)),resizeBottom=visibleHeight>0&&contentBottom<=visibleHeight?visibleHeight:Infinity
  return react_jsx_runtime.jsxs(react.Fragment,{children:[...hosts.map(({node,host})=>react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchChrome,{node,sessionId,readOnly,selected:snapshot.selection.selectedNodeIds.includes(node.id),onAsk,onMore:(n,e)=>{if(!workspace.getSnapshot().selection.selectedNodeIds.includes(n.id))workspace.updateSelection([n.id],'replace');setMenu({node:n,sessionId,event:{clientX:e.clientX,clientY:e.clientY},left:e.currentTarget.getBoundingClientRect().right-206,top:e.currentTarget.getBoundingClientRect().bottom+5})},onRemove:n=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"]');if(card?.open)card.querySelector('[data-research-container-expand]')?.click();else workspace.removeNodes([n.id])}}),host,node.id)),rootRef.current&&react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchResizeControls,{nodes:resizable,width:snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000,bottom:resizeBottom}),rootRef.current),menu&&react_jsx_runtime.jsx(WorkbenchMenu,{target:menu,workspace,readOnly,onClose:close,onDerived,onLegacy,onEditSelected})]})
}
export function WorkbenchResizeControls({nodes,width,bottom=Infinity}) {
  const gap=createResearchGrid().metrics(width).gap
  return react_jsx_runtime.jsx('div',{className:'ew-grid-resize-layer',children:nodes.flatMap(node=>['x','y'].map(axis=>react_jsx_runtime.jsx('button',{type:'button',className:'ew-grid-resize ew-grid-resize-'+axis,'aria-label':axis==='x'?'调整组件宽度':'调整组件高度',title:axis==='x'?'拖动调整宽度':'拖动调整高度','data-workbench-resize':node.id,'data-workbench-resize-axis':axis,style:axis==='x'?{left:node.x+node.width/2,top:node.y-18,width:gap}:{left:node.x-18,top:Math.min(node.y+node.height/2,bottom-gap),height:gap},children:react_jsx_runtime.jsx('span',{'aria-hidden':true,style:axis==='x'?{width:Math.min(5,gap)}:{height:Math.min(5,gap)}})},node.id+'-'+axis)))})
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
  const groupPreviews=[]
  const width=()=>Math.max(240,Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))
  const point=e=>{const r=root.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top+root.scrollTop}}
  const allowed=(cells,before=op.before)=>!cells.some(c=>{const old=before.find(n=>n.id===c.id),card=root.querySelector('[data-research-node-id="'+CSS.escape(c.id)+'"]');return card?.hasAttribute('data-research-geometry-blocked')&&old&&['x','y','w','h'].some(k=>old[k]!==c[k])})
  const floatCard=p=>{
    if(op?.kind!=='move')return
    const card=root.querySelector('[data-research-node-id="'+CSS.escape(op.cell.id)+'"]'),origin=grid.project([{id:op.cell.id}],[op.cell],op.width)[0]
    if(!card)return
    // Native nodes position their centre with translate(-50%, -50%). Keep that
    // coordinate convention during the float and the release transition.
    card.style.setProperty('--grid-float-left',Math.max(12+origin.width/2,Math.min(width()-12-origin.width/2,origin.x+p.x-op.start.x))+'px')
    card.style.setProperty('--grid-float-top',Math.max(12+origin.height/2,origin.y+p.y-op.start.y)+'px')
  }
  const paint=()=>{frame=0;if(!pending||!op)return;workspace.applyWorkbenchCells(pending,false);const visible=workspace.getWorkbenchVisibleCells();show(op.kind==='draw'?op.target:visible.find(c=>c.id===op.cell.id));groupPreviews.forEach(({id,element})=>show(visible.find(c=>c.id===id),element));pending=null}
  const show=(c,element=preview)=>{if(!c)return;const m=grid.metrics(width()),n=grid.project([{id:c.id}], [c], width())[0];Object.assign(element.style,{left:n.x-n.width/2+'px',top:n.y-n.height/2+'px',width:n.width+'px',height:n.height+'px'});element.style.setProperty('--grid-gap',m.gap+'px');element.hidden=false}
  const update=e=>{
    if(!op)return
    const p=point(e),m=grid.metrics(width());let target
    if(op.kind==='draw')target=grid.draw(op.start,p,m)
    else{const c=op.cell,dx=(p.x-op.start.x)/m.step,dy=(p.y-op.start.y)/m.rowStep,min=grid.minimum(op.geometry.find(n=>n.id===c.id),m);target=op.kind==='resize'?grid.bounded({...c,w:op.axis==='y'?c.w:Math.max(min.w,c.w+Math.round(dx)),h:op.axis==='x'?c.h:Math.max(min.h,c.h+Math.round(dy))}):grid.bounded({...c,x:c.x+Math.round(dx),y:c.y+Math.round(dy)})}
    floatCard(p)
    const anchorRow=(p.y-m.inset)/m.rowStep,targetKey=JSON.stringify([target.x,target.y,target.w,target.h,op.kind==='move'?grid.moveSlot(op.before,target,anchorRow):op.kind==='resize'?Math.round((op.axis==='x'?p.x-op.start.x:p.y-op.start.y)/m.step):0])
    if(op.targetKey===targetKey)return
    const original=op.canonicalBefore.find(c=>c.id===op.cell?.id)
    const canonicalTarget=op.kind==='draw'?target:{...target,x:op.kind==='resize'||target.x===op.cell.x?original.x:target.x,y:op.kind==='resize'?original.y:Math.max(0,original.y+target.y-op.cell.y),...(op.kind==='move'?{w:original.w,h:original.h}:op.axis==='x'?{w:target.w===op.cell.w?original.w:target.w,h:original.h}:{w:original.w,h:target.h===op.cell.h?original.h:target.h})}
    const groupResize=op.kind==='resize'&&op.selectedIds.length>1
    const delta=op.axis==='x'?Math.round((p.x-op.start.x)/m.step):Math.round((p.y-op.start.y)/m.rowStep)
    const proposed=(groupResize?grid.resizeSelection(op.canonicalBefore,op.selectedIds,op.axis,delta,op.geometry,op.width,op.before):op.kind==='move'?grid.move(op.canonicalBefore,canonicalTarget,op.before,target,anchorRow):op.kind==='resize'&&op.axis==='x'?grid.resize(op.canonicalBefore,canonicalTarget,op.geometry,op.width):grid.place(op.canonicalBefore,canonicalTarget,target.id)).filter(c=>c.id!=='__draft__')
    if(!allowed(proposed,op.canonicalBefore))return
    op.targetKey=targetKey
    op.target=target
    if(op.kind!=='draw'&&op.resolved&&proposed.every((c,i)=>c.id===op.resolved[i]?.id&&['x','y','w','h'].every(k=>c[k]===op.resolved[i][k])))return
    op.resolved=proposed
    if(op.kind==='draw')show(target)
    pending=proposed
    if(!frame)frame=view.requestAnimationFrame(paint)
  }
  const finish=(commit,event)=>{
    if(!op||event?.pointerId!==undefined&&event.pointerId!==op.pointerId)return
    if(frame)view.cancelAnimationFrame(frame);frame=0
    if(autoFrame)view.cancelAnimationFrame(autoFrame);autoFrame=0;lastPointer=null
    if(commit&&event){update(event);if(frame)view.cancelAnimationFrame(frame);frame=0}
    if(commit&&!op.target)commit=false
    if(commit&&op.kind!=='draw'&&op.resolved.every(c=>{const before=op.canonicalBefore.find(n=>n.id===c.id);return ['x','y','w','h'].every(k=>c[k]===before[k])}))commit=false
    const committed=op.resolved
    if(commit&&!allowed(committed,op.canonicalBefore))commit=false
    if(commit&&op.kind==='draw'){
      workspace.applyWorkbenchCells(op.canonicalBefore,false)
      const n=grid.project([{id:'__draft__'}],[op.target],width())[0]
      const node=workspace.createContainerDraft({x:n.x,y:n.y,width:n.width,height:n.height,sizeMode:'manual',preserveGenerationSize:true})
      if(node)workspace.applyWorkbenchCells(grid.place(op.canonicalBefore,{...op.target,id:node.id},node.id),false)
      workspace.persist();selectTool('select')
    }else if(commit){workspace.applyWorkbenchCells(committed,false);workspace.persist()}
    else{workspace.applyWorkbenchCells(op.canonicalBefore,false);workspace.cancelPointerGeometry([...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts])}
    const pointerId=op.pointerId;op=null;
    if(root.hasPointerCapture?.(pointerId))root.releasePointerCapture(pointerId)
    pending=null;preview.hidden=true;groupPreviews.splice(0).forEach(({element})=>element.remove());root.removeAttribute('data-grid-operation');root.querySelectorAll('[data-grid-active]').forEach(e=>{e.removeAttribute('data-grid-active');e.style.removeProperty('--grid-float-left');e.style.removeProperty('--grid-float-top')})
  }
  const autoScroll=()=>{
    autoFrame=0;if(!op||!lastPointer)return
    const bounds=root.getBoundingClientRect(),y=lastPointer.clientY-bounds.top
    const delta=y<48?-Math.ceil((48-y)/4):y>bounds.height-64?Math.ceil((y-bounds.height+64)/4):0
    if(delta){const before=root.scrollTop;root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),before+delta));if(root.scrollTop!==before){update(lastPointer);autoFrame=view.requestAnimationFrame(autoScroll)}}
  }
  const down=e=>{
    if(e.button===0&&e.target?.closest?.('[data-research-node-id]')&&!e.target?.closest?.('input,textarea,button,a,select,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=dialog],[role=menu]'))root.focus({preventScroll:true})
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
    const selectedIds=resize&&current.selection.selectedNodeIds.includes(id)?current.selection.selectedNodeIds.filter(selected=>{const element=root.querySelector('[data-research-node-id="'+CSS.escape(selected)+'"]');return element&&!element.hasAttribute('data-research-geometry-blocked')&&!element.hasAttribute('open')}):[id]
    op={kind:draw?'draw':resize?'resize':'move',axis:resize?.getAttribute('data-workbench-resize-axis'),selectedIds,pointerId:e.pointerId,start:point(e),width:width(),before,canonicalBefore,cell:before.find(c=>c.id===id),geometry:[...current.files,...current.artifacts]}
    if(!draw&&!op.cell){op=null;return}
    root.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e
    if(resize)for(const selected of selectedIds){if(selected===id)continue;root.querySelector('[data-research-node-id="'+CSS.escape(selected)+'"]')?.setAttribute('data-grid-active','');const element=document.createElement('div');element.className='ew-grid-placeholder';element.hidden=true;root.appendChild(element);groupPreviews.push({id:selected,element})}
    update(e);autoFrame=view.requestAnimationFrame(autoScroll)
  }
  const move=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();lastPointer=e;update(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)}
  const up=e=>{if(!op)return;e.preventDefault();e.stopImmediatePropagation();finish(true,e)}
  const cancel=e=>{if(op){e?.stopImmediatePropagation?.();finish(false,e)}}
  const key=e=>{if(e.key==='Shift'&&!e.target?.closest?.('input,textarea,[contenteditable=true]'))root.setAttribute('data-grid-multiselect','');if(op&&e.key==='Escape'){e.preventDefault();finish(false)}}
  const keyUp=e=>{if(e.key==='Shift')root.removeAttribute('data-grid-multiselect')}
  const click=e=>{if(toolRef.current==='select'&&(e.shiftKey||e.metaKey)&&e.target?.closest?.('[data-research-node-id]')&&!e.target?.closest?.('input,textarea,[contenteditable=true]')){e.preventDefault();e.stopImmediatePropagation()}}
  // Window blur is shared by embedded-content lifecycles; cancel our gesture
  // without preventing their own held-key/pointer cleanup.
  const blur=e=>{root.removeAttribute('data-grid-multiselect');if(op)finish(false,e)}
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
export function WorkbenchToolbar({rootRef,sessionId,availableWidth,bottomOffset=20,children,...props}) {
  const [bounds,setBounds]=react.useState(null)
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const measure=()=>{const r=root.getBoundingClientRect(),next={left:r.left+Math.min(r.width,availableWidth||r.width)/2,bottom:Math.max(bottomOffset,window.innerHeight-r.bottom+bottomOffset)};setBounds(previous=>previous&&previous.left===next.left&&previous.bottom===next.bottom?previous:next)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root);if(root.parentElement)observer.observe(root.parentElement)
    window.addEventListener('resize',measure)
    return()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[rootRef,availableWidth,bottomOffset])
  return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?'':undefined,'data-ework-toolbar-owner':sessionId,style:{...props.style,position:'fixed',left:bounds?.left||0,bottom:bounds?.bottom||bottomOffset,top:'auto',visibility:bounds?'visible':'hidden'},children}),document.body)
}
export function workbenchAvailableWidth(root,bounds,panelBounds) {
  return Math.max(240,Math.min(root.clientWidth||bounds.width,researchCanvasUnobscuredWidth(bounds,panelBounds)))
}
export function measureWorkbenchContents(root,nodes) {
  const measured=new Map(),cache=root?.__eworkContentMeasurements
  for(const node of nodes){
    const value=cache?.get(node.id)
    const preferred=researchOptimalDimensions({...node,width:0,height:0})
    // Header and provenance occupy 34 + 24px outside the sandbox. The sandbox
    // reports natural content bounds, never its current frame height.
    if(value&&node.containerSpec?.type==='html'&&value.html===node.containerSpec.html){measured.set(node.id,{width:preferred.width,height:value.height+58});continue}
    const card=root?.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]'),body=card?.querySelector('[data-research-preview-body]')
    if(!body||body.querySelector('iframe')||card.hasAttribute('open'))continue
    const origin=card.getBoundingClientRect();let bottom=0
    // Native tables and markdown use the same content fit policy. Read content
    // boxes rather than a stretched flex wrapper or its viewport scrollHeight.
    for(const element of body.querySelectorAll('table,svg,canvas,img,pre,p,li,input,select,textarea,h1,h2,h3,h4')){
      const bounds=element.getBoundingClientRect();if(!(bounds.height>0&&bounds.width>0))continue
      let scroll=0;for(let parent=element.parentElement;parent&&parent!==card;parent=parent.parentElement)scroll+=parent.scrollTop||0
      bottom=Math.max(bottom,bounds.bottom-origin.top+scroll)
    }
    if(bottom>0)measured.set(node.id,{width:preferred.width,height:Math.ceil(bottom+(parseFloat(root.ownerDocument.defaultView.getComputedStyle(body).paddingBottom)||0)+(card.querySelector(':scope > .odyssey-data-stamp')?24:0)+8)})
  }
  return measured
}
export function arrangeWorkbenchContents(root,workspace,measured) {
  root.__eworkContentFit?.finish()
  const before=workspace.getSnapshot(),oldNodes=[...before.files,...before.artifacts],oldCache=new Map(root.__eworkContentMeasurements),view=root.ownerDocument.defaultView
  measured.__workbenchDeferred=true
  if(!workspace.organizeCanvas(measured))return false
  const grid=createResearchGrid(),width=before.canvasSize.availableWidth||before.canvasSize.width||800,m=grid.metrics(width)
  const arranged=[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts]
  const expected=new Map(arranged.filter(n=>n.containerSpec?.type==='html').map(n=>{
    const old=oldNodes.find(o=>o.id===n.id),cache=oldCache.get(n.id),frame=root.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"] iframe[data-research-html-artifact]')
    const inset=cache?Math.max(0,old.width-cache.width):Math.max(0,n.width-(frame?.clientWidth||n.width))
    return [n.id,{html:n.containerSpec.html,width:Math.round(n.width-inset)}]
  }))
  let cells=workspace.getWorkbenchCells(),encoded=JSON.stringify(cells),done=false,nativeReady=false,settle,deadline,nativeTimer
  const unchanged=()=>JSON.stringify(workspace.getWorkbenchCells())===encoded&&expected.size===[...workspace.getSnapshot().artifacts].filter(n=>expected.has(n.id)&&n.containerSpec?.html===expected.get(n.id).html).length
  const finish=()=>{
    if(done)return;done=true;view.clearTimeout(settle);view.clearTimeout(deadline);view.clearTimeout(nativeTimer)
    root.removeEventListener('pointerdown',finish,true);view.removeEventListener('keydown',finish,true)
    if(root.__eworkContentFit===task)delete root.__eworkContentFit
    if(unchanged())workspace.persist()
  }
  const refit=(native=false)=>{
    if(done)return
    if(!unchanged()){finish();return}
    const natural=native?measureWorkbenchContents(root,[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts]):new Map()
    let complete=true
    const currentNodes=[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts]
    const next=cells.map(c=>{
      const target=expected.get(c.id),cache=root.__eworkContentMeasurements?.get(c.id)
      const matched=target&&cache?.html===target.html&&Math.abs(cache.width-target.width)<=2
      if(target&&!matched)complete=false
      const height=matched?cache.height+58:!target?natural.get(c.id)?.height:null
      return height?{...c,h:Math.max(grid.minimum(currentNodes.find(n=>n.id===c.id),m).h,Math.min(300,Math.ceil((height+m.gap)/m.step)))}:c
    })
    const measuredCells=new Map(next.map(c=>[c.id,c]))
    const packed=grid.arrange(currentNodes.map(n=>{
      const c=measuredCells.get(n.id)
      return {...n,preferred:{height:c.h*m.step-m.gap-1e-7}}
    }),next,width)
    for(const c of packed){
      const target=expected.get(c.id),previous=cells.find(old=>old.id===c.id)
      if(target&&previous&&c.w!==previous.w){target.width=Math.round(target.width+(c.w-previous.w)*m.step);complete=false}
    }
    if(JSON.stringify(packed)!==encoded){if(!workspace.applyWorkbenchCells(packed,false)){finish();return}cells=packed;encoded=JSON.stringify(cells)}
    if(complete&&nativeReady){view.clearTimeout(settle);settle=view.setTimeout(finish,240)}
  }
  const task={refit,finish};root.__eworkContentFit=task
  root.addEventListener('pointerdown',finish,true);view.addEventListener('keydown',finish,true)
  deadline=view.setTimeout(finish,1800);nativeTimer=view.setTimeout(()=>{nativeReady=true;refit(true)},380)
  refit();return true
}
export function useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef,selectTool,readOnly}) {
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    root.setAttribute('data-ework-grid','')
    const scrollbars=new Map()
    root.__eworkScrollbars=()=>{
      const cards=[...root.querySelectorAll('[data-research-node-id]')]
      for(const [card,bar] of scrollbars)if(!cards.includes(card)){bar.destroy();scrollbars.delete(card)}
      for(const card of cards){
        if(!scrollbars.has(card))scrollbars.set(card,installWorkbenchScrollbars(card,()=>card.querySelector('[data-research-preview-body]')||card.querySelector('.rScV5Q_containerDraft')||card,()=>card.getAttribute('data-selected')==='true'||card.hasAttribute('open'),()=>[card.querySelector('[data-research-preview-body]'),...card.querySelectorAll('.rScV5Q_containerTableScroll,.rScV5Q_containerMarkdown,.rScV5Q_textPreview,.rScV5Q_containerDraft,textarea,.odyssey-generation-records')],()=>card.querySelector('iframe[data-research-html-artifact]')))
        scrollbars.get(card).refresh()
      }
    }
    const contentMeasurements=new Map();root.__eworkContentMeasurements=contentMeasurements
    const contentSize=event=>{
      const data=event.data
      if(data?.type==='sherlock-workbench-history'){
        if(readOnly||Array.isArray(data)||Object.keys(data).length!==2||!['undo','redo'].includes(data.action))return
        const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source),id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id')
        if(!id||!workspace.getSnapshot().selection.selectedNodeIds.includes(id))return
        root.__eworkContentFit?.finish();root.focus({preventScroll:true});workspace[data.action]();return
      }
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==3||data.type!=='sherlock-workbench-content-size'||!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.width>2400||data.height<1||data.height>12000)return
      const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source)
      const id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id'),node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
      if(node?.containerSpec?.type==='html'){root.__eworkScrollbars?.();contentMeasurements.set(id,{html:node.containerSpec.html,width:data.width,height:data.height});root.__eworkContentFit?.refit()}
    }
    window.addEventListener('message',contentSize)
    const measure=()=>{const bounds=root.getBoundingClientRect();if(!(bounds.width>0))return;const panel=root.ownerDocument.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)'),width=workbenchAvailableWidth(root,bounds,panel?.getBoundingClientRect());if(Math.abs(width-(workspace.getSnapshot().canvasSize.availableWidth||width))>1)root.__eworkContentFit?.finish();workspace.setWorkbenchWidth(width);const size={width:bounds.width,height:bounds.height,availableWidth:width,visibleHeight:Math.max(0,Math.min(bounds.height,window.innerHeight-bounds.top))},previous=workspace.getSnapshot().canvasSize;if(Object.keys(size).some(k=>previous[k]!==size[k]))workspace.setCanvasSize(size)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root)
    window.addEventListener('resize',measure)
    const scroll=()=>{const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})}
    root.addEventListener('scroll',scroll,{passive:true})
    return()=>{root.__eworkContentFit?.finish();observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('message',contentSize);if(root.__eworkContentMeasurements===contentMeasurements)delete root.__eworkContentMeasurements;for(const bar of scrollbars.values())bar.destroy();delete root.__eworkScrollbars;root.removeEventListener('scroll',scroll);root.removeAttribute('data-ework-grid')}
  },[workspace,sessionId,readOnly])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const nodes=[...snapshot.files,...snapshot.artifacts],width=snapshot.canvasSize.availableWidth||root.clientWidth,m=createResearchGrid().metrics(width),visibleHeight=root.clientHeight||snapshot.canvasSize.visibleHeight||snapshot.canvasSize.height||700,contentBottom=Math.max(0,...nodes.map(n=>n.y+n.height/2)),bottom=contentBottom<=visibleHeight?visibleHeight:Math.ceil(contentBottom+15*m.rowStep)
    for(const [id,value] of root.__eworkContentMeasurements||[])if(!nodes.some(n=>n.id===id&&n.containerSpec?.html===value.html))root.__eworkContentMeasurements.delete(id)
    const layer=root.querySelector('[data-research-content-layer]');if(layer){layer.style.height=bottom+'px';layer.style.width=width+'px';layer.style.setProperty('--grid-gap',m.gap+'px');layer.style.setProperty('--grid-step',m.step+'px');layer.style.setProperty('--grid-pattern',workbenchGridPattern(width))}
    const viewport=snapshot.viewport;if(!root.hasAttribute('data-grid-operation')){const scrollTop=Math.max(0,Math.min(bottom-visibleHeight,-viewport.y));if(Math.abs(root.scrollTop-scrollTop)>.5)root.scrollTop=scrollTop;if(Math.abs(viewport.y+scrollTop)>.5)workspace.setViewport({x:0,y:-scrollTop,scale:1})}
    root.__eworkScrollbars?.()
  },[snapshot])
  react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly)},[workspace,sessionId,readOnly])
}
