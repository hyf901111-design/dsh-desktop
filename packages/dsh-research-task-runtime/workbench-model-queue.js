import { isComponentAgent } from './component-agent-scope.js'
import { workbenchCreationRequest } from './workbench-execution-policy.js'

// Limit only live model streams: data tools remain free to run concurrently.
// Share capacity between workbenches using the same provider, including the
// parent acknowledgement that overlaps its first component workers.
export function registerWorkbenchModelQueue(ctx) {
  const providers = new Map()
  let disposed = false
  const aborted = () => new DOMException('Workbench model request cancelled', 'AbortError')
  function pump(state) {
    clearTimeout(state.timer)
    state.timer = undefined
    if (disposed || !state.queue.length) return
    const delay = state.readyAt - Date.now()
    if (delay > 0) {
      state.timer = setTimeout(() => pump(state), Math.min(delay, 2147483647))
      return
    }
    const capacity = state.failures ? 1 : 2
    while (state.active < capacity && state.queue.length) {
      const entry = state.queue.shift()
      entry.cleanup()
      if (entry.signal?.aborted) { entry.reject(aborted()); continue }
      state.active++
      entry.resolve(state.epoch)
    }
  }
  function acquire(state, signal) {
    if (disposed || signal?.aborted) return Promise.reject(aborted())
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal, cleanup: () => signal?.removeEventListener('abort', cancel) }
      const cancel = () => {
        const index = state.queue.indexOf(entry)
        if (index < 0) return
        state.queue.splice(index, 1)
        entry.cleanup(); reject(aborted()); pump(state)
      }
      state.queue.push(entry)
      signal?.addEventListener('abort', cancel, { once: true })
      pump(state)
    })
  }
  function rateLimit(state, failure) {
    if (failure?.code !== 'RATE_LIMIT' && failure?.status !== 429) return
    state.epoch++
    state.failures++
    const backoff = Math.min(60000, 15000 * 2 ** Math.min(state.failures - 1, 2))
    const hint = Number.isFinite(failure.providerRetryAfterMs) ? failure.providerRetryAfterMs : 0
    state.readyAt = Math.max(state.readyAt, Date.now() + Math.max(backoff, hint))
    pump(state)
  }
  const off = ctx.on('llm/stream', (options, next) => {
    const agent = ctx.agents.get(options.sessionId)
    if (!agent || !options.provider || !(isComponentAgent(agent, ctx.agents) || workbenchCreationRequest(agent.session))) return next()
    let state = providers.get(options.provider)
    if (!state) { state = { active: 0, queue: [], readyAt: 0, epoch: 0, failures: 0, timer: undefined }; providers.set(options.provider, state) }
    return (async function* () {
      const epoch = await acquire(state, options.signal)
      let succeeded = false
      try {
        if (disposed || options.signal?.aborted) throw aborted()
        for await (const chunk of await next()) {
          if (chunk.type === 'finish') {
            rateLimit(state, chunk.reason?.failure)
            succeeded = !['error', 'aborted'].includes(chunk.reason?.kind)
          }
          yield chunk
        }
      } catch (error) {
        rateLimit(state, error?.failure ?? error)
        throw error
      } finally {
        // A request already in flight when another was limited is not a probe.
        if (succeeded && epoch === state.epoch) { state.failures = 0; state.readyAt = 0 }
        state.active--
        pump(state)
      }
    })()
  })
  return () => {
    disposed = true
    off()
    for (const state of providers.values()) {
      clearTimeout(state.timer)
      for (const entry of state.queue.splice(0)) { entry.cleanup(); entry.reject(aborted()) }
    }
    providers.clear()
  }
}
