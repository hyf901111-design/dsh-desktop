const mountedDocuments = new WeakMap<Document, () => void>()

/**
 * Arm CSS motion after Better Sidebar has produced its first stable geometry,
 * and pause the decorative home atmosphere while the document is hidden.
 * State changes, click handling, stores and animation reversal remain native.
 */
export function mountFigmaMotionController(targetDocument: Document = document): () => void {
  const mounted = mountedDocuments.get(targetDocument)
  if (mounted !== undefined) return mounted

  const targetWindow = targetDocument.defaultView
  let cancelled = false
  let firstFrame = 0
  let secondFrame = 0

  const syncHomeMotion = () => {
    targetDocument.documentElement.dataset.odysseyHomeMotion =
      targetDocument.visibilityState === 'hidden' ? 'paused' : 'running'
  }
  targetDocument.addEventListener('visibilitychange', syncHomeMotion)
  syncHomeMotion()

  const cancelFrame = (id: number) => {
    if (id === 0) return
    targetWindow?.cancelAnimationFrame(id)
  }

  const scheduleReady = () => {
    if (cancelled || firstFrame !== 0 || secondFrame !== 0 || targetDocument.documentElement.dataset.odysseyMotionReady === 'true') return
    if (targetDocument.querySelector('[data-dsh-panel-host]') === null) return
    const requestFrame = targetWindow?.requestAnimationFrame.bind(targetWindow)
    if (requestFrame === undefined) {
      targetDocument.documentElement.dataset.odysseyMotionReady = 'true'
      observer.disconnect()
      return
    }
    firstFrame = requestFrame(() => {
      firstFrame = 0
      secondFrame = requestFrame(() => {
        secondFrame = 0
        if (!cancelled) {
          targetDocument.documentElement.dataset.odysseyMotionReady = 'true'
          observer.disconnect()
        }
      })
    })
  }

  const syncPanelFocus = () => {
    const host = targetDocument.querySelector('[data-dsh-panel-host]')
    const panel = host?.querySelector<HTMLElement>('.t8lSSG_panel')
    if (!panel) return
    const closed = host?.getAttribute('data-odyssey-panel-right') !== 'open'
    if (closed && panel.contains(targetDocument.activeElement)) {
      host?.querySelector<HTMLElement>('[data-odyssey-panel-entry="right"]')?.focus({ preventScroll:true })
    }
    if (panel.inert !== closed) panel.inert = closed
  }
  const Observer = targetWindow?.MutationObserver ?? MutationObserver
  const panelFocusObserver = new Observer(syncPanelFocus)
  panelFocusObserver.observe(targetDocument.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['data-odyssey-panel-right'] })
  syncPanelFocus()
  const observer = new Observer(scheduleReady)
  observer.observe(targetDocument.documentElement, { childList: true, subtree: true })
  scheduleReady()

  const dispose = () => {
    if (cancelled) return
    cancelled = true
    observer.disconnect()
    panelFocusObserver.disconnect()
    targetDocument.querySelector<HTMLElement>('.t8lSSG_panel')?.removeAttribute('inert')
    targetDocument.removeEventListener('visibilitychange', syncHomeMotion)
    cancelFrame(firstFrame)
    cancelFrame(secondFrame)
    targetDocument.documentElement.removeAttribute('data-odyssey-motion-ready')
    targetDocument.documentElement.removeAttribute('data-odyssey-home-motion')
    mountedDocuments.delete(targetDocument)
  }
  mountedDocuments.set(targetDocument, dispose)
  return dispose
}
