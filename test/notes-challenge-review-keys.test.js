import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

const input = {
  sessionId: 'PRIVATE-SESSION', requestId: 'PRIVATE-REQUEST', action: 'review', level: 2, title: 'PRIVATE-TITLE',
  blocks: [
    { id: 'PRIVATE-target-00000001', type: 'paragraph', text: '有20名参与者。' },
    { id: 'PRIVATE-target-00000002', type: 'paragraph', text: '有30人完成任务。' },
    { id: 'PRIVATE-context-99999999', type: 'paragraph', text: '本次只有20人参加试验。' }
  ], changedIds: ['PRIVATE-target-00000001', 'PRIVATE-target-00000002']
}
const question = quote => ({ quote, category: 'question', basis: 'note', message: '请核对统计期间。', evidence: [] })
const keyed = (p, issues = () => []) => ({ reviews: p.targets.map((b, i) => ({ reviewKey: b.reviewKey ?? '__missing_' + i, issues: issues(b, i) })) })
const legacy = p => ({ reviews: p.targets.map(b => ({ blockId: b.id, issues: [] })) })
function fixture(answer = p => keyed(p)) {
  const calls = [], payloads = [], ctx = {
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'provider', model: 'model' } } } }) } },
    llm: { stream: async function* (options) {
      calls.push(options)
      const payload = JSON.parse(options.messages[0].content[0].text); payloads.push(payload)
      const value = answer(payload, calls.length)
      yield { type: 'text-delta', index: 0, text: typeof value === 'string' ? value : JSON.stringify(value) }
      yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 10 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } }
  }
  return { ctx, calls, payloads }
}
const reports = () => vi.mocked(console.warn).mock.calls.flatMap(([text]) => typeof text === 'string' && text.startsWith('{"event":"notes-challenge-') ? [JSON.parse(text)] : [])
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

it('adds separated return keys while preserving every source ID, body, context and anchor', async () => {
  const blocks = Array.from({ length: 13 }, (_, i) => ({ id: 'PRIVATE-' + i, type: 'paragraph', text: '段落' + i + '。' })), changedIds = blocks.slice(0, 12).map(b => b.id)
  const anchors = blocks.map(b => ({ blockId: b.id, quote: b.text })), f = fixture(legacy)
  await generateNoteChallenge(f.ctx, { ...input, blocks, changedIds, existingAnchors: anchors })
  const p = f.payloads[0], keys = p.targets.map(b => b.reviewKey)
  expect(p.targets.map(({ reviewKey, ...b }) => b)).toEqual(blocks.slice(0, 12))
  expect(p.context).toEqual([blocks[12]])
  expect(p.existingAnchors).toEqual(anchors.slice(0, 12))
  expect(keys).toHaveLength(12); expect(new Set(keys).size).toBe(12)
  for (const key of keys) expect(key).toMatch(/^[a-z0-9]{3}$/u)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) expect([...keys[i]].filter((c, n) => c !== keys[j][n]).length).toBeGreaterThanOrEqual(2)
  expect(f.calls[0].system).toContain('reviewKey')
  expect(f.calls[0].tools).toBeUndefined()
})

it('projects out-of-order keyed reviews to the original IDs and source ordering', async () => {
  const f = fixture(p => ({ reviews: keyed(p, b => [question(b.text)]).reviews.reverse() }))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ coveredBlockIds: input.changedIds, issues: input.blocks.slice(0, 2).map(b => ({ blockId: b.id, quote: b.text })) })
  expect(f.calls).toHaveLength(1)
  expect(reports()).toContainEqual(expect.objectContaining({ event: 'notes-challenge-review-identity', mode: 'key', targetCount: 2, reviewCount: 2, ignoredGroups: 0 }))
})

it('keeps note evidence in the real context ID namespace', async () => {
  const evidence = [{ kind: 'note', label: '原文对照', blockId: input.blocks[2].id, quote: input.blocks[2].text }]
  const f = fixture(p => keyed(p, (b, i) => i ? [{ ...question(b.text), category: 'contradiction', message: '完成数超过参与者总数。', evidence }] : []))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ issues: [{ blockId: input.blocks[1].id, evidence }] })
})

for (const [name, mutate] of [
  ['unknown and missing', (rows, p) => rows[1].reviewKey = 'PRIVATE-UNKNOWN'],
  ['duplicate', rows => rows[1].reviewKey = rows[0].reviewKey],
  ['non-string', rows => rows[0].reviewKey = 0],
  ['mixed formats', (rows, p) => rows[1] = { blockId: p.targets[1].id, issues: [] }],
  ['both identity fields', (rows, p) => rows[0].blockId = p.targets[0].id],
  ['unexpected fields', rows => rows[0]['PRIVATE-FIELD'] = 'PRIVATE-MODEL'],
  ['context as a target', (rows, p) => rows[1].reviewKey = p.context[0].id]
]) it('rejects '+name+' without changing the two-attempt bound', async () => {
  const f = fixture(p => { const value = keyed(p); mutate(value.reviews, p); return value })
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('格式不完整')
  expect(f.calls).toHaveLength(2)
})

it('never treats a foreign key as an original ID when the two namespaces collide', async () => {
  const blocks = [{ id: 'r1b', type: 'paragraph', text: '原文。' }], value = { ...input, blocks, changedIds: ['r1b'] }
  const wrong = fixture(() => ({ reviews: [{ reviewKey: 'r1b', issues: [] }] }))
  await expect(generateNoteChallenge(wrong.ctx, value)).rejects.toThrow('格式不完整')
  expect(wrong.calls).toHaveLength(2)
  const correct = fixture(p => keyed(p))
  await expect(generateNoteChallenge(correct.ctx, value)).resolves.toMatchObject({ coveredBlockIds: ['r1b'] })
  const old = fixture(legacy)
  await expect(generateNoteChallenge(old.ctx, value)).resolves.toMatchObject({ coveredBlockIds: ['r1b'] })
})

it('accepts only the actual known subset as partial coverage', async () => {
  const f = fixture(p => ({ reviews: keyed(p).reviews.slice(1) }))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ coveredBlockIds: [input.blocks[1].id], checks: [expect.objectContaining({ status: 'partial' })] })
  expect(f.calls).toHaveLength(1)
})

it('discards extra keyed groups only when all real targets are present', async () => {
  const f = fixture(p => ({ reviews: [...keyed(p).reviews, { reviewKey: p.context[0].id, issues: [question('PRIVATE-FOREIGN-QUOTE')] }] }))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ coveredBlockIds: input.changedIds, issues: [] })
  expect(f.calls).toHaveLength(1)
  expect(reports()).toContainEqual(expect.objectContaining({ event: 'notes-challenge-review-extra-groups', ignoredGroups: 1, unknownContextIds: 1 }))
})

it('maps reused return keys independently for each sequential batch', async () => {
  const blocks = Array.from({ length: 26 }, (_, i) => ({ id: 'PRIVATE-BATCH-' + i, type: 'paragraph', text: '记录' + i + '。' })), f = fixture(p => keyed(p, (b, i) => i ? [] : [question(b.text)]))
  await expect(generateNoteChallenge(f.ctx, { ...input, blocks, changedIds: blocks.map(b => b.id) })).resolves.toMatchObject({ coveredBlockIds: blocks.map(b => b.id), issues: [0, 12, 24].map(i => ({ blockId: blocks[i].id, quote: blocks[i].text })) })
  expect(f.calls).toHaveLength(3)
  expect(f.payloads.map(p => p.targets[0].reviewKey)).toEqual(['r0a', 'r0a', 'r0a'])
})

it('retains quote and evidence validation and projects filtering diagnostics to source IDs', async () => {
  const f = fixture(p => keyed(p, (b, i) => [i ? { ...question(b.text), category: 'contradiction', evidence: [{ kind: 'note', label: '原文对照', blockId: p.targets[0].reviewKey, quote: p.targets[0].text }] } : question('PRIVATE-NOT-IN-NOTE')]))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ issues: [], coveredBlockIds: input.changedIds })
  expect(f.calls).toHaveLength(1)
  expect(reports()).toContainEqual(expect.objectContaining({ event: 'notes-challenge-review-filtered', candidates: 2, accepted: 0 }))
  const text = JSON.stringify(reports())
  for (const secret of ['PRIVATE', 'r0a', input.blocks[0].text, input.title]) expect(text).not.toContain(secret)
})

it('shares the original retry budget when a malformed legacy response recovers into keyed output', async () => {
  const f = fixture((p, call) => call === 1 ? { reviews: [{ blockId: 'PRIVATE-UNKNOWN', issues: [] }] } : keyed(p))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ coveredBlockIds: input.changedIds, usage: { inputTokens: 60, outputTokens: 20 } })
  expect(f.calls).toHaveLength(2)
  expect(f.calls[1].system).toContain('reviewKey')
  expect(f.calls[1].system).not.toContain('PRIVATE-UNKNOWN')
})

it('continues accepting an exact legacy response without changing its result', async () => {
  const f = fixture(legacy)
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ issues: [], coveredBlockIds: input.changedIds, usage: { inputTokens: 30, outputTokens: 10 } })
  expect(f.calls).toHaveLength(1)
  expect(reports()).toEqual([expect.objectContaining({ event: 'notes-challenge-review-identity', mode: 'block-id', targetCount: 2, reviewCount: 2 })])
})

it('keeps valid keyed output when the fixed diagnostic sink throws', async () => {
  vi.mocked(console.warn).mockImplementation(text => { if (String(text).includes('notes-challenge-')) throw Error('PRIVATE-LOGGER') })
  const f = fixture(p => keyed(p))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ coveredBlockIds: input.changedIds })
  expect(f.calls).toHaveLength(1)
})

for (const action of ['reply', 'optimize']) it('does not add review keys to '+action+' requests', async () => {
  const f = fixture(() => ({ reply: { text: '简短回复', ...action === 'optimize' ? { replacement: input.blocks[0].text } : {} } }))
  const thread = { blockId: input.blocks[0].id, quote: input.blocks[0].text, category: 'question', message: '期间？', messages: [] }
  await generateNoteChallenge(f.ctx, { ...input, action, thread })
  expect(f.payloads[0].targets).toEqual([input.blocks[0]])
  expect(f.payloads[0].context.every(b => !Object.hasOwn(b, 'reviewKey'))).toBe(true)
})

it('does not carry return keys into optional consistency context or findings', async () => {
  const f = fixture(p => p.action === 'consistency' ? { decisions: p.candidates.map(c => ({ candidateId: c.candidateId, keep: true, reason: 'retain' })) } : keyed(p, (b, i) => i ? [] : [{ ...question(b.text), message: '原文基本相符，但完成数需要核对。' }]))
  await expect(generateNoteChallenge(f.ctx, input)).resolves.toMatchObject({ issues: [{ blockId: input.blocks[0].id }] })
  expect(f.calls).toHaveLength(2)
  expect(f.payloads[1].action).toBe('consistency')
  expect(f.payloads[1].context).toEqual(input.blocks)
  expect(f.payloads[1].candidates[0].blockId).toBe(input.blocks[0].id)
})
