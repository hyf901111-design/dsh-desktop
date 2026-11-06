import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), register: vi.fn(), unregister: vi.fn(), power: new Map<string, Function>() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('electron', () => ({
  app: { getAppPath: () => '/owned-app', isPackaged: false },
  globalShortcut: { register: mocks.register, unregister: mocks.unregister },
  powerMonitor: { on: (name: string, fn: Function) => mocks.power.set(name, fn), removeListener: (name: string) => mocks.power.delete(name) }
}))
import { createComputerCandidates } from '../src/main/computer/candidates'

let host: ReturnType<typeof createComputerCandidates>
let processes: ReturnType<typeof processFixture>[]
function processFixture() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: Writable; kill: ReturnType<typeof vi.fn>; requests: any[]; reply(result: unknown): void }
  child.requests = []
  child.stdout = new PassThrough(); child.stderr = new PassThrough()
  child.stdin = new Writable({ write(data, _encoding, done) { child.requests.push(JSON.parse(String(data))); done() } })
  child.kill = vi.fn(() => { queueMicrotask(() => child.emit('exit', 0)); return true })
  child.reply = result => child.stdout.write(JSON.stringify({ id: child.requests.at(-1).id, result }) + '\n')
  return child
}
const request = (sessionId = 'a', pluginId = 'builtin:computer-use') => ({ op: 'tools', sessionId, pluginId })
beforeEach(() => {
  processes = []; mocks.spawn.mockReset(); mocks.register.mockClear()
  mocks.spawn.mockImplementation(() => { const child = processFixture(); processes.push(child); return child })
  host = createComputerCandidates()
})
afterEach(async () => { await host.dispose() })

it('serializes desktop ownership and derives the driver from the registered plugin', async () => {
  const first = host.run({ ...request(), backend: 'uitars' }, new AbortController().signal)
  await expect(host.run(request('other'), new AbortController().signal)).rejects.toThrow('另一个桌面操作')
  expect(processes[0]!.requests[0].backend).toBe('cua')
  const options = mocks.spawn.mock.calls[0]![2]
  expect(options.env.VOLCENGINE_AGENT_PLAN_API_KEY).toBeUndefined()
  expect(options.env.EWORK_INTEGRATION_BRIDGE).toBeUndefined()
  processes[0]!.reply({ data: { tools: [] } }); await first
  await expect(host.run(request('a', 'builtin:computer-use-peekaboo'), new AbortController().signal)).rejects.toThrow('另一个桌面操作')
  await host.run({ op: 'release', sessionId: 'a' }, new AbortController().signal)
  const next = host.run(request('b', 'builtin:computer-use-peekaboo'), new AbortController().signal)
  expect(processes[1]!.requests[0].backend).toBe('peekaboo')
  processes[1]!.reply({ data: { tools: [] } }); await next
})

it('aborting in flight kills the worker and prevents replay with the old session', async () => {
  const controller = new AbortController()
  const running = host.run(request(), controller.signal)
  const rejected = expect(running).rejects.toThrow('桌面控制已停止')
  controller.abort(); await rejected
  expect(processes[0]!.kill).toHaveBeenCalledWith('SIGTERM')
  await expect(host.run(request(), new AbortController().signal)).rejects.toThrow('已经停止')
})

it('screen lock stops active input and blocks new actions until unlock', async () => {
  const running = host.run(request(), new AbortController().signal)
  const rejected = expect(running).rejects.toThrow('桌面控制已停止')
  mocks.power.get('lock-screen')!(); await rejected
  await expect(host.run(request('b'), new AbortController().signal)).rejects.toThrow('屏幕已锁定')
  mocks.power.get('unlock-screen')!()
  const next = host.run(request('b'), new AbortController().signal)
  processes[1]!.reply({ data: { tools: [] } }); await next
})
