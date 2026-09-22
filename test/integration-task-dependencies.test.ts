import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DependencyIndex } from '../src/main/integrations/dependency-index'
import { IntegrationStore } from '../src/main/integrations/store'
import { TaskStore } from '../src/main/scheduled/task-store'
import { TaskRunner, type Rpc } from '../src/main/scheduled/task-runner'
import { validateTask, type TaskInput } from '../src/shared/scheduled-tasks'
import type { IntegrationBinding, Connection, ToolBinding } from '../src/shared/integrations'

const roots: string[] = []
const digest = 'a'.repeat(64)
const binding = (): IntegrationBinding => ({ entityId: 'connection', kind: 'connection', bindingRevision: 1, toolIds: ['tool'], schemaDigests: { tool: digest }, allowWrite: false })
const input = (): TaskInput => ({ title: '研究摘要', prompt: '检索资料', workspaceId: 'workspace', notification: 'always', schedule: { frequency: 'daily', time: '09:00', timezone: 'Asia/Shanghai', weekday: 1, date: '2026-09-25' }, integrationBindings: [binding()] })
const initialTime = Date.parse('2026-09-22T00:59:00Z')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-dependencies-'))
  roots.push(root)
  const store = await IntegrationStore.open(join(root, 'integrations'))
  const connection: Connection = { id: 'connection', name: '资料 API', kind: 'api', providerId: 'custom-api', ownerAccountId: 'owner', enabled: true, revision: 1,
    config: { type: 'api', baseUrl: 'https://example.com', auth: { type: 'none' }, network: {}, operations: [] }, authState: 'connected', health: 'healthy', workspaceGrant: { mode: 'selected', workspaceIds: ['workspace'] }, toolGrants: ['tool'], unattendedToolGrants: [], createdAt: 1, updatedAt: 1, configDigest: digest }
  const tool: ToolBinding = { id: 'tool', name: '检索', connectionId: 'connection', operationId: 'lookup', description: '检索资料', effect: 'read', inputSchema: {}, enabled: true, schemaDigest: digest }
  await store.change(state => { state.connections.connection = connection; state.tools.tool = tool })
  let clock = initialTime
  const tasks = new TaskStore(join(root, 'tasks.json'), () => clock)
  await tasks.load()
  const index = new DependencyIndex(store)
  return { root, store, tasks, index, now: () => clock, setTime: (next: number) => { clock = next } }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('task binding validation and migration', () => {
  it('deeply validates binding scope and normalizes old tasks to empty bindings', () => {
    const old = input()
    delete old.integrationBindings
    expect(validateTask(old).integrationBindings).toEqual([])
    const submitted = input()
    const validated = validateTask(submitted)
    submitted.integrationBindings![0]!.toolIds.push('not-approved')
    expect(validated.integrationBindings![0]!.toolIds).toEqual(['tool'])
  })

  it.each([
    { bindingRevision: -1 }, { bindingRevision: 1.5 }, { allowWrite: 'yes' },
    { toolIds: ['tool', 'tool'] }, { toolIds: ['tool', 'extra'] },
    { schemaDigests: { tool: digest, extra: digest } }, { schemaDigests: { tool: 'bad' } },
    { kind: 'arbitrary' }, { entityId: '__proto__' }
  ])('rejects malformed or expanded binding input %o', invalid => {
    expect(() => validateTask({ ...input(), integrationBindings: [{ ...binding(), ...invalid }] })).toThrow()
  })

  it('loads pre-integration tasks and accepts persisted blocked runs', async () => {
    const { root, tasks } = await fixture()
    const task = await tasks.save(input())
    const data = JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8'))
    delete data.tasks[0].integrationBindings
    data.tasks[0].runs = [{ id: 'blocked-run', status: 'blocked', startedAt: initialTime, finishedAt: initialTime, error: '连接已断开' }]
    await writeFile(join(root, 'tasks.json'), JSON.stringify(data))
    const reopened = new TaskStore(join(root, 'tasks.json'))
    await reopened.load()
    expect(reopened.list()[0]).toMatchObject({ id: task.id, integrationBindings: [], runs: [{ status: 'blocked' }] })
  })
})

describe('dependency checks use approved task scope', () => {
  it('uses explicit per-task approval without widening global unattended tool grants', async () => {
    const { index, store } = await fixture()
    await index.syncBindings('task', [binding()])
    expect(await index.preflight('task')).toEqual({ ready: true, issues: [] })
    expect(() => index.assertToolAllowed('task', 'tool')).not.toThrow()
    expect(store.snapshot().connections.connection!.unattendedToolGrants).toEqual([])
    expect(() => index.assertToolAllowed('other-task', 'tool')).toThrow()
  })

  it('prefers claimed task bindings over a stale index and fails closed after revocation', async () => {
    const { index, store } = await fixture()
    await index.syncBindings('task', [binding()])
    expect((await index.preflight('task', [])).ready).toBe(true)
    expect(() => index.assertToolAllowed('task', 'tool', { bindings: [] })).toThrow()
    expect((await index.preflight('task')).ready).toBe(true)
    await store.change(state => { state.connections.connection!.enabled = false })
    expect((await index.preflight('task')).issues[0]).toMatchObject({ entityId: 'connection', code: 'DEPENDENCY_BLOCKED', route: 'integrations/apps' })
    expect(() => index.assertToolAllowed('task', 'tool')).toThrow()
  })

  it('requires renewed approval after a config/schema change or newly writable operation', async () => {
    const { index, store } = await fixture()
    await index.syncBindings('task', [binding()])
    await store.change(state => { state.connections.connection!.revision = 2 })
    expect((await index.preflight('task')).issues.some(issue => issue.code === 'VERSION_CONFLICT')).toBe(true)
    await store.change(state => { state.connections.connection!.revision = 1; state.tools.tool!.schemaDigest = 'b'.repeat(64) })
    expect((await index.preflight('task')).issues.some(issue => issue.code === 'SCHEMA_CHANGED')).toBe(true)
    await store.change(state => { state.tools.tool!.schemaDigest = digest; state.tools.tool!.effect = 'write' })
    expect((await index.preflight('task')).issues.some(issue => issue.code === 'ACCESS_DENIED')).toBe(true)
    await index.syncBindings('task', [{ ...binding(), allowWrite: true }])
    expect((await index.preflight('task')).ready).toBe(true)
  })

  it('returns observed dependencies as suggestions without granting access', async () => {
    const { index, store } = await fixture()
    const suggestion = await index.recordUse('observed-task', 'tool', 1)
    expect(suggestion).toEqual(binding())
    expect(store.snapshot().taskBindings['observed-task']).toBeUndefined()
    expect(() => index.assertToolAllowed('observed-task', 'tool')).toThrow()
  })

  it('combines declared dependencies and real call evidence in uninstall impact', async () => {
    const { index, store } = await fixture()
    await index.syncBindings('declared-task', [binding()])
    await store.change(state => { state.calls.push({ id: 'actual-call', toolId: 'tool', connectionId: 'connection', taskId: 'observed-task', sessionId: 'actual-session', time: initialTime, status: 'succeeded' }) })
    const impact = await index.impact('connection')
    expect(impact.declaredTaskIds).toEqual(['declared-task'])
    expect(impact.observedTaskIds).toEqual(['observed-task'])
    expect(impact.taskCount).toBe(2)
  })
})

describe('dependency blocks preserve durable scheduler semantics', () => {
  it('fails closed for bound tasks if the integration preflight hook was not wired', async () => {
    const { tasks, now } = await fixture()
    const task = await tasks.save(input())
    const rpc = vi.fn(async () => { throw new Error('Blocked task must not dispatch') })
    await new TaskRunner(tasks, rpc, () => true, vi.fn(), now).run(task.id)
    expect(tasks.list()[0]!.runs[0]!.status).toBe('blocked')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('blocks before any dispatch, advances once, and does not backfill when a connection recovers', async () => {
    const { tasks, store, index, now, setTime } = await fixture()
    const task = await tasks.save(input())
    await index.syncBindings(task.id, task.integrationBindings!)
    await store.change(state => { state.connections.connection!.authState = 'revoked' })
    const rpc = vi.fn(async () => { throw new Error('Blocked task must not dispatch') })
    const notify = vi.fn()
    const runner = new TaskRunner(tasks, rpc, () => true, notify, now, undefined, current => index.preflight(current.id, current.integrationBindings ?? []))
    setTime(Date.parse('2026-09-22T01:00:00Z'))
    await runner.tick()
    const blocked = tasks.list()[0]!
    expect(blocked.runs).toHaveLength(1)
    expect(blocked.runs[0]!.status).toBe('blocked')
    expect(blocked.nextRun).toBe(Date.parse('2026-09-23T01:00:00Z'))
    expect(rpc).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledOnce()
    for (let tick = 0; tick < 4; tick++) { setTime(now() + 15_000); await runner.tick() }
    await store.change(state => { state.connections.connection!.authState = 'connected' })
    await runner.tick()
    expect(tasks.list()[0]!.runs).toHaveLength(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('manual recovery creates a fresh single claim and one prompt despite concurrent clicks', async () => {
    const { tasks, store, index, now } = await fixture()
    const task = await tasks.save(input())
    await store.change(state => { state.connections.connection!.authState = 'expired' })
    const prompts: string[] = []
    const rpc: Rpc = async <T>(method: string, _payload: unknown, rpcId?: string): Promise<T> => {
      if (method === 'session.create') return { sessionId: 'dedicated' } as T
      if (method === 'session.models') return { current: { model: 'test' } } as T
      if (method === 'session.history') return { events: [] } as T
      if (method === 'session.prompt') prompts.push(rpcId!)
      return {} as T
    }
    const runner = new TaskRunner(tasks, rpc, () => true, vi.fn(), now, undefined, current => index.preflight(current.id, current.integrationBindings ?? []))
    await runner.run(task.id)
    const blockedId = tasks.list()[0]!.runs[0]!.id
    await store.change(state => { state.connections.connection!.authState = 'connected' })
    await Promise.allSettled([runner.run(task.id), runner.run(task.id)])
    const runs = tasks.list()[0]!.runs
    expect(runs).toHaveLength(2)
    expect(runs[0]!.id).not.toBe(blockedId)
    expect(runs[0]!.rpcId).toBe(prompts[0])
    expect(prompts).toHaveLength(1)
  })

  it('does not immediately re-block an overdue plan after a manual blocked attempt', async () => {
    const { tasks, store, index, now, setTime } = await fixture()
    const task = await tasks.save(input())
    await store.change(state => { state.connections.connection!.enabled = false })
    const runner = new TaskRunner(tasks, vi.fn(), () => true, vi.fn(), now, undefined, current => index.preflight(current.id, current.integrationBindings ?? []))
    setTime(Date.parse('2026-09-22T01:00:15Z'))
    await runner.run(task.id)
    await runner.tick()
    expect(tasks.list()[0]!.runs).toHaveLength(1)
    expect(tasks.list()[0]!.nextRun).toBe(Date.parse('2026-09-23T01:00:00Z'))
  })

  it('blocks component execution before dispatch and pauses an exhausted one-off plan', async () => {
    const { tasks, index, store, now, setTime } = await fixture()
    const task = await tasks.save({ ...input(), component: { sessionId: 'board', nodeId: 'component', title: '组件', boardTitle: '看板' }, schedule: { ...input().schedule, frequency: 'once', date: '2026-09-22' } })
    await store.change(state => { state.connections.connection!.enabled = false })
    const component = { start: vi.fn(), inspect: vi.fn() }
    const runner = new TaskRunner(tasks, vi.fn(), () => true, vi.fn(), now, component, current => index.preflight(current.id, current.integrationBindings ?? []))
    setTime(Date.parse('2026-09-22T01:00:00Z'))
    await runner.tick()
    expect(component.start).not.toHaveBeenCalled()
    expect(tasks.list()[0]).toMatchObject({ id: task.id, state: 'paused', nextRun: null, runs: [{ status: 'blocked' }] })
  })
})
