import {expect,it,vi} from 'vitest'
import {restoreSnapshotMarketHistory,resolveComponentSnapshot,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
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

const panelTitle='近一月走势与相对沪深300强弱'
const panelPrompt=`工作台：算力产业链真实数据研究\n本面板：${panelTitle}\n取得真实日线并按各自首值100归一化，计算相对沪深300强弱，仅静态快照。\n仅生成本面板，优先使用 chart 类型；使用折线图。\n【原始工作台需求】\n研究中际旭创、新易盛、工业富联及沪深300。`
const historyEnvelope=(sources=records)=>{
 const select=(from,path)=>({$from:from,$each:'records',$filter:{metric:'收盘价'},$sortBy:'as_of',$order:'asc',$map:{$path:path}})
 return {version:1,type:'data-bound',requests:sources.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),mapping:{version:1,type:'chart',variant:'line',title:panelTitle,labels:select('q0','as_of'),series:sources.map((r,i)=>({name:r.args.symbols[0],values:{...select('q'+i,'value'),$normalize:'base100',$digits:2}}))}}
}
// Small deterministic prices preserve the observed first-draft contract defect.
// The complete dated native replay stays outside the source tree in /tmp.
const nativeTrend=(()=>{
 const records=[source('300308.SZ',[100,90,80]),source('300502.SZ',[100,85,75]),source('601138.SH',[100,95,90]),source('000300.SH',[100,100,95])]
 const envelope=historyEnvelope(records)
 delete envelope.mapping.version;delete envelope.mapping.title
 return {records,text:JSON.stringify(envelope).slice(0,-1)}
})()

it('recovers the native-shaped first draft with its one missing outer brace and host title, keeping every observed price',()=>{
 const before=JSON.stringify(nativeTrend)
 const result=resolveComponentSnapshot(nativeTrend.text,nativeTrend.records,new Date(),{panelTitle,benchmarkSymbol:'000300.SH'})
 expect(result?.data.title).toBe(panelTitle)
 expect(result.data).toMatchObject({version:1,type:'chart',variant:'line'})
 expect(result.data.labels).toHaveLength(3)
 expect(result.data.series.map(s=>s.values.at(-1))).toEqual([80,75,90,95])
 expect(result.data.note).toContain('300308.SZ：原始单位 元，前复权；基期值 100，末值 80；区间涨跌幅 -20.00%')
 expect(result.data.note).toContain('601138.SH -5.00；300308.SZ -15.00；300502.SZ -20.00')
 expect(result.data.note).toContain('2026-09-15 至 2026-10-20')
 expect(result.data.note).toContain('2026-10-20T17:47:14.069Z')
 expect(result.data.asOf).toContain('静态快照，自动更新未绑定')
 expect(result).not.toHaveProperty('recipe')
 expect(JSON.stringify(nativeTrend)).toBe(before)
})

it.each([undefined,'',null,123,{},'x'.repeat(257)])('does not substitute an absent or invalid trusted host title: %j',panelTitle=>{
 expect(resolveComponentSnapshot(nativeTrend.text,nativeTrend.records,new Date(),{panelTitle})).toBeNull()
})

it.each(['',null,123,{},'x'.repeat(257)])('keeps an explicit invalid mapping title rejected: %j',title=>{
 const candidate=JSON.parse(nativeTrend.text+'}')
 candidate.mapping.title=title
 expect(resolveComponentSnapshot(JSON.stringify(candidate),nativeTrend.records,new Date(),{panelTitle})).toBeNull()
})

it('keeps an existing valid title and rejects a changed request despite trusted host metadata',()=>{
 const candidate=JSON.parse(nativeTrend.text+'}')
 candidate.mapping.title='作者已有标题'
 expect(resolveComponentSnapshot(JSON.stringify(candidate),nativeTrend.records,new Date(),{panelTitle})?.data.title).toBe('作者已有标题')
 candidate.requests[1].args.symbols=['600011.SH']
 expect(resolveComponentSnapshot(JSON.stringify(candidate),nativeTrend.records,new Date(),{panelTitle})).toBeNull()
})

it('applies the same missing-title rule to a genuinely refreshable source without admitting financial_query to refresh',()=>{
 const record={tool:'ework__t_123abc',args:{symbol:'600011.SH'},response:{rows:[{name:'华能国际',value:7.48}]}}
 const envelope={version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args:record.args}],mapping:{type:'table',columns:['名称','收盘价'],rows:{$from:'q',$each:'rows',$map:[{$path:'name'},{$path:'value'}]}}}
 expect(()=>resolveBoundComponent(JSON.stringify(envelope),[record])).toThrow()
 const mapped=resolveBoundComponent(JSON.stringify(envelope),[record],new Date(),{panelTitle:'真实行情'})
 expect(mapped.data).toMatchObject({version:1,title:'真实行情',rows:[['华能国际','7.48']]})
 expect(mapped.recipe.mapping.title).toBe('真实行情')
 expect(()=>resolveBoundComponent(nativeTrend.text,nativeTrend.records,new Date(),{panelTitle})).toThrow()
})

it('finishes the native-shaped first draft through the runtime with one adapter request and no saved refresh recipe',async()=>{
 let requests=0,bindings=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{requests++;return {childSessionId:'native-child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:nativeTrend.text}],sourceRecords:nativeTrend.records})}},bindData:async()=>{bindings++},dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'native-history-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'chart',kind:'container',prompt:panelPrompt})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'native-history-task'}).state).toBe('completed'))
  const output=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'native-history-task'}).finalOutput)).data
  expect(output.title).toBe(panelTitle)
  expect(output.series.map(s=>s.values.at(-1))).toEqual([80,75,90,95])
  expect(output.note).toContain('601138.SH -5.00；300308.SZ -15.00；300502.SZ -20.00')
  expect(output.asOf).toContain('静态快照，自动更新未绑定')
  expect(requests).toBe(1)
  expect(bindings).toBe(0)
 }finally{await runtime.dispose()}
})

it('computes relative returns from original prices before chart rounding',()=>{
 const sources=[source('600011.SH',[3,2.5,2]),source('000300.SH',[7,6.5,6])]
 const result=resolveComponentSnapshot(JSON.stringify(historyEnvelope(sources)),sources,new Date(),{benchmarkSymbol:'000300.SH'})
 expect(result.data.series.map(s=>s.values.at(-1))).toEqual([66.67,85.71])
 expect(result.data.note).toContain('区间涨跌幅 -33.33%')
 expect(result.data.note).toContain('区间涨跌幅 -14.29%')
 expect(result.data.note).toContain('600011.SH -19.05')
 expect(result.data.note).toContain('百分点')
 expect(result.data.note).toContain('前复权')
 expect(result.data.note).toContain('仅含已取得记录')
})

it.each([
 [[100,110,120],'+20.00%','+5.00'],
 [[100,90,80],'-20.00%','-35.00'],
 [[100,100,100],'0.00%','-15.00'],
 [[100,110,115],'+15.00%','0.00'],
 [[100,50,0],'-100.00%','-115.00']
])('handles positive, negative and zero returns for %j',(values,change,difference)=>{
 const sources=[source('600011.SH',values),source('000300.SH',[100,110,115])]
 const result=resolveComponentSnapshot(JSON.stringify(historyEnvelope(sources)),sources,new Date(),{benchmarkSymbol:'000300.SH'})
 expect(result.data.note).toContain('区间涨跌幅 '+change)
 expect(result.data.note).toContain('600011.SH '+difference)
 expect(result.data.note).not.toContain('-0.00')
})

it.each([undefined,'000905.SH'])('does not infer relative ranking without the actual explicit benchmark: %j',benchmarkSymbol=>{
 const result=resolveComponentSnapshot(JSON.stringify(historyEnvelope()),records,new Date(),{benchmarkSymbol})
 expect(result.data.note).toContain('区间涨跌幅 +7.63%')
 expect(result.data.note).not.toContain('百分点')
 expect(result.data.note).not.toContain('由高到低')
})

it('rejects a zero base and calculates no host relative-return claim on mismatched dates',()=>{
 const sources=[source('600011.SH',[0,1,2]),source('000300.SH',[7,6.5,6])]
 expect(resolveComponentSnapshot(JSON.stringify(historyEnvelope(sources)),sources,new Date(),{benchmarkSymbol:'000300.SH'})).toBeNull()
 sources[0]=source('600011.SH',[3,2.5,2]);sources[1].response.records[1].as_of='2026-09-25'
 const result=resolveComponentSnapshot(JSON.stringify(historyEnvelope(sources)),sources,new Date(),{benchmarkSymbol:'000300.SH'})
 expect(result).toBeNull()
})

it.each([
 '本面板：只来自正文的标题\n取得真实曲线。',
 `工作台：研究\n本面板：${panelTitle}\n优先使用 chart 类型。`,
 panelPrompt.replace('取得真实日线', '本面板：另一个冲突标题\n取得真实日线')
])('does not use an unscoped or ambiguous runtime title: %s',async prompt=>{
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'unscoped-child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:nativeTrend.text}],sourceRecords:nativeTrend.records})}),dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'unscoped-history-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'chart',kind:'container',prompt})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'unscoped-history-task'}).state).toBe('failed'))
  expect(runtime.inspect({parentSessionId:'parent',taskId:'unscoped-history-task'}).finalOutput).toBeUndefined()
 }finally{await runtime.dispose()}
})
