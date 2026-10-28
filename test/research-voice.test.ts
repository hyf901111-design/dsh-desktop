import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchVoiceController, registerResearchVoiceHandlers } from '../src/main/state/research-voice'
import { createResearchVoiceBridge } from '../src/preload/research-voice'
import type { ResearchVoiceEvent, ResearchVoiceNativeEvent } from '../src/shared/research-voice'

class FakeWindow extends EventEmitter {
  focused = true
  destroyed = false
  delivered: ResearchVoiceEvent[] = []
  private contents = Object.assign(new EventEmitter(), {
    mainFrame: { processId: 1, routingId: 2 },
    isDestroyed: () => this.destroyed,
    send: (_channel: string, event: ResearchVoiceEvent) => this.delivered.push(event)
  })
  get webContents() {
    if (this.destroyed) throw new TypeError('Object has been destroyed')
    return this.contents
  }
  isFocused() { return this.focused }
  isDestroyed() { return this.destroyed }
  blur() { this.focused = false; this.emit('blur') }
  focus() { this.focused = true; this.emit('focus') }
}

const cleanup: Array<() => void> = []
afterEach(() => { cleanup.splice(0).reverse().forEach((fn) => fn()); vi.useRealTimers() })
function setup(platform: NodeJS.Platform = 'darwin') {
  const window = new FakeWindow()
  let mainWindow = window
  let callback!: (event: ResearchVoiceNativeEvent) => void
  let currentRequest = ''
  let loadFailure: Error | undefined
  const calls: Array<[string, ...unknown[]]> = []
  const native = {
    init: (cb: typeof callback) => { callback = cb; calls.push(['init']) },
    setEnabled: (enabled: boolean) => { calls.push(['enabled', enabled]) },
    start: (requestId: string, locale: string) => { currentRequest = requestId; calls.push(['start', requestId, locale]) },
    stop: (requestId: string) => { calls.push(['stop', requestId]) },
    cancel: (requestId: string) => { calls.push(['cancel', requestId]) },
    dispose: () => { calls.push(['dispose']) }
  }
  const controller = new ResearchVoiceController({ getMainWindow: () => mainWindow, platform, loadNative: () => { if (loadFailure) throw loadFailure; return native } })
  controller.attachWindow(window)
  const handlers = new Map<string, (...args: any[]) => any>()
  const disposeHandlers = registerResearchVoiceHandlers({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: (channel) => { handlers.delete(channel) } },
    getMainWindow: () => mainWindow,
    controller
  })
  cleanup.push(() => { disposeHandlers(); controller.dispose() })
  const invoke = (name: string, value: unknown, frame = window.webContents.mainFrame) => handlers.get(`research:voice:${name}`)!({ sender: window.webContents, senderFrame: frame }, value)
  const emit = (event: Record<string, unknown>) => callback({ requestId: currentRequest, ...event } as ResearchVoiceNativeEvent)
  const replaceWindow = () => { mainWindow = new FakeWindow(); controller.attachWindow(mainWindow); return mainWindow }
  return { window, calls, native, controller, handlers, invoke, emit, replaceWindow, failLoad: (error: Error) => { loadFailure = error }, request: () => currentRequest }
}
const active = { sessionId: 'research-a', active: true }
const request = { sessionId: 'research-a', requestId: 'recording-a' }
const composer = { sessionId: 'composer-a', requestId: 'dictation-a' }

describe('temporary composer voice ownership', () => {
  it('starts without research registration and relays terminal text before releasing its temporary owner', () => {
    const f = setup()
    expect(typeof f.handlers.get('research:voice:start-composer')).toBe('function')
    expect(f.invoke('start-composer', composer)).toEqual({ ok: true })
    f.emit({ type: 'partial', text: '输入文字' }); f.emit({ type: 'final', text: '输入文字完成' })
    expect(f.window.delivered.at(-1)).toEqual({ ...composer, type: 'final', text: '输入文字完成' })
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', false])
    expect(f.invoke('start-composer', { ...composer, requestId: 'next' })).toEqual({ ok: true })
  })
  it('temporarily pauses Fn without replacing research ownership and restores the current registration', () => {
    const f = setup(); f.invoke('set-active', active)
    expect(f.invoke('start-composer', composer)).toEqual({ ok: true })
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', false])
    f.emit({ type: 'toggle' })
    expect(f.window.delivered.filter(event => event.type === 'toggle')).toEqual([])
    expect(f.invoke('start', request)).toMatchObject({ ok: false })
    f.invoke('set-active', { sessionId: 'research-b', active: true })
    f.emit({ type: 'final', text: '当前输入' })
    expect(f.window.delivered.at(-1)).toMatchObject({ ...composer, type: 'final' })
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', true])
    f.emit({ type: 'toggle' })
    expect(f.window.delivered.at(-1)).toEqual({ type: 'toggle', sessionId: 'research-b' })
  })
  it('retains composer capture through research cleanup and never revives that expired registration', () => {
    const f = setup(); f.invoke('set-active', active); f.invoke('start-composer', composer)
    f.invoke('set-active', { ...active, active: false })
    expect(f.calls.filter(([name]) => name === 'cancel')).toEqual([])
    f.emit({ type: 'final', text: '保留文字' })
    expect(f.window.delivered.at(-1)).toMatchObject({ ...composer, type: 'final' })
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', false])
  })
  it('refuses stealing a research recording and guards composer requests with main-frame and foreground trust', () => {
    const f = setup(); f.invoke('set-active', active); f.invoke('start', request)
    expect(f.invoke('start-composer', composer)).toMatchObject({ ok: false })
    expect(f.calls.filter(([name]) => name === 'cancel')).toEqual([])
    f.invoke('cancel', request)
    expect(() => f.invoke('start-composer', composer, { processId: 1, routingId: 3 })).toThrow()
    for (const invalid of [null, { ...composer, sessionId: '' }, { ...composer, active: true }]) expect(f.invoke('start-composer', invalid)).toMatchObject({ ok: false })
    f.window.blur(); expect(f.invoke('start-composer', composer)).toMatchObject({ ok: false })
    f.window.focus(); expect(f.invoke('start-composer', composer)).toEqual({ ok: true })
    f.window.webContents.emit('did-start-navigation', {}, 'https://new.test', false, true)
    f.emit({ type: 'final', text: '迟到导航结果' })
    expect(f.window.delivered.filter(event => event.type === 'final')).toEqual([])
  })
  it.each(['cancel', 'error', 'blur'] as const)('releases composer ownership on %s and discards late native replies', reason => {
    const f = setup(); f.invoke('set-active', active); f.invoke('start-composer', composer)
    const oldId = f.request(); f.emit({ type: 'state', state: 'listening' })
    if (reason === 'cancel') { f.native.cancel = () => f.emit({ type: 'final', text: '同步取消回调' }); f.invoke('cancel', composer) }
    if (reason === 'error') f.emit({ type: 'error', code: 'permission-denied', message: '请允许麦克风' })
    if (reason === 'blur') f.window.blur()
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', reason !== 'blur'])
    f.window.focus(); expect(f.invoke('start', request)).toEqual({ ok: true })
    f.emit({ type: 'final', requestId: oldId, text: '过期输入' }); f.emit({ type: 'final', text: '研究结果' })
    expect(f.window.delivered.filter(event => event.type === 'final')).toEqual([{ ...request, type: 'final', text: '研究结果' }])
  })
})

describe('research voice permission and ownership boundaries', () => {
  it('arms Fn without starting recording, and accepts recording only in the focused research session', () => {
    const f = setup()
    expect(f.invoke('start', request)).toMatchObject({ ok: false })
    expect(f.invoke('set-active', active)).toEqual({ ok: true })
    expect(f.calls.filter(([name]) => name === 'start')).toHaveLength(0)
    f.emit({ type: 'toggle' })
    expect(f.window.delivered).toEqual([{ type: 'toggle', sessionId: 'research-a' }])
    expect(f.invoke('start', { ...request, sessionId: 'another' })).toMatchObject({ ok: false })
    expect(f.invoke('start', request)).toEqual({ ok: true })
    expect(f.calls.filter(([name]) => name === 'start')).toHaveLength(1)
    f.window.blur()
    expect(f.invoke('start', { ...request, requestId: 'another' })).toMatchObject({ ok: false })
    f.emit({ type: 'toggle' })
    expect(f.window.delivered.filter((event) => event.type === 'toggle')).toHaveLength(1)
  })

  it('captures Electron main-frame identity from prototype getters so a real window can start voice recognition', () => {
    const f = setup()
    f.window.webContents.mainFrame = Object.create({
      get processId() { return 41 },
      get routingId() { return 57 }
    })
    expect(f.invoke('set-active', active)).toEqual({ ok: true })
    expect(f.invoke('start', request)).toEqual({ ok: true })
    f.emit({ type: 'final', text: '来自真实窗口的语音指令' })
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'final', text: '来自真实窗口的语音指令' })
  })

  it('distinguishes native load and initialization failures without including local paths or stacks', () => {
    const load = setup()
    load.failLoad(Object.assign(new Error("Cannot find module '/private/native/research-voice.node'\nRequire stack:\n- /private/app/index.js"), { code: 'MODULE_NOT_FOUND' }))
    const loadResult = load.invoke('set-active', active)
    expect(loadResult).toMatchObject({ ok: false })
    expect(loadResult.error).toContain('加载')
    expect(loadResult.error).toContain('MODULE_NOT_FOUND')
    expect(loadResult.error).not.toMatch(/\/private|Require stack/)
    // Starting after a failed registration must preserve the actual diagnostic.
    expect(load.invoke('start', request).error).toBe(loadResult.error)
    const init = setup()
    init.native.init = () => { throw new Error('event monitor unavailable') }
    const initResult = init.invoke('set-active', active)
    expect(initResult).toMatchObject({ ok: false })
    expect(initResult.error).toContain('初始化')
    expect(initResult.error).toContain('event monitor unavailable')
  })

  it('registers a research view mounted before focus and arms Fn only when that window is foreground', () => {
    const f = setup()
    f.window.blur()
    expect(f.invoke('set-active', active)).toEqual({ ok: true })
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', false])
    expect(f.invoke('start', request)).toMatchObject({ ok: false })
    f.window.focus()
    f.emit({ type: 'toggle' })
    expect(f.window.delivered.at(-1)).toEqual({ type: 'toggle', sessionId: 'research-a' })
    expect(f.invoke('start', request)).toEqual({ ok: true })
  })

  it('preserves a recording across repeated active declarations and ignores stale inactive cleanup', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.invoke('set-active', active)
    f.invoke('set-active', { sessionId: 'old-session', active: false })
    f.emit({ type: 'final', text: '继续当前研究' })
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(0)
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'final', text: '继续当前研究' })
  })

  it('revokes the old window on replacement and delivers only newly authorized captures to the new window', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    const oldNativeId = f.request()
    const replacement = f.replaceWindow()
    expect(f.calls).toContainEqual(['cancel', oldNativeId])
    f.emit({ type: 'final', text: '旧窗口指令' })
    f.emit({ type: 'toggle' })
    expect(replacement.delivered).toHaveLength(0)
    expect(() => f.invoke('start', request)).toThrow()
    const event = { sender: replacement.webContents, senderFrame: replacement.webContents.mainFrame }
    expect(f.handlers.get('research:voice:set-active')!(event, active)).toEqual({ ok: true })
    expect(f.handlers.get('research:voice:start')!(event, request)).toEqual({ ok: true })
    f.emit({ type: 'final', requestId: oldNativeId, text: '迟到指令' })
    f.emit({ type: 'final', text: '新窗口指令' })
    expect(replacement.delivered.filter((e) => e.type === 'final')).toEqual([{ ...request, type: 'final', text: '新窗口指令' }])
    expect(f.window.delivered.filter((e) => e.type === 'final')).toHaveLength(0)
  })

  it.each(['dispose', 'replace'] as const)('safely handles %s after Electron destroys the attached window', (action) => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    const contents = f.window.webContents
    const nativeId = f.request()
    f.window.destroyed = true
    f.window.emit('closed')
    expect(() => {
      if (action === 'replace') f.replaceWindow()
      f.controller.dispose()
      f.controller.dispose()
    }).not.toThrow()
    expect(f.calls.filter(([name]) => name === 'cancel')).toEqual([['cancel', nativeId]])
    expect(f.calls.filter(([name]) => name === 'dispose')).toHaveLength(1)
    expect(contents.listenerCount('did-start-navigation')).toBe(0)
    expect(contents.listenerCount('render-process-gone')).toBe(0)
  })

  it('rejects iframe IPC and malformed payloads before native permission or recording', () => {
    const f = setup()
    expect(() => f.invoke('set-active', active, { processId: 1, routingId: 3 })).toThrow()
    for (const invalid of [null, { ...active, active: 'true' }, { ...active, sessionId: '' }, { ...active, path: '/private' }]) {
      expect(f.invoke('set-active', invalid)).toMatchObject({ ok: false })
    }
    f.invoke('set-active', active)
    for (const invalid of [null, { ...request, requestId: '' }, { ...request, locale: 'hostile' }]) {
      expect(f.invoke('start', invalid)).toMatchObject({ ok: false })
    }
    expect(f.calls.filter(([name]) => name === 'start')).toHaveLength(0)
  })

  it('delivers a final result once and ignores stale completion after the next recording starts', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    const oldNativeId = f.request()
    f.emit({ type: 'state', state: 'listening' })
    f.emit({ type: 'level', level: 0.4 })
    f.emit({ type: 'partial', text: '做一个图表' })
    f.emit({ type: 'final', text: '做一个图表' })
    f.emit({ type: 'final', text: '重复结果' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toEqual([{ type: 'final', sessionId: 'research-a', requestId: 'recording-a', text: '做一个图表' }])
    expect(f.invoke('start', { ...request, requestId: 'recording-b' })).toEqual({ ok: true })
    f.emit({ type: 'final', requestId: oldNativeId, text: '过期结果' })
    f.emit({ type: 'final', text: '新结果' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(2)
    expect(f.window.delivered.at(-1)).toMatchObject({ requestId: 'recording-b', text: '新结果' })
  })

  it('cancels a pending permission request before switching session and discards its callback', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    const oldNativeId = f.request()
    expect(f.invoke('set-active', { sessionId: 'research-b', active: true })).toEqual({ ok: true })
    expect(f.calls).toContainEqual(['cancel', oldNativeId])
    f.emit({ type: 'state', state: 'listening' })
    f.emit({ type: 'final', text: '旧研究的指令' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
    f.emit({ type: 'toggle' })
    expect(f.window.delivered.at(-1)).toEqual({ type: 'toggle', sessionId: 'research-b' })
  })

  it('allows the permission sheet focus transition but cancels once an active recording loses focus', () => {
    vi.useFakeTimers()
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.window.blur()
    vi.advanceTimersByTime(500)
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(0)
    f.emit({ type: 'state', state: 'listening' })
    f.window.focus()
    vi.advanceTimersByTime(2_000)
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(0)
    f.window.blur()
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(1)
    f.emit({ type: 'final', text: '不得误执行' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
  })

  it.each(['inactive', 'navigate', 'destroy', 'crash'])('revokes capture and the Fn shortcut when the owner is %s', (reason) => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.emit({ type: 'state', state: 'listening' })
    if (reason === 'inactive') f.invoke('set-active', { ...active, active: false })
    if (reason === 'navigate') f.window.webContents.emit('did-start-navigation', {}, 'https://new.test', false, true)
    if (reason === 'destroy') { f.window.destroyed = true; f.window.emit('closed') }
    if (reason === 'crash') f.window.webContents.emit('render-process-gone', {}, {})
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(1)
    expect(f.calls.filter(([name]) => name === 'enabled').at(-1)).toEqual(['enabled', false])
    f.emit({ type: 'final', text: '不得执行' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
  })

  it('keeps recording for iframe navigation and refuses another request stopping it', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.emit({ type: 'state', state: 'listening' })
    f.window.webContents.emit('did-start-navigation', {}, 'https://iframe.test', false, false)
    expect(f.invoke('stop', { ...request, requestId: 'other' })).toMatchObject({ ok: false })
    expect(f.calls.filter(([name]) => name === 'cancel' || name === 'stop')).toHaveLength(0)
    expect(f.invoke('stop', request)).toEqual({ ok: true })
    f.emit({ type: 'final', text: '正确完成' })
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'final', text: '正确完成' })
  })

  it('ignores final results after user cancellation even when native synchronously returns one', () => {
    const f = setup()
    f.native.cancel = () => f.emit({ type: 'final', text: '取消时的竞态结果' })
    f.invoke('set-active', active)
    f.invoke('start', request)
    expect(f.invoke('cancel', request)).toEqual({ ok: true })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'cancelled', sessionId: 'research-a', requestId: 'recording-a' })
  })

  it('lets the user retry after permission denial and never creates a component from empty recognition', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.emit({ type: 'error', code: 'microphone-denied', message: '请允许麦克风访问。' })
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'error', code: 'microphone-denied' })
    expect(f.invoke('start', { ...request, requestId: 'retry' })).toEqual({ ok: true })
    f.emit({ type: 'final', text: '   ' })
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'error', code: 'empty-input' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
    expect(f.invoke('start', { ...request, requestId: 'retry-again' })).toEqual({ ok: true })
  })

  it('expires permission-sheet focus grace if the app remains in the background', () => {
    vi.useFakeTimers()
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.window.blur()
    vi.advanceTimersByTime(60_001)
    expect(f.calls.filter(([name]) => name === 'cancel')).toHaveLength(1)
    f.window.focus()
    f.emit({ type: 'final', text: '迟到的权限回调' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
  })

  it('sanitizes visual audio levels and refuses a final result while the owner is backgrounded', () => {
    const f = setup()
    f.invoke('set-active', active)
    f.invoke('start', request)
    f.emit({ type: 'level', level: Number.NaN })
    f.emit({ type: 'level', level: 3 })
    f.emit({ type: 'level', level: -2 })
    expect(f.window.delivered.filter((event) => event.type === 'level').map((event) => event.level)).toEqual([1, 0])
    f.window.focused = false
    f.emit({ type: 'final', text: '后台指令' })
    expect(f.window.delivered.at(-1)).toMatchObject({ type: 'cancelled' })
    expect(f.window.delivered.filter((event) => event.type === 'final')).toHaveLength(0)
  })

  it('handles missing native code without exposing its internal path and safely disposes twice', () => {
    const f = setup()
    f.native.init = () => { throw new Error('/private/native/location/research-voice.node unavailable') }
    const response = f.invoke('set-active', active)
    expect(response).toMatchObject({ ok: false, error: expect.any(String) })
    expect(response.error).not.toContain('/private')
    f.controller.dispose()
    f.controller.dispose()
    expect(f.invoke('start', request)).toMatchObject({ ok: false })
  })

  it('returns an actionable unavailable result on other platforms without loading native code', () => {
    const f = setup('win32')
    expect(f.invoke('set-active', active)).toMatchObject({ ok: false, error: expect.any(String) })
    expect(f.invoke('start', request)).toMatchObject({ ok: false, error: expect.any(String) })
    expect(f.calls).toHaveLength(0)
  })

  it('unsubscribes renderer event listeners and never exposes the Electron event argument', () => {
    const events = new EventEmitter()
    const received: unknown[] = []
    const bridge = createResearchVoiceBridge({ invoke: async () => ({ ok: true }), on: events.on.bind(events), removeListener: events.removeListener.bind(events) })
    const unsubscribe = bridge.subscribe((event) => received.push(event))
    events.emit('research:voice:event', { sender: 'private electron object' }, { type: 'toggle', sessionId: 'a' })
    expect(received).toEqual([{ type: 'toggle', sessionId: 'a' }])
    unsubscribe()
    events.emit('research:voice:event', {}, { type: 'toggle', sessionId: 'b' })
    expect(received).toHaveLength(1)
  })
})
