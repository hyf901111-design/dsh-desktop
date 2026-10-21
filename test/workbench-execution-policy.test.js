import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { glmReasoningEntry, patchGlmReasoningCapabilities } from '../scripts/lib/glm-reasoning-capabilities.mjs'
import { registerWorkbenchExecutionPolicy, workbenchCreationRequest } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const session = text => ({ header: {}, events: [{ type: 'user/message', data: { id: 'human', source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })
afterEach(() => vi.unstubAllGlobals())
describe('workbench execution policy', () => {
  it('uses the short host data-source path only for authorized supported finance plans', () => {
    let prompt
    const ctx = { tools: { schemas: () => [{ name: 'public_data_query' }] }, systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} }
    registerWorkbenchExecutionPolicy(ctx)
    const text = request => prompt.text({ agent: { session: session(request) } })
    expect(text('使用免费源创建A股行情工作台，每分钟刷新')).toContain('publicData')
    expect(text('使用免费源创建A股行情工作台，每分钟刷新').length).toBeLessThan(2500)
    for (const request of ['禁止联网创建行情工作台', '使用通联MCP创建股票工作台', '创建股票财报与宏观工作台']) expect(text(request)).not.toContain('免费源直通')
    ctx.tools.schemas = () => []
    expect(text('创建免费股票行情工作台')).not.toContain('免费源直通')
  })
  it('keeps binding work open for accepted inline snapshots when the human requested minute updates', () => {
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    const current = session('创建金融工作台，每1分钟自动刷新')
    current.events.push({type:'tool/call',data:{name:'research_workbench_create',callId:'inline',arguments:JSON.stringify({panels:[{artifact:{type:'market'}}]})}},
      {type:'tool/result',data:{message:{source:{callId:'inline'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({planId:'p',status:'prepared'})}]}]}}})
    expect(prompt.text({agent:{session:current}})).toContain('research_component_data action=bind')
    expect(prompt.text({agent:{session:current}})).not.toContain('然后结束本轮')
    current.events[0].data.content[0].text='创建金融工作台'
    expect(prompt.text({agent:{session:current}})).toContain('然后结束本轮')
    current.events[0].data.content[0].text='创建金融工作台，每1分钟自动刷新'
    current.events[1].data.arguments=JSON.stringify({panels:[{prompt:'等待子任务取数'}]})
    expect(prompt.text({agent:{session:current}})).toContain('然后结束本轮')
  })
  it('ends parent research after the matching accepted plan while allowing a new human request', () => {
    const current = session('使用通联创建工作台')
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    const text = () => prompt.text({ agent: { session: current } })
    current.events.push({ type: 'tool/call', data: { name: 'research_workbench_create', callId: 'plan-call' } })
    const result = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'plan-call' }, content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: JSON.stringify({ planId: 'plan', status: 'accepted' }) }] }] } } }
    current.events.push(result)
    expect(text()).toContain('立即调用 research_workbench_create')
    result.data.message.content[0].isError = false
    expect(text()).toContain('主会话不要再重复接口发现')
    expect(text()).toContain('刷新配置待确认')
    expect(text()).toContain('不能由计划承诺自动刷新已生效')
    const next = session('再创建另一只股票的工作台').events[0]; next.data.id = 'human-next'
    current.events.push(next)
    expect(text()).toContain('立即调用 research_workbench_create')
  })
  it('applies the early plan before the first human message is committed to session history', () => {
    const pending = { header: {}, events: [
      ...session('解释上一张图').events,
      { type: 'agent/inbox/spliced', data: { inserted: [session('使用通联创建宁德时代工作台').events[0].data] } },
      { type: 'agent/inbox/spliced', data: { removedCount: 1, inserted: [] } }
    ] }
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    expect(prompt.text({ agent: { session: pending } })).toContain('立即调用 research_workbench_create')
    pending.events.push({ type: 'agent/inbox/spliced', data: { inserted: [{ ...session('创建工作台').events[0].data, source: { kind: 'tool' } }] } })
    expect(workbenchCreationRequest(pending).text).toBe('使用通联创建宁德时代工作台')
    pending.events.push(...session('解释一下当前数据').events)
    expect(workbenchCreationRequest(pending)).toBeNull()
  })
  it('recognizes human creation intent without changing coding questions or tool output', () => {
    expect(workbenchCreationRequest(session('使用通联mcp获取数据，创建一个股票研究工作台'))).not.toBeNull()
    for (const text of ['为什么生成工作台这么慢', '不要生成工作台', '修复组件生成逻辑', '请创建登录界面']) expect(workbenchCreationRequest(session(text))).toBeNull()
    const injected = session('创建工作台'); injected.events[0].data.source.kind = 'tool'
    expect(workbenchCreationRequest(injected)).toBeNull()
  })
  it('limits the planning phase and restores the original controls for ordinary requests', async () => {
    let handler, prompt
    const resolveModelInfo = vi.fn().mockResolvedValue({ reasoning: { efforts: ['low', 'high', 'max'].map(id => ({ id })) } })
    registerWorkbenchExecutionPolicy({ llm: { resolveModelInfo }, systemPrompt: { context: v => { prompt = v; return () => {} } }, on: (name, fn) => { if (name === 'agent/request') handler = fn; return () => {} } })
    const agent = { session: session('创建股票工作台') }, config = { provider: 'zai', model: 'GLM-5.3-Flash' }
    expect(prompt.text({ agent })).toContain('立即调用 research_workbench_create')
    const automatic = await handler({ agent }, async () => config)
    expect(automatic.reasoningEffort).toBe('low')
    expect(await handler({ agent }, async () => ({ ...config, reasoningEffort: 'max' }))).toEqual({ ...config, reasoningEffort: 'low', maxTokens: 4096 })
    // A new default request has its own original controls, independent of the
    // preceding explicit selection.
    await handler({ agent }, async () => config)
    agent.session = session('解释一下这段代码')
    expect(await handler({ agent }, async () => automatic)).toEqual(config)
    expect(prompt.text({ agent })).toBe('')
  })
  it('declares only supported GLM 5.3 levels and leaves custom declarations / gateways intact', () => {
    const original = { id: 'GLM-5.3-Flash' }
    expect(glmReasoningEntry(original, 'zai', 'https://api.z.ai/api/coding/paas/v4').reasoningEfforts).toEqual({ low: 'low', high: 'high', max: 'max' })
    expect(glmReasoningEntry(original, 'zai', 'https://custom.example/v1')).toBe(original)
    const explicit = { ...original, reasoningEfforts: false }
    expect(glmReasoningEntry(explicit, 'zai', 'https://api.z.ai/')).toBe(explicit)
  })
  it('sends the temporary supported planning controls to the adapter and restores Max after acceptance', async () => {
    const filename = resolve('node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/countdown-policy-test.mjs')
    const source = patchGlmReasoningCapabilities(readFileSync(resolve('node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'), 'utf8'))
    expect(patchGlmReasoningCapabilities(source)).toBe(source)
    writeFileSync(filename, source + '\nexport { resolveProfiles };')
    try {
      const { PiAiAdapter, resolveProfiles } = await import(pathToFileURL(filename).href)
      const profiles = resolveProfiles({ zai: { models: [{ id: 'GLM-5.3-Flash' }], baseURL: 'https://api.z.ai/api/coding/paas/v4' } })
      const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => 'local-test-key' })
      const info = await adapter.resolveModel('zai', 'GLM-5.3-Flash')
      expect(info.reasoning.efforts.map(e => e.id)).toEqual(['low', 'high', 'max'])
      expect(info.reasoning.defaultEffort).toBe('max')
      let handler
      registerWorkbenchExecutionPolicy({ llm: { resolveModelInfo: (...args) => adapter.resolveModel(...args) }, systemPrompt: { context: () => () => {} }, on: (name, fn) => { if (name === 'agent/request') handler = fn; return () => {} } })
      const agent = { session: session('创建工作台') }, original = { provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 }
      const planned = await handler({ agent }, async () => original)
      let body
      vi.stubGlobal('fetch', vi.fn(async (_, init) => {
        body = JSON.parse(init.body)
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"完成"},"finish_reason":null}]}\n\ndata: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }))
      const chunks = []
      for await (const chunk of adapter.stream({ ...planned, messages: [{ role: 'user', content: [{ type: 'text', text: '创建工作台' }] }] })) chunks.push(chunk)
      expect(body.model).toBe('GLM-5.3-Flash')
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('low')
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(4096)
      expect(chunks.at(-1).type).toBe('finish')
      agent.session.events.push({ type: 'tool/call', data: { name: 'research_workbench_create', callId: 'accepted' } },
        { type: 'tool/result', data: { message: { source: { callId: 'accepted' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: JSON.stringify({ planId: 'p', status: 'accepted' }) }] }] } } })
      const restored = await handler({ agent }, async () => ({ ...planned }))
      expect(restored).toEqual(original)
      for await (const chunk of adapter.stream({ ...restored, messages: [{ role: 'user', content: [{ type: 'text', text: '普通聊天' }] }] })) { /* drain the restored request */ }
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('max')
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(16384)
    } finally { unlinkSync(filename) }
  })
})
