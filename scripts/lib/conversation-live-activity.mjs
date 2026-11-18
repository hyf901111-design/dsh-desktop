import {createHash} from 'node:crypto'
import {classifyResearchCreationRequest} from '../../packages/dsh-research-task-runtime/component-delivery-intent.js'
import {generalFuturesWorkbench,initialWorkbenchInformationPlan} from '../../packages/dsh-research-task-runtime/workbench-planning-context.js'
import {stripConversationResponseHistory} from './conversation-response-history.mjs'
import {planningResponseMetadata} from './research-planning-feedback.mjs'
import {conversationPublicReplies,ConversationActivityDetails,conversationActivityRecords,conversationToolFailureLabel,statusPresentationCss,transformStatusPresentation,transformWorkbenchConversationPresentation} from './conversation-status-presentation.mjs'
const START='/* ework:conversation-live-activity:v7 */',V6='/* ework:conversation-live-activity:v6 */',V5='/* ework:conversation-live-activity:v5 */',V4='/* ework:conversation-live-activity:v4 */',V3='/* ework:conversation-live-activity:v3 */',PREVIOUS='/* ework:conversation-live-activity:v2 */',LEGACY='/* ework:conversation-live-activity:v1 */',END='/* ework:conversation-live-activity:end */'

const workbenchSourceObservationCache = new WeakMap()

// Consume only result shapes owned by the named tool. Transport completion,
// search snippets and catalogue responses do not prove source content arrived.
function workbenchSourceObservation(root, name) {
 if (workbenchSourceObservationCache.has(root)) return workbenchSourceObservationCache.get(root)
 const blocks = Array.isArray(root.content) ? root.content : []
 const first = blocks.find(block => block?.type === 'text' && typeof block.text === 'string')?.text
 let status = null
 if (name === 'web_fetch') {
  const header = /^Fetched [^\r\n]{1,8192} \(HTTP (\d{3})\)\r?\n\r?\n/u.exec(first ?? '')
  const code = root.meta?.statusCode ?? Number(header?.[1])
  if (root.isError === true || root.error != null || Number.isFinite(code) && (code < 200 || code >= 300)) status = 'missing'
  else if (root.meta?.truncated === true || first?.endsWith('(Content truncated. Fetch a more specific URL or section for the full text.)')) status = 'partial'
  else if (header && first.slice(header[0].length).trim()) status = 'observed'
 } else {
  let args, value
  try { if (root.call?.argsRaw?.length <= 32000) args = JSON.parse(root.call.argsRaw) } catch {}
  const queries = ['quote','history','nav','profile','research','analysis']
  if (name === 'public_data_query' && args?.operation === 'query' || name === 'financial_query' && queries.includes(args?.intent)) {
   if (root.isError === true || root.error != null) status = 'missing'
   else if (first?.length <= 262144) {
    try { value = JSON.parse(first) } catch {}
    if (value?.status === 'partial' || value?.truncated === true) status = 'partial'
    else if (['empty','no_data','no_results','failed','error','unavailable'].includes(value?.status) || value?.ok === false || Array.isArray(value?.records) && !value.records.length) status = 'missing'
    else if (value?.records?.length > 0 && Array.isArray(value.records)) status = 'observed'
   }
  }
 }
 workbenchSourceObservationCache.set(root, status)
 return status
}

export function workbenchConversationUpdate({ running, runningTurn, settledTurn, openState, order, nodeStore, flow, readText, english = false, classify = classifyResearchCreationRequest, readPlans = planningResponseMetadata }) {
 if (openState !== 'open') return null
 const say = (zh, en) => english ? en : zh
 const turnOf = node => node?.location?.turn?.turn ?? node?.data?.turn
 const pending = flow.findLast(entry => {
  const submission = entry.kind === 'native-submitted-user' ? entry.submission : null
  return submission?.accepted === true && submission.mode !== 'steer' && (submission.initialImmediate && (!Number.isSafeInteger(runningTurn) || runningTurn > submission.barrierTurn) || running && submission.admitted === true && submission.admittedTurn === runningTurn)
 })
 const scopeTurn = running ? runningTurn : pending ? null : settledTurn
 const current = Number.isSafeInteger(scopeTurn) ? order.map(key => nodeStore.get(key)).filter(node => turnOf(node) === scopeTurn) : []
 const promptIndex = current.findLastIndex(node => ['user','steering'].includes(node.kind))
 const prompt = current[promptIndex], ownerKey = prompt?.key ?? pending?.key
 if (!ownerKey || prompt && (prompt.kind !== 'user' || prompt.data?.source?.kind !== 'user')) return null
 const request=readText(prompt?.data?.content ?? pending?.submission?.content ?? [])
 if (classify(request)?.kind !== 'workbench') return null
 const milestone = (kind, zh, en) => ({ ownerKey, kind, text: say(zh, en) })
 const calls = current.slice(promptIndex + 1).filter(node => node.kind === 'tool-call' && node.data?.root)
 const plans = readPlans(calls).plans
 if (!running && !pending) {
  // A durable latest-turn plan can stand in for an absent closing reply.
  // There is no settled receipt for a failed or merely inferred request.
  const closing = current.findLast(node => node.kind === 'turn-tail')?.data?.closing
  if (!plans.length || closing?.blocks?.some(block => block?.kind === 'text' && block.text?.trim() || block?.kind === 'image')) return null
 }
 if (plans.length > 0) {
  const count = plans.reduce((total, plan) => total + Math.max(0, plan.count), 0)
  const detail = say('生成结果见各组件状态。', 'See each component’s status for its result.')
  return count ? milestone('submitted', '组件计划已受理，共 '+count+' 个组件。'+detail, 'The plan was accepted for '+count+' '+(count === 1 ? 'component' : 'components')+'. '+detail)
   : milestone('submitted', '组件计划已受理。'+detail, 'The component plan was accepted. '+detail)
 }
 let checking = false, plan = null
 const observed = new Map()
 for (const node of calls) {
  const root = node.data.root, name = root.call?.name ?? root.name
  if (name === 'research_workbench_create') plan = root
  if (['web_search','web_fetch','public_data_query','financial_query','read','read_file','read_prototype','workbench_source_read'].includes(name)) checking = true
  if (root.kind !== 'tool-result' || !['web_fetch','public_data_query','financial_query'].includes(name)) continue
  const state = workbenchSourceObservation(root, name)
  if (state) observed.set(name+'\0'+(root.call?.argsRaw || node.key), state)
 }
 if (plan && !plan.kind) return milestone('submitting', '正在提交工作台的组件计划。', 'Submitting the workbench component plan.')
 if (plan?.isError === true || plan?.error != null) return milestone('plan-failed', '这次组件计划提交未成功。', 'The component plan could not be submitted on this attempt.')
 const outcomes = new Set(observed.values())
 const found = outcomes.has('observed') || outcomes.has('partial'), gaps = outcomes.has('missing') || outcomes.has('partial')
 if (found && gaps) return milestone('sources', '已读取部分来源资料，还有来源未能读取或返回不完整。', 'Some source material was retrieved. Other sources could not be read or returned incomplete results.')
 if (found) return milestone('sources', '已读取部分来源资料，组件计划尚未提交。', 'Some source material was retrieved. The component plan is still pending.')
 if (gaps) return milestone('sources', '有来源未能读取，可在执行详情中查看。', 'Some sources could not be read. See the activity details for more information.')
 if (checking) return milestone('checking', '正在查找和核对工作台所需的资料。', 'Finding and checking the sources needed for the workbench.')
 const hasPublicReply=current.slice(promptIndex+1).some(node=>node.kind==='assistant-step'&&node.data?.blocks?.some(block=>block.kind==='text'&&block.text?.trim()))
 if(hasPublicReply)return null
 const design=initialWorkbenchInformationPlan(request,english)
 return {ownerKey,kind:'received',text:say('已收到创建工作台的请求。','Your workbench request was received. ')+(design||say('接下来会梳理所需的内容和组件。','The next step is to work out the content and components it needs.'))}
}

function workbenchConversationFlow(flow, options) {
 if (!options.enabled) return flow
 const english = document.documentElement.dataset.odysseyLocale === 'en' || document.documentElement.lang?.startsWith('en')
 let latest = null
 if (!options.running) for (const turn of options.timeline.turns.values()) {
  if (Number.isSafeInteger(turn.turn) && (latest === null || turn.turn > latest.turn)) latest = turn
 }
 const settledTurn = latest?.status === 'closed' ? latest.turn : null
 const update = workbenchConversationUpdate({ ...options, settledTurn, flow, english, readText: parts => parseResearchPrompt(contentParts(parts).text).text })
 if (!update) return flow
 const owner = flow.findIndex(entry => entry.key === update.ownerKey)
 if (owner < 0) return flow
 let insert = owner + 1
 while (insert < flow.length) {
  const entry = flow[insert]
  if (entry.kind === 'execution' && (entry.running || !options.running && entry.turn === settledTurn) || entry.kind === 'pending-steering' || entry.kind === 'native-submitted-user' || ['user','steering'].includes(options.nodeStore.get(entry.key)?.kind)) break
  insert++
 }
 return [...flow.slice(0,insert), { kind:'workbench-conversation-progress', key:'workbench-update:'+update.ownerKey, update }, ...flow.slice(insert)]
}

function WorkbenchConversationUpdate({ update }) {
 return react.createElement('p', { className:ChatView_module_css_default.flowItem, 'data-workbench-conversation-progress':update.kind, 'aria-live':'polite', 'aria-atomic':true }, update.text)
}

/** Read the current run only. Completed tools and private reasoning are never
 * republished as a new action, and a queued message does not start a new run. */
export function conversationLiveActivity({running,runningTurn,order=[],nodeStore,flow=[],noteRows=[],canvasTasks=[],openState='open',labelForNode,statusForNodes,t,english=false}) {
 const copy=(zh,en)=>english?en:zh
 if(openState==='loading'||openState==='error')return null
 const scoped=order.map(key=>nodeStore?.get(key)).filter(node=>{
  const turn=node?.location?.turn?.turn??node?.data?.turn
  return node&&Number.isFinite(runningTurn)&&turn===runningTurn
 })
 if(running){
  const active=scoped.filter(node=>node.kind==='tool-call'&&node.data?.root&&typeof node.data.root==='object'&&!('kind' in node.data.root))
  if(active.length){
   const node=active.at(-1),root=node.data.root,name=String(root.name??'').toLowerCase()
   if(/request_user_input|ask_user|ask_question/.test(name))return{kind:'waiting',label:copy('等待你的回答','Waiting for your answer')}
   if(/request.*permission|request.*approval/.test(name))return{kind:'waiting',label:copy('等待你的授权','Waiting for your approval')}
   const plans=scoped.filter(item=>item.kind==='tool-call'&&/todo|plan/.test(String(item.data?.root?.call?.name??item.data?.root?.name??'')))
   const label=(statusForNodes?.([...plans,node],t)??labelForNode?.(node,t))||copy('正在执行任务…','Working…')
   return{kind:'tool',label,parallelCount:active.length}
  }
  const node=scoped.at(-1)
  if(node?.kind==='compaction'&&node.data?.running===true||node?.kind==='manual-compaction'&&node.data?.command?.outcome===null)return{kind:'compaction',label:copy('正在压缩上下文…','Compacting context…')}
  if(node?.kind==='model-retry')return{kind:'retry',label:copy('正在重试连接…','Retrying connection…')}
  if(node?.kind==='assistant-step'&&['streaming','running','open'].includes(node.data?.status)&&node.data?.blocks?.some(block=>block.kind==='text'&&block.text))return{kind:'reply',label:copy('正在整理回复…','Composing response…')}
  return{kind:'thinking',label:copy('正在思考…','Thinking…')}
 }
 const note=noteRows.filter(row=>['preparing','generating'].includes(row.phase)).at(-1)
 if(note)return{kind:'note',label:note.stage==='validating'?copy('正在检查笔记内容…','Checking note content…'):note.stage==='writing'?copy('正在写入笔记…','Writing note content…'):copy('正在生成笔记内容…','Generating note content…')}
 const canvas=canvasTasks.filter(task=>['running','waiting'].includes(task.state)).at(-1)
 if(canvas)return{kind:'canvas',label:canvas.state==='waiting'?copy('正在等待画布内容更新…','Waiting for canvas updates…'):copy('正在处理画布任务…','Working on the canvas…')}
 // Native component/task projections can be active without a parent model turn.
 const entry=flow.filter(item=>item.kind==='execution'&&item.running).at(-1)
 if(entry?.noteTask)return{kind:'note',label:copy('正在生成笔记内容…','Generating note content…')}
 if(entry?.canvasTask)return{kind:'canvas',label:copy('正在处理画布任务…','Working on the canvas…')}
 return null
}

function ConversationLiveActivity(props) {
 if(props.flow?.some(entry=>entry.kind==='execution'&&entry.running))return null
 const english=document.documentElement.dataset.odysseyLocale==='en'||document.documentElement.lang?.startsWith('en')
 const state=conversationLiveActivity({...props,english,labelForNode:executionActivityLabel,statusForNodes:executionStatusForNodes})
 if(!state)return null
 const parallel=state.parallelCount>1?(english?' · '+state.parallelCount+' actions running':' · '+state.parallelCount+' 项进行中'):''
 return react.createElement('div',{'data-conversation-live-activity':state.kind,role:'status','aria-live':'polite','aria-atomic':true},
  react.createElement('span',null,state.label+parallel))
}
const CSS=statusPresentationCss
const definition=()=>START+'\nconst workbenchSourceObservationCache = new WeakMap();\n'+[conversationLiveActivity,ConversationLiveActivity,conversationPublicReplies,ConversationActivityDetails,conversationActivityRecords,conversationToolFailureLabel,workbenchSourceObservation,workbenchConversationUpdate,workbenchConversationFlow,WorkbenchConversationUpdate,classifyResearchCreationRequest,generalFuturesWorkbench,initialWorkbenchInformationPlan].map(fn=>fn.toString()).join('\n')+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-live-activity-style");if(!style){style=document.createElement("style");style.id="ework-live-activity-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(CSS)+';}\n'+END+'\n'
const CHAT_END='\n\t\t\t\t\t\t]\n\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(OdysseyReadingStatus,'
const CHAT_NEXT=',react.createElement(ConversationLiveActivity,{running,runningTurn:runningTurnNumber,order,nodeStore,flow:nativeSubmittedFlow,noteRows,canvasTasks,openState,t})'+CHAT_END
const SHARED_END="!ongoing&&continuations.length>0&&!tails.length&&react.createElement(MessageIconActions,{text:continuations.at(-1).reason??'',t}))"
const SHARED_LEGACY=SHARED_END.slice(0,-1)+",react.createElement(ConversationLiveActivity,{running,runningTurn,order:slice.keys,nodeStore,canvasTasks:continuations,t}))"
const SHARED_NEXT=SHARED_LEGACY.replace('nodeStore,canvasTasks','nodeStore,flow:body,canvasTasks')
function scope(source,anchor,from,to){const a=source.indexOf(anchor),b=source.indexOf('\n\t\t//#endregion',a);if(a<0||b<a)throw Error('Live activity scope missing: '+anchor);const part=source.slice(a,b);if(part.split(from).length!==2)throw Error('Live activity anchor drifted: '+anchor);return source.slice(0,a)+part.replace(from,to)+source.slice(b)}
export function stripConversationLiveActivity(source){
 source=stripConversationResponseHistory(source)
 const legacy=source.includes(LEGACY),previous=source.includes(PREVIOUS),v3=source.includes(V3),v4=source.includes(V4),v5=source.includes(V5),v6=source.includes(V6),marker=legacy?LEGACY:previous?PREVIOUS:v3?V3:v4?V4:v5?V5:v6?V6:START,a=source.indexOf(marker)
 if(a<0){if(source.includes('function ConversationLiveActivity('))throw Error('Orphan live activity layer');return source}
 const end=source.indexOf(END,a),block=source.slice(a,end+END.length+1)
 const historicalHash=legacy?'6e06340806b231098fcb8bcb5757357f79e9c630457e56e07e67b8175c0b09cf':previous?'e7f1ff04a7719a5abde00da1bd1fe91f49b155f61e1b013f5f3a0d319084b7a3':v3?'d169fef72132cd6ce5cd77d8aa6145cdba0dc3dd7bbfdc86c63032189f6963ef':v4?'578940255480b5473821c0a226b95a1d7624ce5cd75b8f1197b9f8a7327f1f2c':null
 const digest=createHash('sha256').update(block).digest('hex')
 const previousV5=['51cc8be2cdf432f3a44bfbcac133c6c91a061030b0465832287b1f0c83faf605','555288281e837cee8d0067a9389a7993b4e4a37e08138bad65fe9dd39f8cf813']
 const exactDefinition=v6 ? digest==='b6d3b84c7dac71733130add9aacac7cca15dd104037f40afc8b4d76747e50e8f' : v5 ? previousV5.includes(digest) : historicalHash ? digest===historicalHash : block===definition()
 if(source.split(marker).length!==2||source.split(END).length!==2||end<a||!exactDefinition)throw Error('Live activity definition drifted')
 if(v4||!historicalHash)source=transformWorkbenchConversationPresentation(source,true)
 if(!legacy)source=transformStatusPresentation(source,true)
 source=scope(source,'function ChatView(',CHAT_NEXT,CHAT_END)
 source=scope(source,'function SharedResearchRequest(',legacy?SHARED_LEGACY:SHARED_NEXT,SHARED_END)
 return source.replace(block,'')
}

export function patchConversationLiveActivity(source){
 source=transformWorkbenchConversationPresentation(transformStatusPresentation(stripConversationLiveActivity(source)))
 source=scope(source,'function ChatView(',CHAT_END,CHAT_NEXT)
 source=scope(source,'function SharedResearchRequest(',SHARED_END,SHARED_NEXT)
 const anchor='function SharedResearchRequest(';return source.replace(anchor,definition()+anchor)
}
