import {
  registerTrustedMainWindowHandler,
  type TrustedWindow,
  type TrustedWindowEvent
} from './ipc-trust'

type DeliveryFileClipboardOptions = {
  ipcMain: {
    removeHandler(channel: string): void
    handle(
      channel: string,
      handler: (event: TrustedWindowEvent, value: unknown) => { ok: true }
    ): unknown
  }
  getMainWindow(): TrustedWindow | undefined
  writeText(value: string): void
}

export function registerDeliveryFileClipboard(options: DeliveryFileClipboardOptions): void {
  const channel = 'filesystem:copy-file-path'
  options.ipcMain.removeHandler(channel)
  registerTrustedMainWindowHandler(
    options.ipcMain,
    channel,
    options.getMainWindow,
    (_event, value: unknown): { ok: true } => {
      if (typeof value !== 'string' || value.length < 1 || value.length > 8192 ||
        value.trim().length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
        throw new Error('A local file path is required.')
      }
      const trimmed = value.trim()
      const windowsDrive = /^[a-z]:[\\/]/i.test(trimmed)
      if (trimmed.startsWith('//') || (!windowsDrive && /^[a-z][a-z\d+.-]*:/i.test(trimmed))) {
        throw new Error('A local file path is required.')
      }
      options.writeText(value)
      return { ok: true }
    }
  )
}
