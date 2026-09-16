import { bindCanvasChild } from './canvas-tools.js'
import { randomUUID } from 'node:crypto'
import { captureSharedWorkbenchPlan } from './workbench.js'

/** Drive the account's existing board main agent with its native tools and delegation. */
export function createSharedMainAgentAdapter(ctx) {
  const active = new Set()
  return {
    async start({ parentSessionId, prompt, signal, onSessionEvent = () => {}, onWorkbenchPlan }) {
      let agent = ctx.agents.get(parentSessionId)
      if (!agent) agent = await ctx.typert?.lookups?.get('agent')?.resolve(parentSessionId)
      if (!agent || agent.id !== parentSessionId || ctx.agents.get(parentSessionId) !== agent) throw Error('PARENT_NOT_LIVE')
      signal.throwIfAborted()
      if (agent.status !== 'idle') throw Error('MAIN_AGENT_BUSY')
      const descendants = new Set(), bindings = []
      const attach = child => {
        if (!child || child.id === agent.id || descendants.has(child)) return
        let parentId = child.session?.header?.parentSession
        const visited = new Set()
        while (parentId && !visited.has(parentId)) {
          if (parentId === agent.id) {
            descendants.add(child)
            bindings.push(bindCanvasChild(child.id, agent.id))
            if (onWorkbenchPlan) bindings.push(captureSharedWorkbenchPlan(child.id, onWorkbenchPlan))
            return
          }
          visited.add(parentId)
          parentId = ctx.agents.get(parentId)?.session?.header?.parentSession
        }
      }
      for (const child of ctx.agents.list?.() ?? []) attach(child)
      const offChildren = ctx.on('agent/created', payload => attach(payload?.agent))
      const settle = async () => {
        do {
          await Promise.all([agent, ...descendants].map(a => a.whenIdle()))
        } while ([agent, ...descendants].some(a => a.status === 'running'))
      }
      let output = [], failure
      const off = ctx.on('session/event', (session, event) => {
        if (session.id !== agent.id || signal.aborted) return
        onSessionEvent(event)
        if (event.type === 'assistant/message') output = event.data.message.content
        if (event.type === 'turn/end') {
          if (!['completed', 'max-tokens'].includes(event.data.reason?.kind)) failure = Error('EXECUTION_INTERRUPTED')
        }
      })
      const release = onWorkbenchPlan ? captureSharedWorkbenchPlan(agent.id, onWorkbenchPlan) : undefined
      const cancel = () => { for (const a of [agent, ...descendants]) a.cancel({ kind: 'parent' }, { keepInbox: true }) }
      signal.addEventListener('abort', cancel, { once: true })
      active.add(cancel)
      let disposed = false
      const dispose = async () => {
        if (disposed) return
        disposed = true
        if ([agent, ...descendants].some(a => a.status === 'running')) { cancel(); await settle() }
        off(); offChildren(); for (const unbind of bindings.reverse()) unbind(); release?.(); signal.removeEventListener('abort', cancel); active.delete(cancel)
      }
      try {
        agent.send({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] }, 'next-turn', true)
        return { result: settle().then(() => {
          signal.throwIfAborted()
          if (failure) throw failure
          return { stopReason: 'completed', output }
        }), dispose }
      } catch (error) { await dispose(); throw error }
    },
    async dispose() { for (const cancel of active) cancel() }
  }
}
