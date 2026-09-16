type ConversationTask = {
  taskId: string
  requestMessageId?: unknown
  conversation?: unknown
  status: string
  createdAt?: number
  completedAt?: unknown
  pausedAt?: unknown
  resumeCount?: unknown
  conversationDisplayOrder?: unknown
}
type Message = { id: string; role?: string; taskId?: unknown; requestMessageId?: unknown }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Move whole turns, never clone an answer or change queue/executor state. */
export function orderBoardConversationGroups<T extends { requestId?: string }>(
  groups: T[], tasks: ConversationTask[], messages: Message[]
): T[] {
  const current = new Map<string, ConversationTask>()
  for (const task of tasks) {
    if (!task.conversation || typeof task.requestMessageId !== 'string') continue
    const previous = current.get(task.requestMessageId)
    if (!previous || (task.createdAt ?? 0) >= (previous.createdAt ?? 0)) current.set(task.requestMessageId, task)
  }
  if (![...current.values()].some(t => Number(t.resumeCount) > 0)) return groups
  const resultPosition = new Map<unknown, number>()
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && message.taskId) resultPosition.set(message.taskId, index)
  })
  const turns = groups.flatMap((group, index) => {
    const task = group.requestId && current.get(group.requestId)
    return task ? [{ group, task, index }] : []
  })
  const legacyTime = (task: ConversationTask) => {
    if (task.status === 'running') return Number.POSITIVE_INFINITY
    if (task.status === 'pending' && finite(task.pausedAt)) return task.pausedAt
    return finite(task.completedAt) ? task.completedAt : task.createdAt ?? 0
  }
  turns.sort((a, b) => {
    const x = a.task.conversationDisplayOrder, y = b.task.conversationDisplayOrder
    // Claim sequences are committed by the serialized board transaction. A paused
    // task keeps its last claim's position until the next claim succeeds.
    if (finite(x) && finite(y)) return x - y || a.index - b.index
    if (finite(x) !== finite(y)) return finite(x) ? 1 : -1
    // Older servers expose completion time and the append-only message array.
    // Use result insertion order to disambiguate completions in the same ms.
    const delta = legacyTime(a.task) - legacyTime(b.task)
    if (delta) return delta
    return (resultPosition.get(a.task.taskId) ?? a.index) - (resultPosition.get(b.task.taskId) ?? b.index)
  })
  let next = 0
  return groups.map(group => group.requestId && current.has(group.requestId) ? turns[next++]!.group : group)
}
