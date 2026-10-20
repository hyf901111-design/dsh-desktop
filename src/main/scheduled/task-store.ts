import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  nextRun,
  validateTask,
  type ScheduledTask,
  type TaskRun,
} from '../../shared/scheduled-tasks'
import { fallbackTaskTitle } from './task-title'
export class TaskStore {
  private titleRequests = new Map<string, symbol>()
  private tasks: ScheduledTask[] = []
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private file: string,
    private now = Date.now,
    private summarizeTitle?: (prompt: string) => Promise<string>,
  ) {}
  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.tasks))
        throw new Error('定时任务存储格式无效')
      for (const task of data.tasks) {
        const normalized = validateTask(task)
        if (
          typeof task.id !== 'string' ||
          !Array.isArray(task.runs) ||
          !['enabled', 'paused', 'completed'].includes(task.state)
        )
          throw new Error('定时任务数据无效')
        if (task.runs.some((run: TaskRun) => !run || !['running', 'success', 'failed', 'blocked'].includes(run.status)))
          throw new Error('定时任务执行记录无效')
        // Existing v1 files remain compatible; absent bindings grant no integration capability.
        task.integrationBindings = normalized.integrationBindings
      }
      this.tasks = data.tasks
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  list(includeDeleted = false): ScheduledTask[] {
    return structuredClone(
      this.tasks.filter((t) => includeDeleted || !t.deletedAt),
    )
  }
  async change<T>(operation: (tasks: ScheduledTask[]) => T): Promise<T> {
    const pending = this.queue.then(async () => {
      const copy = structuredClone(this.tasks)
      const result = operation(copy)
      await mkdir(dirname(this.file), { recursive: true })
      const temp = `${this.file}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify({ version: 1, tasks: copy }), {
        mode: 0o600,
      })
      await rename(temp, this.file)
      this.tasks = copy
      return structuredClone(result)
    })
    this.queue = pending.catch(() => {})
    return pending
  }
  async save(value: unknown, id?: string): Promise<ScheduledTask> {
    const input = validateTask(value)
    const previous = id ? this.tasks.find(task => task.id === id && !task.deletedAt) : undefined
    const needsTitle = !input.watch && !!this.summarizeTitle && (!previous || previous.prompt !== input.prompt || previous.title === previous.prompt)
    if (needsTitle) input.title = fallbackTaskTitle(input.prompt)
    else if (previous && this.summarizeTitle) input.title = previous.title
    const saved = await this.change((tasks) => {
      if(input.watch&&!id){
        const replay=tasks.find(t=>t.watch?.ownerAccountId===input.watch!.ownerAccountId&&t.watch.originSessionId===input.watch!.originSessionId&&t.watch.requestId===input.watch!.requestId)
        if(replay){if(replay.watch!.requestDigest!==input.watch.requestDigest)throw Error('相同创建请求不能以不同参数重放');if(replay.deletedAt)throw Error('该创建请求对应任务已删除，请重新发起设置');return replay}
      }
      let task = id ? tasks.find((t) => t.id === id && !t.deletedAt) : undefined
      if (id && !task) throw new Error('任务不存在')
      if (task && (task.component?.sessionId !== input.component?.sessionId || task.component?.nodeId !== input.component?.nodeId)) throw new Error('不能更改任务的组件绑定')
      if(task&&JSON.stringify(task.watch??null)!==JSON.stringify(input.watch??null))throw Error('不能在任务编辑中更改行情提醒规则，请通过原会话重新设置')
      if (input.component && tasks.some(t => !t.deletedAt && t.id !== id && t.component?.sessionId === input.component!.sessionId && t.component?.nodeId === input.component!.nodeId)) throw new Error('该组件已设有定时任务，请编辑已有任务')
      if (task?.runs.some((r) => r.status === 'running'))
        throw new Error('任务运行中，请完成后再编辑')
      const next = nextRun(input.schedule, this.now())
      if (!next) throw new Error('请选择未来的执行时间')
      if (task) {
        if (task.workspaceId !== input.workspaceId) delete task.sessionId
        Object.assign(task, input, {
          nextRun: task.state === 'paused' ? null : next,
        })
        if (task.state === 'completed') task.state = 'enabled'
      } else {
        task = {
          ...input,
          id: randomUUID(),
          state: 'enabled',
          nextRun: next,
          createdAt: this.now(),
          runs: [],
        }
        tasks.unshift(task)
      }
      return task
    })
    if (needsTitle) this.refineTitle(saved)
    return saved
  }
  private refineTitle(saved: ScheduledTask): void {
    const token = Symbol()
    this.titleRequests.set(saved.id, token)
    void Promise.resolve().then(() => this.summarizeTitle!(saved.prompt)).then(async title => {
      if (this.titleRequests.get(saved.id) !== token) return
      validateTask({ ...saved, title })
      await this.change(tasks => {
        const task = tasks.find(t => t.id === saved.id && !t.deletedAt)
        if (task && task.prompt === saved.prompt && this.titleRequests.get(saved.id) === token)
          task.title = title
      })
    }).catch(() => {
      // Creation already succeeded; retain its short local title on model failure.
    }).finally(() => {
      if (this.titleRequests.get(saved.id) === token) this.titleRequests.delete(saved.id)
    })
  }
  action(id: string, action: 'pause' | 'resume' | 'delete'): Promise<void> {
    return this.change((tasks) => {
      const t = tasks.find((t) => t.id === id && !t.deletedAt)
      if (!t) throw new Error('任务不存在')
      if (action === 'delete') {
        t.deletedAt = this.now()
        t.nextRun = null
        return
      }
      if (action === 'pause') {
        t.state = 'paused'
        t.nextRun = null
        return
      }
      const next = nextRun(t.schedule, this.now())
      if (!next) throw new Error('执行时间已过去，请先修改时间')
      t.state = 'enabled'
      t.nextRun = next
    })
  }
  claim(id: string, automatic: boolean): Promise<ScheduledTask | null> {
    return this.change((tasks) => {
      const t = tasks.find((t) => t.id === id && !t.deletedAt)
      if (!t || t.runs.some((r) => r.status === 'running')) return null
      if (
        automatic &&
        (t.state !== 'enabled' || t.nextRun === null || t.nextRun > this.now())
      )
        return null
      // An explicit one-off retry owns one new attempt, including recovery
      // after transport failures. Recurring paused plans stay paused.
      if(!automatic&&t.watch&&t.schedule.frequency==='once'&&t.state==='paused')t.state='enabled'
      t.runs.unshift({
        id: randomUUID(),
        startedAt: this.now(),
        status: 'running',
      })
      if(t.watch)t.runs=t.runs.slice(0,1000)
      // Advance before dispatch so wake-up catches up only once, never a burst.
      if (automatic)
        t.nextRun =
          t.schedule.frequency === 'once'
            ? null
            : nextRun(t.schedule, this.now())
      return t
    })
  }
  updateRun(
    id: string,
    runId: string,
    patch: Partial<TaskRun>,
    sessionId?: string,
  ): Promise<void> {
    return this.change((tasks) => {
      const t = tasks.find((t) => t.id === id)
      const r = t?.runs.find((r) => r.id === runId)
      if (!t || !r) return
      Object.assign(r, patch)
      if(patch.status==='success'&&patch.watchResult&&t.state!=='paused'&&!t.deletedAt)t.watchAlertKeys=[...new Set([...(t.watchAlertKeys??[]),...patch.watchResult.alertKeys])].slice(-100)
      if (sessionId) t.sessionId = sessionId
      // A blocked manual attempt also consumes an already-due instant. Recovery
      // waits for the next future plan instead of producing another block on tick.
      if (patch.status === 'blocked' && t.state === 'enabled' && t.nextRun !== null && t.nextRun <= this.now())
        t.nextRun = t.schedule.frequency === 'once' ? null : nextRun(t.schedule, this.now())
      if (
        patch.status === 'success' &&
        t.schedule.frequency === 'once' &&
        t.state === 'enabled'
      ) {
        t.state = 'completed'
        t.nextRun = null
      }
      if (
        (patch.status === 'failed' || patch.status === 'blocked') &&
        t.schedule.frequency === 'once' &&
        t.nextRun === null
      )
        t.state = 'paused'
    })
  }
}
