// Reconcile after sidebar hydration and tab mutations, not only when entering Research.
export function reconcileResearchConversation(coordinator) {
  const service = coordinator.service;
  const snapshot = service?.getSnapshot?.();
  const sessionId = snapshot?.sessionId;
  if (!sessionId || !coordinator.previous.has(sessionId)) return;
  const find = node => node?.kind === 'leaf'
    ? node.tabs?.find(tab => tab.id === 'sherlock-research-conversation')
    : node?.children?.map(find).find(Boolean);
  const tab = find(snapshot.state?.splits);
  const scope = { sessionId };
  const meta = { sherlockPinned: true, sherlockClosable: false };
  if (!tab) {
    service.openTab({ id: 'sherlock-research-conversation', type: 'sherlock-research-conversation',
      title: coordinator.title, path: 'sherlock://research/conversation', meta }, scope);
  } else if (tab.meta?.sherlockPinned !== true || tab.meta?.sherlockClosable !== false) {
    service.updateTab(tab.id, { meta: { ...tab.meta, ...meta } }, scope);
  }
  if (snapshot.state?.panelOpen !== true) service.setPanelState?.({ open: true }, scope);
}
export function patchResearchResidentConversation(source) {
  const marker = '/* sherlock:resident-research-conversation:v1 */';
  if (source.includes(marker)) return source;
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Research resident conversation anchor missing: '+before);
    source = source.replace(before, after);
  };
  replace('const coordinator = this;', `const coordinator = this;
    ${marker}
    let disposed=false, queued=false;
    const reconcile=()=>{
      if(queued||disposed)return;
      queued=true;
      queueMicrotask(()=>{queued=false;if(!disposed)reconcileResearchConversation(coordinator);});
    };
    const unsubscribeResident=service.subscribeState?.(reconcile);
    reconcile();`);
  replace('unregisterSubagent?.();', 'disposed=true;unsubscribeResident?.();\n          unregisterSubagent?.();');
  replace('const defaultResearchSidebar = new ResearchSidebarCoordinator();', reconcileResearchConversation.toString()+'\nconst defaultResearchSidebar = new ResearchSidebarCoordinator();');
  return source;
}
