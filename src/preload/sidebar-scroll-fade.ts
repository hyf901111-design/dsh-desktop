/** Fade scrolling rows out beneath the transparent sticky section headings. */
export function sidebarHeadingMask(top: number, height: number, headings: Array<{ top: number; bottom: number }>): string {
  const bands = headings.map(h => ({ start: h.top - top, end: h.bottom - top }))
    .filter(h => h.end > -12 && h.start < height + 12).sort((a, b) => a.start - b.start)
  if (!bands.length || height <= 0) return ''
  const merged: typeof bands = []
  for (const band of bands) {
    const last = merged.at(-1)
    if (last && band.start - 12 <= last.end + 12) last.end = Math.max(last.end, band.end)
    else merged.push({ ...band })
  }
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(height, n)) * 100) / 100
  const stops = ['#000 0px']
  for (const b of merged) stops.push(`#000 ${clamp(b.start - 12)}px`, `transparent ${clamp(b.start)}px`, `transparent ${clamp(b.end)}px`, `#000 ${clamp(b.end + 12)}px`)
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
  const scroll = (event: Event) => { if ((event.target as Element).matches?.(roots)) schedule() }
  doc.addEventListener('scroll', scroll, true)
  win.addEventListener('resize', schedule)
  win.addEventListener('unload', () => { observer.disconnect(); resize?.disconnect(); doc.removeEventListener('scroll', scroll, true); win.removeEventListener('resize', schedule); if (frame) win.cancelAnimationFrame(frame) }, { once: true })
  schedule()
}
