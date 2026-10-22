import { describe, expect, it, vi } from 'vitest'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { preparePublicDataPanel, publicDataPanelVariant, validatePublicDataPanel } from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { materializeComponentMapping } from '../packages/dsh-research-task-runtime/component-data-refresh.js'

const pairs = ['XBTUSD', 'ETHUSD', 'SOLUSD', 'DOGEUSD', 'LTCUSD', 'ADAUSD', 'DOTUSD', 'XRPUSD']
const cryptoPanel = count => ({ title: '自选资产快照', prompt: '保留全部观察对象、报价及盘口、日内变动和24h区间/成交量', type: 'market', size: 'large',
  publicData: { profile: 'crypto-metrics', requests: pairs.slice(0, count).map(pair => ({ source: 'kraken-ticker', parameters_json: JSON.stringify({ pair }) })), intervalMinutes: 1 } })
const response = (pair, i) => ({ sourceId: 'kraken-ticker', source: 'Kraken 公开报价', documentation: 'https://docs.kraken.com/api-reference/market-data/get-ticker-information',
  units: { price: 'USD', volume24h: pair.slice(0, -3) }, dataTime: null, receivedAt: `2026-10-22T07:00:0${i}Z`,
  records: [{ pair, price: 100 + i, bid: i === 2 ? null : 99 + i, ask: 101 + i, high24h: 120 + i, low24h: 80 + i,
    volume24h: i, changeTodayDetail: `日内涨跌幅 ${i === 0 ? '-1.00' : '0.00'}%（UTC 00:00 起）` }] })

describe('public-data presentation capacity', () => {
  it.each([3, 8])('organizes %i valid crypto pairs as a complete bound table instead of overflowing 12 metrics', async count => {
    const original = cryptoPanel(count), before = structuredClone(original)
    const panel = { ...original, publicData: validatePublicDataPanel(original.publicData, original.type, { strictParameters: true }) }
    expect(publicDataPanelVariant(panel.publicData)).toBe('table')
    expect(panel.publicData.requests).toHaveLength(count)
    expect(panel.publicData.intervalMinutes).toBe(1)
    expect(original).toEqual(before)
    const query = vi.fn(async args => response(JSON.parse(args.parameters_json).pair, pairs.indexOf(JSON.parse(args.parameters_json).pair)))
    const result = await preparePublicDataPanel(panel, { query })
    const model = readTemplateModel(JSON.parse(result.output))
    expect(model.templateId).toBe('market.table')
    const data = model.data
    expect(data.variant).toBe('table')
    expect(data.rows).toHaveLength(count)
    expect(data.columns).toHaveLength(12)
    expect(data.rows.every(row => row.length === data.columns.length)).toBe(true)
    expect(data.rows.map(row => row[0])).toEqual(pairs.slice(0, count))
    expect(data.rows[0]).toEqual(['XBTUSD', '100', '日内涨跌幅 -1.00%（UTC 00:00 起）', '99', '101', '120', '80', '0', 'USD', 'XBT', '来源未提供', '2026-10-22T07:00:00Z'])
    expect(data.rows[2][3]).toBe('来源未提供')
    expect(data.sources).toHaveLength(1)
    expect(data.sources.every(source => source.label === 'Kraken 公开报价')).toBe(true)
    expect(data.asOf).toContain('报价时点未提供')
    expect(result.recipe.requests).toHaveLength(count)
    expect(result.recipe.intervalMinutes).toBe(1)
    expect(query).toHaveBeenCalledTimes(count)
    const refreshResponses = Object.fromEntries(pairs.slice(0, count).map((pair, i) => [`q${i}`, response(pair, i)]))
    refreshResponses.q2.records[0].bid = 102
    refreshResponses.q0.records[0].volume24h = 10
    const refreshed = materializeComponentMapping(result.recipe.mapping, refreshResponses)
    expect(refreshed.rows[2][3]).toBe('102')
    expect(refreshed.rows[0][7]).toBe('10')
    expect(refreshed.rows.map(row => row[0])).toEqual(pairs.slice(0, count))
  })

  it('selects the adaptive table contract when a workbench plan accepts a larger watchlist', () => {
    for (const count of [3, 8]) {
      const planned = validateWorkbench({ requestId: `many-pairs-${count}`, title: '资产观察', panels: [cryptoPanel(count)] }).panels[0]
      expect(planned.prompt).toContain('variant: table')
      expect(planned.publicData.requests).toHaveLength(count)
      expect(planned.publicData.intervalMinutes).toBe(1)
    }
  })

  it('keeps compact 1–2 pair metrics and preserves manual refresh when a larger table is needed', async () => {
    for (const count of [1, 2]) {
      const panel = validateWorkbench({ requestId: `compact-${count}`, title: '观察', panels: [cryptoPanel(count)] }).panels[0]
      expect(publicDataPanelVariant(panel.publicData)).toBe('metrics')
    }
    const panel = cryptoPanel(3); panel.publicData.intervalMinutes = 0
    const result = await preparePublicDataPanel(panel, { query: async args => response(JSON.parse(args.parameters_json).pair, pairs.indexOf(JSON.parse(args.parameters_json).pair)) })
    expect(result.recipe.intervalMinutes).toBe(0)
    expect(readTemplateModel(JSON.parse(result.output)).data.rows).toHaveLength(3)
  })

  it('retains the existing eight-request binding budget and rejects malformed source intent', () => {
    const nine = cryptoPanel(8)
    nine.publicData.requests.push({ source: 'kraken-ticker', parameters_json: '{"pair":"AVAXUSD"}' })
    expect(() => validateWorkbench({ requestId: 'over-binding-budget', title: '观察', panels: [nine] })).toThrow()
    for (const extra of [{ url: 'https://private.invalid' }, { headers: {} }, { interval: '1' }]) {
      const panel = cryptoPanel(3)
      panel.publicData.requests[2].parameters_json = JSON.stringify({ pair: 'SOLUSD', ...extra })
      expect(() => validateWorkbench({ requestId: 'unsafe-large-panel', title: '观察', panels: [panel] })).toThrow()
    }
  })

  it('keeps all twelve legal quote metrics and routes requested extra fields through the existing table task', () => {
    const symbols = Array.from({ length: 12 }, (_, i) => 'sh' + String(600000 + i))
    const panel = { title: '完整报价观察', type: 'market', size: 'large', prompt: '每个标的的最新报价和涨跌幅',
      publicData: { profile: 'quotes-metrics', requests: [{ source: 'tencent-quotes', parameters_json: JSON.stringify({ symbols }) }], intervalMinutes: 7 } }
    const compact = validateWorkbench({ requestId: 'twelve-quotes', title: '观察', panels: [panel] }).panels[0]
    expect(publicDataPanelVariant(compact.publicData)).toBe('metrics')
    expect(JSON.parse(compact.publicData.requests[0].parameters_json).symbols).toEqual(symbols)
    const expanded = validateWorkbench({ requestId: 'extra-quote-fields', title: '观察', panels: [{ ...panel, prompt: panel.prompt + '，保留开盘、最高、最低、成交量、市盈率、市净率、市值' }] }).panels[0]
    expect(expanded.type).toBe('table')
    expect(expanded.publicData).toBeUndefined()
    for (const symbol of symbols) expect(expanded.prompt).toContain(symbol)
    expect(expanded.prompt).toContain('"intervalMinutes":7')
    expect(expanded.prompt).toContain('来源未提供')
  })
})
