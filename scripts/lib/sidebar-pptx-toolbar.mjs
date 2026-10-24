/** Bind the native sidebar header to the PPT viewer's existing mode controls. */
export function patchSidebarPptxToolbar(source) {
  const marker = '/* odyssey:sidebar-pptx-mode:v1 */'
  const anchor = 'function EditorHost(props) {'
  const start = source.indexOf(anchor), end = source.indexOf('\n\t\t/**', start)
  if (start < 0 || end < 0 || source.split(anchor).length !== 2) throw Error('Sidebar PPT toolbar host anchor drifted')
  let host = source.slice(start, end)
  const beforeState = `const [toolbar, setToolbar] = (0, react.useState)(null);
\t\t\tconst controlsRef = (0, react.useRef)(null);
\t\t\tconst onToolbarState = (0, react.useCallback)((next) => {
\t\t\t\tsetToolbar((prev) => prev !== null && JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
\t\t\t}, []);
\t\t\tconst onToolbarControls = (0, react.useCallback)((controls) => {
\t\t\t\tcontrolsRef.current = controls;
\t\t\t}, []);`
  const afterState = `${marker}
            const [toolbarRecord, setToolbar] = (0, react.useState)(null);
            const controlsRef = (0, react.useRef)(null), toolbarOwnerRef = (0, react.useRef)(null);
            const toolbarKey = JSON.stringify([scope.sessionId, scope.cwd, path]);
            if (toolbarOwnerRef.current?.key !== toolbarKey) toolbarOwnerRef.current = {key:toolbarKey};
            const toolbarOwner = toolbarOwnerRef.current;
            const toolbar = toolbarRecord?.owner === toolbarOwner ? toolbarRecord.state : null;
            const isPptx = /\\.pptx$/i.test(path);
            const getToolbarControls = () => controlsRef.current?.owner === toolbarOwner ? controlsRef.current.value : null;
            const onToolbarState = (0, react.useCallback)((next) => {
                if (toolbarOwnerRef.current !== toolbarOwner) return;
                setToolbar(prev => prev?.owner === toolbarOwner && JSON.stringify(prev.state) === JSON.stringify(next) ? prev : {owner:toolbarOwner,state:next});
            }, [toolbarOwner]);
            const onToolbarControls = (0, react.useCallback)((controls) => {
                if (toolbarOwnerRef.current === toolbarOwner) controlsRef.current = {owner:toolbarOwner,value:controls};
            }, [toolbarOwner]);
            const [modePending, setModePending] = (0, react.useState)(null), modeRequestRef = (0, react.useRef)(null);
            const pptModeBusy = toolbar?.modeBusy === true || modePending === toolbarOwner;
            const togglePptxMode = async () => {
                const controls = getToolbarControls();
                if (!isPptx || toolbar?.modes !== true || toolbar.editable !== true || pptModeBusy || modeRequestRef.current?.owner === toolbarOwner || typeof controls?.toggleMode !== "function") return;
                const request = {owner:toolbarOwner}; modeRequestRef.current = request; setModePending(toolbarOwner);
                try { await controls.toggleMode(); } catch { /* The viewer owns error reporting and remains in its confirmed mode. */ }
                finally {
                    if (modeRequestRef.current === request) {
                        modeRequestRef.current = null;
                        if (toolbarOwnerRef.current === toolbarOwner) setModePending(null);
                    }
                }
            };`
  const folder = `children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 })
\t\t\t\t\t\t})`
  const withButton = `${folder},
                        isPptx && (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            className: clsx(sidebar_module_css_default.iconButton, toolbar?.mode === "edit" && sidebar_module_css_default.editorTreeToggleActive),
                            "data-odyssey-pptx-mode-toggle": true,
                            "aria-label": toolbar?.mode === "edit" ? "关闭编辑模式" : "编辑演示文稿",
                            title: toolbar?.mode === "edit" ? "关闭编辑模式" : "编辑演示文稿",
                            "aria-pressed": toolbar?.mode === "edit",
                            "aria-busy": pptModeBusy || void 0,
                            disabled: load.status !== "ready" || toolbar?.modes !== true || toolbar.editable !== true || pptModeBusy,
                            onClick: togglePptxMode,
                            children: (0, react_jsx_runtime.jsx)("svg", {width:14,height:14,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:1.4,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true,children:(0,react_jsx_runtime.jsx)("path",{d:toolbar?.mode === "edit" ? "M1.5 8s2-4.5 6.5-4.5S14.5 8 14.5 8s-2 4.5-6.5 4.5S1.5 8 1.5 8ZM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" : "m10 2 4 4-7.5 7.5-4.5.5.5-4.5L10 2ZM8.5 3.5l4 4M2.5 9.5l4 4"})})
                        })`
  const replacements = [
    [beforeState, afterState],
    ['setToolbar(null);\n\t\t\t\tif (showEmpty) return;', '/* The file-scoped record rejects stale state without clearing a new child effect. */\n\t\t\t\tif (showEmpty) return;'],
    ['toolbar?.modes === true && /* @__PURE__ */', '!isPptx && toolbar?.modes === true && /* @__PURE__ */'],
    ['toolbar?.editable === true && /* @__PURE__ */', 'toolbar?.editable === true && (!isPptx || toolbar.mode === "edit") && /* @__PURE__ */'],
    ['controlsRef.current?.setMode("preview");', 'getToolbarControls()?.setMode("preview");'],
    ['controlsRef.current?.setMode("edit");', 'getToolbarControls()?.setMode("edit");'],
    ['controlsRef.current?.save();', 'getToolbarControls()?.save();'],
    [folder, withButton]
  ]
  if (source.includes(marker)) {
    if (source.split(marker).length !== 2 || replacements.some(([, after]) => host.split(after).length !== 2)) throw Error('Sidebar PPT toolbar installation drifted')
    return source
  }
  for (const [before, after] of replacements) {
    if (host.split(before).length !== 2) throw Error('Sidebar PPT toolbar source drifted: ' + before.slice(0, 70))
    host = host.replace(before, after)
  }
  return source.slice(0, start) + host + source.slice(end)
}
