import {fileEditorLabel,fileEditorMode} from '../../src/shared/file-editor.mjs'

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
  const installed = source.includes(marker);
  if (source.includes('/* odyssey:file-editor-menu */')) return source;
  const start = source.indexOf('function FileTree(props) {');
  const end = source.indexOf('\n\t\t//#endregion', start);
  if (start < 0 || end < start) throw Error('Native file menu tree boundary drifted');
  let tree = source.slice(start, end);
  const anchor = '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {';
  if (!installed) {
    if (tree.split(anchor).length !== 2) throw Error('Native file menu callsite drifted');
    tree = tree.replace(anchor, '(0, react_jsx_runtime.jsx)(SherlockNativeFileMenu, {');
  }
  const items = 'items: [\n\t\t\t\t\t\t...rowMenu?.isDir === false';
  const select = 'if (id === "open-new-tab") {';
  if (tree.split(items).length !== 2 || tree.split(select).length !== 2) throw Error('File editor menu anchors changed');
  tree = tree.replace(items, `items: [
            ...(rowMenu?.isDir === false && sessionId && window.dshDesktop?.openFileInEditor && fileEditorMode(rowMenu.path)
              ? [{id:'open-editor',label:fileEditorLabel(fileEditorMode(rowMenu.path),document.documentElement.dataset.odysseyLocale==='en')}]
              : []),
            ...rowMenu?.isDir === false`);
  tree = tree.replace(select, `if (id === "open-editor") {
              void window.dshDesktop.openFileInEditor(target.path,sessionId,fileEditorMode(target.path)).catch(error=>setEditorOpenError(error.message));
              return;
            }
            ${select}`);
  const state = 'const [rowMenu, setRowMenu] = (0, react.useState)(null);';
  const surface = 'data[root] !== void 0 && renderLevel(root, 1)';
  if (tree.split(state).length !== 2 || tree.split(surface).length !== 2) throw Error('File editor status anchors changed');
  tree = tree.replace(state, state + "\nconst [editorOpenError,setEditorOpenError]=react.useState('');")
    .replace('const target = rowMenu;', "setEditorOpenError('');\nconst target = rowMenu;")
    .replace(surface, "editorOpenError && react_jsx_runtime.jsx('p',{role:'alert',children:editorOpenError}), " + surface);
  const helpers = '/* odyssey:file-editor-menu */\n' + fileEditorMode.toString() + '\n' + fileEditorLabel.toString() + '\n';
  return source.slice(0, start) + (installed ? '' : marker + '\n' + SherlockNativeFileMenu.toString() + '\n') + helpers + tree + source.slice(end);
}
