import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

const row={S_INFO_WINDCODE:'600519.SH',EST_REPORT_DT:'20261231',EST_DT:'20261019',CONSEN_DATA_CYCLE_TYP:'263002000',NUM_EST_INST:45,EPS_AVG:67.3481,EPS_MEDIAN:67.0908,EPS_MIN:64.7795,EPS_MAX:71.1026,EPS_DEV:1.6094,NET_PROFIT_MEDIAN:8386900,NET_PROFIT_MIN:8097961,NET_PROFIT_MAX:8888400,NET_PROFIT_DEV:201182.2346}
function fixture(text){
 const calls=[],agent={id:'forecast-completion',session:{id:'forecast-completion'}},parameters={type:'object',properties:{source:{type:'string'},schema:{type:'string'},sql:{type:'string',description:'SELECT SQL'}},required:['source','schema','sql']}
 const ctx={agents:{get:()=>agent},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{routable:true,current:{provider:'qa',model:'qa'}}}})}},tools:{
  schemas:()=>[{name:'ework__qa_infodb_read',description:'infodb read-only SQL SELECT'}],get:()=>({parameters,presentCall:()=>({kind:'read'})}),
  execute:async call=>{calls.push(call);return{content:[{type:'text',text:JSON.stringify([row])}]}}
 },llm:{stream:async function*(options){const payload=JSON.parse(options.messages[0].content[0].text);yield{type:'text-delta',index:0,text:JSON.stringify({reviews:payload.targets.map(target=>({reviewKey:target.reviewKey,issues:[]}))})};yield{type:'finish',reason:{kind:'stop'}}}}}
 const blocks=[{id:'meta',type:'paragraph',text:'研究标的：贵州茅台600519.SH。报告基准日：2026年10月20日。一致预期偏离阈值：12%。一致预期统计周期：90天。'},{id:'forecast',type:'paragraph',text}]
 return{ctx,calls,input:{sessionId:agent.id,requestId:'forecast-completion-review',action:'review',level:2,title:'研究笔记',blocks,changedIds:blocks.map(block=>block.id)}}
}
beforeEach(()=>vi.spyOn(console,'warn').mockImplementation(()=>{}))
afterEach(()=>vi.restoreAllMocks())

it('does not count a generic forecast heading and valuation explanation as a third unparsed metric',async()=>{
 const f=fixture('第3章 盈利预测 / 表3-1：预计2026年归母净利润950亿元，EPS为76.00元。我们暂按这一盈利假设测算估值，但尚未展示与同期市场一致预期的比较，也未说明收入或利润率假设与市场预期的差异。')
 const result=await generateNoteChallenge(f.ctx,f.input)
 expect(f.calls).toHaveLength(1)
 expect(result.issues.filter(issue=>issue.category==='research')).toHaveLength(2)
 expect(result.issues.every(issue=>issue.evidence[0].data.rules.join('/')==='C1/C2/C3')).toBe(true)
 expect(result.checks.filter(check=>check.kind==='consensus')).toHaveLength(2)
 expect(result.checks.filter(check=>check.kind==='consensus').every(check=>check.status==='completed')).toBe(true)
 expect(result.completeBlockIds).toContain('forecast')
})

it('compares explicitly forecast adjacent years in one sentence and completes only after both source queries',async()=>{
 const f=fixture('我们预计2026年归母净利润为950亿元，预计2027年归母净利润为900亿元。我们认为下一年度盈利会下降，但尚未提供收入、成本和利润率假设。')
 f.ctx.tools.execute=async call=>{
  f.calls.push(call)
  const next=call.arguments.sql.includes("EST_REPORT_DT = '20271231'")
  return{content:[{type:'text',text:JSON.stringify([next?{...row,EST_REPORT_DT:'20271231',NET_PROFIT_MEDIAN:9000000,NET_PROFIT_MIN:8500000,NET_PROFIT_MAX:9700000,NET_PROFIT_DEV:100000}:row])}]}
 }
 const result=await generateNoteChallenge(f.ctx,f.input)
 expect(f.calls).toHaveLength(2)
 expect(f.calls.every(call=>call.arguments.sql.includes("EST_DT <= '20261020'"))).toBe(true)
 const next=result.issues.find(issue=>issue.evidence[0]?.data.forecastYear===2027)
 expect(next.evidence[0].data).toMatchObject({rules:['C4'],direction:{kind:'adjacent-year',previousYear:2026,reportedChange:-500000,consensusChange:613100}})
 expect(result.checks.filter(check=>check.kind==='consensus').every(check=>check.status==='completed')).toBe(true)
 expect(result.completeBlockIds).toContain('forecast')
})

it.each([
 '预计2026年EPS76元，预计2027年目标价为1500元。',
 '预计2026年EPS76元，预计2027年资本开支为90亿元。',
 '盈利预测：预计2026年EPS76元。',
 '盈利预测 / 估值测算：预计2026年EPS76元。',
 '预计2026年EPS76元；以上盈利假设仅用于估值测算。'
])('does not manufacture an additional metric from a generic title or explanation: %s',async text=>{
 const f=fixture(text),result=await generateNoteChallenge(f.ctx,f.input)
 expect(result.checks.filter(check=>check.kind==='consensus')).toEqual([expect.objectContaining({status:'completed'})])
 expect(result.completeBlockIds).toContain('forecast')
})

it.each([
 '预计2026年EPS76元，预计2027年为75元。',
 '预计2026年EPS76元，预计2026年为75元。',
 '预计2026年归母净利润950亿元，预计2027年为900亿元。',
 'Forecast FY2026 EPS76元, forecast FY2027 at 75元。',
 '预计2026年EPS76元，归母净利润继续增加。',
 '预计2026年EPS76元，归母净利润950（尚未给单位）。',
 '预计2026年EPS76元。预计2026年盈利100亿元。',
 '预计2026年EPS76元。2026年盈利预测为100亿元。',
 '预计2026年EPS76元。预计2026年盈利预测继续增加。',
 '预计2026年EPS76元。预计2026年扣非归母净利润950亿元。',
 '预计2026年EPS76元。预计2026年上半年归母净利润500亿元。'
])('keeps a real unresolved metric or incompatible forecast basis incomplete: %s',async text=>{
 const f=fixture(text),result=await generateNoteChallenge(f.ctx,f.input)
 expect(result.checks).toContainEqual(expect.objectContaining({kind:'consensus',status:'partial',detail:expect.stringContaining('部分年度盈利预测')}))
 expect(result.completeBlockIds).not.toContain('forecast')
 expect(result.issues.filter(issue=>issue.category==='research')).toHaveLength(1)
})
