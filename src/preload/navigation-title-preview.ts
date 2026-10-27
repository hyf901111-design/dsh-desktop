/** Shared, measured overflow preview for board and conversation navigation rows.
 * React owns the title spans; this controller only measures and animates them. */
export function mountNavigationTitlePreview(doc: Document): () => void {
  const win = doc.defaultView
  if (!win?.ResizeObserver) return () => {}
  const selector = '[data-dsh-sidebar-root] .odyssey-nav-title'
  const rowSelector = '.YDXeBa_sessionRow,.YDXeBa_projectRow'
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)')
  type Title = { port: HTMLElement; text: HTMLElement; row: HTMLElement; distance: number; delay: number; hovered: boolean; keyboardFocused: boolean; animation?: Animation }
  const titles = new Map<HTMLElement, Title>()
  let frame = 0, dragging = false, focused = true
  const active = (s: Title) => s.hovered || s.keyboardFocused
  const stop = (s: Title) => {
    win.clearTimeout(s.delay); s.delay = 0
    s.animation?.cancel(); s.animation = undefined
    delete s.port.dataset.odysseyTitlePreview
  }
  const start = (s: Title) => {
    if (s.distance <= 1 || s.delay || s.animation || motion.matches || doc.hidden || !focused || dragging ||
        s.row.matches('.YDXeBa_menuOpen,[data-menu-open=true]') || !active(s)) return
    s.delay = win.setTimeout(() => {
      s.delay = 0
      if (!s.port.isConnected || !active(s) || doc.hidden || motion.matches || !focused || dragging) return
      s.port.dataset.odysseyTitlePreview = 'moving'
      // Constant reading speed regardless of title length; stop at the final character.
      s.animation = s.text.animate([{ transform:'translateX(0)' }, { transform:`translateX(-${s.distance}px)` }],
        { duration:Math.max(1000, s.distance / 28 * 1000), easing:'linear', fill:'forwards' })
      s.animation.onfinish = () => { s.port.dataset.odysseyTitlePreview = 'end' }
    }, 500)
  }
  const measure = (s: Title) => {
    const distance = Math.max(0, s.text.scrollWidth - s.port.clientWidth)
    if (Math.abs(distance - s.distance) > 1) { stop(s); s.distance = distance }
    const overflow = String(distance > 1)
    if (s.port.dataset.odysseyTitleOverflow !== overflow) s.port.dataset.odysseyTitleOverflow = overflow
    if (s.port.clientWidth > 0) start(s)
    else stop(s)
  }
  const resize = new win.ResizeObserver(entries => {
    const changed = new Set(entries.map(entry => entry.target))
    // Read all affected dimensions before changing overflow attributes/animations.
    const measurements = [...titles.values()].filter(s => changed.has(s.port) || changed.has(s.text)).map(s => ({s, width:s.port.clientWidth, distance:Math.max(0,s.text.scrollWidth-s.port.clientWidth)}))
    for (const {s,width,distance} of measurements) {
      if (Math.abs(distance-s.distance)>1) {stop(s);s.distance=distance}
      const overflow=String(distance>1)
      if(s.port.dataset.odysseyTitleOverflow!==overflow)s.port.dataset.odysseyTitleOverflow=overflow
      if(width>0)start(s);else stop(s)
    }
  })
  const remove = (s: Title) => {
    stop(s); resize.unobserve(s.port); resize.unobserve(s.text)
    delete s.port.dataset.odysseyTitleOverflow; titles.delete(s.port)
  }
  const scan = () => {
    frame = 0
    for (const s of titles.values()) if (!s.port.isConnected || s.port.querySelector('.odyssey-nav-title-text') !== s.text) remove(s)
    for (const port of doc.querySelectorAll<HTMLElement>(selector)) {
      if (titles.has(port)) { measure(titles.get(port)!); continue }
      const text = port.querySelector<HTMLElement>('.odyssey-nav-title-text'), row = port.closest<HTMLElement>(rowSelector)
      if (!text || !row) continue
      const s: Title = { port, text, row, distance:0, delay:0, hovered:row.matches(':hover'), keyboardFocused:false }
      titles.set(port,s); resize.observe(port); resize.observe(text); measure(s)
    }
  }
  const mutations = new win.MutationObserver((records) => {
    // Streaming conversation text outside navigation must not remeasure every title.
    const navigationChanged = records.some(record => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
      return target?.closest('[data-dsh-sidebar-root]') || [...record.addedNodes].some(node =>
        node.nodeType === 1 && ((node as Element).matches('[data-dsh-sidebar-root]') || (node as Element).querySelector(selector)))
    })
    if (navigationChanged && !frame) frame = win.requestAnimationFrame(scan)
  })
  mutations.observe(doc.documentElement, { childList:true, characterData:true, subtree:true })
  const row = (target: EventTarget | null) => (target as Element | null)?.closest?.(rowSelector)
  const enter = (e: Event) => {
    const r = row(e.target)
    for (const s of titles.values()) if (s.row === r) {
      if (e.type === 'pointerover') s.hovered = true
      else s.keyboardFocused = (e.target as Element).matches(':focus-visible')
      start(s)
    }
  }
  const leave = (e: Event) => {
    const r = row(e.target), next = (e as MouseEvent | FocusEvent).relatedTarget as Node | null
    if (next && r?.contains(next)) return
    for (const s of titles.values()) if (s.row === r) {
      if (e.type === 'pointerout') s.hovered = false
      else s.keyboardFocused = false
      if (!active(s)) stop(s)
    }
  }
  const pause = () => { for (const s of titles.values()) stop(s) }
  const blur = () => { focused = false; pause() }
  const focus = () => { focused = true }
  const dragStart = (e: Event) => { if (row(e.target)) { dragging = true; pause() } }
  const dragEnd = () => { dragging = false }
  const visibility = () => { if (doc.hidden) pause() }
  const preference = () => { pause() }
  const events: [string, EventListener][] = [['pointerover',enter],['pointerout',leave],['focusin',enter],['focusout',leave],['dragstart',dragStart],['dragend',dragEnd],['visibilitychange',visibility]]
  events.forEach(([name,fn]) => doc.addEventListener(name,fn,true))
  win.addEventListener('blur',blur); win.addEventListener('focus',focus); motion.addEventListener('change',preference)
  scan()
  return () => {
    mutations.disconnect(); resize.disconnect(); win.cancelAnimationFrame(frame)
    for (const s of titles.values()) remove(s)
    events.forEach(([name,fn]) => doc.removeEventListener(name,fn,true))
    win.removeEventListener('blur',blur); win.removeEventListener('focus',focus); motion.removeEventListener('change',preference)
  }
}
