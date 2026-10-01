import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {financialActionDataIssue,renderFinancialActions,FINANCIAL_ACTION_FIELDS} from '../packages/dsh-research-task-runtime/financial-actions.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {WORKBENCH_EARLY_PLAN} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {actionFixtures,dividends,splits} from './fixtures/financial-actions.js'
const copy=v=>JSON.parse(JSON.stringify(v))
const dom=s=>{const out=renderFinancialActions(s),d=new JSDOM(out.body,{runScripts:'outside-only'});d.window.eval(out.script);return d}
const choose=(d,q,v,event='change')=>{const el=d.window.document.querySelector(q);el.value=v;el.dispatchEvent(new d.window.Event(event))}
describe('source corporate action templates',()=>{
 it.each(actionFixtures)('retains $variant source records in its native template',s=>{
  expect(financialActionDataIssue(s)).toBeNull();const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(s)));expect(readTemplateModel(spec).data).toEqual(s);expect(templateFor(s).figma).toBe(s.variant==='dividends'?'1917:348283':'1917:348906');expect(workbenchDesignTemplate({type:'market',artifact:s}).minWidth).toBe(s.variant==='dividends'?480:320);expect(WORKBENCH_EARLY_PLAN).toContain(FINANCIAL_ACTION_FIELDS[s.variant])
 })
 it('rejects duplicate ids, invalid dates, lost dates/units and unverified URLs',()=>{
  const e=dividends.events[0]
  for(const patch of [{id:''},{exDate:'2026-02-30'},{currency:'人民币'},{status:'executed'},{amount:-1},{amount:undefined},{recordDate:undefined},{adjustedAmount:null,missing:''},{link:'javascript:alert(1)'},{link:'https://user:password@example.com/'}])expect(financialActionDataIssue({...dividends,events:[{...e,...patch}]})).toBeTruthy()
  expect(financialActionDataIssue({...dividends,events:[e,e]})).toMatch(/唯一/)
  expect(financialActionDataIssue({...dividends,events:[{...e,paymentDate:null,missing:'未提供支付日'}]})).toMatch(/已支付/)
 })
 it('requires source-confirmed empty results and permits no events without fabricated rows',()=>{
  expect(financialActionDataIssue({...splits,events:[]})).toMatch(/emptyReason/);const s={...splits,events:[],emptyReason:'来源确认该范围没有拆股事件'};expect(financialActionDataIssue(s)).toBeNull();const d=dom(s);try{expect(d.window.document.querySelectorAll('tbody tr')).toHaveLength(0);expect(d.window.document.querySelector('[data-action-empty]').textContent).toContain('来源确认')}finally{d.window.close()}
 })
 it('keeps actual zero and unknown amounts, dates, currency and source status distinct',()=>{
  const d=dom(dividends);try{const doc=d.window.document;doc.querySelector('[data-action-id="div-1"]').click();expect(doc.querySelector('[data-action-readout]').textContent).toContain('每股 0 CNY');doc.querySelector('[data-action-id="div-11"]').click();const r=doc.querySelector('[data-action-readout]').textContent;expect(r).toContain('公告计划');expect(r).toContain('支付 未提供');expect(r).toContain('每股 未提供 CNY');expect(r).toContain('公告未披露');expect(doc.querySelectorAll('tbody tr')).toHaveLength(13)}finally{d.window.close()}
 })
 it('preserves split direction and source price basis without adjusting any price',()=>{
  const d=dom(splits);try{const doc=d.window.document;doc.querySelector('[data-action-id="reverse"]').click();expect(doc.querySelector('[data-action-readout]').textContent).toContain('5旧股对应1新股 · 合股 · 行情复权 来源价格后复权');doc.querySelector('[data-action-id="unknown"]').click();expect(doc.querySelector('[data-action-readout]').textContent).toContain('1旧股对应未提供新股 · 比例未提供');expect(doc.querySelector('[data-action-readout]').textContent).toContain('公告计划')}finally{d.window.close()}
  for(const patch of [{from:0},{to:-1},{to:undefined},{priceBasis:''},{from:null,missing:''}])expect(financialActionDataIssue({...splits,events:[{...splits.events[0],...patch}]})).toBeTruthy()
 })
 it('filters source date ranges, companies and statuses and resets an invalid interval',()=>{
  const d=dom(dividends);try{const doc=d.window.document;choose(d,'[data-action-from]','2026-06-01');choose(d,'[data-action-to]','2026-08-31');expect(doc.querySelector('[data-action-count]').textContent).toBe('3 / 13 条');choose(d,'[data-action-from]','2026-09-01');expect(doc.querySelector('[data-action-empty]').textContent).toContain('开始日期');doc.querySelector('[data-action-reset]').click();choose(d,'[data-action-company]','OTHER.USD');expect(doc.querySelector('[data-action-count]').textContent).toBe('1 / 13 条');choose(d,'[data-action-status]','paid');expect(doc.querySelector('[data-action-count]').textContent).toBe('0 / 13 条')}finally{d.window.close()}
 })
 it('sorts dates and supports keyboard selection, preserving full source details and announcements',()=>{
  const d=dom(splits);try{const doc=d.window.document;expect(doc.querySelector('tbody tr').dataset.actionId).toBe('unknown');doc.querySelector('[data-action-sort]').click();expect(doc.querySelector('tbody tr').dataset.actionId).toBe('forward');doc.querySelector('tbody tr').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'ArrowDown'}));expect(doc.querySelector('[data-action-readout]').textContent).toContain('5旧股对应1新股');doc.querySelector('[data-action-id="forward"]').click();expect(doc.querySelector('[data-action-readout] a').href).toBe('https://example.com/announcements/forward');expect(doc.querySelector('[data-action-readout] a').rel).toBe('noopener noreferrer')}finally{d.window.close()}
 })
 it('restores semantic filters, date order and selected event after source reorder',()=>{
  const a=dom(dividends),b=dom({...dividends,events:[...dividends.events].reverse()});let before,after
  try{const doc=a.window.document;before=createWorkbenchRefreshSurface(doc.body);choose(a,'[data-action-company]','DEMO.CNY');choose(a,'[data-action-from]','2026-06-01');doc.querySelector('[data-action-sort]').click();doc.querySelector('[data-action-id="div-6"]').click();after=createWorkbenchRefreshSurface(b.window.document.body);after.apply(before.snapshot(),true);const fresh=b.window.document;expect(fresh.querySelector('[data-action-company]').value).toBe('DEMO.CNY');expect(fresh.querySelector('[data-action-from]').value).toBe('2026-06-01');expect(fresh.querySelector('th').getAttribute('aria-sort')).toBe('ascending');expect(fresh.querySelector('[data-action-readout]').textContent).toContain('除息 2026-07-10')}finally{before?.dispose();after?.dispose();a.window.close();b.window.close()}
 })
 it('routes Chinese event requests and rejects missing simulated source artifacts',()=>{
  for(const [title,variant]of [['分红记录','dividends'],['拆股合股记录','stock-splits']]){expect(marketVariant({title})).toBe(variant);expect(()=>validateWorkbench({requestId:'missing-action',title:'虚构事件',dataMode:'simulated',panels:[{title,type:'market',prompt:'只使用来源',size:'large'}]})).toThrow(/完整 artifact/)}
 })
})
