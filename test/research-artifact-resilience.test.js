import { describe, it, expect, vi } from 'vitest';
import { Window } from 'happy-dom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { acceptArtifactOutput, artifactReadableFallback } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';
import { parseResearchContainerSpec } from '../packages/dsh-research-task-runtime/artifact-validator.js';
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js';
const spec={version:1,type:'table',title:'公司对比',columns:['公司','收入'],rows:[['甲公司',12]]};
describe('component acceptance and recovery',()=>{
 it.each([JSON.stringify(spec),'已经取得数据。\n```json\n'+JSON.stringify(spec)+'\n```','检索受限，缺失数据已标注。\n'+JSON.stringify(spec)])('accepts a complete artifact surrounded by prose',input=>expect(JSON.parse(acceptArtifactOutput(input))).toEqual(spec));
 it('handles braces and quotes in HTML without executing it',()=>{const x={version:1,type:'html',title:'交互',html:'<h1>有效内容</h1><script>const x={a:"}"};</script>'};expect(JSON.parse(acceptArtifactOutput('说明\n'+JSON.stringify(x)))).toEqual(x)});
 it.each([{...spec,rows:[['wrong width']]},{...spec,rows:[]},{version:1,type:'kpi',title:'空',items:[]},{version:1,type:'html',title:'空',html:'<style>body{color:red}</style>'}])('rejects unusable contents',x=>expect(acceptArtifactOutput(JSON.stringify(x))).toBeUndefined());
 it('uses exactly the renderer schema for all native types',async()=>{
  const client=await readFile(new URL('../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',import.meta.url),'utf8');
  const fn=client.slice(client.indexOf('\t\tfunction researchContainerExactKeys'),client.indexOf('\t\t// Keep these host-free helpers'));
  const parse=runInNewContext(fn+'\nparseResearchContainerSpec',{RESEARCH_CONTAINER_MAX_MARKDOWN:32000,MAX_RESEARCH_HTML_BYTES:200000,RESEARCH_CONTAINER_TYPES:new Set(['web','html','chart','kpi','table','markdown','mind-map']),TextEncoder,normalizeResearchWebUrl:v=>/^https?:\/\//.test(v)?v:null});
  for(const x of [spec,{...spec,rows:[[]]},{version:1,type:'kpi',title:'值',items:[{label:'指标',value:5}]},{version:1,type:'chart',title:'图',variant:'line',labels:['一'],series:[{name:'值',values:[3]}]},{version:1,type:'markdown',title:'文本',content:'正文'},{version:1,type:'html',title:'页',html:'<h1>正文</h1>'}])expect(JSON.stringify(parseResearchContainerSpec(x))).toBe(JSON.stringify(parse(x)));
 });
 it('repairs a malformed result once and excludes private reasoning from repair prompts',async()=>{
  const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:start.mock.calls.length===1?[{type:'reasoning',text:'PRIVATE'},{type:'text',text:'{"version":1,'}]:[{type:'text',text:JSON.stringify(spec)}]})}));
  const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'task'});
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'比较两个离线样例'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'));
  expect(start).toHaveBeenCalledTimes(2);expect(start.mock.calls[1][0].prompt).not.toContain('PRIVATE');await runtime.dispose();
 });
 it('retains readable delivered content after repair failure without inventing replacement data',async()=>{
  const broken={...spec,rows:[['甲公司',12],['乙公司',15]],extra:true};
  const start=vi.fn(async()=>({childSessionId:'c'+start.mock.calls.length,dispose:async()=>{},result:start.mock.calls.length===1?Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(broken)}]}):Promise.reject(Error('network'))}));
  const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'task'});
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'离线公司对比'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'));
  const out=JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput);expect(out.content).toContain('甲公司');expect(out.content).toContain('15');expect(out.content).not.toContain('network');await runtime.dispose();
 });
 it('never uses free-form analysis as fallback',()=>expect(artifactReadableFallback('I should search for numbers.')).toBeUndefined());
});
describe('stable interactive collections',()=>{
 const base={version:1,type:'calendar',title:'事件日历',items:[{title:'会议 A',summary:'公开会议议程',date:'2026-09-08',category:'会议',url:'https://example.org/a'},{title:'报告 B',summary:'年度研究报告',date:'2026-10-12',category:'报告',url:'https://example.org/b'},{title:'时间待定',summary:'日期尚未确认',date:'预计四季度',category:'会议'}]};
 it('renders calendar navigation, search, date selection and expandable details',()=>{
  const s=renderInteractiveArtifact(base);expect(parseResearchContainerSpec(s)).not.toBeNull();
  const w=new Window({settings:{enableJavaScriptEvaluation:true}});w.document.body.innerHTML=s.html;w.eval(w.document.querySelector('script').textContent);
  const doc=w.document,visible=()=>[...doc.querySelectorAll('article')].filter(a=>!a.hidden);
  expect(visible()).toHaveLength(3);const month=doc.getElementById('month');month.value='2026-09';month.dispatchEvent(new w.Event('change'));expect(visible()).toHaveLength(1);
  doc.querySelector('[aria-label="2026-09-08"]').click();expect(visible()).toHaveLength(1);doc.getElementById('next').click();expect(visible()[0].textContent).toContain('报告 B');
  doc.getElementById('clear-day').click();doc.getElementById('search').value='时间待定';doc.getElementById('search').dispatchEvent(new w.Event('input'));expect(visible()).toHaveLength(1);
  doc.getElementById('expand').click();expect(doc.querySelector('details').open).toBe(true);w.happyDOM.abort();
 });
 it.each(['news','reports'])('provides searchable %s and safe source links',type=>{const out=renderInteractiveArtifact({...base,type});expect(out.html).toContain('https://example.org/a');expect(out.html).toContain('筛选分类');expect(out.html).not.toContain('<iframe')});
 it('escapes hostile data and rejects unsafe URLs',()=>{const out=renderInteractiveArtifact({...base,title:'<script>alert(1)</script>'});expect(out.html).toContain('&lt;script&gt;');expect(renderInteractiveArtifact({...base,items:[{...base.items[0],url:'javascript:alert(1)'}]})).toBeNull()});
 it('labels dashboards as snapshots with data dates',()=>{const out=renderInteractiveArtifact({version:1,type:'dashboard',title:'数据',asOf:'2026-09-08',items:[{label:'指标',value:'12%',detail:'公开样例'}]});expect(out.html).toContain('未开启持续更新');expect(out.html).toContain('2026-09-08')});
});
