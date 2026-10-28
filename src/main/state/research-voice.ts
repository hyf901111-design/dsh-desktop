import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust'
import type { ResearchVoiceActiveRequest, ResearchVoiceEvent, ResearchVoiceNativeEvent, ResearchVoiceRequest, ResearchVoiceResult, ResearchVoiceState } from '../../shared/research-voice'

export type ResearchVoiceWindow = TrustedWindow & {
  isFocused(): boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  removeListener(event: string, listener: (...args: any[]) => void): unknown
  webContents: TrustedWindow['webContents'] & {
    isDestroyed(): boolean
    send(channel: string, value: ResearchVoiceEvent): void
    on(event: string, listener: (...args: any[]) => void): unknown
    removeListener(event: string, listener: (...args: any[]) => void): unknown
  }
}

export type ResearchVoiceNative = {
  init(listener: (event: ResearchVoiceNativeEvent) => void): void
  setEnabled(enabled: boolean): void
  start(requestId: string, locale: string): void
  stop(requestId: string): void
  cancel(requestId: string): void
  dispose(): void
}

type ResearchVoiceOptions = {
  getMainWindow(): ResearchVoiceWindow | undefined
  platform?: NodeJS.Platform
  isPackaged?: boolean
  resourcesPath?: string
  appPath?: string
  locale?: string
  loadNative?(path: string): ResearchVoiceNative
}

type ActiveResearch = {
  sessionId: string
  window: ResearchVoiceWindow
  frame: { processId: number; routingId: number }
}
type Capture = ResearchVoiceRequest & { nativeRequestId: string; active: ActiveResearch; state: ResearchVoiceState }
const unavailable = (diagnostic?: string): ResearchVoiceResult => ({ ok: false, error: diagnostic || '此设备暂时无法使用语音识别，请在 macOS 版 EWork Odyssey 中重试。' })
const invalid = (): ResearchVoiceResult => ({ ok: false, error: '语音请求已失效，请返回当前研究重新开始。' })

// Loading/initialization happens before microphone access; preserve the useful
// failure reason while omitting filesystem paths and require-stack details.
function nativeFailureDiagnostic(stage: 'load' | 'init', error: unknown): string {
  const detail = error instanceof Error ? error.message.split(/\r?\n/, 1)[0] || '未知错误' : '未知错误'
  const message = detail
    .replace(/(['"])(?:\/|[A-Za-z]:\\)[^'"\r\n]*\1/g, '[本地路径]')
    .replace(/\/[^\s()[\]{}'",;:]+/g, '[本地路径]')
    .slice(0, 240)
  const rawCode = (error as { code?: unknown } | null)?.code
  const code = typeof rawCode === 'string' && /^[A-Z0-9_-]{1,64}$/.test(rawCode) ? `${rawCode}：` : ''
  return `语音模块${stage === 'load' ? '加载' : '初始化'}失败：${code}${message || '未知错误'}。`
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f]/.test(value)
}
function requestPayload(value: unknown, active: true): value is ResearchVoiceActiveRequest
function requestPayload(value: unknown, active?: false): value is ResearchVoiceRequest
function requestPayload(value: unknown, active = false): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = active ? ['sessionId', 'active'] : ['sessionId', 'requestId']
  return Object.keys(record).length === 2 && Object.keys(record).every((key) => keys.includes(key)) &&
    validId(record.sessionId) && (active ? typeof record.active === 'boolean' : validId(record.requestId))
}

/** Owns one foreground research capture; no audio or transcription is written to disk. */
export class ResearchVoiceController {
  private native?: ResearchVoiceNative
  private unavailable = false
  private nativeFailure?: string
  private disposed = false
  private active?: ActiveResearch
  private composer?: ActiveResearch
  private capture?: Capture
  private attachedWindow?: ResearchVoiceWindow
  private detachWindow?: () => void
  private blurTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly options: ResearchVoiceOptions) {}

  attachWindow(window: ResearchVoiceWindow): void {
    if (this.disposed || this.attachedWindow === window) return
    this.revokeActive()
    this.detachWindow?.()
    this.attachedWindow = window
    // BrowserWindow.webContents throws after the native window is destroyed.
    // Retain the emitter while alive so quit/replacement can remove listeners.
    const webContents = window.webContents
    const focus = () => { this.clearBlurTimer(); this.updateShortcut() }
    const blur = () => {
      this.updateShortcut()
      if (this.capture?.state === 'authorizing') this.cancelAfterBlur(60_000)
      else this.cancelCapture()
    }
    const navigation = (_event: unknown, _url: string, _isInPlace: boolean, isMainFrame: boolean) => {
      if (isMainFrame) this.revokeActive()
    }
    const revoke = () => this.revokeActive()
    window.on('focus', focus)
    window.on('blur', blur)
    window.on('closed', revoke)
    webContents.on('did-start-navigation', navigation)
    webContents.on('render-process-gone', revoke)
    this.detachWindow = () => {
      window.removeListener('focus', focus)
      window.removeListener('blur', blur)
      window.removeListener('closed', revoke)
      webContents.removeListener('did-start-navigation', navigation)
      webContents.removeListener('render-process-gone', revoke)
    }
  }

  setActive(value: unknown): ResearchVoiceResult {
    if (!requestPayload(value, true) || this.disposed) return invalid()
    if (!value.active) {
      // A previous renderer's cleanup must not deactivate its replacement session.
      if (this.active?.sessionId === value.sessionId) this.revokeResearch()
      return { ok: true }
    }
    const window = this.options.getMainWindow()
    if (!window || window.isDestroyed()) return invalid()
    this.attachWindow(window)
    if (this.active?.sessionId !== value.sessionId || !this.currentActive(this.active)) {
      this.revokeResearch()
      const frame = window.webContents.mainFrame
      this.active = { sessionId: value.sessionId, window, frame: { processId: frame.processId, routingId: frame.routingId } }
    }
    if (!this.ensureNative()) { this.active = undefined; return unavailable(this.nativeFailure) }
    this.updateShortcut()
    return { ok: true }
  }

  start(value: unknown): ResearchVoiceResult {
    if (!requestPayload(value) || this.disposed) return invalid()
    if ((this.options.platform ?? process.platform) !== 'darwin') return unavailable()
    if (this.nativeFailure) return unavailable(this.nativeFailure)
    const active = this.active
    if (!this.currentActive(active, true) || active.sessionId !== value.sessionId || this.capture) return invalid()
    return this.beginCapture(value, active)
  }

  /** Temporary input dictation never replaces the research/Fn registration. */
  startComposer(value: unknown): ResearchVoiceResult {
    if (!requestPayload(value) || this.disposed) return invalid()
    if ((this.options.platform ?? process.platform) !== 'darwin') return unavailable()
    if (this.nativeFailure) return unavailable(this.nativeFailure)
    const window = this.options.getMainWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed() || !window.isFocused() || this.capture) return invalid()
    this.attachWindow(window)
    if (!this.ensureNative()) return unavailable(this.nativeFailure)
    const frame = window.webContents.mainFrame
    this.composer = { sessionId: value.sessionId, window, frame: { processId: frame.processId, routingId: frame.routingId } }
    this.updateShortcut()
    return this.beginCapture(value, this.composer)
  }

  private beginCapture(value: ResearchVoiceRequest, active: ActiveResearch): ResearchVoiceResult {
    const native = this.ensureNative()
    if (!native) return unavailable(this.nativeFailure)
    // A private native ID prevents late callbacks from matching a reused renderer ID.
    const capture: Capture = { ...value, nativeRequestId: randomUUID(), active, state: 'authorizing' }
    this.capture = capture
    this.send(active, { ...value, type: 'state', state: 'authorizing' })
    try {
      native.start(capture.nativeRequestId, this.options.locale || 'zh-CN')
      return { ok: true }
    } catch {
      if (this.capture === capture) {
        this.send(active, { ...value, type: 'error', code: 'start-failed', message: '无法开始语音识别，请检查麦克风和语音识别权限后重试。' })
        this.cancelCapture(false)
      }
      return { ok: false, error: '无法开始语音识别，请检查麦克风和语音识别权限后重试。' }
    }
  }

  stop(value: unknown): ResearchVoiceResult {
    if (!requestPayload(value) || !this.matchesCapture(value)) return invalid()
    if (!this.currentActive(this.capture!.active, true)) { this.cancelCapture(); return invalid() }
    try {
      this.native!.stop(this.capture!.nativeRequestId)
      return { ok: true }
    } catch {
      this.cancelCapture()
      return { ok: false, error: '语音识别未能完成，请重新开始。' }
    }
  }

  cancel(value: unknown): ResearchVoiceResult {
    if (!requestPayload(value) || !this.matchesCapture(value)) return invalid()
    this.cancelCapture()
    return { ok: true }
  }

  dispose(): void {
    if (this.disposed) return
    this.revokeActive()
    this.disposed = true
    this.detachWindow?.()
    this.detachWindow = undefined
    this.attachedWindow = undefined
    try { this.native?.dispose() } catch { /* Shutdown must remain idempotent. */ }
    this.native = undefined
  }

  private ensureNative(): ResearchVoiceNative | undefined {
    if (this.disposed || this.unavailable || (this.options.platform ?? process.platform) !== 'darwin') return undefined
    if (this.native) return this.native
    let native: ResearchVoiceNative | undefined
    let stage: 'load' | 'init' = 'load'
    try {
      const root = this.options.isPackaged
        ? this.options.resourcesPath || process.resourcesPath
        : join(this.options.appPath || process.cwd(), 'build')
      const load = this.options.loadNative || createRequire(import.meta.url)
      native = load(join(root, 'native', 'research-voice.node')) as ResearchVoiceNative
      if (!['init', 'setEnabled', 'start', 'stop', 'cancel', 'dispose'].every((key) => typeof native?.[key as keyof ResearchVoiceNative] === 'function')) throw new Error('Invalid native module')
      stage = 'init'
      native.init((event) => this.receive(event))
      this.native = native
      return native
    } catch (error) {
      try { native?.dispose() } catch { /* No native diagnostic contains user input. */ }
      this.nativeFailure = nativeFailureDiagnostic(stage, error)
      this.unavailable = true
      return undefined
    }
  }

  private currentActive(active: ActiveResearch | undefined, focused = false): active is ActiveResearch {
    if (!active || this.disposed || this.active !== active && this.composer !== active || this.options.getMainWindow() !== active.window) return false
    const window = active.window
    if (window.isDestroyed() || window.webContents.isDestroyed()) return false
    const frame = window.webContents.mainFrame
    return frame.processId === active.frame.processId && frame.routingId === active.frame.routingId && (!focused || window.isFocused())
  }

  private matchesCapture(value: ResearchVoiceRequest): boolean {
    return !!this.capture && this.capture.sessionId === value.sessionId && this.capture.requestId === value.requestId
  }

  private receive(event: ResearchVoiceNativeEvent): void {
    if (!event || this.disposed) return
    if (event.type === 'toggle' || event.type === 'hold-start' || event.type === 'finish') {
      if (this.composer) return
      if (this.currentActive(this.active, true)) this.send(this.active, { type: event.type, sessionId: this.active.sessionId })
      return
    }
    const capture = this.capture
    if (!capture || event.requestId !== capture.nativeRequestId || !this.currentActive(capture.active)) return
    const identity = { sessionId: capture.sessionId, requestId: capture.requestId }
    if (event.type === 'state') {
      if (!['authorizing', 'listening', 'transcribing'].includes(event.state)) return
      const wasAuthorizing = capture.state === 'authorizing'
      capture.state = event.state
      // The permission sheet may release focus just before its completion callback.
      if (wasAuthorizing && event.state !== 'authorizing' && !capture.active.window.isFocused()) this.cancelAfterBlur(1_000)
      this.send(capture.active, { ...identity, type: 'state', state: event.state })
    } else if (event.type === 'partial' && typeof event.text === 'string') {
      this.send(capture.active, { ...identity, type: 'partial', text: event.text.slice(0, 12_000) })
    } else if (event.type === 'level' && Number.isFinite(event.level)) {
      this.send(capture.active, { ...identity, type: 'level', level: Math.max(0, Math.min(1, event.level)) })
    } else if (event.type === 'final' && typeof event.text === 'string') {
      this.capture = undefined
      this.clearBlurTimer()
      if (!this.currentActive(capture.active, true)) {
        this.send(capture.active, { ...identity, type: 'cancelled' })
        this.releaseComposer(capture.active)
        return
      }
      const text = event.text.trim().slice(0, 12_000)
      this.send(capture.active, text
        ? { ...identity, type: 'final', text }
        : { ...identity, type: 'error', code: 'empty-input', message: '没有识别到语音，请再试一次。' })
      this.releaseComposer(capture.active)
    } else if (event.type === 'error' || event.type === 'cancelled') {
      this.capture = undefined
      this.clearBlurTimer()
      this.send(capture.active, event.type === 'cancelled'
        ? { ...identity, type: 'cancelled' }
        : { ...identity, type: 'error', code: String(event.code || 'recognition-failed').slice(0, 80), message: String(event.message || '语音识别失败，请重试。').slice(0, 512) })
      this.releaseComposer(capture.active)
    }
  }

  private send(active: ActiveResearch, event: ResearchVoiceEvent): void {
    if (!this.currentActive(active)) return
    try { active.window.webContents.send('research:voice:event', event) } catch { /* A destroyed renderer cannot own a result. */ }
  }

  private cancelCapture(notify = true): void {
    const capture = this.capture
    this.capture = undefined
    this.clearBlurTimer()
    if (!capture) return
    // Revoke first: native cancellation can synchronously emit a terminal callback.
    try { this.native?.cancel(capture.nativeRequestId) } catch { /* Ownership is already revoked. */ }
    if (notify) this.send(capture.active, { type: 'cancelled', sessionId: capture.sessionId, requestId: capture.requestId })
    this.releaseComposer(capture.active)
  }

  private releaseComposer(active: ActiveResearch): void {
    if (this.composer !== active) return
    this.composer = undefined
    this.updateShortcut()
  }

  private revokeResearch(): void {
    if (this.capture?.active === this.active) this.cancelCapture()
    this.active = undefined
    this.updateShortcut()
  }

  private revokeActive(): void {
    this.cancelCapture()
    this.active = undefined
    this.composer = undefined
    this.updateShortcut()
  }

  private updateShortcut(): void {
    try { this.native?.setEnabled(!this.composer && this.currentActive(this.active, true)) } catch { this.cancelCapture() }
  }

  private clearBlurTimer(): void {
    if (this.blurTimer) clearTimeout(this.blurTimer)
    this.blurTimer = undefined
  }

  private cancelAfterBlur(delay: number): void {
    this.clearBlurTimer()
    this.blurTimer = setTimeout(() => {
      this.blurTimer = undefined
      if (this.capture && !this.capture.active.window.isFocused()) this.cancelCapture()
    }, delay)
    this.blurTimer.unref?.()
  }
}

type ResearchVoiceIpcMain = {
  removeHandler(channel: string): void
  handle(channel: string, handler: (event: any, value: unknown) => unknown): unknown
}

export function registerResearchVoiceHandlers(options: {
  ipcMain: ResearchVoiceIpcMain
  getMainWindow(): TrustedWindow | undefined
  controller: ResearchVoiceController
}): () => void {
  const actions = { 'set-active': 'setActive', start: 'start', 'start-composer': 'startComposer', stop: 'stop', cancel: 'cancel' } as const
  const channels = Object.entries(actions).map(([action, method]) => {
    const channel = `research:voice:${action}`
    options.ipcMain.removeHandler(channel)
    registerTrustedMainWindowHandler(options.ipcMain, channel, options.getMainWindow, (_event, value: unknown) => options.controller[method](value))
    return channel
  })
  return () => { for (const channel of channels) options.ipcMain.removeHandler(channel) }
}
