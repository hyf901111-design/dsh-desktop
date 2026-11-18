import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { preserveWorkbenchRefreshPreference } from '../packages/dsh-research-task-runtime/component-refresh-policy.js'
import { registerWorkbenchExecutionPolicy } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const preset = { requestId: 'domestic-etf', title: '国内热门基金ETF行情研究工作台', dataMode: 'source', preset: 'cn-hot-etf-live', panels: [] }
const panel = { title: 'ETF明细', prompt: '真实ETF报价，每分钟刷新', type: 'market', size: 'large' }
const request = { source: 'tencent-quotes', parameters_json: '{"symbols":["sh510300"]}' }
const source = { profile: 'quotes-table', requests: [request], intervalMinutes: 1 }
const session = text => ({ header: {}, events: [{ type: 'user/message', data: { id: 'human', source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })

describe('实时国内ETF预设与声明参数', () => {
  it('expands one source preset into eight configured cards without invented observations', () => {
    const plan = validateWorkbench(preset)
    expect(plan.dataMode).toBe('source')
    expect(plan.title).toBe('国内热门基金ETF行情研究工作台')
    expect(plan.panels).toHaveLength(8)
    expect(plan.panels.filter(p => p.artifact).map(p => [p.artifact.type, p.artifact.widget])).toEqual([
      ['financial-widget', 'quote'], ['financial-widget', 'indices']
    ])
    expect(plan.panels[0].artifact.symbols).toEqual([{ code: '510300', market: 'SH', name: '沪深300ETF' }])
    expect(plan.panels.find(p => p.artifact?.widget === 'indices').artifact.symbols).toEqual([
      { code: '000001', market: 'SH', name: '上证指数' }, { code: '399001', market: 'SZ', name: '深证成指' },
      { code: '399006', market: 'SZ', name: '创业板指' }, { code: '000300', market: 'SH', name: '沪深300' }
    ])
    const direct = plan.panels.filter(p => p.publicData)
    expect(direct.map(p => p.publicData.profile)).toEqual(['quotes-table', 'quotes-metrics', 'price-volume', 'price-volume', 'price-volume'])
    const news = plan.panels.find(p => p.type === 'news')
    expect(news.publicData).toBeUndefined()
    expect(news.prompt).toContain(plan.title)
    expect(news.prompt).toContain('不得扩大为全市场新闻')
    const table = direct[0]
    expect(JSON.parse(table.publicData.requests[0].parameters_json).symbols).toEqual([
      'sh510300', 'sh510050', 'sh510500', 'sz159915', 'sh588000', 'sh512880', 'sh512480', 'sh512690', 'sh518880', 'sh513100'
    ])
    expect(direct.every(p => !p.artifact && p.publicData.intervalMinutes === 1)).toBe(true)
    expect(direct.filter(p => ['quotes-table', 'price-volume'].includes(p.publicData.profile)).every(p => p.publicData.layoutProfile === 'openterminal')).toBe(true)
    expect(direct.find(p => p.publicData.profile === 'quotes-metrics').publicData.layoutProfile).toBeUndefined()
    for (const p of direct) for (const r of p.publicData.requests) {
      const args = JSON.parse(r.parameters_json)
      if (r.source === 'tencent-quotes') expect(args.symbols.length).toBeLessThanOrEqual(12)
    }
    expect(validateWorkbench(plan)).toEqual(plan)
    for (const invalid of [{ ...preset, dataMode: 'simulated' }, { ...preset, panels: [panel] }])
      expect(() => validateWorkbench(invalid)).toThrow()
  })

  it('normalizes the observed flattened profile/requests before task dispatch and rejects conflicts', () => {
    const validate = p => validateWorkbench({ requestId: 'aliases', title: '行情', panels: [p] }).panels[0]
    expect(validate({ ...panel, ...source })).toEqual(validate({ ...panel, publicData: source }))
    expect(validate({ ...panel, publicData: source, ...source })).toEqual(validate({ ...panel, publicData: source }))
    expect(() => validate({ ...panel, publicData: source, profile: 'quotes-metrics', requests: [request] })).toThrow('冲突')
    expect(() => validate({ ...panel, profile: 'quotes-table' })).toThrow()
    expect(() => validate({ ...panel, requests: [request] })).toThrow()
  })

  it('retains a whole-board manual-only directive across preset expansion, including native widgets', () => {
    const plan = validateWorkbench(preserveWorkbenchRefreshPreference(preset, '生成国内热门基金ETF行情研究工作台，全部只手动刷新'))
    expect(plan.panels.filter(p => p.publicData).every(p => p.publicData.intervalMinutes === 0)).toBe(true)
    expect(plan.panels.filter(p => p.artifact).every(p => p.artifact.refreshMinutes === 0 && p.artifact.refreshEnabled === false)).toBe(true)
  })

  it('retains direct manual-only intent when the caller uses the flattened compatibility spelling', () => {
    const input = { requestId: 'flat-manual', title: '行情', panels: [{ ...panel, ...source }] }
    const plan = validateWorkbench(preserveWorkbenchRefreshPreference(input, '全部只手动刷新'))
    expect(plan.panels[0].publicData.intervalMinutes).toBe(0)
    expect(input.panels[0].intervalMinutes).toBe(1)
  })

  it('offers presets as an option and keeps narrow or offline ETF requests free of a fixed watchlist', () => {
    let prompt
    registerWorkbenchExecutionPolicy({ tools: { schemas: () => [{ name: 'public_data_query' }] }, systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    const text = request => prompt.text({ agent: { session: session(request) } })
    const initial = text('生成一个国内热门基金数据行情研究工作台')
    expect(initial).toContain('research_workbench_create')
    expect(initial).toContain('需求匹配时也可使用 library/publicData/preset')
    for (const narrower of ['生成一个国内热门基金数据行情研究工作台，只要4张卡', '创建沪深300ETF行情工作台', '生成一个模拟国内热门基金数据行情工作台', '禁止联网生成国内热门基金行情工作台', '生成国内热门基金行情工作台，每5分钟刷新', '根据上传记录生成国内热门基金行情工作台'])
      expect(text(narrower)).not.toContain('preset":"cn-hot-etf-live')
  })

  it('accepts the preset and preserves the requested symbols in nested and flattened custom plans at the tool boundary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'etf-preset-schema-'))
    let tool
    const ctx = { tools: { register: value => { tool = value; return () => {} } }, webServer: { register: () => () => {} } }
    const dispose = await registerWorkbench(ctx, {}, { filePath: join(dir, 'plans.json') })
    try {
      expect(validateJsonSchemaValue(tool.parameters, preset)).toEqual([])
      for (const custom of [{ ...panel, publicData: source }, { ...panel, ...source }]) {
        const call = { requestId: 'custom', title: '沪深300ETF行情', panels: [custom] }
        expect(validateJsonSchemaValue(tool.parameters, call)).toEqual([])
        const plan = validateWorkbench(call)
        expect(plan.panels).toHaveLength(1)
        expect(plan.panels[0].publicData.requests).toEqual([request])
      }
    } finally { dispose(); await rm(dir, { recursive: true, force: true }) }
  })

  it('prepares the five market-data cards with bound records and persisted layouts without a model launch', async () => {
    const query = vi.fn(async ({ source, parameters_json }) => {
      const p = JSON.parse(parameters_json)
      if (source === 'tencent-quotes') return { sourceId: source, source: '腾讯财经', dataTime: '2026-10-19 15:00:00', units: {}, records: p.symbols.map((symbol, i) => ({ symbol, code: symbol.slice(2), name: symbol, price: 1 + i / 10, priceUnit: 'CNY', changePercent: i, open: 1, high: 2, low: 0.9, time: '2026-10-19 15:00:00' })) }
      if (source === 'tencent-history') return { sourceId: source, source: '腾讯财经', dataTime: '2026-10-19', units: { price: 'CNY', volume: '手' }, records: [{ time: '2026-10-16', open: 1, high: 2, low: 0.9, close: 1.2, volume: 100 }, { time: '2026-10-19', open: 1.2, high: 2, low: 1.1, close: 1.5, volume: 0 }] }
      throw new Error('Unexpected market-data source: ' + source)
    })
    const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }
    const runtime = new ResearchTaskRuntime({ adapter, storage: { save: async () => {} }, publicDataClient: { query } })
    try {
      const panels = validateWorkbench(preset).panels.filter(p => p.publicData)
      const receipts = await runtime.startPublicDataBatch({ parentSessionId: 'p', panels: panels.map((p, i) => ({ ...p, canvasNodeId: `source-${i}` })) })
      await vi.waitFor(() => expect(receipts.map(r => runtime.inspect({ parentSessionId: 'p', taskId: r.taskId }).state)).toEqual(Array(5).fill('completed')))
      expect(adapter.start).not.toHaveBeenCalled()
      expect(query).toHaveBeenCalledTimes(5)
      expect(adapter.bindData).toHaveBeenCalledTimes(5)
      for (const [, recipe, output] of adapter.bindData.mock.calls) {
        expect(recipe.intervalMinutes).toBe(1)
        expect(recipe.requests[0].toolId).toBe('public_data_query')
        const model = readTemplateModel(JSON.parse(output))
        if (model.templateId !== 'market.metrics') {
          expect(model.data.layoutProfile).toBe('openterminal')
          expect(recipe.mapping.layoutProfile).toBe('openterminal')
        } else expect(model.data.layoutProfile).toBeUndefined()
      }
    } finally { await runtime.dispose() }
  })

  it('rejects unsupported live layout profiles before querying any source', () => {
    for (const publicData of [{ ...source, layoutProfile: 'unknown' }, { ...source, profile: 'quotes-metrics', layoutProfile: 'openterminal' }])
      expect(() => validateWorkbench({ requestId: 'unsupported-layout', title: '行情', panels: [{ ...panel, publicData }] })).toThrow()
  })
})
