import {expect,it,vi} from 'vitest'
import * as binding from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const report={secID:'600011.XSHG',ticker:'600011',exchangeCD:'XSHG',publishDate:'2026-08-19',endDateRep:'2026-06-30',endDate:'2026-06-30',reportType:'S1',fiscalPeriod:6,mergedFlag:'1',currencyCD:'CNY',accoutingStandards:'CHAS_2018',revenue:106909025871,nIncomeAttrP:6585729326}
const previous={...report,endDate:'2025-06-30',revenue:112032082664,nIncomeAttrP:9261884951}
const record={tool:'ework__observed_business_query',args:{http_method:'GET',nameEn:'getFdmtISLT2018',url_params:{ticker:'600011'}},response:{retCode:1,data:[report,previous]}}
const model={version:1,type:'market',variant:'table',asOf:'2026-10-21 · 静态快照',title:'已取得财务对比',columns:['证券代码 / 简称','报告期（最新定期报告）','营业收入（亿元）','收入同比（计算值）','归母净利润（亿元）','归母同比（计算值）'],rows:[['600011.SH 华能国际','2026年半年报（2026-06-30止）','1,069.09','-4.57%（vs 2025H1 1,120.32亿元）','65.86','-28.90%（vs 2025H1 92.62亿元）']],note:'保留原始单位、报告日期及来源。'}
const restore=(input=model,sources=[record])=>binding.restoreSnapshotStatementGrowth?.(JSON.stringify(input),sources)

it('recalculates explicitly computed YoY from full-precision same-report comparative amounts, preserving rows and source text without mutation',()=>{
 const before=JSON.stringify({model,record}),text=restore()
 expect(text).toBeTypeOf('string')
 const data=JSON.parse(text)
 expect(data.rows[0][5]).toBe('-28.89%（vs 2025H1 92.62亿元）')
 expect(data.rows[0].slice(0,5)).toEqual(model.rows[0].slice(0,5))
 expect(data.note).toContain('原始金额');expect(data.note).toContain('6585729326');expect(data.note).toContain('9261884951')
 expect(data.note).toContain('2026-06-30');expect(data.note).toContain('2025-06-30')
 expect(JSON.stringify({model,record})).toBe(before)
 expect(restore(data)).toBeUndefined()
})

it('rounds the actual second native regression and exact half values only after calculating from raw amounts',()=>{
 const input=structuredClone(model),source=structuredClone(record)
 source.response.data.forEach(row=>{row.secID='600027.XSHG';row.ticker='600027'})
 Object.assign(source.response.data[0],{revenue:54264438000,nIncomeAttrP:3104884000})
 Object.assign(source.response.data[1],{revenue:59952634000,nIncomeAttrP:3903877000})
 source.args.url_params.ticker='600027'
 input.rows[0]=['600027.SH 华电国际','2026年半年报（2026-06-30止）','542.64','-9.49%','31.05','-20.46%']
 expect(JSON.parse(restore(input,[source])).rows[0][5]).toBe('-20.47%')
 Object.assign(source.response.data[0],{nIncomeAttrP:19899})
 Object.assign(source.response.data[1],{nIncomeAttrP:20000})
 input.columns[4]='归母净利润（元）';input.rows[0][4]='19899';input.rows[0][5]='-0.50%'
 expect(JSON.parse(restore(input,[source])).rows[0][5]).toBe('-0.51%')
})

it.each([0,-100])('keeps raw zero/negative comparative bases explicit instead of displaying ordinary YoY: %s',base=>{
 const source=structuredClone(record);source.response.data[1].nIncomeAttrP=base
 const text=restore(model,[source]);expect(text).toBeTypeOf('string')
 const value=JSON.parse(text).rows[0][5]
 expect(value).toContain('不适用');expect(value).toContain(String(base));expect(value).not.toContain('-28.90%')
})

it.each(['currency','merged','standard','report-span','report-date','report-type','ambiguous','wrong-amount','wrong-company','wrong-period','failed','discovery','other-api','reported-growth','unmarked-growth'])('does not guess financial correspondence or overwrite reported growth: %s',mode=>{
 const input=structuredClone(model),source=structuredClone(record)
 const prior=source.response.data[1]
 if(mode==='currency')prior.currencyCD='USD'
 if(mode==='merged')prior.mergedFlag='0'
 if(mode==='standard')prior.accoutingStandards='OTHER'
 if(mode==='report-span')prior.fiscalPeriod=3
 if(mode==='report-date')prior.endDateRep='2025-06-30'
 if(mode==='report-type')prior.reportType='Q1'
 if(mode==='ambiguous')source.response.data.push({...prior,nIncomeAttrP:999})
 if(mode==='wrong-amount'){input.rows[0][2]='888.88';input.rows[0][4]='99.99'}
 if(mode==='wrong-company')input.rows[0][0]='600027.SH 华电国际'
 if(mode==='wrong-period')input.rows[0][1]='2026-03-31'
 if(mode==='failed')source.response.retCode=-1
 if(mode==='discovery')source.purpose='discovery'
 if(mode==='other-api')source.args.nameEn='otherAPI'
 if(mode==='reported-growth')input.columns=input.columns.map(c=>c.replace('计算值','披露值'))
 if(mode==='unmarked-growth')input.columns=input.columns.map(c=>c.replace('（计算值）',''))
 expect(restore(input,[source])).toBeUndefined()
})

it('keeps a full existing source note when computed-cell provenance exceeds the note limit',()=>{
 const input=structuredClone(model);input.note='保留来源说明。'.repeat(280)
 const text=restore(input);expect(text).toBeTypeOf('string')
 const data=JSON.parse(text)
 expect(data.note).toBe(input.note)
 expect(data.rows[0][5]).toContain('-28.89%')
 expect(data.rows[0][5]).toContain('原始金额')
 expect(restore(data)).toBeUndefined()
})

it.each(['duplicate-id','duplicate-period','unsafe','missing-standard','missing-merged','unrelated-type','conflicting-source'])('leaves unsupported or ambiguous observed data unchanged: %s',mode=>{
 const input=structuredClone(model),source=structuredClone(record),sources=[source]
 if(mode==='duplicate-id')input.rows[0][0]+=' / 600011.SH'
 if(mode==='duplicate-period')input.rows[0][1]+=' / 2025-06-30'
 if(mode==='unsafe')source.response.data[0].nIncomeAttrP=Number.MAX_SAFE_INTEGER+1
 if(mode==='missing-standard')delete source.response.data[0].accoutingStandards
 if(mode==='missing-merged')delete source.response.data[0].mergedFlag
 if(mode==='unrelated-type')input.type='news'
 if(mode==='conflicting-source'){const other=structuredClone(source);other.response.data[1].nIncomeAttrP=999;sources.push(other)}
 expect(restore(input,sources)).toBeUndefined()
})

it('normalizes the runtime output without a second model generation and still renders the original component kind',async()=>{
 const start=vi.fn(async()=>({childSessionId:'child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(model)}],sourceRecords:[record]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'statement-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'table',kind:'container',prompt:'工作台：火电分析\n本面板：财务差异\n优先使用 market 类型；variant: table。最新已披露财务指标及同比，仅静态快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'statement-task'}).state).toBe('completed'))
  const output=JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'statement-task'}).finalOutput)
  expect(readTemplateModel(output).data.rows[0][5]).toBe('-28.89%（vs 2025H1 92.62亿元）')
  expect(start).toHaveBeenCalledOnce()
 }finally{await runtime.dispose()}
})
