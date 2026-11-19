import {patchPendingConversationPanel,stripPendingConversationPanel} from './pending-conversation-panel.mjs'
import { patchResearchTabIcons } from './research-tab-icons.mjs'
import { patchSidebarSystemTitles } from './sidebar-system-titles.mjs'
import { patchSidebarFileRefresh, patchSidebarRefreshFeedback } from './sidebar-file-refresh.mjs'
import { patchSubagentPanelDestination, patchSubagentPanelEntry } from './figma-subagent-panel.mjs'
import {patchSubagentAvatars} from './subagent-avatars.mjs'
import { patchFigmaTaskTabIcon } from './figma-task-tab-icon.mjs'
import { patchFigmaNativeFileMenu } from './figma-native-file-menu.mjs'
import { readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { patchSidebarPdfPreview } from './sidebar-pdf-preview.mjs'
import { patchSidebarFileReference } from './sidebar-file-reference.mjs'
import { patchSidebarPptxToolbar } from './sidebar-pptx-toolbar.mjs'
import { patchSidebarKnowledgePreview } from './sidebar-knowledge-preview.mjs'

const PATCH_MARKER = '/* sherlock:pinned-sidebar-tabs:v1 */'
const RECONCILE_PATCH_MARKER = '/* sherlock:pinned-sidebar-reconcile:v1 */'
const EDGE_PATCH_MARKER = '/* sherlock:pinned-sidebar-edge:v1 */'
const FILE_DRAG_PATCH_MARKER = '/* sherlock:files-to-research-canvas:v2 */'
const LEGACY_FILE_DRAG_PATCH_MARKER = '/* sherlock:files-to-research-canvas:v1 */'
const PANEL_SURFACE_SYNC_PATCH_MARKER = '/* sherlock:panel-surface-sync:v1 */'
const PANEL_DRAG_DIMENSION_PATCH_MARKER = '/* sherlock:panel-drag-dimensions:v1 */'
const PANEL_WINDOW_POINTER_FALLBACK_PATCH_MARKER = '/* sherlock:panel-window-pointer-fallback:v1 */'
const RESEARCH_GENERATION_FOCUS_PATCH_MARKER = '/* sherlock:research-generation-keeps-conversation:v1 */'
const FIGMA_PANEL_LAYOUT_PATCH_MARKER = '/* sherlock:figma-panel-layout:v1 */'
const FIGMA_FILE_PANEL_PATCH_MARKER = '/* sherlock:figma-file-panel:v1 */'
const FIGMA_PANEL_DEFAULT_WIDTH_PATCH_MARKER = '/* sherlock:figma-panel-default-width:v1 */'
const FIGMA_PANEL_PENDING_PATCH_MARKER = '/* sherlock:figma-panel-no-session-pending:v1 */'
const FIGMA_BOTTOM_CLOSE_PATCH_MARKER = '/* sherlock:figma-bottom-close:v1 */'
const FIGMA_PANEL_MOTION_SYNC_PATCH_MARKER = '/* sherlock:figma-panel-motion-sync:v1 */'

export function sherlockResearchGenerationOwnsFocus(state, doc = globalThis.document) {
  const hasResearch = node => node?.kind === 'leaf'
    ? node.tabs?.some(tab => tab.id === 'sherlock-research-conversation' && tab.meta?.sherlockPinned === true)
    : node?.children?.some(hasResearch)
  if (!hasResearch(state?.splits)) return false
  return !!doc?.querySelector('[data-research-canvas] [data-research-generation-state="queued"], [data-research-canvas] [data-research-generation-state="running"]')
}

function replaceExact(source, before, after, label, expectedCount = 1) {
  const count = source.split(before).length - 1
  if (count !== expectedCount) {
    throw new Error(`Unable to patch Better Sidebar ${label}: expected ${expectedCount}, found ${count}`)
  }
  return source.split(before).join(after)
}

// Keep the new-tab menu outside the horizontal scroller. A sticky transparent
// trigger inside that scroller allows long tab titles to paint beneath it.
function patchTabBarMenuLayout(source) {
  const marker = '/* sherlock:tabbar-independent-menu:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('\t\tfunction TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw new Error('Unable to patch Better Sidebar TabBar layout boundary')
  let tabBar = source.slice(start, end)
  tabBar = replaceExact(tabBar,
    'return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: clsx(sidebar_module_css_default.tabBar,',
    'return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: clsx(sidebar_module_css_default.tabBar,',
    'TabBar sibling render')
  tabBar = replaceExact(tabBar,
    '\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tref: listRef,\n\t\t\t\t\tclassName: sidebar_module_css_default.tabList,\n\t\t\t\t\tchildren: [tabs.map(',
    '\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tref: listRef,\n\t\t\t\t\tclassName: sidebar_module_css_default.tabList,\n\t\t\t\t\tchildren: tabs.map(',
    'TabBar scrollable tabs')
  tabBar = replaceExact(tabBar,
    '\t\t\t\t\t}, tab.id); }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
    '\t\t\t\t\t}, tab.id); })\n\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
    'TabBar independent menu')
  tabBar = replaceExact(tabBar,
    '\t\t\t\t\t})]\n\t\t\t\t})\n\t\t\t});',
    '\t\t\t\t\t})]\n\t\t\t});',
    'TabBar sibling closure')
  tabBar = tabBar.replace('function TabBar(props) {', 'function TabBar(props) {\n\t\t\t' + marker)
  return source.slice(0, start) + tabBar + source.slice(end)
}

function patchTabBarOverflow(source) {
  const marker = '/* sherlock:figma-tab-overflow:v1 */'
  if (source.includes(marker)) return patchTabOverflowGutter(source)
  source = replaceExact(source, 'newTab: "新建标签页",', 'newTab: "新建标签页",\n\t\t\topenTabs: "已打开的页签",', 'overflow zh locale')
  source = replaceExact(source, 'newTab: "New tab",', 'newTab: "New tab",\n\t\t\topenTabs: "Open tabs",', 'overflow en locale')
  const start = source.indexOf('\t\tfunction TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw new Error('Unable to patch Better Sidebar overflow boundary')
  let tabBar = source.slice(start, end)
  tabBar = replaceExact(tabBar,
    '\t\t\t/* sherlock:tabbar-independent-menu:v1 */',
    `\t\t\t/* sherlock:tabbar-independent-menu:v1 */
\t\t\t${marker}`,
    'overflow marker')
  tabBar = replaceExact(tabBar,
    `\t\t\tconst middlePressed = (0, react.useRef)(null);
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tonCloseRef.current = onClose;
\t\t\t});`,
    `\t\t\tconst middlePressed = (0, react.useRef)(null);
\t\t\tconst overflowTriggerRef = (0, react.useRef)(null);
\t\t\tconst overflowMenuRef = (0, react.useRef)(null);
\t\t\tconst tabNodes = (0, react.useRef)(/* @__PURE__ */ new Map());
\t\t\tconst [hasOverflow, setHasOverflow] = (0, react.useState)(false);
\t\t\tconst [overflowOpen, setOverflowOpen] = (0, react.useState)(false);
\t\t\tconst closeOverflowMenu = () => {
\t\t\t\tsetOverflowOpen(false);
\t\t\t\trequestAnimationFrame(() => overflowTriggerRef.current?.focus());
\t\t\t};
\t\t\tconst closeTabAndRestore = (tabId) => {
\t\t\t\tconst index = tabs.findIndex((tab) => tab.id === tabId);
\t\t\t\tconst fallback = active === tabId ? tabs[index + 1] ?? tabs[index - 1] : tabs.find((tab) => tab.id === active);
\t\t\t\tonClose(tabId);
\t\t\t\tif (fallback !== void 0) requestAnimationFrame(() => tabNodes.current.get(fallback.id)?.focus());
\t\t\t};
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tonCloseRef.current = closeTabAndRestore;
\t\t\t});
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tconst el = listRef.current;
\t\t\t\tif (el === null) return;
\t\t\t\tlet frame = null;
\t\t\t\tconst measure = () => {
\t\t\t\t\tframe = null;
\t\t\t\t\tconst tabsWidth = Array.from(el.querySelectorAll("[data-odyssey-panel-tab]")).reduce((sum, node) => sum + node.offsetWidth, 0);
\t\t\t\t\tsetHasOverflow(tabsWidth > el.clientWidth + 1);
\t\t\t\t};
\t\t\t\tconst schedule = () => {
\t\t\t\t\tif (frame === null) frame = requestAnimationFrame(measure);
\t\t\t\t};
\t\t\t\tconst observer = new ResizeObserver(schedule);
\t\t\t\tobserver.observe(el);
\t\t\t\tfor (const node of el.querySelectorAll("[data-odyssey-panel-tab]")) observer.observe(node);
\t\t\t\tmeasure();
\t\t\t\treturn () => {
\t\t\t\t\tobserver.disconnect();
\t\t\t\t\tif (frame !== null) cancelAnimationFrame(frame);
\t\t\t\t};
\t\t\t}, [tabs]);
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (hasOverflow) return;
\t\t\t\tsetOverflowOpen(false);
\t\t\t}, [hasOverflow]);
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (!overflowOpen) return;
\t\t\t\tconst onPointerDown = (event) => {
\t\t\t\t\tconst target = event.target;
\t\t\t\t\tif (overflowMenuRef.current?.contains(target) || overflowTriggerRef.current?.contains(target)) return;
\t\t\t\t\tcloseOverflowMenu();
\t\t\t\t};
\t\t\t\tconst onKeyDown = (event) => {
\t\t\t\t\tif (event.key !== "Escape") return;
\t\t\t\t\tevent.preventDefault();
\t\t\t\t\tcloseOverflowMenu();
\t\t\t\t};
\t\t\t\tdocument.addEventListener("pointerdown", onPointerDown, true);
\t\t\t\tdocument.addEventListener("keydown", onKeyDown);
\t\t\t\treturn () => {
\t\t\t\t\tdocument.removeEventListener("pointerdown", onPointerDown, true);
\t\t\t\t\tdocument.removeEventListener("keydown", onKeyDown);
\t\t\t\t};
\t\t\t}, [overflowOpen]);`,
    'overflow state and lifecycle')
  tabBar = replaceExact(tabBar,
    '\t\t\t\t\tchildren: tabs.map((tab) => {',
    '\t\t\t\t\tchildren: [tabs.map((tab) => {',
    'overflow tab list children')
  tabBar = replaceExact(tabBar,
    `\t\t\t\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.tab, active === tab.id && sidebar_module_css_default.tabActive),`,
    `\t\t\t\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\t\tref: (node) => {
\t\t\t\t\t\t\tif (node === null) tabNodes.current.delete(tab.id);
\t\t\t\t\t\t\telse tabNodes.current.set(tab.id, node);
\t\t\t\t\t\t},
\t\t\t\t\t\trole: "tab",
\t\t\t\t\t\t"aria-selected": active === tab.id,
\t\t\t\t\t\ttabIndex: active === tab.id ? 0 : -1,
\t\t\t\t\t\t"data-odyssey-panel-tab": true,
\t\t\t\t\t\t"data-odyssey-panel-tab-id": tab.id,
\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.tab, active === tab.id && sidebar_module_css_default.tabActive),`,
    'overflow tab identity')
  tabBar = replaceExact(tabBar,
    `\t\t\t\t\t\t\t\t\tevent.stopPropagation();
\t\t\t\t\t\t\t\t\tonClose(tab.id);`,
    `\t\t\t\t\t\t\t\t\tevent.stopPropagation();
\t\t\t\t\t\t\t\t\tcloseTabAndRestore(tab.id);`,
    'overflow close focus restore')
  tabBar = replaceExact(tabBar,
    `\t\t\t\t\t}, tab.id); })
\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {`,
    `\t\t\t\t\t}, tab.id); }), hasOverflow && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\tref: overflowTriggerRef,
\t\t\t\t\t\t"data-odyssey-tab-overflow-trigger": true,
\t\t\t\t\t\t"aria-label": t("openTabs"),
\t\t\t\t\t\t"aria-expanded": overflowOpen,
\t\t\t\t\t\t"aria-haspopup": "menu",
\t\t\t\t\t\tonClick: () => setOverflowOpen((value) => !value),
\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
\t\t\t\t\t\t\twidth: 16,
\t\t\t\t\t\t\theight: 16,
\t\t\t\t\t\t\tviewBox: "0 0 16 16",
\t\t\t\t\t\t\t"aria-hidden": true,
\t\t\t\t\t\t\tchildren: [4, 8, 12].map((cx) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", { cx, cy: 8, r: 1, fill: "currentColor" }, cx))
\t\t\t\t\t\t})
\t\t\t\t\t})]
\t\t\t\t}), overflowOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\tref: overflowMenuRef,
\t\t\t\t\trole: "menu",
\t\t\t\t\t"data-odyssey-tab-overflow-menu": true,
\t\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\t\t"data-odyssey-tab-overflow-heading": true,
\t\t\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("openTabs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tabs.length })]
\t\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { "data-odyssey-tab-overflow-divider": true }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\t\t\t"data-odyssey-tab-overflow-list": true,
\t\t\t\t\t\tchildren: tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
\t\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\t\trole: "menuitemradio",
\t\t\t\t\t\t\t"aria-checked": active === tab.id,
\t\t\t\t\t\t\t"data-odyssey-tab-overflow-option": tab.id,
\t\t\t\t\t\t\tonClick: () => {
\t\t\t\t\t\t\t\tonActivate(tab.id);
\t\t\t\t\t\t\t\tcloseOverflowMenu();
\t\t\t\t\t\t\t},
\t\t\t\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-odyssey-tab-overflow-icon": true, children: getTabIcon?.(tab) ?? null }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-odyssey-tab-overflow-title": true, children: tab.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-odyssey-tab-overflow-check": true, children: active === tab.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null })]
\t\t\t\t\t\t}, tab.id))
\t\t\t\t\t})]
\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {`,
    'overflow trigger and menu')
  return patchTabOverflowGutter(source.slice(0, start) + tabBar + source.slice(end))
}

function patchTabOverflowGutter(source) {
  const marker = '/* sherlock:figma-tab-overflow-gutter:v2 */'
  if (source.includes(marker)) return patchTabOverflowMeasurement(source)
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  let tabBar = source.slice(start, end)
  tabBar = replaceExact(tabBar, 'children: [tabs.map((tab) => {', 'children: tabs.map((tab) => {', 'overflow scroller children')
  tabBar = replaceExact(tabBar, '}, tab.id); }), hasOverflow &&', '}, tab.id); })\n\t\t\t\t}), hasOverflow &&', 'overflow reserved sibling')
  tabBar = replaceExact(tabBar, '\t\t\t\t\t})]\n\t\t\t\t}), overflowOpen &&', '\t\t\t\t\t}), overflowOpen &&', 'overflow sibling closure')
  tabBar = replaceExact(tabBar, 'setHasOverflow(tabsWidth > el.clientWidth + 1);',
    'const reserved = overflowTriggerRef.current ? 32 : 0;\n' +
    '                    setHasOverflow(tabsWidth + Math.max(0, tabs.length - 1) * 4 > el.clientWidth + reserved + 1);', 'overflow stable measurement')
  // Keep the active title and independent close inside the newly available viewport.
  tabBar = tabBar.replace('function TabBar(props) {', 'function TabBar(props) {\n' + marker)
  tabBar = tabBar.replace('const closeOverflowMenu = () => {', `(0, react.useLayoutEffect)(() => {
    const el = listRef.current;
    const node = tabNodes.current.get(active);
    if (!el || !node) return;
    const reveal = () => {
      const left = node.offsetLeft, right = left + node.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, tabs, hasOverflow]);
  const closeOverflowMenu = () => {`)
  return patchTabOverflowMeasurement(source.slice(0, start) + tabBar + source.slice(end))
}

function patchTabOverflowMeasurement(source) {
  const marker = '/* sherlock:figma-tab-overflow-measurement:v3 */'
  if (source.includes(marker)) return patchTabClippedControls(source)
  return patchTabClippedControls(replaceExact(source,
    'const reserved = overflowTriggerRef.current ? 32 : 0;\n' +
    '                    setHasOverflow(tabsWidth + Math.max(0, tabs.length - 1) * 4 > el.clientWidth + reserved + 1);',
    `${marker}
                    const gap = parseFloat(window.getComputedStyle(el).columnGap) || 0;
                    const trigger = overflowTriggerRef.current;
                    const reserved = trigger ? trigger.offsetWidth + (parseFloat(window.getComputedStyle(el.parentElement).columnGap) || 0) : 0;
                    setHasOverflow(tabsWidth + Math.max(0, tabs.length - 1) * gap > el.clientWidth + reserved + 1);`,
    'overflow measurement independent of trigger visibility'))
}

function patchTabClippedControls(source) {
  source = source.replace("setHasOverflow(tabsWidth + Math.max(0, tabs.length - 1) * gap > el.clientWidth + reserved + 1);", "setHasOverflow(tabs.length > 1);");
  if (!source.includes('el.style.setProperty("--odyssey-tab-count"')) source = source.replace("setHasOverflow(tabs.length > 1);", "el.style.setProperty(\"--odyssey-tab-count\", String(tabs.length)); setHasOverflow(tabs.length > 1);");
  const marker = '/* sherlock:figma-tab-clipped-controls:v1 */'
  if (source.includes(marker)) return source
  return replaceExact(source, `    const reveal = () => {
      const left = node.offsetLeft, right = left + node.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => observer.disconnect();`, `    ${marker}
    const updateClipping = () => {
      for (const tab of tabNodes.current.values()) {
        const clipped = tab.offsetLeft < el.scrollLeft - 1 || tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth + 1;
        tab.setAttribute("data-odyssey-tab-clipped", String(clipped));
      }
    };
    const reveal = () => {
      const left = node.offsetLeft, right = left + node.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
      updateClipping();
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    el.addEventListener("scroll", updateClipping, { passive:true });
    return () => { observer.disconnect(); el.removeEventListener("scroll", updateClipping); };`, 'hide close controls of partially clipped tabs')
}

/**
 * Extend the bundled Better Sidebar runtime with the small host contract used
 * by Research mode. The transform is deliberately exact so a plugin upgrade
 * fails packaging instead of silently shipping a half-compatible sidebar.
 */
function patchPanelToggleGlyphs(source) {
  const marker = '/* sherlock:figma-panel-toggle-glyphs:v1 */'
  if (source.includes(marker)) return source
  const outer = 'M12 2.66602H4C2.89543 2.66602 2 3.56145 2 4.66602V11.3327C2 12.4373 2.89543 13.3327 4 13.3327H12C13.1046 13.3327 14 12.4373 14 11.3327V4.66602C14 3.56145 13.1046 2.66602 12 2.66602Z'
  for (const [name, direction, divider] of [
    ['IconPanelRightOutline16', 'right', 'M10.6666 2.66602V13.3327'],
    ['IconPanelBottomOutline16', 'bottom', 'M2 10H14']
  ]) {
    const pattern = new RegExp('const ' + name + ' = [\\s\\S]*?\\n\\t\\t\\}\\);')
    if ((source.match(new RegExp('const ' + name + ' = ', 'g')) || []).length !== 1 || !pattern.test(source)) throw new Error('Unable to patch Figma panel glyph ' + name)
    source = source.replace(pattern, `const ${name} = ({ size = 16, className, active = false }) => (0, react_jsx_runtime.jsxs)("svg", {
      width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg",
      "data-odyssey-panel-toggle": "${direction}", "data-odyssey-panel-active": active,
      children: [${[outer,divider].map(d => `(0, react_jsx_runtime.jsx)("path", {d: ${JSON.stringify(d)}, stroke: "currentColor", strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round"})`).join(',')}]
    });`)
  }
  for (const [icon, field] of [['IconPanelRightOutline16', 'panelOpen'], ['IconPanelBottomOutline16', 'bottomOpen']]) {
    const anchor = '(0, react_jsx_runtime.jsx)(' + icon + ', {})'
    if (source.split(anchor).length !== 3) throw new Error('Unable to patch Figma panel glyph state ' + icon)
    const last = source.lastIndexOf(anchor)
    source = source.slice(0, last) + anchor.replace(', {})', ', { active: state.' + field + ' })') + source.slice(last + anchor.length)
  }
  source = source.replace('a frame with a filled strip\n\t\t* along its RIGHT edge, in the app\'s outline style (1.5px stroke,\n\t\t* currentColor).', 'Figma 44 frame with a right divider, 1px round stroke.\n\t\t* Original SVG: docs/figma-panel-icon-evidence/361-6018.svg.')
  source = source.replace('a frame with a filled strip\n\t\t* along its BOTTOM edge, in the app\'s outline style.', 'Figma 44 frame with a bottom divider, 1px round stroke.\n\t\t* Original SVG: docs/figma-panel-icon-evidence/361-6013.svg.')
  return marker + '\n' + source
}

/**
 * Add the stable state and accessibility contract used by the Figma panel
 * layout. The panels remain mounted while hidden, so their tabs, editor state,
 * terminal buffers, and persisted dimensions keep the existing store behavior.
 */
function patchFigmaPanelLayout(source) {
  if (source.includes(FIGMA_PANEL_LAYOUT_PATCH_MARKER)) return source


  source = replaceExact(source,
    `\t\t\tif (state === void 0 || sessionId === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\t"data-dsh-panel-host": true,
\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\tclassName: sidebar_module_css_default.toggleCluster,
\t\t\t\t\tchildren: [!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
\t\t\t\t\t\tlabel: t("noSession"),
\t\t\t\t\t\tside: "bottom",
\t\t\t\t\t\tdelayMs: 500,
\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
\t\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,
\t\t\t\t\t\t\tdisabled: true,
\t\t\t\t\t\t\t"aria-label": t("noSession"),
\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelBottomOutline16, {})
\t\t\t\t\t\t})
\t\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
\t\t\t\t\t\tlabel: t("noSession"),
\t\t\t\t\t\tside: "bottom",
\t\t\t\t\t\tdelayMs: 500,
\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
\t\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,
\t\t\t\t\t\t\tdisabled: true,
\t\t\t\t\t\t\t"aria-label": t("noSession"),
\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelRightOutline16, {})
\t\t\t\t\t\t})
\t\t\t\t\t})]
\t\t\t\t})
\t\t\t});`,
    `\t\t\tif (state === void 0 || sessionId === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\t"data-dsh-panel-host": true,
\t\t\t\t"data-odyssey-panel-right": "closed",
\t\t\t\t"data-odyssey-panel-bottom": "closed",
\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\t\tclassName: sidebar_module_css_default.toggleCluster,
\t\t\t\t\trole: "group",
\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
\t\t\t\t\t\tlabel: t("expand"),
\t\t\t\t\t\tside: "bottom",
\t\t\t\t\t\tdelayMs: 500,
\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
\t\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,
\t\t\t\t\t\t\t"data-odyssey-panel-entry": "right",
\t\t\t\t\t\t\t"aria-label": t("expand"),
\t\t\t\t\t\t\t"aria-expanded": false,
\t\t\t\t\t\t\tonClick: () => {
\t\t\t\t\t\t\t\tctx.workspaces.startSession(void 0, (nextSessionId) => {
\t\t\t\t\t\t\t\t\tstore.reduceFor(nextSessionId, (current) => current.panelOpen ? current : { ...current, panelOpen: true });
\t\t\t\t\t\t\t\t\twindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId: nextSessionId } }));
\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t},
\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelRightOutline16, { active: false })
\t\t\t\t\t\t})
\t\t\t\t\t})
\t\t\t\t})
\t\t\t});`,
    'Figma no-session panel entry')

  source = replaceExact(source,
    '\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t"data-dsh-panel-host": true,',
    `\t\t\t${FIGMA_PANEL_LAYOUT_PATCH_MARKER}\n\t\t\tconst showBottomToggle = !narrow && state.panelOpen;\n\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t"data-dsh-panel-host": true,\n\t\t\t\t"data-odyssey-panel-right": state.panelOpen ? "open" : "closed",\n\t\t\t\t"data-odyssey-panel-bottom": state.bottomOpen ? "open" : "closed",`,
    'Figma panel host state')
  source = replaceExact(source,
    '\t\t\t\t\t\tchildren: [!narrow && /* @__PURE__ */',
    '\t\t\t\t\t\tchildren: [showBottomToggle && /* @__PURE__ */',
    'Figma bottom entry visibility')
  source = replaceExact(source,
    '\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,\n\t\t\t\t\t\t\t\t"aria-label": state.bottomOpen ? t("collapseBottomPanel") : t("expandBottomPanel"),',
    '\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,\n\t\t\t\t\t\t\t\t"data-odyssey-panel-entry": "bottom",\n\t\t\t\t\t\t\t\t"aria-controls": "odyssey-bottom-workspace-panel",\n\t\t\t\t\t\t\t\t"aria-expanded": state.bottomOpen,\n\t\t\t\t\t\t\t\t"aria-label": state.bottomOpen ? t("collapseBottomPanel") : t("expandBottomPanel"),',
    'Figma bottom entry semantics')
  source = replaceExact(source,
    '\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,\n\t\t\t\t\t\t\t\t"aria-label": state.panelOpen ? t("collapse") : t("expand"),',
    '\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.toggleButton,\n\t\t\t\t\t\t\t\t"data-odyssey-panel-entry": "right",\n\t\t\t\t\t\t\t\t"aria-controls": "odyssey-right-workspace-panel",\n\t\t\t\t\t\t\t\t"aria-expanded": state.panelOpen,\n\t\t\t\t\t\t\t\t"aria-label": state.panelOpen ? t("collapse") : t("expand"),',
    'Figma right entry semantics')
  source = replaceExact(source,
    '\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tref: panelRef,',
    '\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tid: "odyssey-right-workspace-panel",\n\t\t\t\t\t\t"aria-hidden": !state.panelOpen,\n\t\t\t\t\t\tref: panelRef,',
    'Figma right panel identity')
  source = replaceExact(source,
    '\t\t\t\t\t!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tref: bottomRef,',
    '\t\t\t\t\t!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tid: "odyssey-bottom-workspace-panel",\n\t\t\t\t\t\t"aria-hidden": !state.bottomOpen,\n\t\t\t\t\t\tref: bottomRef,',
    'Figma bottom panel identity')
  source = replaceExact(source,
    '\t\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.bottomClose,\n\t\t\t\t\t\t\t\t\t"aria-label": t("collapseBottomPanel"),',
    '\t\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.bottomClose,\n\t\t\t\t\t\t\t\t\t"aria-controls": "odyssey-bottom-workspace-panel",\n\t\t\t\t\t\t\t\t\t"aria-expanded": state.bottomOpen,\n\t\t\t\t\t\t\t\t\t"aria-label": t("collapseBottomPanel"),',
    'Figma bottom close semantics')
  return source
}

function patchNoSessionPanelPending(source) {
  if (source.includes(FIGMA_PANEL_PENDING_PATCH_MARKER)) return source
  source = replaceExact(source,
    `\t\t\tconst [keyboardInset, setKeyboardInset] = (0, react.useState)(0);`,
    `\t\t\t${FIGMA_PANEL_PENDING_PATCH_MARKER}
\t\t\tconst [keyboardInset, setKeyboardInset] = (0, react.useState)(0);
\t\t\tconst [noSessionStarting, setNoSessionStarting] = (0, react.useState)(false);
\t\t\tconst noSessionPending = (0, react.useRef)(false);
\t\t\tconst noSessionMounted = (0, react.useRef)(true);
\t\t\tconst noSessionResetTimer = (0, react.useRef)(null);
\t\t\tconst finishNoSessionStart = () => {
\t\t\t\tnoSessionPending.current = false;
\t\t\t\tif (noSessionResetTimer.current !== null) window.clearTimeout(noSessionResetTimer.current);
\t\t\t\tnoSessionResetTimer.current = null;
\t\t\t\tif (noSessionMounted.current) setNoSessionStarting(false);
\t\t\t};
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tnoSessionMounted.current = true;
\t\t\t\treturn () => {
\t\t\t\t\tnoSessionMounted.current = false;
\t\t\t\t\tnoSessionPending.current = false;
\t\t\t\t\tif (noSessionResetTimer.current !== null) window.clearTimeout(noSessionResetTimer.current);
\t\t\t\t\tnoSessionResetTimer.current = null;
\t\t\t\t};
\t\t\t}, []);`,
    'no-session pending state')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t"aria-label": t("expand"),
\t\t\t\t\t\t\t"aria-expanded": false,
\t\t\t\t\t\t\tonClick: () => {
\t\t\t\t\t\t\t\tctx.workspaces.startSession(void 0, (nextSessionId) => {
\t\t\t\t\t\t\t\t\tstore.reduceFor(nextSessionId, (current) => current.panelOpen ? current : { ...current, panelOpen: true });
\t\t\t\t\t\t\t\t\twindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId: nextSessionId } }));
\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t},`,
    `\t\t\t\t\t\t\t"aria-label": t("expand"),
\t\t\t\t\t\t\t"aria-expanded": false,
\t\t\t\t\t\t\t"aria-busy": noSessionStarting || void 0,
\t\t\t\t\t\t\tdisabled: noSessionStarting,
\t\t\t\t\t\t\tonClick: () => {
\t\t\t\t\t\t\t\tif (noSessionPending.current) return;
\t\t\t\t\t\t\t\tnoSessionPending.current = true;
\t\t\t\t\t\t\t\tsetNoSessionStarting(true);
\t\t\t\t\t\t\t\tnoSessionResetTimer.current = window.setTimeout(finishNoSessionStart, 1e4);
\t\t\t\t\t\t\t\ttry {
\t\t\t\t\t\t\t\t\tctx.workspaces.startSession(void 0, (nextSessionId) => {
\t\t\t\t\t\t\t\t\t\tfinishNoSessionStart();
\t\t\t\t\t\t\t\t\t\tstore.reduceFor(nextSessionId, (current) => current.panelOpen ? current : { ...current, panelOpen: true });
\t\t\t\t\t\t\t\t\t\twindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId: nextSessionId } }));
\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t} catch (error) {
\t\t\t\t\t\t\t\t\tfinishNoSessionStart();
\t\t\t\t\t\t\t\t\tconsole.error("[dsh-better-sidebar] unable to start session", error);
\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t},`,
    'no-session pending interaction')
  return source
}

function patchFigmaBottomClose(source) {
  if (source.includes(FIGMA_BOTTOM_CLOSE_PATCH_MARKER)) return source
  const start = source.indexOf('\t\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.bottomClose,')
  const end = source.indexOf('\n\t\t\t\t\t\t\t\t})', start)
  if (start < 0 || end < 0) throw new Error('Unable to patch Better Sidebar Figma bottom close boundary')
  const before = source.slice(start, end)
  const after = replaceExact(before,
    'children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})',
    'children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelBottomOutline16, { active: true })',
    'Figma bottom close glyph')
  return `${FIGMA_BOTTOM_CLOSE_PATCH_MARKER}\n${source.slice(0, start)}${after}${source.slice(end)}`
}

// Commit the shell-reservation variables in the same layout phase as the
// panel class change. CSS can then interpolate the bottom panel and the
// conversation/composer frame from one visual frame instead of lagging it.
function patchFigmaPanelMotionSync(source) {
  if (source.includes(FIGMA_PANEL_MOTION_SYNC_PATCH_MARKER)) return source
  return replaceExact(source,
    `(0, react.useEffect)(() => {
\t\t\t\tconst width = !narrow && snapshot.state?.panelOpen === true ? Math.min(snapshot.state.width, window.innerWidth) : 0;
\t\t\t\tconst height = !narrow && snapshot.state?.bottomOpen === true ? Math.min(snapshot.state.bottomHeight, window.innerHeight) : 0;`,
    `(0, react.useLayoutEffect)(() => {
\t\t\t\t${FIGMA_PANEL_MOTION_SYNC_PATCH_MARKER}
\t\t\t\tconst width = !narrow && snapshot.state?.panelOpen === true ? Math.min(snapshot.state.width, window.innerWidth) : 0;
\t\t\t\tconst height = !narrow && snapshot.state?.bottomOpen === true ? Math.min(snapshot.state.bottomHeight, window.innerHeight) : 0;`,
    'panel motion geometry phase')
}

/**
 * Pointer capture is the preferred resize path, but native automation and a
 * capture transfer can deliver the rest of the stream to window. Keep moves
 * rAF-only and commit the store once on the terminal event in either path.
 */
function patchPanelWindowPointerFallback(source) {
  if (source.includes(PANEL_WINDOW_POINTER_FALLBACK_PATCH_MARKER)) return source
  source = replaceExact(source,
    `\t\t\tconst dragCommitted = (0, react.useRef)(false);
\t\t\t/**`,
    `\t\t\tconst dragCommitted = (0, react.useRef)(false);
\t\t\tconst activeDragPointer = (0, react.useRef)(null);
\t\t\t/**`,
    'window drag pointer identity')
  source = replaceExact(source,
    `\t\t\tconst abortDrag = (reset, event) => {
\t\t\t\tif (dragCommitted.current) return;
\t\t\t\tconst pending = pendingDrag.current;`,
    `\t\t\tconst abortDrag = (reset, event) => {
\t\t\t\tif (dragCommitted.current) return;
\t\t\t\tdragCommitted.current = true;
\t\t\t\tactiveDragPointer.current = null;
\t\t\t\tconst pending = pendingDrag.current;`,
    'interrupted drag single finish')
  source = replaceExact(source,
    `\t\t\t(0, react.useEffect)(() => {
\t\t\t\tconst width = !narrow && snapshot.state?.panelOpen === true ? Math.min(snapshot.state.width, window.innerWidth) : 0;`,
    `\t\t\t${PANEL_WINDOW_POINTER_FALLBACK_PATCH_MARKER}
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (!anyDragging) return;
\t\t\t\tconst matchesPointer = (event) => activeDragPointer.current === null || activeDragPointer.current === event.pointerId;
\t\t\t\tconst onWindowDragMove = (event) => {
\t\t\t\t\tif (dragCommitted.current || !matchesPointer(event)) return;
\t\t\t\t\tif (draggingWidth) {
\t\t\t\t\t\tconst { startX, startWidth } = widthDrag.current;
\t\t\t\t\t\tconst width = clampWidth(startWidth + (startX - event.clientX));
\t\t\t\t\t\tconst height = state?.bottomOpen === true ? Math.min(state.bottomHeight, window.innerHeight) : 0;
\t\t\t\t\t\tscheduleDrag(width, height);
\t\t\t\t\t} else if (draggingBottom) {
\t\t\t\t\t\tconst { startY, startHeight } = bottomDrag.current;
\t\t\t\t\t\tconst height = clampHeight(startHeight + (startY - event.clientY));
\t\t\t\t\t\tscheduleDrag(Math.min(state?.width ?? 0, window.innerWidth), height);
\t\t\t\t\t} else if (draggingCorner) {
\t\t\t\t\t\tconst { startX, startY, startWidth, startHeight } = cornerDrag.current;
\t\t\t\t\t\tscheduleDrag(clampWidth(startWidth + (startX - event.clientX)), clampHeight(startHeight + (startY - event.clientY)));
\t\t\t\t\t}
\t\t\t\t};
\t\t\t\tconst onWindowDragEnd = (event) => {
\t\t\t\t\tif (dragCommitted.current || !matchesPointer(event)) return;
\t\t\t\t\tdragCommitted.current = true;
\t\t\t\t\tactiveDragPointer.current = null;
\t\t\t\t\tconst pending = pendingDrag.current;
\t\t\t\t\tif (draggingWidth) {
\t\t\t\t\t\tconst { startX, startWidth } = widthDrag.current;
\t\t\t\t\t\tconst width = pending?.width ?? clampWidth(startWidth + (startX - event.clientX));
\t\t\t\t\t\tconst height = state?.bottomOpen === true ? Math.min(state.bottomHeight, window.innerHeight) : 0;
\t\t\t\t\t\tcommitDrag(width, height, (s) => setWidth(s, width));
\t\t\t\t\t\tsetDraggingWidth(false);
\t\t\t\t\t} else if (draggingBottom) {
\t\t\t\t\t\tconst { startY, startHeight } = bottomDrag.current;
\t\t\t\t\t\tconst height = pending?.height ?? clampHeight(startHeight + (startY - event.clientY));
\t\t\t\t\t\tcommitDrag(Math.min(state?.width ?? 0, window.innerWidth), height, (s) => setBottomHeight(s, height));
\t\t\t\t\t\tsetDraggingBottom(false);
\t\t\t\t\t} else if (draggingCorner) {
\t\t\t\t\t\tconst { startX, startY, startWidth, startHeight } = cornerDrag.current;
\t\t\t\t\t\tconst width = pending?.width ?? clampWidth(startWidth + (startX - event.clientX));
\t\t\t\t\t\tconst height = pending?.height ?? clampHeight(startHeight + (startY - event.clientY));
\t\t\t\t\t\tcommitDrag(width, height, (s) => setBottomHeight(setWidth(s, width), height));
\t\t\t\t\t\tsetDraggingCorner(false);
\t\t\t\t\t}
\t\t\t\t};
\t\t\t\tconst onWindowDragCancel = (event) => {
\t\t\t\t\tif (!matchesPointer(event)) return;
\t\t\t\t\tabortDrag(() => {
\t\t\t\t\t\tsetDraggingWidth(false);
\t\t\t\t\t\tsetDraggingCorner(false);
\t\t\t\t\t\tsetDraggingBottom(false);
\t\t\t\t\t}, event);
\t\t\t\t};
\t\t\t\twindow.addEventListener("pointermove", onWindowDragMove);
\t\t\t\twindow.addEventListener("pointerup", onWindowDragEnd);
\t\t\t\twindow.addEventListener("pointercancel", onWindowDragCancel);
\t\t\t\treturn () => {
\t\t\t\t\twindow.removeEventListener("pointermove", onWindowDragMove);
\t\t\t\t\twindow.removeEventListener("pointerup", onWindowDragEnd);
\t\t\t\t\twindow.removeEventListener("pointercancel", onWindowDragCancel);
\t\t\t\t};
\t\t\t}, [
\t\t\t\tanyDragging,
\t\t\t\tdraggingWidth,
\t\t\t\tdraggingBottom,
\t\t\t\tdraggingCorner,
\t\t\t\tstate?.width,
\t\t\t\tstate?.bottomOpen,
\t\t\t\tstate?.bottomHeight
\t\t\t]);
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tconst width = !narrow && snapshot.state?.panelOpen === true ? Math.min(snapshot.state.width, window.innerWidth) : 0;`,
    'window drag terminal event fallback')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\twidthDrag.current = {`,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\tactiveDragPointer.current = event.pointerId;
\t\t\t\t\t\t\t\t\twidthDrag.current = {`,
    'width drag pointer start')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\tcornerDrag.current = {`,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\tactiveDragPointer.current = event.pointerId;
\t\t\t\t\t\t\t\t\tcornerDrag.current = {`,
    'corner drag pointer start')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\tbottomDrag.current = {`,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = false;
\t\t\t\t\t\t\t\t\tactiveDragPointer.current = event.pointerId;
\t\t\t\t\t\t\t\t\tbottomDrag.current = {`,
    'bottom drag pointer start')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = true;
\t\t\t\t\t\t\t\t\tevent.currentTarget.releasePointerCapture(event.pointerId);`,
    `\t\t\t\t\t\t\t\t\tdragCommitted.current = true;
\t\t\t\t\t\t\t\t\tevent.currentTarget.releasePointerCapture(event.pointerId);
\t\t\t\t\t\t\t\t\tactiveDragPointer.current = null;`,
    'local drag pointer finish', 3)
  for (const stateName of ['Width', 'Corner', 'Bottom']) {
    source = replaceExact(source,
      `onPointerCancel: () => {
\t\t\t\t\t\t\t\t\tabortDrag(() => setDragging${stateName}(false));
\t\t\t\t\t\t\t\t},
\t\t\t\t\t\t\t\tonLostPointerCapture: () => {
\t\t\t\t\t\t\t\t\tabortDrag(() => setDragging${stateName}(false));`,
      `onPointerCancel: (event) => {
\t\t\t\t\t\t\t\t\tabortDrag(() => setDragging${stateName}(false), event);
\t\t\t\t\t\t\t\t},
\t\t\t\t\t\t\t\tonLostPointerCapture: (event) => {
\t\t\t\t\t\t\t\t\tabortDrag(() => setDragging${stateName}(false), event);`,
      `${stateName.toLowerCase()} drag interruption event`)
  }
  return source
}

/**
 * Expose the real Files/editor controls to the late Figma stylesheet without
 * replacing their store, filesystem operations, CodeMirror, Markdown renderer,
 * or plugin-provided Office viewers. Exact boundaries keep a package upgrade
 * loud instead of leaving a partly styled explorer behind.
 */
function patchFigmaFilePanel(source) {
  if (source.includes(FIGMA_FILE_PANEL_PATCH_MARKER)) return source

  source = replaceExact(source,
    `\t\tfunction baseName$1(path) {
\t\t\tconst trimmed = path.replace(/[\\\\/]+$/, "");
\t\t\tconst at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\\\"));
\t\t\treturn at === -1 ? trimmed : trimmed.slice(at + 1);
\t\t}`,
    `\t\tfunction baseName$1(path) {
\t\t\tconst trimmed = path.replace(/[\\\\/]+$/, "");
\t\t\tconst at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\\\"));
\t\t\treturn at === -1 ? trimmed : trimmed.slice(at + 1);
\t\t}
\t\t${FIGMA_FILE_PANEL_PATCH_MARKER}
\t\tfunction sherlockFigmaFileKind(name) {
\t\t\tconst extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
\t\t\treturn ["c", "cc", "cpp", "css", "go", "h", "html", "java", "js", "json", "jsx", "mjs", "py", "rb", "rs", "sh", "swift", "ts", "tsx", "vue", "xml", "yaml", "yml"].includes(extension) ? "code" : "file";
\t\t}`,
    'Figma file kind contract')

  const fileTreeStart = source.indexOf('\t\tfunction FileTree(props) {')
  const fileTreeEnd = source.indexOf('\n\t\t//#endregion', fileTreeStart)
  if (fileTreeStart < 0 || fileTreeEnd < 0) throw new Error('Unable to patch Better Sidebar Figma FileTree boundary')
  let fileTree = source.slice(fileTreeStart, fileTreeEnd)
  fileTree = replaceExact(fileTree,
    'style: { paddingLeft: depth * 22 + 6 },',
    'style: { paddingLeft: depth * 22 },',
    'Figma tree indentation', 4)
  fileTree = replaceExact(fileTree,
    `\t\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.explorerRow, sidebar_module_css_default.explorerDir, entry.hidden && sidebar_module_css_default.explorerHidden),
\t\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 },`,
    `\t\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.explorerRow, sidebar_module_css_default.explorerDir, entry.hidden && sidebar_module_css_default.explorerHidden),
\t\t\t\t\t\t\t"data-odyssey-file-row": "directory",
\t\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 },`,
    'Figma directory row identity')
  fileTree = replaceExact(fileTree,
    `\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.explorerRow, entry.hidden && sidebar_module_css_default.explorerHidden, entry.broken && sidebar_module_css_default.explorerBroken),
\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 },`,
    `\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.explorerRow, entry.hidden && sidebar_module_css_default.explorerHidden, entry.broken && sidebar_module_css_default.explorerBroken),
\t\t\t\t\t\t"data-odyssey-file-row": sherlockFigmaFileKind(entry.name),
\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 },`,
    'Figma file row identity')
  fileTree = replaceExact(fileTree,
    'isOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 14 })',
    'isOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 16 })',
    'Figma directory icon')
  fileTree = replaceExact(fileTree,
    '/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 14 }),',
    '/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-odyssey-file-icon": sherlockFigmaFileKind(entry.name), "aria-hidden": true }),',
    'Figma typed file icon')
  fileTree = replaceExact(fileTree,
    `\t\t\t\t\tclassName: sidebar_module_css_default.explorerRow,
\t\t\t\t\tstyle: { paddingLeft: 6 },`,
    `\t\t\t\t\tclassName: sidebar_module_css_default.explorerRow,
\t\t\t\t\t"data-odyssey-project-root": true,
\t\t\t\t\tstyle: { paddingLeft: 0 },`,
    'Figma project root identity')
  fileTree = replaceExact(fileTree,
    '/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 }),',
    '/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 16 }),',
    'Figma project root icon', 1)
  source = source.slice(0, fileTreeStart) + fileTree + source.slice(fileTreeEnd)

  const treePanelStart = source.indexOf('\t\tfunction TreePanel(props) {')
  const treePanelEnd = source.indexOf('\n\t\t//#endregion', treePanelStart)
  if (treePanelStart < 0 || treePanelEnd < 0) throw new Error('Unable to patch Better Sidebar Figma TreePanel boundary')
  let treePanel = source.slice(treePanelStart, treePanelEnd)
  treePanel = replaceExact(treePanel,
    'className: clsx(sidebar_module_css_default.editorTreePanel, full === true && sidebar_module_css_default.editorTreePanelFull),',
    'className: clsx(sidebar_module_css_default.editorTreePanel, full === true && sidebar_module_css_default.editorTreePanelFull),\n\t\t\t\t"data-odyssey-file-panel": true,',
    'Figma file panel identity')
  treePanel = replaceExact(treePanel,
    `\t\t\t\t\tclassName: sidebar_module_css_default.editorTreeSearch,
\t\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {`,
    `\t\t\t\t\tclassName: sidebar_module_css_default.editorTreeSearch,
\t\t\t\t\t"data-odyssey-file-search": true,
\t\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
\t\t\t\t\t\t"data-odyssey-file-search-icon": true,
\t\t\t\t\t\t"aria-hidden": true
\t\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {`,
    'Figma file search identity')
  treePanel = replaceExact(treePanel,
    `\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\tclassName: sidebar_module_css_default.iconButton,
\t\t\t\t\t\t"aria-label": t("refresh"),`,
    `\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\tclassName: sidebar_module_css_default.iconButton,
\t\t\t\t\t\t"data-odyssey-file-refresh": true,
\t\t\t\t\t\t"aria-label": t("refresh"),`,
    'Figma refresh identity')
  treePanel = replaceExact(treePanel,
    `\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.editorSearchResult,
\t\t\t\t\t\t\t\ttitle: rel,`,
    `\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.editorSearchResult,
\t\t\t\t\t\t\t\t"data-odyssey-file-search-result": sherlockFigmaFileKind(rel),
\t\t\t\t\t\t\t\ttitle: rel,`,
    'Figma search result identity')
  source = source.slice(0, treePanelStart) + treePanel + source.slice(treePanelEnd)

  const editorStart = source.indexOf('\t\tfunction EditorHost(props) {')
  const editorEnd = source.indexOf('\n\t\t//#endregion', editorStart)
  if (editorStart < 0 || editorEnd < 0) throw new Error('Unable to patch Better Sidebar Figma EditorHost boundary')
  let editor = source.slice(editorStart, editorEnd)
  editor = replaceExact(editor,
    `if (treeOnly) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\tclassName: sidebar_module_css_default.editor,`,
    `if (treeOnly) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
\t\t\t\tclassName: sidebar_module_css_default.editor,
\t\t\t\t"data-odyssey-file-editor": "tree",`,
    'Figma tree editor identity')
  editor = replaceExact(editor,
    `\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\tclassName: sidebar_module_css_default.editor,
\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\tclassName: sidebar_module_css_default.editorHeader,`,
    `\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\tclassName: sidebar_module_css_default.editor,
\t\t\t\t"data-odyssey-file-editor": "document",
\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
\t\t\t\t\tclassName: sidebar_module_css_default.editorHeader,
\t\t\t\t\t"data-odyssey-file-editor-header": true,`,
    'Figma document editor identity')
  source = source.slice(0, editorStart) + editor + source.slice(editorEnd)

  const tabBarStart = source.indexOf('\t\tfunction TabBar(props) {')
  const tabBarEnd = source.indexOf('\n\t\t//#endregion', tabBarStart)
  if (tabBarStart < 0 || tabBarEnd < 0) throw new Error('Unable to patch Better Sidebar Figma TabBar boundary')
  let tabBar = source.slice(tabBarStart, tabBarEnd)
  tabBar = replaceExact(tabBar,
    `/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
\t\t\t\t\t\topen: menuOpen,`,
    `/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
\t\t\t\t\t\tclassName: "odyssey-file-new-tab-menu",
\t\t\t\t\t\topen: menuOpen,`,
    'Figma new tab menu identity')
  tabBar = replaceExact(tabBar,
    `\t\t\t\t\t\t\tclassName: sidebar_module_css_default.tabBarPlus,
\t\t\t\t\t\t\t"aria-label": t("newTab"),`,
    `\t\t\t\t\t\t\tclassName: sidebar_module_css_default.tabBarPlus,
\t\t\t\t\t\t\t"aria-expanded": menuOpen,
\t\t\t\t\t\t\t"aria-label": t("newTab"),`,
    'Figma new tab menu state')
  tabBar = replaceExact(tabBar,
    '\t\t\t\t\t\t\tlabel: option.label,',
    '\t\t\t\t\t\t\tlabel: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-odyssey-file-menu-label": true, children: option.label }),',
    'Figma new tab menu portal identity')
  source = source.slice(0, tabBarStart) + tabBar + source.slice(tabBarEnd)

  return source
}

// Bound every width writer to the usable workspace, including restored state.
export function odysseyClampPanelWidth(width, viewport = globalThis.window?.innerWidth ?? 640, doc = globalThis.document) {
  const sidebar = doc?.querySelector?.('.pI_x6G_sidebarCol');
  // An expanded overlay paints beyond its reserved 80 px rail, without taking workspace width.
  const overlayFrame = sidebar?.closest?.('[data-odyssey-sidebar-overlay=true]');
  const left = Math.max(0, overlayFrame ? overlayFrame.getBoundingClientRect().left + 80 : sidebar?.getBoundingClientRect?.().right ?? 0);
  const edge = Number.parseFloat(doc?.defaultView?.getComputedStyle?.(doc.body).getPropertyValue('--odyssey-panel-edge')) || 10;
  const gap = Number.parseFloat(doc?.defaultView?.getComputedStyle?.(doc.body).getPropertyValue('--odyssey-panel-gap')) || 10;
  const available = Math.max(0, viewport - left - edge - gap);
  const maximum = Math.min(available, Math.max(280, available - 320));
  return Math.min(maximum, Math.max(Math.min(280, maximum), Math.round(Number.isFinite(width) ? width : 340)));
}
function patchFigmaPanelBounds(source) {
  const marker = '/* sherlock:figma-panel-workspace-bounds:v1 */';
  if (source.includes(marker)) {
    const start = source.indexOf('function odysseyClampPanelWidth(');
    const end = source.indexOf('\n\t\tfunction setWidth(', start);
    if (start < 0 || end < 0) throw new Error('Missing panel bounds helper');
    return source.slice(0, start) + odysseyClampPanelWidth.toString() + source.slice(end);
  }
  source = replaceExact(source, '\t\tfunction setWidth(state, width) {', '\t\t' + marker + '\n' + odysseyClampPanelWidth.toString() + '\n\t\tfunction setWidth(state, width) {', 'workspace width helper');
  source = replaceExact(source, 'width: Math.min(max, Math.max(280, Math.round(width)))', 'width: odysseyClampPanelWidth(width)', 'stored width bounds');
  source = replaceExact(source, 'width: Math.max(280, Math.min(record.width, maxWidth))', 'width: odysseyClampPanelWidth(record.width)', 'restored width bounds');
  source = replaceExact(source, 'const clampWidth = (width) => Math.min(Math.max(280, Math.round(width)), Math.max(280, window.innerWidth));', 'const clampWidth = odysseyClampPanelWidth;', 'pointer width bounds');
  for (const target of ['state?.width ?? 0', 'snapshot.state.width', 'committed.width', 'state.width']) {
    source = source.split('Math.min(' + target + ', window.innerWidth)').join('odysseyClampPanelWidth(' + target + ')');
  }
  source = replaceExact(source,
    '\t\t\t\tsnapshot.state?.bottomHeight\n\t\t\t]);',
    '\t\t\t\tsnapshot.state?.bottomHeight,\n\t\t\t\tcenterRect.left,\n\t\t\t\tcenterRect.right\n\t\t\t]);', 'workspace geometry on resize');
  source = replaceExact(source,
    '\t\t\t\tcenterRect.right\n\t\t\t]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (anyDragging)',
    '\t\t\t\tcenterRect.right,\n\t\t\t\tcenterRect.left\n\t\t\t]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (anyDragging)', 'panel surface on sidebar resize');
  return source;
}

/**
 * Reserve 0 as the persisted "design default" sentinel. New sessions then
 * start at the measured 340px, while every pre-existing non-zero percentage
 * continues to scale with the viewport. The settings field renders the
 * sentinel as an empty numeric field with a truthful 340px placeholder; typing
 * 20–60 opts into percentage behavior, and clearing restores the fixed default.
 */
function patchFigmaPanelDefaultWidth(source) {
  if (source.includes(FIGMA_PANEL_DEFAULT_WIDTH_PATCH_MARKER)) return source
  source = replaceExact(source,
    '\t\t\tdefaultWidthPercent: 35,',
    '\t\t\tdefaultWidthPercent: 0,',
    'Figma fixed default preference')
  source = replaceExact(source,
    `\t\tfunction clampWidthPercent(value) {
\t\t\treturn Math.min(60, Math.max(20, Math.round(value)));
\t\t}`,
    `\t\t${FIGMA_PANEL_DEFAULT_WIDTH_PATCH_MARKER}
\t\tfunction clampWidthPercent(value) {
\t\t\tif (value === 0) return 0;
\t\t\treturn Math.min(60, Math.max(20, Math.round(value)));
\t\t}
\t\tfunction sidebarWidthDraft(percent) {
\t\t\treturn percent === 0 ? "" : String(percent);
\t\t}`,
    'Figma fixed default sentinel')
  source = replaceExact(source,
    `\t\tfunction defaultWidthFor(viewport, percent) {
\t\t\treturn Math.min(viewport, Math.max(280, Math.round(viewport * percent / 100)));
\t\t}`,
    `\t\tfunction defaultWidthFor(viewport, percent) {
\t\t\tif (percent === 0) return Math.min(viewport, 340);
\t\t\treturn Math.min(viewport, Math.max(280, Math.round(viewport * percent / 100)));
\t\t}`,
    'Figma fixed default width')
  source = replaceExact(source,
    'settingsWidthTitle: "默认宽度占比",\n\t\t\tsettingsWidthDesc: "新建会话时侧边卡片占窗口宽度的百分比 (20–60)",',
    'settingsWidthTitle: "新会话默认宽度",\n\t\t\tsettingsWidthDesc: "留空使用固定 340 px；输入 20–60 使用窗口宽度占比",',
    'Figma width setting Chinese copy')
  source = replaceExact(source,
    'settingsWidthTitle: "Default width share",\n\t\t\tsettingsWidthDesc: "The side card\'s default share of the window width for new conversations (20–60)",',
    'settingsWidthTitle: "New conversation width",\n\t\t\tsettingsWidthDesc: "Leave blank for the fixed 340 px default, or enter 20–60 for a window-width percentage",',
    'Figma width setting English copy')
  source = replaceExact(source,
    'const [widthDraft, setWidthDraft] = (0, react.useState)(String(store.getPrefs().defaultWidthPercent));',
    'const [widthDraft, setWidthDraft] = (0, react.useState)(() => sidebarWidthDraft(store.getPrefs().defaultWidthPercent));',
    'Figma width draft initial value')
  source = replaceExact(source,
    'setWidthDraft(String(next.defaultWidthPercent));',
    'setWidthDraft(sidebarWidthDraft(next.defaultWidthPercent));',
    'Figma width draft loaded value')
  source = replaceExact(source,
    'setWidthDraft(String(settled.defaultWidthPercent));',
    'setWidthDraft(sidebarWidthDraft(settled.defaultWidthPercent));',
    'Figma width draft settled value')
  source = replaceExact(source,
    `\t\t\tconst commitWidth = () => {
\t\t\t\tconst parsed = Number(widthDraft);
\t\t\t\tif (!Number.isFinite(parsed)) {
\t\t\t\t\tsetWidthDraft(String(prefs.defaultWidthPercent));
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tconst clamped = clampWidthPercent(parsed);
\t\t\t\tconst previous = prefs;
\t\t\t\tsetPrefs({
\t\t\t\t\t...previous,
\t\t\t\t\tdefaultWidthPercent: clamped
\t\t\t\t});
\t\t\t\tsetWidthDraft(String(clamped));
\t\t\t\tsetError(null);
\t\t\t\tcommit({ defaultWidthPercent: clamped }).then((outcome) => applyOutcome(previous, outcome));
\t\t\t};`,
    `\t\t\tconst commitWidth = () => {
\t\t\t\tconst useFixedDefault = widthDraft.trim() === "";
\t\t\t\tconst parsed = Number(widthDraft);
\t\t\t\tif (!useFixedDefault && !Number.isFinite(parsed)) {
\t\t\t\t\tsetWidthDraft(sidebarWidthDraft(prefs.defaultWidthPercent));
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tconst clamped = useFixedDefault ? 0 : clampWidthPercent(parsed);
\t\t\t\tconst previous = prefs;
\t\t\t\tsetPrefs({
\t\t\t\t\t...previous,
\t\t\t\t\tdefaultWidthPercent: clamped
\t\t\t\t});
\t\t\t\tsetWidthDraft(sidebarWidthDraft(clamped));
\t\t\t\tsetError(null);
\t\t\t\tcommit({ defaultWidthPercent: useFixedDefault ? 0 : clamped }).then((outcome) => applyOutcome(previous, outcome));
\t\t\t};`,
    'Figma width setting commit')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\t\tvalue: widthDraft,
\t\t\t\t\t\t\t\t\t\tmin: 20,`,
    `\t\t\t\t\t\t\t\t\t\tvalue: widthDraft,
\t\t\t\t\t\t\t\t\t\tplaceholder: "340 px",
\t\t\t\t\t\t\t\t\t\tmin: 20,`,
    'Figma width setting placeholder')
  source = replaceExact(source,
    `\t\t\t\t\t\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
\t\t\t\t\t\t\t\t\t\tclassName: SideCardSection_module_css_default.suffix,
\t\t\t\t\t\t\t\t\t\tchildren: t("settingsWidthSuffix")
\t\t\t\t\t\t\t\t\t})]`,
    `\t\t\t\t\t\t\t\t\t}), widthDraft !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
\t\t\t\t\t\t\t\t\t\tclassName: SideCardSection_module_css_default.suffix,
\t\t\t\t\t\t\t\t\t\tchildren: t("settingsWidthSuffix")
\t\t\t\t\t\t\t\t\t})]`,
    'Figma width setting suffix')
  return source
}


// A small desktop window may temporarily collapse the panel, but opening it
// always creates an independent adjacent pane. Stored tabs, width and drafts survive.
function patchFigmaCompactPanel(source) {
  const marker = '/* odyssey:compact-independent-panel:20260912 */'
  const legacyMarker = '/* odyssey:compact-panel:20260912 */'
  if (source.includes(marker)) return patchIntegrationWorkspaceControls(source)
  const start=source.indexOf('function Sidebar(props) {'), end=source.indexOf('\n\t\t//#endregion',start)
  if (start < 0 || end < 0) throw new Error('Missing compact sidebar boundary')
  let part=source.slice(start,end)
  const occupancy = 'const width = !narrow && (compactPanel ? compactPanelOpen : snapshot.state?.panelOpen === true) ? odysseyClampPanelWidth(snapshot.state?.width ?? 340) : 0;'
  if (part.includes(legacyMarker)) {
    part=replaceExact(part, legacyMarker, marker, 'independent compact migration')
    part=replaceExact(part, 'const width = !narrow && !compactPanel && snapshot.state?.panelOpen === true ? odysseyClampPanelWidth(snapshot.state.width) : 0;', occupancy, 'restored compact occupancy')
    part=replaceExact(part, 'narrow, compactPanel,', 'narrow, compactPanel, compactPanelOpen,', 'compact toggle occupancy dependency')
    part=replaceExact(part, '"data-odyssey-panel-overlay": compactPanel ? "true" : "false",', '"data-odyssey-panel-compact": compactPanel ? "true" : "false",', 'independent compact semantics')
    for (const value of ['committed.width', 'state.width']) {
      part=part.replaceAll('(compactPanel ? Math.min('+value+',window.innerWidth-20) : odysseyClampPanelWidth('+value+'))', 'odysseyClampPanelWidth('+value+')')
    }
  } else {
    part=replaceExact(part, 'const narrow = useNarrowViewport();', `const narrow = useNarrowViewport() && !window.dshDesktop;
      ${marker}
      const [compactPanel, setCompactPanel] = (0, react.useState)(() => !!window.dshDesktop && window.innerWidth < 840);
      const [compactPanelOpen, setCompactPanelOpen] = (0, react.useState)(false);
      (0, react.useEffect)(() => {
        const measure=()=>{ const compact=!!window.dshDesktop && window.innerWidth<840; setCompactPanel(compact); if(!compact)setCompactPanelOpen(false); };
        window.addEventListener('resize',measure); return ()=>window.removeEventListener('resize',measure);
      }, []);`, 'compact presentation hook')
    part=replaceExact(part, 'const state = snapshot.state;', 'const state = snapshot.state && compactPanel ? {...snapshot.state, panelOpen:compactPanelOpen} : snapshot.state;', 'temporary panel visibility')
    part=replaceExact(part, 'const sessionId = snapshot.sessionId;', `const sessionId = snapshot.sessionId;
      (0, react.useEffect)(()=>setCompactPanelOpen(false),[sessionId]);`, 'session compact reset')
    part=replaceExact(part,'store.reduce(togglePanel);','if (compactPanel) setCompactPanelOpen(value=>!value); else store.reduce(togglePanel);','compact toggle')
    part=replaceExact(part, 'const width = !narrow && snapshot.state?.panelOpen === true ? odysseyClampPanelWidth(snapshot.state.width) : 0;', occupancy, 'compact occupancy')
    const effect=part.indexOf(occupancy), next=part.indexOf('\n\t\t\t]);',effect)
    const segment=part.slice(effect,next).replace('narrow,','narrow, compactPanel, compactPanelOpen,')
    part=part.slice(0,effect)+segment+part.slice(next)
    part=replaceExact(part,'"data-odyssey-panel-right": state.panelOpen ? "open" : "closed",','"data-odyssey-panel-right": state.panelOpen ? "open" : "closed", "data-odyssey-panel-compact": compactPanel ? "true" : "false",','independent compact semantics')
  }
  return source.slice(0,start)+part+source.slice(end)
}

// Scheduled tasks occupy the existing global panel shell. Only visibility is
// temporary; resizing keeps the native geometry writer and persisted width.
function patchComponentNativeTabSelection(source) {
  const marker = '/* SHERLOCK_COMPONENT_NATIVE_SELECTION */'
  if (source.includes(marker)) return patchComponentTabOverflow(source)
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw new Error('Component schedule native tab boundary missing')
  let part = source.slice(start, end)
  part = part.replace('function TabBar(props) {', `function TabBar(props) {
    ${marker}
    const [componentScheduleActive, setComponentScheduleActive] = react.useState(() => document.body.dataset.scheduledComponent === 'true');
    react.useEffect(() => {
      const update = () => setComponentScheduleActive(document.body.dataset.scheduledComponent === 'true');
      window.addEventListener('sherlock:scheduled-panel', update);
      return () => window.removeEventListener('sherlock:scheduled-panel', update);
    }, []);`)
  part = part.replaceAll('active === tab.id', '(!componentScheduleActive && active === tab.id)')
  return patchComponentTabOverflow(source.slice(0, start) + part + source.slice(end))
}

function patchComponentTabOverflow(source) {
  const marker = '/* sherlock:component-tab-overflow:v1 */'
  if (source.includes(marker)) return patchResidentConversationTab(patchConversationTabIcon(source))
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  let part = source.slice(start, end)
  part = replaceExact(part, 'const [componentScheduleActive,', `
    ${marker}
    const componentTabId = 'sherlock-component-schedule';
    const [componentSchedulePresent, setComponentSchedulePresent] = react.useState(() => document.body.hasAttribute('data-scheduled-component'));
    const [componentScheduleActive,`, 'component tab presence')
  part = replaceExact(part, "const update = () => setComponentScheduleActive(document.body.dataset.scheduledComponent === 'true');", `const update = () => {
      setComponentScheduleActive(document.body.dataset.scheduledComponent === 'true');
      setComponentSchedulePresent(document.body.hasAttribute('data-scheduled-component'));
    };`, 'component tab presence updates')
  const anchor = 'const { paneId, tabs, active, onActivate, onClose, onNewTab, newTabOptions, onDropTab, getTabIcon, getTabBadge } = props;'
  part = replaceExact(part, anchor, anchor + `
    const overflowTabs = react.useMemo(() => componentSchedulePresent ? [...tabs, {id:componentTabId, title:'定时任务'}] : tabs, [tabs, componentSchedulePresent]);`, 'complete overflow tab registry')
  part = part.replace('String(tabs.length)); setHasOverflow(tabs.length > 1);', 'String(overflowTabs.length)); setHasOverflow(overflowTabs.length > 1);')
  part = part.replace('}, [tabs]);', '}, [tabs, componentSchedulePresent]);')
  const menuStart = part.indexOf('overflowOpen &&')
  let menu = part.slice(menuStart)
  menu = menu.replace('children: tabs.length', 'children: overflowTabs.length').replace('children: tabs.map(', 'children: overflowTabs.map(')
  menu = menu.replaceAll('(!componentScheduleActive && active === tab.id)', '(tab.id === componentTabId ? componentScheduleActive : !componentScheduleActive && active === tab.id)')
  menu = menu.replace('onActivate(tab.id);', `if (tab.id === componentTabId) window.dispatchEvent(new window.CustomEvent('sherlock:component-schedule-select'));
              else onActivate(tab.id);`)
  menu = menu.replace('getTabIcon?.(tab) ?? null', `getTabIcon?.(tab.id === componentTabId ? {...tab,type:'scheduled'} : tab) ?? null`)
  part = part.slice(0, menuStart) + menu
  return patchResidentConversationTab(patchConversationTabIcon(source.slice(0, start) + part + source.slice(end)))
}

function patchResidentConversationTab(source) {
  const marker = '/* sherlock:resident-conversation-tab:v1 */'
  const residentHook = '"data-odyssey-resident-conversation-tab": fixed || void 0,'
  const filesHook = '"data-odyssey-resident-files-tab": tab.type === "editor" && !tab.path || void 0,'
  if (source.includes(marker)) return source.includes(filesHook) ? source
    : replaceExact(source, residentHook, residentHook + '\n            ' + filesHook, 'resident files layout hook')
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw new Error('Resident conversation TabBar boundary missing')
  let bar = source.slice(start, end)
  const props = 'getTabIcon: nativeGetTabIcon, getTabBadge } = props;'
  bar = replaceExact(bar, props, props + `
    ${marker}
    const residentChat = tabs.find(tab => tab.id === 'sherlock-research-conversation');
    const scrollingTabs = residentChat ? tabs.filter(tab => tab !== residentChat) : tabs;`, 'resident conversation identity')

  const listStart = '\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tref: listRef,\n\t\t\t\t\tclassName: sidebar_module_css_default.tabList,'
  const renderStart = 'children: tabs.map((tab) => {'
  const renderEnd = '}, tab.id); })'
  const first = bar.indexOf(renderStart)
  const last = bar.indexOf(renderEnd, first)
  if (first < 0 || last < 0) throw new Error('Resident conversation tab renderer missing')
  const renderBody = bar.slice(first + renderStart.length, last) + '}, tab.id);'
  const barReturn = 'return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: clsx(sidebar_module_css_default.tabBar,'
  bar = replaceExact(bar, bar.slice(first, last + renderEnd.length),
    'children: scrollingTabs.map(tab => renderTab(tab))', 'scrollable document tabs')
  bar = replaceExact(bar, barReturn, `const renderTab = (tab, fixed = false) => {${renderBody}
      };
      ${barReturn}`, 'shared tab renderer')
  bar = replaceExact(bar, listStart, listStart.replace('children: [', 'children: [residentChat && renderTab(residentChat, true), '), 'resident conversation before scroller')
  bar = replaceExact(bar, '"data-odyssey-panel-tab": true,', '"data-odyssey-panel-tab": true,\n            ' + residentHook + '\n            ' + filesHook, 'resident conversation layout hook')
  bar = replaceExact(bar, 'if (!el || !node) return;', 'if (!el) return;', 'clipping when conversation is active')
  bar = replaceExact(bar, 'for (const tab of tabNodes.current.values()) {', 'for (const tab of tabNodes.current.values()) {\n        if (!el.contains(tab)) continue;', 'clipping limited to document tabs')
  bar = replaceExact(bar, `      const left = node.offsetLeft, right = left + node.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;`, `      if (node && el.contains(node)) {
        const left = node.offsetLeft, right = left + node.offsetWidth;
        if (left < el.scrollLeft) el.scrollLeft = left;
        else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
      }`, 'reveal limited to document tabs')
  bar = replaceExact(bar, 'String(overflowTabs.length)); setHasOverflow', 'String(scrollingTabs.length)); setHasOverflow', 'document tab padding count')
  return source.slice(0, start) + bar + source.slice(end)
}

function patchConversationTabIcon(source) {
  const marker = '/* sherlock:conversation-tab-icon:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  let part = source.slice(start, end)
  part = replaceExact(part, 'onDropTab, getTabIcon, getTabBadge } = props;', `onDropTab, getTabIcon: nativeGetTabIcon, getTabBadge } = props;
    ${marker}
    const getTabIcon = tab => tab.id === 'sherlock-research-conversation' || tab.type === 'sherlock-research-conversation'
      ? (0, react_jsx_runtime.jsx)('svg', {width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.25,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,'data-conversation-tab-icon':true,children:(0, react_jsx_runtime.jsx)('path',{d:'M13.5 7.5a5.5 5.5 0 0 1-5.5 5.5H3l-1 1V7.5a5.75 5.75 0 0 1 11.5 0Z'})})
      : nativeGetTabIcon?.(tab);`, 'conversation tab icon')
  return source.slice(0, start) + part + source.slice(end)
}

// Integration management uses the native right pane temporarily. The conversation's
// stored panel visibility, tabs and drafts survive leaving this workspace surface.
function patchIntegrationWorkspaceControls(source) {
  const marker = '/* sherlock:integration-workspace-controls:v2 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('function Sidebar(props) {'), end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw new Error('Integration workspace Sidebar controls boundary missing')
  let part = source.slice(start, end)
  part = replaceExact(part, '"data-scheduled-panel": scheduledPanel.active || void 0,', `${marker}
                "data-workspace-panel": workspacePanel.active ? 'integrations' : void 0,
                "data-scheduled-panel": scheduledPanel.active || void 0,`, 'integration native pane control ownership')
  for (const key of ['label', '"aria-label"']) {
    part = replaceExact(part, `${key}: state.panelOpen ? t("collapse") : t("expand"),`, `${key}: workspacePanel.active ? (state.panelOpen ? '收起右侧屏' : '展开右侧屏') : state.panelOpen ? t("collapse") : t("expand"),`, 'integration native pane control label')
  }
  return source.slice(0, start) + part + source.slice(end)
}

function patchIntegrationWorkspacePanel(source) {
  const marker = '/* sherlock:integration-workspace-panel:v1 */'
  if (source.includes(marker)) return source
  const start=source.indexOf('function Sidebar(props) {'), end=source.indexOf('\n\t\t//#endregion',start)
  if(start<0 || end<0)throw new Error('Integration workspace Sidebar boundary missing')
  let part=source.slice(start,end)
  part=replaceExact(part, 'const [scheduledPanel, setScheduledPanel]', `${marker}
      const [workspacePanel, setWorkspacePanel] = (0, react.useState)(() => ({active:document.body.dataset.workspaceSurface === 'integrations', open:document.body.dataset.workspaceRightExpanded === 'true'}));
      (0, react.useEffect)(() => {
        const activate = event => setWorkspacePanel(value => ({...value, active:event.detail?.active === true && event.detail?.surface === 'integrations'}));
        const toggle = event => { if(event.detail?.surface === 'integrations' && typeof event.detail?.open === 'boolean') setWorkspacePanel(value => ({...value, open:event.detail.open})); };
        window.addEventListener('sherlock:workspace-surface-change',activate);
        window.addEventListener('sherlock:workspace-panel',toggle);
        return () => { window.removeEventListener('sherlock:workspace-surface-change',activate); window.removeEventListener('sherlock:workspace-panel',toggle); };
      }, []);
      (0, react.useEffect)(() => {
        if(workspacePanel.active)window.dispatchEvent(new CustomEvent('sherlock:workspace-panel-state', {detail:{surface:'integrations',open:workspacePanel.open}}));
      }, [workspacePanel.active,workspacePanel.open]);
      const [scheduledPanel, setScheduledPanel]`, 'integration pane lifecycle')
  part=replaceExact(part, 'width:nativeSnapshot.state?.width ?? scheduledWidth}} : nativeSnapshot;', 'width:nativeSnapshot.state?.width ?? scheduledWidth}} : workspacePanel.active ? {...nativeSnapshot,state:{...(nativeSnapshot.state ?? emptyScheduledState),panelOpen:workspacePanel.open,bottomOpen:false,width:nativeSnapshot.state?.width ?? scheduledWidth}} : nativeSnapshot;', 'integration pane state')
  part=replaceExact(part, '!scheduledPanel.active && snapshot.state && compactPanel', '!scheduledPanel.active && !workspacePanel.active && snapshot.state && compactPanel', 'integration compact state')
  part=replaceExact(part, '(!scheduledPanel.active && compactPanel ? compactPanelOpen : snapshot.state?.panelOpen === true)', '(!scheduledPanel.active && !workspacePanel.active && compactPanel ? compactPanelOpen : snapshot.state?.panelOpen === true)', 'integration pane occupancy')
  part=replaceExact(part, 'narrow, compactPanel, compactPanelOpen, scheduledPanel.active,', 'narrow, compactPanel, compactPanelOpen, scheduledPanel.active, workspacePanel.active,', 'integration pane geometry dependencies')
  part=replaceExact(part, '(!scheduledPanel.active && sessionId === void 0)', '(!scheduledPanel.active && !workspacePanel.active && sessionId === void 0)', 'integration pane without a session')
  part=replaceExact(part, 'const showBottomToggle = !scheduledPanel.active && !narrow', 'const showBottomToggle = !scheduledPanel.active && !workspacePanel.active && !narrow', 'integration right-only pane')
  part=replaceExact(part, '} else if (compactPanel) setCompactPanelOpen(value=>!value); else store.reduce(togglePanel);', '} else if (workspacePanel.active) setWorkspacePanel(value => ({...value,open:!value.open})); else if (compactPanel) setCompactPanelOpen(value=>!value); else store.reduce(togglePanel);', 'integration native toggle')
  return patchIntegrationWorkspaceControls(source.slice(0,start)+part+source.slice(end))
}

function patchScheduledGlobalPanel(source) {
  source = patchComponentNativeTabSelection(source)
  const marker = '/* sherlock:scheduled-global-panel:v1 */'
  if (source.includes(marker)) return patchIntegrationWorkspacePanel(source.replaceAll("inert: scheduledPanel.active ? '' : void 0", "inert: scheduledPanel.active && !document.body.hasAttribute('data-scheduled-component') ? '' : void 0"))
  const start = source.indexOf('function Sidebar(props) {')
  const end = source.indexOf('\n\t\t//#endregion', start)
  let part = source.slice(start, end)
  part = replaceExact(part, 'const snapshot = (0, react.useSyncExternalStore)', 'const nativeSnapshot = (0, react.useSyncExternalStore)', 'scheduled native snapshot')
  part = replaceExact(part, 'const current = sessionList.current;', `const current = sessionList.current;
      ${marker}
      const [scheduledPanel, setScheduledPanel] = (0, react.useState)(() => ({active:document.body.hasAttribute('data-scheduled-page'), open:document.body.dataset.scheduledDetail === 'true'}));
      const [scheduledWidth, setScheduledWidth] = (0, react.useState)(() => { try { return Number(localStorage.getItem('odyssey-global-panel-width')) || 340; } catch { return 340; } });
      const emptyScheduledState = (0, react.useMemo)(() => makeDefaultState(340, false, 'none'), []);
      (0, react.useEffect)(() => {
        const update = event => {
          const value = event.detail;
          if (typeof value?.active !== 'boolean' || typeof value?.open !== 'boolean') return;
          setScheduledPanel({active:value.active, open:value.open});
        };
        window.addEventListener('sherlock:scheduled-panel', update);
        return () => window.removeEventListener('sherlock:scheduled-panel', update);
      }, []);`, 'scheduled presentation state')
  part = replaceExact(part, 'const state = snapshot.state && compactPanel ? {...snapshot.state, panelOpen:compactPanelOpen} : snapshot.state;', `const snapshot = scheduledPanel.active ? {...nativeSnapshot, state:{...(nativeSnapshot.state ?? emptyScheduledState), panelOpen:scheduledPanel.open, bottomOpen:false, width:nativeSnapshot.state?.width ?? scheduledWidth}} : nativeSnapshot;
      const state = !scheduledPanel.active && snapshot.state && compactPanel ? {...snapshot.state, panelOpen:compactPanelOpen} : snapshot.state;
      const resizePanel = (width, reduce) => {
        if (scheduledPanel.active) {
          setScheduledWidth(width);
          try { localStorage.setItem('odyssey-global-panel-width', String(width)); } catch {}
          store.reduce(s => setWidth(s, width));
        } else store.reduce(reduce);
      };`, 'scheduled effective state')
  part = replaceExact(part, 'store.reduce(reduce);\n\t\t\t};', 'resizePanel(width, reduce);\n\t\t\t};', 'scheduled width commit')
  part = replaceExact(part, 'store.reduce((s) => setBottomHeight(setWidth(s, width), height));', 'resizePanel(width, (s) => setBottomHeight(setWidth(s, width), height));', 'scheduled cancelled width commit')
  part = replaceExact(part, '(compactPanel ? compactPanelOpen : snapshot.state?.panelOpen === true)', '(!scheduledPanel.active && compactPanel ? compactPanelOpen : snapshot.state?.panelOpen === true)', 'scheduled compact occupancy')
  part = replaceExact(part, 'narrow, compactPanel, compactPanelOpen,', 'narrow, compactPanel, compactPanelOpen, scheduledPanel.active,', 'scheduled geometry dependency')
  part = replaceExact(part, 'if (state === void 0 || sessionId === void 0) return', 'if (state === void 0 || (!scheduledPanel.active && sessionId === void 0)) return', 'scheduled no-session shell')
  part = replaceExact(part, 'const showBottomToggle = !narrow && state.panelOpen;', 'const showBottomToggle = !scheduledPanel.active && !narrow && state.panelOpen;', 'scheduled right-only controls')
  part = replaceExact(part, '"data-odyssey-panel-right": state.panelOpen ? "open" : "closed",', '"data-scheduled-panel": scheduledPanel.active || void 0,\n\t\t\t\t"data-odyssey-panel-right": state.panelOpen ? "open" : "closed",', 'scheduled host identity')
  part = replaceExact(part, 'if (compactPanel) setCompactPanelOpen(value=>!value); else store.reduce(togglePanel);', `if (scheduledPanel.active) {
                    const open = !scheduledPanel.open;
                    setScheduledPanel(value => ({...value, open}));
                    window.dispatchEvent(new CustomEvent('sherlock:scheduled-panel-toggle', {detail:{open}}));
                  } else if (compactPanel) setCompactPanelOpen(value=>!value); else store.reduce(togglePanel);`, 'scheduled native toggle')
  part = replaceExact(part, 'className: sidebar_module_css_default.panelBody,', `className: sidebar_module_css_default.panelBody,
                inert: scheduledPanel.active && !document.body.hasAttribute('data-scheduled-component') ? '' : void 0,`, 'preserve inactive workspace content', 2)
  part = replaceExact(part, '!narrow && state.panelOpen && state.bottomOpen &&', `/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {"data-scheduled-panel-slot":true, hidden:!scheduledPanel.active}),
              !narrow && state.panelOpen && state.bottomOpen &&`, 'scheduled content slot')
  return patchIntegrationWorkspacePanel(source.slice(0, start) + part + source.slice(end))
}

export function patchBetterSidebarClient(source) {
  if(source.includes('/* sherlock:native-knowledge-editor:v1 */'))
    return patchSidebarPptxToolbar(patchPendingConversationPanel(patchResidentConversationTab(source)))
  source=stripPendingConversationPanel(source)
  source = patchSubagentAvatars(source, 'task-tree')
  source = patchSidebarPptxToolbar(source)
  source = patchResearchTabIcons(source)
  source = source.replace("tab.id === componentTabId ? (0, react_jsx_runtime.jsxs)('svg', {width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1,children:[(0, react_jsx_runtime.jsx)('circle',{cx:8,cy:8,r:6}),(0, react_jsx_runtime.jsx)('path',{d:'M8 4v4l3 2'})]}) : getTabIcon?.(tab) ?? null", "getTabIcon?.(tab.id === componentTabId ? {...tab,type:'scheduled'} : tab) ?? null")
  source = patchSidebarFileRefresh(source)
  source = patchSidebarFileReference(source)
  source = patchSubagentPanelEntry(source, true)
  source = patchFigmaTaskTabIcon(patchFigmaNativeFileMenu(source))
  let next = patchFigmaPanelDefaultWidth(
    patchFigmaFilePanel(
      patchFigmaPanelMotionSync(
        patchPanelWindowPointerFallback(
          patchFigmaBottomClose(
            patchNoSessionPanelPending(
              patchFigmaPanelLayout(patchPanelToggleGlyphs(source))
            )
          )
        )
      )
    )
  )

  next = patchSidebarRefreshFeedback(next)

  if (!next.includes(RESEARCH_GENERATION_FOCUS_PATCH_MARKER)) {
    next = replaceExact(next,
      '\t\tfunction detectNewDirectSubagent(prev, next, sessionId) {',
      `\t\t${RESEARCH_GENERATION_FOCUS_PATCH_MARKER}\n${sherlockResearchGenerationOwnsFocus.toString()}\n\t\tfunction detectNewDirectSubagent(prev, next, sessionId) {`,
      'Research generation focus predicate')
    next = replaceExact(next,
      '\t\t\t\tif (!detectNewDirectSubagent(prev, sessionList, sessionId)) return;',
      '\t\t\t\tif (!detectNewDirectSubagent(prev, sessionList, sessionId)) return;\n\t\t\t\tif (sherlockResearchGenerationOwnsFocus(store.getSnapshot().state)) return;',
      'Research generation automatic task tab focus')
  }

  if (!next.includes(PATCH_MARKER)) next = replaceExact(
    next,
    '\t\tfunction openTabInActivePane(state, tab) {\n\t\t\tlet targetId = state.activePane ?? firstLeaf(state.splits).id;',
    `\t\tfunction openTabInActivePane(state, tab) {\n\t\t\t${PATCH_MARKER}\n\t\t\tconst pinned = tab.meta?.sherlockPinned === true;\n\t\t\tlet targetId = pinned ? firstLeaf(state.splits).id : state.activePane ?? firstLeaf(state.splits).id;`,
    'pinned landing pane'
  )
  if (!source.includes(PATCH_MARKER)) next = replaceExact(
    next,
    '\t\t\t\t[targetKey]: mapLeaf(state[targetKey], targetId, (leaf) => {\n\t\t\t\t\tleaf.tabs = [...leaf.tabs, tab];\n\t\t\t\t\tleaf.active = tab.id;',
    '\t\t\t\t[targetKey]: mapLeaf(state[targetKey], targetId, (leaf) => {\n\t\t\t\t\tleaf.tabs = pinned ? [tab, ...leaf.tabs] : [...leaf.tabs, tab];\n\t\t\t\t\tleaf.active = tab.id;',
    'pinned first position'
  )
  if (!next.includes(RECONCILE_PATCH_MARKER)) next = replaceExact(
    next,
    '\t\t\t\tconst existing = leaf.tabs.find((candidate) => candidate.id === tab.id);\n\t\t\t\tif (existing !== void 0) return activateTab(state, leaf.id, existing.id);',
    `\t\t\t\tconst existing = leaf.tabs.find((candidate) => candidate.id === tab.id);\n\t\t\t\t${RECONCILE_PATCH_MARKER}\n\t\t\t\tif (existing !== void 0) {\n\t\t\t\t\tif (!pinned) return activateTab(state, leaf.id, existing.id);\n\t\t\t\t\tconst reconciled = { ...existing, ...tab, meta: { ...existing.meta, ...tab.meta } };\n\t\t\t\t\treturn openTabInActivePane(closeTab(state, leaf.id, existing.id), reconciled);\n\t\t\t\t}`,
    'persisted pinned tab reconciliation'
  )
  next = patchSubagentPanelDestination(next)

  if (!next.includes(EDGE_PATCH_MARKER)) next = replaceExact(
    next,
    '\t\tfunction moveTabToEdge(state, fromPane, tabId, toPane, zone) {',
    `\t\tfunction moveTabToEdge(state, fromPane, tabId, toPane, zone) {\n\t\t\t${EDGE_PATCH_MARKER}\n\t\t\tconst moving = leafWithTab(state[treeOf(state, fromPane)], tabId)?.tabs.find((tab) => tab.id === tabId);\n\t\t\tif (moving?.meta?.sherlockPinned === true) return state;\n\t\t\tconst targetHasPinned = leafWithTab(state[treeOf(state, toPane)], \"sherlock-research-conversation\")?.id === toPane;\n\t\t\tif (targetHasPinned && (zone === \"left\" || zone === \"up\")) zone = \"center\";`,
    'pinned edge boundary'
  )

  if (next.includes(FILE_DRAG_PATCH_MARKER) && !next.includes('const previewEligible = relativePath !== null')) {
    next = replaceExact(
      next,
      '\t\t\tconst relativePath = safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint);\n\t\t\tevent.dataTransfer.effectAllowed = "copy";\n\t\t\tevent.dataTransfer.setData("application/x-sherlock-file", JSON.stringify(relativePath === null ? { path: filePath, name } : { path: filePath, name, sessionId, relativePath }));',
      '\t\t\tconst relativePath = safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint);\n\t\t\tconst previewEligible = relativePath !== null && relativePath.length <= 512 && typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 512;\n\t\t\tevent.dataTransfer.effectAllowed = "copy";\n\t\t\tevent.dataTransfer.setData("application/x-sherlock-file", JSON.stringify(previewEligible ? { path: filePath, name, sessionId, relativePath } : { path: filePath, name }));',
      'bounded Research file preview identity'
    )
  }

  if (!next.includes(FILE_DRAG_PATCH_MARKER) && next.includes(LEGACY_FILE_DRAG_PATCH_MARKER)) {
    next = replaceExact(
      next,
      `${LEGACY_FILE_DRAG_PATCH_MARKER}\n\t\tfunction writeSherlockSidebarFileDrag(event, filePath, name) {\n\t\t\tif (event.dataTransfer === null) return;\n\t\t\tevent.dataTransfer.effectAllowed = "copy";\n\t\t\tevent.dataTransfer.setData("application/x-sherlock-file", JSON.stringify({ path: filePath, name }));\n\t\t}`,
      `${FILE_DRAG_PATCH_MARKER}\n\t\tfunction safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint) {\n\t\t\tconst raw = typeof relativePathHint === "string" ? relativePathHint : typeof cwd === "string" && (filePath.startsWith(\`\${cwd}/\`) || filePath.startsWith(\`\${cwd}\\\\\`)) ? filePath.slice(cwd.length + 1) : "";\n\t\t\tconst relativePath = raw.replaceAll("\\\\", "/");\n\t\t\tif (relativePath === "" || /^(?:\\/|[A-Za-z]:\\/)/.test(relativePath) || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) return null;\n\t\t\treturn relativePath;\n\t\t}\n\t\tfunction writeSherlockSidebarFileDrag(event, filePath, name, sessionId, cwd, relativePathHint) {\n\t\t\tif (event.dataTransfer === null) return;\n\t\t\tconst relativePath = safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint);\n\t\t\tconst previewEligible = relativePath !== null && relativePath.length <= 512 && typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 512;\n\t\t\tevent.dataTransfer.effectAllowed = "copy";\n\t\t\tevent.dataTransfer.setData("application/x-sherlock-file", JSON.stringify(previewEligible ? { path: filePath, name, sessionId, relativePath } : { path: filePath, name }));\n\t\t}`,
      'Research file drag payload upgrade'
    )
    next = replaceExact(next,
      'writeSherlockSidebarFileDrag(event, entry.path, entry.name);',
      'writeSherlockSidebarFileDrag(event, entry.path, entry.name, sessionId, cwd);',
      'file tree preview identity')
    next = replaceExact(next,
      'writeSherlockSidebarFileDrag(event, absolutePath, baseName$1(absolutePath));',
      'writeSherlockSidebarFileDrag(event, absolutePath, baseName$1(absolutePath), sessionId, cwd, rel);',
      'search result preview identity')
  }

  if (!next.includes(FILE_DRAG_PATCH_MARKER)) {
    next = replaceExact(
      next,
      `\t\tfunction baseName$1(path) {\n\t\t\tconst trimmed = path.replace(/[\\\\/]+$/, "");\n\t\t\tconst at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\\\"));\n\t\t\treturn at === -1 ? trimmed : trimmed.slice(at + 1);\n\t\t}\n\t\t/** How long the row's "copied" label stays after a successful write. */`,
      `\t\tfunction baseName$1(path) {\n\t\t\tconst trimmed = path.replace(/[\\\\/]+$/, "");\n\t\t\tconst at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\\\"));\n\t\t\treturn at === -1 ? trimmed : trimmed.slice(at + 1);\n\t\t}\n\t\t${FILE_DRAG_PATCH_MARKER}\n\t\tfunction safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint) {\n\t\t\tconst raw = typeof relativePathHint === "string" ? relativePathHint : typeof cwd === "string" && (filePath.startsWith(\`\${cwd}/\`) || filePath.startsWith(\`\${cwd}\\\\\`)) ? filePath.slice(cwd.length + 1) : "";\n\t\t\tconst relativePath = raw.replaceAll("\\\\", "/");\n\t\t\tif (relativePath === "" || /^(?:\\/|[A-Za-z]:\\/)/.test(relativePath) || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) return null;\n\t\t\treturn relativePath;\n\t\t}\n\t\tfunction writeSherlockSidebarFileDrag(event, filePath, name, sessionId, cwd, relativePathHint) {\n\t\t\tif (event.dataTransfer === null) return;\n\t\t\tconst relativePath = safeSherlockSidebarRelativePath(filePath, cwd, relativePathHint);\n\t\t\tconst previewEligible = relativePath !== null && relativePath.length <= 512 && typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 512;\n\t\t\tevent.dataTransfer.effectAllowed = "copy";\n\t\t\tevent.dataTransfer.setData("application/x-sherlock-file", JSON.stringify(previewEligible ? { path: filePath, name, sessionId, relativePath } : { path: filePath, name }));\n\t\t}\n\t\t/** How long the row's "copied" label stays after a successful write. */`,
      'Research file drag payload'
    )
    next = replaceExact(
      next,
      `\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 + 6 },\n\t\t\t\t\t\ttitle: entry.broken ? \`\${entry.path} — \${t("brokenSymlink")}\` : entry.path,\n\t\t\t\t\t\tonClick: () => {`,
      `\t\t\t\t\t\tstyle: { paddingLeft: depth * 22 + 6 },\n\t\t\t\t\t\ttitle: entry.broken ? \`\${entry.path} — \${t("brokenSymlink")}\` : entry.path,\n\t\t\t\t\t\tdraggable: true,\n\t\t\t\t\t\t"data-sherlock-file-drag-source": entry.path,\n\t\t\t\t\t\tonDragStart: (event) => {\n\t\t\t\t\t\t\twriteSherlockSidebarFileDrag(event, entry.path, entry.name, sessionId, cwd);\n\t\t\t\t\t\t},\n\t\t\t\t\t\tonClick: () => {`,
      'file tree drag source'
    )
    next = replaceExact(
      next,
      `\t\t\t\t\t\terror === null && results !== null && results.matches.map((rel) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\tclassName: sidebar_module_css_default.editorSearchResult,\n\t\t\t\t\t\t\ttitle: rel,\n\t\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\t\tonOpenFile(resolveSidebarPath(cwd, rel));\n\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\tchildren: rel\n\t\t\t\t\t\t}, rel)),`,
      `\t\t\t\t\t\terror === null && results !== null && results.matches.map((rel) => {\n\t\t\t\t\t\t\tconst absolutePath = resolveSidebarPath(cwd, rel);\n\t\t\t\t\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.editorSearchResult,\n\t\t\t\t\t\t\t\ttitle: rel,\n\t\t\t\t\t\t\t\tdraggable: true,\n\t\t\t\t\t\t\t\t"data-sherlock-file-drag-source": absolutePath,\n\t\t\t\t\t\t\t\tonDragStart: (event) => {\n\t\t\t\t\t\t\t\t\twriteSherlockSidebarFileDrag(event, absolutePath, baseName$1(absolutePath), sessionId, cwd, rel);\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\t\t\tonOpenFile(absolutePath);\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tchildren: rel\n\t\t\t\t\t\t\t}, rel);\n\t\t\t\t\t\t}),`,
      'search result drag source'
    )
  }

  if (!next.includes(PANEL_DRAG_DIMENSION_PATCH_MARKER)) next = replaceExact(
    next,
    `\t\t\tconst applyDrag = (width, height) => {
\t\t\t\tpanelRef.current?.style.setProperty("width", \`\${width}px\`);
\t\t\t\tbottomRef.current?.style.setProperty("height", \`\${height}px\`);
\t\t\t\tbottomRef.current?.style.setProperty("right", \`\${window.innerWidth - centerRect.right + (width - (state?.width ?? 0))}px\`);
\t\t\t\twriteGeometry(width, height);
\t\t\t};`,
    `\t\t\tconst applyDrag = (width, height) => {
\t\t\t\t${PANEL_DRAG_DIMENSION_PATCH_MARKER}
\t\t\t\tif (width > 0) panelRef.current?.style.setProperty("width", \`\${width}px\`);
\t\t\t\tif (height > 0) bottomRef.current?.style.setProperty("height", \`\${height}px\`);
\t\t\t\tbottomRef.current?.style.setProperty("right", \`\${window.innerWidth - centerRect.right + (width - (state?.width ?? 0))}px\`);
\t\t\t\twriteGeometry(width, height);
\t\t\t};`,
    'dragged panel physical dimensions'
  )

  if (!next.includes(PANEL_SURFACE_SYNC_PATCH_MARKER)) next = replaceExact(
    next,
    `\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (anyDragging) document.body.setAttribute("data-dsh-sidebar-dragging", "");
\t\t\t\telse document.body.removeAttribute("data-dsh-sidebar-dragging");
\t\t\t}, [anyDragging]);`,
    `\t\t\t(0, react.useLayoutEffect)(() => {
\t\t\t\t${PANEL_SURFACE_SYNC_PATCH_MARKER}
\t\t\t\tconst committed = snapshot.state;
\t\t\t\tif (anyDragging || narrow || committed === void 0) return;
\t\t\t\tpanelRef.current?.style.setProperty("width", \`\${Math.min(committed.width, window.innerWidth)}px\`);
\t\t\t\tbottomRef.current?.style.setProperty("height", \`\${Math.min(committed.bottomHeight, window.innerHeight)}px\`);
\t\t\t\tif (centerRect.right > 0) bottomRef.current?.style.setProperty("right", \`\${window.innerWidth - centerRect.right}px\`);
\t\t\t}, [
\t\t\t\tanyDragging,
\t\t\t\tnarrow,
\t\t\t\tsnapshot.state?.panelOpen,
\t\t\t\tsnapshot.state?.width,
\t\t\t\tsnapshot.state?.bottomOpen,
\t\t\t\tsnapshot.state?.bottomHeight,
\t\t\t\tcenterRect.right
\t\t\t]);
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (anyDragging) document.body.setAttribute("data-dsh-sidebar-dragging", "");
\t\t\t\telse document.body.removeAttribute("data-dsh-sidebar-dragging");
\t\t\t}, [anyDragging]);`,
    'committed panel surface dimensions'
  )

  if (source.includes(PATCH_MARKER)) return patchPendingConversationPanel(patchScheduledGlobalPanel(patchSidebarSystemTitles(patchFigmaCompactPanel(patchSidebarPdfPreview(patchFigmaPanelBounds(patchTabBarOverflow(patchTabBarMenuLayout(next))))))))

  const moveBefore = `\t\t\t\t\tconst insertAt = index >= 0 && index <= leaf.tabs.length ? index : leaf.tabs.length;\n\t\t\t\t\tleaf.tabs = [\n\t\t\t\t\t\t...leaf.tabs.slice(0, insertAt),\n\t\t\t\t\t\tmoved,\n\t\t\t\t\t\t...leaf.tabs.slice(insertAt)\n\t\t\t\t\t];`
  const moveAfter = `\t\t\t\t\tconst requestedIndex = index >= 0 && index <= leaf.tabs.length ? index : leaf.tabs.length;\n\t\t\t\t\tconst pinnedCount = leaf.tabs.filter((tab) => tab.meta?.sherlockPinned === true).length;\n\t\t\t\t\tconst insertAt = moved.meta?.sherlockPinned === true ? 0 : Math.max(pinnedCount, requestedIndex);\n\t\t\t\t\tleaf.tabs = [\n\t\t\t\t\t\t...leaf.tabs.slice(0, insertAt),\n\t\t\t\t\t\tmoved,\n\t\t\t\t\t\t...leaf.tabs.slice(insertAt)\n\t\t\t\t\t];`
  next = replaceExact(next, moveBefore, moveAfter, 'cross-panel pinned move boundary')
  next = replaceExact(
    next,
    moveBefore.replaceAll('\t\t\t\t\t', '\t\t\t\t'),
    moveAfter.replaceAll('\t\t\t\t\t', '\t\t\t\t'),
    'same-panel pinned move boundary'
  )

  next = replaceExact(
    next,
    '\t\t\t"settingSelect"\n\t\t];',
    '\t\t\t"settingSelect",\n\t\t\t"panelState"\n\t\t];',
    'panel state feature'
  )

  const serviceBefore = `\t\t\tconst closeTab$1 = (tabId, scope) => {\n\t\t\t\tlet closed;\n\t\t\t\tstore.reduce((state) => {\n\t\t\t\t\tif (!tabOpenIn(state, tabId)) return state;\n\t\t\t\t\tconst paneId = findPaneIdOf(state, tabId);\n\t\t\t\t\tclosed = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);\n\t\t\t\t\treturn closeTab(state, paneId, tabId);\n\t\t\t\t});\n\t\t\t\tif (closed !== void 0) {\n\t\t\t\t\tconst sessionId = scope?.sessionId ?? store.getSnapshot().sessionId;\n\t\t\t\t\tif (sessionId !== void 0) {\n\t\t\t\t\t\tconst descriptor = tabs.get(closed.type);\n\t\t\t\t\t\tsafeCall(() => descriptor?.onClose?.(closed, scope ?? { sessionId }));\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t};\n\t\t\t/** The snapshot the store publishes (state/prefs carry the active session). */\n\t\t\tconst getSnapshot = () => store.getSnapshot();\n\t\t\t/** Store changes: session switch, state mutations, prefs writes. */\n\t\t\tconst subscribeState = (listener) => store.subscribe(listener);\n\t\t\t/** Patch an open tab's display fields (a missing tab id is a no-op). */\n\t\t\tconst updateTab = (tabId, patch) => {\n\t\t\t\tstore.reduce((state) => patchTab(state, tabId, {\n\t\t\t\t\t...patch.title !== void 0 ? { title: patch.title } : {},\n\t\t\t\t\t...patch.path !== void 0 ? { path: patch.path } : {},\n\t\t\t\t\t...patch.meta !== void 0 ? { meta: patch.meta } : {}\n\t\t\t\t}));\n\t\t\t};\n\t\t\t/** Activate an open tab (the tab-bar activation path; fires onActivate). */\n\t\t\tconst activateTab$1 = (tabId, scope) => {\n\t\t\t\tlet activated;\n\t\t\t\tstore.reduce((state) => {\n\t\t\t\t\tif (!tabOpenIn(state, tabId)) return state;\n\t\t\t\t\tconst paneId = findPaneIdOf(state, tabId);\n\t\t\t\t\tactivated = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);\n\t\t\t\t\treturn activateTab(state, paneId, tabId);\n\t\t\t\t});\n\t\t\t\tif (activated !== void 0) {\n\t\t\t\t\tconst sessionId = scope?.sessionId ?? store.getSnapshot().sessionId;\n\t\t\t\t\tif (sessionId !== void 0) {\n\t\t\t\t\t\tconst descriptor = tabs.get(activated.type);\n\t\t\t\t\t\tsafeCall(() => descriptor?.onActivate?.(activated, scope ?? { sessionId }));\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t};`
  const serviceAfter = `\t\t\tconst closeTab$1 = (tabId, scope) => {\n\t\t\t\tlet closed;\n\t\t\t\tconst activeSessionId = store.getSnapshot().sessionId;\n\t\t\t\tconst targetsInactiveSession = scope !== void 0 && scope.sessionId !== activeSessionId;\n\t\t\t\tconst reducer = (state) => {\n\t\t\t\t\tif (!tabOpenIn(state, tabId)) return state;\n\t\t\t\t\tconst paneId = findPaneIdOf(state, tabId);\n\t\t\t\t\tconst candidate = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);\n\t\t\t\t\tif (candidate?.meta?.sherlockClosable === false) return state;\n\t\t\t\t\tclosed = candidate;\n\t\t\t\t\treturn closeTab(state, paneId, tabId);\n\t\t\t\t};\n\t\t\t\tif (targetsInactiveSession) store.reduceFor(scope.sessionId, reducer);\n\t\t\t\telse store.reduce(reducer);\n\t\t\t\tif (closed !== void 0) {\n\t\t\t\t\tconst sessionId = scope?.sessionId ?? activeSessionId;\n\t\t\t\t\tif (sessionId !== void 0) {\n\t\t\t\t\t\tconst descriptor = tabs.get(closed.type);\n\t\t\t\t\t\tsafeCall(() => descriptor?.onClose?.(closed, scope ?? { sessionId }));\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t};\n\t\t\t/** The snapshot the store publishes (state/prefs carry the active session). */\n\t\t\tconst getSnapshot = () => store.getSnapshot();\n\t\t\t/** Store changes: session switch, state mutations, prefs writes. */\n\t\t\tconst subscribeState = (listener) => store.subscribe(listener);\n\t\t\t/** Patch an open tab's display fields (a missing tab id is a no-op). */\n\t\t\tconst updateTab = (tabId, patch, scope) => {\n\t\t\t\tconst reducer = (state) => patchTab(state, tabId, {\n\t\t\t\t\t...patch.title !== void 0 ? { title: patch.title } : {},\n\t\t\t\t\t...patch.path !== void 0 ? { path: patch.path } : {},\n\t\t\t\t\t...patch.meta !== void 0 ? { meta: patch.meta } : {}\n\t\t\t\t});\n\t\t\t\tconst targetsInactiveSession = scope !== void 0 && scope.sessionId !== store.getSnapshot().sessionId;\n\t\t\t\ttargetsInactiveSession ? store.reduceFor(scope.sessionId, reducer) : store.reduce(reducer);\n\t\t\t};\n\t\t\t/** Activate an open tab (the tab-bar activation path; fires onActivate). */\n\t\t\tconst activateTab$1 = (tabId, scope) => {\n\t\t\t\tlet activated;\n\t\t\t\tconst activeSessionId = store.getSnapshot().sessionId;\n\t\t\t\tconst targetsInactiveSession = scope !== void 0 && scope.sessionId !== activeSessionId;\n\t\t\t\tconst reducer = (state) => {\n\t\t\t\t\tif (!tabOpenIn(state, tabId)) return state;\n\t\t\t\t\tconst paneId = findPaneIdOf(state, tabId);\n\t\t\t\t\tactivated = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);\n\t\t\t\t\treturn activateTab(state, paneId, tabId);\n\t\t\t\t};\n\t\t\t\tif (targetsInactiveSession) store.reduceFor(scope.sessionId, reducer);\n\t\t\t\telse store.reduce(reducer);\n\t\t\t\tif (activated !== void 0) {\n\t\t\t\t\tconst sessionId = scope?.sessionId ?? activeSessionId;\n\t\t\t\t\tif (sessionId !== void 0) {\n\t\t\t\t\t\tconst descriptor = tabs.get(activated.type);\n\t\t\t\t\t\tsafeCall(() => descriptor?.onActivate?.(activated, scope ?? { sessionId }));\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t};`
  next = replaceExact(next, serviceBefore, serviceAfter, 'session-targeted service operations')

  next = replaceExact(
    next,
    '\t\t\t/** Open a file in the sidebar editor of `scope`\'s session (title defaults',
    `\t\t\tconst setPanelState = (patch, scope) => {\n\t\t\t\tconst reducer = (state) => {\n\t\t\t\t\tlet result = state;\n\t\t\t\t\tif (typeof patch.width === "number") result = setWidth(result, patch.width);\n\t\t\t\t\tif (typeof patch.open === "boolean" && result.panelOpen !== patch.open) result = { ...result, panelOpen: patch.open };\n\t\t\t\t\treturn result;\n\t\t\t\t};\n\t\t\t\tconst targetsInactiveSession = scope !== void 0 && scope.sessionId !== store.getSnapshot().sessionId;\n\t\t\t\ttargetsInactiveSession ? store.reduceFor(scope.sessionId, reducer) : store.reduce(reducer);\n\t\t\t};\n\t\t\t/** Open a file in the sidebar editor of \`scope\`'s session (title defaults`,
    'panel state service'
  )
  next = replaceExact(
    next,
    '\t\t\t\tactivateTab: activateTab$1,\n\t\t\t\topenFile',
    '\t\t\t\tactivateTab: activateTab$1,\n\t\t\t\tsetPanelState,\n\t\t\t\topenFile',
    'panel state export'
  )

  next = replaceExact(
    next,
    '\t\t\t\t\tchildren: [tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {',
    '\t\t\t\t\tchildren: [tabs.map((tab) => {\n\t\t\t\t\t\tconst pinned = tab.meta?.sherlockPinned === true;\n\t\t\t\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {',
    'tab render metadata'
  )
  next = replaceExact(next, '\t\t\t\t\t\tdraggable: true,', '\t\t\t\t\t\tdraggable: !pinned,', 'fixed tab drag')
  next = replaceExact(
    next,
    '\t\t\t\t\t\tonDragStart: (event) => {\n\t\t\t\t\t\t\tsetTabDragging(true);',
    '\t\t\t\t\t\tonDragStart: (event) => {\n\t\t\t\t\t\t\tif (pinned) { event.preventDefault(); return; }\n\t\t\t\t\t\t\tsetTabDragging(true);',
    'fixed tab drag handler'
  )
  next = replaceExact(
    next,
    '\t\t\t\t\t\t\tif (event.button === 1) {',
    '\t\t\t\t\t\t\tif (event.button === 1 && tab.meta?.sherlockClosable !== false) {',
    'fixed tab middle click'
  )
  const closeBefore = `\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.tabClose,\n\t\t\t\t\t\t\t\t"aria-label": t("close"),\n\t\t\t\t\t\t\t\tonClick: (event) => {\n\t\t\t\t\t\t\t\t\tevent.stopPropagation();\n\t\t\t\t\t\t\t\t\tonClose(tab.id);\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})\n\t\t\t\t\t\t\t})`
  const closeAfter = `\t\t\t\t\t\t\ttab.meta?.sherlockClosable !== false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\tclassName: sidebar_module_css_default.tabClose,\n\t\t\t\t\t\t\t\t"aria-label": t("close"),\n\t\t\t\t\t\t\t\tonClick: (event) => {\n\t\t\t\t\t\t\t\t\tevent.stopPropagation();\n\t\t\t\t\t\t\t\t\tonClose(tab.id);\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})\n\t\t\t\t\t\t\t}) : null`
  next = replaceExact(next, closeBefore, closeAfter, 'fixed tab close control')
  next = replaceExact(
    next,
    '\t\t\t\t\t}, tab.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
    '\t\t\t\t\t}, tab.id); }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
    'tab render closure'
  )

  return patchPendingConversationPanel(patchScheduledGlobalPanel(patchSidebarSystemTitles(patchFigmaCompactPanel(patchSidebarPdfPreview(patchFigmaPanelBounds(patchTabBarOverflow(patchTabBarMenuLayout(next))))))))
}

export async function patchBetterSidebarPackage(packageRoot) {
  const manifestPath = path.join(packageRoot, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-better-sidebar' || manifest.version !== '0.14.1') {
    throw new Error(
      `Unsupported Better Sidebar package for Sherlock patch: ${manifest.name}@${manifest.version}`
    )
  }
  const serverPath = path.join(packageRoot, 'lib', 'index.js')
  const serverSource = await readFile(serverPath, 'utf8')
  const serverPatched = patchBetterSidebarServer(serverSource)
  if (serverPatched !== serverSource) await writeFile(serverPath, serverPatched, 'utf8')
  const clientPath = path.join(packageRoot, 'lib', 'client.js')
  const source = await readFile(clientPath, 'utf8')
  const patched = patchSidebarKnowledgePreview(patchBetterSidebarClient(source))
  if (patched !== source) await writeFile(clientPath, patched, 'utf8')
  const terminalPath = path.join(packageRoot, 'lib', 'client-terminal.js')
  const terminal = await readFile(terminalPath, 'utf8')
  const glassTerminal = patchFigmaTerminalSurface(terminal)
  if (glassTerminal !== terminal) await writeFile(terminalPath, glassTerminal, 'utf8')
  const editorPath = path.join(packageRoot, 'lib', 'client-editor.js')
  const editor = await readFile(editorPath, 'utf8')
  const savedPreview = patchBetterSidebarEditor(editor)
  if (savedPreview !== editor) await writeFile(editorPath, savedPreview, 'utf8')
}

/** Keep the retained CodeMirror document authoritative after fsWrite completes.
 * EditorHost's content prop remains the initial fsRead snapshot until reopen. */
export function patchBetterSidebarEditor(source) {
  const marker = '/* sherlock:files-saved-preview:v1 */'
  let next = source.includes(marker) ? source : replaceExact(source,
    'api.fsWrite(scope, path, view.state.doc.toString()).then(() => {\n\t\t\t\tsavingRef.current = false;\n\t\t\t\tsetDraft(null);\n\t\t\t\tsetDirty(false);\n\t\t\t\tsetSaveState("saved");\n\t\t\t}).catch(() => {\n\t\t\t\tsavingRef.current = false;\n\t\t\t\tsetSaveState("failed");\n\t\t\t});',
    `${marker}
            const savedText = view.state.doc.toString();
            api.fsWrite(scope, path, savedText).then(() => {
                if (viewRef.current !== view) return;
                savingRef.current = false;
                const currentText = view.state.doc.toString();
                setDraft(currentText);
                setDirty(currentText !== savedText);
                setSaveState(currentText === savedText ? "saved" : "idle");
            }).catch(() => {
                if (viewRef.current !== view) return;
                savingRef.current = false;
                setSaveState("failed");
            });`,
    'Files saved preview and in-flight edits')
  if (!source.includes(marker)) next = replaceExact(next,
    'view.destroy();\n\t\t\t\tviewRef.current = null;',
    'view.destroy();\n\t\t\t\tsavingRef.current = false;\n\t\t\t\tviewRef.current = null;',
    'Files replacement editor save lock')
  const managedMarker = '/* sherlock:managed-text-editor:v1 */'
  if (next.includes(managedMarker)) return patchManagedMarkdownRevisions(next)
  const start = next.indexOf('function TextEditor(props) {')
  if (start < 0) throw Error('Native text editor source drifted')
  let editor = next.slice(start)
  const replace = (from, to) => { editor = replaceExact(editor, from, to, 'Knowledge library text editor') }
  replace('const editable = content !== void 0;', managedMarker + '\n\t\tconst editable = content !== void 0 && !props.readOnly;')
  replace('EditorState.tabSize.of(2),', 'EditorState.tabSize.of(2), EditorState.readOnly.of(Boolean(props.readOnly)), EditorView.editable.of(!props.readOnly),')
  replace('}, [content, path]);', '}, [content, path, props.readOnly]);')
  replace('if (view === null || savingRef.current) return;', 'if (view === null || savingRef.current || props.readOnly) return;')
  replace('api.fsWrite(scope, path, savedText).then(() => {', '(props.managedFile ? props.writeManagedText(savedText) : api.fsWrite(scope, path, savedText)).then(() => {')
  replace('...viewerId === "code" || viewerId === "markdown" ? [EditorView.updateListener', '...!props.managedFile && (viewerId === "code" || viewerId === "markdown") ? [EditorView.updateListener')
  replace('onMouseUp: handlePreviewMouseUp,', 'onMouseUp: props.managedFile ? undefined : handlePreviewMouseUp,')
  replace('}, [hostToolbar]);', '}, [hostToolbar, props.readOnly, props.writeManagedText]);')
  replace('editable && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children:', 'content !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children:')
  next = next.slice(0, start) + editor
  return patchManagedMarkdownRevisions(next)
}

function patchManagedMarkdownRevisions(source) {
  const marker = '/* sherlock:managed-text-revisions:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('function TextEditor(props) {')
  let editor = source.slice(start)
  const replace = (from, to) => { editor = replaceExact(editor, from, to, 'Knowledge Markdown revision') }
  replace('viewerId, content, truncated } = props;', 'viewerId, content: savedContent, truncated } = props;')
  replace('const [saveState, setSaveState]', `${marker}
    const [draftBase, setDraftBase] = (0, react.useState)(null);
    const currentSave = (0, react.useRef)(null);
    const managed = props.managedFile && viewerId === "markdown";
    const latest = managed ? { text: savedContent, revision: props.managedRevision } : null;
    const conflict = Boolean(latest && dirty && draftBase && draftBase.revision !== latest.revision);
    const base = latest && draftBase && (dirty || draftBase.revision === latest.revision) ? draftBase : latest;
    const content = base ? base.text : savedContent;
    currentSave.current = { base, conflict };
    const [saveState, setSaveState]`)
  replace('doc: content,', 'doc: managed && base === draftBase && draft !== null ? draft : content,')
  replace('if (update.docChanged) {', `if (update.docChanged) {
        if (managed) setDraftBase(currentSave.current.base);`)
  replace('if (view === null || savingRef.current || props.readOnly) return;', `const managedSave = props.managedFile ? currentSave.current : null;
        if (view === null || savingRef.current || props.readOnly || managedSave?.conflict) return;`)
  replace('props.writeManagedText(savedText)', 'props.writeManagedText(savedText, managedSave.base.revision)')
  replace('api.fsWrite(scope, path, savedText)).then(() => {', 'api.fsWrite(scope, path, savedText)).then((savedRevision) => {')
  replace('setDraft(currentText);', `if (managedSave?.base) setDraftBase({ text: managedSave.base.text, revision: savedRevision });
                setDraft(currentText);`)
  replace('const mdText = draft ?? content ?? "";', 'const mdText = (conflict ? savedContent : draft ?? content) ?? "";')
  replace('dirty,\n\t\t\t\teditable,', 'dirty,\n\t\t\t\teditable: editable && !conflict,')
  replace('children: [truncated === true && mode === "edit"', `children: [conflict && (0, react_jsx_runtime.jsxs)("div", {
          className: sidebar_module_css_default.editorBanner,
          role: "status",
          children: [document.documentElement.dataset.odysseyLocale === 'en'
            ? "A newer version is saved. Your draft is still in Edit."
            : "已有新版正文，草稿仍在编辑页。",
            (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: sidebar_module_css_default.editorModeButton,
              style: { marginInlineStart: 8 },
              onClick: () => {
                const view = viewRef.current;
                if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: savedContent ?? "" } });
                setDraftBase(null);
                setDraft(null);
                setDirty(false);
                setSaveState("idle");
                setMode("preview");
              },
              children: document.documentElement.dataset.odysseyLocale === 'en' ? "Discard draft and reload" : "放弃草稿并载入新版"
            })
          ]
        }), truncated === true && mode === "edit"`)
  return source.slice(0, start) + editor
}

export function patchFigmaTerminalSurface(source) {
  const marker = '/* sherlock:figma-terminal-glass:v1 */'
  if (source.includes(marker)) return source
  return marker + '\n' + replaceExact(source,
    'const background = effectiveTokenValue("--dsw-alias-bg-base") || (dark ? "#111114" : "#ffffff");',
    'const background = "#00000000";',
    'Figma terminal transparent canvas over themed panel')
    .replace('cursorAccent: background,', 'cursorAccent: dark ? "#151515" : "#fafafa",')
}

// Permit exact user attachments and successful read_image results from this session.
// Assistant references, arbitrary tool text and failed reads confer no access.
export function sherlockSessionHasChatFile(session, targetPath) {
  const imageCalls = new Map()
  for (const event of session?.events ?? []) {
    if (event.type === 'tool/call' && event.data?.name === 'read_image') {
      try {
        const args = JSON.parse(event.data.arguments)
        if (typeof args.file_path === 'string') imageCalls.set(event.data.callId, args.file_path)
      } catch {}
    }
    if (event.type === 'tool/result') {
      const message = event.data?.message
      if (message?.source?.kind === 'tool' && imageCalls.get(message.source.callId) === targetPath) {
        for (const block of message.content ?? []) {
          if (block.type !== 'tool-result' || block.isError || block.toolCallId !== message.source.callId) continue
          const content = block.content ?? []
          if (content.some(part => part.type === 'image' && typeof part.attachment?.attachmentId === 'string') &&
              content.some(part => part.type === 'text' && part.text?.startsWith('<path>' + targetPath + '</path>'))) return true
        }
      }
    }
    if (event.type !== 'user/message'  || event.data?.source?.kind !== 'user') continue
    const text = (event.data.content ?? []).filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('')
    for (const match of text.matchAll(/📎 文件：`((?:\\`|[^`])+)`/g)) {
      if (match[1].replaceAll('\\`', '`') === targetPath) return true
    }
  }
  return false
}

// A reserved board is deliberately virtual until its first file-producing tool.
// Only that exact session/root pair may be projected as an empty directory.
export async function sherlockVirtualBoardDirectory(sessionId, cwd, target, root = process.env.DSH_HOME) {
  if (!root || target !== cwd) return false
  let records
  try { records = JSON.parse(await readFile(path.join(root, 'research-board-directories.json'), 'utf8')) }
  catch { return false }
  if (!records || typeof records !== 'object' || !Object.values(records).some(row => row?.sessionId === sessionId && row?.path === cwd)) return false
  try { await stat(target); return false }
  catch (error) { return error?.code === 'ENOENT' }
}

function patchVirtualBoardListing(source) {
  const marker = '/* sherlock:virtual-board-listing:v1 */'
  if (source.includes(marker) || !source.includes('"fs.tree": async (payload) => {')) return source
  const before = 'const { cwd } = cwdOf(payload);\n\t\t\treturn listDirectory(payload.path === void 0 ? cwd : requireAbsolute(requireString(payload, "path")), resolved.listLimit);'
  const after = `const { sessionId, cwd } = cwdOf(payload);
      const target = payload.path === void 0 ? cwd : requireAbsolute(requireString(payload, "path"));
      if (await sherlockVirtualBoardDirectory(sessionId, cwd, target)) return { path:target, entries:[], truncated:false };
      return listDirectory(target, resolved.listLimit);`
  return marker+'\n'+sherlockVirtualBoardDirectory.toString().replace('path.join(', 'join(')+'\n'+replaceExact(source,before,after,'virtual board file listing')
}

export function patchBetterSidebarServer(source) {
  const scopeMarker = '/* sherlock:session-read-image-media:v2 */'
  if (source.includes('/* sherlock:session-attached-media:v1 */') && !source.includes(scopeMarker)) {
    const start = source.indexOf('function sherlockSessionHasChatFile(')
    const end = source.indexOf('\n}\n', start)
    if (start < 0 || end < 0) throw Error('Session media scope upgrade anchor missing')
    source = source.slice(0, start) + sherlockSessionHasChatFile.toString() + source.slice(end + 2)
    source = scopeMarker + '\n' + source
  }
  source = patchVirtualBoardListing(source)
  // Markdown and restored tabs may carry paths relative to the session root.
  // Resolve before the existing containment/attachment guard, never bypass it.
  const mediaPath = 'const path = requireAbsolute(raw);'
  if (source.includes(mediaPath)) source = replaceExact(source, mediaPath,
    'const path = resolve(cwd, raw); /* sherlock:relative-media-path:v1 */',
    'session-relative media preview path')
  const marker = '/* sherlock:session-attached-media:v1 */'
  const defaultWidthMarker = '/* sherlock:figma-panel-default-width-schema:v1 */'
  let next = source
  if (!next.includes(defaultWidthMarker) && next.includes('defaultWidthPercent: z.number().step(1).min(20).max(60).default(35),')) {
    next = defaultWidthMarker + '\n' + replaceExact(next,
      'defaultWidthPercent: z.number().step(1).min(20).max(60).default(35),',
      'defaultWidthPercent: z.number().step(1).min(0).max(60).default(0),',
      'Figma fixed default width schema')
  }
  if (next.includes(marker)) return next
  const guard = 'if (!isWithin(cwd, path)) throw new SidebarError("fs-error", "media path outside the session working directory", 403);'
  return `${scopeMarker}\n${marker}\n${sherlockSessionHasChatFile.toString()}\n` + replaceExact(next, guard,
    'if (!isWithin(cwd, path) && !sherlockSessionHasChatFile(ctx.sessions.get(sessionId), path)) throw new SidebarError("fs-error", "media path outside the session working directory", 403);',
    'session attached media scope')
}
