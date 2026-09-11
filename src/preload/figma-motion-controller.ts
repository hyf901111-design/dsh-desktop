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

  const Observer = targetWindow?.MutationObserver ?? MutationObserver
  const observer = new Observer(scheduleReady)
  observer.observe(targetDocument.documentElement, { childList: true, subtree: true })
  scheduleReady()

  const dispose = () => {
    if (cancelled) return
    cancelled = true
    observer.disconnect()
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
