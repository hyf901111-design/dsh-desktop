import { randomUUID } from 'node:crypto'

export type BackgroundApplication = { bundle_id: string; launch_path?: string }
export type BackgroundInspection = { code: string; reason?: string; apps: (BackgroundApplication & { name: string; running: boolean; pid?: number; active: boolean })[] }
export type BackgroundLaunchResult = {
  performed: boolean | null
  dispatched: boolean
  code: string
  delivery_mode: 'background'
  effect?: string
  pid?: number
  launch_path?: string
  bundle_id?: string
  reason?: string
  [key: string]: unknown
}
export interface BackgroundLaunchBinding {
  inspect(args: BackgroundApplication): Promise<BackgroundInspection>
  launch(args: BackgroundApplication & { request_id: string; timeout_ms: number }): Promise<BackgroundLaunchResult>
  cancelLaunch(requestId: string): void
}

/** Metadata reads run on a native worker. A late read-only result is discarded;
 * timing out this operation never schedules a launch or any input. */
export function createBackgroundApplicationInspector(load: () => BackgroundLaunchBinding) {
  return async (application: BackgroundApplication, signal: AbortSignal): Promise<BackgroundInspection> => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(5000)])
    bounded.throwIfAborted()
    const pending = load().inspect({ bundle_id: application.bundle_id, launch_path: application.launch_path })
    return await new Promise<BackgroundInspection>((resolve, reject) => {
      const abort = () => reject(Error('应用身份解析已取消或超时，未启动任何应用。'))
      bounded.addEventListener('abort', abort, { once: true })
      if (bounded.aborted) abort()
      void pending.then(resolve, reject).finally(() => bounded.removeEventListener('abort', abort))
    })
  }
}

/** The native deadline owns completion. Never reject a dispatched launch as if
 * nothing happened, and never retry it after cancellation or missing readback. */
export function createBackgroundApplicationLauncher(load: () => BackgroundLaunchBinding) {
  return async (application: BackgroundApplication, signal: AbortSignal): Promise<BackgroundLaunchResult> => {
    if (signal.aborted) return { performed: false, dispatched: false, code: 'launch_cancelled_before_dispatch', delivery_mode: 'background' }
    const native = load()
    const requestId = randomUUID()
    const pending = native.launch({ bundle_id: application.bundle_id,
      ...(application.launch_path ? { launch_path: application.launch_path } : {}), request_id: requestId, timeout_ms: 15000 })
    const cancel = () => native.cancelLaunch(requestId)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    try {
      const result = await pending
      if (signal.aborted && result.dispatched) return { ...result, performed: null, effect: 'unknown',
        code: 'launch_cancelled_after_dispatch', reason: '后台启动已经投递后收到停止请求；应用可能已启动，请先重新发现准确 PID 和窗口，不能自动重试启动。' }
      return result
    } finally { signal.removeEventListener('abort', cancel) }
  }
}
