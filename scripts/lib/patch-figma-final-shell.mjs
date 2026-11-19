import { patchFigmaSessionTitle } from './figma-session-title.mjs'
import { userMessageThemeCss } from './user-message-theme.mjs'
import {createRequire} from 'node:module'
const readingCss = await readFile(new URL('../../src/preload/figma-reading.css', import.meta.url), 'utf8')
import { readFile } from 'node:fs/promises'
const css = await readFile(new URL('../../src/preload/figma-final-shell.css', import.meta.url), 'utf8')
const homeCss = await readFile(new URL('../../src/preload/figma-home.css', import.meta.url), 'utf8')
const panelCss = await readFile(new URL('../../src/preload/figma-panels.css', import.meta.url), 'utf8')
const filePanelCss = await readFile(new URL('../../src/preload/figma-file-panel.css', import.meta.url), 'utf8')
const trajectoryCss = await readFile(new URL('../../src/preload/figma-trajectory.css', import.meta.url), 'utf8')
const inlineCss = await readFile(new URL('../../src/preload/figma-inline-references.css', import.meta.url), 'utf8')
const motionCss = await readFile(new URL('../../src/preload/figma-motion.css', import.meta.url), 'utf8')
const refinementCss = await readFile(new URL('../../src/preload/figma-refinements.css', import.meta.url), 'utf8')
const clientTypography = await readFile(new URL('../../src/preload/client-typography.css', import.meta.url), 'utf8')
const require=createRequire(import.meta.url)
const userThemeCss=userMessageThemeCss(await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/design-platform.css'),'utf8'),await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/shiki.css'),'utf8'),css)
const START = '/* ODYSSEY_FIGMA_FINAL_SHELL_START */'
const END = '/* ODYSSEY_FIGMA_FINAL_SHELL_END */'
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma final shell anchor drifted: ' + from.slice(0, 90))
  return source.replace(from, to)
}

function ComposerWorkLocation() {
  const [open, setOpen] = react.useState(false);
  const anchor = react.useRef(null);
  const selected = react.useRef(null);
  const keyboard = react.useRef(false);
  const english = document.documentElement.dataset.odysseyLocale === 'en';
  const local = english ? 'This computer' : '此计算机';
  const cloud = english ? 'Cloud business system' : '云端业务系统';
  const icon = path => react_jsx_runtime.jsx('svg', {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    children: react_jsx_runtime.jsx('path', {
      d: path, stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
  });
  const computer = icon('M2.5 10V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6m-11 0h11l1.2 2.1a.6.6 0 0 1-.5.9H1.8a.6.6 0 0 1-.5-.9L2.5 10Z');
  const cloudIcon = icon('M4.3 12.5h7a2.7 2.7 0 0 0 .4-5.4 3.8 3.8 0 0 0-7.3-1.2 3.3 3.3 0 0 0-.1 6.6Z');
  react.useLayoutEffect(() => {
    if (!open || !keyboard.current) return;
    const frame = requestAnimationFrame(() => selected.current?.closest('button')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const close = () => {
    if (selected.current?.closest('button')?.contains(document.activeElement)) anchor.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  return react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.Menu, {
    className: 'odyssey-work-location', open, portal: true, side: 'top',
    anchor: react_jsx_runtime.jsxs('button', {
      ref: anchor, type: 'button', 'data-odyssey-work-location': '', 'aria-haspopup': 'menu', 'aria-expanded': open,
      onClick: event => { keyboard.current = event.detail === 0; setOpen(!open); },
      onKeyDown: event => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault();
        keyboard.current = true;
        setOpen(true);
      },
      children: [computer, react_jsx_runtime.jsx('span', { children: local })],
    }),
    items: [
      { id: 'local', icon: computer, label: react_jsx_runtime.jsx('span', {
        ref: selected, 'data-odyssey-work-location-option': 'local', children: local,
      }) },
      { id: 'cloud', icon: cloudIcon, disabled: true, label: react_jsx_runtime.jsx('span', {
        'data-odyssey-work-location-option': 'cloud', children: cloud,
      }) },
    ],
    selectedId: 'local', onSelect: close, onClose: close,
  });
}

const composerWorkspaceMarker = '"data-odyssey-composer-project": ""';
function composerWorkspaceEdits() {
  const workspaceRow = '\n\t\t\t\t\t(hero || researchEmpty) && heroWorkspaceRow,';
  const composerDock = '\n\t\t\t\t\tzone !== void 0 && renderSlot("conversation.input.dock", zone),';
  const endOfComposer = '\n\t\t\t\t\tinputBar\n\t\t\t\t]\n\t\t\t});\n\t\t\tconst composer = renderSlotChain("conversation.composer", {';
  const rowClass = '\n\t\t\t\tclassName: ConversationRoot_module_css_default.heroWorkspaceRow,';
  const restrictedRow = '\n\t\t\tconst heroWorkspaceRow = (research && (!browserAppActive || directoryLocked)) || (sherlockShared(sessionId) && ((sherlockBoardsAdapter?.getView(sessionId)?.history?.length ?? 0)+(sherlockBoardsAdapter?.getView(sessionId)?.messages?.length ?? 0))>0) ? null :';
  const emptyConversationRow = '\n\t\t\tconst heroWorkspaceRow = subagentPanel || !(pendingConversation || conversationVacant) ? null :';
  const workspaceChip = '\n\t\t\t\t\t(0, react_jsx_runtime.jsx)(WorkspaceChip, {';
  const chipDefinition = '\n\t\tfunction WorkspaceChip(';
  const oldDirectoryLock = `\n      const directoryLocked = (researchWorkspaceSnapshot2.files?.length ?? 0) > 0 || (sessionId !== void 0 && window.localStorage.getItem(directoryLockKey) === 'true');`;
  const projectDirectoryLock = `\n      const projectWasEdited = react.useSyncExternalStore(react.useCallback(notify => {
        const edited = event => { if (event.detail?.sessionId === sessionId) notify(); };
        document.addEventListener('sherlock:workspace-project-edited', edited);
        return () => document.removeEventListener('sherlock:workspace-project-edited', edited);
      }, [sessionId]), () => sessionId !== void 0 && window.localStorage.getItem(directoryLockKey) === 'true');
      const imageDraftHasCanvas = react.useSyncExternalStore(
        imageFactoryActive && eworkImageFactory?.subscribe || (() => () => {}),
        () => imageFactoryActive && sessionId === void 0 && eworkImageFactory?.getSnapshot().current === true
      );
      const researchHasEdits = (researchWorkspaceSnapshot2.files?.length ?? 0) > 0 ||
        research && researchWorkspaceSnapshot2.artifacts?.some(artifact => artifact && artifact.containerSpec?.type !== 'board-tabs');
      const directoryLocked = projectWasEdited || imageDraftHasCanvas || !!researchHasEdits;`;
  const projectPickerOpen = '\n\t\t\t\t\t\topen: pickerOpen,\n\t\t\t\t\t\tanchorRef: pickerAnchor,';
  const chipDisabled = "\n\t\t\t\tref: buttonRef, disabled, 'data-odyssey-directory-locked': disabled || undefined,";
  return [
    [workspaceRow + composerDock, composerDock],
    [endOfComposer, endOfComposer.replace('inputBar',
      `heroWorkspaceRow ? react_jsx_runtime.jsxs("div", { ${composerWorkspaceMarker}, children: [heroWorkspaceRow, inputBar] }) : inputBar`)],
    [restrictedRow, emptyConversationRow],
    [oldDirectoryLock, projectDirectoryLock],
    ["\n        if (directoryLocked && sessionId !== void 0) { window.localStorage.setItem(directoryLockKey, 'true'); setPickerOpen(false); }",
      "\n        if (directoryLocked) { if (sessionId !== void 0) window.localStorage.setItem(directoryLockKey, 'true'); setPickerOpen(false); }"],
    [projectPickerOpen, projectPickerOpen.replace('open: pickerOpen', 'open: pickerOpen && !directoryLocked')],
    [chipDisabled, chipDisabled + "\n\t\t\t\ttitle: disabled ? (document.documentElement.dataset.odysseyLocale === 'en' ? 'Project locked after editing' : '工作区已有编辑，项目已锁定') : label,"],
    [rowClass, rowClass + '\n\t\t\t\t"data-odyssey-composer-workspace": "",'],
    [workspaceChip, '\n\t\t\t\t\treact_jsx_runtime.jsx(ComposerWorkLocation, {}),' + workspaceChip],
    [chipDefinition, '\n\t\t' + ComposerWorkLocation.toString() + chipDefinition],
  ];
}

function ComposerProjectPicker({ onClear, ...props }) {
  const h = react_jsx_runtime.jsx
  const label = document.documentElement.dataset.odysseyLocale === 'en' ? 'Work without a project' : '不在项目中工作'
  return react_jsx_runtime.jsxs('span', { className: 'odyssey-project-picker', children: [
    h(WorkspaceChip, props),
    onClear && h(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
      label: h('span', { 'data-odyssey-project-clear-hint': '', children: label }),
      side: 'top', children:
      h('button', { type: 'button', className: 'odyssey-project-clear', 'aria-label': label, onClick: onClear, children:
        h(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 10 }) })
    }),
  ] })
}

const projectlessPickerMarker = '/* odyssey:composer-projectless-picker:v1 */'
function projectlessWorkspaceEdits() {
  const chipDefinition = '\n\t\tfunction WorkspaceChip('
  const picker = '\n\t\t\tconst heroWorkspaceRow = subagentPanel || !(pendingConversation || conversationVacant) ? null :'
  const chip = '(0, react_jsx_runtime.jsx)(WorkspaceChip, {\n\t\t\t\t\t\tbuttonRef: pickerAnchor, disabled: directoryLocked,'
  const props = '\n\t\t\t\t\t\tboardDirectoryPath: boardDirectory?.path,'
  const ref = 'ref: buttonRef, disabled, \'data-odyssey-directory-locked\': disabled || undefined,'
  const onPick = '\n\t\t\t\t\t\tonPick: (workspaceId) => {'
  return [
    [chipDefinition, '\n\t\t' + projectlessPickerMarker + '\n' + ComposerProjectPicker.toString() + chipDefinition],
    [picker, `
      const allowStandalone = !directoryLocked && !boardDirectory && !sherlockShared(sessionId) &&
        (pendingConversation || sessionId !== undefined);
      const clearProject = () => {
        setPickerOpen(false);
        setPendingWorkspaceId(undefined);
        pickerAnchor.current?.focus({ preventScroll: true });
        if (pendingConversation ? pendingChatState?.workspaceId === null : !sessionWorkspace) return;
        selectWorkspace(null).catch(error => sherlockBoardsAdapter?.showError(error));
      };` + picker],
    [chip, chip.replace('WorkspaceChip', 'ComposerProjectPicker') +
      '\n\t\t\t\t\t\tonClear: allowStandalone && (pendingWorkspace || sessionWorkspace) ? clearProject : undefined,'],
    [props, props + '\n\t\t\t\t\t\tallowStandalone,'],
    [ref, ref + " 'data-odyssey-project-selected': label !== undefined || undefined,"],
    [onPick, onPick + '\n\t\t\t\t\t\t\tif (workspaceId === null) { if (allowStandalone) clearProject(); return; }'],
  ]
}

const outlineFolderMarker = '/* odyssey:composer-outline-folder:v1 */'
function outlineFolderEdits() {
  const nativeIcons = `label === void 0 ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {
						className: HeroShell_module_css_default.folder,
						size: 16
					}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {
						className: HeroShell_module_css_default.folder,
						size: 16
					})`
  const folderGlyph = `${outlineFolderMarker} react_jsx_runtime.jsx('svg', {
    className: HeroShell_module_css_default.folder, width: 16, height: 16, viewBox: '0 0 16 16',
    fill: 'none', 'aria-hidden': true, children: react_jsx_runtime.jsx('path', {
      d: 'M1.75 11.75V4.5A1.25 1.25 0 0 1 3 3.25h3l1.5 1.5H13A1.25 1.25 0 0 1 14.25 6v5.75A1.25 1.25 0 0 1 13 13H3a1.25 1.25 0 0 1-1.25-1.25Z',
      stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
  })`
  return [nativeIcons, folderGlyph]
}

export function patchComposerWorkspaceBar(source) {
  if (source.includes(outlineFolderMarker)) return source;
  const edits = source.includes(composerWorkspaceMarker) ? [] : composerWorkspaceEdits();
  const projectless = source.includes(projectlessPickerMarker) ? [] : projectlessWorkspaceEdits();
  for (const [before, after] of [...edits, ...projectless, outlineFolderEdits()]) {
    if (source.split(before).length !== 2) throw Error('Composer project bar anchor drifted: ' + before.trim().slice(0, 85));
    source = source.replace(before, () => after);
  }
  return source;
}

export function stripComposerWorkspaceBar(source) {
  if (!source.includes(composerWorkspaceMarker)) return source;
  const projectless = source.includes(projectlessPickerMarker);
  if (projectless) {
    const start = source.indexOf('\n\t\t' + projectlessPickerMarker);
    const end = source.indexOf('\n\t\tfunction WorkspaceChip(', start);
    if (start < 0 || end < 0 || source.indexOf(projectlessPickerMarker, end) !== -1)
      throw Error('Composer project picker restore markers drifted');
    source = source.slice(0, start) + source.slice(end);
  }
  const edits = projectless ? [...composerWorkspaceEdits(), ...projectlessWorkspaceEdits().slice(1)] : composerWorkspaceEdits();
  if (source.includes(outlineFolderMarker)) edits.push(outlineFolderEdits());
  for (const [before, after] of edits.reverse()) {
    if (source.split(after).length !== 2) throw Error('Composer project bar restore anchor drifted: ' + after.trim().slice(0, 85));
    source = source.replace(after, () => before);
  }
  return source;
}

export function patchFigmaFinalConversation(source) {
  // Own the controller in the same fiber as its slots. Slot subscribers can
  // render during registration on HMR, before Cordis publishes that fiber's
  // services; use this generation's initialized instance in those factories.
  const ready = 'const conversationController = new ConversationController(ctx, { input: inputHub, blocks: composerBlocks });'
  if (!source.includes(ready)) {
    source = exact(source, '\t\t\tctx.plugin(ConversationController, {\n\t\t\t\tinput: inputHub,\n\t\t\t\tblocks: composerBlocks\n\t\t\t});', '\t\t\t/* Controller lifetime is owned by the conversation apply fiber. */')
    source = exact(source, 'const composerBlocks = new ComposerBlockRegistry();', 'const composerBlocks = new ComposerBlockRegistry();\n\t\t\t' + ready)
    const lookup = 'const conversation = concreteConversation(ctx);'
    if (source.split(lookup).length !== 4) throw Error('Conversation service lookup anchors drifted')
    source = source.replaceAll(lookup, 'const conversation = conversationController;')
  }
  // The visible Chinese headline is outlined artwork in the final Figma frame;
  // retain the localized accessible sentence and use text for other locales.
  source = exact(source, 'className: HeroShell_module_css_default.headlineText,\n\t\t\t\t\t\t\t\tchildren: t("hero.headline")', 'className: HeroShell_module_css_default.headlineText,\n\t\t\t\t\t\t\t\t"data-odyssey-home-title-art": t("hero.headline") === "探索更远，洞见更深。" ? "" : void 0,\n\t\t\t\t\t\t\t\t"aria-label": t("hero.headline"),\n\t\t\t\t\t\t\t\tchildren: t("hero.headline")')
  // The resident root knows the active view; DOM existence cannot distinguish an
  // empty chat from Research, whose conversation/composer live in body portals.
  source = exact(source, '"data-phase": phase,\n\t\t\t\tonClickCapture:', '"data-phase": phase,\n\t\t\t\t"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",\n\t\t\t\tonClickCapture:')
  source = exact(source, 'this.researchWidths.get(sessionId) ?? 420', 'this.researchWidths.get(sessionId) ?? 340')
  source = exact(source, 'function ComposerSurface({ zone, hero, researchEmpty,', 'function ComposerSurface({ zone, hero, research = false, researchEmpty,')
  source = exact(source, '(hero || research || researchEmpty) && heroWorkspaceRow', '(hero || researchEmpty) && heroWorkspaceRow')
  source = exact(source, 'const composerSurface = (0, react_jsx_runtime.jsx)(ComposerSurface, {\n\t\t\t\tzone,', 'const composerSurface = (0, react_jsx_runtime.jsx)(ComposerSurface, {\n\t\t\t\tresearch,\n\t\t\t\tzone,')
  // 370:607 / 620: final Research copy has no terminal punctuation.
  source = source.replace('"data-research-empty-state": "",\n\t\t\t\tchildren: "探索更远，洞见更深。"', '"data-research-empty-state": "",\n\t\t\t\tchildren: "探索更远，洞见更深"')
  source = exact(source, '"data-research-empty-state": "",\n\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(HeroShell, { t })', '"data-research-empty-state": "",\n\t\t\t\tchildren: "探索更远，洞见更深"')
  // Figma 44: 361:5828 / 361:6121. Display-only fallback; never rename a session.
  source = exact(source, 'const ancestry = useSessions((s) => deriveAncestry(s, sessionId), equalBreadcrumbs);', 'const ancestry = useSessions((s) => deriveAncestry(s, sessionId), equalBreadcrumbs);\n\t\t\tconst explicitSessionTitle = useSessions((s) => s.byId[sessionId]?.title);')
  if (!source.includes('const blankResearchTitle =')) source = exact(source, 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && researchNavigation.current !== sessionId;', 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && researchNavigation.current !== sessionId;\n\t\t\tconst blankResearchTitle = active?.id === "research" && blank === true && composerPhase === "blank" && !explicitSessionTitle?.trim();')
  source = exact(source, 'const explicitResearchViewSessions = new Set();', 'const explicitResearchViewSessions = new Set();\n\t\tconst explicitHomeViewSessions = new Set();')
  source = exact(source, 'const selectView = (0, react.useCallback)((viewId) => {\n\t\t\t\texplicitResearchViewSessions.add(sessionId);', 'const selectView = (0, react.useCallback)((viewId) => {\n\t\t\t\texplicitHomeViewSessions.delete(sessionId);\n\t\t\t\texplicitResearchViewSessions.add(sessionId);')
  source = exact(source, 'const activateChat = (event) => {\n\t\t\t\t\tif (event.detail?.sessionId !== sessionId) return;', 'const activateChat = (event) => {\n\t\t\t\t\tif (event.detail?.sessionId !== sessionId) return;\n\t\t\t\t\texplicitHomeViewSessions.add(sessionId);')
  const finalHideChrome = 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && (researchNavigation.current !== sessionId || explicitHomeViewSessions.has(sessionId));'
  const residentHeader = 'const hideChrome = false; /* odyssey:resident-home-header:20260912 */\n\t\t\tconst homeHeader = blank && composerPhase === "blank" && active?.id === "chat";'
  if (!source.includes(residentHeader) && !source.includes('ework:notes-header-presentation:v1')) {
    source = exact(source, source.includes('const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";') ? 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";' : 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && researchNavigation.current !== sessionId;', finalHideChrome)
    source = exact(source, finalHideChrome, residentHeader)
  }
  source = exact(source, '"data-srb-session-header":"",', '"data-srb-session-header":"", "data-odyssey-home-header":homeHeader,')
  if (!source.includes('odyssey:localized-empty-header:v1')) {
  if (!source.includes('chat: "新会话", research: "新研究", trajectory: "新轨迹"')) source = exact(source, 'children: summary.displayTitle', 'children: last && blankResearchTitle ? "新研究" : summary.displayTitle')
  source = exact(source, 'const blankResearchTitle = active?.id === "research" && blank === true && composerPhase === "blank" && !explicitSessionTitle?.trim();', 'const blankResearchTitle = blank === true && composerPhase === "blank" && !explicitSessionTitle?.trim();')
  source = exact(source, 'children: last && blankResearchTitle ? "新研究" : summary.displayTitle', 'children: last && blankResearchTitle ? ({ chat: "新会话", research: "新研究", trajectory: "新轨迹" }[active?.id] ?? summary.displayTitle) : summary.displayTitle')
  }
  // Keep workspace and permission-block placeholders ahead of the empty Research hint.
  source = exact(source, '} : hero ? { placeholder: t("placeholder.hero") } : {},', '} : hero ? { placeholder: t("placeholder.hero") } : researchEmpty ? { placeholder: "描述你想研究的问题…" } : {},')
  // User correction / 164:805,940: retain the live canvas scope control in
  // the composer. Explicit references still flow as inline chips.
  source = exact(source, 'null /* Figma final: manual references remain native inline chips. */,', 'researchCanvasWorkspace !== void 0 && (0, react_jsx_runtime.jsx)(ResearchCanvasContextBadge, { workspace: researchCanvasWorkspace, input, keyboard, t, disabled }, sessionId),')
  source = exact(source,
    'if (sources.length === 0 || snapshot.selection.selectedNodeIds.length > 0 || (input?.occurrences?.length ?? 0) > 0) return null;',
    'if (snapshot.selection.selectedNodeIds.length > 0 || (input?.occurrences?.length ?? 0) > 0) return null;')
  source = exact(source, 't("research.context.badge", { total: sources.length })',
    'sources.length === 0 ? t("research.context.emptyBadge") : t("research.context.badge", { total: sources.length })')
  for (const [label, empty] of [["参考当前画板资料 · {total}个组件", "参考当前画板资料"], ["Use current canvas · {total} components", "Use current canvas"]]) {
    const line = `"research.context.badge": ${JSON.stringify(label)},`
    source = exact(source, line, line + `\n\t\t\t"research.context.emptyBadge": ${JSON.stringify(empty)},`)
  }
  source = exact(source, '|| research.canvasContext !== void 0 || rest.length > 0;', '|| rest.length > 0; /* Automatic context alone is not visible message content. */')
  source = exact(source, [
    'projectResearchUserText(research, openFile), research.canvasContext !== void 0 && (0, react_jsx_runtime.jsx)("div", {',
    '\t\t\t\t\t\t\t"data-research-context-provenance": "",',
    '\t\t\t\t\t\t\tstyle: { marginTop: research.text === "" ? 0 : 6, fontSize: 11, lineHeight: "16px", color: "var(--dsw-alias-label-tertiary)" },',
    '\t\t\t\t\t\t\ttitle: `${t("research.context.initialSources")}: ${research.canvasContext.initialSourceIds.join(", ") || t("research.context.noInitialSources")}`,',
    '\t\t\t\t\t\t\tchildren: t("research.context.sent", { total: research.canvasContext.totalSources, initial: research.canvasContext.initialSourceIds.length })',
    '\t\t\t\t\t\t}), rest.map'
  ].join('\n'), 'projectResearchUserText(research, openFile), rest.map')
  // The canvas task patch now permits editing the visible text while preserving context.
  if (!source.includes('canvasQueuedContext: research')) source = exact(source,
    'return research.canvasContext === void 0 ? row : { ...row, text: null, preview: research.text || t("research.context.sent", { initial: research.canvasContext.initialSourceIds.length, total: research.canvasContext.totalSources }), frozenCanvasContext: true };',
    'return research.canvasContext === void 0 ? row : { ...row, text: null, preview: research.text || (Array.isArray(row.content) && contentParts(row.content).images.length > 0 ? t("image.pending") + " · " + contentParts(row.content).images.length : ""), frozenCanvasContext: true };')
  source = patchFigmaSessionTitle(source)
  const block = `${START}\nif(typeof document!=="undefined"&&!document.getElementById?.("sherlock-desktop-shell-style")){let style=document.getElementById?.("odyssey-figma-final-shell");if(!style){style=document.createElement("style");style.id="odyssey-figma-final-shell";document.documentElement.appendChild(style);}style.textContent=${JSON.stringify(css + homeCss + panelCss + filePanelCss + trajectoryCss + inlineCss + motionCss + refinementCss + readingCss + userThemeCss + clientTypography)};}\n${END}`
  const starts=source.split(START).length-1, ends=source.split(END).length-1
  if(starts!==ends || starts>1 || (starts===1 && source.indexOf(END)<source.indexOf(START))) throw Error('Figma final shell marker is incomplete or duplicated')
  if(starts===1) return source.slice(0,source.indexOf(START))+block+source.slice(source.indexOf(END)+END.length)
  return source+'\n'+block
}

export function patchFigmaFinalLayout(source) {
  // Reserve canvas space on smaller windows, using the native layout store so
  // the sidebar width, resize handles and user toggle all stay in sync.
  if (!source.includes('/* ODYSSEY_RESEARCH_SIDEBAR_POLICY */')) {
    source = exact(source, 'const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;',
      `/* ODYSSEY_RESEARCH_SIDEBAR_POLICY */
      const RESEARCH_SIDEBAR_AUTO_COLLAPSE = 1280;
      const [researchPage, setResearchPage] = (0, react.useState)(false);
      (0, react.useLayoutEffect)(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const sync = () => setResearchPage(Array.from(frame.querySelectorAll('[data-odyssey-page="research"]')).some(page => !page.closest('[data-odyssey-subagent-panel]')));
        const observer = new window.MutationObserver(sync);
        observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-odyssey-page"] });
        sync();
        return () => observer.disconnect();
      }, []);
      (0, react.useLayoutEffect)(() => {
        if (researchPage && viewport < RESEARCH_SIDEBAR_AUTO_COLLAPSE) actions.collapseSidebarForResearch();
      }, [researchPage, viewport, actions]);
      const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;`)
    source = exact(source, 'narrowExpanded: false\n', 'narrowExpanded: false,\n                    sidebarManuallyExpanded: false\n')
    source = exact(source,
      'if (d.narrow) d.narrowExpanded = !d.narrowExpanded;\n\t\t\t\t\t\telse d.sidebar = d.sidebar === 0 ? 280 : 0;',
      `if (d.narrow) {
                          d.narrowExpanded = !d.narrowExpanded;
                          d.sidebarManuallyExpanded = d.narrowExpanded;
                          if (d.narrowExpanded && d.sidebar === 0) d.sidebar = 280;
                        } else {
                          d.sidebar = d.sidebar === 0 ? 280 : 0;
                          d.sidebarManuallyExpanded = d.sidebar !== 0;
                        }`)
    source = exact(source, 'd.narrowExpanded = false;', 'd.narrowExpanded = d.sidebarManuallyExpanded;')
    source = exact(source, 'setNarrow: (d, narrow) => {',
      `collapseSidebarForResearch: (d) => {
                        if (d.sidebarManuallyExpanded) return;
                        d.sidebar = 0;
                        d.narrowExpanded = false;
                    },
                    setNarrow: (d, narrow) => {`)
  }
  // At the desktop minimum, reopening the auto-collapsed rail is an overlay.
  // Keep the grid track and mounted canvas stable; only the sidebar paints wider.
  if (!source.includes('/* ODYSSEY_LEFT_SIDEBAR_OVERLAY */')) {
    source = exact(source,
      'const cols = computeColumns(viewport, sidebarCollapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, detailsSession === void 0 ? 0 : panels.details);',
      `const sidebarOverlay = viewport <= 840 && !sidebarCollapsed; /* ODYSSEY_LEFT_SIDEBAR_OVERLAY */
      const sidebarWidth = sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : clampWidth(panels.sidebar || 280, 240, 420);
      const cols = computeColumns(viewport, sidebarOverlay || sidebarCollapsed ? 0 : sidebarWidth, detailsSession === void 0 ? 0 : panels.details);
      const restoreSidebarFocus = (0, react.useRef)(false);
      (0, react.useLayoutEffect)(() => {
        if (!sidebarOverlay && restoreSidebarFocus.current) {
          restoreSidebarFocus.current = false;
          frameRef.current?.querySelector(".hHd-Xa_toggle")?.focus();
        }
      }, [sidebarOverlay]);
      (0, react.useEffect)(() => {
        if (!sidebarOverlay) return;
        const escape = event => {
          if (event.key !== "Escape" || event.defaultPrevented || event.target?.closest?.('[role="menu"],[role="dialog"]')) return;
          event.preventDefault();
          restoreSidebarFocus.current = true;
          actions.toggleSidebar();
        };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
      }, [sidebarOverlay, actions]);`)
    source = exact(source, '"data-sidebar-collapsed": sidebarCollapsed || void 0,',
      `"data-sidebar-collapsed": sidebarCollapsed || void 0,
        "data-odyssey-sidebar-overlay": sidebarOverlay || void 0,
        onPointerDownCapture: event => {
          if (sidebarOverlay && !event.target?.closest?.('.pI_x6G_sidebarCol,[data-shell-overlay],[role="menu"],[role="dialog"]')) actions.toggleSidebar();
        },`)
    source = exact(source, 'className: AppFrame_module_css_default.sidebarCol,',
      'className: AppFrame_module_css_default.sidebarCol,\n            style: sidebarOverlay ? { width: sidebarWidth, position: "relative", zIndex: 19 } : void 0,')
    source = exact(source, '\t\t\t\t\t\t\twidth: cols.sidebar', '\t\t\t\t\t\t\twidth: sidebarWidth')
    source = exact(source, '!sidebarCollapsed && (0, react_jsx_runtime.jsx)(DragHandle,', '!sidebarCollapsed && !sidebarOverlay && (0, react_jsx_runtime.jsx)(DragHandle,')
  }
  // A manually expanded narrow sidebar must leave its actual visible width
  // beside the resident header/canvas. Notes and the research toolbar are body
  // portals: they follow the center pane's measured bounds, not its grid track.
  // Retain the native overlay lifetime, focus and Escape handling while making
  // every workspace surface use the same unobscured rectangle.
  source = exact(source,
    'style: { gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` },',
    'style: { gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`, "--odyssey-left-overlay-inset": `${sidebarOverlay ? Math.max(0, sidebarWidth - cols.sidebar) : 0}px` }, /* ODYSSEY_LEFT_SIDEBAR_VISIBLE_PANE */')
  // Menu and Modal close on document keydown without preventing default, and
  // focus may still be on their trigger. Remember the layer before it unmounts.
  if (!source.includes('/* ODYSSEY_SIDEBAR_ESCAPE_LAYER */')) source = exact(source,
    `const escape = event => {
          if (event.key !== "Escape" || event.defaultPrevented || event.target?.closest?.('[role="menu"],[role="dialog"]')) return;
          event.preventDefault();
          restoreSidebarFocus.current = true;
          actions.toggleSidebar();
        };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);`,
    `const layerEscapes = new WeakSet(); /* ODYSSEY_SIDEBAR_ESCAPE_LAYER */
        const captureEscape = event => {
          if (event.key !== "Escape") return;
          const layers = window.document.querySelectorAll('[role="menu"],[role="dialog"]');
          if (Array.from(layers).some(layer => !layer.closest('[hidden],[aria-hidden="true"]') && window.getComputedStyle(layer).display !== "none")) layerEscapes.add(event);
        };
        const escape = event => {
          if (event.key !== "Escape" || layerEscapes.has(event) || event.defaultPrevented || event.target?.closest?.('[role="menu"],[role="dialog"]')) return;
          event.preventDefault();
          restoreSidebarFocus.current = true;
          actions.toggleSidebar();
        };
        window.addEventListener("keydown", captureEscape, true);
        window.addEventListener("keydown", escape);
        return () => {
          window.removeEventListener("keydown", captureEscape, true);
          window.removeEventListener("keydown", escape);
        };`)
  // A coalesced/quick drag may deliver the final position only on pointerup.
  // Commit that coordinate before releasing capture and flushing the rAF.
  if (!source.includes('/* ODYSSEY_RESIZE_POINTER_LIFETIME */')) source = exact(source,
    '\t\t\t\te.currentTarget.releasePointerCapture(e.pointerId);',
    '\t\t\t\tlatest.current = e.clientX;\n\t\t\t\te.currentTarget.releasePointerCapture(e.pointerId);')
  // Native capture can be lost before pointerup. Track the gesture identity and
  // finish through window events instead of leaving the handle stuck in drag.
  if (!source.includes('/* ODYSSEY_RESIZE_POINTER_LIFETIME */')) {
    const start = source.indexOf('function DragHandle(props) {')
    const end = source.indexOf('\n\t\t/** The three-column frame', start)
    if (start < 0 || end < 0) throw Error('Layout DragHandle lifetime anchor drifted')
    let handle = source.slice(start, end)
    handle = exact(handle, 'const frame = (0, react.useRef)(null);', 'const frame = (0, react.useRef)(null);\n\t\t\tconst activePointer = (0, react.useRef)(null); /* ODYSSEY_RESIZE_POINTER_LIFETIME */')
    handle = exact(handle, 'e.preventDefault();\n\t\t\t\te.currentTarget.setPointerCapture(e.pointerId);', 'if (e.button !== 0) return;\n\t\t\t\te.preventDefault();\n\t\t\t\tactivePointer.current = { id: e.pointerId, target: e.currentTarget };\n\t\t\t\te.currentTarget.setPointerCapture(e.pointerId);')
    handle = handle.replaceAll('if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;', 'if (activePointer.current === null || activePointer.current.id !== e.pointerId) return;')
    handle = exact(handle, 'e.currentTarget.releasePointerCapture(e.pointerId);', 'const target = activePointer.current.target;\n\t\t\t\tactivePointer.current = null;\n\t\t\t\tif (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);')
    const lifetime = `
      const onPointerCancel = (0, react.useCallback)((e) => {
        if (activePointer.current === null || activePointer.current.id !== e.pointerId) return;
        activePointer.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        setDragging(false);
        callbacks.current.onEnd();
      }, []);
      (0, react.useEffect)(() => {
        if (!dragging) return;
        const win = activePointer.current?.target.ownerDocument.defaultView;
        if (!win) return;
        const blur = () => onPointerCancel({ pointerId: activePointer.current?.id });
        win.addEventListener("pointermove", onPointerMove);
        win.addEventListener("pointerup", onPointerUp);
        win.addEventListener("pointercancel", onPointerCancel);
        win.addEventListener("blur", blur);
        return () => {
          win.removeEventListener("pointermove", onPointerMove);
          win.removeEventListener("pointerup", onPointerUp);
          win.removeEventListener("pointercancel", onPointerCancel);
          win.removeEventListener("blur", blur);
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          frame.current = null;
        };
      }, [dragging, onPointerMove, onPointerUp, onPointerCancel]);
`
    handle = exact(handle, '\t\t\treturn (0, react_jsx_runtime.jsx)("div", {', lifetime + '\t\t\treturn (0, react_jsx_runtime.jsx)("div", {')
    handle = exact(handle, '\t\t\t\tonPointerUp\n', '\t\t\t\tonPointerUp, onPointerCancel\n')
    source = source.slice(0, start) + handle + source.slice(end)
  }
  // Notes and the overlay scrollbars are body portals. The blurred frame is a
  // stacking context, so increasing its handle's z-index cannot reach them.
  // Portal only the left handle; native pointer capture and layout actions
  // continue to own the gesture. Frame bounds keep its viewport coordinates
  // correct for resized/offset windows without involving screen coordinates.
  if (!source.includes('/* ODYSSEY_LEFT_RESIZE_PORTAL */')) {
    source = exact(source, 'let react = require("react");', 'let react = require("react");\n\t\tlet react_dom = require("react-dom");')
    source = exact(source, 'style: { left: props.left },', 'style: { ...props.style, left: props.left },')
    const portal = `
\t\tfunction SidebarDragHandle(props) { /* ODYSSEY_LEFT_RESIZE_PORTAL */
          const [bounds, setBounds] = (0, react.useState)(null);
          (0, react.useEffect)(() => {
            const frame = props.frameRef.current;
            const doc = frame?.ownerDocument;
            const win = doc?.defaultView;
            if (!frame || !doc?.body || !win) return;
            const sync = () => {
              const rect = frame.getBoundingClientRect();
              setBounds(previous => previous && previous.left === rect.left && previous.top === rect.top && previous.height === rect.height
                ? previous : { left: rect.left, top: rect.top, height: rect.height, body: doc.body });
            };
            sync();
            const observer = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(sync) : null;
            observer?.observe(frame);
            win.addEventListener("resize", sync);
            doc.addEventListener("scroll", sync, true);
            return () => {
              observer?.disconnect();
              win.removeEventListener("resize", sync);
              doc.removeEventListener("scroll", sync, true);
            };
          }, [props.frameRef]);
          const handle = (0, react_jsx_runtime.jsx)(DragHandle, {
            ...props,
            left: props.left + (bounds?.left || 0),
            style: bounds ? { position: "fixed", top: bounds.top, bottom: "auto", height: bounds.height } : void 0
          });
          return bounds ? (0, react_dom.createPortal)(handle, bounds.body) : handle;
\t\t}
`
    source = exact(source, '\t\t/** The three-column frame (see module doc). */', portal + '\t\t/** The three-column frame (see module doc). */')
    source = exact(source, '!sidebarCollapsed && !sidebarOverlay && (0, react_jsx_runtime.jsx)(DragHandle,', '!sidebarCollapsed && !sidebarOverlay && (0, react_jsx_runtime.jsx)(SidebarDragHandle,')
    source = exact(source, 'side: "sidebar",\n\t\t\t\t\t\tleft: cols.sidebar,', 'side: "sidebar",\n\t\t\t\t\t\tframeRef,\n\t\t\t\t\t\tleft: cols.sidebar,')
  }
  // Closing the rail is a visibility choice, not a reset of the last drag.
  // This stays in the existing transient layout store, including research's
  // automatic collapse. A fresh store still starts at the contract default.
  if (!source.includes('/* ODYSSEY_LEFT_RESIZE_RESTORE */')) {
    source = exact(source, 'sidebar: 280,', 'sidebar: 280,\n                    sidebarExpandedWidth: 280, /* ODYSSEY_LEFT_RESIZE_RESTORE */')
    source = exact(source, source.includes('d.sidebar = clampWidth(px, 240, 420);') ? 'd.sidebar = clampWidth(px, 240, 420);' : 'd.sidebar = clampWidth(px, 264, 420);', 'd.sidebar = clampWidth(px, 240, 420);\n                        d.sidebarExpandedWidth = d.sidebar;')
    source = exact(source, 'toggleSidebar: (d) => {', 'toggleSidebar: (d) => {\n                        if (d.sidebar > 0) d.sidebarExpandedWidth = clampWidth(d.sidebar, 240, 420);')
    source = exact(source, 'if (d.sidebarManuallyExpanded) return;', 'if (d.sidebarManuallyExpanded) return;\n                        if (d.sidebar > 0) d.sidebarExpandedWidth = clampWidth(d.sidebar, 240, 420);')
    source = source.replaceAll('d.sidebar === 0 ? 280 : 0', 'd.sidebar === 0 ? d.sidebarExpandedWidth || 280 : 0')
    source = exact(source, 'if (d.narrowExpanded && d.sidebar === 0) d.sidebar = 280;', 'if (d.narrowExpanded && d.sidebar === 0) d.sidebar = d.sidebarExpandedWidth || 280;')
  }
  // 194:4 / 370 explicitly show 280 → 240. Apply the same minimum when
  // dragging and when restoring persisted widths; the initial width stays 280.
  if (source.includes('clampWidth(sidebar, 280, 420)')) {
    source = exact(source, 'clampWidth(sidebar, 280, 420)', 'clampWidth(sidebar, 240, 420)')
  } else {
    source = exact(source, 'clampWidth(sidebar, 264, 420)', 'clampWidth(sidebar, 240, 420)')
  }
  return exact(source, 'clampWidth(px, 264, 420)', 'clampWidth(px, 240, 420)')
}
