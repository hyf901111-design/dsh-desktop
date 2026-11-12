import {expect,it} from 'vitest'
import {componentCohortRequest,componentDeliveryScopeIssue,verifiedOutlineCoverage} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {verifiedChartRecordCount} from '../packages/dsh-research-task-runtime/dataset-aggregate.js'

it('verifies chart coverage against each source group and rejects equal totals assigned to different groups',()=>{
 const source={fields:[{key:'state',label:'状态'}],records:[{state:'完成'},{state:'完成'},{state:'处理中'}]}
 const chart={type:'chart',labels:['完成','处理中'],detailColumns:['状态','任务数（项）'],detailRows:[['完成',2],['处理中',1]]}
 expect(verifiedChartRecordCount(chart,[source])).toBe(3)
 expect(verifiedChartRecordCount({...chart,detailRows:[['完成',1],['处理中',2]]},[source])).toBeNull()
 expect(verifiedChartRecordCount({...chart,labels:['完成','其他']},[source])).toBeNull()
})
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

it('counts only unique plotted subjects with usable coordinates in native financial scatter charts',()=>{
 const data={type:'market',variant:'scatter',items:[{label:'基金甲',x:0,y:-1},{label:'基金乙',x:2,y:1},{label:'基金甲',x:3,y:2},{label:'基金丙',x:5,y:null}]}
 expect(componentDeliveryScopeIssue(data,'至少2只基金')).toBeUndefined()
 expect(componentDeliveryScopeIssue(data,'至少3只基金')).toContain('实际交付2')
})

it('does not count unverified candidates with no quantitative facts as delivered subjects',()=>{
 const data={version:1,type:'market',variant:'table',columns:['基金代码','基金简称','近一年收益率（%）','净值日期','管理人'],rows:Array.from({length:12},(_,i)=>[String(i).padStart(6,'0')+'.OF','未核实：名单查询无返回','缺失','2026-11-05','缺失'])}
 expect(componentDeliveryScopeIssue(data,'至少8只产品的收益率、净值和规模')).toContain('实际交付0')
 const valid={...data,rows:Array.from({length:8},(_,i)=>['code'+i,'名称'+i,'1.23%','2026-11-05','管理人'])}
 expect(componentDeliveryScopeIssue(valid,'至少8只产品的收益率、净值和规模')).toBeUndefined()
})

it('checks keyed table rows using the same projection that renders the table',()=>{
 const columns=[{key:'code',label:'对象代码'},{key:'value',label:'近一年收益率（%）'}]
 const data={type:'table',version:1,title:'收益比较',columns,rows:[
  {value:1,code:'A.OF'},{code:'B.OF',value:0},{code:'C.OF',value:null}
 ]}
 expect(componentDeliveryScopeIssue(data,'至少2只产品的收益率')).toBeUndefined()
 expect(componentDeliveryScopeIssue(data,'至少3只产品的收益率')).toContain('实际交付2')
 expect(componentDeliveryScopeIssue({...data,rows:[...data.rows,{code:'D.OF',wrong:2}]},'至少2只产品的收益率')).toContain('无法核验')
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

it('verifies mind-map coverage using one source identity for each actual leaf',()=>{
 const records=[{id:'one',task:'DLV-001',project:'项目甲'},{id:'two',task:'DLV-002',project:'项目乙'}]
 const datasets=[{fields:[{key:'id',label:'记录编号'},{key:'task',label:'任务编号'},{key:'project',label:'项目'}],records}]
 const artifact={type:'mind-map',content:'# 组织\n- 项目甲\n  - DLV-001 已完成\n- 项目乙\n  - DLV-002 待验收'}
 expect(verifiedOutlineCoverage(artifact,datasets)).toEqual({records:2,groups:new Map([['项目',2]])})
 expect(verifiedOutlineCoverage({...artifact,content:artifact.content.replace('项目乙','项目甲')},datasets)?.groups.has('项目')).toBe(false)
 expect(verifiedOutlineCoverage({...artifact,content:artifact.content.replace('DLV-002','DLV-001')},datasets)).toBeNull()
 expect(verifiedOutlineCoverage({...artifact,content:artifact.content.replace('DLV-002','DLV-999')},datasets)).toBeNull()
 expect(verifiedOutlineCoverage(artifact,undefined)).toBeNull()
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

it('keeps another cards record minimum out of an inherited object cohort',()=>{
 const request=componentCohortRequest('同批对象的排名明细','至少比较8家企业的收入；另一张卡保留至少40条新闻。')
 const data={type:'table',columns:['名称','收入'],rows:Array.from({length:8},(_,i)=>['企业'+i,i])}
 expect(componentDeliveryScopeIssue(data,request)).toBeUndefined()
})

it('按管理人汇总时用宿主源数据核验覆盖基金数，仍校验本卡明确要求',async()=>{
 const {workbenchScopeDeficits}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const originalRequest='至少比较8只中长期纯债基金的收益率。'
 const sharedEvidence=JSON.stringify({columns:['代码','管理人'],rows:Array.from({length:8},(_,i)=>['F'+i,'管理人'+Math.min(i,6)])})
 const artifact={version:1,type:'table',title:'管理人汇总',columns:['管理人','旗下入选产品数','平均收益率'],rows:Array.from({length:7},(_,i)=>['管理人'+i,i===6?2:1,3])}
 const panel={title:'管理人汇总',type:'table',prompt:'按管理人汇总同一批基金的收益率',artifact}
 const plan={originalRequest,sharedEvidence,panels:[panel]}
 expect(workbenchScopeDeficits(plan)).toEqual([])
 expect(workbenchScopeDeficits({...plan,sharedEvidence:undefined})).not.toEqual([])
 const bad=structuredClone(plan);bad.panels[0].artifact.rows[0][1]=2
 expect(workbenchScopeDeficits(bad)).not.toEqual([])
 const explicit=structuredClone(plan);explicit.panels[0].prompt+='；至少展示8家管理人'
 expect(workbenchScopeDeficits(explicit)).not.toEqual([])
})

it('净值日和交易日数量按观测日期核验，缺一天仍报缺口',async()=>{
 const {workbenchScopeDeficits}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const artifact={version:1,type:'chart',variant:'line',title:'净值走势',labels:['2026-10-12','2026-10-13'],series:[{name:'净值',values:[1,1.02]}]}
 const panel={title:artifact.title,type:'chart',prompt:'展示2个净值日',artifact}
 expect(workbenchScopeDeficits({panels:[panel]})).toEqual([])
 expect(workbenchScopeDeficits({panels:[{...panel,prompt:'展示3个交易日'}]})).toEqual([expect.objectContaining({expected:3,actual:2})])
 expect(componentDeliveryScopeIssue(artifact,'至少3个净值日')).toContain('实际交付2')
})

it('净值明细按基金与观测日期核验，同一基金同日的重复行只计一次',async()=>{
 const {workbenchScopeDeficits}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const artifact={version:1,type:'market',variant:'table',title:'净值明细',columns:['基金代码','净值日期','单位净值'],
  rows:['A.OF','B.OF'].flatMap(code=>Array.from({length:10},(_,index)=>[code,`2026-10-${index+10}`,1+index/100]))}
 const panel={title:artifact.title,type:'table',prompt:'至少展示20条净值明细',artifact}
 expect(workbenchScopeDeficits({panels:[panel]})).toEqual([])
 expect(componentDeliveryScopeIssue(artifact,panel.prompt)).toBeUndefined()
 artifact.rows[19]=artifact.rows[18]
 expect(workbenchScopeDeficits({panels:[panel]})).toEqual([expect.objectContaining({expected:20,actual:19})])
})

it('组件数量不变成每张卡的业务记录数',async()=>{
 const {workbenchQuantityDeclarations}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 expect(workbenchQuantityDeclarations('三个都用现成组件，展示3个产品。')).toEqual([
  expect.objectContaining({expected:3,entity:'产品'})
 ])
})

it('按宿主保留的分组明细核对状态汇总，校验实际原任务数而非分组行数',async()=>{
 const {validateWorkbench,workbenchScopeDeficits}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const fields=[{key:'id',label:'编号'},{key:'status',label:'状态'}]
 const source={id:'tasks',label:'任务清单',asOf:'2026-11-11',note:'用户原任务',fields,records:[{id:'T01',status:'待办'},{id:'T02',status:'完成'},{id:'T03',status:'完成'},{id:'T04',status:'阻塞'}]}
 const group={id:'stats',label:'状态分布',aggregate:{dataset:'tasks',groupBy:['status'],measures:[{key:'count',label:'任务数',op:'count'}]}}
 const plan=validateWorkbench({requestId:'source-group',title:'交付工作台',originalRequest:'72条任务都保留。',sharedDatasets:[source,group],
  panels:[{type:'view',title:'整体进度与状态分布',prompt:'展示4条交付任务的三种状态分布，由源数据汇总。',view:{dataset:'stats',sections:[{kind:'compare',fields:['count']}]}}]})
 const [panel]=plan.panels, rendered=JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact)))
 expect(panel.view.sections).toEqual([{kind:'records',fields:['status','count']}])
 expect(workbenchScopeDeficits({...plan,panels:[{...panel,artifact:rendered}]})).toEqual([])
 const missing={...panel,prompt:'展示5条交付任务的状态分布，由源数据汇总。'}
 expect(workbenchScopeDeficits({...plan,panels:[missing]})).toEqual([expect.objectContaining({expected:5,actual:4})])
})

it('核对产品总览与分类汇总所引用的全量原记录',async()=>{
 const {validateWorkbench,workbenchScopeDeficits}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const fields=[{key:'id',label:'产品代码'},{key:'category',label:'类别'}];
 const source={id:'products',label:'产品原表',asOf:'2026-11-11',note:'产品原表',fields,records:[{id:'A',category:'固收'},{id:'B',category:'权益'},{id:'C',category:'固收'}]};
 const count=groupBy=>({dataset:'products',groupBy,measures:[{key:'count',label:'产品数',op:'count'}]});
 const plan=validateWorkbench({requestId:'product-coverage',title:'指数运营',sharedDatasets:[source,
  {id:'total',label:'市场总览',aggregate:count([])},
  {id:'groups',label:'类别覆盖',aggregate:count(['category'])}
 ],panels:[
  {type:'kpi',title:'市场总览',prompt:'来源：产品原表（3 只全量）。',view:{dataset:'total'}},
  {type:'view',title:'各类别覆盖',prompt:'3 只明细聚合，显示各类产品数。',view:{dataset:'groups',sections:[{kind:'records',fields:['count']}]}}
 ]});
 expect(workbenchScopeDeficits(plan)).toEqual([]);
 const mismatched=structuredClone(plan);
 mismatched.panels[1].artifact.dataset.records[0].count=1;
 expect(workbenchScopeDeficits(mismatched)).not.toEqual([]);
 const additional={...plan.panels[0],prompt:'来源：产品原表（4 只全量）。'};
 expect(workbenchScopeDeficits({...plan,panels:[additional]})).toEqual([expect.objectContaining({expected:4,actual:3})]);
})
