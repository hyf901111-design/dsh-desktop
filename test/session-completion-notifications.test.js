import { describe, it, expect, vi } from 'vitest'
import { completionPreview, registerSessionCompletionNotifications } from '../packages/dsh-research-task-runtime/session-completion-notifications.js'
const env = { SHERLOCK_RESEARCH_CONTEXT_URL: 'http://127.0.0.1:4321', SHERLOCK_RESEARCH_CONTEXT_TOKEN: 'test-token' }
const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture(request = vi.fn().mockResolvedValue({ ok: true })) {
  let emit
  const off = vi.fn()
  const dispose = registerSessionCompletionNotifications({ on: (name, listener) => { expect(name).toBe('session/event'); emit = listener; return off } }, { env, request })
  const session = { id: 's1', header: { cwd: '/workspace' }, firstLiveSeq: 3, events: [{type:'session/title',data:{title:'Example'}}] }
  const end = (seq = 5, kind = 'completed') => ({ seq, type:'turn/end', data:{reason:{kind}} })
  return { request, emit, dispose, off, session, end }
}
describe('workspace completion notifications', () => {
  it('notifies once per live completed turn, including a later turn and a user fork', async () => {
    const f = fixture(); f.session.header.parentSession = 'original'
    f.emit(f.session, f.end()); f.emit(f.session, f.end()); f.emit(f.session, f.end(8))
    await flush(); expect(f.request).toHaveBeenCalledTimes(2)
    expect(JSON.parse(f.request.mock.calls[0][1].body)).toEqual({sessionId:'s1',seq:5,title:'Example',preview:''})
    f.dispose()
  })
  it('ignores history, interrupted/failed turns, progress and child agents', async () => {
    const f=fixture()
    for (const kind of ['cancelled','error','interrupted']) f.emit(f.session,f.end(5,kind))
    f.emit(f.session,f.end(2)); f.emit(f.session,{seq:5,type:'assistant/message'})
    f.emit({...f.session,header:{cwd:'/workspace',origin:'subagent'}},f.end())
    f.emit({...f.session,header:{cwd:'/workspace',delegationDepth:1}},f.end())
    f.emit({...f.session,header:{}},f.end())
    await flush(); expect(f.request).not.toHaveBeenCalled(); f.dispose()
  })
  it('contains transport failures and aborts outstanding requests on disposal', async () => {
    const f=fixture(vi.fn().mockRejectedValue(new Error('offline')))
    expect(()=>f.emit(f.session,f.end())).not.toThrow(); await flush()
    f.dispose(); f.emit(f.session,f.end(9)); await flush(); expect(f.request).toHaveBeenCalledTimes(1)
    const g=fixture(vi.fn(()=>new Promise(()=>{})))
    g.emit(g.session,g.end()); await flush(); const signal=g.request.mock.calls[0][1].signal
    g.dispose(); expect(signal.aborted).toBe(true); expect(g.off).toHaveBeenCalledOnce()
  })
  it('does not register when the trusted local bridge is unavailable', () => {
    const on=vi.fn(); registerSessionCompletionNotifications({on},{env:{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'https://example.com'}})()
    expect(on).not.toHaveBeenCalled()
  })
})

const answer = (seq, content) => ({seq,type:'assistant/message',data:{message:{content}}})
it('extracts final public answer, cleans formatting and truncates without splitting emoji', () => {
  const events = [{seq:1,type:'turn/start'},answer(2,[{type:'text',text:'进度'}]),answer(3,[{type:'thinking',text:'private'},{type:'text',text:'**北京** 今日晴，详情见[天气](https://example.com)。\n'+ '🌤'.repeat(140)}]),{seq:4,type:'turn/end'}]
  const preview=completionPreview(events,4)
  expect(preview).toMatch(/^北京 今日晴，详情见天气。 /)
  expect(preview).not.toMatch(/private|进度|https|\n/)
  expect(Array.from(preview)).toHaveLength(121)
  expect(preview.endsWith('…')).toBe(true)
})
it('does not borrow answers from previous turns or expose non-text output', () => {
  expect(completionPreview([answer(1,[{type:'text',text:'old'}]),{seq:2,type:'turn/start'}],5)).toBe('')
  expect(completionPreview([{seq:1,type:'turn/start'},answer(2,[{type:'thinking',text:'private'},{type:'image',url:'private'}])],5)).toBe('')
  expect(completionPreview([answer(1,[{type:'text',text:'通知验收完成'}])],5)).toBe('通知验收完成')
})
