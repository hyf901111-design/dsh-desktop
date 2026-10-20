import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {componentBindingEvidence,componentSnapshotEvidence,resolveComponentSnapshot,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'

const {records}=JSON.parse(readFileSync(new URL('./fixtures/component-source-history-snapshot.json',import.meta.url),'utf8'))
const now=new Date('2026-10-20T15:30:00Z')
const selector=(i,date=false)=>records[i].tool==='financial_query'
 ?{$from:'q'+i,$each:'records',$filter:{metric:'收盘价'},$sortBy:'as_of',$order:'asc',$map:{$path:date?'as_of':'value'}}
 :{$from:'q'+i,$each:'records',$sortBy:'time',$order:'asc',$map:{$path:date?'time':'close'}}
const draft=()=>({version:1,type:'data-bound',requests:records.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),mapping:{
 version:1,type:'chart',variant:'line',title:'三家公司与沪深300相对表现',labels:selector(0,true),
 series:records.map((r,i)=>({name:r.args.symbols?.[0]??'沪深300',values:{...selector(i),$normalize:'base100',$digits:2}})),
 unit:'基期100',asOf:'腾讯财经 · 2026-09-01至2026-10-20',note:'共同起点收盘价为100；股票前复权，指数为不复权点位；仅本次快照。'
}})

it('materializes all 120 observed values deterministically without transcribing arrays or binding snapshot tools',()=>{
 const input=draft(),before=JSON.stringify(input),result=resolveComponentSnapshot(JSON.stringify(input),records,now)
 expect(result).not.toBeNull();expect(result.recipe).toBeUndefined()
 expect(result.data.series).toHaveLength(4);expect(result.data.labels).toHaveLength(30)
 for(const [i,r]of records.entries()){
  const rows=r.response.records.filter(row=>r.tool!=='financial_query'||row.metric==='收盘价')
  const values=rows.map(row=>row.value??row.close),expected=values.map(value=>Number((value/values[0]*100).toFixed(2)))
  expect(result.data.series[i].values).toEqual(expected)
  expect(rows.map(row=>row.as_of??row.time)).toEqual(result.data.labels)
 }
 expect(readTemplateModel(JSON.parse(result.output)).data).toEqual(result.data)
 expect(JSON.stringify(input)).toBe(before)
 expect(()=>resolveBoundComponent(JSON.stringify(input),records,now)).toThrow('数据引用无效')
})

it('recovers an omitted chart variant from its explicit host contract and the fixed financial value selector',()=>{
 const input=draft(),before=structuredClone(input)
 delete input.mapping.variant
 for(const [i,source]of records.entries())if(source.tool==='financial_query')delete input.mapping.series[i].values.$map
 expect(resolveComponentSnapshot(JSON.stringify(input),records,now)).toBeNull()
 const recovered=resolveComponentSnapshot(JSON.stringify(input),records,now,{chartVariant:'line'})
 expect(recovered).not.toBeNull()
 expect(recovered.data.variant).toBe('line')
 expect(recovered.data.series).toEqual(resolveComponentSnapshot(JSON.stringify(before),records,now).data.series)
 expect(input.mapping.variant).toBeUndefined()
 expect(input.mapping.series[1].values.$map).toBeUndefined()
})

it('does not guess a missing numeric selector for an unregistered response shape or an arbitrary public source',()=>{
 for(const mode of ['unknown-financial-schema','public-data']){
  const input=draft(),sources=structuredClone(records)
  delete input.mapping.series[mode==='public-data'?0:1].values.$map
  if(mode==='unknown-financial-schema')sources[1].response.schema_version='unrecognized-provider'
  expect(resolveComponentSnapshot(JSON.stringify(input),sources,now,{chartVariant:'line'})).toBeNull()
 }
 const input=draft();input.mapping.variant='bar'
 expect(resolveComponentSnapshot(JSON.stringify(input),records,now,{chartVariant:'line'}).data.variant).toBe('bar')
})

it('retains metric field examples and complete collection sizes for all snapshot securities during recovery',()=>{
 const evidence=componentBindingEvidence(records),samples=evidence.split('\n').map(line=>JSON.parse(line))
 expect(samples).toHaveLength(4)
 for(const [i,source]of records.entries()){
  const sample=samples.find(s=>JSON.stringify(s.args)===JSON.stringify(source.args))
  expect(sample).toBeDefined()
  if(source.tool==='financial_query'){
   expect(sample.snapshotOnly).toBe(true)
   expect(sample.responseSample.records.some(r=>r.metric==='收盘价')).toBe(true)
  }
 }
 expect(evidence).not.toContain('evidence_id')
})

it('does not promote an unsupported or empty financial snapshot into business evidence',()=>{
 for(const response of [{status:'unsupported',records:[]},{status:'complete',records:[]},{status:'error',records:[{metric:'收盘价',value:1}]}]){
  const sources=[{tool:'financial_query',purpose:'snapshot',args:{intent:'history'},response}]
  expect(componentBindingEvidence(sources)).toBe('')
  expect(componentSnapshotEvidence(JSON.stringify({version:1,type:'chart',labels:['2026-10-20'],series:[{name:'未知',values:[1]}]}),sources)).toBe(false)
 }
})

it.each(['unknown-call','discovery','missing-records','wrong-date-order'])('does not manufacture a mapped chart from %s',mode=>{
 const input=draft(),sources=structuredClone(records)
 if(mode==='unknown-call')input.requests[1].args={...input.requests[1].args,symbols:['000001.SZ']}
 if(mode==='discovery')sources[1].purpose='discovery'
 if(mode==='missing-records')sources[1].response.records=[]
 if(mode==='wrong-date-order')input.mapping.series[1].values.$order='desc'
 expect(resolveComponentSnapshot(JSON.stringify(input),sources,now)).toBeNull()
})

it('does not put values from a different observed date under an equal-length date axis',()=>{
 const sources=structuredClone(records)
 const row=sources[1].response.records.find(r=>r.metric==='收盘价')
 row.as_of='2026-08-31'
 expect(resolveComponentSnapshot(JSON.stringify(draft()),sources,now)).toBeNull()
})

it('completes the actual multi-source static chart in one worker without a refresh recipe',async()=>{
 const input=draft();delete input.mapping.variant
 for(const [i,source]of records.entries())if(source.tool==='financial_query')delete input.mapping.series[i].values.$map
 const start=vi.fn(async()=>({childSessionId:'source-chart',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(input)}],sourceRecords:records}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},createId:()=> 'source-chart',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'chart',kind:'container',prompt:'工作台：火电利润弹性\n本面板：三家火电与沪深300的近期相对表现\n仅生成本面板，优先使用 chart 类型；必须输出 chart.line。仅本次静态快照，不要求刷新绑定。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'source-chart'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
  expect(readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'source-chart'}).finalOutput)).data.series).toHaveLength(4)
 }finally{await runtime.dispose()}
})

it('repairs a short series from full observed snapshots without dropping a security or fetching again',async()=>{
 const invalid=structuredClone(resolveComponentSnapshot(JSON.stringify(draft()),records,now).data)
 invalid.series[2].values.pop()
 const start=vi.fn(async()=>({childSessionId:'source-repair-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?invalid:draft())}],sourceRecords:start.mock.calls.length===1?records:[]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},createId:()=> 'source-repair',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'chart',kind:'container',prompt:'工作台：火电利润弹性\n本面板：三家公司与沪深300近期相对表现\n仅生成本面板，优先使用 chart 类型；必须输出 chart.line。仅本次静态快照，不要求刷新绑定。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'source-repair'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2);expect(bindData).not.toHaveBeenCalled()
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  for(const code of ['600011.SH','600027.SH','600795.SH'])expect(repair.prompt).toContain(code)
  expect(repair.prompt).toContain('"responseArrayLengths":{"records":120}')
  expect(repair.prompt).toContain('"metric":"收盘价"')
  expect(readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'source-repair'}).finalOutput)).data.series.every(s=>s.values.length===30)).toBe(true)
 }finally{await runtime.dispose()}
})

it('normalizes only a selected finite list after filtering and sorting, with precision applied last',()=>{
 const mapping={$from:'q',$each:'rows',$filter:{code:'A'},$sortBy:'date',$order:'asc',$take:-2,$map:{$path:'value'},$normalize:'base100',$digits:2}
 const q={rows:[{code:'A',date:'2026-01-03',value:11},{code:'B',date:'2026-01-03',value:999},{code:'A',date:'2026-01-01',value:6},{code:'A',date:'2026-01-02',value:7}]}
 expect(evaluateMapping(mapping,{q})).toEqual([100,157.14])
 for(const values of [[0,1],[1,null],[1,'2'],[1,Infinity],[]])expect(()=>evaluateMapping({...mapping,$filter:undefined,$take:undefined},{q:{rows:values.map((value,i)=>({date:String(i),value}))}})).toThrow()
 expect(()=>evaluateMapping({$from:'q',$path:'rows.0.value',$normalize:'base100'},{q})).toThrow()
 expect(()=>evaluateMapping({...mapping,$normalize:'eval(code)'},{q})).toThrow()
})
