import {expect,it} from 'vitest'
import {componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
it('rejects one observed subject when the current panel requires at least eight',()=>{
 const data={version:1,type:'chart',variant:'horizontal',title:'比较',labels:['实际对象A'],series:[{name:'收益',values:[.23]}]}
 expect(componentDeliveryScopeIssue(data,'选取代表产品不少于8只，按共同区间比较')).toContain('实际交付1')
 expect(componentDeliveryScopeIssue(JSON.parse(acceptArtifactOutput(JSON.stringify(data))),'选取代表产品不少于8只')).toContain('至少8')
 expect(componentDeliveryScopeIssue({...data,labels:Array.from({length:8},(_,i)=>'对象'+i),series:[{name:'收益',values:Array(8).fill(1)}]},'选取代表产品不少于8只')).toBeUndefined()
})
it('checks record lists and tables without treating pagination or day counts as entity counts',()=>{
 expect(componentDeliveryScopeIssue({version:1,type:'table',columns:['条目'],rows:[['a'],['b']]},'至少3条记录')).toContain('至少3')
 expect(componentDeliveryScopeIssue({version:1,type:'news',items:[{title:'a'}]},'不少于3篇')).toContain('至少3')
 expect(componentDeliveryScopeIssue({version:1,type:'table',columns:['条目'],rows:[['a']]},'最近30天数据，每页20条')).toBeUndefined()
})
it('counts series as subjects for dated trend axes and never duplicate labels as new subjects',()=>{
 const data={version:1,type:'chart',variant:'line',labels:['2026-01-01','2026-01-02','2026-01-03'],series:[{name:'A',values:[1,2,3]}]}
 expect(componentDeliveryScopeIssue(data,'至少3家公司走势')).toContain('实际交付1')
 expect(componentDeliveryScopeIssue({...data,variant:'horizontal',labels:['A','A','A']},'至少3个对象')).toContain('实际交付1')
})
