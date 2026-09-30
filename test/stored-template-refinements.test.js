import {describe,it,expect} from 'vitest';
import {Window} from 'happy-dom';
import {JSDOM} from 'jsdom';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {refineStoredTemplateHtml} from '../packages/dsh-research-task-runtime/stored-template-refinements.js';
import {researchInteractionVersion,compactHostDashboardHtml} from '../packages/dsh-research-task-runtime/html-artifact.js';
import {advancedChartSamples as samples} from './fixtures/advanced-chart-samples.js';
function routes(html){
 const window=new Window({settings:{disableJavaScriptEvaluation:true}});window.document.write(html);
 return [...window.document.querySelectorAll('button,input,select,summary,svg,tr')].map(el=>{
  const path=[];for(let child=el;child!==window.document.body;child=child.parentElement)path.unshift([...child.parentElement.children].indexOf(child));
  return [el.tagName,el.id,path];
 });
}
function embeddedRoutes(html){
 const dom=new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`);
 const body=dom.window.document.body;
 const targets=[...body.querySelectorAll('button,input,select,summary')].map(el=>{
  const path=[];for(let child=el;child!==body;child=child.parentElement)path.unshift([...child.parentElement.children].indexOf(child));
  return [el.tagName,el.id,path];
 });
 dom.window.close();return targets;
}
describe('saved host template display refinements',()=>{
 it.each(['waterfall','candlestick','ohlc'])('upgrades stored %s rendering while retaining data and journal targets',variant=>{
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(samples[variant])));
  const old=spec.html.replaceAll('var(--sherlock-price-up,#df4f57)','var(--sherlock-market-positive,#ee4c61)').replaceAll('var(--sherlock-price-down,#00a83e)','var(--sherlock-market-negative,#00b050)');
  const next=refineStoredTemplateHtml(old);
  expect(next).toContain('data-chart-visual="v2"');expect(next).toContain('--sherlock-price-up');
  expect(readTemplateModel({...spec,html:next})).toEqual(readTemplateModel(spec));
  expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));expect(routes(next)).toEqual(routes(old));
  expect(refineStoredTemplateHtml(next)).toBe(next);expect(compactHostDashboardHtml(old)).toBe(next);
 });
 it('refines saved task density without replacing owner records, controls or their replay routes',()=>{
  const data={version:1,type:'tasks',title:'本周任务',asOf:'2026-09-30 模拟',mode:'local',items:[{id:'a',title:'原有任务',owner:'研究组',completed:false}]};
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),next=refineStoredTemplateHtml(spec.html);
  expect(next).toContain('data-operations-density="v2"');expect(next).toContain('研究组');
  expect(routes(next)).toEqual(routes(spec.html));expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(spec.html));
  // The secure preview wraps a saved full document in its own body. Its HTML
  // parser treats the saved head styles as body siblings of the controls.
  expect(embeddedRoutes(next)).toEqual(embeddedRoutes(spec.html));
  expect(readTemplateModel({...spec,html:next}).data).toEqual(data);expect(refineStoredTemplateHtml(next)).toBe(next);
 });
 it('does not reinterpret custom HTML or mismatched template identities',()=>{
  expect(refineStoredTemplateHtml('<html><head></head><body>用户页面</body></html>')).toBe('<html><head></head><body>用户页面</body></html>');
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(samples.ohlc)));
  const mismatch=spec.html.replace('"templateId":"chart.ohlc"','"templateId":"chart.scatter"');expect(refineStoredTemplateHtml(mismatch)).toBe(mismatch);
 });
 it('updates an existing code viewport without shifting recorded controls or changing content',()=>{
  const data={version:1,type:'code',title:'研究配置',asOf:'2026-09-30 模拟',language:'json',content:'{"name":"季度经营表现分析"}'};
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
  const old=spec.html.replace(/<style data-code-viewport="v2">[\s\S]*?<\/style>/,'');
  const next=refineStoredTemplateHtml(old);
  expect(next).toContain('data-code-viewport="v2"');expect(embeddedRoutes(next)).toEqual(embeddedRoutes(old));
  expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));
  expect(readTemplateModel({...spec,html:next}).data).toEqual(data);expect(refineStoredTemplateHtml(next)).toBe(next);
 });
});
