/** A settled no-history compact is a management receipt, not a conversation. */
export function isHomeConversationContentNode(node){
 if(node?.kind==='command')return false
 const command=node?.data?.command,outcome=command?.outcome
 return !(node?.kind==='manual-compaction'&&node.visibility==='visible'&&command?.name==='compact'&&outcome?.kind==='success'&&outcome.text==='No compactable history yet.'&&outcome.sourceEventSeq===undefined&&node.data.compaction===null)
}

/** Retaining an edited note is persistence activity, not a visible conversation. */
export function noteConversationVacant(session,rows=[],tasks=[],researchPending=false){
 const chat=session?.chat,visible=(chat?.order||[]).some(key=>isHomeConversationContentNode(chat.nodes?.get?.(key)))
 return !visible&&!session?.running&&!(session?.pending?.length)&&!(session?.queue?.length)&&!(session?.runningCalls?.length)&&!session?.partial&&!(session?.turnTimings?.size)&&!(session?.turnEnds?.size)&&session?.composerPhase!=='engaging'&&!session?.promptError&&rows.length===0&&tasks.length===0&&!researchPending
}

/** Refresh installed runtimes too: phase and native header use this predicate. */
export function patchHomeConversationRuntime(source){
 const start='/* ework:home-content-node:start */',end='/* ework:home-content-node:end */'
 const block=start+'\n'+isHomeConversationContentNode.toString()+'\n'+end
 const anchor='function hasVisibleConversationContent(chat) {'
 if(source.includes(start)){
  const a=source.indexOf(start),b=source.indexOf(end,a)
  if(b<a)throw Error('无法刷新首页管理命令判定。')
  source=source.slice(0,a)+block+source.slice(b+end.length)
 }else{
  if(source.split(anchor).length!==2)throw Error('无法定位原生会话可见内容判定。')
  source=source.replace(anchor,block+'\n'+anchor)
 }
 const before='return chat.order.some((key) => chat.nodes.get(key)?.kind !== "command");'
 const after='return chat.order.some((key) => isHomeConversationContentNode(chat.nodes.get(key)));'
 if(source.includes(before)){
  if(source.split(before).length!==2)throw Error('原生会话可见内容判定不唯一。')
  return source.replace(before,after)
 }
 if(!source.includes(after))throw Error('原生会话可见内容判定已变化。')
 return source
}

/** Reuse the native hero/composer; never change the durable blank bit or create another draft. */
export function patchNoteConversationVacancy(source){
 const marker='/* ework:notes-conversation-vacancy:v1 */'
 // The native no-session workspace has files/selection but no artifacts.
 const unsafe="researchWorkspaceSnapshot2.artifacts.some(node=>['queued','running'].includes(node.generationStatus))",safe="(researchWorkspaceSnapshot2.artifacts??[]).some(node=>['queued','running'].includes(node.generationStatus))"
 if(source.includes(marker))return source.replace(unsafe,safe)
 const start=source.indexOf('function ConversationRoot('),end=source.indexOf('//#region lib/types/client/skeleton/ConversationSession.js',start)
 if(start<0||end<0)throw Error('无法定位笔记会话欢迎布局。')
 let root=source.slice(start,end)
 const replace=(before,after)=>{if(root.split(before).length!==2)throw Error('无法定位笔记会话空内容判定：'+before.slice(0,70));root=root.replace(before,after)}
 replace('const settling =',`${marker}
 const notePresentationRows=useNotesConversationRows(sessionId,openState),{tasks:notePresentationTasks}=useCanvasTasks(sessionId);
 const noteResearchPending=['planning','stopping'].includes(odysseyCreationIntents.get(sessionId)?.state)||(researchWorkspaceSnapshot2.artifacts??[]).some(node=>['queued','running'].includes(node.generationStatus));
 const conversationVacant=(openState==='open'||summaryBlank===true&&openState!=='error')&&noteConversationVacant(session,notePresentationRows,notePresentationTasks,noteResearchPending)&&!(sherlockShared(sessionId)&&((sherlockBoardsAdapter?.getView(sessionId)?.history?.length??0)+(sherlockBoardsAdapter?.getView(sessionId)?.messages?.length??0))>0);
 const settling =`)
 replace('const hero = (activeView == null || activeView === "chat") && (sessionId === void 0 || composerPhase === "blank" && (openState === "open" || summaryBlank === true));','const hero = (activeView == null || activeView === "chat") && (sessionId === void 0 || conversationVacant && (openState === "open" || summaryBlank === true));')
 replace('const researchEmpty = research && sessionId !== void 0 && composerPhase === "blank" && (session?.blank === true || summaryBlank === true) && (session?.chat?.order?.length ?? 0) === 0;','const researchEmpty = research && sessionId !== void 0 && conversationVacant;')
 replace('onResearchPresentation: publishResearchPresentation','onResearchPresentation: publishResearchPresentation, conversationVacant')
 source=source.slice(0,start)+root+source.slice(end)
 const signature='releaseResearchWorkspace, onResearchPresentation })'
 if(source.split(signature).length!==2)throw Error('无法定位原生对话首页呈现属性。')
 source=source.replace(signature,'releaseResearchWorkspace, onResearchPresentation, conversationVacant })')
 const blank='if (blank && composerPhase === "blank" && active?.id === "chat") return null;'
 if(source.split(blank).length!==2)throw Error('无法定位原生空会话正文。')
 return source.replace(blank,'if ((conversationVacant ?? (blank && composerPhase === "blank")) && active?.id === "chat") return null;')
}
