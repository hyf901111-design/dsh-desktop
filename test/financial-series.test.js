import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {financialSeriesDataIssue,renderFinancialSeries} from '../packages/dsh-research-task-runtime/financial-series.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {seriesFixtures,performance,multiples,target} from './fixtures/financial-series.js'
function dom(data){
 const out=renderFinancialSeries(data),d=new JSDOM(out.body,{runScripts:'outside-only'})
 d.window.ResizeObserver=class{observe(){}disconnect(){}}
 d.window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:text=>({width:String(text).length*6})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)})
 d.window.eval(out.script);return d
}
const event=(d,el,type,props={})=>el.dispatchEvent(new d.window.KeyboardEvent(type,{bubbles:true,...props}))
describe('latest financial series data and interactions',()=>{
 it.each(seriesFixtures)('retains $variant as its independent sourced model and dimensions',data=>{
  expect(financialSeriesDataIssue(data)).toBeNull();const out=acceptArtifactOutput(JSON.stringify(data));expect(out).toBeTruthy();const spec=JSON.parse(out)
  expect(readTemplateModel(spec).data).toEqual(data);expect(templateFor(data).figma).toMatch(/^1917:/);expect(templateFor(data).interactions.length).toBeGreaterThan(2)
  const design=workbenchDesignTemplate({type:'market',artifact:data});expect(researchMarketDimensions({containerSpec:spec})).toEqual({width:design.width,height:design.height})
  expect(spec.html).toContain(data.asOf);expect(spec.html).toContain('未调用真实行情')
 })
 it('rejects fabricated calendar dates, reversed or duplicate candles, inconsistent OHLC and missing volume without a reason',()=>{
  const c=performance.candles[0]
  for(const patch of [{date:'2026-02-30'},{high:9},{low:11},{open:-1},{volume:undefined},{volume:null}])expect(financialSeriesDataIssue({...performance,candles:[{...c,...patch}]})).toBeTruthy()
  expect(financialSeriesDataIssue({...performance,candles:[c,c]})).toMatch(/递增/)
  expect(financialSeriesDataIssue({...performance,timezone:''})).toBeTruthy()
 })
 it('keeps source trading days, zero and unknown volume while navigating real windows',()=>{
  const d=dom(performance);try{const doc=d.window.document,canvas=doc.querySelector('canvas'),readout=doc.querySelector('[data-series-readout]')
   event(d,canvas,'keydown',{key:'Home'});expect(readout.textContent).toContain('2026-09-01');expect(readout.textContent).toContain('成交量 0 股')
   event(d,canvas,'keydown',{key:'ArrowRight'});expect(readout.textContent).toContain('未提供');expect(readout.textContent).toContain('该日成交量未返回')
   doc.querySelector('[data-performance-range="5"]').click();expect(doc.querySelector('[data-series-coverage]').textContent).toContain('5 个已取得交易日')
   doc.querySelector('[data-performance-action="in"]').click();const first=JSON.parse(canvas.dataset.workbenchChartView);expect(performance.candles.map(c=>c.date)).toContain(first.start);expect(performance.candles.map(c=>c.date)).toContain(first.end)
   doc.querySelector('[data-performance-action="left"]').click();const second=JSON.parse(canvas.dataset.workbenchChartView);expect(second.start<=first.start).toBe(true)
   doc.querySelector('[data-performance-action="reset"]').click();expect(doc.querySelector('[data-series-coverage]').textContent).toContain('24 个已取得交易日')
  }finally{d.window.close()}
 })
 it('restores the quoted window against refreshed candles without making extra records',()=>{
  const before=dom(performance),after=dom({...performance,candles:[...performance.candles,{date:'2026-09-25',open:13,high:14,low:12,close:13.5,volume:999}]});let a,b
  try{const doc=before.window.document;a=createWorkbenchRefreshSurface(doc.body);doc.querySelector('[data-performance-range="5"]').click();const expected=JSON.parse(doc.querySelector('canvas').dataset.workbenchChartView);b=createWorkbenchRefreshSurface(after.window.document.body);b.apply(a.snapshot(),true);const actual=JSON.parse(after.window.document.querySelector('canvas').dataset.workbenchChartView);expect(actual.start).toBe(expected.start);expect(actual.end).toBe(expected.end)}finally{a?.dispose();b?.dispose();before.window.close();after.window.close()}
 })
 it('preserves negative PE and breaks a valuation path at an unknown period',()=>{
  const d=dom(multiples);try{const doc=d.window.document,svg=doc.querySelector('svg'),ps=svg.querySelector('[data-series-metric="ps"]');expect(ps.getAttribute('d').match(/M/g)).toHaveLength(2);expect(ps.getAttribute('d')).not.toContain('L')
   event(d,svg,'keydown',{key:'Home'});event(d,svg,'keydown',{key:'ArrowRight'});expect(doc.querySelector('[data-series-readout]').textContent).toContain('-5 倍（负盈利倍数）');expect(doc.querySelector('[data-series-readout]').textContent).toContain('未提供：2024年营收口径未返回')
   doc.querySelector('button[data-series-metric="ps"]').click();expect(svg.querySelector('[data-series-metric="ps"]')).toBeNull()
   const select=doc.querySelector('select');select.value='1';select.dispatchEvent(new d.window.Event('change'));expect(doc.querySelector('[data-series-readout]').textContent).toContain('2026-Q2');expect(doc.querySelector('tbody').textContent).not.toContain('2023')
  }finally{d.window.close()}
 })
 it('rejects mixed units, duplicate periods, wrong length and unstated null valuation values',()=>{
  for(const patch of [{unit:'CNY'},{datasets:[{...multiples.datasets[0],periods:['2024','2024']}]},{datasets:[{...multiples.datasets[0],series:[{metric:'pe',values:[1]}]}]},{datasets:[{...multiples.datasets[0],series:[{metric:'pe',values:[1,null,2]}]}]}])expect(financialSeriesDataIssue({...multiples,...patch})).toBeTruthy()
  const d=dom({...multiples,datasets:[multiples.datasets[0]]});try{expect(d.window.document.querySelectorAll('option')).toHaveLength(1)}finally{d.window.close()}
 })
 it('restores period, hidden metrics and selected observation after dataset order changes',()=>{
  const before=dom(multiples),after=dom({...multiples,datasets:[multiples.datasets[1],multiples.datasets[0]]});let a,b
  try{const doc=before.window.document;a=createWorkbenchRefreshSurface(doc.body);doc.querySelector('button[data-series-metric="ps"]').click();event(before,doc.querySelector('svg'),'keydown',{key:'Home'});b=createWorkbenchRefreshSurface(after.window.document.body);b.apply(a.snapshot(),true);const fresh=after.window.document;expect(fresh.querySelector('select').value).toBe('1');expect(fresh.querySelector('button[data-series-metric="ps"]').getAttribute('aria-pressed')).toBe('false');expect(fresh.querySelector('[data-series-readout]').textContent).toContain('2023')}finally{a?.dispose();b?.dispose();before.window.close();after.window.close()}
 })
 it('distinguishes forecasts, current reference and missing history, labels expired records and sorts known targets first',()=>{
  const d=dom(target);try{const doc=d.window.document;expect(doc.querySelector('.target-current')).toBeTruthy();expect(doc.querySelectorAll('.target-dot')).toHaveLength(2);expect(doc.querySelectorAll('.target-expired')).toHaveLength(1);expect(doc.querySelector('.target-history').getAttribute('d').match(/M/g)).toHaveLength(2)
   const row=[...doc.querySelectorAll('table[aria-label="机构目标价"] tbody tr')].find(r=>r.textContent.includes('机构乙'));event(d,row,'keydown',{key:'Enter'});expect(doc.querySelector('[data-series-readout]').textContent).toContain('已过期');expect(doc.querySelector('[data-series-readout]').textContent).toContain('2026-01-01')
   const sort=doc.querySelector('[data-target-sort]');sort.value='price';sort.dispatchEvent(new d.window.Event('change'));expect([...doc.querySelectorAll('table[aria-label="机构目标价"] tbody tr')].map(r=>r.cells[1].textContent)).toEqual(['15 CNY','8 CNY','未提供'])
   const check=doc.querySelector('[data-target-expired]');check.checked=false;check.dispatchEvent(new d.window.Event('change'));expect(doc.querySelectorAll('.target-dot')).toHaveLength(1);expect(doc.querySelector('tbody').textContent).not.toContain('机构乙')
   expect(doc.querySelector('svg').textContent).not.toContain('2022-01-01');expect(doc.querySelector('table[aria-label="实际历史报价"]').textContent).toContain('2026-09-29未提供当日收盘价未返回')
  }finally{d.window.close()}
 })
 it('rejects incompatible target currencies, future publication and validity before publication',()=>{
  for(const patch of [{currentPrice:undefined},{currency:'美元'},{forecasts:[{...target.forecasts[0],currency:'USD'}]},{forecasts:[{...target.forecasts[0],issuedDate:'2026-10-02'}]},{forecasts:[{...target.forecasts[0],validUntil:'2026-08-01'}]},{forecasts:[{...target.forecasts[0],targetPrice:null}]},{history:[...target.history,{date:'2026-10-02',value:13}]}])expect(financialSeriesDataIssue({...target,...patch})).toBeTruthy()
  expect(financialSeriesDataIssue({...target,forecasts:[target.forecasts[0],target.forecasts[0]]})).toMatch(/重复/)
 })
 it('does not count all-empty financial observations as retrieved data',()=>{
  expect(templateSourceDataIssue({...performance,candles:[]})).toBeTruthy()
  expect(templateSourceDataIssue({...multiples,datasets:[{...multiples.datasets[0],series:[{metric:'pe',values:[null,null,null],missing:'未返回'}]}]})).toBeTruthy()
  expect(templateSourceDataIssue({...target,currentPrice:null,currentMissing:'未提供',history:undefined,forecasts:target.forecasts.map(r=>({...r,targetPrice:null,missing:'未提供'}))})).toBeTruthy()
 })
 it('routes distinct daily requests and requires their complete simulated data on the first call',()=>{
  for(const [title,variant]of [['价格表现','price-performance'],['估值倍数','valuation-multiples'],['分析师目标价','price-target']]){expect(marketVariant({title})).toBe(variant);expect(()=>validateWorkbench({requestId:'missing-series',title:'虚构序列',dataMode:'simulated',panels:[{title,type:'market',prompt:'只使用给定虚构记录',size:'large'}]})).toThrow(/完整 artifact/)}
  const plan=validateWorkbench({requestId:'complete-series',title:'虚构金融序列',dataMode:'simulated',panels:seriesFixtures.map(artifact=>({title:artifact.variant,type:'market',prompt:'只使用这批虚构记录',size:'large',artifact:JSON.parse(JSON.stringify({...artifact,sources:undefined}))}))});expect(plan.panels.map(p=>p.artifact.variant)).toEqual(seriesFixtures.map(r=>r.variant))
 })
})
