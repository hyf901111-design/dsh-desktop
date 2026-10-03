// A flexing SVG with a fixed viewBox letterboxes in a tall card. Use its own
// aspect ratio and natural document flow so measurements don't feed that blank
// viewport height back into Arrange. Host templates keep their own geometry.
export function installWorkbenchNaturalCharts(root) {
  const doc = root.ownerDocument, win = doc.defaultView
  if (doc.body.hasAttribute('data-sherlock-market') || doc.body.hasAttribute('data-research-kind')) return () => {}
  const seen = new WeakSet()
  const scan = () => {
    let changed = false
    for (const svg of root.querySelectorAll('svg[viewBox]')) {
      if (seen.has(svg) || svg.closest('button,header,nav,.rScV5Q_mindMap')) continue
      const box = svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number), label = svg.getAttribute('aria-label') || ''
      const wrap = svg.closest('.chart-wrap,.chart-container,.chart-panel,[data-chart]')
      if (box.length !== 4 || !box.every(Number.isFinite) || box[2] < 240 || box[3] < 80 || box[2] / box[3] < 1.2 || (!wrap && !/图|chart|trend|price/i.test(label))) continue
      if (!svg.querySelector('path,polyline,circle,line,rect')) continue
      seen.add(svg); changed = true; svg.setAttribute('data-workbench-natural-chart', '')
      for (const [name, value] of Object.entries({ flex: '0 0 auto', width: '100%', height: 'auto', 'min-height': '0', 'aspect-ratio': box[2] + ' / ' + box[3] })) svg.style.setProperty(name, value, 'important')
      for (let el = svg.parentElement; el && el !== doc.body; el = el.parentElement) {
        const style = win.getComputedStyle(el)
        if (style.display !== 'flex' || style.flexDirection !== 'column') continue
        for (const [name, value] of Object.entries({ height: 'auto', 'min-height': '0', flex: '0 0 auto', 'justify-content': 'flex-start' })) el.style.setProperty(name, value, 'important')
      }
    }
    if (changed) win.dispatchEvent(new win.Event('sherlock-presentation-change'))
  }
  scan(); const observer = new win.MutationObserver(scan); observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
