export type Schedule = {
  frequency: 'once' | 'daily' | 'weekdays' | 'weekly'
  time: string
  timezone: string
  weekday: number
  date: string
}
export type ComponentTarget = { sessionId: string; nodeId: string; title: string; boardTitle: string }
export type TaskInput = {
  integrationBindings?: IntegrationBinding[]
  component?: ComponentTarget
  title: string
  prompt: string
  workspaceId: string
  schedule: Schedule
  notification: 'always' | 'changes' | 'never'
}
export type TaskRun = {
  id: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'success' | 'failed' | 'blocked'
  error?: string
  sessionId?: string
  rpcId?: string
  componentBaseline?: string
  dataRefreshResult?: {status:'success'|'failed';error?:string;noChange?:boolean}
}
export type ScheduledTask = TaskInput & {
  id: string
  state: 'enabled' | 'paused' | 'completed'
  nextRun: number | null
  createdAt: number
  sessionId?: string
  deletedAt?: number
  runs: TaskRun[]
}
export type WorkspaceChoice = {
  workspaceId: string
  title?: string
  path: string
}
export interface ScheduledTaskBridge {
  list(): Promise<ScheduledTask[]>
  save(input: TaskInput, id?: string): Promise<ScheduledTask>
  action(
    id: string,
    action: 'pause' | 'resume' | 'run' | 'delete',
  ): Promise<void>
  workspaces(): Promise<WorkspaceChoice[]>
}
export function validateTask(value: unknown): TaskInput {
  const v = value as TaskInput
  if (
    !v ||
    typeof v.title !== 'string' ||
    !v.title.trim() ||
    v.title.length > 120
  )
    throw new Error('请输入 1–120 字的任务名称')
  if (
    typeof v.prompt !== 'string' ||
    !v.prompt.trim() ||
    v.prompt.length > 20000
  )
    throw new Error('请输入执行指令（最多 20000 字）')
  if (
    typeof v.workspaceId !== 'string' ||
    (!v.workspaceId && !v.component) ||
    v.workspaceId.length > 512
  )
    throw new Error('请选择工作区')
  if (!['always', 'changes', 'never'].includes(v.notification))
    throw new Error('通知方式无效')
  if (v.component !== undefined && (!v.component || ['sessionId', 'nodeId', 'title', 'boardTitle'].some(k => typeof (v.component as any)[k] !== 'string' || !(v.component as any)[k].trim() || (v.component as any)[k].length > 256)))
    throw new Error('组件绑定无效')
  validateSchedule(v.schedule)
  return {
    integrationBindings: validateIntegrationBindings(v.integrationBindings),
    title: v.title.trim(),
    prompt: v.prompt.trim(),
    workspaceId: v.workspaceId,
    schedule: { ...v.schedule },
    notification: v.notification,
    ...(v.component ? { component: { sessionId: v.component.sessionId, nodeId: v.component.nodeId, title: v.component.title, boardTitle: v.component.boardTitle } } : {}),
  }
}

/** Task approval is copied and validated independently of mutable connection-wide grants. */
export function validateIntegrationBindings(value: unknown): IntegrationBinding[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64) throw new Error('任务能力绑定无效（最多 64 项）')
  const validId = (id: unknown): id is string => typeof id === 'string' && !!id.trim()
    && id.length <= 512 && !/[\u0000-\u001f]/u.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id)
  const seen = new Set<string>()
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('任务能力绑定格式无效')
    const item = raw as Record<string, unknown>
    if (!validId(item.entityId) || !['connection', 'plugin', 'skill'].includes(String(item.kind))
      || !Number.isSafeInteger(item.bindingRevision) || Number(item.bindingRevision) < 1
      || typeof item.allowWrite !== 'boolean') throw new Error('任务能力绑定或批准版本无效')
    const key = `${item.kind}:${item.entityId}`
    if (seen.has(key)) throw new Error('任务能力绑定不能重复')
    seen.add(key)
    if (!Array.isArray(item.toolIds) || item.toolIds.length > 1000 || item.toolIds.some(id => !validId(id))
      || new Set(item.toolIds).size !== item.toolIds.length) throw new Error('任务批准的工具列表无效')
    const schema = item.schemaDigests
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(schema))) throw new Error('任务工具版本无效')
    const digests = schema as Record<string, unknown>
    if (Object.keys(digests).length !== item.toolIds.length || item.toolIds.some(id => !Object.hasOwn(digests, id) || typeof digests[id] !== 'string' || !/^[a-f0-9]{64}$/u.test(digests[id] as string))) {
      throw new Error('任务工具版本必须与批准的工具一一对应')
    }
    return { entityId: item.entityId, kind: item.kind as IntegrationBinding['kind'], bindingRevision: item.bindingRevision as number,
      toolIds: [...item.toolIds] as string[], schemaDigests: Object.fromEntries(item.toolIds.map(id => [id, digests[id]])) as Record<string, string>, allowWrite: item.allowWrite }
  })
}
export function validateSchedule(s: Schedule): void {
  if (
    !s ||
    !['once', 'daily', 'weekdays', 'weekly'].includes(s.frequency) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.time)
  )
    throw new Error('执行时间无效')
  if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6)
    throw new Error('请选择星期')
  if (typeof s.timezone !== 'string' || !s.timezone)
    throw new Error('请选择时区')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s.timezone }).format()
  } catch {
    throw new Error('时区无效')
  }
  if (
    s.frequency === 'once' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      new Date(s.date + 'T00:00:00Z').toISOString().slice(0, 10) !== s.date)
  )
    throw new Error('请选择有效日期')
}
// Search actual instants in the chosen zone. This skips nonexistent DST wall times
// and chooses the first future occurrence during a repeated hour.
export function nextRun(s: Schedule, after = Date.now()): number | null {
  validateSchedule(s)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: s.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  let limit = after + 9 * 86400000
  if (s.frequency === 'once') {
    const date = Date.parse(s.date + 'T00:00:00Z')
    if (date + 2 * 86400000 < after) return null
    after = Math.max(after, date - 86400000)
    limit = date + 2 * 86400000
  }
  for (
    let t = Math.floor(after / 60000) * 60000 + 60000;
    t <= limit;
    t += 60000
  ) {
    const p = Object.fromEntries(
      formatter.formatToParts(t).map((x) => [x.type, x.value]),
    )
    if (`${p.hour}:${p.minute}` !== s.time) continue
    const day = days.indexOf(p.weekday!)
    if (s.frequency === 'weekdays' && (day === 0 || day === 6)) continue
    if (s.frequency === 'weekly' && day !== s.weekday) continue
    if (s.frequency === 'once' && `${p.year}-${p.month}-${p.day}` !== s.date)
      continue
    if (s.frequency !== 'once') {
      // A repeated fall-back clock time belongs to the same calendar run.
      let repeated = false
      for (let offset = 15; offset <= 180; offset += 15) {
        const previous = Object.fromEntries(
          formatter
            .formatToParts(t - offset * 60000)
            .map((x) => [x.type, x.value]),
        )
        if (
          previous.year === p.year &&
          previous.month === p.month &&
          previous.day === p.day &&
          previous.hour === p.hour &&
          previous.minute === p.minute
        ) {
          repeated = true
          break
        }
      }
      if (repeated) continue
    }
    return t
  }
  return null
}
export function scheduleLabel(s: Schedule): string {
  return `${s.frequency === 'once' ? s.date : s.frequency === 'weekly' ? '每周' + '日一二三四五六'[s.weekday] : s.frequency === 'weekdays' ? '工作日' : '每天'} ${s.time}`
}

export function timezoneLabel(zone: string): string {
  return (
    (
      {
        'Asia/Shanghai': '北京时间',
        'Asia/Hong_Kong': '香港时间',
        'Asia/Tokyo': '东京时间',
        'America/New_York': '纽约时间',
        'Europe/London': '伦敦时间',
        UTC: 'UTC',
      } as Record<string, string>
    )[zone] || zone
  )
}
import type { IntegrationBinding } from './integrations'
