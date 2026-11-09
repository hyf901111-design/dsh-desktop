import {expect,it} from 'vitest'
import {componentAcquisitionBudget} from '../packages/dsh-research-task-runtime/component-acquisition-budget.js'
const record=(id,rows=[{value:1}])=>({tool:'ework__source',args:{api_name:'series',params:{symbol:id}},response:{retCode:1,data:rows}})
it('allows a declared multi-entity comparison to finish observed per-object reads beyond the single-panel quota',()=>{
 const budget=componentAcquisitionBudget('至少比较8只基金的收益、规模与风险')
 expect(budget.inspect([],{elapsed:3000,knownDiscoveryUsed:true}).businessLimit).toBe(12)
 const p=budget.inspect([record('one')],{elapsed:100000,knownDiscoveryUsed:true})
 expect(p.businessLimit).toBeGreaterThanOrEqual(24)
 expect(p.allowAfterDeadline).toBe(true)
})
it('requires new successful business data, never empty responses, catalogs or retries as progress',()=>{
 const budget=componentAcquisitionBudget('至少比较8家企业的指标')
 expect(budget.inspect([{purpose:'discovery',response:{kind:'catalog',interfaces:[{}]}},record('empty',[])],{elapsed:100000,knownDiscoveryUsed:true}).allowAfterDeadline).toBe(false)
 budget.inspect([record('one')],{elapsed:10000,knownDiscoveryUsed:true})
 expect(budget.inspect([record('one')],{elapsed:100000,knownDiscoveryUsed:true}).allowAfterDeadline).toBe(false)
 expect(budget.inspect([record('one'),record('two')],{elapsed:100001,knownDiscoveryUsed:true}).allowAfterDeadline).toBe(true)
})
it('does not mistake a requested row count or an unrelated number for separate source entities',()=>{
 for(const request of ['至少显示72条记录','预算8亿元，列明风险','至少比较100000家企业']){
  expect(componentAcquisitionBudget(request).inspect([record('a')],{elapsed:100000,knownDiscoveryUsed:true})).toMatchObject({businessLimit:12,allowAfterDeadline:false})
 }
})
it('keeps the hard acquisition deadline and small/default tasks bounded',()=>{
 const options={knownDiscoveryUsed:true,elapsed:135000}
 expect(componentAcquisitionBudget('至少比较8只产品').inspect([record('a')],options).allowAfterDeadline).toBe(false)
 expect(componentAcquisitionBudget('比较2家企业').inspect([record('a')],{...options,elapsed:100000}).businessLimit).toBe(12)
 expect(componentAcquisitionBudget('至少比较8只产品').inspect([record('a')],{...options,elapsed:100000,knownDiscoveryUsed:false}).businessLimit).toBe(8)
})
it('counts a growing page only once and does not reset progress with changed values in the same request',()=>{
 const b=componentAcquisitionBudget('至少比较8只产品')
 b.inspect([record('a')],{knownDiscoveryUsed:true,elapsed:1000})
 expect(b.inspect([record('a',[{value:2}])],{knownDiscoveryUsed:true,elapsed:100000}).allowAfterDeadline).toBe(false)
})
