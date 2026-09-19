import { afterEach, expect, it, vi } from 'vitest'
import { ComputerController } from '../src/main/computer/controller'

const controllers: ComputerController[] = []
afterEach(async () => { for (const c of controllers.splice(0)) await c.stop(); vi.useRealTimers() })
function setup(options: Partial<ConstructorParameters<typeof ComputerController>[0]> = {}) {
  const callTool = vi.fn(async (name: string, raw: string, _options?: { signal: AbortSignal }) => ({
    isError: false, text: '', structuredJson: JSON.stringify(name === 'get_window_state' ? { screenshot_width: 800, screenshot_height: 600, window_bounds: { x: 20, y: 30, width: 400, height: 300 }, elements: [{ element_token: 'verified-token', frame: { x: 20, y: 30, w: 10, h: 10 } }] } : { name, ...JSON.parse(raw) }),
    images: name === 'get_window_state' ? [{ mimeType: 'image/png', dataBase64: 'AA==' }] : []
  }))
  const c = new ComputerController({ driver: async () => ({ callTool }), pointer: vi.fn(), visibility: vi.fn(), screenPoint: (_t, _d, x, y) => ({ x, y }), ...options })
  controllers.push(c)
  const run = (input: object, signal = new AbortController().signal) => c.run({ sessionId: 'a', ...input }, signal) as Promise<any>
  return { c, run, callTool }
}
it('refuses unobserved and stale actions; post-action observation replaces the revision', async () => {
  const { run, callTool } = setup()
  await expect(run({ op: 'click', x: 10, y: 10 })).rejects.toThrow('观察已过期')
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const next = await run({ op: 'click', revision: o.revision, x: 100, y: 200 })
  expect(next.revision).not.toBe(o.revision)
  await expect(run({ op: 'click', revision: o.revision, x: 100, y: 200 })).rejects.toThrow('观察已过期')
  expect(callTool.mock.calls.filter(([n]) => n === 'click')).toHaveLength(1)
})
it('never forwards model-selected session, scripts, launch arguments, or output paths', async () => {
  const { run, callTool } = setup()
  await run({ op: 'open', bundle_id: 'com.example.app', additional_arguments: ['--danger'], urls: ['/private'], session: 'other' })
  expect(JSON.parse(callTool.mock.calls.find(([n]) => n === 'launch_app')![1])).toEqual({ bundle_id: 'com.example.app' })
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
it('stop cancels an in-flight gesture and releases the lease only after it unwinds', async () => {
  const { run, c, callTool } = setup()
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (n, raw, options) => {
    if (n === 'drag') await new Promise((_, reject) => options!.signal.addEventListener('abort', () => reject(options!.signal.reason), { once: true }))
    return original(n, raw, options)
  })
  const pending = run({ op: 'drag', revision: o.revision, x: 20, y: 30, to_x: 200, to_y: 250 })
  const rejected = expect(pending).rejects.toThrow('停止')
  await vi.waitFor(() => expect(callTool.mock.calls.some(([n]) => n === 'drag')).toBe(true))
  await c.stop()
  await rejected
  expect(callTool.mock.calls.some(([n]) => n === 'end_session')).toBe(true)
  await run({ op: 'release' })
  await run({ op: 'apps' })
})

it('maps displayed screenshot coordinates back to driver pixels', async () => {
  const { run, callTool } = setup({ prepareObservation: r => ({ ...r, data: { ...r.data, original_screenshot_width: 1600, original_screenshot_height: 1200 } }) })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  await run({ op: 'drag', revision: o.revision, x: 100, y: 100, to_x: 300, to_y: 200 })
  expect(JSON.parse(callTool.mock.calls.find(([n]) => n === 'drag')![1])).toMatchObject({ from_x: 200, from_y: 200, to_x: 600, to_y: 400 })
})
it.each([true, false])('refreshes delayed model observations and only inputs on unchanged targets (%s)', async unchanged => {
  const compare = vi.fn(() => unchanged)
  const { run, callTool } = setup({ unchanged: compare })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 180000)
  const result = await run({ op: 'click', revision: o.revision, x: 100, y: 100 })
  expect(compare).toHaveBeenCalledOnce()
  expect(callTool.mock.calls.some(([n]) => n === 'click')).toBe(unchanged)
  if (!unchanged) expect(result.action.performed).toBe(false)
  now.mockRestore()
})
it('batches continuous strokes and returns one post-gesture observation', async () => {
  const stroke = vi.fn(async () => {})
  const { run, callTool } = setup({ stroke })
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const paths = [[{ x: 40, y: 60 }, { x: 80, y: 100 }, { x: 120, y: 60 }], [{ x: 50, y: 80 }, { x: 100, y: 80 }]]
  const result = await run({ op: 'stroke', revision: o.revision, strokes: paths, duration_ms: 1600 })
  expect(stroke).toHaveBeenCalledWith(o.target, expect.anything(), paths, 1600, expect.any(AbortSignal))
  expect(callTool.mock.calls.filter(([n]) => n === 'get_window_state')).toHaveLength(2)
  expect(result.action).toEqual({ performed: true, strokes: 2 })
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
it.each([true, false])('only delegates a confirmed-focus ordering partial to independently verified native ink (%s)', async partial => {
  const stroke = vi.fn(async () => {})
  const { run, callTool } = setup({ stroke })
  const original = callTool.getMockImplementation()!
  callTool.mockImplementation(async (name, raw, options) => name === 'bring_to_front' ? { isError: true, images: [], structuredJson: '{}', text: partial ? 'bring_to_front: exact window was not verified (focused=true, frontmost_ordinary=false)' : 'permission denied' } : original(name, raw, options))
  const o = await run({ op: 'observe', pid: 9, window_id: 10 })
  const action = run({ op: 'stroke', revision: o.revision, strokes: [[{ x: 50, y: 50 }, { x: 200, y: 150 }]] })
  if (partial) { await action; expect(stroke).toHaveBeenCalledOnce() }
  else { await expect(action).rejects.toThrow('permission denied'); expect(stroke).not.toHaveBeenCalled() }
})
