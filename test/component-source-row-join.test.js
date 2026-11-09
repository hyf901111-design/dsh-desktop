import {expect,it} from 'vitest'
import {evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
const records=[
 {instrument:'A.B',metric:'净值',value:1.21},
 {instrument:'C.D',metric:'收益',value:8},
 {instrument:'A.B',metric:'收益',value:3},
 {instrument:'C.D',metric:'净值',value:1.87}
]
const mapping={$from:'q',$each:'records',$filter:{metric:'收益'},$sortBy:'value',$order:'desc',$map:[
 {$path:'instrument'},{$path:'value'},
 {$from:'q',$each:'records',$filter:{instrument:{$row:'instrument'},metric:'净值'},$single:true,$map:{$path:'value'},$optional:true}
]}
it('joins actual observations by identity after sorting instead of losing values or joining row positions',()=>{
 expect(evaluateMapping(mapping,{q:{records}})).toEqual([['C.D',8,1.87],['A.B',3,1.21]])
 expect(evaluateMapping(mapping,{q:{records:records.filter(r=>r.instrument!=='A.B'||r.metric!=='净值')}})).toEqual([['C.D',8,1.87],['A.B',3,null]])
})
it('does not guess ambiguous periods, missing identities or executable join keys',()=>{
 expect(()=>evaluateMapping(mapping,{q:{records:[...records,{instrument:'A.B',metric:'净值',value:2}]}})).toThrow('不同记录')
 const absent=structuredClone(mapping);absent.$map[2].$filter.instrument.$row='missing'
 expect(()=>evaluateMapping(absent,{q:{records}})).toThrow('关联键')
 const unsafe=structuredClone(mapping);unsafe.$map[2].$filter.instrument.$row='constructor'
 expect(()=>evaluateMapping(unsafe,{q:{records}})).toThrow('字段路径无效')
 const expr=structuredClone(mapping);expr.$map[2].$filter.instrument={$row:'instrument',$eval:'1'}
 expect(()=>evaluateMapping(expr,{q:{records}})).toThrow()
})
