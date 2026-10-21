import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'

const cleanups = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
  vi.unstubAllEnvs()
})
const input = () => ({ requestId: 'sdk-receipt-once', title: '来源研究', panels: [
  { title: '研究说明', type: 'note', size: 'large', prompt: '展示原始资料并明确数据缺口。' }
] })

async function fixture() {
  // No authority HTTP, model transport, or child SDK is involved. Keep the
  // production registration, persistence, idempotence and SDK pipeline real.
  vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_URL', '')
  const dir = await mkdtemp(join(tmpdir(), 'workbench-sdk-receipt-'))
  const ctx = new Context()
  new SystemPrompt(ctx, {})
  new ToolRuntime(ctx)
  const agent = { id: 'receipt-parent', session: { id: 'receipt-parent', events: [] }, ctx }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined })
  ctx.provide('webServer', { register: () => () => {} })
  const tasks = new Map()
  const start = async (request, prepared) => request.panels.map(panel => {
    const task = { taskId: randomUUID(), canvasNodeId: panel.canvasNodeId, prepared }
    tasks.set(task.taskId, task)
    return { taskId: task.taskId }
  })
  const filePath = join(dir, 'plans.json')
  const dispose = await registerWorkbench(ctx, {
    startBatch: request => start(request, false),
    startPreparedBatch: request => start(request, true)
  }, { filePath })
  cleanups.push(async () => { await dispose(); await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) })
  return {
    ctx, tasks,
    plans: async () => JSON.parse(await readFile(filePath, 'utf8')),
    invoke: args => ctx.tools.execute({ name: 'research_workbench_create', arguments: args, agent,
      callId: randomUUID(), signal: new AbortController().signal })
  }
}

function renderedReceipt(result, status) {
  expect(result, JSON.stringify(result)).toMatchObject({ isError: false, value: {
    planId: expect.any(String), panels: ['研究说明'], templateIds: ['note'], status,
    refreshStatus: 'unverified', refreshGuidance: expect.stringContaining('以实际绑定及成功刷新状态为准')
  } })
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
  return JSON.parse(result.content[0].text)
}

it('returns a rendered accepted receipt through the installed SDK and exact retry keeps one plan', async () => {
  const f = await fixture(), args = input()
  const first = await f.invoke(args)
  // Even when SDK output validation fails, the create side effect has happened.
  // This assertion makes that production incident explicit in the RED result.
  expect(await f.plans()).toHaveLength(1)
  expect(f.tasks.size).toBe(1)
  const receipt = renderedReceipt(first, 'accepted')
  expect(renderedReceipt(await f.invoke(structuredClone(args)), 'accepted')).toEqual(receipt)
  const plans = await f.plans()
  expect(plans).toHaveLength(1)
  expect(plans[0].id).toBe(receipt.planId)
  expect(plans[0].panels[0].taskId).toBe([...f.tasks.keys()][0])
  expect(f.tasks.size).toBe(1)
  const collision = await f.invoke({ ...args, title: '另一份需求' })
  expect(collision.isError).toBe(true)
  expect(collision.error.message).toContain('该 requestId 已用于另一份规划')
  expect(await f.plans()).toHaveLength(1)
  expect(f.tasks.size).toBe(1)
})

it('returns a rendered prepared receipt for supplied content without starting generated tasks', async () => {
  const f = await fixture(), args = input()
  args.panels[0].artifact = { version: 1, type: 'note', title: '研究说明', asOf: '用户原始资料 · 2026-10-21', content: '用户提供的原始资料。' }
  const receipt = renderedReceipt(await f.invoke(args), 'prepared')
  expect([...f.tasks.values()]).toMatchObject([{ prepared: true }])
  expect(renderedReceipt(await f.invoke(structuredClone(args)), 'prepared')).toEqual(receipt)
  expect(await f.plans()).toHaveLength(1)
  expect(f.tasks.size).toBe(1)
})

it('keeps preparing compatible with the registered SDK output contract', async () => {
  const f = await fixture()
  // The create queue serializes calls and restore marks interrupted plans ready;
  // exercise the legacy status via SDK value replacement, not a fabricated
  // concurrent-runtime claim. SDK revalidates and renders the registered schema.
  f.ctx.on('tools/post-execute', async (_exec, result, next) => result.isError ? next() : ({ kind: 'accept', value: { ...result.value, status: 'preparing' } }))
  renderedReceipt(await f.invoke(input()), 'preparing')
  expect(await f.plans()).toHaveLength(1)
})

it('still rejects undeclared output properties at the installed SDK boundary', async () => {
  const f = await fixture()
  f.ctx.on('tools/post-execute', async (_exec, result, next) => result.isError ? next() : ({ kind: 'accept', value: { ...result.value, unexpectedReceiptField: true } }))
  const result = await f.invoke(input())
  expect(result).toMatchObject({ isError: true, error: { info: { name: 'ToolOutputError', code: 'INVALID_TOOL_OUTPUT' } } })
  expect(result.error.message).toContain('value.unexpectedReceiptField')
  expect(result).not.toHaveProperty('value')
  expect(await f.plans()).toHaveLength(1)
  expect(f.tasks.size).toBe(1)
})
