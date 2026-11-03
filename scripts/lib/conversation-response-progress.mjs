import {createHash} from 'node:crypto'

const START='/* ework:conversation-response-progress:v3 */',PREVIOUS='/* ework:conversation-response-progress:v2 */',LEGACY='/* ework:conversation-response-progress:v1 */',END='/* ework:conversation-response-progress:end */'
const OWNED=['eworkResponseProgressByTurn','eworkSharedResponseProgress','responseClockRunning','data-response-total-time','conversationResponseElapsed']
const CSS='[data-response-progress="total"]>.Md3f7G_executionTrigger .Md3f7G_executionChevron{opacity:1}'+
 'body [data-response-progress="stage"].Md3f7G_executionGroup>.Md3f7G_executionTrigger{width:100%;display:flex;gap:8px;margin-inline:0;padding-inline:0;text-align:start}'+
 'body [data-response-progress="stage"]>.Md3f7G_executionTrigger>.Md3f7G_executionText{order:0;flex:1;min-width:0;text-align:start}'+
 'body [data-response-progress="stage"]>.Md3f7G_executionTrigger>.Md3f7G_executionLeading{order:2;flex:0 0 14px;width:14px;margin-inline: auto 0;opacity:0;transition:opacity 120ms ease}'+
 'body [data-response-progress="stage"]>.Md3f7G_executionTrigger:is(:hover,:focus-within):not(:disabled)>.Md3f7G_executionLeading{opacity:1}'+
 '[data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionMeta{font-variant-numeric:tabular-nums;white-space:nowrap}'+
 '@media(prefers-reduced-motion:reduce){body [data-response-progress="stage"]>.Md3f7G_executionTrigger>.Md3f7G_executionLeading{transition:none}}'

/** The native timeline owns time; this projection only chooses one display per Turn. */
export function conversationResponseProgress(flow,runningTurn) {
  const first=new Set(),result=new Map()
  for(const entry of flow??[]){
    if(entry?.kind!=='execution')continue
    const identified=typeof entry.turn==='number'&&Number.isFinite(entry.turn)
    const visible=!identified||!first.has(entry.turn)
    if(identified)first.add(entry.turn)
    result.set(entry.key,{visible,running:identified?entry.turn===runningTurn:entry.running})
  }
  return result
}
/** A completed turn needs both durable boundaries; mounting is never elapsed work. */
export function conversationResponseElapsed({running,startTime,endTime,now,anchor}) {
  const finite=value=>typeof value==='number'&&Number.isFinite(value)
  if(finite(startTime)&&finite(endTime))return endTime>=startTime?endTime-startTime:null
  if(!running||!finite(now))return null
  const start=finite(startTime)?startTime:anchor
  return finite(start)?Math.max(0,now-start):null
}
/** A component-local clock may include preparation already observed before turn/start. */
export function useConversationResponseProgress(flow,runningTurn,timeline,running,sessionId,owner) {
  const ref=react.useRef(null)
  if(!ref.current||ref.current.sessionId!==sessionId||ref.current.owner!==owner)ref.current={sessionId,owner,pending:null,carried:new Map()}
  const lease=ref.current,pendingEntry=(flow??[]).find(entry=>entry?.pendingSubmission===true&&entry.kind==='execution');
  if(pendingEntry||running&&lease.pending?.knownTurnIds.has(runningTurn))runningTurn=null
  const identified=typeof runningTurn==='number'&&Number.isFinite(runningTurn)
  const carry=turn=>{
    const start=timeline?.turns?.get(turn)?.start?.time,observed=lease.pending.observedAt
    if(!lease.carried.has(turn))lease.carried.set(turn,typeof start==='number'&&Number.isFinite(start)?Math.min(start,observed):observed)
  }
  if(!running){
    if(lease.pending){
      const fresh=[...(timeline?.turns?.keys?.()??[])].filter(turn=>{
        const value=timeline.turns.get(turn)
        return typeof turn==='number'&&Number.isFinite(turn)&&!lease.pending.knownTurnIds.has(turn)&&Number.isFinite(value?.start?.time)&&Number.isFinite(value?.end?.time)
      })
      if(fresh.length===1)carry(fresh[0])
    }
    lease.pending=null
  }else if(!identified){
    if(lease.pending===null)lease.pending={observedAt:typeof pendingEntry?.observedAt==='number'&&Number.isFinite(pendingEntry.observedAt)?Math.min(Date.now(),pendingEntry.observedAt):Date.now(),knownTurnIds:new Set(timeline?.turns?.keys?.()??[])}
  }else if(lease.pending!==null){carry(runningTurn);lease.pending=null}
  const result=conversationResponseProgress(flow,runningTurn)
  for(const entry of flow??[]){
    const clock=result.get(entry.key);if(!clock)continue
    if(lease.carried.has(entry.turn))clock.startTime=lease.carried.get(entry.turn)
    else if(running&&!identified&&lease.pending!==null&&!(typeof entry.turn==='number'&&Number.isFinite(entry.turn))){clock.running=true;clock.startTime=lease.pending.observedAt}
  }
  return result
}
const definition=()=>START+'\n'+conversationResponseProgress.toString()+'\n'+conversationResponseElapsed.toString()+'\n'+useConversationResponseProgress.toString()+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-response-progress-style");if(!style){style=document.createElement("style");style.id="ework-response-progress-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(CSS)+';}\n'+END+'\n'
const exact=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Conversation response progress anchor drifted: '+before.slice(0,90));return source.replace(before,after)}
function scoped(source,anchor,change){const start=source.indexOf(anchor),end=source.indexOf('\n\t\t//#endregion',start);if(start<0||end<start)throw Error('Conversation response progress scope missing: '+anchor);return source.slice(0,start)+change(source.slice(start,end))+source.slice(end)}
const previousExecutionChanges=[
 ['function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest, sessionId })','function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest, sessionId, responseTiming })'],
 ['const [expanded, setExpanded] = (0, react.useState)(false);','const responseClockRunning=responseTiming ? responseTiming.running && (responseTiming.visible || entry.running) : entry.running;\nconst [expanded, setExpanded] = (0, react.useState)(false);'],
 ['const anchor = startTime ?? mountedAt;','const anchor = responseTiming?.startTime ?? startTime ?? mountedAt;'],
 ['Math.max(0, endTime - startTime) : Math.max(0, now - anchor);','Math.max(0, endTime - (responseTiming?.startTime ?? startTime)) : Math.max(0, now - anchor);'],
 ['if (!entry.running) return;','if (!responseClockRunning) return;'],
 ['}, [entry.running]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (wasRunning.current','}, [responseClockRunning, anchor]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (wasRunning.current'],
 ['const showElapsed = entry.running ? elapsedMs >= 15e3 : elapsedMs >= 1e3;','const showElapsed = responseTiming ? responseTiming.visible : (entry.running ? elapsedMs >= 15e3 : elapsedMs >= 1e3);'],
 ['"data-chat-flow-kind": "execution",','"data-chat-flow-kind": "execution",\n"data-response-progress": responseTiming?.visible===false ? "stage" : "total",'],
 ['className: ChatView_module_css_default.executionMeta,','className: ChatView_module_css_default.executionMeta,\n"data-response-total-time": responseTiming?.visible ? "" : void 0,']
]
const executionChanges=previousExecutionChanges.map(([before,after])=>before.startsWith('Math.max(0, endTime - startTime)')
 ? ['const elapsedMs = endTime !== null && startTime !== null ? '+before,'const elapsedMs = conversationResponseElapsed({running:responseClockRunning,startTime:responseTiming?.startTime ?? startTime,endTime,now,anchor});']
 : before.startsWith('const showElapsed =')
 ? [before,'const showElapsed = elapsedMs !== null && (responseTiming ? responseTiming.visible : (entry.running ? elapsedMs >= 15e3 : elapsedMs >= 1e3));']
 : [before,after])
const chatChanges=[
 ['const seatProps = (0, react.useMemo)(() => ({','const eworkResponseProgressByTurn=useConversationResponseProgress(conversationComponentFlow,runningTurnNumber,timeline,running,sessionId,useSession);\nconst seatProps = (0, react.useMemo)(() => ({'],
 ['activityNodes, sessionId,','activityNodes, sessionId, responseTiming:eworkResponseProgressByTurn.get(entry.key),']
]
const sharedChanges=[
 ['const body=continued.filter(e=>!reports.includes(e)&&!tails.includes(e))','const body=continued.filter(e=>!reports.includes(e)&&!tails.includes(e))\n  const eworkSharedResponseProgress=useConversationResponseProgress(body,runningTurn,timeline,running,nativeProps.sessionId+":"+task?.taskId,nativeProps.useSession)'],
 ['activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean),','activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean), responseTiming:eworkSharedResponseProgress.get(entry.key),']
]
function transform(source,inverse,legacy=false,previous=false){
 const apply=pairs=>body=>{for(const [before,after]of inverse?[...pairs].reverse():pairs)body=exact(body,inverse?after:before,inverse?before:after);return body}
 source=scoped(source,'const ExecutionStatusGroup =',apply(legacy?previousExecutionChanges.map(([before,after])=>[before,after.replace('\"data-response-progress\": responseTiming?.visible===false ? \"stage\" : \"total\",','\"data-response-progress\": \"\",')]):previous?previousExecutionChanges:executionChanges))
 source=scoped(source,'function ChatView(',apply(chatChanges))
 if(source.includes('function SharedResearchRequest('))source=scoped(source,'function SharedResearchRequest(',apply(sharedChanges))
 return source
}
export function stripConversationResponseProgress(source){
 const at=source.indexOf('/* ework:conversation-response-progress:')
 if(at<0){if(OWNED.some(value=>source.includes(value)))throw Error('Orphan conversation response progress hook');return source}
 const legacy=source.includes(LEGACY),previous=source.includes(PREVIOUS),marker=legacy?LEGACY:previous?PREVIOUS:START
 if(source.split(marker).length!==2||[START,PREVIOUS,LEGACY].some(value=>value!==marker&&source.includes(value))||source.split('/* ework:conversation-response-progress:').length!==3||source.split(END).length!==2)throw Error('Unknown/duplicate conversation response progress layer')
 const end=source.indexOf(END,at),block=source.slice(at,end+END.length+1)
 const historicalHash=legacy?'d7b8132fea7771f61b108a284eec34106af7b33191f1b847adb61eeb6aa25c43':previous?'6ce52c8638b57f82f1d3d15b2500018cea0a6ff06072763c1f5124c3e841223a':null
 if(historicalHash?createHash('sha256').update(block).digest('hex')!==historicalHash:block!==definition())throw Error('Conversation response progress definition drifted')
 const restored=transform(source.slice(0,at)+source.slice(at+block.length),true,legacy,previous)
 if(OWNED.some(value=>restored.includes(value)))throw Error('Orphan conversation response progress hook')
 return restored
}
export function patchConversationResponseProgress(source){
 source=stripConversationResponseProgress(source)
 source=transform(source,false)
 return exact(source,'const ExecutionStatusGroup =',definition()+'const ExecutionStatusGroup =')
}
