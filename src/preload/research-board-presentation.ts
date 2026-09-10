import { taskFailureMessage } from '../../packages/dsh-research-collaboration/protocol.js'

/** Retried requests show their current state once; prior attempts remain inspectable. */
export function boardTaskAttempts<T extends { createdAt?: number; targetId?: string | null }>(tasks: T[]) {
  const ordered = tasks.map((task, index) => ({ task, index }))
    .sort((a, b) => (b.task.createdAt ?? 0) - (a.task.createdAt ?? 0) || b.index - a.index)
    .map(({ task }) => task)
  const current: T[] = [], previous: T[] = [], targets = new Set<string | null>()
  for (const task of ordered) {
    const target = task.targetId ?? null
    if (targets.has(target)) previous.push(task)
    else { targets.add(target); current.push(task) }
  }
  return { current, previous }
}

export function boardTaskStatus(task: { status: string; failureCode?: unknown }) {
  if (task.status === 'pending') return '研究任务等待执行'
  if (task.status === 'running') return '正在研究…'
  if (task.status === 'interrupted') return '研究任务已中断。'
  if (task.status === 'failed') return taskFailureMessage(task.failureCode) ?? taskFailureMessage('GENERATION_FAILED')
  return undefined
}
/** Selection actions require usable content, including completed generated containers. */
export function selectionNodeReady(node: {
  kind?: string
  generationStatus?: string
  containerSpec?: unknown
}) {
  if (
    [
      'draft',
      'queued',
      'pending',
      'running',
      'generating',
      'resolving'
    ].includes(node.generationStatus ?? '')
  )
    return false
  return node.kind !== 'generated-container' || !!node.containerSpec
}
export function boardEditTime(value?: number, now = Date.now()) {
  if (!value || !Number.isFinite(value)) return '—'
  const age = Math.max(0, now - value)
  if (age < 60000) return '刚刚'
  for (const [size, label] of [
    [31536000000, '年'],
    [2592000000, '个月'],
    [86400000, '天'],
    [3600000, '小时'],
    [60000, '分钟']
  ] as const)
    if (age >= size) return `${Math.floor(age / size)}${label}`
  return '刚刚'
}
