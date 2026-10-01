import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {financialOwnershipDataIssue,renderFinancialOwnership,FINANCIAL_OWNERSHIP_FIELDS} from '../packages/dsh-research-task-runtime/financial-ownership.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {marketVariant} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {WORKBENCH_EARLY_PLAN} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js';
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js';
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js';
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {ownershipFixtures,insider,institutional} from './fixtures/financial-ownership.js';
const copy=v=>structuredClone(v);
const dom=s=>{const out=renderFinancialOwnership(s),d=new JSDOM(out.body,{runScripts:'outside-only'});d.window.eval(out.script);return d;};
const choose=(d,q,v,event='change')=>{const el=d.window.document.querySelector(q);el.value=v;el.dispatchEvent(new d.window.Event(event));};
describe('source insider and institutional ownership templates',()=>{
 it.each(ownershipFixtures)('uses the source contract for $variant',s=>{
  const output=acceptArtifactOutput(JSON.stringify(s));expect(typeof output).toBe('string');const spec=JSON.parse(output);
  expect(readTemplateModel(spec).data).toEqual(s);
  expect(templateFor(s)?.figma).toBe(s.variant==='insider-trading'?'1917:349065':'1917:350110');
  expect(WORKBENCH_EARLY_PLAN).toContain(FINANCIAL_OWNERSHIP_FIELDS[s.variant]);
 });
 it('routes each Chinese card title before a repeated multi-card prompt',()=>{
  expect(marketVariant({title:'内幕交易来源记录',prompt:'创建内幕交易和机构持仓'})).toBe('insider-trading');
  expect(marketVariant({title:'机构持仓季度对比',prompt:'创建内幕交易和机构持仓'})).toBe('institutional-ownership');
 });
 it('rejects missing source fields, invalid dates, duplicate records and unsafe disclosures',()=>{
  const t=insider.transactions[0];
  for(const patch of [{id:''},{shares:-1},{amount:undefined},{ownerId:1},{disclosureDate:undefined},{transactionDate:'2026-02-30'},{direction:'grant'},{currency:'人民币'},{price:null,missing:''},{link:'javascript:alert(1)'},{link:'https://user:password@example.com/'}])expect(financialOwnershipDataIssue({...insider,transactions:[{...t,...patch}]})).toBeTruthy();
  expect(financialOwnershipDataIssue({...insider,transactions:[t,t]})).toMatch(/唯一/);
  expect(financialOwnershipDataIssue({...insider,transactions:[t,{...t,id:'different',name:'错误公司名'}]})).toMatch(/一致/);
 });
 it('keeps source-confirmed empty transactions distinct from missing data',()=>{
  expect(financialOwnershipDataIssue({...insider,transactions:[]})).toMatch(/emptyReason/);
  const s={...insider,transactions:[],emptyReason:'来源确认本查询范围无交易'};expect(financialOwnershipDataIssue(s)).toBeNull();const d=dom(s);
  try{expect(d.window.document.querySelectorAll('tbody tr')).toHaveLength(0);expect(d.window.document.querySelector('[data-ownership-empty]').textContent).toContain('来源确认');}finally{d.window.close();}
 });
 it('does not treat grants or exercises as purchases and retains zero, unknown fields and leading zero IDs',()=>{
  const d=dom(insider);try{const doc=d.window.document;doc.querySelector('[data-ownership-row="grant"]').click();const grant=doc.querySelector('[data-ownership-readout]').textContent;expect(grant).toContain('其他交易');expect(grant).toContain('数量 0 股');expect(grant).toContain('单价 未提供 CNY');expect(grant).toContain('披露 未提供');
   doc.querySelector('[data-ownership-row="option"]').click();expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('M 豁免行权 · 其他交易 · 来源未说明');
   doc.querySelector('[data-ownership-row="buy"]').click();const r=doc.querySelector('[data-ownership-readout]');expect(r.textContent).toContain('交易 2026-09-01 · 披露 2026-09-04');expect(r.textContent).toContain('持有人编号 0001');expect(r.querySelector('a').href).toBe('https://example.com/filings/buy');expect(r.querySelector('a').rel).toBe('noopener noreferrer');
  }finally{d.window.close();}
 });
 it('filters by company, person and direction, sorts actual transaction dates and selects using the keyboard',()=>{
  const d=dom(insider);try{const doc=d.window.document;choose(d,'[data-ownership-company]','DEMO.CNY');choose(d,'[data-ownership-person]','虚构人员乙');choose(d,'[data-ownership-direction]','other');expect(doc.querySelector('[data-ownership-count]').textContent).toBe('2 / 5 条');choose(d,'[data-ownership-search]','奖励','input');expect(doc.querySelector('[data-ownership-count]').textContent).toBe('1 / 5 条');doc.querySelector('[data-ownership-reset]').click();doc.querySelector('[data-ownership-sort]').click();expect(doc.querySelector('tbody tr').dataset.ownershipRow).toBe('buy');doc.querySelector('tbody tr').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'ArrowDown'}));expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('第二家虚构公司');choose(d,'[data-ownership-search]','无匹配','input');expect(doc.querySelector('[data-ownership-empty]').hidden).toBe(false);expect(doc.querySelectorAll('[aria-selected=true]')).toHaveLength(0);
  }finally{d.window.close();}
 });
 it('preserves disclosed aggregate values instead of deriving them from partial holder rows',()=>{
  const d=dom(institutional);try{const doc=d.window.document;expect(doc.querySelector('[data-ownership-count]').textContent).toBe('12 项来源统计 · 3 条机构明细');const shares=doc.querySelector('[data-ownership-row="DEMO.CNY:2026-Q2:metric:shares"]');expect(shares.textContent).toContain('1,200 股');expect(shares.textContent).not.toContain('150 股');doc.querySelector('[data-ownership-row="DEMO.CNY:2026-Q2:metric:percent"]').click();expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('变动 -3 百分点');expect(doc.querySelectorAll('[data-ownership-row*="holder:a-"]')).toHaveLength(2);doc.querySelector('[data-ownership-row="DEMO.CNY:2026-Q2:holder:a-preferred"]').click();expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('优先股');expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('占比 未提供 %');
  }finally{d.window.close();}
 });
 it('only offers returned years and quarters, keeps the comparison period distinct and never fabricates holders',()=>{
  const d=dom(institutional);try{const doc=d.window.document;choose(d,'[data-ownership-year]','2025');expect(doc.querySelector('[data-ownership-quarter]').value).toBe('Q4');expect(doc.querySelector('[data-ownership-count]').textContent).toBe('1 项来源统计 · 0 条机构明细');doc.querySelector('[data-ownership-row="DEMO.CNY:2025-Q4:metric:shares"]').click();expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('报告期 2025-Q4 · 比较期 2025-Q3 · 披露 2026-02-10');choose(d,'[data-ownership-company]','OTHER.USD');expect([...doc.querySelector('[data-ownership-quarter]').options].map(o=>o.value)).toEqual(['Q1']);const zero=doc.querySelector('[data-ownership-row="OTHER.USD:2026-Q1:metric:shares"]');expect(zero.textContent).toContain('0 股');expect(zero.textContent).toContain('未提供 %');zero.click();expect(doc.querySelector('[data-ownership-readout]').textContent).toContain('来源未提供披露日');
  }finally{d.window.close();}
 });
 it('requires complete original comparisons and separately scoped holder details',()=>{
  const s=copy(institutional),p=s.companies[0].snapshots[0],check=patch=>financialOwnershipDataIssue({...s,companies:[{...s.companies[0],snapshots:[{...p,...patch}]}]});
  for(const patch of [{period:'2026-Q5'},{previousPeriod:'2026-Q2'},{disclosureDate:undefined},{basis:''},{metrics:[{...p.metrics[0],current:undefined}]},{metrics:[{...p.metrics[0],changePercent:null,missing:''}]},{metrics:[p.metrics[0],p.metrics[0]]},{holdersBasis:''},{holders:[{...p.holders[0],ownershipPercent:101}]},{holders:[{...p.holders[0],shares:null,missing:''}]},{holders:[p.holders[0],p.holders[0]]}])expect(check(patch)).toBeTruthy();
 });
 it('does not accept wholly empty institution statistics as successful retrieval but keeps an actual zero',()=>{
  const s=copy(institutional);for(const c of s.companies)for(const p of c.snapshots){delete p.holders;delete p.holdersBasis;for(const m of p.metrics){m.current=m.previous=m.change=m.changePercent=null;m.missing='来源未返回任何统计数值';}}
  expect(templateSourceDataIssue(s)).toMatch(/尚无来源/);s.companies[0].snapshots[0].metrics[0].current=0;expect(templateSourceDataIssue(s)).toBeNull();
 });
 it.each(ownershipFixtures)('restores $variant semantic controls and selected source record after source order changes',async s=>{
  const shuffled=copy(s);if(s.variant==='insider-trading')shuffled.transactions.reverse();else{shuffled.companies.reverse();shuffled.companies.find(c=>c.symbol==='DEMO.CNY').snapshots.reverse();}
  const a=dom(s),b=dom(shuffled);let before,after;try{const doc=a.window.document;before=createWorkbenchRefreshSurface(doc.body);choose(a,'[data-ownership-company]','DEMO.CNY');
   if(s.variant==='insider-trading'){choose(a,'[data-ownership-person]','虚构人员乙');choose(a,'[data-ownership-direction]','other');doc.querySelector('[data-ownership-sort]').click();doc.querySelector('[data-ownership-row="grant"]').click();}
   else{const details=doc.querySelector('details');details.open=true;await new Promise(r=>setTimeout(r,5));choose(a,'[data-ownership-search]','优先股','input');doc.querySelector('[data-ownership-row="DEMO.CNY:2026-Q2:holder:a-preferred"]').click();}
   after=createWorkbenchRefreshSurface(b.window.document.body);after.apply(before.snapshot(),true);const fresh=b.window.document;expect(fresh.querySelector('[data-ownership-company]').value).toBe('DEMO.CNY');
   if(s.variant==='insider-trading'){expect(fresh.querySelector('[data-ownership-direction]').value).toBe('other');expect(fresh.querySelector('th').getAttribute('aria-sort')).toBe('ascending');expect(fresh.querySelector('[data-ownership-readout]').textContent).toContain('数量 0 股');}
   else{expect(fresh.querySelector('[data-ownership-year]').value).toBe('2026');expect(fresh.querySelector('[data-ownership-quarter]').value).toBe('Q2');expect(fresh.querySelector('[data-ownership-search]').value).toBe('优先股');expect(fresh.querySelector('[data-ownership-details="DEMO.CNY:2026-Q2:"]').open).toBe(true);expect(fresh.querySelector('[data-ownership-readout]').textContent).toContain('优先股');}
  }finally{before?.dispose();after?.dispose();a.window.close();b.window.close();}
 });
 it('escapes source labels and rejects incomplete simulated template submission',()=>{
  const escaped={...insider,transactions:[{...insider.transactions[0],person:'</script><script>alert(1)</script>'}]};const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(escaped)));expect(spec.html).not.toContain('<script>alert(1)</script>');expect(readTemplateModel(spec).data).toEqual(escaped);
  for(const title of ['内幕交易','机构持仓'])expect(()=>validateWorkbench({requestId:'missing-ownership',title:'虚构记录',dataMode:'simulated',panels:[{title,type:'market',prompt:'只使用来源',size:'large'}]})).toThrow(/完整 artifact/);
 });
});
