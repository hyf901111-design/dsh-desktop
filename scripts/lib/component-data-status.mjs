import {componentSourceDefinitions as sourceDefinitions,componentSourceCss as sourceCss} from './component-source-info.mjs'
import * as workbenchRefresh from '../../packages/dsh-research-task-runtime/workbench-refresh.js'
const {createWorkbenchRefreshSurface,isWorkbenchViewState,workbenchContentRevision,workbenchTemplateIdentity,workbenchRefreshCss}=workbenchRefresh
export function componentDataSourceNames(binding){
 const names=Array.isArray(binding?.sourceNames)?binding.sourceNames:Array.isArray(binding?.requests)?binding.requests.map(request=>request.sourceName):[]
 const sources=[...new Set(names.filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim()))]
 const selected=binding?.sources?.find(source=>source.id===binding.sourceId)?.name
 return sources.length?sources:typeof selected==='string'&&selected.trim()?[selected.trim()]:[]
}
// Provenance belongs to the saved component, independently of its refresh job.
// Only read inert metadata; never execute generated HTML or infer a provider.
export function componentSavedProvenance(node){
 const spec=node?.containerSpec||{},html=spec.html
 let data=spec
 if(typeof html==='string'){
  const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
  if(encoded&&encoded.length<=512000){try{data=JSON.parse(encoded).data||spec}catch{}}
 }
 const label=value=>typeof value==='string'?value.trim():value&&typeof value==='object'?label(value.label||value.name||value.title||value.provider):''
 const names=[...(Array.isArray(data.sources)?data.sources:[]),data.source].map(label).filter(Boolean)
 const recorded=typeof data.note==='string'?data.note.match(/(?:^|\n)\s*(?:数据)?来源(?:[：:]\s*|[ \t]+)([^，。；\n·]+)/)?.[1]?.trim():''
 if(!names.length&&recorded)names.push(recorded)
 if(!names.length&&['news','reports'].includes(data.type)&&Array.isArray(data.items)){
  for(const item of data.items){
   const name=label(item.source)
   if(name)names.push(name)
   else{try{const url=new URL(item.url);if(['http:','https:'].includes(url.protocol))names.push(url.hostname)}catch{}}
  }
 }
 return {names:[...new Set(names)],asOf:typeof data.asOf==='string'?data.asOf:'',range:typeof data.range==='string'?data.range:''}
}
export function componentSourceLabel(name){
 const label=name.split(/\s+\/\s+/)[0].replace(/\s+MCP$/i,'').trim()
 // Only abbreviate an explicitly named provider; keep full provenance in the
 // tooltip and saved model, rather than exposing endpoint names in the footer.
 return /^tushare(?:\b|_)/i.test(label)?'Tushare':label
}
export function componentSnapshotDate(saved){
 const dates=text=>[...text.matchAll(/\b(20\d{2})-?(\d{2})-?(\d{2})\b/g)].filter(m=>{
  const iso=m[1]+'-'+m[2]+'-'+m[3],date=new Date(iso+'T00:00:00Z')
  return Number.isFinite(date.getTime())&&date.toISOString().startsWith(iso)&&!/(?:获取|刷新|保存|生成)[^·；。\n]*$/.test(text.slice(0,m.index))
 }).map(m=>m[1]+'-'+m[2]+'-'+m[3])
 const range=dates(saved.range),asOf=dates(saved.asOf)
 // Some saved templates store the entire period in asOf rather than range.
 // Only carry the second date when an explicit range separator connects it;
 // a later received/generated date must not become the period end.
 const explicitPeriod=saved.asOf.match(/\b20\d{2}-?\d{2}-?\d{2}\s*(?:至|到|[~～–—-])\s*20\d{2}-?\d{2}-?\d{2}\b/)
 const period=explicitPeriod?dates(explicitPeriod[0]):[]
 const values=range.length?range:period.length===2&&period[0]===asOf[0]?period:asOf.slice(0,1)
 return values.length?'数据 '+(values.length>1&&values[0]!==values[1]?values[0]+' 至 '+values[1]:values[0]):''
}
// One canvas subscription; publishing status never updates the canvas model or
// replaces an iframe. Only the affected footer subscribes to its own snapshot.
export function createComponentDataStatusStore(){
 const sessions=new Map(),listeners=new Map(),nativeRows=new Map(),summaries=new Map(),sessionListeners=new Map()
 const empty=Object.freeze({ready:false,observed:false,complete:true,rows:Object.freeze([])})
 // A bounded memory-only projection for conversation feedback. Footers retain
 // their original read/clear behavior; no source payload enters this summary.
 const project=row=>Object.freeze({nodeId:row.nodeId,status:['idle','refreshing','success','unchanged','error'].includes(row.status)?row.status:'unknown',lastRefreshFailed:row.lastRefreshFailed===true,lastSuccess:typeof row.lastSuccess==='number'&&Number.isFinite(row.lastSuccess)?row.lastSuccess:typeof row.lastSuccess==='string'&&Number.isFinite(Date.parse(row.lastSuccess))?new Date(row.lastSuccess).toISOString():null,...(typeof row.enabled==='boolean'?{enabled:row.enabled}:{}),...(typeof row.viewPaused==='boolean'?{viewPaused:row.viewPaused}:{}),...(Number.isFinite(row.intervalMinutes)&&row.intervalMinutes>=0?{intervalMinutes:row.intervalMinutes}:{}),...(row.native===true?{native:true}:{}),...(row.lastObserved===true?{lastObserved:true}:{})})
 const publishSummary=(sessionId,{ready,observed,complete,rows})=>{
  const previous=summaries.get(sessionId)??empty,next={ready,observed,complete:complete!==false&&rows.length<=512,rows:Object.freeze(rows.slice(0,512).map(project).sort((a,b)=>a.nodeId.localeCompare(b.nodeId)))}
  if(JSON.stringify(previous)===JSON.stringify(next))return
  summaries.delete(sessionId);summaries.set(sessionId,Object.freeze(next))
  while(summaries.size>64){const oldest=summaries.keys().next().value;summaries.delete(oldest);sessionListeners.get(oldest)?.forEach(fn=>fn())}
  sessionListeners.get(sessionId)?.forEach(fn=>fn())
 }
 const summarize=(sessionId,retiredNative)=>{
  const session=sessions.get(sessionId),previous=summaries.get(sessionId)??empty,rows=new Map((session?[...session.rows.values()]:previous.rows).map(row=>[row.nodeId,row]))
  for(const row of previous.rows)if(row.native&&!session?.rows.has(row.nodeId))rows.set(row.nodeId,row)
  if(retiredNative&&!session?.rows.has(retiredNative.nodeId))rows.set(retiredNative.nodeId,{...retiredNative,lastObserved:true})
  for(const [k,row]of nativeRows)if(k===key(sessionId,row.nodeId))rows.set(row.nodeId,row)
  publishSummary(sessionId,{ready:session?.ready===true,observed:session?.ready===true||previous.observed,complete:session?true:previous.complete,rows:[...rows.values()]})
 }
 const bindingKey=(sessionId,surface='research')=>surface==='research'?sessionId:JSON.stringify([sessionId,surface])
 const validSurface=surface=>['research','notes','conversation'].includes(surface)
 const key=(sessionId,nodeId,surface='research')=>JSON.stringify([sessionId,nodeId,surface])
 const notify=(sessionId,nodeId,surface='research')=>listeners.get(key(sessionId,nodeId,surface))?.forEach(fn=>fn())
 const lastFailed=(row,old)=>['success','unchanged'].includes(row.status)?false:Boolean(row.status==='error'||row.failures>0||old?.lastRefreshFailed)
 return {
  snapshotSession:sessionId=>summaries.get(sessionId)??empty,
  subscribeSession(sessionId,fn){if(!sessionListeners.has(sessionId))sessionListeners.set(sessionId,new Set());sessionListeners.get(sessionId).add(fn);return()=>{const set=sessionListeners.get(sessionId);set?.delete(fn);if(!set?.size)sessionListeners.delete(sessionId)}},
  read:(sessionId,nodeId,surface='research')=>validSurface(surface)?nativeRows.get(key(sessionId,nodeId,surface))||sessions.get(bindingKey(sessionId,surface))?.rows.get(nodeId)||null:null,
  // Builtin widgets own their live source/scheduler. Host binding polls must
  // not erase those outcomes, and unmounting a widget releases its own row.
  publishNative(sessionId,nodeId,row,surface='research'){if(!validSurface(surface))return;const k=key(sessionId,nodeId,surface),old=nativeRows.get(k),next={...row,nodeId,native:true,lastRefreshFailed:lastFailed(row,old)};if(JSON.stringify(old)!==JSON.stringify(next)){nativeRows.set(k,next);notify(sessionId,nodeId,surface);if(surface==='research')summarize(sessionId)}},
  clearNative(sessionId,nodeId,surface='research'){if(!validSurface(surface))return;const k=key(sessionId,nodeId,surface),old=nativeRows.get(k);if(nativeRows.delete(k)){notify(sessionId,nodeId,surface);if(surface==='research')summarize(sessionId,old)}},
  subscribe(sessionId,nodeId,fn,surface='research'){if(!validSurface(surface))return()=>{};const k=key(sessionId,nodeId,surface);if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);return()=>{const set=listeners.get(k);set?.delete(fn);if(!set?.size)listeners.delete(k)}},
  suspend(sessionId,surface='research'){if(!validSurface(surface))return;const session=sessions.get(bindingKey(sessionId,surface));if(session)session.ready=false;if(surface==='research')summarize(sessionId)},
  publish(sessionId,rows,surface='research'){
   if(!validSurface(surface))return
   const id=bindingKey(sessionId,surface),previous=sessions.get(id)||{rows:new Map(),ready:false},next=new Map()
   for(const row of rows){
    const old=previous.rows.get(row.nodeId)
    const advanced=Number.isInteger(row.successSequence)?row.successSequence>(old?.successSequence||0):row.lastSuccess>old?.lastSuccess
    const snapshot={successSequence:row.successSequence||0,nodeId:row.nodeId,status:row.status,lastRefreshFailed:lastFailed(row,old),lastSuccess:row.lastSuccess||null,dataAsOf:row.dataAsOf||'',enabled:row.enabled,viewPaused:row.viewPaused,intervalMinutes:row.intervalMinutes,sourceNames:componentDataSourceNames(row),
     refreshSequence:(old?.refreshSequence||0)+(previous.ready&&old&&advanced&&row.status==='success'?1:0),
     completionSequence:(old?.completionSequence||0)+(previous.ready&&old&&advanced&&['success','unchanged'].includes(row.status)?1:0)}
    next.set(row.nodeId,JSON.stringify(old)===JSON.stringify(snapshot)?old:snapshot)
   }
   sessions.set(id,{rows:next,ready:true});if(surface==='research')summarize(sessionId)
   for(const nodeId of new Set([...previous.rows.keys(),...next.keys()]))if(previous.rows.get(nodeId)!==next.get(nodeId))notify(sessionId,nodeId,surface)
  },
  clear(sessionId,surface='research'){if(!validSurface(surface))return;const id=bindingKey(sessionId,surface),previous=sessions.get(id);sessions.delete(id);previous?.rows.forEach((_,nodeId)=>notify(sessionId,nodeId,surface));if(surface==='research')summarize(sessionId)}
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

export function componentDataStatusView(binding,completion=null,node=null){
 const saved=componentSavedProvenance(node),boundNames=componentDataSourceNames(binding),sourceNames=boundNames.length?boundNames:saved.names,source=[...new Set(sourceNames.map(componentSourceLabel))].join(' / ')||'来源未标注'
 const valid=binding?.lastSuccess&&Number.isFinite(new Date(binding.lastSuccess).getTime())
 const time=valid?'刷新 '+new Date(binding.lastSuccess).toLocaleTimeString('zh-CN',{hour12:false}):binding?'尚未刷新':componentSnapshotDate(saved)
 const frequency=binding?.intervalMinutes===1?'每分钟':binding?.intervalMinutes>0?'每 '+binding.intervalMinutes+' 分钟':'仅手动'
 const phase=binding?.status==='refreshing'?'refreshing':binding?.status==='error'?'error':completion===binding?.status&&['success','unchanged'].includes(completion)?completion:null
 const detail=!binding?'静态快照':phase==='refreshing'?'正在更新数据…':phase==='error'?'更新失败 · 保留上次数据':phase==='success'?'已更新':phase==='unchanged'?'已检查 · 数据无变化':binding.viewPaused?'离开看板已暂停':!binding.enabled&&binding.intervalMinutes>0?'已暂停':frequency
 const asOf=binding?.dataAsOf||saved.asOf
 return {time,detail,source,phase,title:'数据来源：'+(sourceNames.length?sourceNames.join('；'):'来源未标注')+(valid?'\n上次成功取数：'+new Date(binding.lastSuccess).toLocaleString('zh-CN'):binding?'\n尚无成功刷新记录':'\n静态快照')+(asOf?'\n数据时点：'+asOf:'')+(saved.range?'\n统计区间：'+saved.range:'')+'\n点击设置数据源与刷新频率'}
}

// Personal technical annotations survive a card unmount. Persist only its
// semantic chart key; ordinary form values and source data stay out of this cache.
export function personalChartViewState(state){
 if(!isWorkbenchViewState(state))return null
 const row=state.values.find(row=>row[0]==='chart-view-key:technical-controls')
 return row?{values:[row],controls:[],scroll:[]}:null
}
export function readPersonalChartView(node){
 const html=node?.containerSpec?.html,saved=node?.config?.personalChartView
 return typeof html==='string'&&workbenchTemplateIdentity(html).startsWith('template:market.charting:')&&saved?.revision===workbenchContentRevision(html)?personalChartViewState(saved.state):null
}
export function createPersonalChartViewSink({read,write,canWrite}){
 return (nodeId,revision,state)=>{
  if(!canWrite())return false
  const node=read().find(n=>n.id===nodeId),html=node?.containerSpec?.html,next=personalChartViewState(state)
  if(!next||typeof html!=='string'||revision!==workbenchContentRevision(html)||!workbenchTemplateIdentity(html).startsWith('template:market.charting:'))return false
  const saved={revision,state:next}
  if(JSON.stringify(node.config?.personalChartView)===JSON.stringify(saved))return true
  return write(nodeId,{...node.config,personalChartView:saved})!==false
 }
}

export function createComponentRefreshFeedback(card,{initialState=null,onState=()=>{}}={}){
 const body=card.querySelector('[data-research-preview-body]'),frame=body?.querySelector('iframe'),win=card.ownerDocument.defaultView
 if(!body)return {update(){},dispose(){}}
 let view=isWorkbenchViewState(initialState)?initialState:null,baseline=null,sequence=0,initialized=false,animate=false,disposed=false,timer=0,loadingTimer=0,revision=null,readyRevision=null,identity=null,awaitRevision=null,refreshOrigin=null,previousStatus=null
 const surface=frame?null:createWorkbenchRefreshSurface(body,state=>{view=state})
 const chartKey=key=>key.startsWith('chart-view:')||key.startsWith('chart-view-key:')
 const retainCharts=(state,saved)=>({...state,values:[...state.values.filter(row=>!chartKey(row[0])),...(saved?.values||state.values).filter(row=>chartKey(row[0]))]})
 if(surface)view=surface.snapshot()
 const send=()=>{
  if(disposed||!view||frame&&animate&&revision===awaitRevision)return
  const state={...view,values:[...(baseline||view.values).filter(row=>!chartKey(row[0])),...view.values.filter(row=>chartKey(row[0]))]}
  if(frame){if(readyRevision===revision)frame.contentWindow?.postMessage({type:'sherlock-workbench-restore',state,animate,revision},'*')}
  else surface.apply(state,animate)
 }
 const receive=event=>{
  const data=event.data
  // Journal rollback owns the next document's controls. The refresh cache must
  // not restore the just-undone or rejected edit over that authoritative replay.
  if(event.source===frame?.contentWindow&&data?.type==='sherlock-interaction-reload'&&Object.keys(data).length===1){
   clearTimeout(timer);timer=0;view=null;baseline=null;readyRevision=null;animate=false;awaitRevision=null;return
  }
  if(event.source!==frame?.contentWindow||!['sherlock-workbench-ready','sherlock-workbench-view'].includes(data?.type)||Object.keys(data).length!==3||data.revision!==revision||!isWorkbenchViewState(data.state))return
  if(data.type==='sherlock-workbench-ready'){
   clearTimeout(timer);timer=0
   readyRevision=data.revision;const saved=view;view=data.state
   if(saved)view={...retainCharts(view,saved),controls:saved.controls,scroll:saved.scroll}
   if(!baseline)baseline=data.state.values
   // A fresh document already has these defaults. Sending them back can arrive
   // after journal replay and overwrite its restored selection.
   if(saved||animate)send()
  }else{
   view=data.state
   onState(view,revision)
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
  if(binding?.status==='refreshing')body.setAttribute('aria-busy','true');else body.removeAttribute('aria-busy')
  if(binding?.status==='refreshing')loadingTimer=setTimeout(()=>{card.setAttribute('data-component-updating','')},300)
  else card.removeAttribute('data-component-updating')
  if(!binding)return
  if(!initialized){initialized=true;sequence=next;baseline=view?.values||null;return}
  if(next>sequence&&binding.status==='success'){
   sequence=next;animate=true;awaitRevision=frame?(refreshOrigin||previousRevision):null;refreshOrigin=null
   clearTimeout(timer);timer=setTimeout(()=>{if(surface){const current=surface.snapshot();view={...retainCharts(current,view),controls:view?.controls||current.controls,scroll:view?.scroll||current.scroll}}send();if(surface){baseline=surface.snapshot().values;animate=false}},100)
  }else if(binding.status==='unchanged'){if(surface)view=surface.snapshot();if(view)baseline=view.values}
 },dispose(){disposed=true;clearTimeout(timer);clearTimeout(loadingTimer);win.removeEventListener('message',receive);surface?.dispose();card.removeAttribute('data-component-refreshing');card.removeAttribute('data-component-updating');body.removeAttribute('aria-busy')}}
}

export function componentRssStatusView(node){
 const html=node?.containerSpec?.html;if(typeof html!=='string')return null
 const source=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];if(!source)return null
 let model;try{model=JSON.parse(source)}catch{return null}
 if(model.templateId!=='rss'||!Array.isArray(model.data?.feeds))return null
 const feeds=model.data.feeds,times=feeds.map(f=>f.fetchedAt).filter(t=>typeof t==='string'&&Number.isFinite(new Date(t).getTime())).sort((a,b)=>new Date(b)-new Date(a)),lastSuccess=times[0]||null,failed=feeds.some(f=>f.error)
 return {source:[...new Set(feeds.map(f=>f.title||f.url).filter(Boolean))].join(' / ')||'来源未标注',lastSuccess,refreshable:feeds.some(feed=>typeof feed.url==='string'&&feed.url.trim()),time:lastSuccess?'读取 '+new Date(lastSuccess).toLocaleTimeString('zh-CN',{hour12:false}):'尚未读取',detail:!feeds.length?'尚未添加订阅':failed?'读取失败 · 保留上次条目':lastSuccess?'订阅 · 仅手动':'尚未读取订阅源',phase:failed?'error':null,title:feeds.map(f=>(f.title||f.url)+'：'+(f.error||'抓取 '+(f.fetchedAt||'尚未读取'))).join('\n')}
}

export function ComponentDataStatusBar({sessionId,node,workbench=false}){
 const binding=react.useSyncExternalStore(react.useCallback(fn=>componentDataStatusStore.subscribe(sessionId,node.id,fn),[sessionId,node.id]),react.useCallback(()=>componentDataStatusStore.read(sessionId,node.id),[sessionId,node.id]))
 const ref=react.useRef(null),feedback=react.useRef(null)
 const completion=react.useRef({key:null,sequence:0}),[notice,setNotice]=react.useState(null),key=JSON.stringify([sessionId,node.id])
 react.useEffect(()=>{
  const sequence=binding?.completionSequence||0,previous=completion.current
  completion.current={key,sequence}
  // Entering a session starts from its current snapshot. Historical refreshes
  // must not be announced as a new update or flash the existing values.
  if(previous.key!==key||!binding){setNotice(null);return}
  if(!['success','unchanged'].includes(binding.status)){setNotice(null);return}
  if(sequence<=previous.sequence||!['success','unchanged'].includes(binding.status))return
  setNotice({key,status:binding.status})
  const timer=setTimeout(()=>setNotice(null),2400)
  return()=>clearTimeout(timer)
 },[key,binding?.completionSequence,binding?.status])
 const content=node.containerSpec?.html||JSON.stringify(node.containerSpec||{}),identity=node.containerSpec?.type==='html'?workbenchTemplateIdentity(content):node.containerSpec?.type+':'+node.containerSpec?.variant
 react.useLayoutEffect(()=>{const card=ref.current?.closest('[data-research-node-id]');if(workbench&&card){feedback.current=createComponentRefreshFeedback(card,{initialState:readPersonalChartView(node),onState:(state,revision)=>{if(typeof researchPersonalChartViewSinks!=='undefined')researchPersonalChartViewSinks.get(sessionId)?.(node.id,revision,state)}});feedback.current.update(binding,content,identity)}return()=>{feedback.current?.dispose();feedback.current=null}},[sessionId,node.id,workbench,node.containerSpec?.type==='html'])
 react.useLayoutEffect(()=>{feedback.current?.update(binding,content,identity)},[binding,content,identity])
 const rss=componentRssStatusView(node),view=rss||componentDataStatusView(binding,notice?.key===key?notice.status:null,node),shared=sherlockShared(sessionId),plain=Boolean(rss),lastSuccess=rss?rss.lastSuccess:binding?.lastSuccess
 const label=(view.source||'来源未标注')+' · '+(shared?'静态组件':view.detail)
 const savedInfo=react.useMemo(()=>getComponentSourceInfo(node),[node.containerSpec,node.generationSources]);
 if(['iframe','youtube'].includes(node.containerSpec?.type))return null;
 const sourceInfo={...savedInfo,records:[...savedInfo.records]};if(!sourceInfo.records.length)sourceInfo.records=(binding?.sourceNames||[]).map(label=>({label,url:'',path:'',filename:'',text:''}));if(!sourceInfo.asOf)sourceInfo.asOf=binding?.dataAsOf||'';const files=sourceInfo.records.filter(row=>row.filename||row.path),sourceLabel=files.length?files.map(row=>row.filename||row.label).join(' / '):label
 return react_jsx_runtime.jsxs('div',{ref,className:'odyssey-data-stamp','data-component-data-status':rss?(rss.phase||'manual'):binding?.status||'unbound','data-refresh-feedback':shared?undefined:view.phase||undefined,onPointerDown:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),children:[
  files.length?react_jsx_runtime.jsx('button',{type:'button',className:'ew-source-file',title:sourceLabel,'aria-label':'查看来源文件：'+sourceLabel,onClick:e=>{e.stopPropagation();openComponentSource(sessionId,node,'files',e.currentTarget,sourceInfo)},children:sourceLabel}):react_jsx_runtime.jsx('span',{className:'odyssey-data-frequency',role:'status','aria-live':'polite',children:label}),
  react_jsx_runtime.jsxs('span',{className:'ew-source-actions',children:[
   view.time&&react_jsx_runtime.jsx('time',{dateTime:lastSuccess?new Date(lastSuccess).toISOString():undefined,children:view.time}),
   !plain&&!shared&&binding&&react_jsx_runtime.jsx('button',{type:'button','aria-label':'设置数据源与刷新频率',onClick:e=>{e.stopPropagation();openComponentData(sessionId,node,'settings',e.currentTarget)},children:'更新设置'}),
   react_jsx_runtime.jsx('button',{type:'button',onClick:e=>{e.stopPropagation();openComponentSource(sessionId,node,'details',e.currentTarget,sourceInfo)},children:'查看来源信息'})
  ]})
 ]})
}

export const componentDataStatusCss=workbenchRefreshCss+sourceCss+`
[data-research-generated-container]:has(>.odyssey-data-stamp)>[data-research-preview-body]{position:relative;height:calc(100% - 56px);min-height:0}
[data-research-generated-container]>.odyssey-data-stamp{box-sizing:border-box;flex:0 0 24px;height:24px;min-height:24px;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0;padding:0 8px;border:0;border-top:1px solid var(--research-completed-divider,#8883);border-radius:0 0 2px 2px;background:var(--research-completed-surface,var(--odyssey-card));color:var(--research-completed-muted,var(--odyssey-card-muted));font:10px/20px "EWork DIN Pro","Noto Sans SC",system-ui;cursor:pointer;text-align:left}
.odyssey-data-stamp .odyssey-data-frequency{display:flex;align-items:center;gap:5px;overflow:hidden;white-space:nowrap;min-width:0}
.odyssey-data-frequency>span{overflow:hidden;text-overflow:ellipsis}
.odyssey-data-stamp time{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
.odyssey-data-stamp:hover:not(:disabled){background:var(--research-completed-inset,#8882);color:var(--research-completed-text,inherit)}
.odyssey-data-stamp:focus-visible{outline:2px solid #258bea;outline-offset:-2px}
.odyssey-data-stamp:disabled{cursor:default}

.odyssey-refresh-indicator{box-sizing:border-box;display:inline-block;position:relative;flex:0 0 10px;width:10px;height:10px;border:1.5px solid currentColor;border-radius:50%}
[data-refresh-feedback=refreshing] .odyssey-refresh-indicator{border-right-color:transparent;animation:ew-grid-spin 850ms linear infinite}
[data-refresh-feedback=success] .odyssey-refresh-indicator::after{content:"";position:absolute;left:1.5px;top:1px;width:4px;height:2.5px;border-left:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(-45deg)}
[data-refresh-feedback=unchanged] .odyssey-refresh-indicator::after{content:"";position:absolute;left:2px;top:3px;width:3px;border-top:1px solid currentColor}
[data-refresh-feedback=error] .odyssey-refresh-indicator::after{content:"!";position:absolute;inset:-1px 0 0;text-align:center;font:700 8px/9px system-ui}
.odyssey-data-stamp[data-component-data-status=error] .odyssey-data-frequency{color:var(--research-completed-text,inherit)}
[data-component-refreshing] [data-workbench-refresh]{pointer-events:none}
[data-component-updating]>[data-research-preview-body]::after{content:"";position:absolute;z-index:2;top:0;left:0;width:30%;height:2px;background:#258bea;pointer-events:none;animation:ework-refresh-progress 1300ms ease-in-out infinite}
@keyframes ework-refresh-progress{from{transform:translateX(-100%)}to{transform:translateX(334%)}}
@media(prefers-reduced-motion:reduce){.odyssey-refresh-indicator{animation:none!important}[data-component-updating]>[data-research-preview-body]::after{animation:none;transform:none;width:100%;opacity:.65}}

`

export function componentDataStatusDefinitions(){return sourceDefinitions()+"\n"+[createWorkbenchRefreshSurface,isWorkbenchViewState,workbenchContentRevision,workbenchTemplateIdentity,personalChartViewState,readPersonalChartView,createPersonalChartViewSink,createComponentRefreshFeedback,componentDataSourceNames,componentSavedProvenance,componentSourceLabel,componentSnapshotDate,createComponentDataStatusStore,createComponentDataStatusMonitor,componentDataStatusView,componentRssStatusView,ComponentDataStatusBar].map(fn=>fn.toString()).join('\n')+'\nconst componentDataStatusStore=createComponentDataStatusStore();\n'}

export function patchComponentDataStatus(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Component status anchor drifted: '+a.slice(0,80));source=source.replace(a,b)}
 if(!source.includes('/* ODYSSEY_COMPONENT_DATA_STAMP */')){
 replace('function ResearchCanvasRichNodeFrame({ node,','function ResearchCanvasRichNodeFrame({ componentDataSessionId, node,')
 replace('"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,','"data-research-generated-container": node.kind === "generated-container" ? "" : void 0,\ncomponentDataSessionId:sessionId,')
 replace('}), !expanded && geometry.resizable ?', `}), /* ODYSSEY_COMPONENT_DATA_STAMP */ node.kind==='generated-container'&&node.containerSpec?(0,react_jsx_runtime.jsx)(ComponentDataStatusBar,{sessionId:componentDataSessionId,node}):null, !expanded && geometry.resizable ?`)
 }
 const marker='/* ODYSSEY_PERSONAL_CHART_VIEW_V1 */'
 // Keep patch markers beside their code. A trailing marker changes the final
 // stylesheet boundary and makes the creation-tools patch append it twice.
 if(source.includes(marker))return source.includes('\n'+marker)?source.replace('\n'+marker,'').replace('const researchPersonalChartViewSinks = new Map();',marker+' const researchPersonalChartViewSinks = new Map();'):source
 replace('const researchSharedStateSinks = new Map();','const researchSharedStateSinks = new Map(); '+marker+' const researchPersonalChartViewSinks = new Map();')
 replace('researchSharedStateSinks.set(sessionId,',`researchPersonalChartViewSinks.set(sessionId,createPersonalChartViewSink({read:()=>snapshot.artifacts,canWrite:()=>!sherlockShared(sessionId)&&collaborationCanWrite(),write:(nodeId,config)=>update({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,config}:n)},true)}));\n  researchSharedStateSinks.set(sessionId,`)
 replace('...(container && Object.hasOwn({small:1,medium:1,large:1}, value.containerSizePreset)',`...(container && readPersonalChartView(value) ? {config:{...(validResearchInteractionState(value.config?.interactionState)?{interactionState:value.config.interactionState}:{}),...(value.config?.sharedComponentState && JSON.stringify(value.config.sharedComponentState).length<66000?{sharedComponentState:value.config.sharedComponentState}:{}),personalChartView:value.config.personalChartView}} : {}),\n                ...(container && Object.hasOwn({small:1,medium:1,large:1}, value.containerSizePreset)`)
 return source
}
