import { componentCreationActive, isComponentAgent } from './component-agent-scope.js'
import { bindCanvasChild } from './canvas-tools.js'
import { randomUUID } from 'node:crypto'
import { captureSharedWorkbenchPlan } from './workbench.js'

// The collaboration request already carries authoritative board discussion.
// Keep native tool/delegation exchanges for this task, including its resumed attempts.
function sharedRequestMessages(messages, requestId) {
  if (!messages.some(message => message.role === 'user' && message.id === requestId))
    throw Error('SHARED_REQUEST_CONTEXT_MISSING')
  const resume = /^(.*):resume:([1-9]\d*)$/.exec(requestId)
  const logicalId = resume?.[1] ?? requestId
  let inside = false
  return messages.filter(message => {
    if (message.role === 'user' && message.source?.kind === 'user') {
      const prior = /^(.*):resume:([1-9]\d*)$/.exec(message.id)
      inside = message.id === requestId || Boolean(resume && (
        message.id === logicalId || prior?.[1] === logicalId && Number(prior[2]) < Number(resume[2])
      ))
    }
    return inside && message.source?.plugin !== 'dsh-memory-runtime'
  })
}

/** Drive the account's existing board main agent with its native tools and delegation. */
export function createSharedMainAgentAdapter(ctx) {
  const active = new Set()
  return {
    async start({ parentSessionId, prompt, executionId, signal, onSessionEvent = () => {}, onWorkbenchPlan }) {
      let agent = ctx.agents.get(parentSessionId)
      if (!agent) agent = await ctx.typert?.lookups?.get('agent')?.resolve(parentSessionId)
      if (!agent || agent.id !== parentSessionId || ctx.agents.get(parentSessionId) !== agent) throw Error('PARENT_NOT_LIVE')
      signal.throwIfAborted()
      if (agent.status !== 'idle') throw Error('MAIN_AGENT_BUSY')
      const requestId = 'shared-board-task:' + (executionId ?? randomUUID())
      const descendants = new Set(), bindings = [], runs = new Set()
      bindings.push(ctx.on('agent/request-context', async ({ agent: owner, signal: requestSignal }, next) => {
        const request = await next()
        if (owner !== agent) return request
        signal.throwIfAborted()
        requestSignal?.throwIfAborted()
        return { ...request, messages: sharedRequestMessages(request.messages, requestId) }
      }, { prepend: true }))
      const waiters = new Set()
      const started = info => {
        if (!info?.runId || runs.has(info.runId)) return
        runs.add(info.runId)
        if (!signal.aborted) onSessionEvent({ type: 'tool/call', data: { name: 'subagent' } })
      }
      let cancelling = false
      const ended = info => {
        if (!runs.delete(info?.runId)) return
        if (!signal.aborted) onSessionEvent({ type: 'tool/result', data: {} })
        for (const wake of waiters) wake()
        waiters.clear()
      }
      const observeDelegation = owner => {
        if (!owner.ctx?.on) return
        bindings.push(owner.ctx.on('subagent/start', info => {
          if (!componentCreationActive() && !isComponentAgent(ctx.agents.get(info?.id), ctx.agents)) started(info)
        }))
        bindings.push(owner.ctx.on('subagent/end', ended))
      }
      observeDelegation(agent)
      const attach = child => {
        if (!child || child.id === agent.id || descendants.has(child) || isComponentAgent(child, ctx.agents)) return
        let parentId = child.session?.header?.parentSession
        const visited = new Set()
        while (parentId && !visited.has(parentId)) {
          if (parentId === agent.id) {
            descendants.add(child)
            observeDelegation(child)
            if (cancelling || signal.aborted) child.cancel({ kind: 'parent' })
            bindings.push(bindCanvasChild(child.id, agent.id))
            if (onWorkbenchPlan) bindings.push(captureSharedWorkbenchPlan(child.id, onWorkbenchPlan))
            return
          }
          visited.add(parentId)
          if (isComponentAgent(ctx.agents.get(parentId), ctx.agents)) return
          parentId = ctx.agents.get(parentId)?.session?.header?.parentSession
        }
      }
      for (const child of ctx.agents.list?.() ?? []) attach(child)
      const offChildren = ctx.on('agent/created', payload => attach(payload?.agent))
      // Native child idle precedes persistence and the parent's settlement wake.
      // Global local-agent observation also covers hosts without scoped agent.ctx.
      const offStart = ctx.on('subagent/start', info => {
        const child = ctx.agents.get(info?.id)
        attach(child)
        if (descendants.has(child)) started(info)
      })
      const offEnd = ctx.on('subagent/end', ended)
      const offStatus = ctx.on('agent/status', payload => {
        const a = payload?.agent
        if ((cancelling || signal.aborted) && payload?.status === 'running' && (a === agent || descendants.has(a))) a.cancel({ kind: 'parent' })
      })
      const settle = async () => {
        for (;;) {
          await Promise.all([agent, ...descendants].map(a => a.whenIdle()))
          if (runs.size) {
            await new Promise(resolve => waiters.add(resolve))
            continue
          }
          if (![agent, ...descendants].some(a => a.status === 'running')) return
        }
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
      const cancel = () => { cancelling = true; for (const a of [agent, ...descendants]) a.cancel({ kind: 'parent' }) }
      signal.addEventListener('abort', cancel, { once: true })
      active.add(cancel)
      let disposed = false
      const dispose = async () => {
        if (disposed) return
        disposed = true
        if (runs.size || [agent, ...descendants].some(a => a.status === 'running')) { cancel(); await settle() }
        off(); offChildren(); offStart(); offEnd(); offStatus(); for (const unbind of bindings.reverse()) unbind(); release?.(); signal.removeEventListener('abort', cancel); active.delete(cancel)
      }
      try {
        agent.send({ id: requestId, role: 'user', source: { kind: 'user', clientMode: 'research' }, content: [{ type: 'text', text: prompt }] }, 'next-turn', true)
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
