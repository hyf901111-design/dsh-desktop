import {expect,it} from 'vitest'
import {workbenchComparisonWindow} from '../packages/dsh-research-task-runtime/workbench-comparison-window.js'
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
const input={originalRequest:'看看沪深300、中证500和创业板近三个月的表现',dataMode:'source',title:'指数对比'}
const now=new Date('2026-11-06T20:17:00Z')
it('uses one Beijing calendar window across chart, rank and overview panels',()=>{
 expect(workbenchComparisonWindow(input,now)).toEqual({start:'2026-08-07',end:'2026-11-07'})
 for(const type of ['chart','table','kpi'])expect(workbenchPanelPrompt(input,{type,title:'指数',prompt:'比较表现'},now)).toContain('2026-08-07 至 2026-11-07')
 expect(workbenchComparisonWindow({...input,originalRequest:'股票近一个月表现'},new Date('2024-03-30T20:00:00Z'))).toEqual({start:'2024-02-29',end:'2024-03-31'})
})
it.each(['指数 2025-01-01 至 2025-04-01近三个月','指数近三个月与近一年对比','指数近三个月和近20交易日','指数近三个月与今年表现','近三个月天气','指数近0个月'])('does not override explicit, ambiguous or unrelated scope: %s',originalRequest=>{
 expect(workbenchComparisonWindow({...input,originalRequest},now)).toBeUndefined()
})
it('filters actual dates before both normalization and derived statistics, preserving out of window evidence',()=>{
 const records=[{date:'2026-07-31',close:80},{date:'2026-08-07',close:100},{date:'2026-11-06',close:90},{date:'2026-11-08',close:70}],responses={q:{records}}
 const select={$from:'q',$each:'records',$filter:{date:{$gte:'2026-08-07',$lte:'2026-11-07'}},$sortBy:'date',$order:'asc',$map:{$path:'close'}}
 expect(evaluateMapping({...select,$normalize:'base100'},responses)).toEqual([100,90])
 expect(evaluateMapping({...select,$reduce:'pctChange',$digits:2},responses)).toBe(-10)
 expect(evaluateMapping({...select,$map:{$path:'date'}},responses)).toEqual(['2026-08-07','2026-11-06'])
 expect(records).toHaveLength(4)
 expect(evaluateMapping(select,{q:{records:[{date:'20260807',close:100},{date:'20261106',close:90}]}})).toEqual([100,90])
})
it.each([{$gte:'2026-02-30'},{$gte:'2026-0807'},{$gte:'2026-11-07',$lte:'2026-08-07'},{$gt:'2026-08-07'},{$gte:123},{$gte:'2026-08-07',unknown:true}])('rejects malformed date-range conditions even on empty input: %j',filter=>{
 expect(()=>evaluateMapping({$from:'q',$each:'records',$filter:{date:filter},$map:{$path:'close'}},{q:{records:[]}})).toThrow()
})
it('does not silently discard missing or malformed dates in a range query',()=>{
 for(const date of [undefined,'2026-02-30',42])expect(()=>evaluateMapping({$from:'q',$each:'records',$filter:{date:{$gte:'2026-08-07',$lte:'2026-11-07'}},$map:{$path:'close'}},{q:{records:[{date,close:100}]}})).toThrow()
})
