import {expect,it} from 'vitest'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {validateWorkbench,workbenchQuantityDeclarations,countWorkbenchRecords,workbenchScopeDeficits,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {assertWorkbenchViewSources} from '../packages/dsh-research-task-runtime/dataset-view-contract.js'
import {componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'

const records=count=>Array.from({length:count},(_,i)=>({id:'T'+String(i+1).padStart(2,'0'),task:'任务'+(i+1),status:i<2?'待办':'完成',note:'完整说明 '+i}))
const input=(dataMode='simulated',request='32项模拟任务',count=1)=>({requestId:'quantity-coverage',title:'任务看板',dataMode,originalRequest:'创建工作台，包含'+request+'，保留全部任务。',sharedDatasets:[{id:'tasks',label:'任务原记录',asOf:dataMode==='simulated'?'模拟时点':'原记录时点',note:dataMode==='simulated'?'用户允许的模拟任务':'用户提供的原任务记录',fields:[{key:'id',label:'编号'},{key:'task',label:'任务名称'},{key:'status',label:'状态'},{key:'note',label:'完整说明'}],records:records(count)}],panels:[{title:'任务清单',type:'view',prompt:'显示完整任务清单，保留原编号、状态和说明。',view:{dataset:'tasks',sections:[{kind:'records',fields:['id','task','status','note']}]}}]})
const failure=value=>{try{validateWorkbench(value);throw Error('should be partial')}catch(error){expect(error.code).toBe('WORKBENCH_SCOPE_INCOMPLETE');return error}}

it('counts distinct net-value observations by date while keeping fund coverage by fund',()=>{
 const chart={version:1,type:'chart',variant:'line',title:'基金净值',labels:['20260901','20260902','20260903'],
  series:[{name:'基金A',values:[1,1.1,1.2]}]}
 const table={version:1,type:'table',title:'净值明细',columns:['基金代码','净值日期','单位净值'],
  rows:[['A','2026-09-01',1],['A','2026-09-02',1.1],['A','2026-09-03',1.2]]}
 const plan=artifact=>({panels:[{title:artifact.title,prompt:'展示至少3条净值记录。',artifact}]})
 for(const artifact of [chart,table]){
  expect(workbenchScopeDeficits(plan(artifact))).toEqual([])
  expect(workbenchScopeDeficits({panels:[{...plan(artifact).panels[0],prompt:'展示全部3条记录。'}]})).toEqual([])
  expect(componentDeliveryScopeIssue(artifact,'展示至少3条净值记录。')).toBeUndefined()
  expect(componentDeliveryScopeIssue(artifact,'展示至少3条记录。')).toBeUndefined()
  expect(componentDeliveryScopeIssue(artifact,'比较至少3只基金的净值。')).toMatch(/实际交付1/)
 }
 chart.labels[2]='2026-09-02'
 table.rows[2][1]='20260902'
 for(const artifact of [chart,table]){
  expect(workbenchScopeDeficits(plan(artifact))[0]).toMatchObject({expected:3,actual:2})
  expect(componentDeliveryScopeIssue(artifact,'展示至少3条净值记录。')).toMatch(/实际交付2/)
 }
})

it('treats decimal precision as formatting and still counts actual people',()=>{
 expect(workbenchQuantityDeclarations('比较3位基金经理，净值保留4位小数。')).toMatchObject([{expected:3,unit:'位',entity:'基金经理'}])
 const chart={version:1,type:'chart',variant:'line',title:'基金净值',labels:['20260901','20260902'],series:[{name:'基金A',values:[1,1.1]}]}
 expect(componentDeliveryScopeIssue(chart,'净值保留至少4位小数。')).toBeUndefined()
})

it('retains a common source dataset with native cards and counts only rendered records',()=>{
 const raw=input('source','32项任务',32)
 raw.panels=[{title:'任务清单',type:'table',prompt:'列出完整32项任务。',
  content:{title:'任务清单',rows:records(32)}}];
 const prepared=validateWorkbench(raw);
 expect(()=>assertWorkbenchViewSources(prepared)).not.toThrow();
 expect(prepared.sharedDatasets[0].records).toHaveLength(32);
 raw.panels[0].content.rows=records(3);
 expect(failure(raw).scopeDeficits[0]).toMatchObject({expected:32,actual:3});
});

it('keeps validated source cards when an independent draft needs to be regenerated',()=>{
 const table={version:1,type:'table',title:'部门明细',columns:['部门','负责人'],rows:[['办公室','张某'],['综合处','李某']]};
 const raw={requestId:'independent-draft',dataMode:'source',title:'组织架构工作台',originalRequest:'只用附件整理实际层级和部门明细。',panels:[
  {type:'mind-map',title:'组织层级',prompt:'按附件绘制完整组织层级。',artifact:{version:1,type:'mind-map',title:'组织层级',root:{label:'总部'}}},
  {type:'table',title:'部门明细',prompt:'展示附件中的部门与负责人。',artifact:table}
 ]};
 expect(()=>validateWorkbench(raw)).toThrow();
 const repaired=validateWorkbench(raw,{recoverPreparedArtifacts:true});
 expect(repaired.panels[0]).toMatchObject({type:'mind-map',title:'组织层级',prompt:raw.panels[0].prompt});
 expect(repaired.panels[0].artifact).toBeUndefined();
 expect(repaired.panels[1].artifact).toEqual(table);
 expect(validateWorkbench(repaired)).toEqual(repaired);
});

it('keeps an incomplete prepared view and its retry status across runtime restore',async()=>{
 const error=failure(input('source','32项任务',3));
 const panel=error.partialPlan.panels[0];
 const originalRequest=error.partialPlan.originalRequest;
 const hostContext={workbenchRequest:{originalRequest,dataMode:'source'},sourceRequirement:panel.prompt,
  sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt}};
 let saved;
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{throw Error('prepared view should not call a model')}},storage:{save:async document=>{saved=structuredClone(document)}}});
 const [receipt]=await runtime.startPreparedBatch({parentSessionId:'parent',panels:[{canvasNodeId:'tasks',prompt:panel.prompt,artifact:panel.artifact,hostContext}]});
 expect(receipt).toMatchObject({state:'completed',deliveryStatus:'partial',recoveryMode:'incomplete-scope'});
 expect(receipt.unmetRequirements[0]).toMatch(/32项任务.*3 项/u);
 expect(readTemplateModel(JSON.parse(receipt.finalOutput)).data.dataset.records).toHaveLength(3);
 const restored=new ResearchTaskRuntime({adapter:{start:async()=>{throw Error('restore should not call a model')}},storage:{load:async()=>saved,save:async()=>{}}});
 try{
  await restored.restore();
  expect(restored.inspect({parentSessionId:'parent',taskId:receipt.taskId})).toMatchObject({
   deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:receipt.unmetRequirements,finalOutput:receipt.finalOutput
  });
 }finally{await restored.dispose();await runtime.dispose();}
});

it('exports immutable parsing, unique counting and deficit reporting for ordinary runtime completion checks',()=>{
 expect(workbenchQuantityDeclarations('完整交付32项任务，每页20条记录。')).toEqual([{expected:32,entity:'任务',unit:'项',sourceOnly:false,displayCount:true}])
 const completed=validateWorkbench(input('source','32项任务',32)),before=structuredClone(completed)
 expect(countWorkbenchRecords(completed.panels[0])).toBe(32);expect(workbenchScopeDeficits(completed)).toEqual([])
 const fewer=structuredClone(completed);fewer.panels[0].artifact.dataset.records.splice(1)
 expect(workbenchScopeDeficits(fewer)).toContainEqual(expect.objectContaining({expected:32,actual:1,missing:31}))
 expect(completed).toEqual(before)
})

it.each(['source','simulated'])('preserves known %s records and structured deficits for exact and minimum user counts',dataMode=>{
 for(const request of ['32项任务','至少32项任务','三十二项任务','至少三十二项任务']){
  const raw=input(dataMode,request),before=structuredClone(raw),error=failure(raw)
  expect(error.scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:1,missing:31,reason:'missing-records'}))
  expect(error.message).toContain('实际交付1');expect(error.message).toContain('部分结果')
  expect(error.partialPlan.sharedDatasets[0].records).toEqual(before.sharedDatasets[0].records)
  expect(error.partialPlan.panels[0].artifact.dataset.records).toEqual(before.sharedDatasets[0].records)
  expect(raw).toEqual(before)
  const repaired=structuredClone(raw);repaired.sharedDatasets[0].records.push(...records(32).slice(1))
  const complete=validateWorkbench(repaired);expect(complete.panels[0].artifact.dataset.records).toHaveLength(32);expect(validateWorkbench(complete)).toEqual(complete)
 }
})

it.each(['source','simulated'])('applies explicit panel counts to visible %s rows while keeping a complete source behind a requested subset',dataMode=>{
 const raw=input(dataMode,'32项任务',32);raw.panels[0].view.where=[{field:'status',op:'in',values:['待办']}]
 raw.panels[0].prompt='从32项任务中筛选待办任务。'
 expect(validateWorkbench(raw).panels[0].artifact.dataset.records).toHaveLength(32)
 raw.panels[0].prompt='列出32项待办任务。'
 expect(failure(raw).scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:2,missing:30}))
})

it('marks a filtered prepared view partial when the original request requires the full visible list',async()=>{
 const raw=input('source','32项任务',32);
 raw.originalRequest='创建工作台，完整显示全部32项任务。';
 raw.panels[0].prompt='保留任务的原编号和状态。';
 raw.panels[0].view.where=[{field:'status',op:'in',values:['待办']}];
 const {partialPlan,scopeDeficits}=failure(raw);
 expect(scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:2,missing:30}));
 const panel=partialPlan.panels[0];
 const hostContext={workbenchRequest:{originalRequest:raw.originalRequest,dataMode:'source'},sourceRequirement:panel.prompt,
  sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt}};
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{throw Error('prepared view should not call a model')}},storage:{save:async()=>{}}});
 try{
  const [receipt]=await runtime.startPreparedBatch({parentSessionId:'parent',panels:[{canvasNodeId:'tasks',prompt:workbenchPanelPrompt(partialPlan,panel),artifact:panel.artifact,hostContext}]});
  expect(receipt).toMatchObject({state:'completed',deliveryStatus:'partial',recoveryMode:'incomplete-scope'});
  expect(receipt.unmetRequirements[0]).toMatch(/32项任务.*2 项/u);
  expect(readTemplateModel(JSON.parse(receipt.finalOutput)).data.dataset.records).toHaveLength(32);
 }finally{await runtime.dispose();}
});

it('keeps prepared native quote and news cards scoped to their individual requirements',async()=>{
 const originalRequest='创建一个可实时监控 BTC/USD、ETH/USD、SOL/USD 的工作台。三个交易对各看小时价格和成交量，另看比特币相关新闻，分行情与资讯两个页签。行情每 5 分钟更新，新闻每 15 分钟更新。';
 const quotes=['BTC/USD','ETH/USD','SOL/USD'].map(code=>({
  title:`${code} 小时行情`,prompt:`展示 ${code} 的小时价格、成交量和数据来源。`,type:'financial-widget',
  library:{id:'builtin-quote',options:{symbols:[{code,market:'CRYPTO',name:code}],period:'1h',dataSource:'kraken',refreshMinutes:5}}
 }));
 const news={title:'比特币相关新闻',prompt:'搜索比特币相关新闻，保留时间和来源。',type:'financial-widget',
  library:{id:'builtin-news',options:{query:'比特币',dataSource:'doubao',refreshMinutes:15}}};
 const plan=validateWorkbench({requestId:'native-crypto',title:'加密现货监控',dataMode:'source',originalRequest,
  panels:[...quotes,news],tabs:[{name:'行情',panelIndexes:[0,1,2]},{name:'资讯',panelIndexes:[3]}]});
 const prepared=plan.panels.map((panel,index)=>({canvasNodeId:`native-${index}`,prompt:workbenchPanelPrompt(plan,panel),artifact:panel.artifact,
  hostContext:{workbenchRequest:{originalRequest,dataMode:'source'},sourceRequirement:panel.prompt,
   sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt}}}));
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{throw Error('native components should not call a model')}},storage:{save:async()=>{}}});
 try{
  const receipts=await runtime.startPreparedBatch({parentSessionId:'parent',panels:prepared});
  expect(receipts.map(receipt=>[receipt.state,receipt.deliveryStatus])).toEqual(Array.from({length:4},()=>['completed',undefined]));

  const [quote]=prepared;
  const [partial]=await runtime.startPreparedBatch({parentSessionId:'parent',panels:[{...quote,canvasNodeId:'requested-count',
   hostContext:{...quote.hostContext,sourceRequirement:'这张行情卡列出3个交易对。'}}]});
  expect(partial).toMatchObject({state:'completed',deliveryStatus:'partial',recoveryMode:'incomplete-scope'});
  expect(partial.unmetRequirements[0]).toMatch(/需要 3个交易对.*仅有 1 项/u);
 }finally{await runtime.dispose();}
});

it('keeps an explicitly requested risk subset complete alongside the full list',()=>{
 const raw=input('simulated','32项模拟任务',32);
 raw.originalRequest='用明确标注的模拟数据准备32项任务。任务明细显示全部任务，并另列风险跟进清单。明细可以搜索、筛选、分页。';
 raw.panels.push({title:'高风险任务清单',type:'view',prompt:'聚焦需要跟进的待办风险任务。',view:{...raw.panels[0].view,where:[{field:'status',op:'in',values:['待办']}]}});
 const plan=validateWorkbench(raw);
 expect(plan.panels.map(panel=>countWorkbenchRecords(panel))).toEqual([32,2]);
});

it.each(['source','simulated'])('counts actual %s content and native task items instead of repeated identities or a claimed total',dataMode=>{
 const raw=input(dataMode,'32项任务');delete raw.sharedDatasets
 raw.panels=[{title:'任务清单',type:'table',prompt:'显示完整任务清单。',content:{title:'任务清单',rows:records(32).map(row=>({...row,id:'repeated'}))}}]
 expect(failure(raw).scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:1,missing:31}))
 raw.panels[0].content.rows=records(32);expect(validateWorkbench(raw).panels[0].artifact.rows).toHaveLength(32)
 delete raw.panels[0].content;raw.panels[0].type='tasks';raw.panels[0].artifact={version:1,type:'tasks',title:'任务清单',asOf:'原任务时点',items:records(1).map(row=>({id:row.id,title:row.task,completed:false}))}
 expect(failure(raw).scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:1}))
 raw.panels[0].artifact.items=records(32).map(row=>({id:row.id,title:row.task,completed:false}));raw.panels[0].prompt='至少32项完整任务。';expect(validateWorkbench(raw).panels[0].artifact.items).toHaveLength(32)
})

it('does not confuse pagination, upper bounds, optional examples, panel counts or aggregate views with record coverage',()=>{
 for(const request of ['每页32条记录','最多32项任务','不超过32项任务','不要32项任务','3个面板','4个字段','例如32项任务','8–32项任务'])expect(()=>validateWorkbench(input('simulated',request))).not.toThrow()
 const raw=input('source','32项任务',32)
 raw.panels.push({title:'状态汇总',type:'table',prompt:'根据全部32项任务汇总状态，不逐项重复明细。',content:{title:'状态汇总',rows:[{状态:'待办',条数:2},{状态:'完成',条数:30}]}})
 // A referenced population is not a demand for 32 independent aggregate rows.
 const prepared=validateWorkbench(raw);expect(prepared.panels).toHaveLength(2)
 expect(workbenchScopeDeficits({...prepared,panels:[prepared.panels[1]]})).toEqual([])
 const summary={title:'任务摘要',type:'markdown',prompt:'简要概括全部任务的风险。',artifact:{version:1,type:'markdown',title:'任务摘要',content:'风险概述。'}}
 expect(workbenchScopeDeficits({...prepared,panels:[summary]})).toEqual([])
 const explicit={...summary,prompt:'输出32条风险摘要。'};expect(workbenchScopeDeficits({...prepared,panels:[explicit]})).toContainEqual(expect.objectContaining({expected:32,actual:null}))
})

it('does not accept prose that claims to be the complete task list without its actual records',()=>{
 const raw=input('simulated','32项任务');delete raw.sharedDatasets
 raw.panels=[{title:'完整任务清单',type:'markdown',prompt:'呈现完整任务清单。',content:{title:'完整任务清单',body:'已完成32项任务整理，正文仅有总体说明。'}}]
 const error=failure(raw);expect(error.scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:null,missing:null,reason:'unverifiable'}));expect(error.partialPlan.panels[0].artifact.content).toContain('总体说明')
})

it('preserves requirements for genuinely pending panels without claiming that a missing result has completed',()=>{
 const raw=input('simulated','32项任务');delete raw.sharedDatasets;raw.generationMode='deferred';raw.sharedContext='全部为明确模拟任务，保留32项范围。';raw.panels=[{title:'任务清单',type:'html',prompt:'完整任务清单。'}]
 const pending=validateWorkbench(raw);expect(pending.originalRequest).toBe(raw.originalRequest);expect(pending.panels[0]).not.toHaveProperty('artifact')
})
