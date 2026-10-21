import {it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {expandBusinessEvidence} from '../packages/dsh-research-task-runtime/component-source-projection.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const observed=JSON.parse(readFileSync(new URL('./fixtures/statement-table-evidence/compute-b-observed.json',import.meta.url),'utf8'))
const records=observed.records.map(record=>({...record,response:expandBusinessEvidence(record.response)}))
const request='工作台：算力产业链观察\n本面板：最新已披露财务经营指标\n使用实际 DataYes 财务响应比较300308.SZ、300502.SZ、601138.SH的营业收入和同比、归母净利润和同比、销售毛利率、加权平均ROE、经营活动现金流净额。保持三家公司与全部指标，未取得如实说明。\n仅生成本面板，优先使用 market 类型，variant 为 table。'
const clone=value=>structuredClone(value)
async function run(outputs,{sources=records,secondThrows=false}={}){
 const calls=[]
 const runtime=new ResearchTaskRuntime({adapter:{start:async options=>{
  calls.push(options)
  if(secondThrows&&calls.length===2)throw new Error('repair transport failed')
  return {childSessionId:'evidence-'+calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(outputs[Math.min(calls.length-1,outputs.length-1)])}],sourceRecords:calls.length===1?sources:[]})}
 },dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:request})
 await vi.waitFor(()=>expect(['completed','failed','cancelled']).toContain(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state))
 const result=runtime.inspect({parentSessionId:'parent',taskId:'task'}); await runtime.dispose();return {result,calls}
}
it('rejects the actual same-period financial errors instead of completing the observed table twice',async()=>{
 const {result,calls}=await run([observed.artifact])
 expect(result.state).toBe('failed')
 expect(calls).toHaveLength(2)
 expect(result.error).toMatch(/300502|nCFOpa|现金流/u)
})

import {statementTableEvidenceIssue as issue} from '../packages/dsh-research-task-runtime/statement-table-evidence.js'
import {retainTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const corrected=()=>({...clone(observed.artifact),rows:[
 ['300308.XSHE 中际旭创（深交所）','2026-06-30（半年报）/ 2026-08-22 披露','417.78 / +182.49%','136.51 / +241.70%','46.25%','37.62%','本次未取得'],
 ['300502.XSHE 新易盛（深交所）','2026-06-30（半年报）/ 2026-08-25 披露','209.10 / +100.34%','75.29 / +90.98%','48.44%','34.86%','本次未取得'],
 ['601138.XSHG 工业富联（上交所）','2026-06-30（半年报）/ 2026-08-12 披露','5,578.61 / +54.64%','237.40 / +95.99%','7.15%','13.36%','本次未取得']
 ],asOf:'来源：DataYes getFdmtISLT2018合并利润表与getFdmtMainDataLt；静态快照',note:'本次未查询 getFdmtCFLT，经营活动现金流净额未取得；其余财务字段来自同公司同报告期合并口径，金额由人民币元换算亿元，同比直接取接口字段。'})
const singleRequest='DataYes 300502.SZ 财务指标'
const singleSources=()=>records.filter(record=>record.args.url_params.ticker==='300502').map(record=>({...clone(record),response:{...clone(record.response),data:record.response.data.filter(row=>row.endDate==='2026-06-30'&&row.endDateRep==='2026-06-30'&&row.mergedFlag==='1').map(clone)}}))
const table=(header='销售毛利率',value='48.44%')=>({version:1,type:'table',title:'财务指标',columns:['公司','报告期',header],rows:[['300502.SZ 新易盛','2026-06-30',value]],note:'来源：DataYes；合并口径'})
it('finds each actual wrong growth/ROE/margin and absent cash amount with company and actual period',()=>{
 const error=issue(observed.artifact,request,records)
 for(const field of ['revenueYoy','niAttrPYoy','grossMargin','roeW','nCFOpa'])expect(error).toContain(field)
 for(const code of ['300308.XSHE','300502.XSHE','601138.XSHG'])expect(error).toContain(code)
 expect(error).toContain('2026-06-30');expect(error).toContain('getFdmtCFLT')
})
it('accepts a manually corrected full observed table without changing any company or column',()=>expect(issue(corrected(),request,records)).toBeUndefined())
it.each([['48.44%',48.4397],['48.4397%',48.4397],['0.00%',0],['-12.35%',-12.345],['1.01%',1.005],['48.439700%',48.4397]])('respects displayed decimal rounding %s and signed zero-safe raw %s',(display,raw)=>{
 const sources=singleSources();sources[0].response.data[0].grossMargin=raw
 expect(issue(table('毛利率',display),singleRequest,sources)).toBeUndefined()
})
it.each([['100.34%', '营业收入同比'],['90.98%','归母净利润同比'],['34.86%','加权平均ROE']])('checks independent percentage columns %s %s',(value,header)=>expect(issue(table(header,value),singleRequest,singleSources())).toBeUndefined())
it.each([['元','20909746962.20'],['万元','2090974.696220'],['亿元','209.097469622']])('checks %s conversion while keeping the financial guard active',(unit,value)=>{
 const data=table(`营业收入（${unit}）`,value);data.columns.push('加权ROE');data.rows[0].push('34.86%')
 expect(issue(data,singleRequest,singleSources())).toBeUndefined()
})
it.each([['grossMargin',null],['grossMargin',undefined]])('does not turn %s %s into zero or infer it',(field,value)=>{
 const sources=singleSources();if(value===undefined)delete sources[0].response.data[0][field];else sources[0].response.data[0][field]=value
 expect(issue(table('毛利率','0%'),singleRequest,sources)).toMatch(/null|缺少/u)
 expect(issue(table('毛利率','来源未提供'),singleRequest,sources)).toBeUndefined()
})
it('does not silently mark already obtained fields as missing to evade validation',()=>expect(issue(table('毛利率','本次未取得'),singleRequest,singleSources())).toContain('已取得'))
it.each(['company','period','identity','unknown-period','disclosure-only'])('rejects %s correspondence even when the numeric value occurs elsewhere',mode=>{
 const data=table(),sources=singleSources()
 if(mode==='company')sources[0].response.data[0]={...sources[0].response.data[0],ticker:'300308',secID:'300308.XSHE'}
 if(mode==='period')sources[0].response.data[0].endDate='2025-06-30'
 if(mode==='identity')data.rows[0][0]='新易盛'
 if(mode==='unknown-period')data.rows[0][1]='最新半年报'
 if(mode==='disclosure-only'){data.columns[1]='披露日期';data.rows[0][1]='2026-08-25'}
 expect(issue(data,singleRequest,sources)).toMatch(/证券|期间|报告期/u)
})
it.each(['revision','scope','value'])('rejects ambiguous %s without first-row-wins',mode=>{
 const data=table(),sources=singleSources(),duplicate=clone(sources[0].response.data[0])
 if(mode==='revision')duplicate.publishDate='2026-08-26'
 if(mode==='scope'){duplicate.mergedFlag='2';data.note='来源：DataYes'}
 if(mode==='value')duplicate.grossMargin=50
 sources[0].response.data.push(duplicate)
 expect(issue(data,singleRequest,sources)).toMatch(/冲突|口径/u)
})
it('uses explicitly disclosed consolidated scope rather than another scope with an equal number',()=>{
 const sources=singleSources();sources[0].response.data.push({...sources[0].response.data[0],mergedFlag:'2'})
 expect(issue(table(),singleRequest,sources)).toBeUndefined()
})
it.each(['ROE','毛利率同比','经营现金流比率'])('reports unsupported/ambiguous field %s instead of proving it',header=>expect(issue(table(header,'48.44%'),singleRequest,singleSources())).toContain('含糊'))
it('does not infer missing nCFOpa from cash-flow ratios or nCFOpaYoy',()=>{
 const data=table('经营活动现金流净额（亿元）','159.12')
 expect(issue(data,singleRequest,singleSources())).toContain('nCFOpa')
})
it('accepts an actually obtained matching cash-flow amount, including negative and zero',()=>{
 for(const [raw,shown] of [[0,'0.00'],[-123456789,'-1.234568'],[15911889006.02,'159.12']]){
 const sources=singleSources(),row={...sources[1].response.data[0],nCFOpa:raw}
 sources.push({tool:'ework__business',args:{http_method:'GET',nameEn:'getFdmtCFLT'},response:{retCode:1,data:[row]}})
 expect(issue(table('经营活动现金流净额（亿元）',shown),singleRequest,sources)).toBeUndefined()
 }
})
it('validates calculated growth against the same disclosure amounts, not the calculation label',()=>{
 const data=table('营业收入同比（计算值）','54.63%');data.rows[0][0]='601138.SH 工业富联'
 expect(issue(data,'DataYes 601138.SH 财务指标',records)).toBeUndefined()
 data.rows[0][2]='54.62%';expect(issue(data,'DataYes 601138.SH 财务指标',records)).toContain('revenueYoy')
})
it.each(['unqueried-api','complete-claim','raw-field-claims'])('rejects corrected cells with stale %s metadata',mode=>{
 const data=corrected()
 if(mode==='unqueried-api')data.asOf=observed.artifact.asOf
 if(mode==='complete-claim')data.note+='无缺失指标。'
 if(mode==='raw-field-claims')data.note=observed.artifact.note
 expect(issue(data,request,records)).toMatch(/声明|说明|正文|数值/u)
})
it.each(['other-source','simulation','ordinary','quotes','error','no-business'])('keeps %s outside this narrow DataYes financial guard',mode=>{
 const data=table();let sources=singleSources(),prompt=singleRequest
 if(mode==='other-source'){data.note='来源：东方财富';prompt='东方财富财务指标'}
 if(mode==='simulation')prompt='仅使用模拟数据，比较财务指标'
 if(mode==='ordinary'){data.columns=['公司','期间','数量'];data.rows[0][2]='88'}
 if(mode==='quotes'){data.columns=['公司','交易日期','现价'];data.rows[0][2]='88'}
 if(mode==='error'){data.type='error';data.message='来源未取得'}
 if(mode==='no-business')sources=sources.map(source=>({...source,purpose:'discovery'}))
 expect(issue(data,prompt,sources)).toBeUndefined()
})
it('checks retained HTML template data with the same field guard',()=>{
 const bad=retainTemplateModel({version:1,type:'html',title:'财务',html:'<div>财务</div>'},observed.artifact)
 expect(issue(bad,request,records)).toContain('nCFOpa')
 const good=retainTemplateModel({version:1,type:'html',title:'财务',html:'<div>财务</div>'},corrected())
 expect(issue(good,request,records)).toBeUndefined()
})
it.each(['company','column','all-financial-columns'])('cannot make repair pass by dropping %s',mode=>{
 const data=corrected()
 if(mode==='company')data.rows.pop()
 else if(mode==='column'){data.columns.pop();data.rows.forEach(row=>row.pop())}
 else{data.columns=data.columns.slice(0,2);data.rows=data.rows.map(row=>row.slice(0,2))}
 expect(issue(data,request,records,{requiredData:observed.artifact})).toContain('不得删除')
})
it('repairs once with existing records and original permissions, preserving every company and field',async()=>{
 const {result,calls}=await run([observed.artifact,corrected()])
 expect(result.state).toBe('completed');expect(calls).toHaveLength(2);expect(calls[1].synthesisOnly).toBe(false)
 expect(calls[1].prompt).toContain('48.4397');expect(calls[1].prompt).toContain('100.3392');expect(calls[1].prompt).toContain('nCFOpa')
 const final=readTemplateModel(JSON.parse(result.finalOutput)).data
 expect(final.columns).toEqual(observed.artifact.columns);expect(final.rows).toEqual(corrected().rows)
})
it('does not promote a readable fallback after the financial repair throws',async()=>{
 const {result,calls}=await run([observed.artifact],{secondThrows:true})
 expect(result.state).toBe('failed');expect(result.finalOutput).toBeUndefined();expect(calls).toHaveLength(2)
})
it.each(['markdown','custom-html','retained-html','drop-columns'])('does not let a second %s bypass a failed table evidence gate',async mode=>{
 let second=corrected()
 if(mode==='markdown')second={version:1,type:'markdown',title:'财务',content:'已取得部分财务数据，现金流未取得。'}
 if(mode==='custom-html')second={version:1,type:'html',title:'财务',html:'<div>已取得部分财务数据，现金流未取得。</div>'}
 if(mode==='retained-html')second=retainTemplateModel({version:1,type:'html',title:'财务',html:'<div>财务表</div>'},observed.artifact)
 if(mode==='drop-columns'){second.columns=second.columns.slice(0,2);second.rows=second.rows.map(row=>row.slice(0,2))}
 const {result,calls}=await run([observed.artifact,second]);expect(result.state).toBe('failed');expect(calls).toHaveLength(2)
})
it('does not silently retain unbound numeric field claims in notes after table correction',()=>{
 const data=corrected();data.note='来源为合并口径；毛利率取grossMargin（46.2522%/47.4263%/6.6042%），ROE取加权平均roeW（37.62%/38.12%/7.64%）。'
 expect(issue(data,request,records)).toMatch(/正文|数值|说明/u)
})
it('keeps cancellation while the only financial repair is pending',async()=>{
 let starts=0,release
 const runtime=new ResearchTaskRuntime({adapter:{start:async options=>({childSessionId:'cancel-'+ ++starts,dispose:async()=>{release?.({stopReason:'aborted',output:[]})},result:starts===1?Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(observed.artifact)}],sourceRecords:records}):new Promise(resolve=>{release=resolve;options.signal.addEventListener('abort',()=>resolve({stopReason:'aborted',output:[]}))})})},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 try{
 await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:request})
 await vi.waitFor(()=>expect(starts).toBe(2))
 await runtime.cancel({parentSessionId:'parent',taskId:'task'})
 expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('cancelled');expect(starts).toBe(2)
 }finally{await runtime.dispose()}
})
it('does not use a reported field as proof for an unverified calculated growth label',()=>{
 const sources=singleSources()
 expect(issue(table('营业收入同比（计算值）','100.34%'),singleRequest,sources)).toMatch(/计算|同期/u)
})
it('does not silently prove an unsupported long-form financial table',()=>{
 const data={version:1,type:'table',title:'财务',columns:['公司','报告期','指标','值'],rows:[['300502.SZ','2026-06-30','毛利率','47.43%']],note:'DataYes'}
 expect(issue(data,singleRequest,singleSources())).toMatch(/结构|核验/u)
})
it('does not match the wrong inline unit or unsupported ratio-as-amount',()=>{
 expect(issue(table('经营活动现金流净额（亿元）','159.12%'),singleRequest,singleSources())).toContain('nCFOpa')
 const data=table('营业收入（亿元）','2090974.70万元');data.columns.push('加权ROE');data.rows[0].push('34.86%')
 expect(issue(data,singleRequest,singleSources())).toContain('revenue')
})
it.each(['timeout','aborted','max-tokens'])('does not create a third generation after repair ends %s',async stopReason=>{
 let starts=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'budget-'+ ++starts,dispose:async()=>{},result:Promise.resolve({stopReason:starts===1?'completed':stopReason,localDeadlineExceeded:stopReason==='timeout',output:[{type:'text',text:JSON.stringify(observed.artifact)}],sourceRecords:starts===1?records:[]})})},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 try{await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:request});await vi.waitFor(()=>expect(['failed','cancelled']).toContain(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state));expect(starts).toBe(2)}finally{await runtime.dispose()}
})
it.each([['54.6350%',undefined],['54.6300%','revenueYoy']])('checks extra calculated precision %s from original amounts',(shown,error)=>{
 const data=table('营业收入同比（计算值）',shown);data.rows[0][0]='601138.SH 工业富联'
 const result=issue(data,'DataYes 601138.SH 财务指标',records)
 if(error)expect(result).toContain(error);else expect(result).toBeUndefined()
})
it('does not let repair relabel an already rejected DataYes table as a different source',()=>{
 const data=table('毛利率','99.99%');data.note='来源：东方财富'
 expect(issue(data,'财务指标',singleSources(),{requiredData:table()})).toContain('grossMargin')
})
it('does not repair an incorrect period by silently switching the entire row to an older report',()=>{
 const data=table(),sources=singleSources();data.rows[0][1]='2025-06-30'
 sources[0].response.data.push({...sources[0].response.data[0],endDate:'2025-06-30',endDateRep:'2025-06-30'})
 expect(issue(data,singleRequest,sources,{requiredData:table()})).toMatch(/报告期|期间/u)
})
import {statementTableRepairEvidence} from '../packages/dsh-research-task-runtime/statement-table-evidence.js'
it('bounds repair evidence while exposing original and selected row counts',()=>{
 const sources=Array.from({length:8},()=>singleSources()[0]);sources.forEach(source=>{source.response.data=Array.from({length:500},()=>clone(source.response.data[0]))})
 const text=statementTableRepairEvidence(sources),evidence=JSON.parse(text)
 expect(Buffer.byteLength(text)).toBeLessThanOrEqual(48000)
 expect(evidence.every(source=>source.receivedRows===500&&source.selectedRows===source.data.length)).toBe(true)
})
it.each(['不要使用模拟数据','不要仅使用模拟数据','不要全部使用模拟数据','不用模拟数据'])('does not treat host prohibition %s as a simulation permission',prompt=>expect(issue(table('毛利率','99%'),prompt,singleSources())).toContain('grossMargin'))
it('cannot exempt a table by inventing another source in generated metadata',()=>{
 const data=table('毛利率','99%');data.note='来源：东方财富'
 expect(issue(data,'真实财务指标',singleSources())).toContain('grossMargin')
})
it.each(['accoutingStandards','reportType','fiscalPeriod'])('does not compute growth when source %s is unknown in both periods',key=>{
 const sources=clone(records);for(const source of sources)if(source.args.nameEn==='getFdmtISLT2018')source.response.data.forEach(row=>{delete row[key]})
 const data=table('营业收入同比（计算值）','54.63%');data.rows[0][0]='601138.SH 工业富联'
 expect(issue(data,'DataYes 601138.SH 财务指标',sources)).toMatch(/计算同比|口径/u)
})
