import { afterEach, expect, it, vi } from 'vitest'
import { ComputerController, sameObservedElements } from '../src/main/computer/controller'

const controllers: ComputerController[] = []
afterEach(async () => { for (const c of controllers.splice(0)) await c.stop(); vi.useRealTimers() })
function setup(options: Partial<ConstructorParameters<typeof ComputerController>[0]> = {}) {
  const callTool = vi.fn(async (name: string, raw: string, _options?: { signal: AbortSignal }) => ({
    isError: false, text: '', structuredJson: JSON.stringify(['get_window_state', 'get_desktop_state'].includes(name) ? { screenshot_width: 800, screenshot_height: 600, window_bounds: { x: 20, y: 30, width: 400, height: 300 }, elements: [{ element_token: 'verified-token', frame: { x: 20, y: 30, w: 10, h: 10 } }] } : { name, ...JSON.parse(raw) }),
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
  expect(JSON.parse(callTool.mock.calls.find(([n]) => n === 'launch_app')![1])).toEqual({ bundle_id: 'com.example.app', session: expect.stringMatching(/^ework-/) })
  await expect(run({ op: 'shell', command: 'anything' })).rejects.toThrow('不支持')
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
  expect(callTool.mock.calls.some(([n]) => n === 'drag' || n === 'bring_to_front')).toBe(false)
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
  expect(callTool.mock.calls.some(([n]) => n === 'bring_to_front')).toBe(false)
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
it.each([
  { op: 'click', element_token: 'verified-token' }, { op: 'type', text: '后台' },
  { op: 'key', key: 'Return' }, { op: 'hotkey', keys: ['cmd', 'a'] },
  { op: 'scroll', x: 20, y: 30, direction: 'down' }
])('never accepts foreground escalation from model arguments: %j', async action => {
  const { run, callTool } = setup()
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ ...action, revision: o.revision, delivery_mode: 'foreground' })
  const input = callTool.mock.calls.filter(([n]) => !['start_session', 'get_window_state'].includes(n))
  expect(input).toHaveLength(1)
  expect(JSON.parse(input[0]![1])).toMatchObject({ delivery_mode: 'background', target: o.target })
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
  expect(callTool.mock.calls.some(([n]) => n === 'bring_to_front')).toBe(false)
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
  expect(callTool.mock.calls.some(([n]) => n === 'click' || n === 'bring_to_front')).toBe(false)
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
  { op: 'type', text: '测试', x: 120, y: 80, tool: 'type_text' },
  { op: 'key', key: 'Return', tool: 'press_key' },
  { op: 'hotkey', keys: ['cmd', 'a'], x: 120, y: 80, tool: 'hotkey' }
])('retries an untouched same-process keyboard refusal against the exact window: %j', async action => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => {
    if (name === action.tool && JSON.parse(raw).delivery_mode === 'background') return {
      isError: true, text: 'Background input refused', images: [],
      structuredJson: JSON.stringify({ code: 'same_pid_keyboard_ambiguity', effect: 'refused', pid: 9, window_id: 10 })
    }
    return original(name, raw, options)
  })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ ...action, revision: o.revision })
  const attempts = callTool.mock.calls.filter(([name]) => name === action.tool).map(([, raw]) => JSON.parse(raw))
  expect(attempts).toHaveLength(2)
  expect(attempts.map(a => a.delivery_mode)).toEqual(['background', 'foreground'])
  expect(attempts[1]).toMatchObject({ target: o.target, session: expect.stringMatching(/^ework-/) })
  expect(result.action).toMatchObject({ delivery_mode: 'foreground' })
})

it.each([{ op: 'type', text: '测试', tool: 'type_text' }, { op: 'hotkey', keys: ['cmd', 'a'], tool: 'hotkey' }])('asks for an exact text field before foreground retry when the field is unspecified: %j', async action => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === action.tool ? {
    isError: true, text: 'Background input refused', images: [],
    structuredJson: JSON.stringify({ code: 'same_pid_keyboard_ambiguity', effect: 'refused', pid: 9, window_id: 10 })
  } : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ ...action, revision: o.revision })
  expect(callTool.mock.calls.filter(([name]) => name === action.tool)).toHaveLength(1)
  expect(result.action).toMatchObject({ performed: false, code: 'keyboard_target_required' })
  expect(result.revision).not.toBe(o.revision)
})

it('returns a fresh view without replaying an AX-addressed text write that may have landed', async () => {
  const { run, callTool } = setup()
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'type_text' ? {
    isError: true, text: 'Background input refused', images: [],
    structuredJson: JSON.stringify({ code: 'same_pid_keyboard_ambiguity', effect: 'refused', pid: 9, window_id: 10 })
  } : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const result = await run({ op: 'type', text: '测试', revision: o.revision, element_token: 'verified-token' })
  expect(callTool.mock.calls.filter(([name]) => name === 'type_text')).toHaveLength(1)
  expect(result.action).toMatchObject({ effect: 'unverifiable', code: 'same_pid_keyboard_ambiguity' })
  expect(result.revision).not.toBe(o.revision)
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
