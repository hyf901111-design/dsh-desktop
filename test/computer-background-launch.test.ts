import { afterEach, expect, it, vi } from 'vitest'
import { createBackgroundApplicationInspector, createBackgroundApplicationLauncher, type BackgroundLaunchResult } from '../src/main/computer/background-launch'

afterEach(() => vi.useRealTimers())

it('cancels read-only identity inspection without launching and ignores a late metadata result', async () => {
  let complete!: (result: any) => void
  const inspect = vi.fn(() => new Promise<any>(resolve => { complete = resolve }))
  const launch = vi.fn(), cancelLaunch = vi.fn(), controller = new AbortController()
  const pending = createBackgroundApplicationInspector(() => ({ inspect, launch, cancelLaunch }))({ bundle_id: 'org.example.owned', launch_path: '/tmp/Owned.app' }, controller.signal)
  const assertion = expect(pending).rejects.toThrow('已取消或超时')
  controller.abort(); await assertion
  complete({ code: 'application_identity_verified', apps: [] })
  await Promise.resolve()
  expect(launch).not.toHaveBeenCalled()
  expect(cancelLaunch).not.toHaveBeenCalled()
})

it('bounds identity inspection at five seconds without blocking the event loop', async () => {
  const inspect = vi.fn(() => new Promise<any>(() => {})), launch = vi.fn()
  const pending = createBackgroundApplicationInspector(() => ({ inspect, launch, cancelLaunch: vi.fn() }))({ bundle_id: 'org.example.owned' }, new AbortController().signal)
  const assertion = expect(pending).rejects.toThrow('已取消或超时')
  await new Promise(resolve => setTimeout(resolve, 1))
  expect(inspect).toHaveBeenCalledOnce()
  await assertion
  expect(launch).not.toHaveBeenCalled()
}, 10000)

it('does not load or dispatch native launch when already cancelled', async () => {
  const load = vi.fn()
  const controller = new AbortController(); controller.abort()
  const result = await createBackgroundApplicationLauncher(load)({ bundle_id: 'com.example.target' }, controller.signal)
  expect(result).toMatchObject({ performed: false, dispatched: false, code: 'launch_cancelled_before_dispatch' })
  expect(load).not.toHaveBeenCalled()
})

it('sends only exact application identity and host-owned lifecycle values', async () => {
  const launch = vi.fn(async (_args: Record<string, any>) => ({ performed: true, dispatched: true, delivery_mode: 'background', code: 'application_started', pid: 7 } as const))
  const cancelLaunch = vi.fn()
  const run = createBackgroundApplicationLauncher(() => ({ launch, cancelLaunch, inspect: vi.fn() }))
  const result = await run({ bundle_id: 'com.example.target', launch_path: '/Applications/Target.app',
    arguments: ['--unsafe'], urls: ['file:///private'], activates: true, request_id: 'model', timeout_ms: 0 } as any, new AbortController().signal)
  expect(launch).toHaveBeenCalledWith({ bundle_id: 'com.example.target', launch_path: '/Applications/Target.app', request_id: expect.any(String), timeout_ms: 15000 })
  expect(launch.mock.calls[0]![0].request_id).not.toBe('model')
  expect(result.performed).toBe(true)
  expect(cancelLaunch).not.toHaveBeenCalled()
})

it.each([true, false])('cancels the exact native request and preserves dispatch uncertainty (%s)', async dispatched => {
  let complete!: (result: BackgroundLaunchResult) => void
  const launch = vi.fn((_args: Record<string, any>) => new Promise<BackgroundLaunchResult>(resolve => { complete = resolve }))
  const cancelLaunch = vi.fn()
  const controller = new AbortController()
  const pending = createBackgroundApplicationLauncher(() => ({ launch, cancelLaunch, inspect: vi.fn() }))({ bundle_id: 'com.example.target' }, controller.signal)
  controller.abort()
  expect(cancelLaunch).toHaveBeenCalledWith(launch.mock.calls[0]![0].request_id)
  complete({ performed: dispatched ? true : false, dispatched, code: dispatched ? 'application_started' : 'launch_cancelled_before_dispatch', delivery_mode: 'background' })
  const result = await pending
  expect(result.performed).toBe(dispatched ? null : false)
  if (dispatched) expect(result).toMatchObject({ effect: 'unknown', code: 'launch_cancelled_after_dispatch' })
  expect(launch).toHaveBeenCalledOnce()
})

it('never automatically retries unknown, timeout, or identity-ambiguous native results', async () => {
  const launch = vi.fn(async (_args: Record<string, any>) => ({ performed: null, dispatched: true, delivery_mode: 'background', code: 'launch_timeout_after_dispatch', effect: 'unknown' } as const))
  const result = await createBackgroundApplicationLauncher(() => ({ launch, cancelLaunch: vi.fn(), inspect: vi.fn() }))({ bundle_id: 'com.example.target' }, new AbortController().signal)
  expect(result.performed).toBeNull()
  expect(launch).toHaveBeenCalledOnce()
})
