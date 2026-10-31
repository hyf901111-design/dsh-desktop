import {noteUiText} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import {noteUiError as eworkNoteUiError} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import {capabilityReceiptText as eworkNoteCapabilityReceiptText,noteCapabilityReceiptMessage} from '../../packages/dsh-research-task-runtime/client-capabilities.js'
export function useNotesActivityLocale(){
 const [,render]=react.useReducer(value=>value+1,0)
 react.useEffect(()=>{if(typeof MutationObserver==='undefined')return;const observer=new MutationObserver(()=>render());observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])
}
export function noteActivityLocaleHelpers(){
 return `const [eworkNoteCapabilityReceiptText,eworkNoteUiError]=(()=>{${eworkNoteUiError.toString()}\n${noteCapabilityReceiptMessage.toString()}\n${eworkNoteCapabilityReceiptText.toString()}\nreturn [capabilityReceiptText,noteUiError];})();\n${useNotesActivityLocale.toString()}`
}
/** Actual direct-model note requests, separate from native agent/tool turns. */
export function createNotesActivityStore(doc) {
  const rows = new Map(), reveals=new Map(), listeners = new Set(), empty = []
  const notify = () => { for (const listener of listeners) listener() }
  // Keep internal model reasoning out of the presentation store, including replay.
  // Its durable owner and the real action receipts are unaffected.
  const displayRow = value => { const {reasoning, ...row} = value; return row }
  const update = event => {
    const next = event.detail && displayRow(event.detail)
    if (!next || typeof next.sessionId !== 'string' || typeof next.requestId !== 'string' ||
        !['preparing','generating','ready','replied','accepted','discarded','failed','stopped'].includes(next.phase)) return
    const history = rows.get(next.sessionId) || empty, old = history.find(row => row.requestId === next.requestId)
    if (!old && next.phase !== 'preparing') return
    if(!old)reveals.set(JSON.stringify([next.sessionId,next.requestId]),{fresh:true,live:true,initialized:false,text:''})
    const row = { ...old, ...next, prompt: old?.prompt ?? String(next.prompt || '').slice(0,20000), startedAt: old?.startedAt ?? Date.now() }
    if (!['preparing','generating'].includes(row.phase)) row.finishedAt = old?.finishedAt ?? Date.now()
    rows.set(next.sessionId, [...history.filter(value => value.requestId !== row.requestId), row].slice(-20))
    notify()
  }
  const background=()=>{if(doc?.visibilityState==='hidden')for(const record of reveals.values())record.skipNext=true}
  const visibility=()=>{if(doc?.visibilityState==='hidden')background()}
  doc?.defaultView?.addEventListener('blur',background)
  doc?.addEventListener('visibilitychange',visibility)
  const reset = () => { rows.clear();reveals.clear(); notify() }
  const history=event=>{const value=event.detail;if(typeof value?.sessionId!=='string'||!Array.isArray(value.rows))return;const merged=new Map((rows.get(value.sessionId)||[]).map(row=>[row.requestId,row]));for(const persisted of value.rows){const row=displayRow(persisted);const old=merged.get(row.requestId);merged.set(row.requestId,old&&(['preparing','generating'].includes(old.phase)&&['preparing','generating'].includes(row.phase)||old.finishedAt>row.finishedAt||['accepted','discarded'].includes(old.phase)&&row.phase==='ready')?{...row,...old}:{...old,...row})}rows.set(value.sessionId,[...merged.values()].sort((a,b)=>a.startedAt-b.startedAt));notify()}
  doc?.addEventListener('sherlock:notes-task-state', update)
  doc?.addEventListener('sherlock:notes-reset', reset)
  doc?.addEventListener('sherlock:notes-history',history)
  return { snapshot: id => rows.get(id) || empty,reveal:(sessionId,requestId)=>reveals.get(JSON.stringify([sessionId,requestId])), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    dispose: () => { doc?.defaultView?.removeEventListener('blur',background);doc?.removeEventListener('visibilitychange',visibility);doc?.removeEventListener('sherlock:notes-task-state', update); doc?.removeEventListener('sherlock:notes-reset', reset);doc?.removeEventListener('sherlock:notes-history',history); reset(); listeners.clear() } }
}

export function useNotesConversationRows(sessionId,openState){
  const rows = react.useSyncExternalStore(eworkNotesActivity.subscribe, () => eworkNotesActivity.snapshot(sessionId))
  react.useEffect(()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-history-request',{detail:{sessionId}}))},[sessionId,openState])
  return rows
}
export function EWorkNoteMessageReference({reference}){
 const file=reference.type==='attachment',artifact={kind:reference.type==='text'?'assistant-excerpt':'generated-container',title:reference.title}
 return react.createElement('span',{className:MessageItem_module_css_default.refChip,'data-ref-chip':file?'research-file':'research-artifact','data-note-message-reference':reference.blockId,title:reference.title,'data-ui-preserve':''},
  file?react.createElement(FileReferenceIcon,{name:reference.title}):react.createElement(ResearchArtifactReferenceIcon,{artifact}),
  react.createElement('span',{className:'gdEzaW_refChipLabel',children:reference.title}))
}
export function EWorkNoteConversationRow({row,sessionId,t,loadImage,openFile,forkAt,renderSlot,branchUnavailable=false,UserBubble=UserStyleBubble,Progress=ExecutionStatusGroup,Markdown=AssistantMarkdown,Actions=typeof MessageIconActions==='undefined'?null:MessageIconActions}) {
  useNotesActivityLocale()
  const h = react.createElement
  const reveal=typeof eworkNotesActivity==='undefined'?undefined:eworkNotesActivity.reveal(sessionId,row.requestId)
  // A pending row can leave the view before its first Markdown result exists.
  react.useEffect(()=>()=>{if(reveal)reveal.skipNext=true},[reveal])
  const labels = {preparing:noteUiText("正在思考"),generating:noteUiText("正在思考"),ready:noteUiText("内容已生成，请在笔记中预览"),replied:noteUiText("已回复"),accepted:noteUiText("已写入笔记"),discarded:noteUiText("已放弃建议"),failed:noteUiText("生成失败"),stopped:noteUiText("已停止")}
    const pending = ['preparing','generating'].includes(row.phase)
    const stage = {model:noteUiText("正在思考"),thinking:noteUiText("正在思考"),writing:noteUiText("正在撰写内容"),validating:noteUiText("正在检查生成内容")}[row.stage]
    const status=(row.phase==='generating'?stage:null)||labels[row.phase]
    const feedback={ready:noteUiText("已生成以下内容，可在文档预览中采纳。"),accepted:noteUiText("已将以下内容写入笔记。"),discarded:noteUiText("以下建议未被采纳。")}[row.phase]
    const conversation=row.result?.kind==='conversation'&&row.result.capabilityReceipts?.length?eworkNoteCapabilityReceiptText(row.result.capabilityReceipts,document.documentElement.dataset.odysseyLocale):row.result?.markdown
    const liveReceipts=Array.isArray(row.capabilityProgress)&&!row.result?.capabilityReceipts?.length?row.capabilityProgress:[]
    const finalReceipts=row.result?.kind!=='conversation'&&Array.isArray(row.result?.capabilityReceipts)?row.result.capabilityReceipts:[]
    const text=['text','conversation'].includes(row.result?.kind)?String(conversation||''):row.result?.kind==='component'?noteUiText("已生成组件：")+(row.result.node?.title||noteUiText("研究组件"))+'。':'',settled=!pending&&['ready','replied','accepted','discarded'].includes(row.phase)&&!!text.trim()
    // Read the durable final-event position after generation; the preparing seq is only for row ordering.
    react.useEffect(()=>{if(settled&&sessionId&&!Number.isSafeInteger(row.completedSeq))document.dispatchEvent(new CustomEvent('sherlock:notes-history-request',{detail:{sessionId}}))},[settled,sessionId,row.completedSeq])
    return h('article', {key:row.requestId, className:'en-task Md3f7G_flowItem', 'data-chat-flow-key':'note:'+row.requestId,'data-chat-anchor-key':'note:'+row.requestId, 'data-note-task':row.requestId, 'data-phase':row.phase},
      h(UserBubble,{content:row.content||[{type:'text',text:row.prompt || noteUiText("根据附件撰写内容")}],noteReferences:row.references,imageLoader:loadImage,openFile,t}),
      pending&&!liveReceipts.length?h('div',{className:'en-task-feedback','data-note-feedback':'',role:'status','aria-live':'polite'},h('p',null,noteUiText("已收到，正在处理这条笔记指令。"))):null,
      liveReceipts.length?h('div',{className:'en-task-feedback','data-note-client-progress':'',role:'status','aria-live':'polite'},h(Markdown,{blocks:[{kind:'text',text:eworkNoteCapabilityReceiptText(liveReceipts,document.documentElement.dataset.odysseyLocale)}],streaming:false,t})):null,
      h(Progress,{entry:{key:'note:'+row.requestId,running:pending,preserveProgress:true,noteTask:{status}},activityNodes:[],startTime:row.startedAt,endTime:pending?null:row.finishedAt,seatProps:{},t}),
      row.error ? h(Markdown,{blocks:[{kind:'text',text:eworkNoteUiError(row.error)}],streaming:false,t}) : null,
      finalReceipts.length?h('div',{'data-note-client-receipts':''},h(Markdown,{blocks:[{kind:'text',text:eworkNoteCapabilityReceiptText(finalReceipts,document.documentElement.dataset.odysseyLocale)}],streaming:false,t})):null,
      row.result?.kind==='conversation' ? h(Markdown,{blocks:[{kind:'text',text:conversation}],streaming:false,reveal,t}) : null,
      row.result?.kind==='text' ? h('div',{className:'en-task-result'},h(Markdown,{blocks:[{kind:'text',text:[feedback,row.result.markdown].filter(Boolean).join('\n\n')}],streaming:false,reveal,t})) : null,
      row.result?.kind==='component' ? h(Markdown,{blocks:[{kind:'text',text:(row.phase==='accepted'?noteUiText("已创建并写入笔记组件："):noteUiText("已生成组件："))+(row.result.node.title||noteUiText("研究组件"))+'。'}],streaming:false,reveal,t}) : null,
      settled&&Actions?h(Actions,{text,time:row.finishedAt,clock:'end',onBranch:forkAt?()=>forkAt(row.completedSeq):undefined,branchUnavailable:branchUnavailable||!Number.isSafeInteger(row.completedSeq),extraActions:renderSlot?.('conversation.chat.assistant-actions',{messageId:'ework-note:'+row.requestId,text}),className:'osXY9a_actions',t}):null)
}
export function EWorkNotesActivity(props){useNotesActivityLocale();const rows=useNotesConversationRows(props.sessionId);return react.createElement('div',{className:'en-task-history Md3f7G_column','aria-label':noteUiText('笔记任务过程')},rows.map(row=>react.createElement(EWorkNoteConversationRow,{...props,key:row.requestId,row})))}
export function EWorkNotesConversation({sessionId,empty,children,t}){
 useNotesActivityLocale()
 const rows=useNotesConversationRows(sessionId),{tasks}=useCanvasTasks(sessionId)
 const welcome=empty&&rows.length===0&&tasks.length===0
 // Keep the native ChatView mounted: it replays notes again when openState becomes open.
 return react.createElement(react.Fragment,null,
   welcome?react.createElement('div',{className:'sRp_emptyState','data-research-empty-state':'','data-note-empty-state':''},noteUiText('探索更远，洞见更深')):null,
   react.createElement('div',{style:{display:welcome?'none':'contents'}},children||react.createElement(EWorkNotesActivity,{sessionId,t})))
}
export function mergeNoteConversationFlow(flow,nodeStore,rows){
 if(!rows.length)return flow
 const pending=rows.map((row,index)=>({row,index,seq:Number.isSafeInteger(row.seq)?row.seq:Infinity})).sort((a,b)=>a.seq-b.seq||a.index-b.index),entries=[]
 let previous=-1,index=0
 const push=()=>{const {row}=pending[index++];entries.push({kind:'note-conversation',key:'note:'+row.requestId,row})}
 // Native flow already owns turn/steering boundaries. A preparation group's
 // first event may precede its human even though the group renders after it.
 // Insert note rows without sorting those native entries back out of order.
 for(const entry of flow){
  const node=nodeStore.get(entry.kind==='node'?entry.key:entry.nodeKeys?.[0])
  previous=Math.max(previous,node?.anchorSeq??previous)
  while(index<pending.length&&pending[index].seq<previous)push()
  entries.push(entry)
 }
 while(index<pending.length)push()
 return entries
}

export function patchNotesActivity(source) {
  const marker='/* ework:notes-activity:v1 */',anchor='function ConversationRoot('
  const helpers=`${marker}\n${noteActivityLocaleHelpers()}\n${createNotesActivityStore.toString()}\nconst eworkNotesActivity=createNotesActivityStore(typeof document==='undefined'?undefined:document);\n${noteActionClientHelpers()}\n${[isHomeConversationContentNode,noteConversationVacant,useNotesConversationRows,EWorkNoteMessageReference,EWorkNoteConversationRow,EWorkNotesActivity,EWorkNotesConversation,mergeNoteConversationFlow].map(fn=>fn.toString()).join('\n')}\n${noteFileClientHelpers()}\n${noteComponentClientHelpers()}`
  if(source.includes(marker))source=source.slice(0,source.indexOf(marker))+helpers+source.slice(source.indexOf(anchor,source.indexOf(marker)))
  else {
    if (source.split(anchor).length !== 2) throw Error('笔记无法定位任务过程面板。')
    source=source.replace(anchor,helpers+anchor)
  }
  // Keep the signature used by the other native-bubble patches unchanged.
  if(!source.includes('/* ework:note-reference-bubble:v1 */')){
    const inline='const inlineResearch = text.includes(',children='children: [projectResearchUserText(research, openFile), rest.map('
    if(source.split(inline).length!==2||source.split(children).length!==2)throw Error('无法定位笔记引用气泡。')
    source=source.replace(inline,'/* ework:note-reference-bubble:v1 */ const noteReferences=arguments[0].noteReferences;\nconst inlineResearch = !!noteReferences?.length || text.includes(')
    source=source.replace(children,"children: [noteReferences?.map(reference=>react.createElement(EWorkNoteMessageReference,{key:reference.blockId,reference})),projectResearchUserText(research, openFile), rest.map(")
  }
  const visible='const showBubble = research.text !== ""',withReferences='const showBubble = (noteReferences?.length ?? 0) > 0 || research.text !== ""'
  if(!source.includes(withReferences)){
    if(source.split(visible).length!==2)throw Error('无法定位笔记引用气泡可见状态。')
    source=source.replace(visible,withReferences)
  }
  source=source.replace('(EWorkNotesActivity,{sessionId})]','(EWorkNotesActivity,{sessionId,t})]')
  const old="activeView === 'notes' ? (0,react_jsx_runtime.jsx)(EWorkNotesActivity,{sessionId}) : "
  source=source.replace(old,'')
  const portal='(0, react_dom.createPortal)(sherlockShared(sessionId) ? researchConversationView'
  const oldNotes="activeView === 'notes' ? (0,react_jsx_runtime.jsxs)('div',{className:'en-note-conversation-flow',children:[sessionPresentation.conversationView,(0,react_jsx_runtime.jsx)(EWorkNotesActivity,{sessionId,t})]}) : "
  source=source.replace(oldNotes,'')
  const previous="(0, react_dom.createPortal)(activeView === 'notes' ? sessionPresentation.conversationView || (0,react_jsx_runtime.jsx)(EWorkNotesActivity,{sessionId,t}) : sherlockShared(sessionId) ? researchConversationView"
  const current="(0, react_dom.createPortal)(activeView === 'notes' ? (0,react_jsx_runtime.jsx)(EWorkNotesConversation,{sessionId,t,empty:(session?.chat?.order?.length ?? 0) === 0,children:sessionPresentation.conversationView}) : sherlockShared(sessionId) ? researchConversationView"
  const next="(0, react_dom.createPortal)(activeView === 'notes' ? (0,react_jsx_runtime.jsx)(EWorkNotesConversation,{sessionId,t,empty:conversationVacant,children:sessionPresentation.conversationView}) : sherlockShared(sessionId) ? researchConversationView"
  source=source.replace(current,next)
  source=source.replace(previous,next)
  if(!source.includes('/* ework:notes-common-conversation:v1 */')){
    const flow='const renderFlow=react.useMemo(()=>mergeCanvasTaskFlow(nativeRenderFlow,nodeStore,canvasTasks),[nativeRenderFlow,nodeStore,canvasTasks]);'
    if(source.split(flow).length!==2)throw Error('无法定位共用会话记录。')
    source=source.replace(flow,`/* ework:notes-common-conversation:v1 */ const canvasRenderFlow=react.useMemo(()=>mergeCanvasTaskFlow(nativeRenderFlow,nodeStore,canvasTasks),[nativeRenderFlow,nodeStore,canvasTasks]);const noteRows=useNotesConversationRows(sessionId);const renderFlow=react.useMemo(()=>mergeNoteConversationFlow(canvasRenderFlow,nodeStore,noteRows),[canvasRenderFlow,nodeStore,noteRows]);`)
    // Workbench installs its receipt wrapper before Notes on a clean install.
    // Insert inside the owned entry renderer so its outer receipt ordering stays intact.
    const renders=['renderFlow.map((entry) => {','renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{']
    const matches=renders.flatMap(render=>Array.from({length:source.split(render).length-1},()=>render))
    if(matches.length!==1)throw Error('无法定位共用会话气泡。')
    const [render]=matches
    source=source.replace(render,render+"if(entry.kind==='note-conversation')return react.createElement(EWorkNoteConversationRow,{key:entry.key,row:entry.row,t,loadImage});")
  }
  if(!source.includes('/* ework:notes-native-progress:v1 */')) {
    const status='const status = entry.canvasTask ?'
    if(source.split(status).length!==2)throw Error('笔记无法定位原生执行进度。')
    source=source.replace(status,'/* ework:notes-native-progress:v1 */ const status = entry.noteTask ? entry.noteTask.status : entry.canvasTask ?')
  }
  // Migrate the previous Notes-only disclosure as well as a fresh SDK. Native
  // chat/tool and canvas details keep their original behavior and content.
  const concise='/* ework:notes-concise-progress:v1 */'
  if(!source.includes(concise)) {
    const original='const expandable = !!entry.canvasTask || detailGroups.length > 0;'
    const previous='/* ework:notes-shared-reasoning:v1 */ const expandable = !!entry.noteTask?.reasoning || !!entry.canvasTask || detailGroups.length > 0;'
    const rawDetails="open && entry.noteTask?.reasoning && react.createElement('div',{className:ChatView_module_css_default.executionDetails},react.createElement(AssistantMarkdown,{blocks:[{kind:'text',text:entry.noteTask.reasoning}],streaming:false,interrupted:false,t})), "
    const anchor=source.includes(previous)?previous:original
    if(source.split(anchor).length!==2)throw Error('笔记无法定位简洁执行进度。')
    if(anchor===previous&&source.split(rawDetails).length!==2)throw Error('笔记无法移除旧思考过程。')
    source=source.replace(anchor,concise+' const expandable = entry.noteTask ? false : !!entry.canvasTask || detailGroups.length > 0;')
    if(anchor===previous)source=source.replace(rawDetails,'')
  }
  source=source.replace('const noteRows=useNotesConversationRows(sessionId);','/* ework:notes-history-ready:v1 */ const noteRows=useNotesConversationRows(sessionId,openState);')
  if(!source.includes('/* ework:notes-follow-stream:v1 */')){
    const signature='const followSig = `${openState}:${firstSeq}:${lastKey}:${order.length}:${running ? 1 : 0}:${lastSteeringId ?? ""}`;'
    if(source.split(signature).length!==2)throw Error('无法定位笔记会话滚动跟随。')
    source=source.replace(signature,'/* ework:notes-follow-stream:v1 */ '+signature.slice(0,-2)+':${noteRows.map(row=>[row.requestId,row.phase,row.stage,row.outputChars].join(\",\")).join(\";\")}`;')
  }
  source=source.replace('row.outputChars,row.reasoning?.length','row.outputChars')
  source=patchNoteReplyActionRow(patchNoteAssistantDestination(source))
  if(source.includes(next))return patchNoteConversationVacancy(patchNotesComponents(patchNotesFiles(source)))
  if (source.split(portal).length !== 2) throw Error('笔记无法定位原生对话过程区域。')
  return patchNoteConversationVacancy(patchNotesComponents(patchNotesFiles(source.replace(portal,next))))
}
import { noteFileClientHelpers, patchNotesFiles } from './notes-files.mjs'
import { noteComponentClientHelpers, patchNotesComponents } from './notes-components.mjs'
import {isHomeConversationContentNode,noteConversationVacant,patchNoteConversationVacancy} from './notes-conversation-vacancy.mjs'
import {noteActionClientHelpers,patchNoteAssistantDestination,patchNoteReplyActionRow} from './notes-reply-actions.mjs'
