function exact(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Inspect sidebar anchor mismatch: ' + before.slice(0, 90))
  return source.replace(before, after)
}
export function patchInspectConversation(source) {
  const marker = '/* sherlock:global-inspect-tabs:v1 */'
  if (source.includes(marker)) return source
  source = exact(source, 'class ResearchSidebarCoordinator {', `${marker}
function OdysseyInspectTab({tab,scope,coordinator}) {
  const store=react.useMemo(()=>coordinator.storeFor(scope.sessionId),[coordinator,scope.sessionId]);
  const snapshot=react.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  return snapshot.binding?.renderDetails?.(tab.meta.inspectTarget) ?? null;
}
class ResearchSidebarCoordinator {
  openDetails(sessionId,target) {
    if(!this.service || !target)return;
    const scope={sessionId};
    const id='inspect:'+sessionId+':'+target.callId;
    this.service.openTab({id,type:'sherlock-inspect-details',title:target.toolName??'Inspect',meta:{sherlockPanel:'right',inspectTarget:target}},scope);
    this.service.setPanelState({open:true},scope);
  }`)
  source = exact(source, 'const unregisterSubagent=service.registerTab(', `const unregisterInspect=service.registerTab({id:'sherlock-inspect-details',title:()=> 'Inspect',hidden:true,single:false,component:props=>react_jsx_runtime.jsx(OdysseyInspectTab,{...props,coordinator})});
                const unregisterSubagent=service.registerTab(`)
  source = exact(source, 'unregisterSubagent?.();', 'unregisterSubagent?.();\n          unregisterInspect?.();')
  source = exact(source, 'active: research,\n', 'active: research,\n                    renderDetails: inspectTarget=>renderSlot("details",{inspectTarget,globalSidebar:true},{sessionId}),\n')
  source = exact(source, 'function DetailsPanel({ useSession,', 'function DetailsPanel({ inspectTarget, globalSidebar=false, useSession,')
  const start=source.indexOf('function DetailsPanel('),end=source.indexOf('\n\t\t//#endregion',start)
  let panel=source.slice(start,end)
  panel=exact(panel,'const selection = useStore((s) => s.selection);','const storedSelection = useStore((s) => s.selection);\n            const selection = inspectTarget ?? storedSelection;')
  panel=exact(panel,'hidden: research,','hidden: globalSidebar || research,')
  panel=exact(panel,'hidden: research && researchRightTab !== "details",','hidden: !globalSidebar && research && researchRightTab !== "details",')
  source=source.slice(0,start)+panel+source.slice(end)
  source=exact(source,'actions.setResearchRightTab("details");\n\t\t\t\t\t\t\tlayout.openDetails();','researchSidebar.openDetails(sessionId,target);')
  source=exact(source,'layout.openDetails();\n\t\t\t\t\t\t\tactions.setInspect({ callId });','researchSidebar.openDetails(sessionId,{callId});\n\t\t\t\t\t\t\tactions.setInspect({ callId });')
  return source
}
export function patchInspectLayout(source) {
  const marker='/* sherlock:single-global-right-sidebar:v1 */'
  if(source.includes(marker))return source
  source=exact(source,'detailsSession === void 0 ? 0 : panels.details);',`0); ${marker}`)
  return exact(source,', (0, react_jsx_runtime.jsx)(DetailsColumn, { children: renderSlot("details", {}) })','')
}
