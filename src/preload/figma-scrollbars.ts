/** Figma 17: fixed overlay thumbs, independent from document flow. */
export function mountFigmaScrollbars(doc: Document, alwaysShow = false): () => void {
  const win = doc.defaultView!
  if (!win?.ResizeObserver) return () => {}
  type Bar = { port: HTMLElement; track: HTMLDivElement; thumb: HTMLDivElement; until: number; dragging: boolean; update: () => void; remove: () => void }
  const bars = new Map<HTMLElement, Bar>()
  const scope = '[data-dsh-sidebar-root], .t8lSSG_panelBody'
  // The conversation has 16 px content padding; its thumb belongs to the
  // panel edge, not that inset text column. Nested previews retain their own edge.
  const rightEdge = (port: HTMLElement) => {
    const shell = port.closest<HTMLElement>('[data-dsh-sidebar-root]') ??
      (port.matches('.sRp_messages') ? port.closest<HTMLElement>('.t8lSSG_panel') : null)
    const shellRect = shell?.getBoundingClientRect()
    return shellRect?.width ? shellRect.right : port.getBoundingClientRect().right
  }
  let scheduled = 0, timer = 0, disposed = false
  const refresh = () => {
    scheduled = 0
    if (disposed) return
    for (const bar of bars.values()) {
      if (!bar.port.isConnected || !bar.port.closest(scope)) { bar.remove(); bars.delete(bar.port) }
      else bar.update()
    }
  }
  const schedule = () => { if (!scheduled) scheduled = win.requestAnimationFrame(refresh) }
  const resize = new win.ResizeObserver(schedule)
  const install = (port: HTMLElement) => {
    if (bars.has(port) || port.closest('.odyssey-scroll-track') || /^(TEXTAREA|INPUT)$/.test(port.tagName)) return
    const style = win.getComputedStyle(port)
    if (!/auto|scroll/.test(style.overflowY)) return
    const track = doc.createElement('div'), thumb = doc.createElement('div')
    track.className = 'odyssey-scroll-track'; track.setAttribute('aria-hidden', 'true')
    thumb.className = 'odyssey-scroll-thumb'; track.append(thumb); doc.body.append(track)
    port.dataset.odysseyScrollport = ''
    let startY = 0, startScroll = 0, ratio = 1
    const bar: Bar = { port, track, thumb, until: 0, dragging: false, update, remove }
    function update() {
      const r = port.getBoundingClientRect(), max = port.scrollHeight - port.clientHeight
      const visible = max > 1 && r.height > 0 && r.width > 0 && !port.closest('[aria-hidden=true],[inert]') && win.getComputedStyle(port).visibility !== 'hidden'
      track.hidden = !visible
      if (!visible) return
      const height = Math.max(32, r.height * port.clientHeight / port.scrollHeight)
      ratio = max / Math.max(1, r.height - height)
      track.style.left = `${rightEdge(port) - 12}px`; track.style.top = `${r.top}px`; track.style.height = `${r.height}px`
      thumb.style.height = `${height}px`; thumb.style.top = `${Math.max(0,Math.min(max,port.scrollTop)) / ratio}px`
      track.dataset.visible = String(alwaysShow || bar.dragging || track.matches(':hover') || Date.now() < bar.until)
    }
    function show() { bar.until = Date.now() + 700; update(); win.clearTimeout(timer); timer = win.setTimeout(schedule, 720) }
    function down(e: PointerEvent) {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation(); bar.dragging = true; track.dataset.dragging = 'true'
      if (e.target !== thumb) { port.scrollTop += (e.clientY - thumb.getBoundingClientRect().top - thumb.offsetHeight / 2) * ratio; update() }
      startY = e.clientY; startScroll = port.scrollTop; track.setPointerCapture(e.pointerId); show()
    }
    function move(e: PointerEvent) { if (bar.dragging) { port.scrollTop = startScroll + (e.clientY - startY) * ratio; update() } }
    function end(e: PointerEvent) { if (!bar.dragging) return; bar.dragging = false; delete track.dataset.dragging; if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId); show() }
    function remove() { port.removeEventListener('scroll', show); resize.unobserve(port); delete port.dataset.odysseyScrollport; track.remove() }
    track.addEventListener('pointerdown', down); track.addEventListener('pointermove', move)
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end); track.addEventListener('lostpointercapture', end)
    track.addEventListener('pointerenter', show); track.addEventListener('pointerleave', show)
    port.addEventListener('scroll', show, { passive: true }); resize.observe(port); bars.set(port, bar); update()
  }
  const scan = () => {
    for (const root of doc.querySelectorAll<HTMLElement>(scope)) {
      install(root)
      for (const port of root.querySelectorAll<HTMLElement>('div,section,ul,nav,main,article')) install(port)
    }
    // This state follows the existing empty/conversation projection without changing its draft.
    for (const panel of doc.querySelectorAll<HTMLElement>('.sRp_conversation')) {
      const composer = panel.querySelector<HTMLElement>('.sRp_composer')
      if (composer) composer.dataset.odysseyHasConversation = String(!panel.querySelector('.sRp_emptyState'))
    }
    schedule()
  }
  let scanTimer = 0
  const mutations = new win.MutationObserver(records => {
    if (!records.some(r => r.type === 'attributes' || !((r.target as Element).closest?.('.odyssey-scroll-track')) && [...r.addedNodes,...r.removedNodes].some(n => n.nodeType === 1 && !(n as Element).classList.contains('odyssey-scroll-track')))) { schedule(); return }
    if (!scanTimer) scanTimer = win.setTimeout(() => { scanTimer = 0; scan() }, 100)
  })
  const edge = (e: PointerEvent) => {
    for (const bar of bars.values()) {
      const r = bar.port.getBoundingClientRect()
      const edge = rightEdge(bar.port)
      if (e.clientX >= edge-12 && e.clientX <= edge && e.clientY >= r.top && e.clientY <= r.bottom) { bar.until = Date.now()+700; bar.update(); win.clearTimeout(timer); timer = win.setTimeout(schedule,720) }
    }
  }
  const blur = () => { for(const bar of bars.values()) { bar.dragging=false; delete bar.track.dataset.dragging } schedule() }
  mutations.observe(doc.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['data-odyssey-panel-right','aria-hidden'] })
  doc.addEventListener('pointermove', edge, { passive:true }); win.addEventListener('resize', schedule); win.addEventListener('blur', blur); doc.addEventListener('transitionend', schedule)
  doc.addEventListener('scroll', schedule, { capture:true, passive:true }); scan()
  return () => { disposed=true; mutations.disconnect(); resize.disconnect(); win.cancelAnimationFrame(scheduled); win.clearTimeout(timer); win.clearTimeout(scanTimer); doc.removeEventListener('pointermove',edge); doc.removeEventListener('scroll',schedule,true); win.removeEventListener('resize',schedule); win.removeEventListener('blur',blur); doc.removeEventListener('transitionend',schedule); for(const bar of bars.values())bar.remove(); bars.clear() }
}
