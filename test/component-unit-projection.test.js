import {expect,it} from 'vitest'
import {materializeComponentProjection} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {resolveBoundComponent,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
const response={source:'Tushare',api:'daily_basic',sourceUrl:'https://tushare.pro/document/2?doc_id=32',fieldInfo:{total_mv:'总市值 （万元）',total_share:'总股本（万股）',turnover_rate:'换手率（%） (成交量/无限售流通股数)'},records:[{ts_code:'688041.SH',trade_date:'20261106',total_mv:44046206.995,total_share:232433.81,turnover_rate:.7946},{ts_code:'688041.SH',trade_date:'20261105',total_mv:44813238.568,total_share:232433.81,turnover_rate:1.0428}]}
const tool='ework__t_1234abcd',args={api_name:'daily_basic',params:{ts_code:'688041.SH'}},records=[{tool,args,response}]
const value={$from:'q',$each:'records',$sortBy:'trade_date',$order:'desc',$map:{$path:'total_mv'},$reduce:'first',$scale:1e-8,$digits:2}
const mapping={version:1,type:'kpi',title:'估值',items:[{label:'总市值',value,unit:'亿元'}]}
const project=(m=mapping,r=response,observed=records)=>materializeComponentProjection(m,{q:r},new Date('2026-11-07'),observed)
it('corrects an explicit source-unit mismatch before rounding and preserves the corrected refresh recipe',()=>{
 const before=structuredClone({mapping,response}),result=project()
 expect(result.data.items[0].value).toBe('4404.62')
 expect(project(result.mapping).data.items[0].value).toBe('4404.62')
 expect(project(result.mapping).mapping).toEqual(result.mapping)
 expect({mapping,response}).toEqual(before)
 const next={...response,records:[{...response.records[0],total_mv:45000000}]}
 expect(project(result.mapping,next,[{tool,args,response:next}]).data.items[0].value).toBe('4500')
})
it.each(['bound','snapshot'])('uses the same source-unit correction for %s components',kind=>{
 const text=JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping})
 const result=kind==='bound'?resolveBoundComponent(text,records):resolveComponentSnapshot(text,records)
 expect(result.data.items[0].value).toBe('4404.62')
})
it('handles scalar rows, explicit array indices and nested item mappings without confusing share units with money',()=>{
 for(const select of [{$from:'q',$path:'records[0].total_share',$scale:1e-8,$digits:2},{$from:'q',$each:'records',$take:1,$single:true,$path:'total_share',$scale:1e-8,$digits:2}]){
  expect(project({...mapping,items:[{label:'总股本',value:select,unit:'亿股'}]}).data.items[0].value).toBe('23.24')
 }
 const nested={...mapping,items:{$from:'q',$each:'records',$take:1,$map:{label:'总市值',value:{$path:'total_mv',$scale:1e-8,$digits:2},unit:'亿元'}}}
 expect(project(nested).data.items[0].value).toBe('4404.62')
})
it('applies explicit units consistently to chart series and percentage values',()=>{
 const chart={version:1,type:'chart',variant:'line',title:'市值',unit:'亿元',labels:{$from:'q',$each:'records',$map:{$path:'trade_date'}},series:[{name:'市值',values:{$from:'q',$each:'records',$map:{$path:'total_mv',$scale:1e-8,$digits:2}}}]}
 expect(project(chart).data.series[0].values).toEqual([4404.62,4481.32])
 const rate={...mapping,items:[{label:'换手率',value:{$from:'q',$path:'records.0.turnover_rate',$scale:100,$digits:2},unit:'%'}]}
 expect(project(rate).data.items[0].value).toBe('0.79')
})
it('does not infer unknown units, trust unmatched observations or rewrite calculated values',()=>{
 const unknown={...response,fieldInfo:{total_mv:'总市值'}}
 expect(project(mapping,unknown,[{tool,args,response:unknown}]).data.items[0].value).toBe('0.44')
 expect(project(mapping,response,[]).data.items[0].value).toBe('0.44')
 const calculated={...mapping,items:[{label:'差额',unit:'亿元',value:{$calc:{op:'subtract',args:[{$from:'q',$path:'records.0.total_mv'},{$from:'q',$path:'records.1.total_mv'}]},$scale:.0001,$digits:2}}]}
 // Inspection only: complex arithmetic is deliberately outside automatic repair.
 expect(project(calculated).mapping).toEqual(calculated)
 expect(project(calculated).data.items[0].value).toBe('-76.7')
})
it('rejects a conflicting dimension with a repair instruction instead of relabelling it',()=>{
 expect(()=>project({...mapping,items:[{...mapping.items[0],unit:'亿股'}]})).toThrow('来源单位是万元')
})
