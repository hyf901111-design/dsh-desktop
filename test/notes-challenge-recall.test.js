import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'
import { NoteChallengeScheduler } from '../src/preload/notes/challenge-scheduler'

afterEach(() => vi.useRealTimers())

const captured = name => JSON.parse(readFileSync(new URL(`./fixtures/notes-challenge-v16/${name}.json`, import.meta.url), 'utf8'))
const block = (id, text) => ({ id, type: 'paragraph', text })
const note = blocks => ({ sessionId: 'fixture', requestId: 'review', action: 'review', level: 1, title: '', blocks, changedIds: blocks.map(b => b.id) })
const issue = (quote, extra = {}) => ({ quote, category: 'uncertain', basis: 'general-knowledge', message: '是否需要核对这个判断？', evidence: [], ...extra })
function provider(visibleText) {
  let calls = 0
  return {
    apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { routable: true, current: { provider: 'fixture', model: 'fixture' } } } }) } },
    llm: { stream: async function* () {
      const text = Array.isArray(visibleText) ? visibleText[calls++] : visibleText
      for (let start = 0; start < text.length; start += 11) yield { type: 'text-delta', index: 0, text: text.slice(start, start + 11) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } }
  }
}
const run = (input, answer) => generateNoteChallenge(provider(JSON.stringify(answer)), input)

it('retains every erroneous paragraph from a captured six-block provider result without flagging the corrected opening', async () => {
  const fixture = captured('captured-six-blocks')
  const result = await generateNoteChallenge(provider(fixture.visibleText), fixture.input)
  expect(result.version).toBe(1)
  expect(result.coveredBlockIds).toEqual(fixture.input.changedIds)
  expect(result.issues.map(item => item.blockId)).toEqual([
    'cab0de47-57e5-4cb8-abfc-46706762212b', 'cab0de47-57e5-4cb8-abfc-46706762212b',
    'aeb48e4e-5410-43de-9dca-e633bbcdc42e', 'aeb48e4e-5410-43de-9dca-e633bbcdc42e',
    '5e5cebfa-c236-45ca-bf96-c3a2663343e5', '5e5cebfa-c236-45ca-bf96-c3a2663343e5',
    'a5b4d8e0-64b2-4e1a-a2dd-34a029ecd5ad', 'a5b4d8e0-64b2-4e1a-a2dd-34a029ecd5ad',
    '55a646db-5eff-42af-8610-84cdff5963c3', '55a646db-5eff-42af-8610-84cdff5963c3'
  ])
  expect(result.issues.every(item => item.category === 'uncertain' && item.message.startsWith('常识疑问（未联网核验）：') && item.evidence.length === 0)).toBe(true)
  expect(result.checks).toContainEqual(expect.objectContaining({ kind: 'review', status: 'completed', detail: expect.stringContaining('未核验外部事实') }))
})

it('preserves captured no-issue reviews for correct arithmetic, explicit fiction, refuted quotation and unfinished text', async () => {
  const fixture = captured('captured-controls')
  const result = await generateNoteChallenge(provider(fixture.visibleText), fixture.input)
  expect(result.issues).toEqual([])
  expect(result.coveredBlockIds).toEqual(['correct-math', 'fiction', 'quotation', 'incomplete'])
})

it('does not claim missing blocks were reviewed and accepts an explicit empty record as a completed check', async () => {
  const input = note([block('a', '第一段。'), block('b', '第二段。'), block('c', '第三段。')])
  const result = await run(input, { reviews: [{ blockId: 'b', issues: [] }], coveredBlockIds: ['a', 'b', 'c'], checks: [{ status: 'completed' }] })
  expect(result.coveredBlockIds).toEqual(['b'])
  expect(result.issues).toEqual([])
  expect(result.checks).toEqual([expect.objectContaining({ kind: 'review', status: 'partial', detail: expect.stringContaining('1/3') })])
  expect((await run(input, { reviews: [] })).coveredBlockIds).toEqual([])
})

for (const answer of [
  { issues: [] },
  { reviews: [{ blockId: 'a', issues: [] }, { blockId: 'a', issues: [] }] },
  { reviews: [{ blockId: 'unknown', issues: [] }] },
  { reviews: [{ blockId: 'a' }] },
  { reviews: [{ blockId: 'a', issues: null }] }
]) it('rejects ambiguous or invalid review acknowledgements: ' + JSON.stringify(answer), async () => {
  await expect(run(note([block('a', '正文。')]), answer)).rejects.toThrow('格式不完整')
})

it('normalizes explicit general knowledge to unverified questions but rejects invented evidence, fact verdicts and invalid anchors', async () => {
  const result = await run(note([block('a', '第一句。第二句。第三句。第四句。')]), { reviews: [{ blockId: 'a', issues: [
    issue('第一句', { category: 'logic' }),
    issue('第二句', { evidence: [{ kind: 'note', label: '伪造', blockId: 'a', quote: '第二句' }] }),
    issue('第三句', { category: 'fact' }),
    issue('第四句', { basis: undefined }),
    issue('不存在')
  ] }] })
  expect(result.issues).toEqual([{ blockId: 'a', quote: '第一句', category: 'uncertain', message: '常识疑问（未联网核验）：是否需要核对这个判断？', evidence: [] }])
})

it('deduplicates validated questions before enforcing the two-comment limit for a paragraph', async () => {
  const result = await run(note([block('a', '甲句。乙句。丙句。')]), { reviews: [{ blockId: 'a', issues: [
    issue('不存在'), issue('甲句'), issue('甲句'), issue('乙句'), issue('丙句')
  ] }] })
  expect(result.issues.map(item => item.quote)).toEqual(['甲句', '乙句'])
})

it('cannot reassign an issue to a different review block even when the quote occurs in both blocks', async () => {
  const result = await run(note([block('a', '共同原文。'), block('b', '共同原文。')]), {
    reviews: [{ blockId: 'a', issues: [issue('共同原文', { blockId: 'b' })] }, { blockId: 'b', issues: [] }]
  })
  expect(result.issues).toEqual([])
})

it('allocates a bounded review fairly across six generic paragraphs and orders reversed provider output by exact quote position', async () => {
  const input = note([
    block('count', '三加四等于九。十减二等于一。'),
    block('calendar', '一周有十天。六月有四十天。'),
    block('shape', '正方形只有三条边。三角形有五个角。'),
    block('units', '一米等于十厘米。一小时等于六分钟。'),
    block('language', '字母表从Z开始。句号专门表示提问。'),
    block('time', '昨天发生在明天之后。午夜之后马上是傍晚。')
  ])
  const reviews = input.blocks.map(b => ({ blockId: b.id, issues: b.text.split('。').filter(Boolean).reverse().map(text => issue(text)) })).reverse()
  const result = await run({ ...input, changedIds: [...input.changedIds].reverse() }, { reviews })
  expect(result.coveredBlockIds).toEqual(['count', 'calendar', 'shape', 'units', 'language', 'time'])
  expect(result.issues.map(item => item.quote)).toEqual(['三加四等于九', '十减二等于一', '一周有十天', '六月有四十天', '正方形只有三条边', '三角形有五个角', '一米等于十厘米', '一小时等于六分钟', '字母表从Z开始', '句号专门表示提问', '昨天发生在明天之后', '午夜之后马上是傍晚'])
})

it('uses the twelve-comment budget for one issue per paragraph before adding second issues', async () => {
  const input = note(Array.from({ length: 14 }, (_, n) => block('b' + n, '甲句。乙句。丙句。')))
  const result = await generateNoteChallenge(provider([
    JSON.stringify({ reviews: input.blocks.slice(0, 12).map(b => ({ blockId: b.id, issues: [issue('甲句'), issue('乙句'), issue('丙句')] })) }),
    JSON.stringify({ reviews: [{ blockId: 'b12', issues: [issue('甲句')] }, { blockId: 'b13', issues: [issue('甲句')] }] })
  ]), input)
  expect(result.coveredBlockIds).toHaveLength(14)
  expect(result.issues).toHaveLength(12)
  expect(new Set(result.issues.map(item => item.blockId)).size).toBe(12)
})

it('retains only unacknowledged paragraphs for the next scheduled runtime pass and does not repeat unchanged covered text', async () => {
  vi.useFakeTimers()
  const input = note(['a', 'b', 'c', 'd', 'e', 'f'].map(id => block(id, `段落${id}。`)))
  const ctx = provider([
    JSON.stringify({ reviews: [{ blockId: 'a', issues: [] }] }),
    JSON.stringify({ reviews: ['b', 'c', 'd', 'e', 'f'].map(blockId => ({ blockId, issues: [] })) })
  ])
  const requests = [], received = [], states = []
  const scheduler = new NoteChallengeScheduler({ sessionId: input.sessionId,
    run: (request, signal) => { requests.push(request); return generateNoteChallenge(ctx, request, signal) },
    onResult: result => { received.push(result) }, onState: state => { states.push(state) }
  })
  try {
    scheduler.update({ title: '', blocks: input.blocks, active: true }); scheduler.setLevel(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(requests[0].changedIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(received[0].coveredBlockIds).toEqual(['a'])
    expect(states.at(-1).pending).toBe(5)
    await vi.advanceTimersByTimeAsync(60000)
    expect(requests[1].changedIds).toEqual(['b', 'c', 'd', 'e', 'f'])
    expect(received[1].coveredBlockIds).toEqual(['b', 'c', 'd', 'e', 'f'])
    expect(states.at(-1).pending).toBe(0)
    scheduler.update({ title: '', blocks: input.blocks, active: true })
    await vi.advanceTimersByTimeAsync(600000)
    expect(requests).toHaveLength(2)
  } finally { scheduler.dispose() }
})
