const START='/* ework:conversation-response-progress:v1 */',END='/* ework:conversation-response-progress:end */'
const OWNED=['eworkResponseProgressByTurn','eworkSharedResponseProgress','responseClockRunning','data-response-total-time']
const CSS='[data-response-progress]>.Md3f7G_executionTrigger .Md3f7G_executionChevron,[data-response-progress] .dshExecutionDetailSummary>.dshExecutionDetailChevron{opacity:0;transition:opacity 120ms ease}'+
 '[data-response-progress]>.Md3f7G_executionTrigger:is(:hover,:focus-within) .Md3f7G_executionChevron,[data-response-progress] .dshExecutionDetailSummary:is(:hover,:focus-within)>.dshExecutionDetailChevron{opacity:1}'+
 '[data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionMeta{font-variant-numeric:tabular-nums;white-space:nowrap}'+
 '@media(prefers-reduced-motion:reduce){[data-response-progress]>.Md3f7G_executionTrigger .Md3f7G_executionChevron,[data-response-progress] .dshExecutionDetailSummary>.dshExecutionDetailChevron{transition:none}}'

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
/** A component-local clock may include preparation already observed before turn/start. */
export function useConversationResponseProgress(flow,runningTurn,timeline,running,sessionId,owner) {
  const ref=react.useRef(null)
  if(!ref.current||ref.current.sessionId!==sessionId||ref.current.owner!==owner)ref.current={sessionId,owner,pending:null,carried:new Map()}
  const lease=ref.current,identified=typeof runningTurn==='number'&&Number.isFinite(runningTurn)
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
    if(lease.pending===null)lease.pending={observedAt:Date.now(),knownTurnIds:new Set(timeline?.turns?.keys?.()??[])}
  }else if(lease.pending!==null){carry(runningTurn);lease.pending=null}
  const result=conversationResponseProgress(flow,runningTurn)
  for(const entry of flow??[]){
    const clock=result.get(entry.key);if(!clock)continue
    if(lease.carried.has(entry.turn))clock.startTime=lease.carried.get(entry.turn)
    else if(running&&!identified&&lease.pending!==null&&!(typeof entry.turn==='number'&&Number.isFinite(entry.turn))){clock.running=true;clock.startTime=lease.pending.observedAt}
  }
  return result
}
const definition=()=>START+'\n'+conversationResponseProgress.toString()+'\n'+useConversationResponseProgress.toString()+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-response-progress-style");if(!style){style=document.createElement("style");style.id="ework-response-progress-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(CSS)+';}\n'+END+'\n'
const exact=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Conversation response progress anchor drifted: '+before.slice(0,90));return source.replace(before,after)}
function scoped(source,anchor,change){const start=source.indexOf(anchor),end=source.indexOf('\n\t\t//#endregion',start);if(start<0||end<start)throw Error('Conversation response progress scope missing: '+anchor);return source.slice(0,start)+change(source.slice(start,end))+source.slice(end)}
const executionChanges=[
 ['function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest, sessionId })','function ExecutionStatusGroup({ entry, activityNodes, startTime, endTime, seatProps, t, planningRequest, sessionId, responseTiming })'],
 ['const [expanded, setExpanded] = (0, react.useState)(false);','const responseClockRunning=responseTiming ? responseTiming.running && (responseTiming.visible || entry.running) : entry.running;\nconst [expanded, setExpanded] = (0, react.useState)(false);'],
 ['const anchor = startTime ?? mountedAt;','const anchor = responseTiming?.startTime ?? startTime ?? mountedAt;'],
 ['Math.max(0, endTime - startTime) : Math.max(0, now - anchor);','Math.max(0, endTime - (responseTiming?.startTime ?? startTime)) : Math.max(0, now - anchor);'],
 ['if (!entry.running) return;','if (!responseClockRunning) return;'],
 ['}, [entry.running]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (wasRunning.current','}, [responseClockRunning, anchor]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (wasRunning.current'],
 ['const showElapsed = entry.running ? elapsedMs >= 15e3 : elapsedMs >= 1e3;','const showElapsed = responseTiming ? responseTiming.visible : (entry.running ? elapsedMs >= 15e3 : elapsedMs >= 1e3);'],
 ['"data-chat-flow-kind": "execution",','"data-chat-flow-kind": "execution",\n"data-response-progress": "",'],
 ['className: ChatView_module_css_default.executionMeta,','className: ChatView_module_css_default.executionMeta,\n"data-response-total-time": responseTiming?.visible ? "" : void 0,']
]
const chatChanges=[
 ['const seatProps = (0, react.useMemo)(() => ({','const eworkResponseProgressByTurn=useConversationResponseProgress(conversationComponentFlow,runningTurnNumber,timeline,running,sessionId,useSession);\nconst seatProps = (0, react.useMemo)(() => ({'],
 ['activityNodes, sessionId,','activityNodes, sessionId, responseTiming:eworkResponseProgressByTurn.get(entry.key),']
]
const sharedChanges=[
 ['const body=continued.filter(e=>!reports.includes(e)&&!tails.includes(e))','const body=continued.filter(e=>!reports.includes(e)&&!tails.includes(e))\n  const eworkSharedResponseProgress=useConversationResponseProgress(body,runningTurn,timeline,running,nativeProps.sessionId+":"+task?.taskId,nativeProps.useSession)'],
 ['activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean),','activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean), responseTiming:eworkSharedResponseProgress.get(entry.key),']
]
function transform(source,inverse){
 const apply=pairs=>body=>{for(const [before,after]of inverse?[...pairs].reverse():pairs)body=exact(body,inverse?after:before,inverse?before:after);return body}
 source=scoped(source,'const ExecutionStatusGroup =',apply(executionChanges))
 source=scoped(source,'function ChatView(',apply(chatChanges))
 if(source.includes('function SharedResearchRequest('))source=scoped(source,'function SharedResearchRequest(',apply(sharedChanges))
 return source
}
export function stripConversationResponseProgress(source){
 const at=source.indexOf('/* ework:conversation-response-progress:')
 if(at<0){if(OWNED.some(value=>source.includes(value)))throw Error('Orphan conversation response progress hook');return source}
 if(source.split(START).length!==2||source.split('/* ework:conversation-response-progress:').length!==3||source.split(END).length!==2)throw Error('Unknown/duplicate conversation response progress layer')
 const block=definition();if(source.slice(at,at+block.length)!==block)throw Error('Conversation response progress definition drifted')
 const restored=transform(source.slice(0,at)+source.slice(at+block.length),true)
 if(OWNED.some(value=>restored.includes(value)))throw Error('Orphan conversation response progress hook')
 return restored
}
export function patchConversationResponseProgress(source){
 source=stripConversationResponseProgress(source)
 source=transform(source,false)
 return exact(source,'const ExecutionStatusGroup =',definition()+'const ExecutionStatusGroup =')
}
