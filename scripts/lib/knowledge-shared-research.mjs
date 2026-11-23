const tag = '/* EWORK_KNOWLEDGE_SHARED_RESEARCH */'
const end = '\t\texports.apply = apply;'
const anchors = [
  ['if (internal !== null) {\n\t\t\t\tconst previous = existing.find',
    `if (internal !== null) {
                const ticket=JSON.parse(transfer.getData(SHERLOCK_FILE_DRAG_TYPE)).knowledgeTicket;
                if(ticket!==undefined){
                  if(typeof ticket!=="string"||!preview?.admitKnowledgeFile)throw Error("当前画布无法接收知识库文件。");
                  if(maxNewNodes<=0)throw Error("画布文件数量已达上限。");
                  const nodeId=createId();
                  if(!journalAdmission(nodeId))throw Error("画布文件记录暂时无法保存。");
                  const descriptor=await preview.admitKnowledgeFile(ticket,{sessionId,nodeId});
                  await preview.release({sessionId,nodeId,authorizationId:descriptor.authorizationId,capabilityToken:descriptor.capabilityToken});
                  return [{id:nodeId,name:descriptor.name,path:descriptor.path,source:"sherlock",authorizationId:descriptor.authorizationId,
                    contentType:descriptor.contentType,...(descriptor.previewEligible===false?{previewEligible:false}:{})}];
                }
\t\t\t\tconst previous = existing.find`],
  ['dropQueueRef.current = dropQueueRef.current.catch(() => void 0).then(runDrop);',
    `dropQueueRef.current = dropQueueRef.current.catch(() => void 0).then(runDrop).catch(async error=>{
                  if(dropLifecycle.active)setClipboardFeedback({state:"error",message:error?.message||"未能添加画布文件。"});
                  await Promise.all(workspace.pendingOrphanRevocations().map(revokeOrphanNode));
                });`],
  ['function createResearchWorkspaceSession(storage, sessionId) {',
    'function createResearchWorkspaceSession(storage, sessionId, knowledgeReadOnly = false) {'],
  ['const collaborationCanWrite = () => !sherlockShared(sessionId) || collaborationWritable;',
    'const collaborationCanWrite = () => !knowledgeReadOnly && (!sherlockShared(sessionId) || collaborationWritable);'],
  ['const sharedReadOnly = sherlockShared(sessionId) && boardView?.permissions.edit !== true;',
    'const sharedReadOnly = (typeof sessionId === "string" && sessionId.startsWith("knowledge-view:")) || (sherlockShared(sessionId) && boardView?.permissions.edit !== true);'],
  ['const publish = (next, persist = false, preserveStack = false) => {',
    'const publish = (next, persist = false, preserveStack = false) => {\n                if (knowledgeReadOnly && (next.files !== snapshot.files || next.artifacts !== snapshot.artifacts)) return false;'],
  ['const commitUpdate = (patch, persist = true) => {',
    'const commitUpdate = (patch, persist = true) => {if(knowledgeReadOnly)return false;'],
  ['applyWorkbenchCells(cells,persist=false,previewToken,automatic=false){if(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken)return false;',
    `applyWorkbenchCells(cells,persist=false,previewToken,automatic=false){
      const viewOnly=knowledgeReadOnly&&automatic&&responsiveArrange&&previewToken===researchPreviewArrangeToken;
      if(!viewOnly&&(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken))return false;`],
  ['organizeCanvas(measured = new Map(), arrangeMode="standard",previewToken) {if(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken)return false;',
    `organizeCanvas(measured = new Map(), arrangeMode="standard",previewToken) {
      const viewOnly=knowledgeReadOnly&&arrangeMode==="auto"&&responsiveArrange&&previewToken===researchPreviewArrangeToken;
      if(!viewOnly&&(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken))return false;
      if(viewOnly&&!workbenchGrid.enabled())return false;`],
  ['workbenchGrid.clearContentOverrides();\n      if(!collaborationCanWrite())return false;',
    'workbenchGrid.clearContentOverrides();\n      if(!collaborationCanWrite()&&!viewOnly)return false;']
]

export function stripKnowledgeSharedResearch(source) {
  const start = source.indexOf(tag)
  if (start < 0) return source
  const stop = source.indexOf(end, start)
  if (stop < 0) throw Error('Shared research restore anchor missing')
  return anchors.reduce((text, [before, after]) => text.replace(after, before), source.slice(0, start) + source.slice(stop))
}

export function patchKnowledgeSharedResearch(source) {
  if (source.includes(tag)) return source
  function replace(needle, value) {
    if (!source.includes(needle)) throw Error('Shared knowledge research anchor missing: ' + needle)
    source = source.replace(needle, value)
  }
  for (const [before, after] of anchors) replace(before, after)
  replace(end, `${tag}
if (typeof window !== 'undefined' && window.top === window) {
  let sharedKnowledgeBoard;
  function closeKnowledgeBoard(event) {
    if (!sharedKnowledgeBoard || event && event.detail !== sharedKnowledgeBoard.scope) return;
    const {root, workspace} = sharedKnowledgeBoard;
    sharedKnowledgeBoard = undefined;
    root.unmount();
    workspace.cancelClipboardImports();
  }
  document.addEventListener('sherlock:knowledge-research-view-close', closeKnowledgeBoard);
  document.addEventListener('sherlock:knowledge-research-view', event => {
    const {scope, canvas, layout} = event.detail || {};
    const target = typeof scope === 'string' && /^knowledge-view:[0-9a-f-]{36}$/.test(scope) && document.getElementById(scope);
    if (!target || target.dataset.knowledgeSharedMode !== 'research' || !Array.isArray(canvas?.files) || !Array.isArray(canvas?.artifacts)) return;
    closeKnowledgeBoard();
    const items = new Map([
      [researchCanvasStorageKey(scope), JSON.stringify(canvas.files)],
      [researchCanvasArtifactsStorageKey(scope), JSON.stringify(canvas.artifacts)],
      ['ework.research.preview.v1:' + scope, 'preview'],
      ['ework.research.responsive-arrange.v1:' + scope, 'auto']
    ]);
    for (const [prefix,suffix,value] of layout ?? []) items.set(prefix + scope + suffix, value);
    // Arrangement, zoom and the active page are local view state for this open.
    // No native storage or live collaborative board is bound to the viewer.
    const storage = {getItem:key=>items.get(key) ?? null,setItem:(key,value)=>{items.set(key,value);},removeItem:key=>items.delete(key)};
    const workspace = createResearchWorkspaceSession(storage, scope, true);
    workspace.setPreviewMode = () => false;
    const root = require('react-dom/client').createRoot(target);
    sharedKnowledgeBoard = {scope, root, workspace};
    root.render(react.createElement(ResearchCanvas, {
      sessionId:scope,t:key=>key,researchWorkspaces:{for:()=>workspace}
    }));
    event.preventDefault();
  });
}
${end}`)
  return source
}
