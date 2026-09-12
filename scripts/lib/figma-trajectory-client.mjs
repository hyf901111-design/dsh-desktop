const FIGMA_TRAJECTORY_MARKER = '/* sherlock:figma-trajectory:v1 */'

function replaceExact(source, anchor, replacement, label) {
  const first = source.indexOf(anchor)
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Unable to patch Figma trajectory ${label}: anchor missing or ambiguous`)
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length)
}

function replaceInSection(source, startAnchor, endAnchor, transform, label) {
  const start = source.indexOf(startAnchor)
  const end = source.indexOf(endAnchor, start)
  if (start < 0 || end < 0) throw new Error(`Unable to patch Figma trajectory ${label} boundary`)
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end)
}

function replaceAllExact(source, anchor, replacement, expected, label) {
  const count = source.split(anchor).length - 1
  if (count !== expected) {
    throw new Error(`Unable to patch Figma trajectory ${label}: expected ${expected}, found ${count}`)
  }
  return source.replaceAll(anchor, replacement)
}

/**
 * Add stable selectors and Figma copy to the real trajectory components.
 * Timeline projection, duration persistence, search, folding, virtualization,
 * history loading, table selection and detail inspection stay in the package.
 */
export function patchFigmaTrajectory(source) {
  // Also upgrade already-patched installations without reapplying the structural transform.
  source = source.replace('children: "No timing data"', 'children: laneLabels?.[0] === "输入" ? "暂无执行时长数据" : "No timing data"')
  if (source.includes(FIGMA_TRAJECTORY_MARKER)) return source.replace('"toolbar.searchPlaceholder": "搜索"', '"toolbar.searchPlaceholder": "搜索轨迹"')

  source = replaceInSection(source, '\t\tconst zh = {', '\n\t\t};', section => {
    for (const [before, after] of [
      ['"toolbar.duration": "Duration"', '"toolbar.duration": "真实时长"'],
      ['"toolbar.useActualDuration": "Use actual duration"', '"toolbar.useActualDuration": "使用真实时长"'],
      ['"toolbar.useEqualWidth": "Use equal-width operations"', '"toolbar.useEqualWidth": "使用等宽事件"'],
      ['"toolbar.turns": "Turns"', '"toolbar.turns": "轮次"'],
      ['"toolbar.expandTurns": "Expand turns"', '"toolbar.expandTurns": "展开轮次"'],
      ['"toolbar.collapseTurns": "Collapse turns"', '"toolbar.collapseTurns": "折叠轮次"'],
      ['"toolbar.calls": "Calls"', '"toolbar.calls": "调用"'],
      ['"toolbar.expandCalls": "Expand calls"', '"toolbar.expandCalls": "展开调用"'],
      ['"toolbar.collapseCalls": "Collapse calls"', '"toolbar.collapseCalls": "折叠调用"'],
      ['"toolbar.searchPlaceholder": "搜索"', '"toolbar.searchPlaceholder": "搜索",\n\t\t\t"timeline.input": "输入",\n\t\t\t"timeline.model": "模型",\n\t\t\t"timeline.tools": "工具"']
    ]) section = replaceExact(section, before, after, `Chinese copy ${before}`)
    return section
  }, 'Chinese locale')
  source = replaceInSection(source, '\t\tconst en = {', '\n\t\t};', section => replaceExact(section,
    '"toolbar.searchPlaceholder": "Search"',
    '"toolbar.searchPlaceholder": "Search",\n\t\t\t"timeline.input": "Input",\n\t\t\t"timeline.model": "Model",\n\t\t\t"timeline.tools": "Tools"',
    'English timeline copy'), 'English locale')

  source = replaceInSection(source, '\t\tfunction TrajectoryToolbar(', '\n\t\t//#endregion', section => {
    section = replaceExact(section,
      '\t\tfunction TrajectoryToolbar(',
      `\t\t${FIGMA_TRAJECTORY_MARKER}\n\t\tfunction TrajectoryToolbar(`,
      'marker')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.root,\n\t\t\t\trole: "toolbar",',
      'className: TrajectoryToolbar_module_css_default.root,\n\t\t\t\t"data-odyssey-trajectory-toolbar": true,\n\t\t\t\trole: "toolbar",',
      'toolbar root')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.inner,\n\t\t\t\t\tchildren:',
      'className: TrajectoryToolbar_module_css_default.inner,\n\t\t\t\t\t"data-odyssey-trajectory-toolbar-inner": true,\n\t\t\t\t\tchildren:',
      'toolbar inner')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.actions,\n\t\t\t\t\t\tchildren:',
      'className: TrajectoryToolbar_module_css_default.actions,\n\t\t\t\t\t\t"data-odyssey-trajectory-actions": true,\n\t\t\t\t\t\tchildren:',
      'toolbar actions')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.toggle,\n\t\t\t\t\t\t\t\t"aria-label":',
      'className: TrajectoryToolbar_module_css_default.toggle,\n\t\t\t\t\t\t\t\t"data-odyssey-trajectory-control": "duration",\n\t\t\t\t\t\t\t\t"aria-label":',
      'duration control')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.action,\n\t\t\t\t\t\t\t\t"aria-label": allTurnsCollapsed',
      'className: TrajectoryToolbar_module_css_default.action,\n\t\t\t\t\t\t\t\t"data-odyssey-trajectory-control": "turns",\n\t\t\t\t\t\t\t\t"aria-label": allTurnsCollapsed',
      'turn control')
    section = replaceExact(section,
      'children: allTurnsCollapsed ? "⊞" : "⊟"\n\t\t\t\t\t\t\t\t}), t("toolbar.turns")]',
      'children: allTurnsCollapsed ? "⊞" : "⊟"\n\t\t\t\t\t\t\t\t}), allTurnsCollapsed ? t("toolbar.expandTurns") : t("toolbar.collapseTurns")]',
      'turn control visible copy')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.action,\n\t\t\t\t\t\t\t\t"aria-label": allAssistantsCollapsed',
      'className: TrajectoryToolbar_module_css_default.action,\n\t\t\t\t\t\t\t\t"data-odyssey-trajectory-control": "calls",\n\t\t\t\t\t\t\t\t"aria-label": allAssistantsCollapsed',
      'call control')
    section = replaceExact(section,
      'children: allAssistantsCollapsed ? "⊞" : "⊟"\n\t\t\t\t\t\t\t\t}), t("toolbar.calls")]',
      'children: allAssistantsCollapsed ? "⊞" : "⊟"\n\t\t\t\t\t\t\t\t}), allAssistantsCollapsed ? t("toolbar.expandCalls") : t("toolbar.collapseCalls")]',
      'call control visible copy')
    section = replaceExact(section,
      'className: TrajectoryToolbar_module_css_default.search,\n\t\t\t\t\t\tchildren:',
      'className: TrajectoryToolbar_module_css_default.search,\n\t\t\t\t\t\t"data-odyssey-trajectory-search": true,\n\t\t\t\t\t\tchildren:',
      'toolbar search')
    return section
  }, 'toolbar')

  source = replaceInSection(source, '\t\tfunction LaneLabels()', '\n\t\t//#endregion', section => {
    section = replaceExact(section,
      'function LaneLabels() {',
      'function LaneLabels({ labels }) {',
      'timeline localized labels')
    section = replaceExact(section,
      'className: TrajectoryTimeline_module_css_default.labels,\n\t\t\t\t"aria-hidden": "true",',
      'className: TrajectoryTimeline_module_css_default.labels,\n\t\t\t\t"data-odyssey-trajectory-labels": true,\n\t\t\t\t"aria-hidden": "true",',
      'timeline labels')
    section = replaceExact(section,
      '(0, react_jsx_runtime.jsx)("span", { children: "Input" }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { children: "Model" }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { children: "Tools" })',
      '(0, react_jsx_runtime.jsx)("span", { children: labels[0] }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { children: labels[1] }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { children: labels[2] })',
      'timeline label values')
    section = replaceExact(section,
      'function TrajectoryTimeline({ turns, mode, range, hasEarlierRecords = false, onLoadEarlier, selectedIndex = null, searchMatchIndexes = null, onRangeChange, onRecordSelect, onRecordFocus }) {',
      'function TrajectoryTimeline({ turns, mode, range, hasEarlierRecords = false, onLoadEarlier, selectedIndex = null, searchMatchIndexes = null, onRangeChange, onRecordSelect, onRecordFocus, laneLabels }) {',
      'timeline label props')
    section = replaceAllExact(section,
      '(0, react_jsx_runtime.jsx)(LaneLabels, {})',
      '(0, react_jsx_runtime.jsx)(LaneLabels, { labels: laneLabels })',
      2,
      'timeline label instances')
    section = replaceAllExact(section,
      'className: TrajectoryTimeline_module_css_default.plot,\n\t\t\t\t\tchildren:',
      'className: TrajectoryTimeline_module_css_default.plot,\n\t\t\t\t\t"data-odyssey-trajectory-plot": true,\n\t\t\t\t\tchildren:',
      2,
      'timeline plots')
    section = replaceAllExact(section,
      'className: TrajectoryTimeline_module_css_default.root,\n\t\t\t\t"aria-label": "Trajectory timeline",',
      'className: TrajectoryTimeline_module_css_default.root,\n\t\t\t\t"data-odyssey-trajectory-timeline": true,\n\t\t\t\t"aria-label": "Trajectory timeline",',
      2,
      'timeline roots')
    return section
  }, 'timeline')

  source = replaceInSection(source, '\t\tfunction TrajectoryTable(', '\n\t\t//#endregion', section => {
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.split,\n\t\t\t\tstyle: splitStyle,',
      'className: TrajectoryTable_module_css_default.split,\n\t\t\t\t"data-odyssey-trajectory-table-split": true,\n\t\t\t\tstyle: splitStyle,',
      'table split')
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.tablePane,\n\t\t\t\t\t"data-trajectory-scroll": "",',
      'className: TrajectoryTable_module_css_default.tablePane,\n\t\t\t\t\t"data-odyssey-trajectory-table-scroll": true,\n\t\t\t\t\t"data-trajectory-scroll": "",',
      'table scroll')
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.table,\n\t\t\t\t\t\t"data-scroll-ready":',
      'className: TrajectoryTable_module_css_default.table,\n\t\t\t\t\t\t"data-odyssey-trajectory-table": true,\n\t\t\t\t\t\t"data-scroll-ready":',
      'event table')
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.event,\n\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'className: TrajectoryTable_module_css_default.event,\n\t\t\t\t\t\t\t\t\t\t\t"data-odyssey-trajectory-event": true,\n\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'event cell')
    section = replaceExact(section,
      'className: sectionActive ? `${TrajectoryTable_module_css_default.turnLabel} ${TrajectoryTable_module_css_default.turnLabelActive}` : TrajectoryTable_module_css_default.turnLabel,\n\t\t\t\t\t\t\t\t\t\t\t\t\t"aria-label":',
      'className: sectionActive ? `${TrajectoryTable_module_css_default.turnLabel} ${TrajectoryTable_module_css_default.turnLabelActive}` : TrajectoryTable_module_css_default.turnLabel,\n\t\t\t\t\t\t\t\t\t\t\t\t\t"data-odyssey-trajectory-turn": true,\n\t\t\t\t\t\t\t\t\t\t\t\t\t"aria-label":',
      'turn label')
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.kindSlot,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'className: TrajectoryTable_module_css_default.kindSlot,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t"data-odyssey-trajectory-kind-slot": true,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'kind slot')
    section = replaceExact(section,
      'className: TrajectoryTable_module_css_default.content,\n\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'className: TrajectoryTable_module_css_default.content,\n\t\t\t\t\t\t\t\t\t\t\t"data-odyssey-trajectory-content": true,\n\t\t\t\t\t\t\t\t\t\t\tchildren:',
      'content cell')
    return section
  }, 'table')

  source = replaceInSection(source, '\t\tfunction TrajectoryView(', '\n\t\t//#endregion', section => {
    section = replaceExact(section,
      'className: views_module_css_default.root,\n\t\t\t\t"data-conversation-composer-overlay": "",',
      'className: views_module_css_default.root,\n\t\t\t\t"data-odyssey-trajectory": true,\n\t\t\t\t"data-conversation-composer-overlay": "",',
      'view root')
    section = replaceExact(section,
      'className: views_module_css_default.ledger,\n\t\t\t\t\t\tchildren:',
      'className: views_module_css_default.ledger,\n\t\t\t\t\t\t"data-odyssey-trajectory-ledger": true,\n\t\t\t\t\t\tchildren:',
      'ledger')
    section = replaceExact(section,
      'onRecordFocus: handleTimelineRecordFocus\n\t\t\t\t\t}),',
      'onRecordFocus: handleTimelineRecordFocus,\n\t\t\t\t\t\tlaneLabels: [t("timeline.input"), t("timeline.model"), t("timeline.tools")]\n\t\t\t\t\t}),',
      'timeline translated labels')
    return section
  }, 'view')

  return source.replace('"toolbar.searchPlaceholder": "搜索"', '"toolbar.searchPlaceholder": "搜索轨迹"')
}
