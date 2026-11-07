import {it,expect} from 'vitest'
import {materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {kpiDataIssue} from '../packages/dsh-research-task-runtime/kpi-template-contract.js'
import {chartDataIssue} from '../packages/dsh-research-task-runtime/chart-template-contract.js'
import {templateDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {specialChartSamples} from './fixtures/special-chart-samples.js'
import {advancedChartSamples} from './fixtures/advanced-chart-samples.js'

const response={source:'Tushare',sourceUrl:'https://tushare.pro/document/2?doc_id=408',receivedAt:'2026-11-07T02:00:00Z',period:{start:'20261030',end:'20261106'},summary:{sizeYi:48632.81}}
const mapping={version:1,type:'kpi',title:'规模与变化',items:[{label:'期末规模',value:{$from:'q',$path:'summary.sizeYi'},unit:'亿元'}]}
const materialize=(m=mapping,r=response,records=[{response:r}])=>materializeComponentMapping(m,{q:r},new Date('2026-11-07'),records)
it('fills provenance and a readable actual period without a second query or copying model values',()=>{
 const data=materialize()
 expect(data.items[0].value).toBe('48632.81')
 expect(data.asOf).toBe('2026-10-30 至 2026-11-06')
 expect(data.sources).toEqual([{name:'Tushare',url:response.sourceUrl}])
 expect(kpiDataIssue(data)).toBeNull()
 expect(materialize({...mapping,asOf:{$from:'q',$path:'period.start'}}).asOf).toBe(data.asOf)
 expect(materialize({...mapping,asOf:{$concat:[{$from:'q',$path:'period.start'},{$from:'q',$path:'period.end'},'2099-01-01']}}).asOf).toBe(data.asOf)
})
it('does not invent metadata from discovery, unrelated records, fetching time or invalid dates',()=>{
 for(const records of [[],[{purpose:'discovery',response}],[{response:{...response,source:'Other'}}]]){
  const data=materialize(mapping,response,records);expect(data.sources).toBeUndefined();expect(data.asOf).toBeUndefined()
 }
 for(const period of [{start:'20260230',end:'20261106'},{start:'20261107',end:'20261106'},null])expect(materialize(mapping,{...response,period}).asOf).toBeUndefined()
 const data=materialize(mapping,{...response,sourceUrl:'https://secret:password@example.test/'})
 expect(data.sources).toEqual([{name:'Tushare'}]);expect(JSON.stringify(data)).not.toContain('password')
})
it('retains actual quote timestamps, explicitly authored scopes and conflicting source periods',()=>{
 expect(materialize({...mapping,asOf:{$from:'q',$path:'dataTime'}},{...response,dataTime:'2025-01-01 09:30:00'}).asOf).toBe('2025-01-01 09:30:00')
 expect(materialize({...mapping,asOf:'仅统计月末记录'}).asOf).toBe('仅统计月末记录')
 const other={...response,period:{start:'20261001',end:'20261030'}},m={...mapping,items:[...mapping.items,{label:'其他规模',value:{$from:'r',$path:'summary.sizeYi'}}]}
 const data=materializeComponentMapping(m,{q:response,r:other},new Date(),[{response},{response:other}])
 expect(data.asOf).toBeUndefined();expect(data.sources).toHaveLength(1)
})
it('uses the renderer source shape and refreshes a new actual period without keeping stale dates',()=>{
 const m={version:1,type:'table',title:'规模',columns:['规模'],rows:[[{...mapping.items[0].value}]]}
 const table=materialize(m)
 expect(table.sources).toEqual([{label:'Tushare',url:response.sourceUrl}])
 expect(templateDataIssue(table)).toBeNull()
 const output=acceptArtifactOutput(JSON.stringify(table))
 expect(output).toBeDefined()
 const artifact=JSON.parse(output),model=readTemplateModel(artifact)
 expect(model.data.rows).toEqual(table.rows)
 expect(model.data.sources).toEqual(table.sources)
 expect(model.data.asOf).toBe(table.asOf)
 expect(artifact.html).toContain(response.sourceUrl)
 expect(materialize(mapping,{...response,period:{start:'20261106',end:'20261113'}}).asOf).toBe('2026-11-06 至 2026-11-13')
 const kept=[{name:'原始公告',url:'https://example.test/filing'}]
 expect(materialize({...mapping,sources:kept}).sources).toEqual(kept)
})
it('retains sources without a reported period and rejects malformed source metadata before rendering',()=>{
 const table=materialize({version:1,type:'table',title:'规模',columns:['规模'],rows:[[{...mapping.items[0].value}]]},{...response,period:undefined})
 const output=acceptArtifactOutput(JSON.stringify(table))
 expect(output).toBeDefined()
 expect(readTemplateModel(JSON.parse(output)).data.sources).toEqual(table.sources)
 for(const source of [{label:'Tushare',url:'javascript:alert(1)'},{label:'Tushare',url:'https://user:password@example.test'},{name:'Tushare'},{label:'Tushare',extra:'unvalidated'}]){
  expect(templateDataIssue({...table,sources:[source]})).not.toBeNull()
  expect(acceptArtifactOutput(JSON.stringify({...table,sources:[source]}))).toBeUndefined()
 }
})
it('points to the exact repair when KPI version or source metadata is malformed',()=>{
 const data=materialize()
 expect(kpiDataIssue({...data,version:undefined})).toContain('version:1')
 expect(kpiDataIssue({...data,source:'Tushare'})).toContain('顶层字段 source')
 expect(kpiDataIssue({...data,sources:[{label:'Tushare'}]})).toContain('name')
})
it('keeps structured sources through every chart family and rejects unsafe source links',()=>{
 for(const sample of [{version:1,type:'chart',variant:'horizontal',title:'排名',labels:['甲'],series:[{name:'值',values:[1]}]},specialChartSamples.pie,advancedChartSamples.waterfall]){
  const data={...sample,sources:[{label:'Tushare',url:response.sourceUrl}]}
  expect(chartDataIssue(data)).toBeNull()
  const output=acceptArtifactOutput(JSON.stringify(data));expect(output).toBeDefined()
  expect(readTemplateModel(JSON.parse(output)).data.sources).toEqual(data.sources)
  expect(chartDataIssue({...data,sources:[{label:'来源',url:'javascript:alert(1)'}]})).not.toBeNull()
 }
})
