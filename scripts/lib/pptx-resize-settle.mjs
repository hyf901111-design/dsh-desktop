export function cancelPptxResize(viewer) {
  clearTimeout(viewer.sherlockResizeTimer)
  viewer.sherlockResizeTimer = undefined
}
export function schedulePptxResize(viewer) {
  cancelPptxResize(viewer)
  if (!viewer.presentation) return
  if (viewer.activeRenderMode === 'list') {
    // Slide content is rendered in presentation coordinates. Resize only its
    // viewport and compositor transform; never dispose/rebuild the slide tree.
    const { scale, displayWidth, displayHeight } = viewer.getDisplayMetrics()
    for (const item of viewer.container.querySelectorAll('[data-slide-index]')) {
      const wrapper = item.firstElementChild
      if (!wrapper) continue
      wrapper.style.width = `${displayWidth}px`
      wrapper.style.height = `${displayHeight}px`
      const slide = wrapper.firstElementChild
      if (slide) slide.style.transform = `scale(${scale})`
    }
    return
  }
  viewer.sherlockResizeTimer = setTimeout(() => {
    viewer.sherlockResizeTimer = undefined
    if (viewer.presentation) void viewer.queueRender()
  }, 160)
}
// Prepare cold wheel destinations before compositor scrolling. Scroll/IO still
// fill programmatic destinations, then warm one nearby slide per frame.
export function createPptxScrollWindow(viewer, wrappers, mount, unmount, version) {
  const root = viewer.viewerOptions.scrollContainer ?? null
  const target = root ?? window
  let active = true, frame = null, nearby = []
  const stale = () => !active || viewer.isRenderStale(version)
  const viewport = () => {
    const bounds = {left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight}
    for (let parent = root; parent; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent)
      const x = parent === root || /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow)
      const y = parent === root || /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow)
      if (!x && !y) continue
      const box = parent.getBoundingClientRect()
      const sx = parent.offsetWidth ? box.width / parent.offsetWidth : 1
      const sy = parent.offsetHeight ? box.height / parent.offsetHeight : 1
      const left = box.left + parent.clientLeft * sx, top = box.top + parent.clientTop * sy
      const right = left + (parent.offsetWidth ? parent.clientWidth * sx : box.width)
      const bottom = top + (parent.offsetHeight ? parent.clientHeight * sy : box.height)
      if (x) { bounds.left = Math.max(bounds.left, left); bounds.right = Math.min(bounds.right, right) }
      if (y) { bounds.top = Math.max(bounds.top, top); bounds.bottom = Math.min(bounds.bottom, bottom) }
    }
    return bounds
  }
  const warm = () => {
    frame = null
    if (stale()) return
    const index = nearby.shift()
    if (index !== undefined) mount(index)
    if (nearby.length) frame = requestAnimationFrame(warm)
  }
  const update = () => {
    if (stale()) return
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    const bounds = viewport()
    if (bounds.bottom <= bounds.top || bounds.right <= bounds.left) {
      nearby = []
      for (const index of [...viewer.mountedSlides]) unmount(index)
      return
    }
    const margin = (bounds.bottom - bounds.top) * viewer.listOptions.overscanViewport
    // Read all bounds together, before mounting changes the slide DOM.
    const ranges = wrappers.map((wrapper, index) => {
      const box = wrapper.getBoundingClientRect()
      const distance = Math.max(bounds.top - box.bottom, box.top - bounds.bottom, 0)
      return {index, distance, visible: box.bottom > bounds.top && box.top < bounds.bottom}
    }).filter(item => item.visible || item.distance < margin).sort((a, b) => a.distance - b.distance)
    for (const item of ranges) if (item.visible) mount(item.index)
    const keep = new Set(ranges.map(item => item.index))
    for (const index of [...viewer.mountedSlides]) if (!keep.has(index)) unmount(index)
    nearby = ranges.filter(item => !viewer.mountedSlides.has(item.index)).map(item => item.index)
    if (nearby.length) frame = requestAnimationFrame(warm)
  }
  const wheel = event => {
    if (!root || stale() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.deltaX || event.deltaMode !== 0 || !Number.isFinite(event.deltaY) || !event.deltaY) return
    // A replacement viewer shares the live scroller while preparing its hidden
    // tree. Only the live viewer may take ownership of a wheel event.
    if (viewer.container?.closest?.('[data-pptx-staging]')) return
    for (let element = event.target; element && element !== root; element = element.parentElement) {
      const style = window.getComputedStyle(element)
      if (element.scrollHeight > element.clientHeight && /^(auto|scroll)$/.test(style.overflowY || style.overflow)) return
    }
    const next = Math.max(0, Math.min(root.scrollHeight - root.clientHeight, root.scrollTop + event.deltaY))
    if (next === root.scrollTop) return
    const bounds = viewport()
    if (bounds.bottom <= bounds.top || bounds.right <= bounds.left) return
    const box = root.getBoundingClientRect(), scale = root.offsetHeight ? box.height / root.offsetHeight : 1
    const delta = (next - root.scrollTop) * scale
    const visible = wrappers.map((wrapper, index) => ({index, box: wrapper.getBoundingClientRect()}))
      .filter(item => item.box.bottom - delta > bounds.top && item.box.top - delta < bounds.bottom)
    if (!visible.some(item => !viewer.mountedSlides.has(item.index))) return
    for (const item of visible) mount(item.index)
    // Later momentum events may be noncancelable. Prepare their content, but
    // leave scrolling to the browser so the delta cannot be applied twice.
    if (stale() || !event.cancelable) return
    event.preventDefault()
    root.scrollTo({top: next, behavior: 'instant'})
    update()
  }
  target.addEventListener('scroll', update, {passive: true})
  if (root) root.addEventListener('wheel', wheel, {passive: false})
  const resize = window.ResizeObserver && root ? new window.ResizeObserver(update) : null
  resize?.observe(root)
  const intersection = new window.IntersectionObserver(update, {root, threshold: 0})
  // The list observer uses an explicit root and does not track that root moving
  // out of its enclosing note scroll area. Observe the viewport separately.
  // IO is only a wakeup: its queued visibility state may describe an old layout.
  const visibility = root ? new window.IntersectionObserver(update) : null
  if (root) visibility.observe(root)
  return {
    observe(wrapper) { intersection.observe(wrapper) },
    disconnect() {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      target.removeEventListener('scroll', update)
      if (root) root.removeEventListener('wheel', wheel)
      resize?.disconnect()
      intersection.disconnect()
      visibility?.disconnect()
      nearby = []
    }
  }
}

const marker = '/* sherlock:pptx-resize-settle:v5 */'
const windowOriginal = "const u = this.viewerOptions.scrollContainer ?? null, x = this.listOptions.overscanViewport, p = u ? u.clientHeight : window.innerHeight, g = new h((f) => {\n\t\t\t\t\t\tfor (const y of f) {\n\t\t\t\t\t\t\tconst m = y.target.parentElement, b = Number((m == null ? void 0 : m.dataset.slideIndex) ?? \"-1\");\n\t\t\t\t\t\t\tNumber.isNaN(b) || b < 0 || (y.isIntersecting ? l(b) : a(b));\n\t\t\t\t\t\t}\n\t\t\t\t\t}, {\n\t\t\t\t\t\troot: u,\n\t\t\t\t\t\trootMargin: `${Math.round(p * x)}px 0px`,\n\t\t\t\t\t\tthreshold: 0\n\t\t\t\t\t});"
const windowReplacement = 'const g = createPptxScrollWindow(this, c, l, a, s);'
const original = 'this.resizeRafId = null, this.queueRender();'
const replacement = 'this.resizeRafId = null, schedulePptxResize(this);'
const teardown = 'teardownAdaptiveResize() {'
const cleanup = 'teardownAdaptiveResize() { cancelPptxResize(this);'
const mount = 'mountListSlide(n, e, o, s, i) {'
const scaledMount = mount + '\n({ scale: o, displayWidth: s, displayHeight: i } = this.getDisplayMetrics());'
const unmount = 'unmountListSlide(n, e, o) {'
const scaledUnmount = unmount + '\no = this.getDisplayMetrics().displayHeight;'
export function stripPptxResizePatch(source) {
  const start = source.indexOf('/* sherlock:pptx-resize-settle:v')
  if (start < 0) return source
  const endMarker = '/* sherlock:pptx-resize-settle:end */'
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw Error('PPT resize patch end missing')
  return (source.slice(0, start) + source.slice(end + endMarker.length + 1))
    .replace(replacement, original).replace(cleanup, teardown)
    .replace(scaledMount, mount).replace(scaledUnmount, unmount)
    .replace(windowReplacement, windowOriginal)
}
export function patchPptxResize(source) {
  if (source.includes(marker)) return source
  source = stripPptxResizePatch(source)
  for (const anchor of [original, teardown, mount, unmount, windowOriginal]) {
    if (source.split(anchor).length !== 2) throw Error('PPT resize anchors drifted')
  }
  return marker + '\n' + cancelPptxResize.toString() + '\n' + schedulePptxResize.toString() + '\n' + createPptxScrollWindow.toString() + '\n/* sherlock:pptx-resize-settle:end */\n' + source
    .replace(original, replacement).replace(teardown, cleanup)
    .replace(mount, scaledMount).replace(unmount, scaledUnmount)
    .replace(windowOriginal, windowReplacement)
}
