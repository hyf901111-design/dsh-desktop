import { describe, expect, it, vi } from 'vitest'
import { registerWorkbenchExecutionPolicy, workbenchCreationRequest } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const session = (text, id = 'u') => ({ header: {}, events: [{ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })
const accepted = (s, isError = false) => s.events.push(
  { type: 'tool/call', data: { name: 'research_workbench_create', callId: 'create', arguments: { panels: [] } } },
  { type: 'tool/result', data: { message: { source: { callId: 'create' }, content: [{ type: 'tool-result', isError, content: [{ type: 'text', text: JSON.stringify({ planId: 'plan', status: 'accepted' }) }] }] } } }
)
function harness(efforts = ['low', 'high', 'max']) {
  const hooks = new Map(), resolveModelInfo = vi.fn(async () => ({ reasoning: { efforts: efforts.map(id => ({ id })) }, defaultMaxTokens: 16384 }))
  let prompt, selections = []
  registerWorkbenchExecutionPolicy({ get: name => name === 'settings' ? { get: () => ({ selections }) } : undefined, llm: { resolveModelInfo }, tools: { schemas: () => [] }, on: (name, fn) => { hooks.set(name, fn); return () => {} }, systemPrompt: { context: value => { prompt = value; return () => {} } } })
  return { hooks, resolveModelInfo, select: value => { selections = [value] }, text: agent => prompt.text({ agent }), request: (agent, config, signal) => hooks.get('agent/request')({ agent, signal }, async () => config) }
}
const config = Object.freeze({ provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 })

describe('工作台首次规划阶段预算', () => {
  it('limits only unaccepted creation and restores the explicit Max and output cap after acceptance', async () => {
    const h = harness(), agent = { session: session('创建活动筹备工作台，使用自洽模拟数据') }
    const planned = await h.request(agent, config)
    expect(planned).toEqual({ ...config, reasoningEffort: 'low', maxTokens: 4096 })
    expect(config).toEqual({ provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 })
    accepted(agent.session)
    // The loop can reconstruct the next seed from its last execution config.
    expect(await h.request(agent, { ...planned })).toEqual(config)
    expect(await h.request(agent, config)).toEqual(config)
    expect(h.text(agent)).toContain('已成功受理')
  })

  it('keeps failed planning bounded, stops on cancellation, and starts a new bounded phase for a new human request', async () => {
    const h = harness(), agent = { session: session('创建展览工作台，模拟数据') }
    const first = await h.request(agent, config)
    accepted(agent.session, true)
    expect(await h.request(agent, { ...first })).toEqual(first)
    agent.session.events.push(...session('取消，不再创建工作台', 'cancel').events)
    expect(await h.request(agent, { ...first })).toEqual(config)
    expect(h.text(agent)).toBe('')
    agent.session.events.push(...session('重新规划这个工作台，用模拟数据', 'again').events)
    expect(await h.request(agent, config)).toEqual(first)
  })

  it('leaves ordinary chat, existing-board edits, child sessions and unsupported effort declarations unchanged', async () => {
    const h = harness()
    for (const text of ['解释预算应该如何分配', '修改当前工作台的预算表', '在现有看板创建一个预算组件']) {
      const agent = { session: session(text) }
      expect(workbenchCreationRequest(agent.session)).toBeNull()
      expect(await h.request(agent, config)).toBe(config)
    }
    const child = { session: { ...session('创建活动工作台'), header: { origin: 'subagent' } } }
    expect(await h.request(child, config)).toBe(config)
    const unsupported = harness(['high', 'max'])
    expect(await unsupported.request({ session: session('创建活动工作台') }, config)).toBe(config)
    const minimal = harness(['minimal', 'max'])
    expect((await minimal.request({ session: session('创建活动工作台') }, { ...config, maxTokens: 2048 })).reasoningEffort).toBe('minimal')
    expect((await minimal.request({ session: session('创建活动工作台') }, { ...config, maxTokens: 2048 })).maxTokens).toBe(2048)
  })

  it('preserves a concurrent route/effort switch and does not continue a cancelled model lookup', async () => {
    const h = harness(), agent = { session: session('创建医疗器械活动工作台') }
    await h.request(agent, config)
    agent.session = session('停止创建，讨论一下计划', 'stop')
    const switched = { provider: 'other', model: 'selected', reasoningEffort: 'high', maxTokens: 8192 }
    expect(await h.request(agent, switched)).toEqual(switched)
    const controller = new AbortController(); controller.abort(Error('cancelled'))
    agent.session = session('创建物流工作台', 'next')
    await expect(h.request(agent, config, controller.signal)).rejects.toThrow('cancelled')
    h.resolveModelInfo.mockRejectedValueOnce(Error('unavailable'))
    expect(await h.request(agent, config)).toEqual(config)
  })

  it('recovers original controls after runtime recreation using bounded phase metadata, without storing request headers', async () => {
    const s = session('创建活动工作台，使用模拟数据')
    s.append = (type, data) => s.events.push({ type, data })
    const agent = { session: s }, before = harness()
    const limited = await before.request(agent, config)
    const record = s.events.find(event => event.type === 'sherlock/workbench-planning-budget')
    expect(record).toBeDefined()
    expect(Object.keys(record.data).sort()).toEqual(['limited', 'messageId', 'model', 'original', 'phase', 'provider', 'version'])
    expect(record.data.original).toEqual({ reasoningEffort: 'max', maxTokens: 16384 })
    expect(record.data.limited).toEqual({ reasoningEffort: 'low', maxTokens: 4096 })
    const after = harness()
    s.events.push(...session('取消，先讨论方案', 'cancel-after-restart').events)
    expect(await after.request(agent, { ...limited })).toEqual(config)
    expect(s.events.at(-1).data.phase).toBe('restored')
  })

  it('lets newer same-model Low or default selections win over the old Max even after restart', async () => {
    for (const reasoningEffort of ['low', undefined]) {
      for (const restart of [false, true]) {
        const s = session('创建活动工作台，模拟数据'); s.id = 'selected-session'
        s.append = (type, data) => s.events.push({ type, data })
        const agent = { session: s }, before = harness(), limited = await before.request(agent, config)
        const h = restart ? harness() : before
        h.select({ sessionId: s.id, provider: config.provider, model: config.model, ...(reasoningEffort ? { reasoningEffort } : {}) })
        s.events.push(...session('取消创建，讨论人员分配', 'switch').events)
        const seed = { ...limited }; if (reasoningEffort === undefined) delete seed.reasoningEffort
        const actual = await h.request(agent, seed)
        expect(actual.reasoningEffort).toBe(reasoningEffort)
        expect(actual.maxTokens).toBe(config.maxTokens)
      }
    }
  })

  it('plans diverse domains with a short metadata-first contract rather than complete sample arrays', () => {
    const h = harness()
    for (const domain of ['海边三天夜间艺术节', '研究生实验排期', '仓储配送', '社区义诊', '博物馆巡展']) {
      const text = h.text({ session: session(`创建${domain}工作台，用自洽模拟数据；需要排期、人员、物资、预算和风险预案。`) })
      expect(text.length).toBeLessThan(2200)
      expect(text).toContain('generationMode:"deferred"')
      expect(text).toContain('sharedContext')
      expect(text).toContain('立即调用 research_workbench_create')
      expect(text).not.toContain('market.pipeline')
      expect(text).not.toContain('首次调用必须同时附完整artifact')
    }
  })

  it('anchors relative dates to the host date while preserving explicitly requested fictional dates and actual interaction limits', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T12:00:00+08:00'))
    try {
      const text = harness().text({ session: session('创建三天活动工作台，允许模拟数据') })
      expect(text).toContain('2026-10-19')
      expect(text).toContain('用户明确指定')
      expect(text).toContain('跨卡自动执行')
      expect(text).toContain('冲突校验')
      expect(text).toContain('撤销')
      expect(text).not.toContain('2025-')
    } finally { vi.useRealTimers() }
  })

  it('shortens only the planning tool schema at the final request boundary without changing the prepared model config', async () => {
    const h = harness(), agent = { session: session('创建巡展工作台，用模拟数据') }
    const originalTool = Object.freeze({ name: 'research_workbench_create', description: '旧完整规范'.repeat(1000), parameters: { type: 'object', properties: { generationMode: { enum: ['parallel', 'deferred'] } } } })
    const other = { name: 'other', description: '其他工具', parameters: {} }
    const request = Object.freeze({ ...config, system: '现有系统要求', messages: [], tools: [originalTool, other] })
    const hook = h.hooks.get('agent/request-context')
    expect(hook).toBeTypeOf('function')
    const short = await hook({ agent }, async () => request)
    expect(short.tools[0].description.length).toBeLessThan(1500)
    expect(short.tools[0].description).toContain('deferred')
    expect(short.tools[0].parameters).toBe(originalTool.parameters)
    expect(short.tools[1]).toBe(other)
    expect(short.reasoningEffort).toBe('max')
    expect(short.maxTokens).toBe(16384)
    expect(originalTool.description.length).toBe(5000)
    accepted(agent.session)
    expect(await hook({ agent }, async () => request)).toBe(request)
  })
})
