import { expect, it } from 'vitest'
import { createSharedMainAgentAdapter } from '../packages/dsh-research-task-runtime/shared-main-agent.js'
it('delivers to the existing main agent and keeps native delegation and tools intact',async()=>{
 const events=new Map();let resolve;const idle=new Promise(r=>resolve=r);let sent
 const parent={id:'mine',status:'idle',session:{events:[]},send(m,target,wake){sent={m,target,wake};this.status='running'},whenIdle:()=>idle,cancel(){}}
 const ctx={agents:{get:()=>parent},on:(name,fn)=>{events.set(name,fn);return()=>events.delete(name)}}
 const adapter=createSharedMainAgentAdapter(ctx)
 const handle=await adapter.start({parentSessionId:'mine',prompt:'request',executionId:'t:resume:1',signal:new AbortController().signal,onSessionEvent:()=>{}})
 expect(sent).toMatchObject({target:'next-turn',wake:true,m:{id:'shared-board-task:t:resume:1',role:'user',content:[{type:'text',text:'request'}]}})
 events.get('session/event')({id:'other'},{type:'assistant/message',data:{message:{content:[{type:'text',text:'wrong'}]}}})
 events.get('session/event')(parent,{type:'assistant/message',data:{message:{content:[{type:'text',text:'done'}]}}})
 parent.status='idle';resolve();expect(await handle.result).toMatchObject({output:[{type:'text',text:'done'}]});await handle.dispose();expect(events.size).toBe(0)
})
it('refuses a busy personal main agent instead of mixing two tasks',async()=>{
 const parent={id:'mine',status:'running'}
 const adapter=createSharedMainAgentAdapter({agents:{get:()=>parent}})
 await expect(adapter.start({parentSessionId:'mine',signal:new AbortController().signal})).rejects.toThrow('MAIN_AGENT_BUSY')
})
it('holds the turn until a delegated child settles and cancels both on interruption', async () => {
  const listeners = new Map()
  let finishParent, finishChild
  const parentIdle = new Promise(r => { finishParent = r })
  const childIdle = new Promise(r => { finishChild = r })
  const parent = { id: 'main', status: 'idle', session: { header: {} }, send() { this.status = 'running' }, whenIdle: () => parentIdle, cancel() { this.status = 'idle'; finishParent() } }
  const child = { id: 'child', status: 'running', session: { header: { parentSession: 'main' } }, whenIdle: () => childIdle, cancel() { this.status = 'idle'; finishChild() } }
  const ctx = { agents: { get: id => id === 'main' ? parent : child }, on: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name) } }
  const controller = new AbortController()
  const handle = await createSharedMainAgentAdapter(ctx).start({ parentSessionId: 'main', prompt: 'delegate', signal: controller.signal, onSessionEvent: () => controller.signal.throwIfAborted() })
  listeners.get('agent/created')({agent: child})
  parent.status = 'idle'; finishParent()
  let settled = false
  const result = handle.result.catch(error => error).finally(() => { settled = true })
  await new Promise(r => setTimeout(r, 5))
  expect(settled).toBe(false)
  controller.abort()
  expect(await result).toBeInstanceOf(Error)
  await handle.dispose()
  expect(child.status).toBe('idle')
  expect(listeners.size).toBe(0)
})
it('does not publish partial text from a failed main-agent turn', async () => {
  let listener
  const parent = { id:'main',status:'idle',session:{},send() {
    listener(this,{type:'assistant/message',data:{message:{content:[{type:'text',text:'partial'}]}}})
    listener(this,{type:'turn/end',data:{reason:{kind:'error'}}})
  },whenIdle:async()=>{},cancel(){} }
  const ctx={agents:{get:()=>parent},on:(name,fn)=>{if(name==='session/event')listener=fn;return()=>{}}}
  const handle=await createSharedMainAgentAdapter(ctx).start({parentSessionId:'main',prompt:'request',signal:new AbortController().signal})
  await expect(handle.result).rejects.toThrow('EXECUTION_INTERRUPTED')
  await handle.dispose()
})
it.each([false, true])('waits for delayed native settlement and drains its parent wake (aborted=%s)', async aborted => {
  const listeners = new Map()
  const emit = (name, ...args) => listeners.get(name)?.(...args)
  let idleWaiters = []
  const parent = { id: 'main', status: 'idle', session: { header: {} },
    send() { this.status = 'running'; emit('agent/status', { agent: this, status: 'running' }) },
    whenIdle() { return this.status === 'idle' ? Promise.resolve() : new Promise(r => idleWaiters.push(r)) },
    cancel() { this.status = 'idle'; for (const r of idleWaiters.splice(0)) r() }
  }
  const child = { id: 'child', status: 'idle', session: { header: { parentSession: 'main' } }, whenIdle: async () => {}, cancel() {} }
  const ctx = { agents: { get: id => id === 'main' ? parent : id === 'child' ? child : undefined }, on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name) } }
  const controller = new AbortController()
  const handle = await createSharedMainAgentAdapter(ctx).start({ parentSessionId: 'main', prompt: 'delegate', signal: controller.signal, onSessionEvent: () => controller.signal.throwIfAborted() })
  emit('agent/created', { agent: child })
  emit('subagent/start', { id: 'child', runId: 'native-run', local: true })
  emit('session/event', parent, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'provisional' }] } } })
  parent.cancel()
  let settled = false
  const result = handle.result.catch(e => e).finally(() => { settled = true })
  if (aborted) controller.abort()
  await new Promise(r => setTimeout(r, 5))
  expect(settled).toBe(false)
  // Native final persistence completes, then wakes the parent, then emits end.
  parent.send()
  emit('subagent/end', { id: 'child', runId: 'native-run' })
  if (aborted) expect(parent.status).toBe('idle')
  else {
    await new Promise(r => setTimeout(r, 5))
    expect(settled).toBe(false)
    emit('session/event', parent, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'final child summary' }] } } })
    parent.cancel()
  }
  const value = await result
  if (aborted) expect(value).toBeInstanceOf(Error)
  else expect(value.output).toEqual([{ type: 'text', text: 'final child summary' }])
  await handle.dispose()
  expect(listeners.size).toBe(0)
})
it('reports native delegated work as visible activity while preserving the main result', async () => {
 const listeners=new Map(), scoped=new Map(), progress=[]
 let finish
 const waiting=new Promise(r=>finish=r)
 const parent={id:'p',status:'idle',session:{header:{}},ctx:{on:(name,fn)=>{scoped.set(name,fn);return()=>scoped.delete(name)}},send(){this.status='running'},whenIdle:()=>waiting,cancel(){}}
 const child={id:'c',status:'idle',session:{header:{parentSession:'p'}},whenIdle:async()=>{},cancel(){}}
 const ctx={agents:{get:id=>id==='p'?parent:child},on:(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name)}}
 const handle=await createSharedMainAgentAdapter(ctx).start({parentSessionId:'p',prompt:'delegate',signal:new AbortController().signal,onSessionEvent:event=>progress.push(event)})
 scoped.get('subagent/start')({id:'c',runId:'r'})
 expect(progress).toContainEqual({type:'tool/call',data:{name:'subagent'}})
 scoped.get('subagent/end')({runId:'r'})
 expect(progress).toContainEqual({type:'tool/result',data:{}})
 parent.status='idle';finish();await handle.result;await handle.dispose()
})

it('sends the current shared request and its prior attempt, excluding local image and unrelated turn history', async () => {
 const listeners = new Map()
 const agent = { id: 'board', status: 'idle', session: { events: [] },
  send() {}, whenIdle: async () => {}, cancel() {}
 }
 const ctx = { agents: { get: () => agent }, on(name, fn) {
  listeners.set(name, fn)
  return () => listeners.delete(name)
 } }
 const handle = await createSharedMainAgentAdapter(ctx).start({
  parentSessionId: 'board', executionId: 'market:resume:1', prompt: '总结下这页', signal: new AbortController().signal
 })
 const user = id => ({ id, role: 'user', source: { kind: 'user' } })
 const assistant = id => ({ id, role: 'assistant' })
 const request = { provider: 'test', messages: [
  user('image-studio-edit'), assistant('image-caption'),
  user('shared-board-task:market'), assistant('prior-attempt-tools'),
  user('shared-board-task:other'), assistant('unrelated-answer'),
  user('shared-board-task:market:resume:1'), assistant('current-tools'),
  { id: 'private-memory', role: 'user', source: { kind: 'plugin', plugin: 'dsh-memory-runtime' } }
 ] }
 try {
  const project = listeners.get('agent/request-context')
  expect(project).toBeTypeOf('function')
  const scoped = await project({ agent, signal: new AbortController().signal }, async () => request)
  expect(scoped.messages.map(message => message.id)).toEqual([
   'shared-board-task:market', 'prior-attempt-tools', 'shared-board-task:market:resume:1', 'current-tools'
  ])
  await expect(project({ agent, signal: new AbortController().signal }, async () => ({ ...request, messages: request.messages.slice(0, 2) }))).rejects.toThrow()
  expect(await project({ agent: { id: 'other' } }, async () => request)).toBe(request)
 } finally { await handle.dispose() }
 expect(listeners.has('agent/request-context')).toBe(false)
})
