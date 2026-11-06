import { isAbsolute } from 'node:path'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { computerHostEndpoint, registerComputerUseTool } from './computer-use-tools.js'

const ids = ['builtin:computer-use', 'builtin:computer-use-peekaboo', 'builtin:computer-use-uitars']
export const COMPUTER_USE_TOOL = 'computer_use'
const tool = COMPUTER_USE_TOOL

/** Own the original desktop tool's registration and lease per enabled account. */
export function createComputerUseController(ctx, { binaryPath, runtime, report, allowed, env, fetch }) {
  let fiber, identity, closed = false, queue = Promise.resolve()
  const selected = snapshot => snapshot?.plugins.find(item => ids.includes(item.id) && item.enabled === true)?.id
  const desired = snapshot => !!selected(snapshot)
  const enabled = () => !closed && !!fiber && desired(runtime.snapshot) && identity === `${runtime.snapshot.runtimeEpoch}:${runtime.snapshot.ownerAccountId}:${selected(runtime.snapshot)}`
  const denied = () => new HarnessError('Computer Use 已停用或当前运行时尚未连接', 'ACCESS_DENIED')
  const guard = ctx.tools.guard(exec => exec.name === tool && (!enabled() || !allowed(exec.agent)) ? 'Computer Use 已停用或当前会话不可用' : undefined)
  const off = ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== tool) return next()
    await runtime.sync()
    if (!enabled() || !allowed(exec.agent)) throw denied()
    return next()
  })
  const unload = async () => { const previous = fiber; fiber = undefined; identity = undefined; await previous?.() }
  return {
    sync(snapshot) {
      const work = queue.then(async () => {
        if (closed) return
        const key = snapshot && `${snapshot.runtimeEpoch}:${snapshot.ownerAccountId}:${selected(snapshot)}`
        if (fiber && (!desired(snapshot) || identity !== key)) await unload()
        if (!snapshot) return
        if (desired(snapshot) && !fiber) {
          try {
            if (ctx.tools.get(tool)) throw Error('Computer Use is already owned by another plugin')
            const executable = env.EWORK_COMPUTER_USE_EXECUTABLES
              ? JSON.parse(env.EWORK_COMPUTER_USE_EXECUTABLES)[selected(snapshot)] : binaryPath
            if (typeof executable !== 'string' || !isAbsolute(executable)) throw Error('Native executable path is not absolute')
            await access(executable, constants.X_OK)
            const { runtimeEpoch, ownerAccountId } = snapshot
            fiber = registerComputerUseTool(ctx, { endpoint: computerHostEndpoint(env), identity: { runtimeEpoch, ownerAccountId, pluginId: selected(snapshot) }, fetch })
            identity = key
            if (!ctx.tools.get(tool)) throw Error('Computer Use did not register its tool')
          } catch (error) { await unload(); ctx.logger.warn('Computer Use plugin could not load: %s', error.message) }
        }
        if (closed) return
        for (const id of ids) await report({ id, version: '0.1.0', runtimeEpoch: snapshot.runtimeEpoch, ownerAccountId: snapshot.ownerAccountId, registered: id === selected(snapshot) && !!fiber && !!ctx.tools.get(tool) })
      })
      queue = work.catch(() => {})
      return work
    },
    async dispose() { closed = true; await queue; await unload(); off(); guard() }
  }
}
