import {createHash} from 'node:crypto'

/** Fold public progress and real actions together, without crossing human input. */
export function conversationResponseHistory(flow, nodeStore, runningTurn) {
 const turnOf=node=>node?.location?.turn?.turn??node?.data?.turn??null
 const textOf=node=>node?.kind==='assistant-step'&&node.data?.blocks?.some(block=>block.kind==='text'&&block.text?.trim())
 const result=[];let segment=[],turn=null
 const flush=()=>{
  if(!segment.length)return
  const active=turn===runningTurn,publicRows=segment.filter(row=>row.kind==='node'&&textOf(nodeStore.get(row.key)))
  const tail=segment.find(row=>row.kind==='node'&&nodeStore.get(row.key)?.kind==='turn-tail')
  const closingSeq=tail&&nodeStore.get(tail.key)?.data?.closing?.finalNode?.seq
  const retained=new Set(publicRows.filter(row=>closingSeq!==undefined?nodeStore.get(row.key)?.data?.finalNode?.seq===closingSeq:row===publicRows.at(-1)).map(row=>row.key))
  const gathered=[],remaining=[],seen=new Set();let header
  for(const row of segment){
   const execution=row.kind==='execution'&&!row.noteTask&&!row.canvasTask
   const report=row.kind==='node'&&textOf(nodeStore.get(row.key))&&!retained.has(row.key)
   if(execution&&(!active||!row.running)||report){
    if(!header&&execution)header=row
    for(const key of execution?row.nodeKeys:[row.key])if(!seen.has(key)){seen.add(key);gathered.push(key)}
   }else remaining.push(row)
  }
  // Some providers emit the public acknowledgment before any reasoning event.
  // Reserve its total-time row above the reply; the current action stays below.
  if(!header&&(gathered.length||active&&publicRows.length))header={kind:'execution',key:'response-history:'+turn+':'+(gathered[0]??publicRows[0].key),turn,nodeKeys:[],running:false}
  if(header){
   result.push({...header,nodeKeys:gathered,responseHistory:true,running:false},...remaining)
  }else result.push(...segment)
  segment=[]
 }
 for(const row of flow){
  const node=row.kind==='node'?nodeStore.get(row.key):null,next=row.kind==='execution'?row.turn:turnOf(node)
  if(next===null||node?.kind==='user'||node?.kind==='steering'||row.kind!=='node'&&row.kind!=='execution'){
   flush();turn=null;result.push(row);continue
  }
  if(next!==turn){flush();turn=next}
  segment.push(row)
 }
 flush();return result
}

export function ConversationResponseHistoryDetails({activityNodes,detailGroups,seatProps,t}) {
 const allowed=new Set(detailGroups.flatMap(group=>group.nodeKeys))
 const visible=activityNodes.filter(node=>allowed.has(node.key)||assistantStepText(node))
 const groups=typeof conversationActivityRecords==='function'?conversationActivityRecords(visible):visible.map(node=>[node])
 return react.createElement('div',{'data-response-history-details':'',role:'group','aria-label':t('execution.details.title')},
  ...groups.map(group=>{
   const node=group[0]
   if(assistantStepText(node))return react.createElement('div',{key:node.key,'data-response-history-report':node.key},
    react.createElement(AssistantMarkdown,{blocks:finalAnswerBlocks(node.data.blocks),streaming:false,interrupted:false,openFile:seatProps.openFile,loadImage:seatProps.loadImage,t}))
   return react.createElement(ConversationActivityDetails,{key:node.key,activityNodes:group,detailGroups,seatProps,t,running:false})
  }))
}

const CSS=`
body [data-response-progress=total].Md3f7G_executionGroup{padding:0;margin-bottom:4px}
body [data-response-progress=total][data-state].Md3f7G_executionGroup>.Md3f7G_executionTrigger{width:100%;justify-content:flex-start;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary,#858585) 18%,transparent)}
body [data-response-progress][data-state].Md3f7G_executionGroup>.Md3f7G_executionTrigger{min-height:20px;padding:0;gap:4px;font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,#858585)}
body [data-response-progress][data-state]>.Md3f7G_executionTrigger>.Md3f7G_executionText,body [data-response-progress][data-state]>.Md3f7G_executionTrigger>.Md3f7G_executionMeta{font-size:13px;font-weight:400;line-height:20px}
body [data-response-progress=total]>.Md3f7G_executionTrigger:not(:disabled)>.Md3f7G_executionLeading{order:3;opacity:1;flex-basis:12px;width:12px}
body [data-response-progress=total]>.Md3f7G_executionTrigger .Md3f7G_executionChevron{width:12px;height:12px}
body [data-response-history-details]{display:flex;flex-direction:column;gap:14px;margin:16px 0 4px}
body [data-response-history-details] [data-conversation-activity-details]{margin:0}
body [data-response-history-details] [data-response-history-report]{--odyssey-reading-size:14px;--odyssey-reading-leading:1.7;font-size:14px;line-height:24px;color:var(--dsw-alias-label-primary,#ddd)}
body [data-response-history-report] p:first-child{margin-top:0}
body [data-response-history-report] p:last-child{margin-bottom:0}
`
const START='/* ework:conversation-response-history:v3 */',V2='/* ework:conversation-response-history:v2 */',V1='/* ework:conversation-response-history:v1 */',END='/* ework:conversation-response-history:end */'
const definition=()=>START+'\n'+conversationResponseHistory.toString()+'\n'+ConversationResponseHistoryDetails.toString()+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-response-history-style");if(!style){style=document.createElement("style");style.id="ework-response-history-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(CSS)+';}\n'+END+'\n'
const pairs=[
 ['!!entry.canvasTask || detailGroups.length > 0;', '!!entry.canvasTask || detailGroups.length > 0 || entry.responseHistory && activityNodes.some(node=>assistantStepText(node));'],
 ['"data-expanded": open,','"data-expanded": open,\n"data-response-history": entry.responseHistory ? "" : void 0,'],
 ['const toggleLabel = open ?', 'const responseHeaderTitle=responseTiming?.visible&&!entry.running&&showElapsed ? t("execution.status.elapsed",{duration:formatRunDuration(elapsedMs,t)}).replace(/^[\\s·•]+/u,"") : null;\nconst toggleLabel = open ?'],
 ['children: planningMeta && entry.running ?', 'children: responseHeaderTitle ?? (planningMeta && entry.running ?'],
 ['.title : status\n', '.title : status)\n'],
 ['}), showElapsed && (0, react_jsx_runtime.jsx)("span", {','}), showElapsed && !responseHeaderTitle && (0, react_jsx_runtime.jsx)("span", {'],
 ['open && react.createElement(ConversationActivityDetails,{activityNodes,detailGroups:progressSurface.detailGroups,seatProps,t,running:entry.running})','open && (entry.responseHistory ? react.createElement(ConversationResponseHistoryDetails,{activityNodes,detailGroups:progressSurface.detailGroups,seatProps,t}) : react.createElement(ConversationActivityDetails,{activityNodes,detailGroups:progressSurface.detailGroups,seatProps,t,running:entry.running}))'],
 ['progressSurface.showProgress && activityNodes.some', '!entry.responseHistory && progressSurface.showProgress && activityNodes.some']
]
const elapsedPair=['children: t("execution.status.elapsed", { duration: formatRunDuration(elapsedMs, t) })','children: t("execution.status.elapsed", { duration: formatRunDuration(elapsedMs, t) }).replace(/^[\\s·•]+/u, "")']
function scope(source,start,end,pairs,inverse){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length)
 if(a<0||b<a)throw Error('Response history scope drifted')
 let part=source.slice(a,b)
 for(const [before,after]of inverse?[...pairs].reverse():pairs){const from=inverse?after:before,to=inverse?before:after;if(part.split(from).length!==2)throw Error('Response history anchor drifted: '+from.slice(0,80));part=part.replace(from,to)}
 return source.slice(0,a)+part+source.slice(b)
}
function transform(source,inverse=false,previous=false){
 source=scope(source,'function compactConversationFlow(', '\n\t\t/** Merge transient steering', [['return entries;','return conversationResponseHistory(entries,nodeStore,runningTurn);']],inverse)
 return scope(source,'const ExecutionStatusGroup =','\n\t\t//#endregion',previous?pairs:[...pairs,elapsedPair],inverse)
}
export function stripConversationResponseHistory(source){
 const markers=[V1,V2,START].filter(marker=>source.includes(marker)),marker=markers[0],a=marker?source.indexOf(marker):-1;if(a<0){if(source.includes('ework:conversation-response-history:')||source.includes('function conversationResponseHistory('))throw Error('Unknown response history layer');return source}
 const b=source.indexOf(END,a),block=source.slice(a,b+END.length+1)
 const hash=marker===V1?'f2776ffff6caa19670085e265d2622bdc2f20dfaf592040379c90f475a28eebd':marker===V2?'043382be6a05ceb2d4b2deba02f90502fb7c56da09be15f52d4c2dedbc3b7cce':null
 if(markers.length!==1||source.split(marker).length!==2||source.split(END).length!==2||(hash?createHash('sha256').update(block).digest('hex')!==hash:block!==definition()))throw Error('Response history definition drifted')
 return transform(source.replace(block,''),true,marker===V1)
}
export function patchConversationResponseHistory(source){
 source=transform(stripConversationResponseHistory(source))
 return source.replace('const ExecutionStatusGroup =',definition()+'const ExecutionStatusGroup =')
}
