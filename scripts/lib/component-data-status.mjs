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
    const snapshot={nodeId:row.nodeId,status:row.status,lastSuccess:row.lastSuccess||null,dataAsOf:row.dataAsOf||'',enabled:row.enabled,viewPaused:row.viewPaused,intervalMinutes:row.intervalMinutes,
     refreshSequence:(old?.refreshSequence||0)+(previous.ready&&old&&row.lastSuccess>old.lastSuccess&&['success','unchanged'].includes(row.status)?1:0)}
    next.set(row.nodeId,JSON.stringify(old)===JSON.stringify(snapshot)?old:snapshot)
   }
   sessions.set(sessionId,{rows:next,ready:true})
   for(const nodeId of new Set([...previous.rows.keys(),...next.keys()]))if(previous.rows.get(nodeId)!==next.get(nodeId))notify(sessionId,nodeId)
  },
  clear(sessionId){const previous=sessions.get(sessionId);sessions.delete(sessionId);previous?.rows.forEach((_,nodeId)=>notify(sessionId,nodeId))}
 }
}

export function createComponentDataStatusMonitor({sessionId,bridge,store,isVisible}){
 let disposed=false,pending=false,epoch=0,wasVisible=false
 const refresh=async()=>{
  if(disposed)return
  const visible=isVisible()
  void Promise.resolve(bridge.setVisible(sessionId,visible)).catch(()=>{})
  if(!visible){if(wasVisible)epoch++;wasVisible=false;store.suspend(sessionId);return}
  wasVisible=true
  if(pending)return
  pending=true;const requestEpoch=epoch
  try{const rows=await bridge.request(sessionId,{action:'list'});if(!disposed&&requestEpoch===epoch&&isVisible())store.publish(sessionId,rows)}catch{}finally{pending=false}
 }
 const timer=setInterval(refresh,5000);void refresh()
 return {refresh,dispose(){disposed=true;epoch++;clearInterval(timer);store.clear(sessionId);void Promise.resolve(bridge.setVisible(sessionId,false)).catch(()=>{})}}
}

export function componentDataStatusView(binding){
 const valid=binding?.lastSuccess&&Number.isFinite(new Date(binding.lastSuccess).getTime())
 const time=valid?'刷新 '+new Date(binding.lastSuccess).toLocaleTimeString('zh-CN',{hour12:false}):'尚未刷新'
 const frequency=binding?.intervalMinutes===1?'每分钟':binding?.intervalMinutes>0?'每 '+binding.intervalMinutes+' 分钟':'仅手动'
 const detail=!binding?'未绑定数据源':binding.status==='refreshing'?'正在取数':binding.status==='error'?'更新失败 · 保留上次数据':binding.viewPaused?'离开看板已暂停':!binding.enabled?'已暂停':frequency
 return {time,detail,title:(valid?'上次成功取数：'+new Date(binding.lastSuccess).toLocaleString('zh-CN'):'尚无成功刷新记录')+(binding?.dataAsOf?'\n数据时点：'+binding.dataAsOf:'')+'\n点击设置数据源与刷新频率'}
}

export function ComponentDataStatusBar({sessionId,node}){
 const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(sessionId,node.id,fn),[sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(sessionId,node.id),[sessionId,node.id]))
 const ref=react.useRef(null),sequence=react.useRef(binding?.refreshSequence||0),[pulse,setPulse]=react.useState(0)
 react.useEffect(()=>{
  const next=binding?.refreshSequence||0,changed=next>sequence.current;sequence.current=next
  if(!changed)return
  setPulse(next);const timer=setTimeout(()=>setPulse(0),1100);return()=>clearTimeout(timer)
 },[binding?.refreshSequence])
 const view=componentDataStatusView(binding),body=ref.current?.closest('[data-research-node-id]')?.querySelector('[data-research-preview-body]')
 const shared=sherlockShared(sessionId)
 return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment,{children:[
  react_jsx_runtime.jsxs('button',{ref,type:'button',className:'odyssey-data-stamp','data-component-data-status':binding?.status||'unbound',title:shared?'共享组件尚不支持自动取数':view.title,'aria-label':view.detail+'，'+view.time+(shared?'':'，设置刷新频率'),disabled:shared,onPointerDown:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),onKeyDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();openComponentData(sessionId,node)},children:[react_jsx_runtime.jsx('span',{className:'odyssey-data-frequency',children:shared?'静态组件':view.detail}),react_jsx_runtime.jsx('time',{dateTime:binding?.lastSuccess?new Date(binding.lastSuccess).toISOString():undefined,children:view.time})]}),
  pulse&&body?react_dom.createPortal(react_jsx_runtime.jsx('span',{'aria-hidden':true,className:'odyssey-data-update-highlight'},pulse),body):null
 ]})
}

export const componentDataStatusCss=`
[data-research-generated-container]:has(>.odyssey-data-stamp)>[data-research-preview-body]{position:relative;height:calc(100% - 56px);min-height:0}
[data-research-generated-container]>.odyssey-data-stamp{box-sizing:border-box;flex:0 0 24px;height:24px;min-height:24px;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0;padding:0 8px;border:0;border-top:1px solid var(--research-completed-divider,#8883);border-radius:0 0 2px 2px;background:var(--research-completed-surface,var(--odyssey-card));color:var(--research-completed-muted,var(--odyssey-card-muted));font:10px/20px "EWork DIN Pro","Noto Sans SC",system-ui;cursor:pointer;text-align:left}
.odyssey-data-stamp .odyssey-data-frequency{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.odyssey-data-stamp time{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
.odyssey-data-stamp:hover:not(:disabled){background:var(--research-completed-inset,#8882);color:var(--research-completed-text,inherit)}
.odyssey-data-stamp:focus-visible{outline:2px solid #258bea;outline-offset:-2px}
.odyssey-data-stamp:disabled{cursor:default}
.odyssey-data-stamp[data-component-data-status=refreshing] .odyssey-data-frequency{color:#258bea}
.odyssey-data-stamp[data-component-data-status=error] .odyssey-data-frequency{color:#c07832}
.odyssey-data-update-highlight{position:absolute;inset:0;z-index:45;pointer-events:none;border-radius:inherit;animation:odyssey-data-updated 1s ease-out both}
@keyframes odyssey-data-updated{0%{background:rgba(45,153,255,.2);box-shadow:inset 0 0 0 2px rgba(45,153,255,.65)}100%{background:transparent;box-shadow:inset 0 0 0 2px transparent}}
@media(prefers-reduced-motion:reduce){.odyssey-data-update-highlight{animation:none;background:rgba(45,153,255,.08);box-shadow:inset 0 0 0 1px rgba(45,153,255,.45)}}
`

export function componentDataStatusDefinitions(){return [createComponentDataStatusStore,createComponentDataStatusMonitor,componentDataStatusView,ComponentDataStatusBar].map(fn=>fn.toString()).join('\n')+'\nconst componentDataStatusStore=createComponentDataStatusStore();\n'}

export function patchComponentDataStatus(source){
 if(source.includes('/* ODYSSEY_COMPONENT_DATA_STAMP */'))return source
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Component status anchor drifted: '+a.slice(0,80));source=source.replace(a,b)}
 replace('function ResearchCanvasRichNodeFrame({ node,','function ResearchCanvasRichNodeFrame({ componentDataSessionId, node,')
 replace('"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,','"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,\ncomponentDataSessionId:sessionId,')
 replace('}), !expanded && geometry.resizable ?', `}), /* ODYSSEY_COMPONENT_DATA_STAMP */ node.kind==='generated-container'&&node.containerSpec?(0,react_jsx_runtime.jsx)(ComponentDataStatusBar,{sessionId:componentDataSessionId,node}):null, !expanded && geometry.resizable ?`)
 return source
}
