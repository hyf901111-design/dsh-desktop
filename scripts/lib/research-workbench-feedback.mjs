// The canvas already owns the accepted generation state for every card,
// including off-screen cards. Publish only identity and state, never contents,
// prompts, tool arguments, errors or private model reasoning.
export function publishResearchWorkbenchProgress(target,sessionId,artifacts,active=true) {
 if(!target||typeof sessionId!=='string'||!sessionId)return null
 const cacheKey='__sherlockWorkbenchGenerationV1'
 const cache=target[cacheKey] instanceof Map?target[cacheKey]:(target[cacheKey]=new Map())
 const valid=['queued','running','retrying','completed','failed','cancelled','interrupted']
 const current=new Map()
 for(const node of artifacts??[]){
  if(typeof node?.id!=='string'||typeof node.workbenchId!=='string'||!node.workbenchId)continue
  let status=valid.includes(node.generationStatus)?node.generationStatus:'unknown'
  if(status==='completed'&&!(node.containerSpec&&typeof node.containerSpec==='object'&&typeof node.containerSpec.type==='string'))status='unknown'
  current.set(node.id,{id:node.id,planId:node.workbenchId,status,...(typeof node.generationTaskId==='string'?{taskId:node.generationTaskId}:{})})
 }
 const nodes=[...current.values()].sort((a,b)=>a.id.localeCompare(b.id)),prior=cache.get(sessionId)
 if(prior?.active===active&&JSON.stringify(prior.nodes)===JSON.stringify(nodes))return prior
 const snapshot={version:1,sessionId,nodes,active,observedAt:Date.now()}
 cache.delete(sessionId);cache.set(sessionId,snapshot)
 while(cache.size>64)cache.delete(cache.keys().next().value)
 const EventType=target.CustomEvent??globalThis.CustomEvent
 if(typeof target.dispatchEvent==='function'&&typeof EventType==='function')target.dispatchEvent(new EventType('sherlock:workbench-generation',{detail:snapshot}))
 return snapshot
}

export function observeResearchWorkbenchProgress(target,sessionId,listener) {
 const accept=value=>value?.version===1&&value.sessionId===sessionId&&Array.isArray(value.nodes)
 const read=target?.__sherlockWorkbenchGenerationV1?.get?.(sessionId)
 listener(accept(read)?read:null)
 const change=event=>{if(accept(event.detail))listener(event.detail)}
 target?.addEventListener('sherlock:workbench-generation',change)
 return ()=>target?.removeEventListener('sherlock:workbench-generation',change)
}

export function workbenchProgressState(plans,snapshot,english=false) {
 const say=(zh,en)=>english?en:zh,ids=new Map((plans??[]).filter(p=>typeof p?.id==='string').map(p=>[p.id,p]))
 const planned=[...ids.values()].reduce((sum,p)=>sum+(Number.isSafeInteger(p.count)&&p.count>0?p.count:0),0)
 const nodes=[...new Map((snapshot?.nodes??[]).filter(n=>ids.has(n.planId)).map(n=>[n.id,n])).values()]
 const total=nodes.length,completed=nodes.filter(n=>n.status==='completed').length,pending=nodes.filter(n=>['queued','running','retrying'].includes(n.status)).length
 const failed=nodes.filter(n=>['failed','interrupted'].includes(n.status)).length,cancelled=nodes.filter(n=>n.status==='cancelled').length,unknown=total-completed-pending-failed-cancelled
 const phase=!snapshot?'waiting':!total?'empty':unknown?'unknown':pending&&snapshot.active===false?'inactive':pending?'running':failed||cancelled?'partial':'completed'
 const title=phase==='waiting'?say('等待组件状态','Awaiting component status'):phase==='empty'?say('当前画布没有这批组件','These components are not on the current canvas'):phase==='unknown'?say('组件状态待确认','Component status needs verification'):phase==='inactive'?say('组件状态等待更新','Awaiting updated component status'):phase==='running'?say(`组件生成中 · 已生成 ${completed}/${total}`,`Generating components · ${completed}/${total} generated`):phase==='partial'?say(`组件生成已结束 · ${completed}/${total} 已生成`,`Generation ended · ${completed}/${total} generated`):say(`组件已生成 · ${completed}/${total}`,`Components generated · ${completed}/${total}`)
 const counts=[say(`已生成 ${completed}`,`${completed} generated`),pending?say(`进行中 ${pending}`,`${pending} in progress`):'',failed?say(`未完成 ${failed}`,`${failed} failed`):'',cancelled?say(`已停止 ${cancelled}`,`${cancelled} stopped`):'',unknown?say(`待确认 ${unknown}`,`${unknown} unverified`):''].filter(Boolean).join(' · ')
 const scope=planned&&total!==planned?say(`当前画布 ${total} 个组件，原计划 ${planned} 个。`,`Current canvas: ${total} components; original plan: ${planned}.`):''
 const detail=phase==='waiting'?say('正在读取这批组件在画布中的实际生成状态。','Reading the actual generation state of these canvas components.'):phase==='empty'?say('尚未挂载或已从画布移除。','Not mounted or removed from the canvas.'):[counts,scope,snapshot.active===false?say('以上为上次状态，打开研究看板可查看最新进度。','These are the last observed states; open the research canvas for current progress.'):''].filter(Boolean).join(' ')
 return {phase,title,detail,total,planned,completed,pending,failed,cancelled,unknown}
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

function ResearchWorkbenchProgress({sessionId,plans,footer=false}) {
 const [snapshot,setSnapshot]=react.useState(()=>window.__sherlockWorkbenchGenerationV1?.get?.(sessionId)??null)
 react.useEffect(()=>observeResearchWorkbenchProgress(window,sessionId,setSnapshot),[sessionId])
 const current=snapshot?.sessionId===sessionId?snapshot:null
 const visiblePlans=footer&&current?plans.filter(p=>current.nodes.some(n=>n.planId===p.id)):plans
 if(footer&&current&&!visiblePlans.length)return null
 const state=workbenchProgressState(visiblePlans,current,document.documentElement.dataset.odysseyLocale==='en')
 if(footer&&current?.active===false&&['completed','empty'].includes(state.phase))return null
 return react_jsx_runtime.jsxs('div',{'data-research-workbench-progress':state.phase,...(footer?{'data-research-workbench-footer':true}:{}),style:{margin:footer?'8px 0 12px':'4px 0 8px 20px',padding:'8px 10px',...(footer?{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,background:'var(--dsw-alias-bg-l2)'}:{borderLeft:'2px solid var(--dsw-alias-border-l2)'}),fontSize:12,lineHeight:1.65,color:'var(--dsw-alias-label-secondary)',overflowWrap:'anywhere'},children:[
  react_jsx_runtime.jsx('div',{role:'status','aria-live':'polite',style:{fontWeight:500,color:'var(--dsw-alias-label-primary)'},children:state.title}),
  footer&&state.phase==='completed'&&state.total===state.planned?null:react_jsx_runtime.jsx('div',{children:state.detail})
 ]})
}

export function patchResearchWorkbenchFeedback(source) {
 const marker='/* ework:workbench-feedback:v2 */'
 if(source.includes(marker))return source
 const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Workbench feedback anchor missing or ambiguous: '+before.slice(0,80));source=source.replace(before,after)}
 const helpers=marker+'\n'+[observeResearchWorkbenchProgress,workbenchProgressState,researchWorkbenchReceiptPlans,ResearchWorkbenchProgress].map(fn=>fn.toString()).join('\n')+'\n'
 const previous=source.indexOf('/* ework:workbench-feedback:v1 */')
 if(previous>=0){
  const end=source.indexOf('const ExecutionStatusGroup =',previous)
  if(end<0)throw Error('Workbench feedback upgrade anchor missing')
  source=source.slice(0,previous)+helpers+source.slice(end)
 }else{
 const anchor='const ExecutionStatusGroup = (0, react.memo)(function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest }) {'
 exact(anchor,helpers+anchor.replace('t, planningRequest','t, planningRequest, sessionId'))
 const meta='const planningMeta=planningRequest && entry.running ? planningResponseMetadata(activityNodes) : null;'
 exact(meta,meta+'\nconst workbenchMeta=planningResponseMetadata(activityNodes);')
 exact('planningMeta ? react_jsx_runtime.jsx(ResearchPlanningFeedback,',"workbenchMeta.plans.length&&sessionId ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId, plans:workbenchMeta.plans}) : null, planningMeta && !workbenchMeta.plans.length ? react_jsx_runtime.jsx(ResearchPlanningFeedback,")
 const props='activityNodes,\n\t\t\t\t\t\t\t\t\tplanningRequest,'
 exact(props,'activityNodes, sessionId,\n\t\t\t\t\t\t\t\t\tplanningRequest,')
 }
 const start=source.indexOf('function ChatView('),end=source.indexOf('//#region lib/types/client/contract/slots.js',start)
 if(start<0||end<0)throw Error('Workbench feedback ChatView scope missing')
 let chat=source.slice(start,end)
 const nodes='const nodeStore = useSession((s) => s.chat.nodes);'
 if(chat.split(nodes).length!==2)throw Error('Workbench feedback ChatView nodes missing or ambiguous')
 chat=chat.replace(nodes,nodes+'\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);')
 const tail=/(\}\))(\s*\]\s*\}\), \(0, react_jsx_runtime\.jsx\)\(OdysseyReadingStatus,)/g
 if([...chat.matchAll(tail)].length!==1)throw Error('Workbench feedback ChatView footer missing or ambiguous')
 chat=chat.replace(tail,'$1, workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null$2')
 source=source.slice(0,start)+chat+source.slice(end)
 return source
}
