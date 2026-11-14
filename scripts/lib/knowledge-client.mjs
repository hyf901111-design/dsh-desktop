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

export function installKnowledgeSourceNavigation({ sessions, chatStore, document: doc = document }) {
 const open = event => {
  const { id, requestId } = event.detail ?? {}
  event.preventDefault()
  const snapshot = sessions.list.getSnapshot()
  const summary = typeof id === 'string' ? snapshot.byId?.[id] : undefined
  let ok = false
  if(typeof requestId === 'string' && summary && !summary.removed && !sessions.subagentAddress(id)) {
   try {
    chatStore.create(id).actions.setView('chat')
    sessions.open(id)
    ok = true
   } catch {}
  }
  doc.dispatchEvent(new doc.defaultView.CustomEvent('sherlock:knowledge-source-result', { detail: { requestId, ok } }))
 }
 doc.addEventListener('sherlock:knowledge-source-open', open)
 return () => doc.removeEventListener('sherlock:knowledge-source-open', open)
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
 const queryRailText='const text = parseResearchPrompt(content.text).text.replace(/\\s+/g, " ").trim();'
 const projectQueryText='('+knowledgeMessagePreview.toString()+')(parseResearchPrompt(content.text).text, '+knowledgeMessageParts.toString()+')'
 input=replace(input,queryRailText,'const text = '+projectQueryText+'.replace(/\\s+/g, " ").trim();')
 const sourceNavigation='/* ework:knowledge-source-navigation */'
 if(!input.includes(sourceNavigation)){
  const anchor='\n\t\t\tconst composerBlocks = new ComposerBlockRegistry();'
  input=replace(input,anchor,anchor+'\n '+sourceNavigation+
   '\n ctx.effect(()=>('+installKnowledgeSourceNavigation.toString()+')({sessions,chatStore}),"Knowledge Base source conversation");')
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
