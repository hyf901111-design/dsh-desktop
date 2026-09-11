const handles = '.pI_x6G_handle[data-side="sidebar"], .t8lSSG_panelResize'

/** Observe native resize gestures; never change dimensions, store or capture. */
export function mountFigmaResizeFeedback(doc: Document): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  let handle: HTMLElement | null = null
  let pointer: number | null = null
  let pointerY = 0
  let frame = 0
  let overlay: HTMLDivElement | null = null
  let grip: HTMLDivElement | null = null
  let label: HTMLDivElement | null = null
  const clear = () => {
    win.cancelAnimationFrame(frame)
    frame = 0
    handle = null
    pointer = null
    overlay?.remove()
    overlay = grip = label = null
    delete doc.body.dataset.odysseyResizing
  }
  const draw = () => {
    frame = 0
    if (!handle?.isConnected) { clear(); return }
    const sidebar = handle.matches('.pI_x6G_handle')
    const surface = doc.querySelector<HTMLElement>(sidebar ? '.pI_x6G_sidebarCol' : '.t8lSSG_panel:not(.t8lSSG_panelHidden)')
    if (!surface) { clear(); return }
    const rect = surface.getBoundingClientRect()
    if (!rect.width || !rect.height) { clear(); return }
    if (!overlay) {
      overlay = doc.createElement('div')
      overlay.dataset.odysseyResizeFeedback = sidebar ? 'sidebar' : 'right'
      overlay.setAttribute('aria-hidden', 'true')
      grip = doc.createElement('div')
      grip.dataset.odysseyResizeGrip = ''
      overlay.append(grip)
      doc.body.append(overlay)
    }
    const top = rect.top + (sidebar ? 18 : 2)
    const height = Math.max(0, rect.height - (sidebar ? 36 : 4))
    overlay.style.left = `${sidebar ? rect.right : rect.left - 5}px`
    overlay.style.top = `${top}px`
    overlay.style.height = `${height}px`
    const gripHeight = sidebar ? 70 : 120
    grip!.style.top = `${Math.max(0, Math.min(height - gripHeight, pointerY - top - gripHeight / 2))}px`
    if (sidebar && pointer !== null) {
      if (!label) {
        label = doc.createElement('div')
        label.dataset.odysseyResizeWidth = ''
        overlay.append(label)
      }
      label.textContent = `${Math.round(rect.width)} px`
      label.style.top = `${Math.max(0, Math.min(height - 28, pointerY - top + 16))}px`
    }
    if (pointer !== null) frame = win.requestAnimationFrame(draw)
  }
  const match = (event: PointerEvent) => (event.target as Element | null)?.closest?.<HTMLElement>(handles) ?? null
  const over = (event: PointerEvent) => {
    if (pointer !== null) return
    const next = match(event)
    if (!next) return
    handle = next
    pointerY = event.clientY
    draw()
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return
    const next = match(event)
    if (!next) return
    clear()
    handle = next
    pointer = event.pointerId
    pointerY = event.clientY
    doc.body.dataset.odysseyResizing = ''
    frame = win.requestAnimationFrame(draw)
  }
  const move = (event: PointerEvent) => {
    if (pointer !== null && pointer !== event.pointerId) return
    pointerY = event.clientY
    if (pointer === null && handle) draw()
  }
  const out = (event: PointerEvent) => {
    if (pointer === null && handle && !handle.contains(event.relatedTarget as Node | null)) clear()
  }
  const end = (event: PointerEvent) => { if (pointer === event.pointerId) clear() }
  const visibility = () => { if (doc.hidden) clear() }
  doc.addEventListener('pointerover', over, true)
  doc.addEventListener('pointerout', out, true)
  doc.addEventListener('pointerdown', down, true)
  doc.addEventListener('pointermove', move, true)
  doc.addEventListener('pointerup', end, true)
  doc.addEventListener('pointercancel', end, true)
  doc.addEventListener('lostpointercapture', end, true)
  doc.addEventListener('visibilitychange', visibility)
  win.addEventListener('blur', clear)
  return () => {
    clear()
    doc.removeEventListener('pointerover', over, true)
    doc.removeEventListener('pointerout', out, true)
    doc.removeEventListener('pointerdown', down, true)
    doc.removeEventListener('pointermove', move, true)
    doc.removeEventListener('pointerup', end, true)
    doc.removeEventListener('pointercancel', end, true)
    doc.removeEventListener('lostpointercapture', end, true)
    doc.removeEventListener('visibilitychange', visibility)
    win.removeEventListener('blur', clear)
  }
}
