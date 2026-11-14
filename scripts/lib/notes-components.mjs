import {createNoteHtmlInteractionBridge,createNoteHtmlSharedStateBridge,patchNotesHtmlInteraction} from './notes-html-interaction.mjs'
import {patchComponentSurfaceMenu} from './component-surface-menu.mjs'
export function createNoteComponentViewStore(doc){
 const entries=new Map(),listeners=new Set();let snapshot=[]
 const notify=()=>{snapshot=[...entries.values()];for(const listener of listeners)listener()}
 const update=event=>{const value=event.detail;if(typeof value?.instanceId!=='string')return
  if(value.remove){entries.delete(value.instanceId);notify();return}
  const host=doc.getElementById(value.hostId),header=doc.getElementById(value.headerId),footer=value.footerId?doc.getElementById(value.footerId):null
  if(value.surface==='spreadsheet'){
   if(!host?.matches('.ew-sheet-component-host')||host.dataset.sheetComponent!==value.node?.id||host.dataset.sheetSession!==value.sessionId||
      !header?.parentElement?.matches('.ew-sheet-component-card')||header.parentElement!==host.parentElement||
      footer&&!host.parentElement.contains(footer)||host.closest('[data-ework-spreadsheet-view]')?.dataset.eworkSpreadsheetView!==value.sessionId)return
  }else if(!host?.matches('.en-native-component-host')||host.dataset.noteComponent!==value.node?.id||host.dataset.noteSession!==value.sessionId||!header?.closest('.en-research')?.contains(host)||!host.closest('.en-root'))return
  entries.set(value.instanceId,{...value,host,header,footer});notify()
 }
 const reset=()=>{entries.clear();notify()}
 doc?.addEventListener('sherlock:notes-component-view',update);doc?.addEventListener('sherlock:notes-reset',reset)
 return {snapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},dispose:()=>{doc?.removeEventListener('sherlock:notes-component-view',update);doc?.removeEventListener('sherlock:notes-reset',reset);reset()}}
}
export function EWorkNoteComponentView({entry,officePreview}){
 useWorkbenchLocale()
 const rootRef=react.useRef(entry.host.closest('[data-research-node-id]')),[indices,setIndices]=react.useState(false),[error,setError]=react.useState(''),pending=react.useRef(new Map()),sequence=react.useRef(0),generationPending=react.useRef(new Map()),node=entry.node,spec=node.containerSpec||{type:'assistant-result'}
 const action=(name,value={})=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{instanceId:entry.instanceId,sessionId:entry.sessionId,action:name,...value}}))
 const spreadsheet=entry.surface==='spreadsheet'
 const [sheetMenu,setSheetMenu]=react.useState(null)
 const sheetTheme=entry.theme??(entry.dark?'dark':'light')
 eworkComponentSurfaceUi.useComponentTheme(rootRef,sheetTheme,spreadsheet)
 const binding=react.useSyncExternalStore(react.useCallback(fn=>spreadsheet?()=>{}:componentDataStatusStore.subscribe(entry.sessionId,node.id,fn,'notes'),[spreadsheet,entry.sessionId,node.id]),react.useCallback(()=>spreadsheet?undefined:componentDataStatusStore.read(entry.sessionId,node.id,'notes'),[spreadsheet,entry.sessionId,node.id]))
 const [refreshBusy,setRefreshBusy]=react.useState(false),[refreshError,setRefreshError]=react.useState('')
 const [dataSettings,setDataSettings]=react.useState(false),[dataRecord,setDataRecord]=react.useState(null),[dataBusy,setDataBusy]=react.useState(false),[dataError,setDataError]=react.useState('')
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
 const generationAction=(name,value={})=>new Promise((resolve,reject)=>{
  setError('')
  const requestId=entry.instanceId+':generation:'+(++sequence.current),timer=setTimeout(()=>{generationPending.current.delete(requestId);reject(Error('组件任务操作尚未确认，请重试。'))},6000)
  generationPending.current.set(requestId,{resolve,reject,timer});action(name,{...value,requestId,nodeId:node.id,taskId:node.generationTaskId})
 })
 const dataAction=async(name,value={})=>{setDataBusy(true);setDataError('');try{const result=await generationAction(name,value);setDataRecord(result.state??null);return result}catch(error){setDataError(error.message);throw error}finally{setDataBusy(false)}}
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const adapter={instanceId:entry.instanceId,spec:JSON.stringify(node.containerSpec),openIndices:()=>setIndices(true),exportContent:(format,save)=>exportWorkbenchContent(root,node,format,{body:entry.host.querySelector('.en-native-component-body')||entry.host,save}),openData:()=>{if(!node.noteDataBound)return false;setDataSettings(true);void dataAction('data-read').catch(()=>{});return true}}
  root.__eworkNoteMenu=adapter
  return()=>{if(root.__eworkNoteMenu===adapter)delete root.__eworkNoteMenu}
 },[entry.instanceId,entry.host,node,entry.readOnly])
 const interactionBridge=react.useMemo(()=>eworkCreateNoteHtmlInteraction(node.config?.interactionState,async(version,event)=>{
  const result=await new Promise((resolve,reject)=>{
   const requestId=entry.instanceId+':interaction:'+(++sequence.current),timer=setTimeout(()=>{generationPending.current.delete(requestId);reject(Error('笔记交互保存未确认，请重试。'))},6000)
   generationPending.current.set(requestId,{resolve,reject,timer});action('interaction',{requestId,nodeId:node.id,html:spec.html,version,event})
  }).catch(error=>{setError(error.message);throw error});setError('');return result.state
 }),[entry.instanceId,node.id,spec.html])
 const interactionState=react.useSyncExternalStore(interactionBridge.subscribe,interactionBridge.snapshot)
 react.useLayoutEffect(()=>{interactionBridge.observe(node.config?.interactionState)},[interactionBridge,node.config?.interactionState])
 react.useEffect(()=>()=>interactionBridge.dispose(),[interactionBridge])
 const sharedBridge=react.useMemo(()=>eworkCreateNoteHtmlSharedState(node.config?.sharedComponentState,async(version,revision,state)=>{
  const result=await new Promise((resolve,reject)=>{
   const requestId=entry.instanceId+':shared-state:'+(++sequence.current),timer=setTimeout(()=>{generationPending.current.delete(requestId);reject(Error('笔记交互保存未确认，请重试。'))},6000)
   generationPending.current.set(requestId,{resolve,reject,timer});action('shared-state',{requestId,nodeId:node.id,html:spec.html,version,sharedState:{revision,state}})
  }).catch(error=>{setError(error.message);throw error});setError('');return result.state
 }),[entry.instanceId,node.id,spec.html])
 const sharedState=react.useSyncExternalStore(sharedBridge.subscribe,sharedBridge.snapshot)
 react.useLayoutEffect(()=>{sharedBridge.observe(node.config?.sharedComponentState)},[sharedBridge,node.config?.sharedComponentState])
 react.useEffect(()=>()=>sharedBridge.dispose(),[sharedBridge])
 const refresh=async()=>{if(refreshing||entry.readOnly)return;setRefreshBusy(true);try{await generationAction('refresh');setRefreshError('')}catch(e){setRefreshError(e.message)}finally{setRefreshBusy(false)}}
 if(entry.mode==='generation'&&!node.containerSpec)return react_dom.createPortal(react.createElement(ResearchGenerationProcess,{node,sessionId:entry.sessionId,onCancel:entry.readOnly?undefined:()=>generationAction('generation-stop'),onRetry:entry.readOnly?undefined:()=>{void generationAction('generation-retry').catch(error=>setError(error.message))},phaseOverride:entry.phase?workbenchText(entry.phase):undefined,detailOverride:error||(entry.detail?workbenchText(entry.detail):undefined)}),entry.host,entry.instanceId)
 const sourceButton=spreadsheet&&entry.source?react.createElement('button',{type:'button',className:'ew-sheet-native-source','aria-label':workbenchText('定位选区')+' '+entry.source,title:entry.source,onClick:()=>{void generationAction('source').catch(error=>setError(error.message))}},react.createElement(WorkbenchIcon,{name:'sheet-pin'}),react.createElement('span',{'data-ui-preserve':true},entry.source)):null
 const body=node.kind==='web-link'?react.createElement(ResearchCanvasWebFrame,{node,sessionId:entry.sessionId,visible:true,onInspection:(url,inspection)=>action('web-inspection',{url,inspection})}):node.noteReply?react.createElement(ResearchDerivedSummary,{node,onUpgradeSize:(_id,size)=>{if(size?.height)action('size',{height:size.height})}}):spec.type==='financial-widget'?react.createElement(FinancialWidget,{node,sessionId:entry.sessionId,visible:true,surface:'notes',hostReadOnly:!!entry.readOnly,onSpecChange:save,footerExtra:sourceButton}):react.createElement(spreadsheet?ResearchContainerContent:ResearchContainerBody,{node:entry.readOnly?{...node,readOnly:true}:node,sessionId:entry.sessionId,visible:true,officePreview,preserveHeading:true,onHtmlSize:(_id,size)=>{
  // ResearchHtmlArtifact reports outer-card height. Notes stores the content
  // host height, then renders its own chrome around that host.
  const frame=entry.host.querySelector('iframe.rScV5Q_webFrame'),card=entry.host.closest('[data-research-node-id]')
  if(!frame||!card||frame.closest('[data-research-node-id]')!==card||!entry.host.contains(frame)||!Number.isFinite(size?.height)||frame.clientHeight<=0||entry.host.offsetHeight<=0||card.offsetHeight<=0)return false
  const chrome=Math.max(0,card.offsetHeight-entry.host.offsetHeight),contentHeight=Math.ceil(size.height-chrome)
  if(contentHeight<1)return false
  action('size',{height:contentHeight})
 }})
 if(spreadsheet){
  const run=name=>()=>action(name)
  const buttons=[
   {name:entry.floating?'sheet-dock':'sheet-float',label:workbenchText(entry.floating?'收回侧边':'自由摆放'),run:run('placement'),disabled:entry.readOnly},
   {name:'close',label:workbenchText(entry.floating?'移除组件':'关闭组件'),run:run(entry.floating?'remove':'close'),disabled:entry.floating&&entry.readOnly}
  ]
  const reload=refreshState&&typeof entry.host.querySelector==='function'?async()=>{
   const widget=entry.host.querySelector('[data-financial-widget]')
   if(spec.type==='financial-widget')return widget?.__eworkRefreshFinancial?.()??{error:workbenchText('组件暂未就绪')}
   await generationAction('refresh')
  }:undefined
  const titleExtra=spec.widget==='indices'?react.createElement('button',{type:'button','aria-label':workbenchText('配置指数'),title:workbenchText('配置指数'),onPointerDown:event=>event.stopPropagation(),onClick:()=>setIndices(true),disabled:entry.readOnly},react.createElement(WorkbenchIcon,{name:'settings'})):null
  const sourceDetailsTitle=workbenchText('查看来源信息')
  const openSheetSourceDetails=trigger=>{
   const info=getComponentSourceInfo(node)
   openComponentSource(entry.sessionId,node,'details',trigger,{...info,range:entry.source||info.range})
  }
  const themeAction=eworkComponentSurfaceUi.themeAction(sheetTheme,theme=>generationAction('theme',{theme}),entry.readOnly)
  if(document.documentElement.dataset.odysseyLocale==='en'){
   themeAction.label='Theme'
   themeAction.submenuLabel='Component theme'
   for(const item of themeAction.children)item.label=workbenchText(item.label)
  }
  const menuActions=[
   {id:'source',icon:'sheet-pin',label:workbenchText('定位选区'),run:()=>generationAction('source')},
   {id:'source-details',icon:'data',label:sourceDetailsTitle,run:()=>openSheetSourceDetails(sheetMenu)},
   {id:'rename',icon:'edit',label:workbenchText('重命名组件'),run:run('rename'),disabled:entry.readOnly},
   node.generationStatus==='completed'&&spec.type!=='calendar-tool'&&{id:'library',icon:'library-add',label:workbenchText('添加至组件库'),disabled:entry.readOnly,run:async()=>{
    await generationAction('library-save')
    window.dispatchEvent(new CustomEvent('ework-component-library-changed'))
    window.dispatchEvent(new CustomEvent('ework-component-library-saved',{detail:{sessionId:entry.sessionId}}))
   }},
   themeAction,
   {id:'export',icon:'download',label:workbenchText('导出'),children:['svg','png','jpg'].map(format=>({id:format,label:format.toUpperCase(),run:()=>exportWorkbenchContent(rootRef.current,node,format,{body:entry.host})}))},
   {id:'remove',icon:'remove',label:workbenchText('移除组件'),run:run('remove'),disabled:entry.readOnly}
  ]
  return react.createElement(react.Fragment,null,
   react_dom.createPortal(react.createElement(WorkbenchChrome,{node,sessionId:entry.sessionId,readOnly:entry.readOnly,titleExtra,onReload:reload,
    surfaceActions:{surface:'spreadsheet',onSpecChange:save,buttons,menuOpen:!!sheetMenu},
    onAsk:run('ask'),onMore:(_node,event)=>{const trigger=event.currentTarget;setSheetMenu(previous=>previous?null:trigger)}}),entry.header),
   entry.footer&&spec.type!=='financial-widget'&&react_dom.createPortal(react.createElement('button',{type:'button',className:'ew-sheet-source-details',title:sourceDetailsTitle,'aria-label':sourceDetailsTitle,onClick:event=>openSheetSourceDetails(event.currentTarget)},react.createElement(WorkbenchIcon,{name:'data'})),entry.footer),
   sheetMenu&&react.createElement(eworkComponentSurfaceUi.Menu,{surface:'spreadsheet',trigger:sheetMenu,actions:menuActions,onClose:()=>setSheetMenu(null)}),
   react_dom.createPortal(react.createElement('div',{className:'rScV5Q_containerBody en-native-component-body',key:entry.refresh},
    error&&react.createElement('div',{role:'alert',className:'en-component-error'},error),
    react.createElement(eworkNoteHtmlInteractionContext.Provider,{value:{surface:'spreadsheet',bridge:interactionBridge,state:interactionState,sharedBridge,sharedState,readOnly:true}},body),
    indices&&react.createElement(FinancialIndicesSettings,{node,sessionId:entry.sessionId,rootRef,readOnly:!!entry.readOnly,onClose:()=>setIndices(false),onChange:save})),entry.host,entry.instanceId)
  )
 }
 const title=['quote','announcements'].includes(spec.widget)?react.createElement(react.Fragment,null,react.createElement(WorkbenchTitle,{title:node.displayName||node.title||node.name||workbenchText('组件'),systemTitle:!node.displayName&&node.title===financialWidgetDefaults(spec.widget)?.title}),react.createElement(FinancialQuoteSelector,{node,sessionId:entry.sessionId,readOnly:!!entry.readOnly,onSpecChange:save})):spec.widget==='news'?react.createElement(FinancialNewsSearch,{node,sessionId:entry.sessionId,readOnly:!!entry.readOnly,onSpecChange:save,surface:'notes'}):react.createElement('strong',null,node.title)
 return react.createElement(react.Fragment,null,
  dataSettings&&react.createElement(ComponentDataSettingsPanel,{title:node.displayName||node.title,binding:dataRecord,error:dataError,busy:dataBusy,loading:dataBusy&&!dataRecord,onChange:entry.readOnly?undefined:settings=>dataAction('data-configure',{settings}),onRefresh:entry.readOnly?undefined:()=>dataAction('data-refresh'),onClose:()=>setDataSettings(false),theme:entry.dark?'dark':'light',readOnly:!!entry.readOnly,surface:'notes'}),
  react_dom.createPortal(react.createElement('div',{className:'en-native-component-heading'},refreshState&&react.createElement('span',{className:'ew-grid-refresh'},react.createElement('button',{type:'button',className:'en-component-refresh','aria-label':workbenchText('刷新组件'),disabled:entry.readOnly||refreshing,'aria-busy':refreshing||undefined,'data-workbench-refresh':node.id,'data-refresh-state':refreshState.state,'data-busy':refreshing||undefined,onPointerDown:e=>e.stopPropagation(),onClick:refresh},react.createElement(WorkbenchIcon,{name:refreshState.icon}))),title),entry.header),
  react_dom.createPortal(react.createElement('div',{className:'rScV5Q_containerBody en-native-component-body',key:entry.refresh},error&&react.createElement('div',{role:'alert',className:'en-component-error'},error),react.createElement(eworkNoteHtmlInteractionContext.Provider,{value:{bridge:interactionBridge,state:interactionState,sharedBridge,sharedState,readOnly:!!entry.readOnly}},body),indices&&react.createElement(FinancialIndicesSettings,{node,sessionId:entry.sessionId,rootRef,readOnly:!!entry.readOnly,onClose:()=>setIndices(false),onChange:save})),entry.host,entry.instanceId)
 )
}
export function EWorkNoteComponentViews({sessionId,active,spreadsheet=false}){
 const entries=react.useSyncExternalStore(eworkNoteComponentViews.subscribe,eworkNoteComponentViews.snapshot),visible=entries.filter(entry=>entry.sessionId===sessionId&&entry.host.isConnected&&(entry.surface==='spreadsheet')===spreadsheet),instances=visible.map(entry=>entry.instanceId).sort().join(','),officePreview=react.useSyncExternalStore(eworkNoteOfficePreview.subscribe,eworkNoteOfficePreview.getSnapshot)
 react.useEffect(()=>{if(active)document.dispatchEvent(new CustomEvent('sherlock:notes-components-sync-request',{detail:{sessionId}}))},[sessionId,active])
 react.useEffect(()=>{if(spreadsheet)document.dispatchEvent(new CustomEvent('sherlock:spreadsheet-component-reload'))},[sessionId,spreadsheet])
 react.useEffect(()=>{
  const bridge=window.dshDesktop?.componentData;if(!active||typeof bridge?.request!=='function')return
  let live=true,pushed=false;const publish=event=>{if(live&&event?.sessionId===sessionId&&Array.isArray(event.rows)){pushed=true;componentDataStatusStore.publish(sessionId,event.rows,'notes')}}
  const reset=()=>componentDataStatusStore.clear(sessionId,'notes');document.addEventListener('sherlock:notes-reset',reset)
  const off=bridge.subscribe?.(publish,'notes')
  Promise.resolve(bridge.request(sessionId,{action:'list',surface:'notes'})).then(rows=>{if(live&&!pushed&&Array.isArray(rows))componentDataStatusStore.publish(sessionId,rows,'notes')}).catch(()=>{})
  return()=>{live=false;off?.();document.removeEventListener('sherlock:notes-reset',reset);reset()}
 },[sessionId,active,instances])
 return active||spreadsheet?react.createElement(react.Fragment,null,visible.map(entry=>react.createElement(EWorkNoteComponentView,{key:entry.instanceId,entry,officePreview}))):null
}
export function noteComponentClientHelpers(){return 'const eworkNoteHtmlInteractionContext=react.createContext(null);\n'+createNoteHtmlInteractionBridge.toString()+'\n'+createNoteHtmlSharedStateBridge.toString()+'\nconst eworkCreateNoteHtmlInteraction=createNoteHtmlInteractionBridge;const eworkCreateNoteHtmlSharedState=createNoteHtmlSharedStateBridge;\n'+[createNoteComponentViewStore,EWorkNoteComponentView,EWorkNoteComponentViews].map(fn=>fn.toString()).join('\n')+"\nconst eworkNoteComponentViews=createNoteComponentViewStore(typeof document==='undefined'?undefined:document);\n"}
export function patchNotesComponents(source){
 const marker='/* ework:notes-native-components:v1 */'
 if(!source.includes(marker)){
  const anchor="react.createElement(EWorkNoteFileViews,{sessionId,active:activeView==='notes'}), "
  if(source.split(anchor).length!==2)throw Error('无法定位笔记原生组件预览。')
  source=source.replace(anchor,anchor+marker+" react.createElement(EWorkNoteComponentViews,{sessionId,active:activeView==='notes'}), ")
 }
 return patchComponentSurfaceMenu(patchNotesHtmlInteraction(source,EWorkNoteComponentView.toString()))
}
