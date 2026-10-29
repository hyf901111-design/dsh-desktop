import {serializeWorkbenchRestore,parseWorkbenchRestore} from './workbench-restore-codec.mjs'
/** Completed note replies use the same durable feedback and branch services as chat. */
export function noteReplyText(row) {
 const result=row?.result
 if(['text','conversation'].includes(result?.kind))return typeof result.markdown==='string'?result.markdown:''
 if(result?.kind==='component')return '已生成组件：'+(result.node?.title||'研究组件')+'。'
 return ''
}
export function noteFeedbackTarget(events,messageId) {
 if(typeof messageId!=='string'||!messageId.startsWith('ework-note:'))return false
 const id=messageId.slice(11)
 return events.some(event=>event.type==='workspace-note/conversation'&&event.data?.requestId===id&&['ready','replied'].includes(event.data.phase)&&!!noteReplyText(event.data).trim())
}
export function noteForkBoundary(events,atSeq) {
 if(!Number.isSafeInteger(atSeq)||atSeq<0)return undefined
 const event=events.find(event=>event.seq===atSeq)
 if(event?.type!=='workspace-note/conversation'||!['ready','replied'].includes(event.data?.phase)||!noteReplyText(event.data).trim())return undefined
 const lastTurn=events.slice(0,events.indexOf(event)+1).findLast(event=>['turn/start','turn/end'].includes(event.type))
 return lastTurn?.type==='turn/start'?undefined:event
}
export function createNoteActionDestinationStore(doc) {
 let sessionId=null
 const listeners=new Set(),set=value=>{if(value===sessionId)return;sessionId=value;for(const listener of listeners)listener()}
 const open=event=>{if(typeof event.detail?.sessionId==='string')set(event.detail.sessionId)}
 const close=event=>{if(event.detail?.sessionId===sessionId)set(null)}
 const reset=()=>set(null)
 const surface=event=>{if(event.detail?.surface==='notes'&&event.detail?.active)set(doc?.querySelector?.('[data-ework-notes-session]')?.dataset.eworkNotesSession||null);else set(null)}
 doc?.addEventListener('sherlock:notes-open',open);doc?.addEventListener('sherlock:notes-close',close);doc?.addEventListener('sherlock:notes-reset',reset)
 doc?.addEventListener('sherlock:workspace-surface-change',surface)
 return {snapshot:()=>sessionId,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},dispose:()=>{doc?.removeEventListener('sherlock:notes-open',open);doc?.removeEventListener('sherlock:notes-close',close);doc?.removeEventListener('sherlock:notes-reset',reset);doc?.removeEventListener('sherlock:workspace-surface-change',surface);listeners.clear();sessionId=null}}
}
export function noteActionClientHelpers() {
 return [noteReplyText,createNoteActionDestinationStore].map(fn=>fn.toString()).join('\n')+"\nconst eworkNoteActionDestination=createNoteActionDestinationStore(typeof document==='undefined'?undefined:document);\n"
}
export function noteAssistantDestinationFunction(old) {
 const marker='/* ework:note-assistant-destination:v1 */'
 if(old.includes(marker))return old
 let next=old.replace('const active = (0, react.useSyncExternalStore)',`${marker}\nconst noteSession=(0,react.useSyncExternalStore)(eworkNoteActionDestination.subscribe,eworkNoteActionDestination.snapshot,eworkNoteActionDestination.snapshot);\nconst notes=noteSession===sessionId;\nconst [failure,setFailure]=react.useState('');\nconst active = (0, react.useSyncExternalStore)`)
 next=next.replace('{ messageId, text, workspace }','{ messageId, text, workspace, sessionId }').replace('if (!active) return null;','if (!active&&!notes) return null;')
 next=old.includes('workbenchText("添加到画布")')?next.replaceAll('workbenchText("添加到画布")','workbenchText(notes?"添加到笔记":"添加到画布")'):next.replaceAll('"添加到画布"','(notes?"添加到笔记":"添加到画布")')
 next=next.replace('onClick: () => workspace.addAssistantResult({ messageId, text, at: workspace.visibleCenter() }),',`onClick: () => {if(!notes){workspace.addAssistantResult({messageId,text,at:workspace.visibleCenter()});return}let response;const actionId=crypto.randomUUID(),ack=event=>{if(event.detail?.actionId===actionId&&event.detail?.sessionId===sessionId)response=event.detail};document.addEventListener('sherlock:notes-add-reply-ack',ack);try{document.dispatchEvent(new CustomEvent('sherlock:notes-add-reply',{detail:{sessionId,messageId,text,actionId}}))}finally{document.removeEventListener('sherlock:notes-add-reply-ack',ack)}setFailure(response?.ok?'':response?.message||'笔记暂不可编辑，请重新打开后重试。');},`)
 next=next.replace('return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {',"return react.createElement(react.Fragment,null,failure&&react.createElement('span',{role:'status'},failure),(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {").replace(/\}\);\s*\}\s*$/, ' }));\n}\n')
 if(next===old||!next.includes(marker)||next.includes('onClick: () => workspace.addAssistantResult'))throw Error('助手回复添加按钮适配不完整。')
 return next
}
export function patchNoteAssistantDestination(source) {
 const start=source.indexOf('function ResearchAssistantCanvasAction('),end=source.indexOf('function registerResearchAssistantActions(',start)
 if(start<0||end<start)throw Error('无法定位助手回复添加按钮。')
 const old=source.slice(start,end),next=noteAssistantDestinationFunction(old)
 if(next===old)return source
 source=source.slice(0,start)+next+source.slice(end)
 const restoreTag='/* EWORK_GRID_RESTORE ',restoreStart=source.indexOf(restoreTag)
 if(restoreStart>=0){
  const restoreEnd=source.lastIndexOf(' */'),changes=parseWorkbenchRestore(source.slice(restoreStart+restoreTag.length,restoreEnd))
  const entries=changes.filter(([,replacement])=>replacement===old.trimEnd())
  if(entries.length!==1)throw Error('无法同步助手回复的工作台恢复记录。')
  entries[0][0]=noteAssistantDestinationFunction(entries[0][0]).trimEnd();entries[0][1]=next.trimEnd()
  source=source.slice(0,restoreStart+restoreTag.length)+serializeWorkbenchRestore(changes)+source.slice(restoreEnd)
 }
 const inject='inject: (sessionId) => ({ workspace: researchWorkspaces.for(sessionId) })'
 if(source.split(inject).length!==2)throw Error('无法定位助手回复会话来源。')
 return source.replace(inject,'inject: (sessionId) => ({ workspace: researchWorkspaces.for(sessionId),sessionId })')
}
export function patchNoteFeedbackHost(source) {
 const marker='/* ework:note-feedback-target:v1 */'
 if(source.includes(marker))return source
 const anchor='hasFeedbackTarget(inspection, messageId) {'
 if(source.split(anchor).length!==2)throw Error('无法定位消息反馈目标。')
 return [marker,noteReplyText.toString(),noteFeedbackTarget.toString()].join('\n')+'\n'+source.replace(anchor,anchor+'\nif(noteFeedbackTarget(inspection.events,messageId))return true;')
}
export function patchNoteReplyActionRow(source) {
 const marker='/* ework:note-reply-actions:v1 */'
 if(source.includes(marker))return source
 const render="if(entry.kind==='note-conversation')return react.createElement(EWorkNoteConversationRow,{key:entry.key,row:entry.row,t,loadImage});"
 if(source.split(render).length!==2)throw Error('无法定位笔记回复功能栏。')
 // The existing turn-tail seat owns assistant-actions. Reuse its slot authorization rather than redeclaring the child slot.
 source=source.replace(render,marker+"if(entry.kind==='note-conversation')return react.createElement(react.Fragment,{key:entry.key},renderSlot('conversation.chat.node',{node:{kind:'note-conversation',data:entry.row},sessionId,openFile,loadImage,forkAt,branchUnavailable:running||noteRows.some(row=>['preparing','generating'].includes(row.phase))},{entryKey:'turn-tail',hookContext:entry.key}));")
 const seat='function TurnTailNodeView({ node, openFile, forkAt, renderSlot, renderSlotChain, t, useSession }) {'
 if(source.split(seat).length!==2)throw Error('无法定位共用回复功能栏。')
 return source.replace(seat,"function TurnTailNodeView({ node, sessionId, openFile, loadImage, forkAt, renderSlot, renderSlotChain, t, useSession, branchUnavailable }) {\nif(node.kind==='note-conversation')return react.createElement(EWorkNoteConversationRow,{row:node.data,sessionId,openFile,loadImage,forkAt,renderSlot,t,branchUnavailable});")
}
export function patchNoteForkHost(source) {
 const marker='/* ework:note-fork-boundary:v1 */'
 if(source.includes(marker))return source
 const anchor='const boundary = (atSeq === void 0 ? void 0 : events.find((e) => e.type === "turn/end" && e.seq >= atSeq))'
 if(source.split(anchor).length!==2)throw Error('无法定位笔记分支会话边界。')
 source=source.replace(anchor,'const noteBoundary=noteForkBoundary(events,atSeq);\nconst boundary = noteBoundary ?? (atSeq === void 0 ? void 0 : events.find((e) => e.type === "turn/end" && e.seq >= atSeq))')
 source=source.replace('while (cut < events.length && events[cut]?.type !== "turn/start") cut++;','if(!noteBoundary)while (cut < events.length && events[cut]?.type !== "turn/start") cut++;')
 return [marker,noteReplyText.toString(),noteForkBoundary.toString()].join('\n')+'\n'+source
}
