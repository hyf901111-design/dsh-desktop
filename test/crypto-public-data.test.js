import { describe, expect, it, vi } from 'vitest'
import { prepareRequest, createQueryClient } from '../skills/ework-free-data-sources/scripts/query.mjs'
import { createPublicDataClient } from '../packages/dsh-research-task-runtime/public-data-client.js'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { preparePublicDataPanel, validatePublicDataPanel } from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { materializeComponentMapping } from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import { isCryptoTickerRequest, normalizeCryptoTickerResult } from '../packages/dsh-research-task-runtime/crypto-source-results.js'

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
  it.each([
    ['SOLUSD','SOLUSD','SOL'], ['XRPUSD','XXRPZUSD','XRP'],
    ['DOGEUSD','XDGUSD','DOGE'], ['ADAUSD','ADAUSD','ADA'],
    ['LTCUSD','XLTCZUSD','LTC'], ['DOTUSD','DOTUSD','DOT']
  ])('preserves verified currency units for %s in quotes and candles', (pair, key, base) => {
    const result=prepareRequest('kraken-ticker',{pair}).normalize(tickerBody(key,0.073456));
    expect(result.units).toMatchObject({price:'USD',volume24h:base});
    const candle=prepareRequest('kraken-candles',{pair,interval:1440,limit:1}).normalize({error:[],result:{[key]:[[1700000000,'1','2','0.5','1.5','1','10',2]],last:1700000000}});
    expect(candle.units).toMatchObject({price:'USD',volume:base});
    const request={tool:'public_data_query',args:{operation:'query',source:'kraken-ticker',parameters_json:JSON.stringify({pair})}};
    const formatted=normalizeCryptoTickerResult(request,{status:'fulfilled',value:{sourceId:'kraken-ticker',...result}});
    expect(formatted.display.assetLabel).toBe(base);
    expect(formatted.display.price).toBe('0.073456 USD');
  });
  it('does not invent currency units for an unrecognized pair or accept a mismatched known pair',()=>{
    const result=prepareRequest('kraken-ticker',{pair:'UNKNOWNUSD'}).normalize(tickerBody('UNKNOWNUSD',1));
    expect(result.units.price).toBeUndefined();
    expect(result.units.volume24h).toBeUndefined();
    expect(()=>prepareRequest('kraken-ticker',{pair:'SOLUSD'}).normalize(tickerBody('XETHZUSD',1))).toThrow();
  });
  it.each([[1e-10,'1e-10 USD'],[0,'0.00 USD'],[0.999999999,'1 USD'],[0.00001234,'0.00001234 USD']])('keeps small quotes legible without rounding %s to zero', (price, expected)=>{
    const request={tool:'public_data_query',args:{operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"DOGEUSD"}'}};
    const value={sourceId:'kraken-ticker',...prepareRequest('kraken-ticker',{pair:'DOGEUSD'}).normalize(tickerBody('XDGUSD',price))};
    expect(normalizeCryptoTickerResult(request,{status:'fulfilled',value}).display.price).toBe(expected);
  });

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
    const raw = {
      q0: { sourceId: 'kraken-ticker', ...prepareRequest('kraken-ticker', { pair: 'XBTUSD' }).normalize(tickerBody('XXBTZUSD', 100)) },
      q1: { sourceId: 'kraken-ticker', ...prepareRequest('kraken-ticker', { pair: 'ETHUSD' }).normalize(tickerBody('XETHZUSD', 105)) }
    }
    const refresh = materializeComponentMapping(result.recipe.mapping, Object.fromEntries(result.recipe.requests.map(request => [request.key, normalizeCryptoTickerResult(request, { status: 'fulfilled', value: raw[request.key] })])))
    expect(refresh.items.find(item => item.label === 'BTC 最近成交').detail).toBe('日内涨跌幅 0.00%（UTC 00:00 起）')
    expect(refresh.items.find(item => item.label === 'ETH 最近成交').detail).toBe('日内涨跌幅 5.00%（UTC 00:00 起）')
  })

  it.each(['empty', 'error'])('retains compact metrics and a recoverable request for a missing pair: %s', async kind => {
    const original = panel({ pair: 'XBTUSD' })
    original.publicData.requests.push({ source: 'kraken-ticker', parameters_json: '{"pair":"ETHUSD"}' })
    const observed = { sourceId: 'kraken-ticker', source: 'Kraken', ...prepareRequest('kraken-ticker', { pair: 'XBTUSD' }).normalize(tickerBody('XXBTZUSD', 110)) }
    const missing = { sourceId: 'kraken-ticker', source: 'Kraken', records: [] }
    const query = vi.fn(async args => {
      if (JSON.parse(args.parameters_json).pair === 'XBTUSD') return observed
      if (kind === 'error') throw Object.assign(Error('provider failed'), { code: 'NETWORK_ERROR' })
      return missing
    })
    const result = await preparePublicDataPanel(original, { query })
    const data = readTemplateModel(JSON.parse(result.output)).data
    expect(data.variant).toBe('metrics')
    expect(data.items).toHaveLength(12)
    expect(data.items[0].value).toBe('110.00 USD')
    expect(data.items[6].value).toBe('本次未取得')
    expect(data.items[6].detail).toContain(kind === 'empty' ? '未返回' : '无法连接')
    expect(data.items.slice(7).every(item => item.value === '来源未提供')).toBe(true)
    expect(result.recipe.requests.map(request => JSON.parse(request.args.parameters_json).pair)).toEqual(['XBTUSD', 'ETHUSD'])
    const recovered = { sourceId: 'kraken-ticker', ...prepareRequest('kraken-ticker', { pair: 'ETHUSD' }).normalize(tickerBody('XETHZUSD', 105)) }
    const responses = Object.fromEntries(result.recipe.requests.map((request, i) => [request.key, normalizeCryptoTickerResult(request, { status: 'fulfilled', value: i ? recovered : observed })]))
    expect(responses.q1.records).toEqual(recovered.records)
    const refreshed = materializeComponentMapping(result.recipe.mapping, responses)
    expect(refreshed.items[6]).toMatchObject({ label: 'ETH 最近成交', value: '105.00 USD', detail: '日内涨跌幅 5.00%（UTC 00:00 起）' })
    expect(observed).not.toHaveProperty('display')
    expect(missing.records).toEqual([])
  })

  it('limits partial-source formatting to exact built-in pair requests and never creates quote records', () => {
    const request = { key: 'q', toolId: 'public_data_query', args: { operation: 'query', source: 'kraken-ticker', parameters_json: '{"pair":"XBTUSD"}' } }
    expect(isCryptoTickerRequest(request)).toBe(true)
    for (const changed of [{ ...request, toolId: 'untrusted' }, { ...request, args: { ...request.args, source: 'kraken-candles' } }, { ...request, args: { ...request.args, parameters_json: '{"pair":"XBTUSD","headers":{}}' } }]) {
      expect(isCryptoTickerRequest(changed)).toBe(false)
      expect(() => normalizeCryptoTickerResult(changed, { status: 'fulfilled', value: {} })).toThrow()
    }
    const missing = normalizeCryptoTickerResult(request, { status: 'rejected', reason: Object.assign(Error('private provider detail'), { code: 'NETWORK_ERROR' }) })
    expect(missing.records).toEqual([])
    expect(missing).not.toHaveProperty('receivedAt')
    expect(missing.display).toMatchObject({ pair: 'XBTUSD', price: '本次未取得', bid: '来源未提供' })
    expect(JSON.stringify(missing)).not.toContain('private provider detail')
    expect(() => normalizeCryptoTickerResult(request, { status: 'rejected', reason: Error('programming error') })).toThrow('programming error')
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
