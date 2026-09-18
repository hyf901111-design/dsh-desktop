/** Fade scrolling rows out beneath the transparent sticky section headings. */
export function sidebarHeadingMask(top: number, height: number, headings: Array<{ top: number; bottom: number }>): string {
  const bands = headings.map(h => ({ start: h.top - top, end: h.bottom - top }))
    .filter(h => h.end > 0 && h.start < height).sort((a, b) => a.start - b.start)
  if (!bands.length || height <= 0) return ''
  const merged: typeof bands = []
  for (const band of bands) {
    const last = merged.at(-1)
    if (last && band.start <= last.end) last.end = Math.max(last.end, band.end)
    else merged.push({ ...band })
  }
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(height, n)) * 100) / 100
  const stops = ['#000 0px']
  for (const b of merged) stops.push(`#000 ${clamp(b.start)}px`, `transparent ${clamp(Math.min(b.start + 6, (b.start + b.end) / 2))}px`, `transparent ${clamp(Math.max(b.end - 6, (b.start + b.end) / 2))}px`, `#000 ${clamp(b.end)}px`)
  return `linear-gradient(to bottom, ${stops.join(', ')}, #000 100%)`
}
const installed = new WeakSet<Document>()
export function installSidebarScrollFade(doc: Document): void {
  if (installed.has(doc)) return
  installed.add(doc)
  const win = doc.defaultView!
  let frame = 0
  const observed = new Set<Element>()
  const roots = '[data-srb-navigation-scroll]'
  const lists = '.srb-board-list,[data-srb-workspace-list],.qDHVXG_list'
  const update = () => {
    frame = 0
    const targets = new Set<Element>()
    for (const root of doc.querySelectorAll<HTMLElement>(roots)) {
      targets.add(root)
      const headings = [...root.querySelectorAll<HTMLElement>('[data-srb-section-header]')]
      const bounds = headings.map(h => { targets.add(h); return h.getBoundingClientRect() }).filter(b => b.height > 0)
      for (const list of root.querySelectorAll<HTMLElement>(lists)) {
        // Nested list wrappers should not apply the same mask twice.
        if (list.parentElement?.closest(lists)) continue
        targets.add(list)
        const rect = list.getBoundingClientRect()
        const mask = sidebarHeadingMask(rect.top, rect.height, bounds)
        if (list.style.maskImage !== mask) list.style.maskImage = mask
      }
    }
    for (const old of observed) if (!targets.has(old)) { resize?.unobserve(old); observed.delete(old) }
    for (const target of targets) if (!observed.has(target)) { resize?.observe(target); observed.add(target) }
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update) }
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : undefined
  const observer = new win.MutationObserver(records => {
    if (records.some(r => (r.target as Element).closest?.(roots) || [...r.addedNodes].some(n => n instanceof win.Element && (n.matches(roots) || n.querySelector(roots))))) schedule()
  })
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  const scroll = (event: Event) => { if ((event.target as Element).matches?.(roots)) update() }
  // Native asynchronous wheel scrolling can paint a new offset before a JS mask.
  // Apply trackpad/mouse deltas and the mask atomically; OS momentum deltas remain intact.
  const wheel = (event: WheelEvent) => {
    const root = (event.target as Element).closest?.<HTMLElement>(roots)
    if (event.defaultPrevented || !root || event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || root.scrollHeight <= root.clientHeight) return
    event.preventDefault()
    if (frame) { win.cancelAnimationFrame(frame); frame = 0 }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1
    root.scrollTop = Math.max(0, Math.min(root.scrollHeight - root.clientHeight, root.scrollTop + event.deltaY * unit))
    update()
  }
  doc.addEventListener('wheel', wheel, { capture: true, passive: false })
  doc.addEventListener('scroll', scroll, true)
  win.addEventListener('resize', schedule)
  win.addEventListener('unload', () => { observer.disconnect(); resize?.disconnect(); doc.removeEventListener('wheel', wheel, true); doc.removeEventListener('scroll', scroll, true); win.removeEventListener('resize', schedule); if (frame) win.cancelAnimationFrame(frame) }, { once: true })
  schedule()
}
