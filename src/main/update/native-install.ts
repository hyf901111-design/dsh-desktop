import type { EventEmitter } from 'node:events'
import type { AutoUpdater } from 'electron'

// With autoInstallOnAppQuit disabled, the verified archive is served locally
// but Squirrel must still prepare it. Own the one-shot listeners so a timeout
// or a failed attempt cannot leave a late callback that unexpectedly quits.
export function prepareNativeMacInstall(
  updater: Pick<EventEmitter, 'once' | 'removeListener'> & Pick<AutoUpdater, 'checkForUpdates' | 'quitAndInstall'>,
  timeoutMs = 120_000,
  beforeQuit?: (signal: AbortSignal) => Promise<(() => void) | undefined>
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const preparation = new AbortController()
    const cleanup = () => {
      clearTimeout(timer)
      updater.removeListener('update-downloaded', ready)
      updater.removeListener('error', failed)
    }
    const failed = (error: Error) => { if (settled) return; settled = true; preparation.abort(error); cleanup(); reject(error) }
    const ready = async () => {
      let cancel: (() => void) | undefined
      try {
        cancel = await beforeQuit?.(preparation.signal)
        if (settled) { cancel?.(); return }
        updater.quitAndInstall()
        settled = true
        cleanup()
        resolve()
      } catch (error) { cancel?.(); failed(error as Error) }
    }
    const timer = setTimeout(() => failed(new Error(
      '安装器准备超时，应用尚未退出。请检查系统授权提示后重试更新。'
    )), timeoutMs)
    updater.once('update-downloaded', ready)
    updater.once('error', failed)
    try { updater.checkForUpdates() } catch (error) { failed(error as Error) }
  })
}
