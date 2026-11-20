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
import { createPresentationEditGuideChat } from '../packages/dsh-research-task-runtime/presentation-edit-guide-chat.js'
import { HOME_SPREADSHEET_GUIDE_PROMPTS } from '../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'

const cleanups = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(title = '利润涨了，现金去哪了？（演示案例）', create = createHomeSpreadsheetRuntime) {
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
  const runtime = create(ctx, { env: { DSH_HOME: directory } })
  cleanups.push(async () => {
    await runtime.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  const input = { sessionId: 'demo', runId: 'run-1', cwd, fresh: true, locale: 'zh' }
  const submit = (text = HOME_SPREADSHEET_GUIDE_PROMPTS.zh) => agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  return { runtime, agent, ctx, input, outside, submit }
}

it('runs two saved native turns and requires the quarterly analysis range on the chart turn', async () => {
  const f = await fixture()
  await f.runtime.prepare(f.input)
  await f.runtime.arm(f.input)
  f.submit()
  await f.runtime.accepted(f.input)
  await expect(f.runtime.advance({ ...f.input, stage: 'trend' })).rejects.toThrow('顺序')
  await f.runtime.advance({ ...f.input, stage: 'analysis' })
  expect(await f.runtime.flush(f.input)).toEqual({ saved: true })
  expect(f.agent.session.events.filter(event => event.type === 'assistant/message')).toHaveLength(1)
  expect(JSON.stringify(f.agent.session.events)).not.toContain('25%')
  await f.runtime.arm(f.input)
  f.submit('〔表格选区 "季度分析"!A1:C5 #123456abcdef〕给选区画两条同比趋势线，指出利润与经营现金流背离最明显的一季。')
  await f.runtime.accepted(f.input)
  await f.runtime.advance({ ...f.input, stage: 'trend' })
  expect(await f.runtime.flush(f.input)).toEqual({ saved: true })
  expect(f.agent.session.events.filter(event => event.type === 'user/message')).toHaveLength(2)
  expect(f.agent.session.events.filter(event => event.type === 'assistant/message')).toHaveLength(2)
  expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('25%')
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

it('saves all four presentation turns in the native session with their original references and model', async () => {
  const f = await fixture('把研究简报讲给投资委员会（演示案例）', createPresentationEditGuideChat)
  await f.runtime.prepare(f.input)
  const rows = [
    ['notes', '请准备演讲稿。', undefined, '逐页备注已保存。'],
    ['chart', '按批注重排图表。', '第 10 页 · 批注', '两根数据柱已突出。'],
    ['title', '修改所选标题。', '第 13 页 · 标题', '标题已更新。'],
    ['notes-selection', '优化选中的逐字稿。', '第 13 页 · 备注选段', '所选逐字稿已优化。']
  ]
  for (const [stage, prompt, referenceLabel, reply] of rows) {
    await f.runtime.arm({ ...f.input, prompt, referenceLabel })
    f.submit(referenceLabel ? '〔演示引用 ' + JSON.stringify(referenceLabel) + ' #123456abcdef〕' + prompt : prompt)
    await f.runtime.accepted(f.input)
    expect(JSON.stringify(f.agent.session.events)).not.toContain(reply)
    await f.runtime.advance({ ...f.input, stage, reply })
    await f.runtime.flush(f.input)
  }
  const history = JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))
  for (const [,prompt,label,reply] of rows) {
    expect(history).toContain(prompt)
    if (label) expect(history).toContain(label)
    expect(history).toContain(reply)
  }
  expect(f.agent.session.events.filter(event => event.type === 'user/message')).toHaveLength(4)
  expect(f.agent.session.events.filter(event => event.type === 'assistant/message')).toHaveLength(4)
  expect(f.outside).toEqual([])
  expect(f.agent.session.requestHeader().config.provider).toBe('outside')
  await f.runtime.disposeRun(f.input)
  f.submit('继续编辑这份简报。')
  await f.agent.whenIdle()
  expect(f.outside).toHaveLength(1)
})

it('refuses a different chart selection and never sends a cancelled presentation demo to the original model', async () => {
  const f = await fixture('把研究简报讲给投资委员会（演示案例）', createPresentationEditGuideChat)
  await f.runtime.prepare(f.input)
  await f.runtime.arm({ ...f.input, prompt: '准备备注' })
  f.submit('准备备注')
  await f.runtime.accepted(f.input)
  await f.runtime.advance({ ...f.input, stage: 'notes', reply: '备注已保存。' })
  await f.runtime.flush(f.input)
  await expect(f.runtime.arm({ ...f.input, prompt: '改图' })).rejects.toThrow('选区')
  await f.runtime.arm({ ...f.input, prompt: '改图', referenceLabel: '第 10 页 · 批注' })
  const failed = expect(f.runtime.accepted(f.input)).rejects.toThrow('示例需求')
  f.submit('〔演示引用 "第 12 页 · 批注" #123456abcdef〕改图')
  await failed
  await f.runtime.disposeRun(f.input)
  expect(f.outside).toHaveLength(0)
})
