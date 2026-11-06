/** Public replies stay in the transcript; only real action records enter disclosure. */
export function conversationPublicReplies(order, nodeStore, closingSeqByTurn, promoted) {
 const result=new Set(promoted)
 for(const key of order){
  const node=nodeStore.get(key),turn=conversationNodeTurn(node),closing=closingSeqByTurn.get(turn)
  if(node?.kind!=='assistant-step'||turn===null||typeof closing==='number'&&node.data?.finalNode?.seq===closing)continue
  // Public text is distinct from model reasoning. Show it as soon as it streams.
  if(assistantStepText(node))result.add(key)
 }
 return result
}
export function ConversationActivityDetails({activityNodes,detailGroups,seatProps,t,running}) {
 const allowed=new Set(detailGroups.flatMap(group=>group.nodeKeys))
 const english=document.documentElement.dataset.odysseyLocale==='en'||document.documentElement.lang?.startsWith('en')
 return react.createElement('div',{className:ChatView_module_css_default.executionDetails,'data-conversation-activity-details':'',role:'group','aria-label':t('execution.details.title')},
  ...activityNodes.filter(node=>allowed.has(node.key)).map(node=>{
   const root=node.data?.root,settled=!!root&&'kind' in root,failed=executionToolFailed(root)
   let label=executionActivityLabel(node,t)
   if(node.kind==='tool-call'&&settled){
    label=failed?(english?'Failed: ':'未完成：')+label:english?'Completed: '+label:label.replace(/^正在/u,'已').replace(/[.…]+$/u,'')
   }else if(!running)label=(english?'Ended: ':'已结束：')+label.replace(/^正在/u,'')
   return react.createElement('details',{key:node.key,'data-activity-record':node.key,'data-error':failed?'':undefined},
    react.createElement('summary',{title:label},
     react.createElement(ExecutionDetailGroupIcon,{id:executionDetailCategory(node)}),
     react.createElement('span',null,label)),
    react.createElement(ChatNodeSeat,{nodeKey:node.key,...seatProps}))
  }))
}
export const statusPresentationCss=`
body [data-response-progress].Md3f7G_executionGroup>.Md3f7G_executionTrigger{display:flex;width:fit-content;max-width:100%;gap:6px;margin-inline:0;padding-inline:0;text-align:start}
body [data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionText{order:0;flex:0 1 auto;min-width:0;text-align:start}
body [data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionLeading{order:1;flex:0 0 14px;width:14px;margin-inline:0;opacity:0;transition:opacity 120ms ease}
body [data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionMeta{order:2;color:var(--dsw-alias-label-tertiary,#80858e);opacity:1}
body [data-response-progress]>.Md3f7G_executionTrigger .Md3f7G_executionChevron{opacity:1}
body [data-response-progress][data-expanded=true]>.Md3f7G_executionTrigger .Md3f7G_executionChevron{transform:rotate(90deg)}
body [data-response-progress]>.Md3f7G_executionTrigger:is(:hover,:focus-visible):not(:disabled)>.Md3f7G_executionLeading,
body [data-response-progress][data-expanded=true]>.Md3f7G_executionTrigger>.Md3f7G_executionLeading{opacity:1}
body [data-response-progress]>.Md3f7G_executionTrigger:disabled>.Md3f7G_executionLeading{display:none}
body [data-response-progress][data-state=complete]>.Md3f7G_executionTrigger:disabled>.Md3f7G_executionText{display:none}
body [data-conversation-activity-details]{display:flex;flex-direction:column;gap:4px;border:0;margin:4px 0 0;padding:0}
[data-activity-record]>summary{display:flex;align-items:center;gap:7px;list-style:none;cursor:pointer;min-width:0;color:var(--dsw-alias-label-tertiary,#80858e);font-size:13px;line-height:22px}
[data-activity-record]>summary::-webkit-details-marker{display:none}
[data-activity-record]>summary>svg{flex:0 0 14px;width:14px;height:14px}
[data-activity-record]>summary>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}
[data-activity-record][data-error]>summary{color:var(--dsw-alias-state-error-primary)}
[data-activity-record][open]>summary{margin-bottom:6px}
[data-conversation-live-activity]{min-height:24px;padding:4px 0 12px;color:var(--dsw-alias-label-tertiary,#80858e);font-size:13px;line-height:20px}
[data-conversation-live-activity]:not([data-conversation-live-activity=waiting])>span,
[data-response-progress][data-state=running]:not([data-activity-kind=waiting])>.Md3f7G_executionTrigger>.Md3f7G_executionText{background-image:linear-gradient(100deg,var(--dsw-alias-label-tertiary,#80858e) 25%,var(--dsw-alias-label-primary,#eee) 48%,var(--dsw-alias-label-tertiary,#80858e) 70%);background-size:250% 100%;background-clip:text;-webkit-background-clip:text;color:transparent;animation:ework-status-shimmer 2.4s linear infinite}
[data-response-progress][data-activity-kind=waiting]>.Md3f7G_executionTrigger>.Md3f7G_executionText{animation:none;background:none;color:var(--dsw-alias-label-tertiary,#80858e);-webkit-text-fill-color:currentColor}
@keyframes ework-status-shimmer{from{background-position:150% 0}to{background-position:-150% 0}}
@media(prefers-reduced-motion:reduce){[data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionText,[data-conversation-live-activity]>span{animation:none!important;background:none!important;-webkit-text-fill-color:currentColor!important;color:var(--dsw-alias-label-tertiary,#80858e)!important}body [data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionLeading{transition:none}}
@media(forced-colors:active){[data-response-progress]>.Md3f7G_executionTrigger>.Md3f7G_executionText,[data-conversation-live-activity]>span{animation:none!important;background:none!important;-webkit-text-fill-color:currentColor!important;color:CanvasText!important}}
`
const originalDetails=String.raw`open && progressSurface.detailGroups.length > 0 && (0, react_jsx_runtime.jsx)("div", {
					className: ChatView_module_css_default.executionDetails,
					role: "group",
					"aria-label": t("execution.details.title"),
					children: progressSurface.detailGroups.map((group) => (0, react_jsx_runtime.jsxs)("details", {
						className: "dshExecutionDetailGroup",
						"data-execution-detail-group": group.id,
						"data-error-count": group.errorCount || void 0,
						children: [(0, react_jsx_runtime.jsxs)("summary", {
							className: "dshExecutionDetailSummary",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "dshExecutionDetailIcon",
								"aria-hidden": true,
								children: (0, react_jsx_runtime.jsx)(ExecutionDetailGroupIcon, { id: group.id })
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "dshExecutionDetailTitle",
								children: t(group.titleKey)
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "dshExecutionDetailMeta",
								children: t("execution.details.group.count", { count: group.nodeKeys.length })
							}), group.errorCount > 0 && (0, react_jsx_runtime.jsx)("span", {
								className: "dshExecutionDetailMeta dshExecutionDetailError",
								children: t("execution.details.group.errors", { count: group.errorCount })
							}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {
								className: "dshExecutionDetailChevron",
								"aria-hidden": true
							})]
						}), (0, react_jsx_runtime.jsx)("div", {
							className: "dshExecutionDetailItems",
							children: group.nodeKeys.map((nodeKey) => (0, react_jsx_runtime.jsx)(ChatNodeSeat, {
								nodeKey,
								...seatProps
							}, nodeKey))
						})]
					}, group.id))
				})`
const replacementDetails="open && react.createElement(ConversationActivityDetails,{activityNodes,detailGroups:progressSurface.detailGroups,seatProps,t,running:entry.running})"
const changes=[
 ['() => completedFinal ? finalAnswerBlocks(data.blocks) : data.blocks', '() => finalAnswerBlocks(data.blocks)'],
 ['progressSurface.showProgress && (0, react_jsx_runtime.jsx)', 'progressSurface.showProgress && activityNodes.some(node=>assistantStepText(node)) && (0, react_jsx_runtime.jsx)'],
 ['sessionId, responseTiming })','sessionId, responseTiming, liveActivity })'],
 ['const status = entry.noteTask ?', 'const status = entry.running && liveActivity ? liveActivity.label : entry.noteTask ?'],
 ['"data-state": entry.running ? "running" : "complete",','"data-state": entry.running ? "running" : "complete",\n"data-activity-kind": entry.running ? liveActivity?.kind : void 0,'],
 [originalDetails,replacementDetails],
 ['const promotedAssistantKeys = substantialAssistantReplies(order, nodeStore, closingSeqByTurn, closingTextByTurn);','const promotedAssistantKeys = conversationPublicReplies(order,nodeStore,closingSeqByTurn,substantialAssistantReplies(order, nodeStore, closingSeqByTurn, closingTextByTurn));'],
 ['activityNodes, sessionId, responseTiming:eworkResponseProgressByTurn.get(entry.key),','activityNodes, sessionId, responseTiming:eworkResponseProgressByTurn.get(entry.key), liveActivity:entry.running&&!entry.noteTask&&!entry.canvasTask?conversationLiveActivity({running:true,runningTurn:runningTurnNumber,order,nodeStore,t,labelForNode:executionActivityLabel,statusForNodes:executionStatusForNodes,english:document.documentElement.dataset.odysseyLocale==="en"}):null,'],
 ['responseTiming:eworkSharedResponseProgress.get(entry.key),','responseTiming:eworkSharedResponseProgress.get(entry.key), liveActivity:entry.running&&!entry.canvasTask?conversationLiveActivity({running:true,runningTurn,order:slice.keys,nodeStore,t,labelForNode:executionActivityLabel,statusForNodes:executionStatusForNodes,english:document.documentElement.dataset.odysseyLocale==="en"}):null,']
]
export function transformStatusPresentation(source,inverse=false){
 for(const [before,after]of inverse?[...changes].reverse():changes){
  const from=inverse?after:before,to=inverse?before:after
  if(source.split(from).length!==2)throw Error('Conversation status presentation anchor drifted: '+from.slice(0,80))
  source=source.replace(from,to)
 }
 return source
}
