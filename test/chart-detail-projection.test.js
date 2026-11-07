import {it,expect} from 'vitest'
import {materializeComponentProjection} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {resolveBoundComponent,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {normalizeChartDetailMapping} from '../packages/dsh-research-task-runtime/chart-detail-projection.js'

const scope={$from:'q',$each:'records',$sortBy:'flow',$order:'desc',$take:2}
const mapping={version:1,type:'chart',variant:'horizontal',title:'资金流',unit:'亿元',labels:{...scope,$map:{$path:'name'}},series:[{name:'流入估算',values:{...scope,$map:{$path:'flow'}}}],detailColumns:['代码','期末规模'],detailRows:{...scope,$map:[{$path:'code'},{$path:'size'}]}}
const response={source:'测试资料',records:[{name:'乙',code:'000002',flow:2,size:20},{name:'甲',code:'000001',flow:3,size:30}]}
const args={operation:'query',source:'fixture',parameters_json:'{}'}
it('preserves every auxiliary field and associates labels using the identical source selection, including refresh',()=>{
 const first=materializeComponentProjection(mapping,{q:response})
 expect(first.data.detailColumns).toEqual(['项目','代码','期末规模'])
 expect(first.data.detailRows).toEqual([['甲','000001',30],['乙','000002',20]])
 const next={...response,records:[{...response.records[0],flow:5,size:26},response.records[1]]}
 const refreshed=materializeComponentProjection(first.mapping,{q:next})
 expect(refreshed.data.labels).toEqual(['乙','甲'])
 expect(refreshed.data.detailRows).toEqual([['乙','000002',26],['甲','000001',30]])
 expect(refreshed.data.series[0].values).toEqual([5,3])
 expect(mapping.detailColumns).toEqual(['代码','期末规模'])
})
it('moves an existing label column with its declared header without dropping or duplicating other cells',()=>{
 const s={...mapping,detailColumns:['代码','产品','期末规模'],detailRows:{...scope,$map:[{$path:'code'},{$path:'name'},{$path:'size'}]}}
 const projected=materializeComponentProjection(s,{q:response})
 expect(projected.data.detailColumns).toEqual(['产品','代码','期末规模'])
 expect(projected.data.detailRows[0]).toEqual(['甲','000001',30])
})
it.each(['source','path','filter','sort','take','literal','conversion'])('does not infer row identity for different %s selectors',kind=>{
 const s=structuredClone(mapping)
 if(kind==='source')s.detailRows.$from='other'
 if(kind==='path')s.detailRows.$each='otherRecords'
 if(kind==='filter')s.detailRows.$filter={size:30}
 if(kind==='sort')s.detailRows.$order='asc'
 if(kind==='take')s.detailRows.$take=1
 if(kind==='literal')s.detailRows=[['000001',30],['000002',20]]
 if(kind==='conversion')s.labels.$as='string'
 expect(normalizeChartDetailMapping(s)).toBe(s)
})
it.each(['bound','snapshot'])('accepts observed auxiliary columns via the %s resolver without a model retry',kind=>{
 const tool=kind==='bound'?'public_data_query':'financial_query'
 const records=[{tool,args,response,...(kind==='snapshot'?{purpose:'snapshot'}:{})}]
 const text=JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping})
 const result=kind==='bound'?resolveBoundComponent(text,records):resolveComponentSnapshot(text,records)
 expect(result.data.detailRows).toEqual([['甲','000001',30],['乙','000002',20]])
 expect(readTemplateModel(JSON.parse(result.output)).data.detailRows).toEqual(result.data.detailRows)
 if(kind==='bound')expect(result.recipe.mapping.detailColumns).toEqual(['项目','代码','期末规模'])
})
it('still rejects equal-length details with a conflicting order',()=>{
 const bad={...mapping,detailRows:{...mapping.detailRows,$order:'asc'}}
 const text=JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping:bad})
 expect(()=>resolveBoundComponent(text,[{tool:'public_data_query',args,response}])).toThrow('必须等于 labels')
})
