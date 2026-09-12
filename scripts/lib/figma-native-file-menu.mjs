function SherlockNativeFileMenu(props) {
  const bridge = window.dshDesktop?.showFileContextMenu;
  const latest = react.useRef(props);
  latest.current = props;
  react.useEffect(() => {
    if (!props.open || typeof bridge !== 'function') return;
    let active = true;
    const items = props.items.map(({ id, label, disabled }) => ({ id, label, disabled }));
    bridge(items).then(id => {
      if (!active) return;
      if (id !== null && items.some(item => item.id === id && !item.disabled)) latest.current.onSelect(id);
      else latest.current.onClose();
    }).catch(() => { if (active) latest.current.onClose(); });
    return () => { active = false; };
  }, [props.open, bridge]);
  return typeof bridge === 'function' ? null : react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.Menu, props);
}
export function patchFigmaNativeFileMenu(source) {
  const marker = '/* odyssey:native-file-menu:20260912 */';
  if (source.includes(marker)) return source;
  const start = source.indexOf('function FileTree(props) {');
  const end = source.indexOf('\n\t\t//#endregion', start);
  if (start < 0 || end < start) throw Error('Native file menu tree boundary drifted');
  let tree = source.slice(start, end);
  const anchor = '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {';
  if (tree.split(anchor).length !== 2) throw Error('Native file menu callsite drifted');
  tree = tree.replace(anchor, '(0, react_jsx_runtime.jsx)(SherlockNativeFileMenu, {');
  return source.slice(0, start) + marker + '\n' + SherlockNativeFileMenu.toString() + '\n\t\t' + tree + source.slice(end);
}
