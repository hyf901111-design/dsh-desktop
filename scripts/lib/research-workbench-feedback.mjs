import * as panelDelivery from '../../packages/dsh-research-task-runtime/workbench-panel-delivery.js'
const {workbenchDeliveryIntent, workbenchChartTextFallback, workbenchNamedTargets, workbenchNamedTableCoverage, workbenchReadingScopeCount, workbenchReadingScopeRestored} = panelDelivery

// The canvas already owns the accepted generation state for every card,
// including off-screen cards. Publish only identity and state, never contents,
// prompts, tool arguments, errors or private model reasoning.
export function researchWorkbenchRecoveryMode(node) {
 const spec=node?.containerSpec
 if(!spec)return null
 if(node.deliveryStatus==='partial'&&['source-snapshot','readable-content','incomplete-scope','data-missing'].includes(node.recoveryMode)&&!workbenchReadingScopeRestored(spec,node))return node.recoveryMode
 const prompt=node.containerPrompt??''
 const fallback=workbenchChartTextFallback(spec,prompt)
 if(fallback)return fallback
 if(node.workbenchId&&workbenchNamedTableCoverage(spec,prompt)?.issue)return 'incomplete-scope'
 if(spec.type!=='html'||typeof spec.html!=='string')return null
 if(/<body\b[^>]*\sdata-observed-table-recovery(?:[=\s>])/i.test(spec.html))return 'source-snapshot'
 if(/<body\b[^>]*\sdata-readable-content-recovery(?:[=\s>])/i.test(spec.html))return 'readable-content'
 return null
}
export function isPartialWorkbenchNode(node){return node?.generationStatus==='completed'&&researchWorkbenchRecoveryMode(node)!==null}
export function publishResearchWorkbenchProgress(target,sessionId,artifacts,active=true,retryAvailable=true) {
 if(!target||typeof sessionId!=='string'||!sessionId)return null
 const cacheKey='__sherlockWorkbenchGenerationV1'
 const cache=target[cacheKey] instanceof Map?target[cacheKey]:(target[cacheKey]=new Map())
 const valid=['queued','running','retrying','completed','failed','cancelled','interrupted']
 const current=new Map()
 for(const node of artifacts??[]){
  if(typeof node?.id!=='string'||typeof node.workbenchId!=='string'||!node.workbenchId)continue
  let status=valid.includes(node.generationStatus)?node.generationStatus:'unknown'
  if(status==='completed'&&!(node.containerSpec&&typeof node.containerSpec==='object'&&typeof node.containerSpec.type==='string'))status='unknown'
  const recoveryMode=status==='completed'?researchWorkbenchRecoveryMode(node):null
  if(recoveryMode)status='partial'
  current.set(node.id,{id:node.id,planId:node.workbenchId,status,...(recoveryMode?{recoveryMode}:{}),...(node.containerSpec?.type==='financial-widget'?{builtin:true}:{}),...(typeof node.generationTaskId==='string'?{taskId:node.generationTaskId}:{})})
 }
 const nodes=[...current.values()].sort((a,b)=>a.id.localeCompare(b.id)),prior=cache.get(sessionId)
 if(prior?.active===active&&prior.retryAvailable===retryAvailable&&JSON.stringify(prior.nodes)===JSON.stringify(nodes))return prior
 const snapshot={version:1,sessionId,nodes,active,retryAvailable,observedAt:Date.now()}
 cache.delete(sessionId);cache.set(sessionId,snapshot)
 while(cache.size>64)cache.delete(cache.keys().next().value)
 const EventType=target.CustomEvent??globalThis.CustomEvent
 if(typeof target.dispatchEvent==='function'&&typeof EventType==='function')target.dispatchEvent(new EventType('sherlock:workbench-generation',{detail:snapshot}))
 return snapshot
}

// Chat and notes restore the same durable workspace even when no canvas is
// mounted. Seed last-observed state without overwriting a live canvas owner.
export function publishInactiveResearchWorkbenchProgress(target,sessionId,artifacts) {
 const current=target?.__sherlockWorkbenchGenerationV1?.get?.(sessionId)
 if(current?.active===true)return current
 return publishResearchWorkbenchProgress(target,sessionId,artifacts,false,false)
}

export function observeResearchWorkbenchProgress(target,sessionId,listener) {
 const accept=value=>value?.version===1&&value.sessionId===sessionId&&Array.isArray(value.nodes)
 const read=target?.__sherlockWorkbenchGenerationV1?.get?.(sessionId)
 listener(accept(read)?read:null)
 const change=event=>{if(accept(event.detail))listener(event.detail)}
 target?.addEventListener('sherlock:workbench-generation',change)
 return ()=>target?.removeEventListener('sherlock:workbench-generation',change)
}

export function workbenchProgressState(plans,snapshot,english=false,refreshSnapshot=null) {
 const say=(zh,en)=>english?en:zh,ids=new Map((plans??[]).filter(p=>typeof p?.id==='string').map(p=>[p.id,p]))
 const planned=[...ids.values()].reduce((sum,p)=>sum+(Number.isSafeInteger(p.count)&&p.count>0?p.count:0),0)
 const nodes=[...new Map((snapshot?.nodes??[]).filter(n=>ids.has(n.planId)).map(n=>[n.id,n])).values()]
 const partialNodes=nodes.filter(n=>n.status==='partial'),partial=partialNodes.length
 const total=nodes.length,completed=nodes.filter(n=>n.status==='completed').length,pending=nodes.filter(n=>['queued','running','retrying'].includes(n.status)).length
 const retrying=nodes.filter(n=>n.status==='retrying').length
 const failed=nodes.filter(n=>['failed','interrupted'].includes(n.status)).length,cancelled=nodes.filter(n=>n.status==='cancelled').length,unknown=total-completed-partial-pending-failed-cancelled
 const phase=!snapshot?'waiting':!total?'empty':unknown?'unknown':pending&&snapshot.active===false?'inactive':pending?'running':failed||cancelled||partial?'partial':'completed'
 const title=phase==='waiting'?say('等待组件状态','Awaiting component status'):phase==='empty'?say('当前画布没有这批组件','These components are not on the current canvas'):phase==='unknown'?say('组件状态待确认','Component status needs verification'):phase==='inactive'?say('组件状态等待更新','Awaiting updated component status'):phase==='running'?say(`组件生成中 · 已生成 ${completed}/${total}`,`Generating components · ${completed}/${total} generated`):phase==='partial'?say(`组件生成已结束 · ${completed}/${total} 已完整生成`,`Generation ended · ${completed}/${total} fully generated`):say(`组件已生成 · ${completed}/${total}`,`Components generated · ${completed}/${total}`)
 const readable=partialNodes.filter(n=>n.recoveryMode==='readable-content').length,scopeIncomplete=partialNodes.filter(n=>n.recoveryMode==='incomplete-scope').length
 const missingData=partialNodes.filter(n=>n.recoveryMode==='data-missing').length
 const sources=partial-readable-scopeIncomplete-missingData
 const counts=[say(`已生成 ${completed}`,`${completed} generated`),sources?say(`来源明细 ${sources}（原功能未完成）`,`${sources} source snapshots (original features incomplete)`):'',readable?say(`保留可读内容 ${readable}`,`${readable} readable fallbacks`):'',scopeIncomplete?say(`覆盖不完整 ${scopeIncomplete}`,`${scopeIncomplete} with incomplete coverage`):'',missingData?say(`数据缺失 ${missingData}`,`${missingData} missing data`):'',pending?say(`进行中 ${pending}`,`${pending} in progress`):'',failed?say(`未完成 ${failed}`,`${failed} failed`):'',cancelled?say(`已停止 ${cancelled}`,`${cancelled} stopped`):'',unknown?say(`待确认 ${unknown}`,`${unknown} unverified`):''].filter(Boolean).join(' · ')
 const scope=planned&&total!==planned?say(`当前画布 ${total} 个组件，原计划 ${planned} 个。`,`Current canvas: ${total} components; original plan: ${planned}.`):''
 const detail=phase==='waiting'?say('正在读取这批组件在画布中的实际生成状态。','Reading the actual generation state of these canvas components.'):phase==='empty'?say('尚未挂载或已从画布移除。','Not mounted or removed from the canvas.'):[counts,scope,snapshot.active===false?say('以上为上次状态，打开研究看板可查看最新进度。','These are the last observed states; open the research canvas for current progress.'):''].filter(Boolean).join(' ')
 const rows=new Map((refreshSnapshot?.rows??[]).map(row=>[row.nodeId,row])),refreshGroups=new Map()
 for(const node of nodes.filter(node=>node.status==='completed')){
  const row=rows.get(node.id),lastObserved=snapshot.active===false||row?.lastObserved===true||!row?.native&&refreshSnapshot?.ready!==true
  let label
  if(!row)label=!node.builtin&&refreshSnapshot?.observed&&refreshSnapshot.complete===true?say('静态内容','Static content'):say('刷新状态待确认','Refresh status unverified')
  else {
   const frequency=row.intervalMinutes===1?say('每分钟','every minute'):row.intervalMinutes>0?say(`每 ${row.intervalMinutes} 分钟`,`every ${row.intervalMinutes} minutes`):''
   const outcome=row.lastRefreshFailed?say('最近刷新失败','Latest refresh failed'):row.lastSuccess?say('最近刷新成功','Latest refresh succeeded'):say('尚无成功记录','No successful refresh yet')
   label=row.intervalMinutes===0?say('仅手动刷新','Manual refresh only'):row.viewPaused||row.enabled===false&&row.intervalMinutes>0?say('刷新已暂停','Refresh paused'):row.enabled===true&&frequency?say(`已配置${frequency}刷新`,`Refresh configured ${frequency}`):say('刷新配置待确认','Refresh configuration unverified')
   if(row.lastRefreshFailed||row.lastSuccess||row.enabled===true&&frequency)label+=say('，',', ')+outcome
  }
  if(lastObserved&&(row||refreshSnapshot?.observed))label=say('上次观察：','Last observed: ')+label
  refreshGroups.set(label,(refreshGroups.get(label)??0)+1)
 }
 const historical=say('上次观察：','Last observed: '),allHistorical=refreshGroups.size>0&&[...refreshGroups.keys()].every(label=>label.startsWith(historical))
 const refreshHistory=allHistorical?historical:''
 const refreshLines=[...refreshGroups].map(([label,count])=>`${allHistorical?label.slice(historical.length):label} ${count}`)
 const refreshDetail=refreshHistory+refreshLines.join(' · ')
 return {phase,title,detail,total,planned,completed,partial,pending,retrying,failed,cancelled,unknown,refreshDetail,refreshHistory,refreshLines}
}

export function researchWorkbenchReceiptPlans(order,nodeStore,readMetadata) {
 const plans=new Map()
 for(const key of order??[]){
  const node=nodeStore?.get?.(key)
  if(node?.kind!=='tool-call')continue
  for(const plan of readMetadata([node]).plans??[])plans.set(plan.id,plan)
 }
 return [...plans.values()]
}

// The first durable receipt owns a plan. Only follow its native turn up to the
// next user input, including steering that continues within the same turn.
export function researchWorkbenchReceiptAnchors(flow,nodeStore,readMetadata,readTurn=()=>null) {
 const anchors=new Map(),owners=new Map(),turnTails=new Map(),scopes=new Map()
 let scope=0
 for(const entry of flow??[]){
  const node=entry.kind==='node'?nodeStore?.get?.(entry.key):null
  if(entry.kind==='pending-steering'||['user','steering'].includes(node?.kind))scope++
  scopes.set(entry.key,scope)
  if(entry.kind!=='execution'&&!['assistant-step','turn-tail','turn-error','turn-max-tokens'].includes(node?.kind))continue
  // An empty running execution is a transient activity indicator, not content
  // that can relocate feedback from the preceding answer when steering arrives.
  if(entry.kind==='execution'&&!entry.nodeKeys?.length)continue
  const turn=entry.kind==='execution'?entry.turn:readTurn(node)
  if(typeof turn==='number'&&Number.isFinite(turn)){
   const tails=turnTails.get(scope)??new Map()
   tails.set(turn,entry.key);turnTails.set(scope,tails)
  }
 }
 for(const entry of flow??[]){
  const keys=entry.kind==='execution'?entry.nodeKeys:entry.kind==='node'?[entry.key]:[]
  for(const key of keys??[]){
   const node=nodeStore?.get?.(key)
   if(node?.kind!=='tool-call')continue
   for(const plan of readMetadata([node]).plans??[]){
    const owner=owners.get(plan.id)
    if(owner){anchors.get(owner.key)[owner.index]=plan;continue}
    const turn=entry.kind==='execution'&&typeof entry.turn==='number'?entry.turn:readTurn(node)
    const anchor=turnTails.get(scopes.get(entry.key))?.get(turn)??entry.key,plans=anchors.get(anchor)??[]
    owners.set(plan.id,{key:anchor,index:plans.length})
    plans.push(plan);anchors.set(anchor,plans)
   }
  }
 }
 return anchors
}

export async function requestResearchWorkbenchRetry(target,sessionId,plans,snapshot) {
 if(snapshot?.sessionId!==sessionId||snapshot.active===false||snapshot.retryAvailable===false)return false
 const planIds=[...new Set((plans??[]).map(p=>p.id).filter(id=>typeof id==='string'))]
 const nodes=(snapshot.nodes??[]).filter(n=>planIds.includes(n.planId)&&['failed','interrupted','cancelled','partial'].includes(n.status)).map(n=>({id:n.id,taskId:n.taskId}))
 if(!nodes.length)return false
 const EventType=target.CustomEvent??globalThis.CustomEvent
 if(typeof EventType!=='function')return false
 const detail={sessionId,planIds,nodes,handled:false}
 target.dispatchEvent(new EventType('sherlock:workbench-retry',{detail}))
 if(!detail.handled)return false
 try{return await detail.result===true}catch{return false}
}

export function installResearchWorkbenchRetry({eventTarget,sessionId,getArtifacts,canRetry,retry}) {
 let active=true
 const inFlight=new Set()
 const onRetry=event=>{
  const detail=event.detail
  if(!active||detail?.sessionId!==sessionId||detail.handled||!canRetry())return
  if(!Array.isArray(detail.planIds)||!Array.isArray(detail.nodes))return
  const matches=(node,wanted)=>node?.id===wanted.id&&node.generationTaskId===wanted.taskId&&detail.planIds.includes(node.workbenchId)&&(['failed','interrupted','cancelled'].includes(node.generationStatus)||isPartialWorkbenchNode(node))
  const jobs=[]
  for(const wanted of detail.nodes){
   if(typeof wanted?.id!=='string'||inFlight.has(wanted.id)||!getArtifacts().some(node=>matches(node,wanted)))continue
   inFlight.add(wanted.id)
   jobs.push(Promise.resolve().then(async()=>{
    if(!active||!canRetry())return false
    const node=getArtifacts().find(node=>matches(node,wanted))
    if(!node)return false
    await retry(node)
    return true
   }).finally(()=>inFlight.delete(wanted.id)))
  }
  if(!jobs.length)return
  detail.handled=true
  detail.result=Promise.allSettled(jobs).then(results=>results.some(result=>result.status==='fulfilled'&&result.value===true))
 }
 eventTarget.addEventListener('sherlock:workbench-retry',onRetry)
 return ()=>{active=false;eventTarget.removeEventListener('sherlock:workbench-retry',onRetry)}
}

function ResearchWorkbenchProgress({sessionId,plans,footer=false}) {
 const [snapshot,setSnapshot]=react.useState(()=>window.__sherlockWorkbenchGenerationV1?.get?.(sessionId)??null)
 const [,renderLocale]=react.useState(0)
 react.useEffect(()=>{const observer=new MutationObserver(()=>renderLocale(n=>n+1));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])
 const [retrying,setRetrying]=react.useState(false),[retryError,setRetryError]=react.useState(false)
 react.useEffect(()=>observeResearchWorkbenchProgress(window,sessionId,setSnapshot),[sessionId])
 const subscribeRefresh=react.useCallback(listener=>componentDataStatusStore.subscribeSession(sessionId,listener),[sessionId])
 const readRefresh=react.useCallback(()=>componentDataStatusStore.snapshotSession(sessionId),[sessionId])
 const refreshSnapshot=react.useSyncExternalStore(subscribeRefresh,readRefresh,readRefresh)
 const current=snapshot?.sessionId===sessionId?snapshot:null
 const visiblePlans=footer&&current?plans.filter(p=>current.nodes.some(n=>n.planId===p.id)):plans
 if(footer&&current&&!visiblePlans.length)return null
 const english=document.documentElement.dataset.odysseyLocale==='en',say=(zh,en)=>english?en:zh
 const state=workbenchProgressState(visiblePlans,current,english,refreshSnapshot)
 if(footer&&current?.active===false&&state.phase==='empty')return null
 const generating=current?.active!==false&&state.pending>0||retrying
 const complete=state.phase==='completed'&&state.total>0&&(!state.planned||state.total===state.planned)
 const progressTotal=Math.max(state.total,state.planned)
 const progressKnown=state.total>0
 const motion=generating&&(retrying||state.retrying?'retrying':'running')
 const statusTitle=motion==='retrying'?say(`正在重试组件 · 已生成 ${state.completed}/${progressTotal}`,`Retrying components · ${state.completed}/${progressTotal} generated`):state.title
 const hasRetry=state.failed+state.cancelled+state.partial>0
 const retryDisabled=retrying||current?.active===false||current?.retryAvailable===false
 const retryFailed=async()=>{
  if(retryDisabled)return
  setRetrying(true);setRetryError(false)
  try{if(!await requestResearchWorkbenchRetry(window,sessionId,visiblePlans,current))setRetryError(true)}finally{setRetrying(false)}
 }
 return react_jsx_runtime.jsxs('div',{'data-research-workbench-progress':state.phase,...(footer?{'data-research-workbench-footer':true}:{}),style:{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',columnGap:12,margin:footer?'8px 0 12px':'4px 0 8px 20px',padding:'8px 10px',...(footer?{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,background:'var(--dsw-alias-bg-l2)'}:{borderLeft:'2px solid var(--dsw-alias-border-l2)'}),fontSize:12,lineHeight:1.65,color:'var(--dsw-alias-label-secondary)',overflowWrap:'anywhere'},children:[
  react_jsx_runtime.jsx('div',{role:'status','aria-live':'polite',style:{gridColumn:1,fontWeight:500,color:'var(--dsw-alias-label-primary)'},children:statusTitle}),
  react_jsx_runtime.jsxs('div',{style:{gridColumn:1,minWidth:0},children:[footer&&complete?null:react_jsx_runtime.jsx('div',{children:state.detail}),state.refreshHistory?react_jsx_runtime.jsx('div',{'data-refresh-history':true,children:state.refreshHistory}):null,react_jsx_runtime.jsx('div',{'data-refresh-groups':true,style:{display:'flex',flexWrap:'wrap',columnGap:14,rowGap:2},children:state.refreshLines.map((line,index)=>react_jsx_runtime.jsx('span',{'data-refresh-group':true,style:{display:'block',maxWidth:'100%'},children:line},index))})]}),
  react_jsx_runtime.jsxs('div',{style:{gridColumn:2,gridRow:'1 / span 2',alignSelf:'center',display:'flex',alignItems:'center',gap:10,flexShrink:0,whiteSpace:'nowrap'},children:[
   generating?react_jsx_runtime.jsxs('svg',{width:18,height:18,viewBox:'0 0 20 20',role:'img','aria-label':say('正在生成组件','Generating components'),style:{display:'block',width:18,height:18,flexShrink:0},children:[
    react_jsx_runtime.jsx('circle',{cx:10,cy:10,r:7,fill:'none',stroke:'currentColor',strokeWidth:2,opacity:.2}),
    react_jsx_runtime.jsx('circle',{'data-workbench-progress-spinner':'',cx:10,cy:10,r:7,fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeDasharray:'30 14'})
   ]}):complete?react_jsx_runtime.jsx('span',{children:say('已完成','Completed')}):null,
   hasRetry?react_jsx_runtime.jsx('button',{type:'button',disabled:retryDisabled,'aria-label':say('重试未完成的组件','Retry unsuccessful components'),title:current?.active===false?say('打开研究看板后重试','Open the research canvas to retry'):undefined,onClick:retryFailed,style:{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:6,padding:'3px 10px',minHeight:28,background:'var(--dsw-alias-bg-l2)',color:'var(--dsw-alias-label-primary)',font:'inherit',cursor:retryDisabled?'default':'pointer',opacity:retryDisabled ? .5 : 1},children:say('重试','Retry')}):null
  ]}),
  retryError?react_jsx_runtime.jsx('div',{role:'alert',style:{gridColumn:'1 / -1'},children:say('未能启动重试，请在研究看板中再试。','Could not start retry. Try again in the research canvas.')}):null,
  footer&&react_jsx_runtime.jsx('div',{
   'data-workbench-progress-track':'','data-workbench-progress-motion':motion||undefined,'data-workbench-progress-zero':state.completed===0?'':undefined,
   role:'progressbar','aria-label':say('组件生成进度','Component generation progress'),'aria-valuemin':0,'aria-valuemax':progressTotal||1,
   'aria-valuenow':progressKnown?state.completed:undefined,
   style:{'--workbench-progress-width':(progressTotal?state.completed/progressTotal*100:0)+'%'},
   children:react_jsx_runtime.jsx('div',{'data-workbench-progress-fill':''})
  })
 ]})
}

export function researchWorkbenchRecoveryDefinitions(){return [workbenchDeliveryIntent,workbenchChartTextFallback,workbenchNamedTargets,workbenchNamedTableCoverage,workbenchReadingScopeCount,workbenchReadingScopeRestored,researchWorkbenchRecoveryMode].map(fn=>fn.toString()).join('\n')}
export function researchWorkbenchFeedbackDefinitions(){return researchWorkbenchRecoveryDefinitions()+'\n'+[isPartialWorkbenchNode,publishResearchWorkbenchProgress,publishInactiveResearchWorkbenchProgress,observeResearchWorkbenchProgress,workbenchProgressState,researchWorkbenchReceiptPlans,researchWorkbenchReceiptAnchors,requestResearchWorkbenchRetry,installResearchWorkbenchRetry,ResearchWorkbenchProgress].map(fn=>fn.toString()).join('\n')}
export function patchResearchWorkbenchFeedback(source) {
 const marker='/* ework:workbench-feedback:v16 */',ending='/* ework:workbench-feedback:end */'
 source=source.replace('\nconst workbenchMeta=planningResponseMetadata(activityNodes);','')
 if(source.includes(marker))return source
 const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Workbench feedback anchor missing or ambiguous: '+before.slice(0,80));source=source.replace(before,after)}
 const helpers=marker+'\n'+researchWorkbenchFeedbackDefinitions()+'\n'+ending+'\n'
 const previous=source.search(/\/\* ework:workbench-feedback:v(?:1[0-5]|[1-9]) \*\//)
 if(previous>=0){
  // Several later patches append their own helpers before ExecutionStatusGroup.
  // Replace this patch's functions only; never consume those adjacent owners.
  const ownedEnd=source.indexOf(ending,previous)
  const tail=source.indexOf('const ExecutionStatusGroup =',previous)
  const foreign=source.slice(previous+1).search(/^\/\* ework:(?!workbench-feedback:)[^\n]*\*\/$/mu)
  const foreignEnd=foreign<0?-1:previous+1+foreign
  const end=ownedEnd>=0?ownedEnd+ending.length+(source[ownedEnd+ending.length]==='\n'?1:0):foreignEnd>=0&&foreignEnd<tail?foreignEnd:tail
  if(end<0)throw Error('Workbench feedback upgrade anchor missing')
  const owned=source.slice(previous,end)
  if(!owned.includes('function ResearchWorkbenchProgress('))throw Error('Workbench feedback owned helper boundary drifted')
  source=source.slice(0,previous)+helpers+source.slice(end)
 }else{
 const anchor='const ExecutionStatusGroup = (0, react.memo)(function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest }) {'
 exact(anchor,helpers+anchor.replace('t, planningRequest','t, planningRequest, sessionId'))
 const props='activityNodes,\n\t\t\t\t\t\t\t\t\tplanningRequest,'
 exact(props,'activityNodes, sessionId,\n\t\t\t\t\t\t\t\t\tplanningRequest,')
 }
 // Upgrade older patches that also rendered the same status inside execution.
 source=source.replace('workbenchMeta.plans.length&&sessionId ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId, plans:workbenchMeta.plans}) : null, ','')
 const retryPredicate="node.id === nodeId && ['failed', 'cancelled', 'interrupted'].includes(node.generationStatus)"
 const retryPartial="node.id === nodeId && (['failed', 'cancelled', 'interrupted'].includes(node.generationStatus) || isPartialWorkbenchNode(node))"
 if(!source.includes(retryPartial))exact(retryPredicate,retryPartial)
 if(!source.includes('/* ework:workbench-retry:v1 */')){
  const anchor='const startContainerGeneration = async (node, prompt) => {'
  const at=source.indexOf(anchor,source.indexOf('const retrySelectionGeneration = async (node) => {'))
  if(at<0)throw Error('Workbench retry generation binding missing')
  const hook=`/* ework:workbench-retry:v1 */\nreact.useEffect(()=>installResearchWorkbenchRetry({eventTarget:window,sessionId,getArtifacts:()=>workspace.getSnapshot().artifacts,canRetry:()=>typeof selectionGeneration?.generate==='function'&&selectionGeneration.disabled!==true&&(!sherlockShared(sessionId)||sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit===true),retry:retrySelectionGeneration}),[sessionId,workspace,selectionGeneration,retrySelectionGeneration]);\n`
  source=source.slice(0,at)+hook+source.slice(at)
 }
 const start=source.indexOf('function ChatView('),end=source.indexOf('//#region lib/types/client/contract/slots.js',start)
 if(start<0||end<0)throw Error('Workbench feedback ChatView scope missing')
 let chat=source.slice(start,end)
 chat=chat.replace('\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);','')
  .replace(', workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null','')
 if(!chat.includes('/* ework:workbench-flow:v1 */')){
  const seat='const seatProps = (0, react.useMemo)'
  if(chat.split(seat).length!==2)throw Error('Workbench feedback ChatView seat missing or ambiguous')
  chat=chat.replace(seat,'/* ework:workbench-flow:v1 */\nconst workbenchReceiptAnchors=researchWorkbenchReceiptAnchors(renderFlow,nodeStore,planningResponseMetadata,conversationNodeTurn);\n'+seat)
  const flow='renderFlow.map((entry) => {'
  if(chat.split(flow).length!==2)throw Error('Workbench feedback ChatView flow missing or ambiguous')
  chat=chat.replace(flow,'renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{')
  const tail=/(\}\))(\s*\]\s*\}\), \(0, react_jsx_runtime\.jsx\)\(OdysseyReadingStatus,)/g
  if([...chat.matchAll(tail)].length!==1)throw Error('Workbench feedback ChatView flow ending missing or ambiguous')
  chat=chat.replace(tail,'};const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+\":workbench:\"+entry.key)] : [renderedWorkbenchEntry];})$2')
 }
 source=source.slice(0,start)+chat+source.slice(end)
 const persisted='const researchWorkspaceSnapshot2 = (0, react.useSyncExternalStore)(researchWorkspace.subscribe, researchWorkspace.getSnapshot, researchWorkspace.getSnapshot);'
 if(!source.includes('publishInactiveResearchWorkbenchProgress(window,sessionId,researchWorkspaceSnapshot2.artifacts)'))exact(persisted,persisted+'\nreact.useEffect(()=>{publishInactiveResearchWorkbenchProgress(window,sessionId,researchWorkspaceSnapshot2.artifacts)},[sessionId,researchWorkspaceSnapshot2]);')
 return source
}
