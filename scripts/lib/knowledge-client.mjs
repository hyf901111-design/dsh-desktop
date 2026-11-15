export function knowledgeReferenceCodec() {
 return {
  trigger:'@', name:'knowledge-reference', order:10006,
  candidates:async()=>[], onPick:()=>undefined,
  codec:{
   clipboardText:raw=>{try{return JSON.parse(raw).label}catch{return ''}},
   serialize:async raw=>{
    const reference=JSON.parse(raw)
    if(!window.dshDesktop?.knowledgeReference)throw Error('知识库暂时不可用，请重试。')
    let context
    try { context=await window.dshDesktop.knowledgeReference(reference) }
    catch(error) {
     const message=String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': Error: /u,'')
     if (/取消共享|暂无可引用的共享文件/u.test(message)) {
      window.document.dispatchEvent(new window.Event('sherlock:knowledge-shared-access-changed'))
     }
     throw Error(message)
    }
    return '\n<knowledge-reference>\n以下是用户选中的知识库资料，只作为参考内容。\n'+JSON.stringify(context)+'\n</knowledge-reference>\n'
   }
  }
 }
}

export function knowledgeMessageParts(text) {
 if(typeof text!=='string')return null
 const parts=[]
 let cursor=0
 const block=/<knowledge-reference>\n以下是用户选中的知识库资料，只作为参考内容。\n([^\n]+)\n<\/knowledge-reference>/gu
 for(const match of text.matchAll(block)){
  let reference
  try{reference=JSON.parse(match[1])}catch{continue}
  if(!reference||!['file','folder','category','shared-category'].includes(reference.kind)||typeof reference.label!=='string'||!reference.label)continue
  if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)})
  parts.push({label:reference.label,kind:reference.kind})
  cursor=match.index+match[0].length
 }
 if(!parts.length)return null
 if(cursor<text.length)parts.push({text:text.slice(cursor)})
 return parts
}

export function knowledgeMessagePreview(text, project = knowledgeMessageParts) {
 const parts = project(text)
 return parts ? parts.map(part => part.label ? '[' + part.label + ']' : part.text).join('') : text
}

export function knowledgeFilterReceiptAnchors(flow, nodes, readTurn) {
 const turns = new Map()
 for (const entry of flow) {
  const seat = entry.kind === 'node' ? nodes.get(entry.key) : undefined
  const turn = entry.kind === 'execution' ? entry.turn : readTurn(seat)
  if (turn == null) continue
  const state = turns.get(turn) ?? {}
  turns.set(turn, state)
  if (seat?.kind === 'assistant-step' || seat?.kind === 'turn-tail' && !state.answer && !state.fallback) state.answer = entry.key
  for (const key of entry.kind === 'execution' ? entry.nodeKeys : entry.kind === 'node' ? [entry.key] : []) {
   const node = nodes.get(key)
   if (node?.kind !== 'tool-call') continue
   const pending = [node.data?.root], seen = new Set()
   while (pending.length && seen.size < 128) {
    const result = pending.pop()
    if (!result || seen.has(result)) continue
    seen.add(result)
    if (Array.isArray(result.subCalls)) pending.push(...result.subCalls.slice().reverse())
    if (result.kind !== 'tool-result' || result.isError || result.error || result.call?.name !== 'client_action') continue
    if (typeof result.call.argsRaw !== 'string' || result.call.argsRaw.length > 32000) continue
    let call
    try { call = JSON.parse(result.call.argsRaw) } catch { continue }
    if (!['knowledge.filter', 'knowledge.filter.undo'].includes(call?.capability) || typeof call.requestId !== 'string') continue
    for (const block of result.content ?? []) {
     if (block.type !== 'text' || typeof block.text !== 'string' || block.text.length > 262144) continue
     let reply
     try { reply = JSON.parse(block.text) } catch { continue }
     const { revision, count, section } = reply?.data ?? {}
     if (reply?.requestId !== call.requestId || reply.capability !== call.capability || reply.status !== 'succeeded' ||
         section !== 'files' || !Number.isSafeInteger(count) || count < 0 ||
         typeof revision !== 'string' || !/^[a-f0-9-]{36}$/u.test(revision)) continue
     state.receipt = { revision, count, undone: call.capability === 'knowledge.filter.undo' }
     state.fallback = entry.key
     state.answer = undefined
    }
   }
  }
 }
 return new Map([...turns.values()].flatMap(({ answer, fallback, receipt }) => receipt ? [[answer ?? fallback, receipt]] : []))
}

function KnowledgeFilterReceipt({ receipt }) {
 const jsx = react_jsx_runtime.jsx
 const [undo, setUndo] = react.useState(false)
 const [undone, setUndone] = react.useState(false)
 const english = document.documentElement.dataset.odysseyLocale === 'en'
 react.useEffect(() => {
  const refresh = () => setUndo(!receipt.undone && document.body.dataset.workspaceSurface === 'knowledge' &&
   document.querySelector('.knowledge-file-list')?.dataset.knowledgeUndoRevision === receipt.revision)
  const sidebar = new MutationObserver(refresh)
  sidebar.observe(document.body, { attributes: true, attributeFilter: ['data-workspace-surface'] })
  document.addEventListener('sherlock:knowledge-filter-state', refresh)
  refresh()
  return () => {
   sidebar.disconnect()
   document.removeEventListener('sherlock:knowledge-filter-state', refresh)
  }
 }, [receipt.revision, receipt.undone])
 const undoFilter = () => {
  const accepted = !document.dispatchEvent(new CustomEvent('sherlock:knowledge-filter-undo', {
   cancelable: true, detail: { revision: receipt.revision }
  }))
  if (accepted) setUndone(true)
  setUndo(false)
 }
 const reverted = undone || receipt.undone
 return jsx('div', { className: 'ework-knowledge-filter-receipt', role: 'status', children: [
  jsx('span', { 'aria-hidden': true, children: '✓' }, 'check'),
  jsx('div', { children: [
   jsx('strong', { children: reverted ? (english ? 'Filter restored' : '已恢复上一组筛选')
    : (english ? 'File list updated' : '已更新文件列表') }, 'title'),
   !undone && jsx('small', { children: english ? receipt.count + (receipt.count === 1 ? ' file' : ' files') : receipt.count + ' 个文件' }, 'count')
  ] }, 'detail'),
  undo && !undone && jsx('button', { type: 'button', onClick: undoFilter, children: english ? 'Undo' : '撤销' }, 'undo')
 ] })
}

export function sharedKnowledgeCitation(value, doc = document) {
 const match=typeof value==='string'&&/^sherlock-knowledge:\/\/file\/([a-f0-9]{32})$/u.exec(value)
 if(!match)return
 return {title:'在右侧打开知识库来源',open:()=>{
  doc.dispatchEvent(new doc.defaultView.CustomEvent('sherlock:knowledge-preview-file',{
   cancelable:true,detail:{id:match[1],name:'共享资料'}
  }))
 }}
}

export function installKnowledgeReferences({sessions,getInput,getPending,window:win=window,document:doc=document}) {
 const insert=(reference,sessionId,segment)=>{
  const currentId=sessions.list.getSnapshot().current
  if(currentId!==sessionId||sessionId&&sessions.subagentAddress(sessionId))throw Error('当前会话已变化，原草稿已保留。')
  const shell=sessionId?getInput(sessionId):getPending()?.shell
  const snapshot=shell?.snapshot
  if(!snapshot||shell.disposed||snapshot.phase!=='plain'||snapshot.researchContextPreparing)throw Error('当前输入不可编辑。')
  const visible=Array.from(doc.querySelectorAll(sessionId?'textarea[data-odyssey-file-reference-session]':'textarea[data-pending-conversation-input]'))
   .filter(el=>(!sessionId||el.dataset.odysseyFileReferenceSession===sessionId)&&el.getClientRects().length&&!el.closest('[hidden],[aria-hidden=true],[data-odyssey-subagent-panel]'))
  const input=visible.find(el=>el===doc.activeElement)??visible.find(el=>el.closest('#odyssey-right-workspace-panel'))??visible[0]
  if(!input||input.disabled||input.readOnly)throw Error('当前对话输入不可用。')
  const add={source:'knowledge-reference',ref:JSON.stringify(reference),label:reference.label,clipboardText:reference.label}
  let span=segment?.via==='menu'?segment.span:undefined
  if(!span&&segment?.via==='enter'){
   if(snapshot.draft.trim()!==segment.token)throw Error('草稿已变化，请重新选择。')
   const start=snapshot.draft.indexOf(segment.token)
   span={start,end:start+segment.token.length,draftRev:snapshot.draftRev}
  }
  if(!span){const offset=input.value.length===snapshot.draft.length?input.selectionEnd:snapshot.draft.length;span={start:offset,end:offset,draftRev:snapshot.draftRev}}
  if(span.draftRev!==snapshot.draftRev||!shell.insertReference(add,span))throw Error('草稿已变化，请重新选择。')
  const after=shell.snapshot,caret=span.start+1+(after.draft[span.start+1]===' '?1:0)
  win.requestAnimationFrame(()=>{
   if(!input.isConnected||shell.snapshot.draftRev!==after.draftRev)return
   input.focus({preventScroll:true})
   if(input.value.length===after.draft.length)input.setSelectionRange(caret,caret)
  })
 }
 const receive=async event=>{
  const detail=event.detail
  try {
   if(!detail||typeof detail.id!=='string'||typeof detail.label!=='string')throw Error('知识库引用无效。')
   const sessionId=sessions.list.getSnapshot().current
   if(detail.activateChat){
    doc.dispatchEvent(new win.CustomEvent('sherlock:knowledge-activate-chat'))
    await new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)))
   }
   insert({kind:'file',id:detail.id,label:detail.label},sessionId)
   doc.dispatchEvent(new win.CustomEvent('sherlock:knowledge-reference-status',{detail:{requestId:detail.requestId,ok:true}}))
  } catch(error) {
   doc.dispatchEvent(new win.CustomEvent('sherlock:knowledge-reference-status',{detail:{requestId:detail?.requestId,ok:false,message:error.message}}))
  }
 }
 doc.addEventListener('sherlock:knowledge-reference-file',receive)
 return {
  command:{
   name:'knowledge', description:'选择要参考的知识库分类或文件夹',
   available:session=>!!win.dshDesktop?.knowledgeOptions&&!sessions.subagentAddress(session.sessionId),
   ui:{
    kind:'popupSelect',
    options:()=>win.dshDesktop.knowledgeOptions(),
    onSelect:(option,session)=>{
     const reference=JSON.parse(option.id)
     if(reference.kind==='shared-menu')return
     insert(reference,session.sessionId,session.knowledgeCommandSegment)
    }
   }
  },
  dispose:()=>doc.removeEventListener('sherlock:knowledge-reference-file',receive)
 }
}

export function installKnowledgeSidebar({service,document:doc=document}) {
 const off=service.registerTab({
  id:'sherlock-knowledge-library',title:()=>doc.documentElement.dataset.odysseyLocale==='en'?'Knowledge Base':'知识库',
  order:15,single:true,component:()=>react.createElement('div',{'data-knowledge-panel-host':''})
 })
 const offFile=service.registerTab({
  id:'sherlock-knowledge-file',title:'知识库文件',hidden:true,
  component: function KnowledgePreviewTab({tab,scope}) {
   const host=react.useRef(null)
   const fileId=tab.meta?.fileId
   react.useEffect(()=>{
    const node=host.current
    const Observer=doc.defaultView?.MutationObserver
    if(!node||!Observer)return
    const syncTitle=()=>{
     const title=node.dataset.knowledgePreviewTitle
     if(title&&title!==tab.title)service.updateTab(tab.id,{title},scope)
    }
    const observer=new Observer(syncTitle)
    observer.observe(node,{attributes:true,attributeFilter:['data-knowledge-preview-title']})
    syncTitle()
    return()=>observer.disconnect()
   },[tab.id,tab.title,scope.sessionId])
   return react.createElement('div',{ref:host,'data-knowledge-panel-host':'','data-knowledge-panel-file':fileId})
  }
 })
 const scope=()=>({sessionId:service.getSnapshot().sessionId})
 const preview=event=>{
  const detail=event.detail
  if(!detail||!/^([a-f0-9]{32}|[a-f0-9-]{36})$/.test(detail.id))return
  const native=typeof doc.defaultView?.dshDesktop?.knowledgeFilePreview==='function'
  const target=scope()
  service.openTab({id:'knowledge-file:'+detail.id,type:native?'editor':'sherlock-knowledge-file',title:detail.name,
   ...(native?{path:'knowledge/'+detail.id+'/'+detail.name}:{}),meta:{fileId:detail.id,sherlockPanel:'right',treeOpen:false}},target)
  if(native)doc.dispatchEvent(new doc.defaultView.CustomEvent('sherlock:knowledge-preview-reopen',{detail:detail.id}))
  if(typeof service.setPanelState==='function')service.setPanelState({open:true},target)
  else {
   const toggle=doc.querySelector('[data-odyssey-panel-entry="right"]')
   if(toggle?.getAttribute('aria-expanded')==='false')toggle.click()
  }
  event.preventDefault()
 }
 const activate=()=>service.activateTab?.('sherlock-research-conversation',scope())
 doc.addEventListener('sherlock:knowledge-preview-file',preview)
 doc.addEventListener('sherlock:knowledge-activate-chat',activate)
 return()=>{off();offFile();doc.removeEventListener('sherlock:knowledge-preview-file',preview);doc.removeEventListener('sherlock:knowledge-activate-chat',activate)}
}

export function installKnowledgeSourceNavigation({ sessions, workspaces, chatStore, boards, document: doc = document }) {
 const win = doc.defaultView
 const dispatch = (name, detail) => doc.dispatchEvent(new win.CustomEvent(name, { detail }))
 const usable = (snapshot, id) => {
  const summary = typeof id === 'string' ? snapshot.byId?.[id] : undefined
  return summary && !summary.removed && !summary.parentId && summary.origin !== 'subagent' && !sessions.subagentAddress(id) ? summary : undefined
 }
 const catalog = event => {
  event.preventDefault()
  const snapshot = sessions.list.getSnapshot()
  const workspacesBySession = new Map()
  for (const workspace of workspaces?.list.getSnapshot().items ?? []) {
   for (const id of workspace.sessionIds ?? []) workspacesBySession.set(id, workspace.title || workspace.name)
  }
  const boardAdapter = boards?.()
  const entries = (snapshot.ids ?? Object.keys(snapshot.byId ?? {})).flatMap(id => {
   const summary = usable(snapshot, id)
   if (!summary) return []
   return [{ id, title: summary.title?.trim() || summary.displayTitle?.trim() || '未命名会话',
    updatedAt: Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0, workspace: workspacesBySession.get(id),
    researchBoard: boardAdapter?.isBoardOnly(id) === true }]
  })
  dispatch('sherlock:knowledge-session-catalog', { requestId: event.detail?.requestId, entries })
 }
 const changed = () => dispatch('sherlock:knowledge-sessions-changed')
 const unsubscribeSessions = sessions.list.subscribe?.(changed)
 const unsubscribeWorkspaces = workspaces?.list.subscribe?.(changed)
 const open = event => {
  const { id, requestId, view = 'chat', retained } = event.detail ?? {}
  event.preventDefault()
  const snapshot = sessions.list.getSnapshot()
  const reply = ok => dispatch('sherlock:knowledge-source-result', { requestId, ok })
  if (retained && (!usable(snapshot, id) || snapshot.byId[id].blank)) {
   void sessions.refresh().then(() => reply(false), () => reply(false))
   return
  }
  if(typeof requestId === 'string' && usable(snapshot, id) && ['chat', 'research', 'notes', 'spreadsheet'].includes(view)) {
   try {
    const adapter = view === 'research' ? boards?.() : undefined
    const shared = adapter?.getState?.().boards.find(board => board.localSessionId === id && board.pinned)
    if (shared) {
     void adapter.openBoard(shared.boardId).then(opened => reply(opened === id), () => reply(false))
     return
    }
    chatStore.create(id).actions.setView(view)
    sessions.open(id)
    reply(true)
    return
   } catch {}
  }
  reply(false)
 }
 doc.addEventListener('sherlock:knowledge-source-open', open)
 doc.addEventListener('sherlock:knowledge-session-catalog-request', catalog)
 return () => {
  unsubscribeSessions?.()
  unsubscribeWorkspaces?.()
  doc.removeEventListener('sherlock:knowledge-source-open', open)
  doc.removeEventListener('sherlock:knowledge-session-catalog-request', catalog)
 }
}

const knowledgePatch = '/* ework:knowledge-conversation:restore */'
const knowledgePatchEnd = '/* ework:knowledge-conversation:end */'

export function stripKnowledgeConversation(source) {
 const tag=source.indexOf(knowledgePatch)
 if(tag<0)return source
 const start=source.slice(tag-4,tag)==='\n// '?tag-4:tag
 const end=source.indexOf(knowledgePatchEnd,tag)
 if(end<0)throw Error('Knowledge conversation restore record missing')
 const changes=JSON.parse(source.slice(tag+knowledgePatch.length,end))
 source=source.slice(0,start)+source.slice(end+knowledgePatchEnd.length)
 for(const [before,after] of changes.reverse()){
  const boundary=source.indexOf('/* browser-app-native:v1 */')
  const body=boundary<0?source:source.slice(0,boundary)
  if(body.split(after).length!==2)throw Error('Knowledge conversation restore anchor drift: '+before.slice(0,75))
  source=body.replace(after,()=>before)+(boundary<0?'':source.slice(boundary))
 }
 return source
}

export function patchKnowledgeConversation(input) {
 if(input.includes(knowledgePatch))return input
 const changes=[]
 const marker='/* ework:knowledge-composer:v1 */'
 const replace=(source,anchor,next)=>{
  const boundary=source.indexOf('/* browser-app-native:v1 */'),body=boundary<0?source:source.slice(0,boundary)
  if(body.split(anchor).length!==2)throw Error('Knowledge composer anchor drift: '+anchor.slice(0,100))
  changes.push([anchor,next])
  return body.replace(anchor,()=>next)+(boundary<0?'':source.slice(boundary))
 }
 if(!input.includes('"data-odyssey-command-launcher": true')){
  const launcher='"aria-label": label,\n\t\t\t\t"aria-haspopup": "listbox",'
  input=replace(input,launcher,launcher+'\n                "data-odyssey-command-launcher": true,')
 }
 const rendererMarker='/* ework:knowledge-message-projection */'
 if(!input.includes(rendererMarker)){
  const anchor='const componentProjection=projectConversationComponentUserText(text,openFile);'
  input=replace(input,anchor,rendererMarker+'\n'+
   'const knowledgeParts=('+knowledgeMessageParts.toString()+')(text);\n'+
   'if(knowledgeParts)return react_jsx_runtime.jsx(react.Fragment,{children:knowledgeParts.map((part,index)=>part.label?'+
   'react_jsx_runtime.jsx("span",{className:MessageItem_module_css_default.refChip,"data-ref-chip":"knowledge-reference",'+
   'title:part.label,children:part.label},index):react_jsx_runtime.jsx(react.Fragment,{children:projectUserText(part.text,openFile)},index))});\n'+anchor)
 }
 const sourceResolver='const known=mentions?.resolve(value);if(known)return known;'
 input=replace(input,sourceResolver,'const citation=('+sharedKnowledgeCitation.toString()+')(value);if(citation)return citation;\n              '+sourceResolver)
 const queryRailText='const text = parseResearchPrompt(content.text).text.replace(/\\s+/g, " ").trim();'
 const projectQueryText='('+knowledgeMessagePreview.toString()+')(parseResearchPrompt(content.text).text, '+knowledgeMessageParts.toString()+')'
 input=replace(input,queryRailText,'const text = '+projectQueryText+'.replace(/\\s+/g, " ").trim();')
 const componentFlow='const conversationComponentFlow=react.useMemo(()=>conversationComponentRenderFlow(renderFlow,nodeStore,sessionId,conversationNodeTurn),[renderFlow,nodeStore,sessionId,conversationComponentChat]);'
 input=replace(input,componentFlow,componentFlow+'\nconst knowledgeReceipts=react.useMemo(()=>('+knowledgeFilterReceiptAnchors.toString()+')(conversationComponentFlow,nodeStore,conversationNodeTurn),[conversationComponentFlow,nodeStore,conversationComponentChat]);')
 const executionGroup='const ExecutionStatusGroup ='
 input=replace(input,executionGroup,KnowledgeFilterReceipt.toString()+'\n'+executionGroup)
 const receiptTail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];'
 input=replace(input,receiptTail,receiptTail.replace('return receiptPlans', 'const workbenchReceipts=receiptPlans')+
  'const receipt=knowledgeReceipts.get(entry.key);if(receipt)workbenchReceipts.push(react_jsx_runtime.jsx(KnowledgeFilterReceipt,{receipt},"knowledge:"+entry.key+":"+receipt.revision));return workbenchReceipts;')
 const sourceNavigation='/* ework:knowledge-source-navigation */'
 if(!input.includes(sourceNavigation)){
  const anchor='\n\t\t\tconst composerBlocks = new ComposerBlockRegistry();'
  input=replace(input,anchor,anchor+'\n '+sourceNavigation+
   '\n ctx.effect(()=>('+installKnowledgeSourceNavigation.toString()+')({sessions,workspaces,chatStore,boards:()=>sherlockBoardsAdapter}),"Knowledge Base source conversation");')
 }
 if(!input.includes(marker)){
  const registration='\n\t\t\tconst composerBlocks = new ComposerBlockRegistry();'
  input=replace(input,registration,registration+`
 ${marker}
 ctx.inject(['commandUi','inputTriggers'],scope=>{
  const references=(${installKnowledgeReferences.toString()})({sessions,getInput:id=>eworkActiveInput(id,inputHub.shell(id)),getPending:()=>window[Symbol.for('sherlock:pending-conversation')]});
  scope.effect(()=>references.dispose,'Knowledge Base file references');
  scope.effect(()=>scope.get('commandUi').register(references.command),'Knowledge Base slash command');
  scope.effect(()=>scope.get('inputTriggers').registerSource((${knowledgeReferenceCodec.toString()})()),'Knowledge Base reference codec');
 });
 ctx.inject(['betterSidebar'],scope=>scope.effect(()=>(${installKnowledgeSidebar.toString()})({service:scope.get('betterSidebar')}),'Knowledge Base sidebar tabs'));`)
 }
 // Store the undo data in one line comment. The anchor strings may contain block comments.
 return changes.length?input+'\n// '+knowledgePatch+JSON.stringify(changes)+knowledgePatchEnd:input
}
