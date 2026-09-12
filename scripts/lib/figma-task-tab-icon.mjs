/** Figma 665:1310 task glyph shared by task tabs and the new-tab menu. */
export function patchFigmaTaskTabIcon(source) {
  if (source.includes('data-odyssey-task-tab-icon')) return source;
  const start = source.indexOf('id: "subagent",');
  const end = source.indexOf('order: 30,', start);
  if (start < 0 || end < start) throw Error('Task tab definition drifted');
  const before = source.slice(start, end);
  const original = '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline16, { size })';
  if (!before.includes(original)) throw Error('Task tab icon boundary drifted');
  const icon = `(0, react_jsx_runtime.jsx)('svg', { width:size,height:size,viewBox:'0 0 17 17',fill:'none','aria-hidden':true,'data-odyssey-task-tab-icon':'',children:(0,react_jsx_runtime.jsxs)('g',{transform:'translate(2.3021 1.59375)',stroke:'currentColor',strokeWidth:1.0625,strokeLinecap:'round',strokeLinejoin:'round',children:[(0,react_jsx_runtime.jsx)('path',{d:'M9.73958 0.53125H2.65625C1.48264 0.53125 0.53125 1.48264 0.53125 2.65625V11.1563C0.53125 12.3299 1.48264 13.2813 2.65625 13.2813H9.73958C10.9132 13.2813 11.8646 12.3299 11.8646 11.1563V2.65625C11.8646 1.48264 10.9132 0.53125 9.73958 0.53125Z'}),(0,react_jsx_runtime.jsx)('path',{d:'M2.65586 4.07282L4.07253 5.48949L6.90586 2.65615M6.19753 9.03115H9.73919M2.65586 9.03115H3.36419'})]})})`;
  return source.slice(0,start)+before.replace(original,icon)+source.slice(end);
}
