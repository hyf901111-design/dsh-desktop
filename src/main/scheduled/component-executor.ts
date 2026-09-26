import type { ScheduledTask, TaskRun, ComponentTarget } from '../../shared/scheduled-tasks'
import type { TaskStore } from './task-store'
export type ComponentExecutor = {
  start(task: ScheduledTask, run: TaskRun): Promise<void>
  inspect(task: ScheduledTask, run: TaskRun): Promise<{status: 'running' | 'success' | 'failed'; error?: string; noChange?: boolean}>
}
export class ScheduledComponentExecutor implements ComponentExecutor {
  constructor(private store: TaskStore, private canvas: (target: ComponentTarget, method: string, args: unknown) => Promise<any>, private refresh: (target: ComponentTarget) => Promise<{status:string;error?:string}|undefined>) {}
  async target(target: ComponentTarget) {
    const snapshot = await this.canvas(target, 'inspect', {ids:[target.nodeId]})
    const node = snapshot.nodes.find((n: any) => n.id === target.nodeId)
    if (!snapshot.writable || node?.kind !== 'generated-container' || !node.content?.containerSpec || !node.capabilities.fields.containerSpec) throw Error('组件不存在、不可编辑或正在生成，请稍后重试')
    return {snapshot, node}
  }
  async start(task: ScheduledTask, run: TaskRun) {
    await this.target(task.component!)
    await this.store.updateRun(task.id,run.id,{rpcId:'component-data:'+run.id})
    // The data executor owns request validation, mapping, deduplication and CAS.
    // A scheduled component never starts a model or sends its rendered HTML.
    const result = await this.refresh(task.component!)
    await this.store.updateRun(task.id,run.id,{dataRefreshResult:result?.status==='success'||result?.status==='unchanged'
      ? {status:'success',noChange:result.status==='unchanged'}
      : {status:'failed',error:result?.error||'组件数据更新未完成'}})
  }
  async inspect(_task: ScheduledTask, run: TaskRun): ReturnType<ComponentExecutor['inspect']> {
    return run.dataRefreshResult ?? {status:'failed',error:'上次数据刷新在客户端退出前未完成，请重试'}
  }
}
