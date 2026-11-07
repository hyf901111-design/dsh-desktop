import {expect,it} from 'vitest';
import {Window} from 'happy-dom';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {compactHostDashboardHtml,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js';
import {refineComponentReadingFooter} from '../packages/dsh-research-task-runtime/component-reading-footer.js';
import {execFileSync} from 'node:child_process';

export const footerFixture={version:1,type:'kpi',title:'规模概况',asOf:'2026-11-06 · 静态快照，自动更新未绑定',range:'2026-10-30 至 2026-11-06',note:'估算以期末净值计算；缺失记录不补零。<b>保留原文</b>',sources:[{name:'Tushare etf_share_size + etf_basic + trade_cal（ETF运营汇总 overview）',url:'https://tushare.pro/document/2?doc_id=408'}],items:[{label:'期末规模',value:48632.81,unit:'亿元'},{label:'净流入估算',value:1623.19,unit:'亿元'}]};
const render=data=>JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
const dom=html=>{const w=new Window();w.document.write(html);return w;};
const routes=w=>[...w.document.querySelectorAll('button,input,select,summary,svg,tr')].filter(e=>!e.closest('.component-reading-footer')).map(el=>{const p=[];for(let e=el;e!==w.document.body;e=e.parentElement)p.unshift([...e.parentElement.children].indexOf(e));return [el.tagName,el.id,p];});

it('collects saved metadata in one initially expanded disclosure without changing values or existing control routes',()=>{
 const spec=render(footerFixture),next=compactHostDashboardHtml(spec.html),old=dom(spec.html),w=dom(next);
 try{
  const details=w.document.querySelector('.component-reading-footer details');expect(details).not.toBeNull();expect(details.open).toBe(true);
  expect(details.querySelector('summary').textContent).toBe('口径与来源');
  expect(details.textContent).toContain(footerFixture.note);expect(details.querySelector('b')).toBeNull();
  expect(details.querySelector('a').href).toBe(footerFixture.sources[0].url);
  details.querySelector('summary').click();expect(details.open).toBe(false);
  expect(routes(w)).toEqual(routes(old));expect(readTemplateModel({...spec,html:next})).toEqual(readTemplateModel(spec));
  expect(researchInteractionVersion(next)).toBe(researchInteractionVersion(spec.html));expect(compactHostDashboardHtml(next)).toBe(next);
 }finally{w.close();old.close();}
});
it.each([
 {version:1,type:'chart',variant:'bar',title:'净流入',unit:'亿元',asOf:'2026-11-06',note:'估算金额',labels:['甲','乙'],series:[{name:'净流入估算',values:[20,10]}]},
 {version:1,type:'market',variant:'table',title:'规模明细',asOf:'2026-11-06',note:'完整口径',columns:[{key:'name',label:'名称'},{key:'size',label:'规模'}],rows:[{name:'甲',size:20}]}
])('retains the data interactions and full notes of $type cards',data=>{
 const spec=render(data),w=dom(refineComponentReadingFooter(spec.html));
 try{expect(w.document.querySelector('.component-reading-footer')?.textContent).toContain(data.note);expect(w.document.querySelector('table')).not.toBeNull();expect(readTemplateModel({...spec,html:w.document.documentElement.outerHTML}).data).toEqual(readTemplateModel(spec).data);}finally{w.close();}
});
it('ignores unknown versions and never creates executable markup from saved metadata',()=>{
 const spec=render(footerFixture),unknown=spec.html.replace('"version":"21z-kpi-20261001"','"version":"future"');
 expect(refineComponentReadingFooter(unknown)).toBe(unknown);expect(refineComponentReadingFooter('<p>自定义页面</p>')).toBe('<p>自定义页面</p>');
 const malicious=spec.html.replace('"url":"https://tushare.pro/document/2?doc_id=408"','"url":"javascript:alert(1)"');
 const w=dom(refineComponentReadingFooter(malicious));try{expect(w.document.querySelector('.component-reading-footer a')).toBeNull();}finally{w.close();}
});
it('upgrades the previous paired disclosures while preserving original data and summary routes',()=>{
 const data={version:1,type:'chart',variant:'horizontal',title:'原排名',unit:'亿元',asOf:'2026-11-06',note:'原口径',labels:['甲','乙'],series:[{name:'净流入',values:[20,10]}]};
 const spec=render(data),legacy=spec.html.replace('</body>','<footer class="component-reading-footer" aria-label="组件数据说明"><details><summary>口径与来源</summary><dl><div><dt>统计口径</dt><dd>原口径</dd></div></dl></details></footer><style data-component-reading-footer="v1">details{display:inline-block}</style></body>');
 const next=refineComponentReadingFooter(legacy),old=dom(legacy),w=dom(next);
 try{
  expect(w.document.querySelectorAll('.component-reading-footer')).toHaveLength(1);
  expect(w.document.querySelectorAll('.component-reading-tabs')).toHaveLength(1);
  expect(next).not.toContain('data-component-reading-footer="v1"');
  expect(routes(w)).toEqual(routes(old));expect(readTemplateModel({...spec,html:next})).toEqual(readTemplateModel(spec));
  expect(refineComponentReadingFooter(next)).toBe(next);
 }finally{old.close();w.close();}
});
it('ships the same saved-component refinement in the real serialized client factory',()=>{
 const output=execFileSync(process.execPath,['--input-type=module','-e',`
 import vm from 'node:vm';import {readFileSync} from 'node:fs'; import {patchLegacyDashboardPreview} from './scripts/lib/patch-research-board-client.mjs';
 const s=patchLegacyDashboardPreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
 const a=s.indexOf('function candleRuntime(groups) {'),b=s.indexOf('const TERMINAL_PRESENTATION_CSS = ',a);
 process.stdout.write(vm.runInNewContext(s.slice(a,b)+'\\ncompactHostDashboardHtml',{URL})(readFileSync(0,'utf8')));
 `.replace(/^\+/gm,'')],{input:render(footerFixture).html,maxBuffer:8*1024*1024,encoding:'utf8'});
 expect(output).toBe(compactHostDashboardHtml(render(footerFixture).html));
});
