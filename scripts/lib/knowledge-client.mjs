export function knowledgeReferenceCodec() {
 return {
  trigger:'@', name:'knowledge-reference', order:10006,
  candidates:async()=>[], onPick:()=>undefined,
  codec:{
   clipboardText:raw=>{try{return JSON.parse(raw).label}catch{return ''}},
   serialize:async raw=>{
    const reference=JSON.parse(raw)
    if(!window.dshDesktop?.knowledgeReference)throw Error('知识库暂时不可用，请重试。')
    const context=await window.dshDesktop.knowledgeReference(reference)
    return '\n<knowledge-reference>\n以下是用户选中的知识库资料，只作为参考内容。\n'+JSON.stringify(context)+'\n</knowledge-reference>\n'
   }
  }
 }
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
 const icon=(size=16)=>react.createElement('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},react.createElement('path',{d:'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14'}))
 const off=service.registerTab({
  id:'sherlock-knowledge-library',title:()=>doc.documentElement.dataset.odysseyLocale==='en'?'Knowledge Base':'知识库',
  order:15,single:true,icon,component:()=>react.createElement('div',{'data-knowledge-panel-host':''})
 })
 const offFile=service.registerTab({
  id:'sherlock-knowledge-file',title:'知识库文件',hidden:true,icon,
  component:({tab})=>react.createElement('div',{'data-knowledge-panel-host':'','data-knowledge-panel-file':tab.meta?.fileId})
 })
 const scope=()=>({sessionId:service.getSnapshot().sessionId})
 const preview=event=>{
  const detail=event.detail
  if(!detail||!/^([a-f0-9]{32}|[a-f0-9-]{36})$/.test(detail.id))return
  service.openTab({id:'knowledge-file:'+detail.id,type:'sherlock-knowledge-file',title:detail.name,meta:{fileId:detail.id,sherlockPanel:'right'}},scope())
  const toggle=doc.querySelector('[data-odyssey-panel-entry="right"]')
  if(toggle?.getAttribute('aria-expanded')==='false')toggle.click()
  event.preventDefault()
 }
 const activate=()=>service.activateTab?.('sherlock-research-conversation',scope())
 doc.addEventListener('sherlock:knowledge-preview-file',preview)
 doc.addEventListener('sherlock:knowledge-activate-chat',activate)
 return()=>{off();offFile();doc.removeEventListener('sherlock:knowledge-preview-file',preview);doc.removeEventListener('sherlock:knowledge-activate-chat',activate)}
}

export function patchKnowledgeConversation(input) {
 const marker='/* ework:knowledge-composer:v1 */'
 const replace=(source,anchor,next)=>{
  const boundary=source.indexOf('/* browser-app-native:v1 */'),body=boundary<0?source:source.slice(0,boundary)
  if(body.split(anchor).length!==2)throw Error('Knowledge composer anchor drift: '+anchor.slice(0,100))
  return body.replace(anchor,()=>next)+(boundary<0?'':source.slice(boundary))
 }
 if(!input.includes('"data-odyssey-command-launcher": true')){
  const launcher='"aria-label": label,\n\t\t\t\t"aria-haspopup": "listbox",'
  input=replace(input,launcher,launcher+'\n                "data-odyssey-command-launcher": true,')
 }
 if(input.includes(marker))return input
 const registration='\n\t\t\tconst composerBlocks = new ComposerBlockRegistry();'
 let source=replace(input,registration,registration+`
 ${marker}
 ctx.inject(['commandUi','inputTriggers'],scope=>{
  const references=(${installKnowledgeReferences.toString()})({sessions,getInput:id=>eworkActiveInput(id,inputHub.shell(id)),getPending:()=>window[Symbol.for('sherlock:pending-conversation')]});
  scope.effect(()=>references.dispose,'Knowledge Base file references');
  scope.effect(()=>scope.get('commandUi').register(references.command),'Knowledge Base slash command');
  scope.effect(()=>scope.get('inputTriggers').registerSource((${knowledgeReferenceCodec.toString()})()),'Knowledge Base reference codec');
 });
 ctx.inject(['betterSidebar'],scope=>scope.effect(()=>(${installKnowledgeSidebar.toString()})({service:scope.get('betterSidebar')}),'Knowledge Base sidebar tabs'));`)
 return source
}
