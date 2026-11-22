import { scheduledResultUnchanged, scheduledRunId } from '../../../packages/dsh-research-task-runtime/scheduled-run.js'
import type { ComponentExecutor } from './component-executor'
import type {MarketWatchExecutor} from './market-watch-executor'
import { randomUUID } from 'node:crypto'
import { TaskStore } from './task-store'
import type { ScheduledTask, TaskRun } from '../../shared/scheduled-tasks'
type Event = { seq: number; type: string; data: any }
export type TaskIntegrationPreflight = (task: ScheduledTask, run: TaskRun) =>
  Promise<{ ready: boolean; issues: Array<{ message: string }> }> | { ready: boolean; issues: Array<{ message: string }> }
export type Rpc = <T = any>(
  method: string,
  payload: unknown,
  rpcId?: string,
) => Promise<T>
export function harnessRpc(url: () => string | undefined): Rpc {
  return async <T>(
    method: string,
    payload: unknown,
    rpcId: string = randomUUID(),
  ): Promise<T> => {
    const base = url()
    if (!base) throw new Error('执行服务未就绪，请稍后重试')
    const response = await fetch(new URL(`/api/${method}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`执行服务返回 HTTP ${response.status}`)
    const body = (await response.json()) as any
    if (body.rpcId !== rpcId || body.result?.ok !== true)
      throw new Error(body.result?.error?.message || '执行请求失败')
    return body.result.value as T
  }
}
export class TaskRunner {
  private active = new Set<string>()
  private ticking = false
  private timer?: ReturnType<typeof setInterval>
  constructor(
    private store: TaskStore,
    private rpc: Rpc,
    private ready: () => boolean,
    private notify: (task: ScheduledTask, run: TaskRun) => void,
    private now = Date.now,
    private componentExecutor?: ComponentExecutor,
    private integrationPreflight?: TaskIntegrationPreflight,
    private watchExecutor?: MarketWatchExecutor,
  ) {}
  start() {
    this.timer = setInterval(() => void this.tick().catch(console.error), 15000)
    void this.tick().catch(console.error)
  }
  stop() {
    clearInterval(this.timer)
  }
  async tick() {
    if (this.ticking || !this.ready()) return
    this.ticking = true
    try {
      for (const t of this.store.list(true)) {
        const running = t.runs.find((r) => r.status === 'running')
        if (running) {
          if (!this.active.has(t.id)) {
            try {
              await this.reconcile(t, running)
            } catch (error) {
              console.error('[scheduled-tasks] reconcile', t.id, error)
            }
          }
          continue
        }
        if (
          !t.deletedAt &&
          t.state === 'enabled' &&
          t.nextRun !== null &&
          t.nextRun <= this.now()
        )
          await this.run(t.id, true)
      }
    } finally {
      this.ticking = false
    }
  }
  async run(id: string, automatic = false): Promise<void> {
    if (!this.ready()) throw new Error('执行服务未就绪')
    if (this.active.has(id)) throw new Error('任务正在运行')
    this.active.add(id)
    try {
      const task = await this.store.claim(id, automatic)
      if (!task) {
        if (!automatic) throw new Error('任务不存在或正在运行')
        return
      }
      const run = task.runs[0]!
      let dispatching = false
      try {
        if(task.watch){
          if(!this.watchExecutor)throw Error('后台行情提醒服务未就绪')
          const watchResult=await this.watchExecutor.execute(task,run)
          if(watchResult.waitingForQuote&&task.schedule.frequency==='once')watchResult.summary+=' 一次性计划已暂停；新报价到来后可在任务菜单“立即运行”重试。'
          await this.store.updateRun(task.id,run.id,{watchResult})
          await this.finish(task,{...run,watchResult},watchResult.waitingForQuote?'blocked':'success',watchResult.waitingForQuote?watchResult.summary:undefined,watchResult.noChange)
          return
        }
        if (task.integrationBindings?.length && !this.integrationPreflight) {
          await this.finish(task, run, 'blocked', '任务所需能力的检查服务尚未就绪，请稍后重试')
          return
        }
        if (this.integrationPreflight) {
          let preflight: Awaited<ReturnType<TaskIntegrationPreflight>>
          try { preflight = await this.integrationPreflight(task, run) }
          catch {
            await this.finish(task, run, 'blocked', '无法核验任务所需的连接或插件，请检查能力设置后重试')
            return
          }
          if (!preflight.ready) {
            await this.finish(task, run, 'blocked', preflight.issues.map(issue => issue.message).filter(Boolean).slice(0, 5).join('；') || '任务所需的连接或插件不可用，请检查能力设置')
            return
          }
        }
        if (task.component) {
          if (!this.componentExecutor) throw Error('组件执行服务未就绪')
          dispatching = true
          await this.componentExecutor.start(task, run)
          return
        }
        const sessionId =
          task.sessionId ||
          (await this.rpc('session.create', { workspaceId: task.workspaceId }))
            .sessionId
        if (typeof sessionId !== 'string') throw new Error('未能创建专属对话')
        const rpcId = scheduledRunId(randomUUID(), task.notification)
        await this.store.updateRun(id, run.id, { sessionId, rpcId }, sessionId)
        const history = await this.rpc('session.history', {
          sessionId,
          maxMessages: 20,
        })
        const events = (history.events || []).map((e: any) => e.event as Event)
        if (
          [...events]
            .reverse()
            .find(
              (e: Event) => e.type === 'turn/start' || e.type === 'turn/end',
            )?.type === 'turn/start'
        )
          throw new Error('专属对话正在执行其他内容，请稍后重试')
        await this.rpc('session.rename', { sessionId, title: task.title })
        // Ordinary session execution owns model selection and permission policy.
        const models = await this.rpc('session.models', { sessionId })
        if (!models.current)
          throw new Error('专属对话尚未选择模型，请打开对话选择模型后重试')
        dispatching = true
        await this.rpc(
          'session.prompt',
          {
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: task.prompt }],
            clientTimeZone: task.schedule.timezone,
          },
          rpcId,
        )
      } catch (error) {
        // A lost transport response is not proof of rejection. Reconcile the
        // durable rpcId instead of allowing a second run to duplicate effects.
        if (
          dispatching &&
          (error instanceof TypeError ||
            (error instanceof Error &&
              /timeout|abort|HTTP|fetch|network|画布操作响应超时/i.test(error.message)))
        )
          return
        await this.finish(
          task,
          run,
          'failed',
          error instanceof Error ? error.message : String(error),
        )
      }
    } finally {
      this.active.delete(id)
    }
  }
  private async reconcile(task: ScheduledTask, run: TaskRun) {
    if(task.watch){
      if(run.watchResult)await this.finish(task,run,run.watchResult.waitingForQuote?'blocked':'success',run.watchResult.waitingForQuote?run.watchResult.summary:undefined,run.watchResult.noChange)
      else await this.finish(task,run,'failed','上次行情检查在客户端退出前未完成；下次计划会重新查询')
      return
    }
    if (task.component) {
      if (!this.componentExecutor) return
      try {
        const result = await this.componentExecutor.inspect(task, run)
        if (result.status !== 'running') await this.finish(task, run, result.status, result.error, result.noChange)
        else if (this.now() - run.startedAt > 24 * 60 * 60 * 1000) await this.finish(task, run, 'failed', '组件更新超时，请检查后重试')
      } catch (error) {
        // Preserve transport failures for a later durable reconciliation.
        if (error instanceof TypeError || /timeout|abort|HTTP|fetch|network|画布操作响应超时/i.test(String(error))) return
        await this.finish(task, run, 'failed', error instanceof Error ? error.message : String(error))
      }
      return
    }
    if (!run.sessionId || !run.rpcId) {
      await this.finish(task, run, 'failed', '上次执行在提交前中断；请手动重试')
      return
    }
    // Page back until this run's prompt, so long tool runs cannot hide completion.
    let events: Event[] = []
    let beforeSeq: number | undefined
    for (let page = 0; page < 100; page++) {
      const history = await this.rpc('session.history', {
        sessionId: run.sessionId,
        maxMessages: 100,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
      })
      const part: Event[] = (history.events || []).map((e: any) => e.event)
      events = [...part, ...events]
      if (
        events.some(
          (e) =>
            e.type === 'user/message' &&
            (e.data.message || e.data).source?.rpcId === run.rpcId,
        ) ||
        !history.hasMore ||
        !part.length
      )
        break
      beforeSeq = part[0]!.seq
    }
    const start = events.findIndex(
      (e) =>
        e.type === 'user/message' &&
        (e.data.message || e.data).source?.rpcId === run.rpcId,
    )
    const end =
      start >= 0
        ? events.slice(start + 1).find((e) => e.type === 'turn/end')
        : undefined
    if (end) {
      const reason = end.data.reason
      const output = events
        .slice(start + 1, events.indexOf(end))
        .filter((e) => e.type === 'assistant/message')
        .flatMap((e) =>
          (e.data.message?.content || [])
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text),
        )
        .join('\n')
      await this.finish(
        task,
        run,
        reason?.kind === 'completed' ? 'success' : 'failed',
        reason?.kind === 'completed'
          ? undefined
          : reason?.error?.message ||
              `执行未完成：${reason?.kind || '未知原因'}`,
        scheduledResultUnchanged(output),
      )
    } else if (this.now() - run.startedAt > 24 * 60 * 60 * 1000) {
      await this.finish(
        task,
        run,
        'failed',
        '未收到完成结果，请检查专属对话；不会自动重试以避免重复执行',
      )
    }
  }
  private async finish(
    task: ScheduledTask,
    run: TaskRun,
    status: 'success' | 'failed' | 'blocked',
    error?: string,
    noChange = false,
  ) {
    const patch = {
      status,
      finishedAt: this.now(),
      ...(error ? { error } : {}),
      ...(task.watch&&run.watchResult&&this.watchExecutor?.isOwner(task)?{watchResult:run.watchResult}:{}),
    }
    await this.store.updateRun(task.id, run.id, patch)
    if(run.watchResult?.waitingForQuote)return
    if(task.watch&&(!this.watchExecutor?.isOwner(task)||!this.store.list().some(t=>t.id===task.id&&t.state!=='paused')))return
    if (
      !task.deletedAt &&
      task.notification !== 'never' &&
      (task.watch ? status === 'success' ? !noChange : task.runs.slice(1).find(r=>r.status!=='running')?.status !== status : status === 'failed' || status === 'blocked' || task.notification === 'always' || !noChange)
    )
      this.notify(task, { ...run, ...patch })
  }
}
