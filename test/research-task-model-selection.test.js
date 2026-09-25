import { describe, it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { apply as spawn } from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { componentModelSelection, createSharedBoardExecutor } from '../packages/dsh-research-task-runtime/index.js'

const rpc = payload => ({ rpcId: 'model-test', payload })
const selected = { provider: 'selected-provider', model: 'selected-model' }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

async function fixture() {
  const ctx = new Context(), requests = [], children = []
  new SessionStore(ctx)
  new AgentRegistry(ctx)
  new LlmRuntime(ctx)
  new SystemPrompt(ctx, {})
  new ToolRuntime(ctx)
  for (const name of ['financial_query', 'web_search', 'research_workbench_create']) ctx.tools.register({ name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'object', properties: {} }, render: () => [] }, execute: async () => { throw Error('This routing test must not invoke tools') } })
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  new SubagentRuntime(ctx)
  spawn(ctx, { providerName: 'spawn' })
  const controls = { catalog: undefined, stream: undefined }
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'high', name: 'High' }] } } }
    async listModels(provider) { await controls.catalog?.(); return [{ provider, id: 'selected-model', name: 'Selected' }] }
    async *stream(request) {
      requests.push(request)
      await controls.stream?.()
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '本地任务完成' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '本地任务完成' } }
      yield { type: 'finish', reason: 'stop' }
    }
  }
  const registration = ctx.llm.registerAdapter(['selected-provider', 'other-provider'], new Adapter())
  ctx.provide('userQuestions', { registerProvider: () => () => {} })
  ctx.provide('workspaceRegistry', {})
  let saved = { selections: [] }
  ctx.provide('settings', { register: () => ({ get: () => saved, replace: async value => { saved = structuredClone(value) } }) })
  const parent = (await ctx.agents.create({ sessionId: 'shared-parent', agentOptions: { provider: 'deepseek-official', model: 'old-model', maxTokens: 1536 } })).agent
  const api = createApiProxy(ctx, { cwd: '/tmp', defaultModelSelection: () => ({ provider: 'other-provider', model: 'default-model' }) })
  ctx.provide('apiProxy', api)
  await new Promise(resolve => setImmediate(resolve))
  ctx.on('session/created', session => { if (session.header.parentSession === parent.id) children.push(session) })
  // A deployment request contribution must remain effective on the isolated child.
  ctx.on('agent/request', async (_payload, next) => ({ ...await next(), temperature: 0.37, reasoningEffort: 'high' }))
  const executor = createSharedBoardExecutor(ctx)
  const choose = async choice => {
    const response = await api.sessions.selectModel(rpc({ sessionId: parent.id, ...choice }))
    expect(response.result, JSON.stringify(response.result)).toMatchObject({ ok: true })
  }
  const execute = (signal = new AbortController().signal) => executor.execute({ sessionId: parent.id, kind: 'board', prompt: '只使用本地材料回答', taskId: 'task-model' }, signal)
  return { ctx, parent, api, controls, registration, requests, children, choose, execute,
    async close() { await executor.dispose(); await ctx.fiber.dispose() } }
}

describe('research task selected model admission', () => {
  it('uses a supported concise reasoning mode only for generated components', () => {
    const models = { current: selected, groups: [{ id: selected.provider, models: [{ id: selected.model, reasoning: { efforts: [{ id: 'high' }, { id: 'low' }] } }] }] }
    expect(componentModelSelection(models, 'container')).toEqual({ ...selected, reasoningEffort: 'low' })
    expect(componentModelSelection(models, 'board')).toEqual(selected)
    expect(componentModelSelection({ ...models, groups: [] }, 'container')).toEqual(selected)
  })
  it.each(['blank', 'previously-run'])('routes a real spawn from a selected %s parent without changing history or other native request options', async state => {
    const f = await fixture()
    try {
      if (state === 'previously-run') f.parent.session.append('request/header', { header: { config: { provider: 'deepseek-official', model: 'previous-model' }, system: '已有会话', tools: [] } })
      await f.choose(selected)
      const before = [...f.parent.session.events]
      await expect(f.execute()).resolves.toBe('本地任务完成')
      expect(f.requests).toHaveLength(1)
      expect(f.children).toHaveLength(1)
      expect(f.requests[0]).toMatchObject({ ...selected, maxTokens: 1536, temperature: 0.37, reasoningEffort: 'high' })
      expect(f.requests[0].sessionId).not.toBe(f.parent.id)
      expect(f.parent.session.events).toEqual(before)
      expect(f.parent.options).toMatchObject({ provider: 'deepseek-official', model: 'old-model', maxTokens: 1536 })
    } finally { await f.close() }
  })
  it('captures the selected route once before catalog await and keeps an in-flight child stable across a parent switch', async () => {
    const f = await fixture(), entered = deferred(), release = deferred(), streaming = deferred(), finish = deferred()
    try {
      await f.choose(selected)
      f.controls.stream = async () => { streaming.resolve(); await finish.promise }
      f.controls.catalog = async () => { entered.resolve(); await release.promise }
      const execution = f.execute()
      await entered.promise
      await f.choose({ provider: 'other-provider', model: 'later-model' })
      release.resolve()
      await streaming.promise
      await f.choose({ provider: 'other-provider', model: 'next-model' })
      finish.resolve()
      await expect(execution).resolves.toBe('本地任务完成')
      expect(f.requests[0]).toMatchObject(selected)
      f.controls.catalog = undefined
      f.controls.stream = undefined
      await f.execute()
      expect(f.requests[1]).toMatchObject({ provider: 'other-provider', model: 'next-model' })
    } finally { release.resolve(); finish.resolve(); await f.close() }
  })
  it('does not replace an explicitly selected unavailable route with the configured default', async () => {
    const f = await fixture()
    try {
      await f.choose(selected)
      f.registration.replace(['other-provider'])
      await expect(f.execute()).rejects.toThrow(/模型.*不可用/)
      expect(f.requests).toHaveLength(0)
      expect(f.children).toHaveLength(0)
    } finally { await f.close() }
  })
  it('surfaces selection lookup failure before spawning instead of using stale parent options', async () => {
    const f = await fixture()
    try {
      await f.choose(selected)
      // A real API remote failure is a failed envelope, not a valid empty catalog.
      f.api.sessions.models = async () => ({ result: { ok: false, error: { code: 'internal', message: 'selection storage unavailable' } } })
      await expect(f.execute()).rejects.toThrow('selection storage unavailable')
      expect(f.requests).toHaveLength(0)
      expect(f.children).toHaveLength(0)
    } finally { await f.close() }
  })
  it('does not start a child after cancellation during native selection lookup', async () => {
    const f = await fixture(), entered = deferred(), release = deferred(), controller = new AbortController()
    try {
      await f.choose(selected)
      f.controls.catalog = async () => { entered.resolve(); await release.promise }
      const execution = f.execute(controller.signal)
      await entered.promise
      controller.abort(Error('cancelled model admission'))
      await expect(execution).rejects.toThrow('cancelled model admission')
      expect(f.children).toHaveLength(0)
      expect(f.requests).toHaveLength(0)
    } finally { release.resolve(); await f.close() }
  })

})
