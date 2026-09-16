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
const marker = '/* sherlock:pptx-resize-settle:v2 */'
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
}
export function patchPptxResize(source) {
  if (source.includes(marker)) return source
  source = stripPptxResizePatch(source)
  for (const anchor of [original, teardown, mount, unmount]) {
    if (source.split(anchor).length !== 2) throw Error('PPT resize anchors drifted')
  }
  return marker + '\n' + cancelPptxResize.toString() + '\n' + schedulePptxResize.toString() + '\n/* sherlock:pptx-resize-settle:end */\n' + source
    .replace(original, replacement).replace(teardown, cleanup)
    .replace(mount, scaledMount).replace(unmount, scaledUnmount)
}
