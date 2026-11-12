import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
const { act } = React
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Menu: () => null, IconEllipsisOutline16: () => null, IconSearchOutline16: () => null, IconPersonalizationOutline16: () => null, IconCloseFill14: () => null, IconFolderOpenOutline16: () => null, IconEditOutline16: () => null, IconTriangleRightFill14: () => null }))
import { ResearchBoardCanvasOverlay, ResearchBoardHeader, shareFavorite } from '../src/preload/research-boards-ui'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const done of cleanup.splice(0)) await done(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
async function mount(kind: 'header' | 'presence', sharingState = 'shared', role = 'owner', pinned = true) {
  const w = new Window({ url: 'http://localhost/' })
  vi.stubGlobal('document', w.document); vi.stubGlobal('window', w); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const state: any = { account: { user: { userId: 'self' } }, favorites: [], boards: [{ boardId: 'b', localSessionId: 's', pinned }] }
  const view: any = { boardId: 'b', board: { sharingState, title: '专用研究', lifecycle: 'active' }, permissions: { read: true, edit: role !== 'viewer', manage: role === 'owner' }, connection: 'online', members: [{ userId: 'self', username: '自己', role: 'owner' }], presence: [{ userId: 'peer', username: '林然', role: 'editor', cursor: { x: 100, y: 200 }, selectedIds: ['card'] }], seq: 1 }
  const listeners = new Set<() => void>(); let currentState = state
  const actions: string[] = []
  const page: any = { version: () => currentState, getView: () => view, getState: () => currentState, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }, isResearch: () => true, isLoading: () => false, activationError: () => null, editorError: () => null, favorite: async () => { throw Error('ownerOnly must use board pin state, not personal favorite deletion') }, showError: (error: unknown) => { throw error }, call: async (action: string, payload: any) => { actions.push(action); expect(payload.boardId).toBe('b'); currentState = { ...currentState, boards: [{ ...currentState.boards[0], pinned: action === 'board.pin' }] }; listeners.forEach(fn => fn()) } }
  let snapshot: any = { viewport: { x: 10, y: 20, scale: .5 }, files: [], artifacts: [{ id: 'card', x: 400, y: 300, width: 656, height: 456 }] }
  const workspace: any = { subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => snapshot }
  const host = w.document.createElement('div'); w.document.body.append(host); const root = createRoot(host as unknown as HTMLElement)
  await act(async () => { root.render(React.createElement((kind === 'header' ? ResearchBoardHeader : ResearchBoardCanvasOverlay) as React.ComponentType<any>, { page, sessionId: 's', workspace, active: true })) })
  cleanup.push(async () => { await act(async () => root.unmount()); await w.happyDOM.abort() })
  return { host, view, actions, setSnapshot: async (next: any) => { snapshot = next; await act(async () => listeners.forEach(fn => fn())) }, emit: async () => { currentState = { ...currentState }; await act(async () => listeners.forEach(fn => fn())) } }
}
it('keeps an added private board when its header icon is clicked again', async () => {
  const f = await mount('header', 'shared')
  expect(f.host.querySelector('.srb-favorite-button')).toBeNull()
  f.view.board.sharingState = 'ownerOnly'; await f.emit()
  const button = f.host.querySelector('.srb-favorite-button') as unknown as HTMLButtonElement
  expect(button.getAttribute('aria-label')).toBe('已创建至看板区')
  expect(button.getAttribute('aria-pressed')).toBe('true')
  expect(button.textContent).toBe('')
  await act(async () => button.click())
  expect(f.actions).toEqual([])
  expect(button.getAttribute('aria-pressed')).toBe('true')
})
it('adds a dedicated private board through board pin instead of deleting its favorite', async () => {
  const f = await mount('header', 'ownerOnly', 'owner', false)
  const button = f.host.querySelector('.srb-favorite-button') as unknown as HTMLButtonElement
  expect(button.getAttribute('aria-label')).toBe('创建至看板区')
  await act(async () => button.click())
  expect(f.actions).toEqual(['board.pin'])
  expect(button.getAttribute('aria-label')).toBe('已创建至看板区')
})
it('keeps shared viewer management without dedicated pin or invitation actions', async () => {
  const f = await mount('header', 'shared', 'viewer')
  expect(f.host.querySelector('.srb-favorite-button')).toBeNull()
  expect(f.host.querySelector('.srb-add-collaborator')).toBeNull()
  expect(f.host.querySelector('.srb-manage-button')?.textContent).toBe('管理')
})
it('projects peer geometry through the viewport while rendering vector cursor and an editing label', async () => {
  const f = await mount('presence')
  const box = f.host.querySelector('.srb-occupied')!
  expect((box as any).style.left).toBe('46px'); expect((box as any).style.top).toBe('56px')
  expect((box as any).style.width).toBe('328px'); expect((box as any).style.height).toBe('228px')
  expect(box.querySelector('svg rect')).not.toBeNull()
  expect(box.textContent).toBe('林然正在编辑')
  const cursor = f.host.querySelector('.srb-cursor')!
  expect(cursor.querySelector('svg path')).not.toBeNull(); expect(cursor.textContent).toBe('林然')
  expect((cursor as any).style.left).toBe('60px'); expect((cursor as any).style.top).toBe('120px')
  f.view.presence = []; await f.emit()
  expect(f.host.querySelector('.srb-occupied')).toBeNull(); expect(f.host.querySelector('.srb-cursor')).toBeNull()
})
it('does not label a viewer selection as editing while retaining the live cursor', async () => {
  const f = await mount('presence')
  f.view.presence[0].role = 'viewer'; await f.emit()
  expect(f.host.querySelector('.srb-occupied')).toBeNull()
  expect(f.host.querySelector('.srb-cursor')?.textContent).toBe('林然')
})
it('renders the checked creation recipient from lookup and clears it when the ID changes', async () => {
  const w = new Window({ url: 'http://localhost/' }); vi.stubGlobal('document', w.document)
  cleanup.push(async () => { await w.happyDOM.abort() })
  const call = vi.fn(async (action: string) => action === 'board.previewCapture'
    ? { captureId: 'capture', nodeCount: 3, historyCount: 2, assetBytes: 0 }
    : { user: { userId: 'peer', publicId: '2468135790', username: '林然' } })
  const page: any = { getState: () => ({ account: { status: 'ready', user: { userId: 'self' } } }), call }
  shareFavorite(page, { favoriteId: 'favorite', title: '测试研究' } as any)
  await new Promise(resolve => setTimeout(resolve, 0))
  const dialog = w.document.querySelector('.srb-create-collaboration-dialog')!
  const input = dialog.querySelector('[aria-label="对方专有 ID"]') as any
  input.value = '2468 1357 90'
  const lookup = [...dialog.querySelectorAll('button')].find(button => button.textContent === '查找并核对')!
  lookup.click(); await new Promise(resolve => setTimeout(resolve, 0))
  expect(call).toHaveBeenCalledWith('user.lookup', { publicId: '2468135790' })
  const result = dialog.querySelector('.srb-recipient')!
  expect(result.textContent).toContain('林然ID 2468 1357 90')
  expect(result.querySelector('[aria-label="已核对接收人"]')).not.toBeNull()
  const send = [...dialog.querySelectorAll('button')].find(button => button.textContent === '发送邀请')!
  expect(send.disabled).toBe(false)
  input.value = '1111111111'; input.dispatchEvent(new w.Event('input'))
  expect(result.textContent).toBe(''); expect(send.disabled).toBe(true)
  expect(call.mock.calls.some(([action]) => action === 'board.create' || action === 'invitation.send')).toBe(false)
})


it('offers board-only sharing when saved history contains a local path and uses the reviewed capture', async () => {
  const w = new Window({ url: 'http://localhost/' })
  vi.stubGlobal('document', w.document)
  cleanup.push(async () => { await w.happyDOM.abort() })
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  const call = vi.fn(async (action: string, input: any) => {
    if (action === 'board.previewCapture') {
      if (input.includeHistory !== false) {
        throw Object.assign(Error('研究对话含无法安全转换的本机路径'), { code: 'PRIVATE_PATH_IN_HISTORY' })
      }
      return { captureId: 'board-only', nodeCount: 12, historyCount: 0, assetBytes: 1024 }
    }
    if (action === 'user.lookup') return { user: { publicId: '2468135790', username: '林然' } }
    if (action === 'board.create') return { board: { boardId: 'board' } }
    if (action === 'invitation.send') return {}
    throw Error('Unexpected action: ' + action)
  })
  const page: any = {
    getState: () => ({ account: { status: 'ready', user: { userId: 'self' } } }),
    call,
    openBoard: async () => {},
    current: () => ''
  }
  shareFavorite(page, { favoriteId: 'favorite', title: '指数运营研究' } as any)
  await flush()
  const dialog = w.document.querySelector('.srb-create-collaboration-dialog')!
  const button = (name: string) => [...dialog.querySelectorAll('button')].find(b => b.textContent === name)!
  expect(dialog.textContent).toContain('本机路径')
  expect(call.mock.calls).toEqual([['board.previewCapture', { favoriteId: 'favorite' }]])
  const shareBoardOnly = button('仅共享看板')
  expect(shareBoardOnly).toBeDefined()
  shareBoardOnly.click()
  await flush()
  expect(dialog.textContent).toContain('12 个组件')
  expect(dialog.textContent).toContain('不包含原研究对话')
  expect(call).toHaveBeenLastCalledWith('board.previewCapture', { favoriteId: 'favorite', includeHistory: false })
  const input = dialog.querySelector('[aria-label="对方专有 ID"]') as unknown as HTMLInputElement
  input.value = '2468135790'
  button('查找并核对').click()
  await flush()
  button('发送邀请').click()
  await flush()
  expect(call).toHaveBeenCalledWith('board.create', {
    favoriteId: 'favorite', title: '指数运营研究 · 协作', captureId: 'board-only', includeHistory: false
  })
})


it('keeps idle presence free of polling and expires geometry previews once', async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','Date']})
 const interval=vi.spyOn(globalThis,'setInterval')
 const f=await mount('presence')
 expect(interval).not.toHaveBeenCalled()
 f.view.presence[0].previewExpiresAt=Date.now()+1000
 f.view.presence[0].previewSeq=1
 f.view.presence[0].previews=[{nodeId:'card',x:600,y:300,width:656,height:456}]
 await f.emit()
 expect(f.host.querySelector('.srb-occupied')!.getAttribute('data-geometry-preview')).toBe('true')
 await act(async()=>{await vi.advanceTimersByTimeAsync(1001)})
 expect(f.host.querySelector('.srb-occupied')!.getAttribute('data-geometry-preview')).toBe('false')
 expect(vi.getTimerCount()).toBe(0)
})
