import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Menu: () => null, IconEllipsisOutline16: () => null, IconSearchOutline16: () => null, IconPersonalizationOutline16: () => null, IconCloseFill14: () => null, IconFolderOpenOutline16: () => null, IconEditOutline16: () => null, IconTriangleRightFill14: () => null }))
import { addBoardCollaborator } from '../src/preload/research-boards-ui'

it('keeps an invalid ID error next to its field, clears it on edit, and still requires recipient verification', async () => {
  const win = new Window({ url: 'http://localhost/' })
  vi.stubGlobal('document', win.document)
  const call = vi.fn(async () => ({ user: { userId: 'second', username: '测试成员', publicId: '1234567890' } }))
  const page = {
    getView: () => ({ permissions: { read: true, manage: true }, board: { title: '测试画板', lifecycle: 'active', sharingState: 'shared' } }),
    getState: () => ({ account: { user: { userId: 'owner' } } }), call
  } as unknown as Parameters<typeof addBoardCollaborator>[0]
  try {
    addBoardCollaborator(page, 'board', 'session')
    const input = win.document.querySelector('input')!, lookup = win.document.querySelector('[aria-label="查找并核对"]') as unknown as HTMLButtonElement
    const send = win.document.querySelector('[aria-label="发送邀请"]') as unknown as HTMLButtonElement
    input.value = '123'; input.dispatchEvent(new win.Event('input', { bubbles: true })); lookup.click()
    expect(input.value).toBe('123'); expect(call).not.toHaveBeenCalled(); expect(send.disabled).toBe(true)
    const error = input.closest('label')!.querySelector('[role="alert"]')!
    expect(error.textContent).toContain('10 位数字 ID')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(win.document.querySelector('.srb-status')?.textContent).toBe('')
    input.value = '1234567890'; input.dispatchEvent(new win.Event('input', { bubbles: true }))
    expect(error.textContent).toBe(''); expect(input.hasAttribute('aria-invalid')).toBe(false); expect(send.disabled).toBe(true)
    lookup.click()
    await vi.waitFor(() => expect(send.disabled).toBe(false))
    expect(call).toHaveBeenCalledExactlyOnceWith('user.lookup', { publicId: '1234567890' })
    expect(win.document.querySelector('[aria-label="已核对接收人"]')).not.toBeNull()
  } finally { vi.unstubAllGlobals(); await win.happyDOM.close() }
})
