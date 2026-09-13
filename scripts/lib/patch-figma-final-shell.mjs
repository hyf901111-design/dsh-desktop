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
const START = '/* ODYSSEY_FIGMA_FINAL_SHELL_START */'
const END = '/* ODYSSEY_FIGMA_FINAL_SHELL_END */'
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma final shell anchor drifted: ' + from.slice(0, 90))
  return source.replace(from, to)
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
  if (!source.includes(residentHeader)) {
    source = exact(source, source.includes('const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";') ? 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat";' : 'const hideChrome = blank && composerPhase === "blank" && active?.id === "chat" && researchNavigation.current !== sessionId;', finalHideChrome)
    source = exact(source, finalHideChrome, residentHeader)
  }
  source = exact(source, '"data-srb-session-header":"",', '"data-srb-session-header":"", "data-odyssey-home-header":homeHeader,')
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
  const block = `${START}\nif(typeof document!=="undefined"&&!document.getElementById?.("sherlock-desktop-shell-style")){let style=document.getElementById?.("odyssey-figma-final-shell");if(!style){style=document.createElement("style");style.id="odyssey-figma-final-shell";document.documentElement.appendChild(style);}style.textContent=${JSON.stringify(css + homeCss + panelCss + filePanelCss + trajectoryCss + inlineCss + motionCss + refinementCss + readingCss)};}\n${END}`
  const starts=source.split(START).length-1, ends=source.split(END).length-1
  if(starts!==ends || starts>1 || (starts===1 && source.indexOf(END)<source.indexOf(START))) throw Error('Figma final shell marker is incomplete or duplicated')
  if(starts===1) return source.slice(0,source.indexOf(START))+block+source.slice(source.indexOf(END)+END.length)
  return source+'\n'+block
}

export function patchFigmaFinalLayout(source) {
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
  // 194:4 / 370 explicitly show 280 → 240. Apply the same minimum when
  // dragging and when restoring persisted widths; the initial width stays 280.
  if (source.includes('clampWidth(sidebar, 280, 420)')) {
    source = exact(source, 'clampWidth(sidebar, 280, 420)', 'clampWidth(sidebar, 240, 420)')
  } else {
    source = exact(source, 'clampWidth(sidebar, 264, 420)', 'clampWidth(sidebar, 240, 420)')
  }
  return exact(source, 'clampWidth(px, 264, 420)', 'clampWidth(px, 240, 420)')
}
