import { it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPriceVolume } from '../packages/dsh-research-task-runtime/market-price-volume.js'

const series = (step, length = 60) => ({
  labels: Array.from({ length }, (_, i) => new Date(Date.UTC(2026, 9, 11) + i * step).toISOString()),
  prices: Array.from({ length }, (_, i) => 100 + i), volumes: Array(length).fill(1), priceUnit: 'USD', volumeUnit: 'BTC'
})

it('uses actual minute intervals and slices the price and volume plots together', () => {
  const rendered = renderPriceVolume(series(60000))
  const dom = new JSDOM(rendered.body + '<script>' + rendered.script + '</script>', { runScripts: 'dangerously' })
  const d = dom.window.document, buttons = [...d.querySelectorAll('[data-price-volume-range]')]
  expect(buttons.map(b => b.textContent)).toEqual(['全部', '近15分钟', '近30分钟'])
  buttons.find(b => b.textContent === '近30分钟').click()
  expect(d.querySelector('.price-volume-line').getAttribute('points').split(' ')).toHaveLength(30)
  expect(d.querySelectorAll('.price-volume-bar')).toHaveLength(30)
  expect(JSON.parse(d.querySelector('svg').getAttribute('data-workbench-chart-view')).start).toBe(series(60000).labels[30])
  buttons[0].click()
  expect(d.querySelectorAll('.price-volume-bar')).toHaveLength(60)
  dom.window.close()
})

it('does not claim minute coverage for irregular records, and preserves existing daily ranges', () => {
  const irregular = series(60000); irregular.labels[20] = new Date(Date.parse(irregular.labels[20]) + 30000).toISOString()
  expect(renderPriceVolume(irregular).body).toContain('近15条')
  const daily = series(86400000, 61); daily.labels = daily.labels.map(x => x.slice(0, 10))
  expect(renderPriceVolume(daily).body).toContain('近1月')
  expect(renderPriceVolume(daily).body).toContain('近3月')
})
