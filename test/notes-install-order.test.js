import {expect,it} from 'vitest'
import React from 'react'
import {mergeNoteConversationFlow,patchNotesActivity} from '../scripts/lib/notes-activity.mjs'

// Notes' first pass runs after the workbench has wrapped each native entry so
// that a progress receipt follows its answer. Keep that real wrapper boundary.
function beforeNotes(loop){
 return `
/* ework:note-reference-bubble:v1 */
const showBubble = (noteReferences?.length ?? 0) > 0 || research.text !== "";
/* ework:notes-native-progress:v1 */
/* ework:notes-concise-progress:v1 */
/* ework:notes-follow-stream:v1 */
/* ework:note-reply-actions:v1 */
/* ework:notes-native-files:v1 */
/* ework:notes-native-components:v1 */
/* ework:notes-conversation-vacancy:v1 */
function ResearchAssistantCanvasAction(){ /* ework:note-assistant-destination:v1 */ }
function registerResearchAssistantActions(){}
function ChatView(){
 const renderFlow=react.useMemo(()=>mergeCanvasTaskFlow(nativeRenderFlow,nodeStore,canvasTasks),[nativeRenderFlow,nodeStore,canvasTasks]);
 return ${loop};
}
/* end-chat */
function ConversationRoot(){
 (0, react_dom.createPortal)(activeView === 'notes' ? (0,react_jsx_runtime.jsx)(EWorkNotesConversation,{sessionId,t,empty:conversationVacant,children:sessionPresentation.conversationView}) : sherlockShared(sessionId) ? researchConversationView : null);
}`
}
const nativeLoop='renderFlow.map((entry) => {return entry.key})'
const workbenchLoop=`renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{return entry.key};const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,{kind:'receipt',for:entry.key}] : [renderedWorkbenchEntry];})`
function renderPatched(source){
 const start=source.indexOf('function ChatView()'),end=source.indexOf('/* end-chat */',start)
 const rows=[{requestId:'note-1',seq:2}],flow=[{kind:'node',key:'answer'}]
 function NoteRow(){}
 const render=new Function('react','mergeCanvasTaskFlow','mergeNoteConversationFlow','nativeRenderFlow','nodeStore','canvasTasks','useNotesConversationRows','sessionId','openState','workbenchReceiptAnchors','EWorkNoteConversationRow','t','loadImage',`return (${source.slice(start,end)});`)(
  {...React,useMemo:fn=>fn()},()=>flow,mergeNoteConversationFlow,flow,new Map([['answer',{anchorSeq:1}]]),[],()=>rows,'session-1','open',new Map([['answer',['plan-1']]]),NoteRow,key=>key,()=>{})
 return {entries:render(),NoteRow}
}

it.each([
 ['native map',nativeLoop,false],
 ['workbench flatMap',workbenchLoop,true]
])('installs Notes once into %s while preserving the native answer and its receipt',(_name,loop,receipt)=>{
 const installed=patchNotesActivity(beforeNotes(loop))
 const {entries,NoteRow}=renderPatched(installed)
 expect(entries[0]).toBe('answer')
 expect(entries).toHaveLength(receipt?3:2)
 if(receipt)expect(entries[1]).toEqual({kind:'receipt',for:'answer'})
 const note=entries.at(-1)
 expect(note.type).toBe(NoteRow)
 expect(note.props.row.requestId).toBe('note-1')
 expect(patchNotesActivity(installed)).toBe(installed)
})

it('rejects two possible entry renderers instead of injecting into an arbitrary loop',()=>{
 expect(()=>patchNotesActivity(beforeNotes(`${nativeLoop};${workbenchLoop}`))).toThrow('无法定位共用会话气泡')
})
