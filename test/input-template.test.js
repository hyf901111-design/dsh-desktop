import {describe,it,expect,vi} from 'vitest';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {inputDataIssue,codeTemplatePayload} from '../packages/dsh-research-task-runtime/input-template-contract.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {performWorkbenchCodeAction} from '../scripts/lib/research-grid-ui.mjs';
import {INPUT_VIEW_RUNTIME} from '../packages/dsh-research-task-runtime/input-artifact.js';
const form={version:1,type:'form',title:'研究需求',asOf:'2026-09-30 · 模拟',fields:[{id:'topic',label:'研究主题',kind:'text',required:true},{id:'hours',label:'工时',kind:'number',min:1,max:20},{id:'due',label:'截止日期',kind:'date'},{id:'notes',label:'补充说明',kind:'textarea'}]};
const code={version:1,type:'code',title:'研究配置',asOf:'2026-09-30 · 模拟',language:'json',content:'{"name":"季度经营表现分析","metrics":["revenue","margin"]}'};
const render=data=>JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
function runtime(data,shared){const window=new Window({settings:{disableJavaScriptEvaluation:true}});window.document.write(render(data).html);const context=vm.createContext({document:window.document,window:{sherlockShared:shared},TextEncoder,setTimeout,clearTimeout,parent:{postMessage:vi.fn()},addEventListener:window.addEventListener.bind(window)});for(const script of window.document.querySelectorAll('script:not([type="application/json"])'))vm.runInContext(script.textContent,context);return window;}
describe('21Z input templates',()=>{
 it.each([form,code])('retains supplied data and prepares the requested template',data=>{const spec=render(data);expect(readTemplateModel(spec).data).toEqual(data);expect(templateFor(data).figma).toBe(data.type==='form'?'1918:354019':'1918:354512');expect(validateWorkbench({requestId:data.type,title:'模拟',dataMode:'simulated',panels:[{title:data.title,type:data.type,prompt:'展示提供内容',size:'large',artifact:data}]}).panels[0].artifact).toEqual({...data,title:data.title+'（模拟）'});});
 it('validates adjacent fields, retains values and blocks duplicate local records',()=>{const w=runtime(form),d=w.document,click=()=>d.getElementById('form-submit').click();click();expect(d.getElementById('error-topic').textContent).toContain('研究主题');d.getElementById('field-topic').value='研究收入';d.getElementById('field-hours').value='21';d.getElementById('field-due').value='2026-02-30';click();expect(d.getElementById('error-hours').textContent).toContain('最大 20');expect(d.getElementById('error-due').textContent).toContain('有效日期');expect(d.getElementById('field-topic').value).toBe('研究收入');d.getElementById('field-hours').value='12';d.getElementById('field-due').value='2026-10-15';click();click();expect(d.querySelectorAll('#form-records article')).toHaveLength(1);expect(d.getElementById('form-status').textContent).toContain('本次打开期间可查看');expect(d.getElementById('form-records').textContent).toContain('2026-10-15');d.getElementById('form-reset').click();expect(d.getElementById('field-topic').value).toBe('');expect(d.querySelectorAll('#form-records article')).toHaveLength(1);});
 it('shows invalid JSON as original text and does not execute script-like contents',()=>{const d=runtime({...code,content:'</script><img src=x onerror=alert(1)>'}).document;expect(d.querySelector('img')).toBeNull();expect(d.getElementById('code-error').textContent).toContain('格式无效');expect(d.getElementById('code-content').textContent).toContain('</script>');});
 it('formats JSON without changing retained source and switches back to exact raw text',()=>{const w=runtime(code),d=w.document,select=d.getElementById('code-format');select.value='formatted';select.dispatchEvent(new w.Event('change'));expect(d.getElementById('code-lines').textContent).toContain('7 行');expect(codeTemplatePayload(code,'formatted').content).toBe(JSON.stringify(JSON.parse(code.content),null,2));select.value='original';select.dispatchEvent(new w.Event('change'));expect(d.getElementById('code-content').querySelector('code').textContent).toBe(code.content);expect(readTemplateModel(render(code)).data.content).toBe(code.content);});
 it('accepts an explicit local form mode and identifies unsupported fields without discarding data',()=>{
  const local={...form,mode:'local'};expect(inputDataIssue(local)).toBeNull();expect(readTemplateModel(render(local)).data).toEqual(local);
  expect(inputDataIssue({...form,mode:'external'})).toContain('仅支持local');
  expect(inputDataIssue({...form,submitLabel:'提交'})).toContain('submitLabel');
 });
 it('waits for the definitive native save result and blocks concurrent requests while the dialog is open',()=>{
  const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.write(render(code).html);
  const clicks=new Map(),parent={postMessage:vi.fn()},delays=[];let receive;
  for(const b of w.document.querySelectorAll('[data-code-action]'))b.addEventListener=(_name,fn)=>clicks.set(b.dataset.codeAction,fn);
  const ctx=vm.createContext({document:w.document,parent,setTimeout:(fn,ms)=>{delays.push(ms);return 1;},clearTimeout:vi.fn(),addEventListener:(_name,fn)=>{receive=fn;}});
  vm.runInContext('('+INPUT_VIEW_RUNTIME+')',ctx)(code);
  clicks.get('download')({isTrusted:true});clicks.get('copy')({isTrusted:true});
  expect(parent.postMessage).toHaveBeenCalledTimes(1);expect(delays).toEqual([]);
  expect(w.document.getElementById('code-status').textContent).toContain('请选择保存位置');
  const id=parent.postMessage.mock.calls[0][0].id;
  receive({source:parent,data:{type:'sherlock-code-action-result',id,status:'saved'}});
  expect(w.document.getElementById('code-status').textContent).toBe('代码已保存');
  clicks.get('copy')({isTrusted:true});expect(delays).toEqual([10000]);expect(parent.postMessage).toHaveBeenCalledTimes(2);
 });
 it.each([{...form,fields:[{id:'bad id',label:'主题',kind:'text'}]},{...form,fields:[{id:'x',label:'优先级',kind:'select',options:[{value:'a',label:'普通'},{value:'a',label:'重复'}]}]},{...form,submitUrl:'https://example.com'},{...code,execute:true},{...code,content:'字'.repeat(128000)},{...code,content:'x\n'.repeat(5000)}])('rejects unsupported fields and bounded overflow %#',data=>{expect(inputDataIssue(data)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined();});
});
describe('bounded host code actions',()=>{
 const run=async(overrides={})=>{const replies=[],writeText=vi.fn(async()=>{}),save=vi.fn(async()=>({status:'saved'}));const frame={contentWindow:{postMessage:d=>replies.push(d)},ownerDocument:{defaultView:{navigator:{userActivation:{isActive:overrides.active??true},clipboard:{writeText}},dshDesktop:{researchCanvasExport:{save}}}}};const context=vm.createContext({codeTemplatePayload});context.run=performWorkbenchCodeAction;const action={type:'sherlock-code-action',id:'code-qa-1',action:overrides.action??'copy',format:overrides.format??'original',...(overrides.extra??{})};await vm.runInContext('('+performWorkbenchCodeAction.toString()+')',context)(frame,{containerSpec:render(code)},action);return {replies,writeText,save};};
 it('copies only retained content after user activation',async()=>{const r=await run();expect(r.writeText).toHaveBeenCalledWith(code.content);expect(r.replies[0].status).toBe('copied');const inactive=await run({active:false});expect(inactive.writeText).not.toHaveBeenCalled();expect(inactive.replies[0].status).toBe('error');});
 it('saves formatted UTF8 through the existing dialog',async()=>{const r=await run({action:'download',format:'formatted'});expect(r.save).toHaveBeenCalledWith({kind:'text',...codeTemplatePayload(code,'formatted')});expect(r.replies[0].status).toBe('saved');});
 it('rejects an iframe-provided payload',async()=>{const r=await run({extra:{content:'untrusted'}});expect(r.save).not.toHaveBeenCalled();expect(r.writeText).not.toHaveBeenCalled();expect(r.replies).toHaveLength(0);});
});

it('persists valid form records in the private component state and restores them on reopen',()=>{
 let saved
 const host={register(config){
  expect(config.localOnly).toBe(true)
  const context={connected:true,readOnly:false}
  config.render(saved??config.initialState,context)
  return {dispatch(action){saved=config.reduce(saved??config.initialState,action);config.render(saved,context);return true}}
 }}
 const first=runtime({...form,mode:'local'},host).document
 first.getElementById('field-topic').value='投研交接'
 first.getElementById('field-hours').value='12'
 first.getElementById('field-notes').value='一二三四五'.repeat(500)
 first.getElementById('form-submit').click()
 expect(saved.entries).toHaveLength(1)
 const reopened=runtime({...form,mode:'local'},host).document
 expect(reopened.getElementById('form-records').textContent).toContain('投研交接')
 expect(reopened.getElementById('form-records').textContent).toContain('一二三四五'.repeat(500))
 expect(reopened.getElementById('field-topic').value).toBe('')
})
