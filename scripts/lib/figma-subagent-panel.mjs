/** A catalog-addressed child gets a retained real Session in a sibling tab.
 * Selection remains on the parent; the renderer receives the child's standard
 * props, so history, tools, drafts and composer guards keep their native scope. */
function exact(source, before, after) {
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw Error('Subagent panel anchor drifted: '+before.slice(0,100))
  return source.replace(before,after)
}
export function patchSubagentPanelRuntime(source) {
  const marker='/* odyssey:retained-subagent-panels:v1 */'
  if(source.includes(marker))return source
  source=exact(source,'openCatalogs = /* @__PURE__ */ new Set();','openCatalogs = /* @__PURE__ */ new Set();\n      panelCatalogs = new Map();')
  source=exact(source,'this.openCatalogs.has(frame.parentSessionId)', 'this.openCatalogs.has(frame.parentSessionId) || this.panelCatalogs.has(frame.parentSessionId)')
  source=exact(source,'for (const parentSessionId of this.openCatalogs) this.refreshSubagents(parentSessionId);', 'for (const parentSessionId of new Set([...this.openCatalogs,...this.panelCatalogs.keys()])) this.refreshSubagents(parentSessionId);')
  source=exact(source,'selectSubagent(address) {','retainSubagentAddress(address) {')
  source=exact(source,'this.selected = address.childSessionId;', `}
      selectSubagent(address) {
        this.retainSubagentAddress(address);
        this.selected = address.childSessionId;`)
  source=exact(source,'var SessionRuntime = class {', `var SessionRuntime = class {
      ${marker}
      panelLeases = new Map();
      retainSubagentPanel(address) {
        this.manager.retainSubagentAddress(address);
        const id=address.childSessionId;
        this.panelLeases.set(id,(this.panelLeases.get(id)??0)+1);
        const catalogs=this.manager.panelCatalogs,parent=address.parentSessionId;
        catalogs.set(parent,(catalogs.get(parent)??0)+1);
        let released=false;
        const release=()=>{
          if(released)return;released=true;
          const count=(this.panelLeases.get(id)??1)-1;
          if(count>0)this.panelLeases.set(id,count);else this.panelLeases.delete(id);
          const observers=catalogs.get(parent)-1;
          if(observers>0)catalogs.set(parent,observers);else catalogs.delete(parent);
          this.projectList();
        };
        try {
          this.projectList();
          this.resolve(id).session.open();
          this.manager.refreshSubagents(id);
        } catch(error) { release(); throw error; }
        return release;
      }`)
  source=exact(source,'return current === id || ids.includes(id);','return current === id || ids.includes(id) || this.panelLeases.has(id);')
  source=exact(source,'const persisted = this.selection.getSnapshot().sessionId;', `for(const id of this.panelLeases.keys()) {
          if(byId[id])continue;
          const address=this.manager.subagentAddress(id);
          const child=subagentsByParent[address?.parentSessionId]?.entries.find(entry=>entry.kind==='child'&&entry.id===id);
          byId[id]={id,displayTitle:child?.label??id,parentId:address?.parentSessionId,origin:'subagent',running:child?.activity==='running',blank:false,updatedAt:0};
        }
        const persisted = this.selection.getSnapshot().sessionId;`)
  return exact(source,'provideInfo: sessions.currentProvideInfo','provideInfo: sessions.currentProvideInfo,\n\t\t\t\t\t\tprovideInfoFor: id => sessions.provideInfo(id)')
}
export function patchSubagentPanelRenderer(source, web=false) {
  const marker='/* odyssey:scoped-session-outlet:v1 */'
  if(source.includes(marker))return source
  if(web) {
    return exact(source,
      'const u=iu();return f.jsx("div",{"data-slot":n,style:D3,children:h8(s,n,r,i,u)})}',
      `${marker}const inherited=iu(),u=i?.sessionId===undefined?inherited:s.sessions.provideInfoFor(i.sessionId);if(!u)return null;return f.jsx(ou.Provider,{value:u,children:f.jsx("div",{"data-slot":n,style:D3,children:h8(s,n,r,i,u)})})}`)
  }
  const before=`return jsx("div", {
\t\t"data-slot": slotKey,
\t\tstyle: ANCHOR_STYLE,
\t\tchildren: renderOutletContent(host, slotKey, ownerProps, opts, useSessionMaybeProvideInfo())
\t});`
  return exact(source,before,`${marker}
  const inherited=useSessionMaybeProvideInfo();
  const info=opts?.sessionId===undefined?inherited:host.sessions.provideInfoFor(opts.sessionId);
  if(!info)return null;
  return jsx(BindingContext.Provider,{value:info,children:jsx("div",{
    "data-slot":slotKey,style:ANCHOR_STYLE,
    children:renderOutletContent(host,slotKey,ownerProps,opts,info)
  })});`)
}
const panelComponent=`
function OdysseySubagentPanel({tab,scope,coordinator}) {
  const store=react.useMemo(()=>coordinator.storeFor(scope.sessionId),[coordinator,scope.sessionId]);
  const snapshot=react.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  const [state,setState]=react.useState({ready:false,error:null});
  const [retry,setRetry]=react.useState(0);
  const address=tab.meta?.subagentAddress;
  react.useEffect(()=>{
    let active=true,release;
    setState({ready:false,error:null});
    const open=async()=>{
      try {
        if(!address)throw Error('子代理地址不可用');
        const sessions=coordinator.sessions;
        await sessions.refreshSubagents(address.parentSessionId);
        if(!active)return;
        release=sessions.retainSubagentPanel(address);
        setState({ready:true,error:null});
      }catch(error){if(active)setState({ready:false,error:error.message||'无法打开子代理记录'});}
    };
    void open();return()=>{active=false;release?.();};
  },[coordinator,address?.parentSessionId,address?.childSessionId,address?.mode,retry]);
  return react_jsx_runtime.jsx('section',{'data-odyssey-subagent-panel':address?.childSessionId,'aria-label':tab.title,children:
    state.error?react_jsx_runtime.jsxs('div',{role:'status',className:'odyssey-subagent-panel-error',children:[state.error,react_jsx_runtime.jsx('button',{type:'button',onClick:()=>setRetry(n=>n+1),children:'重试'})]}):
    state.ready&&snapshot.binding?.renderSubagent?snapshot.binding.renderSubagent(address.childSessionId):react_jsx_runtime.jsx('div',{role:'status',className:'odyssey-subagent-panel-error',children:'正在读取子代理记录…'})
  });
}
function OdysseySubagentPanelHeader({sessionId,useSession,useSessions}) {
  const session=useSession(s=>s);
  const summary=useSessions(s=>s.byId[sessionId]);
  const address=session.subagent?.address;
  return react_jsx_runtime.jsxs('header',{className:'odyssey-subagent-panel-header',children:[
    react_jsx_runtime.jsx('strong',{children:summary?.displayTitle??sessionId}),
    react_jsx_runtime.jsxs('div',{children:[react_jsx_runtime.jsx('span',{'data-odyssey-subagent-activity':session.running?'running':'idle','aria-hidden':true}),address?.mode==='one-shot'?'一次性':'持续运行',' · ',session.running?'正在运行':'当前未运行']})
  ]});
}
`;
export function patchSubagentPanelConversation(source) {
  const marker='/* odyssey:subagent-conversation-tab:v1 */'
  if(source.includes(marker))return source
  source=exact(source,'class ResearchSidebarCoordinator {',marker+'\n'+panelComponent+'\nclass ResearchSidebarCoordinator {\n sessions=null;')
  source=exact(source,'attach(service, t) {','attach(service, t, sessions) {\n this.sessions=sessions;')
  source=exact(source,'return () => {\n\t\t\t\t\tunregister?.();',`const unregisterSubagent=service.registerTab({id:'sherlock-subagent-conversation',title:()=> '子代理',hidden:true,single:false,component:props=>react_jsx_runtime.jsx(OdysseySubagentPanel,{...props,coordinator})});
        const openPanel=(address)=>{
          const parent=sessions.list.getSnapshot().current;
          if(!parent)throw Error('父会话不可用');
          const catalog=sessions.list.getSnapshot().subagentsByParent[address.parentSessionId];
          const child=catalog?.entries.find(e=>e.kind==='child'&&e.id===address.childSessionId&&e.mode===address.mode);
          if(!child)throw Error('子代理记录不可用');
          const scope={sessionId:parent};
          service.openTab({id:'subagent:'+address.childSessionId,type:'sherlock-subagent-conversation',title:child.label??address.childSessionId,meta:{subagentAddress:address}},scope);
          service.setPanelState({open:true},scope);
        };
        sessions.openSubagentPanel=openPanel;
        return () => {
          if(sessions.openSubagentPanel===openPanel)delete sessions.openSubagentPanel;
          unregisterSubagent?.();
\t\t\t\t\tunregister?.();`)
  source=exact(source,'researchSidebar.attach(sidebarCtx.betterSidebar, t)','researchSidebar.attach(sidebarCtx.betterSidebar, t, sessions)')
  source=exact(source,'active: research,\n\t\t\t\t\tpresentation: researchPresentation,', `active: research,
          renderSubagent: id=>renderSlot('conversation.subagent.panel',{subagentPanel:true},{sessionId:id}),
\t\t\t\t\tpresentation: researchPresentation,`)
  source=exact(source,'function ConversationRoot({ sessionId,','function ConversationRoot({ subagentPanel=false, sessionId,')
  source=exact(source,'children: [renderSlot("conversation.session.header", {}),',`children: [subagentPanel?react_jsx_runtime.jsx(OdysseySubagentPanelHeader,{sessionId,useSession,useSessions}):renderSlot("conversation.session.header", {}),`)
  const a=source.indexOf('slots.register({\n\t\t\t\t\tname: "conversation",'), b=source.indexOf('}, ConversationRoot);',a)
  if(a<0||b<a)throw Error('Conversation registration missing')
  const options=source.slice(a+'slots.register('.length,b+1)
  source=source.slice(0,a)+`const odysseyConversationOptions=${options};
      slots.register({...odysseyConversationOptions,children:{...odysseyConversationOptions.children,'conversation.subagent.panel':{kind:'single',scope:'session'}}},ConversationRoot);
      slots.register({...odysseyConversationOptions,name:'conversation.subagent.panel'},ConversationRoot);`+source.slice(b+'}, ConversationRoot);'.length)
  return source
}
export function patchSubagentPanelEntry(source, sidebar=false) {
  if(sidebar)return exact(source,'onOpenChild?.(address);\n\t\t\t\ttry {\n\t\t\t\t\tsessions.openSubagent?.(address);',`try {
          if(sessions.openSubagentPanel)sessions.openSubagentPanel(address);
          else {onOpenChild?.(address);sessions.openSubagent?.(address);}`)
  return exact(source,'sessions.openSubagent(address);','if(sessions.openSubagentPanel)sessions.openSubagentPanel(address);else sessions.openSubagent(address);')
}
