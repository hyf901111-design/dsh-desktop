import { AsyncLocalStorage } from 'node:async_hooks'

// Mark ownership before asynchronous native publication emits agent/created or
// subagent/start. A parent session alone does not make a canvas job chat-owned.
const creatingComponent = new AsyncLocalStorage()
const components = new WeakSet()
export const componentCreationActive = () => creatingComponent.getStore() === true
export async function startComponentAgent(ctx, request) {
  return creatingComponent.run(true, async () => {
    const run = await ctx.subagents.start('spawn', request)
    if (run.localAgent) components.add(run.localAgent)
    return run
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
