import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'

const load = () => import('../packages/dsh-research-task-runtime/notes-challenge-runtime.js')
const input = { sessionId: 'session', requestId: 'review-1', action: 'review', level: 2, title: '分析', blocks: [{ id: 'a', type: 'paragraph', text: '收入增长10%。' }, { id: 'b', type: 'paragraph', text: '收入减少10%。' }], changedIds: ['a'] }
function fixture(answer = { issues: [] }) {
  const calls = [], events = [], session = { id: 'session', events }, ctx = {
    sessions: { get: () => session }, agents: { get: () => ({ id: 'session', session }) }, tools: { schemas: () => [] },
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'selected-provider', model: 'selected-model' } } } }) } },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }, { id: 'low' }] } }), stream: async function* (options) { calls.push(options); yield { type: 'reasoning-delta', index: 0, text: 'PRIVATE REASONING' }; yield { type: 'text-delta', index: 1, text: JSON.stringify(answer) }; yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 10 } }; yield { type: 'finish', reason: { kind: 'stop' } } } }
  }
  return { ctx, calls, events }
}
afterEach(() => vi.useRealTimers())

it('runs an independent short review with the parent selected model and no parent conversation mutation', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result).toMatchObject({ version: 1, issues: [], coveredBlockIds: ['a'], usage: { inputTokens: 30, outputTokens: 10 } })
  expect(f.calls[0]).toMatchObject({ provider: 'selected-provider', model: 'selected-model', reasoningEffort: 'low' })
  expect(f.calls[0].maxTokens).toBeLessThanOrEqual(3000)
  expect(f.calls[0].tools).toBeUndefined()
  expect(f.events).toEqual([])
  expect(JSON.stringify(result)).not.toContain('PRIVATE REASONING')
})

for (const text of ['这一段讨论写作方法，先提出观点，再解释理由。', '12 + 8 = 20，总数应为20。', '预计2026年项目收入50万元，用于场地和设备预算。']) it('omits unrelated consensus checks for an ordinary note: ' + text, async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const reviewed = await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text }] })
  expect(reviewed.checks).toEqual([expect.objectContaining({ kind: 'review', status: 'completed' })])
})

it('keeps an honest unavailable consensus check for a reliably extracted securities forecast with no actual source', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const reviewed = await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }] })
  expect(reviewed.issues).toEqual([])
  expect(reviewed.checks).toContainEqual(expect.objectContaining({ kind: 'consensus', status: 'unavailable' }))
})

it('reports a skipped consensus check only for clear securities annual forecast intent with missing comparison fields', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const reviewed = await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '600519.SH 预计2026年EPS 76元，但尚未明确报告基准日。' }] })
  expect(reviewed.issues).toEqual([])
  expect(reviewed.checks).toContainEqual(expect.objectContaining({ kind: 'consensus', status: 'skipped', detail: expect.stringContaining('基准日') }))
})

it('does not add a financial check to ordinary changed paragraphs because an uncovered section contains a forecast', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const reviewed = await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '先分析原因，再提出解决办法。' }, { id: 'b', type: 'paragraph', text: '600519.SH 预计2026年EPS 76元。' }] })
  expect(reviewed.coveredBlockIds).toEqual(['a'])
  expect(reviewed.checks.some(check => check.kind === 'consensus')).toBe(false)
})

it('only accepts unique target quotes and evidence whose actual note text is present', async () => {
  const { generateNoteChallenge } = await load()
  const valid = { blockId: 'a', quote: '收入增长10%', category: 'contradiction', message: '两处收入方向相反，请核对是否同一期间。', evidence: [{ kind: 'note', label: '另一段原文', blockId: 'b', quote: '收入减少10%' }] }
  const f = fixture({ issues: [valid, { ...valid, quote: '不存在' }, { ...valid, blockId: 'b', quote: '收入减少10%' }, { ...valid, evidence: [{ kind: 'note', label: '伪造', blockId: 'b', quote: '净利润增长' }] }, { ...valid, evidence: [{ kind: 'consensus', label: '模型捏造', data: { median: 1 } }] }] })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([valid])
  expect((await generateNoteChallenge(fixture({ issues: [{ ...valid, quote: '收入' }] }).ctx, { ...input, blocks: [{ ...input.blocks[0], text: '收入增长10%，收入减少10%。' }, input.blocks[1]] })).issues).toEqual([])
})

it('keeps unsupported factual verdicts out of comments and never accepts model-generated coverage or checks', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ issues: [{ blockId: 'a', quote: '收入增长10%', category: 'fact', message: '这是错的，真实收入增长20%。', evidence: [] }], coveredBlockIds: ['a', 'b', 'invented'], checks: [{ kind: 'consensus', status: 'completed', detail: '假数据已验证' }] })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(JSON.stringify(result)).not.toContain('假数据')
})

it('does not turn the unfinished current sentence into a grammar comment', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ issues: [{ blockId: 'a', quote: '预计收入将', category: 'grammar', message: '句子缺少宾语。', evidence: [] }] })
  expect((await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '上一句已完成。预计收入将' }], changedIds: ['a'] })).issues).toEqual([])
})

it('bounds batches and honestly reports unreviewed blocks instead of claiming full coverage', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  const blocks = Array.from({ length: 50 }, (_, n) => ({ id: 'block-' + n, type: 'paragraph', text: String(n).padStart(2, '0') + '正文'.repeat(3000) }))
  const result = await generateNoteChallenge(f.ctx, { ...input, blocks, changedIds: blocks.map(block => block.id) })
  expect(result.coveredBlockIds.length).toBeGreaterThan(0)
  expect(result.coveredBlockIds.length).toBeLessThan(50)
  expect(f.calls.length).toBeLessThanOrEqual(3)
  expect(f.calls.every(call => JSON.stringify(call.messages).length < 32000)).toBe(true)
  expect(result.checks.some(check => check.kind === 'review' && check.status === 'partial')).toBe(true)
})

it('returns optimize and reply suggestions only for a still-valid thread anchor without writing note text', async () => {
  const { generateNoteChallenge } = await load(), f = fixture({ reply: { text: '建议明确统计期间。', replacement: '本期收入增长10%。' } })
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'logic', message: '请说明期间。', messages: [{ role: 'user', text: '请优化' }] }
  expect(await generateNoteChallenge(f.ctx, { ...input, action: 'optimize', thread })).toMatchObject({ issues: [], reply: { text: '建议明确统计期间。', replacement: '本期收入增长10%。' } })
  expect(f.events).toEqual([])
  expect((await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread: { ...thread, messages: [{ role: 'user', text: '说明一下期间' }] } })).reply).toEqual({ text: '建议明确统计期间。' })
  await expect(generateNoteChallenge(f.ctx, { ...input, action: 'optimize', thread: { ...thread, quote: '已删除的原文' } })).rejects.toThrow('原文')
})

it('requests a natural short thread reply without logs and preserves an honest missing-source explanation', async () => {
  const { generateNoteChallenge } = await load(), f = fixture({ reply: { text: '目前没有可用的实际来源，无法核实这项判断。' } })
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'question', message: '请核对来源。', messages: [{ role: 'user', text: '依据是什么？' }] }
  const result = await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread })
  expect(f.calls[0].system).toContain('一两句自然语言')
  expect(f.calls[0].system).toContain('日志、工具')
  expect(result.reply).toEqual({ text: '目前没有可用的实际来源，无法核实这项判断。' })
  expect(JSON.stringify(result.reply)).not.toContain('PRIVATE REASONING')
})

it('continues a thread after an accepted 6000-character replacement becomes its exact quote', async () => {
  const { generateNoteChallenge } = await load(), quote = '首' + '文'.repeat(5998) + '尾'
  const answer = { reply: { text: '保留原立场，明确表述。', replacement: quote } }, f = fixture(answer)
  const original = { blockId: 'a', quote: '收入增长10%', category: 'logic', message: '请明确统计期间。', messages: [{ role: 'user', text: '请优化' }] }
  const optimized = await generateNoteChallenge(f.ctx, { ...input, action: 'optimize', thread: original })
  expect(optimized.reply.replacement).toBe(quote)
  const current = { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '原文：' + optimized.reply.replacement + '。' }] }, thread = { ...original, quote, messages: [{ role: 'user', text: '请继续说明这段的前提。' }] }
  answer.reply = { text: '这仍是基于原研究假设的表述。' }
  expect((await generateNoteChallenge(f.ctx, { ...current, action: 'reply', thread })).reply).toEqual({ text: '这仍是基于原研究假设的表述。' })
  answer.reply = { text: '只调整表达。', replacement: '在明确的前提下，收入预计增长10%。' }
  expect((await generateNoteChallenge(f.ctx, { ...current, action: 'optimize', thread })).reply.replacement).toBe('在明确的前提下，收入预计增长10%。')
  await expect(generateNoteChallenge(f.ctx, { ...current, action: 'reply', thread: { ...thread, quote: quote + '。' } })).rejects.toThrow('参数')
  await expect(generateNoteChallenge(f.ctx, { ...current, action: 'reply', thread: { ...thread, messages: Array.from({ length: 3 }, () => ({ role: 'user', text: '问'.repeat(4000) })) } })).rejects.toThrow('参数')
})

it('keeps newly generated issue quotes limited to 2000 characters even when follow-up anchors allow 6000', async () => {
  const { generateNoteChallenge } = await load(), quote = '首' + '文'.repeat(1999) + '尾'
  const f = fixture({ issues: [{ blockId: 'a', quote, category: 'question', message: '请核对假设。', evidence: [] }] })
  expect((await generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: quote }] })).issues).toEqual([])
})

it('offers a replacement in replies only when the latest user explicitly asks to rewrite', async () => {
  const { generateNoteChallenge } = await load(), f = fixture({ reply: { text: '保持预测立场，改清楚假设。', replacement: '在该假设下，本期收入预计增长10%。' } })
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'research', message: '解释假设差异。', messages: [{ role: 'user', text: '请把这段改写为条件预测' }] }
  expect((await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread })).reply.replacement).toBe('在该假设下，本期收入预计增长10%。')
  for (const text of ['不要改写，只讨论假设', '请说明为什么要改写', '这里和中值差异多少']) {
    expect((await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread: { ...thread, messages: [{ role: 'user', text }] } })).reply.replacement).toBeUndefined()
  }
  expect(f.calls[0].system).toContain('保留用户的研究立场')
  expect(f.calls[0].system).toContain('不得补造')
})

it('cancels an in-flight stream promptly, ignores late output, and replaces only the same note job', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), controller = new AbortController()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* () { started(); await new Promise(() => {}); yield { type: 'text-delta', text: '{}' } }
  const pending = generateNoteChallenge(f.ctx, input, controller.signal), rejected = expect(pending).rejects.toThrow()
  await ready; controller.abort(); await rejected
  expect(f.events).toEqual([])
})

it('coalesces simultaneous replacement requests so only the newest review starts', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  let start
  const ready = new Promise(resolve => { start = resolve })
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    if (f.calls.length === 1) { start(); await new Promise(() => {}) }
    yield { type: 'text-delta', text: '{"issues":[]}' }; yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const first = generateNoteChallenge(f.ctx, input), firstRejected = expect(first).rejects.toThrow()
  await ready
  const second = generateNoteChallenge(f.ctx, { ...input, requestId: 'second' }), secondRejected = expect(second).rejects.toThrow()
  const third = generateNoteChallenge(f.ctx, { ...input, requestId: 'third' })
  await firstRejected; await secondRejected
  expect((await third).coveredBlockIds).toEqual(['a'])
  expect(f.calls).toHaveLength(2)
})

it('requires note evidence for a logic verdict and degrades model metadata failures without changing selection', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ issues: [{ blockId: 'a', quote: '收入增长10%', category: 'logic', message: '这是错误数据。', evidence: [] }] })
  f.ctx.llm.resolveModelInfo = async () => { throw Error('metadata temporarily unavailable') }
  expect((await generateNoteChallenge(f.ctx, input)).issues).toEqual([])
  expect(f.calls[0]).toMatchObject({ provider: 'selected-provider', model: 'selected-model' })
})

it('enforces the 20 second normal deadline even if a provider does not settle on abort', async () => {
  vi.useFakeTimers()
  const { generateNoteChallenge } = await load(), f = fixture()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* () { started(); await new Promise(() => {}); yield { type: 'text-delta', text: '{}' } }
  const pending = generateNoteChallenge(f.ctx, input), rejected = expect(pending).rejects.toThrow(/超时|timeout/i)
  await ready; await vi.advanceTimersByTimeAsync(20001); await rejected
})

it('rejects truncated, oversized or tool-calling model output without exposing partial findings', async () => {
  const { generateNoteChallenge } = await load()
  for (const chunks of [
    [{ type: 'text-delta', text: '{"issues":[]}' }, { type: 'finish', reason: { kind: 'max-tokens' } }],
    [{ type: 'text-delta', text: 'x'.repeat(18000) }, { type: 'finish', reason: { kind: 'stop' } }],
    [{ type: 'block-end', block: { type: 'tool-call', id: 't', name: 'shell', arguments: '{}' } }, { type: 'finish', reason: { kind: 'stop' } }]
  ]) {
    const f = fixture(); f.ctx.llm.stream = async function* () { yield* chunks }
    await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow()
  }
})

it('rejects unknown or oversized input fields and performs no model call when disabled', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  await expect(generateNoteChallenge(f.ctx, { ...input, prompt: 'execute shell' })).rejects.toThrow('参数')
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks: [{ ...input.blocks[0], text: 'a'.repeat(13000) }] })).rejects.toThrow('参数')
  expect(await generateNoteChallenge(f.ctx, { ...input, level: 0 })).toMatchObject({ version: 1, issues: [], coveredBlockIds: [] })
  expect(f.calls).toEqual([])
})

it('closing challenge mode cancels an existing job and malformed output aborts its transport', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  let start, captured
  const ready = new Promise(resolve => { start = resolve })
  f.ctx.llm.stream = async function* (options) { captured = options.signal; start(); await new Promise(() => {}); yield { type: 'finish', reason: { kind: 'stop' } } }
  const pending = generateNoteChallenge(f.ctx, input), rejected = expect(pending).rejects.toThrow()
  await ready
  await generateNoteChallenge(f.ctx, { ...input, level: 0 })
  await rejected
  expect(captured.aborted).toBe(true)
  f.ctx.llm.stream = async function* (options) { captured = options.signal; yield { type: 'text-delta', text: 'x'.repeat(18000) } }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow()
  expect(captured.aborted).toBe(true)
})

it('registers a trusted bounded POST route with cancellation and a disposable lifetime', async () => {
  const { registerNotesChallenge } = await load(), f = fixture(); let route
  const unregister = vi.fn(); f.ctx.webServer = { register: value => { route = value; return unregister } }
  const dispose = registerNotesChallenge(f.ctx, { isTrustedRequest: request => request.trusted === true })
  expect(route).toMatchObject({ kind: 'exact', path: '/sherlock/notes/challenge' })
  function response() { const res = new EventEmitter(); res.writeHead = status => { res.status = status }; res.end = text => { res.body = JSON.parse(text); res.writableEnded = true }; return res }
  const rejected = response(); await route.handler({ method: 'POST' }, rejected); expect(rejected.status).toBe(403)
  const res = response(), req = Object.assign(new EventEmitter(), { method: 'POST', trusted: true, headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(input)) } })
  await route.handler(req, res)
  expect(res.status).toBe(200); expect(res.body).toMatchObject({ version: 1, issues: [] })
  dispose(); expect(unregister).toHaveBeenCalledOnce()
})
