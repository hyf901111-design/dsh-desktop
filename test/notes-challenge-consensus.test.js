import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createToolProxy } from '../packages/dsh-integration-runtime/tool-proxy.js'

const load = () => import('../packages/dsh-research-task-runtime/notes-challenge-consensus.js')
const claim = { blockId: 'forecast', quote: 'EPS 76元', windCode: '600519.SH', baseDate: '20261020', year: 2026, metric: 'EPS', value: 76, unit: '元' }
const row = { CONSEN_DATA_CYCLE_TYP:'263002000', S_INFO_WINDCODE: '600519.SH', EST_REPORT_DT: '20261231', EST_DT: '20261019', NUM_EST_INST: 45, EPS_AVG: 67.3481, EPS_MEDIAN: 67.0908, EPS_MIN: 64.7795, EPS_MAX: 71.1026, EPS_DEV: 1.6094 }
const cleanups = []
afterEach(async () => { vi.useRealTimers(); for (const close of cleanups.splice(0)) await close() })

it('extracts only explicit, uniquely anchored forecast metrics with a code and report base date', async () => {
  const { extractConsensusClaims } = await load()
  const blocks = [{ id: 'header', type: 'paragraph', text: '600519.SH 报告基准日：2026-10-20' }, { id: 'forecast', type: 'paragraph', text: '预计2026年归母净利润950亿元，EPS 76元。' }]
  expect(extractConsensusClaims(blocks)).toEqual([
    { blockId: 'forecast', quote: '归母净利润950亿元', windCode: '600519.SH', baseDate: '20261020', year: 2026, metric: 'NET_PROFIT', value: 950, unit: '亿元' }, claim
  ])
  expect(extractConsensusClaims([{ ...blocks[1], text: '预计2026年EPS 76元。' }])).toEqual([])
  expect(extractConsensusClaims([blocks[0], { ...blocks[1], text: '预计2026年、2027年EPS 76元。' }])).toEqual([])
  expect(extractConsensusClaims([blocks[0], { ...blocks[1], text: '2026年已实现EPS 76元。' }])).toEqual([])
  expect(extractConsensusClaims([blocks[0], { ...blocks[1], text: '预计2026年EPS 76元，EPS 76元。' }])).toEqual([])
})

it.each(['上半年', '下半年', '半年度', '一季度', '第二季度', '前三季度', 'Q1', 'H1', '前9个月', '1-6月', '1至9月', 'first half'])(
  'does not reinterpret an explicit %s forecast as an annual consensus claim', async period => {
    const { extractConsensusClaims } = await load()
    expect(extractConsensusClaims([{ id: 'a', type: 'paragraph', text: `600519.SH 报告基准日20261020。预计2026年${period}EPS 30元。` }])).toEqual([])
  }
)

it.each(['扣非每股收益30元', '扣非归母净利润500亿元', '剔除非经常性损益后的归母净利润500亿元', '扣除非经常性损益后每股收益30元', '调整后EPS 30元', '稀释每股收益30元'])(
  'does not strip the incompatible basis from %s before comparison', async metric => {
    const { extractConsensusClaims } = await load()
    expect(extractConsensusClaims([{ id: 'a', type: 'paragraph', text: `600519.SH 报告基准日20261020。预计2026年${metric}。` }])).toEqual([])
  }
)

it('keeps a clearly annual forecast eligible for the supported static consensus table', async () => {
  const { extractConsensusClaims } = await load()
  expect(extractConsensusClaims([{ id: 'forecast', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年全年EPS 76元。' }])).toEqual([claim])
})

it('aligns by EST_DT and computes static units and strict default thresholds', async () => {
  const { compareConsensusClaim } = await load()
  const result = compareConsensusClaim(claim, [ { ...row, EST_DT: '20261021', EPS_MEDIAN: 76 }, row, { ...row, EST_DT: '20261001', EPS_MEDIAN: 90 } ])
  expect(result).toMatchObject({ status: 'completed', rules: ['C1', 'C3'], evidence: { kind: 'consensus', data: { estDt: '20261019', reportBaseDate: '20261020', source: 'infodb', schema: 'TYDW_FILESYNC', apiName: 'ASHARECONSENSUSDATA', reportedValue: 76, median: 67.0908, unit: '元', fallback: false } } })
  const profit = compareConsensusClaim({ ...claim, metric: 'NET_PROFIT', value: 950, unit: '亿元' }, [{ ...row, NET_PROFIT_MEDIAN: 8386900, NET_PROFIT_MIN: 8098000, NET_PROFIT_MAX: 8888400, NET_PROFIT_DEV: 201200 }])
  expect(profit.evidence.data).toMatchObject({ reportedValue: 9500000, unit: '万元' })
  expect(profit.rules).toEqual(['C1', 'C3'])
  expect(compareConsensusClaim({ ...claim, value: 120 }, [{ ...row, EPS_MIN: null, EPS_MAX: null, EPS_MEDIAN: 100, EPS_DEV: null }]).rules).toEqual([])
  expect(compareConsensusClaim({ ...claim, value: 120.01 }, [{ ...row, EPS_MIN: null, EPS_MAX: null, EPS_MEDIAN: 100, EPS_DEV: null }]).rules).toEqual(['C2'])
  expect(compareConsensusClaim(claim, [{ ...row, EST_DT: '2026-11-01' }, { ...row, EST_DT: '2026-10-19' }]).evidence.data).toMatchObject({ estDt: '20261019', fallback: false })
})

it('downgrades thin samples and missing fields, keeps zero/negative median rules independent, and labels latest fallbacks', async () => {
  const { compareConsensusClaim } = await load()
  expect(compareConsensusClaim(claim, [{ ...row, NUM_EST_INST: 4 }]).rules).toEqual(['C1'])
  for (const count of [null, 0, -1]) expect(compareConsensusClaim(claim, [{ ...row, NUM_EST_INST: count }]).rules).toEqual([])
  expect(compareConsensusClaim(claim, [{ ...row, EPS_MEDIAN: 90 }])).toMatchObject({ status: 'unavailable', rules: [] })
  for (const median of [null, '']) {
    const result = compareConsensusClaim(claim, [{ ...row, EPS_MEDIAN: median, EPS_MIN: null, EPS_MAX: null }])
    expect(result.rules).toEqual([])
    expect(result.status).toBe('partial')
  }
  expect(compareConsensusClaim(claim,[{...row,EPS_MEDIAN:0,EPS_MIN:null,EPS_MAX:null}]).rules).toEqual(['C3'])
  expect(compareConsensusClaim(claim,[{...row,EPS_MEDIAN:-10,EPS_MIN:null,EPS_MAX:null}]).rules).toEqual(['C2','C3'])
  expect(compareConsensusClaim({ ...claim, basis: '营业总收入' }, [row])).toMatchObject({ status: 'skipped', rules: [] })
  const fallback = compareConsensusClaim(claim, [{ ...row, EST_DT: '20261021' }])
  expect(fallback).toMatchObject({ status: 'partial', rules: ['C1','C3'], evidence: { data: { fallback: true, estDt: '20261021' } } })
  expect(fallback.detail).toContain('事后参考')
  expect(compareConsensusClaim(claim, [{ ...row, S_INFO_WINDCODE: '000001.SZ' }])).toMatchObject({ status: 'unavailable', rules: [] })
  expect(compareConsensusClaim(claim, [{ ...row, EST_DT: '20260230' }])).toMatchObject({ status: 'unavailable', rules: [] })
})

async function sourceFixture({ effect = 'read', deny = false, data = [row] } = {}) {
  const ctx = new Context(); new SystemPrompt(ctx, {}); new ToolRuntime(ctx)
  const agent = { id: 'session', session: { id: 'session', events: [] }, ctx }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined })
  const calls = []
  const binding = { id: 'actual_infodb_tool', connectionId: 'actual-source', description: 'infodb 只读 SQL 查询，执行 SELECT', inputSchema: { type: 'object', properties: { source: { type: 'string', enum: ['infodb'] }, schema: { type: 'string' }, sql: { type: 'string', description: '只读 SELECT SQL' } }, required: ['source', 'schema', 'sql'], additionalProperties: false }, schemaDigest: 'real-schema', enabled: true, effect }
  ctx.tools.register(createToolProxy(binding, { sync: async () => {}, contextFor: async current => { if (current !== agent) throw Error('not live'); return { sessionId: agent.id } }, authorize: () => { if (deny) throw Error('denied'); return { revision: 9 } }, request: async (path, body, signal) => { calls.push({ path, ...body }); const received = typeof data === 'function' ? await data(body, signal) : data; return { callId: body.callId, content: [{ type: 'text', text: JSON.stringify({ data: received }) }] } } } ))
  cleanups.push(() => ctx.fiber.dispose())
  return { ctx, agent, calls }
}

it('executes only a schema-confirmed read-only infodb query through the actual authorized proxy', async () => {
  const { reviewNoteConsensus } = await load(), f = await sourceFixture()
  const blocks = [{ id: 'forecast', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }]
  const result = await reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks }, new AbortController().signal)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0].evidence[0].data).toMatchObject({ toolName: 'ework__actual_infodb_tool', estDt: '20261019', rules: ['C1', 'C3'] })
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0]).toMatchObject({ path: '/execute', toolId: 'actual_infodb_tool', connectionRevision: 9, context: { sessionId: 'session' }, arguments: { source: 'infodb', schema: 'TYDW_FILESYNC' } })
  expect(f.calls[0].arguments.sql).toContain("S_INFO_WINDCODE = '600519.SH'")
  expect(f.calls[0].arguments.sql).toContain("EST_REPORT_DT = '20261231'")
  expect(f.calls[0].arguments.sql).toContain("EST_DT <= '20261020'")
  expect(f.agent.session.events).toEqual([])
})

it('never substitutes another tool or trusts a model-supplied dataset when a source is absent or unauthorized', async () => {
  const { reviewNoteConsensus } = await load()
  const input = { sessionId: 'session', blocks: [{ id: 'forecast', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。', type: 'paragraph' }] }
  for (const options of [{ effect: 'write' }, { deny: true }]) {
    const f = await sourceFixture(options), result = await reviewNoteConsensus(f.ctx, input, new AbortController().signal)
    expect(result.issues).toEqual([])
    expect(result.checks.some(check => check.status === 'unavailable')).toBe(true)
    expect(f.calls).toEqual([])
  }
  const result = await reviewNoteConsensus({ tools: { schemas: () => [] }, agents: { get: () => undefined } }, input, new AbortController().signal)
  expect(result.checks).toMatchObject([{ kind: 'consensus', status: 'unavailable' }])
})

it('rejects a source response that is truncated, misdated or contradictory instead of fabricating evidence', async () => {
  const { reviewNoteConsensus } = await load()
  const f = await sourceFixture({ data: [{ ...row, EPS_MEDIAN: 70 }, { ...row, EPS_MEDIAN: 90 }] })
  const result = await reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks: [{ id: 'f', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }] }, new AbortController().signal)
  expect(result.issues).toEqual([])
  expect(result.checks.some(check => check.status === 'unavailable')).toBe(true)
})

it('does not query unreviewed forecast targets when only a covered subset is requested', async () => {
  const { reviewNoteConsensus } = await load(), f = await sourceFixture()
  const blocks = [{ id: 'h', type: 'paragraph', text: '600519.SH 报告基准日20261020。' }, { id: 'a', type: 'paragraph', text: '预计2026年EPS 76元。' }, { id: 'b', type: 'paragraph', text: '预计2027年EPS 88元。' }]
  const result = await reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks, targetBlockIds: ['a'] }, new AbortController().signal)
  expect(result.issues).toHaveLength(1)
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].arguments.sql).not.toContain('20271231')
})

it('performs at most one latest fallback and clearly separates its comparison from a historical verdict', async () => {
  const { reviewNoteConsensus } = await load()
  const f = await sourceFixture({ data: body => body.arguments.sql.includes('EST_DT <=') ? [] : [{ ...row, EST_DT: '20261021' }] })
  const result = await reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks: [{ id: 'a', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }] }, new AbortController().signal)
  expect(f.calls).toHaveLength(2)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0].evidence[0].data).toMatchObject({fallback:true,rules:['C1','C3']})
  expect(result.checks).toMatchObject([{ kind: 'consensus', status: 'partial' }])
  expect(result.checks[0].detail).toContain('事后参考')
})
it.each([2029,2027])('distinguishes an uncovered period from missing covered data for year %s',async year=>{
  const {reviewNoteConsensus}=await load()
  const f=await sourceFixture({data:body=>body.arguments.sql.includes('AS FIRST_PERIOD')?[{FIRST_PERIOD:'19991231',LAST_PERIOD:'20281231'}]:[]})
  const result=await reviewNoteConsensus(f.ctx,{sessionId:'session',blocks:[{id:'f',type:'paragraph',text:`600519.SH 报告基准日20261020。预计${year}年EPS 76元。`}]},new AbortController().signal)
  expect(result.issues).toEqual([]);expect(f.calls).toHaveLength(3)
  expect(result.checks[0].detail).toContain(year===2029?'不在来源当前覆盖报告期':'位于当前覆盖范围内')
})
it('compares adjacent-year forecasts after both independently bounded date-aligned reads',async()=>{
  const {reviewNoteConsensus}=await load()
  const prior={...row,EST_REPORT_DT:'20251231',EPS_MEDIAN:72,EPS_MIN:60,EPS_MAX:80}
  const f=await sourceFixture({data:body=>[body.arguments.sql.includes("EST_REPORT_DT = '20251231'")?prior:row]})
  const result=await reviewNoteConsensus(f.ctx,{sessionId:'session',blocks:[{id:'meta',type:'paragraph',text:'600519.SH 报告基准日20261020。'},{id:'a',type:'paragraph',text:'预计2025年EPS 70元。'},{id:'b',type:'paragraph',text:'预计2026年EPS 76元。'}]},new AbortController().signal)
  expect(f.calls).toHaveLength(2)
  expect(result.issues.find(i=>i.blockId==='b').evidence[0].data.rules).toContain('C4')
})
it('explains a C4-only conflict with concrete report and market directions in the visible comment',async()=>{
  const {reviewNoteConsensus}=await load(),current={...row,EPS_MEDIAN:100,EPS_MIN:80,EPS_MAX:120,EPS_DEV:20},prior={...current,EST_REPORT_DT:'20251231',EPS_MEDIAN:110,EPS_MIN:70,EPS_MAX:130}
  const f=await sourceFixture({data:body=>[body.arguments.sql.includes("EST_REPORT_DT = '20251231'")?prior:current]})
  const result=await reviewNoteConsensus(f.ctx,{sessionId:'session',blocks:[{id:'meta',type:'paragraph',text:'600519.SH 报告基准日20261020。'},{id:'a',type:'paragraph',text:'预计2025年EPS 90元。'},{id:'b',type:'paragraph',text:'预计2026年EPS 100元。'}]},new AbortController().signal)
  const issue=result.issues.find(i=>i.blockId==='b')
  expect(issue.evidence[0].data.rules).toEqual(['C4'])
  expect(issue.message).toMatch(/报告.*增加10元/)
  expect(issue.message).toMatch(/一致预期.*减少10元/)
})
it('bounds both the as-of date and report coverage queries to the configured consensus cycle',async()=>{
  const {reviewNoteConsensus}=await load()
  const f=await sourceFixture({data:()=>[]})
  await reviewNoteConsensus(f.ctx,{sessionId:'session',blocks:[{id:'meta',type:'paragraph',text:'一致预期统计周期：180天'},{id:'f',type:'paragraph',text:'600519.SH 报告基准日20261020。预计2026年EPS76元。'}]},new AbortController().signal)
  expect(f.calls).toHaveLength(3)
  expect(f.calls.every(c=>c.arguments.sql.includes("CONSEN_DATA_CYCLE_TYP = '263003000'"))).toBe(true)
  expect(f.calls[0].arguments.sql.match(/CONSEN_DATA_CYCLE_TYP = '263003000'/g)).toHaveLength(2)
})

it('does not promote truncated data or mismatched codes into verified consensus evidence', async () => {
  const { reviewNoteConsensus } = await load()
  for (const data of [{ truncated: true, data: [row] }, { total: 5, rows: [row] }, [{ ...row, S_INFO_WINDCODE: '000001.SZ' }]]) {
    const f = await sourceFixture({ data })
    const result = await reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks: [{ id: 'a', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }] }, new AbortController().signal)
    expect(result.issues).toEqual([])
    expect(result.checks).toMatchObject([{ kind: 'consensus', status: 'unavailable' }])
    expect(f.calls).toHaveLength(1)
  }
})

it('stops source queries within budget and reports an unavailable check without retrying an unknown result', async () => {
  vi.useFakeTimers()
  const { reviewNoteConsensus } = await load(); let start, receivedSignal
  const started = new Promise(resolve => { start = resolve })
  const f = await sourceFixture({ data: async (_body, signal) => { receivedSignal = signal; start(); return new Promise(() => {}) } })
  const pending = reviewNoteConsensus(f.ctx, { sessionId: 'session', blocks: [{ id: 'a', type: 'paragraph', text: '600519.SH 报告基准日20261020。预计2026年EPS 76元。' }] }, new AbortController().signal)
  await started; await vi.advanceTimersByTimeAsync(4001)
  expect((await pending).checks).toMatchObject([{ kind: 'consensus', status: 'unavailable' }])
  expect(receivedSignal.aborted).toBe(true)
  expect(f.calls).toHaveLength(1)
})
