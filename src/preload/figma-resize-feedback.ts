const handles = '.pI_x6G_handle[data-side="sidebar"], .t8lSSG_panelResize'

/** Observe native resize gestures; never change dimensions, store or capture. */
export function mountFigmaResizeFeedback(doc: Document): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  let handle: HTMLElement | null = null
  let pointer: number | null = null
  let frame = 0
  let overlay: HTMLDivElement | null = null
  let grip: HTMLDivElement | null = null
  const clear = () => {
    win.cancelAnimationFrame(frame)
    frame = 0
    handle = null
    pointer = null
    overlay?.remove()
    overlay = grip = null
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
    // Figma 194:360/1091: 536px at a 900px window, centered vertically.
    const height = Math.round(Math.min(rect.height, win.innerHeight) * 536 / 900)
    const top = rect.top + (rect.height - height) / 2
    overlay.style.left = `${sidebar ? rect.right : rect.left - 5}px`
    overlay.style.top = `${top}px`
    overlay.style.height = `${height}px`
    grip!.style.top = '0px'
    grip!.style.height = `${height}px`
    if (pointer !== null) frame = win.requestAnimationFrame(draw)
  }
  const match = (event: PointerEvent) => (event.target as Element | null)?.closest?.<HTMLElement>(handles) ?? null
  const over = (event: PointerEvent) => {
    if (pointer !== null) return
    const next = match(event)
    if (!next) return
    handle = next
    draw()
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return
    const next = match(event)
    if (!next) return
    clear()
    handle = next
    pointer = event.pointerId
    doc.body.dataset.odysseyResizing = ''
    frame = win.requestAnimationFrame(draw)
  }
  const move = (event: PointerEvent) => {
    if (pointer !== null && pointer !== event.pointerId) return
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
