import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { prepareRequest } from '../skills/ework-free-data-sources/scripts/query.mjs'

const original = JSON.parse(readFileSync(new URL('./fixtures/workbench-source-route-mismatch.json', import.meta.url), 'utf8'))
const firstPlan = () => structuredClone(original)
const validatePanel = panel => validateWorkbench({ requestId: 'route', title: '真实研究', dataMode: 'source', panels: [panel] }).panels[0]
const history = () => firstPlan().panels[1]
const scopedNews = () => firstPlan().panels.find(p => p.type === 'news')
const valuation = () => firstPlan().panels.find(p => p.type === 'financial-widget')

it('accepts the observed first plan without another full planning turn or changing its business scope', () => {
  const input = firstPlan(), plan = validateWorkbench(input)
  expect(plan.panels).toHaveLength(8)
  expect(plan.panels.map(p => p.type)).toEqual(['market', 'chart', 'chart', 'table', 'table', 'reports', 'news', 'calendar'])
  expect(plan.panels.filter(p => p.publicData)).toHaveLength(1)
  for (const index of [1, 2, 3, 6]) {
    const panel = plan.panels[index]
    expect(panel.artifact).toBeUndefined()
    expect(panel.publicData).toBeUndefined()
    expect(panel.prompt).toContain(input.panels[index].prompt)
  }
  for (const index of [1, 2]) {
    for (const request of input.panels[index].publicData.requests) {
      expect(plan.panels[index].prompt).toContain(request.parameters_json.replaceAll('"', '\\"'))
      expect(() => prepareRequest(request.source, JSON.parse(request.parameters_json))).not.toThrow()
    }
    expect(plan.panels[index].prompt).toContain('"intervalMinutes":5')
    expect(plan.panels[index].prompt).toContain('归一化')
    expect(plan.panels[index].prompt).toContain('共同基期100')
    expect(plan.panels[index].prompt).toContain('起点值×100')
    expect(plan.panels[index].prompt).toContain('分面或单系列')
    expect(plan.panels[index].prompt).toContain('禁止元与点直接同轴')
  }
  expect(plan.panels[3].prompt).toContain('table')
  expect(plan.panels[6].prompt).toContain('不得扩大为全市场新闻')
  expect(validateWorkbench(plan)).toEqual(plan)
  expect(input).toEqual(firstPlan())
})

it.each([
  { symbol: 'sz300308', limit: 20, url: 'https://private.test' },
  { symbol: 'sz300308', headers: { authorization: 'secret' } },
  { symbol: 'sz300308', api_key: 'secret' },
  { symbol: 'sz300308', query: 'other company' },
  { symbol: 'https://private.test', limit: 20 },
  { symbol: 'sz300308', limit: 101 },
  { symbol: 'sz300308', limit: '20' }
])('rejects unsafe or unsupported history parameters before route fallback: %o', parameters => {
  const panel = history(); panel.publicData.requests[0].parameters_json = JSON.stringify(parameters)
  expect(() => validatePanel(panel)).toThrow()
})

it('does not turn an unknown profile, source, shape, duplicate request or unsupported layout into a normal source task', () => {
  for (const mutate of [
    p => { p.publicData.profile = 'made-up' },
    p => { p.publicData.requests[0].source = 'private-provider' },
    p => { p.publicData.requests[0].url = 'https://private.test' },
    p => { p.publicData.requests.push(p.publicData.requests[0]) },
    p => { p.publicData.layoutProfile = 'made-up' },
    p => { p.publicData.layoutProfile = 'openterminal' },
    p => { p.publicData.requests = Array.from({ length: 9 }, (_, i) => ({ source: 'tencent-history', parameters_json: JSON.stringify({ symbol: `sz30030${i}`, limit: 20 }) })) }
  ]) { const panel = history(); mutate(panel); expect(() => validatePanel(panel)).toThrow() }
})

it('routes company and industry news with valid limit-only requests to a scoped source child, preserving the supported layout', () => {
  const panel = scopedNews(); panel.publicData.layoutProfile = 'openterminal'
  const result = validatePanel(panel)
  expect(result.publicData).toBeUndefined()
  expect(result.type).toBe('news')
  expect(result.prompt).toContain(panel.prompt)
  expect(result.prompt).toContain('"layoutProfile":"openterminal"')
  expect(result.prompt).toContain('artifact.layoutProfile')
  expect(result.prompt).toContain('"limit":12')
  expect(result.prompt).toContain('不得扩大为全市场新闻')
  for (const bad of [{ limit: 12, query: 'company' }, { limit: 12, url: 'https://private.test' }, { limit: 12, headers: {} }, { limit: 101 }]) {
    const next = scopedNews(); next.publicData.requests[0].parameters_json = JSON.stringify(bad)
    expect(() => validatePanel(next)).toThrow()
  }
  const broad = scopedNews(); broad.title = '财经要闻'; broad.prompt = '展示最新财经滚动资讯，保留时间与原文链接。'
  expect(validatePanel(broad).publicData).toEqual(broad.publicData)
})

it('corrects only a missing-config valuation widget and keeps invalid supplied native artifacts rejected', () => {
  const result = validatePanel(valuation())
  expect(result.type).toBe('table')
  expect(result.artifact).toBeUndefined()
  expect(result.prompt).toContain(valuation().prompt)
  const quote = { ...valuation(), title: '个股行情', prompt: '展示证券实时行情和K线' }
  expect(() => validatePanel(quote)).toThrow('artifact')
  expect(() => validatePanel({ ...valuation(), artifact: { version: 1, type: 'financial-widget', widget: 'quote', symbols: [{ code: 'https://private.test' }] } })).toThrow()
  expect(() => validateWorkbench({ requestId: 'simulation', title: '模拟', dataMode: 'simulated', panels: [valuation()] })).toThrow()
})

it('dispatches the mixed observed plan once, with scoped source children and the unchanged valid quote fast path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'source-route-plan-'))
  let tool
  const ctx = { agents: { get: () => ({}) }, tools: { schemas: () => [{ name: 'public_data_query' }], register: value => { tool = value; return () => {} } }, webServer: { register: () => () => {} } }
  const receipts = ({ panels }) => panels.map((p, i) => ({ taskId: p.canvasNodeId + '-' + i }))
  const runtime = { startBatch: vi.fn(async args => receipts(args)), startPublicDataBatch: vi.fn(async args => receipts(args)), startPreparedBatch: vi.fn() }
  const filePath = join(dir, 'plans.json'), dispose = await registerWorkbench(ctx, runtime, { filePath })
  const request = '创建中际旭创、新易盛、工业富联真实工作台，沪深300作基准；禁止模拟，保留来源、时间、单位及公司新闻范围。'
  const exec = { agent: { session: { id: 'p', events: [{ type: 'user/message', data: { id: 'u', source: { kind: 'user' }, content: [{ type: 'text', text: request }] } }] } } }
  try {
    const args = firstPlan(), result = await tool.execute(args, exec)
    expect(result.status).toBe('accepted')
    expect((await tool.execute(args, exec)).planId).toBe(result.planId)
    expect(runtime.startPublicDataBatch).toHaveBeenCalledOnce()
    expect(runtime.startPublicDataBatch.mock.calls[0][0].panels).toHaveLength(1)
    expect(runtime.startBatch).toHaveBeenCalledOnce()
    expect(runtime.startBatch.mock.calls[0][0].panels).toHaveLength(7)
    for (const child of runtime.startBatch.mock.calls[0][0].panels) expect(child.prompt).toContain(request)
    expect(runtime.startPreparedBatch).not.toHaveBeenCalled()
    const saved = JSON.parse(await readFile(filePath, 'utf8'))[0]
    expect(saved.input.originalRequest).toBe(request)
    expect(workbenchPanelPrompt(saved.input, saved.panels[6])).toContain('不得扩大为全市场新闻')
  } finally { await dispose(); await rm(dir, { recursive: true, force: true }) }
})
