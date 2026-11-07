// Only transport activity and verified host receipts are projected here.
// Never display or summarize reasoning, tool arguments or source payloads.
import {patchResearchWorkbenchFeedback} from './research-workbench-feedback.mjs'
export function planningResponseMetadata(nodes) {
 const parts=[],calls=[],plans=new Map();let responding=false,accepted=false,prepared=false,count=0,lastActivityAt=0
 for(const node of nodes||[]){
  if(Number.isFinite(node?.data?.lastActivityAt))lastActivityAt=Math.max(lastActivityAt,node.data.lastActivityAt)
  if(node?.kind==='assistant-step'){
   const blocks=Array.isArray(node.data?.blocks)?node.data.blocks:[]
   for(const block of blocks){
    if(['text','reasoning'].includes(block?.kind)&&typeof block.text==='string'&&block.text.length){responding=true;parts.push([node.key,block.kind,block.text.length])}
    if(block?.kind==='tool-call'){responding=true;parts.push([node.key,'tool',String(block.name||'').length,String(block.argsRaw||'').length])}
   }
  }
  if(node?.kind!=='tool-call')continue
  const pending=[node.data?.root],visited=new Set()
  while(pending.length&&visited.size<128){
   const root=pending.pop();if(!root||typeof root!=='object'||visited.has(root))continue;visited.add(root)
   if(Number.isFinite(root.time))lastActivityAt=Math.max(lastActivityAt,root.time)
   const call=root.kind?root.call:root
   if(call){
    const settled=!!root.kind,failed=root.isError===true||root.error!=null
    calls.push({settled,failed});parts.push([node.key,'call',visited.size,settled,failed])
    if(call.name==='research_workbench_create'&&settled&&!failed)for(const block of root.content||[]){
     if(block?.type!=='text'||typeof block.text!=='string'||block.text.length>500000)continue
     try{const value=JSON.parse(block.text);if(typeof value.planId==='string'&&value.planId.length<=256&&['accepted','prepared'].includes(value.status)){accepted=true;prepared=value.status==='prepared';count=Array.isArray(value.panels)?value.panels.length:Number.isSafeInteger(value.panelCount)?value.panelCount:0;plans.set(value.planId,{id:value.planId,count})}}catch{}
    }
   }
   if(Array.isArray(root.subCalls))pending.push(...root.subCalls)
  }
 }
 return {signature:JSON.stringify(parts),lastActivityAt,responding,toolCount:calls.length,failedTools:calls.filter(c=>c.failed).length,accepted,prepared,count,plans:[...plans.values()]}
}
export function advancePlanningHeartbeat(previous,meta,now) {
 if(!meta.responding&&!meta.toolCount)return previous
 const eventAt=meta.lastActivityAt>0?Math.min(now,meta.lastActivityAt):now
 if(previous?.signature===meta.signature&&(meta.lastActivityAt<=0||previous.lastAt>=eventAt))return previous
 return {signature:meta.signature,firstAt:previous?.firstAt??eventAt,lastAt:eventAt}
}
export function planningFeedbackState(meta,heartbeat,startedAt,now,running,english=false) {
 const elapsed=Math.max(0,now-startedAt),since=heartbeat?Math.max(0,Math.floor((now-heartbeat.lastAt)/1000)):null
 const say=(zh,en)=>english?en:zh
 const title=!running?say('本轮准备已结束','Preparation ended'):meta.prepared?say('组件内容已准备好','Component content prepared'):meta.accepted?say('正在生成组件','Generating components'):meta.toolCount?say('正在整理数据与图表','Preparing data and charts'):say('正在准备工作台','Preparing your workbench')
 const activity=heartbeat?say('最近响应：'+since+' 秒前','Last activity: '+since+'s ago'):say('尚未收到模型输出','No model output received yet')
 const detail=!running?say(meta.accepted?'本轮已提交组件计划，最终状态以各组件为准。':'本轮未提交组件计划。',meta.accepted?'A component plan was submitted; see each component for its final status.':'No component plan was submitted in this run.'):meta.accepted?(meta.count?say('已受理 '+meta.count+' 个组件；各组件会分别显示生成状态。',meta.count+' components accepted; each reports its own generation status.'):say('组件计划已受理；受理不等于全部生成完成。','Plan accepted; component generation is still in progress.')):meta.toolCount?say('已开始 '+meta.toolCount+' 次工具调用'+(meta.failedTools?'，其中 '+meta.failedTools+' 次未成功。':'。'),'Started '+meta.toolCount+' tool calls'+(meta.failedTools?'; '+meta.failedTools+' failed.':'.')):say('正在确定内容分工；尚未提交组件计划，内容生成还未开始。','Determining content responsibilities; no component plan has been submitted yet.')
 const warning=running&&!meta.accepted&&elapsed>=120000?say('准备已超过 2 分钟。'+(since!==null&&since<30?'仍在处理中。':'暂未收到新的进展。')+'可以继续等待或停止后重试。','Preparation has exceeded 2 minutes. '+(since!==null&&since<30?'Work is still in progress. ':'No recent progress received. ')+'You can keep waiting or stop and retry.'):''
 return {title,activity,detail,warning,phase:!running?'ended':meta.prepared?'prepared':meta.accepted?'accepted':meta.toolCount?'tools':meta.responding?'responding':'waiting'}
}
export function researchPlanningRequest(order,nodeStore,turn,classify,readText,research=false) {
 if(turn===null||turn===undefined)return null
 for(let i=order.length-1;i>=0;i--){
  const node=nodeStore.get(order[i]);if(node?.kind!=='user')continue
  const location=node.location,number=node.data?.turn??location?.turn?.turn??location?.turn
  if(number!==turn)continue
  const text=readText(node.data?.content||[])
  // Match the runtime's coding boundary even when an older classifier is installed.
  if(!/工作台|看板|仪表盘|\b(?:workbench|dashboard)\b/iu.test(text)&&/\b(?:React|Vue|Svelte|SwiftUI|Angular|TSX|JSX)\b|\.[cm]?[jt]sx?\b|(?:组件|卡片).{0,12}(?:源码|源代码)/iu.test(text))return null
  const request=classify(text)
  return request?.kind==='workbench'||research&&request?.kind==='component'?request:null
 }
 return null
}
function ResearchPlanningFeedback({meta,startedAt,now,running}) {
 const heartbeat=react.useRef(null)
 heartbeat.current=advancePlanningHeartbeat(heartbeat.current,meta,now)
 const english=document.documentElement.dataset.odysseyLocale==='en',state=planningFeedbackState(meta,heartbeat.current,startedAt,now,running,english)
 // The primary execution row already owns the live status. Only exceptional
 // waits need another visible message; transport details stay out of the UI.
 if(!state.warning)return null
 return react_jsx_runtime.jsx('div',{'data-research-planning-feedback':state.phase,role:'status','aria-live':'polite',style:{margin:'4px 0 8px',fontSize:12,lineHeight:1.65,color:'var(--dsw-alias-label-secondary)',overflowWrap:'anywhere'},children:state.warning})
}
export function patchResearchPlanningFeedback(source,classify) {
 const marker='/* ework:planning-feedback:v1 */'
 const view='const selectedCallId = useStore((s) => s.selection?.callId);'
 const surface='const researchPlanningSurface = useStore((s) => s.view === "research");'
 if(!source.includes(surface)){
  if(source.split(view).length!==2||source.includes('const researchPlanningSurface'))throw Error('Planning feedback surface anchor drifted')
  source=source.replace(view,view+'\n'+surface)
 }
 const suffix=',parts=>parseResearchPrompt(contentParts(parts).text).text,researchPlanningSurface) : null;'
 if(source.includes(marker)){
  const stateStart=source.indexOf('function planningFeedbackState('),stateEnd=source.indexOf('\nfunction researchPlanningRequest(',stateStart)
  if(stateStart<0||stateEnd<0)throw Error('Planning status helper missing on reinstall')
  source=source.slice(0,stateStart)+planningFeedbackState.toString()+source.slice(stateEnd)
  const feedbackStart=source.indexOf('function ResearchPlanningFeedback('),feedbackClose=source.indexOf('\n}\n',feedbackStart),feedbackEnd=feedbackClose<0?-1:feedbackClose+2
  if(feedbackStart<0||feedbackEnd<0)throw Error('Planning feedback view missing on reinstall')
  source=source.slice(0,feedbackStart)+ResearchPlanningFeedback.toString()+source.slice(feedbackEnd)
  const metaStart=source.indexOf('function planningResponseMetadata('),metaEnd=source.indexOf('\nfunction advancePlanningHeartbeat(',metaStart)
  if(metaStart<0||metaEnd<0)throw Error('Planning receipt metadata helper missing on reinstall')
  source=source.slice(0,metaStart)+planningResponseMetadata.toString()+source.slice(metaEnd)
  const start=source.indexOf('function researchPlanningRequest('),end=source.indexOf('\nfunction ResearchPlanningFeedback(',start)
  if(start<0||end<0)throw Error('Planning feedback request helper missing on reinstall')
  source=source.slice(0,start)+researchPlanningRequest.toString()+source.slice(end)
  // The classifier is an inlined argument in older installed bundles. Refresh
  // that argument as well, so reinstalls adopt the current creation boundary.
  const prefix='const planningRequest=entry.running && entry.turn===runningTurnNumber ? researchPlanningRequest(order,nodeStore,entry.turn,'
  const callStart=source.indexOf(prefix),ending=[suffix,',parts=>parseResearchPrompt(contentParts(parts).text).text) : null;'].find(value=>source.indexOf(value,callStart)>=0),callEnd=ending?source.indexOf(ending,callStart):-1
  if(callStart<0||callEnd<0)throw Error('Planning feedback classifier missing on reinstall')
  return patchResearchWorkbenchFeedback(source.slice(0,callStart+prefix.length)+classify.toString()+suffix+source.slice(callEnd+ending.length))
 }
 const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Planning feedback anchor missing or ambiguous: '+before.slice(0,75));source=source.replace(before,after)}
 const anchor='const ExecutionStatusGroup = (0, react.memo)(function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t }) {'
 const helpers=marker+'\n'+[planningResponseMetadata,advancePlanningHeartbeat,planningFeedbackState,researchPlanningRequest,ResearchPlanningFeedback].map(fn=>fn.toString()).join('\n')+'\n'
 exact(anchor,helpers+anchor.replace('seatProps, t','seatProps, t, planningRequest'))
 const timing='const time = settled?.time ?? state.firstVisibleTime ?? context.matches[0]?.event.time ?? 0;'
 exact(timing,timing+'\n            const lastActivityAt=context.matches.at(-1)?.event.time??time;')
 const projectStart=source.indexOf('function projectAssistant('),projectEnd=source.indexOf('/** Per-step Assistant',projectStart)
 let projection=source.slice(projectStart,projectEnd)
 if(projection.split('\t\t\t\t\ttime,').length!==2)throw Error('Planning feedback activity timestamp anchor drifted')
 projection=projection.replace('\t\t\t\t\ttime,','\t\t\t\t\ttime, lastActivityAt,')
 source=source.slice(0,projectStart)+projection+source.slice(projectEnd)
 exact('const elapsedMs = endTime !== null && startTime !== null ?', 'const planningMeta=planningRequest && entry.running ? planningResponseMetadata(activityNodes) : null;\n            const elapsedMs = endTime !== null && startTime !== null ?')
 exact('open && progressSurface.detailGroups.length > 0 &&', "planningMeta ? react_jsx_runtime.jsx(ResearchPlanningFeedback,{meta:planningMeta,startedAt:anchor,now:entry.running?now:(endTime??now),running:entry.running},String(anchor)) : null, open && progressSurface.detailGroups.length > 0 &&")
 const start=source.indexOf('const ExecutionStatusGroup ='),end=source.indexOf('//#endregion',start)
 let component=source.slice(start,end)
 component=component.replace('children: status', "children: planningMeta && entry.running ? planningFeedbackState(planningMeta,null,anchor,now,true,document.documentElement.dataset.odysseyLocale==='en').title : status")
 source=source.slice(0,start)+component+source.slice(end)
 const call='const activityNodes = entry.nodeKeys.map((key) => nodeStore.get(key)).filter((node) => node !== void 0);'
 exact(call,call+`\n                                const planningRequest=entry.running && entry.turn===runningTurnNumber ? researchPlanningRequest(order,nodeStore,entry.turn,${classify.toString()}${suffix}`)
 const props='\t\t\t\t\t\t\t\t\tstartTime: turn?.start?.time ?? (entry.running ? runningTurn?.startTime ?? null : null),'
 exact(props,'\t\t\t\t\t\t\t\t\tplanningRequest,\n'+props)
 return patchResearchWorkbenchFeedback(source)
}
