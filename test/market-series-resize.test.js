import { it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { compactHostDashboardHtml, researchInteractionVersion } from '../packages/dsh-research-task-runtime/html-artifact.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'

const labels = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 12, 1, i)).toISOString())
const prices = labels.map((_, i) => 83000.125 + i * 2)
const specs = {
  'price-volume': { labels, prices, volumes: labels.map((_, i) => i === 5 ? null : i / 10), priceUnit: 'USD', volumeUnit: 'BTC' },
  trend: { labels, series: [{ name: '价格', values: prices }, { name: '比较', values: prices.map(x => x - 4) }] },
  'valuation-band': { labels, values: prices, bands: { p10: 83010, p25: 83030, p50: 83050, p75: 83080, p90: 83100 }, unit: '倍' },
  'equity-drawdown': { labels, equity: prices, benchmark: prices.map(x => x + 2), unit: '元' }
}
const artifact = variant => JSON.parse(acceptArtifactOutput(JSON.stringify({ version: 1, type: 'market', variant, title: '原数据图表', asOf: '2026-10-12 UTC', ...specs[variant] })))
function mount(html, initial = [292, 180]) {
  let size = initial, frames = [], observers = []
  const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(w) {
    w.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: size[0], height: size[1], right: size[0], bottom: size[1] })
    w.requestAnimationFrame = callback => { frames.push(callback); return frames.length }
    w.cancelAnimationFrame = () => {}
    w.ResizeObserver = class { constructor(callback) { observers.push(callback) } observe() {} disconnect() {} }
  } })
  const flush = () => { const pending = frames; frames = []; pending.forEach(fn => fn()) }
  return { ...dom, dom, doc: dom.window.document, resize(next) { size = next; observers.forEach(fn => fn()); flush() }, close() { dom.window.close() } }
}

it.each(Object.keys(specs))('redraws %s at actual pixel dimensions without squeezing type or losing data and selection', variant => {
  const html = artifact(variant).html, view = mount(html), svg = view.doc.querySelector('svg')
  try {
    const rows = [...view.doc.querySelectorAll('tbody tr')].map(row => row.textContent)
    expect(svg.getAttribute('viewBox')).toBe('0 0 292 180')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    const ticks = [...svg.querySelectorAll('[data-series-date]')]
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.length).toBeLessThanOrEqual(3)
    expect(ticks.every(t => !t.firstChild.textContent.includes('T01:'))).toBe(true)
    expect(ticks[0].querySelector('title').textContent).toBe(labels[0])
    svg.dispatchEvent(new view.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    const selected = svg.dataset.selectedIndex, points = svg.querySelector('polyline').getAttribute('points')
    view.resize([960, 310])
    expect(svg.getAttribute('viewBox')).toBe('0 0 960 310')
    expect(svg.querySelector('polyline').getAttribute('points')).not.toBe(points)
    expect(svg.dataset.selectedIndex).toBe(selected)
    expect(svg.querySelectorAll('[data-series-date]').length).toBeGreaterThan(ticks.length)
    expect([...view.doc.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual(rows)
    expect(rows).toHaveLength(60)
    const rect = svg.querySelector('circle')
    expect(rect.getAttribute('r')).toBe('3')
    // Coordinates and hit testing use the resized plot, not the old 506-unit canvas.
    const end = Number(svg.querySelector('[data-series-date]:last-of-type')?.getAttribute('x')) || 952
    svg.dispatchEvent(new view.dom.window.MouseEvent('pointermove', { clientX: end }))
    expect(svg.dataset.selectedIndex).toBe('59')
    view.resize([292, 180])
    expect(svg.getAttribute('viewBox')).toBe('0 0 292 180')
    expect(svg.querySelector('polyline').getAttribute('points')).toBe(points)
  } finally { view.close() }
})

it('upgrades an already saved host price-volume chart while retaining its model, table and interaction routes', () => {
  const current = artifact('price-volume'), old = current.html.replace(/ data-series-viewport="v2"/g, '').replace(/<script>[^]*?<\/script>/, '<script>(function priceVolumeRuntime(labels,prices,volumes,priceUnit,volumeUnit){document.querySelector("svg").setAttribute("viewBox","0 0 506 164")})([],[],[],"USD","BTC");</script>')
  const upgraded = compactHostDashboardHtml(old)
  expect(upgraded).not.toBe(old)
  expect(readTemplateModel({ ...current, html: upgraded })).toEqual(readTemplateModel({ ...current, html: old }))
  expect(researchInteractionVersion(upgraded)).toBe(researchInteractionVersion(old))
  const a = new JSDOM(old), b = mount(upgraded)
  try {
    expect(b.doc.querySelector('svg').getAttribute('viewBox')).toBe('0 0 292 180')
    expect(b.doc.querySelector('tbody').textContent).toBe(a.window.document.querySelector('tbody').textContent)
    expect([...b.doc.querySelectorAll('button,summary')].map(x => x.textContent)).toEqual([...a.window.document.querySelectorAll('button,summary')].map(x => x.textContent))
    expect(compactHostDashboardHtml(upgraded)).toBe(upgraded)
  } finally { a.window.close(); b.close() }
})
