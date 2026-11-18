import {describe,it,expect} from 'vitest';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {operationsDataIssue,operationsTemplateSchema} from '../packages/dsh-research-task-runtime/operations-template-contract.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js';
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
const samples={
 progress:{version:1,type:'progress',title:'目标与进度',subject:'季度研究计划',asOf:'2026-09-30 · 用户提供',unit:'项',deadline:'2026-10-15',items:[{label:'资料收集',current:24,target:24},{label:'数据核验',current:20,target:30},{label:'报告整理',current:28,target:46}]},
 tasks:{version:1,type:'tasks',title:'任务清单',subject:'本周研究清单',asOf:'2026-09-30 · 用户提供',owner:'研究组',items:[{id:'a',title:'收集公告',completed:true},{id:'b',title:'核对财务来源',completed:false,owner:'李明',due:'2026-10-15',detail:'逐项核验来源与披露日期'}]}
};
function render(data){return JSON.parse(acceptArtifactOutput(JSON.stringify(data)));}
function runtime(data){
 const window=new Window({settings:{disableJavaScriptEvaluation:true}}),spec=render(data);
 window.document.write(spec.html);
 const context=vm.createContext({document:window.document});
 for(const script of window.document.querySelectorAll('script:not([type="application/json"])'))vm.runInContext(script.textContent,context);
 return window;
}
describe('Figma 21Z operations data templates',()=>{
 it.each(['progress','tasks'])('gives a %s generation child the selected presentation contract',type=>{
  const prompt=buildResearchTaskPrompt({parentSessionId:'session',canvasNodeId:'panel',kind:'container',prompt:workbenchPanelPrompt({title:'运营'}, {title:type,type,prompt:'展示本周运营记录',size:'large'})});
  expect(prompt).toContain(operationsTemplateSchema(type));expect(prompt).toMatch(/ework-workbench-components v\d+\.\d+\.\d+/u);
 });
 it.each(['progress','tasks'])('retains complete %s source data through the public creation path',type=>{
  const artifact=samples[type],panel={title:artifact.title,type,prompt:'按提供记录展示',size:'large',artifact};
  const result=validateWorkbench({requestId:type,title:'研究运营',dataMode:'source',panels:[panel]});
  expect(result.panels[0].artifact).toEqual(artifact);expect(readTemplateModel(render(artifact)).data).toEqual(artifact);
  expect(templateFor(artifact).schema).toBe(operationsTemplateSchema(type));expect(workbenchDesignTemplate(panel).figma).toMatch(/^1918:/);
 });
 it('computes progress from the original counts and keeps overachievement visible',()=>{
  expect(render(samples.progress).html).toContain('已完成 72 / 100 项');
  const artifact={...samples.progress,items:[{label:'超额完成',current:30,target:20}]};
  expect(render(artifact).html).toContain('150%');expect(readTemplateModel(render(artifact)).data).toEqual(artifact);
 });
 it('never turns a source snapshot into a business write control',()=>{
  const window=runtime(samples.tasks);expect(window.document.querySelector('input[type="checkbox"]').disabled).toBe(true);
  expect(window.document.getElementById('add-task')).toBeNull();
  expect(window.document.getElementById('task-visible').hidden).toBe(true);
  const filter=window.document.getElementById('task-filter');filter.value='todo';filter.dispatchEvent(new window.Event('change'));
  expect(window.document.querySelectorAll('.task-entry:not([hidden])')).toHaveLength(1);
  expect(window.document.getElementById('task-visible').hidden).toBe(false);
  expect(window.document.getElementById('task-visible').textContent).toBe('显示 1 / 2 条');
  expect(window.document.getElementById('operation-count').textContent).toBe('1 / 2 已完成');
  filter.value='';filter.dispatchEvent(new window.Event('change'));
  expect(window.document.getElementById('task-visible').hidden).toBe(true);
 });
 it('completes, filters, adds and reverses local tasks without dropping original details',()=>{
  const window=runtime({...samples.tasks,mode:'local'}),document=window.document,input=document.getElementById('task-1');
  input.checked=true;input.dispatchEvent(new window.Event('change',{bubbles:true}));
  expect(document.getElementById('operation-count').textContent).toBe('2 / 2 已完成');
  document.getElementById('add-task').click();document.getElementById('new-task-title').value='新增本地任务';
  document.getElementById('add-task-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  expect(document.getElementById('operation-count').textContent).toBe('2 / 3 已完成');
  input.checked=false;input.dispatchEvent(new window.Event('change',{bubbles:true}));
  expect(document.getElementById('operation-count').textContent).toBe('1 / 3 已完成');
  expect(document.querySelector('details').textContent).toContain('逐项核验来源与披露日期');
 });
 it('mounts a blank personal checklist and accepts the first real task',()=>{
  const artifact={version:1,type:'tasks',title:'一周待办',asOf:'我的清单',mode:'local',items:[]};
  const plan=validateWorkbench({requestId:'weekly-tasks',title:artifact.title,dataMode:'source',panels:[{title:artifact.title,prompt:'在本地添加并勾选本周的待办事项',type:'tasks',size:'large',artifact}]});
  const d=runtime(plan.panels[0].artifact).document;
  expect(d.querySelectorAll('.task-entry')).toHaveLength(0);
  expect(d.getElementById('task-empty').textContent).toContain('添加第一项任务');
  d.getElementById('add-task').click();
  d.getElementById('new-task-title').value='周四整理笔记';
  d.getElementById('add-task-form').dispatchEvent(new d.defaultView.Event('submit',{bubbles:true,cancelable:true}));
  const check=d.querySelector('.task-entry input');
  check.checked=true;check.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}));
  expect(d.getElementById('operation-count').textContent).toBe('1 / 1 已完成');
  expect(operationsDataIssue({...artifact,mode:'snapshot'})).toBeTruthy();
  expect(operationsDataIssue({...samples.progress,mode:'local',items:[]})).toBeTruthy();
 });
 it('updates local progress and refuses invalid counts without changing the total',()=>{
  const window=runtime({...samples.progress,mode:'local'}),document=window.document,input=document.getElementById('progress-1');
  input.value='30';input.dispatchEvent(new window.Event('input'));expect(document.getElementById('operation-count').textContent).toBe('已完成 82 / 100 项');
  input.value='-1';input.dispatchEvent(new window.Event('input'));expect(document.getElementById('operation-count').textContent).toBe('已完成 82 / 100 项');expect(document.getElementById('operation-error').textContent).toContain('非负');
 });
 it('preserves source task statuses and combines status and owner filters with local completion',()=>{
  const data={...samples.tasks,mode:'local',items:[
   {id:'a',title:'潜器试航',completed:false,status:'进行中',owner:'郑海峰',detail:'保留试航记录'},
   {id:'b',title:'仪器校准',completed:false,status:'进行中',owner:'林晓岚'},
   {id:'c',title:'物资装载',completed:false,status:'未开始',owner:'郑海峰'}
  ]};
  expect(operationsDataIssue(data)).toBeNull();expect(readTemplateModel(render(data)).data).toEqual(data);
  const window=runtime(data),d=window.document,filter=d.getElementById('task-filter'),owner=d.getElementById('task-owner');
  const shown=()=>[...d.querySelectorAll('.task-entry:not([hidden])')].map(row=>row.querySelector('strong').textContent);
  expect(d.body.textContent).toContain('来源状态：进行中');
  filter.value='status:进行中';filter.dispatchEvent(new window.Event('change'));expect(shown()).toEqual(['潜器试航','仪器校准']);
  owner.value='郑海峰';owner.dispatchEvent(new window.Event('change'));expect(shown()).toEqual(['潜器试航']);
  const check=d.getElementById('task-0');check.checked=true;check.dispatchEvent(new window.Event('change',{bubbles:true}));
  expect(shown()).toEqual(['潜器试航']);expect(d.querySelector('.task-entry').dataset.status).toBe('进行中');
  filter.value='done';filter.dispatchEvent(new window.Event('change'));expect(shown()).toEqual(['潜器试航']);
  check.checked=false;check.dispatchEvent(new window.Event('change',{bubbles:true}));expect(shown()).toEqual([]);
  expect(d.getElementById('task-empty').hidden).toBe(false);
  expect(operationsDataIssue({...data,items:[{...data.items[0],status:{name:'进行中'}}]})).toMatch(/status/);
 });
 it.each([
  {...samples.progress,items:[{label:'无目标',current:0,target:0}]},
  {...samples.tasks,items:[{id:'a',title:'一',completed:false},{id:'a',title:'二',completed:false}]},
  {...samples.tasks,items:[{id:'a',title:'一',completed:'false'}]},
  {...samples.progress,items:[{label:'缺失',current:null,target:10}]}
 ])('rejects invalid business records before mounting: %#',data=>{expect(operationsDataIssue(data)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined();});
 it('requires custom simulated records instead of substituting unrelated examples',()=>{
  expect(()=>validateWorkbench({requestId:'custom',title:'模拟计划',dataMode:'simulated',panels:[{title:'运营清单',type:'tasks',prompt:'本周客服任务',size:'large'}]})).toThrow('无关清单');
 });
 it('keeps source text inert, including script-shaped titles and notes',()=>{
  const data={...samples.tasks,note:'</script><img src=x onerror=alert(1)>',items:[{id:'safe',title:'<script>alert(1)</script>',completed:false,status:'<img src=x onerror=alert(1)>',owner:'"><script>alert(1)</script>'}]},spec=render(data);
  expect(spec.html).not.toContain('<img src=x');expect(spec.html).not.toContain('<script>alert(1)');expect(readTemplateModel(spec).data).toEqual(data);
 });
});
