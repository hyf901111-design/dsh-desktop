import { createHash } from 'node:crypto'
import type { ScheduledTask, TaskRun, ComponentTarget } from '../../shared/scheduled-tasks'
import type { TaskStore } from './task-store'
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type ComponentExecutor = {
  start(task: ScheduledTask, run: TaskRun): Promise<void>
  inspect(task: ScheduledTask, run: TaskRun): Promise<{status: 'running' | 'success' | 'failed'; error?: string; noChange?: boolean}>
}
export class ScheduledComponentExecutor implements ComponentExecutor {
  constructor(private store: TaskStore, private canvas: (target: ComponentTarget, method: string, args: unknown) => Promise<any>, private runtime: (method: string, args: unknown) => Promise<any>) {}
  async target(target: ComponentTarget) {
    const snapshot = await this.canvas(target, 'inspect', {ids:[target.nodeId]})
    const node = snapshot.nodes.find((n: any) => n.id === target.nodeId)
    if (!snapshot.writable || node?.kind !== 'generated-container' || !node.content?.containerSpec || !node.capabilities.fields.containerSpec) throw Error('组件不存在、不可编辑或正在生成，请稍后重试')
    return {snapshot, node}
  }
  async start(task: ScheduledTask, run: TaskRun) {
    const {node} = await this.target(task.component!)
    const rpcId = 'scheduled:' + run.id
    const baseline = fingerprint(node.content.containerSpec)
    await this.store.updateRun(task.id, run.id, {rpcId, componentBaseline:baseline})
    await this.runtime('start', {taskId:rpcId,sessionId:task.component!.sessionId,kind:'container',query:task.prompt.slice(0,4000),
      prompt:`这是组件定时更新的一次执行，仅交付此组件的新内容，不创建定时任务，不操作其他组件。保留现有组件类型和结构，按用户要求更新数据。\n用户要求：${task.prompt}\n现有组件：${JSON.stringify(node.content.containerSpec)}`})
  }
  async inspect(task: ScheduledTask, run: TaskRun): ReturnType<ComponentExecutor['inspect']> {
    if (!run.rpcId || !run.componentBaseline) return {status:'failed',error:'上次组件更新在提交前中断，请手动重试'}
    const result = await this.runtime('inspect', {taskId:run.rpcId})
    if (['queued','running'].includes(result.status)) return {status:'running'}
    if (result.status !== 'completed') return {status:'failed',error:result.error || '组件更新未完成'}
    const spec = JSON.parse(result.text)
    const {snapshot,node} = await this.target(task.component!)
    const current = fingerprint(node.content.containerSpec), updated = fingerprint(spec)
    // A persisted result can be reconciled after restart without publishing it twice.
    if (current === updated) return {status:'success',noChange:updated === run.componentBaseline}
    if (current !== run.componentBaseline) return {status:'failed',error:'组件内容已被修改，本次结果未覆盖你的更改'}
    const latest = this.store.list().find(t => t.id === task.id)
    if (!latest) return {status:'failed',error:'任务已删除，本次结果未写入组件'}
    await this.canvas(task.component!, 'apply', {requestId:run.id,revision:snapshot.revision,changes:[{op:'update',id:task.component!.nodeId,fields:{containerSpec:spec}}]})
    return {status:'success',noChange:false}
  }
}
