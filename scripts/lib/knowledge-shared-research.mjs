const tag = '/* EWORK_KNOWLEDGE_SHARED_RESEARCH */'
const end = '\t\texports.apply = apply;'
const anchors = [
  ['function createResearchWorkspaceSession(storage, sessionId) {',
    'function createResearchWorkspaceSession(storage, sessionId, knowledgeReadOnly = false) {'],
  ['const collaborationCanWrite = () => !sherlockShared(sessionId) || collaborationWritable;',
    'const collaborationCanWrite = () => !knowledgeReadOnly && (!sherlockShared(sessionId) || collaborationWritable);'],
  ['const sharedReadOnly = sherlockShared(sessionId) && boardView?.permissions.edit !== true;',
    'const sharedReadOnly = (typeof sessionId === "string" && sessionId.startsWith("knowledge-view:")) || (sherlockShared(sessionId) && boardView?.permissions.edit !== true);']
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
      ['ework.research.preview.v1:' + scope, 'preview']
    ]);
    for (const [prefix,suffix,value] of layout ?? []) items.set(prefix + scope + suffix, value);
    // Panning, zoom and active sheet/page are local view state for this open.
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
