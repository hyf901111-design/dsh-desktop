import { clipboard, dialog, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { registerTrustedMainWindowHandler } from './ipc-trust'

const MAX_BYTES = 20 * 1024 * 1024
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** Only image bytes already loaded by the conversation cross this boundary. */
export function registerImageActions(getWindow: () => BrowserWindow | undefined): void {
  const channel = 'conversation:image-action'
  ipcMain.removeHandler(channel)
  registerTrustedMainWindowHandler(ipcMain, channel, getWindow, async (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw Error('Invalid image action')
    const { action, data, name, format } = input as Record<string, unknown>
    if (!['copy', 'download'].includes(String(action)) || !(data instanceof Uint8Array) ||
      data.byteLength < 24 || data.byteLength > (format ? 34 * 1024 * 1024 : MAX_BYTES) ||
      (format !== undefined && (action !== 'download' || (format !== 'png' && format !== 'jpg')))) throw Error('Invalid image action')
    const bytes = Buffer.from(data)
    if (!bytes.subarray(0, 8).equals(PNG) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw Error('Invalid PNG image')
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
    if (!width || !height || width * height > 32_000_000) throw Error('Image dimensions exceeded')
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw Error('Invalid PNG image')
    if (action === 'copy') {
      clipboard.writeImage(image)
      return { ok: true }
    }
    const window = getWindow()
    if (!window || window.isDestroyed()) throw Error('Window unavailable')
    const extension = format === 'jpg' ? 'jpg' : 'png'
    const safeName = typeof name === 'string' ? name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f<>:"|?*]/g, '').slice(0, 120).replace(format ? /\.(png|jpe?g)$/i : /\.png$/i, '') : ''
    const result = await dialog.showSaveDialog(window, {
      defaultPath: (safeName || '生成图片') + '.' + extension, filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return { ok: true, cancelled: true }
    await writeFile(result.filePath, extension === 'jpg' ? image.toJPEG(92) : bytes)
    return { ok: true }
  })
}
