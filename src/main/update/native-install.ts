import type { EventEmitter } from 'node:events'
import type { AutoUpdater } from 'electron'

// With autoInstallOnAppQuit disabled, the verified archive is served locally
// but Squirrel must still prepare it. Own the one-shot listeners so a timeout
// or a failed attempt cannot leave a late callback that unexpectedly quits.
export function prepareNativeMacInstall(
  updater: Pick<EventEmitter, 'once' | 'removeListener'> & Pick<AutoUpdater, 'checkForUpdates' | 'quitAndInstall'>,
  timeoutMs = 120_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      updater.removeListener('update-downloaded', ready)
      updater.removeListener('error', failed)
    }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const ready = () => {
      cleanup()
      try { updater.quitAndInstall(); resolve() } catch (error) { reject(error) }
    }
    const timer = setTimeout(() => failed(new Error(
      '安装器准备超时，应用尚未退出。请检查系统授权提示后重试更新。'
    )), timeoutMs)
    updater.once('update-downloaded', ready)
    updater.once('error', failed)
    try { updater.checkForUpdates() } catch (error) { failed(error as Error) }
  })
}
