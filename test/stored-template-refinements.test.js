import {refineComponentReadingFooter} from '../packages/dsh-research-task-runtime/component-reading-footer.js';
import {describe,it,expect} from 'vitest';
import {Window} from 'happy-dom';
import {JSDOM} from 'jsdom';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {refineStoredTemplateHtml} from '../packages/dsh-research-task-runtime/stored-template-refinements.js';
import {readFileSync} from 'node:fs';
import {patchLegacyDashboardPreview} from '../scripts/lib/patch-research-board-client.mjs';
import {researchInteractionVersion,compactHostDashboardHtml} from '../packages/dsh-research-task-runtime/html-artifact.js';
import {advancedChartSamples as samples} from './fixtures/advanced-chart-samples.js';
import vm from 'node:vm';
function savedFeed(type='news',layout={}){
 const data={version:1,type,title:'原公告',asOf:'2026-10-20快照',note:'中国国航与春秋航空本次未取得。<b>保留缺失</b>',...layout,items:[{title:'已取得公告',summary:'原摘要',publisher:'南方航空',url:'https://example.com/notice'}]};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
 return spec.html.replace(/<aside class="feed-context"[^]*?<\/aside>/,'').replace(/<span class="feed-publisher">[^]*?<\/span>/,'');
}
function savedTrend(){
 const data={version:1,type:'chart',variant:'line',title:'归一化走势',unit:'基期=100',labels:['A','B'],series:[{name:'公司',values:[90,103]},{name:'基准',values:[100,101]}]};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
 return spec.html.replace(' data-chart-domain="observed-v1"','').replace(/<script>\(function cartesianChartRuntime[^]*?<\/script>/,'<script>(function cartesianChartRuntime(spec, geometry){throw Error("Legacy runtime must not execute")})({},()=>{});</script>');
}
it('restores saved feed source notes without shifting existing interaction replay targets',()=>{
 for(const [type,layout] of [['news',{}],['news',{layoutProfile:'openterminal'}],['reports',{}]]){
 const old=savedFeed(type,layout),next=compactHostDashboardHtml(old),w=new Window();w.document.write(next);
 expect(w.document.querySelector('.feed-context')?.textContent).toBe('2026-10-20快照中国国航与春秋航空本次未取得。<b>保留缺失</b>');
 expect(w.document.querySelector('article').textContent).toContain('南方航空');
 expect(w.document.querySelector('.feed-context b')).toBeNull();
 expect(embeddedRoutes(next)).toEqual(embeddedRoutes(old));expect(routes(next)).toEqual(routes(old));
 expect(readTemplateModel({type:'html',html:next})).toEqual(readTemplateModel({type:'html',html:old}));
 expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));
 expect(compactHostDashboardHtml(next)).toBe(next);w.close();
 }
});
it('restores the observed domain for saved trend charts and preserves legend, cursor and data records',()=>{
 const old=savedTrend(),next=compactHostDashboardHtml(old),w=new Window({settings:{enableJavaScriptEvaluation:true}});w.document.write(next);
 const ticks=[...w.document.querySelectorAll('.template-chart text')].slice(0,5).map(el=>el.textContent);
 expect(ticks[0]).toBe('89.35');expect(ticks[4]).toBe('103.65');
 w.document.querySelector('[data-chart-series="0"]').click();
 expect(w.document.querySelectorAll('g[data-series]')).toHaveLength(1);
 expect(w.document.querySelector('.chart-readout').textContent).toContain('基准 100');
 expect(embeddedRoutes(next)).toEqual(embeddedRoutes(old));expect(routes(next)).toEqual(routes(old));
 expect(readTemplateModel({type:'html',html:next})).toEqual(readTemplateModel({type:'html',html:old}));
 expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));
 expect(compactHostDashboardHtml(next)).toBe(next);w.close();
});
it('ships saved feed and trend refinements through the serialized client factory',()=>{
 const shipped=patchLegacyDashboardPreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
 const start=shipped.indexOf('const MARKET_PRESENTATION_CSS = '),end=shipped.indexOf('const TERMINAL_PRESENTATION_CSS = ',start);
 const serialized=vm.runInNewContext(shipped.slice(start,end)+'\nrefineStoredTemplateHtml');
 const gantt=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'gantt',title:'排程',asOf:'演练记录',items:[{label:'采样',start:'2026-10-22',end:'2026-10-23',progress:0}]}))).html.replace(/\/\* reading-layout-v1 \*\/[^]*?\/\* reading-layout-end \*\//u,'');
 for(const old of [savedFeed(),savedTrend(),gantt])expect(serialized(old)).toBe(refineStoredTemplateHtml(old));
});
it('leaves unknown feed versions and invalid saved trend data untouched',()=>{
 const feed=savedFeed().replace('"version":"21m-20260923-v1"','"version":"future"');
 expect(refineStoredTemplateHtml(feed)).toBe(feed);
 const chart=savedTrend();
 for(const old of [chart.replace('"version":"22a-20260930"','"version":"future"'),chart.replace('"templateId":"chart.line"','"templateId":"chart.step"'),chart.replace('"values":[90,103]','"values":[90,null]')])expect(refineStoredTemplateHtml(old)).toBe(old);
});
it('upgrades saved source-backed feed titles while preserving records and disclosure paths',()=>{
 const data={version:1,type:'news',title:'保存的真实资讯',items:[{title:'原文 <核对>',summary:'已取得内容',url:'https://example.com/source?a=1&b=2'},{title:'缺失来源',summary:'原始缺失说明'}]};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
 const legacy=spec.html.replace(/<h2><a\b[^>]*>([^<]*)<\/a><\/h2>/g,'<h2>$1</h2>');
 const next=refineStoredTemplateHtml(legacy),w=new Window();w.document.write(next);
 expect(w.document.querySelector('.feed-copy h2 a')?.href).toBe('https://example.com/source?a=1&b=2');
 expect(w.document.querySelector('.feed-copy h2 a')?.textContent).toContain('原文 <核对>');
 expect(w.document.querySelectorAll('.feed-copy h2 a')).toHaveLength(1);
 expect(readTemplateModel({...spec,html:next})).toEqual(readTemplateModel(spec));
 expect(routes(next)).toEqual(routes(legacy));
 expect(refineStoredTemplateHtml(next)).toBe(next);
 expect(refineStoredTemplateHtml(legacy.replace(/<script id="sherlock-template-data"[^]*?<\/script>/,''))).not.toContain('<h2><a');
 w.close();
});
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
 it('also upgrades legacy market charts from the serialized client factory',()=>{
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'price-volume',title:'保存图表',asOf:'原数据',labels:['01','02'],prices:[1,2],volumes:[3,4],priceUnit:'元',volumeUnit:'股'})));
  const old=spec.html.replaceAll(' data-series-viewport="v2"','');
  const shipped=patchLegacyDashboardPreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
  const start=shipped.indexOf('const MARKET_PRESENTATION_CSS = '),end=shipped.indexOf('const TERMINAL_PRESENTATION_CSS = ',start);
  const serialized=vm.runInNewContext(shipped.slice(start,end)+'\nrefineStoredTemplateHtml');
  expect(()=>serialized(old)).not.toThrow();
  expect(serialized(old)).toContain('data-series-viewport="v2"');
 });
 it.each(['waterfall','candlestick','ohlc'])('upgrades stored %s rendering while retaining data and journal targets',variant=>{
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(samples[variant])));
  const old=spec.html.replaceAll('var(--sherlock-price-up,#df4f57)','var(--sherlock-market-positive,#ee4c61)').replaceAll('var(--sherlock-price-down,#00a83e)','var(--sherlock-market-negative,#00b050)');
  const next=refineStoredTemplateHtml(old);
  expect(next).toContain('data-chart-visual="v2"');expect(next).toContain('--sherlock-price-up');
  expect(readTemplateModel({...spec,html:next})).toEqual(readTemplateModel(spec));
  expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(old));expect(routes(next)).toEqual(routes(old));
  expect(refineStoredTemplateHtml(next)).toBe(next);expect(compactHostDashboardHtml(old)).toBe(refineComponentReadingFooter(next));
 });
 it('refines saved task density without replacing owner records, controls or their replay routes',()=>{
  const data={version:1,type:'tasks',title:'本周任务',asOf:'2026-09-30 模拟',mode:'local',items:[{id:'a',title:'原有任务',owner:'研究组',completed:false}]};
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),next=refineStoredTemplateHtml(spec.html);
  expect(next).toContain('data-operations-density="v3"');expect(next).toContain('研究组');
  expect(routes(next)).toEqual(routes(spec.html));expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(spec.html));
  // The secure preview wraps a saved full document in its own body. Its HTML
  // parser treats the saved head styles as body siblings of the controls.
  expect(embeddedRoutes(next)).toEqual(embeddedRoutes(spec.html));
  expect(readTemplateModel({...spec,html:next}).data).toEqual(data);expect(refineStoredTemplateHtml(next)).toBe(next);
 });
 it('fits stored KPI values without rewriting source records or saved expansion routes',()=>{
  const data={version:1,type:'kpi',title:'本人指标',items:[{label:'本月收入',value:0,unit:'万元'},{label:'变化',value:-120,unit:'万元'},{label:'退款',value:null,missing:'本人未提供退款记录'}]};
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),next=refineStoredTemplateHtml(spec.html);
  expect(next).toContain('data-kpi-value-fit="v3"');expect(readTemplateModel({...spec,html:next}).data).toEqual(data);expect(embeddedRoutes(next)).toEqual(embeddedRoutes(spec.html));expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(spec.html));expect(refineStoredTemplateHtml(next)).toBe(next);
  const previous=spec.html+'<style data-kpi-value-fit="v2">body[data-sherlock-template="kpi"] .indicator-value{font-size:clamp(18px,18cqi,28px)!important}</style>';
  const migrated=refineStoredTemplateHtml(previous);expect(migrated).toContain('data-kpi-value-fit="v3"');expect(migrated).toContain('@layer ework-workbench{body[data-sherlock-template="kpi"] .indicator-tile');expect(readTemplateModel({...spec,html:migrated}).data).toEqual(data);expect(refineStoredTemplateHtml(migrated)).toBe(migrated);
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
