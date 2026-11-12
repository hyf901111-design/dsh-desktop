import {workbenchScrollExtent} from './research-grid-state.mjs'
// Functions are serialized into the existing page factory. React and the trusted
// content renderers are supplied by that factory, never by an iframe.
import {researchCandleTemplate} from '../../packages/dsh-research-task-runtime/bento-layout.js'
export function workbenchRefreshTooltip(lastSuccess,now=Date.now()) {
  const at=new Date(lastSuccess).getTime()
  if(!lastSuccess||!Number.isFinite(at))return {relative:'尚未刷新',absolute:'暂无成功刷新记录'}
  const seconds=Math.max(0,Math.floor((now-at)/1000))
  const relative='上次刷新：'+(seconds<60?'刚刚':seconds<3600?Math.floor(seconds/60)+' 分钟前':seconds<86400?Math.floor(seconds/3600)+' 小时前':Math.floor(seconds/86400)+' 天前')
  return {relative,absolute:new Date(at).toLocaleString('zh-CN',{month:'long',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
}
export function workbenchRefreshState(node,binding,{rss=null,reload=false,error=''}={}) {
  const spec=node?.containerSpec||{},native=spec.type==='financial-widget'&&['watchlist','quote','indices','news','announcements'].includes(spec.widget)
  const nativeSource=native&&(spec.widget==='news'&&!spec.linkedSourceId||Array.isArray(spec.symbols)&&spec.symbols.length>0)
  // Binding snapshots come from the validated host service, not static card
  // data, generation timestamps, or a merely authored sourceBinding object.
  const bound=!native&&Boolean(binding&&binding.nodeId===node?.id)
  const url=value=>typeof value==='string'&&value.trim().length>0
  const media=['audio','youtube','iframe'].includes(spec.type)&&url(spec.url)
  const files=['files','gallery'].includes(spec.type)&&spec.items?.some(item=>url(item.url)||url(item.relativePath)||url(item.authorizationId))
  if(!(nativeSource||bound||reload||rss?.refreshable||media||files||spec.type==='calendar-tool'||node?.kind==='web-link'&&url(node.url)))return null
  const scheduled=native?spec.refreshEnabled!==false&&(spec.refreshMinutes??1)>0:bound&&binding.enabled===true&&binding.intervalMinutes>0
  const failed=Boolean(error||binding?.status==='error'||binding?.lastRefreshFailed)
  return {state:scheduled?failed?'error':'scheduled':'manual',icon:scheduled?'refresh':'refresh-manual'}
}
export function workbenchSmartCreateTarget(node){
 return node?.kind==='generated-container'&&!node.containerSpec&&node.generationStatus==='draft'&&node.containerPrompt!=='odyssey:link-draft'
}
export function workbenchHasCreateOutput(node){
 return node?.kind==='generated-container'&&node.containerSpec?.type==='financial-widget'&&['watchlist','quote'].includes(node.containerSpec.widget)
}
export function workbenchCreateSourceCount(node,nodes){
 return (node.sourceNodeIds||[]).filter(id=>workbenchHasCreateOutput(nodes.find(source=>source.id===id))).length
}
export function workbenchCanCreateFrom(source,target,nodes){
 if(!source||!workbenchSmartCreateTarget(target)||source.id===target.id||source.kind==='generated-container'&&!source.containerSpec||!source.containerSpec&&!(source.excerpt||source.name))return false
 const seen=new Set(),reachesTarget=node=>{if(node.id===target.id)return true;if(seen.has(node.id))return false;seen.add(node.id);return (node.sourceNodeIds||[]).some(id=>{const parent=nodes.find(n=>n.id===id);return parent&&reachesTarget(parent)})}
 return !reachesTarget(source)
}
export function WorkbenchCreatePort({node,side,readOnly}){
 const input=side==='input',editable=workbenchSmartCreateTarget(node),connected=input&&node.sourceNodeIds?.length>0
 return react_jsx_runtime.jsx('button',{type:'button',className:'ew-financial-port ew-create-source-port','data-financial-port':side,'data-financial-port-node':node.id,'data-workbench-create-port':side,'data-create-draft':editable||undefined,'data-connected':connected||undefined,disabled:readOnly||input&&!editable,'aria-label':workbenchText(input?'接收组件作为创建基准':'输出组件内容'),'title':workbenchText(input?'拖到组件输出节点连接基准，拖到空白处断开':'拖到智能容器左侧节点，基于此组件创建'),children:react_jsx_runtime.jsx('span',{'aria-hidden':true})})
}
export function WorkbenchSmartCreateFooter({node,readOnly,createSourceCount}){
 const count=node.sourceNodeIds?.length||0,showInput=node.creationMode!=='selection'||createSourceCount>0,status=count?workbenchText(createSourceCount?'已连接 {count} 个组件':'基于 {count} 个组件').replace('{count}',String(createSourceCount||count)):workbenchText('待创建')
 return react_jsx_runtime.jsxs('footer',{className:'ew-smart-create-footer','data-workbench-smart-footer':'','aria-label':workbenchText('智能容器底栏'),children:[showInput&&react_jsx_runtime.jsx(WorkbenchCreatePort,{node,side:'input',readOnly}),react_jsx_runtime.jsx('span',{className:'ew-smart-create-status',role:'status','aria-live':'polite',children:status})]})
}
export function controlWorkbenchWebZoom(card,step) {
  const native=card?.querySelector('[data-research-native-web]')
  if(typeof native?.__eworkAdjustWebZoom==='function')return native.__eworkAdjustWebZoom(step)
  const frame=card?.querySelector('iframe[data-research-web-frame]')
  if(!frame)return null
  const current=Number(frame.getAttribute('data-web-page-zoom'))||1
  const next=step===0?1:Math.max(.5,Math.min(2,Math.round((current+step)*10)/10))
  frame.setAttribute('data-web-page-zoom',String(next))
  frame.style.zoom=String(next)
  frame.style.width=100/next+'%';frame.style.height=100/next+'%'
  return next
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
export function installWorkbenchTitle(el){
  const text=el.firstElementChild;let animation=null;
  const stop=()=>{animation?.cancel();animation=null};
  const measure=()=>{el.dataset.overflow=String(text.scrollWidth>el.clientWidth+1);stop()};
  const start=()=>{stop();const distance=text.scrollWidth-el.clientWidth;if(distance<=1||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const travel=Math.max(1000,distance/30*1000),pause=900,total=travel*2+pause*2;
    animation=text.animate([{transform:'translateX(0)',offset:0},{transform:'translateX(0)',offset:pause/total},{transform:'translateX(-'+distance+'px)',offset:(pause+travel)/total},{transform:'translateX(-'+distance+'px)',offset:(pause*2+travel)/total},{transform:'translateX(0)',offset:1}],{duration:total,iterations:Infinity,easing:'linear'});
  };
  const observer=new ResizeObserver(measure);observer.observe(el);observer.observe(text);measure();
  el.addEventListener('mouseenter',start);el.addEventListener('mouseleave',stop);el.addEventListener('focus',start);el.addEventListener('blur',stop);document.fonts?.addEventListener('loadingdone',measure);
  return ()=>{stop();observer.disconnect();el.removeEventListener('mouseenter',start);el.removeEventListener('mouseleave',stop);el.removeEventListener('focus',start);el.removeEventListener('blur',stop);document.fonts?.removeEventListener('loadingdone',measure)};
}
export function WorkbenchTitle({title,systemTitle=false}){
  const ref=react.useRef(null);react.useEffect(()=>installWorkbenchTitle(ref.current),[title]);
  return react_jsx_runtime.jsx('span',{ref,className:'ew-grid-title',title,tabIndex:0,'data-ui-system-title':systemTitle||undefined,'data-ui-preserve':systemTitle?undefined:true,children:react_jsx_runtime.jsx('span',{className:'ew-grid-title-copy',children:title})});
}
export function WorkbenchChrome({node,sessionId,selected,readOnly,previewMode=false,expanded=false,onAsk,onMore,onRemove,onExpand,onReload,titleExtra,createSourceCount=0}) {
  const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(sessionId,node.id,fn),[sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(sessionId,node.id),[sessionId,node.id]))
  const [busy,setBusy]=react.useState(false),[error,setError]=react.useState(''),[now,setNow]=react.useState(Date.now()),[tip,setTip]=react.useState(null)
  // A later automatic success also clears a previous header-click failure.
  // Starting a retry keeps the last completed error until a result arrives.
  react.useEffect(()=>{if(['success','unchanged'].includes(binding?.status))setError('')},[binding?.status,binding?.lastSuccess,binding?.successSequence])
  const rss=componentRssStatusView(node)
  const refreshing=busy||binding?.status==='refreshing'
  const refreshState=workbenchRefreshState(node,binding,{rss,reload:typeof onReload==='function',error})
  const time=workbenchRefreshTooltip(rss?rss.lastSuccess:binding?.lastSuccess||node.lastSuccessfulAt||(node.generationStatus==='completed'&&node.deliveryStatus!=='partial'?node.generationCompletedAt:null),now)
  const refresh=async()=>{
    if(busy||readOnly)return {error:'组件当前不可刷新'}
    setBusy(true)
    let message='指标数据已更新'
    try{
      if(onReload){const result=await onReload();if(result?.error)throw Error(result.error);message=result?.message||'已请求重新载入组件'}else if(node.containerSpec?.type==='calendar-tool'){await document.querySelector('[data-research-node-id=\"'+CSS.escape(node.id)+'\"] [data-calendar-tool]')?.__eworkRefreshCalendar?.();message='日历已更新'}else if(node.containerSpec?.type==='financial-widget'){const preset=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"] [data-financial-widget]');if(!preset?.__eworkRefreshFinancial)throw Error('组件暂未就绪');const result=await preset.__eworkRefreshFinancial();if(result?.error)throw Error(result.error);message=result?.message||'已刷新通联数据'}else if(node.containerSpec?.type==='audio'){
        const player=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"] [data-research-audio-preset]')
        if(!player?.__eworkReloadAudio)throw Error('请先添加音频网址');
        player.__eworkReloadAudio();message='已请求重新加载音源'
      }else if(['files','gallery'].includes(node.containerSpec?.type)){
        const files=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"] [data-research-attachment-preset]')
        if(!files?.__eworkReloadAttachments)throw Error('原文件预览尚未就绪');
        const result=await files.__eworkReloadAttachments();if(result?.error)throw Error(result.error);message=result?.message||'已请求重新载入原文件预览'
      }else if(node.containerSpec?.type==='youtube'){
        const player=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"] [data-research-youtube-preset]')
        if(!player?.__eworkReloadYoutube)throw Error('视频尚未载入，请先添加视频网址');
        player.__eworkReloadYoutube();message='已请求重新载入视频'
      }else if(node.kind==='web-link'||node.containerSpec?.type==='iframe'){
        const frame=document.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]')
        const reload=frame?.querySelector('.rScV5Q_webFrameControls button')
        const nativeReload=frame?.querySelector('[data-research-native-web]')?.__eworkReloadWeb
        if(nativeReload)nativeReload();else if(reload)reload.click();else throw Error('网页尚未载入，请先添加网址或等待加载');
        message='已请求重新载入网页'
      }else if(/<body\b[^>]*data-sherlock-template="rss"/.test(node.containerSpec?.html??'')){await window.dshDesktop.researchRss.request({sessionId,nodeId:node.id,action:'refresh'})}
      else if(binding){const result=await window.dshDesktop.componentData.request(sessionId,{action:'refresh',nodeId:node.id});const rows=await window.dshDesktop.componentData.request(sessionId,{action:'list'});componentDataStatusStore.publish(sessionId,rows);if(result?.status==='error')throw Error(result.error||'刷新失败，保留上次数据');if(!['success','unchanged'].includes(result?.status))throw Error('刷新尚未完成，保留上次数据');if(result.status==='unchanged')message='已检查数据，指标值未变化'}
      else {openComponentData(sessionId,node);return {message:'未绑定数据源，已打开数据源设置'}}
      setError('');setNow(Date.now());window.dispatchEvent(new Event('sherlock:component-data-changed'))
      return {message}
    }catch(e){const error=e?.message||'刷新失败，保留上次数据';setError(error);return {error}}finally{setBusy(false)}
  }
  const button=(name,label,onClick,extra={})=>react_jsx_runtime.jsx('button',{type:'button','aria-label':label,onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();onClick?.(e)},...extra,children:react_jsx_runtime.jsx(WorkbenchIcon,{name})})
  const hover=kind=>e=>{setNow(Date.now());const r=e.currentTarget.getBoundingClientRect();setTip({kind,left:Math.min(r.left,window.innerWidth-340),top:r.bottom+6})}
  return react_jsx_runtime.jsxs(react.Fragment,{children:[
    workbenchSmartCreateTarget(node)&&react_jsx_runtime.jsx(WorkbenchSmartCreateFooter,{node,readOnly,createSourceCount}),
    react_jsx_runtime.jsxs('header',{className:'ew-grid-header','data-workbench-drag-handle':node.id,children:[
      refreshState&&react_jsx_runtime.jsx('span',{className:'ew-grid-refresh',onMouseEnter:hover('refresh'),onMouseLeave:()=>setTip(null),onFocus:hover('refresh'),onBlur:()=>setTip(null),children:button(refreshState.icon,'刷新组件',refresh,{disabled:readOnly||refreshing,'aria-busy':refreshing||undefined,'data-workbench-refresh':node.id,ref:el=>{if(el)el.__eworkRefresh=refresh},'data-busy':refreshing||undefined,'data-refresh-state':refreshState.state})}),
      react_jsx_runtime.jsx(WorkbenchTitle,{title:node.displayName||node.title||node.name||'组件',systemTitle:!node.displayName&&(node.containerSpec?.type==='calendar-tool'&&node.title==='日历'||node.containerSpec?.type==='financial-widget'&&node.title===financialWidgetDefaults(node.containerSpec.widget)?.title)}),
      titleExtra,
      node.containerSpec?.type==='financial-widget'&&['quote','announcements'].includes(node.containerSpec.widget)&&react_jsx_runtime.jsx(FinancialQuoteSelector,{node,sessionId,readOnly}),
      node.containerSpec?.type==='financial-widget'&&node.containerSpec.widget==='news'&&react_jsx_runtime.jsx(FinancialNewsSearch,{node,sessionId,readOnly}),
      onAsk&&button('ask','针对组件提问',()=>onAsk(node),{'data-workbench-ask':node.id,onMouseEnter:hover('ask'),onMouseLeave:()=>setTip(null),onFocus:hover('ask'),onBlur:()=>setTip(null)}),
      button('more','组件更多操作',e=>onMore(node,e),{'data-workbench-more':node.id,'aria-haspopup':'menu'}),
      (!previewMode||expanded)&&button('close',expanded?'关闭阅读':'移除组件',()=>onRemove(node),{disabled:expanded?false:readOnly})
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
    const actions=['summary','mind-map'].includes(node.containerSpec?.type)&&node.containerSpec.source?[
      entry('edit','编辑结果',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-research-derived-preset]')?.__eworkEditDerived?.()),
      entry('summary','复制完整结果',()=>navigator.clipboard.writeText(node.containerSpec.content),false,false)
    ]:node.containerSpec?.type==='audio'?[
      entry('edit','修改音频网址',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-research-audio-preset]')?.__eworkEditAudio?.()),
      entry('refresh','重新加载音源',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-workbench-refresh]')?.__eworkRefresh?.(),!node.containerSpec.url),
      entry('link','打开原音频',()=>window.open(node.containerSpec.url,'_blank','noopener,noreferrer'),!node.containerSpec.url,false)
    ]:node.containerSpec?.type==='youtube'?[
      entry('edit','修改视频网址',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-research-youtube-preset]')?.__eworkEditYoutube?.()),
      entry('refresh','重新载入视频',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-workbench-refresh]')?.__eworkRefresh?.(),!node.containerSpec.url),
      entry('link','打开原视频',()=>window.open(node.containerSpec.url,'_blank','noopener,noreferrer'),!node.containerSpec.url,false)
    ]:node.containerSpec?.type==='iframe'?[
      entry('edit','修改网址',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-research-iframe-preset]')?.__eworkEditIframe?.()),
      entry('refresh','重新载入网页',()=>trigger.closest('[data-research-node-id]')?.querySelector('[data-workbench-refresh]')?.__eworkRefresh?.(),!node.containerSpec.url),
      entry('globe','浏览器打开',()=>window.open(node.containerSpec.url,'_blank','noopener,noreferrer'),!node.containerSpec.url,false)
    ]:node.kind==='web-link'?[
      entry('rename','修改名称',()=>onFrameAction?.(node,'rename')),
      ...(researchCanvasArtifactContentEditable(node)?[entry('edit','编辑内容',()=>onFrameAction?.(node,'edit'))]:[]),
      entry('refresh','刷新',()=>onRefresh?.(node)),
      entry('globe','浏览器打开',()=>onOpenBrowser?onOpenBrowser():window.open(node.url,'_blank','noopener,noreferrer'),false,false)
    ]:node.creationMode==='selection'?[
      entry('branch','查看创建来源',onProvenance,false,false)
    ]:[
      entry('edit','编辑需求',onEdit,disabled),
      entry('refresh',shared?'重新生成':'刷新数据',()=>shared?onRefresh?.(node,node.containerPrompt):openComponentData(sessionId,node,'refresh'),disabled),
      shared?entry('data',node.refreshMinutes?'关闭旧自动刷新':'共享组件暂不支持数据自动更新',()=>onSetRefresh?.(node,0),editingPrompt||!node.refreshMinutes):entry('data','数据源与自动更新',()=>openComponentData(sessionId,node))
    ]
    trigger.__eworkWorkbenchSettings=actions
    return()=>{if(trigger.__eworkWorkbenchSettings===actions)delete trigger.__eworkWorkbenchSettings}
  },[triggerRef,sessionId,node,disabled,editingPrompt,onEdit,onRefresh,onSetRefresh,onProvenance,onFrameAction,onOpenBrowser])
}
export async function exportWorkbenchContent(card,node,format,adapters={}) {
  if(!['svg','png','jpg'].includes(format)||!card)throw Error('组件当前不可导出')
  const doc=card.ownerDocument,view=doc.defaultView,body=adapters.body||card.querySelector('[data-research-preview-body]')||card.querySelector('[data-research-native-web]')
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
  const save=adapters.save||view.dshDesktop?.researchCanvasExport?.save;if(!save)throw Error('当前客户端不支持导出')
  const result=await save(request);if(result?.status==='error')throw Error(result.message||'保存失败，请重试')
  return result
}
export async function workbenchNativeMenuIcon(button){
  const glyph=button?.querySelector('[data-workbench-icon]');if(!glyph)return
  const view=button.ownerDocument.defaultView,mask=view.getComputedStyle(glyph).maskImage,source=mask?.match(/^url\(["']?(data:image\/svg\+xml[^"']+)["']?\)$/u)?.[1]
  if(!source)return
  return new Promise(resolve=>{
    const image=new view.Image(),timer=view.setTimeout(()=>resolve(undefined),350)
    image.onload=()=>{view.clearTimeout(timer);try{const canvas=button.ownerDocument.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,32,32);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#000';ctx.fillRect(0,0,32,32);resolve(canvas.toDataURL('image/png'))}catch{resolve(undefined)}}
    image.onerror=()=>{view.clearTimeout(timer);resolve(undefined)};image.src=source
  })
}
export function mountWorkbenchNativeMenu(root,submenus,onClose,anchor){
  const bridge=window.dshDesktop?.showComponentContextMenu;if(typeof bridge!=='function'||!root)return()=>{}
  let active=true,pending=false;const menuId=window.crypto.randomUUID(),handlers=new Map(),previous=root.style.visibility
  const key=event=>{if(!active||event.isComposing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Enter','Escape'].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();void window.dshDesktop?.componentContextMenuKey?.(menuId,event.key)}
  root.ownerDocument.addEventListener('keydown',key,true)
  root.style.visibility='hidden';root.setAttribute('aria-hidden','true')
  const run=async()=>{
    const items=await Promise.all([...root.children].flatMap((row,index)=>{
      if(row.getAttribute('role')==='separator')return[{separator:true}]
      if(row.tagName!=='BUTTON')return[]
      const id='row-'+index,label=row.querySelector('span:nth-child(2)')?.textContent?.trim()||row.textContent.trim(),children=submenus[row.dataset.workbenchNativeFlyout]
      if(!label)return[]
      if(!children)handlers.set(id,()=>{if(row.isConnected&&!row.disabled)row.click()})
      return[(async()=>({id,label,disabled:row.disabled,icon:await workbenchNativeMenuIcon(row),...(children?{children:children.map((child,i)=>{
        const childId=id+'-'+i;if(!child.disabled)handlers.set(childId,child.run)
        return{id:childId,label:child.label,disabled:!!child.disabled,...(typeof child.checked==='boolean'?{checked:child.checked}:{})}
      })}:{})}))()]
    }))
    if(!active||!root.isConnected)return
    pending=true
    try{
      const box=anchor||root.getBoundingClientRect();const id=await bridge({menuId,items,dark:root.ownerDocument.body.hasAttribute('data-ds-dark-theme'),anchor:{x:box.x,y:box.y,width:box.width,height:box.height}});pending=false
      if(!active||!root.isConnected)return
      root.style.visibility=previous;root.removeAttribute('aria-hidden')
      const action=handlers.get(id);if(action)await action();else onClose()
    }catch{if(active&&root.isConnected){root.style.visibility=previous;root.removeAttribute('aria-hidden')}}
  }
  void run()
  return()=>{active=false;root.ownerDocument.removeEventListener('keydown',key,true);if(pending)void window.dshDesktop?.closeComponentContextMenu?.(menuId);root.style.visibility=previous;root.removeAttribute('aria-hidden')}
}
export function WorkbenchMenu({target,workspace,readOnly,onClose,onDerived,onLegacy,onEditSelected,onConfigureIndices}) {
  const [detail,setDetail]=react.useState(null),[exporting,setExporting]=react.useState(false),[exportError,setExportError]=react.useState(''),[saving,setSaving]=react.useState(false),[saveError,setSaveError]=react.useState(''),ref=react.useRef(null),subRef=react.useRef(null),mindRef=react.useRef(null),settingsRef=react.useRef(null),exportRef=react.useRef(null),leaveTimer=react.useRef(null)
  const trigger=kind=>kind==='mind'?mindRef:kind==='export'?exportRef:settingsRef
  const cancelLeave=()=>{clearTimeout(leaveTimer.current);leaveTimer.current=null}
  const leave=()=>{cancelLeave();leaveTimer.current=setTimeout(()=>setDetail(null),200)}
  const card=()=>target.root?(target.root.isConnected?target.root:null):document.querySelector('[data-research-node-id="'+CSS.escape(target.node.id)+'"]')
  const previewMode=workspace.getPreviewMode?.()===true
  const pptx=useComponentPptxMode(card())
  const webLink=target.node.kind==='web-link'
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
  const saveLibrary=async()=>{if(saving||readOnly)return;setSaving(true);setSaveError('');try{await customLibraryRequest({action:'save',sessionId:target.sessionId,nodeId:target.node.id});window.dispatchEvent(new CustomEvent('ework-component-library-changed'));window.dispatchEvent(new CustomEvent('ework-component-library-saved',{detail:{sessionId:target.sessionId}}));onClose()}catch(e){setSaveError(customLibraryError(e))}finally{setSaving(false)}}
  const exportAs=async format=>{if(exporting)return;cancelLeave();setExporting(true);setExportError('');try{await exportWorkbenchContent(card(),target.node,format);onClose()}catch(e){setExportError(e?.message||'导出失败，请重试')}finally{setExporting(false)}}
  const row=(icon,label,action,disabled=readOnly,attributes={})=>previewMode&&!['expand','duplicate','data'].includes(icon)&&label!=='刷新行情与资讯'?null:jsxs('button',{...attributes,type:'button',role:'menuitem',disabled,onMouseEnter:leave,onClick:()=>choose(action),children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label})]},label)
  const separator=key=>previewMode?null:jsx('div',{className:'ew-grid-divider',role:'separator'},key)
  const flyout=(kind,icon,label,trigger,disabled=false)=>previewMode&&kind!=='export'?null:jsxs('button',{ref:trigger,'data-workbench-native-flyout':kind,type:'button',role:'menuitem','aria-label':label,'aria-haspopup':'menu','aria-expanded':detail?.kind===kind,disabled,onMouseEnter:()=>openDetail(kind),onClick:()=>openDetail(kind),onKeyDown:e=>{if(e.key==='ArrowRight'){e.preventDefault();openDetail(kind,true)}},children:[jsx(WorkbenchIcon,{name:icon}),jsx('span',{children:label}),jsx('span',{children:'›'})]})
  react.useEffect(()=>mountWorkbenchNativeMenu(ref.current,{
    export:['svg','png','jpg'].map(format=>({label:format.toUpperCase(),run:()=>exportAs(format)})),
    mind:RESEARCH_MIND_MAP_DETAIL_OPTIONS.map(option=>({label:option.label,disabled:readOnly,run:()=>choose(()=>onDerived('mind-map',option.value))})),
    settings:(settings||[]).map(action=>({label:action.label,disabled:readOnly&&action.writes||action.disabled,run:()=>choose(()=>{if((!readOnly||!action.writes)&&!action.disabled)action.run?.()})}))
  },onClose,(()=>{const box=card()?.querySelector('[data-workbench-more]')?.getBoundingClientRect();return box?{x:box.right-206,y:box.top,width:206,height:box.height}:undefined})()),[target.node.id,target.sessionId,readOnly,previewMode])
  const [menuPlacement,setMenuPlacement]=react.useState(null)
  react.useLayoutEffect(()=>{
    const menu=ref.current;if(!menu)return
    const measure=()=>{
      const height=Math.min(menu.scrollHeight,window.innerHeight-16),width=menu.offsetWidth
      const next={left:Math.max(8,Math.min(window.innerWidth-width-8,target.left)),top:Math.max(8,Math.min(window.innerHeight-height-8,target.top))}
      setMenuPlacement(old=>old?.left===next.left&&old?.top===next.top?old:next)
    }
    measure();const observer=window.ResizeObserver?new window.ResizeObserver(measure):null;observer?.observe(menu);return()=>observer?.disconnect()
  },[target.left,target.top])
  const style={...(menuPlacement||{left:8,top:8}),maxHeight:'calc(100vh - 16px)',overflowY:'auto'}
  return react_dom.createPortal(jsxs(react.Fragment,{children:[jsxs('div',{ref,className:'ew-grid-menu',role:'menu','aria-label':'组件更多操作',style,onMouseLeave:leave,children:[
    card()?.querySelector('[data-research-container-expand]')&&row('expand',card()?.open?'关闭放大阅读':'放大阅读',()=>card()?.querySelector('[data-research-container-expand]')?.click(),false),
    webLink&&row('zoom-out','缩小10%',()=>controlWorkbenchWebZoom(card(),-.1),false,{'data-workbench-web-zoom':'out'}),
    webLink&&row('zoom-in','放大10%',()=>controlWorkbenchWebZoom(card(),.1),false,{'data-workbench-web-zoom':'in'}),
    webLink&&row('zoom-reset','重置页面大小',()=>controlWorkbenchWebZoom(card(),0),false,{'data-workbench-web-zoom':'reset'}),
    webLink&&row('refresh','刷新',()=>card()?.querySelector('[data-workbench-refresh="'+CSS.escape(target.node.id)+'"]')?.click(),false,{'data-workbench-web-refresh':''}),
    separator('view'),
    row('duplicate','复制组件',()=>{workspace.copySelectedNodes().then(()=>previewMode?true:workspace.pasteClipboardNodes(null)).catch(error=>console.error(error))}),
    row('rename','重命名',()=>onLegacy(target.node,target.event,'rename')),
    !previewMode&&!readOnly&&pptx?.editable&&row('edit',pptx.mode==='edit'?'关闭编辑模式':'编辑',()=>pptx.toggleMode(),pptx.modeBusy,{'data-component-pptx-menu':target.node.id}),
    canSaveCustomComponent(target.node)&&jsxs('button',{type:'button',role:'menuitem','data-workbench-save-library':target.node.id,disabled:readOnly||saving||target.node.generationStatus!=='completed',onMouseEnter:leave,onClick:saveLibrary,children:[jsx(WorkbenchIcon,{name:'library-add'}),jsx('span',{children:saving?workbenchText('保存中…'):workbenchText('添加至组件库')})]}),
    saveError&&jsx('span',{role:'alert','data-library-save-error':'',children:saveError}),
    target.node.creationMode==='selection'&&row('rename','编辑需求',()=>onEditSelected?.(target.node),readOnly||RESEARCH_ACTIVE_GENERATION_STATUSES.has(target.node.generationStatus),{'data-workbench-edit-selected-create':target.node.id}),
    target.node.creationMode==='selection'&&row('branch','查看基准',()=>{
      const root=card()?.closest('[data-research-canvas]'),current=workspace.getSnapshot(),live=new Set([...current.files,...current.artifacts].map(n=>n.id)),ids=(target.node.sourceNodeIds||[]).filter(id=>live.has(id))
      if(!ids.length)return;workspace.updateSelection(ids,'replace');root?.querySelector('[data-research-node-id="'+CSS.escape(ids[0])+'"]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});root?.focus({preventScroll:true})
    },!(target.node.sourceNodeIds||[]).some(id=>[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts].some(n=>n.id===id)),{'data-workbench-view-source':target.node.id}),
    flyout('export','download','导出',exportRef),
    separator('component'),
    flyout('mind','branch','思维导图',mindRef,readOnly),
    row('summary','总结提炼',()=>onDerived('summary')),
    row('plus','基于所选创建',()=>onDerived('create',undefined,target.node.id)),
    separator('generate'),
    target.node.containerSpec?.type==='financial-widget'&&target.node.containerSpec.widget==='indices'&&row('settings','配置指数',()=>onConfigureIndices?.(target.node.id)),
    target.node.containerSpec?.type==='financial-widget'&&row('data','数据源与自动更新',()=>card()?.querySelector('.ew-financial-provenance')?.click(),false),
    target.node.containerSpec?.type==='financial-widget'&&row('refresh','刷新行情与资讯',()=>card()?.querySelector('[data-workbench-refresh]')?.click(),readOnly),
    target.node.containerSpec?.type==='calendar-tool'&&row('schedule','新建事项',()=>card()?.querySelector('[data-calendar-add]')?.click(),readOnly),
    row('schedule','设定定时任务',()=>openComponentSchedule(target.sessionId,target.node),readOnly||RESEARCH_ACTIVE_GENERATION_STATUSES.has(target.node.generationStatus),{'data-component-schedule-open':target.node.id}),
    target.node.containerSpec?.type!=='financial-widget'&&settings?.length>0&&flyout('settings','settings','组件设置',settingsRef),
    separator('settings'),
    row('remove','移除组件',()=>workspace.removeNodes([target.node.id]))
  ]}),detail&&jsx('div',{ref:subRef,className:'ew-grid-menu ew-grid-submenu',role:'menu','aria-label':detail.kind==='mind'?'思维导图详细度':detail.kind==='export'?'导出格式':'组件设置',style:{left:detail.left,top:detail.top,width:detail.width},onMouseEnter:cancelLeave,onMouseLeave:leave,onKeyDown:e=>{if(e.key==='ArrowLeft'){e.preventDefault();cancelLeave();setDetail(null);trigger(detail.kind).current?.focus()}},children:detail.kind==='export'?[...['svg','png','jpg'].map(format=>jsx('button',{type:'button',role:'menuitem',disabled:exporting,onClick:()=>exportAs(format),children:format.toUpperCase()},format)),exportError&&jsx('span',{role:'alert',children:exportError})]:detail.kind==='mind'?RESEARCH_MIND_MAP_DETAIL_OPTIONS.map(option=>jsx('button',{type:'button',role:'menuitem',onClick:()=>choose(()=>onDerived('mind-map',option.value)),children:option.label},option.value)):settings?.map(action=>jsxs('button',{type:'button',role:'menuitem',disabled:readOnly&&action.writes||action.disabled,onClick:()=>choose(()=>{if((!readOnly||!action.writes)&&!action.disabled)action.run?.()}),children:[jsx(WorkbenchIcon,{name:action.icon}),jsx('span',{children:action.label})]},action.label))})]}),card()?.open?card():document.body)
}

export function handleWorkbenchMultiSelect(root,workspace,event) {
  if(event.button!==0||!event.shiftKey&&!event.metaKey||event.target?.closest?.('input,textarea,[contenteditable=true]'))return false
  const card=event.target?.closest?.('[data-research-node-id]');if(!card||card.hasAttribute('open'))return false
  event.preventDefault();event.stopImmediatePropagation();root.ownerDocument.defaultView.getSelection()?.removeAllRanges()
  workspace.updateSelection([card.getAttribute('data-research-node-id')],'toggle');return true
}
export function WorkbenchChromeLayer({rootRef,workspace,sessionId,snapshot,readOnly,onAsk,onDerived,onLegacy,onEditSelected}) {
  const [hosts,setHosts]=react.useState([]),[menu,setMenu]=react.useState(null),[indicesId,setIndicesId]=react.useState(null)
  const close=react.useCallback(()=>setMenu(null),[])
  const closeIndices=react.useCallback(()=>setIndicesId(null),[]),indicesNode=snapshot.artifacts.find(n=>n.id===indicesId&&n.containerSpec?.widget==='indices')
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const reconcile=()=>{const nodes=[...snapshot.files,...snapshot.artifacts],next=[]
    for(const node of nodes){const card=root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');if(!card)continue;let host=card.querySelector(':scope > .ew-grid-chrome-host');if(!host){host=document.createElement('div');host.className='ew-grid-chrome-host';card.appendChild(host)}for(const frame of card.querySelectorAll('iframe[data-research-html-artifact]'))frame.contentWindow?.postMessage({type:'sherlock-workbench-selection',selected:card.hasAttribute('open')||snapshot.selection.selectedNodeIds.includes(node.id)},'*');next.push({node,host,expanded:card.hasAttribute('open'),blocked:card.hasAttribute('data-research-geometry-blocked')})}
    setHosts(previous=>previous.length===next.length&&next.every((n,i)=>previous[i].host===n.host&&previous[i].node===n.node&&previous[i].expanded===n.expanded&&previous[i].blocked===n.blocked)?previous:next)
    };reconcile();root.addEventListener('load',reconcile,true);const observer=new MutationObserver(reconcile);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['open','data-research-geometry-blocked']});return()=>{observer.disconnect();root.removeEventListener('load',reconcile,true)}
  },[snapshot.files,snapshot.artifacts,snapshot.selection,rootRef])
  const planningNodes=workspace.getWorkbenchPlanningNodes(),selectedPlanning=planningNodes.filter(n=>snapshot.selection.selectedNodeIds.includes(n.id)&&rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"][data-research-creation-planning]:not([data-research-creation-planning=dealing])'))
  const corner=workspace.getWorkbenchStyle?.()==='openterminal'
  const resizable=readOnly||workspace.getPreviewMode?.()?[]:[...hosts.filter(n=>!n.expanded&&!n.blocked&&(corner||snapshot.selection.selectedNodeIds.includes(n.node.id))).map(n=>n.node),...selectedPlanning]
  const visibleHeight=rootRef.current?.clientHeight||snapshot.canvasSize.visibleHeight||0,contentBottom=Math.max(0,...[...snapshot.files,...snapshot.artifacts,...planningNodes].map(n=>n.y+n.height/2)),resizeBottom=visibleHeight>0&&contentBottom<=visibleHeight?visibleHeight:Infinity
  return react_jsx_runtime.jsxs(react.Fragment,{children:[react_jsx_runtime.jsx(CalendarSessionReminders,{rootRef,workspace,sessionId}),...hosts.map(({node,host,expanded})=>react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchChrome,{node,sessionId,readOnly,expanded,previewMode:workspace.getPreviewMode?.()===true,createSourceCount:workbenchCreateSourceCount(node,[...snapshot.files,...snapshot.artifacts]),selected:snapshot.selection.selectedNodeIds.includes(node.id),onAsk,onMore:(n,e)=>{if(!workspace.getSnapshot().selection.selectedNodeIds.includes(n.id))workspace.updateSelection([n.id],'replace');setMenu({node:n,sessionId,root:e.currentTarget.closest('[data-research-node-id]'),event:{clientX:e.clientX,clientY:e.clientY},left:e.currentTarget.getBoundingClientRect().right-206,top:e.currentTarget.getBoundingClientRect().bottom+5})},onRemove:n=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"]');if(card?.open)card.querySelector('[data-research-container-expand]')?.click();else workspace.removeNodes([n.id])}}),host,node.id)),rootRef.current&&react_dom.createPortal(react_jsx_runtime.jsx(WorkbenchResizeControls,{nodes:resizable,width:snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000,bottom:resizeBottom,corner}),rootRef.current),menu&&react_jsx_runtime.jsx(WorkbenchMenu,{target:menu,workspace,readOnly,onClose:close,onDerived,onLegacy,onEditSelected,onConfigureIndices:setIndicesId}),indicesNode&&react_jsx_runtime.jsx(FinancialIndicesSettings,{node:indicesNode,sessionId,rootRef,readOnly,onClose:closeIndices},'indices-settings:'+indicesId)]})
}
export function WorkbenchResizeControls({nodes,width,bottom=Infinity,corner=false}) {
  const gap=createResearchGrid().metrics(width).gap
  if(corner)return react_jsx_runtime.jsx('div',{className:'ew-grid-resize-layer',children:nodes.map(node=>react_jsx_runtime.jsx('button',{type:'button',className:'ew-grid-resize ew-grid-resize-corner','aria-label':'同时调整组件宽高',title:'拖动右下角调整宽高','data-workbench-resize':node.id,'data-workbench-resize-axis':'xy',style:{left:node.x+node.width/2-20,top:Math.min(node.y+node.height/2,bottom)-20,width:20,height:20},children:react_jsx_runtime.jsx('span',{'aria-hidden':true})},node.id+'-xy'))})
  return react_jsx_runtime.jsx('div',{className:'ew-grid-resize-layer',children:nodes.flatMap(node=>['x','y'].map(axis=>react_jsx_runtime.jsx('button',{type:'button',className:'ew-grid-resize ew-grid-resize-'+axis,'aria-label':axis==='x'?'调整组件宽度':'调整组件高度',title:axis==='x'?'拖动调整宽度':'拖动调整高度','data-workbench-resize':node.id,'data-workbench-resize-axis':axis,style:axis==='x'?{left:node.x+node.width/2,top:node.y-18,width:gap}:{left:node.x-18,top:Math.min(node.y+node.height/2,bottom-gap),height:gap},children:react_jsx_runtime.jsx('span',{'aria-hidden':true,style:axis==='x'?{width:Math.min(5,gap)}:{height:Math.min(5,gap)}})},node.id+'-'+axis)))})
}
export function handleWorkbenchWheel(root,workspace,event) {
  if(event.target?.closest?.('[role=menu],[role=dialog][open],.ew-calendar-editor,.ew-grid-menu,[data-research-create-popover],[data-research-global-toolbar]'))return
  const card=event.target?.closest?.('[data-research-node-id]'),preview=event.target?.closest?.('[data-research-preview-interactive],[data-calendar-tool]')
  const selected=card&&workspace.getSnapshot().selection.selectedNodeIds.includes(card.getAttribute('data-research-node-id'))
  if(!event.__sherlockCanvasPan&&selected&&event.target?.closest?.('[data-financial-chart]'))return
  if(!event.__sherlockCanvasPan&&selected&&preview&&!event.metaKey&&!event.ctrlKey){
    // A non-overflowing inner diagram can still have overscroll containment.
    // Route directly to the actual scroll owner instead of relying on browser
    // chaining through that diagram to its overflowing parent.
    for(let owner=event.target?.nodeType===1?event.target:event.target?.parentElement;owner;owner=owner.parentElement){
      if(researchPreviewCanConsumeWheel(owner,owner,event.deltaX||0,event.deltaY||0)){
        const vertical=Math.abs(event.deltaY||0)>=Math.abs(event.deltaX||0),unit=event.deltaMode===1?16:event.deltaMode===2?(vertical?owner.clientHeight:owner.clientWidth):1
        event.preventDefault();event.stopPropagation()
        if(vertical)owner.scrollTop+=event.deltaY*unit;else owner.scrollLeft+=event.deltaX*unit
        return
      }
      if(owner===preview)break
    }
  }
  event.preventDefault();event.stopPropagation()
  const unit=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1
  root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),root.scrollTop+(Number.isFinite(event.deltaY)?event.deltaY*unit:0)))
  const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})
}
// CSS zoom changes screen rectangles and pointer positions; grid cells and
// scroll offsets still use the canvas's unscaled CSS pixels.
export function workbenchCanvasZoom(element) {
  const root=element?.closest?.('[data-research-canvas]')??element
  return Number(root?.style?.getPropertyValue?.('zoom'))||1
}
export function workbenchCanvasPoint(root, event) {
  const bounds=root.getBoundingClientRect(),zoom=workbenchCanvasZoom(root)
  return {x:(event.clientX-bounds.left)/zoom+(root.scrollLeft||0),y:(event.clientY-bounds.top)/zoom+root.scrollTop}
}
export function installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly) {
  const grid=createResearchGrid(),view=root.ownerDocument.defaultView
  let op=null,frame=0,pending=null,autoFrame=0,lastPointer=null
  const preview=document.createElement('div');preview.className='ew-grid-placeholder';preview.hidden=true;root.appendChild(preview)
  const groupPreviews=[]
  const width=()=>Math.max(240,Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))
  const point=e=>workbenchCanvasPoint(root,e)
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
  const paint=()=>{frame=0;if(workspace.getPreviewMode?.()){finish(false);return}if(!pending||!op)return;workspace.applyWorkbenchCells(pending,false);const visible=workspace.getWorkbenchVisibleCells();show(op.kind==='draw'?op.target:visible.find(c=>c.id===op.cell.id));groupPreviews.forEach(({id,element})=>show(visible.find(c=>c.id===id),element));pending=null}
  const show=(c,element=preview)=>{if(!c)return;const m=grid.metrics(width()),n=grid.project([{id:c.id}], [c], width())[0];Object.assign(element.style,{left:n.x-n.width/2+'px',top:n.y-n.height/2+'px',width:n.width+'px',height:n.height+'px'});element.style.setProperty('--grid-gap',m.gap+'px');element.hidden=false}
  const update=(e,releasing=false)=>{
    if(!op)return
    const sample=op.lastSample,zoom=workbenchCanvasZoom(root),p=releasing&&sample?{x:sample.point.x+(e.clientX-op.lastClient.x)/zoom,y:sample.point.y+(e.clientY-op.lastClient.y)/zoom}:point(e),m=releasing&&sample?sample.metrics:grid.metrics(width());let target
    if(op.kind==='draw'&&Math.hypot(e.clientX-op.startClient.x,e.clientY-op.startClient.y)>4)op.drawn=true
    op.lastClient={x:e.clientX,y:e.clientY}
    op.lastSample={point:p,metrics:m}
    if(op.kind==='draw')target=grid.draw(op.start,p,m)
    else{const c=op.cell,dx=(p.x-op.start.x)/m.step,dy=(p.y-op.start.y)/m.rowStep,min=grid.minimum(op.geometry.find(n=>n.id===c.id),m);target=op.kind==='resize'?grid.bounded({...c,w:op.axis==='y'?c.w:Math.max(min.w,c.w+Math.round(dx)),h:op.axis==='x'?c.h:Math.max(min.h,c.h+Math.round(dy))}):grid.bounded({...c,x:c.x+Math.round(dx),y:c.y+Math.round(dy)})}
    floatCard(p)
    const anchorRow=(p.y-m.inset)/m.rowStep,targetKey=JSON.stringify([target.x,target.y,target.w,target.h,op.kind==='move'?grid.moveSlot(op.before,target,anchorRow):op.kind==='resize'?Math.round((op.axis==='x'?p.x-op.start.x:p.y-op.start.y)/m.step):0])
    if(op.targetKey===targetKey)return
    const original=op.canonicalBefore.find(c=>c.id===op.cell?.id)
    const canonicalTarget=op.kind==='draw'?target:{...target,x:op.kind==='resize'||target.x===op.cell.x?original.x:target.x,y:op.kind==='resize'?original.y:Math.max(0,original.y+target.y-op.cell.y),...(op.kind==='move'?{w:original.w,h:original.h}:op.axis==='xy'?{w:target.w===op.cell.w?original.w:target.w,h:target.h===op.cell.h?original.h:target.h}:op.axis==='x'?{w:target.w===op.cell.w?original.w:target.w,h:original.h}:{w:original.w,h:target.h===op.cell.h?original.h:target.h})}
    const groupResize=op.kind==='resize'&&op.selectedIds.length>1
    const delta=op.axis==='x'?Math.round((p.x-op.start.x)/m.step):Math.round((p.y-op.start.y)/m.rowStep)
    const proposed=(groupResize?grid.resizeSelection(op.canonicalBefore,op.selectedIds,op.axis,delta,op.geometry,op.width,op.before):op.kind==='move'?grid.move(op.canonicalBefore,canonicalTarget,op.before,target,anchorRow):op.kind==='resize'&&(op.axis==='x'||op.axis==='xy')?grid.resize(op.canonicalBefore,canonicalTarget,op.geometry,op.width):grid.place(op.canonicalBefore,canonicalTarget,target.id)).filter(c=>c.id!=='__draft__')
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
    // A resize can shrink the scroll range, or change the available viewport.
    // Neither moves the pointer. Commit its last preview rather than converting
    // the same release coordinates again in that changed coordinate system.
    if(commit&&event&&(event.clientX!==op.lastClient?.x||event.clientY!==op.lastClient?.y)){update(event,true);if(frame)view.cancelAnimationFrame(frame);frame=0}
    if(commit&&!op.target)commit=false
    if(commit&&op.kind!=='draw'&&op.resolved.every(c=>{const before=op.canonicalBefore.find(n=>n.id===c.id);return ['x','y','w','h'].every(k=>c[k]===before[k])}))commit=false
    const committed=op.resolved
    if(commit&&!allowed(committed,op.canonicalBefore))commit=false
    if(commit&&op.kind==='draw'){
      workspace.applyWorkbenchCells(op.canonicalBefore,false)
      const n=grid.project([{id:'__draft__'}],[op.target],width())[0]
      const node=workspace.createContainerDraft({x:n.x,y:n.y,width:n.width,height:n.height,sizeMode:'manual',preserveGenerationSize:op.drawn===true})
      if(node)workspace.applyWorkbenchCells(grid.place(op.canonicalBefore,{...op.target,id:node.id},node.id),false)
      workspace.persist();selectTool('select')
    }else if(commit){workspace.applyWorkbenchCells(committed,false);workspace.persist()}
    else{workspace.applyWorkbenchCells(op.canonicalBefore,false);workspace.cancelPointerGeometry([...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts])}
    let resized
    if(commit&&op.kind==='resize'&&workspace.getWorkbenchResponsiveArrange?.()){
      const previous=new Map(op.before.map(cell=>[cell.id,cell])),ids=new Set(op.selectedIds)
      resized=workspace.getWorkbenchVisibleCells().filter(cell=>ids.has(cell.id)&&previous.has(cell.id)).map(cell=>{
        const before=previous.get(cell.id)
        return {id:cell.id,w:op.axis!=='y'&&cell.w!==before.w?cell.w:undefined,h:op.axis!=='x'&&cell.h!==before.h?cell.h:undefined}
      }).filter(({w,h})=>w!==undefined||h!==undefined)
    }
    const pointerId=op.pointerId;op=null;
    if(root.hasPointerCapture?.(pointerId))root.releasePointerCapture(pointerId)
    pending=null;preview.hidden=true;groupPreviews.splice(0).forEach(({element})=>element.remove());root.removeAttribute('data-grid-operation');root.querySelectorAll('[data-grid-active]').forEach(e=>{e.removeAttribute('data-grid-active');e.style.removeProperty('--grid-float-left');e.style.removeProperty('--grid-float-top')})
    if(resized?.length)root.__eworkRequestResponsiveArrange?.(resized)
  }
  const autoScroll=()=>{
    autoFrame=0;if(!op||!lastPointer)return
    const bounds=root.getBoundingClientRect(),y=lastPointer.clientY-bounds.top
    const delta=y<48?-Math.ceil((48-y)/4):y>bounds.height-64?Math.ceil((y-bounds.height+64)/4):0
    if(delta){const before=root.scrollTop;root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),before+delta/workbenchCanvasZoom(root)));if(root.scrollTop!==before){update(lastPointer);autoFrame=view.requestAnimationFrame(autoScroll)}}
  }
  const down=e=>{
    if(e.target?.closest?.('[data-workbench-column-resize]'))return
    // Select the containing card before embedded controls intercept pointer events.
    if(toolRef.current==='select'&&handleWorkbenchMultiSelect(root,workspace,e))return
    if(e.target?.closest?.('[data-financial-widget],[data-calendar-tool]'))return
    if(e.button===0&&e.target?.closest?.('[data-research-node-id]')&&!e.target?.closest?.('input,textarea,button,a,select,summary,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=dialog],[role=menu]'))root.focus({preventScroll:true})
    if(e.button!==0||e.target?.closest?.('[data-research-global-toolbar],[role=menu],[role=dialog],.ew-grid-menu'))return
    const handle=e.target?.closest?.('[data-workbench-drag-handle]'),resize=e.target?.closest?.('[data-workbench-resize]'),card=e.target?.closest?.('[data-research-node-id]')||(resize&&root.querySelector('[data-research-node-id="'+CSS.escape(resize.getAttribute('data-workbench-resize'))+'"]'))
    const draw=toolRef.current==='component'&&!resize
    if(readOnly||workspace.getPreviewMode?.()||!draw&&(!handle&&!resize)||e.target?.closest?.('input,textarea,button,a,select,summary,[contenteditable=true]')&&!resize)return
    if(card?.hasAttribute('data-research-geometry-blocked')||card?.hasAttribute('open'))return
    root.__eworkContentFit?.finish()
    const current=workspace.getSnapshot(),canonicalBefore=workspace.getWorkbenchCells(),before=workspace.getWorkbenchVisibleCells(),id=(resize||handle)?.getAttribute(resize?'data-workbench-resize':'data-workbench-drag-handle')
    if(!draw&&!before.some(c=>c.id===id))return
    e.preventDefault();e.stopImmediatePropagation();root.focus({preventScroll:true});root.setPointerCapture?.(e.pointerId)
    if(id&&!current.selection.selectedNodeIds.includes(id))workspace.updateSelection([id],'replace')
    const selectedIds=resize&&resize.getAttribute('data-workbench-resize-axis')!=='xy'&&current.selection.selectedNodeIds.includes(id)?current.selection.selectedNodeIds.filter(selected=>{const element=root.querySelector('[data-research-node-id="'+CSS.escape(selected)+'"]');return element&&!element.hasAttribute('data-research-geometry-blocked')&&!element.hasAttribute('open')}):[id]
    op={kind:draw?'draw':resize?'resize':'move',axis:resize?.getAttribute('data-workbench-resize-axis'),selectedIds,pointerId:e.pointerId,start:point(e),startClient:{x:e.clientX,y:e.clientY},width:width(),before,canonicalBefore,cell:before.find(c=>c.id===id),geometry:[...current.files,...current.artifacts,...workspace.getWorkbenchPlanningNodes()]}
    if(!draw&&!op.cell){op=null;return}
    root.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e
    if(resize)for(const selected of selectedIds){if(selected===id)continue;root.querySelector('[data-research-node-id="'+CSS.escape(selected)+'"]')?.setAttribute('data-grid-active','');const element=document.createElement('div');element.className='ew-grid-placeholder';element.hidden=true;root.appendChild(element);groupPreviews.push({id:selected,element})}
    update(e);autoFrame=view.requestAnimationFrame(autoScroll)
  }
  const move=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();lastPointer=e;update(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)}
  const up=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();finish(true,e)}
  const cancel=e=>{if(op&&(e?.pointerId===undefined||e.pointerId===op.pointerId)){e?.stopImmediatePropagation?.();finish(false,e)}}
  const key=e=>{if(e.key==='Shift'&&!e.target?.closest?.('input,textarea,[contenteditable=true]'))root.setAttribute('data-grid-multiselect','');if(op&&e.key==='Escape'){e.preventDefault();finish(false)}}
  const keyUp=e=>{if(e.key==='Shift')root.removeAttribute('data-grid-multiselect')}
  const click=e=>{if(toolRef.current==='select'&&(e.shiftKey||e.metaKey)&&e.target?.closest?.('[data-research-node-id]')&&!e.target?.closest?.('input,textarea,[contenteditable=true]')){e.preventDefault();e.stopImmediatePropagation()}}
  // Window blur is shared by embedded-content lifecycles; cancel our gesture
  // without preventing their own held-key/pointer cleanup.
  const blur=e=>{root.removeAttribute('data-grid-multiselect');if(op)finish(false,e)}
  // Electron can lose capture before delivering the last move and pointer-up.
  // Follow the active pointer across the window until release; capture loss
  // alone is not cancellation. Escape, pointercancel and window blur still undo.
  root.addEventListener('pointerdown',down,true);root.addEventListener('click',click,true);view.addEventListener('pointermove',move,true);view.addEventListener('pointerup',up,true);view.addEventListener('pointercancel',cancel,true);view.addEventListener('blur',blur);view.addEventListener('keydown',key,true);view.addEventListener('keyup',keyUp,true)
  const offPreview=workspace.subscribePreviewCancel?.(()=>finish(false));
  return()=>{offPreview?.();finish(false);preview.remove();root.removeAttribute('data-grid-multiselect');root.removeEventListener('pointerdown',down,true);root.removeEventListener('click',click,true);view.removeEventListener('pointermove',move,true);view.removeEventListener('pointerup',up,true);view.removeEventListener('pointercancel',cancel,true);view.removeEventListener('blur',blur);view.removeEventListener('keydown',key,true);view.removeEventListener('keyup',keyUp,true)}
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
export function workbenchPreviewToolbarChildren(children,previewMode) {
 return react.Children.map(children,child=>{
  if(!previewMode||!react.isValidElement(child))return child
  const disabled=child.props['data-research-global-container']!==undefined||child.props['data-research-global-link']!==undefined||child.type===ResearchVoiceControl
  const nested=child.props.children===undefined?{}:{children:workbenchPreviewToolbarChildren(child.props.children,previewMode)}
  return react.cloneElement(child,{...nested,...(disabled?{disabled:true}:{})})
 })
}
export function WorkbenchAutoResizeNotice({rootRef,bounds,sessionId}) {
  const [notice,setNotice]=react.useState(null)
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    const show=()=>setNotice({})
    root.addEventListener('ework:manual-resize-overridden',show)
    return()=>root.removeEventListener('ework:manual-resize-overridden',show)
  },[rootRef])
  react.useEffect(()=>{
    if(!notice)return
    const timer=window.setTimeout(()=>setNotice(null),2000)
    return()=>window.clearTimeout(timer)
  },[notice])
  if(!notice||!bounds)return null
  return react_dom.createPortal(react_jsx_runtime.jsxs('div',{'data-workbench-notice':'','data-workbench-auto-resize-notice':'','data-ework-toolbar-owner':sessionId,style:{position:'fixed',left:bounds.left,bottom:bounds.bottom+66,'--ework-toolbar-available-width':bounds.width+'px'},children:[
    react_jsx_runtime.jsx('span',{role:'status',children:workbenchText('当前已开启自动整理，手动整理可能失效')}),
    react_jsx_runtime.jsx('button',{type:'button','aria-label':workbenchText('关闭提示'),onClick:()=>{setNotice(null);rootRef.current?.focus({preventScroll:true})},children:react_jsx_runtime.jsx('span',{'aria-hidden':true,children:'×'})})
  ]}),document.body)
}
export function WorkbenchToolbar({rootRef,sessionId,workspace,availableWidth,bottomOffset=20,children,...props}) {
  const previewMode=react.useSyncExternalStore(workspace?.subscribePreviewMode||(()=>()=>{}),workspace?.getPreviewMode||(()=>false),workspace?.getPreviewMode||(()=>false))
  const [bounds,setBounds]=react.useState(null)
  react.useEffect(()=>{
    const root=rootRef.current;if(!root)return
    if(bottomOffset===20)root.setAttribute('data-workbench-toolbar-space','')
    const measure=()=>{const r=root.getBoundingClientRect(),width=Math.min(r.width,availableWidth?availableWidth*workbenchCanvasZoom(root):r.width),panelHeight=parseFloat(root.ownerDocument.defaultView?.getComputedStyle(root.ownerDocument.documentElement).getPropertyValue('--dsh-sidebar-height')||'0')||0,next={left:r.left+width/2,bottom:Math.max(bottomOffset+panelHeight,window.innerHeight-r.bottom+bottomOffset),width:Math.max(120,width-24)};setBounds(previous=>previous&&previous.left===next.left&&previous.bottom===next.bottom&&previous.width===next.width?previous:next)}
    measure();const observer=new ResizeObserver(measure);observer.observe(root);if(root.parentElement)observer.observe(root.parentElement)
    const panelObserver=new MutationObserver(measure);panelObserver.observe(root.ownerDocument.documentElement,{attributes:true,attributeFilter:['style']})
    window.addEventListener('resize',measure)
    return()=>{observer.disconnect();panelObserver.disconnect();window.removeEventListener('resize',measure);if(bottomOffset===20)root.removeAttribute('data-workbench-toolbar-space')}
  },[rootRef,availableWidth,bottomOffset])
  return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?'':undefined,'data-ework-toolbar-owner':sessionId,'data-toolbar-overflow':bottomOffset===20&&bounds?.width<375||undefined,style:{...props.style,'--ework-toolbar-available-width':bounds?.width+'px',position:'fixed',left:bounds?.left||0,bottom:bounds?.bottom||bottomOffset,top:'auto',visibility:bounds?'visible':'hidden'},children:bottomOffset===20&&workspace?(function(){const tools=react.Children.toArray(workbenchPreviewToolbarChildren(children,previewMode)),index=tools.findIndex(c=>c.type===WorkbenchArrangeTool);tools.splice(index>=0?index+1:2,0,react_jsx_runtime.jsx(FinancialLibrary,{rootRef,workspace,sessionId},'financial-library'));return [...tools,react_jsx_runtime.jsx(WorkbenchStylePicker,{workspace},'workbench-style'),react_jsx_runtime.jsx(WorkbenchAutoResizeNotice,{rootRef,bounds,sessionId},'auto-resize-notice:'+sessionId)]})():children}),document.body)
}
export function workbenchAvailableWidth(root,bounds,panelBounds) {
  const zoom=workbenchCanvasZoom(root)
  return Math.max(240,Math.min(root.clientWidth||bounds.width/zoom,researchCanvasUnobscuredWidth(bounds,panelBounds)/zoom))
}
export function workbenchNativeTableFit(node,tableRoot) {
  const size=workbenchNativeTableDimensions(tableRoot)
  if(!size||!node?.containerSpec)return null
  // Native views have no HTML identity. Use the same content-key protocol as
  // other native layouts, and allow both growing pages and shorter last pages.
  return {...(node.containerSpec.type==='html'?{html:node.containerSpec.html}:{native:true,contentKey:JSON.stringify(node.containerSpec)}),width:node.width,height:size.height,layoutFit:true}
}
export function workbenchNativeTableDimensions(tableRoot) {
  if(tableRoot?.getAttribute('data-sherlock-market-native')!=='table'||!(tableRoot.getBoundingClientRect().width>0))return null
  const view=tableRoot.ownerDocument.defaultView,zoom=workbenchCanvasZoom(tableRoot),pixels=value=>Math.max(0,parseFloat(value)||0)
  const insets=element=>{const s=view.getComputedStyle(element);return pixels(s.paddingTop)+pixels(s.paddingBottom)+pixels(s.borderTopWidth)+pixels(s.borderBottomWidth)}
  const margins=element=>{const s=view.getComputedStyle(element);return pixels(s.marginTop)+pixels(s.marginBottom)}
  const children=Array.from(tableRoot.children).filter(el=>view.getComputedStyle(el).display!=='none')
  let height=insets(tableRoot)+Math.max(0,children.length-1)*pixels(view.getComputedStyle(tableRoot).rowGap)
  for(const element of children){
    let natural=element.getBoundingClientRect().height/zoom
    if(element.classList.contains('fund-native-table-wrap')){
      const table=element.querySelector('table'),rows=Array.from(table?.querySelectorAll('tbody tr')||[])
      natural=((table?.querySelector('thead')?.getBoundingClientRect().height||0)+rows.reduce((n,row)=>n+row.getBoundingClientRect().height,0))/zoom+insets(element)
      if(element.scrollWidth>element.clientWidth+1)natural+=16
    }else if(element.classList.contains('terminal-native-context'))natural=Math.min(240,Math.max(natural,element.scrollHeight)+pixels(view.getComputedStyle(element).borderTopWidth))
    else if(element.classList.contains('terminal-native-readout'))natural=Math.min(136,Math.max(natural,element.scrollHeight))
    height+=natural+margins(element)
  }
  const bounds=tableRoot.getBoundingClientRect(),card=tableRoot.closest('[data-research-node-id]')
  // The native renderer can sit inside an inset host content wrapper. Measure
  // that chrome too; it is additional to the table's own padding and source.
  const chrome=card?Math.max(58,Math.min(200,Math.ceil((card.getBoundingClientRect().height-bounds.height)/zoom))):58
  return {width:656,height:Math.min(tableRoot.querySelector('.terminal-table-pagination')?12000:840,Math.max(160,Math.ceil(height+chrome)))}
}
export function workbenchMeasuredDimensions(node,value,width=value?.width||node.width) {
  const preferred=researchOptimalDimensions({...node,width:0,height:0})
  if(researchCandleTemplate(node))return preferred
  const metrics=/<body\b[^>]*data-sherlock-market="metrics"/.test(node.containerSpec?.html||'')
    ?researchMarketDimensions(node,true,width):null
  const table=/<body\b[^>]*data-sherlock-market="table"/.test(node.containerSpec?.html||'')
    ?researchMarketDimensions(node,true,width):null
  // The explicit metrics measurement covers complete max-content tracks and
  // provenance. Its actual height replaces the conservative starting estimate.
  // Older clipped viewport reports still need that estimate as a safety floor.
  const floor=value?.intrinsicMetrics===true||table&&value?.intrinsicTable===true?160:table?.height||metrics?.height||0
  const snapshot=/<body\b[^>]*data-sherlock-market="(?:share-statistics|market-overview|currency-snapshot|watchlist|price-performance|valuation-multiples|price-target|company-profile|financial-statements|revenue-geography|revenue-business|dividends|stock-splits|insider-trading|institutional-ownership|stock-ownership|company-filings|historical-price|charting)"/.test(node.containerSpec?.html||'')
  const chrome=value?.chromeHeight??(snapshot?68:58)
  const height=Math.max(floor,value?.height?value.height+chrome:preferred.height)
  // Ordinary table pages use their measured row count, including a user-selected
  // 50/100-row page. Quote metrics retain their bounded reading viewport.
  return {width:preferred.width,height:table&&value?.intrinsicTable===true?Math.min(12000,height):metrics||table?Math.min(840,height):height}
}
export function measureWorkbenchContents(root,nodes,availableHeight=0) {
  const measured=new Map(),cache=root?.__eworkContentMeasurements
  for(const node of nodes){
    // A loading frame contains a viewport-sized SVG/grid, not generated
    // content. Measuring it feeds its own height back into every Arrange.
    if(node.kind==='planning-card'||node.kind==='generated-container'&&!node.containerSpec){measured.set(node.id,{width:656,height:node.kind==='planning-card'?220:320});continue}
    const value=cache?.get(node.id)
    const preferred=researchOptimalDimensions({...node,width:0,height:0})
    // Fixed presets keep their approved reading area even when offscreen or paused.
    if(['financial-widget','calendar-tool'].includes(node.containerSpec?.type)||researchCandleTemplate(node)){measured.set(node.id,preferred);continue}
    // Header and provenance occupy 34 + 24px outside the sandbox. The sandbox
    // reports natural content bounds, never its current frame height.
    if(value&&node.containerSpec?.type==='html'&&value.html===node.containerSpec.html){measured.set(node.id,workbenchMeasuredDimensions(node,value));continue}
    // Offscreen custom documents may be paused and have no current intrinsic
    // report. Keep their confirmed reading space until they load; falling back
    // to a generic 260px box would hide most of a timeline or evidence table.
    // Native market templates retain their own template sizing policy.
    if(node.containerSpec?.type==='html'&&!/<body\b[^>]*data-sherlock-(?:market=|template="kpi")/.test(node.containerSpec.html||'')){
      measured.set(node.id,{width:preferred.width,height:Math.max(preferred.height,node.height||0)});continue
    }
    const card=root?.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]'),body=card?.querySelector('[data-research-preview-body]')
    if(node.containerSpec?.type==='youtube'&&node.containerSpec.url){
      // The official video has a stable aspect ratio, independent of the
      // manually resized frame. Refit it at the arranged available width.
      const player=body?.querySelector('[data-youtube-player]')
      const width=(player?.getBoundingClientRect().width||0)/workbenchCanvasZoom(root)||Math.max(200,(body?.clientWidth||node.width)-20)
      // The loaded column has natural height: expanded supplied notes and
      // subtitles, wrapped actions and thumbnails must remain readable too.
      const naturalHeight=body?.querySelector('.ew-youtube-loaded')?.offsetHeight||0
      measured.set(node.id,{width:preferred.width,height:Math.max(340,38+naturalHeight,Math.ceil(Math.max(200,width*9/16)+38+12+40+(node.containerSpec.description||node.containerSpec.subtitles||node.containerSpec.thumbnailUrl?26:0)))})
      continue
    }
    // The native plot fills its frame. Base the responsive height on the
    // visible canvas and leave additional space for any open data viewport.
    if(node.containerSpec?.type==='chart'&&(availableHeight>0||body&&!card.hasAttribute('open')&&!body.querySelector('iframe,[data-research-native-web]'))){
      const details=body?.querySelector('.odyssey-native-chart-data[open]>div')
      const detailHeight=details?Math.min(180,Math.max(0,details.getBoundingClientRect().height/workbenchCanvasZoom(root))):0
      const plotHeight=availableHeight>0?Math.min(preferred.height,Math.max(280,Math.round(availableHeight*.72))):preferred.height
      measured.set(node.id,{width:preferred.width,height:plotHeight+detailHeight});continue
    }
    // Both iframe engines show a viewport rather than the page's intrinsic
    // content. Native snapshots are images of that viewport, so they must not
    // replace the readable template height after a manual resize.
    if(!body||body.querySelector('iframe,[data-research-native-web]')||card.hasAttribute('open'))continue
    const nativeRoot=body.querySelector('[data-sherlock-market-native="table"]')
    if(nativeRoot){const size=workbenchNativeTableDimensions(nativeRoot);if(size){measured.set(node.id,size);continue}}
    const attachments=body.querySelector('[data-research-attachment-preset]');
    if(attachments){measured.set(node.id,{width:preferred.width,height:Math.max(180,38+Math.max(attachments.offsetHeight,attachments.scrollHeight)+(card.querySelector('.odyssey-data-stamp')?24:0))});continue}
    const audio=body.querySelector('[data-research-audio-preset]')
    if(audio){
      let inset=0
      for(let parent=audio.parentElement;parent&&parent!==card;parent=parent.parentElement){
        const style=root.ownerDocument.defaultView.getComputedStyle(parent)
        inset+=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0)
        if(parent===body)break
      }
      measured.set(node.id,{width:preferred.width,height:Math.max(264,38+Math.max(audio.offsetHeight,audio.scrollHeight)+inset+(card.querySelector('.odyssey-data-stamp')?24:0))})
      continue
    }
    const derived=body.querySelector('[data-research-derived-preset]')
    if(derived){
      // Branch backgrounds, source controls and open original text belong to
      // the content box even when the last leaf is much shorter than its card.
      measured.set(node.id,{width:preferred.width,height:38+Math.max(derived.offsetHeight,derived.scrollHeight)+(card.querySelector('.odyssey-data-stamp')?24:0)})
      continue
    }
    const origin=card.getBoundingClientRect();let bottom=0
    // Native tables and markdown use the same content fit policy. Read content
    // boxes rather than a stretched flex wrapper or its viewport scrollHeight.
    for(const element of body.querySelectorAll('table,svg,canvas,img,pre,p,li,input,select,textarea,h1,h2,h3,h4')){
      const bounds=element.getBoundingClientRect();if(!(bounds.height>0&&bounds.width>0))continue
      let scroll=0;for(let parent=element.parentElement;parent&&parent!==card;parent=parent.parentElement)scroll+=parent.scrollTop||0
      bottom=Math.max(bottom,(bounds.bottom-origin.top)/workbenchCanvasZoom(root)+scroll)
    }
    if(bottom>0)measured.set(node.id,{width:preferred.width,height:Math.ceil(bottom+(parseFloat(root.ownerDocument.defaultView.getComputedStyle(body).paddingBottom)||0)+(card.querySelector(':scope > .odyssey-data-stamp')?24:0)+8)})
  }
  return measured
}
export function useWorkbenchArrangePreview(node) {
  const current=()=>[...document.querySelectorAll('[data-research-canvas]')].some(root=>root.__eworkContentFit?.ids?.includes(node.id))
  const [active,setActive]=react.useState(current)
  react.useLayoutEffect(()=>{
    // A completed last panel can mount after the preview-start event. Read
    // the same resident task so its offscreen HTML still participates in fit.
    setActive(current())
    const receive=event=>{if(event.detail?.ids?.includes(node.id))setActive(event.detail.active===true)}
    window.addEventListener('ework:arrange-preview',receive)
    return()=>window.removeEventListener('ework:arrange-preview',receive)
  },[node.id])
  return active&&node.containerSpec?.type!=='web'
}
export function arrangeWorkbenchContents(root,workspace,measured,mode='standard',options={}) {
  if(options.focus!==false)root.focus({preventScroll:true})
  const responsive=mode==='auto',previousFit=root.__eworkContentFit
  previousFit?.finish(!previousFit.responsive)
  const before=workspace.getSnapshot(),oldNodes=[...before.files,...before.artifacts],oldCache=new Map(root.__eworkContentMeasurements),view=root.ownerDocument.defaultView
  const activeTab=workspace.getActiveBoardTab?.(),availableHeight=responsive?(before.canvasSize.visibleHeight||before.canvasSize.height):0
  // The grid belongs to the active page, while the snapshot also contains
  // navigation and every other page. Include offscreen cards and planning
  // reservations in this grid, but never refit or preview another page.
  const currentGridNodes=()=>{
    const snapshot=workspace.getSnapshot(),ids=new Set(workspace.getWorkbenchCells().map(c=>c.id))
    return [...snapshot.files,...snapshot.artifacts,...(workspace.getWorkbenchPlanningNodes?.()??[])].filter(n=>ids.has(n.id))
  }
  // The completed example becomes an ordinary user board. Its persisted
  // metadata alone must not keep overriding future user-chosen Standard rows.
  const authoredBoard=Boolean(root.closest('[data-home-guide][data-kind="board"]'))
  if(responsive)measured=measureWorkbenchContents(root,currentGridNodes(),availableHeight)
  measured.__homeGuideBoardLayout=authoredBoard
  measured.__workbenchDeferred=true
  if(!workspace.organizeCanvas(measured,mode,typeof researchPreviewArrangeToken==='undefined'?undefined:researchPreviewArrangeToken))return false
  const grid=createResearchGrid(),availableWidth=Math.min(before.canvasSize.width||800,before.canvasSize.availableWidth||Infinity),width=workspace.getWorkbenchContentWidth?.(availableWidth)??availableWidth,m=grid.metrics(width)
  const arranged=currentGridNodes()
  const expected=new Map(arranged.filter(n=>n.containerSpec?.type==='html'&&!researchCandleTemplate(n)&&!root.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"] [data-sherlock-market-native]')).map(n=>{
    const old=oldNodes.find(o=>o.id===n.id),cache=oldCache.get(n.id),frame=root.querySelector('[data-research-node-id="'+CSS.escape(n.id)+'"] iframe[data-research-html-artifact]')
    const inset=cache?Math.max(0,old.width-cache.width):Math.max(0,n.width-(frame?.clientWidth||n.width))
    return [n.id,{html:n.containerSpec.html,width:Math.round(n.width-inset)}]
  }))
  let cells=workspace.getWorkbenchCells(),encoded=JSON.stringify(cells),done=false,nativeReady=false,settle,deadline,nativeTimer
  const unchanged=()=>workspace.getActiveBoardTab?.()===activeTab&&JSON.stringify(workspace.getWorkbenchCells())===encoded&&expected.size===[...workspace.getSnapshot().artifacts].filter(n=>expected.has(n.id)&&n.containerSpec?.html===expected.get(n.id).html).length
  const finishOnTabChange=event=>{if(event.target?.closest?.('[data-board-tab]'))finish()}
  const finish=(save=true)=>{
    if(done)return;done=true;view.clearTimeout(settle);view.clearTimeout(deadline);view.clearTimeout(nativeTimer)
    root.removeEventListener('pointerdown',finishOnTabChange,true);view.removeEventListener('keydown',finish,true)
    if(root.__eworkContentFit===task)delete root.__eworkContentFit
    view.dispatchEvent(new view.CustomEvent('ework:arrange-preview',{detail:{ids:arranged.map(n=>n.id),active:false}}))
    const durable=save!==false&&unchanged()&&(responsive?workspace.saveWorkbenchResponsiveLayout():workspace.persist())
    options.onFinish?.(durable===true)
  }
  const refit=(native=false)=>{
    if(done)return
    if(!unchanged()){finish();return}
    const currentNodes=currentGridNodes()
    const natural=native||nativeReady?measureWorkbenchContents(root,currentNodes,availableHeight):new Map()
    let complete=true
    const next=cells.map(c=>{
      const target=expected.get(c.id),cache=root.__eworkContentMeasurements?.get(c.id)
      const node=currentNodes.find(n=>n.id===c.id)
      const card=root.querySelector('[data-research-node-id="'+CSS.escape(c.id)+'"]'),frame=card?.querySelector('iframe[data-research-html-artifact]')
      const cardWidth=(card?.getBoundingClientRect().width||0)/workbenchCanvasZoom(root),rendered=!cardWidth||node&&Math.abs(cardWidth-node.width)<=2
      // First-load offscreen frames have no cached inset. Once mounted, use
      // their actual inner width; do not mistake card padding for stale data.
      if(target&&rendered&&frame?.clientWidth>0)target.width=Math.round(frame.clientWidth)
      const matched=target&&rendered&&cache?.html===target.html&&Math.abs(cache.width-target.width)<=2
      if(target&&!matched)complete=false
      const nativeCard=root.querySelector('[data-research-node-id="'+CSS.escape(c.id)+'"] [data-sherlock-market-native]')
      if(target&&nativeCard){expected.delete(c.id);complete=false}
      const height=matched?workbenchMeasuredDimensions(node,cache,target.width).height:!target||nativeCard?natural.get(c.id)?.height:null
      return height?{...c,h:Math.max(grid.minimum(currentNodes.find(n=>n.id===c.id),m).h,Math.min(300,Math.ceil((height+m.gap)/m.step)))}:c
    })
    const measuredCells=new Map(next.map(c=>[c.id,c]))
    const packed=grid.arrange(currentNodes.map(n=>{
      const c=measuredCells.get(n.id)
      return {...n,preferred:{height:c.h*m.step-m.gap-1e-7}}
    }),next,width,0,mode,{authoredBoard})
    for(const c of packed){
      const target=expected.get(c.id),previous=cells.find(old=>old.id===c.id)
      if(target&&previous&&c.w!==previous.w){target.width=Math.round(target.width+(c.w-previous.w)*m.step);complete=false}
    }
    if(JSON.stringify(packed)!==encoded){if(!workspace.applyWorkbenchCells(packed,false,typeof researchPreviewArrangeToken==='undefined'?undefined:researchPreviewArrangeToken,true)){finish();return}cells=packed;encoded=JSON.stringify(cells)}
    options.onLayout?.()
    if(complete&&nativeReady){view.clearTimeout(settle);settle=view.setTimeout(finish,240)}
  }
  const task={refit,finish,responsive,ids:arranged.map(n=>n.id)};root.__eworkContentFit=task
  view.dispatchEvent(new view.CustomEvent('ework:arrange-preview',{detail:{ids:arranged.map(n=>n.id),active:true}}))
  root.addEventListener('pointerdown',finishOnTabChange,true);if(!responsive)view.addEventListener('keydown',finish,true)
  deadline=view.setTimeout(finish,6000);nativeTimer=view.setTimeout(()=>{nativeReady=true;refit(true)},380)
  refit();return true
}
export function installWorkbenchResponsiveArrange(root,workspace) {
  const view=root.ownerDocument.defaultView, specs=new WeakMap()
  let frame=null,last=null,pendingResize=null
  const schedule=()=>{
    if(!workspace.getWorkbenchResponsiveArrange()){last=null;pendingResize=null;return}
    if(frame!==null)return
    frame=view.requestAnimationFrame(()=>{
      frame=null
      if(!root.isConnected||!workspace.getWorkbenchResponsiveArrange()||root.hasAttribute('data-grid-operation'))return
      const snapshot=workspace.getSnapshot(),size=snapshot.canvasSize
      if(!(size.width>0&&root.clientWidth>0))return
      const width=Math.min(size.width,size.availableWidth||Infinity),ids=new Set(workspace.getWorkbenchCells().map(c=>c.id))
      const nodes=[...snapshot.files,...snapshot.artifacts,...(workspace.getWorkbenchPlanningNodes?.()??[])].filter(node=>ids.has(node.id))
      if(!nodes.length){last=null;return}
      // Ignore selection, scroll and projected cell coordinates. Repacking in
      // response to its own geometry would fight content measurement.
      const sizeKey=[workspace.getActiveBoardTab?.(),Math.round(workspace.getWorkbenchContentWidth?.(width)??width),Math.round(size.visibleHeight||size.height)].join(':')
      const inputs=nodes.map(n=>{
        const spec=n.containerSpec
        if(spec&&!specs.has(spec))specs.set(spec,JSON.stringify(spec))
        return [n.id,n.kind,n.title,n.excerpt,spec&&specs.get(spec),n.generationStatus]
      })
      if(last?.sizeKey===sizeKey&&inputs.length===last.inputs.length&&inputs.every((input,i)=>input.every((value,j)=>value===last.inputs[i][j])))return
      last={sizeKey,inputs}
      const pending=workspace.pendingWorkbenchArrange()
      const resize=pendingResize;pendingResize=null
      let notified=false
      const onLayout=resize?()=>{
        if(notified||!root.isConnected||!workspace.getWorkbenchResponsiveArrange()||root.hasAttribute('data-grid-operation')||workspace.getActiveBoardTab?.()!==resize.tab)return
        const visible=new Map(workspace.getWorkbenchVisibleCells().map(cell=>[cell.id,cell]))
        if(resize.sizes.some(({id,w,h})=>{const cell=visible.get(id);return cell&&(w!==undefined&&w!==cell.w||h!==undefined&&h!==cell.h)})){
          notified=true
          root.dispatchEvent(new view.Event('ework:manual-resize-overridden'))
        }
      }:undefined
      arrangeWorkbenchContents(root,workspace,null,'auto',{focus:false,onLayout,onFinish:durable=>{if(durable&&pending.length)workspace.consumeWorkbenchArrange(pending)}})
    })
  }
  // Carry the release dimensions through the same deferred pass that reapplies
  // the automatic layout. Ordinary resize/content observers have no gesture.
  const request=sizes=>{if(sizes?.length)pendingResize={sizes,tab:workspace.getActiveBoardTab?.()};last=null;schedule()}
  const gestureEnd=()=>{if(root.hasAttribute('data-grid-operation'))request()}
  root.__eworkRequestResponsiveArrange=request
  const unsubscribe=workspace.subscribe(schedule)
  view.addEventListener('pointerup',gestureEnd,true)
  view.addEventListener('pointercancel',gestureEnd,true)
  schedule()
  return()=>{
    unsubscribe()
    if(frame!==null)view.cancelAnimationFrame(frame)
    view.removeEventListener('pointerup',gestureEnd,true)
    view.removeEventListener('pointercancel',gestureEnd,true)
    if(root.__eworkRequestResponsiveArrange===request)delete root.__eworkRequestResponsiveArrange
  }
}
export function WorkbenchArrangeIcon({mode}) {
  const divider={auto:'M7 12h10M9.5 9.5 7 12l2.5 2.5m5-5 2.5 2.5-2.5 2.5',standard:'M12 3.5v17M12 12h8.5',three:'M9.167 3.5v17M14.833 3.5v17',two:'M12 3.5v17',one:'M3.5 12h17'}[mode]
  return react_jsx_runtime.jsxs('svg',{'aria-hidden':true,className:'ew-arrange-layout-icon',width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round',children:[react_jsx_runtime.jsx('rect',{x:3.5,y:3.5,width:17,height:17,rx:2}),react_jsx_runtime.jsx('path',{d:divider})]})
}
export function WorkbenchArrangeTool({rootRef,workspace,nodes,sessionId,disabled,onArrange}) {
  useWorkbenchLocale()
  const responsive=react.useSyncExternalStore(workspace.subscribe,workspace.getWorkbenchResponsiveArrange,workspace.getWorkbenchResponsiveArrange)
  const [manualMode,setMode]=react.useState('standard'),[open,setOpen]=react.useState(false),mode=responsive?'auto':manualMode
  const groupRef=react.useRef(null),toggleRef=react.useRef(null),menuRef=react.useRef(null)
  const options=[['auto','自动整理'],['standard','标准整理'],['three','三排整理'],['two','双排整理'],['one','单排整理']],label=options.find(o=>o[0]===mode)[1]
  react.useEffect(()=>{setMode('standard');setOpen(false)},[sessionId,workspace])
  react.useEffect(()=>{if(disabled)setOpen(false)},[disabled])
  react.useLayoutEffect(()=>{
    if(!open)return
    const doc=rootRef.current.ownerDocument,view=doc.defaultView,menu=menuRef.current
    const place=()=>{const r=groupRef.current.getBoundingClientRect(),size=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,view.innerWidth-size.width-8))+'px';menu.style.top=Math.max(8,r.top-size.height-8)+'px'}
    const outside=e=>{if(!groupRef.current?.contains(e.target)&&!menu.contains(e.target))setOpen(false)}
    place();menu.querySelector('[aria-checked="true"]')?.focus({preventScroll:true})
    doc.addEventListener('pointerdown',outside,true);view.addEventListener('resize',place);doc.addEventListener('scroll',place,true)
    return()=>{doc.removeEventListener('pointerdown',outside,true);view.removeEventListener('resize',place);doc.removeEventListener('scroll',place,true)}
  },[open,rootRef])
  const run=next=>{
    if(disabled||!rootRef.current)return
    if(next==='auto'){
      if(!workspace.setWorkbenchResponsiveArrange(true))return
      rootRef.current.__eworkRequestResponsiveArrange?.()
      setOpen(false);toggleRef.current?.focus({preventScroll:true})
      onArrange(workbenchText('已开启自动整理'))
      return
    }
    const requested={three:3,two:2,one:1}[next],lanes=Math.min(requested||1,nodes.length)
    if(requested>1&&lanes>1){
      const size=workspace.getSnapshot().canvasSize,availableWidth=Math.max(240,Math.min(size.width||800,size.availableWidth||Infinity)),width=workspace.getWorkbenchContentWidth?.(availableWidth)??availableWidth
      const grid=createResearchGrid(),metrics=grid.metrics(width),minimum=Math.max(metrics.minColumns,...nodes.map(node=>grid.minimum(node,metrics).w))
      if(Math.floor(40/lanes)<minimum){
        setOpen(false)
        onArrange(workbenchText(next==='three'?'画布宽度不足，无法进行三排整理，请扩大画布后重试':'画布宽度不足，无法进行双排整理，请扩大画布后重试'),'error')
        toggleRef.current?.focus({preventScroll:true})
        return
      }
    }
    if(!workspace.setWorkbenchResponsiveArrange(false))return
    if(!arrangeWorkbenchContents(rootRef.current,workspace,measureWorkbenchContents(rootRef.current,nodes),next))return
    setMode(next);setOpen(false)
    const title=options.find(o=>o[0]===next)[1]
    onArrange(workbenchText(title)+' · '+workbenchText('已整理 '+nodes.length+' 个组件'))
  }
  const keyDown=e=>{
    const buttons=[...menuRef.current.querySelectorAll('[role=menuitemradio]')],index=buttons.indexOf(e.currentTarget.ownerDocument.activeElement)
    if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();e.stopPropagation();setOpen(false);toggleRef.current.focus({preventScroll:true});return}
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?(index+1)%buttons.length:e.key==='ArrowUp'?(index+buttons.length-1)%buttons.length:null
    if(next!==null){e.preventDefault();e.stopPropagation();buttons[next].focus({preventScroll:true})}
  }
  return react_jsx_runtime.jsxs('div',{ref:groupRef,className:'ew-arrange-tool','data-arrange-mode':mode,children:[
    react_jsx_runtime.jsx('button',{type:'button','data-research-global-arrange':'','aria-label':workbenchText('一键整理画布'),'data-tool-tooltip':workbenchText(label),disabled,onClick:()=>run(mode),children:react_jsx_runtime.jsx(WorkbenchArrangeIcon,{mode})}),
    react_jsx_runtime.jsx('button',{ref:toggleRef,type:'button','data-workbench-arrange-toggle':'','aria-label':workbenchText('展开整理选项'),'aria-haspopup':'menu','aria-expanded':open,disabled,onClick:()=>setOpen(!open),onKeyDown:e=>{if(!disabled&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();setOpen(true)}},children:react_jsx_runtime.jsx('svg',{'aria-hidden':true,width:10,height:10,viewBox:'0 0 10 10',fill:'none',stroke:'currentColor',strokeWidth:.9,strokeLinecap:'round',strokeLinejoin:'round',children:react_jsx_runtime.jsx('path',{d:'m3.25 4.125 1.75 1.75 1.75-1.75'})})}),
    !open?null:react_dom.createPortal(react_jsx_runtime.jsx('div',{ref:menuRef,role:'menu','aria-label':workbenchText('整理组件'),className:'ew-grid-menu ew-arrange-menu','data-workbench-arrange-menu':'','data-ework-toolbar-owner':sessionId,onKeyDown:keyDown,children:options.map(([value,title])=>react_jsx_runtime.jsxs('button',{type:'button',role:'menuitemradio','aria-checked':mode===value,'data-arrange-mode':value,onClick:()=>run(value),children:[react_jsx_runtime.jsx(WorkbenchArrangeIcon,{mode:value}),react_jsx_runtime.jsx('span',{className:'ew-arrange-label',children:workbenchText(title)}),react_jsx_runtime.jsx('svg',{'aria-hidden':true,className:'ew-arrange-check',width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,children:react_jsx_runtime.jsx('path',{d:'m3 8 3 3 7-7'})})]},value))}),rootRef.current.ownerDocument.body)
  ]})
}
export function useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef,selectTool,readOnly}) {
  react.useEffect(()=>{const root=rootRef.current;if(root)return installWorkbenchAutoArrange(root,workspace,readOnly)},[workspace,sessionId,readOnly])
  react.useEffect(()=>{const root=rootRef.current;if(root)return installWorkbenchResponsiveArrange(root,workspace)},[workspace,sessionId])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    root.setAttribute('data-ework-grid','')
    const stopChartMotion=installWorkbenchChartMotion(root)
    const stopTableColumns=installWorkbenchTableColumns(root,{
      load:(owner,index,labels)=>workspace.getWorkbenchTableColumns(owner.getAttribute('data-research-node-id'),index,labels),
      save:(owner,index,labels,state)=>workspace.setWorkbenchTableColumns(owner.getAttribute('data-research-node-id'),index,labels,state)
    })
    const scrollbars=new Map()
    root.__eworkScrollbars=()=>{
      const cards=[...root.querySelectorAll('[data-research-node-id]')]
      for(const [card,bar] of scrollbars)if(!cards.includes(card)){bar.destroy();scrollbars.delete(card)}
      for(const card of cards){
        if(!scrollbars.has(card))scrollbars.set(card,installWorkbenchScrollbars(card,()=>card.querySelector('.hws-body')||card.querySelector('[data-research-preview-body]')||card.querySelector('.rScV5Q_containerDraft')||card,()=>card.getAttribute('data-selected')==='true'||card.hasAttribute('open'),()=>[card.querySelector('[data-research-preview-body]'),...card.querySelectorAll('.rScV5Q_containerTableScroll,.fund-native-table-wrap,.odyssey-native-table-grid,.hws-body,.hws-table-scroll,.rScV5Q_containerMarkdown,.rScV5Q_textPreview,.rScV5Q_containerDraft,[class*=editorPptxHost],textarea,.odyssey-generation-records')],()=>card.querySelector('iframe[data-research-html-artifact]')))
        scrollbars.get(card).refresh()
      }
    }
    const contentMeasurements=new Map();root.__eworkContentMeasurements=contentMeasurements
    const contentSize=event=>{
      const data=event.data
      if(data?.type==='sherlock-kpi-refresh-request'){
        const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source)
        const id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id'),node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
        if(frame&&node)void performWorkbenchKpiRefresh(frame,node,data,readOnly);return
      }
      if(data?.type==='sherlock-records-action'){
        const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source)
        const id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id'),node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
        if(!frame||!node)return
        void performWorkbenchRecordsAction(frame,node,data);return
      }
      if(data?.type==='sherlock-code-action'){
        const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source)
        const id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id'),node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
        if(!frame||!node)return
        void performWorkbenchCodeAction(frame,node,data);return
      }
      if(data?.type==='sherlock-workbench-history'){
        if(readOnly||Array.isArray(data)||Object.keys(data).length!==2||!['undo','redo'].includes(data.action))return
        const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source),id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id')
        if(!id||!workspace.getSnapshot().selection.selectedNodeIds.includes(id))return
        root.__eworkContentFit?.finish();root.focus({preventScroll:true});workspace[data.action]();return
      }
      if(!data||typeof data!=='object'||Array.isArray(data)||data.type!=='sherlock-workbench-content-size'||!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.width>2400||data.height<1||data.height>12000)return
      const intrinsic=data.intrinsicMetrics===true||data.intrinsicTable===true,disclosureOpen=data.disclosureOpen===true
      if(Object.keys(data).length!==3+Number(intrinsic)+Number(disclosureOpen))return
      const frame=[...root.querySelectorAll('iframe[data-research-html-artifact]')].find(f=>f.contentWindow===event.source)
      const id=frame?.closest('[data-research-node-id]')?.getAttribute('data-research-node-id'),node=workspace.getSnapshot().artifacts.find(n=>n.id===id)
      if(node?.containerSpec?.type==='html'){
        root.__eworkScrollbars?.();const prior=contentMeasurements.get(id),value={html:node.containerSpec.html,width:data.width,height:data.height,...(frame.clientHeight>0?{chromeHeight:Math.max(58,Math.min(200,Math.ceil((frame.closest('[data-research-node-id]')?.offsetHeight||node.height)-frame.offsetHeight)))}:{}),...(data.intrinsicMetrics===true?{intrinsicMetrics:true}:data.intrinsicTable===true?{intrinsicTable:true}:{})};contentMeasurements.set(id,value)
        workspace.setWorkbenchContentHeight(id,{html:value.html,width:node.width,height:workbenchMeasuredDimensions(node,value).height,disclosureOpen,...((data.intrinsicTable===true||data.intrinsicMetrics===true||data.intrinsic===true)&&!node.preserveGenerationSize?{layoutFit:true}:{})})
        if(root.__eworkContentFit)root.__eworkContentFit.refit()
        else if(workspace.getWorkbenchResponsiveArrange()&&prior?.html===value.html&&prior.width===value.width&&Math.abs(prior.height-value.height)>1&&Math.abs(frame.clientWidth-value.width)<=2)root.__eworkRequestResponsiveArrange?.()
      }
    }
    window.addEventListener('message',contentSize)
    // Native presets share the temporary disclosure floor with sandbox cards.
    // Only flowing inner details count; the outer card and iframes do not.
    const nativeDisclosure=event=>{
      const details=event.target,card=details?.closest?.('[data-research-node-id]'),body=card?.querySelector('[data-research-preview-body]')
      if(details?.tagName!=='DETAILS'||!body?.contains(details)||body.querySelector('iframe'))return
      const node=workspace.getSnapshot().artifacts.find(n=>n.id===card.getAttribute('data-research-node-id'))
      if(!node?.containerSpec||node.containerSpec.type==='html')return
      const open=[...body.querySelectorAll('details[open]')],disclosureOpen=open.length>0
      // Reserve only the newly revealed flow, never the full scrollable diagram
      // or its current scroll offset. Saved card geometry remains the baseline.
      const zoom=workbenchCanvasZoom(root)
      const extraHeight=Math.ceil(open.filter(detail=>!open.some(parent=>parent!==detail&&parent.contains(detail))).reduce((sum,detail)=>sum+[...detail.children].filter(child=>child.tagName!=='SUMMARY').reduce((height,child)=>{const style=getComputedStyle(child);return height+child.getBoundingClientRect().height/zoom+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0)},0),0))
      const preset=body.querySelector('[data-research-derived-preset]'),layoutFit=!!preset?.querySelector('[data-research-mind-map-layout="wide"]')
      const chrome=(card.querySelector('.ew-grid-header')?.getBoundingClientRect().height/zoom||38)+((card.querySelector('.odyssey-data-stamp')?.getBoundingClientRect().height||0)/zoom)
      const height=layoutFit?Math.ceil(chrome+Math.max(preset.scrollHeight,preset.getBoundingClientRect().height/zoom)):extraHeight
      workspace.setWorkbenchContentHeight(node.id,{native:true,contentKey:JSON.stringify(node.containerSpec),width:node.width,height,extraHeight,disclosureOpen,layoutFit})
    }
    root.addEventListener('toggle',nativeDisclosure,true)
    root.__eworkNativeDisclosure=nativeDisclosure
    root.__eworkMeasureViewport=(bounds,panelBounds)=>{
      if(!(bounds.width>0))return
      const zoom=workbenchCanvasZoom(root),width=workbenchAvailableWidth(root,bounds,panelBounds)
      const size={width:bounds.width/zoom,height:bounds.height/zoom,availableWidth:width,visibleHeight:Math.max(0,Math.min(bounds.height,window.innerHeight-bounds.top))/zoom}
      const previous=workspace.getSnapshot().canvasSize
      if(Math.abs(width-(previous.availableWidth||width))>1){
        const fit=root.__eworkContentFit
        fit?.finish(!fit.responsive)
      }
      workspace.setWorkbenchWidth(width)
      if(Object.keys(size).some(k=>previous[k]!==size[k]))workspace.setCanvasSize(size)
    }
    const panel=root.ownerDocument.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)')
    root.__eworkMeasureViewport(root.getBoundingClientRect(),panel?.getBoundingClientRect())
    const scroll=()=>{root.style.setProperty('--grid-scroll-top',root.scrollTop+'px');const s=workspace.getSnapshot();if(Math.abs(s.viewport.y+root.scrollTop)>.5)workspace.setViewport({x:0,y:-root.scrollTop,scale:1})}
    root.addEventListener('scroll',scroll,{passive:true})
    return()=>{stopTableColumns();stopChartMotion();root.__eworkContentFit?.finish();delete root.__eworkMeasureViewport;window.removeEventListener('message',contentSize);root.removeEventListener('toggle',nativeDisclosure,true);delete root.__eworkNativeDisclosure;delete root.__eworkNativeInitialFits;if(root.__eworkContentMeasurements===contentMeasurements)delete root.__eworkContentMeasurements;for(const bar of scrollbars.values())bar.destroy();delete root.__eworkScrollbars;root.removeEventListener('scroll',scroll);for(const key of ['--grid-pattern','--grid-step','--grid-scroll-top'])root.style.removeProperty(key);root.removeAttribute('data-ework-grid')}
  },[workspace,sessionId,readOnly])
  react.useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return
    const nodes=[...snapshot.files,...snapshot.artifacts,...workspace.getWorkbenchPlanningNodes()],width=snapshot.canvasSize.availableWidth||root.clientWidth,m=createResearchGrid().metrics(width),visibleHeight=root.clientHeight||snapshot.canvasSize.visibleHeight||snapshot.canvasSize.height||700,contentBottom=Math.max(0,...nodes.map(n=>n.y+n.height/2)),bottom=workbenchScrollExtent(contentBottom,visibleHeight,m.rowStep,root.hasAttribute('data-workbench-toolbar-space'))
    for(const [id,value] of root.__eworkContentMeasurements||[])if(!nodes.some(n=>n.id===id&&n.containerSpec?.html===value.html))root.__eworkContentMeasurements.delete(id)
    root.__eworkScrollLimit=Math.max(0,bottom-visibleHeight)
    const layer=root.querySelector('[data-research-content-layer]');if(layer){layer.style.height=bottom+'px';layer.style.width=width+'px';layer.style.setProperty('--grid-gap',m.gap+'px');layer.style.setProperty('--grid-step',m.step+'px');layer.style.setProperty('--grid-pattern',workbenchGridPattern(width))}
    // Paint the viewport too: the content layer intentionally excludes the stable scrollbar gutter.
    root.style.setProperty('--grid-pattern',workbenchGridPattern(width));root.style.setProperty('--grid-step',m.step+'px');root.style.setProperty('--grid-scroll-top',root.scrollTop+'px')
    root.__eworkScrollbars?.()
    // Native market tables do not send iframe content reports. Fit their full
    // rows and context on first completion and responsive width changes too.
    let active=true
    const tables=nodes.map(node=>({node,card:root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]')})).map(item=>({...item,table:item.card?.querySelector('[data-sherlock-market-native="table"]')})).filter(item=>item.table)
    const nativeFitted=root.__eworkNativeInitialFits??=new Map()
    for(const id of nativeFitted.keys())if(!nodes.some(node=>node.id===id))nativeFitted.delete(id)
    const fitNativeContents=()=>{
      if(!active||root.hasAttribute('data-grid-operation'))return
      const candidates=nodes.filter(node=>node.kind==='generated-container'&&node.containerSpec&&node.containerSpec.type!=='html'&&!['financial-widget','iframe','youtube','calendar-tool'].includes(node.containerSpec.type)&&!node.preserveGenerationSize)
      const height=workspace.getWorkbenchResponsiveArrange()?(snapshot.canvasSize.visibleHeight||snapshot.canvasSize.height):0
      const fitKey=node=>JSON.stringify([node.width,node.containerSpec,node.containerSpec.type==='chart'?height:0])
      const unfitted=candidates.filter(node=>nativeFitted.get(node.id)!==fitKey(node))
      const sizes=measureWorkbenchContents(root,unfitted,height)
      for(const node of unfitted){const card=root.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');if(!card||Math.abs(card.getBoundingClientRect().width/workbenchCanvasZoom(root)-node.width)>2)continue;const key=fitKey(node);const size=['code','form'].includes(node.containerSpec.type)?researchOptimalDimensions({...node,width:0,height:0}):sizes.get(node.id);if(size){nativeFitted.set(node.id,key);workspace.setWorkbenchContentHeight(node.id,{native:true,contentKey:JSON.stringify(node.containerSpec),width:node.width,height:size.height,layoutFit:true})}}
    }
    fitNativeContents()
    const fitTables=()=>{if(!active||root.hasAttribute('data-grid-operation'))return;for(const {node,card,table} of tables){if(Math.abs(card.getBoundingClientRect().width/workbenchCanvasZoom(root)-node.width)>2)continue;const fit=workbenchNativeTableFit(node,table);if(fit)workspace.setWorkbenchContentHeight(node.id,fit)}}
    const nativeDetails=[...root.querySelectorAll('[data-research-preview-body] details')].filter(details=>!details.closest('[data-research-node-id]')?.querySelector('iframe'))
    const refitNative=()=>{if(active&&!root.hasAttribute('data-grid-operation'))for(const details of nativeDetails)if(details.isConnected)root.__eworkNativeDisclosure?.({target:details})}
    const nativeObserver=new ResizeObserver(refitNative)
    for(const details of nativeDetails){nativeObserver.observe(details);const preset=details.closest('[data-research-derived-preset]');if(preset)nativeObserver.observe(preset)}
    refitNative()
    const observer=new ResizeObserver(fitTables),mutations=new MutationObserver(fitTables)
    for(const {table} of tables){observer.observe(table);for(const child of table.querySelectorAll('table,.terminal-native-context>*'))observer.observe(child);mutations.observe(table,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open']})}
    fitTables();return()=>{active=false;observer.disconnect();mutations.disconnect();nativeObserver.disconnect()}
  },[snapshot.files,snapshot.artifacts,snapshot.canvasSize.width,snapshot.canvasSize.availableWidth,snapshot.canvasSize.visibleHeight,snapshot.canvasSize.height,workspace])
  react.useLayoutEffect(()=>{
    const root=rootRef.current
    if(!root||root.hasAttribute('data-grid-operation'))return
    const y=workspace.getSnapshot().viewport.y,top=Math.max(0,Math.min(root.__eworkScrollLimit??0,-y))
    if(Math.abs(root.scrollTop-top)>.5)root.scrollTop=top
    if(Math.abs(y+top)>.5)workspace.setViewport({x:0,y:-top,scale:1})
  },[snapshot.viewport.y,snapshot.artifacts,snapshot.files,snapshot.canvasSize.availableWidth,snapshot.canvasSize.visibleHeight,workspace])
  react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installWorkbenchPointer(root,workspace,toolRef,selectTool,readOnly)},[workspace,sessionId,readOnly])
}

export async function performWorkbenchCodeAction(frame,node,data) {
  if(!data||Array.isArray(data)||Object.keys(data).length!==4||data.type!=='sherlock-code-action'||typeof data.id!=='string'||!/^code-[a-z0-9-]{1,80}$/.test(data.id)||!['copy','download'].includes(data.action)||!['original','formatted'].includes(data.format))return
  const reply=status=>frame.contentWindow?.postMessage({type:'sherlock-code-action-result',id:data.id,status},'*')
  try{
    const view=frame.ownerDocument.defaultView
    if(!view.navigator.userActivation?.isActive)throw Error('需要用户操作')
    const html=node.containerSpec?.html,source=typeof html==='string'&&html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
    if(!source||source.length>512000)throw Error('无有效模板数据')
    const model=JSON.parse(source),payload=model.templateId==='code'&&codeTemplatePayload(model.data,data.format)
    if(!payload)throw Error('无有效代码内容')
    if(data.action==='copy'){await view.navigator.clipboard.writeText(payload.content);reply('copied')}
    else{
      const save=view.dshDesktop?.researchCanvasExport?.save;if(!save)throw Error('无法保存')
      const result=await save({kind:'text',...payload});reply(['saved','cancelled'].includes(result?.status)?result.status:'error')
    }
  }catch{reply('error')}
}

export async function performWorkbenchRecordsAction(frame,node,data){
 if(!data||Array.isArray(data)||Object.keys(data).length!==5||data.type!=='sherlock-records-action'||typeof data.id!=='string'||!/^records-[a-z0-9-]{1,80}$/.test(data.id)||!['export','copy-link'].includes(data.action)||typeof data.dataset!=='string'||data.dataset.length>2000||!Array.isArray(data.rows)||data.rows.length>1000)return
 const reply=status=>frame.contentWindow?.postMessage({type:'sherlock-records-action-result',id:data.id,status},'*')
 try{
  const view=frame.ownerDocument.defaultView;if(!view.navigator.userActivation?.isActive)throw Error('需要用户操作')
  const source=node.containerSpec?.html?.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
  if(!source||source.length>512000)throw Error('无有效模板数据')
  const payload=financialRecordsActionPayload(JSON.parse(source),data);if(!payload)throw Error('无有效来源记录')
  if(data.action==='copy-link'){await view.navigator.clipboard.writeText(payload.content);reply('copied')}
  else{const save=view.dshDesktop?.researchCanvasExport?.save;if(!save)throw Error('无法保存');const result=await save({kind:'text',...payload});reply(['saved','cancelled'].includes(result?.status)?result.status:'error')}
 }catch{reply('error')}
}

export async function performWorkbenchKpiRefresh(frame,node,data,readOnly){
 if(!data||Array.isArray(data)||Object.keys(data).length!==3||data.type!=='sherlock-kpi-refresh-request'||data.action!=='refresh'||typeof data.requestId!=='string'||!/^[a-z0-9-]{1,80}$/.test(data.requestId))return
 const reply=value=>frame.contentWindow?.postMessage({type:'sherlock-kpi-refresh-result',requestId:data.requestId,...value},'*')
 try{
  const card=frame.closest('[data-research-node-id]'),html=node?.containerSpec?.html
  if(readOnly||card?.getAttribute('data-research-node-id')!==node?.id||!frame.ownerDocument.defaultView.navigator.userActivation?.isActive)throw Error('需要在可编辑画布中点击刷新')
  const source=typeof html==='string'&&html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
  if(node.containerSpec.type!=='html'||!/<body\b[^>]*data-sherlock-template="kpi"/.test(html)||!source||source.length>512000||JSON.parse(source).templateId!=='kpi')throw Error('无有效指标模板数据')
  const control=card.querySelector('[data-workbench-refresh]')
  if(control?.getAttribute('data-workbench-refresh')!==node.id||control.disabled||typeof control.__eworkRefresh!=='function')throw Error('刷新正在进行或组件尚未就绪')
  const result=await control.__eworkRefresh();reply(result?.error?{error:String(result.error).slice(0,1000)}:{message:result?.message||'刷新请求已提交，结果见组件数据提示'})
 }catch(error){reply({error:String(error?.message||'刷新失败，原数据保留').slice(0,1000)})}
}
