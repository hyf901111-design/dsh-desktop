import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { createHomeSpreadsheetRuntime } from '../packages/dsh-research-task-runtime/home-spreadsheet-runtime.js'
import { HOME_SPREADSHEET_GUIDE_PROMPTS } from '../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'

const cleanups = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(title = '利润涨了，现金去哪了？（演示案例）') {
  const directory = await mkdtemp(join(tmpdir(), 'odyssey-sheet-replay-'))
  const cwd = join(directory, 'sheet')
  await mkdir(cwd)
  await writeFile(join(directory, 'research-board-directories.json'), JSON.stringify({ sheet: { sessionId: 'demo', path: cwd, title } }))
  const ctx = new Context()
  new SessionStore(ctx)
  new AgentRegistry(ctx)
  new LlmRuntime(ctx)
  new SystemPrompt(ctx, {})
  new ToolRuntime(ctx)
  new TokenMeter(ctx)
  new JsonlSessionPersistence(ctx, { root: join(directory, 'sessions'), compression: 'none', packChunks: false, writeBatchMaxDelayMs: 1 })
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  const outside = []
  class Outside extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, context: { contextWindow: 16000 }, defaultMaxTokens: 512 }
    }
    async *stream(request) {
      outside.push(request)
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['outside'], new Outside())
  const { agent } = await ctx.agents.create({ sessionId: 'demo', meta: { cwd }, agentOptions: { provider: 'outside', model: 'normal', maxTokens: 512 } })
  const runtime = createHomeSpreadsheetRuntime(ctx, { env: { DSH_HOME: directory } })
  cleanups.push(async () => {
    await runtime.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  const input = { sessionId: 'demo', runId: 'run-1', cwd, fresh: true, locale: 'zh' }
  const submit = (text = HOME_SPREADSHEET_GUIDE_PROMPTS.zh) => agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  return { runtime, agent, ctx, input, outside, submit }
}

it('gates actual native assistant messages on the saved worksheet, chart, and component checkpoints', async () => {
  const f = await fixture()
  await f.runtime.prepare(f.input)
  await f.runtime.arm(f.input)
  f.submit()
  await f.runtime.accepted(f.input)
  await expect(f.runtime.advance({ ...f.input, stage: 'trend' })).rejects.toThrow('顺序')
  await f.runtime.advance({ ...f.input, stage: 'analysis' })
  await f.runtime.advance({ ...f.input, stage: 'analysis' })
  await f.runtime.advance({ ...f.input, stage: 'trend' })
  expect(JSON.stringify(f.agent.session.events)).not.toContain('回款试算')
  await f.runtime.advance({ ...f.input, stage: 'complete' })
  expect(await f.runtime.flush(f.input)).toEqual({ saved: true })
  expect(f.agent.session.events.filter(event => event.type === 'user/message')).toHaveLength(1)
  const assistant = f.agent.session.events.filter(event => event.type === 'assistant/message')
  expect(assistant).toHaveLength(1)
  expect(JSON.stringify(assistant)).toContain('回款试算')
  expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('1.60 亿元')
  expect(f.agent.session.requestHeader()?.config.provider).toBe('outside')
  expect(f.outside).toEqual([])
})

it('refuses replay outside the dedicated registered sample directory', async () => {
  const f = await fixture('我的财报分析')
  await expect(f.runtime.prepare(f.input)).rejects.toThrow('专属目录')
  expect(f.agent.session.events.some(event => event.type === 'turn/start')).toBe(false)
})

it('does not use the original model or claim completion after a changed prompt or cancellation', async () => {
  const f = await fixture()
  await f.runtime.prepare(f.input)
  await f.runtime.arm(f.input)
  const admission = expect(f.runtime.accepted(f.input)).rejects.toThrow('示例需求')
  f.submit(HOME_SPREADSHEET_GUIDE_PROMPTS.zh + '再生成六张图。')
  await admission
  await f.runtime.disposeRun(f.input)
  await f.runtime.disposeRun(f.input)
  expect(JSON.stringify(f.agent.session.events)).not.toContain('回款试算')
  expect(f.agent.session.requestHeader()?.config.provider).toBe('outside')
  expect(f.outside).toEqual([])
})

it('lets the native Stop action cancel a pending checkpoint without late replies', async () => {
  const f = await fixture()
  await f.runtime.prepare(f.input)
  await f.runtime.arm(f.input)
  f.submit()
  await f.runtime.accepted(f.input)
  await f.runtime.advance({ ...f.input, stage: 'analysis' })
  await f.agent.cancel({ kind: 'user' })
  await f.agent.whenIdle()
  await expect(f.runtime.advance({ ...f.input, stage: 'trend' })).rejects.toThrow()
  await f.runtime.disposeRun(f.input)
  expect(JSON.stringify(f.agent.session.events)).not.toContain('回款试算')
  expect(f.outside).toEqual([])
})

it('blocks an in-flight native demo send after disposal and releases ordinary follow-ups', async () => {
  const f = await fixture()
  await f.runtime.prepare(f.input)
  await f.runtime.arm(f.input)
  await f.runtime.disposeRun(f.input)
  f.submit()
  await f.agent.whenIdle()
  expect(f.outside).toEqual([])
  expect(f.agent.session.events.some(event => event.type === 'user/message')).toBe(true)
  f.submit('打开我的另一个工作簿。')
  await f.agent.whenIdle()
  expect(f.outside).toHaveLength(1)
})
