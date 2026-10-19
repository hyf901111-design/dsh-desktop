import { describe, expect, it, vi } from 'vitest'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { preserveWorkbenchRefreshPreference } from '../packages/dsh-research-task-runtime/component-refresh-policy.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { componentPromptSource } from '../scripts/lib/figma-generation-client.mjs'

const spec = (profile, source, parameters = {}, type = 'market') => ({
  title: profile, type, size: 'large', prompt: '真实免费来源，每分钟自动刷新',
  publicData: { profile, requests: [{ source, parameters_json: JSON.stringify(parameters) }], intervalMinutes: 1 }
})
const quote = { sourceId: 'tencent-quotes', source: '腾讯财经', dataTime: '2026-10-09 16:15:00', units: {}, records: [
  { symbol: 'sh600519', code: '600519', name: '贵州茅台', price: 1263, priceUnit: 'CNY', changePercent: 0.57, open: 1255.42, high: 1282, low: 1255.42, time: '2026-10-09 16:15:00' }
] }
const news = { sourceId: 'sina-news', source: '新浪财经', dataTime: '2026-10-11T00:10:00Z', units: {}, records: [
  { title: '市场快讯', time: '2026-10-11T00:10:00Z', publisher: '', url: 'https://finance.sina.com.cn/news/test.shtml' }
] }
const candles = { sourceId: 'kraken-candles', source: 'Kraken', dataTime: '2026-10-11T00:11:00Z', units: { price: 'USD', volume: 'BTC' }, records: [
  { time: '2026-10-11T00:10:00Z', open: 10, high: 11, low: 9, close: 10.5, volume: 0 },
  { time: '2026-10-11T00:11:00Z', open: 10.5, high: 12, low: 10, close: 11, volume: 0.1 }
] }
const ticker = { sourceId: 'kraken-ticker', source: 'Kraken', dataTime: null, units: { price: 'USD', volume24h: 'BTC' }, records: [
  { pair: 'XXBTZUSD', price: 123.456, bid: 123, ask: 124, high24h: 125, low24h: 120, volume24h: 5.123456789, time: null }
] }
function runtime(query = vi.fn(async args => ({ 'tencent-quotes': quote, 'sina-news': news, 'kraken-candles': candles, 'kraken-ticker': ticker })[args.source])) {
  const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }, save = vi.fn(async () => {})
  const r = new ResearchTaskRuntime({ adapter, storage: { save }, publicDataClient: { query } })
  return { r, adapter, query, save }
}
async function settled(r, receipts) {
  await Promise.all(receipts.map(receipt => r.tasks.get(receipt.taskId).runPromise))
  return receipts.map(receipt => r.inspect({ parentSessionId: 'p', taskId: receipt.taskId }))
}

describe('宿主免费源工作台直通', () => {
  it('keeps the declarative source through validation without treating it as a snapshot', () => {
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const validated = validateWorkbench({ requestId: 'source', title: '行情', panels: [p] }).panels[0]
    expect(validated.publicData).toEqual(p.publicData)
    expect(validated.artifact).toBeUndefined()
    expect(validated.prompt).toContain('variant: table')
    for (const publicData of [
      { ...p.publicData, profile: 'unknown' },
      { ...p.publicData, requests: [{ source: 'arbitrary', parameters_json: '{}' }] },
      { ...p.publicData, requests: [{ source: 'tencent-quotes', parameters_json: '{}', url: 'https://private.test' }] },
      { ...p.publicData, intervalMinutes: -1 }
    ]) expect(() => validateWorkbench({ requestId: 'bad', title: '行情', panels: [{ ...p, publicData }] })).toThrow()
    expect(() => validateWorkbench({ requestId: 'minute-candle', title: '行情', panels: [spec('candlestick', 'kraken-candles', { pair: 'XBTUSD', interval: 1 })] })).toThrow()
    expect(() => validateWorkbench({ requestId: 'bad', title: '行情', dataMode: 'simulated', panels: [p] })).toThrow()
  })

  it('accepts the observed redundant refresh field, rejects conflicts and keeps direct manual intent authoritative', () => {
    const p = spec('crypto-metrics', 'kraken-ticker', { pair: 'XBTUSD' })
    const normalize = panel => validateWorkbench({ requestId: 'refresh-alias', title: '行情', panels: [panel] }).panels[0]
    expect(normalize({ ...p, intervalMinutes: 1 })).toEqual(normalize(p))
    const { intervalMinutes, ...publicData } = p.publicData
    expect(normalize({ ...p, publicData, intervalMinutes: 2 }).publicData.intervalMinutes).toBe(2)
    expect(() => normalize({ ...p, intervalMinutes: 2 })).toThrow('冲突')
    expect(() => normalize({ ...p, publicData, intervalMinutes: -1 })).toThrow()
    const manual = preserveWorkbenchRefreshPreference({ panels: [{ ...p, intervalMinutes: 1 }] }, '全部只手动刷新')
    expect(normalize(manual.panels[0]).publicData.intervalMinutes).toBe(0)
  })

  it('renders three panels and stores all minute recipes without any model call', async () => {
    const { r, adapter, query } = runtime()
    const panels = [spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] }), spec('price-volume', 'kraken-candles', { pair: 'XBTUSD', interval: 1, limit: 60 }), spec('news', 'sina-news', { limit: 12 }, 'news')]
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: panels.map((p, i) => ({ ...p, canvasNodeId: `n${i}` })) })
    const completed = await settled(r, receipts)
    expect(completed.map(t => t.state)).toEqual(['completed', 'completed', 'completed'])
    expect(adapter.start).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(3)
    expect(adapter.bindData).toHaveBeenCalledTimes(3)
    expect(adapter.bindData.mock.calls.every(c => c[1].intervalMinutes === 1 && c[1].requests[0].toolId === 'public_data_query')).toBe(true)
    expect(completed.map(t => readTemplateModel(JSON.parse(t.finalOutput)).templateId)).toEqual(['market.table', 'market.price-volume', 'news'])
    const data = adapter.bindData.mock.calls.map(c => readTemplateModel(JSON.parse(c[2])).data)
    expect(data[0].rows[0]).toContain('1263.00')
    expect(data[1]).toMatchObject({ prices: [10.5, 11], volumes: [0, 0.1], priceUnit: 'USD', volumeUnit: 'BTC' })
    expect(data[2].items[0]).toMatchObject({ category: '媒体未提供', url: news.records[0].url })
    await r.dispose()
  })

  it('isolates a failed source and a failed binding without calling a model or faking data', async () => {
    const { r, adapter } = runtime(vi.fn(async args => { if (args.source === 'sina-news') throw Error('SOURCE_UNAVAILABLE'); return quote }))
    adapter.bindData.mockImplementation(async task => { if (task.canvasNodeId === 'bind-failed') throw Error('WORKSPACE_DENIED') })
    const panels = [spec('quotes-table', 'tencent-quotes'), spec('news', 'sina-news', {}, 'news'), spec('quotes-metrics', 'tencent-quotes')]
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: panels.map((p, i) => ({ ...p, canvasNodeId: ['good', 'source-failed', 'bind-failed'][i] })) })
    const completed = await settled(r, receipts)
    expect(completed.map(t => t.state)).toEqual(['completed', 'failed', 'failed'])
    expect(completed[1].finalOutput).toBeUndefined()
    expect(completed[2].finalOutput).toBeUndefined()
    expect(adapter.start).not.toHaveBeenCalled()
    await r.dispose()
  })

  it('honors manual refresh and preserves unknown quote time and decimal precision', async () => {
    const { r, adapter } = runtime()
    const p = spec('crypto-metrics', 'kraken-ticker', { pair: 'XBTUSD' }); p.publicData.intervalMinutes = 0
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'ticker' }] })
    expect((await settled(r, receipts))[0].state).toBe('completed')
    const [, recipe, output] = adapter.bindData.mock.calls[0]
    const data = readTemplateModel(JSON.parse(output)).data
    expect(recipe.intervalMinutes).toBe(0)
    expect(data.asOf).toContain('报价时点未提供')
    expect(data.items.map(i => i.value)).toContain('123.46 USD')
    expect(data.items.map(i => i.value)).toContain('5.1235 BTC')
    await r.dispose()
  })

  it('bounds a ten-card batch to four source tasks and cancels without publishing or binding', async () => {
    let active = 0, peak = 0
    const query = vi.fn(async (_args, signal) => {
      active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5)); active--
      signal.throwIfAborted(); return quote
    })
    const { r, adapter } = runtime(query)
    const panels = Array.from({ length: 10 }, (_, i) => ({ ...spec('quotes-table', 'tencent-quotes'), canvasNodeId: `batch-${i}` }))
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels })
    await r.cancel({ parentSessionId: 'p', taskId: receipts[1].taskId })
    await vi.waitFor(() => expect(receipts.every(x => ['completed','cancelled'].includes(r.tasks.get(x.taskId).state))).toBe(true))
    expect(peak).toBeLessThanOrEqual(4)
    expect(adapter.bindData).toHaveBeenCalledTimes(9)
    expect(r.inspect({ parentSessionId: 'p', taskId: receipts[1].taskId }).finalOutput).toBeUndefined()
    await r.dispose()
  })

  it('preserves completed public-source tasks across restore, without rerunning any source or model', async () => {
    const { r, save } = runtime()
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'saved' }] })
    await settled(r, receipts)
    const document = save.mock.calls.at(-1)[0]
    const adapter = { start: vi.fn(), bindData: vi.fn() }, query = vi.fn()
    const restored = new ResearchTaskRuntime({ adapter, storage: { load: async () => document, save: async () => {} }, publicDataClient: { query } })
    await restored.restore()
    expect(restored.inspect({ parentSessionId: 'p', taskId: receipts[0].taskId }).state).toBe('completed')
    expect(query).not.toHaveBeenCalled(); expect(adapter.start).not.toHaveBeenCalled()
    expect(restored.tasks.get(receipts[0].taskId).publicData).toEqual(p.publicData)
    await r.dispose(); await restored.dispose()
  })

  it('retries an unchanged saved source component directly, while edited requirements still use the model path', async () => {
    const { r, adapter, query } = runtime()
    query.mockRejectedValueOnce(Error('SOURCE_UNAVAILABLE'))
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'retry', publicDataPrompt: p.prompt, prompt: '完整模板契约：' + p.prompt }] })
    expect((await settled(r, receipts))[0].state).toBe('failed')
    const retry = await r.start({ parentSessionId: 'p', canvasNodeId: 'retry', kind: 'container', prompt: p.prompt })
    expect((await settled(r, [retry]))[0].state).toBe('completed')
    expect(adapter.start).not.toHaveBeenCalled()
    expect(adapter.bindData).toHaveBeenCalledTimes(1)
    // A changed authored requirement must not silently retain the old query.
    adapter.start.mockResolvedValue({ childSessionId: 'edited', result: Promise.resolve({ output: [{ type: 'text', text: '新需求结果' }] }), dispose: async () => {} })
    const edited = await r.start({ parentSessionId: 'p', canvasNodeId: 'retry', kind: 'container', prompt: '只需整理我上传的资料，不再联网' })
    await settled(r, [edited])
    expect(adapter.start).toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(2)
    await r.dispose()
  })

  it('restores and retries source cards through the actual client size wrapper without launching a model', async () => {
    const original = runtime()
    original.query.mockRejectedValueOnce(Error('SOURCE_UNAVAILABLE'))
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    await settled(original.r, await original.r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'sized', publicDataPrompt: p.prompt, prompt: '完整模板契约：' + p.prompt }] }))
    const document = original.save.mock.calls.at(-1)[0]
    await original.r.dispose()
    const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }, query = vi.fn(async () => quote)
    const restored = new ResearchTaskRuntime({ adapter, storage: { load: async () => document, save: async () => {} }, publicDataClient: { query } })
    const wrap = runInNewContext('(' + componentPromptSource + ')', { researchComponentSize: () => 'large', RESEARCH_BENTO_SIZES: { large: { width: 656, height: 456 } } })
    try {
      await restored.restore()
      for (const node of [{ sizeMode: 'auto' }, { sizeMode: 'manual', x: 803.05, y: 171.7, width: 484.1, height: 319.4 }]) {
        const retry = await restored.start({ parentSessionId: 'p', canvasNodeId: 'sized', kind: 'container', prompt: wrap(node, p.prompt) })
        expect((await settled(restored, [retry]))[0].state).toBe('completed')
      }
      expect(adapter.start).not.toHaveBeenCalled(); expect(query).toHaveBeenCalledTimes(2)
      adapter.start.mockResolvedValue({ childSessionId: 'edited', result: Promise.resolve({ output: [{ type: 'text', text: '新需求结果' }] }), dispose: async () => {} })
      const edited = await restored.start({ parentSessionId: 'p', canvasNodeId: 'sized', kind: 'container', prompt: wrap({ sizeMode: 'auto' }, p.prompt + '\n不再联网，只用上传记录') })
      await settled(restored, [edited])
      expect(adapter.start).toHaveBeenCalledOnce(); expect(query).toHaveBeenCalledTimes(2)
    } finally { await restored.dispose() }
  })

  it('dispatches native source tasks once, rejects unavailable tools and no-network requests before creating a plan', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-workbench-'))
    let tool, allowed = false
    const ctx = { agents: { get: () => ({}) }, tools: { schemas: () => allowed ? [{ name: 'public_data_query' }] : [], register: t => { tool = t; return () => {} } }, webServer: { register: () => () => {} } }
    const start = vi.fn(), startPreparedBatch = vi.fn(), startPublicDataBatch = vi.fn(async ({ panels }) => panels.map(p => ({ taskId: 'task-' + p.canvasNodeId })))
    const dispose = await registerWorkbench(ctx, { start, startPreparedBatch, startPublicDataBatch }, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({}) })
    const args = { requestId: 'direct', title: '免费行情', panels: [spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })] }
    const exec = { agent: { session: { id: 'p', events: [{ type: 'user/message', data: { id: 'u', source: { kind: 'user' }, content: [{ type: 'text', text: '创建免费行情工作台，每分钟刷新' }] } }] } }, signal: new AbortController().signal }
    try {
      expect(tool.parameters.properties.panels.items.properties.intervalMinutes?.type).toBe('number')
      await expect(tool.execute(args, exec)).rejects.toThrow('未授权')
      const candleArgs={...args,requestId:'live-candle-permission',panels:[spec('candlestick','tencent-history',{symbol:'sh510300',limit:30})]}
      await expect(tool.execute(candleArgs,exec)).rejects.toThrow('未授权')
      allowed = true
      exec.agent.session.events[0].data.content[0].text = '禁止联网创建行情工作台'
      await expect(tool.execute(args, exec)).rejects.toThrow('未授权')
      await expect(tool.execute(candleArgs,exec)).rejects.toThrow('未授权')
      exec.agent.session.events[0].data.content[0].text = '创建免费行情工作台，每分钟刷新'
      const receipt = await tool.execute(args, exec)
      expect(receipt.status).toBe('accepted')
      expect((await tool.execute(args, exec)).planId).toBe(receipt.planId)
      expect(startPublicDataBatch).toHaveBeenCalledTimes(1)
      expect(start).not.toHaveBeenCalled(); expect(startPreparedBatch).not.toHaveBeenCalled()
      expect(JSON.parse(await readFile(join(dir, 'plans.json'), 'utf8'))).toHaveLength(1)
    } finally { dispose(); await rm(dir, { recursive: true, force: true }) }
  })
})
