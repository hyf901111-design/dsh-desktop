import type { EventEmitter } from 'node:events'
import type { AutoUpdater } from 'electron'

// Squirrel extracts and verifies the local archive while the current app stays
// usable. Preparation never quits; only the later explicit restart action may.
export function prepareNativeMacInstall(
  updater: Pick<EventEmitter, 'once' | 'removeListener'> & Pick<AutoUpdater, 'checkForUpdates'>,
  timeoutMs = 120_000,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      updater.removeListener('update-downloaded', ready)
      updater.removeListener('error', failed)
      signal?.removeEventListener('abort', aborted)
    }
    const failed = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error) }
    const aborted = () => failed(signal?.reason instanceof Error ? signal.reason : Error('Update preparation cancelled.'))
    const ready = () => { if (settled) return; settled = true; cleanup(); resolve() }
    const timer = setTimeout(() => failed(new Error(
      '安装器准备超时，应用尚未退出。请检查系统授权提示后重试更新。'
    )), timeoutMs)
    updater.once('update-downloaded', ready)
    updater.once('error', failed)
    signal?.addEventListener('abort', aborted, { once: true })
    if (signal?.aborted) { aborted(); return }
    try { updater.checkForUpdates() } catch (error) { failed(error as Error) }
  })
}
