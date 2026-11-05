import { beforeEach, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ handlers: new Map(), write: vi.fn(), save: vi.fn(), decode: vi.fn(), clipboard: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { removeHandler: (name: string) => native.handlers.delete(name), handle: (name: string, handler: unknown) => native.handlers.set(name, handler) },
  nativeImage: { createFromBuffer: native.decode }, clipboard: { writeImage: native.clipboard }, dialog: { showSaveDialog: native.save }
}))
vi.mock('node:fs/promises', () => ({ writeFile: native.write }))
import { registerImageActions } from '../src/main/image-actions'
const frame = { processId: 1, routingId: 2 }, webContents = { mainFrame: frame }
const window = { isDestroyed: () => false, webContents }, event = { sender: webContents, senderFrame: frame }
const png = () => new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'))
const call = (input: unknown, sender = event) => native.handlers.get('conversation:image-action')(sender, input)
beforeEach(() => { vi.clearAllMocks(); native.decode.mockReturnValue({ isEmpty: () => false }); registerImageActions(() => window as any) })
it('copies the original PNG through the native image clipboard', async () => {
  await expect(call({ action: 'copy', data: png() })).resolves.toEqual({ ok: true })
  expect(native.decode).toHaveBeenCalledWith(Buffer.from(png()))
  expect(native.clipboard).toHaveBeenCalledOnce(); expect(native.save).not.toHaveBeenCalled()
})
it('downloads exact original bytes only to the save-dialog selection', async () => {
  native.save.mockResolvedValue({ canceled: false, filePath: '/tmp/chosen.png' })
  await call({ action: 'download', data: png(), name: '../../原图.png' })
  expect(native.save.mock.calls[0]?.[1].defaultPath).toBe('原图.png')
  expect(native.write).toHaveBeenCalledWith('/tmp/chosen.png', Buffer.from(png()))
})
it('does not write when the user cancels download', async () => {
  native.save.mockResolvedValue({ canceled: true })
  await expect(call({ action: 'download', data: png() })).resolves.toEqual({ ok: true, cancelled: true })
  expect(native.write).not.toHaveBeenCalled()
})
it('rejects subframes, invalid images and oversized decoded dimensions before an action', async () => {
  expect(() => call({ action: 'copy', data: png() }, { ...event, senderFrame: { ...frame, routingId: 9 } })).toThrow('main EWork Odyssey window')
  await expect(call({ action: 'copy', data: new Uint8Array(24) })).rejects.toThrow('PNG')
  const large = Buffer.from(png()); large.writeUInt32BE(10000, 16); large.writeUInt32BE(10000, 20)
  await expect(call({ action: 'copy', data: large })).rejects.toThrow('dimensions')
  expect(native.clipboard).not.toHaveBeenCalled(); expect(native.save).not.toHaveBeenCalled()
})
