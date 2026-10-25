import {patchSubagentAvatars,stripSubagentAvatars} from './subagent-avatars.mjs'
export async function openComponentProcess(sessions, parentSessionId, childSessionId) {
  if (!parentSessionId || !childSessionId) throw Error('任务尚未启动，暂无子 Agent 过程。')
  await sessions.refreshSubagents(parentSessionId)
  const child = sessions.list.getSnapshot().subagentsByParent?.[parentSessionId]?.entries.find(e => e.kind === 'child' && e.id === childSessionId)
  if (!child) throw Error('未找到此组件的子 Agent 记录，请稍后重试。')
  sessions.openSubagentPanel({ parentSessionId, childSessionId, mode: child.mode })
}
function patchComponentProcessEntry(source) {
  if (source.includes('/* odyssey:component-process-panel */')) return source
  const anchor = 'sessions.openSubagentPanel=openPanel;'
  const listener = `sessions.openSubagentPanel=openPanel;
    /* odyssey:component-process-panel */
    const openComponentProcess=${openComponentProcess.toString().replace('export ', '')};
    const componentProcess=event=>{const d=event.detail;if(!d||d.handled)return;d.handled=true;openComponentProcess(sessions,d.parentSessionId,d.childSessionId).then(d.resolve,d.reject);};
    window.addEventListener('sherlock:component-process',componentProcess);`
  source=exact(source,anchor,listener)
  return exact(source,'if(sessions.openSubagentPanel===openPanel)delete sessions.openSubagentPanel;',"window.removeEventListener('sherlock:component-process',componentProcess);if(sessions.openSubagentPanel===openPanel)delete sessions.openSubagentPanel;")
}
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
    react_jsx_runtime.jsxs('div',{children:[react_jsx_runtime.jsx('span',{'data-odyssey-subagent-activity':session.running?'running':'idle','aria-hidden':true}),address?.mode==='one-shot'?'一次性':'可继续',' · ',session.running?'正在运行':'当前未运行']})
  ]});
}
`;
export function patchSubagentPanelConversation(source) {
  source=stripSubagentAvatars(source,'detail')
  const marker='/* odyssey:subagent-conversation-tab:v1 */'
  if(source.includes(marker))return patchSubagentAvatars(patchComponentProcessEntry(finishSubagentPanelScope(source)),'detail')
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
  return patchSubagentAvatars(patchComponentProcessEntry(finishSubagentPanelScope(source)),'detail')
}

const subagentHeader=`function OdysseySubagentPanelHeader({sessionId,useSession,useSessions,useProjection}) {
  const session=useSession(s=>s),summary=useSessions(s=>s.byId[sessionId]);
  const address=session.subagent?.address;
  const child=useSessions(s=>s.subagentsByParent?.[address?.parentSessionId]?.entries?.find(entry=>entry.kind==='child'&&entry.id===sessionId&&entry.mode===address?.mode));
  const title=child?.label?.trim()||summary?.displayTitle||sessionId;
  const usage=useProjection('tokenUsage'),timing=useProjection('subagentTiming');
  const [now,setNow]=react.useState(Date.now);
  react.useEffect(()=>{if(!session.running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[session.running]);
  const buckets=usage?[usage.uncachedInputTokens,usage.outputTokens,usage.cacheReadTokens,usage.cacheWriteTokens]:[];
  const tokens=buckets.length===4&&buckets.every(Number.isFinite)?buckets.reduce((a,b)=>a+b,0):undefined;
  const duration=timing===undefined?undefined:timing.settledMs+(timing.active?Math.max(0,(session.running?now:timing.active.through)-timing.active.since):0);
  const seconds=Number.isFinite(duration)?Math.floor(Math.max(0,duration)/1000):undefined;
  const metrics=[tokens===undefined?undefined:formatTokens(tokens)+' tok',seconds===undefined?undefined:(seconds>=60?Math.floor(seconds/60)+'分':'')+(seconds%60)+'秒'].filter(x=>x!==undefined).join(' · ');
  return react_jsx_runtime.jsxs('header',{className:'odyssey-subagent-panel-header',children:[
    react_jsx_runtime.jsx('strong',{children:title}),
    react_jsx_runtime.jsxs('div',{className:'odyssey-subagent-panel-state',children:[react_jsx_runtime.jsx('span',{'data-odyssey-subagent-activity':session.running?'running':'idle','aria-hidden':true}),address?.mode==='one-shot'?'一次性':'可继续',' · ',session.running?'正在运行':'当前未运行']}),
    metrics&&react_jsx_runtime.jsx('div',{className:'odyssey-subagent-panel-metrics',children:metrics})
  ]});
}
`;

function finishSubagentPanelScope(source) {
  source=exact(source,'function ConversationRoot({ subagentPanel=false, sessionId,','function ConversationRoot({ subagentPanel=false, useProjection, sessionId,')
  source=exact(source,'OdysseySubagentPanelHeader,{sessionId,useSession,useSessions}', 'OdysseySubagentPanelHeader,{sessionId,useSession,useSessions,useProjection}')
  const a=source.indexOf('function OdysseySubagentPanelHeader(')
  const portal=source.indexOf('/* odyssey:subagent-parent-portals:v1 */',a)
  const b=portal<0?source.indexOf('\nclass ResearchSidebarCoordinator',a):portal-1
  if(a<0||b<a)throw Error('Subagent header boundary missing')
  source=source.slice(0,a)+subagentHeader+source.slice(b)

  source=exact(source, "slots.register({...odysseyConversationOptions,name:'conversation.subagent.panel'},ConversationRoot);", "slots.register({...odysseyConversationOptions,name:'conversation.subagent.panel',children:undefined},ConversationRoot);")
  source=exact(source, "renderSubagent: id=>renderSlot('conversation.subagent.panel',{subagentPanel:true},{sessionId:id}),", "renderSubagent: id=>renderSlot('conversation.subagent.panel',{subagentPanel:true,renderSlot,renderSlotChain},{sessionId:id}),")
  return patchSubagentContinuableComposer(finishSubagentPanelPortal(source))
}
function finishSubagentPanelPortal(source) {
  const marker='/* odyssey:subagent-parent-portals:v1 */'
  if(source.includes(marker))return source
  source=exact(source,"meta:{subagentAddress:address}},scope);","meta:{subagentAddress:address,sherlockPanel:'right'}},scope);")
  source=exact(source,`  const store=react.useMemo(()=>coordinator.storeFor(scope.sessionId),[coordinator,scope.sessionId]);
  const snapshot=react.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);`, '')
  source=exact(source,'  const address=tab.meta?.subagentAddress;',`  const address=tab.meta?.subagentAddress;
  const hostRef=react.useCallback(host=>coordinator.setSubagentHost(scope.sessionId,tab.id,address?.childSessionId,host),[coordinator,scope.sessionId,tab.id,address?.childSessionId]);`)
  source=exact(source,'state.ready&&snapshot.binding?.renderSubagent?snapshot.binding.renderSubagent(address.childSessionId):',"state.ready?react_jsx_runtime.jsx('div',{ref:hostRef,style:{display:'contents'},'data-odyssey-subagent-host':address.childSessionId}):")
  source=exact(source,'class ResearchSidebarCoordinator {',`${marker}
function OdysseySubagentPortals({snapshot,renderSlot,renderSlotChain}) {
  return [...(snapshot.subagentHosts??new Map())].map(([tabId,{childSessionId,host}])=>react_dom.createPortal(
    renderSlot('conversation.subagent.panel',{subagentPanel:true,renderSlot,renderSlotChain},{sessionId:childSessionId}),host,tabId));
}
class ResearchSidebarCoordinator {
  setSubagentHost(sessionId,tabId,childSessionId,host) {
    const store=this.storeFor(sessionId),previous=store.getSnapshot().subagentHosts;
    if(previous?.get(tabId)?.host===host)return;
    const subagentHosts=new Map(previous);
    if(host===null)subagentHosts.delete(tabId);else subagentHosts.set(tabId,{childSessionId,host});
    store.update({subagentHosts});
  }`)
  return exact(source,'}), composerPortal, researchConversationPortal,', '}), composerPortal, researchConversationPortal, react_jsx_runtime.jsx(OdysseySubagentPortals,{snapshot:researchSidebarSnapshot,renderSlot,renderSlotChain}),')
}
// Only this record type requests a right-side destination. Ordinary tabs keep
// following activePane; unlike pinned Research tabs, child records stay closable.
export function patchSubagentPanelDestination(source) {
  // Upgrade existing installs as well as pristine plugin sources.
  source=source.replace("const rightTarget = tab.meta?.sherlockPanel === 'right';","const rightTarget = tab.type === 'sherlock-subagent-conversation' && tab.meta?.sherlockPanel === 'right';");
  source=exact(source,'let targetId = pinned ? firstLeaf(state.splits).id : state.activePane ?? firstLeaf(state.splits).id;',`const rightTarget = tab.type === 'sherlock-subagent-conversation' && tab.meta?.sherlockPanel === 'right';
      let targetId = pinned || (rightTarget && treeOf(state, state.activePane ?? '') === 'bottomSplits') ? firstLeaf(state.splits).id : state.activePane ?? firstLeaf(state.splits).id;`)
  source=exact(source,'if (!pinned) return activateTab(state, leaf.id, existing.id);',"if (!pinned && !(rightTarget && treeOf(state, leaf.id) === 'bottomSplits')) return activateTab(state, leaf.id, existing.id);")
  source=source.replace("const rightTarget = tab.type === 'sherlock-subagent-conversation' && tab.meta?.sherlockPanel === 'right';", "const rightTarget = tab.meta?.sherlockPanel === 'right';");
  return exact(source, 'const openFile = (scope, path, title) => {\n\t\t\t\topenTab({', 'const openFile = (scope, path, title) => {\n\t\t\t\topenTab({meta:{sherlockPanel:"right"},');
}
export function patchSubagentPanelEntry(source, sidebar=false) {
  if(sidebar)return exact(source,'onOpenChild?.(address);\n\t\t\t\ttry {\n\t\t\t\t\tsessions.openSubagent?.(address);',`try {
          if(sessions.openSubagentPanel)sessions.openSubagentPanel(address);
          else {onOpenChild?.(address);sessions.openSubagent?.(address);}`)
  return exact(source,'sessions.openSubagent(address);','if(sessions.openSubagentPanel)sessions.openSubagentPanel(address);else sessions.openSubagent(address);')
}

// Preserve the native draft machine and every control callback. Only the child
// panel changes the presentation; the parent retains its original row elements.
const continuableComposerRow = `
function OdysseySubagentComposerRow({compact,className,children}) {
  const [open,setOpen]=react.useState(false);
  const anchor=react.useRef(null),popup=react.useRef(null);
  const id=react.useId();
  react.useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!anchor.current?.contains(event.target)&&!popup.current?.contains(event.target)&&!event.target?.closest?.('[role=menu],[role=listbox],[role=dialog]'))setOpen(false);};
    const escape=event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setOpen(false);anchor.current?.querySelector('button')?.focus();}};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  if(!compact)return react_jsx_runtime.jsxs('div',{className,children});
  const [leading,trailing]=children;
  const [extensions,model,context,stop,send]=trailing.props.children;
  return react_jsx_runtime.jsxs('div',{className,children:[
    react_jsx_runtime.jsxs('div',{className:'odyssey-subagent-composer-tools',ref:anchor,
      onKeyDown:event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);anchor.current?.querySelector('button')?.focus();}},
      children:[react_jsx_runtime.jsx('button',{type:'button',className:'odyssey-subagent-composer-hint','aria-expanded':open,'aria-controls':id,'aria-label':'可继续发送后续消息，消息工具',onClick:()=>setOpen(value=>!value),children:'可继续发送后续消息'}),
        react_jsx_runtime.jsxs('div',{id,ref:popup,hidden:!open,role:'region','aria-label':'消息工具',className:'odyssey-subagent-composer-popover',children:[leading,extensions,context]})]
    }),
    react_jsx_runtime.jsxs('div',{className:trailing.props.className,children:[stop,send]})
  ]});
}
`;
export function patchSubagentContinuableComposer(source) {
  const marker='/* odyssey:continuable-child-composer:v1 */';
  if(source.includes(marker))return patchSubagentComposerFooter(source);
  source=exact(source,'function InputBar({ useSession,',marker+'\n'+continuableComposerRow+'\n\t\tfunction InputBar({ subagentPanel=false, useSession,');
  source=exact(source,'const inputBar = renderSlot("conversation.composer.bar", {','const inputBar = renderSlot("conversation.composer.bar", {\n                subagentPanel,');
  source=exact(source,'"data-composer-card": true,','"data-composer-card": true,\n                        "data-odyssey-continuable-composer": subagentPanel && continuable || void 0,');
  source=exact(source,'(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\t\t\tclassName: InputBar_module_css_default.row,','(0, react_jsx_runtime.jsxs)(OdysseySubagentComposerRow, {\n                                compact: subagentPanel && continuable,\n\t\t\t\t\t\t\t\tclassName: InputBar_module_css_default.row,');
  return patchSubagentComposerFooter(source);
}

function patchSubagentComposerFooter(source) {
  if(source.includes('/* odyssey:child-command-catalog:v1 */'))return source;
  // The native dock owns live run details. Relocate its React element into the
  // child tools disclosure instead of leaving a second footer below the card.
  source=exact(source,'function OdysseySubagentComposerRow({compact,className,children}) {','function OdysseySubagentComposerRow({compact,className,children,footer}) {');
  source=exact(source,'children:[leading,extensions,context]','children:[leading,extensions,context,footer]');
  source=source.replace('disabled: locked || toggleCommandMenu === void 0 || subagentPanel && continuable && permissions === void 0,','disabled: locked || toggleCommandMenu === void 0,');
  source=exact(source,'compact: subagentPanel && continuable,','compact: subagentPanel && continuable,\n                                footer: subagentPanel && continuable ? footer : void 0,');
  const start=source.indexOf('function InputBar('),end=source.indexOf('\n\t\t//#endregion',start);
  if(start<0||end<start)throw Error('Subagent composer footer boundary missing');
  const input=exact(source.slice(start,end),'\t\t\t\t\tfooter\n\t\t\t\t]','\t\t\t\t\t(subagentPanel && continuable ? null : footer)\n\t\t\t\t]');
  return patchSubagentCommandAvailability(source.slice(0,start)+input+source.slice(end));
}


const childCommandAvailability = `
function useOdysseyChildCommands(sessionId,query) {
  const [state,setState]=react.useState({sessionId,status:'unknown'}),pending=react.useRef(null);
  react.useEffect(()=>()=>pending.current?.abort(),[sessionId]);
  const reload=async selection=>{
    pending.current?.abort();const request=new AbortController();pending.current=request;
    setState({sessionId,status:'loading'});
    try {
      const rows=await query?.(selection,request.signal)??[];
      if(!request.signal.aborted)setState({sessionId,status:rows.length?'available':'empty'});
    } catch {
      if(!request.signal.aborted)setState({sessionId,status:'failed'});
    }
  };
  return {status:state.sessionId===sessionId?state.status:'unknown',reload};
}
`;
function patchSubagentCommandAvailability(source) {
  const marker='/* odyssey:child-command-catalog:v1 */';
  if(source.includes(marker))return source;
  source=exact(source,'function OdysseySubagentComposerRow(',marker+'\n'+childCommandAvailability+'\nfunction OdysseySubagentComposerRow(');
  source=exact(source,'function OdysseySubagentComposerRow({compact,className,children,footer}) {','function OdysseySubagentComposerRow({compact,className,children,footer,onToolsOpen}) {');
  source=exact(source,"onClick:()=>setOpen(value=>!value),children:'可继续发送后续消息'","onClick:()=>{if(!open)onToolsOpen?.();setOpen(value=>!value);},children:'可继续发送后续消息'");
  const start=source.indexOf('function InputBar('),end=source.indexOf('\n\t\t//#endregion',start);
  let input=source.slice(start,end);
  input=exact(input,'resolveSubmitMode, toggleCommandMenu, stop,','resolveSubmitMode, toggleCommandMenu, queryCommandCandidates, stop,');
  input=exact(input,'const inputRef = (0, react.useRef)(null);','const inputRef = (0, react.useRef)(null);\n            const childCommands=useOdysseyChildCommands(sessionId,queryCommandCandidates);');
  input=exact(input,'disabled: locked || toggleCommandMenu === void 0,',"disabled: locked || toggleCommandMenu === void 0 || subagentPanel && continuable && childCommands.status !== 'available',");
  input=exact(input,'footer: subagentPanel && continuable ? footer : void 0,',"footer: subagentPanel && continuable ? footer : void 0,\n                                onToolsOpen:()=>childCommands.reload(inputRef.current===null?{start:0,end:0}:selectionOf(inputRef.current)),");
  input=exact(input,'command: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {\n\t\t\t\t\t\t\t\t\t\t\tlabel: t("input.commands"),',`command: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
                                            label: subagentPanel && continuable && childCommands.status==='failed' ? '命令目录暂不可用，重新打开消息工具可重试' : subagentPanel && continuable && childCommands.status==='empty' ? '当前会话暂无可用命令' : t("input.commands"),`);
  source=source.slice(0,start)+input+source.slice(end);
  source=exact(source,'toggleCommandMenu: inputTriggers === void 0 ? void 0 : (selection) => {',`queryCommandCandidates: inputTriggers === void 0 ? void 0 : (selection,signal)=> {
                            const commands=ctx.get('commandUi');
                            return commands?.candidates(inputTriggers.project(),{query:'',position:shell.snapshot.draft.slice(0,selection.start).trim()===''?'leading':'inline',signal})??[];
                        },
                        toggleCommandMenu: inputTriggers === void 0 ? void 0 : (selection) => {`);
  return source;
}
