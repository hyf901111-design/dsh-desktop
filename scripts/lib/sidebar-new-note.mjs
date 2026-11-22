export async function initializeWorkspaceSession(_sessions,id,view,locale) {
  const routes = {
    notes: '/sherlock/notes/session',
    research: '/sherlock/research/session-title',
    presentation: '/sherlock/presentation/session',
    spreadsheet: '/sherlock/spreadsheet/session'
  }
  if (!Object.hasOwn(routes,view)) return
  const endpoint = routes[view]
  const body = { sessionId: id, locale }
  if (view !== 'research' && globalThis.window?.dshDesktop?.officeSessions) {
    body.officeOwner = window.dshDesktop.officeSessions.identity()
    if (!body.officeOwner) throw Error('账号正在切换，请重新创建文档。')
  }
  if (view === 'notes') body.action = 'initialize'
  if (view === 'research') body.components = []
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  const result = await response.json()
  if (body.officeOwner && window.dshDesktop.officeSessions.identity() !== body.officeOwner)
    throw Error('账号已变化，请在当前空间重新创建文档。')
  if (!response.ok || result.ok !== true) throw Error(result.error || '新会话名称未能保存。')
}


// Serialized into the native conversation plugin. The preload first reserves
// this exact owner, flushes its Note, then commits the same ticket.
export function installSidebarNewNote({sessions,workspaces,chatStore,inputHub,getInput,getPending,standaloneDirectory,initializeSession=initializeWorkspaceSession}) {
  const tickets=new Map(),requests=new Map();let disposed=false,epoch=0,creating=false
  const abort=()=>new DOMException('当前会话已变化，请重新新建。','AbortError')
  const fingerprint=shell=>{const s=shell?.snapshot;return s?JSON.stringify([s.draft,s.draftRev,s.imageIds,s.occurrences,s.phase,s.researchContextPreparing,s.composing,s.isComposing,s.compositionActive]):null}
  // Read the same effective preference as the native wrapper, without creating
  // a detached store or retrying writes. A same-view acknowledgement is benign.
  const view=id=>{
    if(!id)return null
    const key='ework.session.view.v1:'+id,valid=value=>['chat','research','notes','trajectory','spreadsheet', 'presentation'].includes(value)
    const durable=window.dshDesktop?.researchCanvasStorage?.getItem(key)??null,local=window.localStorage.getItem(key),raw=window.localStorage.getItem(key+'.pending-native')
    let pending=null
    try{const value=raw&&raw.length<256?JSON.parse(raw):null;if(value&&(valid(value.view)||value.view==='')&&(value.previous===null||value.previous===''||valid(value.previous)))pending=value}catch{}
    const saved=pending&&(durable===null||durable===pending.previous)?pending.view:durable??local
    if(valid(saved)||saved==='')return saved||null
    try{return JSON.parse(window.localStorage.getItem('dsh.conversation.chat.'+id)||'null')?.view??null}catch{return null}
  }
  const workspace=()=>{
    const state=workspaces.list.getSnapshot(),sessionState=sessions.list.getSnapshot()
    const pending=getPending?.()
    const selected=pending?.getCurrentWorkspace ? pending.getCurrentWorkspace() : pending?.getManualWorkspace?.()
    if(selected===null)return {workspaceId:null}
    if(selected!==undefined)return state.items.find(item=>item.workspaceId===selected)
    const current=sessionState.current,cwd=sessionState.byId[current]?.cwd
    const currentWorkspace=state.items.find(item=>item.sessionIds.includes(current)) ??
      (cwd ? state.items.find(item=>item.path===cwd) : undefined)
    if(currentWorkspace)return currentWorkspace
    const pendingId=current===undefined?pending?.getSnapshot().workspaceId:undefined
    if(pendingId===null)return {workspaceId:null}
    return state.items.find(item=>item.workspaceId===(pendingId??state.recentWorkspaceId))
  }
  const valid=ticket=>!disposed&&!ticket.cancelled&&ticket.epoch===epoch&&sessions.list.getSnapshot().current===ticket.current&&workspace()?.workspaceId===ticket.workspaceId&&workspace()?.path===ticket.path&&document.body.dataset.workspaceSurface===ticket.surface&&(!ticket.current||getInput(ticket.current)===ticket.shell)&&!ticket.shell?.disposed&&view(ticket.current)===ticket.view&&fingerprint(ticket.shell)===ticket.fingerprint&&Date.now()<ticket.expires
  const drop=token=>{const ticket=tickets.get(token);if(ticket)ticket.cancelled=true;tickets.delete(token)}
  const invalidate=()=>{epoch++;for(const token of tickets.keys())drop(token)}
  const unsubscribe=sessions.list.subscribe(()=>{for(const ticket of tickets.values())if(sessions.list.getSnapshot().current!==ticket.current){invalidate();break}})
  const edited=event=>{if([...tickets.values()].some(ticket=>event.detail?.sessionId===ticket.current))invalidate()}
  const navigation=event=>{if(event.target?.closest?.('[data-conversation-view-id],.hHd-Xa_newSession:not([data-sidebar-new-note],[data-sidebar-new-spreadsheet]),.VOzbGW_trigger,[data-sidebar-session-search]'))invalidate()}
  const reply=(requestId,value)=>window.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId,...value}}))
  const handle=async detail=>{
    if(disposed)throw abort()
    const kind=detail.kind??'note', noun=kind==='spreadsheet'?'表格':kind==='presentation'?'演示':'笔记'
    if(detail.phase==='cancel'){if(tickets.get(detail.token)?.kind===kind)drop(detail.token);return {}}
    if(detail.phase==='prepare'){
      const target=workspace();if(!target)throw Error('请先选择工作区，再新建'+noun+'。')
      const current=sessions.list.getSnapshot().current,shell=current?getInput(current):null,token=crypto.randomUUID()
      if(current&&!shell)throw Error('当前输入正在读取，请稍后重试。')
      const ticket={kind,current,shell,fingerprint:fingerprint(shell),workspaceId:target.workspaceId,path:target.path,epoch,expires:Date.now()+30_000,ids:new Set(sessions.list.getSnapshot().ids),surface:document.body.dataset.workspaceSurface,view:view(current)}
      tickets.set(token,ticket)
      return {token}
    }
    const ticket=tickets.get(detail.token)
    if(!ticket||ticket.kind!==kind||!valid(ticket))throw abort()
    if(creating)throw Error('正在新建，请稍候。')
    creating=true
    try{
      // Create a separate session so an existing draft remains with its owner.
      const options=ticket.workspaceId===null
        ? {cwd:await standaloneDirectory()}
        : {workspaceId:ticket.workspaceId}
      if(!valid(ticket))throw abort()
      const id=await sessions.create(options)
      if(!valid(ticket))throw abort()
      if(typeof id!=='string'||!id||ticket.ids.has(id)||!sessions.list.getSnapshot().ids.includes(id))throw Error('新'+noun+'会话未能创建。')
      const binding=sessions.binding(id)
      if(!binding||binding.state==='removed'||binding.kind==='subagent')throw Error('新'+noun+'会话不可用。')
      const view=kind==='note'?'notes':kind
      await initializeSession(sessions,id,view,document.documentElement.dataset.odysseyLocale==='en'?'en':'zh')
      if(!valid(ticket))throw abort()
      chatStore.create(id).actions.setView(view)
      // Release the overlay before the selection update reaches its subscribers.
      document.dispatchEvent(new CustomEvent('sherlock:sidebar-document-will-open',{detail:{view}}))
      sessions.open(id)
      return {sessionId:id}
    }finally{creating=false;drop(detail.token)}
  }
  const listener=event=>{
    const d=event.detail
    if(!d||typeof d.requestId!=='string'||d.requestId.length>100||!['prepare','create','cancel'].includes(d.phase)||d.kind!==undefined&&!['spreadsheet','presentation'].includes(d.kind)||Object.keys(d).some(key=>!['requestId','phase','token','kind'].includes(key))||(d.phase!=='prepare'&&typeof d.token!=='string'))return
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

// Hiding an empty image before finding its destination lets the image cleanup
// archive the selected session while the new board is being created.
export async function openResearchFromImage(ctx, project, currentProject, isLatest) {
  const before = ctx.sessions.list.getSnapshot().current
  const originalProject = currentProject()
  const owns = () => isLatest() && document.body.dataset.workspaceSurface === 'image-factory' &&
    ctx.sessions.list.getSnapshot().current === before && currentProject() === originalProject
  let target = project
  if (target === undefined) {
    const workspaces = ctx.workspaces.list.getSnapshot()
    target = workspaces.items.find(item => item.sessionIds.includes(before))?.workspaceId ?? workspaces.recentWorkspaceId
  }
  let id
  if (target == null) {
    const cwd = await window.dshDesktop.standaloneConversationDirectory()
    if (!owns()) return
    id = await ctx.sessions.create({cwd})
  } else {
    const preferences = window[Symbol.for('sherlock:conversation-permission-default')]
    const allows = await preferences?.prepareReuse()
    if (!owns()) return
    const canReuse = id => id !== before && !id.startsWith('image-task-') &&
      [undefined,'新看板','New Board'].includes(ctx.sessions.list.getSnapshot().byId[id]?.title)
    id = await ctx.workspaces.connectWorkspace(target,canReuse,allows)
  }
  if (!owns() || !id || id === before || !ctx.sessions.list.getSnapshot().ids.includes(id)) return
  document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened'))
  try { window.sessionStorage.setItem('sherlock.conversation.initial-research-session.v1',id) } catch {}
  window.dispatchEvent(new CustomEvent('sherlock:conversation-initial-research',{detail:{sessionId:id,newResearch:true}}))
  ctx.sessions.open(id)
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
  const code='\nctx.effect(()=>{if(window.top!==window)return;return ('+installSidebarNewNote.toString()+')({sessions,workspaces,chatStore,inputHub,getInput:id=>eworkActiveInput(id,inputHub.shell(id)),getPending:()=>window[Symbol.for("sherlock:pending-conversation")],standaloneDirectory:()=>window.dshDesktop.standaloneConversationDirectory(),initializeSession:('+initializeWorkspaceSession.toString()+')});},"Sherlock sidebar new note");'
  return apply(source,'conversation',[[anchor,anchor+code]])
}
export function patchSidebarNewNoteShell(input){
  let source=stripSidebarNewNoteShell(input)
  if(source.includes('sherlock-sidebar-note-icon')||source.includes('const newSessionControls ='))throw Error('Orphan Sidebar New Note shell')
  const begin='(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.newSessionGroup,'
  const start=source.indexOf(begin),stop=source.indexOf(',\n\t\t\t\t\t(0,react_jsx_runtime.jsxs)("div",{"data-srb-navigation-scroll"',start)
  if(start<0||stop<0)throw Error('Native Sidebar New Session group drift')
  const group=source.slice(start,stop)
  const controls=exact(
    exact(group,'"aria-label": t("session.new.label"),','"aria-label": t("session.new.label"), "data-sidebar-chat-entry": "",'),
    '"aria-label": t("session.newResearch.label"),','"aria-label": t("session.newResearch.label"), "data-sidebar-research-entry": "",'
  )

  const home='(0,react_jsx_runtime.jsx)("div",{className:SidebarRoot_module_css_default.newSessionGroup,children:(0,react_jsx_runtime.jsx)("button",{type:"button",className:SidebarRoot_module_css_default.newSession,"data-sidebar-home":"","aria-label":t("sidebar.home.label"),onClick:openHome})})'
  const props='function SidebarRoot({ collapsed, width, startSession, startResearchSession, toggleSidebar, t, renderSlot })'
  const inject='const injectProps = () => ({'
  const root='\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tref: column,'
  const foot='(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.footArea,'
  return apply(source,'shell',[
    [group,'wide && newSessionControls'],
    [props,props.replace('startSession,','openHome, startSession,')],
    [inject,`
            let sidebarNavigation = 0;
            const openImageResearch = ${openResearchFromImage.toString()};
            const currentProject = () => {
                const pending = window[Symbol.for("sherlock:pending-conversation")];
                return pending?.getCurrentWorkspace ? pending.getCurrentWorkspace() : pending?.getManualWorkspace();
            };
            const startWithoutProject = async view => {
                const pending = window[Symbol.for("sherlock:pending-conversation")];
                const before = ctx.sessions.list.getSnapshot().current;
                const project = pending?.getSnapshot?.().workspaceId;
                const sameOwner = () => ctx.sessions.list.getSnapshot().current === before && pending?.getSnapshot?.().workspaceId === project;
                try {
                    const cwd = await window.dshDesktop.standaloneConversationDirectory();
                    if (!sameOwner()) return;
                    const sessionId = await ctx.sessions.create({ cwd });
                    if (!sameOwner()) return;
                    if (view === "research") {
                        try { window.sessionStorage.setItem("sherlock.conversation.initial-research-session.v1", sessionId); } catch {}
                    }
                    window.dispatchEvent(new CustomEvent("sherlock:conversation-initial-" + view, { detail: { sessionId, newResearch: view === "research" } }));
                    ctx.sessions.open(sessionId);
                } catch (error) { console.warn("new standalone session failed:", error); }
            };
            `+inject+`
                openHome: () => {
                    sidebarNavigation++;
                    // Hide workspace apps before notifying their session-selection listeners.
                    document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened'));
                    ctx.sessions.clear();
                },`],
    ['startSession: (workspaceId) => {', `startSession: (workspaceId) => {
                    sidebarNavigation++;
                    const selected = workspaceId === undefined ? currentProject() : workspaceId;
                    document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened'));
                    if (selected === null) { void startWithoutProject('chat'); return; }
                    workspaceId = selected;`],
    ['startResearchSession: (workspaceId) => {', `startResearchSession: (workspaceId) => {
                    const revision = ++sidebarNavigation;
                    const selected = workspaceId === undefined ? currentProject() : workspaceId;
                    if (document.body.dataset.workspaceSurface === 'image-factory') {
                        void openImageResearch(ctx,selected,currentProject,() => revision === sidebarNavigation).catch(error=>console.warn('new research session failed:',error));
                        return;
                    }
                    document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened'));
                    if (selected === null) { void startWithoutProject('research'); return; }
                    workspaceId = selected;`],
    [root,'\t\t\tconst newSessionControls = '+controls+';\n'+`
    react.useEffect(()=>{
      const rail=column.current;
      const openChat=()=>startSession();
      const openResearch=()=>startResearchSession();
      rail?.addEventListener('sherlock:sidebar-new-chat',openChat);
      rail?.addEventListener('sherlock:sidebar-new-research',openResearch);
      return()=>{
        rail?.removeEventListener('sherlock:sidebar-new-chat',openChat);
        rail?.removeEventListener('sherlock:sidebar-new-research',openResearch);
      };
    },[startSession,startResearchSession]);
`+root],
    [foot,'!wide && '+home+',\n'+foot],
    ['"session.new": "新对话",','"session.new": "新建对话",'],
    ['"session.newResearch": "新研究",','"session.newResearch": "研究",'],
    ['"session.newResearch.label": "新建研究",','"session.newResearch.label": "研究",\n"sidebar.home.label":"主页",'],
    ['"session.new": "New Chat",','"session.new": "New chat",'],
    ['"session.newResearch": "New Research",','"session.newResearch": "Research",'],
    ['"session.newResearch.label": "New research",','"session.newResearch.label": "Research",\n"sidebar.home.label":"Home",'],
  ])
}
