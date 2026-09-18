import { afterEach, expect, it, vi } from 'vitest'
import { ComputerController } from '../src/main/computer/controller'

const controllers: ComputerController[] = []
afterEach(async () => { for (const c of controllers.splice(0)) await c.stop(); vi.useRealTimers() })
function setup() {
  const callTool = vi.fn(async (name: string, raw: string, _options?: { signal: AbortSignal }) => ({
    isError: false, text: '', structuredJson: JSON.stringify(name === 'get_window_state' ? { screenshot_width: 800, screenshot_height: 600, window_bounds: { x: 20, y: 30, width: 400, height: 300 }, elements: [{ element_token: 'verified-token', frame: { x: 20, y: 30, w: 10, h: 10 } }] } : { name, ...JSON.parse(raw) }),
    images: name === 'get_window_state' ? [{ mimeType: 'image/png', dataBase64: 'AA==' }] : []
  }))
  const c = new ComputerController({ driver: async () => ({ callTool }), pointer: vi.fn(), visibility: vi.fn(), screenPoint: (_t, _d, x, y) => ({ x, y }) })
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
