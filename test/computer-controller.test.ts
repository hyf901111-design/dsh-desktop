import { afterEach, expect, it, vi } from 'vitest'
import { ComputerController, sameObservedElements } from '../src/main/computer/controller'

const controllers: ComputerController[] = []
afterEach(async () => { for (const c of controllers.splice(0)) await c.stop(); vi.useRealTimers() })
function setup(options: Partial<ConstructorParameters<typeof ComputerController>[0]> = {}) {
  const callTool = vi.fn(async (name: string, raw: string, _options?: { signal: AbortSignal }) => ({
    isError: false, text: '', structuredJson: JSON.stringify(['get_window_state', 'get_desktop_state'].includes(name) ? { screenshot_width: 800, screenshot_height: 600, window_bounds: { x: 20, y: 30, width: 400, height: 300 }, elements: [{ element_token: 'verified-token', frame: { x: 20, y: 30, w: 10, h: 10 } }] }
      : name === 'list_windows' ? { windows: [{ pid: 9, window_id: 10, z_index: 1, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } }] }
      : name === 'list_apps' ? { apps: [{ name: 'Target', bundle_id: 'com.example.target', pid: 9, running: true, active: true }] }
      : { name, ...JSON.parse(raw) }),
    images: ['get_window_state', 'get_desktop_state'].includes(name) ? [{ mimeType: 'image/png', dataBase64: 'AA==' }] : []
  }))
  const stroke = vi.fn(options.stroke ?? (async () => {}))
  const c = new ComputerController({ driver: async () => ({ callTool }), pointer: vi.fn(), visibility: vi.fn(), screenPoint: (_t, _d, x, y) => ({ x, y }), ...options, stroke })
  controllers.push(c)
  const run = (input: object, signal = new AbortController().signal) => c.run({ sessionId: 'a', ...input }, signal) as Promise<any>
  return { c, run, callTool, stroke }
}
it('refuses unobserved and stale actions; post-action observation replaces the revision', async () => {
  const { run, callTool, stroke } = setup()
  await expect(run({ op: 'click', x: 10, y: 10 })).rejects.toThrow('观察已过期')
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const next = await run({ op: 'click', revision: o.revision, x: 100, y: 200 })
  expect(next.revision).not.toBe(o.revision)
  await expect(run({ op: 'click', revision: o.revision, x: 100, y: 200 })).rejects.toThrow('观察已过期')
  expect(stroke).toHaveBeenCalledOnce()
  expect(callTool.mock.calls.some(([n]) => n === 'click')).toBe(false)
})
it('never forwards model-selected session, scripts, launch arguments, or output paths', async () => {
  const { run, callTool } = setup()
  await run({ op: 'open', bundle_id: 'com.example.app', additional_arguments: ['--danger'], urls: ['/private'], session: 'other' })
  expect(callTool.mock.calls.some(([n]) => n === 'launch_app')).toBe(false)
  await expect(run({ op: 'shell', command: 'anything' })).rejects.toThrow('不支持')
})
it('lists running applications by default and finds installed applications by name', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps' ? {
    isError: false, text: '', images: [], structuredJson: JSON.stringify({ apps: [
      { name: '易飞书', bundle_id: 'com.example.lark', pid: 9, running: true, active: true, launch_path: '/Applications/Lark.app' },
      { name: '画板', bundle_id: 'com.example.board', pid: 10, running: true, active: false },
      { name: 'Photoshop 2025', bundle_id: 'com.adobe.Photoshop', running: false, last_used: 'yesterday' }
    ] }) } : original(name, raw, options))
  const running = await run({ op: 'apps' })
  expect(running.data.apps).toEqual([
    { name: '易飞书', bundle_id: 'com.example.lark', pid: 9, launch_path: '/Applications/Lark.app', running: true, active: true },
    { name: '画板', bundle_id: 'com.example.board', pid: 10, running: true, active: false }
  ])
  expect(running.data.installedAppCount).toBe(3)
  const searched = await run({ op: 'apps', name: 'photo' })
  expect(searched.data.apps).toEqual([{ name: 'Photoshop 2025', bundle_id: 'com.adobe.Photoshop', running: false, active: false }])
})
it('launches only a fresh exact installed identity, ignores arbitrary options, and reads back its PID', async () => {
  const launchApplication = vi.fn(async (_application: Record<string, any>) => ({ performed: true, dispatched: true, code: 'application_started', delivery_mode: 'background' as const, pid: 9 }))
  const { run, callTool } = setup({ launchApplication })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps' ? { isError: false, text: '', images: [],
    structuredJson: JSON.stringify({ apps: [{ name: 'Target', bundle_id: 'com.example.target', launch_path: '/Applications/Target.app', running: false }] }) }
    : original(name, raw, options))
  const result = await run({ op: 'open', name: 'Target', launch_path: '/Applications/Target.app', activates: true, additional_arguments: ['--unsafe'], urls: ['/private'] })
  expect(launchApplication).toHaveBeenCalledWith({ bundle_id: 'com.example.target', launch_path: '/Applications/Target.app' }, expect.any(AbortSignal))
  expect(result.action.performed).toBe(true)
  expect(result.next).toEqual([{ op: 'observe', pid: 9, window_id: 10 }])
  expect(callTool.mock.calls.some(([name]) => ['launch_app', 'bring_to_front'].includes(name))).toBe(false)
  await run({ op: 'open', bundle_id: 'com.example.target', launch_path: '/private/Injected.app' })
  expect(launchApplication).toHaveBeenCalledOnce()
})
it('never chooses among same-bundle copies and permits explicit discovered PID or app path', async () => {
  const launchApplication = vi.fn(async (_application: Record<string, any>) => ({ performed: true, dispatched: true, code: 'application_started', delivery_mode: 'background' as const, pid: 9 }))
  const { run, callTool } = setup({ launchApplication })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps' ? { isError: false, text: '', images: [], structuredJson: JSON.stringify({ apps: [
    { name: 'EWork', bundle_id: 'com.evanarts.sherlock', launch_path: '/Applications/EWork.app', pid: 9, running: true },
    { name: 'EWork', bundle_id: 'com.evanarts.sherlock', launch_path: '/Applications/EWork 116.app', running: false }
  ] }) } : original(name, raw, options))
  expect((await run({ op: 'open', bundle_id: 'com.evanarts.sherlock' })).action.code).toBe('application_ambiguous')
  expect(launchApplication).not.toHaveBeenCalled()
  expect((await run({ op: 'open', name: 'EWork', pid: 9 })).action.code).toBe('application_already_running')
  await run({ op: 'open', bundle_id: 'com.evanarts.sherlock', launch_path: '/Applications/EWork 116.app' })
  expect(launchApplication).toHaveBeenCalledOnce()
  expect(launchApplication.mock.calls[0]![0].launch_path).toBe('/Applications/EWork 116.app')
})
it('returns uncertain launch without retry or window readback after dispatch cancellation', async () => {
  const launchApplication = vi.fn(async (_application: Record<string, any>) => ({ performed: null, dispatched: true, code: 'launch_cancelled_after_dispatch', effect: 'unknown', delivery_mode: 'background' as const }))
  const { run, callTool } = setup({ launchApplication })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps' ? { isError: false, text: '', images: [],
    structuredJson: JSON.stringify({ apps: [{ name: 'Target', bundle_id: 'com.example.target', running: false }] }) } : original(name, raw, options))
  const result = await run({ op: 'open', name: 'Target' })
  expect(result.action.performed).toBeNull()
  expect(callTool.mock.calls.some(([name]) => name === 'list_windows')).toBe(false)
  expect(launchApplication).toHaveBeenCalledOnce()
})
it('discovers an unregistered owned app read-only before allowing its exact identity to launch', async () => {
  const application = { name: 'Owned QA', bundle_id: 'org.example.qa', launch_path: '/tmp/OwnedQA.app', running: false, active: false }
  const inspectApplication = vi.fn(async () => ({ code: 'application_identity_verified', apps: [application] }))
  const launchApplication = vi.fn(async () => ({ performed: true, dispatched: true, code: 'application_started', delivery_mode: 'background' as const, pid: 9 }))
  const { run } = setup({ inspectApplication, launchApplication })
  const target = { bundle_id: application.bundle_id, launch_path: application.launch_path }
  expect((await run({ op: 'open', ...target })).action.code).toBe('application_not_found')
  expect(launchApplication).not.toHaveBeenCalled()
  const discovered = await run({ op: 'apps', ...target })
  expect(discovered.data.apps).toEqual([application])
  expect(launchApplication).not.toHaveBeenCalled()
  await run({ op: 'open', ...target })
  expect(inspectApplication).toHaveBeenCalledTimes(2)
  expect(launchApplication).toHaveBeenCalledWith(target, expect.any(AbortSignal))
  await run({ op: 'release' })
  expect((await run({ op: 'open', ...target })).action.code).toBe('application_not_found')
  expect(launchApplication).toHaveBeenCalledOnce()
})
it('does not launch if a discovered owned app identity changes before open', async () => {
  const application = { name: 'Owned QA', bundle_id: 'org.example.qa', launch_path: '/tmp/OwnedQA.app', running: false, active: false }
  const inspectApplication = vi.fn().mockResolvedValueOnce({ code: 'application_identity_verified', apps: [application] })
    .mockResolvedValueOnce({ code: 'application_identity_mismatch', apps: [] })
  const launchApplication = vi.fn()
  const { run } = setup({ inspectApplication, launchApplication })
  await run({ op: 'apps', bundle_id: application.bundle_id, launch_path: application.launch_path })
  const result = await run({ op: 'open', bundle_id: application.bundle_id, launch_path: application.launch_path })
  expect(result.action.code).toBe('application_not_found')
  expect(launchApplication).not.toHaveBeenCalled()
})
it('halts the desktop lease when a background launch reports unexpected foreground activation', async () => {
  const launchApplication = vi.fn(async () => ({ performed: null, dispatched: true, code: 'launch_focus_changed', terminal: true, delivery_mode: 'background' as const }))
  const { run, callTool } = setup({ launchApplication })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps' ? { isError: false, text: '', images: [],
    structuredJson: JSON.stringify({ apps: [{ name: 'Target', bundle_id: 'com.example.target', running: false }] }) } : original(name, raw, options))
  expect((await run({ op: 'open', name: 'Target' })).action.terminal).toBe(true)
  await expect(run({ op: 'observe', pid: 9, window_id: 10 })).rejects.toThrow('本轮桌面控制已停止')
  expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front')).toBe(false)
})
it.each(['type', 'key', 'hotkey'])('refuses web %s tokens even without usable field geometry', async op => {
  for (const frame of [undefined, { x: 100, y: 60, w: 0, h: 40 }, { x: 9999, y: 9999, w: 40, h: 40 }]) {
    const pointer = vi.fn()
    const { run, callTool } = setup({ pointer, prepareObservation: result => ({ ...result,
      data: { ...result.data, elements: [{ element_token: 'web', role: 'AXTextArea', in_web_content: true, frame }] } }) })
    const observed = await run({ op: 'observe', pid: 9, window_id: 10 })
    const result = await run({ op, element_token: 'web', revision: observed.revision, text: 'content', key: 'return', keys: ['cmd', 'a'] })
    expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable', unsupported_reason: 'web_text_field' })
    expect(callTool.mock.calls.some(([name]) => ['type_text', 'press_key', 'hotkey', 'bring_to_front'].includes(name))).toBe(false)
    expect(pointer.mock.calls.some(([position]) => position !== undefined)).toBe(false)
  }
})
it.each([{ x: 800, y: 1 }, { x: -1, y: 1 }, { x: NaN, y: 1 }, { x: 1, y: 1, pid: 12 }, { element_token: 'guessed' }])('rejects out of frame and mismatched targets %j', async bad => {
  const { run, callTool } = setup()
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await expect(run({ op: 'click', revision: o.revision, ...bad })).rejects.toThrow()
  expect(callTool.mock.calls.some(([n]) => n === 'click')).toBe(false)
})
it('holds a global lease until finish and allows another session afterward', async () => {
  const { run, c } = setup()
  await run({ op: 'apps' })
  await expect(run({ op: 'apps', sessionId: 'b' })).rejects.toThrow('其他桌面操作')
  await run({ op: 'finish' })
  await expect(run({ op: 'apps' })).rejects.toThrow('本轮桌面控制已停止')
  await c.run({ op: 'apps', sessionId: 'b' }, new AbortController().signal)
})
it('routes drag through the cancellable background gesture worker in displayed pixels', async () => {
  const stroke = vi.fn(async () => {})
  const { run, callTool } = setup({ stroke, prepareObservation: r => ({ ...r, data: { ...r.data, original_screenshot_width: 1600, original_screenshot_height: 1200 } }) })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ op: 'drag', revision: o.revision, x: 100, y: 100, to_x: 300, to_y: 200, modifiers: ['shift'] })
  expect(stroke).toHaveBeenCalledWith(o.target, expect.anything(), [[{ x: 100, y: 100 }, { x: 300, y: 200 }]], 700, expect.any(AbortSignal), ['shift'], undefined)
  expect(callTool.mock.calls.some(([n]) => n === 'drag')).toBe(false)
  expect(callTool.mock.calls.filter(([n]) => n === 'bring_to_front')).toHaveLength(0)
})
it.each([true, false])('refreshes delayed model observations and only inputs on unchanged targets (%s)', async unchanged => {
  const compare = vi.fn(() => unchanged)
  const { run, stroke } = setup({ unchanged: compare })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 180000)
  const result = await run({ op: 'click', revision: o.revision, x: 100, y: 100 })
  expect(compare).toHaveBeenCalledOnce()
  expect(stroke).toHaveBeenCalledTimes(unchanged ? 1 : 0)
  if (!unchanged) expect(result.action.performed).toBe(false)
  now.mockRestore()
})
it.each([false, true])('rebinds an aged web text field despite unrelated pixels changing (%s)', async changedField => {
  let snapshot = 0
  const { run, callTool } = setup({ unchanged: () => false, prepareObservation: r => ({ ...r, data: { ...r.data,
    background_input: { exact_window: { status: 'matched', pid: 9, window_id: 10 },
      routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }] },
    elements: [{ element_token: `s${++snapshot}:0`, role: 'AXTextArea', in_web_content: true,
      value: changedField && snapshot > 1 ? 'someone typed' : '', enabled: true,
      frame: { x: 100, y: 60, w: 160, h: 40 } }] } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 110000)
  const result = await run({ op: 'type', revision: view.revision, x: 300, y: 100, text: '何亚枫' })
  const attempts = callTool.mock.calls.filter(([name]) => name === 'type_text')
  expect(attempts).toHaveLength(0)
  expect(result.action.performed).toBe(false)
  if (!changedField) expect(result.action.code).toBe('background_input_unavailable')
})
it('revalidates an aged accessible button locally before clicking', async () => {
  let snapshot = 0
  const { run, stroke } = setup({ unchanged: () => false, prepareObservation: r => ({ ...r, data: { ...r.data,
    elements: [{ element_token: `s${++snapshot}:0`, role: 'AXButton', actions: ['AXPress'],
      label: '搜索', enabled: true, frame: { x: 100, y: 60, w: 60, h: 60 } }] } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 110000)
  await run({ op: 'click', revision: view.revision, x: 220, y: 120 })
  expect(stroke).toHaveBeenCalledOnce()
})
it('batches continuous strokes and returns one post-gesture observation', async () => {
  const stroke = vi.fn(async () => {})
  const { run, callTool } = setup({ stroke })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const paths = [[{ x: 40, y: 60 }, { x: 80, y: 100 }, { x: 120, y: 60 }], [{ x: 50, y: 80 }, { x: 100, y: 80 }]]
  const result = await run({ op: 'stroke', revision: o.revision, strokes: paths, duration_ms: 1600 })
  expect(stroke).toHaveBeenCalledWith(o.target, expect.anything(), paths, 1600, expect.any(AbortSignal), [], undefined)
  expect(callTool.mock.calls.filter(([n]) => n === 'get_window_state')).toHaveLength(2)
  expect(result.action).toEqual({ performed: true, strokes: 2, delivery_mode: 'background' })
  expect(result.revision).not.toBe(o.revision)
})
it.each([[], [[{ x: -1, y: 2 }, { x: 20, y: 20 }]], Array.from({ length: 13 }, () => [{ x: 1, y: 1 }, { x: 2, y: 2 }])])('rejects malformed stroke batches without delivering input', async strokes => {
  const stroke = vi.fn(async () => {})
  const { run, callTool } = setup({ stroke })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await expect(run({ op: 'stroke', revision: o.revision, strokes })).rejects.toThrow()
  expect(stroke).not.toHaveBeenCalled()
  expect(callTool.mock.calls.filter(([n]) => n === 'bring_to_front')).toHaveLength(0)
})
it('retains the gesture lease until native cancellation releases the mouse', async () => {
  let release!: () => void
  const stroke = vi.fn(async (_t, _d, _s, _duration, signal: AbortSignal) => {
    await new Promise<void>(resolve => { release = resolve })
    signal.throwIfAborted()
  })
  const { run, c, callTool } = setup({ stroke })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const pending = run({ op: 'stroke', revision: o.revision, strokes: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] })
  const rejected = expect(pending).rejects.toThrow('停止')
  await vi.waitFor(() => expect(stroke).toHaveBeenCalledOnce())
  await c.stop()
  expect(callTool.mock.calls.some(([n]) => n === 'end_session')).toBe(false)
  release(); await rejected
  expect(callTool.mock.calls.some(([n]) => n === 'end_session')).toBe(true)
})
it('stops repeated failures across lease restarts and resets only on a new turn', async () => {
  const { run } = setup()
  for (let n = 0; n < 3; n++) await expect(run({ op: 'click', x: 10, y: 10 })).rejects.toThrow('观察已过期')
  await expect(run({ op: 'apps' })).rejects.toThrow('限制')
  await run({ op: 'release' }); await expect(run({ op: 'apps' })).resolves.toBeDefined()
})
it('enforces an absolute task budget even while model responses are slow', async () => {
  const { run } = setup()
  await run({ op: 'apps' })
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001)
  await expect(run({ op: 'apps' })).rejects.toThrow('10 分钟')
  now.mockRestore()
})
it('binds discovered windows to their owning process and hides off-screen utility windows', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_windows' ? {
    isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, is_on_screen: true, bounds: { width: 800, height: 600 } },
      { pid: 9, window_id: 11, is_on_screen: false, bounds: { width: 1080, height: 30 } }
    ] }) } : original(name, raw, options))
  const list = await run({ op: 'windows', pid: 9 })
  expect(list.data.windows).toHaveLength(1)
  expect(list.next).toEqual([{ op: 'observe', pid: 9, window_id: 10 }])
  const o = await run({ op: 'observe', window_id: 10 })
  expect(o.target).toEqual({ kind: 'window', pid: 9, window_id: 10 })
  await run({ op: 'release' })
  await expect(run({ op: 'observe', window_id: 10 })).rejects.toThrow()
})
it('observes a known app without activating it and skips its decorative watermark', async () => {
  const targetWindow = vi.fn()
  const { run, callTool } = setup({ targetWindow })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    if (name === 'list_apps') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ apps: [
      { name: '易飞书', bundle_id: 'com.example.lark', pid: 9, running: true }
    ] }) }
    if (name === 'list_windows') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 11, title: '', z_index: 9, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      { pid: 9, window_id: 10, title: '易飞书', z_index: 8, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } }
    ] }) }
    if (name === 'bring_to_front') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ activated: true }) }
    return original(name, raw, options)
  })
  const first = await run({ op: 'observe', name: '易飞书' })
  expect(first.target).toEqual({ kind: 'window', pid: 9, window_id: 10 })
  expect(first.focus).toEqual({ requested: false, verified: false, appActive: null, policy: 'background-only' })
  expect(targetWindow).toHaveBeenCalledWith(first.target, first.data.window_bounds, false)
  const second = await run({ op: 'observe', pid: 9, window_id: 10 })
  expect(second.focus).toEqual({ requested: false, verified: false, appActive: null, policy: 'background-only' })
  expect(callTool.mock.calls.filter(([name]) => name === 'bring_to_front')).toHaveLength(0)
  expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front')).toBe(false)
})
it('returns window choices when a known app has multiple real windows', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_apps'
    ? { isError: false, text: '', images: [], structuredJson: JSON.stringify({ apps: [{ name: 'Editor', pid: 9, running: true }] }) }
    : name === 'list_windows'
      ? { isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
        { pid: 9, window_id: 10, title: 'A', is_on_screen: true, bounds: { width: 400, height: 300 } },
        { pid: 9, window_id: 12, title: 'B', is_on_screen: true, bounds: { width: 400, height: 300 } }
      ] }) }
      : original(name, raw, options))
  const result = await run({ op: 'observe', name: 'Editor' })
  expect(result.next).toEqual([{ op: 'observe', pid: 9, window_id: 10 }, { op: 'observe', pid: 9, window_id: 12 }])
  expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front' || name === 'get_window_state')).toBe(false)
})
it('never requests activation even when the driver could only activate the application', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'bring_to_front'
    ? { isError: true, text: 'Exact window unverified', images: [], structuredJson: JSON.stringify({ activated: false, process_activated: true, code: 'bring_to_front_exact_window_unverified' }) }
    : original(name, raw, options))
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  expect(view.focus).toEqual({ requested: false, verified: false, appActive: null, policy: 'background-only' })
  expect(view.target.window_id).toBe(10)
})
it.each([
  { op: 'click', element_token: 'verified-token' }, { op: 'type', text: '后台' },
  { op: 'key', key: 'Return' }, { op: 'hotkey', keys: ['cmd', 'a'] },
  { op: 'scroll', x: 20, y: 30, direction: 'down' }
])('never accepts foreground escalation from model arguments: %j', async action => {
  const { run, callTool } = setup()
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ ...action, revision: o.revision, delivery_mode: 'foreground' })
  const input = callTool.mock.calls.filter(([n]) => !['start_session', 'get_window_state', 'list_windows', 'bring_to_front'].includes(n))
  expect(input).toHaveLength(1)
  expect(JSON.parse(input[0]![1])).toMatchObject({ delivery_mode: 'background', target: o.target })
  expect(callTool.mock.calls.filter(([n]) => n === 'bring_to_front')).toHaveLength(0)
})
it('refuses desktop input without falling back to global mouse events', async () => {
  const { run, callTool } = setup()
  const o = await run({ op: 'observe', scope: 'desktop' })
  await expect(run({ op: 'click', revision: o.revision, x: 20, y: 30 })).rejects.toThrow('后台输入需要目标应用窗口')
  expect(callTool.mock.calls.some(([n]) => n === 'click')).toBe(false)
})
it('does not retry refused background input in the foreground', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'click'
    ? { isError: true, images: [], text: 'background_unavailable', structuredJson: '{}' }
    : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await expect(run({ op: 'click', revision: o.revision, element_token: 'verified-token' })).rejects.toThrow('background_unavailable')
  expect(callTool.mock.calls.filter(([n]) => n === 'click')).toHaveLength(1)
  expect(callTool.mock.calls.filter(([n]) => n === 'bring_to_front')).toHaveLength(0)
})
it.each(['drag', 'stroke'])('retains the lease until cancelled %s releases its target', async op => {
  let release!: () => void
  const stroke = vi.fn(async (_t, _d, _s, _duration, signal: AbortSignal) => {
    await new Promise<void>(resolve => { release = resolve }); signal.throwIfAborted()
  })
  const { run, c, callTool } = setup({ stroke })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const pending = run({ op, revision: o.revision, x: 1, y: 1, to_x: 2, to_y: 2, strokes: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] })
  const rejected = expect(pending).rejects.toThrow('停止')
  await vi.waitFor(() => expect(stroke).toHaveBeenCalledOnce())
  await c.stop()
  expect(callTool.mock.calls.some(([n]) => n === 'end_session')).toBe(false)
  release(); await rejected
  expect(callTool.mock.calls.some(([n]) => n === 'end_session')).toBe(true)
})

it('ignores only snapshot tokens when comparing actionable controls', () => {
  const a = [{ element_token: 's1:0', label: 'Save', focused: true, frame: { x: 1, y: 2 } }]
  expect(sameObservedElements(a, [{ ...a[0], element_token: 's2:0' }])).toBe(true)
  expect(sameObservedElements(a, [{ ...a[0], focused: false }])).toBe(false)
  expect(sameObservedElements(a, [{ ...a[0], label: 'Delete' }])).toBe(false)
  expect(sameObservedElements(undefined, undefined)).toBe(false)
})
it.each([true, false])('rebinds an aged token only after stable semantics and pixels (%s)', async stable => {
  let snapshot = 0
  const { run, callTool } = setup({ unchanged: () => true, prepareObservation: r => ({ ...r, data: { ...r.data, elements: [{ element_token: `s${++snapshot}:0`, label: snapshot > 1 && !stable ? 'Delete' : 'Save' }] } }) })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 40000)
  const result = await run({ op: 'click', revision: o.revision, element_token: 's1:0' })
  const clicks = callTool.mock.calls.filter(([n]) => n === 'click')
  if (stable) expect(JSON.parse(clicks[0]![1]).element_token).toBe('s2:0')
  else { expect(clicks).toHaveLength(0); expect(result.action.performed).toBe(false) }
  now.mockRestore()
})

it.each([{ count: 1, button: 'left' }, { count: 2, button: 'left' }, { count: 1, button: 'right' }])('keeps explicit pixel clicks on the window pointer route: %j', async click => {
  const { run, callTool, stroke } = setup()
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'click', revision: o.revision, x: 30, y: 40, ...click, modifiers: ['shift'] })
  expect(stroke).toHaveBeenCalledWith(o.target, expect.anything(), [[{ x: 30, y: 40 }, { x: 30, y: 40 }]], 100, expect.any(AbortSignal), ['shift'], click)
  expect(callTool.mock.calls.some(([n]) => n === 'click')).toBe(false)
  expect(callTool.mock.calls.filter(([n]) => n === 'bring_to_front')).toHaveLength(0)
  expect(result.action).toMatchObject({ route: 'window_pointer', delivery_mode: 'background' })
})

it('keeps discovery, launch and observation on the same explicit lifecycle across turns', async () => {
  const { run, callTool } = setup()
  await run({ op: 'apps' })
  await run({ op: 'windows' })
  await run({ op: 'open', bundle_id: 'com.example.test' })
  await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ op: 'release' })
  await run({ op: 'windows' })
  const calls = callTool.mock.calls.map(([name, raw]) => ({ name, ...JSON.parse(raw) }))
  const sessions = calls.filter(c => c.name === 'start_session').map(c => c.session)
  expect(sessions).toHaveLength(2)
  expect(sessions[0]).not.toBe(sessions[1])
  let current: string | undefined
  for (const call of calls) {
    if (call.name === 'start_session') current = call.session
    expect(call.session).toBe(current)
  }
})
it('resets consecutive failures after a successful observation', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    if (name === 'list_apps') throw Error('temporary discovery failure')
    return original(name, raw, options)
  })
  await expect(run({ op: 'apps' })).rejects.toThrow('temporary')
  await expect(run({ op: 'apps' })).rejects.toThrow('temporary')
  await run({ op: 'observe', pid: 9, window_id: 10 })
  await expect(run({ op: 'apps' })).rejects.toThrow('temporary')
  await expect(run({ op: 'windows' })).resolves.toBeDefined()
})
it('preserves SDK tool error details instead of only DriverError.Tool', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    if (name === 'list_apps') throw Object.assign(Error('DriverError.Tool'), { inner: { message: 'session has ended', errorCode: 'session_ended' } })
    return original(name, raw, options)
  })
  await expect(run({ op: 'apps' })).rejects.toThrow('list_apps: session has ended (session_ended)')
})
it('rejects locked-screen operations before connecting and still permits release', async () => {
  const { run, callTool } = setup({ assertAvailable: () => { throw Error('Mac 已锁屏') } })
  await expect(run({ op: 'apps' })).rejects.toThrow('Mac 已锁屏')
  expect(callTool).not.toHaveBeenCalled()
  await expect(run({ op: 'release' })).resolves.toEqual({ stopped: true })
})

it.each([
  { op: 'type', text: '测试', tool: 'type_text' },
  { op: 'key', key: 'Return', tool: 'press_key' },
  { op: 'hotkey', keys: ['cmd', 'a'], tool: 'hotkey' }
])('keeps an exact same-process keyboard refusal in the background without replay: %j', async action => {
  for (const addressing of [{ x: 120, y: 80 }, { element_token: 'verified-token' }, {}]) {
    const { run, callTool } = setup()
    const original = callTool.getMockImplementation()!
    callTool.mockImplementation(async (name, raw, options) => name === action.tool ? {
      isError: true, text: 'Background input refused', images: [],
      structuredJson: JSON.stringify({ code: 'same_pid_keyboard_ambiguity', effect: 'refused', pid: 9, window_id: 10 })
    } : original(name, raw, options))
    const view = await run({ op: 'observe', pid: 9, window_id: 10 })
    const result = await run({ ...action, ...addressing, revision: view.revision, delivery_mode: 'foreground' })
    const attempts = callTool.mock.calls.filter(([name]) => name === action.tool).map(([, raw]) => JSON.parse(raw))
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ delivery_mode: 'background', target: view.target })
    expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable', unsupported_reason: 'same_pid_keyboard_ambiguity' })
    expect(result.revision).not.toBe(view.revision)
    expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front')).toBe(false)
    await run({ op: 'finish' })
  }
})

it.each(['type', 'key', 'hotkey'])('skips a known-unsupported %s route without a pointer trip or foreground input', async op => {
  const pointer = vi.fn()
  const { run, callTool } = setup({ pointer, prepareObservation: r => ({ ...r, data: { ...r.data, background_input: {
    exact_window: { status: 'matched', pid: 9, window_id: 10 },
    routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }]
  } } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  pointer.mockClear()
  const result = await run({ op, text: '测试', key: 'Return', keys: ['cmd', 'a'], x: 120, y: 80, revision: view.revision })
  expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable', delivery_mode: 'background' })
  expect(callTool.mock.calls.some(([name]) => ['type_text', 'press_key', 'hotkey', 'bring_to_front'].includes(name))).toBe(false)
  expect(pointer.mock.calls.every(([point]) => point === undefined)).toBe(true)
})

it('does not retain a focused window assumption between sibling-window observations', async () => {
  const { run, callTool } = setup()
  const first = await run({ op: 'observe', pid: 9, window_id: 10 })
  const second = await run({ op: 'observe', pid: 9, window_id: 11 })
  const third = await run({ op: 'observe', pid: 12, window_id: 20 })
  for (const result of [first, second, third]) expect(result.focus).toEqual({ requested: false, verified: false, appActive: null, policy: 'background-only' })
  expect(second.target.window_id).toBe(11)
  expect(third.target.pid).toBe(12)
  expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front')).toBe(false)
})

it('does not attempt a known-refused route without an exact field target', async () => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data, background_input: {
    exact_window: { status: 'matched', pid: 9, window_id: 10 },
    routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }]
  } } }) })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'type', text: '何亚枫', revision: o.revision })
  expect(callTool.mock.calls.filter(([name]) => name === 'type_text')).toHaveLength(0)
  expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable' })
})

it('ends the run after repeated keyboard targeting refusals instead of trying alternate search text indefinitely', async () => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data, background_input: {
    exact_window: { status: 'matched', pid: 9, window_id: 10 },
    routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }]
  } } }) })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const first = await run({ op: 'type', text: '何亚枫', revision: o.revision })
  const second = await run({ op: 'type', text: 'heya', revision: first.revision })
  expect(second.action).toMatchObject({ performed: false, terminal: true, code: 'background_input_unavailable' })
  expect(callTool.mock.calls.filter(([name]) => name === 'type_text')).toHaveLength(0)
  await expect(run({ op: 'observe', pid: 9, window_id: 10 })).rejects.toThrow('本轮桌面控制已停止')
})

it('resolves one accessible search field and sends native background input', async () => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data,
    elements: [{ element_token: 'search-field', role: 'AXTextField', frame: { x: 40, y: 50, w: 120, h: 28 } }]
  } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'type', text: '何亚枫', revision: view.revision })
  const attempts = callTool.mock.calls.filter(([name]) => name === 'type_text')
  expect(attempts).toHaveLength(1)
  expect(JSON.parse(attempts[0]![1])).toMatchObject({ delivery_mode: 'background', element_token: 'search-field', text: '何亚枫' })
  expect(result.action).toMatchObject({ delivery_mode: 'background' })
})

it('cancels a first request waiting on the native driver before creating a session', async () => {
  const callTool = vi.fn(async () => ({ isError: false, text: '', structuredJson: '{}', images: [] }))
  let ready!: (driver: { callTool: typeof callTool }) => void
  const starting = new Promise<{ callTool: typeof callTool }>(resolve => { ready = resolve })
  const { run, c } = setup({ driver: () => starting })
  const pending = run({ op: 'observe', pid: 9, window_id: 10 })
  const rejected = expect(pending).rejects.toThrow('桌面控制已停止')
  await c.stop()
  ready({ callTool })
  await rejected
  expect(callTool).not.toHaveBeenCalled()
})

it('focuses a verified Electron composer by window pixels and reads back after one background input', async () => {
  const { run, callTool } = setup({ screenPoint: (_t, data, x, y) => ({
    x: data.window_bounds.x + x / 2, y: data.window_bounds.y + y / 2
  }), prepareObservation: r => ({ ...r, data: { ...r.data,
    elements: [{ element_token: 'message-field', role: 'AXTextArea', in_web_content: true,
      frame: { x: 100, y: 110, w: 160, h: 40 } }]
  } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  const typed = await run({ op: 'type', text: '你好', element_token: 'message-field', revision: view.revision })
  const inputs = callTool.mock.calls.filter(([name]) => name === 'type_text').map(([, raw]) => JSON.parse(raw))
  expect(inputs).toEqual([expect.objectContaining({ delivery_mode: 'background', text: '你好',
    target: { kind: 'window', pid: 9, window_id: 10 }, x: expect.any(Number), y: expect.any(Number) })])
  expect(inputs[0]).not.toHaveProperty('element_token')
  expect(typed.revision).not.toBe(view.revision)
  expect(callTool.mock.calls.some(([name]) => name === 'bring_to_front')).toBe(false)
})

it.each(['moved', 'covered'])('refuses Electron input when the exact window became %s', async changed => {
  const { run, callTool } = setup({ screenPoint: (_t, data, x, y) => ({
    x: data.window_bounds.x + x / 2, y: data.window_bounds.y + y / 2
  }), prepareObservation: r => ({ ...r, data: { ...r.data,
    elements: [{ element_token: 'message-field', role: 'AXTextArea', in_web_content: true,
      frame: { x: 100, y: 110, w: 160, h: 40 } }]
  } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_windows' ? {
    isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: 1, bounds: { x: changed === 'moved' ? 50 : 20, y: 30, width: 400, height: 300 } },
      ...(changed === 'covered' ? [{ pid: 9, window_id: 11, z_index: 2, bounds: { x: 100, y: 110, width: 160, height: 40 } }] : [])
    ] })
  } : original(name, raw, options))
  const typed = await run({ op: 'type', text: '你好', revision: view.revision, element_token: 'message-field' })
  expect(typed.action).toMatchObject({ performed: false, code: changed === 'moved' ? 'target_window_changed' : 'keyboard_window_covered' })
  expect(callTool.mock.calls.some(([name]) => ['type_text', 'bring_to_front'].includes(name))).toBe(false)
})

it.each([true, false])('refuses an unsafe web keyboard target without AX echo or foreground focus (same-PID refusal=%s)', async knownRefusal => {
  const pointer = vi.fn()
  const { run, callTool } = setup({ pointer, prepareObservation: r => ({ ...r, data: { ...r.data,
    elements: [{ element_token: 'message-field', role: 'AXTextArea', in_web_content: true,
      frame: knownRefusal ? { x: 100, y: 110, w: 160, h: 40 } : undefined }],
    ...(knownRefusal ? { background_input: { exact_window: { status: 'matched', pid: 9, window_id: 10 },
      routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }] } } : {})
  } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  pointer.mockClear()
  const typed = await run({ op: 'type', text: '脑子要多用', revision: view.revision })
  expect(typed.action).toMatchObject({ performed: false, code: 'background_input_unavailable', delivery_mode: 'background',
    unsupported_reason: knownRefusal ? 'same_pid_keyboard_ambiguity' : 'web_text_field' })
  expect(callTool.mock.calls.some(([name]) => ['type_text', 'press_key', 'bring_to_front'].includes(name))).toBe(false)
  expect(pointer.mock.calls.every(([point]) => point === undefined)).toBe(true)
})

it.each([1, 2])('maps a downscaled stream point into the driver validated %s× window pixel frame', async driverScale => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data,
    screenshot_width: 915, screenshot_height: 1600,
    original_screenshot_width: 915, original_screenshot_height: 1600,
    window_bounds: { x: 3440, y: -160, width: 1080, height: 1889 },
    driver_screenshot_scale: driverScale
  } }) })
  const view = await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ op: 'type', revision: view.revision, x: 650, y: 1560, text: 'hello' })
  const args = JSON.parse(callTool.mock.calls.find(([name]) => name === 'type_text')![1])
  expect(args.delivery_mode).toBe('background')
  expect(args.x).toBeCloseTo(650 * 1080 * driverScale / 915, 2)
  expect(args.y).toBeCloseTo(1560 * 1889 * driverScale / 1600, 2)
})

it('keeps a refused background target blocked when a sibling popup covers it', async () => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data, background_input: {
    exact_window: { status: 'matched', pid: 9, window_id: 10 },
    routes: [{ route: 'pid_keyboard', status: 'refused', reason: 'same_pid_keyboard_ambiguity' }]
  } } }) })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_windows' ? {
    isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: 10, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      { pid: 9, window_id: 11, z_index: 20, is_on_screen: true, bounds: { x: 100, y: 60, width: 100, height: 100 } }
    ] })
  } : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'type', text: '何亚枫', revision: o.revision, x: 120, y: 80 })
  expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable' })
  expect(callTool.mock.calls.filter(([name]) => name === 'type_text')).toHaveLength(0)
})

it.each([{ element_token: 'parent-item' }, { x: 110, y: 110 }])('routes a menu item from the parent snapshot to its live popup and observes the parent after dismissal: %j', async selection => {
  const { run, callTool, stroke } = setup({ screenPoint: (_target, _data, x, y) => ({ x: x + 20, y: y + 30 }) })
  const original = callTool.getMockImplementation()!
  let popupOpen = true
  callTool.mockImplementation(async (name, raw, options) => {
    const args = JSON.parse(raw)
    if (name === 'list_windows') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: 10, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      ...(popupOpen ? [{ pid: 9, window_id: 11, z_index: 20, is_on_screen: true, bounds: { x: 100, y: 100, width: 100, height: 100 } }] : [])
    ] }) }
    if (name === 'get_window_state') {
      if (args.window_id === 11 && !popupOpen) throw Error('window_id 11 is not a live window')
      const popup = args.window_id === 11
      return { isError: false, text: '', images: [{ mimeType: 'image/png', dataBase64: 'AA==' }], structuredJson: JSON.stringify({
        screenshot_width: popup ? 100 : 800, screenshot_height: popup ? 100 : 600,
        window_bounds: popup ? { x: 100, y: 100, width: 100, height: 100 } : { x: 20, y: 30, width: 400, height: 300 },
        elements: [{ element_token: popup ? 'popup-item' : 'parent-item', role: 'AXButton', label: '创建群组', actions: ['AXPress'], frame: { x: 110, y: 120, w: 40, h: 30 } }]
      }) }
    }
    if (name === 'click' && args.target.window_id === 11) popupOpen = false
    return original(name, raw, options)
  })
  const first = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'click', revision: first.revision, ...selection })
  const clicks = callTool.mock.calls.filter(([name]) => name === 'click').map(([, raw]) => JSON.parse(raw))
  expect(clicks).toHaveLength(1)
  expect(clicks[0]).toMatchObject({ target: { pid: 9, window_id: 11 }, element_token: 'popup-item' })
  expect(stroke).not.toHaveBeenCalled()
  expect(result.target.window_id).toBe(10)
  expect(result.action.dismissedPopup).toBe(true)
  expect(result.revision).not.toBe(first.revision)
})

it('returns a fresh popup view without clicking through when the menu target cannot be matched', async () => {
  const { run, callTool, stroke } = setup({ screenPoint: (_target, _data, x, y) => ({ x: x + 20, y: y + 30 }) })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    const args = JSON.parse(raw)
    if (name === 'list_windows') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: 10, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      { pid: 9, window_id: 11, z_index: 20, is_on_screen: true, bounds: { x: 100, y: 100, width: 100, height: 100 } }
    ] }) }
    if (name === 'get_window_state' && args.window_id === 11) return { isError: false, text: '', images: [{ mimeType: 'image/png', dataBase64: 'AA==' }], structuredJson: JSON.stringify({
      screenshot_width: 100, screenshot_height: 100, window_bounds: { x: 100, y: 100, width: 100, height: 100 },
      elements: [{ element_token: 'other-item', role: 'AXButton', label: '删除', actions: ['AXPress'], frame: { x: 110, y: 120, w: 40, h: 30 } }]
    }) }
    return original(name, raw, options)
  })
  const first = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'click', revision: first.revision, x: 110, y: 110 })
  expect(result.action).toMatchObject({ performed: false, code: 'overlay_window_changed' })
  expect(result.target.window_id).toBe(11)
  expect(stroke).not.toHaveBeenCalled()
  expect(callTool.mock.calls.some(([name]) => name === 'click')).toBe(false)
})

it('refuses a covered coordinate click when window stacking order is unavailable', async () => {
  const { run, callTool, stroke } = setup({ screenPoint: (_target, _data, x, y) => ({ x: x + 20, y: y + 30 }) })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'list_windows' ? {
    isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: null, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      { pid: 9, window_id: 11, z_index: null, is_on_screen: true, bounds: { x: 100, y: 100, width: 100, height: 100 } }
    ] }) } : original(name, raw, options))
  const first = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'click', revision: first.revision, x: 110, y: 110 })
  expect(result.action).toMatchObject({ performed: false, code: 'window_stack_unknown' })
  expect(stroke).not.toHaveBeenCalled()
  expect(callTool.mock.calls.some(([name]) => name === 'click')).toBe(false)
})

it('does not turn a right click on a popup into an accessibility press', async () => {
  const { run, callTool, stroke } = setup({ screenPoint: (_target, _data, x, y) => ({ x: x + 20, y: y + 30 }) })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    const args = JSON.parse(raw)
    if (name === 'list_windows') return { isError: false, text: '', images: [], structuredJson: JSON.stringify({ windows: [
      { pid: 9, window_id: 10, z_index: 10, is_on_screen: true, bounds: { x: 20, y: 30, width: 400, height: 300 } },
      { pid: 9, window_id: 11, z_index: 20, is_on_screen: true, bounds: { x: 100, y: 100, width: 100, height: 100 } }
    ] }) }
    if (name === 'get_window_state') return { isError: false, text: '', images: [{ mimeType: 'image/png', dataBase64: 'AA==' }], structuredJson: JSON.stringify({
      screenshot_width: args.window_id === 11 ? 100 : 800, screenshot_height: args.window_id === 11 ? 100 : 600,
      window_bounds: args.window_id === 11 ? { x: 100, y: 100, width: 100, height: 100 } : { x: 20, y: 30, width: 400, height: 300 },
      elements: [{ element_token: args.window_id === 11 ? 'popup-item' : 'parent-item', role: 'AXButton', label: '创建群组', actions: ['AXPress'], frame: { x: 110, y: 120, w: 40, h: 30 } }]
    }) }
    return original(name, raw, options)
  })
  const first = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'click', revision: first.revision, x: 110, y: 110, button: 'right' })
  expect(result.action.performed).toBe(false)
  expect(stroke).not.toHaveBeenCalled()
  expect(callTool.mock.calls.some(([name]) => name === 'click')).toBe(false)
})

it('handles the SDK Tool error form of the same-process refusal without trusting its message text', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    if (name === 'type_text' && JSON.parse(raw).delivery_mode === 'background') {
      throw Object.assign(Error('DriverError.Tool'), { inner: { tool: 'type_text', message: 'refused by driver', errorCode: 'same_pid_keyboard_ambiguity' } })
    }
    return original(name, raw, options)
  })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'type', text: '测试', revision: o.revision, x: 120, y: 80 })
  const attempts = callTool.mock.calls.filter(([name]) => name === 'type_text').map(([, raw]) => JSON.parse(raw))
  expect(attempts.map(a => a.delivery_mode)).toEqual(['background'])
  expect(result.action).toMatchObject({ performed: false, code: 'background_input_unavailable', delivery_mode: 'background' })
})

it.each([
  { code: 'same_pid_keyboard_ambiguity', effect: 'unverifiable', pid: 9, window_id: 10 },
  { code: 'same_pid_keyboard_ambiguity', effect: 'refused', pid: 9, window_id: 11 },
  { code: 'permission_denied', effect: 'refused', pid: 9, window_id: 10 }
])('does not replay keyboard input after any other result: %j', async refusal => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'type_text' ? {
    isError: true, text: 'Input not completed', images: [], structuredJson: JSON.stringify(refusal)
  } : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await expect(run({ op: 'type', text: '测试', revision: o.revision, x: 120, y: 80 })).rejects.toThrow()
  expect(callTool.mock.calls.filter(([name]) => name === 'type_text')).toHaveLength(1)
})
