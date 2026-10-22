import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const blocks = [{ id: 'a', type: 'paragraph', text: '太阳从东边升起。水在标准大气压下100℃沸腾、10℃结冰。' }]
const input = { sessionId: 'qa', requestId: 'PRIVATE-REQUEST-ID', action: 'review', level: 2, title: '太阳从西边升起', blocks }
const bad = { quote: '太阳从东边升起', category: 'uncertain', basis: 'general-knowledge', message: '标题有误，正文首句表述本身正确，请核对标题。', evidence: [] }
const real = { quote: '水在标准大气压下100℃沸腾、10℃结冰', category: 'uncertain', basis: 'general-knowledge', message: '该句大体相符，但结冰温度应为0℃而非10℃，是否需修正？', evidence: [] }
const primary = { reviews: [{ blockId: 'a', issues: [bad, real] }] }
const decisions = { decisions: [{ candidateId: 'c0', keep: false, reason: 'outside-body' }, { candidateId: 'c1', keep: true, reason: 'retain' }] }
function fixture(responses = [primary, decisions]) {
  const calls = [], ctx = {
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'selected', model: 'selected' } } } }) } },
    llm: { stream: async function* (options) {
      const index = calls.length; calls.push(options)
      const response = responses[Math.min(index, responses.length - 1)]
      const value = typeof response === 'function' ? await response(options, index) : response
      yield { type: 'text-delta', index: 0, text: typeof value === 'string' ? value : JSON.stringify(value) }
      yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 10 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } }
  }
  return { ctx, calls }
}
const payloads = f => f.calls.map(call => JSON.parse(call.messages[0].content[0].text))

it('removes only a judged title mismatch while retaining a real correction and the original coverage', async () => {
  const f = fixture(), result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues.map(i => i.quote)).toEqual([real.quote])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(payloads(f).map(p => p.action)).toEqual(['review', 'consistency'])
  expect(payloads(f)[1].candidates).toEqual([
    expect.objectContaining({ candidateId: 'c0', blockId: 'a', quote: bad.quote }),
    expect.objectContaining({ candidateId: 'c1', blockId: 'a', quote: real.quote })
  ])
  expect(payloads(f)[1].context).toEqual(blocks)
  expect(f.calls[1]).toMatchObject({ provider: 'selected', model: 'selected', maxTokens: 800 })
  expect(f.calls[1].tools).toBeUndefined()
  expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 20 })
})

for (const reason of ['no-conflict', 'already-qualified']) it('can discard an admitted or already-qualified false alarm: ' + reason, async () => {
  const f = fixture([primary, { decisions: [{ candidateId: 'c1', keep: true, reason: 'retain' }, { candidateId: 'c0', keep: false, reason }] }])
  expect((await generateNoteChallenge(f.ctx, input)).issues.map(i => i.quote)).toEqual([real.quote])
})

for (const value of [
  { decisions: [{ candidateId: 'c0', keep: false, reason: 'outside-body' }] },
  { decisions: [{ candidateId: 'c0', keep: false, reason: 'outside-body' }, { candidateId: 'c0', keep: true, reason: 'retain' }] },
  { decisions: [{ candidateId: 'unknown', keep: false, reason: 'outside-body' }, { candidateId: 'c1', keep: true, reason: 'retain' }] },
  { decisions: [{ candidateId: 'c0', keep: 'false', reason: 'outside-body' }, { candidateId: 'c1', keep: true, reason: 'retain' }] },
  { decisions: [{ candidateId: 'c0', keep: false, reason: 'retain' }, { candidateId: 'c1', keep: true, reason: 'retain' }] },
  { decisions: [{ candidateId: 'c0', keep: false, reason: 'outside-body', quote: 'forged' }, { candidateId: 'c1', keep: true, reason: 'retain' }] },
  { ...decisions, issues: [] }
]) it('keeps all primary candidates if the consistency decisions are incomplete or invalid: ' + JSON.stringify(value), async () => {
  const f = fixture([primary, value]), result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues.map(i => i.quote)).toEqual([bad.quote, real.quote])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(f.calls).toHaveLength(2)
})

it('does not run a second call for findings without consistency warning cues', async () => {
  const f = fixture([{ reviews: [{ blockId: 'a', issues: [{ ...real, message: '标准气压下水的冰点为0℃，是否需更正？' }] }] }])
  expect((await generateNoteChallenge(f.ctx, input)).issues).toHaveLength(1)
  expect(f.calls).toHaveLength(1)
})

it('checks a vague controversy claim that restates the same correct source fact', async () => {
  const text='红薯也要到明代才传入中国。', issue={...bad,quote:text,message:'常识疑问（未联网核验）：是否需要核对这一说法？红薯传入中国时间有争议，一般认为约明代万历年间，但常被视为传入存在不同说法，建议核对。'}
  const f=fixture([{reviews:[{blockId:'a',issues:[issue]}]},{decisions:[{candidateId:'c0',keep:false,reason:'no-conflict'}]}])
  const result=await generateNoteChallenge(f.ctx,{...input,blocks:[{id:'a',type:'paragraph',text}]})
  expect(result.issues).toEqual([]);expect(f.calls).toHaveLength(2)
})

it('routes controversy wording for judgment without automatically removing a real correction', async () => {
  const issue={...real,message:'此处冰点存在争议：标准气压下通常认为冰点为0℃而非10℃，是否需要修正？'}
  const f=fixture([{reviews:[{blockId:'a',issues:[issue]}]},{decisions:[{candidateId:'c0',keep:true,reason:'retain'}]}])
  const result=await generateNoteChallenge(f.ctx,input)
  expect(result.issues[0].quote).toBe(real.quote);expect(f.calls).toHaveLength(2)
})

it('finishes every primary batch before consistency review and preserves later-block coverage', async () => {
  const many = Array.from({ length: 13 }, (_, n) => ({ id: 'b' + n, type: 'paragraph', text: n ? '普通正文' + n + '。' : blocks[0].text }))
  const f = fixture([options => ({ reviews: JSON.parse(options.messages[0].content[0].text).targets.map((b, n) => ({ blockId: b.id, issues: n ? [] : [bad] })) }), { reviews: [{ blockId: 'b12', issues: [] }] }, { decisions: [{ candidateId: 'c0', keep: false, reason: 'outside-body' }] }])
  const result = await generateNoteChallenge(f.ctx, { ...input, blocks: many })
  expect(payloads(f).map(p => p.action)).toEqual(['review', 'review', 'consistency'])
  expect(result.coveredBlockIds).toEqual(many.map(b => b.id))
  expect(result.issues).toEqual([])
})

it('limits consistency selection to eight without truncating context or deleting unselected candidates', async () => {
  const many = Array.from({ length: 12 }, (_, n) => ({ id: 'b' + n, type: 'paragraph', text: '正确正文' + n + '。' }))
  const f = fixture([{ reviews: many.map(b => ({ blockId: b.id, issues: [{ ...bad, quote: b.text }] })) }, { decisions: Array.from({ length: 8 }, (_, n) => ({ candidateId: 'c' + n, keep: false, reason: 'no-conflict' })) }])
  const result = await generateNoteChallenge(f.ctx, { ...input, blocks: many })
  expect(f.calls).toHaveLength(2)
  expect(payloads(f)[1].candidates).toHaveLength(8)
  expect(payloads(f)[1].context).toEqual(many)
  expect(result.issues.map(i => i.blockId)).toEqual(['b8', 'b9', 'b10', 'b11'])
})

it('skips an over-capacity consistency input rather than slicing complete source blocks', async () => {
  const many = [blocks[0], { id: 'long1', type: 'paragraph', text: '甲'.repeat(10000) }, { id: 'long2', type: 'paragraph', text: '乙'.repeat(10000) }]
  const f = fixture([{ reviews: many.map((b, n) => ({ blockId: b.id, issues: n ? [] : [bad] })) }])
  const result = await generateNoteChallenge(f.ctx, { ...input, blocks: many })
  expect(result.issues).toHaveLength(1)
  expect(payloads(f).every(p => p.action === 'review')).toBe(true)
})

it('keeps primary findings after a provider failure and does not expose its error text', async () => {
  const f = fixture([primary, () => { throw Error('PRIVATE PROVIDER ERROR') }]), result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues.map(i => i.quote)).toEqual([bad.quote, real.quote])
  expect(JSON.stringify(result) + JSON.stringify(console.warn.mock.calls)).not.toContain('PRIVATE PROVIDER ERROR')
})

it('accounts for a malformed consistency output without regenerating it or losing primary findings', async () => {
  const f = fixture([primary, '{"decisions":', '{"decisions":']), result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toHaveLength(2)
  expect(f.calls).toHaveLength(2)
  expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 20 })
})

it('preserves a true numeric correction after malformed secondary JSON even if a retry would delete it', async () => {
  const f = fixture([{ reviews: [{ blockId: 'a', issues: [real] }] }, '{"decisions":', { decisions: [{ candidateId: 'c0', keep: false, reason: 'no-conflict' }] }])
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues.map(i => i.quote)).toEqual([real.quote])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(f.calls).toHaveLength(2)
})

it('times out an uncooperative secondary stream without losing primary results or accepting a late answer', async () => {
  vi.useFakeTimers()
  let late
  const f = fixture([primary, () => new Promise(resolve => { late = resolve })])
  const done = generateNoteChallenge(f.ctx, input)
  await vi.advanceTimersByTimeAsync(8001)
  const result = await done
  expect(result.issues).toHaveLength(2)
  expect(f.calls).toHaveLength(2)
  expect(f.calls[1].signal.aborted).toBe(true)
  late(decisions); await vi.advanceTimersByTimeAsync(1)
  expect(result.issues).toHaveLength(2)
})

it('propagates an actual parent cancellation during secondary review', async () => {
  vi.useFakeTimers()
  const controller = new AbortController(), f = fixture([primary, () => new Promise(() => {})])
  const outcome = generateNoteChallenge(f.ctx, input, controller.signal).then(value => ({ value }), error => ({ error }))
  await vi.advanceTimersByTimeAsync(1)
  controller.abort(Error('USER CANCELLED'))
  expect((await outcome).error?.message).toBe('USER CANCELLED')
  expect(f.calls[1].signal.aborted).toBe(true)
})

it('skips secondary review when primary work leaves less than three seconds', async () => {
  vi.useFakeTimers()
  const f = fixture([() => { vi.setSystemTime(Date.now() + 18001); return primary }])
  expect((await generateNoteChallenge(f.ctx, input)).issues).toHaveLength(2)
  expect(f.calls).toHaveLength(1)
})

it('includes model-route lookup time in the remaining whole-task budget', async () => {
  vi.useFakeTimers()
  const f = fixture()
  f.ctx.apiProxy.sessions.models = async () => {
    vi.setSystemTime(Date.now() + 18001)
    return { result: { ok: true, value: { routable: true, current: { provider: 'selected', model: 'selected' } } } }
  }
  expect((await generateNoteChallenge(f.ctx, input)).issues).toHaveLength(2)
  expect(f.calls).toHaveLength(1)
})

it('logs only fixed status and counts, never candidate text, title, identifiers or provider output', async () => {
  const f = fixture()
  await generateNoteChallenge(f.ctx, input)
  const reports = console.warn.mock.calls.map(([line]) => JSON.parse(line))
  expect(reports).toContainEqual(expect.objectContaining({ event: 'notes-challenge-consistency', status: 'completed', selectedCount: 2, droppedCount: 1 }))
  expect(JSON.stringify(reports)).not.toMatch(/PRIVATE-REQUEST-ID|太阳|结冰|正文首句/u)
})
