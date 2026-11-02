import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ windows: [] as any[], calls: [] as string[], args: [] as any[], crops: [] as any[] }))
const capture = vi.hoisted(() => ({
  start: vi.fn(async (_pid: number, windowId: number, _freshAfterMs?: number) => ({ data: Buffer.from('image'), width: 896, height: 1567,
    windowBounds: windowId === 11 ? { x: 3900, y: 220, width: 260, height: 300 } : { x: 3440, y: -160, width: 1080, height: 1889 } })),
  stop: vi.fn(async () => {}),
  state: vi.fn(() => ({ active: true, stoppedBySystem: false }))
}))
vi.mock('../src/main/computer/capture-stream', () => ({ createWindowCapture: () => capture }))

vi.mock('electron', () => {
  class FakeWindow {
    options: any
    setIgnoreMouseEvents = vi.fn()
    setPosition = vi.fn()
    showInactive = vi.fn()
    hide = vi.fn()
    setAlwaysOnTop = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setContentProtection = vi.fn()
    destroy = vi.fn()
    loadURL = vi.fn(async () => {})
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), once: vi.fn(), executeJavaScript: vi.fn(async () => {}) }
    constructor(options: any) { this.options = options; fixture.windows.push(this) }
    isDestroyed() { return false }
  }
  const image = { isEmpty: () => false, getSize: () => ({ width: 896, height: 1567 }), toJPEG: () => Buffer.from('image'),
    crop: (rect: any) => { fixture.crops.push(rect); return { toBitmap: () => ({ equals: () => true }) } } }
  return {
    app: { isPackaged: false, getAppPath: () => '/tmp' }, BrowserWindow: FakeWindow,
    nativeImage: { createFromBuffer: () => image },
    powerMonitor: { on: vi.fn(), removeListener: vi.fn(), getSystemIdleState: () => 'active' },
    globalShortcut: { isRegistered: () => false, register: vi.fn(), unregister: vi.fn() },
    screen: { getDisplayNearestPoint: () => ({ bounds: { x: 3440, y: -160, width: 1080, height: 1889 } }), getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 3440, height: 1440 } }) },
    dialog: {}, shell: {}, systemPreferences: {}
  }
})

vi.mock('@trycua/cua-driver', () => ({
  currentMacOsPermissionStatus: () => ({ accessibility: true, screenRecording: true }),
  EmbeddedPermissionMode: { Standard: 'standard' },
  EmbeddedCuaDriverHost: { withOptions: () => ({ start: async () => ({ socketPath: '/tmp/fake-cua', generation: 1 }), stop: async () => {}, waitForExit: () => new Promise(() => {}) }) },
  CuaDriver: { connect: () => ({ callTool: async (name: string, raw: string) => {
    fixture.calls.push(name)
    fixture.args.push(JSON.parse(raw))
    const observed = name === 'get_window_state'
    const popup = observed && JSON.parse(raw).window_id === 11
    return { isError: false, text: '', structuredJson: JSON.stringify(observed ? {
      screenshot_width: popup ? 260 : 1080, screenshot_height: popup ? 300 : 1889,
      screenshot_frame_valid: true, screenshot_scale: 1,
      window_bounds: popup ? { x: 3900, y: 220, width: 260, height: 300 } : { x: 3440, y: -160, width: 1080, height: 1889 },
      elements: [{ element_token: 'field', role: 'AXTextField', frame: { x: 4480, y: 1600, w: 30, h: 20 } }]
    } : name === 'bring_to_front' ? { activated: true } : {}),
    images: observed ? [{ mimeType: 'image/png', dataBase64: 'AA==' }] : [] }
  } }) }
}))

afterEach(() => { fixture.windows.length = 0; fixture.calls.length = 0; fixture.args.length = 0; fixture.crops.length = 0; vi.restoreAllMocks(); capture.start.mockClear(); capture.stop.mockClear(); capture.state.mockReset().mockReturnValue({ active: true, stoppedBySystem: false }) })

it('uses the native stream for window frames and keeps the assistant cursor click through', async () => {
  const { createDesktopComputer } = await import('../src/main/computer/desktop-computer')
  const computer = createDesktopComputer(() => null)
  try {
    const view: any = await computer.run({ op: 'observe', pid: 9, window_id: 10, sessionId: 'test' }, new AbortController().signal)
    expect(view.focus).toEqual({ requested: false, verified: false, appActive: null, policy: 'background-only' })
    expect(fixture.calls).not.toContain('bring_to_front')
    expect(fixture.windows).toHaveLength(2)
    for (const window of fixture.windows) {
      expect(window.options.focusable).toBe(false)
      expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    }
    expect(capture.start).toHaveBeenCalledWith(9, 10, undefined)
    expect(fixture.args[fixture.calls.indexOf('get_window_state')].include_screenshot).toBeUndefined()
    expect(fixture.args[fixture.calls.indexOf('get_window_state')].max_dimension).toBe(64)
    expect(view.data.driver_screenshot_scale).toBe(1)
    expect(view.data.screenshot_width).toBe(896)
    const next: any = await computer.run({ op: 'type', revision: view.revision, pid: 9, window_id: 10, element_token: 'field', text: 'test', sessionId: 'test' }, new AbortController().signal)
    expect(next.revision).not.toBe(view.revision)
    expect(capture.start.mock.lastCall?.[2]).toBeGreaterThan(0)
    const pointer = fixture.windows[0], label = fixture.windows[1]
    expect(pointer.options.width).toBe(22)
    expect(label.options.width).toBe(94)
    const pointerHtml = decodeURIComponent(pointer.loadURL.mock.calls[0][0])
    expect(pointerHtml).toContain('agent-sway 1800ms ease-in-out infinite')
    expect(pointerHtml).toContain('prefers-reduced-motion:reduce')
    expect(label.setPosition.mock.lastCall[0]).toBeLessThan(pointer.setPosition.mock.lastCall[0])
    expect(capture.stop).not.toHaveBeenCalled()
  } finally { await computer.dispose() }
  expect(capture.stop).toHaveBeenCalled()
})

it('revokes desktop input after the system stops sharing', async () => {
  const { createDesktopComputer } = await import('../src/main/computer/desktop-computer')
  const computer = createDesktopComputer(() => null)
  try {
    const view: any = await computer.run({ op: 'observe', pid: 9, window_id: 10, sessionId: 'test' }, new AbortController().signal)
    capture.state.mockReturnValue({ active: false, stoppedBySystem: true })
    await expect(computer.run({ op: 'click', revision: view.revision, x: 100, y: 100, sessionId: 'test' }, new AbortController().signal)).rejects.toThrow('系统已停止共享')
    expect(capture.stop).toHaveBeenCalled()
  } finally { await computer.dispose() }
})

it('revalidates an aged focused-key action around its addressed field', async () => {
  const { createDesktopComputer } = await import('../src/main/computer/desktop-computer')
  const computer = createDesktopComputer(() => null)
  try {
    const view: any = await computer.run({ op: 'observe', pid: 9, window_id: 10, sessionId: 'test' }, new AbortController().signal)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000)
    await computer.run({ op: 'key', key: 'return', x: 700, y: 1450, revision: view.revision, sessionId: 'test' }, new AbortController().signal)
    expect(fixture.crops).toHaveLength(2)
    expect(fixture.crops[0].width).toBeLessThan(896)
    expect(fixture.crops[0].height).toBeLessThan(1567)
  } finally { await computer.dispose() }
})

it('travels through intermediate overlay positions before delivering the next action', async () => {
  const { createDesktopComputer } = await import('../src/main/computer/desktop-computer')
  const computer = createDesktopComputer(() => null)
  try {
    const view: any = await computer.run({ op: 'observe', pid: 9, window_id: 10, sessionId: 'test' }, new AbortController().signal)
    const first: any = await computer.run({ op: 'type', revision: view.revision, pid: 9, window_id: 10,
      element_token: 'field', text: 'first', sessionId: 'test' }, new AbortController().signal)
    const pointer = fixture.windows[0]
    const before = pointer.setPosition.mock.calls.length
    await computer.run({ op: 'key', revision: first.revision, pid: 9, window_id: 10,
      x: 100, y: 100, key: 'Escape', sessionId: 'test' }, new AbortController().signal)
    const travel = pointer.setPosition.mock.calls.slice(before)
    expect(travel.length).toBeGreaterThan(4)
    expect(new Set(travel.map(([x, y]: number[]) => `${x},${y}`)).size).toBeGreaterThan(4)
  } finally { await computer.dispose() }
})

it('updates the shared stream to the popup window without a synthetic status window', async () => {
  const { createDesktopComputer } = await import('../src/main/computer/desktop-computer')
  const computer = createDesktopComputer(() => null)
  try {
    await computer.run({ op: 'observe', pid: 9, window_id: 10, sessionId: 'test' }, new AbortController().signal)
    await computer.run({ op: 'observe', pid: 9, window_id: 11, sessionId: 'test' }, new AbortController().signal)
    expect(capture.start).toHaveBeenLastCalledWith(9, 11, undefined)
    expect(fixture.windows).toHaveLength(2)
  } finally { await computer.dispose() }
})
