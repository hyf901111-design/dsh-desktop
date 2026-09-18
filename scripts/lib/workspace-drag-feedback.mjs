// Marker updates stay outside the session tree's React render path.
export function createWorkspaceDragFeedback() {
  let active = null, marker = null, side = null
  const clearMarker = () => {
    marker?.classList.remove('qDHVXG_workspaceDropBefore', 'qDHVXG_workspaceDropAfter')
    marker = null; side = null
  }
  return {
    current: () => active,
    set: next => { clearMarker(); active = next },
    hover: (element, id, half) => {
      if (!active) return
      active = { ...active, over: { id, half } }
      if (marker === element && side === half) return
      clearMarker(); marker = element; side = half
      marker.classList.add(half === 'before' ? 'qDHVXG_workspaceDropBefore' : 'qDHVXG_workspaceDropAfter')
    },
    dispose: () => { clearMarker(); active = null }
  }
}
export function patchWorkspaceDragFeedback(source) {
  const marker = '/* odyssey:workspace-drag-feedback:v1 */'
  if (source.includes(marker)) return source
  const exact = (from, to) => { if (!source.includes(from)) throw Error('Workspace drag boundary missing: ' + from.slice(0, 100)); source = source.replace(from, to) }
  exact('function workspaceGroupHalf(e) {', `${marker}\n${createWorkspaceDragFeedback.toString()}\nfunction workspaceGroupHalf(e) {`)
  exact('const [workspaceDrag, setWorkspaceDrag] = (0, react.useState)(null);', `const [workspaceDrag, publishWorkspaceDrag] = (0, react.useState)(null);
      const workspaceFeedback = (0, react.useRef)(null);
      if (!workspaceFeedback.current) workspaceFeedback.current = createWorkspaceDragFeedback();
      const setWorkspaceDrag = next => { workspaceFeedback.current.set(next); publishWorkspaceDrag(next); };
      (0, react.useEffect)(() => () => workspaceFeedback.current.dispose(), []);`)
  exact('if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);', 'const latest = workspaceFeedback.current.current();\nif (latest?.over) commitWorkspaceDrag(latest, latest.over);')
  const start = source.indexOf('const hoverWorkspace = workspaceId === void 0 ? void 0 : (half) => {')
  const end = source.indexOf('const dropWorkspace =', start)
  if (start < 0 || end < start) throw Error('Workspace hover boundary missing')
  source = source.slice(0, start) + `const hoverWorkspace = workspaceId === void 0 ? void 0 : (half, element) => {
        workspaceFeedback.current.hover(element, workspaceId, half);
      };
      ` + source.slice(end)
  exact('hoverWorkspace(workspaceGroupHalf(e));', 'hoverWorkspace(workspaceGroupHalf(e), e.currentTarget);')
  exact('onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {', `onDragEnter: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {
        e.preventDefault(); hoverWorkspace(workspaceGroupHalf(e), e.currentTarget);
      },
      onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {`)
  return source
}
