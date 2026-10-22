import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'
import { NoteChallengeScheduler } from '../src/preload/notes/challenge-scheduler'

afterEach(() => vi.useRealTimers())

// Historical fact-review fixtures now exercise Standard; relaxed is spelling-only.
const captured = name => {const value=JSON.parse(readFileSync(new URL(`./fixtures/notes-challenge-v16/${name}.json`, import.meta.url), 'utf8'));if(value.input)value.input.level=2;return value}
const block = (id, text) => ({ id, type: 'paragraph', text })
const note = blocks => ({ sessionId: 'fixture', requestId: 'review', action: 'review', level: 2, title: '', blocks, changedIds: blocks.map(b => b.id) })
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

it('does not silently discard the five later paragraphs when actual runtime mislabels unsupported knowledge as note contradictions', async () => {
  const input = captured('captured-six-blocks').input
  const result = await generateNoteChallenge(provider(captured('captured-category-noise').visibleText), input)
  const knowledge = result.issues.filter(item => item.blockId !== 'initialBlockId')
  expect(knowledge).toHaveLength(10)
  expect(new Set(knowledge.map(item => item.blockId)).size).toBe(5)
  expect(knowledge.every(item => item.category === 'uncertain' && item.evidence.length === 0 && item.message.startsWith('常识疑问（未联网核验）：') && /[?？]/u.test(item.message))).toBe(true)
})

it('tolerates absent or noisy basis labels only by downgrading unsupported reasoning verdicts to unverified questions', async () => {
  const result = await run(note([block('a', '第一句。第二句。')]), { reviews: [{ blockId: 'a', issues: [
    issue('第一句', { basis: undefined, category: 'logic', message: '这里一定不成立。' }),
    issue('第二句', { basis: 'incorrect-label', category: 'contradiction', message: '这与常识不符。' })
  ] }] })
  expect(result.issues).toHaveLength(2)
  expect(result.issues.every(item => item.category === 'uncertain' && item.message.startsWith('常识疑问（未联网核验）：是否需要核对这一说法？') && item.evidence.length === 0)).toBe(true)
})

it('excludes a captured knowledge question that explicitly admits agreement while retaining findings in all five later paragraphs', async () => {
  const input = captured('captured-six-blocks').input
  const result = await generateNoteChallenge(provider(captured('captured-self-negating-claim').visibleText), input)
  expect(result.issues.some(item => item.blockId === 'initialBlockId')).toBe(false)
  expect(result.issues).toHaveLength(9)
  expect(new Set(result.issues.map(item => item.blockId)).size).toBe(5)
  expect(result.coveredBlockIds).toEqual(input.changedIds)
})

it('accepts captured knowledge questions with omitted empty evidence without inventing sources', async () => {
  const input = captured('captured-six-blocks').input
  const result = await generateNoteChallenge(provider(captured('captured-omitted-evidence').visibleText), input)
  expect(result.issues).toHaveLength(10)
  expect(result.issues.some(item => item.blockId === 'initialBlockId')).toBe(false)
  expect(new Set(result.issues.map(item => item.blockId)).size).toBe(5)
  expect(result.issues.every(item => item.category === 'uncertain' && item.evidence.length === 0 && item.message.startsWith('常识疑问（未联网核验）：'))).toBe(true)
  expect(result.coveredBlockIds).toEqual(input.changedIds)
})

it('only downgrades unsupported reasoning when evidence is omitted and still rejects malformed evidence or factual verdicts', async () => {
  const result = await run(note([block('a', '甲句。乙句。丙句。丁句。戊句。己句。')]), { reviews: [{ blockId: 'a', issues: [
    issue('甲句', { category: 'logic', basis: 'note', evidence: undefined }),
    issue('乙句', { evidence: null }),
    issue('丙句', { evidence: {} }),
    issue('丁句', { evidence: [{ kind: 'note', label: '伪来源', blockId: 'a', quote: '不存在' }] }),
    issue('戊句', { category: 'fact', evidence: undefined }),
    issue('己句', { category: 'research', evidence: undefined })
  ] }] })
  expect(result.issues).toEqual([{ blockId: 'a', quote: '甲句', category: 'uncertain', message: '常识疑问（未联网核验）：是否需要核对这个判断？', evidence: [] }])
})

it('rejects translated protocol keys instead of inferring review coverage', async () => {
  await expect(run(note([block('a', '正确正文。')]), { 审查: [{ 段落编号: 'a', 问题: [] }] })).rejects.toThrow('格式不完整')
})

it('does not flag correct arithmetic merely to request intermediate steps or guard against possible misunderstanding', async () => {
  const result = await run(note([block('math', '20名参与者中有15人完成任务，因此完成率为75%。')]), {
    reviews: [{ blockId: 'math', issues: [
      issue('完成率为75%', { message: '原文的计算结果正确，只建议补充中间步骤。' }),
      issue('20名参与者中有15人完成任务', { message: '原文没有问题，仅可能让读者误解，可进一步细化。' })
    ] }]
  })
  expect(result.issues).toEqual([])
})

for (const message of [
  '红薯传入中国的时间有不同说法（约万历年间，明代），该句大体相符，请问是否需要核实具体传入年代？',
  '该表述基本一致，仅建议补充更详细的年代。'
]) it('drops an explicit admission of agreement while retaining an independent erroneous paragraph: ' + message, async () => {
  const result = await run(note([block('correct', '红薯也要到明代才传入中国。'), block('error', '水在100摄氏度时一定结冰。')]), {
    reviews: [
      { blockId: 'correct', issues: [issue('红薯也要到明代才传入中国', { message })] },
      { blockId: 'error', issues: [issue('水在100摄氏度时一定结冰', { message: '常压下水的冰点约为0摄氏度，是否需修正？' })] }
    ]
  })
  expect(result.issues.map(item => item.blockId)).toEqual(['error'])
  expect(result.coveredBlockIds).toEqual(['correct', 'error'])
})

for (const message of [
  '原文与常见结论并不相符，是否需要核对？',
  '原文是否正确？请核对分母是否包括未完成者。',
  '计算结果与原文相符，但后续结论与给定人数冲突。',
  '原文数字正确，不过样本范围与上下文不一致。',
  '该句并不相符，是否应核对样本范围？',
  '该句大体相符吗？分母是否包括未完成者？',
  '该句是否基本一致？需要核对。',
  '该句大体相符，但后续结论与给定人数矛盾。',
  '该表述基本一致，然而其适用条件不成立。'
]) it('retains an actual or unresolved conflict rather than interpreting negation, questions or a contrasting clause as agreement: ' + message, async () => {
  const result = await run(note([block('a', '有15人完成任务，所以所有人都完成了。')]), {
    reviews: [{ blockId: 'a', issues: [issue('所以所有人都完成了', { message })] }]
  })
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0].category).toBe('uncertain')
})

for (const message of [
  '该句大体相符，但结冰温度应为0℃而非10℃，是否需修正？',
  '该句看似相符，实际并非如此：结冰温度应为0℃而非10℃，是否需修正？',
  '该表述基本一致，不过结冰温度应为0℃，是否需要改正？'
]) it('retains a qualified agreement with a concrete correction even without error vocabulary: ' + message, async () => {
  const result = await run(note([block('a', '水在标准大气压下100℃沸腾、10℃结冰。')]), {
    reviews: [{ blockId: 'a', issues: [issue('水在标准大气压下100℃沸腾、10℃结冰', { message })] }]
  })
  expect(result.issues).toHaveLength(1)
  expect(result.coveredBlockIds).toEqual(['a'])
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
    issue('第四句', { basis: undefined, evidence: [{ kind: 'note', label: '来源', blockId: 'a', quote: '第四句' }] }),
    issue('不存在')
  ] }] })
  expect(result.issues).toEqual([{ blockId: 'a', quote: '第一句', category: 'uncertain', message: '常识疑问（未联网核验）：是否需要核对这个判断？', evidence: [] }])
})

it('deduplicates validated questions without discarding a third independent error', async () => {
  const result = await run(note([block('a', '甲句。乙句。丙句。')]), { reviews: [{ blockId: 'a', issues: [
    issue('不存在'), issue('甲句'), issue('甲句'), issue('乙句'), issue('丙句')
  ] }] })
  expect(result.issues.map(item => item.quote)).toEqual(['甲句', '乙句', '丙句'])
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

it('uses the common-error comment budget for one issue per paragraph before adding second issues', async () => {
  const input = note(Array.from({ length: 14 }, (_, n) => block('b' + n, '甲句。乙句。丙句。')))
  const result = await generateNoteChallenge(provider([
    JSON.stringify({ reviews: input.blocks.slice(0, 12).map(b => ({ blockId: b.id, issues: [issue('甲句'), issue('乙句'), issue('丙句')] })) }),
    JSON.stringify({ reviews: [{ blockId: 'b12', issues: [issue('甲句')] }, { blockId: 'b13', issues: [issue('甲句')] }] })
  ]), input)
  expect(result.coveredBlockIds).toHaveLength(14)
  expect(result.issues).toHaveLength(24)
  expect(new Set(result.issues.map(item => item.blockId)).size).toBe(14)
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

for(const [level,expected] of [[1,0],[2,6],[3,6],[4,6]])it(`retains up to ${expected} distinct issues in a dense paragraph at challenge level ${level}`,async()=>{
 const quotes=['一周有十天','六月有四十天','正方形只有三条边','三角形有五个角','一米等于十厘米','一小时等于六分钟','三加四等于九','十减二等于一']
 const input={...note([block('dense',quotes.join('。')+'。')]),level}
 const result=await run(input,{reviews:[{blockId:'dense',issues:quotes.map(quote=>issue(quote))}]})
 expect(result.issues.map(item=>item.quote)).toEqual(quotes.slice(0,expected));expect(result.coveredBlockIds).toEqual(['dense'])
 expect(result.issues.every(item=>item.category==='uncertain'&&item.evidence.length===0&&item.message.includes('未联网核验'))).toBe(true)
})

for(const level of [2,3,4])it(`keeps later independent claims across every paragraph at level ${level} instead of truncating all paragraphs to two issues`,async()=>{
 const blocks=Array.from({length:6},(_,n)=>block('dense-'+n,'判断甲。判断乙。判断丙。判断丁。判断戊。'))
 const result=await run({...note(blocks),level},{reviews:blocks.map(b=>({blockId:b.id,issues:['判断甲','判断乙','判断丙','判断丁','判断戊'].map(quote=>issue(quote))}))})
 expect(result.issues).toHaveLength(24)
 expect(blocks.map(b=>result.issues.filter(issue=>issue.blockId===b.id).map(issue=>issue.quote))).toEqual(blocks.map(()=>['判断甲','判断乙','判断丙','判断丁']))
 expect(result.coveredBlockIds).toEqual(blocks.map(b=>b.id))
})

it('retains both independently captured contextual misspellings rather than treating them as optional polish',async()=>{
 const fixture=captured('captured-ginkgo-typos')
 for(const level of [1,3]){
  const result=await generateNoteChallenge(provider(fixture.visibleText),{...fixture.input,level})
  expect(result.coveredBlockIds).toEqual(fixture.input.changedIds)
  expect(result.issues).toHaveLength(2);expect(result.issues.every(i=>i.category==='typo')).toBe(true)
  expect(result.issues.some(i=>i.quote.includes('关上'))).toBe(true);expect(result.issues.some(i=>i.quote.includes('主档'))).toBe(true)
 }
})
it('keeps concrete spelling findings in a stable unpunctuated phrase while dropping unfinished-syntax advice',async()=>{
 const input=note([block('a','材料以经提胶，请完成审和')])
 const result=await run(input,{reviews:[{blockId:'a',issues:[
  {quote:'以经提胶',category:'typo',basis:'note',message:'应为“已经提交”。',evidence:[]},
  {quote:'审和',category:'typo',basis:'note',message:'应为“审核”。',evidence:[]},
  {quote:'请完成审和',category:'grammar',basis:'note',message:'句末缺少标点。',evidence:[]}
 ]}]})
 expect(result.issues.map(i=>i.quote)).toEqual(['以经提胶','审和']);expect(result.coveredBlockIds).toEqual(['a'])
})
