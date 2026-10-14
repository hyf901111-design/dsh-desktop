/** Retaining an edited note is persistence activity, not a visible conversation. */
export function noteConversationVacant(session,rows=[],tasks=[],researchPending=false){
 const chat=session?.chat,visible=(chat?.order||[]).some(key=>chat.nodes?.get?.(key)?.kind!=='command')
 return !visible&&!session?.running&&!(session?.pending?.length)&&!(session?.queue?.length)&&!(session?.runningCalls?.length)&&!session?.partial&&!(session?.turnTimings?.size)&&!(session?.turnEnds?.size)&&session?.composerPhase!=='engaging'&&!session?.promptError&&rows.length===0&&tasks.length===0&&!researchPending
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
