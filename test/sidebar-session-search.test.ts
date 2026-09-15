import { expect, it } from 'vitest'
import { sidebarSearchResults } from '../src/preload/sidebar-session-search'
import { promoteSidebarOrder } from '../src/preload/sidebar-manual-order'
const state = { favorites: [{ favoriteId: 'a', sessionId: 'a', title: '研究 Alpha', createdAt: 1 }], boards: [{ boardId: 'b', localSessionId: 'b', pinned: true, title: '协作 Alpha', createdAt: 2 }] } as any
it('searches session titles in both areas once, ignoring directory and message text', () => {
  const sessions = { a: { title: 'duplicate Alpha' }, b: { title: 'duplicate Alpha' }, c: { title: 'Workspace ALPHA', updatedAt: 3 }, d: { title: 'Other', cwd: '/Alpha', content: 'Alpha' } }
  const rows = sidebarSearchResults(state, sessions, [], ' alpha ')
  expect(rows.map(r => r.title)).toEqual(['Workspace ALPHA', '协作 Alpha', '研究 Alpha'])
  expect(rows.map(r => r.area)).toEqual(['workspaces', 'boards', 'boards'])
})
it('excludes archived sessions, agents and untitled placeholders', () => {
  const rows = sidebarSearchResults({ favorites: [], boards: [] } as any, { a: { title: 'Alpha' }, b: { title: 'Alpha', origin: 'subagent' }, c: { blank: true, displayTitle: 'New Session' }, d: { title: 'Alpha', blank: true } }, ['a'], '')
  expect(rows.map(r => r.sessionId)).toEqual(['d'])
})
it('preserves manual order until an update and retains the promoted order', () => {
  const initial = [{ key: 'a', time: 1 }, { key: 'b', time: 2 }]
  const first = promoteSidebarOrder(initial, ['a', 'b'])
  expect(first.order).toEqual(['a', 'b'])
  const updated = promoteSidebarOrder([{ key: 'a', time: 1 }, { key: 'b', time: 3 }], first.order, first.updatedAt)
  expect(updated.order).toEqual(['b', 'a'])
  const moved = promoteSidebarOrder([{ key: 'a', time: 1 }, { key: 'b', time: 3 }], ['a', 'b'], updated.updatedAt)
  expect(moved.order).toEqual(['a', 'b'])
  expect(moved.changed).toBe(false)
})
it('promotes a new session without shuffling unchanged items', () => {
  expect(promoteSidebarOrder([{ key: 'a', time: 5 }, { key: 'b', time: 4 }, { key: 'c', time: 6 }], ['b', 'a'], { a: 5, b: 4 }).order).toEqual(['c', 'b', 'a'])
})
it('workspace manual ordering also promotes new activity, without changing unchanged positions', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
  const start = source.indexOf('function reconciledSessionOrder('), end = source.indexOf('function ViewOptionsMenu(', start)
  const next = new Function(source.slice(start, end) + '; return nextSessionOrderAccount')()
  const result = next({ sessionIds: ['a', 'b'], previousOrder: ['a', 'b'], previousUpdatedAt: { a: 1, b: 1 }, list: { byId: { a: { updatedAt: 1 }, b: { updatedAt: 2 } } }, orderBy: 'manual', sortByRecency: false })
  expect(result.order).toEqual(['b', 'a'])
})
