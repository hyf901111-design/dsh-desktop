import {patchSubagentAvatars,stripSubagentAvatars} from './subagent-avatars.mjs'
import {hasSavedSpreadsheetDraft} from '../../src/shared/spreadsheet/session-draft.mjs'
/** Figma's accepted A header, mode descriptions, task dock and subagent tree. */
function exact(source, before, after) {
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw Error('Figma refinements anchor drifted: ' + before.slice(0,100))
  return source.replace(before, after)
}
export function patchFigmaRefinementPreset(source) {
  source = exact(source, '\t\t\t\t\t\tshownLabel,', '\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { className: "odyssey-mode-label", children: shownLabel }),')
  source = exact(source, '功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。', '具备完整的编码 Agent 能力，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。')
  const start=source.indexOf('function AgentPresetSeat('), end=source.indexOf('\n\t\t//#endregion',start)
  let seat=source.slice(start,end)
  seat=exact(seat,'const [open, setOpen] = (0, react.useState)(false);','const [open, setOpen] = (0, react.useState)(false);\n\t\t\tconst [menuSide, setMenuSide] = (0, react.useState)("bottom");')
  seat=exact(seat,'side: "bottom",','side: menuSide,')
  seat=exact(seat,'onClick: () => {\n\t\t\t\t\t\tsetOpen((value) => !value);','onClick: (event) => {\n\t\t\t\t\t\tconst anchor = event.currentTarget.getBoundingClientRect();\n\t\t\t\t\t\tsetMenuSide(window.innerHeight - anchor.bottom < 220 ? "top" : "bottom");\n\t\t\t\t\t\tsetOpen((value) => !value);')
  return source.slice(0,start)+seat+source.slice(end)
}
export function patchFigmaNavigationTitles(source) {
  const visible = 'function sessionVisible(session, current, archived) {'
  const draft = '|| (["新表格", "New Spreadsheet"].includes(session.title) && hasSavedSpreadsheetDraft(session.id))'
  source=exact(source,visible,hasSavedSpreadsheetDraft.toString()+'\n'+visible)
  source=exact(source,'|| researchSessionEngaged(session.id));','|| researchSessionEngaged(session.id) '+draft+');')
  source = exact(source, 'if (session.title && researchSessionEngaged(session.id)) return session.title;', 'if (session.title?.trim()) return session.title;')
  source = exact(source, 'title: sessionTitle(s),', 'title: sessionTitle(s), explicitTitle: s.title?.trim(),')
  source = exact(source, 'return node.research && node.title === "New Research"', 'if(node.explicitTitle)return node.explicitTitle; return node.research && node.title === "New Research"')

  source = exact(source,
    'className: Rows_module_css_default.title,\n\t\t\t\t\t\t\tchildren: title',
    'className: Rows_module_css_default.title + " odyssey-nav-title",\n\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", { className: "odyssey-nav-title-text", children: title })')
  const projectBefore = 'className: Rows_module_css_default.title,\n\t\t\t\t\t\t\tchildren: label'
  const projectAfter = 'className: Rows_module_css_default.title + " odyssey-nav-title",\n\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", { className: "odyssey-nav-title-text", children: label })'
  if (source.includes(projectAfter) && (source.split(projectAfter).length !== 2 || source.includes(projectBefore))) throw Error('Project title preview installed source drifted or duplicated.')
  return exact(source, projectBefore, projectAfter)
}
export function patchFigmaContextDirectory(source) {
  // The popover belongs to the composer, which can be much narrower than the window.
  source = exact(source,
    'style: { position: "relative", margin: "0 14px", alignSelf: "flex-start", maxWidth: "calc(100% - 28px)" },',
    '"data-research-context-anchor": "", style: { position: "relative", margin: "0 14px", alignSelf: "stretch", minWidth: 0, width: "calc(100% - 28px)", maxWidth: "calc(100% - 28px)" },')
  return exact(source,
    'left: 0, width: "min(320px, calc(100vw - 64px))", boxSizing:',
    'left: 0, width: "min(320px, 100%)", boxSizing:')
}
export function patchFigmaRefinementConversation(source) {
  const marker='/* odyssey:task-dock:20260912 */'
  if (source.includes(marker)) return source
  source = exact(source, 'function TodoPanel({ todos, t }) {', marker+'\n\t\tfunction TodoPanel({ todos, objective, t }) {')
  source = exact(source, 'const [collapsed, setCollapsed] = (0, react.useState)(true);\n\t\t\tif (todos.length === 0)', 'const [collapsed, setCollapsed] = (0, react.useState)(false);\n\t\t\tif (todos.length === 0)')
  source = exact(source, 'children: progressLabel(todos, t)', 'children: t("todo.progress.total", { done: todos.filter(item => item.status === "completed").length, total: todos.length })')
  source = exact(source, '"todo.title": "任务",', '"todo.progress.total": "{done} / {total} 已完成",\n\t\t\t"todo.title": "任务",')
  source = exact(source, '"todo.title": "To-dos",', '"todo.progress.total": "{done} / {total} completed",\n\t\t\t"todo.title": "To-dos",')
  source = exact(source, 'className: TodoPanel_module_css_default.chevron,', 'className: TodoPanel_module_css_default.chevron,')
  const start=source.indexOf('function TodoPanel('), end=source.indexOf('function TodoDock(',start)
  let panel=source.slice(start,end)
  panel=exact(panel, '(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\t\tclassName: TodoPanel_module_css_default.chevron,', '(0, react_jsx_runtime.jsx)("span", { className: "odyssey-task-objective", title: objective, children: objective }),\n\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\t\tclassName: TodoPanel_module_css_default.chevron,')
  panel=panel.replace('children: collapsed ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})','children: collapsed ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {})')
  source=source.slice(0,start)+panel+source.slice(end)
  source=exact(source,'todos: useProjection("todos") ?? [],','todos: useProjection("todos") ?? [],\n\t\t\t\tobjective: useProjection("goal")?.goal?.objective,')
  return source
}
export function patchFigmaRefinementSubagent(source) {
  source=stripSubagentAvatars(source,'catalog')
  for(const [before,after] of [
    ['"count.running.one": "{count} 个子代理，正在运行",','"count.running.one": "{count} 个运行中",'],
    ['"count.running.other": "{count} 个子代理，正在运行",','"count.running.other": "{count} 个运行中",'],
    ['"count.running.one": "{count} subagent running",','"count.running.one": "{count} running",'],
    ['"count.running.other": "{count} subagents running",','"count.running.other": "{count} running",']
  ])source=exact(source,before,after);
  source=exact(source,
    '"aria-label": t(descendants.runningCount > 0 ? runningCountKey : totalCountKey, { count: descendants.runningCount > 0 ? descendants.runningCount : descendantCount }),',
    '"aria-label": [t(totalCountKey, { count: descendantCount }), descendants.runningCount > 0 ? t(runningCountKey, { count: descendants.runningCount }) : null].filter(Boolean).join("，"),');
  source=exact(source,
    '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: entry.activity === "running" ? "ongoing" : "done" })',
    '(0, react_jsx_runtime.jsx)("span", { "data-odyssey-subagent-activity": entry.activity === "running" ? "running" : "idle", "aria-hidden": "true" })');
  source=exact(source,
    'const reserveDisclosure = catalog.entries.some((entry) => entry.kind === "child" && entry.hasChildren);',
    'const reserveDisclosure = true; // Keep labels aligned with the tree disclosure column.');
  const marker='/* odyssey:subagent-tree:20260912 */'
  if(source.includes(marker))return patchSubagentAvatars(source,'catalog')
  source=exact(source,'let react = require("react");','let react = require("react");\n\t\tlet odysseyReactDOM = require("react-dom");\n'+marker)
  source=exact(source,'const secondary = [\n\t\t\t\t\t\tsummary?.title,\n\t\t\t\t\t\tmode,\n\t\t\t\t\t\tactivity\n\t\t\t\t\t].filter((value) => value !== void 0).join(" · ");','const secondary = summary?.title ?? "";')
  source=exact(source,'children: secondary','children: [(0, react_jsx_runtime.jsx)("span", { children: secondary }), (0, react_jsx_runtime.jsx)("span", { className: "odyssey-subagent-state", children: mode + " · " + activity })]')
  const start=source.indexOf('function SubagentCatalogAction('),end=source.indexOf('\n\t\t//#endregion',start)
  let part=source.slice(start,end)
  part=exact(part,'const rootRef = (0, react.useRef)(null);','const rootRef = (0, react.useRef)(null);\n\t\t\tconst menuRef = (0, react.useRef)(null);\n\t\t\tconst [menuPosition, setMenuPosition] = (0, react.useState)({});')
  part=part.replaceAll('treeItems(rootRef.current)','treeItems(menuRef.current)')
  part=exact(part,'!rootRef.current?.contains(event.target)) changeOpen(false);','!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) changeOpen(false);')
  part=exact(part,'if (!visible) return null;',`(0, react.useLayoutEffect)(() => {
        if (!open) return;
        const place = () => {
          const r = triggerRef.current?.getBoundingClientRect();
          if (!r) return;
          const width = Math.min(440, window.innerWidth - 24);
          setMenuPosition({ left: Math.max(12, Math.min(r.left, window.innerWidth-width-12)), top: r.bottom+8, maxHeight: Math.max(100, window.innerHeight-r.bottom-20) });
        };
        place(); window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
      }, [open]);
      if (!visible) return null;`)
  part=exact(part,'open && (0, react_jsx_runtime.jsx)("div", {','open && odysseyReactDOM.createPortal((0, react_jsx_runtime.jsxs)("div", {')
  part=exact(part,'className: SubagentCatalogAction_module_css_default.menu,','className: SubagentCatalogAction_module_css_default.menu, ref: menuRef, style: menuPosition,')
  part=exact(part,'children: (0, react_jsx_runtime.jsx)(CatalogRows, {','children: [(0, react_jsx_runtime.jsx)("div", { className: "odyssey-subagent-menu-title", children: t(totalCountKey, { count: descendantCount }) }), (0, react_jsx_runtime.jsx)(CatalogRows, {')
  part=exact(part,'\t\t\t\t\t})\n\t\t\t\t})]\n\t\t\t});','\t\t\t\t\t})]\n\t\t\t\t}), document.body)]\n\t\t\t});')
  return patchSubagentAvatars(source.slice(0,start)+part+source.slice(end),'catalog')
}

export function patchFigmaRefinementInputTrigger(source) {
  source = source.replace('document.getElementById(optionId(highlight.source, highlight.index))?.scrollIntoView({ block: "nearest" });', `const item = document.getElementById(optionId(highlight.source, highlight.index));
        const viewport = listRef.current?.firstElementChild;
        if (item && viewport) {
          const row = item.getBoundingClientRect(), box = viewport.getBoundingClientRect();
          if (row.top < box.top) viewport.scrollTop -= box.top-row.top;
          else if (row.bottom > box.bottom) viewport.scrollTop += row.bottom-box.bottom;
        }`);

  // The integrated locale patch already owns these labels and dispatch identities.
  if (source.includes('function commandMenuText(')) return source
  const marker='/* odyssey:command-menu:20260912 */'
  if(source.includes(marker))return source
  const names={compact:'压缩历史',export:'导出会话',feedback:'反馈',goal:'任务目标',permission:'权限',plan:'计划模式',model:'模型'}
  const descriptions={compact:'压缩较早的对话历史',export:'将本会话记录下载为 ZIP 压缩包',feedback:'记录对此会话的反馈',goal:'设置或查看长期任务的目标',permission:'切换权限模式与操作审批策略',plan:'进入或退出计划模式',model:'选择本会话使用的模型'}
  source=exact(source,'const zh = {',marker+'\nconst zh = {'+Object.entries(names).map(([key,name])=>JSON.stringify('command.'+key)+':'+JSON.stringify(name)+','+JSON.stringify('command.'+key+'.description')+':'+JSON.stringify(descriptions[key])+',').join(''))
  source=exact(source,'const en = {','const en = {'+Object.keys(names).map(key=>JSON.stringify('command.'+key)+':'+JSON.stringify(key)+',').join(''))
  source=exact(source,'const active = highlight !== null && highlight.source === group.source && highlight.index === index;',`const active = highlight !== null && highlight.source === group.source && highlight.index === index;
      const commandKey = String(item.name).startsWith('/') ? String(item.name).slice(1) : String(item.name);
      const translatedCommand = group.source === 'command' && ${JSON.stringify(Object.keys(names))}.includes(commandKey);
      const displayName = translatedCommand ? t('command.'+commandKey) : item.name;
      const descriptionKey='command.'+commandKey+'.description';
      const translatedDescription=translatedCommand?t(descriptionKey):descriptionKey;
      const displayDescription=translatedDescription!==descriptionKey?translatedDescription:item.description;`)
  source=exact(source,'children: item.name','children: displayName')
  source=exact(source,'children: item.description','children: displayDescription')
  source=exact(source,'"aria-selected": active,','"aria-selected": active, title: displayName + (displayDescription ? " · " + displayDescription : ""),')
  return source
}
