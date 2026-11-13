// Serialized into the native conversation plugin. The preload first reserves
// this exact owner, flushes its Note, then commits the same ticket.
export function installSidebarNewNote({sessions,workspaces,chatStore,inputHub,getInput}) {
  const tickets=new Map(),requests=new Map();let disposed=false,epoch=0,creating=false
  const abort=()=>new DOMException('当前会话已变化，请重新新建笔记。','AbortError')
  const fingerprint=shell=>{const s=shell?.snapshot;return s?JSON.stringify([s.draft,s.draftRev,s.imageIds,s.occurrences,s.phase,s.researchContextPreparing,s.composing,s.isComposing,s.compositionActive]):null}
  // Read the same effective preference as the native wrapper, without creating
  // a detached store or retrying writes. A same-view acknowledgement is benign.
  const view=id=>{
    if(!id)return null
    const key='ework.session.view.v1:'+id,valid=value=>['chat','research','notes','trajectory','spreadsheet'].includes(value)
    const durable=window.dshDesktop?.researchCanvasStorage?.getItem(key)??null,local=window.localStorage.getItem(key),raw=window.localStorage.getItem(key+'.pending-native')
    let pending=null
    try{const value=raw&&raw.length<256?JSON.parse(raw):null;if(value&&(valid(value.view)||value.view==='')&&(value.previous===null||value.previous===''||valid(value.previous)))pending=value}catch{}
    const saved=pending&&(durable===null||durable===pending.previous)?pending.view:durable??local
    if(valid(saved)||saved==='')return saved||null
    try{return JSON.parse(window.localStorage.getItem('dsh.conversation.chat.'+id)||'null')?.view??null}catch{return null}
  }
  const workspace=()=>{const state=workspaces.list.getSnapshot(),current=sessions.list.getSnapshot().current;const id=state.items.find(item=>item.sessionIds.includes(current))?.workspaceId??state.recentWorkspaceId;return state.items.find(item=>item.workspaceId===id)}
  const valid=ticket=>!disposed&&!ticket.cancelled&&ticket.epoch===epoch&&sessions.list.getSnapshot().current===ticket.current&&workspace()?.workspaceId===ticket.workspaceId&&workspace()?.path===ticket.path&&document.body.dataset.workspaceSurface===ticket.surface&&(!ticket.current||getInput(ticket.current)===ticket.shell)&&!ticket.shell?.disposed&&view(ticket.current)===ticket.view&&fingerprint(ticket.shell)===ticket.fingerprint&&Date.now()<ticket.expires
  const drop=token=>{const ticket=tickets.get(token);if(ticket)ticket.cancelled=true;tickets.delete(token)}
  const invalidate=()=>{epoch++;for(const token of tickets.keys())drop(token)}
  const unsubscribe=sessions.list.subscribe(()=>{for(const ticket of tickets.values())if(sessions.list.getSnapshot().current!==ticket.current){invalidate();break}})
  const edited=event=>{if([...tickets.values()].some(ticket=>event.detail?.sessionId===ticket.current))invalidate()}
  const navigation=event=>{if(event.target?.closest?.('[data-conversation-view-id],.hHd-Xa_newSession:not([data-sidebar-new-note]),.VOzbGW_trigger,[data-sidebar-session-search]'))invalidate()}
  const reply=(requestId,value)=>window.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId,...value}}))
  const handle=async detail=>{
    if(disposed)throw abort()
    if(detail.phase==='cancel'){drop(detail.token);return {}}
    if(detail.phase==='prepare'){
      const target=workspace();if(!target)throw Error('请先选择工作区，再新建笔记。')
      const current=sessions.list.getSnapshot().current,shell=current?getInput(current):null,token=crypto.randomUUID()
      if(current&&!shell)throw Error('当前输入正在读取，请稍后重试。')
      const ticket={current,shell,fingerprint:fingerprint(shell),workspaceId:target.workspaceId,path:target.path,epoch,expires:Date.now()+30_000,ids:new Set(sessions.list.getSnapshot().ids),surface:document.body.dataset.workspaceSurface,view:view(current)}
      tickets.set(token,ticket)
      return {token}
    }
    const ticket=tickets.get(detail.token)
    if(!ticket||!valid(ticket))throw abort()
    if(creating)throw Error('正在新建笔记，请稍候。')
    creating=true
    try{
      // Unlike connectWorkspace, a new Note must never reuse a blank chat that
      // already contains a saved Note or a user draft.
      const id=await sessions.create({workspaceId:ticket.workspaceId})
      if(!valid(ticket))throw abort()
      if(typeof id!=='string'||!id||ticket.ids.has(id)||!sessions.list.getSnapshot().ids.includes(id))throw Error('新笔记会话未能创建。')
      const binding=sessions.binding(id)
      if(!binding||binding.state==='removed'||binding.kind==='subagent')throw Error('新笔记会话不可用。')
      chatStore.create(id).actions.setView('notes')
      sessions.open(id)
      return {sessionId:id}
    }finally{creating=false;drop(detail.token)}
  }
  const listener=event=>{
    const d=event.detail
    if(!d||typeof d.requestId!=='string'||d.requestId.length>100||!['prepare','create','cancel'].includes(d.phase)||Object.keys(d).some(key=>!['requestId','phase','token'].includes(key))||(d.phase!=='prepare'&&typeof d.token!=='string'))return
    let request=requests.get(d.requestId)
    if(!request){request=handle(d).then(value=>({ok:true,...value}),error=>({ok:false,cancelled:error?.name==='AbortError',message:error?.message||'新笔记未能创建。'}));requests.set(d.requestId,request);if(requests.size>64)requests.delete(requests.keys().next().value)}
    void request.then(value=>{if(!disposed)reply(d.requestId,value)})
  }
  window.addEventListener('sherlock:sidebar-new-note-request',listener)
  window.addEventListener('sherlock:notes-reset',invalidate)
  window.addEventListener('sherlock:skill-menu-reset',invalidate)
  document.addEventListener('sherlock:notes-edited',edited)
  document.addEventListener('sherlock:workspace-surface-change',invalidate)
  document.addEventListener('click',navigation,true)
  return()=>{disposed=true;invalidate();unsubscribe();window.removeEventListener('sherlock:sidebar-new-note-request',listener);window.removeEventListener('sherlock:notes-reset',invalidate);window.removeEventListener('sherlock:skill-menu-reset',invalidate);document.removeEventListener('sherlock:notes-edited',edited);document.removeEventListener('sherlock:workspace-surface-change',invalidate);document.removeEventListener('click',navigation,true)}
}

const PREFIX='/* sherlock:sidebar-new-note:',END='/* sherlock:sidebar-new-note:end */'
function exact(source,from,to){if(source.split(from).length!==2)throw Error('Sidebar New Note anchor drift: '+from.slice(0,80));return source.replace(from,to)}
function restore(source,kind){
  const marker=PREFIX+kind+':v1 */',at=source.indexOf(PREFIX+kind+':')
  if(at<0)return source
  if(!source.includes(marker)||source.split(PREFIX+kind+':').length!==2)throw Error('Unknown/duplicate Sidebar New Note layer')
  const end=source.indexOf(END,at),raw=source.slice(at+marker.length,end)
  if(end<0||!raw.startsWith('\n// '))throw Error('Sidebar New Note restore metadata drift')
  const pairs=JSON.parse(raw.slice(4).trim())
  source=source.slice(0,at)+source.slice(end+END.length)
  for(const [from,to]of pairs.reverse())source=exact(source,to,from)
  return source
}
function apply(source,kind,changes){
  const pairs=[];for(const [from,to]of changes){source=exact(source,from,to);pairs.push([from,to])}
  return source+PREFIX+kind+':v1 */\n// '+JSON.stringify(pairs)+'\n'+END
}
export const stripSidebarNewNoteConversation=source=>restore(source,'conversation')
export const stripSidebarNewNoteShell=source=>restore(source,'shell')
export function patchSidebarNewNoteConversation(input){
  const source=stripSidebarNewNoteConversation(input),anchor='const composerBlocks = new ComposerBlockRegistry();'
  if(source.includes('Sherlock sidebar new note'))throw Error('Orphan Sidebar New Note action')
  const code='\nctx.effect(()=>{if(window.top!==window)return;return ('+installSidebarNewNote.toString()+')({sessions,workspaces,chatStore,inputHub,getInput:id=>eworkActiveInput(id,inputHub.shell(id))});},"Sherlock sidebar new note");'
  return apply(source,'conversation',[[anchor,anchor+code]])
}
export function patchSidebarNewNoteShell(input){
  let source=stripSidebarNewNoteShell(input)
  if(source.includes('sherlock-sidebar-note-icon')||source.includes('const newSessionControls ='))throw Error('Orphan Sidebar New Note shell')
  const begin='(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.newSessionGroup,'
  const start=source.indexOf(begin),stop=source.indexOf(',\n\t\t\t\t\t(0,react_jsx_runtime.jsxs)("div",{"data-srb-navigation-scroll"',start)
  if(start<0||stop<0)throw Error('Native Sidebar New Session group drift')
  const group=source.slice(start,stop),last=group.lastIndexOf('})]')

  const note='(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip,{label:t("session.newNote.label"),delayMs:500,children:(0,react_jsx_runtime.jsx)("button",{type:"button",className:SidebarRoot_module_css_default.newSession,"data-sidebar-new-note":"","aria-label":t("session.newNote.label"),onClick:()=>window.dispatchEvent(new CustomEvent("sherlock:sidebar-new-note")),children:void 0})})'
  const controls=group.slice(0,last)+'}), !wide && '+note+']'+group.slice(last+3)
  const root='\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tref: column,'
  const foot='(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.footArea,'
  return apply(source,'shell',[
    [group,'wide && newSessionControls'],
    [root,'\t\t\tconst newSessionControls = '+controls+';\n'+root],
    [foot,'!wide && newSessionControls,\n'+foot],
    ['"session.newResearch.label": "新建研究",','"session.newResearch.label": "新建研究",\n"session.newNote.label":"新建笔记",'],
    ['"session.newResearch.label": "New research",','"session.newResearch.label": "New research",\n"session.newNote.label":"New note",'],
  ])
}
