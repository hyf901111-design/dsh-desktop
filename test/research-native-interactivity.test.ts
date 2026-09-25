import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { derivedFixture } from './helpers/research-derived-fixture'

const requireModule = createRequire(import.meta.url)
const { act } = requireModule('react')

it('searches native table rows and sorts formatted numeric values without discarding source rows', async () => {
  const spec = { version: 1, type: 'table', title: '行业比较',
    columns: ['行业', '规模', '说明'], rows: [
      ['医药', '8亿', '防御'], ['科技', '5000万', '成长'], ['金融', '12亿', '稳定']
    ] }
  const f = await derivedFixture('generated-container', 1, { containerSpec: spec })
  try {
    const rows = () => [...f.host.querySelectorAll('[data-research-container-table] tbody tr')].map(row => row.textContent)
    const sort = f.host.querySelector('[aria-label="按规模排序"]')!
    await act(async () => sort.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(rows().map(row => row?.slice(0, 2))).toEqual(['科技', '医药', '金融'])
    await act(async () => sort.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(rows().map(row => row?.slice(0, 2))).toEqual(['金融', '医药', '科技'])
    const input = f.host.querySelector('[aria-label="搜索表格"]')!
    await act(async () => {
      (input as any).value = '科技'
      input.dispatchEvent(new f.browser.Event('input', { bubbles: true }))
      input.dispatchEvent(new f.browser.Event('change', { bubbles: true }))
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('科技')
    expect(f.host.querySelector('.odyssey-native-table-controls [role=status]')?.textContent).toBe('1 / 3 行')
    expect(f.workspace.getSnapshot().artifacts.find((node:any) => node.id === 'derived')?.containerSpec).toEqual(spec)
  } finally { await f.cleanup() }
})

it.each(['line', 'bar'])('selects %s data, toggles series and keeps the full data table', async variant => {
  const spec = { version: 1, type: 'chart', variant, title: '季度比较', labels: ['一季度', '二季度', '三季度'],
    series: [{ name: '甲', values: [10, 20, 30] }, { name: '乙', values: [12, 24, 36] }] }
  const f = await derivedFixture('generated-container', 1, { containerSpec: spec })
  try {
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('一季度 · 甲 10')
    const point = f.host.querySelector('[aria-label="二季度 · 乙 24"]')!
    await act(async () => point.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('二季度 · 乙 24')
    const legend = f.host.querySelector('.rScV5Q_chartLegend button:last-child')!
    await act(async () => legend.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(legend.getAttribute('aria-pressed')).toBe('false')
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('二季度 · 甲 20')
    const details = f.host.querySelector('.odyssey-native-chart-data')!
    expect(details.textContent).toContain('三季度')
    expect(details.textContent).toContain('36')
    expect(f.workspace.getSnapshot().artifacts.find((node:any) => node.id === 'derived')?.containerSpec).toEqual(spec)
  } finally { await f.cleanup() }
})
