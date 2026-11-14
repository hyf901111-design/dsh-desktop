// Reconcile after sidebar hydration and tab mutations, not only when entering Research.
export function reconcileResearchConversation(coordinator) {
  const service = coordinator.service;
  const snapshot = service?.getSnapshot?.();
  const sessionId = snapshot?.sessionId;
  if (!sessionId || !(coordinator.stores?.get(sessionId)?.getSnapshot().binding?.active ?? coordinator.previous.has(sessionId))) return;
  const find = node => node?.kind === 'leaf'
    ? node.tabs?.find(tab => tab.id === 'sherlock-research-conversation')
    : node?.children?.map(find).find(Boolean);
  const tab = find(snapshot.state?.splits);
  const activeLeaf = node => node?.kind === 'leaf' ? (node.id === snapshot.state?.activePane ? node : null) : node?.children?.map(activeLeaf).find(Boolean);
  const active = activeLeaf(snapshot.state?.splits)?.active;
  const scope = { sessionId };
  const meta = { sherlockPinned: true, sherlockClosable: false };
  if (!tab) {
    service.openTab({ id: 'sherlock-research-conversation', type: 'sherlock-research-conversation',
      title: coordinator.title, path: 'sherlock://research/conversation', meta }, scope);
    if (active) service.activateTab?.(active, scope);
    // Restoring a resident tab must preserve an explicitly collapsed panel.
    if (snapshot.state?.panelOpen === false) service.setPanelState?.({ open: false }, scope);
  } else if (tab.meta?.sherlockPinned !== true || tab.meta?.sherlockClosable !== false) {
    service.updateTab(tab.id, { meta: { ...tab.meta, ...meta } }, scope);
  }
}
export function patchResearchResidentConversation(source) {
  const marker = '/* sherlock:resident-research-conversation:v1 */';
  const entry = 'service.setPanelState?.({ open: true, width: this.researchWidths.get(sessionId) ?? 340 }, scope);';
  if (!source.includes('/* ework:knowledge-resident-conversation */') && source.includes(entry)) source = source.replace(entry, `/* ework:knowledge-resident-conversation */ if (document.body.dataset.workspaceSurface === 'knowledge') {
                  if (this.previous.get(sessionId)?.open === false) {
                    service.setPanelState?.({ open: false }, scope);
                  }
                } else ${entry}`);
  const reconcileStart=source.indexOf('function reconcileResearchConversation(');
  if(reconcileStart>=0) {
    const end=source.indexOf('const defaultResearchSidebar =',reconcileStart);
    if(end<0)throw Error('Resident conversation function boundary missing');
    source=source.slice(0,reconcileStart)+reconcileResearchConversation.toString()+'\n'+source.slice(end);
  }
  const openAnchor="const scope={sessionId:parent};";
  if(!source.includes('/* sherlock:subagent-keeps-parent-chat:v1 */')) {
    if(source.split(openAnchor).length!==2)throw Error('Subagent parent scope anchor missing');
    source=source.replace(openAnchor,openAnchor+"\n          /* sherlock:subagent-keeps-parent-chat:v1 */\n          reconcileResearchConversation(coordinator);");
  }
  const publishAnchor='this.storeFor(sessionId).update({ binding });';
  if(!source.includes('/* sherlock:research-binding-reconcile:v1 */')) {
    if(source.split(publishAnchor).length!==2)throw Error('Research binding anchor missing');
    source=source.replace(publishAnchor,publishAnchor+'\n                /* sherlock:research-binding-reconcile:v1 */\n                if(binding?.active)queueMicrotask(()=>reconcileResearchConversation(this));');
  }
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
