import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { createRequire } from 'node:module'
const requireModule = createRequire(import.meta.url)
const { act, createElement } = requireModule('react') as { act(fn: () => void | Promise<void>): Promise<void>; createElement(type: unknown, props?: unknown): unknown }
const { createRoot } = requireModule('react-dom/client') as { createRoot(container: HTMLElement): { render(node: unknown): void; unmount(): void } }
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: () => null, Modal: () => null, Button: () => null, Menu: () => null,
  IconTrashOutline16: () => null, IconPlusOutline16: () => null,
  IconEllipsisOutline16: () => null, IconSearchOutline16: () => null,
  IconFolderOpenOutline16: () => null, IconEditOutline16: () => null,
  IconTriangleRightFill14: () => null
}))
import { ResearchBoardSidebar } from '../src/preload/research-boards-ui'
import { selectBoardSession } from '../src/preload/research-board-navigation'
import { translateUiCopy } from '../src/preload/ui-localization'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); vi.unstubAllGlobals() })
async function fixture(privateCount = 8, sharedCount = 7,options:{current?:string;collapsed?:boolean;groups?:string[];legacyManagerMarker?:string}={}) {
  const w = new Window({ url: 'https://ework.local/' })
  vi.stubGlobal('window', w); vi.stubGlobal('document', w.document)
  vi.stubGlobal('localStorage', w.localStorage); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Event', w.Event)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  Object.assign(w, { __sherlockWorkspaceSidebarSkin: {
    header: { sessionOverflowButton: 'native-session-overflow' }, rows: {},
    collapsedSessionLimit: 5, useNativeDragAcceptance: () => {}, WorkspaceFolderIcon: () => null
  } })
  if (options.legacyManagerMarker) w.localStorage.setItem('ework.research.manager-workbench.v1', options.legacyManagerMarker)
  if(options.collapsed)w.localStorage.setItem('sherlock.boards.collapsed','true')
  if(options.groups)w.localStorage.setItem('sherlock.boards.view.v3',JSON.stringify({collapsedGroups:options.groups}))
  let current = options.current??'', version = 0
  const listeners = new Set<() => void>()
  const state = {
    favorites: Array.from({ length: privateCount }, (_, i) => ({ favoriteId: 'f' + i, sessionId: 'p' + i, title: '个人' + i, createdAt: 100 - i, pinned: true })),
    boards: Array.from({ length: sharedCount }, (_, i) => ({ boardId: 'b' + i, localSessionId: 's' + i, title: '协作' + i, sharingState: 'shared', createdAt: 100 - i, pinned: true }))
  }
  const page: any = {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) },
    version: () => version, getState: () => state, editedAt: () => 0, current: () => current,
    subscribeActivity: () => () => {}, isRunning: () => false, getView: () => null,
    openPersonal: vi.fn(async (id: string) => { current = id }),
    openBoard: vi.fn(async (id: string) => { current = state.boards.find(b => b.boardId === id)!.localSessionId }),
    showError: vi.fn()
  }
  const host = w.document.createElement('div'); w.document.body.append(host)
  const root = createRoot(host as unknown as HTMLElement)
  cleanup.push(async () => { await act(async () => root.unmount()); await w.happyDOM.abort() })
  await act(async () => root.render(createElement(ResearchBoardSidebar, { page })))
  const click = async (el: ReturnType<typeof host.querySelector>) => { expect(el).not.toBeNull(); await act(async () => (el as unknown as HTMLElement).click()) }
  const group = (name: string) => host.querySelector('[data-srb-board-group="' + name + '"]')!
  const titles = (name: string) => [...group(name).querySelectorAll('.srb-board-title')].map(el => el.textContent)
  const emit = async () => { await act(async () => { version++; listeners.forEach(fn => fn()) }) }
  const open = async (id: string) => { await act(async () => { current = id; selectBoardSession(id) }) }
  return { w, host, root, page, state, click, group, titles, emit, open }
}
it('协作看板条目仅在等待加入时显示虚线状态，已有成员时不保留图标或占位', async () => {
  const f = await fixture(1, 2)
  Object.assign(f.state.boards[0]!, { memberCount: 2 })
  Object.assign(f.state.boards[1]!, { memberCount: 1 })
  await f.emit()
  const rows = f.group('shared').querySelectorAll('.srb-board-title')
  expect(rows[0]!.querySelector('.srb-row-status,.srb-pending-ring')).toBeNull()
  expect(rows[1]!.querySelector('.srb-pending-ring')).not.toBeNull()
})
it('个人与协作看板各默认显示五条，复用工作区按钮，分别展开与收起', async () => {
  const f = await fixture()
  expect(f.titles('private')).toHaveLength(5); expect(f.titles('shared')).toHaveLength(5)
  const overflow = (name: string) => f.group(name).querySelector('[data-srb-board-overflow]')!
  expect(overflow('private').textContent).toBe('展开其余 3 个看板')
  expect(overflow('shared').textContent).toBe('展开其余 2 个看板')
  expect(overflow('private').classList.contains('native-session-overflow')).toBe(true)
  await f.click(overflow('private'))
  expect(f.titles('private')).toHaveLength(8); expect(f.titles('shared')).toHaveLength(5)
  expect(overflow('private').getAttribute('aria-expanded')).toBe('true')
  expect(overflow('private').textContent).toBe('收起')
  await f.click(overflow('private')); expect(f.titles('private')).toHaveLength(5)
  await f.click(overflow('shared')); expect(f.titles('shared')).toHaveLength(7)
})
it('打开后排看板时保留手动顺序，并在前五条里显示当前选择', async () => {
  const f = await fixture(), before = f.w.localStorage.getItem('sherlock.boards.view.v3')
  await f.click(f.group('private').querySelector('[data-srb-board-overflow]'))
  await f.click([...f.group('private').querySelectorAll('.srb-board-title')].find(el => el.textContent === '个人7')!)
  await f.click(f.group('private').querySelector('[data-srb-board-overflow]'))
  expect(f.titles('private')).toEqual(['个人0', '个人1', '个人2', '个人3', '个人7'])
  expect(f.group('private').querySelector('[aria-current=true]')?.textContent).toContain('个人7')
  expect(f.w.localStorage.getItem('sherlock.boards.view.v3')).toBe(before)
  await f.click(f.group('private').querySelector('[data-srb-board-overflow]'))
  await f.click(f.group('private').querySelector('[role=treeitem]'))
  expect(f.titles('private')).toHaveLength(0)
  await f.click(f.group('private').querySelector('[role=treeitem]'))
  expect(f.titles('private')).toHaveLength(5)
  expect(f.group('private').querySelector('[data-srb-board-overflow]')?.getAttribute('aria-expanded')).toBe('false')
})

it.each(['p7','s6'])('恢复正在使用的 %s 时自动展开对应看板目录并高亮，刷新后尊重手动收起',async id=>{
 const f=await fixture(8,7,{current:id,collapsed:true,groups:['private','shared']}),group=id==='p7'?'private':'shared'
 expect(f.host.querySelector('[aria-label="折叠看板区"]')?.getAttribute('aria-expanded')).toBe('true')
 expect(f.group(group).querySelector('[role=treeitem]')?.getAttribute('aria-expanded')).toBe('true')
 expect(f.group(group).querySelector('[aria-current=true]')?.textContent).toContain(id==='p7'?'个人7':'协作6')
 await f.click(f.group(group).querySelector('[role=treeitem]'));await f.emit()
 expect(f.group(group).querySelector('[role=treeitem]')?.getAttribute('aria-expanded')).toBe('false')
 await f.open(id==='p7'?'p6':'s5')
 expect(f.group(group).querySelector('[role=treeitem]')?.getAttribute('aria-expanded')).toBe('true')
 await f.click(f.group(group).querySelector('[role=treeitem]'));await f.open('workspace-session');await f.open(id==='p7'?'p6':'s5')
 expect(f.group(group).querySelector('[role=treeitem]')?.getAttribute('aria-expanded')).toBe('true')
})
it('五条以内不显示展开按钮，实时增删会话更新隐藏数量并保持当前会话可见', async () => {
  const f = await fixture(5, 1)
  expect(f.host.querySelector('[data-srb-board-overflow]')).toBeNull()
  f.state.favorites.push({ favoriteId: 'new', sessionId: 'new', title: '新看板', createdAt: 1, pinned: true })
  await f.emit(); await f.open('new')
  expect(f.titles('private')).toHaveLength(5); expect(f.titles('private')).toContain('新看板')
  expect(f.group('private').querySelector('[data-srb-board-overflow]')?.textContent).toBe('展开其余 1 个看板')
  f.state.favorites.pop(); await f.emit()
  expect(f.titles('private')).toHaveLength(5); expect(f.host.querySelector('[data-srb-board-overflow]')).toBeNull()
})
it('看板展开按钮的英文文案处理数量，保持与工作区的收起用语一致', () => {
  expect(translateUiCopy('展开其余 1 个看板')).toBe('Show 1 more board')
  expect(translateUiCopy('展开其余 3 个看板')).toBe('Show 3 more boards')
  expect(translateUiCopy('收起')).toBe('Collapse')
})

it.each([undefined, 'pending-session', 'installed'])('管理者工作台不会出现在新用户及旧安装标记的默认列表 (%s)', async marker => {
  const f = await fixture(6, 1, { legacyManagerMarker: marker })
  expect(f.titles('private')).toEqual(['个人0', '个人1', '个人2', '个人3', '个人4'])
  expect(f.titles('shared')).toEqual(['协作0'])
  expect(f.group('private').querySelector('[data-srb-board-overflow]')?.textContent).toBe('展开其余 1 个看板')
  expect(f.w.localStorage.getItem('ework.research.manager-workbench.v1')).toBe(marker ?? null)
})

it('已保存或分享的同名管理者工作台仍按各自 ID 打开', async () => {
  const f = await fixture(2, 1, { legacyManagerMarker: 'installed' })
  for (const item of [...f.state.favorites, ...f.state.boards]) item.title = '管理者工作台'
  await f.emit()
  const rows = f.group('private').querySelectorAll('.srb-board-title')
  expect(rows).toHaveLength(2)
  await f.click(rows[0]!)
  await f.click(rows[1]!)
  expect(f.page.openPersonal.mock.calls).toEqual([['p0'], ['p1']])
  await f.click(f.group('shared').querySelector('.srb-board-title'))
  expect(f.page.openBoard).toHaveBeenCalledWith('b0')
})
