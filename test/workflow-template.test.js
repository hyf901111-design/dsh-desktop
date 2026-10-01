import {describe,it,expect} from 'vitest';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {operationsDataIssue,operationsTemplateSchema,requestedOperationsType} from '../packages/dsh-research-task-runtime/operations-template-contract.js';
import {renderOperationsArtifact} from '../packages/dsh-research-task-runtime/operations-artifact.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js';

const samples={
 approval:{version:1,type:'approval',title:'审批记录',subject:'研究报告发布申请',asOf:'2026-09-30 · 用户提供',status:'pending',applicant:'张晓',submittedAt:'2026-09-30 10:24',items:[{id:'a',reviewer:'李明',stage:'数据核验',status:'approved',comment:'确认来源与披露日期'},{id:'b',reviewer:'王悦',stage:'研究负责人',status:'pending',comment:'核验结论与风险提示'}]},
 alerts:{version:1,type:'alerts',title:'工作台提醒',asOf:'2026-09-30 · 用户提供',items:[{id:'a',title:'公司公告更新',summary:'新增季度报告',date:'2026-09-30 10:00',category:'公告',read:false},{id:'b',title:'资料核验截止',summary:'核对财务数据来源与披露日期',date:'2026-09-30 09:00',category:'任务',read:false},{id:'c',title:'资料归档完成',summary:'原始文件已归档',date:'2026-09-29 18:00',category:'任务',read:true}]}
};
function render(data){return JSON.parse(acceptArtifactOutput(JSON.stringify(data)));}
function runtime(data){
 const window=new Window({settings:{disableJavaScriptEvaluation:true}}),spec=render(data);
 window.document.write(spec.html);
 const context=vm.createContext({document:window.document});
 for(const script of window.document.querySelectorAll('script:not([type="application/json"])'))vm.runInContext(script.textContent,context);
 return window;
}
describe('Figma 21Z workflow templates',()=>{
 it.each(['approval','alerts'])('routes %s through its selected template and retains source data',type=>{
  const artifact=samples[type],panel={title:artifact.title,type,prompt:'按提供记录展示',size:'large',artifact};
  const plan=validateWorkbench({requestId:type,title:'研究运营',dataMode:'source',panels:[panel]});
  expect(plan.panels[0].artifact).toEqual(artifact);expect(readTemplateModel(render(artifact)).data).toEqual(artifact);
  expect(templateFor(artifact).schema).toBe(operationsTemplateSchema(type));expect(workbenchDesignTemplate(panel).figma).toBe(type==='approval'?'1918:346911':'1918:354877');
  const prompt=buildResearchTaskPrompt({parentSessionId:'session',canvasNodeId:'panel',kind:'container',prompt:workbenchPanelPrompt({title:'运营'},panel)});
  expect(prompt).toContain('唯一交付格式：'+operationsTemplateSchema(type));expect(prompt).toContain('v1.20.0');
  expect(renderOperationsArtifact(artifact)).toBeNull();
 });
 it('resolves explicit workflow types and familiar user requests',()=>{
  expect(requestedOperationsType('type:approval')).toBe('approval');expect(requestedOperationsType('审批流程')).toBe('approval');
  expect(requestedOperationsType('type:alerts')).toBe('alerts');expect(requestedOperationsType('通知列表')).toBe('alerts');
 });
 it('keeps snapshots read only while allowing view filters',()=>{
  const approval=runtime(samples.approval).document;
  expect(approval.querySelector('textarea')).toBeNull();expect(approval.querySelector('[data-review-decision]')).toBeNull();
  const window=runtime(samples.alerts),document=window.document;
  expect(document.querySelector('input').disabled).toBe(true);expect(document.getElementById('alerts-read-all')).toBeNull();
  const filter=document.getElementById('alert-filter');filter.value='unread';filter.dispatchEvent(new window.Event('change'));
  expect(document.querySelectorAll('.alert-entry:not([hidden])')).toHaveLength(2);
 });
 it('requires a return reason and separates personal decisions from source statuses',()=>{
  const data={...samples.approval,mode:'local'},window=runtime(data),document=window.document;
  const before=[...document.querySelectorAll('.workflow-tag')].map(x=>x.textContent);
  document.querySelector('[data-review-decision="rejected"]').click();
  expect(document.getElementById('workflow-error').textContent).toContain('不能为空');expect(document.getElementById('personal-review').hidden).toBe(true);
  document.getElementById('review-reason').value='补充披露日期';document.querySelector('[data-review-decision="rejected"]').click();
  expect(document.getElementById('personal-review').textContent).toBe('个人审阅记录：退回修改 · 补充披露日期');
  document.getElementById('review-reason').value='已核对来源';document.querySelector('[data-review-decision="approved"]').click();
  expect(document.getElementById('personal-review').textContent).toBe('个人审阅记录：同意 · 已核对来源');
  expect([...document.querySelectorAll('.workflow-tag')].map(x=>x.textContent)).toEqual(before);expect(readTemplateModel(render(data)).data.status).toBe('pending');
 });
 it('marks, unmarks, filters and marks all reminders without dropping contents',()=>{
  const window=runtime({...samples.alerts,mode:'local'}),document=window.document;
  const input=document.getElementById('alert-read-0');input.checked=true;input.dispatchEvent(new window.Event('change'));
  expect(document.getElementById('alert-count').textContent).toBe('1 条未读 · 3 条');
  const filter=document.getElementById('alert-filter');filter.value='unread';filter.dispatchEvent(new window.Event('change'));
  expect(document.querySelectorAll('.alert-entry:not([hidden])')).toHaveLength(1);
  const category=document.getElementById('alert-category');category.value='公告';category.dispatchEvent(new window.Event('change'));
  expect(document.getElementById('alert-empty').hidden).toBe(false);
  input.checked=false;input.dispatchEvent(new window.Event('change'));expect(document.getElementById('alert-empty').hidden).toBe(true);
  document.getElementById('alerts-read-all').click();expect(document.getElementById('alert-count').textContent).toBe('0 条未读 · 3 条');
  expect(document.getElementById('alerts-read-all').disabled).toBe(true);expect(document.getElementById('alert-empty').hidden).toBe(false);
  expect(document.querySelector('details').textContent).toContain('新增季度报告');
 });
 it.each([
  {...samples.approval,status:'complete'},
  {...samples.approval,items:[{id:'a',reviewer:'李明',stage:'核验',status:'pending'},{id:'a',reviewer:'王悦',stage:'研究',status:'pending'}]},
  {...samples.alerts,items:[{...samples.alerts.items[0],read:'false'}]},
  {...samples.alerts,items:[{...samples.alerts.items[0],summary:''}]},
  {...samples.approval,submitUrl:'https://example.com/approve'}
 ])('rejects unsupported or incomplete records: %#',data=>{expect(operationsDataIssue(data)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined();});
 it.each(['approval','alerts'])('requires actual requested records for simulated %s',type=>{
  expect(()=>validateWorkbench({requestId:type,title:'模拟运营',dataMode:'simulated',panels:[{title:type,type,prompt:'本周研究记录',size:'large'}]})).toThrow('实际需求记录');
 });
 it('keeps source text inert',()=>{
  const data={...samples.alerts,note:'</script><img src=x onerror=alert(1)>',items:[{...samples.alerts.items[0],title:'<script>alert(1)</script>',category:'"><img src=x onerror=alert(1)>'}]},spec=render(data);
  expect(spec.html).not.toContain('<img src=x');expect(spec.html).not.toContain('<script>alert(1)');expect(readTemplateModel(spec).data).toEqual(data);
 });
});
