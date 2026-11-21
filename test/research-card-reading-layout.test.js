import { expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'

const documentOf = artifact => {
  const accepted = JSON.parse(acceptArtifactOutput(JSON.stringify({ version: 1, ...artifact })))
  return new JSDOM(accepted.html).window.document
}
const flows = {
  type: 'chart', variant: 'groupedBar', title: '净流入扭转情况', unit: '百万美元',
  labels: ['零售', 'ETF', '机构主动', '机构指数', '现金管理'],
  series: [
    { name: '2024全年净流入', values: [24367, 390433, 64447, 9374, 152730] },
    { name: '2023全年净流入', values: [-8473, 185942, 87106, -55125, 79245] }
  ]
}

it('places exact prior-period exceptions first and retains every category in the grouped chart', () => {
  const doc = documentOf(flows)
  const ledger = doc.querySelector('figure').firstElementChild
  expect(ledger.className).toBe('chart-exceptions')
  expect([...ledger.querySelectorAll('li')].map(li => li.textContent)).toEqual([
    '零售2023-8,473→2024+24,367', '机构指数2023-55,125→2024+9,374'
  ])
  expect(ledger.textContent).toContain('百万美元')
  expect(doc.querySelector('svg line.chart-zero')).not.toBeNull()
  expect(doc.querySelectorAll('g[data-series="0"] rect[data-point]')).toHaveLength(5)
  const incomplete = { ...flows, series: [{ ...flows.series[0], values: [null, 390433, 64447, 0, 152730] }, flows.series[1]] }
  expect([...documentOf(incomplete).querySelectorAll('.chart-exceptions li')].map(el => el.textContent)).toEqual(['零售2023-8,473→2024未提供', '机构指数2023-55,125→20240'])
  expect(documentOf({ ...incomplete, title: '仅列出由负转正的类别' }).querySelector('.chart-exceptions')).toBeNull()
  for (const spec of [
    { ...flows, title: '分客户类型两年对比' },
    { ...flows, series: [flows.series[0], { ...flows.series[1], name: '2023年末AUM' }] }
  ]) expect(documentOf(spec).querySelector('.chart-exceptions')).toBeNull()
})

it('directly labels sparse observed rates while preserving precision independently of axis rounding', () => {
  const rates = {
    type: 'chart', variant: 'line', title: '美国10年期国债收益率', unit: '%', axisDecimals: 1,
    labels: ['2024-12-27', '2024-12-30', '2024-12-31'],
    series: [{ name: '10年期收益率', values: [4.62, 4.55, 4.58] }]
  }
  expect([...documentOf(rates).querySelectorAll('.observation-label')].map(el => el.textContent)).toEqual(['4.62', '4.55', '4.58'])
  const dated = documentOf({ ...rates, axisDecimals: undefined })
  const ticks = [...dated.querySelectorAll('svg text')].slice(0, 5)
  expect(ticks.map(el => el.textContent)).toEqual(['4.54', '4.56', '4.58', '4.60', '4.62'])
  const categories = [...dated.querySelectorAll('svg text')].filter(el => el.querySelector('title'))
  expect(categories.map(el => el.getAttribute('x'))).toEqual([...dated.querySelectorAll('g circle')].map(el => el.getAttribute('cx')))
  expect(documentOf({ ...rates, series: [...rates.series, { name: '另一期限', values: [4.62, 4.55, 4.58] }] }).querySelector('.observation-label')).toBeNull()
})

it('preserves declared field order and exact cents before the lookup controls on a short source table', () => {
  const dataset = {
    id: 'holdings', label: '披露持仓', asOf: '2025-12-31', note: '2025 年第四季度报告',
    fields: [{ key: 'id', label: '股票代码' }, { key: 'seq', label: '序号' }, { key: 'value', label: '公允价值（元）', minimumFractionDigits: 2 }],
    records: [{ id: '300308', seq: 4, value: 7984305860 }]
  }
  const view = { dataset: 'holdings', sections: [{ kind: 'records', fields: ['seq', 'id', 'value'] }] }
  const doc = documentOf({ type: 'view', title: '持仓逐项稽核', dataset, view })
  expect([...doc.querySelectorAll('th')].map(el => el.textContent)).toEqual(['序号', '股票代码', '公允价值（元）'])
  expect([...doc.querySelector('tbody tr').cells].map(el => el.textContent)).toEqual(['4', '300308', '7984305860.00'])
  expect(doc.querySelector('tbody .dv-identity').textContent).toBe('300308')
  expect(doc.querySelector('.dv-main').nextElementSibling.className).toBe('dv-toolbar')
})

it('gives a native source audit table the same record-first order and leaves live quote controls first', () => {
  const base = {
    type: 'market', variant: 'table', title: '原表核对', asOf: '2025-12-31',
    columns: ['序号', '股票代码', '公允价值（元）'], rows: [['4', '300308', '7984305860.00']]
  }
  const record = documentOf(base).querySelector('.market-table-wrap')
  expect(record.hasAttribute('data-audit-table')).toBe(true)
  expect(record.nextElementSibling.className).toBe('terminal-table-toolbar')
  expect(record.querySelector('tbody .market-audit-identity').textContent).toBe('300308')
  expect(record.querySelector('tbody tr').lastElementChild.textContent).toBe('7984305860.00')
  expect(documentOf({ ...base, title: '行情' }).querySelector('.market-table-wrap').previousElementSibling.className).toBe('terminal-table-toolbar')
})
