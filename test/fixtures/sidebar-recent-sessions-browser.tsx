import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as reactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { createResearchBoardsPage, SidebarSessionSearch } from '../../src/preload/research-boards-ui'
import { SidebarRecentSessions } from '../../src/preload/sidebar-recent-sessions'
import { installImageHistoryNavigation } from '../../scripts/lib/image-history-navigation.mjs'

const win = window as any
const modules: Record<string, any> = { react: React, 'react/jsx-runtime': jsx, 'react-dom': reactDOM,
  '@deepseek-ai/cordis': { Service: class {} }, '@deepseek-ai/dsh-client-ui-primitives': primitives }
win.__ModuleLoader__ = { load: ({ id, factory }: any) => { modules[id] = factory((name: string) => modules[name] ?? modules[name.replace(/\/client$/, '')] ?? {}) } }
for (const source of win.native) new Function(source)()
const sidebar = modules['@deepseek-ai/dsh-client-ui-sidebar']
function store<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next: T) { state = next; listeners.forEach(fn => fn()) } }
}
const items = [
  { workspaceId: 'one', title: '工作区一', path: '/one', sessionIds: ['product', 'newest', 'hidden'] },
  { workspaceId: 'two', title: '工作区二', path: '/two', sessionIds: ['review', 'pin', 'image', 'sub', 'blank'] }
]
const summary = (id: string, title: string, updatedAt: number, flags = {}) => ({ id, title, displayTitle: title, updatedAt, ...flags })
const entries = [summary('newest', '简报', 50), summary('product', '同名', 40, { pendingInteraction: 'approval' }),
  summary('review', '同名', 30), summary('pin', '个人看板', 20), summary('image', '图像画布', 10),
  summary('removed', '已删除', 400, { removed: true }), summary('hidden', '已归档', 100), summary('sub', '子代理', 200, { origin: 'subagent' }), summary('blank', '', 300, { blank: true })]
const list = store({ current: 'newest', phase: 'ready', ids: entries.map(item => item.id), byId: Object.fromEntries(entries.map(item => [item.id, item])) })
const workspaces = { list: store({ items, archivedSessionIds: ['hidden'] }) }
const canvas = store({ files: [], artifacts: [] })
const sessions = { list, binding: () => ({}), open(id: string) {
  list.set({ ...list.getSnapshot(), current: id })
  document.querySelector('main')!.textContent = research === id ? '研究画板 ' + id : id
} }
let research: string | undefined
window.addEventListener('sherlock:conversation-initial-research', e => { research = (e as CustomEvent).detail.sessionId })
const page = createResearchBoardsPage({ document, sessions, workspaces, researchWorkspaces: { for: () => canvas }, inputHub: { shells: new Map() },
  bridge: { isSharedSession: () => false, subscribe: () => () => {}, invoke: async () => ({ ok: true, value: null }),
    getSnapshot: async () => ({ version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'user' } },
      favorites: [{ favoriteId: 'f', sessionId: 'pin', title: '个人看板', dedicated: true, createdAt: 1 }],
      boards: [], current: null, recoveries: [], notifications: { notifications: [], cursor: 0, unreadCount: 0, pendingCount: 0 } }) }
} as any)
installImageHistoryNavigation({ doc: document, win: { CustomEvent, fetch: async () => ({ ok: true, json: async () => ({ mode: 'image' }) }) },
  sessions, storage: { read: async () => ({ tabs: [{ scope: 'image' }], epoch: 1 }), hasCanvas: async (id: string) => id === 'image' },
  isBoardOnly: page.isBoardOnly, viewFor: () => 'chat' })
document.addEventListener('sherlock:image-factory-restore-history', e => {
  document.querySelector('main')!.textContent = '图像应用 ' + (e as CustomEvent).detail.sessionId
})
const root = createRoot(document.querySelector('#root')!)
function Shell() {
  const [collapsed, setCollapsed] = React.useState(false)
  const slot = (name: string, props: Record<string, any>) => {
    if (name === 'sidebar.recentSessions') return <SidebarRecentSessions page={page} english={props.english} />
    if (name === 'sidebar.sessionSearch') return <SidebarSessionSearch page={page} buttonClass={props.buttonClass} />
    if (name === 'sidebar.workspaces') return <button onClick={() => sessions.open('review')}>测试目录</button>
    return null
  }
  return <><sidebar.Root width={260} collapsed={collapsed} toggleSidebar={() => setCollapsed(!collapsed)} renderSlot={slot}
    openHome={() => {}} startSession={() => {}} startResearchSession={() => {}} t={(key: string) => sidebar.zh[key]} /><main /></>
}
root.render(<Shell />)
win.fixture = { remove(id: string) { const current = list.getSnapshot()
  const byId = { ...current.byId }; delete byId[id]
  list.set({ ...current, ids: current.ids.filter(key => key !== id), byId }) } }
