import { randomUUID } from 'node:crypto'
import { ipcMain, type BrowserWindow } from 'electron'
import { registerTrustedMainWindowHandler } from './ipc-trust'

const limit = 8 * 1024 * 1024

export function installImageFactory(getWindow: () => BrowserWindow | undefined, runtimeUrl: () => string | undefined) {
  const token = randomUUID()
  let active: { id: string; controller: AbortController } | undefined
  const reset = () => { active?.controller.abort() }
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:generate', getWindow, async (_event, value: unknown) => {
    const { id, prompt, size, reference } = (value ?? {}) as {
      id: string; prompt: string; size: string; reference?: { data: Uint8Array; mediaType: string }
    }
    const base = runtimeUrl()
    if (!base) throw Error('图像服务正在启动，请稍后重试。')
    if (active) throw Error('请等待当前图片任务完成。')
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || typeof prompt !== 'string' ||
      !prompt.trim() || prompt.length > 4000 || !['1024x1024', '1024x1536', '1536x1024'].includes(size) ||
      (reference !== undefined && (!(reference?.data instanceof Uint8Array) || reference.data.byteLength > limit ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(reference.mediaType)))) throw Error('图片请求参数无效。')
    const controller = new AbortController()
    active = { id, controller }
    try {
      const response = await fetch(new URL('/sherlock/image-factory/generate', base), {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ requestId: id, prompt, size, reference: reference &&
          { data: Buffer.from(reference.data).toString('base64'), mediaType: reference.mediaType } }),
      })
      const body = await response.json() as { data?: string; error?: string }
      controller.signal.throwIfAborted()
      if (!response.ok || typeof body.data !== 'string') throw Error(body.error || '图像服务未返回图片。')
      return new Uint8Array(Buffer.from(body.data, 'base64'))
    } finally { active = undefined }
  })
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:cancel', getWindow, (_event, id: unknown) => {
    if (active?.id === id) reset()
  })
  return { token, reset }
}
