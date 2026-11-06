import { isAbsolute } from 'node:path'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { computerHostEndpoint, registerComputerUseTool } from './computer-use-tools.js'

const id = 'builtin:computer-use'
export const COMPUTER_USE_TOOL = 'computer_use'
const tool = COMPUTER_USE_TOOL

/** Own the original desktop tool's registration and lease per enabled account. */
export function createComputerUseController(ctx, { binaryPath, runtime, report, allowed, env, fetch }) {
  let fiber, identity, closed = false, queue = Promise.resolve()
  const desired = snapshot => !!snapshot?.plugins.some(item => item.id === id && item.enabled === true)
  const enabled = () => !closed && !!fiber && desired(runtime.snapshot) && identity === `${runtime.snapshot.runtimeEpoch}:${runtime.snapshot.ownerAccountId}`
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
        const key = snapshot && `${snapshot.runtimeEpoch}:${snapshot.ownerAccountId}`
        if (fiber && (!desired(snapshot) || identity !== key)) await unload()
        if (!snapshot) return
        if (desired(snapshot) && !fiber) {
          try {
            if (ctx.tools.get(tool)) throw Error('Computer Use is already owned by another plugin')
            if (!isAbsolute(binaryPath)) throw Error('Native executable path is not absolute')
            await access(binaryPath, constants.X_OK)
            const { runtimeEpoch, ownerAccountId } = snapshot
            fiber = registerComputerUseTool(ctx, { endpoint: computerHostEndpoint(env), identity: { runtimeEpoch, ownerAccountId }, fetch })
            identity = key
            if (!ctx.tools.get(tool)) throw Error('Computer Use did not register its tool')
          } catch (error) { await unload(); ctx.logger.warn('Computer Use plugin could not load: %s', error.message) }
        }
        if (closed) return
        await report({ id, version: '0.1.0', runtimeEpoch: snapshot.runtimeEpoch, ownerAccountId: snapshot.ownerAccountId, registered: !!fiber && !!ctx.tools.get(tool) })
      })
      queue = work.catch(() => {})
      return work
    },
    async dispose() { closed = true; await queue; await unload(); off(); guard() }
  }
}
