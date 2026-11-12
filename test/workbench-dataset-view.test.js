import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {assertWorkbenchViewSources} from '../packages/dsh-research-task-runtime/dataset-view-contract.js';
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js';
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateSummary} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js';
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';

it('renders complete native charts from explicit aggregate declarations without inventing their fields',()=>{
 const plan={requestId:'delivery-totals',title:'交付总览',sharedDatasets:[
  {id:'facts',label:'原始明细',asOf:'2026-11-09',note:'原始交付清单',fields:[{key:'状态',label:'状态'},{key:'团队',label:'团队'},{key:'预算万元',label:'预算万元',unit:'万元'}],records:[{id:'D01',状态:'进行中',团队:'甲',预算万元:1.2},{id:'D02',状态:'已完成',团队:'乙',预算万元:3.1},{id:'D03',状态:'进行中',团队:'甲',预算万元:2.1}]},
  {id:'counts',label:'状态统计',note:'按全部原始任务计算',aggregate:{dataset:'facts',groupBy:['状态'],measures:[{key:'任务数',label:'任务数',op:'count',unit:'条'}]}},
  {id:'budget',label:'预算统计',note:'按全部原始任务计算',aggregate:{dataset:'facts',groupBy:['团队','状态'],measures:[{key:'预算合计',label:'预算合计',op:'sum',field:'预算万元',unit:'万元'}]}}
 ],panels:[
  {title:'状态分布',prompt:'以柱状图呈现各状态任务数',type:'view',view:{dataset:'counts',subject:'交付任务',unit:'条',variant:'bar',sections:[{kind:'compare',label:'状态',fields:['任务数']}]}},
  {title:'预算分布',prompt:'横向条形图展示预算合计',type:'chart',view:{dataset:'budget',unit:'万元',variant:'horizontal',sections:[{kind:'compare',title:'预算合计'}]}},
  {title:'原始清单',prompt:'查看所有记录',type:'view',view:{dataset:'facts',sections:[{kind:'records',fields:['id','状态','团队','预算万元']}]}}
 ]};
 const result=validateWorkbench(plan);
 expect(result.panels[0].artifact).toMatchObject({type:'chart',variant:'bar',labels:['进行中','已完成'],series:[{name:'任务数',values:[2,1]}],unit:'条'});
 expect(result.panels[1].artifact).toMatchObject({type:'chart',variant:'horizontal',labels:['甲 · 进行中','乙 · 已完成'],series:[{name:'预算合计',values:[3.3,3.1]}],unit:'万元'});
 expect(result.panels[2].artifact.dataset.records).toEqual(plan.sharedDatasets[0].records);
 expect(validateWorkbench(result)).toEqual(result);
 const interactive=structuredClone(plan);interactive.panels[0].view.filters=['状态'];
 expect(()=>validateWorkbench(interactive)).toThrow(/组合视图配置/);
 const ambiguous=structuredClone(plan);ambiguous.sharedDatasets[2].aggregate.measures.push({key:'count',label:'条数',op:'count'});
 ambiguous.panels[1].prompt='用横向条形图展示各团队的汇总。';
 expect(()=>validateWorkbench(ambiguous)).toThrow(/图表字段必须是/);
});

it('accepts exact unambiguous display labels as shared field references without rekeying source facts',()=>{
 const source={id:'org',label:'人员资料',asOf:'原文未注明',note:'原文件 [T1]',fields:[{key:'unit',label:'部门'},{key:'staff',label:'姓名'},{key:'state',label:'状态'}],records:[{id:'a',unit:'监管一部',staff:'张甲',state:'待核'}]};
 const plan={requestId:'document-labels',title:'机构工作台',sharedDatasets:[source],panels:[
  {title:'人员速查',prompt:'按部门筛选并查看待核状态',type:'view',view:{dataset:'org',filters:['部门'],details:['状态'],where:[{field:'状态',op:'in',values:['待核']}],sections:[{kind:'records',fields:['部门','姓名','状态']}]}},
  {title:'组织结构',prompt:'部门和人员层级',type:'mind-map',hierarchy:{dataset:'org',levels:['部门','姓名'],details:['状态']}}
 ]};
 const result=validateWorkbench(plan);
 expect(result.panels[0].view).toMatchObject({filters:['unit'],details:['state'],where:[{field:'state',op:'in',values:['待核']}],sections:[{kind:'records',fields:['unit','staff','state']}]});
 expect(result.panels[1].artifact.content).toContain('张甲');
 expect(result.sharedDatasets[0].records).toEqual(source.records);
 const ambiguous=structuredClone(plan);ambiguous.sharedDatasets[0].fields[1].label='部门';
 expect(()=>validateWorkbench(ambiguous)).toThrow();
});
it('keeps a filtered shared table searchable with the full source and its own calculation note',()=>{
 const source={id:'ledger',label:'清算台账',asOf:'2026-11-09',note:'模拟清算批次原表',fields:[{key:'id',label:'批次号'},{key:'diff',label:'差额（账面−托管）',unit:'万元'}],records:[{id:'J01',diff:0},{id:'J02',diff:-2}]};
 const plan=validateWorkbench({requestId:'filtered-table',title:'清算对账',sharedDatasets:[source],panels:[
  {title:'差异清单',prompt:'列出账面和托管有差额的批次',type:'table',view:{dataset:'ledger',note:'差额等于账面减托管',where:[{field:'差额',op:'ne',value:0}]}}
 ]});
 const {artifact}=plan.panels[0];
 expect(artifact.dataset.records).toEqual(source.records);
 expect(artifact.view).toMatchObject({note:'差额等于账面减托管',where:[{field:'diff',op:'ne',value:0}],sections:[{kind:'records',fields:['id','diff']}]});
 expect(acceptArtifactOutput(JSON.stringify(artifact))).toContain('差额等于账面减托管');
 expect(validateWorkbench(plan)).toEqual(plan);
});
const input=()=>({requestId:'book-shared',title:'古籍工坊交接演练',dataMode:'simulated',sharedDatasets:[bookDataset()],panels:[archiveView(),scheduleView(),priorityView()].map((view,i)=>({title:['逐册档案与比较','三日设备排程','复检优先级'][i],prompt:['按负责人和阶段筛选逐册档案，选择任意两册比较完整病害与交接。','查看每册入柜出柜、等待原因与复检；不能有同柜重叠。','按负责人筛选并修改复检优先级，保留实际原含水率和验收结果。'][i],type:'view',size:'large',view}))});
async function setup(initialPlans){
 const dir=await mkdtemp(join(tmpdir(),'dataset-workbench-'));let data={version:1,tasks:[]},tool;
 const storage={save:async v=>{data=structuredClone(v)},load:async()=>structuredClone(data)};
 const adapter={start:vi.fn(async r=>({childSessionId:r.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'note',title:'补充（模拟）',asOf:'虚构演练记录',content:'模拟补充说明'})}]}),dispose:async()=>{}}))};
 const runtime=new ResearchTaskRuntime({adapter,storage,retryDelayMs:0});
 const filePath=join(dir,'plans.json');if(initialPlans)await writeFile(filePath,JSON.stringify(initialPlans));const dispose=await registerWorkbench({agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime,{filePath});
 const exec={agent:{session:{id:'parent',events:[{type:'user/message',data:{id:'u',source:{kind:'user'},content:[{type:'text',text:'生成虚构古籍修复工作台，8册、2名修复师、1个干燥柜，完整档案、任意两册比较、占用排程与复检优先级。'}]}}]}},signal:new AbortController().signal};
 return {tool,exec,runtime,storage,adapter,filePath,close:async()=>{await runtime.dispose();await dispose();await rm(dir,{recursive:true,force:true})}};
}
describe('workbench common records at the real tool boundary',()=>{
 it('checks actual assignments against an explicitly sized team before publishing prepared task cards',async()=>{
  const fields=[{key:'id',label:'编号'},{key:'task',label:'任务名称'},{key:'owner',label:'负责人'}]
  const records=Array.from({length:12},(_,i)=>({id:'T'+i,task:'模拟任务'+i,owner:'成员'+(i%7+1)}))
  const plan={requestId:'team-scope',title:'新品上线',dataMode:'simulated',sharedDatasets:[{id:'tasks',label:'上线任务',fields,records}],panels:[{title:'上线排程',type:'view',prompt:'显示全部任务与负责人',view:{dataset:'tasks',filters:['owner'],sections:[{kind:'records',fields:['task','owner']}]}}]}
  const f=await setup();f.exec.agent.session.events[0].data.content[0].text='给一个6人团队做新品上线协作工作台，用清楚标注的模拟数据。共12项任务，每项有负责人和日期，跨卡用同一批任务。'
  try{
   await expect(f.tool.execute(plan,f.exec)).rejects.toThrow(/6人团队.*7位负责人/)
   expect(f.runtime.tasks.size).toBe(0)
   const repaired=structuredClone(plan);for(const row of repaired.sharedDatasets[0].records)if(row.owner==='成员7')row.owner='成员6'
   expect((await f.tool.execute(repaired,f.exec)).status).toBe('prepared')
   const delivered=readTemplateModel(JSON.parse([...f.runtime.tasks.values()][0].finalOutput)).data.dataset
   expect(delivered.records).toEqual(repaired.sharedDatasets[0].records)
   expect(()=>assertWorkbenchViewSources(validateWorkbench({...plan,originalRequest:'请做一个工作台。不要把“给6人团队做任务台”当成本次需求。'}))).not.toThrow()
  }finally{await f.close()}
 })
 it('accepts declared default subsets through the advertised tool schema and preserves them in delivery',async()=>{
  const f=await setup(),plan=input();plan.panels=[plan.panels[0]];
  plan.panels[0].view.where=[{field:'owner',op:'in',values:[plan.sharedDatasets[0].records[0].owner]},{field:'moisture',op:'notNull'}];
  try{
   expect(validateJsonSchemaValue(f.tool.parameters,plan)).toEqual([]);
   expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared');
   const delivered=readTemplateModel(JSON.parse([...f.runtime.tasks.values()][0].finalOutput)).data;
   expect(delivered.view.where).toEqual(plan.panels[0].view.where);expect(delivered.dataset.records).toEqual(plan.sharedDatasets[0].records);
   expect(f.adapter.start).not.toHaveBeenCalled();
   const invalid=structuredClone(plan);invalid.panels[0].view.where[0].op='eval';expect(validateJsonSchemaValue(f.tool.parameters,invalid).length).toBeGreaterThan(0);
  }finally{await f.close()}
 });
 it('resolves three views losslessly and idempotently without mutating the plan',()=>{
  const plan=input(),before=structuredClone(plan),value=validateWorkbench(plan);
  expect(value.sharedDatasets).toEqual(plan.sharedDatasets);
  for(const p of value.panels){expect(p.artifact.type).toBe('view');expect(p.artifact.dataset).toEqual(plan.sharedDatasets[0]);expect(p.artifact.title).toContain('模拟')}
  expect(validateWorkbench(value)).toEqual(value);expect(plan).toEqual(before);
  const changed=structuredClone(value);changed.panels[0].artifact.dataset.records[0].moisture=90;expect(()=>validateWorkbench(changed)).toThrow(/共同|冲突/);
 });
 it('accepts complete records with explicit identities and omitted id display metadata without another model call',async()=>{
  const f=await setup();const plan=input();plan.sharedDatasets[0].fields=plan.sharedDatasets[0].fields.filter(field=>field.key!=='id');
  try{const receipt=await f.tool.execute(plan,f.exec);expect(receipt.status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled();const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.input.sharedDatasets[0].records).toEqual(plan.sharedDatasets[0].records);expect((await f.tool.execute(plan,f.exec)).planId).toBe(receipt.planId);expect(f.runtime.tasks.size).toBe(3)}finally{await f.close()}
 });
 it('prepares complete views with shared scenario notes directly and retains planning notes as provenance without presenting them as verified record facts',async()=>{
  const f=await setup(),plan=input();plan.sharedContext='全部为虚构演练；两位修复师，一台干燥柜。<说明>不能延长三日窗口。';
  try{expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled();const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.input.sharedContext).toBe(plan.sharedContext);expect(validateWorkbench(saved.input)).toEqual(saved.input);for(const task of f.runtime.tasks.values()){const spec=JSON.parse(task.finalOutput);expect(readTemplateModel(spec).data.context).toBe(plan.sharedContext);expect(spec.html).toContain('&lt;说明&gt;不能延长三日窗口。');expect(spec.html).toMatch(/<aside hidden data-component-source-info>[\s\S]*规划备注（实际事实以完整记录为准）/)}}finally{await f.close()}
 });
 it('keeps Chinese field keys and their filter/detail references without model-side translation',async()=>{
  const f=await setup(),plan=input(),dataset=plan.sharedDatasets[0];dataset.fields.find(field=>field.key==='owner').key='负责人';for(const record of dataset.records){record['负责人']=record.owner;delete record.owner;}
  plan.panels=[{title:'中文字段档案',prompt:'按负责人筛选，点选查看负责人，保留原始编号和中文字段。',type:'view',size:'large',view:{dataset:dataset.id,filters:['负责人'],details:['负责人'],sections:[{kind:'records',fields:['负责人']}]}}];
  try{expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared');const spec=JSON.parse([...f.runtime.tasks.values()][0].finalOutput);expect(readTemplateModel(spec).data.dataset).toEqual(dataset);expect(spec.html).toContain('data-view-filter="负责人"');expect(f.adapter.start).not.toHaveBeenCalled()}finally{await f.close()}
 });
 it('retains the canonical source through acceptance and readback, never degrading to generic HTML data',()=>{
  const value=validateWorkbench(input());for(const p of value.panels){const accepted=acceptArtifactOutput(JSON.stringify(p.artifact));expect(accepted).toBeTruthy();const spec=JSON.parse(accepted),model=readTemplateModel(spec);expect(model.templateId).toBe('view');expect(model.data).toEqual(p.artifact);expect(spec.html).toContain('B08');expect(templateSummary(spec).message).toContain('组合')}
 });
 it.each(['parallel','unknown-field','conflicting-view','missing-data','render-budget','unused-dataset','conflicting-record-facts','conflicting-null','conflicting-unit'])('rejects %s before starting tasks or persisting a partial plan',async kind=>{
  const f=await setup(),plan=input();
  if(['unused-dataset','conflicting-record-facts','conflicting-null','conflicting-unit'].includes(kind)){
   const other=structuredClone(plan.sharedDatasets[0]);other.id='drying-events';plan.sharedDatasets.push(other);
   if(kind!=='unused-dataset'){plan.panels[2].view.dataset=other.id;plan.sharedDatasets[0].recordScope='books';other.recordScope='books';}
   if(kind==='conflicting-record-facts')other.records[0].moisture=999;
   if(kind==='conflicting-null')other.records[0].moisture=null;
   if(kind==='conflicting-unit')other.fields.find(f=>f.key==='moisture').unit='ratio';
  }
  if(kind==='render-budget'){
   plan.sharedDatasets=[{id:'books',label:'大记录',asOf:'模拟',note:'完整记录',fields:[{key:'id',label:'编号'},{key:'description',label:'完整描述'}],records:Array.from({length:6},(_,i)=>({id:'B'+i,description:'&'.repeat(7800)}))}];
   plan.panels=[{title:'完整列表',prompt:'保留全部长记录与四个对照区域。',type:'view',size:'large',view:{dataset:'books',sections:Array.from({length:4},()=>({kind:'records',fields:['id','description']}))}}];
  }
  if(kind==='parallel')plan.generationMode='parallel';
  if(kind==='unknown-field')plan.panels[0].view.details=['unknown'];
  if(kind==='conflicting-view')plan.panels[0].type='html';if(kind==='missing-data')delete plan.sharedDatasets;
  try{await expect(f.tool.execute(plan,f.exec)).rejects.toThrow();expect(f.runtime.tasks.size).toBe(0);expect(f.adapter.start).not.toHaveBeenCalled();await expect(readFile(f.filePath,'utf8')).rejects.toMatchObject({code:'ENOENT'})}finally{await f.close()}
 });
 it.each(['consistent-snapshot','independent-events','independent-local-ids'])('preserves valid multiple datasets with %s without guessing shared values',async kind=>{
  const f=await setup(),plan=input(),other=structuredClone(plan.sharedDatasets[0]);other.id='events';
  if(kind==='consistent-snapshot'){plan.sharedDatasets[0].recordScope='books';other.recordScope='books';}
  if(kind==='independent-events')for(const record of other.records){record.id='event-'+record.id;record.moisture=99;}
  if(kind==='independent-local-ids')for(const record of other.records)record.moisture=99;
  plan.sharedDatasets.push(other);plan.panels[2].view.dataset=other.id;const before=structuredClone(plan);
  try{expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared');expect(plan).toEqual(before);expect(f.adapter.start).not.toHaveBeenCalled();const tasks=[...f.runtime.tasks.values()];expect(readTemplateModel(JSON.parse(tasks[2].finalOutput)).data.dataset).toEqual(other);expect(readTemplateModel(JSON.parse(tasks[0].finalOutput)).data.dataset).toEqual(plan.sharedDatasets[0]);}finally{await f.close()}
 });
 it('returns an existing completed request unchanged when new creation rules would reject its old orphan dataset',async()=>{
  const raw=input(),other=structuredClone(raw.sharedDatasets[0]);other.id='old-unused';raw.sharedDatasets.push(other);
  const value=validateWorkbench(raw),saved={...value,input:value,id:'old-plan',parentSessionId:'parent',ready:true,panels:value.panels.map((p,i)=>({...p,nodeId:'old-'+i,taskId:'old-task-'+i}))};
  const f=await setup([saved]);try{expect((await f.tool.execute(raw,f.exec)).planId).toBe('old-plan');expect(f.runtime.tasks.size).toBe(0);expect(f.adapter.start).not.toHaveBeenCalled();expect(JSON.parse(await readFile(f.filePath,'utf8'))).toEqual([saved]);}finally{await f.close()}
 });
 it('creates all complete views immediately, deduplicates both live and restored tool retries',async()=>{
  const f=await setup();try{
   const receipt=await f.tool.execute(input(),f.exec);expect(receipt.status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled();expect(f.runtime.tasks.size).toBe(3);
   const plan=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(plan.panels.every(p=>p.taskId)).toBe(true);
   for(const task of f.runtime.tasks.values())expect(readTemplateModel(JSON.parse(task.finalOutput)).data.dataset).toEqual(bookDataset());
   expect((await f.tool.execute(input(),f.exec)).planId).toBe(receipt.planId);expect(f.runtime.tasks.size).toBe(3);
   const restored=new ResearchTaskRuntime({adapter:f.adapter,storage:f.storage});await restored.restore();
   try{expect(restored.tasks.size).toBe(3);const first=plan.panels[0];const retry=await restored.start({parentSessionId:'parent',canvasNodeId:first.nodeId,kind:'container',prompt:first.prompt});expect(retry.state).toBe('completed');expect(readTemplateModel(JSON.parse(retry.finalOutput)).data).toEqual(first.artifact);expect(f.adapter.start).not.toHaveBeenCalled()}finally{await restored.dispose()}
  }finally{await f.close()}
 });
 it('indexes retained complete snapshots for mixed deferred cards without duplicating every fact in prompts',()=>{
  const raw={...input(),generationMode:'deferred',sharedContext:'全部为虚构演练。'};raw.sharedDatasets[0].records[0].moisture=77.4321;raw.sharedDatasets[0].records[0].owner='唯一共同负责人';raw.panels.push({title:'共同含水率解释',type:'html',size:'large',prompt:'基于共同8册的实际演练含水率与负责人，解释交接。'});
  const value=validateWorkbench(raw),prompt=workbenchPanelPrompt(value,value.panels.at(-1));expect(prompt).toContain(JSON.stringify(value.sharedDatasets.map(dataset=>({id:dataset.id,label:dataset.label,recordCount:dataset.records.length}))));expect(prompt).not.toContain('77.4321');expect(prompt).not.toContain('唯一共同负责人');expect(prompt).toContain('宿主来源快照');
  const missing=structuredClone(raw);delete missing.generationMode;delete missing.sharedContext;expect(()=>validateWorkbench(missing)).toThrow(/共同|deferred/);
 });
 it('does not discard changed requirements or regenerate facts without the current snapshot',async()=>{
  const f=await setup();try{
   await f.tool.execute(input(),f.exec);const first=[...f.runtime.tasks.values()][0];
   const changed='保留完整原档案，另外增加交接阶段的说明，不能丢失原含水率。';
   const receipt=await f.runtime.start({parentSessionId:'parent',canvasNodeId:first.canvasNodeId,kind:'container',prompt:changed});
   expect(receipt.state).not.toBe('completed');await vi.waitFor(()=>expect(f.adapter.start).toHaveBeenCalled());
   const call=f.adapter.start.mock.calls[0][0];expect(call.query).toBe(changed);expect(call.prompt).toContain(JSON.stringify(bookDataset()));expect(call.prompt).toContain('不退回旧需求');
  }finally{await f.close()}
 });
 it('retries an unstarted fully prepared plan instead of returning a false prepared receipt',async()=>{
  const f=await setup();try{
   const start=vi.spyOn(f.runtime,'startPreparedBatch').mockRejectedValueOnce(Error('temporary persistence failure'));
   await expect(f.tool.execute(input(),f.exec)).rejects.toThrow('temporary persistence');expect(f.runtime.tasks.size).toBe(0);
   const receipt=await f.tool.execute(input(),f.exec);expect(receipt.status).toBe('prepared');expect(start).toHaveBeenCalledTimes(2);expect(f.runtime.tasks.size).toBe(3);
   const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.panels.every(p=>p.taskId&&!p.error)).toBe(true);
  }finally{await f.close()}
 });
 it('does not duplicate prepared tasks after a partial mixed-batch failure',async()=>{
  const f=await setup();try{
   const payload={...input(),generationMode:'deferred',sharedContext:'全部为虚构古籍演练。'};payload.panels.push({title:'补充交接',type:'note',size:'large',prompt:'补充本地虚构的交接注意事项。'});
   const batch=vi.spyOn(f.runtime,'startBatch').mockRejectedValueOnce(Error('transient dispatch failure'));
   await expect(f.tool.execute(payload,f.exec)).rejects.toThrow('transient');expect(f.runtime.tasks.size).toBe(3);
   const old=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(old.panels.slice(0,3).every(p=>p.taskId&&!p.error)).toBe(true);
   await f.tool.execute(payload,f.exec);expect(f.runtime.tasks.size).toBe(4);expect(batch.mock.calls[1][0].panels).toHaveLength(1);
  }finally{await f.close()}
 });
 it('prepares common views while only remaining deferred cards launch children',async()=>{
  const f=await setup();try{
   const value={...input(),generationMode:'deferred',sharedContext:'全部为虚构古籍演练，不联网。'};value.panels.push({title:'补充交接说明',type:'note',size:'large',prompt:'保留原共同演练约束，补充日常交接注意事项。'});
   const result=await f.tool.execute(value,f.exec);expect(result.status).toBe('accepted');expect(f.runtime.tasks.size).toBe(4);await vi.waitFor(()=>expect(f.adapter.start).toHaveBeenCalledTimes(1));expect(f.adapter.start.mock.calls[0][0].query).toContain('补充交接说明');expect([...f.runtime.tasks.values()].filter(t=>readTemplateModel(t.finalOutput?JSON.parse(t.finalOutput):null)?.templateId==='view')).toHaveLength(3);
  }finally{await f.close()}
 });
});


it('keeps prepared and accepted receipts idempotent while explicitly deferring refresh verification',async()=>{
 const f=await setup();try{
  const plan=input(),receipt=await f.tool.execute(plan,f.exec)
  expect(receipt).toMatchObject({status:'prepared',refreshStatus:'unverified'})
  expect(receipt.refreshGuidance).toContain('刷新配置待确认')
  expect(await f.tool.execute(plan,f.exec)).toEqual(receipt)
  expect(f.adapter.start).not.toHaveBeenCalled()
  const deferred={...input(),requestId:'refresh-unverified',generationMode:'deferred',sharedContext:'模拟演练',panels:[...input().panels,{title:'补充说明',type:'html',size:'large',prompt:'根据共同8册完整事实提供交接说明。'}]}
  const accepted=await f.tool.execute(deferred,f.exec)
  expect(accepted).toMatchObject({status:'accepted',refreshStatus:'unverified'})
  expect(accepted.refreshGuidance).toBe(receipt.refreshGuidance)
  const retry=await f.tool.execute(deferred,f.exec)
  expect(retry).toEqual(accepted)
 }finally{await f.close()}
})

it('fills only absent simulated dataset descriptions without resending records or inventing a timestamp',async()=>{
 const f=await setup(),plan=input();delete plan.sharedDatasets[0].asOf;delete plan.sharedDatasets[0].note;const before=structuredClone(plan)
 try{
  expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled()
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0].input.sharedDatasets[0]
  expect(saved.records).toEqual(plan.sharedDatasets[0].records);expect(saved.asOf).toBe('模拟数据，时点未指定');expect(saved.note).toBe('用户请求的模拟数据');expect(plan).toEqual(before)
  expect(()=>validateWorkbench({...plan,dataMode:'source'})).toThrow(/字段无效|必须提供/)
  const empty=structuredClone(plan);empty.sharedDatasets[0].asOf='';expect(()=>validateWorkbench(empty)).toThrow(/不能为空/)
 }finally{await f.close()}
})


it('marks omitted simulated cells unknown without changing records, dates or undeclared fields',async()=>{
 const f=await setup(),plan=input();plan.sharedDatasets[0].fields.push({key:'unknown',label:'未掌握'});const before=structuredClone(plan)
 try{
  expect((await f.tool.execute(plan,f.exec)).status).toBe('prepared')
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0].input.sharedDatasets[0]
  expect(saved.records).toEqual(plan.sharedDatasets[0].records.map(r=>({...r,unknown:null})))
  expect(plan).toEqual(before)
  const extra=structuredClone(plan);extra.requestId='extra';extra.sharedDatasets[0].records[0].extra='不能丢弃'
  await expect(f.tool.execute(extra,f.exec)).rejects.toThrow('未声明：extra')
 }finally{await f.close()}
})


it('prepares real shared records without simulated metadata and only starts genuinely pending cards',async()=>{
 const f=await setup(),plan=input();plan.dataMode='source';plan.title='原档案工作台';plan.sharedDatasets[0].asOf='原档案时点 2026-11-01';plan.sharedDatasets[0].note='来源：用户提供的逐册交接记录，未注明部分保持null';
 f.exec.agent.session.events[0].data.content[0].text='使用已取得的真实档案制作工作台，保留来源和逐册明细。'
 try{
  const validated=validateWorkbench(plan);expect(validateWorkbench(validated)).toEqual(validated)
  expect(validated.sharedDatasets).toEqual(plan.sharedDatasets)
  for(const panel of validated.panels)expect(panel.artifact.title).not.toContain('模拟')
  const receipt=await f.tool.execute(plan,f.exec);expect(receipt.status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled()
  expect((await f.tool.execute(plan,f.exec)).planId).toBe(receipt.planId)
  for(const task of f.runtime.tasks.values())expect(readTemplateModel(JSON.parse(task.finalOutput)).data.dataset).toEqual(plan.sharedDatasets[0])
  const mixed={...plan,requestId:'real-mixed',panels:[...plan.panels,{title:'交接说明',type:'markdown',prompt:'依据已有真实档案写交接说明。'}]}
  const normalized=validateWorkbench(mixed);expect(workbenchPanelPrompt(normalized,normalized.panels.at(-1))).toContain('宿主来源快照');expect(workbenchPanelPrompt(normalized,normalized.panels.at(-1))).not.toContain(JSON.stringify(normalized.sharedDatasets))
  expect((await f.tool.execute(mixed,f.exec)).status).toBe('accepted');await vi.waitFor(()=>expect(f.adapter.start).toHaveBeenCalledTimes(1));expect(f.adapter.start.mock.calls[0][0].hostContext.sharedDatasets).toEqual(normalized.sharedDatasets)
  const missing=structuredClone(plan);delete missing.sharedDatasets[0].records[0].owner;expect(()=>validateWorkbench(missing)).toThrow(/缺少：owner/)
 }finally{await f.close()}
})


it.each(['source','simulated'])('retains large %s snapshots for one pending card without overflowing its prompt or rebuilding prepared cards',async dataMode=>{
 const f=await setup(),raw=input();raw.dataMode=dataMode;raw.requestId='large-'+dataMode;
 // Keep the actual field contract and all records; enlarge an already-declared text field.
 const dataset=raw.sharedDatasets[0],field=dataset.fields.find(field=>field.key==='disease');
 for(let i=0;i<dataset.records.length;i++)dataset.records[i][field.key]='原始完整说明'+i+('x'.repeat(3000));
 raw.panels=[raw.panels[0],{title:'补充交接说明',type:'html',prompt:'依据同一份完整档案补充交接说明，不更改原记录。'}];
 if(dataMode==='simulated'){raw.generationMode='deferred';raw.sharedContext='全部为明确虚构演练。'}else{dataset.asOf='原始资料时点 2026-11-01';dataset.note='用户提供的完整交接资料';f.exec.agent.session.events[0].data.content[0].text='用已有真实档案做工作台，保留全部记录并补充交接说明。'}
 try{
  const normalized=validateWorkbench(raw),prompt=workbenchPanelPrompt(normalized,normalized.panels[1]);expect(prompt.length).toBeLessThan(18000);expect(prompt).not.toContain('x'.repeat(100));
  expect((await f.tool.execute(raw,f.exec)).status).toBe('accepted');await vi.waitFor(()=>expect(f.adapter.start).toHaveBeenCalled());expect(new Set(f.adapter.start.mock.calls.map(([request])=>request.taskId)).size).toBe(1);expect(f.runtime.tasks.size).toBe(2);expect(f.adapter.start.mock.calls[0][0].hostContext.sharedDatasets).toEqual(normalized.sharedDatasets)
  const prepared=[...f.runtime.tasks.values()].find(task=>task.finalOutput&&readTemplateModel(JSON.parse(task.finalOutput))?.templateId==='view');expect(readTemplateModel(JSON.parse(prepared.finalOutput)).data.dataset).toEqual(normalized.sharedDatasets[0])
 }finally{await f.close()}
})

it('checks actual source view records and default subsets against explicit and inherited cohort requirements',()=>{
 const source={requestId:'scope-view',title:'来源范围',dataMode:'source',originalRequest:'至少比较8只基金的收益',sharedDatasets:[{id:'funds',label:'基金原记录',asOf:'来源数据日',note:'已取得的真实来源快照',fields:[{key:'id',label:'编号'},{key:'name',label:'名称'},{key:'return',label:'收益'}],records:Array.from({length:8},(_,i)=>({id:'F'+i,name:'基金'+i,return:i}))}],panels:[{title:'同批收益比较',type:'view',prompt:'比较同批基金收益，保留完整明细。',view:{dataset:'funds',sections:[{kind:'records',fields:['id','name','return']}]}}]}
 expect(validateWorkbench(source).panels[0].artifact.dataset.records).toHaveLength(8)
 const missing=structuredClone(source);missing.sharedDatasets[0].records.splice(1);expect(()=>validateWorkbench(missing)).toThrow(/实际交付1/)
 const subset=structuredClone(source);subset.panels[0].view.where=[{field:'id',op:'in',values:['F0','F1']}];expect(()=>validateWorkbench(subset)).toThrow(/实际交付2/)
 const hidden=structuredClone(source);hidden.panels[0].view.sections[0].fields=['id','name'];expect(()=>validateWorkbench(hidden)).toThrow(/实际交付0/)
})
it('shows the filter key when every record is required to retain that field',()=>{
 const fields=[{key:'id',label:'记录编号'},{key:'ts_code',label:'基金代码'},{key:'nav_date',label:'净值日期'},
  {key:'unit_nav',label:'单位净值'},{key:'adj_nav',label:'复权单位净值'}];
 const dataset={id:'nav',label:'净值快照',asOf:'2026-10-23',note:'Tushare fund_nav',fields,
  records:[{id:'NAV01',ts_code:'217022.OF',nav_date:'2026-10-23',unit_nav:1.8713,adj_nav:2.344065}]};
 const panel={title:'净值明细',type:'view',prompt:'按基金代码筛选，保留每条记录的基金代码、净值日期、单位净值（元，4位小数）、复权单位净值（元）。',
  view:{dataset:'nav',filters:['ts_code'],sections:[{kind:'records',fields:['nav_date','unit_nav','adj_nav']}]}};
 const plan=validateWorkbench({requestId:'visible-filter-key',title:'基金净值',dataMode:'source',sharedDatasets:[dataset],panels:[panel]});
 expect(plan.panels[0].view.sections[0].fields).toEqual(['ts_code','nav_date','unit_nav','adj_nav']);
 expect(plan.panels[0].artifact.dataset.records).toEqual(dataset.records);
});
