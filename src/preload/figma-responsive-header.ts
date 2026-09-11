/** Responsive rows are based on the actual header width left by the panel. */
export function mountFigmaResponsiveHeader(doc: Document): () => void {
  const win = doc.defaultView
  if (!win?.ResizeObserver) return () => {}
  const observed = new Set<HTMLElement>()
  const sync = (header: HTMLElement) => {
    // Research keeps its full backdrop and reserves the right panel with
    // padding, so the border box is not the width available to its controls.
    const style = win.getComputedStyle(header)
    const width = header.getBoundingClientRect().width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) + 40
    const layout = width < 440 ? 'narrow' : width < 640 ? 'stacked' : 'regular'
    if (header.dataset.odysseyHeaderLayout !== layout) header.dataset.odysseyHeaderLayout = layout
  }
  const resize = new win.ResizeObserver(entries => entries.forEach(entry => sync(entry.target as HTMLElement)))
  const scan = () => {
    for (const header of observed) if (!header.isConnected) { resize.unobserve(header); observed.delete(header) }
    for (const header of doc.querySelectorAll<HTMLElement>('.wSkVaW_header')) if (!observed.has(header)) {
      observed.add(header); resize.observe(header); sync(header)
    }
  }
  const mutations = new win.MutationObserver(scan)
  mutations.observe(doc.documentElement, { childList:true, subtree:true })
  scan()
  return () => { mutations.disconnect(); resize.disconnect(); observed.forEach(header => delete header.dataset.odysseyHeaderLayout) }
}
