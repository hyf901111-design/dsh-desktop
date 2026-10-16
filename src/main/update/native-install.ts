import type { EventEmitter } from 'node:events'
import type { AutoUpdater } from 'electron'

type NativeUpdater = Pick<EventEmitter, 'once' | 'removeListener'> & Pick<AutoUpdater, 'checkForUpdates'>
type Preparation = {
  ready: boolean
  error?: Error
  waiters: Set<(error?: Error) => void>
  dispose: (error: Error) => void
}
const preparations = new WeakMap<NativeUpdater, Preparation>()

// A JS timeout cannot cancel Squirrel's RACCommand. Keep its terminal listeners
// independently of callers so retries join it and late completion stays usable.
// Preparation never quits; only the later explicit restart action may.
export function prepareNativeMacInstall(updater: NativeUpdater, timeoutMs = 120_000, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal))
  const preparation = preparations.get(updater) ?? startPreparation(updater)
  return waitForPreparation(preparation, timeoutMs, signal)
}

// MacUpdater.downloadUpdate replaces the native feed. Finish the previous
// command before that happens, then discard readiness belonging to its archive.
export async function resetNativeMacPreparation(updater: NativeUpdater, timeoutMs = 120_000, signal?: AbortSignal): Promise<void> {
  const preparation = preparations.get(updater)
  if (!preparation) return
  await waitForPreparation(preparation, timeoutMs, signal)
  if (preparations.get(updater) === preparation) preparations.delete(updater)
}

// Used on shutdown and native install errors, including after a caller timed
// out. This only releases our state/listeners; Electron has no cancel API.
export function disposeNativeMacPreparation(updater: NativeUpdater, error = Error('Update preparation cancelled.')): void {
  preparations.get(updater)?.dispose(error)
}

function startPreparation(updater: NativeUpdater): Preparation {
  let settled = false
  const preparation: Preparation = {
    ready: false,
    waiters: new Set(),
    dispose: error => {
      if (preparations.get(updater) === preparation) preparations.delete(updater)
      finish(error)
    }
  }
  const finish = (error?: Error) => {
    if (settled) return
    settled = true
    updater.removeListener('update-downloaded', ready)
    updater.removeListener('error', failed)
    preparation.error = error
    preparation.ready = !error
    if (error && preparations.get(updater) === preparation) preparations.delete(updater)
    for (const waiter of preparation.waiters) waiter(error)
    preparation.waiters.clear()
  }
  const ready = () => finish()
  const failed = (error: Error) => finish(error)
  preparations.set(updater, preparation)
  updater.once('update-downloaded', ready)
  updater.once('error', failed)
  try { updater.checkForUpdates() } catch (error) { failed(error as Error) }
  return preparation
}

function waitForPreparation(preparation: Preparation, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) { const error = abortError(signal); preparation.dispose(error); return Promise.reject(error) }
  if (preparation.error) return Promise.reject(preparation.error)
  if (preparation.ready) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      preparation.waiters.delete(finish)
      signal?.removeEventListener('abort', aborted)
      error ? reject(error) : resolve()
    }
    const aborted = () => preparation.dispose(abortError(signal!))
    const timer = setTimeout(() => finish(Error(
      '安装器准备超时，但仍在后台继续。应用尚未退出，请检查系统授权提示后重试等待。'
    )), timeoutMs)
    preparation.waiters.add(finish)
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : Error('Update preparation cancelled.')
}
