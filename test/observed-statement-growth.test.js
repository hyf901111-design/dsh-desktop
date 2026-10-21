import {expect,it,vi} from 'vitest'
import * as binding from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const report={secID:'600011.XSHG',ticker:'600011',exchangeCD:'XSHG',publishDate:'2026-08-19',endDateRep:'2026-06-30',endDate:'2026-06-30',reportType:'S1',fiscalPeriod:6,mergedFlag:'1',currencyCD:'CNY',accoutingStandards:'CHAS_2018',revenue:106909025871,nIncomeAttrP:6585729326}
const previous={...report,endDate:'2025-06-30',revenue:112032082664,nIncomeAttrP:9261884951}
const record={tool:'ework__observed_business_query',args:{http_method:'GET',nameEn:'getFdmtISLT2018',url_params:{ticker:'600011'}},response:{retCode:1,data:[report,previous]}}
const model={version:1,type:'market',variant:'table',asOf:'2026-10-21 · 静态快照',title:'已取得财务对比',columns:['证券代码 / 简称','报告期（最新定期报告）','营业收入（亿元）','收入同比（计算值）','归母净利润（亿元）','归母同比（计算值）'],rows:[['600011.SH 华能国际','2026年半年报（2026-06-30止）','1,069.09','-4.57%（vs 2025H1 1,120.32亿元）','65.86','-28.90%（vs 2025H1 92.62亿元）']],note:'保留原始单位、报告日期及来源。'}
const restore=(input=model,sources=[record])=>binding.restoreSnapshotStatementGrowth?.(JSON.stringify(input),sources)

const inlineNative=()=>({version:1,type:'market',variant:'table',title:'财务与经营对比',columns:['公司（代码）','最新报告期（披露日）','营业收入','归母净利润','收入同比（计算值）','归母净利同比（计算值）','经营数据（另行披露口径）'],rows:[['华能国际 600011.SH','2026年半年报（2026-08-19披露，合并口径）','1,069.09亿元（106,909,025,871元）','65.86亿元（6,585,729,326元）','-4.57%（上年同期1,120.32亿元）','-28.91%（上年同期92.62亿元）','2026H1境内上网电量1,995.78亿千瓦时；截至2026-06-30可控装机158,779兆瓦（2026-07-16公告），2026-08-19补充经营披露']],note:'财务为2026年半年报，经营披露日期另行保留。'})

const longNative=()=>({version:1,type:'market',variant:'table',asOf:'2026-10-21',title:'财务与经营',columns:['公司（代码）','指标','数值','同比','报告期 / 披露日期','来源与口径'],rows:[
 ['华能国际（600011.SH）','营业收入','1,069.09亿元','-4.57%（计算值）','2026年半年报（2026-06-30），披露2026-08-19','通联合并利润表，合并口径，人民币'],
 ['华能国际（600011.SH）','归母净利润','65.86亿元','-28.90%（计算值，基期2025H1为92.62亿元）','2026年半年报（2026-06-30），披露2026-08-19','同上；基本EPS 0.35元'],
 ['华能国际（600011.SH）','上网电量','1,995.78亿千瓦时','-2.97%（公司披露）','2026年上半年；2026-07-16发布','公司经营公告']
],note:'保留经营数据的单独日期、原文口径和缺失说明。'})
const withParent=()=>({...record,response:{retCode:1,data:[...record.response.data,{...report,mergedFlag:'0',revenue:11867042695,nIncomeAttrP:8085574406},{...previous,mergedFlag:'0',revenue:12652570323,nIncomeAttrP:3648679963}]}})

it.each(['same-amounts','wrong-raw-amount','wrong-rounded-amount','wrong-metric-label'])('matches the observed original-value headers and repeated inline metric labels conservatively: %s',mode=>{
 const input=inlineNative()
 input.columns[2]='营业收入（原始值）';input.columns[3]='归母净利润（原始值）'
 input.rows[0][2]='营业收入 1,069.09亿元（106,909,025,871元，人民币）'
 input.rows[0][3]='归母净利润 65.86亿元（6,585,729,326元）'
 if(mode==='wrong-raw-amount')input.rows[0][3]='归母净利润 65.86亿元（6,585,729,325元）'
 if(mode==='wrong-rounded-amount')input.rows[0][3]='归母净利润 66.86亿元（6,585,729,326元）'
 if(mode==='wrong-metric-label')input.rows[0][3]='营业收入 65.86亿元（6,585,729,326元）'
 const text=restore(input,[withParent()])
 if(mode==='same-amounts'){
  expect(text).toBeTypeOf('string');const corrected=JSON.parse(text)
  expect(corrected.rows[0][5]).toBe('-28.89%（上年同期92.62亿元）');expect(corrected.rows[0].slice(0,5)).toEqual(input.rows[0].slice(0,5))
 }else expect(text).toBeUndefined()
})

it('corrects the observed long-form metric rows and distinguishes same-date parent and consolidated statements by their unchanged amounts',()=>{
 const input=longNative(),source=withParent(),before=JSON.stringify({input,source}),text=restore(input,[source])
 expect(text).toBeTypeOf('string');const corrected=JSON.parse(text)
 expect(corrected.rows[1][3]).toBe('-28.89%（计算值，基期2025H1为92.62亿元）')
 expect(corrected.rows[0]).toEqual(input.rows[0]);expect(corrected.rows[2]).toEqual(input.rows[2])
 expect(corrected.rows[1].filter((_,i)=>i!==3)).toEqual(input.rows[1].filter((_,i)=>i!==3))
 expect(corrected.note).toContain('9261884951');expect(JSON.stringify({input,source})).toBe(before)
 expect(restore(corrected,[source])).toBeUndefined()
})

it('still corrects the wide layout when an observed response includes both parent and consolidated rows',()=>{
 expect(JSON.parse(restore(model,[withParent()])).rows[0][5]).toContain('-28.89%')
})

it.each(['wrong-disclosure','swapped-date-labels','wrong-labelled-period','wrong-labelled-disclosure','date-range','wrong-amount','unknown-unit','reported','ambiguous-value','ambiguous-metric','ambiguous-statement','conflicting-scope'])('keeps ambiguous or conflicting long-form financial evidence untouched: %s',mode=>{
 const input=longNative(),source=withParent();input.rows=[input.rows[1]]
 if(mode==='wrong-disclosure')input.rows[0][4]='2026年半年报（2026-06-30），披露2026-08-20'
 if(mode==='swapped-date-labels')input.rows[0][4]='2026年半年报（2026-08-19），披露2026-06-30'
 if(mode==='wrong-labelled-period')input.rows[0][4]='2026年半年报，截至2026-08-19'
 if(mode==='wrong-labelled-disclosure')input.rows[0][4]='2026年半年报，披露2026-06-30'
 if(mode==='date-range')input.rows[0][4]='2026-06-30 至 2026-08-19'
 if(mode==='wrong-amount')input.rows[0][2]='66.86亿元'
 if(mode==='unknown-unit')input.rows[0][2]='65.86'
 if(mode==='reported')input.rows[0][3]='-28.90%（公司披露）'
 if(mode==='ambiguous-value'){input.columns.push('金额');input.rows[0].push('65.86亿元')}
 if(mode==='ambiguous-metric'){input.columns.push('财务指标');input.rows[0].push('归母净利润')}
 if(mode==='ambiguous-statement')source.response.data[2].nIncomeAttrP=report.nIncomeAttrP
 if(mode==='conflicting-scope')input.rows[0][5]='母公司利润表，非合并口径'
 expect(restore(input,[source])).toBeUndefined()
})

it('corrects the actual native period-label and inline-unit layout without treating distinct operating dates as statement dates',()=>{
 const input=inlineNative(),before=JSON.stringify(input),text=restore(input)
 expect(text).toBeTypeOf('string')
 const corrected=JSON.parse(text)
 expect(corrected.rows[0][5]).toBe('-28.89%（上年同期92.62亿元）')
 expect(corrected.rows[0].slice(0,5)).toEqual(input.rows[0].slice(0,5))
 expect(corrected.rows[0][6]).toBe(input.rows[0][6])
 expect(corrected.note).toContain('9261884951')
 expect(JSON.stringify(input)).toBe(before)
 expect(restore(corrected)).toBeUndefined()
})

it.each(['wrong-publication','wrong-year','conflicting-period','wrong-rounded-amount','wrong-raw-amount','unknown-unit','ambiguous-amount'])('does not infer statement identity or units from a convenient inline representation: %s',mode=>{
 const input=inlineNative()
 if(mode==='wrong-publication')input.rows[0][1]='2026年半年报（2026-08-20披露）'
 if(mode==='wrong-year')input.rows[0][1]='2025年半年报（2026-08-19披露）'
 if(mode==='conflicting-period')input.rows[0][1]='2026年半年报（2026-03-31）'
 if(mode==='wrong-rounded-amount')input.rows[0][3]='66.86亿元（6,585,729,326元）'
 if(mode==='wrong-raw-amount')input.rows[0][3]='65.86亿元（6,585,729,327元）'
 if(mode==='unknown-unit')input.rows[0][3]='65.86（6,585,729,326）'
 if(mode==='ambiguous-amount'){input.columns.push('归母净利');input.rows[0].push(input.rows[0][3])}
 expect(restore(input)).toBeUndefined()
})

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

it('recognizes the actual native layout with computed markers in each growth cell and unmarked metric aliases in the headers',()=>{
 const input=structuredClone(model)
 input.columns=['证券代码 / 简称','报告期（合并口径）','营业收入（亿元）','营收同比','归母净利润（亿元）','归母净利同比']
 input.rows[0][3]='-4.57%（计算值，基期2025H1营收1,120.32亿元）'
 input.rows[0][5]='-28.90%（计算值，基期2025H1归母92.62亿元）'
 const text=restore(input);expect(text).toBeTypeOf('string')
 expect(JSON.parse(text).rows[0][5]).toBe('-28.89%（计算值，基期2025H1归母92.62亿元）')
 input.rows[0][3]='-4.57%（披露值）';input.rows[0][5]='-28.90%（披露值）'
 expect(restore(input)).toBeUndefined()
})

it('uses raw decimal amounts for the third native company rather than its displayed rounded base',()=>{
 const input=structuredClone(model),source=structuredClone(record)
 source.response.data.forEach(row=>{row.secID='600795.XSHG';row.ticker='600795';row.publishDate='2026-08-18'})
 Object.assign(source.response.data[0],{revenue:79029113601.09,nIncomeAttrP:3013976240.14})
 Object.assign(source.response.data[1],{revenue:77654698561.51,nIncomeAttrP:3686597723.51})
 input.columns=['证券代码 / 简称','报告期（合并口径）','营业收入（亿元）','营收同比','归母净利润（亿元）','归母净利同比']
 input.rows[0]=['600795.SH 国电电力','2026年半年报（截至2026-06-30）','790.29','+1.77%（计算值）','30.14','-18.24%（计算值，基期2025H1归母36.87亿元）']
 const text=restore(input,[source]);expect(text).toBeTypeOf('string')
 expect(JSON.parse(text).rows[0][5]).toBe('-18.25%（计算值，基期2025H1归母36.87亿元）')
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


it('anchors free-form presentation columns to the observed security, report date and original amounts, and corrects a duplicated calculated narrative',()=>{
 const input=structuredClone(model),source=structuredClone(record)
 source.response.data.forEach(row=>{row.secID='600795.XSHG';row.ticker='600795';row.publishDate='2026-08-18'})
 Object.assign(source.response.data[0],{revenue:79029113601.09,nIncomeAttrP:3013976240.14})
 Object.assign(source.response.data[1],{revenue:77654698561.51,nIncomeAttrP:3686597723.51})
 input.columns=['公司（代码）','最新报告期','披露日期','营业收入（亿元）','营收同比','归母净利润（亿元）','归母净利同比','经营数据']
 input.rows=[['国电电力（600795.SH）','2026年半年报（截至2026-06-30）','2026-08-18','790.29','+1.8%（计算值，基期2025H1营收776.55亿元）','30.14','-18.3%（计算值，基期2025H1归母净利36.87亿元）','未取得装机数据']]
 input.note='单位：亿元，原始来源保留。营收同比：国电+1.8%；归母净利同比：国电-18.3%。装机数据缺失，未使用模拟值。行业2025年净利下滑18.3%，这不是该公司同期基数。'
 const text=restore(input,[source]);expect(text).toBeTypeOf('string')
 const data=JSON.parse(text)
 expect(data.rows[0][4]).toBe('+1.77%（计算值，基期2025H1营收776.55亿元）')
 expect(data.rows[0][6]).toBe('-18.25%（计算值，基期2025H1归母净利36.87亿元）')
 expect(data.rows[0][7]).toBe('未取得装机数据')
 expect(data.note).not.toContain('国电-18.3%')
 expect(data.note).toContain('600795.SH -18.25%')
 expect(data.note).toContain('装机数据缺失，未使用模拟值。')
 expect(data.note).toContain('行业2025年净利下滑18.3%，这不是该公司同期基数。')
 expect(restore(data,[source])).toBeUndefined()
})

it.each(['wrong-publication','second-security-cell','unknown-date','second-matching-period'])('does not resolve ambiguous free-form row identity by choosing a convenient column: %s',mode=>{
 const input=structuredClone(model)
 input.columns=['标的','本期','附加内容',...input.columns.slice(2)]
 input.rows[0]=[input.rows[0][0],input.rows[0][1],'2026-08-19',...input.rows[0].slice(2)]
 if(mode==='wrong-publication')input.rows[0][2]='2026-08-20'
 if(mode==='second-security-cell')input.rows[0][2]='对照 600027.SH'
 if(mode==='unknown-date')input.rows[0][2]='2026-07-01'
 if(mode==='second-matching-period')input.rows[0][2]='2025-06-30'
 expect(restore(input)).toBeUndefined()
})

it('keeps reported narrative percentages and unrelated or ambiguous calculation clauses untouched',()=>{
 const input=structuredClone(model)
 input.note='归母同比（披露值）：华能-28.90%；归母同比：华能-99.99%；营收同比：行业-4.57%；归母同比：华-28.90%；报告2026-08-19，原始单位元。'
 const data=JSON.parse(restore(input))
 expect(data.note).toContain(input.note)
 expect(data.rows[0][5]).toContain('-28.89%')
})

it('repairs duplicated calculated summaries for every observed company without changing directly reported growth',()=>{
 const source=structuredClone(record),other=structuredClone(record),input=structuredClone(model)
 other.response.data.forEach(row=>{row.secID='600027.XSHG';row.ticker='600027';row.publishDate='2026-08-28'})
 Object.assign(other.response.data[0],{revenue:54264438000,nIncomeAttrP:3104884000})
 Object.assign(other.response.data[1],{revenue:59952634000,nIncomeAttrP:3903877000})
 input.rows.push(['华电国际 600027.SH','2026-06-30','542.64','-9.49%','31.05','-20.46%'])
 input.note='归母同比：华能-28.90%、华电-20.46%；营收同比：华能-4.57%、华电-9.49%。来源、日期和单位元保留。'
 const data=JSON.parse(restore(input,[source,other]))
 expect(data.note).not.toContain('华能-28.90%');expect(data.note).not.toContain('华电-20.46%')
 expect(data.note).toContain('600011.SH -28.89%');expect(data.note).toContain('600027.SH -20.47%')
 expect(data.note).toContain('来源、日期和单位元保留。')
 expect(restore(data,[source,other])).toBeUndefined()
})


it('applies the source-anchored correction through normal runtime acceptance for freely named columns, with one model call',async()=>{
 const input=structuredClone(model)
 input.columns=['标的（含交易所）','期间','营业收入（亿元）','营收同比','归母净利润（亿元）','归母净利同比']
 input.rows[0][5]='-28.90%（计算值）'
 input.note='归母净利同比：华能-28.90%。原始披露来源与装机缺失说明保留。'
 const start=vi.fn(async()=>({childSessionId:'free-layout-child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(input)}],sourceRecords:[record]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'free-layout-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'table',kind:'container',prompt:'工作台：火电分析\n本面板：财务差异\n优先使用 market 类型；variant: table。最新已披露财务指标及同比，仅静态快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'free-layout-task'}).state).toBe('completed'))
  const output=JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'free-layout-task'}).finalOutput),data=readTemplateModel(output).data
  expect(data.rows[0][5]).toBe('-28.89%（计算值）')
  expect(data.note).toContain('600011.SH -28.89%')
  expect(data.note).not.toContain('华能-28.90%')
  expect(data.note).toContain('原始披露来源与装机缺失说明保留。')
  expect(start).toHaveBeenCalledOnce()
 }finally{await runtime.dispose()}
})
