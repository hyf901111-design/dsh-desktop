import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {snapshotFixtures,shares,overview,fx,watch} from './fixtures/financial-snapshot.js'
import {financialSnapshotDataIssue,inverseCurrencyPair,renderFinancialSnapshot} from '../packages/dsh-research-task-runtime/financial-snapshot.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {createWorkbenchRefreshSurface,isWorkbenchViewState} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
function dom(data){const {body,script}=renderFinancialSnapshot(data),d=new JSDOM(body,{runScripts:'outside-only'});d.window.eval(script);return d}
describe('four latest sourced financial snapshots',()=>{
 it.each(snapshotFixtures)('retains $variant as its dedicated Figma data model',data=>{
  expect(financialSnapshotDataIssue(data)).toBeNull()
  const out=acceptArtifactOutput(JSON.stringify(data));expect(out).toBeTruthy();const spec=JSON.parse(out)
  expect(readTemplateModel(spec).data).toEqual(data);expect(templateFor(data).figma).toMatch(/^1917:/)
  expect(spec.html).toContain(data.asOf);expect(spec.html).toContain('未调用真实行情')
  const design=workbenchDesignTemplate({type:'market',artifact:data});expect(researchMarketDimensions({containerSpec:spec})).toEqual({width:design.width,height:design.height})
 })
 it('keeps shares and percentages separate and rejects contradictory share counts',()=>{
  expect(renderFinancialSnapshot(shares).body).toContain('1,000 万股');expect(renderFinancialSnapshot(shares).body).toContain('自由流通比例尚未披露')
  for(const patch of [{floatShares:1300},{freeFloatPercent:101},{totalShares:'1200万股'},{freeFloatPercent:null,missing:undefined},{period:undefined}])expect(financialSnapshotDataIssue({...shares,...patch})).toBeTruthy()
 })
 it('uses one quote snapshot for an exact inverse, swaps the extrema and preserves missing periods',()=>{
  const r=inverseCurrencyPair(fx.pairs[0]);expect(r.base).toBe('CNY');expect(r.quote).toBe('USD');expect(r.rate).toBeCloseTo(1/7.2,12)
  expect(r.high52).toBeCloseTo(1/7,12);expect(r.low52).toBeCloseTo(1/7.8,12);expect(r.dayChangePercent).toBeCloseTo(-.5/1.005,12);expect(r.month6ChangePercent).toBeNull();expect(r.asOf).toBe(fx.pairs[0].asOf)
  for(const patch of [{rate:0},{dayChangePercent:-100},{high52:6},{quote:'USD'},{rate:null,missing:undefined}])expect(financialSnapshotDataIssue({...fx,pairs:[{...fx.pairs[0],...patch}]})).toBeTruthy()
  expect(financialSnapshotDataIssue({...fx,pairs:[fx.pairs[0],r]})).toMatch(/一个方向/)
  const d=dom(fx);try{const doc=d.window.document,base=doc.querySelector('[data-fx-base]'),quote=doc.querySelector('[data-fx-quote]');base.value='CNY';base.dispatchEvent(new d.window.Event('change'));quote.value='USD';quote.dispatchEvent(new d.window.Event('change'));const rows=[...doc.querySelectorAll('[data-fx-pair]')].filter(r=>!r.hidden);expect(rows).toHaveLength(1);expect(rows[0].textContent).toContain('0.138889');rows[0].click();expect(doc.querySelector('[data-snapshot-readout]').textContent).toContain('1 CNY =');expect(doc.querySelector('[data-snapshot-readout]').textContent).toContain('2026-09-30 16:00 UTC')}finally{d.window.close()}
 })
 it('keeps a history gap, a flat history and a missing market visibly distinct',()=>{
  const body=renderFinancialSnapshot(overview).body;expect(body).not.toMatch(/NaN|Infinity/);expect(body).toContain('M5.00,54.00  M145.00,6.00');expect(body).toContain('M5.00,30.00 L145.00,30.00')
  const d=dom(overview);try{const doc=d.window.document,svg=doc.querySelector('[data-index-spark]');svg.dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'Home'}));svg.dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'ArrowRight'}));expect(doc.querySelector('[data-index-readout]').textContent).toContain('未提供');const select=doc.querySelector('select');select.value='市场丙';select.dispatchEvent(new d.window.Event('change'));expect([...doc.querySelectorAll('[data-index-market]')].filter(r=>!r.hidden)).toHaveLength(1);expect(doc.querySelector('[data-index-market="市场丙"]').textContent).toContain('报价不可用')}finally{d.window.close()}
 })
 it('shows compact amounts without losing their exact source values or tiny changes',()=>{
  const d=dom(watch);try{const doc=d.window.document,cap=doc.querySelector('[data-refresh-key="DEMO.CNY.A:cap"]');expect(cap.textContent).toBe('2B CNY');expect(cap.title).toBe('2,000,000,000 CNY');doc.querySelector('[data-watch-symbol="DEMO.CNY.A"]').click();expect(doc.querySelector('[data-snapshot-readout]').textContent).toContain('总市值 2,000,000,000 CNY')}finally{d.window.close()}
  const body=renderFinancialSnapshot({...fx,pairs:[{...fx.pairs[0],dayChangePercent:.0001}]}).body;expect(body).toContain('+&lt;0.01%');expect(body).toContain('title="0.0001%"')
 })
 it('sorts amounts inside currency groups, keeps unknowns last and provides local membership editing',()=>{
  const d=dom(watch);try{const doc=d.window.document;doc.querySelector('[data-watch-sort="price"]').click();expect([...doc.querySelectorAll('[data-watch-symbol]')].map(r=>r.dataset.watchSymbol)).toEqual(['DEMO.CNY.A','DEMO.CNY.B','DEMO.USD']);doc.querySelector('[data-watch-manager]').click();const c=doc.querySelector('[data-watch-follow="DEMO.CNY.B"]');c.checked=false;c.dispatchEvent(new d.window.Event('change'));expect(doc.querySelector('[data-watch-symbol="DEMO.CNY.B"]').hidden).toBe(true);c.checked=true;c.dispatchEvent(new d.window.Event('change'));expect(doc.querySelector('[data-watch-symbol="DEMO.CNY.B"]').hidden).toBe(false);const input=doc.querySelector('[data-watch-search]');input.value='海外';input.dispatchEvent(new d.window.Event('input'));expect([...doc.querySelectorAll('[data-watch-symbol]')].filter(r=>!r.hidden)).toHaveLength(1);doc.querySelector('[data-watch-symbol="DEMO.USD"]').click();expect(doc.querySelector('[data-snapshot-readout]').textContent).toContain('延迟')}finally{d.window.close()}
 })
 it('restores membership, sorting, selection and scroll by symbol after quote order changes',()=>{
  const before=dom(watch),after=dom({...watch,quotes:[watch.quotes[2],watch.quotes[1],{...watch.quotes[0],price:13}]});let a,b
  try{const d=before.window.document;a=createWorkbenchRefreshSurface(d.body);d.querySelector('[data-watch-sort="dayChangePercent"]').click();d.querySelector('[data-watch-symbol="DEMO.CNY.A"]').click();const checkbox=d.querySelector('[data-watch-follow="DEMO.CNY.B"]');checkbox.checked=false;checkbox.dispatchEvent(new before.window.Event('change'));d.querySelector('.snapshot-table-wrap').scrollLeft=100;const state=a.snapshot();expect(isWorkbenchViewState(state)).toBe(true)
   const fresh=after.window.document;b=createWorkbenchRefreshSurface(fresh.body);b.apply(state,true);expect(fresh.querySelector('[data-watch-follow="DEMO.CNY.B"]').checked).toBe(false);expect(fresh.querySelector('[data-watch-follow="DEMO.CNY.A"]').checked).toBe(true);expect(fresh.querySelector('[data-watch-symbol="DEMO.CNY.A"]').getAttribute('aria-selected')).toBe('true');expect(fresh.querySelector('th[aria-sort="descending"] button').dataset.watchSort).toBe('dayChangePercent');expect(fresh.querySelector('.snapshot-table-wrap').scrollLeft).toBe(100);expect(fresh.querySelector('[data-refresh-key="DEMO.CNY.A:price"]').hasAttribute('data-workbench-value-changed')).toBe(true)
  }finally{a?.dispose();b?.dispose();before.window.close();after.window.close()}
 })
 it('does not mark empty retrieval as successful financial data',()=>{
  expect(templateSourceDataIssue({...shares,totalShares:null,floatShares:null})).toBeTruthy()
  expect(templateSourceDataIssue({...overview,indices:[{...overview.indices[0],price:null,changePercent:null,sparkline:undefined}]})).toBeTruthy()
  expect(templateSourceDataIssue({...fx,pairs:fx.pairs.map(r=>({...r,rate:null}))})).toBeTruthy()
  expect(templateSourceDataIssue({...watch,quotes:watch.quotes.map(r=>({...r,price:null}))})).toBeTruthy()
  expect(financialSnapshotDataIssue({...watch,quotes:[watch.quotes[0],watch.quotes[0]]})).toMatch(/重复/)
 })
 it('routes natural component titles while keeping an explicit original metrics contract',()=>{
  for(const [title,variant]of [['股本统计','share-statistics'],['市场概览','market-overview'],['外汇快照','currency-snapshot'],['自选股','watchlist']]){expect(marketVariant({title})).toBe(variant);expect(()=>validateWorkbench({requestId:'missing-snapshot',title:'虚构快照',dataMode:'simulated',panels:[{title,type:'market',size:'medium',prompt:'按要求展示'}]})).toThrow(/完整 artifact/)}
  expect(marketVariant({title:'市场概览',prompt:'variant: metrics'})).toBe('metrics')
  const plan=validateWorkbench({requestId:'complete-snapshot',title:'虚构金融工作台',dataMode:'simulated',panels:snapshotFixtures.map(artifact=>({title:artifact.variant,type:'market',size:'large',prompt:'只使用这批虚构记录',artifact:JSON.parse(JSON.stringify({...artifact,sources:undefined}))}))});expect(plan.panels.map(p=>p.artifact.variant)).toEqual(snapshotFixtures.map(d=>d.variant))
 })
})
