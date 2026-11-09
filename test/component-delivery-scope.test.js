import {expect,it} from 'vitest'
import {componentCohortRequest,componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'
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

it('does not count unverified candidates with no quantitative facts as delivered subjects',()=>{
 const data={version:1,type:'market',variant:'table',columns:['基金代码','基金简称','近一年收益率（%）','净值日期','管理人'],rows:Array.from({length:12},(_,i)=>[String(i).padStart(6,'0')+'.OF','未核实：名单查询无返回','缺失','2026-11-05','缺失'])}
 expect(componentDeliveryScopeIssue(data,'至少8只产品的收益率、净值和规模')).toContain('实际交付0')
 const valid={...data,rows:Array.from({length:8},(_,i)=>['code'+i,'名称'+i,'1.23%','2026-11-05','管理人'])}
 expect(componentDeliveryScopeIssue(valid,'至少8只产品的收益率、净值和规模')).toBeUndefined()
})
it('keeps collection obligations after a renderer change and permits custom visuals with explicit records',()=>{
 const custom={version:1,type:'html',html:'<div>12个指标，已完成8只产品比较</div>'}
 expect(componentDeliveryScopeIssue(custom,'至少8只产品收益比较')).toContain('无法核验')
 expect(componentDeliveryScopeIssue({version:1,type:'dashboard',metrics:Array(9).fill({label:'收益',value:1})},'至少8只产品收益比较')).toContain('无法核验')
 const records={type:'table',columns:['产品','收益'],rows:Array.from({length:8},(_,i)=>['对象'+i,i])}
 expect(componentDeliveryScopeIssue({...custom,html:'<script type="application/json" data-component-delivery-records>'+JSON.stringify(records)+'</script><div>自定义可视化</div>'},'至少8只产品收益比较')).toBeUndefined()
})
it('does not accept a hierarchy-shaped missing-data skeleton as a real source-backed graph',()=>{
 const graph={version:1,type:'mind-map',title:'组织关系',content:'# 关系\n- 区域（待填入原表）\n  - 部门（待填入原表）'}
 expect(componentDeliveryScopeIssue(graph,'基于原表完整保留组织层级')).toContain('占位')
 expect(componentDeliveryScopeIssue({...graph,content:'# 机构\n- 已知部门\n  - 负责人未掌握，不代表空缺'},'按附件完整保留组织层级')).toBeUndefined()
})

it('inherits an explicit original cohort for same-batch comparison cards without leaking it into methodology',()=>{
 const original='给投委会做比较工作台。至少比较8只中长期纯债基金的收益、回撤、波动率、净值和规模。'
 const panel='近一年收益排名。基于对照表同批基金数据绘图，并保留各项明细。'
 const request=componentCohortRequest(panel,original)
 expect(request).toContain('至少比较8只中长期纯债基金')
 const chart={type:'chart',labels:['a','b','c','d','e','f'],series:[{name:'收益',values:[1,2,3,4,5,6]}]}
 expect(componentDeliveryScopeIssue(chart,request)).toContain('至少8')
 expect(componentCohortRequest('来源与口径说明',original)).toBe('来源与口径说明')
 expect(componentCohortRequest('整体规模与对象数量摘要',original)).toBe('整体规模与对象数量摘要')
 expect(componentCohortRequest('收益排名','需要8张卡，最近20天数据')).toBe('收益排名')
})
