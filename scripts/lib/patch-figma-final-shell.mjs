import { readFile } from 'node:fs/promises'
const css = await readFile(new URL('../../src/preload/figma-final-shell.css', import.meta.url), 'utf8')
const homeCss = await readFile(new URL('../../src/preload/figma-home.css', import.meta.url), 'utf8')
const panelCss = await readFile(new URL('../../src/preload/figma-panels.css', import.meta.url), 'utf8')
const filePanelCss = await readFile(new URL('../../src/preload/figma-file-panel.css', import.meta.url), 'utf8')
const trajectoryCss = await readFile(new URL('../../src/preload/figma-trajectory.css', import.meta.url), 'utf8')
const inlineCss = await readFile(new URL('../../src/preload/figma-inline-references.css', import.meta.url), 'utf8')
const motionCss = await readFile(new URL('../../src/preload/figma-motion.css', import.meta.url), 'utf8')
const START = '/* ODYSSEY_FIGMA_FINAL_SHELL_START */'
const END = '/* ODYSSEY_FIGMA_FINAL_SHELL_END */'
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma final shell anchor drifted: ' + from.slice(0, 90))
  return source.replace(from, to)
}
export function patchFigmaFinalConversation(source) {
  // The visible Chinese headline is outlined artwork in the final Figma frame;
  // retain the localized accessible sentence and use text for other locales.
  source = exact(source, 'className: HeroShell_module_css_default.headlineText,\n\t\t\t\t\t\t\t\tchildren: t("hero.headline")', 'className: HeroShell_module_css_default.headlineText,\n\t\t\t\t\t\t\t\t"data-odyssey-home-title-art": t("hero.headline") === "探索更远，洞见更深。" ? "" : void 0,\n\t\t\t\t\t\t\t\t"aria-label": t("hero.headline"),\n\t\t\t\t\t\t\t\tchildren: t("hero.headline")')
  // The resident root knows the active view; DOM existence cannot distinguish an
  // empty chat from Research, whose conversation/composer live in body portals.
  source = exact(source, '"data-phase": phase,\n\t\t\t\tonClickCapture:', '"data-phase": phase,\n\t\t\t\t"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",\n\t\t\t\tonClickCapture:')
  source = exact(source, 'this.researchWidths.get(sessionId) ?? 420', 'this.researchWidths.get(sessionId) ?? 340')
  source = exact(source, 'function ComposerSurface({ zone, hero, researchEmpty,', 'function ComposerSurface({ zone, hero, research = false, researchEmpty,')
  source = exact(source, '(hero || researchEmpty) && heroWorkspaceRow', '(hero || research || researchEmpty) && heroWorkspaceRow')
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
  source = exact(source, source.includes('const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";') ? 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";' : 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && researchNavigation.current !== sessionId;', finalHideChrome)
  source = exact(source, 'children: summary.displayTitle', 'children: last && blankResearchTitle ? "新研究" : summary.displayTitle')
  // Keep workspace and permission-block placeholders ahead of the empty Research hint.
  source = exact(source, '} : hero ? { placeholder: t("placeholder.hero") } : {},', '} : hero ? { placeholder: t("placeholder.hero") } : researchEmpty ? { placeholder: "描述你想研究的问题…" } : {},')
  // User correction / 164:805,940: retain the live canvas scope control in
  // the composer. Explicit references still flow as inline chips.
  source = exact(source, 'null /* Figma final: manual references remain native inline chips. */,', 'researchCanvasWorkspace !== void 0 && (0, react_jsx_runtime.jsx)(ResearchCanvasContextBadge, { workspace: researchCanvasWorkspace, input, keyboard, t, disabled }, sessionId),')
  source = exact(source, '|| research.canvasContext !== void 0 || rest.length > 0;', '|| rest.length > 0; /* Automatic context alone is not visible message content. */')
  source = exact(source, [
    'children: [projectResearchUserText(research, openFile), research.canvasContext !== void 0 && (0, react_jsx_runtime.jsx)("div", {',
    '\t\t\t\t\t\t\t"data-research-context-provenance": "",',
    '\t\t\t\t\t\t\tstyle: { marginTop: research.text === "" ? 0 : 6, fontSize: 11, lineHeight: "16px", color: "var(--dsw-alias-label-tertiary)" },',
    '\t\t\t\t\t\t\ttitle: `${t("research.context.initialSources")}: ${research.canvasContext.initialSourceIds.join(", ") || t("research.context.noInitialSources")}`,',
    '\t\t\t\t\t\t\tchildren: t("research.context.sent", { total: research.canvasContext.totalSources, initial: research.canvasContext.initialSourceIds.length })',
    '\t\t\t\t\t\t}), rest.map'
  ].join('\n'), 'children: [projectResearchUserText(research, openFile), rest.map')
  // QueueDock projects only visible input; automatic canvas context remains frozen in the payload.
  source = exact(source,
    'return research.canvasContext === void 0 ? row : { ...row, text: null, preview: research.text || t("research.context.sent", { initial: research.canvasContext.initialSourceIds.length, total: research.canvasContext.totalSources }), frozenCanvasContext: true };',
    'return research.canvasContext === void 0 ? row : { ...row, text: null, preview: research.text || (Array.isArray(row.content) && contentParts(row.content).images.length > 0 ? t("image.pending") + " · " + contentParts(row.content).images.length : ""), frozenCanvasContext: true };')
  const block = `${START}\nif(typeof document!=="undefined"&&!document.getElementById?.("sherlock-desktop-shell-style")){let style=document.getElementById?.("odyssey-figma-final-shell");if(!style){style=document.createElement("style");style.id="odyssey-figma-final-shell";document.documentElement.appendChild(style);}style.textContent=${JSON.stringify(css + homeCss + panelCss + filePanelCss + trajectoryCss + inlineCss + motionCss)};}\n${END}`
  const starts=source.split(START).length-1, ends=source.split(END).length-1
  if(starts!==ends || starts>1 || (starts===1 && source.indexOf(END)<source.indexOf(START))) throw Error('Figma final shell marker is incomplete or duplicated')
  if(starts===1) return source.slice(0,source.indexOf(START))+block+source.slice(source.indexOf(END)+END.length)
  return source+'\n'+block
}

export function patchFigmaFinalLayout(source) {
  // A coalesced/quick drag may deliver the final position only on pointerup.
  // Commit that coordinate before releasing capture and flushing the rAF.
  source = exact(source,
    '\t\t\t\te.currentTarget.releasePointerCapture(e.pointerId);',
    '\t\t\t\tlatest.current = e.clientX;\n\t\t\t\te.currentTarget.releasePointerCapture(e.pointerId);')
  // 194:4 / 370 explicitly show 280 → 240. Apply the same minimum when
  // dragging and when restoring persisted widths; the initial width stays 280.
  if (source.includes('clampWidth(sidebar, 280, 420)')) {
    source = exact(source, 'clampWidth(sidebar, 280, 420)', 'clampWidth(sidebar, 240, 420)')
  } else {
    source = exact(source, 'clampWidth(sidebar, 264, 420)', 'clampWidth(sidebar, 240, 420)')
  }
  return exact(source, 'clampWidth(px, 264, 420)', 'clampWidth(px, 240, 420)')
}
