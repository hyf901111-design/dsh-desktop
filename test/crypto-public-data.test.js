import { describe, expect, it, vi } from 'vitest'
import { prepareRequest, createQueryClient } from '../skills/ework-free-data-sources/scripts/query.mjs'
import { createPublicDataClient } from '../packages/dsh-research-task-runtime/public-data-client.js'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { preparePublicDataPanel, validatePublicDataPanel } from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { materializeComponentMapping } from '../packages/dsh-research-task-runtime/component-data-refresh.js'

const panel = (parameters = { pair: 'XBTUSD', interval: 1, limit: 60 }) => ({
  title: '数字资产观察', type: 'market', size: 'large', prompt: '展示最新成交价及涨跌幅，保留真实口径',
  publicData: { profile: 'crypto-metrics', requests: [{ source: 'kraken-ticker', parameters_json: JSON.stringify(parameters) }], intervalMinutes: 1 }
})
const tickerBody = (pair, price, open = '100') => ({ error: [], result: { [pair]: {
  c: [String(price), '1'], a: ['112', '1', '1'], b: ['109', '1', '1'],
  h: ['115', '120'], l: ['90', '85'], v: ['0', '12.345678'], o: open
} } })
function clientFixture() {
  const fetcher = vi.fn(async endpoint => {
    const pair = new URL(endpoint).searchParams.get('pair')
    return new Response(JSON.stringify(tickerBody(pair === 'ETHUSD' ? 'XETHZUSD' : 'XXBTZUSD', pair === 'ETHUSD' ? 95 : 110)))
  })
  const queryClient = createQueryClient({ fetcher })
  return { fetcher, client: createPublicDataClient({ moduleLoader: async () => ({ prepareRequest, queryClient }) }) }
}

describe('Kraken component recipes', () => {
  it('canonicalizes misplaced candle metadata by source schema, retaining both pairs and the actual refresh policy', () => {
    const original = panel()
    original.publicData.requests.push({ source: 'kraken-ticker', parameters_json: JSON.stringify({ pair: 'ETHUSD', interval: 1, limit: 60 }) })
    const before = structuredClone(original)
    const result = validateWorkbench({ requestId: 'crypto-schema', title: '自选观察', panels: [original] }).panels[0]
    expect(result.publicData.requests.map(r => JSON.parse(r.parameters_json))).toEqual([{ pair: 'XBTUSD' }, { pair: 'ETHUSD' }])
    expect(result.publicData.intervalMinutes).toBe(1)
    expect(validatePublicDataPanel(result.publicData, 'market', { strictParameters: true })).toEqual(result.publicData)
    expect(validatePublicDataPanel({ ...original.publicData, intervalMinutes: 0 }, 'market').intervalMinutes).toBe(0)
    expect(original).toEqual(before)
    const history = { profile: 'price-volume', requests: [{ source: 'kraken-candles', parameters_json: original.publicData.requests[0].parameters_json }], intervalMinutes: 1 }
    expect(validatePublicDataPanel(history, 'market', { strictParameters: true })).toEqual(history)
  })

  it.each([
    { pair: 'XBTUSD', interval: '1', limit: 60 }, { pair: 'XBTUSD', interval: 2 },
    { pair: 'XBTUSD', limit: 101 }, { pair: 'XBTUSD', limit: '60' },
    { pair: 'XBTUSD', url: 'https://private.invalid' },
    { pair: 'XBTUSD', interval: 1, headers: { authorization: 'secret' } },
    { pair: 'XBTUSD', interval: 1, api_key: 'secret' }, { pair: 'XBTUSD', product: 'BTC-USD' },
    { pair: 'https://private.invalid', interval: 1 }, { pair: ['XBTUSD'], interval: 1 }
  ])('rejects unsafe or invalid metadata instead of dropping it: %o', parameters => {
    expect(() => validateWorkbench({ requestId: 'bad-crypto', title: '观察', panels: [panel(parameters)] })).toThrow()
  })

  it('still rejects candle-only parameters at the raw ticker boundary', async () => {
    const { client, fetcher } = clientFixture()
    await expect(client.query({ operation: 'query', source: 'kraken-ticker', parameters_json: panel().publicData.requests[0].parameters_json })).rejects.toThrow('不支持的参数')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not sanitize unsafe legacy parameters into an executable request', async () => {
    const { client, fetcher } = clientFixture()
    const original = panel({ pair: 'XBTUSD', interval: 1, limit: 60, url: 'https://private.invalid' })
    await expect(preparePublicDataPanel(original, client)).rejects.toThrow('不支持的参数')
    expect(fetcher).not.toHaveBeenCalled()
    expect(original.publicData.requests[0].parameters_json).toContain('https://private.invalid')
  })

  it('rejects duplicate pairs after canonicalization and validates actual candle parameters before acceptance', () => {
    const duplicate = panel()
    duplicate.publicData.requests.push({ source: 'kraken-ticker', parameters_json: '{"pair":"XBTUSD"}' })
    expect(() => validateWorkbench({ requestId: 'duplicate-pair', title: '观察', panels: [duplicate] })).toThrow('重复')
    for (const parameters of [{ pair: 'XBTUSD', interval: 2 }, { pair: 'XBTUSD', limit: 0 }, { pair: 'XBTUSD', interval: 1, headers: {} }]) {
      const history = { ...panel(), publicData: { profile: 'price-volume', requests: [{ source: 'kraken-candles', parameters_json: JSON.stringify(parameters) }], intervalMinutes: 5 } }
      expect(() => validateWorkbench({ requestId: 'invalid-history', title: '观察', panels: [history] })).toThrow()
    }
  })

  it('renders two observed recipes through the fixed adapter and persists only executable pair requests', async () => {
    const original = panel()
    original.publicData.requests.push({ source: 'kraken-ticker', parameters_json: '{"pair":"ETHUSD","interval":1,"limit":60}' })
    const { client, fetcher } = clientFixture()
    const result = await preparePublicDataPanel(original, client)
    expect(fetcher.mock.calls.map(([endpoint]) => [...new URL(endpoint).searchParams])).toEqual([[['pair', 'XBTUSD']], [['pair', 'ETHUSD']]])
    expect(result.recipe.requests.map(r => JSON.parse(r.args.parameters_json))).toEqual([{ pair: 'XBTUSD' }, { pair: 'ETHUSD' }])
    expect(result.recipe.intervalMinutes).toBe(1)
    const data = readTemplateModel(JSON.parse(result.output)).data
    expect(data.items).toHaveLength(12)
    expect(data.items.find(item => item.label === 'BTC 最近成交')).toMatchObject({ value: '110.00 USD', detail: '日内涨跌幅 10.00%（UTC 00:00 起）' })
    expect(data.items.find(item => item.label === 'ETH 最近成交')).toMatchObject({ value: '95.00 USD', detail: '日内涨跌幅 -5.00%（UTC 00:00 起）' })
    expect(data.asOf).toContain('报价时点未提供')
    expect(data.note).toContain('不等于滚动24h涨跌幅')
    const refresh = materializeComponentMapping(result.recipe.mapping, {
      q0: { sourceId: 'kraken-ticker', ...prepareRequest('kraken-ticker', { pair: 'XBTUSD' }).normalize(tickerBody('XXBTZUSD', 100)) },
      q1: { sourceId: 'kraken-ticker', ...prepareRequest('kraken-ticker', { pair: 'ETHUSD' }).normalize(tickerBody('XETHZUSD', 105)) }
    })
    expect(refresh.items.find(item => item.label === 'BTC 最近成交').detail).toBe('日内涨跌幅 0.00%（UTC 00:00 起）')
    expect(refresh.items.find(item => item.label === 'ETH 最近成交').detail).toBe('日内涨跌幅 5.00%（UTC 00:00 起）')
  })

  it.each([undefined, '0', '-1', 'invalid'])('keeps unavailable opening prices explicit without fabricating a percentage: %s', open => {
    const body = tickerBody('XXBTZUSD', 100, open)
    if (open === undefined) delete body.result.XXBTZUSD.o
    const record = prepareRequest('kraken-ticker', { pair: 'XBTUSD' }).normalize(body).records[0]
    expect(record.changePercentToday).toBeNull()
    expect(record.changeTodayDetail).toBe('日内涨跌幅：来源未提供有效UTC开盘价')
  })

  it('restores a failed durable recipe quietly and repairs its schema only on an explicit retry', async () => {
    const original = panel(), { client, fetcher } = clientFixture()
    const task = { taskId: 'old-failed-crypto', parentSessionId: 'p', canvasNodeId: 'price-card', kind: 'container', prompt: original.prompt,
      state: 'failed', createdAt: 1, lastSeq: 1, error: '存在不支持的参数；禁止传入任意URL、密钥或请求头',
      publicData: original.publicData, publicDataPrompt: original.prompt, title: original.title, type: original.type }
    const storage = { load: async () => ({ version: 1, tasks: [task] }), save: vi.fn(async () => {}) }
    const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }
    const runtime = new ResearchTaskRuntime({ adapter, storage, publicDataClient: client })
    try {
      await runtime.restore()
      expect(fetcher).not.toHaveBeenCalled()
      expect(runtime.inspect({ parentSessionId: 'p', taskId: task.taskId })).toMatchObject({ state: 'failed', error: task.error })
      const retry = await runtime.start({ parentSessionId: 'p', canvasNodeId: 'price-card', kind: 'container', prompt: original.prompt })
      await runtime.tasks.get(retry.taskId).runPromise
      expect(runtime.inspect({ parentSessionId: 'p', taskId: retry.taskId }).state).toBe('completed')
      expect(runtime.inspect({ parentSessionId: 'p', taskId: task.taskId })).toMatchObject({ state: 'failed', error: task.error })
      expect(adapter.start).not.toHaveBeenCalled()
      expect(adapter.bindData).toHaveBeenCalledOnce()
      expect(adapter.bindData.mock.calls[0][1].requests[0].args.parameters_json).toBe('{"pair":"XBTUSD"}')
    } finally { await runtime.dispose() }
  })
})
