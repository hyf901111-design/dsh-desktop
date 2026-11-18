import { createRequire } from 'node:module'
import { beforeAll, expect, it } from 'vitest'
// @ts-expect-error The shared renderer fixture is JavaScript without type declarations.
import { financialClientFixture, prepareFinancialClientSource } from './helpers/financial-widget-client-fixture.js'

const requireModule = createRequire(import.meta.url)
const { act } = requireModule('react')

beforeAll(() => prepareFinancialClientSource({ refreshState: true }), 30000)

async function nativeFixture(spec: object) {
  const f = await financialClientFixture({}, { refreshState: true })
  await f.act(async () => {
    const node = f.workspace.createContainerDraft()
    f.workspace.setArtifacts([{ ...node, id: 'derived', containerPrompt: '比较资料', generationStatus: 'completed', generationLastSeq: 1, containerSpec: spec }])
    f.workspace.applyWorkbenchCells([{ id: 'derived', x: 0, y: 0, w: 26, h: 22 }], true)
  })
  return { browser: f.win, host: f.host, workspace: f.workspace, cleanup: f.dispose }
}

it('searches native table rows and sorts formatted numeric values without discarding source rows', async () => {
  const spec = { version: 1, type: 'table', title: '行业比较',
    columns: ['行业', '规模', '说明'], rows: [
      ['医药', '8亿', '防御'], ['科技', '5000万', '成长'], ['金融', '12亿', '稳定']
    ] }
  const f = await nativeFixture(spec)
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
  const f = await nativeFixture(spec)
  try {
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe(variant === 'line' ? '三季度 · 甲 30' : '一季度 · 甲 10')
    const scale = () => [...f.host.querySelectorAll('svg g .rScV5Q_chartLabel')].map(label => Number(label.textContent))
    const before = scale()
    expect(Math.min(...before)).toBe(variant === 'line' ? 10 : 0)
    const point = f.host.querySelector('[aria-label="二季度 · 乙 24"]')!
    await act(async () => point.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('二季度 · 乙 24')
    const legend = f.host.querySelector('.rScV5Q_chartLegend button:last-child')!
    await act(async () => legend.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
    expect(legend.getAttribute('aria-pressed')).toBe('false')
    expect(scale()).toEqual(before)
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('二季度 · 甲 20')
    const details = f.host.querySelector('.odyssey-native-chart-data')!
    expect(details.textContent).toContain('三季度')
    expect(details.textContent).toContain('36')
    expect(f.workspace.getSnapshot().artifacts.find((node:any) => node.id === 'derived')?.containerSpec).toEqual(spec)
    const updated={...spec,series:[{name:'甲',values:[11,21,31]},spec.series[1]]}
    await act(async()=>{
      f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map((node: any) => node.id === 'derived' ? {...node, containerSpec: updated} : node))
    })
    expect(f.host.querySelector('.rScV5Q_chartLegend button:last-child')?.getAttribute('aria-pressed')).toBe('false')
    expect(f.host.querySelector('.odyssey-native-chart-readout')?.textContent).toBe('二季度 · 甲 21')

  } finally { await f.cleanup() }
})
