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
it('groups results, preserves stable rows on background updates, and dismisses only outside the dialog', async () => {
  const { Window } = await import('happy-dom')
  const { showSidebarSessionSearch } = await import('../src/preload/sidebar-session-search')
  const w = new Window(), doc = w.document as unknown as Document
  let refresh = () => {}, unsubscribed = false
  const ui = showSidebarSessionSearch(doc, {
    results: query => sidebarSearchResults(state, { c: { title: 'Workspace Alpha', updatedAt: 5 } }, [], query),
    subscribe: fn => { refresh = fn; return () => { unsubscribed = true } }, open: async () => {}
  })
  expect([...ui.body.querySelectorAll('h3')].map(e => e.textContent)).toEqual(['看板区', '工作区'])
  expect(ui.body.querySelectorAll('small')).toHaveLength(0)
  const first = ui.body.querySelector('.srb-session-search-results button')
  refresh()
  expect(ui.body.querySelector('.srb-session-search-results button')).toBe(first)
  ui.dialog.getBoundingClientRect = () => ({ left: 100, right: 600, top: 100, bottom: 500 } as DOMRect)
  ui.dialog.dispatchEvent(new w.PointerEvent('pointerdown', { clientX: 110, clientY: 110 }) as unknown as Event)
  expect(ui.dialog.isConnected).toBe(true)
  ui.dialog.dispatchEvent(new w.PointerEvent('pointerdown', { clientX: 20, clientY: 20 }) as unknown as Event)
  expect(ui.dialog.isConnected).toBe(false)
  await w.happyDOM.waitUntilComplete()
  expect(unsubscribed).toBe(true)
  await w.happyDOM.abort()
})
it('searches and displays the same readable English skill name as the composer and sent bubble',async()=>{
 const {vi}=await import('vitest');vi.stubGlobal('window',{__eworkSkillPresentationV1:{skills:new Map([['ework-skill-0123456789abcdef',{label:'ework-finance-analysis'}]])}})
 try{const rows=sidebarSearchResults({favorites:[],boards:[]} as any,{a:{title:'/ework-skill-0123456789abcdef 机场遭'}},[],'finance-analysis');expect(rows[0]?.title).toBe('/ework-finance-analysis 机场遭')}finally{vi.unstubAllGlobals()}
})
