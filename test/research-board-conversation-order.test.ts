import { expect, it } from 'vitest'
import { orderBoardConversationGroups } from '../src/preload/research-board-conversation-order'

const groups = ['a', 'component', 'b', 'c'].map(requestId => ({ requestId, rows: [requestId, `${requestId}-reply`] }))
const task = (id: string, extra = {}): any => ({ taskId: id, requestMessageId: id, conversation: true, status: 'completed', createdAt: 1, ...extra })
const ids = (tasks: any[], messages: any[] = []) => orderBoardConversationGroups(groups, tasks, messages).map(g => g.requestId)

it('moves the original request and its answer together after completed priority work on resume', () => {
  const tasks = [task('a', { resumeCount: 1, status: 'running', conversationDisplayOrder: 30 }), task('b', { conversationDisplayOrder: 20 })]
  expect(ids(tasks)).toEqual(['b', 'component', 'a', 'c'])
  const ordered = orderBoardConversationGroups(groups, tasks, [])
  expect(ordered[2]).toBe(groups[0])
  expect(ordered.flatMap(g => g.rows)).toHaveLength(8)
})
it('retains the old position while paused, including repeated preemption, then moves only on reclaim', () => {
  const a = task('a', { status: 'pending', resumeCount: 1, conversationDisplayOrder: 10 })
  const b = task('b', { status: 'running', conversationDisplayOrder: 20 })
  expect(ids([a, b])).toEqual(['a', 'component', 'b', 'c'])
  a.conversationDisplayOrder = 30
  a.resumeCount = 2
  const c = task('c', { status: 'running', conversationDisplayOrder: 40 })
  expect(ids([a, b, c])).toEqual(['b', 'component', 'a', 'c'])
  a.conversationDisplayOrder = 50
  expect(ids([a, b, c])).toEqual(['b', 'component', 'c', 'a'])
})
it('is durable across completion, reload and a collaborator snapshot', () => {
  const tasks = [task('a', { resumeCount: 2, conversationDisplayOrder: 50 }), task('b', { conversationDisplayOrder: 20 }), task('c', { conversationDisplayOrder: 40 })]
  expect(ids(JSON.parse(JSON.stringify(tasks)))).toEqual(['b', 'component', 'c', 'a'])
})
it('supports existing servers using completion chronology and authoritative result insertion order for timestamp ties', () => {
  const tasks = [task('a', { resumeCount: 1, completedAt: 100 }), task('b', { completedAt: 100 })]
  const messages = [{ id: 'a' }, { id: 'b' }, { id: 'br', taskId: 'b', role: 'assistant' }, { id: 'ar', taskId: 'a', role: 'assistant' }]
  expect(ids(tasks, messages)).toEqual(['b', 'component', 'a', 'c'])
  tasks[0].status = 'running'
  delete tasks[0].completedAt
  expect(ids(tasks, messages.slice(0, 3))).toEqual(['b', 'component', 'a', 'c'])
})
it('keeps a legacy paused request in place until it resumes and preserves earlier priorities on another pause', () => {
  const a = task('a', { status: 'pending', resumeCount: 1, pausedAt: 10 })
  const b = task('b', { completedAt: 20 })
  expect(ids([a, b])).toEqual(['a', 'component', 'b', 'c'])
  a.pausedAt = 30
  a.resumeCount = 2
  expect(ids([a, b, task('c', { completedAt: 40 })])).toEqual(['b', 'component', 'a', 'c'])
})
it('uses the newest logical attempt and leaves imported/component groups and input arrays intact', () => {
  const original = JSON.stringify(groups)
  const tasks = [task('a', { resumeCount: 1, conversationDisplayOrder: 50 }), task('a', { taskId: 'retry', createdAt: 60, conversationDisplayOrder: 70 }), task('b', { conversationDisplayOrder: 65 })]
  expect(ids(tasks)).toEqual(groups.map(g => g.requestId))
  expect(JSON.stringify(groups)).toBe(original)
})

it('orders migrated claims after legacy turns and handles a failed priority without an answer', () => {
  const tasks = [task('a', { resumeCount: 1, status: 'running', conversationDisplayOrder: 30 }), task('b', { status: 'failed', completedAt: 20 })]
  expect(ids(tasks)).toEqual(['b', 'component', 'a', 'c'])
  delete tasks[0].conversationDisplayOrder
  expect(ids(tasks)).toEqual(['b', 'component', 'a', 'c'])
})
it('leaves ordinary never-preempted conversations in their existing presentation order', () => {
  expect(orderBoardConversationGroups(groups, [task('a', { conversationDisplayOrder: 50 }), task('b', { conversationDisplayOrder: 20 })], [])).toBe(groups)
})
