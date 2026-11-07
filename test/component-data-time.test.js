import {expect,it} from 'vitest'
import {materializeComponentProjection} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
const response={source:'原始来源',receivedAt:'2026-11-07T09:00:00Z',period:{start:'20261030',end:'20261106'},summary:{size:123.45}}
const mapping={version:1,type:'kpi',title:'规模',asOf:{$from:'q',$path:'receivedAt'},items:[{label:'期末规模',value:{$from:'q',$path:'summary.size'},unit:'亿元'}]}
const project=(m,r,observed=true)=>materializeComponentProjection(m,{q:r},new Date(),observed?[{response:r}]:[]).data
it('uses the observed statistical period instead of retrieval time, including after a refresh',()=>{
 expect(project(mapping,response).asOf).toBe('2026-10-30 至 2026-11-06')
 expect(project(mapping,{...response,period:{start:'20261106',end:'20261113'},receivedAt:'2026-11-14T00:00:00Z'}).asOf).toBe('2026-11-06 至 2026-11-13')
})
it('falls back to the observed data timestamp or an honest missing state, never the retrieval clock',()=>{
 expect(project(mapping,{...response,period:undefined,dataTime:'2026-11-06 15:00:00'}).asOf).toBe('2026-11-06 15:00:00')
 expect(project(mapping,{...response,period:undefined}).asOf).toBe('数据时点未提供')
})
it('does not overwrite distinct authored scopes, other fields, or unobserved data',()=>{
 expect(project({...mapping,asOf:'各期已披露财报'},response).asOf).toBe('各期已披露财报')
 expect(project({...mapping,asOf:{$from:'q',$path:'otherDate'}},{...response,otherDate:'2026-11-05'}).asOf).toBe('2026-11-05')
 expect(project(mapping,response,false).asOf).toBe(response.receivedAt)
})
