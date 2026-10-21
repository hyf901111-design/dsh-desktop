import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

const input = {
  sessionId: 'PRIVATE-SESSION', requestId: 'PRIVATE-REQUEST', action: 'review', level: 1, title: 'PRIVATE-TITLE',
  blocks: [
    { id: 'target-private-00000001', type: 'paragraph', text: 'PRIVATE-BODY-ONE。' },
    { id: 'target-private-00000002', type: 'paragraph', text: 'PRIVATE-BODY-TWO。' },
    { id: 'context-private-99999999', type: 'paragraph', text: 'PRIVATE-CONTEXT。' }
  ], changedIds: ['target-private-00000001', 'target-private-00000002']
}
const counts = { unknownTitleIds: 0, unknownContextIds: 0, unknownNearTargetIds: 0, unknownEmptyGroups: 1, unknownNonStringIds: 0 }
function fixture(value) {
  const calls = [], ctx = {
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'provider', model: 'model' } } } }) } },
    llm: { stream: async function* (options) {
      calls.push(options)
      yield { type: 'text-delta', index: 0, text: JSON.stringify(value) }
      yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } }
  }
  return { ctx, calls }
}
const reports = () => vi.mocked(console.warn).mock.calls.map(([text]) => JSON.parse(text))
function privateSafe(rows) {
  for (const row of rows) {
    expect(JSON.stringify(row)).not.toContain('PRIVATE')
    expect(JSON.stringify(row)).not.toContain('private')
    expect(row.requestKey).toMatch(/^[a-f0-9]{12}$/u)
  }
}
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

for (const [name, blockId, expected, issues = []] of [
  ['reserved title ID', 'title', { unknownTitleIds: 1 }],
  ['provided title text', input.title, { unknownTitleIds: 1 }],
  ['context ID', input.blocks[2].id, { unknownContextIds: 1 }],
  ['one substitution', 'target-private-0000000x', { unknownNearTargetIds: 1 }],
  ['one insertion', 'target-private-000000001', { unknownNearTargetIds: 1 }],
  ['one deletion', 'target-private-0000001', { unknownNearTargetIds: 1 }],
  ['other ID', 'OTHER-PRIVATE-ID', {}],
  ['oversized ID', 'x'.repeat(257), {}],
  ['object ID', { title: 'PRIVATE-MODEL-ID' }, { unknownNonStringIds: 1 }],
  ['missing ID', undefined, { unknownNonStringIds: 1 }],
  ['nonempty foreign group', '标题', { unknownTitleIds: 1, unknownEmptyGroups: 0 }, [{ 'PRIVATE-KEY': 'PRIVATE-MODEL-TEXT' }]]
]) it('counts '+name+' without mapping it to the missing target or exposing content', async () => {
  const f = fixture({ reviews: [{ blockId: input.blocks[0].id, issues: [] }, { blockId, issues }] })
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('格式不完整')
  expect(f.calls).toHaveLength(2)
  const rows = reports()
  expect(rows).toHaveLength(2)
  for (const row of rows) expect(row).toMatchObject({ event: 'notes-challenge-format-rejected', reason: 'review-envelope', unknownBlockIds: 1, unreviewedTargets: 1, ...counts, ...expected })
  privateSafe(rows)
})

it('classifies accepted extra groups without changing exact coverage or ignoring an actual target', async () => {
  const reviews = input.blocks.map(block => ({ blockId: block.id, issues: [] }))
  reviews.push({ blockId: input.title, issues: [] })
  const f = fixture({ reviews }), before = JSON.stringify(input)
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.coveredBlockIds).toEqual(input.changedIds)
  expect(result.issues).toEqual([])
  expect(f.calls).toHaveLength(1)
  expect(reports()).toEqual([expect.objectContaining({ event: 'notes-challenge-review-extra-groups', ignoredGroups: 2, unknownTitleIds: 1, unknownContextIds: 1, unknownNearTargetIds: 0, unknownEmptyGroups: 2, unknownNonStringIds: 0 })])
  expect(Object.keys(reports()[0]).sort()).toEqual(['event', 'action', 'attempt', 'targetCount', 'reviewCount', 'ignoredGroups', 'requestKey', ...Object.keys(counts)].sort())
  expect(JSON.stringify(input)).toBe(before)
  privateSafe(reports())
})

it('does not report known IDs as unknown or change a normal no-issue review', async () => {
  const f = fixture({ reviews: input.blocks.slice(0, 2).map(block => ({ blockId: block.id, issues: [] })) })
  const result = await generateNoteChallenge(f.ctx, input)
  expect(result.coveredBlockIds).toEqual(input.changedIds)
  expect(result.issues).toEqual([])
  expect(f.calls).toHaveLength(1)
  expect(reports()).toEqual([])
})

it('preserves the original format failure and retry bound when diagnostic logging throws', async () => {
  vi.mocked(console.warn).mockImplementation(text => { if (String(text).includes('notes-challenge-')) throw Error('PRIVATE-LOGGER') })
  const f = fixture({ reviews: [{ blockId: 'title', issues: [] }] })
  await expect(generateNoteChallenge(f.ctx, input)).rejects.toThrow('格式不完整')
  expect(f.calls).toHaveLength(2)
})
