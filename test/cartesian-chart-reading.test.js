import { expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { cartesianChartSvg, renderCartesianChart } from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'

const sample = (values = [-13.64, -17.33, -30.81]) => ({ version: 1, type: 'chart', variant: 'horizontal', title: '区间表现', unit: '%', labels: ['沪深300', '中证500', '创业板指'], series: [{ name: '区间涨跌幅（%）', values }] })
const numericLabels = result => result.elements.filter(el => el.tag === 'text' && typeof el.children[0] === 'string').map(el => Number(el.children[0].replaceAll(',', '')))

it.each([[-13.64, -17.33, -30.81], [13.64, 17.33, 30.81], [-1.2, 2.9, 0], [0.000013, 0.000024, 0.000031], [0, 0, 0]])('uses readable equal ticks including zero and all original observations: %j', (...values) => {
  const spec = sample(values), before = JSON.stringify(spec), result = cartesianChartSvg(spec), ticks = numericLabels(result)
  expect(ticks).toHaveLength(5)
  expect(ticks[0]).toBeLessThanOrEqual(Math.min(0, ...values)); expect(ticks.at(-1)).toBeGreaterThanOrEqual(Math.max(0, ...values))
  for (let i = 2; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeCloseTo(ticks[1] - ticks[0], 12)
  expect(ticks.some(value => value === 0)).toBe(true)
  expect(result.elements.find(el => el.attributes['data-series'] === 0).children).toHaveLength(3)
  expect(JSON.stringify(spec)).toBe(before)
})

it('does not crowd the ranking axis with arithmetic fractions or change the domain on legend toggles', () => {
  expect(numericLabels(cartesianChartSvg(sample()))).toEqual([-40, -30, -20, -10, 0])
  const spec = { ...sample(), series: [...sample().series, { name: '另一组', values: [2, 20, 40] }] }
  expect(numericLabels(cartesianChartSvg(spec, 600, [true, false]))).toEqual(numericLabels(cartesianChartSvg(spec)))
})

it('shows a unit once in a selected value and header while retaining meaningful parentheses and precise records', () => {
  const spec = { ...sample(), series: [sample().series[0], { name: '收益（含分红）', values: [1.123456, 2, 3] }] }
  const dom = new JSDOM(renderCartesianChart(spec).html, { runScripts: 'dangerously', beforeParse(window) {
    window.ResizeObserver = class { observe() {} disconnect() {} }
  } })
  try {
    const doc = dom.window.document
    expect(doc.querySelector('.chart-readout').textContent).toBe('沪深300 · 区间涨跌幅 -13.64 % · 收益（含分红） 1.123456 %')
    expect([...doc.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(['分类', '区间涨跌幅（%）', '收益（含分红）（%）'])
    expect(doc.querySelector('tbody').textContent).toContain('1.123456')
    doc.querySelector('svg').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End' }))
    expect(doc.querySelector('.chart-readout').textContent).toContain('创业板指 · 区间涨跌幅 -30.81 %')
  } finally { dom.window.close() }
})
