/** Select single-row density from the main pane, independent of responsive padding. */
export function mountFigmaResponsiveHeader(doc: Document): () => void {
  const win = doc.defaultView
  if (!win?.ResizeObserver) return () => {}
  const observed = new Set<HTMLElement>()
  const sync = (header: HTMLElement) => {
    // Reading breakpoint-dependent padding here would oscillate at 480 px.
    const entryClearance = doc.querySelector('[data-odyssey-panel-right="closed"]') ? 36 : 0
    const width = header.getBoundingClientRect().width - entryClearance
    const layout = width < 480 ? 'narrow' : width < 640 ? 'compact' : 'regular'
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
