import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerWorkbenchModelQueue } from '../packages/dsh-research-task-runtime/workbench-model-queue.js'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'

const finish = { type: 'finish', reason: { kind: 'stop' } }
const limited = { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT' } } }
const request = (provider = 'zai', sessionId = 'first', signal) => ({ provider, model: 'model', sessionId, signal })
function setup() {
  let handler
  const sessions = new Map(['first', 'second'].map(id => [id, { session: { header: {}, events: [{ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text: '创建研究工作台' }] } }] } }]))
  const off = vi.fn()
  const dispose = registerWorkbenchModelQueue({ agents: { get: id => sessions.get(id) }, on: (_, fn) => { handler = fn; return off } })
  const open = (options = request(), chunks = [finish]) => {
    const next = vi.fn(async function* () { yield* chunks })
    return { iterator: handler(options, next)[Symbol.asyncIterator](), next }
  }
  return { open, dispose, off }
}
afterEach(() => vi.useRealTimers())
describe('workbench model stream queue', () => {
  it('shares two provider slots across parents and releases on early consumer return', async () => {
    const { open, dispose } = setup()
    const a = open(), b = open(request('zai', 'second')), c = open()
    await a.iterator.next(); await b.iterator.next()
    const pending = c.iterator.next()
    await Promise.resolve()
    expect(c.next).not.toHaveBeenCalled()
    await a.iterator.return()
    expect((await pending).value).toBe(finish)
    await b.iterator.return(); await c.iterator.return(); dispose()
  })
  it('does not block another provider or ordinary conversation', async () => {
    const { open, dispose } = setup()
    const streams = [open(), open(), open(request('kimi')), open(request('zai', 'chat'))]
    for (const stream of streams) expect((await stream.iterator.next()).value).toBe(finish)
    for (const stream of streams) await stream.iterator.return()
    dispose()
  })
  it('cancels queued requests without issuing them or leaking a slot', async () => {
    const { open, dispose } = setup(), controller = new AbortController()
    const a = open(), b = open(), c = open(request('zai', 'first', controller.signal)), d = open()
    await a.iterator.next(); await b.iterator.next()
    const cancelled = c.iterator.next().catch(error => error)
    const pending = d.iterator.next()
    controller.abort()
    expect((await cancelled).name).toBe('AbortError')
    expect(c.next).not.toHaveBeenCalled()
    await a.iterator.return()
    expect((await pending).value).toBe(finish)
    await b.iterator.return(); await d.iterator.return(); dispose()
  })
  it('backs off the provider then allows one probe, without a stale success lifting the limit', async () => {
    vi.useFakeTimers()
    const { open, dispose } = setup()
    const a = open(request(), [limited]), old = open()
    await old.iterator.next(); await a.iterator.next(); await a.iterator.return()
    const probe = open(), behind = open()
    const waiting = probe.iterator.next(), nextWaiting = behind.iterator.next()
    await old.iterator.return()
    await vi.advanceTimersByTimeAsync(14999)
    expect(probe.next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await waiting).value).toBe(finish)
    expect(behind.next).not.toHaveBeenCalled()
    await probe.iterator.return()
    expect((await nextWaiting).value).toBe(finish)
    await behind.iterator.return(); dispose()
  })
  it('honors Retry-After, increases repeated cooldown, and resets after a successful probe', async () => {
    vi.useFakeTimers()
    const { open, dispose } = setup()
    const failure = open(request(), [{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', providerRetryAfterMs: 20000 } } }])
    await failure.iterator.next(); await failure.iterator.return()
    const again = open(request(), [limited]), waitAgain = again.iterator.next()
    await vi.advanceTimersByTimeAsync(19999); expect(again.next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); await waitAgain; await again.iterator.return()
    const success = open(), waiting = success.iterator.next()
    await vi.advanceTimersByTimeAsync(29999); expect(success.next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); await waiting; await success.iterator.return()
    const a = open(), b = open()
    await a.iterator.next(); await b.iterator.next()
    await a.iterator.return(); await b.iterator.return(); dispose()
  })
  it('rejects pending work on dispose', async () => {
    const { open, dispose, off } = setup()
    const a = open(), b = open(), c = open()
    await a.iterator.next(); await b.iterator.next()
    const waiting = c.iterator.next().catch(error => error)
    dispose()
    expect((await waiting).name).toBe('AbortError')
    expect(c.next).not.toHaveBeenCalled(); expect(off).toHaveBeenCalledOnce()
    await a.iterator.return(); await b.iterator.return()
  })
  it('intercepts the actual LLM waterfall and releases slots after adapter failure', async () => {
    const ctx = new Context(), calls = []
    new LlmRuntime(ctx)
    const parent={session:{header:{},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'创建研究工作台'}]}}]}}
    ctx.provide('agents', { get: id => id ? parent : undefined })
    class Adapter extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model } }
      async *stream(options) { calls.push(options.sessionId); if(options.sessionId==='bad') throw Error('network failed'); yield finish }
    }
    ctx.llm.registerAdapter(['zai'],new Adapter())
    const dispose = registerWorkbenchModelQueue(ctx)
    const stream = id => ctx.llm.stream({...request('zai',id),messages:[]})[Symbol.asyncIterator]()
    const a=stream('first'),b=stream('second'),bad=stream('bad'),c=stream('third')
    try {
      await a.next();await b.next()
      const waitBad=bad.next(),waitC=c.next()
      await Promise.resolve();expect(calls).toEqual(['first','second'])
      await a.return();expect((await waitBad).value.reason.kind).toBe('error')
      await bad.return();expect((await waitC).value).toBe(finish)
    } finally { await a.return();await b.return();await bad.return();await c.return();dispose();await ctx.fiber.dispose() }
  })
})
