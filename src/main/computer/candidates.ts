import { app, globalShortcut, powerMonitor } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { COMPUTER_USE_PLUGINS } from '../integrations/bundled-computer-use'

/** One desktop lease across all providers. Switching provider/account closes its process. */
export function createComputerCandidates() {
  let child: ChildProcessWithoutNullStreams | undefined
  let owner: string | undefined, plugin: string | undefined, started = 0, calls = 0, busy = false
  let ending: Promise<void> | undefined
  let locked = false
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>()
  const stopped = new Set<string>()
  const failPending = (error: Error) => { for (const request of pending.values()) request.reject(error); pending.clear() }
  async function cancel(block = true) {
    if (owner && block) stopped.add(owner)
    const previous = child
    child = undefined; owner = undefined; plugin = undefined
    failPending(Error('桌面控制已停止；若输入已投递，请重新观察确认结果'))
    if (!previous) return ending
    const closing = new Promise<void>(resolve => {
      const timer = setTimeout(() => { previous.kill('SIGKILL'); resolve() }, 2500)
      timer.unref()
      previous.once('exit', () => { clearTimeout(timer); resolve() })
      previous.kill('SIGTERM')
    })
    ending = closing
    await closing
    if (ending === closing) ending = undefined
  }
  const stop = () => { void cancel() }
  const lock = () => { locked = true; stop() }
  const unlock = () => { locked = false }
  globalShortcut.register('CommandOrControl+Shift+Escape', stop)
  powerMonitor.on('lock-screen', lock)
  powerMonitor.on('unlock-screen', unlock)
  powerMonitor.on('suspend', stop)
  function start(sessionId: string, pluginId: string) {
    const candidate = COMPUTER_USE_PLUGINS.find(item => item.id === pluginId)
    if (!candidate) throw Error('未知桌面操作插件')
    const root = app.getAppPath()
    const node = join(root, 'node_modules/node/bin/node')
    const worker = join(root, 'node_modules/dsh-computer-backends/worker.js')
    const native = app.isPackaged ? join(process.resourcesPath, 'native') : join(root, 'build/native')
    const env: NodeJS.ProcessEnv = {}
    for (const key of ['HOME', 'PATH', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'LANG']) if (process.env[key]) env[key] = process.env[key]
    const processChild = spawn(node, [worker, native], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    child = processChild; owner = sessionId; plugin = pluginId; started = Date.now(); calls = 0
    createInterface({ input: processChild.stdout }).on('line', line => {
      try {
        const response = JSON.parse(line), request = pending.get(response.id)
        if (!request) return
        pending.delete(response.id)
        response.error ? request.reject(Error(response.error)) : request.resolve(response.result)
      } catch { failPending(Error('桌面驱动响应格式无效')) }
    })
    processChild.stderr.on('data', () => {})
    processChild.on('error', error => failPending(error))
    processChild.on('exit', () => {
      if (child === processChild) { child = undefined; owner = undefined; plugin = undefined; failPending(Error('桌面驱动已退出，请重新开始本轮任务')) }
    })
    return candidate
  }
  return {
    async run(input: unknown, signal: AbortSignal) {
      const value = input as { op: string; sessionId: string; pluginId: string; name?: string; arguments?: unknown }
      if (!value || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 256) throw Error('缺少桌面操作会话')
      if (value.op === 'finish' || value.op === 'release') {
        if (owner === value.sessionId) await cancel(value.op === 'finish')
        if (value.op === 'release') stopped.delete(value.sessionId)
        return { stopped: true }
      }
      if (!['tools', 'call'].includes(value.op)) throw Error('请先调用 tools 获取当前插件工具，再用 call 执行')
      if (stopped.has(value.sessionId)) throw Error('本轮桌面操作已经停止')
      if (busy || ending || owner && (owner !== value.sessionId || plugin !== value.pluginId)) throw Error('另一个桌面操作正在进行，请等待其结束')
      signal.throwIfAborted()
      if (locked) throw Error('屏幕已锁定，请解锁后使用桌面操作')
      busy = true
      try {
        const candidate = child ? COMPUTER_USE_PLUGINS.find(item => item.id === plugin)! : start(value.sessionId, value.pluginId)
        if (++calls > 100 || Date.now() - started > 10 * 60 * 1000) { await cancel(); throw Error('桌面任务达到本轮预算，已停止') }
        const id = randomUUID()
        const combined = AbortSignal.any([signal, AbortSignal.timeout(80000)])
        const abort = () => { void cancel() }
        combined.addEventListener('abort', abort, { once: true })
        try {
          combined.throwIfAborted()
          return await new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject })
            child!.stdin.write(JSON.stringify({ ...value, backend: candidate.backend, id }) + '\n', error => {
              if (error) { pending.delete(id); reject(error) }
            })
          })
        } finally { combined.removeEventListener('abort', abort) }
      } finally { busy = false }
    },
    cancel: stop,
    async dispose() { globalShortcut.unregister('CommandOrControl+Shift+Escape'); powerMonitor.removeListener('lock-screen', lock); powerMonitor.removeListener('unlock-screen', unlock); powerMonitor.removeListener('suspend', stop); await cancel() }
  }
}
