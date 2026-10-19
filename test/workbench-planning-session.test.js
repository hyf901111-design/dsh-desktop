import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session, KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { PersistenceCoordinator } from '@deepseek-ai/dsh-session-persistence'
import { registerWorkbenchExecutionPolicy } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import { patchWorkbenchPlanningSessionCatalog, patchWorkbenchPlanningSessionAppend } from '../scripts/lib/workbench-planning-session.mjs'

const type = 'sherlock/workbench-planning-budget'
const budget = { version: 1, messageId: 'human', provider: 'zai', model: 'GLM-5.3-Flash', original: { reasoningEffort: 'max', maxTokens: 16384 }, limited: { reasoningEffort: 'low', maxTokens: 4096 }, phase: 'planning' }
it('registers bundled and unbundled readers idempotently and fails closed if native anchors drift', async () => {
  for (const path of ['lib/index.js', 'lib/types/known-event-types.js']) {
    const source = await readFile('node_modules/@deepseek-ai/dsh-session/' + path, 'utf8')
    expect(patchWorkbenchPlanningSessionCatalog(source)).toBe(source)
  }
  for (const path of ['lib/index.js', 'lib/types/index.js']) {
    const source = await readFile('node_modules/@deepseek-ai/dsh-session/' + path, 'utf8')
    expect(patchWorkbenchPlanningSessionAppend(source)).toBe(source)
  }
  expect(() => patchWorkbenchPlanningSessionCatalog('const other = new Set([])')).toThrow('无法定位')
  expect(() => patchWorkbenchPlanningSessionAppend('const other = {}')).toThrow('无法定位')
})
it('writes planning metadata through real native Session.append as a registered ignorable event', async () => {
  expect(KNOWN_SESSION_EVENT_TYPES.has(type)).toBe(true)
  const s = Session.create('planning-marker')
  const event = s.append(type, budget)
  expect(event.ignorable).toBe(true)
  expect(event.data).toEqual(budget)
  expect(s.append('session/title', { title: '完整历史' }).ignorable).toBeUndefined()
})
it('reloads already-written unmarked planning events through the real disk persistence coordinator and restores Max without deleting history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sherlock-planning-loader-')), file = join(dir, 'session.json')
  const s = Session.create('planning-restart')
  s.append('user/message', { id: 'human', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '创建活动工作台，允许模拟数据' }] }, { surfaceOp: 'append' })
  s.append(type, budget)
  s.append('session/title', { title: '原有用户标题' })
  const legacy = s.events.map(({ ignorable, ...event }) => structuredClone(event))
  const stored = { meta: structuredClone(s.header), events: legacy, revision: 'r1' }
  const ctx = { effect: () => {}, on: () => {}, sessions: { list: () => [], get: () => undefined, prepare: (id, options) => Session.fromRestore(id, options.seed, options.meta) } }
  const backend = { name: 'planning-real-reader', loadStored: async () => JSON.parse(await readFile(file, 'utf8')), readStoredRevision: async () => 'r1' }
  try {
    await writeFile(file, JSON.stringify(stored))
    const rawBefore = await readFile(file, 'utf8')
    const loaded = await new PersistenceCoordinator(ctx, backend).load(s.id)
    expect(loaded.events).toEqual(legacy)
    expect(await readFile(file, 'utf8')).toBe(rawBefore)
    const replay = Session.fromRestore(s.id, structuredClone(loaded.events), structuredClone(loaded.meta))
    replay.append('user/message', { id: 'cancel', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '取消，先讨论计划' }] }, { surfaceOp: 'append' })
    let request
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: () => () => {} }, on: (name, fn) => { if (name === 'agent/request') request = fn; return () => {} } })
    expect(await request({ agent: { session: replay } }, async () => ({ provider: budget.provider, model: budget.model, ...budget.limited }))).toEqual({ provider: budget.provider, model: budget.model, ...budget.original })
    expect(replay.events.find(e => e.type === 'session/title').data.title).toBe('原有用户标题')
    await writeFile(file, JSON.stringify({ ...stored, events: [...legacy, { seq: legacy.length, time: 0, type: 'unknown/required', data: {} }] }))
    await expect(new PersistenceCoordinator(ctx, backend).load(s.id)).rejects.toThrow('unknown/required')
    await writeFile(file, JSON.stringify({ ...stored, events: [...legacy, { seq: legacy.length, time: 0, type: 'unknown/optional', data: {}, ignorable: true }] }))
    expect((await new PersistenceCoordinator(ctx, backend).load(s.id)).events).toHaveLength(legacy.length + 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
