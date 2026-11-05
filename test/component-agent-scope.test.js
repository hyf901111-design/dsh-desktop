import { expect, it } from 'vitest'
import { createSharedMainAgentAdapter } from '../packages/dsh-research-task-runtime/shared-main-agent.js'
import { startComponentAgent } from '../packages/dsh-research-task-runtime/component-agent-scope.js'

it.each([['before', false], ['during', false], ['before', true], ['during', true]])('keeps components independent (%s, interrupted=%s)', async (timing, interrupted) => {
  const listeners = new Map(), scoped = new Map(), agents = new Map()
  const emit = (name, ...args) => { for (const fn of listeners.get(name) ?? []) fn(...args) }
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); return () => map.get(name).delete(fn) }
  let complete
  const parent = { id: 'main', status: 'idle', session: { header: {} }, ctx: { on: (n, f) => on(scoped, n, f) },
    send() { this.status = 'running' }, whenIdle: () => new Promise(r => { complete = r }), cancel() { this.status = 'idle'; complete?.() } }
  let cancelled = 0
  const child = { id: 'component', status: 'running', session: { header: { parentSession: 'main' } }, whenIdle: () => new Promise(() => {}), cancel() { cancelled++ } }
  agents.set(parent.id, parent)
  const ctx = { agents: { get: id => agents.get(id), list: () => [...agents.values()] }, on: (n, f) => on(listeners, n, f), subagents: { async start() {
    await Promise.resolve() // Creation is asynchronous and may overlap native delegation.
    agents.set(child.id, child); emit('agent/created', { agent: child })
    const info = { id: child.id, runId: 'component-run', local: true }
    for (const fn of scoped.get('subagent/start') ?? []) fn(info)
    emit('subagent/start', info)
    return { id: child.id, localAgent: child }
  } } }
  if (timing === 'before') await startComponentAgent(ctx, {})
  const controller = new AbortController()
  const run = await createSharedMainAgentAdapter(ctx).start({ parentSessionId: parent.id, prompt: 'chat', signal: controller.signal })
  if (timing === 'during') await startComponentAgent(ctx, {})
  if (interrupted) {
    controller.abort()
    await expect(run.result).rejects.toThrow()
  } else {
    parent.cancel()
    await expect(run.result).resolves.toMatchObject({ stopReason: 'completed' })
  }
  await run.dispose()
  expect(cancelled).toBe(0)
  expect(child.status).toBe('running')
})

it('installs a child-owned submission before native first-request assembly and removes setup metadata from native arguments',async()=>{
 const listeners=new Set(),configured=new Set(),seen=[],wait=()=>new Promise(resolve=>setTimeout(resolve,0))
 const ctx={on(name,fn){expect(name).toBe('agent/created');listeners.add(fn);return()=>listeners.delete(fn)},subagents:{async start(_provider,request){
  expect(request).not.toHaveProperty('setupChild')
  await wait()
  const child={id:request.label,ctx:{}}
  for(const fn of listeners)fn({agent:child})
  // Native publication assembles its first model request after agent/created.
  expect(configured.has(child.id)).toBe(true);seen.push(child.id)
  return{id:child.id,localAgent:child}
 }}}
 await Promise.all(['first','second'].map(label=>startComponentAgent(ctx,{label,setupChild(agent){expect(agent.id).toBe(label);configured.add(agent.id)}})))
 expect(new Set(seen)).toEqual(new Set(['first','second']));expect(listeners.size).toBe(0)
})
