import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

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

it('uses review anchor context only for current targets without changing independent findings', async () => {
  const { generateNoteChallenge } = await load(), f = fixture({ reviews: [{ blockId: 'a', issues: [
    { quote: '收入增长10%', category: 'question', basis: 'note', message: '请确认统计期间。', evidence: [] },
    { quote: '增长10%', category: 'question', basis: 'note', message: '请说明计算基准。', evidence: [] }
  ] }] })
  const existingAnchors = [{ blockId: 'a', quote: '收入' }, { blockId: 'b', quote: '收入减少10%' }]
  const result = await generateNoteChallenge(f.ctx, { ...input, existingAnchors })
  expect(JSON.parse(f.calls[0].messages[0].content[0].text).existingAnchors).toEqual([existingAnchors[0]])
  expect(result.issues.map(issue => issue.quote)).toEqual(['收入增长10%', '增长10%'])
  expect(result.coveredBlockIds).toEqual(['a'])
  expect(f.events).toEqual([])
})

it('rejects invalid review anchor context before calling a provider', async () => {
  const { generateNoteChallenge } = await load(), f = fixture()
  for (const existingAnchors of [null, {}, [{ blockId: 'a', quote: '不存在' }], [{ blockId: 'unknown', quote: '收入' }], [{ blockId: 'a', quote: '收入', text: 'PRIVATE' }], [{ blockId: 'a', quote: '收入' }, { blockId: 'a', quote: '收入' }]]) {
    await expect(generateNoteChallenge(f.ctx, { ...input, existingAnchors })).rejects.toThrow('参数无效')
  }
  const blocks = Array.from({ length: 65 }, (_, n) => ({ id: String(n), type: 'paragraph', text: '段落' + n + '。' }))
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks, changedIds: blocks.map(b => b.id), existingAnchors: blocks.map(b => ({ blockId: b.id, quote: b.text })) })).rejects.toThrow('参数无效')
  const long = Array.from({ length: 6 }, (_, n) => ({ id: String(n), type: 'paragraph', text: String(n) + '文'.repeat(1499) }))
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks: long, changedIds: long.map(b => b.id), existingAnchors: long.map(b => ({ blockId: b.id, quote: b.text })) })).rejects.toThrow('参数无效')
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '收入收入。' }], existingAnchors: [{ blockId: 'a', quote: '收入' }] })).rejects.toThrow('参数无效')
  const oversizedQuote = '文'.repeat(2001)
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks: [{ id: 'a', type: 'paragraph', text: oversizedQuote }], existingAnchors: [{ blockId: 'a', quote: oversizedQuote }] })).rejects.toThrow('参数无效')
  const thread = { blockId: 'a', quote: '收入增长10%', category: 'question', message: '期间？', messages: [] }
  await expect(generateNoteChallenge(f.ctx, { ...input, action: 'reply', thread, existingAnchors: [{ blockId: 'a', quote: '收入' }] })).rejects.toThrow('参数无效')
  expect(f.calls).toHaveLength(0)
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

it('reports only bounded validation counts when every provider candidate is discarded', async () => {
  const { generateNoteChallenge } = await load(), warn = vi.mocked(console.warn)
  const candidate = { quote: '收入增长10%', basis: 'general-knowledge', category: 'fact', message: 'PRIVATE-MODEL-NOTE-TEXT', evidence: [] }
  const f = fixture({ reviews: [{ blockId: 'a', issues: [candidate, { ...candidate, category: 'research' }, { ...candidate, category: 'PRIVATE-CATEGORY', basis: 'PRIVATE-BASIS' }, { ...candidate, category: 'uncertain', quote: 'PRIVATE-INVALID-QUOTE' }] }] })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.issues).toEqual([])
  expect(warn).toHaveBeenCalledTimes(2)
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: 'notes-challenge-review-identity', mode: 'block-id' })
  const logged = warn.mock.calls[1][0], report = JSON.parse(logged)
  expect(report).toMatchObject({ event: 'notes-challenge-review-filtered', candidates: 4, accepted: 0, categories: { fact: 1, research: 1, other: 1, uncertain: 1 }, bases: { 'general-knowledge': 3, other: 1 }, uniqueAnchors: 3, emptyEvidence: 4, acknowledgedAgreement: 0 })
  expect(report.requestKey).toMatch(/^[a-f0-9]{12}$/u)
  for (const privateText of ['PRIVATE-', input.requestId, input.sessionId, input.blocks[0].text]) expect(logged).not.toContain(privateText)
  expect(f.events).toEqual([])
})

it('does not emit filtered-candidate diagnostics for an ordinary empty review or let a logging failure break a review', async () => {
  const { generateNoteChallenge } = await load(), warn = vi.mocked(console.warn)
  const empty = fixture()
  expect((await generateNoteChallenge(empty.ctx, input)).issues).toEqual([])
  expect(warn).toHaveBeenCalledTimes(1)
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: 'notes-challenge-review-identity', mode: 'block-id' })
  const rejected = fixture({ reviews: [{ blockId: 'a', issues: [{ quote: '收入增长10%', basis: 'general-knowledge', category: 'fact', message: '请核对。', evidence: [] }] }] })
  warn.mockImplementation(text => { if (String(text).includes('notes-challenge-review-filtered')) throw Error('logger unavailable') })
  expect((await generateNoteChallenge(rejected.ctx, input)).issues).toEqual([])
})

for (const kind of ['tool-call', 'payload-limit']) it('diagnoses '+kind+' stream rejection with only bounded counts', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), warn = vi.mocked(console.warn)
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    if (kind === 'tool-call') yield { type: 'tool-call-start', id: 'PRIVATE-TOOL-ID', name: 'PRIVATE-TOOL-NAME' }
    else yield { type: 'reasoning-delta', index: 0, text: '秘密'.repeat(50001) }
  }
  await expect(generateNoteChallenge(f.ctx, { ...input, requestId: 'PRIVATE-REQUEST-ID', title: 'PRIVATE-NOTE-TITLE' })).rejects.toThrow('挑战检查返回内容超出边界')
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].signal.aborted).toBe(true)
  expect(warn).toHaveBeenCalledTimes(1)
  const logged = warn.mock.calls[0][0], report = JSON.parse(logged)
  expect(report).toMatchObject({ event: 'notes-challenge-stream-rejected', reason: kind, attempt: 1, action: 'review', textDeltaChars: 0, textSnapshotChars: 0, reasoningSnapshotChars: 0 })
  expect(report.requestKey).toMatch(/^[a-f0-9]{12}$/u)
  if (kind === 'tool-call') expect(report.eventCounts).toEqual({ 'tool-call-start': 1 })
  else {
    expect(report.serializedChars).toBeGreaterThan(100000)
    expect(report.payloadChars).toBeGreaterThan(100000)
    expect(report.reasoningDeltaChars).toBeGreaterThan(100000)
    expect(report.eventCounts['reasoning-delta']).toBe(1)
  }
  for (const text of ['PRIVATE', '秘密', input.sessionId, input.blocks[0].text]) expect(logged).not.toContain(text)
  expect(logged.length).toBeLessThan(800)
  expect(f.events).toEqual([])
})

it('keeps rejection diagnostics cumulative across format regeneration and preserves failure if logging throws', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), warn = vi.mocked(console.warn)
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    yield { type: 'reasoning-delta', index: 0, text: '秘'.repeat(60000) }
    yield { type: 'text-delta', index: 1, text: '{"issues":[]' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('挑战检查返回内容超出边界')
  expect(f.calls).toHaveLength(2)
  const reports = warn.mock.calls.map(([text]) => JSON.parse(text))
  expect(reports.map(report => report.event)).toEqual(['notes-challenge-format-rejected', 'notes-challenge-stream-rejected'])
  const report = reports[1]
  expect(report).toMatchObject({ reason: 'payload-limit', attempt: 2, textDeltaChars: 12 })
  expect(report.payloadChars).toBeGreaterThan(100000)
  expect(report.eventCounts['reasoning-delta']).toBe(2)
  expect(f.calls.every(call => call.signal.aborted)).toBe(true)
  const broken = fixture(); warn.mockImplementationOnce(() => { throw Error('PRIVATE-LOGGER-FAILURE') })
  broken.ctx.llm.stream = async function* () { yield { type: 'tool-call', name: 'PRIVATE-TOOL' } }
  await expect(generateNoteChallenge(broken.ctx, input)).rejects.toThrow('挑战检查返回内容超出边界')
})

it('accepts a fragmented short review across format recovery without charging repeated delta envelopes as content', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), warn = vi.mocked(console.warn)
  const texts = ['{"reviews":' + ' '.repeat(1500), JSON.stringify({ reviews: [{ blockId: 'a', issues: [] }] }) + ' '.repeat(1000)]
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    const reasoning = 'PRIVATE REASONING '.repeat(20), text = texts[f.calls.length - 1]
    for (const char of reasoning) yield { type: 'reasoning-delta', index: 0, text: char }
    yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } }
    for (const char of text) yield { type: 'text-delta', index: 1, text: char }
    yield { type: 'block-end', index: 1, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result).toMatchObject({ issues: [], coveredBlockIds: ['a'] })
  expect(f.calls).toHaveLength(2)
  expect(f.calls.every(call => call.signal.aborted)).toBe(true)
  expect(warn).toHaveBeenCalledTimes(2)
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event:'notes-challenge-format-rejected', reason:'json-invalid', attempt:1 })
  expect(JSON.parse(warn.mock.calls[1][0])).toMatchObject({ event:'notes-challenge-review-identity', mode:'block-id', attempt:2 })
  expect(JSON.stringify(result)).not.toContain('PRIVATE')
})

for (const [kind, chunk] of [
  ['additional delta metadata', { type: 'reasoning-delta', index: 0, text: '', privateMetadata: 'PRIVATE'.repeat(17000) }],
  ['reasoning snapshot', { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'PRIVATE'.repeat(17000) } }],
  ['finish replay state', { type: 'finish', reason: { kind: 'stop' }, replayState: { response: 'PRIVATE'.repeat(17000) } }],
  ['unknown event', { type: 'private-provider-event', text: 'PRIVATE'.repeat(17000) }],
  ['invalid delta index', { type: 'reasoning-delta', index: 'PRIVATE'.repeat(17000), text: '' }],
  ['JSON escaped payload', { type: 'reasoning-delta', index: 0, text: '\n'.repeat(50001) }]
]) it('still bounds '+kind+' after discounting fixed delta envelopes', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), warn = vi.mocked(console.warn)
  f.ctx.llm.stream = async function* (options) { f.calls.push(options); yield chunk }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('挑战检查返回内容超出边界')
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].signal.aborted).toBe(true)
  expect(warn).toHaveBeenCalledTimes(1)
  const report = JSON.parse(warn.mock.calls[0][0])
  expect(report).toMatchObject({ reason: 'payload-limit', attempt: 1, eventCount: 1 })
  expect(report.payloadChars).toBeGreaterThan(100000)
  expect(warn.mock.calls[0][0]).not.toContain('PRIVATE')
})

it('bounds empty-delta work cumulatively across the one format recovery', async () => {
  const { generateNoteChallenge } = await load(), f = fixture(), warn = vi.mocked(console.warn)
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options)
    for (let n = 0; n < 16400; n++) yield { type: 'reasoning-delta', index: 0, text: '' }
    yield { type: 'text-delta', index: 1, text: '{"reviews":' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('挑战检查返回内容超出边界')
  expect(f.calls).toHaveLength(2)
  expect(f.calls.every(call => call.signal.aborted)).toBe(true)
  const reports = warn.mock.calls.map(([text]) => JSON.parse(text))
  expect(reports.map(report => report.event)).toEqual(['notes-challenge-format-rejected', 'notes-challenge-stream-rejected'])
  const report = reports[1]
  expect(report).toMatchObject({ reason: 'event-limit', attempt: 2, eventCount: 32769 })
  expect(report.payloadChars).toBeLessThan(1000)
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

for (const [value, expected] of [
  [{ privateField: 'PRIVATE-MODEL-TEXT' }, { valueKind: 'object', reviewsKind: 'missing', reviewCount: 0, unreviewedTargets: 2 }],
  [{ reviews: { 'PRIVATE-ID': [] } }, { valueKind: 'object', reviewsKind: 'object', reviewCount: 0, unreviewedTargets: 2 }],
  [null, { valueKind: 'null', reviewsKind: 'missing', reviewCount: 0, unreviewedTargets: 2 }],
  [[{ blockId: 'PRIVATE-ID' }], { valueKind: 'array', reviewsKind: 'missing', reviewCount: 0, unreviewedTargets: 2 }],
  [{ reviews: [null, { blockId: 'PRIVATE-ID', issues: { text: 'PRIVATE-TEXT' } }, { blockId: 'a', issues: [], 'PRIVATE-FIELD': 'PRIVATE-VALUE' }, { blockId: 'a', issues: [] }] }, { valueKind: 'object', reviewsKind: 'array', reviewCount: 4, nonObjectReviews: 1, unexpectedReviewFields: 1, unknownBlockIds: 1, duplicateBlockIds: 1, nonArrayIssues: 1, unreviewedTargets: 1 }]
]) it('reports private-safe review format diagnostics for '+JSON.stringify(expected), async () => {
  const { generateNoteChallenge } = await load(), f = textFixture(JSON.stringify(value)), warn = vi.mocked(console.warn)
  await expect(generateNoteChallenge(f.ctx, { ...input, requestId: 'PRIVATE-REQUEST', changedIds: ['a', 'b'], existingAnchors: [{ blockId: 'a', quote: '收入' }] })).rejects.toThrow('格式不完整')
  expect(f.calls).toHaveLength(2)
  const reports = warn.mock.calls.map(([text]) => JSON.parse(text))
  expect(reports).toHaveLength(2)
  for (const [index, report] of reports.entries()) {
    expect(report).toMatchObject({ event: 'notes-challenge-format-rejected', action: 'review', reason: 'review-envelope', attempt: index + 1, targetCount: 2, anchorCount: 1, ...expected })
    expect(report.requestKey).toMatch(/^[a-f0-9]{12}$/u)
    expect(report.jsonChars).toBe(JSON.stringify(value).length)
    expect(Object.keys(report).sort()).toEqual(['event','requestKey','action','reason','attempt','jsonChars','targetCount','anchorCount','identityMode','valueKind','reviewsKind','reviewCount','nonObjectReviews','unexpectedReviewFields','unknownBlockIds','duplicateBlockIds','nonArrayIssues','unreviewedTargets','unknownTitleIds','unknownContextIds','unknownNearTargetIds','unknownEmptyGroups','unknownNonStringIds'].sort())
    const text = JSON.stringify(report)
    for (const privateText of ['PRIVATE', input.sessionId, input.blocks[0].text, '收入']) expect(text).not.toContain(privateText)
    expect(text.length).toBeLessThan(700)
  }
  expect(f.events).toEqual([])
})

it('reports JSON format failure counts without logging content or changing a successful recovery', async () => {
  const { generateNoteChallenge } = await load(), bad = '{"PRIVATE-SECRET":"', f = textFixture([bad, '{"reviews":[{"blockId":"a","issues":[]}]}']), warn = vi.mocked(console.warn)
  expect((await generateNoteChallenge(f.ctx, input)).coveredBlockIds).toEqual(['a'])
  expect(f.calls).toHaveLength(2)
  expect(warn).toHaveBeenCalledTimes(2)
  expect(JSON.parse(warn.mock.calls[0][0])).toEqual({ event:'notes-challenge-format-rejected', action:'review', reason:'json-invalid', attempt:1, targetCount:1, anchorCount:0, jsonChars:bad.length, requestKey:expect.stringMatching(/^[a-f0-9]{12}$/u) })
  expect(JSON.parse(warn.mock.calls[1][0])).toMatchObject({ event:'notes-challenge-review-identity', mode:'block-id', attempt:2 })
  expect(f.calls[1].system).not.toContain('PRIVATE')
})

it('keeps format recovery and terminal rejection unchanged if its diagnostic sink throws', async () => {
  const { generateNoteChallenge } = await load(), warn = vi.mocked(console.warn)
  warn.mockImplementation(text => { if (typeof text === 'string' && text.includes('notes-challenge-format-rejected')) throw Error('PRIVATE-LOGGER') })
  const recovery = textFixture(['{"PRIVATE":"', '{"reviews":[{"blockId":"a","issues":[]}]}'])
  expect((await generateNoteChallenge(recovery.ctx, input)).coveredBlockIds).toEqual(['a'])
  const rejected = textFixture('{"PRIVATE":"')
  await expect(generateNoteChallenge(rejected.ctx, input)).rejects.toThrow('格式无效')
  expect(recovery.calls).toHaveLength(2); expect(rejected.calls).toHaveLength(2)
  expect(warn.mock.calls.filter(([text]) => String(text).includes('notes-challenge-format-rejected'))).toHaveLength(3)
})

it('preserves every valid target review in one call while discarding extra unknown groups', async () => {
  const { generateNoteChallenge } = await load(), warn = vi.mocked(console.warn)
  const valid = { quote:'收入增长10%', basis:'note', category:'question', message:'请确认统计期间。', evidence:[] }
  const foreign = { ...valid, message:'PRIVATE-FOREIGN', quote:'收入减少10%' }
  const f = fixture({ reviews:[{blockId:'a',issues:[valid,{...valid,quote:'PRIVATE-MISSING'},{...valid,category:'fact'}]},{blockId:'PRIVATE-EXTERNAL-1',issues:[foreign]},{blockId:'b',issues:[]},{blockId:'PRIVATE-EXTERNAL-2',issues:[foreign]}] })
  const result = await generateNoteChallenge(f.ctx,{...input,changedIds:['a','b']})
  expect(result.issues).toEqual([{blockId:'a',quote:valid.quote,category:valid.category,message:valid.message,evidence:[]}])
  expect(result.coveredBlockIds).toEqual(['a','b']);expect(result.checks[0].status).toBe('completed')
  expect(f.calls).toHaveLength(1);expect(f.events).toEqual([])
  expect(warn).toHaveBeenCalledTimes(2)
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({event:'notes-challenge-review-identity',mode:'block-id'})
  const logged=warn.mock.calls[1][0]
  expect(JSON.parse(logged)).toEqual({event:'notes-challenge-review-extra-groups',action:'review',attempt:1,targetCount:2,reviewCount:4,ignoredGroups:2,unknownTitleIds:0,unknownContextIds:0,unknownNearTargetIds:0,unknownEmptyGroups:0,unknownNonStringIds:0,requestKey:expect.stringMatching(/^[a-f0-9]{12}$/u)})
  for(const privateText of ['PRIVATE',input.requestId,input.sessionId,input.blocks[0].text])expect(logged).not.toContain(privateText)
})

it('does not treat discarded foreign candidates as filtered target candidates or let diagnostic failure reject valid targets', async () => {
  const { generateNoteChallenge } = await load(), warn=vi.mocked(console.warn)
  const f=fixture({reviews:[{blockId:'a',issues:[]},{blockId:'PRIVATE-EXTERNAL',issues:[{quote:'收入增长10%',category:'fact',basis:'general-knowledge',message:'PRIVATE-TEXT',evidence:[]}]}]})
  const result=await generateNoteChallenge(f.ctx,input)
  expect(result).toMatchObject({issues:[],coveredBlockIds:['a']});expect(f.calls).toHaveLength(1)
  expect(warn).toHaveBeenCalledTimes(2);expect(JSON.parse(warn.mock.calls[0][0]).event).toBe('notes-challenge-review-identity');expect(JSON.parse(warn.mock.calls[1][0]).event).toBe('notes-challenge-review-extra-groups')
  warn.mockImplementation(text=>{if(String(text).includes('notes-challenge-review-extra-groups'))throw Error('PRIVATE-LOGGER')})
  const again=await generateNoteChallenge(f.ctx,{...input,requestId:'another'})
  expect(again).toMatchObject({issues:[],coveredBlockIds:['a']});expect(f.calls).toHaveLength(2)
})

it('still rejects incomplete targets, duplicate IDs and malformed extra groups without silently projecting them', async () => {
  const { generateNoteChallenge } = await load(), base=[{blockId:'a',issues:[]},{blockId:'b',issues:[]}],foreign={blockId:'PRIVATE-EXTERNAL',issues:[]}
  for(const reviews of [[base[0],foreign],[...base,base[0]],[...base,foreign,foreign],[...base,{...foreign,'PRIVATE-KEY':'PRIVATE-TEXT'}],[...base,{...foreign,issues:{}}],[...base,{...foreign,blockId:{private:'PRIVATE'}}],[...base,{...foreign,blockId:''}],[...base,{...foreign,blockId:'bad\nID'}]]){
    const f=fixture({reviews})
    await expect(generateNoteChallenge(f.ctx,{...input,changedIds:['a','b']})).rejects.toThrow('格式不完整')
    expect(f.calls).toHaveLength(2);expect(f.events).toEqual([])
  }
})

it('regenerates a malformed review envelope once without reusing its contents or bypassing issue validation', async () => {
  const { generateNoteChallenge } = await load()
  const valid = { quote: '收入增长10%', basis: 'note', category: 'question', message: '请确认统计期间。', evidence: [] }
  for (const malformed of [{ issues: [], message: 'PRIVATE BAD ENVELOPE' }, { reviews: [{ blockId: 'invented', issues: [] }] }, { reviews: [{ blockId: 'a', issues: {} }] }]) {
    const f = textFixture([JSON.stringify(malformed), JSON.stringify({ reviews: [{ blockId: 'a', issues: [valid, { ...valid, quote: '不存在' }, { ...valid, category: 'fact', message: '模型捏造事实' }] }] })])
    const result = await generateNoteChallenge(f.ctx, input)
    expect(result.issues).toEqual([{ blockId: 'a', quote: valid.quote, category: valid.category, message: valid.message, evidence: [] }])
    expect(result.coveredBlockIds).toEqual(['a'])
    expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 20 })
    expect(f.calls).toHaveLength(2)
    expect(f.calls[1]).toMatchObject({ provider: 'selected-provider', model: 'selected-model', maxTokens: 3000, reasoningEffort: 'low', messages: f.calls[0].messages })
    expect(f.calls[1].system).not.toContain('PRIVATE BAD ENVELOPE')
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|不存在|模型捏造事实/u)
    expect(f.events).toEqual([])
  }
})

it('shares one regeneration allowance between JSON syntax and review structure failures', async () => {
  const { generateNoteChallenge } = await load()
  for (const answers of [['{"reviews":', '{"issues":[]}'], ['{"issues":[]}', '{"reviews":'], ['{"reviews":[{"blockId":"a","issues":{}}]}', '{"issues":[]}']]) {
    const f = textFixture(answers)
    await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('格式')
    expect(f.calls).toHaveLength(2)
    expect(f.events).toEqual([])
  }
})

it('does not regenerate valid empty, partial or all-filtered review results', async () => {
  const { generateNoteChallenge } = await load()
  for (const answer of [{ reviews: [] }, { reviews: [{ blockId: 'a', issues: [] }] }, { reviews: [{ blockId: 'a', issues: [{ quote: '收入增长10%', basis: 'general-knowledge', category: 'fact', message: '模型捏造事实', evidence: [] }] }] }]) {
    const f = fixture(answer), result = await generateNoteChallenge(f.ctx, input)
    expect(result.issues).toEqual([])
    expect(result.coveredBlockIds).toEqual(answer.reviews.map(review => review.blockId))
    expect(f.calls).toHaveLength(1)
  }
})

it('keeps review structure regeneration inside the original model deadline', async () => {
  vi.useFakeTimers()
  const { generateNoteChallenge } = await load(), f = fixture()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options); started()
    if (f.calls.length === 1) {
      await new Promise(resolve => setTimeout(resolve, 12000))
      yield { type: 'text-delta', index: 0, text: '{"issues":[]}' }; yield { type: 'finish', reason: { kind: 'stop' } }
    } else await new Promise(() => {})
  }
  const observed = generateNoteChallenge(f.ctx, input).then(() => null, error => error)
  await ready; await vi.advanceTimersByTimeAsync(20001)
  expect((await observed).message).toMatch(/超时|timeout/iu)
  expect(f.calls).toHaveLength(2)
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
  const current = { ...input, blocks: [{ id: 'a', type: 'paragraph', text: '前句。' + optimized.reply.replacement }] }, thread = { ...original, quote, messages: [{ role: 'user', text: '请继续说明这段的前提。' }] }
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

for(const text of ['请把建议改为“更谨慎的表达”','请把这条评论改为“是否需要核对”','请把原文改为“程度”的理由说明一下','请把原文改为“程度”的方案给我看看','请把收入增长替换为收入增加'])it('keeps assignment discussions preview-capable using the current anchor: '+text,async()=>{
 const{generateNoteChallenge}=await load(),f=fixture({reply:{text:'模型声称已修改原文',replacement:'本期收入增加10%。'}})
 const thread={blockId:'a',quote:'收入增长10%',category:'grammar',message:'请明确表达。',messages:[{role:'user',text}]}
 expect((await generateNoteChallenge(f.ctx,{...input,action:'reply',thread})).reply.replacement).toBe('本期收入增加10%。')
 expect(JSON.parse(f.calls[0].messages[0].content[0].text).allowReplacement).toBe(true)
})

it('constructs a host sentence replacement scope while retaining the captured issue quote as intent context',async()=>{
 const {generateNoteChallenge}=await load(),source='20名参与者中有15人完成任务，因此完成率为90%。',quote='20名参与者中有15人完成任务',replacement='20名参与者中有15人完成任务，因此完成率为75%。'
 const f=fixture({reply:{text:'完成率应为75%。',replacement}}),thread={blockId:'a',quote,category:'logic',message:'完成率是否需要核对？',messages:[{role:'user',text:'直接修改原文'}]}
 const result=await generateNoteChallenge(f.ctx,{...input,action:'reply',blocks:[{id:'a',type:'paragraph',text:source}],thread})
 const payload=JSON.parse(f.calls[0].messages[0].content[0].text)
 expect(payload.thread).toMatchObject({quote,replacementQuote:source})
 expect(payload.allowReplacement).toBe(true)
 expect(f.calls[0].system).toContain('thread.replacementQuote')
 expect(result.reply).toEqual({text:'完成率应为75%。',replacement})
 expect(f.calls).toHaveLength(1)
})

it('rejects oversized editing sentences before model invocation but still permits a text-only discussion',async()=>{
 const {generateNoteChallenge}=await load(),text='文'.repeat(6000)+'问题。',thread={blockId:'a',quote:'问题',category:'logic',message:'请核对',messages:[{role:'user',text:'直接修改原文'}]},f=fixture({reply:{text:'可以讨论前提。'}}),request={...input,blocks:[{id:'a',type:'paragraph',text}],thread,action:'reply'}
 await expect(generateNoteChallenge(f.ctx,request)).rejects.toThrow('超过6000')
 expect(f.calls).toHaveLength(0)
 expect((await generateNoteChallenge(f.ctx,{...request,thread:{...thread,messages:[{role:'user',text:'为什么？'}]}})).reply).toEqual({text:'可以讨论前提。'})
 expect(JSON.parse(f.calls[0].messages[0].content[0].text).allowReplacement).toBe(false)
})

it('keeps the existing model thread-context bound after adding a long host scope and retains the current intent',async()=>{
 const {generateNoteChallenge}=await load(),text='文'.repeat(5990)+'问题。',f=fixture({reply:{text:'建议核对。',replacement:'已核对。'}}),messages=[{role:'user',text:'旧'.repeat(3900)},{role:'assistant',text:'旧'.repeat(3900)},{role:'user',text:'旧'.repeat(3900)},{role:'user',text:'直接修改原文'}]
 await generateNoteChallenge(f.ctx,{...input,action:'reply',blocks:[{id:'a',type:'paragraph',text}],thread:{blockId:'a',quote:'问题',category:'logic',message:'请核对',messages}})
 const payload=JSON.parse(f.calls[0].messages[0].content[0].text)
 expect(JSON.stringify(payload.thread).length).toBeLessThanOrEqual(16000)
 expect(payload.thread.replacementQuote).toBe(text)
 expect(payload.thread.messages.at(-1)).toEqual({role:'user',text:'直接修改原文'})
 expect(payload.allowReplacement).toBe(true)
 expect(f.calls).toHaveLength(1)
})

it('lets a multi-paragraph review finish beyond the short single-block deadline without raising its token budget', async () => {
  vi.useFakeTimers()
  const { generateNoteChallenge } = await load(), f = fixture()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* (options) {
    f.calls.push(options); started()
    await new Promise(resolve => setTimeout(resolve, 25000))
    yield { type: 'text-delta', index: 0, text: JSON.stringify({ reviews: input.blocks.map(b => ({ blockId: b.id, issues: [] })) }) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const observed = generateNoteChallenge(f.ctx, { ...input, changedIds: ['a', 'b'], level: 2 }).then(result => ({result}), error => ({error}))
  await ready; await vi.advanceTimersByTimeAsync(25001)
  const value = await observed
  expect(value.error).toBeUndefined()
  expect(value.result.coveredBlockIds).toEqual(['a','b'])
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].maxTokens).toBe(3000)
})

it('caps the whole dense review at sixty seconds even when its provider ignores cancellation', async () => {
  vi.useFakeTimers()
  const { generateNoteChallenge } = await load(), f = fixture()
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.ctx.llm.stream = async function* () { started(); await new Promise(() => {}); yield { type: 'text-delta', text: '{}' } }
  const blocks = Array.from({length:6}, (_,i) => ({id:'dense-'+i,type:'paragraph',text:'独立正文段落。'}))
  const observed = generateNoteChallenge(f.ctx, {...input, blocks, changedIds:blocks.map(b=>b.id),level:2}).then(result=>({result}),error=>({error}))
  await ready; await vi.advanceTimersByTimeAsync(20001)
  let settled = false; observed.then(()=>{settled=true}); await Promise.resolve()
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(40000)
  expect((await observed).error.message).toMatch(/超时|timeout/i)
})

it('does not let model memory invent a capital basis conflict for a qualified securities forecast',async()=>{
  const {generateNoteChallenge}=await load()
  const text='600519.SH 报告基准日20261020。预计2026年归母净利润838.69亿元，EPS67.0908元。'
  const f=fixture({reviews:[{blockId:'a',issues:[{quote:'预计2026年归母净利润838.69亿元，EPS67.0908元。',basis:'general-knowledge',category:'uncertain',message:'按贵州茅台总股本约12.56亿股，838.69亿元对应EPS约66.77元，与67.0908元不符，请核对计算口径',evidence:[]}]}]})
  const result=await generateNoteChallenge(f.ctx,{...input,blocks:[{id:'a',type:'paragraph',text}]})
  expect(result.issues).toEqual([])
  expect(result.checks).toContainEqual(expect.objectContaining({kind:'consensus',status:'unavailable'}))
})

it('keeps explicit note-backed forecast arithmetic and unrelated obvious knowledge conflicts',async()=>{
  const {generateNoteChallenge}=await load()
  const text='600519.SH 报告基准日20261020。预计2026年归母净利润100亿元，EPS20元，假设股本10亿股。水在100摄氏度一定会结冰。'
  const f=fixture({reviews:[{blockId:'a',issues:[
    {quote:'EPS20元',basis:'note',category:'logic',message:'100亿元除以10亿股应为10元，请核对EPS。',evidence:[{kind:'note',label:'正文股本假设',blockId:'a',quote:'假设股本10亿股'}]},
    {quote:'水在100摄氏度一定会结冰',basis:'general-knowledge',category:'uncertain',message:'常温常压下100摄氏度的水通常沸腾而非结冰，请核对。',evidence:[]}
  ]}]})
  const result=await generateNoteChallenge(f.ctx,{...input,blocks:[{id:'a',type:'paragraph',text}]})
  expect(result.issues.map(i=>i.quote)).toEqual(['EPS20元','水在100摄氏度一定会结冰'])
})

it('limits relaxed automatic review to spelling even if the provider returns facts, logic and research advice',async()=>{
 const {generateNoteChallenge}=await load(),f=fixture({reviews:[{blockId:'a',issues:[
 {quote:'提胶',category:'typo',basis:'note',message:'应为“提交”。',evidence:[]},
 {quote:'100摄氏度结冰',category:'typo',basis:'general-knowledge',message:'冰点是否有误？',evidence:[]},
 {quote:'100摄氏度结冰',category:'uncertain',basis:'general-knowledge',message:'冰点是否有误？',evidence:[]},
 {quote:'一定成功',category:'logic',basis:'note',message:'依据不足。',evidence:[]},
 {quote:'提交报告',category:'grammar',basis:'note',message:'建议润色表达。',evidence:[]}
 ]}]}),skills={list:vi.fn(async()=>[])};f.ctx.skills=skills
 const result=await generateNoteChallenge(f.ctx,{...input,level:1,blocks:[{id:'a',type:'paragraph',text:'提胶并提交报告。水在100摄氏度结冰，所以一定成功。600519.SH 报告基准日20261020。预计2026年EPS76元。'}]})
 expect(result.issues.map(i=>i.category)).toEqual(['typo']);expect(result.checks.some(c=>c.kind==='consensus')).toBe(false);expect(skills.list).not.toHaveBeenCalled()
})

it('adds independently validated omissions and a concrete viewpoint question in the bounded adversarial audit',async()=>{
 const{generateNoteChallenge}=await load(),f=fixture();f.ctx.llm.stream=async function*(options){f.calls.push(options);const p=JSON.parse(options.messages[0].content[0].text),issues=p.audit?[{quote:'水会在100℃结冰',category:'uncertain',basis:'general-knowledge',message:'常压下冰点应为0℃，是否需要修正？',evidence:[]},{quote:'收入是活动唯一价值',category:'question',basis:'note',message:'是否还应考虑教育和社区参与价值？',evidence:[]}]:[{quote:'提胶',category:'typo',basis:'note',message:'应为提交。',evidence:[]}];yield{type:'text-delta',index:0,text:JSON.stringify({reviews:[{reviewKey:p.targets[0].reviewKey,issues}]})};yield{type:'finish',reason:{kind:'stop'}}}
 const result=await generateNoteChallenge(f.ctx,{...input,level:4,blocks:[{id:'a',type:'paragraph',text:'请提胶报告。水会在100℃结冰。收入是活动唯一价值。'}]})
 expect(f.calls).toHaveLength(2);expect(result.issues.map(i=>i.category)).toEqual(['typo','uncertain','question']);expect(JSON.parse(f.calls[1].messages[0].content[0].text).alreadyFound).toHaveLength(1);expect(result.checks).toContainEqual(expect.objectContaining({kind:'review',status:'completed',detail:expect.stringContaining('深度复查')}))
})
it('returns validated primary findings with honest partial depth if the optional audit fails once',async()=>{
 const{generateNoteChallenge}=await load(),f=fixture();f.ctx.llm.stream=async function*(options){f.calls.push(options);const p=JSON.parse(options.messages[0].content[0].text);if(p.audit)throw Error('provider unavailable');yield{type:'text-delta',index:0,text:JSON.stringify({reviews:[{reviewKey:p.targets[0].reviewKey,issues:[{quote:'提胶',category:'typo',basis:'note',message:'应为提交。',evidence:[]}]}]})};yield{type:'finish',reason:{kind:'stop'}}}
 const result=await generateNoteChallenge(f.ctx,{...input,level:3,blocks:[{id:'a',type:'paragraph',text:'请提胶报告。'}]})
 expect(result.issues.map(i=>i.quote)).toEqual(['提胶']);expect(f.calls).toHaveLength(2);expect(result.checks).toContainEqual(expect.objectContaining({kind:'review',status:'partial',detail:expect.stringContaining('深度复查未完成')}))
})
it('credits an omitted primary block only after a valid independent audit actually checks it',async()=>{
 const{generateNoteChallenge}=await load(),f=fixture();f.ctx.llm.stream=async function*(options){f.calls.push(options);const p=JSON.parse(options.messages[0].content[0].text);yield{type:'text-delta',index:0,text:JSON.stringify({reviews:p.audit?p.targets.map(t=>({reviewKey:t.reviewKey,issues:[]})):[]})};yield{type:'finish',reason:{kind:'stop'}}}
 const result=await generateNoteChallenge(f.ctx,{...input,level:3,blocks:[{id:'a',type:'paragraph',text:'这是一段没有具体错误的正常内容。'}]});expect(result.coveredBlockIds).toEqual(['a']);expect(result.issues).toEqual([])
})
