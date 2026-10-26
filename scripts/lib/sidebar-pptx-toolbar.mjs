// This presentation layer is stripped before the established mode/source guards.
// Its component keeps the native anchor, refs, disabled state and callbacks.
const hintsMarker='/* sherlock:pptx-toolbar-hints:v1 */'
const hintsDefinition=hintsMarker+String.raw`
            const PptxToolbarAction = (0,react.useMemo)(()=>function PptxToolbarAction({as="button",hint,label,...props}){
                const anchor=(0,react_jsx_runtime.jsx)(as,hint?{...props,title:undefined,"aria-label":label}:props);
                return hint?(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip,{label,side:"bottom",delayMs:500,children:anchor}):anchor;
            },[]);
            const pptToolbarLabel = kind=>{
                const english=!activeLocale().toLowerCase().startsWith("zh");
                if(kind==="download")return english?"Download":"下载";
                if(kind==="folder")return english?"Open folder":"打开文件夹";
                if(kind==="edit")return toolbar?.mode==="edit"?(english?"Exit edit mode":"关闭编辑模式"):(english?"Edit presentation":"编辑演示文稿");
                return toolbar?.annotationActive?(english?"Exit annotation mode":"关闭标注模式"):(english?"Annotate presentation":"标注演示文稿");
            };
`+'/* sherlock:pptx-toolbar-hints:end */\n'
const hintsHooks=[
 ['(0, react_jsx_runtime.jsx)("a", {\n\t\t\t\t\t\t\tclassName: sidebar_module_css_default.iconButton,\n\t\t\t\t\t\t\thref: toolbar.downloadUrl,','(0, react_jsx_runtime.jsx)(PptxToolbarAction, {as:"a",hint:isPptx,label:pptToolbarLabel("download"),\n\t\t\t\t\t\t\tclassName: sidebar_module_css_default.iconButton,\n\t\t\t\t\t\t\thref: toolbar.downloadUrl,'],
 ['(0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.iconButton, treeOpen && sidebar_module_css_default.editorTreeToggleActive),','(0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:isPptx,label:pptToolbarLabel("folder"),\n\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\tclassName: clsx(sidebar_module_css_default.iconButton, treeOpen && sidebar_module_css_default.editorTreeToggleActive),'],
 ['(0, react_jsx_runtime.jsx)("button", {\n                            type: "button",\n                            className: clsx(sidebar_module_css_default.iconButton, toolbar?.mode === "edit" && sidebar_module_css_default.editorTreeToggleActive),','(0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:true,label:pptToolbarLabel("edit"),\n                            type: "button",\n                            className: clsx(sidebar_module_css_default.iconButton, toolbar?.mode === "edit" && sidebar_module_css_default.editorTreeToggleActive),'],
 ['(0,react_jsx_runtime.jsx)("button",{\n                            type:"button",className:clsx(sidebar_module_css_default.iconButton,toolbar.annotationActive&&sidebar_module_css_default.editorTreeToggleActive),','(0,react_jsx_runtime.jsx)(PptxToolbarAction,{hint:true,label:pptToolbarLabel("annotation"),\n                            type:"button",className:clsx(sidebar_module_css_default.iconButton,toolbar.annotationActive&&sidebar_module_css_default.editorTreeToggleActive),']
]
export function stripSidebarPptxToolbarHints(source){
 if(!source.includes('sherlock:pptx-toolbar-hints'))return source
 if(source.split(hintsDefinition).length!==2||hintsHooks.some(([,after])=>source.split(after).length!==2))throw Error('PPT toolbar hint installation drifted')
 source=source.replace('\n'+hintsDefinition,'')
 for(const[before,after]of hintsHooks)source=source.replace(after,before)
 if(source.includes('sherlock:pptx-toolbar-hints')||source.includes('const PptxToolbarAction ='))throw Error('PPT toolbar hint orphan drifted')
 return source
}
function patchSidebarPptxToolbarHints(source){
 const anchor='function EditorHost(props) {',start=source.indexOf(anchor),end=source.indexOf('\n\t\t/**',start)
 let host=source.slice(start,end)
 if(start<0||end<start||hintsHooks.some(([before])=>host.split(before).length!==2))throw Error('PPT toolbar hint source drifted')
 host=host.replace(anchor,anchor+'\n'+hintsDefinition)
 for(const[before,after]of hintsHooks)host=host.replace(before,after)
 return source.slice(0,start)+host+source.slice(end)
}

/** Bind the native sidebar header to the PPT viewer's existing mode controls. */
function patchSidebarPptxToolbarMode(source) {
  const marker = '/* odyssey:sidebar-pptx-mode:v2 */',legacyMarker='/* odyssey:sidebar-pptx-mode:v1 */'
  const anchor = 'function EditorHost(props) {'
  const start = source.indexOf(anchor), end = source.indexOf('\n\t\t/**', start)
  if (start < 0 || end < 0 || source.split(anchor).length !== 2) throw Error('Sidebar PPT toolbar host anchor drifted')
  const prefix=source.slice(0,start),suffix=source.slice(end)
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
  const annotationState = `
            const [annotationPending,setAnnotationPending] = (0,react.useState)(null), annotationRequestRef=(0,react.useRef)(null);
            const annotationBusy = toolbar?.annotationBusy === true || annotationPending === toolbarOwner;
            const togglePptxAnnotations = async()=>{
                const controls=getToolbarControls();
                if(!isPptx||toolbar?.annotations!==true||annotationBusy||pptModeBusy||annotationRequestRef.current?.owner===toolbarOwner||typeof controls?.toggleAnnotations!=="function")return;
                const request={owner:toolbarOwner};annotationRequestRef.current=request;setAnnotationPending(toolbarOwner);
                try{await controls.toggleAnnotations();}catch{/* The viewer retains the confirmed state and error. */}
                finally{if(annotationRequestRef.current===request){annotationRequestRef.current=null;if(toolbarOwnerRef.current===toolbarOwner)setAnnotationPending(null);}}
            };`
  const annotationButton = `,
                        isPptx && toolbar?.annotations === true && (0,react_jsx_runtime.jsx)("button",{
                            type:"button",className:clsx(sidebar_module_css_default.iconButton,toolbar.annotationActive&&sidebar_module_css_default.editorTreeToggleActive),
                            "data-odyssey-pptx-annotation-toggle":true,"aria-label":toolbar.annotationActive?"关闭标注模式":"标注演示文稿",title:toolbar.annotationActive?"关闭标注模式":"标注演示文稿",
                            "aria-pressed":!!toolbar.annotationActive,"aria-busy":annotationBusy||void 0,disabled:load.status!=="ready"||annotationBusy||pptModeBusy,onClick:togglePptxAnnotations,
                            children:(0,react_jsx_runtime.jsx)("img",{src:toolbar.annotationIcon,width:16,height:16,alt:"","aria-hidden":true})
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
  if(source.includes(legacyMarker)){
    const prior=replacements.map(([before,after])=>[before,after.replace(marker,legacyMarker)])
    if(source.split(legacyMarker).length!==2||prior.some(([,after])=>host.split(after).length!==2))throw Error('Legacy sidebar PPT toolbar installation drifted')
    for(const[before,after]of prior)host=host.replace(after,before)
    source=prefix+host+suffix
  }
  replacements[0][1]+=annotationState
  replacements[replacements.length-1][1]+=annotationButton
  if (source.includes(marker)) {
    if (source.split(marker).length !== 2 || replacements.some(([, after]) => host.split(after).length !== 2)) throw Error('Sidebar PPT toolbar installation drifted')
    return source
  }
  for (const [before, after] of replacements) {
    if (host.split(before).length !== 2) throw Error('Sidebar PPT toolbar source drifted: ' + before.slice(0, 70))
    host = host.replace(before, after)
  }
  return prefix + host + suffix
}

/** Metadata from the explicit Main-authorized reference opener; never a sending identity. */
export function sidebarPptxAnnotationProps(tab,scope){
 const value=tab?.meta?.sherlockPptAnnotationPreview,source=value?.source,grant=source?.source
 if(!source||source.sessionId!==scope?.sessionId||!grant||!['workspace','research','note-file'].includes(grant.kind))return null
 if(grant.kind==='workspace'){
  if(typeof grant.relativePath!=='string'||!grant.relativePath||grant.relativePath.split(/[\\/]/).some(value=>value==='..')||value.sourceUrl)return null
 }else if(typeof grant.nodeId!=='string'||!grant.nodeId||typeof grant.authorizationId!=='string'||!grant.authorizationId||!/^sherlock-preview:\/\/[A-Za-z0-9_-]+\/$/.test(value.sourceUrl??''))return null
 return{annotationSource:source,path:value.sourceUrl||tab.path,annotationCanonicalPath:tab.path}
}
export function patchSidebarPptxToolbar(source){
 source=stripSidebarPptxToolbarHints(source)
 const marker='/* sherlock:pptx-annotation-sidebar-source:v1 */'
 const before='const path = tab.path ?? "";',after=before+'\n'+marker+'\n'+sidebarPptxAnnotationProps.toString()+'\nconst annotationPreview=sidebarPptxAnnotationProps(tab,scope);'
 const props='path,\n\t\t\t\t\t\t\t\ttitle,\n\t\t\t\t\t\t\t\tviewerId: load.viewer.id,',installed='path: annotationPreview?.path ?? path,\n                                annotationSource: annotationPreview?.annotationSource,\n                                annotationCanonicalPath: annotationPreview?.annotationCanonicalPath,\n\t\t\t\t\t\t\t\ttitle,\n\t\t\t\t\t\t\t\tviewerId: load.viewer.id,'
 if(source.includes(marker)){
  if(source.split(marker).length!==2||source.split(after).length!==2||source.split(installed).length!==2)throw Error('PPT annotation sidebar source installation drifted')
  source=source.replace(after,before).replace(installed,props)
 }else if(source.includes('annotationPreview?.annotationSource')||source.includes('const annotationPreview=sidebarPptxAnnotationProps'))throw Error('PPT annotation sidebar source orphan drifted')
 source=patchSidebarPptxToolbarMode(source)
 const start=source.indexOf('function EditorHost(props) {'),end=source.indexOf('\n\t\t/**',start),host=source.slice(start,end)
 if(host.split(before).length!==2||host.split(props).length!==2)throw Error('PPT annotation sidebar source anchors drifted')
 return patchSidebarPptxToolbarHints(source.slice(0,start)+host.replace(before,after).replace(props,installed)+source.slice(end))
}
