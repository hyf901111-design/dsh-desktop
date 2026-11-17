function useKnowledgeEditorSource(fileId, scope, tab, sidebar) {
  const bridge = window.dshDesktop
  const key = fileId ? JSON.stringify([scope.sessionId, fileId]) : null
  const [unreconciled, setRecord] = react.useState(null)
  const record = unreconciled?.key === key ? unreconciled : null
  const title = record?.source?.document.name
  const revision = react.useRef(null)
  const commit = react.useRef(null)
  react.useEffect(() => {
    if (title && title !== tab.title) sidebar.updateTab(tab.id, { title }, scope)
  }, [title, tab.id, tab.title, scope.sessionId, sidebar])
  react.useEffect(() => {
    if (!key) return
    let disposed = false
    let request = 0
    let checking = false
    let checkAgain = false
    let failed = false
    let source
    const shared = fileId.length === 32
    const errorMessage = () => shared ? '该文件已取消共享或不可用。' : '此知识库文件已不可用。'
    const clear = (message) => {
      request++
      failed = true
      source = null
      revision.current = null
      setRecord({ key, error: message || errorMessage() })
    }
    const publish = next => {
      source = next
      revision.current = next.revision ? { key, value: next.revision } : null
      setRecord({ key, source })
    }
    const commitSave = (saved, text) => {
      if (source?.kind !== 'text' || source.document.updatedAt > saved.document.updatedAt) return
      request++
      publish({ ...source, ...saved, text })
      void check()
    }
    const load = async () => {
      const pending = ++request
      failed = false
      try {
        const next = await bridge.knowledgeFilePreview(fileId, scope.sessionId ?? '')
        if (disposed || pending !== request) return
        publish(next)
      } catch (error) {
        if (!disposed && pending === request) clear(error.message)
      }
    }
    const check = async () => {
      if (!source || document.hidden) return
      if (checking) { checkAgain = true; return }
      const pending = request
      checking = true
      try {
        const current = await bridge.knowledgeFilePreviewStatus(fileId, source.document.updatedAt)
        if (disposed || pending !== request || !source) return
        if (!current) return clear()
        const sharingChanged = Boolean(current.share) !== Boolean(source.document.share)
        if ((shared || source.kind === 'text') && (sharingChanged || current.updatedAt !== source.document.updatedAt)) {
          await load()
          return
        }
        if (current.name !== source.document.name || Boolean(current.share) !== Boolean(source.document.share)) {
          source = { ...source, document: current }
          setRecord({ key, source })
        }
      } catch {
        if (!disposed && pending === request) clear()
      } finally {
        checking = false
        if (checkAgain && !disposed) {
          checkAgain = false
          void check()
        }
      }
    }
    const accountChanged = () => clear('账号已切换，请从知识库重新打开文件。')
    const reopen = event => {
      if (event.detail !== fileId) return
      if (failed) void load()
      else void check()
    }
    document.addEventListener('sherlock:knowledge-preview-reopen', reopen)
    document.addEventListener('sherlock:knowledge-account-changed', accountChanged)
    document.addEventListener('sherlock:knowledge-changed', check)
    if (shared) document.addEventListener('sherlock:knowledge-shared-access-changed', check)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    const timer = shared ? window.setInterval(check, 15000) : null
    commit.current = commitSave
    void load()
    return () => {
      disposed = true
      if (commit.current === commitSave) commit.current = null
      if (timer !== null) window.clearInterval(timer)
      document.removeEventListener('sherlock:knowledge-preview-reopen', reopen)
      document.removeEventListener('sherlock:knowledge-account-changed', accountChanged)
      document.removeEventListener('sherlock:knowledge-changed', check)
      if (shared) document.removeEventListener('sherlock:knowledge-shared-access-changed', check)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [key])
  const write = react.useCallback(async (text, baseRevision) => {
    const current = revision.current
    if (current?.key !== key) throw Error('文件编辑授权已失效。')
    if (typeof baseRevision !== 'string') throw Error('文件编辑版本已失效。')
    const apply = commit.current
    const result = await bridge.knowledgeFileSaveMarkdown(fileId, baseRevision, text)
    if (commit.current === apply) apply?.(result, text)
    return result.revision
  }, [key])
  return { record, write }
}

function nativeKnowledgeViewer(source, path, sidebar) {
  if (source.kind === 'text') {
    const viewer = sidebar.matchFileViewer(/\.(md|markdown)$/i.test(path) ? path : path + '.txt')
    return { viewer, content: source.text }
  }
  if (source.kind === 'media') {
    if (/^(audio|video)\//u.test(source.contentType)) {
      return { viewer: { id: 'knowledge-media', component: KnowledgePassiveMedia }, mediaUrl: source.url }
    }
    const viewer = sidebar.matchFileViewer(path)
    if (viewer?.fetchStrategy === 'mediaUrl') return { viewer, mediaUrl: source.url }
  }
  return null
}

function KnowledgePassiveMedia({ mediaUrl, customData }) {
  return react_jsx_runtime.jsx('div', {
    className: sidebar_module_css_default.editorImageWrap,
    children: react_jsx_runtime.jsx(customData.contentType.startsWith('video/') ? 'video' : 'audio', {
      controls: true, preload: 'metadata', src: mediaUrl, style: { maxWidth: '100%', maxHeight: '100%' }
    })
  })
}

function KnowledgeImageCanvasActions({ row, ToolbarAction, onError }) {
  const pending = react.useRef(false)
  const [busy, setBusy] = react.useState(false)
  const open = window.dshDesktop?.knowledgeOpenImageCanvas
  if (!open || row?.generatedBy !== 'image-factory' || row.received) return null
  const english = document.documentElement.dataset.odysseyLocale === 'en'
  const button = (kind, id, label, icon) => react_jsx_runtime.jsx(ToolbarAction, {
    hint: true, label, type: 'button', className: sidebar_module_css_default.iconButton, disabled: busy,
    onClick: async () => {
      if (pending.current) return
      pending.current = true
      setBusy(true)
      onError('')
      try { await open(kind, id) }
      catch (error) { onError(error?.message || (english ? 'Could not open Images.' : '无法打开「图像」。')) }
      finally { pending.current = false; setBusy(false) }
    },
    children: react_jsx_runtime.jsx(icon, { size: 14 })
  })
  return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
    row.sessionId && button('source', row.sessionId, english ? 'Open source canvas' : '打开来源画布',
      _deepseek_ai_dsh_client_ui_primitives.IconImageOutline16),
    button('copy', row.id, english ? 'Edit a copy in Images' : '在「图像」中编辑副本',
      _deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16)
  ] })
}

const marker = '/* sherlock:native-knowledge-editor:v1 */'
const revisionMarker = '/* sherlock:knowledge-preview-revisions:v1 */'
const scopedReplace = (source, from, to) => {
  if (source.split(from).length !== 2) throw Error('Native knowledge editor source drifted: ' + from.slice(0, 80))
  return source.replace(from, to)
}

function patchImageCanvasActions(source) {
  const marker = '/* sherlock:knowledge-preview-image-actions:v1 */'
  if (source.includes(marker)) return source
  const patched = scopedReplace(source, 'function EditorHost(props) {',
    marker + '\n' + KnowledgeImageCanvasActions.toString() + '\nfunction EditorHost(props) {')
  const download = 'managedId && managedSource && (0, react_jsx_runtime.jsx)(PptxToolbarAction,{hint:true,label:pptToolbarLabel("download"),type:"button",'
  const actions = 'managedId && managedSource && react_jsx_runtime.jsx(KnowledgeImageCanvasActions,{row:managedSource.document,ToolbarAction:PptxToolbarAction,onError:setManagedDownloadError},managedId),'
  return scopedReplace(patched, download, actions + '\n                        ' + download)
}

export function patchSidebarKnowledgePreview(source) {
  if (source.includes(revisionMarker)) return patchImageCanvasActions(source)
  if (source.includes(marker)) {
    const start = source.indexOf('function useKnowledgeEditorSource(')
    const end = source.indexOf('function nativeKnowledgeViewer(', start)
    if (start < 0 || end < 0) throw Error('Native knowledge editor source missing')
    let rest = scopedReplace(source.slice(end),
      'managedFile: Boolean(managedId),',
      'managedFile: Boolean(managedId), managedRevision: managedSource?.revision,')
    rest = scopedReplace(rest,
      '!isPptx && (!managedId || managedWritable) && toolbar?.modes === true',
      '!isPptx && (!managedId || managedWritable || toolbar?.dirty === true) && toolbar?.modes === true')
    return patchImageCanvasActions(source.slice(0, start) + revisionMarker + '\n' + useKnowledgeEditorSource.toString() + '\n' + rest)
  }
  const start = source.indexOf('function EditorHost(props) {')
  const end = source.indexOf('function EditorPathInput(props) {', start)
  if (start < 0 || end < 0) throw Error('Native knowledge editor host missing')
  let host = source.slice(start, end)
  const replace = (from, to) => { host = scopedReplace(host, from, to) }
  const state = 'const [load, setLoad] = (0, react.useState)({ status: "loading" });'
  replace(state, `const managedId = tab.id?.startsWith('knowledge-file:') ? tab.meta?.fileId : undefined;
            const { record: managed, write: writeManagedText } = useKnowledgeEditorSource(managedId, scope, tab, ctx.betterSidebar);
            const managedSource = managed?.source;
            const [workspaceLoad, setLoad] = (0, react.useState)({ status: "loading" });
            const managedView = managedSource && nativeKnowledgeViewer(managedSource, managedSource.document.name, ctx.betterSidebar);
            const load = !managedId ? workspaceLoad : managed?.error ? {status:"error",message:managed.error}
                : !managedSource ? {status:"loading"} : !managedView ? {status:"binary"}
                : {status:"ready", ...managedView, customData:managedSource};
            const managedWritable = Boolean(managedSource && !managedSource.document.share && (managedSource.editablePresentation || managedSource.revision));`)
  replace('if (showEmpty) return;', 'if (showEmpty || managedId) return;')
  replace('path,\n\t\t\t\tctx,\n\t\t\t\tshowEmpty', 'path,\n\t\t\t\tctx,\n\t\t\t\tshowEmpty, managedId')
  replace('const treeOpen = treeOpenOf(tab);', 'const treeOpen = !managedId && treeOpenOf(tab);')
  replace('/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorPathInput, {', `managedId ? (0, react_jsx_runtime.jsx)("span",{className:sidebar_module_css_default.editorPath,title,children:title,style:{flex:"1",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}) : (0, react_jsx_runtime.jsx)(EditorPathInput, {`)
  replace('toolbar?.downloadUrl !== void 0', `managedId && managedSource && (0, react_jsx_runtime.jsx)(PptxToolbarAction,{hint:true,label:pptToolbarLabel("download"),type:"button",
                            className:sidebar_module_css_default.iconButton,onClick:()=>window.dshDesktop.knowledgeFileDownload(managedId).catch(error=>setManagedDownloadError(error.message)),
                            children:(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16,{size:14})}),
                        !managedId && toolbar?.downloadUrl !== void 0`)
  replace('const managedSource = managed?.source;', 'const managedSource = managed?.source;\n            const [managedDownloadError,setManagedDownloadError]=(0,react.useState)("");')
  replace('/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:isPptx,label:pptToolbarLabel("folder"),', '!managedId && (0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:isPptx,label:pptToolbarLabel("folder"),')
  replace('isPptx && (0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:true,label:pptToolbarLabel("edit"),', 'isPptx && (!managedId || managedWritable) && (0, react_jsx_runtime.jsx)(PptxToolbarAction, {hint:true,label:pptToolbarLabel("edit"),')
  replace('!isPptx && toolbar?.modes === true', '!isPptx && (!managedId || managedWritable || toolbar?.dirty === true) && toolbar?.modes === true')
  replace('!showEmpty && load.status === "binary" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BinaryDownload, {', `managedId && managedDownloadError && (0,react_jsx_runtime.jsx)("div",{role:"alert",className:sidebar_module_css_default.editorError,children:managedDownloadError}),
                            !showEmpty && load.status === "binary" && (managedId ? (0, react_jsx_runtime.jsx)("div",{className:sidebar_module_css_default.editorBinary,children:t("binaryNoPreview")}) : (0, react_jsx_runtime.jsx)(BinaryDownload, {`)
  replace('path\n\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\t!showEmpty && load.status === "ready"', 'path\n\t\t\t\t\t\t\t})),\n\t\t\t\t\t\t\t!showEmpty && load.status === "ready"')
  replace('path: annotationPreview?.path ?? path,', `path: managedSource?.url && ['docx','xlsx','pptx'].includes(load.viewer.id) ? managedSource.url : annotationPreview?.path ?? path,
                                readOnly: managedId ? !managedWritable : undefined,
                                managedFile: Boolean(managedId),
                                managedRevision: managedSource?.revision,
                                writeManagedText: managedId && managedWritable ? writeManagedText : undefined,`)
  replace('annotationSource: annotationPreview?.annotationSource,', `annotationSource: managedId ? (managedWritable && isPptx && scope.sessionId ? {sessionId:scope.sessionId,source:{kind:"knowledge-file",nodeId:managedId}} : undefined) : annotationPreview?.annotationSource,`)
  const prefix = [marker, revisionMarker, useKnowledgeEditorSource.toString(), nativeKnowledgeViewer.toString(), KnowledgePassiveMedia.toString()].join('\n')
  let next = source.slice(0, start) + prefix + '\n' + host + source.slice(end)
  const pdfStart = next.indexOf('function PdfView(props) {')
  const pdfEnd = next.indexOf('function builtinViewers()', pdfStart)
  let pdf = next.slice(pdfStart, pdfEnd)
  pdf = scopedReplace(pdf, 'fetch(mediaUrl(scope, path),', 'fetch(props.managedFile ? props.mediaUrl : mediaUrl(scope, path),')
  pdf = scopedReplace(pdf, 'scope.cwd,\n\t\t\t\tpath\n\t\t\t]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tconst block', 'scope.cwd,\n\t\t\t\tpath, props.mediaUrl\n\t\t\t]);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tconst block')
  return patchImageCanvasActions(next.slice(0, pdfStart) + pdf + next.slice(pdfEnd))
}
