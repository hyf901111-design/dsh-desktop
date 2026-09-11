import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { boardAvatarBackground, boardEntryActions, boardMembers } from '../src/preload/research-board-presentation'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: () => null, IconEllipsisOutline16: () => null, IconSearchOutline16: () => null,
  IconPersonalizationOutline16: () => null, IconCloseFill14: () => null,
  IconBranchOutline16: () => null, IconFolderOpenOutline16: () => null,
  IconEditOutline16: () => null, IconTriangleRightFill14: () => null
}))
import { addBoardCollaborator, manageBoard, showBoardMembers } from '../src/preload/research-boards-ui'
const windows: Window[] = []
afterEach(() => { for (const window of windows.splice(0)) window.happyDOM.abort(); vi.unstubAllGlobals() })
function fixture(role = 'owner') {
  const w = new Window({ url: 'http://localhost/' }); windows.push(w)
  vi.stubGlobal('document', w.document)
  const members = Array.from({ length: 11 }, (_, i) => ({ userId: `u${i}`, username: i === 0 ? '自己' : `成员${i}`, role: i ? 'editor' : 'owner', joinedAt: i }))
  const view: any = { boardId: 'b', localSessionId: 's', board: { title: '黄金多因子 · 协作', sharingState: 'shared', lifecycle: 'active' }, permissions: { read: true, edit: role !== 'viewer', manage: role === 'owner' }, connection: 'online', members, presence: [members[0], members[3], members[4], members[7]], pendingInvitations: [] }
  const state = { account: { user: { userId: 'u0' } }, boards: [{ boardId: 'b', localSessionId: 's', pinned: true }] }
  const listeners = new Set<() => void>()
  const page: any = { getView: () => view, getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }, call: vi.fn(async () => ({})), openBoard: vi.fn(async () => 's'), current: () => 's', copyPersonal: vi.fn(), showError: vi.fn() }
  return { w, view, page, listeners, emit: () => listeners.forEach(listener => listener()) }
}
it('only returns active collaboration to its workspace after sharing has ended, with owner rename permissions', () => {
  expect(boardEntryActions({}).map(action => action.label)).toEqual(['重命名', '共享协作', '放回工作区'])
  expect(boardEntryActions({ boardId: 'b', sharingState: 'shared', role: 'owner' }).map(action => action.label)).toEqual(['重命名', '管理协作'])
  expect(boardEntryActions({ boardId: 'b', sharingState: 'shared', role: 'viewer' })[0]?.disabled).toBe(true)
  expect(boardEntryActions({ boardId: 'b', sharingState: 'ownerOnly', role: 'owner' }).map(action => action.label)).toEqual(['重命名', '共享协作', '放回工作区'])
})
it('uses complete membership with online-first ordering and never invents online status while disconnected', () => {
  const f = fixture()
  const members = boardMembers(f.view, 'u0')
  expect(members).toHaveLength(11)
  expect(members.slice(0, 4).map(member => member.userId)).toEqual(['u0', 'u3', 'u4', 'u7'])
  f.view.connection = 'reconnecting'
  expect(boardMembers(f.view, 'u0').every(member => !member.online)).toBe(true)
  expect(boardAvatarBackground('u0', true)).toContain('/figma-self-avatar.png')
})
it('searches all 11 members, keeps live presence, restores complete list, and cleans up on access loss', () => {
  const f = fixture(), anchor = f.w.document.createElement('button'); f.w.document.body.append(anchor)
  const { popover } = showBoardMembers(f.page, 's', anchor as unknown as HTMLElement)!
  expect(popover.querySelectorAll('.srb-member')).toHaveLength(11)
  expect(popover.textContent).toContain('4 位正在画板中')
  const input = popover.querySelector('input')!
  input.value = '成员10'; input.dispatchEvent(new f.w.Event('input') as unknown as Event)
  expect(popover.querySelectorAll('.srb-member')).toHaveLength(1)
  expect(popover.textContent).toContain('成员10')
  f.view.presence = [] ; f.emit()
  expect(popover.textContent).toContain('0 位正在画板中')
  input.value = ''; input.dispatchEvent(new f.w.Event('input') as unknown as Event)
  expect(popover.querySelectorAll('.srb-member')).toHaveLength(11)
  f.view.permissions.read = false; f.emit()
  expect(popover.isConnected).toBe(false)
  expect(f.listeners.size).toBe(0)
})
it('routes management directly to board settings and keeps removed settings absent', async () => {
  const f = fixture()
  manageBoard(f.page, 'b', 'settings')
  await Promise.resolve()
  const dialog = f.w.document.querySelector('.srb-management')!
  expect(dialog.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('画板设置')
  expect(dialog.textContent).toContain('保存个人副本')
  expect(dialog.textContent).not.toContain('侧栏显示')
  expect(dialog.textContent).not.toContain('自动刷新')
  ;([...dialog.querySelectorAll('button')].find(button => button.textContent === '成员与邀请'))!.click()
  expect(dialog.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('成员与邀请')
})
it('anchors the member popover to the entire collaboration action group as in Figma 305:614', () => {
  const f = fixture(), group = f.w.document.createElement('div'), anchor = f.w.document.createElement('button')
  group.className = 'srb-actions'; group.append(anchor); f.w.document.body.append(group)
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(778, 33, 214, 28))
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new f.w.DOMRect(872, 33, 28, 28))
  const { popover } = showBoardMembers(f.page, 's', anchor as unknown as HTMLElement)!
  expect(popover.style.left).toBe('652px')
  expect(popover.style.top).toBe('82px')
})
it('adding a collaborator checks an ID and sends to the same board without creating a new copy', async () => {
  const f = fixture()
  f.page.call.mockImplementation(async (action: string) => action === 'user.lookup' ? { user: { userId: 'peer', publicId: '1234567890', username: '林然' } } : {})
  addBoardCollaborator(f.page, 'b', 's')
  const dialog = f.w.document.querySelector('.srb-add-collaborator-dialog')!
  const input = dialog.querySelector('input')!; input.value = '1234 5678 90'
  const send = [...dialog.querySelectorAll('button')].find(button => button.textContent === '发送邀请')!
  expect(send.disabled).toBe(true)
  ;([...dialog.querySelectorAll('button')].find(button => button.textContent === '查找并核对'))!.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(send.disabled).toBe(false)
  expect(dialog.textContent).toContain('林然')
  expect(dialog.querySelector('.srb-check-icon')).not.toBeNull()
  send.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(f.page.call).toHaveBeenCalledWith('invitation.send', { boardId: 'b', publicId: '1234567890', role: 'editor' })
  expect(f.page.call.mock.calls.some(([action]: [string]) => action === 'board.create')).toBe(false)
  expect(f.page.openBoard).toHaveBeenCalledWith('b')
})
it('does not expose invitation and member mutation controls to a viewer', async () => {
  const f = fixture('viewer')
  addBoardCollaborator(f.page, 'b', 's')
  expect(f.w.document.querySelector('.srb-add-collaborator-dialog')).toBeNull()
  manageBoard(f.page, 'b')
  await Promise.resolve()
  const dialog = f.w.document.querySelector('.srb-management')!
  expect(dialog.querySelector('.srb-invite-form')).toBeNull()
  expect(dialog.querySelector('.srb-member select')).toBeNull()
  expect(dialog.textContent).toContain('退出协作')
})

it('keeps the open member permission control and scroll position through live cursor and presence updates', async () => {
  const f = fixture()
  manageBoard(f.page, 'b')
  await Promise.resolve()
  const list = f.w.document.querySelector('.srb-member-list')!
  const select = list.querySelector('select[aria-label="成员3权限"]')! as unknown as HTMLSelectElement
  select.focus()
  list.scrollTop = 120
  f.view.presence = [...f.view.presence.map((member: any) => ({ ...member, cursor: { x: 80, y: 40 }, selectedIds: ['card'] }))]
  f.emit()
  expect(list.querySelector('select[aria-label="成员3权限"]')).toBe(select)
  expect(f.w.document.activeElement).toBe(select)
  expect(list.scrollTop).toBe(120)
  f.view.presence = f.view.presence.filter((member: any) => member.userId !== 'u3')
  f.emit()
  expect(list.querySelector('select[aria-label="成员3权限"]')).toBe(select)
  expect(select.closest('.srb-member')!.textContent).toContain('未在当前画板')
  select.value = 'viewer'
  select.dispatchEvent(new f.w.Event('change') as unknown as Event)
  await Promise.resolve()
  expect(f.page.call).toHaveBeenCalledWith('member.role', { boardId: 'b', userId: 'u3', role: 'viewer' })
  f.view.members.find((member: any) => member.userId === 'u3').role = 'viewer'
  f.emit()
  expect((list.querySelector('select[aria-label="成员3权限"]')! as unknown as HTMLSelectElement).value).toBe('viewer')
  f.view.permissions.read = false
  f.emit()
  expect(f.w.document.querySelector('.srb-management')!.textContent).toContain('共享访问已结束')
  expect(f.w.document.querySelector('.srb-member select')).toBeNull()
})
