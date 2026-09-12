import styles from './figma-task-scrollbar.css?raw'

/** S09 only: keep the native scrollable UL, replace its space-consuming gutter. */
export function mountFigmaTaskScrollbar(doc: Document): () => void {
  const win = doc.defaultView
  if (!win?.ResizeObserver) return () => {}
  const selector = '.lXshSW_root .odyssey-task-list-seat > .lXshSW_list'
  const excluded = '.odyssey-task-sheet, .t8lSSG_panelBody, [data-dsh-sidebar-root]'
  const style = doc.createElement('style')
  style.id = 'odyssey-task-scrollbar-style'
  style.textContent = styles
  doc.head.append(style)
  type Bar = { seat: HTMLElement; update: () => void; remove: () => void }
  const bars = new Map<HTMLElement, Bar>()
  let frame = 0, disposed = false
  const schedule = () => {
    if (!disposed && !frame) frame = win.requestAnimationFrame(refresh)
  }
  const resize = new win.ResizeObserver(schedule)
  function install(port: HTMLElement) {
    if (bars.has(port) || port.closest(excluded)) return
    const seat = port.parentElement!
    const track = doc.createElement('div'), thumb = doc.createElement('div')
    track.dataset.odysseyTaskScrollbar = ''
    track.setAttribute('aria-hidden', 'true')
    track.append(thumb)
    seat.append(track)
    seat.dataset.odysseyTaskScrollSeat = ''
    port.dataset.odysseyTaskScrollport = ''
    const addedTabIndex = !port.hasAttribute('tabindex')
    if (addedTabIndex) port.tabIndex = 0
    let pointer: number | null = null, startY = 0, startScroll = 0
    let max = 0, travel = 0, thumbHeight = 0
    const end = () => {
      const id = pointer
      pointer = null
      if (id !== null && track.hasPointerCapture(id)) track.releasePointerCapture(id)
    }
    function update() {
      const rect = port.getBoundingClientRect()
      max = Math.max(0, port.scrollHeight - port.clientHeight)
      track.hidden = max <= 1 || rect.width <= 0 || rect.height <= 0 ||
        !!port.closest('[hidden],[inert],[aria-hidden="true"],[data-odyssey-task-collapsed="true"]') ||
        win!.getComputedStyle(port).visibility === 'hidden'
      if (track.hidden) { end(); return }
      const height = Math.max(0, port.clientHeight - 8)
      // The seven-row Figma sample uses 112px. Longer lists shrink by ratio;
      // 24px is an implementation minimum, clamped to even tiny viewports.
      const minimum = Math.min(24, height / 2)
      thumbHeight = Math.min(height - minimum, Math.max(minimum, Math.min(112, height * port.clientHeight / port.scrollHeight)))
      travel = height - thumbHeight
      track.style.top = `${port.offsetTop + 4}px`
      track.style.height = `${height}px`
      thumb.style.height = `${thumbHeight}px`
      thumb.style.top = `${Math.max(0, Math.min(max, port.scrollTop)) / max * travel}px`
    }
    const scrollTo = (top: number) => { port.scrollTop = Math.max(0, Math.min(max, top)); update() }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      update()
      if (track.hidden) return
      event.preventDefault()
      event.stopPropagation()
      if (event.target !== thumb && travel > 0) {
        scrollTo((event.clientY - track.getBoundingClientRect().top - thumbHeight / 2) / travel * max)
      }
      pointer = event.pointerId
      startY = event.clientY
      startScroll = port.scrollTop
      track.setPointerCapture(pointer)
    }
    const move = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return
      update()
      if (pointer !== null && travel > 0) scrollTo(startScroll + (event.clientY - startY) / travel * max)
    }
    const finish = (event: PointerEvent) => { if (pointer === event.pointerId) end() }
    const wheel = (event: WheelEvent) => {
      update()
      if (track.hidden || !event.deltaY) return
      event.preventDefault()
      event.stopPropagation()
      const unit = event.deltaMode === 1 ? 28 : event.deltaMode === 2 ? port.clientHeight : 1
      scrollTo(port.scrollTop + event.deltaY * unit)
    }
    track.addEventListener('pointerdown', down)
    track.addEventListener('pointermove', move)
    track.addEventListener('pointerup', finish)
    track.addEventListener('pointercancel', finish)
    track.addEventListener('lostpointercapture', finish)
    track.addEventListener('wheel', wheel, { passive: false })
    port.addEventListener('scroll', update, { passive: true })
    resize.observe(port)
    resize.observe(seat)
    bars.set(port, { seat, update, remove: () => {
      end()
      port.removeEventListener('scroll', update)
      resize.unobserve(port)
      resize.unobserve(seat)
      track.remove()
      delete port.dataset.odysseyTaskScrollport
      delete seat.dataset.odysseyTaskScrollSeat
      if (addedTabIndex && port.getAttribute('tabindex') === '0') port.removeAttribute('tabindex')
    } })
    update()
  }
  function refresh() {
    frame = 0
    if (disposed) return
    for (const [port, bar] of bars) {
      if (!port.isConnected || !port.matches(selector) || port.parentElement !== bar.seat || port.closest(excluded)) {
        bar.remove(); bars.delete(port)
      } else bar.update()
    }
    doc.querySelectorAll<HTMLElement>(selector).forEach(install)
  }
  const mutations = new win.MutationObserver(records => {
    // Our own thumb position/visibility writes must not create a frame loop.
    if (records.some(record => !(record.target instanceof win.Element) || !record.target.closest('[data-odyssey-task-scrollbar]'))) schedule()
  })
  mutations.observe(doc.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden', 'data-odyssey-task-collapsed'] })
  refresh()
  return () => {
    if (disposed) return
    disposed = true
    win.cancelAnimationFrame(frame)
    mutations.disconnect()
    resize.disconnect()
    for (const bar of bars.values()) bar.remove()
    bars.clear()
    style.remove()
  }
}
