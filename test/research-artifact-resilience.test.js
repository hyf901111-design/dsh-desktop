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
 it('preserves an overlong chart caption as visible notes without dropping any points',()=>{
  const title='医药指数趋势｜'+('数据来源和日期说明，静态快照；'.repeat(25));
  const chart={version:1,type:'chart',title,variant:'line',labels:['2026-08-01','2026-09-01'],series:[{name:'指数',values:[7012.34,7654.32]}]};
  const output=JSON.parse(acceptArtifactOutput(JSON.stringify(chart)));
  expect(output.type).toBe('html');expect(output.title).toBe('医药指数趋势');
  expect(output.html).toContain(title);expect(output.html).toContain('<svg');
  for(const value of [...chart.labels,...chart.series[0].values])expect(output.html).toContain(String(value));
  expect(acceptArtifactOutput(JSON.stringify({...chart,series:[{name:'指数',values:[1]}]}))).toBeUndefined();
 });
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
 it('shows compact dashboard values without list controls or repeated dates',()=>{
  const out=renderInteractiveArtifact({version:1,type:'dashboard',title:'行情快照',asOf:'2026-09-08',items:[{label:'最新价',value:'示例 100 元',detail:'离线验收数据',url:'https://example.org/quote'},{label:'成交额',value:'示例 12 亿'}]});
  const w=new Window({settings:{enableJavaScriptEvaluation:true}});w.document.body.innerHTML=out.html;w.eval(w.document.querySelector('script').textContent);
  expect([...w.document.querySelectorAll('article')].every(a=>!a.hidden)).toBe(true);
  expect(w.document.querySelector('.controls')).toBeNull();expect(w.document.querySelector('#count')).toBeNull();
  expect(w.document.querySelectorAll('.meta')).toHaveLength(0);expect(w.document.querySelectorAll('details')).toHaveLength(1);
  expect(w.document.querySelector('details a').href).toBe('https://example.org/quote');w.happyDOM.abort();
 });
 it('escapes hostile data and rejects unsafe URLs',()=>{const out=renderInteractiveArtifact({...base,title:'<script>alert(1)</script>'});expect(out.html).toContain('&lt;script&gt;');expect(renderInteractiveArtifact({...base,items:[{...base.items[0],url:'javascript:alert(1)'}]})).toBeNull()});
 it('labels dashboards as snapshots with data dates',()=>{const out=renderInteractiveArtifact({version:1,type:'dashboard',title:'数据',asOf:'2026-09-08',items:[{label:'指标',value:'12%',detail:'公开样例'}]});expect(out.html).toContain('数据快照');expect(out.html).not.toContain('class="controls"');expect(out.html).not.toContain('id="count"');expect(out.html).toContain('2026-09-08')});
});

describe('evidence-preserving synthesis retries',()=>{
 it('carries web evidence into a tool-free repair instead of searching from scratch',async()=>{
  const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve(start.mock.calls.length===1?{stopReason:'completed',output:[{type:'reasoning',text:'PRIVATE'}],researchEvidence:'已取得来源：[示例报告](https://example.org/report)，覆盖公司12家。'}:{stopReason:'completed',output:[]})}));
  const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'task'});
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'研究公司覆盖数量'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'));
  expect(start).toHaveBeenCalledTimes(2);expect(start.mock.calls[1][0].synthesisOnly).toBe(true);
  expect(start.mock.calls[1][0].prompt).toContain('覆盖公司12家');expect(start.mock.calls[1][0].prompt).not.toContain('PRIVATE');
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toContain('完整分析暂未完成');await runtime.dispose();
 });
 it('retains only successful identified search results',async()=>{
  const {researchSearchEvidence}=await import('../packages/dsh-research-task-runtime/index.js');
  const event={type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'search',content:[{type:'text',text:'[来源](https://example.org) 有效摘要'},{type:'reasoning',text:'PRIVATE'}]},{type:'tool-result',toolCallId:'read-file',content:[{type:'text',text:'PRIVATE FILE'}]},{type:'tool-result',toolCallId:'search',isError:true,content:[{type:'text',text:'PRIVATE ERROR'}]}]}}};
  const text=researchSearchEvidence(event,new Set(['search']));expect(text).toContain('有效摘要');expect(text).not.toContain('PRIVATE');
 });
});

it('recovers a private container from a confirmed local deadline using its existing evidence',async()=>{
 const firstDispose=vi.fn(async()=>{}),valid=JSON.stringify(spec)
 const start=vi.fn(async()=>{
  if(start.mock.calls.length===2)expect(firstDispose).toHaveBeenCalledOnce()
  return {childSessionId:'c'+start.mock.calls.length,dispose:start.mock.calls.length===1?firstDispose:async()=>{},result:Promise.resolve(start.mock.calls.length===1?{stopReason:'timeout',localDeadlineExceeded:true,output:[],researchEvidence:'甲公司收入12，离线验收资料。'}:{stopReason:'completed',output:[{type:'text',text:valid}]})}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'task'})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'离线数据对比'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2);expect(start.mock.calls[1][0].synthesisOnly).toBe(true)
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toBe(valid)
 }finally{await runtime.dispose()}
})

it('preserves financial values, dates and quality without transport identifiers in recovery evidence',async()=>{
 const {researchSearchEvidence}=await import('../packages/dsh-research-task-runtime/index.js')
 const value={schema_version:'financial-1',request_hash:'TRANSPORT_HASH',status:'partial',received_at:'2026-09-10',records:[{evidence_id:'TRANSPORT_ID',instrument:'000933.SH',metric:'收盘价',value:12.34,unit:'点',as_of:'2026-09-09',quality_state:'dated',price_basis:'不复权',source_url:'https://example.org/source'}],limitations:['更早区间暂缺']}
 const text=researchSearchEvidence({type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'finance',content:[{type:'text',text:JSON.stringify(value)}]}]}}},new Set(['finance']))
 for(const expected of ['partial','2026-09-09','000933.SH','收盘价','12.34 点','dated','不复权','https://example.org/source','更早区间暂缺'])expect(text).toContain(expected)
 expect(text).not.toContain('TRANSPORT_')
})
