import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js';
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateSummary} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js';
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';
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
 it.each(['source','parallel','unknown-field','conflicting-view','missing-data','render-budget','unused-dataset','conflicting-record-facts','conflicting-null','conflicting-unit'])('rejects %s before starting tasks or persisting a partial plan',async kind=>{
  const f=await setup(),plan=input();
  if(['unused-dataset','conflicting-record-facts','conflicting-null','conflicting-unit'].includes(kind)){
   const other=structuredClone(plan.sharedDatasets[0]);other.id='drying-events';plan.sharedDatasets.push(other);
   if(kind!=='unused-dataset'){plan.panels[2].view.dataset=other.id;plan.sharedDatasets[0].recordScope='books';other.recordScope='books';}
   if(kind==='conflicting-record-facts')other.records[0].moisture=999;
   if(kind==='conflicting-null')other.records[0].moisture=null;
   if(kind==='conflicting-unit')other.fields.find(f=>f.key==='moisture').unit='ratio';
  }
  if(kind==='render-budget'){
   plan.sharedDatasets=[{id:'books',label:'大记录',asOf:'模拟',note:'完整记录',fields:[{key:'id',label:'编号'},{key:'description',label:'完整描述'}],records:Array.from({length:6},(_,i)=>({id:'B'+i,description:'x'.repeat(7000)}))}];
   plan.panels=[{title:'完整列表',prompt:'保留全部长记录与四个对照区域。',type:'view',size:'large',view:{dataset:'books',sections:Array.from({length:4},()=>({kind:'records',fields:['id','description']}))}}];
  }
  if(kind==='source')plan.dataMode='source';if(kind==='parallel')plan.generationMode='parallel';
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
 it('passes every resolved common fact to mixed deferred cards as data, not just verbal context',()=>{
  const raw={...input(),generationMode:'deferred',sharedContext:'全部为虚构演练。'};raw.sharedDatasets[0].records[0].moisture=77.4321;raw.sharedDatasets[0].records[0].owner='唯一共同负责人';raw.panels.push({title:'共同含水率解释',type:'html',size:'large',prompt:'基于共同8册的实际演练含水率与负责人，解释交接。'});
  const value=validateWorkbench(raw),prompt=workbenchPanelPrompt(value,value.panels.at(-1));expect(prompt).toContain(JSON.stringify(value.sharedDatasets));expect(prompt).toContain('77.4321');expect(prompt).toContain('唯一共同负责人');
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
  expect(()=>validateWorkbench({...plan,dataMode:'source'})).toThrow(/仅支持明确模拟数据/)
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
