import {describe,it,expect} from 'vitest';
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {specialChartSamples as samples} from './fixtures/special-chart-samples.js';
const box={title:'分组响应时长（模拟）',type:'chart',size:'medium',prompt:'chart.box；三项服务响应时长',artifact:{...samples.box,title:'分组响应时长（模拟）',unit:'分钟'}};
const hist={title:'总体分布（模拟）',type:'chart',size:'medium',prompt:'chart.histogram；与箱线图共用同一批样本',samplesFromPanel:box.title,artifact:{version:1,type:'chart',title:'总体分布（模拟）',variant:'histogram',unit:'分钟',binCount:6}};
const plan=panels=>({requestId:'cohort-test',title:'运营（模拟）',dataMode:'simulated',panels});
describe('shared distribution samples',()=>{
 it('resolves forward references once without mutating the source or losing duplicate observations',()=>{
  const input=plan([hist,box]),before=structuredClone(input),result=validateWorkbench(input);
  expect(input).toEqual(before);
  expect(result.panels[0].artifact.samples).toEqual(samples.box.groups.flatMap(g=>g.samples));
  expect(result.panels[0]).not.toHaveProperty('samplesFromPanel');
  result.panels[0].artifact.samples[0]=999;
  expect(result.panels[1].artifact.groups[0].samples[0]).toBe(1);
 });
 it('rejects the native failure case with seven dropped observations before creating any cards',()=>{
  const groups=[{name:'A',samples:Array.from({length:30},(_,i)=>i)},{name:'B',samples:Array.from({length:30},(_,i)=>i+30)},{name:'C',samples:Array.from({length:30},(_,i)=>i+60)}];
  const {samplesFromPanel,...duplicate}=hist;
  expect(()=>validateWorkbench(plan([{...duplicate,artifact:{...hist.artifact,samples:groups.flatMap(g=>g.samples).slice(0,83)}},{...box,artifact:{...box.artifact,groups}}]))).toThrow(/直方图 83 条，箱线图 90 条/);
 });
 it('compares multisets rather than treating repeated values as duplicates to remove',()=>{
  const {samplesFromPanel,...duplicate}=hist,values=samples.box.groups.flatMap(g=>g.samples);
  expect(()=>validateWorkbench(plan([{...duplicate,artifact:{...hist.artifact,samples:[...values].reverse()}},box]))).not.toThrow();
  expect(()=>validateWorkbench(plan([{...duplicate,artifact:{...hist.artifact,samples:[...values.slice(1),999]}},box]))).toThrow(/共用样本不一致/);
 });
 it('keeps unrelated distributions independent and supports an explicit source among several box plots',()=>{
  const {samplesFromPanel,...duplicate}=hist;
  expect(()=>validateWorkbench(plan([{...duplicate,prompt:'另一群体的响应时长',artifact:{...hist.artifact,samples:[9,10,11]}},box]))).not.toThrow();
  expect(()=>validateWorkbench(plan([hist,box,{...box,title:'另一群体（模拟）'}]))).not.toThrow();
 });
 it.each([
  {...hist,samplesFromPanel:'不存在'},
  {...hist,samplesFromPanel:hist.title},
  {...hist,artifact:{...hist.artifact,unit:'秒'}},
  {...hist,artifact:{...hist.artifact,samples:[1,2]}},
  {...hist,artifact:{...hist.artifact,bins:[{lower:0,upper:10,count:2}]}},
  {...box,samplesFromPanel:hist.title}
 ])('rejects invalid, ambiguous or competing source instructions %#',panel=>expect(()=>validateWorkbench(plan([panel,box]))).toThrow());
 it('does not fabricate raw samples from a box summary',()=>{
  const summary={...box,artifact:{...box.artifact,groups:[{name:'A',low:1,q1:2,median:3,q3:4,high:5,outliers:[]}],whiskerMethod:'最小最大'}};
  expect(()=>validateWorkbench(plan([hist,summary]))).toThrow(/不能用五数摘要还原样本/);
 });
});
