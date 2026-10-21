import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'

const load = () => import('../packages/dsh-research-task-runtime/notes-challenge-runtime.js')
const input = { sessionId: 'session', requestId: 'review-1', action: 'review', level: 2, title: '分析', blocks: [{ id: 'a', type: 'paragraph', text: '收入增长10%。' }, { id: 'b', type: 'paragraph', text: '收入减少10%。' }], changedIds: ['a'] }
function fixture(answer) {
  const calls = [], events = [], session = { id: 'session', events }, ctx = {
    sessions: { get: () => session }, agents: { get: () => ({ id: 'session', session }) }, tools: { schemas: () => [] },
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'selected-provider', model: 'selected-model' } } } }) } },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }, { id: 'low' }] } }), stream: async function* (options) {
      calls.push(options)
      // Explicit no-issue acknowledgement for every supplied target in the new provider protocol.
      const payload = JSON.parse(options.messages[0].content[0].text)
      const value = answer ?? { reviews: payload.targets.map(block => ({ blockId: block.id, issues: [] })) }
      yield { type: 'reasoning-delta', index: 0, text: 'PRIVATE REASONING' }; yield { type: 'text-delta', index: 1, text: JSON.stringify(value) }; yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 10 } }; yield { type: 'finish', reason: { kind: 'stop' } }
    } }
  }
  return { ctx, calls, events }
}
function textFixture(text) {
  const f = fixture()
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    const current = Array.isArray(text) ? text[Math.min(f.calls.length - 1, text.length - 1)] : text
    yield { type: 'reasoning-delta', index: 0, text: 'PRIVATE REASONING' }
    for (let start = 0; start < current.length; start += 7) yield { type: 'text-delta', index: 1, text: current.slice(start, start + 7) }
    yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 10 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  return f
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
  const f = fixture({ reviews: [{ blockId: 'a', issues: [valid, { ...valid, quote: '不存在' }, { ...valid, blockId: 'b', quote: '收入减少10%' }, { ...valid, evidence: [{ kind: 'note', label: '伪造', blockId: 'b', quote: '净利润增长' }] }, { ...valid, evidence: [{ kind: 'consensus', label: '模型捏造', data: { median: 1 } }] }].map(item => ({ ...item, basis: 'note' })) }] })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([valid])
  expect((await generateNoteChallenge(fixture({ reviews: [{ blockId: 'a', issues: [{ ...valid, basis: 'note', quote: '收入' }] }] }).ctx, { ...input, blocks: [{ ...input.blocks[0], text: '收入增长10%，收入减少10%。' }, input.blocks[1]] })).issues).toEqual([])
})

it('keeps unsupported factual verdicts out of comments and never accepts model-generated coverage or checks', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ reviews: [{ blockId: 'a', issues: [{ quote: '收入增长10%', basis: 'general-knowledge', category: 'fact', message: '这是错的，真实收入增长20%。', evidence: [] }] }], coveredBlockIds: ['a', 'b', 'invented'], checks: [{ kind: 'consensus', status: 'completed', detail: '假数据已验证' }] })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(JSON.stringify(result)).not.toContain('假数据')
})

it('does not turn the unfinished current sentence into a grammar comment', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ reviews: [{ blockId: 'a', issues: [{ quote: '预计收入将', basis: 'note', category: 'grammar', message: '句子缺少宾语。', evidence: [] }] }] })
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

it('accepts one complete JSON code fence from a streamed thread reply while keeping private reasoning out', async () => {
  const { generateNoteChallenge } = await load()
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'question', message: '请核对来源。', messages: [{ role: 'user', text: '依据是什么？' }] }
  const f = textFixture('```json\n{"reply":{"text":"目前没有实际来源，不能核实这项判断。"}}\n```')
  const result = await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread })
  expect(result.reply).toEqual({ text: '目前没有实际来源，不能核实这项判断。' })
  expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 10 })
  expect(f.events).toEqual([])
  expect(JSON.stringify(result)).not.toContain('PRIVATE REASONING')
})

it('applies the existing exact-quote and evidence checks to a single fenced review object', async () => {
  const { generateNoteChallenge } = await load()
  const f = textFixture('```json\n{"reviews":[{"blockId":"a","issues":[{"quote":"收入增长10%","basis":"note","category":"question","message":"请确认统计期间。","evidence":[]},{"quote":"不存在","basis":"note","category":"question","message":"不应出现。","evidence":[]}]}],"coveredBlockIds":["a","b","invented"]}\n```')
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([{ blockId: 'a', quote: '收入增长10%', category: 'question', message: '请确认统计期间。', evidence: [] }])
  expect(result.coveredBlockIds).toEqual(['a'])
})

it('does not extract JSON from surrounding explanation, thinking tags, multiple fences or malformed envelopes', async () => {
  const { generateNoteChallenge } = await load()
  for (const text of [
    '解释：\n```json\n{"issues":[]}\n```',
    '```json\n{"issues":[]}\n```\n补充说明。',
    '<think>检查内容</think>\n{"issues":[]}',
    '```json\n{"issues":[]}\n```\n```json\n{"issues":[]}\n```',
    '```javascript\n{"issues":[]}\n```',
    '```json\n{"issues":[]}',
    '```json\n{"issues":[],}\n```',
    '{"issues":[]}\n{"issues":[]}'
  ]) await expect(generateNoteChallenge(textFixture(text).ctx, input)).rejects.toThrow('格式无效')
})

it('retries one malformed stop response on the same route without repairing it or exposing the partial reply', async () => {
  const { generateNoteChallenge } = await load()
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'question', message: '请核对来源。', messages: [{ role: 'user', text: '依据是什么？' }] }
  // Captured GLM behavior: both deltas and block-end finish normally but omit the outer brace.
  const f = textFixture(['{"reply":{"text":"不得展示的未闭合结果。"}', '{"reply":{"text":"目前没有实际来源，不能核实这项判断。"}}'])
  const result = await generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread })
  expect(result.reply).toEqual({ text: '目前没有实际来源，不能核实这项判断。' })
  expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 20 })
  expect(f.calls).toHaveLength(2)
  expect(f.calls[1]).toMatchObject({ provider: 'selected-provider', model: 'selected-model', maxTokens: 2400, reasoningEffort: 'low', messages: f.calls[0].messages })
  expect(f.calls[1].system).not.toContain('不得展示的未闭合结果')
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE REASONING|不得展示的未闭合结果/u)
  expect(f.events).toEqual([])
})

it('caps malformed-result recovery at one retry and never treats a private reasoning block as a JSON result', async () => {
  const { generateNoteChallenge } = await load()
  for (const text of ['{"issues":[]', '']) {
    const f = textFixture(text)
    await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('格式无效')
    expect(f.calls).toHaveLength(2)
    expect(f.events).toEqual([])
  }
})

it('does not retry output-size, tool-call or non-stop completion failures', async () => {
  const { generateNoteChallenge } = await load()
  for (const chunks of [
    [{ type: 'text-delta', index: 0, text: '{"issues":[]}' }, { type: 'finish', reason: { kind: 'max-tokens' } }],
    [{ type: 'text-delta', index: 0, text: 'x'.repeat(18000) }, { type: 'finish', reason: { kind: 'stop' } }],
    [{ type: 'block-end', index: 0, block: { type: 'tool-call', id: 't', name: 'shell', arguments: '{}' } }, { type: 'finish', reason: { kind: 'stop' } }]
  ]) {
    const f = fixture(); f.ctx.llm.stream = async function* (options) { f.calls.push(options); yield* chunks }
    await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow()
    expect(f.calls).toHaveLength(1)
  }
})

it('does not retry a syntactically valid result that fails the reply schema', async () => {
  const { generateNoteChallenge } = await load(), f = textFixture('{"reply":{}}')
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'question', message: '请核对来源。', messages: [{ role: 'user', text: '依据是什么？' }] }
  await expect(generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread })).rejects.toThrow('格式不完整')
  expect(f.calls).toHaveLength(1)
})

it('shares the original output size limit across a malformed response and its retry', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    yield { type: 'text-delta', index: 0, text: f.calls.length === 1 ? '{"issues":[]' + ' '.repeat(15980) : '{"issues":[]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('输出过长')
  expect(f.calls).toHaveLength(2)
})

it('counts block-end-only visible text toward the shared retry output limit', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    yield { type: 'block-end', index: 0, block: { type: 'text', text: f.calls.length === 1 ? '{"issues":[]' + ' '.repeat(15988) : '{"issues":[]}' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('输出过长')
  expect(f.calls).toHaveLength(2)
})

it('does not double count matching text deltas and block-end snapshots', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    const text = f.calls.length === 1 ? '{"issues":[]' + ' '.repeat(8988) : '{"reviews":[{"blockId":"a","issues":[]}]}'
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  expect((await generateNoteChallenge(f.ctx, input)).issues).toEqual([])
  expect(f.calls).toHaveLength(2)
})

it('keeps a format retry inside the original 20 second budget', async () => {
  vi.useFakeTimers()
  const { generateNoteChallenge } = await load(), f = fixture()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options); started()
    if (f.calls.length === 1) {
      await new Promise(resolve => setTimeout(resolve, 12000))
      yield { type: 'text-delta', index: 0, text: '{"issues":[]' }; yield { type: 'finish', reason: { kind: 'stop' } }
    } else { await new Promise(() => {}) }
  }
  const observed = generateNoteChallenge(f.ctx, input).then(() => null, error => error)
  await ready; await vi.advanceTimersByTimeAsync(20001)
  expect((await observed).message).toMatch(/超时|timeout/iu)
  expect(f.calls).toHaveLength(2)
})

it('does not start a format retry after cancellation or a provider error', async () => {
  const { generateNoteChallenge } = await load()
  for (const kind of ['abort', 'provider']) {
    const f = fixture(), controller = new AbortController()
    f.ctx.llm.stream = async function* (options) {
      f.calls.push(options)
      if (kind === 'provider') throw Error('provider unavailable')
      yield { type: 'text-delta', index: 0, text: '{"issues":[]' }
      controller.abort(new Error('cancelled'))
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    await expect(generateNoteChallenge(f.ctx, input, controller.signal)).rejects.toThrow(kind === 'provider' ? 'provider unavailable' : 'cancelled')
    expect(f.calls).toHaveLength(1)
  }
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
  const f = fixture({ reviews: [{ blockId: 'a', issues: [{ quote, basis: 'note', category: 'question', message: '请核对假设。', evidence: [] }] }] })
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
    yield { type: 'text-delta', text: '{"reviews":[{"blockId":"a","issues":[]}]}' }; yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const first = generateNoteChallenge(f.ctx, input), firstRejected = expect(first).rejects.toThrow()
  await ready
  const second = generateNoteChallenge(f.ctx, { ...input, requestId: 'second' }), secondRejected = expect(second).rejects.toThrow()
  const third = generateNoteChallenge(f.ctx, { ...input, requestId: 'third' })
  await firstRejected; await secondRejected
  expect((await third).coveredBlockIds).toEqual(['a'])
  expect(f.calls).toHaveLength(2)
})

it('downgrades an unsupported logic verdict to an unverified question and tolerates metadata failures without changing selection', async () => {
  const { generateNoteChallenge } = await load()
  const f = fixture({ reviews: [{ blockId: 'a', issues: [{ quote: '收入增长10%', basis: 'note', category: 'logic', message: '这是错误数据。', evidence: [] }] }] })
  f.ctx.llm.resolveModelInfo = async () => { throw Error('metadata temporarily unavailable') }
  expect((await generateNoteChallenge(f.ctx, input)).issues).toEqual([{ blockId: 'a', quote: '收入增长10%', category: 'uncertain', message: '常识疑问（未联网核验）：是否需要核对这一说法？这是错误数据。', evidence: [] }])
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

it('returns replacement text for explicit direct editing requests, but never treats a discussion question as editing authorization',async()=>{
 const{generateNoteChallenge}=await load(),f=fixture({reply:{text:'调整用字。',replacement:'本期收入增长10%。'}})
 const thread={blockId:'a',quote:'收入增长10%',category:'grammar',message:'请明确表达。',messages:[]}
 for(const text of ['请直接修改原文','现在就把这段替换成清晰的表达','请帮我直接改写这段','不用问我，直接修改原文','请替换到原文','你直接帮我改好替换上去','不用解释，直接替换到原文','不要解释，直接替换','现在就把原文改为程度','可以帮我直接改好','可以帮我改好吗？','替换一下'])expect((await generateNoteChallenge(f.ctx,{...input,action:'reply',thread:{...thread,messages:[{role:'user',text}]}})).reply.replacement).toBe('本期收入增长10%。')
 for(const text of ['不要直接修改原文','请解释为什么直接修改原文','能否说明改写的原因'])expect((await generateNoteChallenge(f.ctx,{...input,action:'reply',thread:{...thread,messages:[{role:'user',text}]}})).reply.replacement).toBeUndefined()
})

it('keeps consequence inquiries as preview-capable replies without weakening the shared execution predicate',async()=>{
 const{generateNoteChallenge}=await load(),f=fixture({reply:{text:'建议先保留格式。',replacement:'本期收入增长10%。'}})
 for(const text of ['直接修改原文会丢格式吗？','直接替换原文会影响已有评论吗？','直接修改原文能保留格式吗？','直接替换原文有格式丢失的问题吗？','修改建议看起来很生硬']){
  const thread={blockId:'a',quote:'收入增长10%',category:'grammar',message:'请明确表达。',messages:[{role:'user',text}]}
  expect((await generateNoteChallenge(f.ctx,{...input,action:'reply',thread})).reply.replacement).toBe('本期收入增长10%。')
 }
})
