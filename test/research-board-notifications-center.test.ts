import { Window, type HTMLButtonElement } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { mountResearchBoardNotifications } from '../src/preload/research-board-notifications-ui'
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'
import type { ResearchBoardsBridge, ResearchBoardsState, Notification } from '../src/shared/research-boards'

const cleanups: Array<() => void> = []
afterEach(() => { cleanups.splice(0).forEach(fn => fn()) })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function fixture(notes: Notification[] = [], load = async (state: ResearchBoardsState) => state) {
  const w = new Window({ url: 'https://ework.local' })
  w.document.body.innerHTML = '<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer><div data-research-board-bell-host></div></footer></aside><button id="outside">outside</button>'
  const state: ResearchBoardsState = { version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'u', username: '甲', publicId: '0000000001' } }, favorites: [], boards: [], current: null, recoveries: [], notifications: { cursor: 1, unreadCount: notes.filter(n => !n.readAt).length, pendingCount: notes.filter(n => n.invitation?.status === 'pending').length, notifications: notes } }
  const invoke = vi.fn(async (action: string, input: any) => {
    if (action === 'notifications.read') {
      notes.forEach(n => { if (input.notificationIds.includes(n.notificationId)) n.readAt = 2 })
      state.notifications.unreadCount = notes.filter(n => !n.readAt).length
    }
    return { ok: true as const, value: state.notifications }
  })
  const bridge: ResearchBoardsBridge = { isSharedSession: () => false, getSnapshot: () => load(state), subscribe: () => () => {}, invoke }
  const document = w.document as unknown as Document
  const host = new WorkspaceSurfaceHost(document)
  const dispose = mountResearchBoardNotifications(document, bridge, () => host.revealConversation())
  cleanups.push(() => { dispose(); host.dispose(); w.happyDOM.abort() })
  const button = (label: string) => w.document.querySelector<HTMLButtonElement>(`.srb-notifications button[aria-label="${label}"]`)!
  const bell = () => w.document.querySelector<HTMLButtonElement>('.srb-bell')!
  return { w, state, invoke, button, bell, host }
}
function note(id: string, readAt: number | null, status: 'pending' | 'accepted'): Notification {
  return { notificationId: id, eventVersion: 1, type: status === 'pending' ? 'invitation' : 'invitationResult', boardId: 'board', boardTitle: id, createdAt: 1, readAt, invitation: { invitationId: id, version: 1, status } }
}
it.each(['image-factory', 'browser', 'knowledge'] as const)('reveals a notification destination over %s after it opens', async surface => {
  const f = fixture([note('协作看板', 2, 'accepted')])
  const app = f.w.document.createElement('div')
  f.host.register(surface, app as unknown as HTMLElement)
  f.host.open(surface)
  let requestId = ''
  f.w.addEventListener('sherlock:boards:request', event => {
    const detail = (event as import('happy-dom').CustomEvent).detail
    expect(detail).toMatchObject({ action: 'open', boardId: 'board' })
    requestId = detail.requestId
  })
  await tick(); f.bell().click()
  f.w.document.querySelector<import('happy-dom').HTMLElement>('.srb-notifications .srb-notification-subtitle')?.click()
  expect(requestId).not.toBe('')
  expect(app.hidden).toBe(false)
  f.w.dispatchEvent(new f.w.CustomEvent('sherlock:boards:reply', { detail: { requestId, ok: true } }))
  await tick()
  expect(app.hidden).toBe(true)
  expect(f.host.current()).toBeUndefined()
  expect(f.w.document.querySelector('.srb-notifications')).toBeNull()
})
it('filters by read state independently of invitation status and marks read only on explicit action', async () => {
  const f = fixture([note('read-pending', 1, 'pending'), note('unread-accepted', null, 'accepted')])
  await tick(); f.bell().click(); await tick()
  expect(f.invoke).not.toHaveBeenCalledWith('notifications.read', expect.anything())
  f.button('未读 1').click()
  expect([...f.w.document.querySelectorAll('.srb-notifications [data-notification-id]')].map(n => n.getAttribute('data-notification-id'))).toEqual(['unread-accepted'])
  f.button('全部已读').click(); await tick()
  expect(f.state.notifications.notifications[0]!.invitation?.status).toBe('pending')
  expect(f.state.notifications.notifications[1]!.invitation?.status).toBe('accepted')
  expect(f.w.document.querySelectorAll('.srb-notifications [data-notification-id]')).toHaveLength(0)
  expect(f.button('未读 0')).not.toBeNull()
  expect(f.bell().getAttribute('data-unread')).toBe('false')
  f.button('全部').click()
  expect(f.w.document.querySelectorAll('.srb-notifications [data-notification-id]')).toHaveLength(2)
})
it('includes a new update in unread until explicitly read and preserves its details action', async () => {
  const f = fixture(); await tick()
  f.w.document.documentElement.dataset.eworkUpdateStatus = JSON.stringify({ phase: 'available', currentVersion: '0.9.5', availableVersion: '0.9.6', manual: false })
  f.w.document.dispatchEvent(new f.w.CustomEvent('ework-update-status'))
  f.bell().click(); f.button('未读 1').click()
  expect(f.w.document.querySelectorAll('.srb-notifications [data-update-notification]')).toHaveLength(1)
  f.button('全部已读').click(); await tick()
  expect(f.w.localStorage.getItem('ework.update.read')).toBe('0.9.6')
  expect(f.w.document.querySelector('[data-update-notification]')).toBeNull()
  f.button('全部').click()
  const details = vi.fn(); f.w.document.addEventListener('ework-open-about', details)
  f.button('详情').click()
  expect(details).toHaveBeenCalledOnce()
  expect(f.w.document.querySelector('.srb-notifications')).toBeNull()
})
it('supports keyboard navigation, Escape, and outside dismissal with focus returning to the bell', async () => {
  const f = fixture(); await tick(); f.bell().click()
  expect(f.w.document.activeElement).toBe(f.button('全部'))
  f.button('全部').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(f.w.document.activeElement).toBe(f.button('未读 0'))
  expect(f.button('未读 0').getAttribute('aria-selected')).toBe('true')
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(f.w.document.querySelector('.srb-notifications')).toBeNull()
  expect(f.w.document.activeElement).toBe(f.bell())
  f.bell().click()
  f.w.document.querySelector('#outside')!.dispatchEvent(new f.w.PointerEvent('pointerdown', { bubbles: true }))
  expect(f.w.document.querySelector('.srb-notifications')).toBeNull()
  expect(f.w.document.activeElement).toBe(f.bell())
  expect(f.bell().getAttribute('aria-expanded')).toBe('false')
})

it.each([
  { mode: 'expanded', left: 0, sidebarWidth: 280, footerTop: 844 },
  { mode: 'collapsed', left: 0, sidebarWidth: 64, footerTop: 810 },
  { mode: 'settings', left: 12, sidebarWidth: 240, footerTop: 844 }
])('anchors the $mode message center to the footer baseline instead of the account hit area', async ({ mode, left, sidebarWidth, footerTop }) => {
  const f = fixture()
  Object.defineProperty(f.w, 'innerWidth', { configurable: true, value: 1380 })
  Object.defineProperty(f.w, 'innerHeight', { configurable: true, value: 900 })
  const sidebar = f.w.document.querySelector('[data-dsh-sidebar-root]')!
  if (mode === 'collapsed') sidebar.setAttribute('data-sidebar-collapsed', 'true')
  const bounds = new f.w.DOMRect(left, 0, sidebarWidth, 900)
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(bounds)
  if (mode === 'settings') {
    const nav = f.w.document.createElement('nav')
    nav.className = 'VOzbGW_nav'
    sidebar.append(nav)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(bounds)
  }
  const footer = f.w.document.querySelector('[data-dsh-sidebar-footer]')!
  vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(left, footerTop, sidebarWidth, 900 - footerTop))
  await tick(); f.bell().click()
  const panel = f.w.document.querySelector('.srb-notifications')! as import('happy-dom').HTMLElement
  expect(panel.style.left).toBe(`${left + 18}px`)
  expect(panel.style.bottom).toBe('82px')
  expect(panel.style.maxHeight).toBe('calc(100vh - 94px)')

  // A smaller viewport must still reserve 12px at both horizontal edges and above the panel.
  Object.defineProperty(f.w, 'innerWidth', { configurable: true, value: 320 })
  Object.defineProperty(f.w, 'innerHeight', { configurable: true, value: 120 })
  f.w.dispatchEvent(new f.w.Event('resize'))
  expect(panel.style.left).toBe('12px')
  expect(panel.style.bottom).toBe('12px')
  expect(panel.style.maxHeight).toBe('calc(100vh - 24px)')
})

function visibleAccount(f: ReturnType<typeof fixture>) {
  const sidebar = f.w.document.querySelector('[data-dsh-sidebar-root]')!
  const footer = f.w.document.querySelector('[data-dsh-sidebar-footer]')!
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(0, 0, 280, 900))
  vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(0, 844, 280, 44))
}
it('presents an initial single invitation with actions instead of a summary', async () => {
  const f = fixture([note('new-invite', null, 'pending')]); visibleAccount(f)
  await tick()
  const bubble = f.w.document.querySelector('.srb-bubble')!
  expect(bubble.textContent).toContain('收到协作邀请')
  expect(bubble.textContent).toContain('接受')
  expect(bubble.textContent).toContain('拒绝')
  expect(f.w.localStorage.getItem('sherlock.boards.displayed.u')).toContain('new-invite')
})
it('keeps an unseen invitation pending until the account anchor is ready', async () => {
  const f = fixture([note('late-anchor', null, 'pending')]); await tick()
  expect(f.w.document.querySelector('.srb-bubble')?.hasAttribute('data-notice-unpositioned')).toBe(true)
  expect(f.w.localStorage.getItem('sherlock.boards.displayed.u')).not.toContain('late-anchor')
  visibleAccount(f)
  f.w.document.body.append(f.w.document.createElement('span')); await tick()
  expect(f.w.document.querySelector('.srb-bubble')?.hasAttribute('data-notice-unpositioned')).toBe(false)
  expect(f.w.localStorage.getItem('sherlock.boards.displayed.u')).toContain('late-anchor')
})
it('waits for a visible window before showing the initial invitation', async () => {
  const f = fixture([note('background', null, 'pending')]); visibleAccount(f)
  Object.defineProperty(f.w.document, 'visibilityState', { configurable: true, value: 'hidden' })
  await tick()
  expect(f.w.document.querySelector('.srb-bubble')).toBeNull()
  expect(f.w.localStorage.getItem('sherlock.boards.displayed.u')).not.toContain('background')
  Object.defineProperty(f.w.document, 'visibilityState', { configurable: true, value: 'visible' })
  f.w.document.dispatchEvent(new f.w.Event('visibilitychange')); await tick()
  expect(f.w.document.querySelector('.srb-bubble')?.textContent).toContain('接受')
})

it('keeps tabs and details clickable through download progress ticks', async () => {
  const f=fixture(); await tick()
  const progress=(percent:number)=>{f.w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'downloading',currentVersion:'0.9.9',availableVersion:'0.9.10',manual:true,percent});f.w.document.dispatchEvent(new f.w.Event('ework-update-status'))}
  progress(10);f.bell().click()
  const unread=f.button('未读 1'), details=f.button('详情')
  unread.dispatchEvent(new f.w.PointerEvent('pointerdown',{bubbles:true}));progress(11)
  expect(f.button('未读 1')).toBe(unread)
  expect(f.button('详情')).toBe(details)
  unread.click();expect(f.button('未读 1').getAttribute('aria-selected')).toBe('true')
  const open=vi.fn();f.w.document.addEventListener('ework-open-about',open)
  const action=f.button('详情');progress(12);action.click();expect(open).toHaveBeenCalledOnce()
})
it('hides signed-out collaboration prompts and supports reading one update', async () => {
  const f=fixture();f.state.account={status:'signed-out',generation:1} as any;await tick()
  f.w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'available',currentVersion:'0.9.9',availableVersion:'0.9.10',manual:false})
  f.w.document.dispatchEvent(new f.w.Event('ework-update-status'));f.bell().click()
  expect(f.w.document.querySelector('.srb-notifications')!.textContent).not.toContain('登录后查看协作邀请')
  f.button('未读 1').click();f.button('标记已读').click();await tick()
  expect(f.button('未读 0')).not.toBeNull();expect(f.w.document.querySelector('[data-update-notification]')).toBeNull()
  expect(f.invoke).not.toHaveBeenCalled()
})
it('marks only the selected collaboration message read', async () => {
 const f=fixture([note('first',null,'accepted'),note('second',null,'accepted')]);await tick();f.bell().click()
 const card=f.w.document.querySelector('[data-notification-id="first"]')!
 const read=card.querySelector<HTMLButtonElement>('.srb-notification-meta > .srb-notification-mark-read')!
 expect(read.textContent).toBe('标为已读')
 expect(card.querySelector('.srb-notification-footer .srb-notification-mark-read')).toBeNull()
 read.click();await tick()
 expect(f.invoke).toHaveBeenCalledWith('notifications.read',{notificationIds:['first']})
 expect(f.state.notifications.notifications[1]!.readAt).toBeNull()
})


it('keeps the unread filter through a failed batch and clears it only after retry succeeds', async () => {
  const f = fixture([note('first', null, 'accepted'), note('second', null, 'accepted')])
  let reject!: (error: Error) => void
  f.invoke.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  await tick(); f.bell().click(); f.button('未读 2').click(); f.button('全部已读').click()
  expect(f.button('全部已读').textContent).toBe('标记中…')
  expect(f.button('全部已读').disabled).toBe(true)
  reject(Error('service unavailable'))
  await tick()
  expect(f.w.document.querySelectorAll('[data-notification-id]')).toHaveLength(2)
  expect(f.w.document.querySelector('[role="alert"]')?.textContent).toContain('标记已读失败')
  f.button('重试').click(); await tick()
  expect(f.w.document.querySelector('.srb-notifications-toast')?.textContent).toBe('已全部标为已读')
  expect(f.button('未读 0').getAttribute('aria-selected')).toBe('true')
  f.button('查看全部').click()
  expect(f.w.document.querySelectorAll('[data-notification-id]')).toHaveLength(2)
})

it('shows a skeleton before the first snapshot, then retries without losing the selected filter', async () => {
  let reject!: (error: Error) => void
  let attempts = 0
  const f = fixture([], async state => {
    if (attempts++ === 0) return new Promise((_resolve, fail) => { reject = fail })
    return state
  })
  f.bell().click()
  expect(f.w.document.querySelectorAll('.srb-notification-skeleton')).toHaveLength(3)
  reject(Error('offline')); await tick()
  expect(f.w.document.querySelector('.srb-notification-empty')?.textContent).toContain('消息加载失败')
  f.button('重试').click(); await tick()
  expect(f.invoke).toHaveBeenCalledWith('boards.refresh', {})
  expect(f.w.document.querySelector('.srb-notification-empty')?.textContent).toContain('暂无消息')
})

it('shows invite progress, keeps a failed decision retryable, and collapses the action row on success', async () => {
  const n = note('new', 1, 'pending')
  const f = fixture([n])
  let reject!: (error: Error) => void
  f.invoke.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  await tick(); f.bell().click(); f.button('接受').click()
  expect(f.button('加入中…').disabled).toBe(true)
  reject(Error('retryable')); await tick()
  expect(f.w.document.querySelector('.srb-notification-error')?.textContent).toBe('加入失败，请重试。')
  f.invoke.mockImplementationOnce(async () => ({ ok: true, value: { invitation: { status: 'accepted' } } as any }))
  f.button('重试加入').click(); await tick()
  expect(f.w.document.querySelector('.srb-notification-invitation-actions')).toBeNull()
  expect(f.w.document.querySelector('.srb-notification-meta')?.textContent).toBe('已加入')
  expect(f.button('打开看板')).not.toBeNull()
})


it('shows the total on the bell and moves the keyboard between message rows', async () => {
  const f = fixture([note('first', null, 'accepted'), note('second', null, 'accepted')])
  await tick()
  expect(f.bell().querySelector('.srb-bell-unread-count')?.textContent).toBe('2')
  f.bell().click()
  const pressDown = () => f.w.document.activeElement?.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  pressDown()
  expect(f.w.document.activeElement?.closest('article')?.getAttribute('data-notification-id')).toBe('first')
  pressDown()
  expect(f.w.document.activeElement?.closest('article')?.getAttribute('data-notification-id')).toBe('second')
})


it('disables opening an invite that expires while it is being accepted', async () => {
  const f = fixture([note('expiring', null, 'pending')])
  f.invoke.mockResolvedValueOnce({
    ok: false,
    error: { message: '邀请已过期', details: { invitation: { status: 'expired' } } }
  } as any)
  await tick(); f.bell().click(); f.button('接受').click(); await tick()
  expect(f.button('打开看板').disabled).toBe(true)
  expect(f.w.document.querySelector('.srb-notification-meta')?.textContent).toContain('已过期')
  expect(f.w.document.querySelector('.srb-notification-error')).toBeNull()
  expect(f.button('标记已读')).not.toBeNull()
})
