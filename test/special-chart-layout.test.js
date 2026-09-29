import {describe,it,expect} from 'vitest';
import {Window} from 'happy-dom';
import {execFileSync} from 'node:child_process';
import {specialChartSamples as samples} from './fixtures/special-chart-samples.js';
import {refineStoredSpecialChartHtml} from '../packages/dsh-research-task-runtime/special-chart-layout.js';
import {compactHostDashboardHtml,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';

// Original saved-template ancestry. Routes in persisted journals refer to these
// element indices, including the context/nav siblings and disclosure sections.
function saved(data){
 const model={templateId:'chart.'+data.variant,version:'22a-20260930',data};
 return '<!doctype html><html><head></head><body data-research-kind="chart" data-chart-template="'+data.variant+'"><figure><div class="chart-context"></div><nav class="chart-breadcrumb"></nav>'+
 (data.samples?'<label class="chart-bins">分箱数量 <select data-bin-count><option value="4">4 箱</option><option value="6">6 箱</option><option value="10">10 箱</option></select></label>':'')+
 '<div class="chart-summary chart-readout"></div><div class="chart-main"><div class="special-plot"><svg class="special-chart"></svg></div></div><div class="chart-method"></div><figcaption></figcaption></figure><details><summary>查看完整数据</summary><div class="chart-data-scroll"><table class="chart-table"></table></div></details><script>(function specialChartRuntime(spec,project){throw Error("Legacy runtime must be replaced, never evaluated by the host")})({},()=>{});</script></body></html><script id="sherlock-template-data" type="application/json">'+JSON.stringify(model).replace(/</g,'\\u003c')+'</script>';
}
function mount(html){
 const win=new Window({settings:{enableJavaScriptEvaluation:true}});
 // happy-dom has no font shaping; geometry is verified separately in Chromium.
 win.SVGElement.prototype.getBBox=()=>({x:120,y:64,width:40,height:44});
 win.document.write(html);return win;
}
function route(node){const r=[];while(node.parentElement&&node.parentElement.tagName!=='HTML'){r.unshift([...node.parentElement.children].indexOf(node));node=node.parentElement;}return r;}
describe('saved special-chart layout refinement',()=>{
 it('installs the same refinement into the client without missing closure dependencies',()=>{
  const skeleton="function buildResearchHtmlPreview(html, title = '') {\n  const theme = initialTheme === 'dark' ? 'dark' : 'light';return `<html><body>${html}</body></html>`}";
  const result=execFileSync(process.execPath,['--input-type=module','-e',`
   import {runInNewContext} from 'node:vm';
   import {patchLegacyDashboardPreview} from './scripts/lib/patch-research-board-client.mjs';
   import {compactHostDashboardHtml} from './packages/dsh-research-task-runtime/html-artifact.js';
   const code=patchLegacyDashboardPreview(${JSON.stringify(skeleton)}),context={initialTheme:'light'};
   runInNewContext(code,context);
   console.log(JSON.stringify({equal:context.compactHostDashboardHtml(${JSON.stringify(saved(samples.sunburst))})===compactHostDashboardHtml(${JSON.stringify(saved(samples.sunburst))}),idempotent:patchLegacyDashboardPreview(code)===code}));
  `],{encoding:'utf8'});
  expect(JSON.parse(result)).toEqual({equal:true,idempotent:true});
 });
 it.each(['sunburst','histogram','gauge'])('preserves %s source, interaction identity, controls and replay routes',variant=>{
  const old=saved(samples[variant]),upgraded=compactHostDashboardHtml(old);
  expect(upgraded).toContain('data-chart-layout="centered-v2"');
  expect(researchInteractionVersion(upgraded)).toBe(researchInteractionVersion(old));
  expect(readTemplateModel({type:'html',html:upgraded}).data).toEqual(samples[variant]);
  const before=new Window();before.document.write(old);const after=mount(upgraded);
  for(const selector of ['.chart-breadcrumb','.special-chart','summary',...(variant==='histogram'?['select']:[])])
   expect(route(after.document.querySelector(selector))).toEqual(route(before.document.querySelector(selector)));
  const doc=after.document;
  if(variant==='histogram'){
   const select=doc.querySelector('select');select.value='6';select.dispatchEvent(new after.Event('change'));
   expect(doc.querySelectorAll('tbody tr')).toHaveLength(6);
   expect([...doc.querySelectorAll('tbody tr td:nth-child(2)')].reduce((n,td)=>n+Number(td.textContent),0)).toBe(samples.histogram.samples.length);
  }else if(variant==='sunburst'){
   doc.querySelector('tbody tr').click();
   expect(doc.querySelector('.chart-center-label').textContent).toContain('80');
   expect(doc.querySelectorAll('[data-depth]')).toHaveLength(2);
   doc.querySelector('[data-depth="0"]').click();
   expect(doc.querySelector('.chart-center-label').textContent).toContain('128');
  }else expect(doc.querySelector('.chart-center-label').textContent).toBe('72%');
  expect(refineStoredSpecialChartHtml(upgraded)).toBe(upgraded);
  before.happyDOM.abort();after.happyDOM.abort();
 });
 it('refines the previous centered layout without duplicating body markers or changing interaction identity',()=>{
  const old=saved(samples.sunburst).replace('data-chart-template="sunburst">','data-chart-template="sunburst" data-chart-layout="centered-v1">');
  const next=refineStoredSpecialChartHtml(old);
  expect(next.match(/data-chart-layout=/g)).toHaveLength(1);
  expect(next).toContain('data-chart-layout="centered-v2"');
  expect(next).toContain('min-height:28px');
  expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));
  expect(refineStoredSpecialChartHtml(next)).toBe(next);
 });
 it('leaves current templates, custom HTML, unknown versions and mismatched metadata intact',()=>{
  const current=JSON.parse(acceptArtifactOutput(JSON.stringify(samples.donut))).html;
  expect(refineStoredSpecialChartHtml(current)).toBe(current);
  const old=saved(samples.donut);
  for(const input of [old.replace('22a-20260930','future'),old.replace('"templateId":"chart.donut"','"templateId":"chart.pie"'),old.replace('id="sherlock-template-data"','id="custom"'),'<p>Custom page</p>'])expect(refineStoredSpecialChartHtml(input)).toBe(input);
 });
});
