import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  nextRun,
  validateTask,
  type TaskInput,
} from '../src/shared/scheduled-tasks'
import { TaskStore } from '../src/main/scheduled/task-store'
import { TaskRunner, type Rpc } from '../src/main/scheduled/task-runner'
const dirs: string[] = []
const input: TaskInput = {
  title: '每周简报',
  prompt: '整理资讯',
  workspaceId: 'w',
  schedule: {
    frequency: 'weekdays',
    time: '09:00',
    timezone: 'Asia/Shanghai',
    weekday: 1,
    date: '2026-09-25',
  },
  notification: 'always',
}
const now = Date.parse('2026-09-18T02:00:00Z')
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'scheduled-'))
  dirs.push(dir)
  const file = join(dir, 'tasks.json')
  const store = new TaskStore(file, () => now)
  await store.load()
  return { store, file }
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  )
})
describe('calendar scheduling', () => {
  it('schedules interval checks from now without replaying missed intervals', () => {
    const schedule = { ...input.schedule, frequency: 'interval' as const, intervalMinutes: 5 }
    expect(nextRun(schedule, now)).toBe(Date.parse('2026-09-18T02:05:00Z'))
    expect(() => nextRun({ ...schedule, intervalMinutes: 0 }, now)).toThrow()
  })
  it('skips weekends in the selected zone', () =>
    expect(nextRun(input.schedule, now)).toBe(
      Date.parse('2026-09-21T01:00:00Z'),
    ))
  it('handles weekly and one-off dates', () => {
    expect(
      nextRun({ ...input.schedule, frequency: 'weekly', weekday: 5 }, now),
    ).toBe(Date.parse('2026-09-25T01:00:00Z'))
    expect(
      nextRun(
        { ...input.schedule, frequency: 'once', date: '2026-09-17' },
        now,
      ),
    ).toBeNull()
  })
  it('skips nonexistent spring-forward time', () =>
    expect(
      nextRun(
        {
          ...input.schedule,
          frequency: 'daily',
          time: '02:30',
          timezone: 'America/New_York',
        },
        Date.parse('2026-03-08T05:00:00Z'),
      ),
    ).toBe(Date.parse('2026-03-09T06:30:00Z')))
  it('does not dispatch twice in the fall-back hour', () =>
    expect(
      nextRun(
        {
          ...input.schedule,
          frequency: 'daily',
          time: '01:30',
          timezone: 'America/New_York',
        },
        Date.parse('2026-11-01T05:30:00Z'),
      ),
    ).toBe(Date.parse('2026-11-02T06:30:00Z')))
  it('rejects malformed values', () => {
    expect(() => validateTask({ ...input, title: ' ' })).toThrow()
    expect(() => nextRun({ ...input.schedule, time: '25:00' }, now)).toThrow()
    expect(() => nextRun({ ...input.schedule, timezone: 'bad' }, now)).toThrow()
  })
})
describe('durable task lifecycle', () => {
  it('persists create/edit/pause/resume and archives deletion without deleting runs', async () => {
    const { store, file } = await fixture()
    const t = await store.save(input)
    await store.action(t.id, 'pause')
    const again = new TaskStore(file, () => now)
    await again.load()
    expect(again.list()[0]?.state).toBe('paused')
    await again.save({ ...input, title: '改名' }, t.id)
    await again.action(t.id, 'resume')
    await again.claim(t.id, false)
    await again.action(t.id, 'delete')
    expect(again.list()).toHaveLength(0)
    expect(JSON.parse(await readFile(file, 'utf8')).tasks[0].runs).toHaveLength(
      1,
    )
  })
  it('atomically prevents overlapping manual runs', async () => {
    const { store } = await fixture()
    const t = await store.save(input)
    const claims = await Promise.all([
      store.claim(t.id, false),
      store.claim(t.id, false),
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
    await expect(store.save(input, t.id)).rejects.toThrow('运行中')
  })
  it('advances overdue plans once and does not run paused tasks', async () => {
    const { store } = await fixture()
    const t = await store.save(input)
    await store.change((tasks) => {
      tasks[0]!.nextRun = now - 86400000
    })
    expect(await store.claim(t.id, true)).not.toBeNull()
    await store.updateRun(t.id, store.list()[0]!.runs[0]!.id, {
      status: 'success',
    })
    expect(await store.claim(t.id, true)).toBeNull()
    await store.action(t.id, 'pause')
    expect(await store.claim(t.id, true)).toBeNull()
  })
})
describe('execution', () => {
  it('waits for actual turn completion and correlates the submitted prompt after restart', async () => {
    const { store, file } = await fixture()
    const t = await store.save(input)
    let requestId = ''
    let complete = false
    const calls: string[] = []
    const notices: string[] = []
    const rpc: Rpc = async <T>(
      method: string,
      _payload: unknown,
      rpcId?: string,
    ): Promise<T> => {
      calls.push(method)
      if (method === 'session.create') return { sessionId: 's' } as T
      if (method === 'session.models')
        return { current: { model: 'test' } } as T
      if (method === 'session.prompt') {
        expect(_payload).toMatchObject({mode: 'queue', content: [{type: 'text', text: input.prompt}]})
        expect(rpcId).toMatch(/^scheduled-run:execute:/)
        requestId = rpcId!
        return {} as T
      }
      if (method === 'session.history')
        return {
          events: complete
            ? [
                {
                  event: {
                    seq: 1,
                    type: 'user/message',
                    data: { source: { rpcId: requestId } },
                  },
                },
                {
                  event: {
                    seq: 2,
                    type: 'turn/end',
                    data: { reason: { kind: 'completed' } },
                  },
                },
              ]
            : [],
          hasMore: false,
        } as T
      return {} as T
    }
    const runner = new TaskRunner(
      store,
      rpc,
      () => true,
      (_t, r) => notices.push(r.status),
      () => now,
    )
    await runner.run(t.id)
    expect(store.list()[0]!.runs[0]!.status).toBe('running')
    expect(notices).toEqual([])
    const recovered = new TaskStore(file, () => now)
    await recovered.load()
    complete = true
    await new TaskRunner(
      recovered,
      rpc,
      () => true,
      (_t, r) => notices.push(r.status),
      () => now,
    ).tick()
    expect(recovered.list()[0]!.runs[0]!.status).toBe('success')
    expect(calls.filter((c) => c === 'session.prompt')).toHaveLength(1)
    expect(notices).toEqual(['success'])
  })
  it('records missing model as actionable failure with a retained dedicated session', async () => {
    const { store } = await fixture()
    const t = await store.save(input)
    const rpc: Rpc = async <T>(m: string): Promise<T> =>
      ({
        ...(m === 'session.create'
          ? { sessionId: 's' }
          : m === 'session.history'
            ? { events: [] }
            : {}),
      }) as T
    await new TaskRunner(
      store,
      rpc,
      () => true,
      () => {},
      () => now,
    ).run(t.id)
    const saved = store.list()[0]!
    expect(saved.sessionId).toBe('s')
    expect(saved.runs[0]!.error).toContain('模型')
    expect(saved.runs[0]!.status).toBe('failed')
  })
})

it('bundles nonempty original Figma vectors', async () => {
  const { icons } = await import('../src/preload/scheduled/icons')
  for (const value of Object.values(icons)) {
    const svg = value.startsWith('data:image/svg+xml;base64,')
      ? Buffer.from(value.slice(value.indexOf(',') + 1), 'base64').toString()
      : value.startsWith('data:image/svg+xml')
        ? decodeURIComponent(value.slice(value.indexOf(',') + 1))
        : await readFile(join('build/brand', value), 'utf8')
    expect(svg).toContain('<svg')
  }
})

it('persists a summarized title separately from the full instruction and retains it on schedule-only edits', async () => {
  const {file} = await fixture()
  let calls = 0
  const store = new TaskStore(file, () => now, async () => { calls++; return '新闻与开源项目精选' })
  await store.load()
  const prompt = '扫描最新新闻及github有没有什么牛逼的项目可以结合到目前的项目里的'
  const task = await store.save({...input,title:'定时任务',prompt})
  expect(task.title.length).toBeLessThanOrEqual(21)
  await vi.waitFor(() => expect(store.list()[0]!.title).toBe('新闻与开源项目精选'))
  expect(task.prompt).toBe(prompt)
  const reopened = new TaskStore(file, () => now)
  await reopened.load()
  expect(reopened.list()[0]!.title).toBe('新闻与开源项目精选')
  await store.save({...task,notification:'never'}, task.id)
  expect(calls).toBe(1)
  await store.save({...task,prompt:'整理项目周报'}, task.id)
  expect(calls).toBe(2)
  await vi.waitFor(() => expect(store.list()[0]!.title).toBe('新闻与开源项目精选'))
})

it('saves immediately while title generation is pending and ignores stale results', async () => {
  const {file} = await fixture()
  const resolve: ((title: string) => void)[] = []
  const store = new TaskStore(file, () => now, () => new Promise(r => resolve.push(r)))
  await store.load()
  const task = await store.save(input)
  expect(store.list()).toHaveLength(1)
  await store.save({...input, prompt:'新的任务描述'}, task.id)
  resolve[1]!('新的摘要')
  await vi.waitFor(() => expect(store.list()[0]!.title).toBe('新的摘要'))
  resolve[0]!('旧的摘要')
  await new Promise(r => setTimeout(r, 20))
  expect(store.list()[0]!.title).toBe('新的摘要')
})
it('keeps the saved task when background title generation fails', async () => {
  const {file} = await fixture()
  const store = new TaskStore(file, () => now, async () => { throw Error('timeout') })
  await store.load()
  const task = await store.save(input)
  await new Promise(r => setTimeout(r, 20))
  expect(store.list()[0]!.id).toBe(task.id)
  expect(store.list()[0]!.prompt).toBe(input.prompt)
})

describe('component task identity', () => {
  const component = { sessionId: 'board-session', nodeId: 'component-a', title: '市场指标', boardTitle: '研究画板' }
  it('persists the target and prevents duplicate component schedules', async () => {
    const { store, file } = await fixture()
    const t = await store.save({ ...input, component })
    expect(t).toMatchObject({ component })
    await expect(store.save({ ...input, component })).rejects.toThrow(/已.*定时任务/)
    const restored = new TaskStore(file, () => now)
    await restored.load()
    expect(restored.list()[0]).toMatchObject({ component })
    await expect(restored.save({ ...input, component: { ...component, nodeId: 'other' } }, t.id)).rejects.toThrow(/绑定/)
    await restored.action(t.id, 'delete')
    expect(await restored.save({ ...input, component })).toMatchObject({ component })
  })
  it('rejects malformed component targets rather than turning them into global tasks', () => {
    expect(() => validateTask({ ...input, component: { ...component, nodeId: '' } })).toThrow()
  })
})
