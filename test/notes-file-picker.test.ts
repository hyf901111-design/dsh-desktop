import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installNotesService } from '../src/main/notes/service'

const { showOpenDialog } = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showOpenDialog, showSaveDialog: async () => ({ canceled: true }) }
}))

const roots: string[] = []
const disposers: Array<() => void> = []
beforeEach(() => showOpenDialog.mockReset().mockResolvedValue({ canceled: true, filePaths: [] }))
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})

function service() {
  const root = mkdtempSync(join(tmpdir(), 'ework-note-picker-')); roots.push(root)
  const window = { isDestroyed: () => false, webContents: { mainFrame: { processId: 1, routingId: 2 } } }
  let handler: any, owner = 'alice', allowed = true
  disposers.push(installNotesService({
    ipcMain: { handle: (_channel: string, fn: any) => { handler = fn }, removeHandler: () => {} },
    root, getWindow: () => window, owner: () => owner, canRead: () => allowed,
    runtimeUrl: () => undefined, clipboard: () => undefined
  }))
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const file = (name: string) => { const path = join(root, name); writeFileSync(path, name); return path }
  return {
    root, window, event, file,
    call: (kind: unknown, input: object = {}) => handler(event, 'file-pick', { sessionId: 'session', owner, kind, ...input }),
    untrusted: () => handler({ ...event, senderFrame: { processId: 1, routingId: 3 } }, 'file-pick', { sessionId: 'session', owner, kind: 'file' }),
    changeOwner: () => { owner = 'bob' }, deny: () => { allowed = false }
  }
}

it.each([
  ['image', 'photo.JPG', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif']],
  ['video', 'clip.MOV', ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'qt']],
  ['audio', 'voice.M4A', ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'aiff', 'opus', 'caf']]
] as const)('picks %s files with the trusted window and the corresponding OS filter', async (kind, name, extensions) => {
  const s = service(), path = s.file(name)
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [path] })
  expect(await s.call(kind)).toEqual({ files: [{ name, path }] })
  expect(showOpenDialog).toHaveBeenCalledWith(s.window, expect.objectContaining({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: expect.any(String), extensions: [...extensions] }]
  }))
})

it('allows unrestricted file types and keeps the selected order and original paths', async () => {
  const s = service(), first = s.file('report.pdf'), second = s.file('LICENSE')
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [first, second] })
  expect(await s.call('file')).toEqual({ files: [{ name: 'report.pdf', path: first }, { name: 'LICENSE', path: second }] })
  expect(showOpenDialog.mock.calls[0]![1].filters).toBeUndefined()
})

it('returns an empty selection when the OS dialog is canceled', async () => {
  const s = service(), path = s.file('photo.png')
  showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [path] })
  expect(await s.call('image')).toEqual({ files: [] })
})

it.each(['invalid', 'IMAGE', '', null, {}])('rejects invalid picker kind %j before showing a dialog', async kind => {
  const s = service()
  await expect(s.call(kind)).rejects.toThrow('类型')
  expect(showOpenDialog).not.toHaveBeenCalled()
})

it.each(['image', 'video', 'audio'])('rejects a wrong media extension returned for %s', async kind => {
  const s = service(), path = s.file('report.pdf')
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [path] })
  await expect(s.call(kind)).rejects.toThrow('类型')
})

it('rejects a directory returned by the OS dialog even when its name has an accepted extension', async () => {
  const s = service(), path = join(s.root, 'folder.png'); mkdirSync(path)
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [path] })
  await expect(s.call('image')).rejects.toThrow('文件')
})

it('accepts 64 files but rejects a larger selection', async () => {
  const s = service(), filePaths = Array.from({ length: 65 }, (_, i) => s.file(`file-${i}.txt`))
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: filePaths.slice(0, 64) })
  expect((await s.call('file')).files).toHaveLength(64)
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths })
  await expect(s.call('file')).rejects.toThrow('64')
})

it('does not return paths selected before an account change', async () => {
  const s = service(), path = s.file('private.pdf')
  showOpenDialog.mockImplementationOnce(async () => { s.changeOwner(); return { canceled: false, filePaths: [path] } })
  expect(await s.call('file')).toEqual({ files: [] })
})

it('does not return selected paths after the session becomes unreadable', async () => {
  const s = service(), path = s.file('private.pdf')
  showOpenDialog.mockImplementationOnce(async () => { s.deny(); return { canceled: false, filePaths: [path] } })
  expect(await s.call('file')).toEqual({ files: [] })
})

it('keeps existing trusted window, session access, and owner guards before opening a picker', async () => {
  const s = service()
  expect(() => s.untrusted()).toThrow('main EWork')
  await expect(s.call('file', { owner: 'earlier-owner' })).rejects.toThrow('账号已变化')
  s.deny()
  await expect(s.call('file')).rejects.toThrow('会话不可用')
  expect(showOpenDialog).not.toHaveBeenCalled()
})
