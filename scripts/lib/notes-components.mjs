import {createNoteHtmlInteractionBridge,patchNotesHtmlInteraction} from './notes-html-interaction.mjs'
export function createNoteComponentViewStore(doc){
 const entries=new Map(),listeners=new Set();let snapshot=[]
 const notify=()=>{snapshot=[...entries.values()];for(const listener of listeners)listener()}
 const update=event=>{const value=event.detail;if(typeof value?.instanceId!=='string')return
  if(value.remove){entries.delete(value.instanceId);notify();return}
  const host=doc.getElementById(value.hostId),header=doc.getElementById(value.headerId)
  if(!host?.matches('.en-native-component-host')||host.dataset.noteComponent!==value.node?.id||host.dataset.noteSession!==value.sessionId||!header?.closest('.en-research')?.contains(host)||!host.closest('.en-root'))return
  entries.set(value.instanceId,{...value,host,header});notify()
 }
 const reset=()=>{entries.clear();notify()}
 doc?.addEventListener('sherlock:notes-component-view',update);doc?.addEventListener('sherlock:notes-reset',reset)
 return {snapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},dispose:()=>{doc?.removeEventListener('sherlock:notes-component-view',update);doc?.removeEventListener('sherlock:notes-reset',reset);reset()}}
}
export function EWorkNoteComponentView({entry,officePreview}){
 const rootRef=react.useRef(entry.host.closest('[data-research-node-id]')),[indices,setIndices]=react.useState(false),[error,setError]=react.useState(''),pending=react.useRef(new Map()),sequence=react.useRef(0),generationPending=react.useRef(new Map()),node=entry.node,spec=node.containerSpec||{type:'assistant-result'}
 const action=(name,value={})=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{instanceId:entry.instanceId,sessionId:entry.sessionId,action:name,...value}}))
 const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(entry.sessionId,node.id,fn,'notes'),[entry.sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(entry.sessionId,node.id,'notes'),[entry.sessionId,node.id]))
 const [refreshBusy,setRefreshBusy]=react.useState(false),[refreshError,setRefreshError]=react.useState('')
 react.useEffect(()=>{if(['success','unchanged'].includes(binding?.status))setRefreshError('')},[binding?.status,binding?.lastSuccess,binding?.successSequence])
 const refreshState=workbenchRefreshState(node,binding,{rss:componentRssStatusView(node),error:refreshError}),refreshing=refreshBusy||binding?.status==='refreshing'
 react.useEffect(()=>{
  const receive=event=>{const value=event.detail;if(value?.instanceId!==entry.instanceId||value.sessionId!==entry.sessionId)return
   const request=generationPending.current.get(value.requestId)
   if(request){clearTimeout(request.timer);generationPending.current.delete(value.requestId);value.ok?request.resolve({ok:true,state:value.state}):request.reject(Error(value.message||'组件任务操作未完成，请重试'));return}
   if(!pending.current.has(value.requestId))return;clearTimeout(pending.current.get(value.requestId));pending.current.delete(value.requestId);setError(value.ok?'':value.message||'组件配置未保存，请重试')}

  document.addEventListener('sherlock:notes-component-ack',receive)
  return()=>{document.removeEventListener('sherlock:notes-component-ack',receive);for(const timer of pending.current.values())clearTimeout(timer);pending.current.clear();for(const request of generationPending.current.values()){clearTimeout(request.timer);request.reject(Error('组件已关闭'))}generationPending.current.clear()}
 },[entry.instanceId,entry.sessionId])
 const save=(expected,next)=>{
  const parsed=financialWidgetSpec(next);if(!entry.host.isConnected||!parsed||parsed.widget!==spec.widget||JSON.stringify(expected)!==JSON.stringify(spec))return false
  const requestId=entry.instanceId+':'+(++sequence.current);setError('');pending.current.set(requestId,setTimeout(()=>{pending.current.delete(requestId);setError('组件配置尚未保存，请重试')},6000));action('spec',{expected,next:parsed,requestId});return true
 }
 react.useEffect(()=>{setError('')},[node.generationTaskId,node.generationStatus])
 const generationAction=name=>new Promise((resolve,reject)=>{
  setError('')
  const requestId=entry.instanceId+':generation:'+(++sequence.current),timer=setTimeout(()=>{generationPending.current.delete(requestId);reject(Error('组件任务操作尚未确认，请重试。'))},6000)
  generationPending.current.set(requestId,{resolve,reject,timer});action(name,{requestId,nodeId:node.id,taskId:node.generationTaskId})
 })
 const interactionBridge=react.useMemo(()=>eworkCreateNoteHtmlInteraction(node.config?.interactionState,async(version,event)=>{
  const result=await new Promise((resolve,reject)=>{
   const requestId=entry.instanceId+':interaction:'+(++sequence.current),timer=setTimeout(()=>{generationPending.current.delete(requestId);reject(Error('笔记交互保存未确认，请重试。'))},6000)
   generationPending.current.set(requestId,{resolve,reject,timer});action('interaction',{requestId,nodeId:node.id,html:spec.html,version,event})
  }).catch(error=>{setError(error.message);throw error});setError('');return result.state
 }),[entry.instanceId,node.id,spec.html])
 const interactionState=react.useSyncExternalStore(interactionBridge.subscribe,interactionBridge.snapshot)
 react.useLayoutEffect(()=>{interactionBridge.observe(node.config?.interactionState)},[interactionBridge,node.config?.interactionState])
 react.useEffect(()=>()=>interactionBridge.dispose(),[interactionBridge])
 const refresh=async()=>{if(refreshing||entry.readOnly)return;setRefreshBusy(true);try{await generationAction('refresh');setRefreshError('')}catch(e){setRefreshError(e.message)}finally{setRefreshBusy(false)}}
 if(entry.mode==='generation'&&!node.containerSpec)return react_dom.createPortal(react.createElement(ResearchGenerationProcess,{node,sessionId:entry.sessionId,onCancel:entry.readOnly?undefined:()=>generationAction('generation-stop'),onRetry:entry.readOnly?undefined:()=>{void generationAction('generation-retry').catch(error=>setError(error.message))},detailOverride:error||undefined}),entry.host,entry.instanceId)
 const body=node.kind==='web-link'?react.createElement(ResearchCanvasWebFrame,{node,sessionId:entry.sessionId,visible:true,onInspection:(url,inspection)=>action('web-inspection',{url,inspection})}):node.noteReply?react.createElement(ResearchDerivedSummary,{node,onUpgradeSize:(_id,size)=>{if(size?.height)action('size',{height:size.height})}}):spec.type==='financial-widget'?react.createElement(FinancialWidget,{node,sessionId:entry.sessionId,visible:true,surface:'notes',hostReadOnly:!!entry.readOnly,onSpecChange:save}):react.createElement(ResearchContainerBody,{node:entry.readOnly?{...node,readOnly:true}:node,sessionId:entry.sessionId,visible:true,officePreview,preserveHeading:true,onHtmlSize:(_id,size)=>{if(size?.height)action('size',{height:size.height})}})
 const title=['quote','announcements'].includes(spec.widget)?react.createElement(react.Fragment,null,react.createElement(WorkbenchTitle,{title:node.displayName||node.title||node.name||workbenchText('组件'),systemTitle:!node.displayName&&node.title===financialWidgetDefaults(spec.widget)?.title}),react.createElement(FinancialQuoteSelector,{node,sessionId:entry.sessionId,readOnly:!!entry.readOnly,onSpecChange:save})):spec.widget==='news'?react.createElement(FinancialNewsSearch,{node,sessionId:entry.sessionId,readOnly:!!entry.readOnly,onSpecChange:save,surface:'notes'}):react.createElement('strong',null,node.title)
 return react.createElement(react.Fragment,null,
  react_dom.createPortal(react.createElement('div',{className:'en-native-component-heading'},refreshState&&react.createElement('span',{className:'ew-grid-refresh'},react.createElement('button',{type:'button',className:'en-component-refresh','aria-label':workbenchText('刷新组件'),disabled:entry.readOnly||refreshing,'aria-busy':refreshing||undefined,'data-workbench-refresh':node.id,'data-refresh-state':refreshState.state,'data-busy':refreshing||undefined,onPointerDown:e=>e.stopPropagation(),onClick:refresh},react.createElement(WorkbenchIcon,{name:refreshState.icon}))),title,spec.widget==='indices'&&react.createElement('button',{'data-workbench-more':'','aria-label':'配置指数',onClick:()=>setIndices(true)},react.createElement(FinancialLibraryIcon,{name:'dots'}))),entry.header),
  react_dom.createPortal(react.createElement('div',{className:'rScV5Q_containerBody en-native-component-body',key:entry.refresh},error&&react.createElement('div',{role:'alert',className:'en-component-error'},error),react.createElement(eworkNoteHtmlInteractionContext.Provider,{value:{bridge:interactionBridge,state:interactionState,readOnly:!!entry.readOnly}},body),indices&&react.createElement(FinancialIndicesSettings,{node,sessionId:entry.sessionId,rootRef,readOnly:false,onClose:()=>setIndices(false),onChange:save})),entry.host,entry.instanceId)
 )
}
export function EWorkNoteComponentViews({sessionId,active}){
 const entries=react.useSyncExternalStore(eworkNoteComponentViews.subscribe,eworkNoteComponentViews.snapshot),instances=entries.filter(entry=>entry.sessionId===sessionId&&entry.host.isConnected).map(entry=>entry.instanceId).sort().join(','),officePreview=react.useSyncExternalStore(eworkNoteOfficePreview.subscribe,eworkNoteOfficePreview.getSnapshot)
 react.useEffect(()=>{if(active)document.dispatchEvent(new CustomEvent('sherlock:notes-components-sync-request',{detail:{sessionId}}))},[sessionId,active])
 react.useEffect(()=>{
  const bridge=window.dshDesktop?.componentData;if(!active||typeof bridge?.request!=='function')return
  let live=true,pushed=false;const publish=event=>{if(live&&event?.sessionId===sessionId&&Array.isArray(event.rows)){pushed=true;componentDataStatusStore.publish(sessionId,event.rows,'notes')}}
  const reset=()=>componentDataStatusStore.clear(sessionId,'notes');document.addEventListener('sherlock:notes-reset',reset)
  const off=bridge.subscribe?.(publish,'notes')
  Promise.resolve(bridge.request(sessionId,{action:'list',surface:'notes'})).then(rows=>{if(live&&!pushed&&Array.isArray(rows))componentDataStatusStore.publish(sessionId,rows,'notes')}).catch(()=>{})
  return()=>{live=false;off?.();document.removeEventListener('sherlock:notes-reset',reset);reset()}
 },[sessionId,active,instances])
 return active?react.createElement(react.Fragment,null,entries.filter(entry=>entry.sessionId===sessionId&&entry.host.isConnected).map(entry=>react.createElement(EWorkNoteComponentView,{key:entry.instanceId,entry,officePreview}))):null
}
export function noteComponentClientHelpers(){return 'const eworkNoteHtmlInteractionContext=react.createContext(null);\n'+createNoteHtmlInteractionBridge.toString()+'\nconst eworkCreateNoteHtmlInteraction=createNoteHtmlInteractionBridge;\n'+[createNoteComponentViewStore,EWorkNoteComponentView,EWorkNoteComponentViews].map(fn=>fn.toString()).join('\n')+"\nconst eworkNoteComponentViews=createNoteComponentViewStore(typeof document==='undefined'?undefined:document);\n"}
export function patchNotesComponents(source){
 const marker='/* ework:notes-native-components:v1 */'
 if(!source.includes(marker)){
  const anchor="react.createElement(EWorkNoteFileViews,{sessionId,active:activeView==='notes'}), "
  if(source.split(anchor).length!==2)throw Error('无法定位笔记原生组件预览。')
  source=source.replace(anchor,anchor+marker+" react.createElement(EWorkNoteComponentViews,{sessionId,active:activeView==='notes'}), ")
 }
 return patchNotesHtmlInteraction(source,EWorkNoteComponentView.toString())
}
