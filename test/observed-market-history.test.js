import {expect,it,vi} from 'vitest'
import {restoreSnapshotMarketHistory,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const source=(symbol,values)=>({tool:'financial_query',purpose:'snapshot',args:{intent:'history',interval:'1d',symbols:[symbol]},response:{schema_version:'financial-1',received_at:'2026-10-20T17:47:14.069Z',limitations:['仅含已取得记录'],records:values.map((value,i)=>({instrument:symbol,metric:'收盘价',as_of:['2026-09-15','2026-09-24','2026-10-20'][i],value,unit:symbol==='000300.SH'?'点':'元',price_basis:symbol==='000300.SH'?'不复权':'前复权'}))}})
const records=[source('600011.SH',[6.95,6.74,7.48]),source('000300.SH',[4450.04,4400,4152.11])]
const model={version:1,type:'market',variant:'trend',title:'真实相对股价',asOf:'手写20个交易日，最新交易日晚于获取时点',note:'归一化基期100；手写排名和额外交易日数。',labels:['09-15','09-24','10-20'],series:[{name:'华能国际 600011.SH（收盘基准=100）',values:[100,97.01,107.63]},{name:'沪深300 000300.SH（收盘基准=100）',values:[100,98.88,93.3]}]}

it('recalculates every normalized market trend point and its dates and provenance from the actual observed financial records',()=>{
 const before=JSON.stringify(model),data=JSON.parse(restoreSnapshotMarketHistory(before,records))
 expect(data.series[0].values).toEqual([100,96.98,107.63])
 expect(data.labels).toEqual(['2026-09-15','2026-09-24','2026-10-20'])
 expect(data.note).toContain('3个实际时点')
 expect(data.note).toContain('6.95')
 expect(data.note).toContain('前复权')
 expect(data.note).toContain('不复权')
 expect(data.note).toContain('2026-10-20T17:47:14.069Z')
 expect(data.note).toContain('非报价时间')
 expect(data.note).toContain('仅含已取得记录')
 expect(data.note).toContain('+7.63%')
 expect(data.note).not.toContain('手写')
 expect(data.asOf).not.toContain('晚于')
 expect(JSON.stringify(model)).toBe(before)
 expect(restoreSnapshotMarketHistory(JSON.stringify(data),records)).toBeUndefined()
})

it('calculates the same source metadata when the market trend is delivered as a compact source mapping',()=>{
 const select=(from,path)=>({$from:from,$each:'records',$filter:{metric:'收盘价'},$sortBy:'as_of',$order:'asc',$map:{$path:path}})
 const mapping={...model,labels:select('q0','as_of'),series:model.series.map((s,i)=>({name:s.name,values:{...select('q'+i,'value'),$normalize:'base100',$digits:2}}))}
 const result=resolveComponentSnapshot(JSON.stringify({version:1,type:'data-bound',requests:records.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),mapping}),records)
 expect(result.data.series[0].values).toEqual([100,96.98,107.63])
 expect(result.data.note).toContain('获取时间（非报价时间）')
 expect(result.data.note).not.toContain('手写')
 expect(result.data).not.toHaveProperty('unit')
 const envelope={version:1,type:'data-bound',requests:records.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),mapping:structuredClone(mapping)}
 delete envelope.mapping.version
 const before=JSON.stringify(envelope)
 expect(resolveComponentSnapshot(before,records)?.data.series[0].values).toEqual([100,96.98,107.63])
 expect(JSON.stringify(envelope)).toBe(before)
 envelope.mapping.version=2
 expect(resolveComponentSnapshot(JSON.stringify(envelope),records)).toBeNull()
 envelope.mapping.version=undefined;envelope.version=2
 expect(resolveComponentSnapshot(JSON.stringify(envelope),records)).toBeNull()
})

it('normalizes a completed runtime output before rendering without another model call',async()=>{
 const start=vi.fn(async()=>({childSessionId:'child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(model)}],sourceRecords:records})}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'history-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'chart',kind:'container',prompt:'工作台：火电股价对比\n本面板：股价走势\n优先使用 market 类型；variant: trend。取真实日线按首值100归一化，计算相对沪深300的超额表现和排序，仅静态快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'history-task'}).state).toBe('completed'))
  const output=JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'history-task'}).finalOutput)
  expect(readTemplateModel(output).data.series[0].values).toEqual([100,96.98,107.63])
  expect(readTemplateModel(output).data.note).toContain('600011.SH +14.32')
  expect(start).toHaveBeenCalledOnce()
 }finally{await runtime.dispose()}
})

it.each(['raw-values','missing-series','ambiguous-year','conflicting-response','mismatched-dates','discovery','wrong-request','missing-basis'])('does not infer normalization or source correspondence for %s',mode=>{
 const input=structuredClone(model),sources=structuredClone(records)
 if(mode==='raw-values'){input.note='原始数值';input.series.forEach(s=>s.name=s.name.replace('（收盘基准=100）',''))}
 if(mode==='missing-series')sources.pop()
 if(mode==='ambiguous-year')sources[0].response.records.push({...sources[0].response.records[0],as_of:'2025-09-15'})
 if(mode==='conflicting-response')sources.push(source('600011.SH',[8,9,10]))
 if(mode==='mismatched-dates')sources[1].response.records[1].as_of='2026-09-25'
 if(mode==='discovery')sources[0].purpose='discovery'
 if(mode==='wrong-request')sources[0].args.symbols=['600027.SH']
 if(mode==='missing-basis')delete sources[0].response.records[0].price_basis
 expect(restoreSnapshotMarketHistory(JSON.stringify(input),sources)).toBeUndefined()
})
