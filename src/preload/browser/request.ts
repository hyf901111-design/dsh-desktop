import type { BrowserBridge } from '../../shared/browser-app'

/** Electron wraps errors thrown by the browser service on their way to the renderer. */
export function browserRequest(invoke: BrowserBridge['request']): BrowserBridge['request'] {
  return async (method, input) => {
    try {
      return await invoke(method, input)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const wrapped = /^Error invoking remote method (['"])browser-app:request\1:\s*(?:Error:\s*)?([\s\S]*)$/u.exec(message)
      if (!wrapped) throw error
      throw new Error(wrapped[2]?.trim() || '浏览器操作失败，请重试。', { cause: error })
    }
  }
}
