// A DOM-local bridge lets independently portalled component chrome consume the
// same central editor instance as its reader. No editor session is opened here.
export function componentPptxModeHost(root) {
  if (!root?.isConnected) return null
  const hosts = root.matches?.('[data-component-pptx-mode-host]') ? [root] : [...root.querySelectorAll('[data-component-pptx-mode-host]')]
  return hosts.find(host => !host.closest('[hidden]') && host.__eworkPptxMode?.state?.modes === true) ?? null
}

export function useComponentPptxMode(target, active = true) {
  const [value, setValue] = react.useState(null)
  react.useLayoutEffect(() => {
    const root = target?.current ?? target
    if (!active || !root?.isConnected) { setValue(null); return }
    const read = () => {
      const host = componentPptxModeHost(root), state = host?.__eworkPptxMode?.state
      setValue(previous => previous?.host === host && previous?.state === state ? previous : host ? { host, state } : null)
    }
    read(); root.addEventListener('sherlock:component-pptx-mode', read)
    const Observer = root.ownerDocument.defaultView.MutationObserver, observer = new Observer(read)
    observer.observe(root, { childList: true, subtree: true })
    return () => { root.removeEventListener('sherlock:component-pptx-mode', read); observer.disconnect() }
  }, [target, active])
  return value ? { ...value.state, toggleMode: () => value.host.isConnected && value.host.__eworkPptxMode?.controls?.toggleMode?.() } : null
}

export function PptxComponentEditorHost({ Component, readOnly = false, ...props }) {
  const h = react.createElement, host = react.useRef(null), current = react.useRef({ state: null, controls: null }), [state, setState] = react.useState(null)
  const publish = () => {
    const element = host.current
    if (!element) return
    element.__eworkPptxMode = current.current
    element.dispatchEvent(new element.ownerDocument.defaultView.CustomEvent('sherlock:component-pptx-mode', { bubbles: true }))
  }
  const receiveState = react.useCallback(next => {
    const before = current.current.state, value = { modes: next?.modes === true, mode: next?.mode === 'edit' ? 'edit' : 'preview', editable: !readOnly && next?.editable === true, modeBusy: next?.modeBusy === true }
    if (before && Object.keys(value).every(key => before[key] === value[key])) return
    current.current.state = value; setState(value); publish()
  }, [readOnly])
  const receiveControls = react.useCallback(next => {
    const wasReady = typeof current.current.controls?.toggleMode === 'function'
    current.current.controls = next
    if (wasReady !== (typeof next?.toggleMode === 'function')) publish()
  }, [])
  react.useLayoutEffect(() => { publish(); return () => { if (host.current) delete host.current.__eworkPptxMode } }, [])
  const label = state?.mode === 'edit' ? '关闭编辑模式' : '编辑'
  return h('div', { ref: host, 'data-component-pptx-mode-host': '', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, height: '100%' } },
    h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 } }, h(Component, { ...props, readOnly, toolbar: 'host', onToolbarState: receiveState, onToolbarControls: receiveControls })),
    state?.modes && state.editable && !readOnly ? h('footer', { 'data-component-pptx-footer': '', style: { display: 'flex', flex: 'none', justifyContent: 'flex-end', padding: '4px 8px', borderTop: '1px solid var(--grid-border, #8883)' } },
      h('button', { type: 'button', 'data-component-pptx-edit': '', 'aria-label': label, 'aria-pressed': state.mode === 'edit', 'aria-busy': state.modeBusy || undefined, title: label, disabled: state.modeBusy || typeof current.current.controls?.toggleMode !== 'function', onPointerDown: event => event.stopPropagation(), onClick: event => { event.stopPropagation(); void current.current.controls?.toggleMode?.() }, style: { display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 24, border: 0, borderRadius: 4, padding: '2px 6px', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' } }, h('span', { className: 'ew-grid-icon ew-grid-icon-edit', 'aria-hidden': true }), label)) : null)
}

const begin = '/* EWORK_COMPONENT_PPTX_MODE_BEGIN */', end = '/* EWORK_COMPONENT_PPTX_MODE_END */'
const replacements = [
  ['function ResearchCanvasOfficePreview({ node, sessionId, kind, visible, service, resizing }) {', 'function ResearchCanvasOfficePreview({ node, sessionId, kind, visible, service, resizing, readOnly = false }) {'],
  ['const Component = service.Component;', 'const Component = kind === "pptx" ? PptxComponentEditorHost : service.Component;'],
  ['sourceUrl: preview.descriptor.url,', '...(kind === "pptx" ? { Component: service.Component, readOnly: readOnly || node.readOnly === true || sherlockShared(sessionId) && sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit !== true, ...(typeof node.path === "string" && node.path ? { refreshSource: { sessionId, path: node.path } } : {}) } : {}),\n                        sourceUrl: preview.descriptor.url,']
]
export function stripComponentPptxMode(source) {
  const metadata = source.indexOf('/* EWORK_GRID_RESTORE '), suffix = metadata < 0 ? '' : source.slice(metadata)
  if (metadata >= 0) source = source.slice(0, metadata)
  const first = source.indexOf(begin), last = source.indexOf(end, first)
  if (first < 0) {
    if (last >= 0 || replacements.some(([, installed]) => source.includes(installed))) throw Error('PPT component mode orphaned props')
    return source + suffix
  }
  if (last < first || source.indexOf(begin, first + begin.length) >= 0 || source.indexOf(end, last + end.length) >= 0) throw Error('PPT component mode helper boundary drifted')
  for (const [original, installed] of replacements) {
    if (source.split(installed).length !== 2) throw Error('PPT component mode installed renderer drifted')
    source = source.replace(installed, original)
  }
  return source.slice(0, first) + source.slice(last + end.length + 1) + suffix
}
export function patchComponentPptxMode(source) {
  source = stripComponentPptxMode(source)
  const metadata = source.indexOf('/* EWORK_GRID_RESTORE '), suffix = metadata < 0 ? '' : source.slice(metadata)
  if (metadata >= 0) source = source.slice(0, metadata)
  const definitions = begin + '\n' + [componentPptxModeHost, useComponentPptxMode, PptxComponentEditorHost].map(fn => fn.toString()).join('\n') + '\n' + end + '\n'
  const anchor = 'function ResearchCanvasOfficePreview('
  if (source.split(anchor).length !== 2) throw Error('PPT component Office renderer anchor drifted')
  source = source.replace(anchor, definitions + anchor)
  const replace = (before, after) => {
    if (source.includes(after)) return
    if (source.split(before).length !== 2) throw Error('PPT component renderer props drifted: ' + before.slice(0, 70))
    source = source.replace(before, after)
  }
  for (const [original, installed] of replacements) replace(original, installed)
  return source + suffix
}
