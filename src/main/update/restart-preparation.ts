import { randomUUID } from 'node:crypto'
import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron'
import { assertTrustedMainWindowEvent } from '../ipc-trust'

/** Wait for the real page to drain edits before flushing the main-process queues. */
export function prepareUpdateRestart(
  window: BrowserWindow | undefined,
  ipc: Pick<IpcMain, 'on' | 'removeListener'>,
  save: () => Promise<void>,
  timeoutMs = 45_000
): Promise<void> {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return Promise.reject(Error('研究窗口不可用，已停止自动重启。'))
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    let settled = false, received = false
    const cleanup = () => {
      clearTimeout(timer)
      ipc.removeListener('updates:prepared', reply)
      window.webContents.removeListener('destroyed', destroyed)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      error ? reject(error) : resolve()
    }
    const destroyed = () => finish(Error('研究窗口已关闭，已停止自动重启。'))
    const reply = (event: IpcMainEvent, id: unknown, error: unknown) => {
      if (id !== requestId || received || settled) return
      try { assertTrustedMainWindowEvent(event, window) } catch { return }
      received = true
      if (typeof error === 'string' && error) { finish(Error(error.slice(0, 1200))); return }
      void Promise.resolve().then(save).then(() => finish(), error => finish(error instanceof Error ? error : Error(String(error))))
    }
    const timer = setTimeout(() => finish(Error('保存研究状态超时，应用尚未退出，请重试更新。')), timeoutMs)
    ipc.on('updates:prepared', reply)
    window.webContents.once('destroyed', destroyed)
    try { window.webContents.send('updates:prepare', requestId) } catch (error) { finish(error as Error) }
  })
}
