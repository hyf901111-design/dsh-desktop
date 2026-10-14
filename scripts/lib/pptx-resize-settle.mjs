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
// IntersectionObserver delivers after paint. Fill the visible viewport in the
// scroll event, then render one nearby slide per frame so cold charts outside
// the viewport cannot delay the text the user has scrolled to.
export function createPptxScrollWindow(viewer, wrappers, mount, unmount, version) {
  const root = viewer.viewerOptions.scrollContainer ?? null
  const target = root ?? window
  let active = true, rootVisible = true, frame = null, nearby = []
  const stale = () => !active || viewer.isRenderStale(version)
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
    const box = root ? root.getBoundingClientRect() : {top: 0, bottom: window.innerHeight}
    const bounds = {top: Math.max(0, box.top), bottom: Math.min(window.innerHeight, box.bottom)}
    if (!rootVisible || bounds.bottom <= bounds.top) {
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
  target.addEventListener('scroll', update, {passive: true})
  const resize = window.ResizeObserver && root ? new window.ResizeObserver(update) : null
  resize?.observe(root)
  const intersection = new window.IntersectionObserver(update, {root, threshold: 0})
  // The list observer uses an explicit root and does not track that root moving
  // out of its enclosing note scroll area. Observe the viewport separately.
  const visibility = root ? new window.IntersectionObserver(entries => {
    rootVisible = entries[0]?.isIntersecting === true
    update()
  }) : null
  if (root) visibility.observe(root)
  return {
    observe(wrapper) { intersection.observe(wrapper) },
    disconnect() {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      target.removeEventListener('scroll', update)
      resize?.disconnect()
      intersection.disconnect()
      visibility?.disconnect()
      nearby = []
    }
  }
}

const marker = '/* sherlock:pptx-resize-settle:v4 */'
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
