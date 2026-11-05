import { patchFigmaCompactTasks } from './figma-task-compact.mjs'
import { patchFigmaTaskProgress } from './figma-task-progress.mjs'
/** Figma 748:27747: the reading viewport and opaque footer each own space. */
function exact(source, before, after) {
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw Error('Figma reading anchor drifted: ' + before.slice(0, 100))
  return source.replace(before, after)
}
const helpers = `
function conversationHasContentBelow(local, scroller) {
  if(!local||!scroller||scroller.clientHeight<=0)return false;
  const viewport=scroller.getBoundingClientRect(),bottom=viewport.top+scroller.clientTop+scroller.clientHeight;
  const column=local.querySelector('[data-chat-flow]');
  if(!column)return false;
  // The scroll height includes composer clearance and bottom breathing room.
  // Only rendered messages/activity count as content that remains to be read.
  return [...column.children].some(node=>{
    const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
    return rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&rect.bottom>bottom+2;
  });
}
function OdysseyReadingStatus({ listRef, visible, onClick }) {
  const [host, setHost] = react.useState(null);
  const [below,setBelow]=react.useState(false);
  react.useLayoutEffect(() => {
    const local = listRef.current;
    const pane = local?.closest('.sRp_root,.wSkVaW_root');
    setHost(pane?.querySelector('[data-odyssey-reading-status]') ?? null);
  });
  react.useLayoutEffect(()=>{
    const local=listRef.current,scroller=local&&scrollerOf(local);
    if(!local||!scroller){setBelow(false);return;}
    let frame=0;
    const measure=()=>{frame=0;setBelow(conversationHasContentBelow(local,scroller));};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    measure();scroller.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
    const resize=new ResizeObserver(schedule);resize.observe(scroller);resize.observe(local);
    const column=local.querySelector('[data-chat-flow]');if(column)resize.observe(column);
    const mutations=new MutationObserver(schedule);mutations.observe(local,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','open']});
    return()=>{if(frame)cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();scroller.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
  },[listRef,visible]);
  if (!host || !visible || !below) return null;
  const label=document.documentElement.dataset.odysseyLocale==='en'||document.documentElement.lang?.startsWith('en')?'Back to latest':'回到最新';
  return react_dom.createPortal(react_jsx_runtime.jsx('button', {
    type:'button', onClick, 'aria-label':label, title:label,
    children:react_jsx_runtime.jsx('svg', {
      width:20, height:20, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor',
      strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true,
      children:react_jsx_runtime.jsx('path', {d:'M12 4v16m-7-7 7 7 7-7'})
    })
  }), host);
}
function OdysseyRunInfo({ groups }) {
  const text = groups.join('   |   ');
  return react_jsx_runtime.jsx('div', { className:'odyssey-run-info', title:text,
    children:react_jsx_runtime.jsx('span',{className:'odyssey-run-summary',children:text}) });
}
function useOdysseyCompactTasks(ref) {
  const [compact,setCompact] = react.useState(false);
  react.useLayoutEffect(()=>{
    const pane=ref.current?.closest('.sRp_root,.wSkVaW_root');
    if(!pane) return;
    const measure=()=>setCompact(pane.clientHeight < 740);
    measure(); const observer=new ResizeObserver(measure); observer.observe(pane);
    return ()=>observer.disconnect();
  },[]);
  return compact;
}
function OdysseyTaskSheet({children,onClose}) {
  const dialog=react.useRef(null);
  react.useLayoutEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  return react_dom.createPortal(react_jsx_runtime.jsxs('dialog',{
    ref:dialog, className:'odyssey-task-sheet', 'aria-label':'任务清单', onCancel:onClose,
    onClick:e=>{if(e.target===dialog.current){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}},
    children:[react_jsx_runtime.jsxs('header',{children:[react_jsx_runtime.jsx('strong',{children:'任务清单'}),react_jsx_runtime.jsx('button',{type:'button',onClick:onClose,children:'关闭'})]}),children]
  }),document.body);
}
`;
export function patchFigmaReadingConversation(source) {
  source=exact(source,
    'if (destination === null || composerPortalHost.parentElement === destination) return;',
    'if (destination === null || !destination.isConnected) { composerPortalHost.remove(); publishComposerHeight(0); return; }\n\t\t\t\tif (composerPortalHost.parentElement === destination) return;');
  const marker='/* odyssey:reading-layout:20260912 */';
  if(source.includes(marker)) {
    const a=source.indexOf('function conversationHasContentBelow(')>=0?source.indexOf('function conversationHasContentBelow('):source.indexOf('function OdysseyReadingStatus('), b=source.indexOf('function useOdysseyCompactTasks(',a);
    const h=helpers.indexOf('function conversationHasContentBelow('), e=helpers.indexOf('function useOdysseyCompactTasks(',h);
    if(a<0||b<a)throw Error('Reading status/run info boundary drifted');
    source=source.slice(0,a)+helpers.slice(h,e)+source.slice(b);
    return patchFigmaCompactTasks(patchFigmaTaskProgress(source));
  }
  source=exact(source,'function scrollerOf(from) {\n\t\t\treturn from.closest("[data-conversation-scroll]") ?? from;', 'function scrollerOf(from) {\n\t\t\treturn from.closest(".sRp_messages,[data-conversation-scroll]") ?? from;');
  source=exact(source,'return appendedUser || appendedSteering || runningStarted || tipMoved && atBottom;', 'return appendedUser || (appendedSteering || runningStarted || tipMoved) && atBottom;');
  source=exact(source,'if (saved === null || runningStarted) toBottom(el);','if (saved === null) toBottom(el);');
  source=exact(source,'ref: centerComposerHostRef,\n\t\t\t\t\t"data-center-composer-host": ""','"data-odyssey-reading-status": ""\n\t\t\t\t}), (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tref: centerComposerHostRef,\n\t\t\t\t\t"data-center-composer-host": ""');
  source=exact(source,'ref: composerHostRef,\n\t\t\t\t\t\tclassName: "sRp_composer",','"data-odyssey-reading-status": ""\n\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tref: composerHostRef,\n\t\t\t\t\t\tclassName: "sRp_composer",');
  const start=source.indexOf('!atBottom && (0, react_jsx_runtime.jsx)("div", {');
  const end=source.indexOf('\n\t\t\t\t\t})]',start)+ '\n\t\t\t\t\t})'.length;
  if(start<0||end<start)throw Error('Missing reading status');
  source=source.slice(0,start)+`(0, react_jsx_runtime.jsx)(OdysseyReadingStatus, { listRef, visible:!atBottom, onClick:()=>{const local=listRef.current;if(local)toBottom(scrollerOf(local));} })`+source.slice(end);
  source=exact(source,'const host = target?.closest?.("[data-conversation-scroll]") ?? null;', 'const pane = target?.closest?.(".sRp_root,.wSkVaW_root");\n\t\t\tconst host = pane?.querySelector?.(".sRp_messages,.wSkVaW_scrollBody") ?? target?.closest?.("[data-conversation-scroll]") ?? null;');
  // A single summary with a real disclosure replaces the clipped metrics sentence.
  const statsStart=source.indexOf('const line = groups.join(" | ");');
  const statsEnd=source.indexOf('\n\t\t});',statsStart);
  source=source.slice(0,statsStart)+`const running=useSession(s=>s.running);
    if(groups.length===0)return null;
    return react_jsx_runtime.jsx(OdysseyRunInfo,{groups,running});`+source.slice(statsEnd);
  // Keep task state local; compact mode shows the same live list in a right sheet.
  const a=source.indexOf('function TodoPanel('),b=source.indexOf('function TodoDock(',a);
  let todo=source.slice(a,b);
  todo=exact(todo,'const [collapsed, setCollapsed] = (0, react.useState)(false);',`const [collapsed, setCollapsed] = react.useState(()=>todos.length>0 && todos.every(item=>item.status==='completed'));
    const rootRef=react.useRef(null), compact=useOdysseyCompactTasks(rootRef);
    const [sheet,setSheet]=react.useState(false);
    const folded=collapsed||compact;
    const initialized=react.useRef(todos.length>0);
    react.useEffect(()=>{if(!initialized.current && todos.length){initialized.current=true;setCollapsed(todos.every(item=>item.status==='completed'));}},[todos]);`);
  todo=exact(todo,'className: TodoPanel_module_css_default.root,','className: TodoPanel_module_css_default.root, ref:rootRef, "data-odyssey-task-collapsed":folded,');
  todo=todo.replace('"aria-expanded": !collapsed,','"aria-expanded": compact ? sheet : !collapsed,');
  todo=todo.replace('setCollapsed((v) => !v);','if(compact)setSheet(true);else setCollapsed((v) => !v);');
  todo=todo.replace('children: collapsed ?','children: folded ?');
  const listStart=todo.indexOf('!collapsed && (0, react_jsx_runtime.jsx)("ul", {');
  const listEnd=todo.indexOf('\n\t\t\t\t\t})]',listStart)+'\n\t\t\t\t\t})'.length;
  const list=todo.slice(listStart+'!collapsed && '.length,listEnd);
  todo=todo.slice(0,listStart)+`!folded && taskList, sheet && react_jsx_runtime.jsx(OdysseyTaskSheet,{onClose:()=>setSheet(false),children:taskList})`+todo.slice(listEnd);
  todo=todo.replace('if (todos.length === 0) return null;',`if (todos.length === 0) return null;\nconst taskList=${list};`);
  source=source.slice(0,a)+todo+source.slice(b);
  return patchFigmaCompactTasks(patchFigmaTaskProgress(source.replace('function scrollerOf(', marker+'\n'+helpers+'\n\t\tfunction scrollerOf(')));
}
export function patchFigmaReadingTables(source) {
  const marker='/* odyssey:reading-table:20260912 */';
  if(source.includes(marker))return source;
  const a=source.indexOf('function renderTable(node, key, context) {'),b=source.indexOf('function renderTableRow(',a);
  if(a<0||b<a)throw Error('Missing markdown table renderer');
  const old=source.slice(a,b);
  const table=old.slice(old.indexOf('children: jsxs("table", {')+'children: '.length,old.lastIndexOf('\n\t}, key);'));
  const helper=`${marker}
function OdysseyReadingTable({children}) {
 const viewport=useRef(null), dialog=useRef(null), [wide,setWide]=useState(false);
 useEffect(()=>{const el=viewport.current;if(!el)return;const measure=()=>setWide(el.scrollWidth>el.clientWidth+1);measure();const ro=new ResizeObserver(measure);ro.observe(el);if(el.firstElementChild)ro.observe(el.firstElementChild);return()=>ro.disconnect();},[children]);
 return jsxs('div',{className:'odyssey-table-block',children:[
  jsx('div',{ref:viewport,className:MarkdownText_module_css_default.tableScroll,tabIndex:wide?0:undefined,'aria-label':wide?'表格，可横向滚动':undefined,children}),
  wide&&jsxs('div',{className:'odyssey-table-actions',children:[jsx('span',{children:'左右滚动查看完整列'}),jsx('button',{type:'button',onClick:()=>dialog.current?.showModal(),children:'打开完整表格 ↗'})]}),
  jsxs('dialog',{ref:dialog,className:'odyssey-table-dialog','aria-label':'完整表格',children:[jsx('button',{type:'button',onClick:()=>dialog.current?.close(),children:'关闭'}),jsx('div',{className:MarkdownText_module_css_default.tableScroll,tabIndex:0,children})]})
 ]});
}
function renderTable(node,key,context) {
 const align=node.align??null; const [headRow,...bodyRows]=node.children;
 return jsx(OdysseyReadingTable,{children:${table}},key);
}
`;
  return source.slice(0,a)+helper+source.slice(b);
}

/** The web shell bundles primitives; updating the package entry alone does not
 * update the renderer that plugin slots receive at runtime. Reuse its component. */
export function patchFigmaReadingWeb(source, primitives) {
  const marker='/* odyssey:reading-web-table:20260912 */'
  if(source.includes(marker))return source
  const start=primitives.indexOf('function OdysseyReadingTable(')
  const end=primitives.indexOf('function renderTable(node,key,context)',start)
  if(start<0||end<start)throw Error('Missing shared table component')
  const component=primitives.slice(start,end)
    .replace(/\b(useRef|useState|useEffect)\(/g,'R.$1(')
    .replace(/\b(jsx|jsxs)\(/g,'f.$1(')
    .replaceAll('MarkdownText_module_css_default.tableScroll','S1.tableScroll')
  const before='function kp(n,r,i){const s=n.align??null,[u,...c]=n.children;return f.jsx("div",{className:S1.tableScroll,children:'
  return exact(source,before,marker+'\n'+component+'\nfunction kp(n,r,i){const s=n.align??null,[u,...c]=n.children;return f.jsx(OdysseyReadingTable,{children:')
}
