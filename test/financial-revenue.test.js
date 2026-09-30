import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {financialRevenueDataIssue,renderFinancialRevenue,FINANCIAL_REVENUE_FIELDS,revenueSeriesColor} from '../packages/dsh-research-task-runtime/financial-revenue.js'
import {WORKBENCH_EARLY_PLAN} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {revenueFixtures,geography,business} from './fixtures/financial-revenue.js'
const copy=v=>JSON.parse(JSON.stringify(v))
function dom(data){const out=renderFinancialRevenue(data),d=new JSDOM(out.body,{runScripts:'outside-only'});d.window.ResizeObserver=class{observe(){}};d.window.eval(out.script);return d}
function choose(d,selector,value){const el=d.window.document.querySelector(selector);el.value=value;el.dispatchEvent(new d.window.Event('change'))}
describe('source revenue segment templates',()=>{
 it.each(revenueFixtures)('retains the independent $variant data contract and latest Figma source',data=>{
  expect(financialRevenueDataIssue(data)).toBeNull();const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));expect(readTemplateModel(spec).data).toEqual(data)
  expect(templateFor(data).figma).toMatch(/^1917:/);expect(templateFor(data).interactions.length).toBeGreaterThan(4);const design=workbenchDesignTemplate({type:'market',artifact:data});expect(researchMarketDimensions({containerSpec:spec})).toEqual({width:980,height:410});expect(design.minWidth).toBe(480)
  expect(WORKBENCH_EARLY_PLAN).toContain(FINANCIAL_REVENUE_FIELDS[data.variant]);expect(spec.html).toContain(data.asOf)
 })
 it('rejects malformed combinations, invalid disclosure dates and unstated unknowns',()=>{
  const d=geography.datasets[0]
  for(const patch of [{currency:'人民币'},{basis:''},{coverage:'all'},{coverage:'partial',coverageNote:''},{periods:[{...d.periods[0],endDate:'2024-02-30'}]},{periods:[{...d.periods[0],disclosedAt:'2024-12-01'}]},{periods:[d.periods[1],d.periods[0]]},{totals:[100]},{totals:[null,null],totalMissing:''},{segments:[{id:'x',name:'X',values:[1]}]},{segments:[{id:'x',name:'X',values:[1,null]}]},{segments:[d.segments[0],d.segments[0]]}])expect(financialRevenueDataIssue({...geography,datasets:[{...d,...patch}]})).toBeTruthy()
  expect(financialRevenueDataIssue({...geography,datasets:[d,d]})).toMatch(/重复/)
 })
 it('checks fully disclosed total reconciliation and does not fabricate a remainder',()=>{
  const d=copy(geography);d.datasets[0].totals[0]=102;expect(financialRevenueDataIssue(d)).toMatch(/不一致/)
  const partial=copy(geography);partial.datasets[0].coverage='partial';partial.datasets[0].coverageNote='未覆盖全部地区';partial.datasets[0].totals[0]=102;expect(financialRevenueDataIssue(partial)).toBeNull();const v=dom(partial);try{expect(v.window.document.querySelectorAll('thead th')).toHaveLength(6)}finally{v.window.close()}
 })
 it('keeps unknown income absent from the stack and zero distinct, with source-total shares',()=>{
  const d=dom(geography);try{const doc=d.window.document;expect(doc.querySelectorAll('[data-revenue-point]')).toHaveLength(7);expect(doc.querySelector('.revenue-incomplete')).not.toBeNull();expect(doc.querySelector('[data-revenue-segment="other"]').getAttribute('aria-label')).toContain('0 百万元')
   doc.querySelector('svg').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'ArrowDown'}));expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('2025年欧洲收入未提供');expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('无法计算');expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('来源总收入 150');expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('已披露分项合计 120')
  }finally{d.window.close()}
 })
 it('paginates all business legends without changing the chart or hiding undisclosed series',()=>{
  const d=dom(business);try{const doc=d.window.document,points=doc.querySelectorAll('[data-revenue-point]').length;expect(doc.querySelector('[data-revenue-page]').textContent).toBe('1 / 2');expect(doc.querySelectorAll('[data-revenue-toggle]')).toHaveLength(8);doc.querySelector('[data-revenue-next]').click();expect(doc.querySelector('[data-revenue-page]').textContent).toBe('2 / 2');expect(doc.querySelectorAll('[data-revenue-toggle]')).toHaveLength(2);expect(doc.querySelectorAll('[data-revenue-point]')).toHaveLength(points);expect(doc.querySelector('[data-revenue-toggle="adjustment"]')).not.toBeNull();doc.querySelector('[data-revenue-toggle="adjustment"]').click();expect(doc.querySelectorAll('[data-revenue-segment="adjustment"]')).toHaveLength(0)
  }finally{d.window.close()}
 })
 it('preserves negative source amounts and never makes a missing denominator zero',()=>{
  const d=dom(business);try{const doc=d.window.document;expect(doc.querySelector('[data-revenue-segment="adjustment"][data-revenue-index="1"]').getAttribute('aria-label')).toContain('-7');doc.querySelector('[data-revenue-segment="adjustment"][data-revenue-index="1"]').dispatchEvent(new d.window.Event('click'));expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('-5.38%');choose(d,'[data-revenue-period]','quarterly');expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('第二季度总收入未提供');expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('无法计算');doc.querySelector('svg').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'ArrowDown'}));expect(doc.querySelector('[data-revenue-readout]').textContent).toContain('服务 0')
  }finally{d.window.close()}
 })
 it('uses stable source colors across periods and reordered/new series',()=>{
  expect(revenueSeriesColor('americas')).toBe('var(--sherlock-chart-1,var(--sherlock-muted))');const reordered={...business,datasets:[...business.datasets].reverse().map(d=>({...d,segments:[...d.segments].reverse()}))},a=dom(business),b=dom(reordered);try{const color=v=>v.window.document.querySelector('[data-revenue-segment="software"]').style.fill;expect(color(a)).toBe(color(b));expect(color(a)).toBe(revenueSeriesColor('software'))}finally{a.window.close();b.window.close()}
 })
 it('prevents hiding the final segment and restores semantic period, filter, page and selected series across source reordering',()=>{
  const a=dom(business),b=dom({...business,datasets:[...business.datasets].reverse()});let before,after
  try{const doc=a.window.document;before=createWorkbenchRefreshSurface(doc.body);doc.querySelector('[data-revenue-toggle="software"]').click();doc.querySelector('[data-revenue-next]').click();doc.querySelector('[data-revenue-segment="adjustment"][data-revenue-index="1"]').dispatchEvent(new a.window.Event('click'));after=createWorkbenchRefreshSurface(b.window.document.body);after.apply(before.snapshot(),true);const fresh=b.window.document;expect(fresh.querySelector('[data-revenue-period]').value).toBe('annual');expect(fresh.querySelector('[data-revenue-page]').textContent).toBe('2 / 2');expect(fresh.querySelector('[data-revenue-readout]').textContent).toContain('收入冲减 -7');expect(fresh.querySelectorAll('[data-revenue-segment="software"]')).toHaveLength(0)
   choose(b,'[data-revenue-period]','quarterly');fresh.querySelector('[data-revenue-toggle="software"]').click();expect(fresh.querySelector('[data-revenue-toggle="services"]').disabled).toBe(true);expect(fresh.querySelector('[data-revenue-note]').textContent).toContain('未覆盖全部公司收入')
  }finally{before?.dispose();after?.dispose();a.window.close();b.window.close()}
 })
 it('rejects all-empty segments even when a company total exists, and requires source records on the first simulated call',()=>{
  const noData=copy(geography);noData.datasets.forEach(d=>d.segments.forEach(r=>{r.values=r.values.map(()=>null);r.missing='未返回'}));expect(templateSourceDataIssue(noData)).toBeTruthy()
  for(const [title,variant]of [['地域收入','revenue-geography'],['业务线收入','revenue-business']]){expect(marketVariant({title})).toBe(variant);expect(()=>validateWorkbench({requestId:'missing-revenue',title:'虚构收入',dataMode:'simulated',panels:[{title,type:'market',prompt:'只使用来源',size:'large'}]})).toThrow(/完整 artifact/)}
 })
})
