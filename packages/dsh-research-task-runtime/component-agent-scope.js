import { AsyncLocalStorage } from 'node:async_hooks'

// Mark ownership before asynchronous native publication emits agent/created or
// subagent/start. A parent session alone does not make a canvas job chat-owned.
const creatingComponent = new AsyncLocalStorage()
const components = new WeakSet()
export const componentCreationActive = () => Boolean(creatingComponent.getStore())
export async function startComponentAgent(ctx, request) {
  const creation = {}
  return creatingComponent.run(creation, async () => {
    // AgentOptions selects provider/model, but the native loop does not consume
    // its reasoningEffort field. Bind the selected component effort before the
    // published child can assemble its first request.
    const effort = request.agentOptions?.reasoningEffort
    const off = effort && ctx.on ? ctx.on('agent/created', ({ agent }) => {
      if (creatingComponent.getStore() !== creation) return
      components.add(agent)
      agent.ctx.on('agent/request', async (_payload, next) => {
        const config = await next()
        return config.provider === request.agentOptions.provider && config.model === request.agentOptions.model
          ? { ...config, reasoningEffort: effort } : config
      })
    }) : undefined
    try {
      const run = await ctx.subagents.start('spawn', request)
      if (run.localAgent) components.add(run.localAgent)
      return run
    } finally { off?.() }
  })
}
export function isComponentAgent(agent, agents) {
  if (!agent) return false
  if (componentCreationActive()) { components.add(agent); return true }
  const visited = new Set()
  for (let current = agent; current && !visited.has(current); current = agents.get(current.session?.header?.parentSession)) {
    if (components.has(current)) return true
    visited.add(current)
  }
  return false
}

// Continuations share the same component ownership during fresh and cold activation.
export function withComponentAgentCreation(fn) {
  return creatingComponent.run(true, fn)
}
