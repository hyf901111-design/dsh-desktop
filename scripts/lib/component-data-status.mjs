import * as workbenchRefresh from '../../packages/dsh-research-task-runtime/workbench-refresh.js'
const {createWorkbenchRefreshSurface,isWorkbenchViewState,workbenchContentRevision,workbenchTemplateIdentity,workbenchRefreshCss}=workbenchRefresh
// One canvas subscription; publishing status never updates the canvas model or
// replaces an iframe. Only the affected footer subscribes to its own snapshot.
export function createComponentDataStatusStore(){
 const sessions=new Map(),listeners=new Map()
 const key=(sessionId,nodeId)=>JSON.stringify([sessionId,nodeId])
 const notify=(sessionId,nodeId)=>listeners.get(key(sessionId,nodeId))?.forEach(fn=>fn())
 return {
  read:(sessionId,nodeId)=>sessions.get(sessionId)?.rows.get(nodeId)||null,
  subscribe(sessionId,nodeId,fn){const k=key(sessionId,nodeId);if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);return()=>{const set=listeners.get(k);set?.delete(fn);if(!set?.size)listeners.delete(k)}},
  suspend(sessionId){const session=sessions.get(sessionId);if(session)session.ready=false},
  publish(sessionId,rows){
   const previous=sessions.get(sessionId)||{rows:new Map(),ready:false},next=new Map()
   for(const row of rows){
    const old=previous.rows.get(row.nodeId)
    const advanced=Number.isInteger(row.successSequence)?row.successSequence>(old?.successSequence||0):row.lastSuccess>old?.lastSuccess
    const snapshot={successSequence:row.successSequence||0,nodeId:row.nodeId,status:row.status,lastSuccess:row.lastSuccess||null,dataAsOf:row.dataAsOf||'',enabled:row.enabled,viewPaused:row.viewPaused,intervalMinutes:row.intervalMinutes,
     refreshSequence:(old?.refreshSequence||0)+(previous.ready&&old&&advanced&&row.status==='success'?1:0)}
    next.set(row.nodeId,JSON.stringify(old)===JSON.stringify(snapshot)?old:snapshot)
   }
   sessions.set(sessionId,{rows:next,ready:true})
   for(const nodeId of new Set([...previous.rows.keys(),...next.keys()]))if(previous.rows.get(nodeId)!==next.get(nodeId))notify(sessionId,nodeId)
  },
  clear(sessionId){const previous=sessions.get(sessionId);sessions.delete(sessionId);previous?.rows.forEach((_,nodeId)=>notify(sessionId,nodeId))}
 }
}

export function createComponentDataStatusMonitor({sessionId,bridge,store,isVisible}){
 let disposed=false,pending=false,epoch=0,wasVisible=false,pushRevision=0
 const unsubscribe=bridge.subscribe?.(event=>{if(!disposed&&event?.sessionId===sessionId&&Array.isArray(event.rows)&&isVisible()){pushRevision++;store.publish(sessionId,event.rows)}})
 const refresh=async()=>{
  if(disposed)return
  const visible=isVisible()
  void Promise.resolve(bridge.setVisible(sessionId,visible)).catch(()=>{})
  if(!visible){if(wasVisible)epoch++;wasVisible=false;store.suspend(sessionId);return}
  wasVisible=true
  if(pending)return
  pending=true;const requestEpoch=epoch,requestRevision=pushRevision
  try{const rows=await bridge.request(sessionId,{action:'list'});if(!disposed&&requestEpoch===epoch&&requestRevision===pushRevision&&isVisible())store.publish(sessionId,rows)}catch{}finally{pending=false}
 }
 const timer=setInterval(refresh,5000);void refresh()
 return {refresh,dispose(){disposed=true;epoch++;unsubscribe?.();clearInterval(timer);store.clear(sessionId);void Promise.resolve(bridge.setVisible(sessionId,false)).catch(()=>{})}}
}

export function componentDataStatusView(binding){
 const valid=binding?.lastSuccess&&Number.isFinite(new Date(binding.lastSuccess).getTime())
 const time=valid?'刷新 '+new Date(binding.lastSuccess).toLocaleTimeString('zh-CN',{hour12:false}):'尚未刷新'
 const frequency=binding?.intervalMinutes===1?'每分钟':binding?.intervalMinutes>0?'每 '+binding.intervalMinutes+' 分钟':'仅手动'
 const detail=!binding?'未绑定数据源':binding.status==='refreshing'?'正在取数':binding.status==='error'?'更新失败 · 保留上次数据':binding.viewPaused?'离开看板已暂停':!binding.enabled?'已暂停':frequency
 return {time,detail,title:(valid?'上次成功取数：'+new Date(binding.lastSuccess).toLocaleString('zh-CN'):'尚无成功刷新记录')+(binding?.dataAsOf?'\n数据时点：'+binding.dataAsOf:'')+'\n点击设置数据源与刷新频率'}
}

export function createComponentRefreshFeedback(card){
 const body=card.querySelector('[data-research-preview-body]'),frame=body?.querySelector('iframe'),win=card.ownerDocument.defaultView
 if(!body)return {update(){},dispose(){}}
 let view=null,baseline=null,sequence=0,initialized=false,animate=false,disposed=false,timer=0,loadingTimer=0,revision=null,readyRevision=null,identity=null,awaitRevision=null,refreshOrigin=null,previousStatus=null
 const surface=frame?null:createWorkbenchRefreshSurface(body,state=>{view=state})
 const retainCharts=(state,saved)=>({...state,values:[...state.values.filter(row=>!row[0].startsWith('chart-view:')),...(saved?.values||state.values).filter(row=>row[0].startsWith('chart-view:'))]})
 if(surface)view=surface.snapshot()
 const send=()=>{
  if(disposed||!view||frame&&animate&&revision===awaitRevision)return
  const state={...view,values:[...(baseline||view.values).filter(row=>!row[0].startsWith('chart-view:')),...view.values.filter(row=>row[0].startsWith('chart-view:'))]}
  if(frame){if(readyRevision===revision)frame.contentWindow?.postMessage({type:'sherlock-workbench-restore',state,animate,revision},'*')}
  else surface.apply(state,animate)
 }
 const receive=event=>{
  const data=event.data
  if(event.source!==frame?.contentWindow||!['sherlock-workbench-ready','sherlock-workbench-view'].includes(data?.type)||Object.keys(data).length!==3||data.revision!==revision||!isWorkbenchViewState(data.state))return
  if(data.type==='sherlock-workbench-ready'){
   clearTimeout(timer);timer=0
   readyRevision=data.revision;const saved=view;view=data.state
   if(saved)view={...retainCharts(view,saved),controls:saved.controls,scroll:saved.scroll}
   if(!baseline)baseline=data.state.values
   send()
  }else{
   view=data.state
   if(animate&&revision!==awaitRevision){baseline=data.state.values;animate=false;awaitRevision=null}
  }
 }
 win.addEventListener('message',receive)
 return {update(binding,html='',templateIdentity=workbenchTemplateIdentity(html)){
  const next=binding?.refreshSequence||0,nextRevision=workbenchContentRevision(html)
  const previousRevision=revision,refreshing=animate||binding?.status==='refreshing'||binding?.status==='success'&&next>sequence
  if(binding?.status==='refreshing'&&previousStatus!=='refreshing')refreshOrigin=previousRevision||nextRevision
  previousStatus=binding?.status
  if(revision!==null&&(identity!==templateIdentity||revision!==nextRevision&&!refreshing)){
   clearTimeout(timer);timer=0;view=surface?.snapshot()||null;baseline=view?.values||null;readyRevision=null;animate=false;awaitRevision=null;refreshOrigin=null;initialized=false
  }
  identity=templateIdentity;revision=nextRevision
  clearTimeout(loadingTimer)
  card.toggleAttribute('data-component-refreshing',binding?.status==='refreshing')
  if(binding?.status==='refreshing')loadingTimer=setTimeout(()=>{card.setAttribute('data-component-updating','')},300)
  else card.removeAttribute('data-component-updating')
  if(!binding)return
  if(!initialized){initialized=true;sequence=next;baseline=view?.values||null;return}
  if(next>sequence&&binding.status==='success'){
   sequence=next;animate=true;awaitRevision=frame?(refreshOrigin||previousRevision):null;refreshOrigin=null
   clearTimeout(timer);timer=setTimeout(()=>{if(surface){const current=surface.snapshot();view={...retainCharts(current,view),controls:view?.controls||current.controls,scroll:view?.scroll||current.scroll}}send();if(surface){baseline=surface.snapshot().values;animate=false}},100)
  }else if(binding.status==='unchanged'){if(surface)view=surface.snapshot();if(view)baseline=view.values}
 },dispose(){disposed=true;clearTimeout(timer);clearTimeout(loadingTimer);win.removeEventListener('message',receive);surface?.dispose();card.removeAttribute('data-component-refreshing');card.removeAttribute('data-component-updating')}}
}

export function ComponentDataStatusBar({sessionId,node,workbench=false}){
 const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(sessionId,node.id,fn),[sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(sessionId,node.id),[sessionId,node.id]))
 const ref=react.useRef(null),feedback=react.useRef(null)
 const content=node.containerSpec?.html||JSON.stringify(node.containerSpec||{}),identity=node.containerSpec?.type==='html'?workbenchTemplateIdentity(content):node.containerSpec?.type+':'+node.containerSpec?.variant
 react.useLayoutEffect(()=>{const card=ref.current?.closest('[data-research-node-id]');if(workbench&&card){feedback.current=createComponentRefreshFeedback(card);feedback.current.update(binding,content,identity)}return()=>{feedback.current?.dispose();feedback.current=null}},[sessionId,node.id,workbench,node.containerSpec?.type==='html'])
 react.useLayoutEffect(()=>{feedback.current?.update(binding,content,identity)},[binding,content,identity])
 const view=componentDataStatusView(binding),shared=sherlockShared(sessionId)
 return react_jsx_runtime.jsxs(workbench?'div':'button',{ref,className:'odyssey-data-stamp','data-component-data-status':binding?.status||'unbound','aria-label':view.detail+'，'+view.time+(workbench||shared?'':'，设置刷新频率'),...(!workbench?{type:'button',title:shared?'共享组件尚不支持自动取数':view.title,disabled:shared,onPointerDown:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),onKeyDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();openComponentData(sessionId,node)}}:{}),children:[react_jsx_runtime.jsx('span',{className:'odyssey-data-frequency',children:shared?'静态组件':view.detail}),react_jsx_runtime.jsx('time',{dateTime:binding?.lastSuccess?new Date(binding.lastSuccess).toISOString():undefined,children:view.time})]})
}

export const componentDataStatusCss=workbenchRefreshCss+`
[data-research-generated-container]:has(>.odyssey-data-stamp)>[data-research-preview-body]{position:relative;height:calc(100% - 56px);min-height:0}
[data-research-generated-container]>.odyssey-data-stamp{box-sizing:border-box;flex:0 0 24px;height:24px;min-height:24px;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0;padding:0 8px;border:0;border-top:1px solid var(--research-completed-divider,#8883);border-radius:0 0 2px 2px;background:var(--research-completed-surface,var(--odyssey-card));color:var(--research-completed-muted,var(--odyssey-card-muted));font:10px/20px "EWork DIN Pro","Noto Sans SC",system-ui;cursor:pointer;text-align:left}
.odyssey-data-stamp .odyssey-data-frequency{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.odyssey-data-stamp time{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
.odyssey-data-stamp:hover:not(:disabled){background:var(--research-completed-inset,#8882);color:var(--research-completed-text,inherit)}
.odyssey-data-stamp:focus-visible{outline:2px solid #258bea;outline-offset:-2px}
.odyssey-data-stamp:disabled{cursor:default}

.odyssey-data-stamp[data-component-data-status=error] .odyssey-data-frequency{color:#c07832}
[data-component-refreshing] [data-workbench-refresh] .ew-grid-icon{animation:ew-grid-spin 1s linear infinite}
[data-component-refreshing] [data-workbench-refresh]{pointer-events:none}
[data-component-updating] .odyssey-data-frequency{color:#258bea}
[data-component-updating] .odyssey-data-frequency::after{content:" · 更新中…"}
@media(prefers-reduced-motion:reduce){[data-component-refreshing] [data-workbench-refresh] .ew-grid-icon{animation:none!important}}

`

export function componentDataStatusDefinitions(){return [createWorkbenchRefreshSurface,isWorkbenchViewState,workbenchContentRevision,workbenchTemplateIdentity,createComponentRefreshFeedback,createComponentDataStatusStore,createComponentDataStatusMonitor,componentDataStatusView,ComponentDataStatusBar].map(fn=>fn.toString()).join('\n')+'\nconst componentDataStatusStore=createComponentDataStatusStore();\n'}

export function patchComponentDataStatus(source){
 if(source.includes('/* ODYSSEY_COMPONENT_DATA_STAMP */'))return source
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Component status anchor drifted: '+a.slice(0,80));source=source.replace(a,b)}
 replace('function ResearchCanvasRichNodeFrame({ node,','function ResearchCanvasRichNodeFrame({ componentDataSessionId, node,')
 replace('"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,','"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,\ncomponentDataSessionId:sessionId,')
 replace('}), !expanded && geometry.resizable ?', `}), /* ODYSSEY_COMPONENT_DATA_STAMP */ node.kind==='generated-container'&&node.containerSpec?(0,react_jsx_runtime.jsx)(ComponentDataStatusBar,{sessionId:componentDataSessionId,node}):null, !expanded && geometry.resizable ?`)
 return source
}
