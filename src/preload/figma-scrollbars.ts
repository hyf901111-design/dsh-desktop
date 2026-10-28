/** Figma 17: fixed overlay thumbs, independent from document flow. */
export function mountFigmaScrollbars(doc: Document, alwaysShow = false): () => void {
  const win = doc.defaultView!
  if (!win?.ResizeObserver) return () => {}
  type Bar = { port: HTMLElement; track: HTMLDivElement; thumb: HTMLDivElement; until: number; dragging: boolean; show: () => void; update: () => void; remove: () => void }
  const bars = new Map<HTMLElement, Bar>()
  const scope = '[data-dsh-sidebar-root], .t8lSSG_panelBody, .en-root, .ig-root'
  // The conversation has 16 px content padding; its thumb belongs to the
  // panel edge, not that inset text column. Nested previews retain their own edge.
  const rightEdge = (port: HTMLElement) => {
    // Settings is mounted in the sidebar footer, but its fixed surface has
    // independent navigation/content edges even when the main sidebar is 80px.
    if (port.closest('.VOzbGW_overlay')) return port.getBoundingClientRect().right
    const shell = port.closest<HTMLElement>('[data-dsh-sidebar-root]') ??
      (port.closest('.sRp_messages') && port.matches('.sRp_messages,.wSkVaW_scrollBody,.Md3f7G_scroll')
        ? port.closest<HTMLElement>('.t8lSSG_panel') : null)
    const shellRect = shell?.getBoundingClientRect()
    // The sidebar's navigation thumb must remain fully operable beside the
    // centered 12px width handle. Settings, nested previews and right panels
    // keep their own existing edge; the collapsed rail has no width handle.
    const sidebarInset = port.matches('[data-srb-navigation-scroll]') &&
      shell?.matches('[data-dsh-sidebar-root]') && doc.querySelector('.pI_x6G_handle[data-side="sidebar"]') ? 6 : 0
    return shellRect?.width ? shellRect.right - sidebarInset : port.getBoundingClientRect().right
  }
  let scheduled = 0, disposed = false, keyboardMode = false
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
    // Tables need their native horizontal thumb; overflow-x:auto computes overflow-y:auto too.
    if (port.closest('.odyssey-table-block,.odyssey-table-dialog')) return
    if (bars.has(port) || port.closest('.odyssey-scroll-track') || /^(TEXTAREA|INPUT)$/.test(port.tagName)) return
    const style = win.getComputedStyle(port)
    if (!/auto|scroll/.test(style.overflowY)) return
    const track = doc.createElement('div'), thumb = doc.createElement('div'), surface = port.closest<HTMLElement>('.ig-root')
    track.className = 'odyssey-scroll-track'; track.setAttribute('aria-hidden', 'true')
    // Plugin menus and dialogs must stay above their scrollbar inside the surface stack.
    if(surface){track.dataset.workspaceSurface='integrations';track.style.position='absolute';track.style.zIndex='1'}
    thumb.className = 'odyssey-scroll-thumb'; track.append(thumb); (surface || doc.body).append(track)
    port.dataset.odysseyScrollport = ''
    let startY = 0, startScroll = 0, ratio = 1, timer = 0
    const bar: Bar = { port, track, thumb, until: 0, dragging: false, show, update, remove }
    function update() {
      const r = port.getBoundingClientRect(), max = port.scrollHeight - port.clientHeight
      const visible = max > 1 && r.height > 0 && r.width > 0 && !port.closest('[aria-hidden=true],[inert]') && win.getComputedStyle(port).visibility !== 'hidden'
      if (track.hidden !== !visible) track.hidden = !visible
      if (!visible) return
      const height = Math.max(32, r.height * port.clientHeight / port.scrollHeight)
      ratio = max / Math.max(1, r.height - height)
      const origin=surface?.getBoundingClientRect()
      track.style.left = `${rightEdge(port) - 12 - (origin?.left || 0)}px`; track.style.top = `${r.top - (origin?.top || 0)}px`; track.style.height = `${r.height}px`
      thumb.style.height = `${height}px`; thumb.style.top = `${Math.max(0,Math.min(max,port.scrollTop)) / ratio}px`
      track.dataset.visible = String(alwaysShow || bar.dragging || track.matches(':hover') || (keyboardMode && port.contains(doc.activeElement)) || Date.now() < bar.until)
    }
    function show() { bar.until = Date.now() + 700; update(); win.clearTimeout(timer); timer = win.setTimeout(schedule, 700) }
    function down(e: PointerEvent) {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation(); bar.dragging = true; track.dataset.dragging = 'true'
      if (e.target !== thumb) { port.scrollTop += (e.clientY - thumb.getBoundingClientRect().top - thumb.offsetHeight / 2) * ratio; update() }
      startY = e.clientY; startScroll = port.scrollTop; track.setPointerCapture(e.pointerId); show()
    }
    function move(e: PointerEvent) { if (bar.dragging) { port.scrollTop = startScroll + (e.clientY - startY) * ratio; update() } }
    function end(e: PointerEvent) { if (!bar.dragging) return; bar.dragging = false; delete track.dataset.dragging; if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId); show() }
    function remove() { win.clearTimeout(timer); port.removeEventListener('focusin', show); port.removeEventListener('focusout', show); port.removeEventListener('scroll', show); resize.unobserve(port); delete port.dataset.odysseyScrollport; track.remove() }
    track.addEventListener('pointerdown', down); track.addEventListener('pointermove', move)
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end); track.addEventListener('lostpointercapture', end)
    track.addEventListener('pointerenter', show); track.addEventListener('pointerleave', show)
    // Focus can stay within a reader/list longer than the scroll feedback timeout.
    port.addEventListener('focusin', show); port.addEventListener('focusout', show)
    port.addEventListener('scroll', show, { passive: true }); resize.observe(port); bars.set(port, bar); update()
  }
  const scan = (roots: Iterable<HTMLElement> = doc.querySelectorAll<HTMLElement>(scope)) => {
    for (const root of roots) {
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
  const pendingRoots = new Set<HTMLElement>()
  const mutations = new win.MutationObserver(records => {
    for (const record of records) {
      // Overlay visibility is our output, never a reason to rescan every panel.
      if ((record.target as Element).closest?.('.odyssey-scroll-track')) continue
      if (record.type === 'attributes') for (const root of doc.querySelectorAll<HTMLElement>(scope)) pendingRoots.add(root)
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const element = node as HTMLElement
        if (element.closest('.odyssey-scroll-track')) continue
        if (element.matches(scope) || element.closest(scope)) pendingRoots.add(element)
        else for (const root of element.querySelectorAll<HTMLElement>(scope)) pendingRoots.add(root)
      }
    }
    if (pendingRoots.size || records.some(record => [...record.removedNodes].some(node => node.nodeType === 1 && !(node as Element).matches('.odyssey-scroll-track')))) schedule()
    if (pendingRoots.size && !scanTimer) scanTimer = win.setTimeout(() => {
      scanTimer = 0
      const roots = [...pendingRoots].filter(root => root.isConnected && ![...pendingRoots].some(parent => parent !== root && parent.contains(root)))
      pendingRoots.clear(); scan(roots)
    }, 100)
  })
  const edge = (e: PointerEvent) => {
    if (e.buttons || (e.target as Element)?.closest?.('[data-research-canvas]')) return
    for (const bar of bars.values()) {
      const r = bar.port.getBoundingClientRect()
      const edge = rightEdge(bar.port)
      if (e.clientX >= edge-12 && e.clientX <= edge && e.clientY >= r.top && e.clientY <= r.bottom) bar.show()
    }
  }
  // Pointer clicks may leave a link focused; only keyboard focus retains the thumb.
  const keyboard = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) { keyboardMode = true; schedule() } }
  const pointer = () => { keyboardMode = false; schedule() }
  const blur = () => { for(const bar of bars.values()) { bar.dragging=false; delete bar.track.dataset.dragging } schedule() }
  mutations.observe(doc.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['data-odyssey-panel-right','aria-hidden','data-settings-open','data-workspace-surface','hidden'] })
  doc.addEventListener('keydown', keyboard, true); doc.addEventListener('pointerdown', pointer, true)
  doc.addEventListener('pointermove', edge, { passive:true }); win.addEventListener('resize', schedule); win.addEventListener('blur', blur); doc.addEventListener('transitionend', schedule)
  doc.addEventListener('scroll', schedule, { capture:true, passive:true }); scan()
  return () => { disposed=true; mutations.disconnect(); resize.disconnect(); win.cancelAnimationFrame(scheduled); win.clearTimeout(scanTimer); doc.removeEventListener('keydown',keyboard,true); doc.removeEventListener('pointerdown',pointer,true); doc.removeEventListener('pointermove',edge); doc.removeEventListener('scroll',schedule,true); win.removeEventListener('resize',schedule); win.removeEventListener('blur',blur); doc.removeEventListener('transitionend',schedule); for(const bar of bars.values())bar.remove(); bars.clear() }
}
