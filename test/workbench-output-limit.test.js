import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { registerWorkbenchExecutionPolicy } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const require = createRequire(import.meta.url)
const { patchMemoryRequestContext } = require('../scripts/lib/memory-request-context.mjs')
const { patchHumanSteeringYield } = require('../scripts/lib/human-steering-yield.mjs')
const { patchFirstResponseEffort } = require('../scripts/lib/first-response-effort.mjs')
const { patchWorkbenchOutputLimit } = require('../scripts/lib/workbench-output-limit.mjs')
let folder, AgentLoop
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'workbench-output-limit-'))
  await symlink(join(process.cwd(), 'node_modules'), join(folder, 'node_modules'), 'dir')
  const raw = await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js', 'utf8')
  const install = source => patchWorkbenchOutputLimit(patchFirstResponseEffort(patchHumanSteeringYield(patchMemoryRequestContext(source))))
  const installed = install(raw)
  expect(install(installed)).toBe(installed)
  const file = join(folder, 'loop.mjs')
  await writeFile(file, installed)
  AgentLoop = (await import(pathToFileURL(file).href)).default
})
afterAll(async () => { if (folder) await rm(folder, { recursive: true, force: true }) })

const finish = kind => ({ type: 'finish', reason: { kind } })
const text = (value, kind = 'stop') => [{ type: 'block-end', index: 0, block: { type: 'text', text: value } }, finish(kind)]
const create = 'research_workbench_create'
const call = (id, name, args = {}) => [{ type: 'block-end', index: 0,
  block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } }, finish('tool-calls')]
const limited = [{ type: 'tool-call-delta', index: 0, id: 'unfinished', name: create, argumentsDelta: '{"partial":' },
  { ...finish('max-tokens'), replayState: { partial: 'unsafe-tool-replay' } }]
const notices = events => events.filter(e => e.type === 'user/message' && e.data.source?.plugin === 'sherlock-workbench-output-limit')

async function run(generate, { prompt = '请建立一个显示披露数据的工作台', mode = 'research', onEvent } = {}) {
  const ctx = new Context(), requests = [], calls = [], errors = []
  try {
    new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {})
    new ToolRuntime(ctx); new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
    ctx.on('agent/error', ({ error }) => errors.push(error.message))
    const receipts = { read: '已读取原始记录', [create]: JSON.stringify({ status: 'prepared', planId: 'existing-plan' }) }
    for (const [name, receipt] of Object.entries(receipts)) ctx.tools.register(defineTool({
      name, description: name, parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => { calls.push(name); return receipt }
    }))
    registerWorkbenchExecutionPolicy(ctx)
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id, defaultMaxTokens: 16384 } }
      async *stream(request) {
        requests.push(request)
        if (requests.length > 9) throw Error('Unexpected extra request')
        yield* generate(requests.length, request)
      }
    }
    ctx.llm.registerAdapter(['fixture'], new Adapter())
    const { agent } = await ctx.agents.create({ sessionId: 'board-test', agentOptions: { provider: 'fixture', model: 'selected', maxTokens: 16384 } })
    if (onEvent) ctx.on('session/event', (session, event) => { if (session === agent.session) onEvent(agent, event) })
    agent.followup(createUserMessage({ source: { kind: 'user', clientMode: mode }, content: [{ type: 'text', text: prompt }] }))
    await agent.whenIdle()
    const events = agent.session.events
    expect(errors).toEqual([])
    return { events, requests, calls, end: events.findLast(e => e.type === 'turn/end').data.reason }
  } finally { await ctx.fiber.dispose() }
}

it('continues a capped workbench plan in the original human turn, retaining read evidence and creating one plan', async () => {
  const planning = [{ type: 'block-end', index: 1, block: { type: 'reasoning', text: '审阅'.repeat(16320) } },
    { type: 'usage', usage: { inputTokens: 1024, outputTokens: 16384, totalTokens: 17408 } }, ...text('准备按已读资料提交。', 'max-tokens')]
  const result = await run(n => [call('read-md', 'read'), planning,
    call('commit', create), text('已提交。')][n - 1])
  expect(result.end.kind).toBe('completed')
  expect(result.calls).toEqual(['read', create])
  expect(notices(result.events)).toHaveLength(1)
  expect(result.events.filter(e => e.type === 'turn/start')).toHaveLength(1)
  expect(result.requests[2].messages.some(m => m.source?.callId === 'read-md')).toBe(true)
  expect(result.events.some(e => e.type === 'assistant/message' && e.data.usage?.outputTokens === 16384)).toBe(true)
  expect(result.requests.every(req => req.maxTokens === 16384 && req.model === 'selected')).toBe(true)
})

it('does not run or replay a truncated tool call, and stops after a retry with no new evidence', async () => {
  const result = await run(() => limited)
  expect(result.end.kind).toBe('max-tokens')
  expect(result.calls).toEqual([])
  expect(result.requests).toHaveLength(2)
  expect(notices(result.events)).toHaveLength(1)
  expect(JSON.stringify(result.requests[1].messages)).not.toMatch(/unfinished|unsafe-tool-replay|partial/)
})

it('allows one further retry after a new receipt but terminates repeated probes', async () => {
  const result = await run(n => [limited, call('read-1', 'read'), limited, call('read-2', 'read'), limited][n - 1])
  expect(result.end.kind).toBe('max-tokens')
  expect(notices(result.events)).toHaveLength(2)
  expect(result.requests).toHaveLength(5)
})

it('uses the accepted plan receipt on recovery and removes creation tools from its closing request', async () => {
  const result = await run(n => [call('commit', create), limited, call('duplicate', create), text('已准备好。')][n - 1])
  expect(result.end.kind).toBe('completed')
  expect(result.calls).toEqual([create])
  expect(result.requests[2].tools ?? []).toEqual([])
  expect(JSON.stringify(result.requests[2].messages)).toContain('existing-plan')
})

it('never automatically continues ordinary chat or a user cancellation', async () => {
  const plain = await run(() => limited, { prompt: '解释一下周末的天气现象', mode: 'chat' })
  expect(plain.end.kind).toBe('max-tokens')
  expect(notices(plain.events)).toHaveLength(0)
  const stopped = await run(() => limited, { onEvent: (agent, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'finish') agent.cancel({ kind: 'user' })
  } })
  expect(stopped.end.kind).toBe('aborted')
  expect(notices(stopped.events)).toHaveLength(0)
  expect(stopped.requests).toHaveLength(1)
})
