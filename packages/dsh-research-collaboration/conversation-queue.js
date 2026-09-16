// Called only inside the board Durable Object's serialized command transaction.
const reject = code => { throw Object.assign(Error(code), { code, status: 409 }) }
export function queuedConversations(state) {
  return state.tasks.filter(t => t.conversation && t.status === 'pending')
    .sort((a,b) => (a.queueOrder ?? a.createdAt ?? 0) - (b.queueOrder ?? b.createdAt ?? 0))
}
export function assertConversationClaim(state, task) {
  const running = state.tasks.filter(t => t.status === 'running')
  if (task.conversation) {
    if (running.length || queuedConversations(state)[0]?.taskId !== task.taskId || state.tasks.some(t => !t.conversation && t.status === 'pending')) reject('CONVERSATION_BUSY')
  } else if (running.some(t => t.conversation && t.requestMessageId !== task.requestMessageId)) reject('CONVERSATION_BUSY')
}
export function mutateQueuedConversation(state, taskId, userId, action, text) {
  const task = state.tasks.find(t => t.taskId === taskId)
  if (!task || task.initiatorId !== userId) reject('REQUEST_AUTHOR_REQUIRED')
  if (!task.conversation || task.status !== 'pending') reject('QUEUE_ALREADY_STARTED')
  const message = state.messages.find(m => m.id === task.requestMessageId)
  if (action === 'edit') {
    if (typeof text !== 'string' || !text.trim() || new TextEncoder().encode(text).length > 16384) reject('INVALID_INPUT')
    message.text = text
  } else if (action === 'delete') {
    task.status = 'interrupted'
    message.queueDeleted = true
  } else if (action === 'promote') {
    task.queueOrder = Math.min(0, ...queuedConversations(state).map(t => t.queueOrder ?? t.createdAt ?? 0)) - 1
    for (const active of state.tasks.filter(t => t.status === 'running')) active.stopRequested = true
  } else reject('INVALID_INPUT')
  return task
}
export function conversationContext(state, task) {
  const waiting = new Set(queuedConversations(state).map(t => t.requestMessageId))
  const admitted = new Set(state.tasks.filter(t => t.status !== 'pending').map(t => t.requestMessageId))
  const request = state.messages.find(m => m.id === task.requestMessageId)
  return { history: state.history, messages: [...state.messages.filter(m => !m.queueDeleted && m.id !== request.id && !waiting.has(m.id) && (m.role !== 'user' || admitted.has(m.id))), request] }
}
