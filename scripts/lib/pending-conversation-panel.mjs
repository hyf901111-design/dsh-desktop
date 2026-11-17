const START='/* pending-conversation-panel:start:v1 */',END='/* pending-conversation-panel:end:v1 */'
const exact=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Pending conversation panel anchor drift: '+a.slice(0,100));return s.replace(a,b)}
export function stripPendingConversationPanel(source){const at=source.indexOf(START);if(at<0)return source;const end=source.indexOf(END,at);if(end<0)throw Error('Pending panel journal missing');const pairs=JSON.parse(source.slice(at+START.length,end));source=source.slice(0,at)+source.slice(end+END.length);for(const[a,b]of pairs.reverse())source=exact(source,b,a);return source}
/** Keep a sessionless draft in the existing global store; all UI stays native. */
export function patchPendingConversationPanel(input){
 let source=stripPendingConversationPanel(input);const pairs=[],replace=(a,b)=>{source=exact(source,a,b);pairs.push([a,b])}
 const storeStart=source.indexOf('var SidebarStore = class {'),storeEnd=source.indexOf('\n\t\t//#endregion',storeStart);
 let store=source.slice(storeStart,storeEnd),original=store;
 store=exact(store,'var SidebarStore = class {',`function makePendingPanelState(){
 const state=makeDefaultState(340,false,'editor-home');
 try{state.width=Number(localStorage.getItem('odyssey-global-panel-width'))||340;state.panelOpen=localStorage.getItem('odyssey-pending-chat-open')==='true'}catch{}
 const chat={id:'sherlock-research-conversation',type:'sherlock-research-conversation',title:'对话',meta:{sherlockPinned:true,sherlockClosable:false}};
 state.splits.tabs.unshift(chat);state.splits.active=chat.id;return state;
}
var SidebarStore = class {
 pendingState = makePendingPanelState();
 savePending(state){this.pendingState=state;try{localStorage.setItem('odyssey-pending-chat-open',String(state.panelOpen));localStorage.setItem('odyssey-global-panel-width',String(state.width))}catch{}}
 adoptPending(sessionId){if(typeof sessionId!=='string'||!sessionId||this.snapshot.sessionId!==undefined)return;const state={...this.pendingState};this.bySession.set(sessionId,state);this.schedulePersist(sessionId,state)}
`);
 if(store.split('state: void 0,').length!==3)throw Error('Pending store empty state drift');store=store.replaceAll('state: void 0,','state: this.pendingState,');
 store=store.replaceAll('if (sessionId === void 0 || state === void 0) return;','if (state === void 0) return;');
 store=exact(store,'this.bySession.set(sessionId, draft);','if(sessionId===undefined)this.savePending(draft);else this.bySession.set(sessionId, draft);');
 store=exact(store,'this.schedulePersist(sessionId, draft);','if(sessionId!==undefined)this.schedulePersist(sessionId, draft);');
 store=store.replace('this.bySession.set(sessionId, next);','if(sessionId===undefined)this.savePending(next);else this.bySession.set(sessionId, next);');
 store=store.replace('this.schedulePersist(sessionId, next);','if(sessionId!==undefined)this.schedulePersist(sessionId, next);');
 replace(original,store);
 replace('if (targetSessionId === void 0) return;','if (targetSessionId === void 0 && store.getSnapshot().state === void 0) return;');
 const workbenchStart=source.indexOf('function Workbench(props) {'),workbenchEnd=source.indexOf('\n\t\t//#endregion',workbenchStart);
 const workbench=source.slice(workbenchStart,workbenchEnd);
 let rendered=exact(workbench,'function Workbench(props) {',`function subscribePendingPanelSurface(callback) {
 document.addEventListener('sherlock:workspace-surface-change',callback);
 return () => document.removeEventListener('sherlock:workspace-surface-change',callback);
}
function Workbench(props) {`);
 rendered=exact(rendered,'const { state, tree, newTabOptions, actions, onNewTab, renderTab, getTabIcon, getTabBadge } = props;',`const { state, tree, newTabOptions, actions, onNewTab, renderTab, getTabIcon, getTabBadge, pendingSession } = props;
 const pendingHome=react.useSyncExternalStore(subscribePendingPanelSurface,
  ()=>pendingSession===true && !document.body.dataset.workspaceSurface,()=>false);
 let visibleTree=tree ?? state.splits;
 if(pendingHome && !tree){
  const chatId='sherlock-research-conversation';
  const pane=allLeaves(visibleTree).find(leaf=>leaf.tabs.some(tab=>tab.id===chatId));
  if(pane)visibleTree=mapLeaf(visibleTree,pane.id,leaf=>{
   leaf.tabs=leaf.tabs.filter(tab=>tab.id!==chatId);
   if(leaf.active===chatId)leaf.active=leaf.tabs.at(-1)?.id ?? null;
  });
 }`);
 replace(workbench,exact(rendered,'node: tree ?? state.splits,','node: visibleTree,'));
 const start=source.indexOf('function Sidebar(props) {'),end=source.indexOf('\n\t\t//#endregion',start);if(start<0||end<0)throw Error('Pending panel Sidebar missing');const before=source.slice(start,end);let part=before;
 part=exact(part,'const current = sessionList.current;',`const current = sessionList.current;
 const pendingChat=current===undefined;
 react.useEffect(()=>{const created=event=>store.adoptPending(event.detail?.sessionId);window.addEventListener('sherlock:pending-conversation-created',created);return()=>window.removeEventListener('sherlock:pending-conversation-created',created)},[store]);`);
 part=exact(part,'if (state === void 0 || (!scheduledPanel.active && !workspacePanel.active && sessionId === void 0))','if (state === void 0)');
 const rightWorkbench='(Workbench, {\n\t\t\t\t\t\t\t\t\tstate,\n\t\t\t\t\t\t\t\t\tnewTabOptions:';
 part=exact(part,rightWorkbench,rightWorkbench.replace('newTabOptions:',`pendingSession: pendingChat && !scheduledPanel.active && !workspacePanel.active,
                  newTabOptions:`));
 part=exact(part,'const collapsed = state === void 0 || !state.panelOpen;',`const collapsed = state === void 0 || !state.panelOpen;
 react.useLayoutEffect(()=>{const publish=()=>window.dispatchEvent(new Event('sherlock:global-right-panel-state'));document.body.dataset.odysseyGlobalRightOpen=String(!collapsed);publish();return()=>{delete document.body.dataset.odysseyGlobalRightOpen;publish()}},[collapsed]);`);

 const fallbackStart=part.indexOf('if (state === void 0) return'),fallbackEnd=part.indexOf('const onNewTab',fallbackStart),fallback=part.slice(fallbackStart,fallbackEnd);
 if(fallbackStart<0||fallbackEnd<0)throw Error('Pending panel fallback missing');
 const clickStart=fallback.indexOf('onClick: () => {'),clickEnd=fallback.indexOf('children: /* @__PURE__ */',clickStart);
 if(clickStart<0||clickEnd<0)throw Error('Pending panel fallback click missing');
 part=part.slice(0,fallbackStart)+fallback.slice(0,clickStart)+"onClick: () => store.reduce(state=>({...state,panelOpen:true})),\n"+fallback.slice(clickEnd)+part.slice(fallbackEnd);
 part=exact(part,'(0, react.useEffect)(()=>setCompactPanelOpen(false),[sessionId]);',`const pendingCompactHandoff=react.useRef(false);
 const knowledgeCompactHandoff=react.useRef();
 react.useLayoutEffect(()=>{
  const showChat=({detail})=>{
   const id=detail?.sessionId;
   if(typeof id!=='string'||!id)return;
   if(store.getSnapshot().sessionId===id)setCompactPanelOpen(true);
   else knowledgeCompactHandoff.current=id;
  };
  document.addEventListener('sherlock:knowledge-session-chat',showChat);
  return()=>document.removeEventListener('sherlock:knowledge-session-chat',showChat);
 },[store]);
 const pendingChatOpen=state?.panelOpen===true;
 if(current===undefined)pendingCompactHandoff.current=pendingChatOpen;
 react.useLayoutEffect(()=>{
  const root=document.documentElement;
  const demo=root.dataset.homeGuideTransitionSession===sessionId&&root.hasAttribute('data-home-guide-transition-sidebar');
  setCompactPanelOpen(sessionId!==undefined&&(pendingCompactHandoff.current||knowledgeCompactHandoff.current===sessionId||demo));
  knowledgeCompactHandoff.current=undefined;
  if(sessionId!==undefined)pendingCompactHandoff.current=false;
 },[sessionId]);`);
 replace(before,part);
 return source+START+JSON.stringify(pairs)+END
}
