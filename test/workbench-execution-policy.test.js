import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { glmReasoningEntry, patchGlmReasoningCapabilities } from '../scripts/lib/glm-reasoning-capabilities.mjs'
import { registerWorkbenchExecutionPolicy, workbenchCreationRequest } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const session = text => ({ header: {}, events: [{ type: 'user/message', data: { id: 'human', source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })
afterEach(() => vi.unstubAllGlobals())
describe('workbench execution policy', () => {
  it('recognizes human creation intent without changing coding questions or tool output', () => {
    expect(workbenchCreationRequest(session('使用通联mcp获取数据，创建一个股票研究工作台'))).not.toBeNull()
    for (const text of ['为什么生成工作台这么慢', '不要生成工作台', '修复组件生成逻辑', '请创建登录界面']) expect(workbenchCreationRequest(session(text))).toBeNull()
    const injected = session('创建工作台'); injected.events[0].data.source.kind = 'tool'
    expect(workbenchCreationRequest(injected)).toBeNull()
  })
  it('selects low for default creation, keeps explicit effort, and restores ordinary requests', async () => {
    let handler, prompt
    const resolveModelInfo = vi.fn().mockResolvedValue({ reasoning: { efforts: ['low', 'high', 'max'].map(id => ({ id })) } })
    registerWorkbenchExecutionPolicy({ llm: { resolveModelInfo }, systemPrompt: { context: v => { prompt = v; return () => {} } }, on: (_, fn) => { handler = fn; return () => {} } })
    const agent = { session: session('创建股票工作台') }, config = { provider: 'zai', model: 'GLM-5.3-Flash' }
    expect(prompt.text({ agent })).toContain('立即调用 research_workbench_create')
    const automatic = await handler({ agent }, async () => config)
    expect(automatic.reasoningEffort).toBe('low')
    expect(await handler({ agent }, async () => ({ ...config, reasoningEffort: 'max' }))).toEqual({ ...config, reasoningEffort: 'max' })
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
  it('sends low to the real adapter wire with thinking enabled, without changing provider or token budget', async () => {
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
      let body
      vi.stubGlobal('fetch', vi.fn(async (_, init) => {
        body = JSON.parse(init.body)
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"完成"},"finish_reason":null}]}\n\ndata: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }))
      const chunks = []
      for await (const chunk of adapter.stream({ provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'low', maxTokens: 16384, messages: [{ role: 'user', content: [{ type: 'text', text: '创建工作台' }] }] })) chunks.push(chunk)
      expect(body.model).toBe('GLM-5.3-Flash')
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('low')
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(16384)
      expect(chunks.at(-1).type).toBe('finish')
      for await (const chunk of adapter.stream({ provider: 'zai', model: 'GLM-5.3-Flash', messages: [{ role: 'user', content: [{ type: 'text', text: '普通聊天' }] }] })) { /* drain the ordinary default request */ }
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('max')
    } finally { unlinkSync(filename) }
  })
})
