/** Keep transient surfaces outside pane clipping without reparenting React-owned DOM. */
export function placeFloatingSurface(anchor: DOMRect, width: number, height: number, vw: number, vh: number, align: 'end' | 'center' = 'end') {
  const margin = 12, gap = 8
  const maxWidth = Math.max(0, vw - margin * 2), maxHeight = Math.max(0, vh - margin * 2)
  width = Math.min(width, maxWidth); height = Math.min(height, maxHeight)
  const above = anchor.top - gap - margin, below = vh - anchor.bottom - gap - margin
  const up = above >= height || above > below
  return {
    left: Math.max(margin, Math.min(align === 'end' ? anchor.right - width : anchor.left + anchor.width / 2 - width, vw - margin - width)),
    top: Math.max(margin, Math.min(up ? anchor.top - gap - height : anchor.bottom + gap, vh - margin - height)),
    maxWidth, maxHeight
  }
}

export function mountFloatingSurfaces(doc: Document) {
  const win = doc.defaultView!
  const customTriggers = '.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand,.srb-favorite-button,.srb-create-collaboration,[data-odyssey-board-directory]'
  const tracked = new Map<HTMLElement, HTMLElement | null>()
  let active: HTMLElement | null = null, frame = 0
  const style = doc.createElement('style')
  style.textContent = `
[data-odyssey-floating-surface]{position:fixed!important;inset:auto;margin:0!important;box-sizing:border-box}
[data-odyssey-floating-surface]::backdrop{background:transparent;pointer-events:none}
.JObwrW_panel[data-odyssey-floating-surface]{right:auto!important;bottom:auto!important;overflow:auto}
[role=tooltip][data-odyssey-floating-surface]{right:auto!important;bottom:auto!important;pointer-events:none;border:0!important;outline:none!important}
[data-odyssey-floating-tooltip]{width:max-content;max-width:calc(100vw - 24px);padding:5px 8px;border:0;border-radius:6px;background:var(--odyssey-menu,#fff);color:var(--odyssey-text,#292b2f);font:400 12px/18px var(--odyssey-font-ui,sans-serif);white-space:pre-line;overflow-wrap:anywhere;box-shadow:0 4px 12px #0002;transform:none!important}
${customTriggers.split(',').map(s => s + '[data-odyssey-floating-anchor]::after').join(',')}{content:none!important}
`
  doc.head.append(style)
  const bubble = doc.createElement('div')
  bubble.setAttribute('role', 'tooltip'); bubble.dataset.odysseyFloatingTooltip = ''
  bubble.setAttribute('popover', 'manual'); bubble.dataset.odysseyFloatingSurface = ''
  doc.body.append(bubble)

  function position(el: HTMLElement, anchor: HTMLElement, center = false) {
    const r = anchor.getBoundingClientRect()
    if (!anchor.isConnected || r.width === 0 || r.height === 0) { el.hidePopover(); return }
    const p = placeFloatingSurface(r, el.offsetWidth, el.offsetHeight, win.innerWidth, win.innerHeight, center ? 'center' : 'end')
    const values = { left: `${p.left}px`, top: `${p.top}px`, maxWidth: `${p.maxWidth}px`, maxHeight: `${p.maxHeight}px` }
    for (const [key, value] of Object.entries(values)) if (el.style[key as 'left'] !== value) el.style[key as 'left'] = value
  }
  function refresh() {
    frame = 0
    for (const [el, anchor] of tracked) {
      if (!el.isConnected) { resize.unobserve(el); if (anchor) resize.unobserve(anchor); tracked.delete(el); continue }
      if (anchor) position(el, anchor)
    }
    if (active) position(bubble, active, true)
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(refresh) }
  const resize = new win.ResizeObserver(schedule)
  function reconcile() {
    if (active && (!active.isConnected || active.getAttribute('aria-expanded') === 'true')) hide()
    doc.querySelectorAll<HTMLElement>(customTriggers).forEach(el => { if (!el.hasAttribute('data-odyssey-floating-anchor')) el.dataset.odysseyFloatingAnchor = '' })
    // Locally anchored tooltips already own their coordinates and clipping policy.
    doc.querySelectorAll<HTMLElement>('.JObwrW_panel,[role=tooltip]:not([data-odyssey-local-tooltip])').forEach(el => {
      if (el === bubble || tracked.has(el)) return
      const anchor = el.matches('.JObwrW_panel') ? el.closest('.JObwrW_root')?.querySelector<HTMLElement>('.JObwrW_trigger') ?? null : null
      if (el.matches('.JObwrW_panel') && !anchor) return
      el.dataset.odysseyFloatingSurface = ''; el.setAttribute('popover', 'manual')
      tracked.set(el, anchor)
      el.showPopover()
      if (anchor) { position(el, anchor); resize.observe(anchor) }
      resize.observe(el)
    })
    schedule()
  }
  function hide() { active = null; if (bubble.matches(':popover-open')) bubble.hidePopover() }
  function show(target: EventTarget | null) {
    const el = target instanceof win.Element ? target.closest<HTMLElement>(customTriggers) : null
    if (!el || el.getAttribute('aria-expanded') === 'true' || el.matches(':disabled')) { hide(); return }
    if (active === el) return
    hide(); active = el; bubble.textContent = el.hasAttribute('data-odyssey-board-directory') ? '此看板当前的文件目录\n' + el.getAttribute('data-odyssey-board-directory') : el.getAttribute('aria-label') ?? el.title
    if (!bubble.textContent) { hide(); return }
    bubble.showPopover(); position(bubble, el, true)
  }
  const over = (event: Event) => show(event.target)
  const out = (event: Event) => {
    const next = (event as MouseEvent).relatedTarget
    if (active && next instanceof win.Node && active.contains(next)) return
    hide()
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
  const observer = new win.MutationObserver(reconcile)
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] })
  doc.addEventListener('pointerover', over); doc.addEventListener('pointerout', out)
  doc.addEventListener('focusin', over); doc.addEventListener('focusout', out)
  doc.addEventListener('pointerdown', hide, true); doc.addEventListener('keydown', key)
  win.addEventListener('resize', schedule); doc.addEventListener('scroll', schedule, true)
  reconcile()
  return () => {
    observer.disconnect(); resize.disconnect(); if (frame) win.cancelAnimationFrame(frame)
    doc.removeEventListener('pointerover', over); doc.removeEventListener('pointerout', out)
    doc.removeEventListener('focusin', over); doc.removeEventListener('focusout', out)
    doc.removeEventListener('pointerdown', hide, true); doc.removeEventListener('keydown', key)
    win.removeEventListener('resize', schedule); doc.removeEventListener('scroll', schedule, true)
    for (const el of tracked.keys()) { if (el.matches(':popover-open')) el.hidePopover(); el.removeAttribute('popover'); delete el.dataset.odysseyFloatingSurface }
    doc.querySelectorAll<HTMLElement>('[data-odyssey-floating-anchor]').forEach(el => delete el.dataset.odysseyFloatingAnchor)
    hide(); bubble.remove(); style.remove()
  }
}
