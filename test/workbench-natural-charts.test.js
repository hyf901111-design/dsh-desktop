import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { installWorkbenchNaturalCharts } from '../packages/dsh-research-task-runtime/workbench-natural-charts.js'

it('removes flex letterboxing from a composite metric/line card while preserving SVG data and its aspect ratio', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<main style="height:100%;display:flex;flex-direction:column"><div>最新价 $83,148</div><section class="chart-wrap" style="display:flex;flex-direction:column;flex:1 1 0;min-height:180px"><h3>7日价格走势</h3><svg viewBox="0 0 520 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Bitcoin近7日价格走势图" style="flex:1 1 0;min-height:0"><path d="M40 50L90 80L140 60"/><text>09-29</text></svg></section><p>来源：CoinGecko</p></main>'
  const svg = doc.querySelector('svg'), data = svg.innerHTML, stop = installWorkbenchNaturalCharts(doc.documentElement)
  try {
    expect(svg.style.flex).toBe('0 0 auto'); expect(svg.style.height).toBe('auto'); expect(svg.style.aspectRatio).toBe('520 / 180')
    expect(doc.querySelector('main').style.height).toBe('auto'); expect(doc.querySelector('section').style.minHeight).toBe('0')
    expect(svg.innerHTML).toBe(data); expect(doc.body.textContent).toContain('$83,148')
    // A second load or an enlarged card cannot accumulate a scaling multiplier.
    const stopAgain = installWorkbenchNaturalCharts(doc.documentElement)
    expect(svg.style.aspectRatio).toBe('520 / 180'); expect(svg.getAttribute('viewBox')).toBe('0 0 520 180'); stopAgain()
  } finally { stop(); await win.happyDOM.close() }
})

it('keeps host chart geometry and non-chart diagrams unchanged', async () => {
  const win = new Window(), doc = win.document
  doc.body.setAttribute('data-sherlock-market', 'candlestick')
  doc.body.innerHTML = '<svg viewBox="0 0 520 180" aria-label="K线图" style="height:240px"><path d="M0 0L1 1"/></svg>'
  let stop = installWorkbenchNaturalCharts(doc.documentElement)
  expect(doc.querySelector('svg').style.height).toBe('240px'); stop()
  doc.body.removeAttribute('data-sherlock-market'); doc.querySelector('svg').removeAttribute('aria-label')
  stop = installWorkbenchNaturalCharts(doc.documentElement)
  expect(doc.querySelector('svg').style.height).toBe('240px'); stop(); await win.happyDOM.close()
})
