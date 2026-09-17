import { taskFailureMessage } from '../../packages/dsh-research-collaboration/protocol.js'
import type { BoardView } from '../shared/research-boards'

/** Full membership is independent of presence; disconnected peers remain discoverable. */
export function boardMembers(view: Pick<BoardView, 'members' | 'presence' | 'connection'>, selfId?: string) {
  const presence = new Map((view.presence ?? []).map(member => [member.userId, member]))
  const members = [...new Map((view.members ?? view.presence ?? []).map(member => [member.userId, member])).values()]
  return members.map(member => ({
    ...member,
    self: member.userId === selfId,
    online: view.connection === 'online' && presence.has(member.userId),
    editing: !!presence.get(member.userId)?.selectedIds?.length
  })).sort((a, b) => Number(b.online) - Number(a.online) || Number(b.self) - Number(a.self) || (a.joinedAt ?? 0) - (b.joinedAt ?? 0))
}

export function boardEntryActions(entry: { boardId?: string; sharingState?: string; role?: string }) {
  const collaboration = !!entry.boardId && entry.sharingState === 'shared'
  return [
    { id: 'rename', label: '重命名', disabled: !!entry.boardId && entry.role !== 'owner' },
    { id: 'collaboration', label: collaboration ? '管理协作' : '共享协作' },
    ...(!collaboration ? [{ id: 'workspace', label: '放回工作区' }] : []),
    ...(!entry.boardId ? [{ id: 'delete', label: '删除' }] : [])
  ]
}

/** Figma 307:573/581/589 mesh palettes, shared consistently by every member surface. */
export function boardAvatarBackground(userId: string, self = false) {
  if (self) return 'url(/figma-self-avatar.png) center / cover no-repeat'
  const palettes = [
    ['55,90,181', '45,171,177', '119,103,201', '134,214,209'],
    ['82,107,69', '127,166,103', '68,158,145', '210,197,132'],
    ['133,70,167', '239,120,104', '189,97,191', '244,175,136']
  ]
  const [base, top, left, right] = palettes[Array.from(userId).reduce((n, c) => n + c.charCodeAt(0), 0) % palettes.length]!
  return `radial-gradient(ellipse 70% 70% at 88% 88%,rgba(${right},.94),rgba(${right},.799) 32%,rgba(${right},0)),radial-gradient(ellipse 66% 70% at 20% 81%,rgba(${left},.84),rgba(${left},.714) 32%,rgba(${left},0)),radial-gradient(ellipse 82% 85% at 75% 13%,rgb(${top}),rgba(${top},.85) 32%,rgba(${top},0)),rgb(${base})`
}

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

export function boardTaskStatus(task: { status: string; failureCode?: unknown; resumeCount?: number; yieldRequested?: boolean }) {
  if (task.status === 'running' && task.yieldRequested) return '正在暂存当前任务，优先处理插队消息…'
  if (task.status === 'pending' && task.resumeCount) return '任务已暂存，插队消息处理完成后自动继续。'
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

/** Only entries currently in Boards are restricted; returned workspace sessions keep their views. */
export function boardOnlySession(state: {favorites: {sessionId: string; pinned?: boolean}[]; boards: {localSessionId?: string; pinned?: boolean}[]}, id?: string) {
  return !!id && (state.favorites.some(f => f.sessionId === id && f.pinned !== false) || state.boards.some(b => b.localSessionId === id && b.pinned === true))
}
export function boardRequestPresentation(request: {state?: string; requestMessageId?: string; runtimeState?: string; submissionState?: string; failureCode?: unknown}, tasks: {requestMessageId?: string; status?: string}[]) {
  if (request.runtimeState === 'superseded') return null
  const interrupted = ['interrupted', 'uncertain'].includes(request.runtimeState ?? '') || request.submissionState === 'interrupted'
  if (interrupted) return {kind:'retry', text:taskFailureMessage(request.failureCode) ?? '执行已中断或结果未确认；不会自动重复调用模型。'}
  // Board events can arrive before the request journal refresh. Never regress a known task to creation failure.
  if (request.requestMessageId && tasks.some(t => t.requestMessageId === request.requestMessageId)) return null
  if (request.state === 'taskCreateFailed') return {kind:'retry',text:taskFailureMessage(request.failureCode) ?? '消息已保存，任务尚未启动。'}
  if (request.state === 'messageAccepted') return {kind:'pending',text:'正在启动研究任务…'}
  return null
}
