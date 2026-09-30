import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {financialFundamentalDataIssue,renderFinancialFundamental,FINANCIAL_FUNDAMENTAL_FIELDS} from '../packages/dsh-research-task-runtime/financial-fundamentals.js'
import {WORKBENCH_EARLY_PLAN} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {fundamentalFixtures,company,statements} from './fixtures/financial-fundamentals.js'
const copy=v=>JSON.parse(JSON.stringify(v))
function dom(data){const out=renderFinancialFundamental(data),d=new JSDOM(out.body,{runScripts:'outside-only'});d.window.eval(out.script);return d}
function choose(d,selector,value){const el=d.window.document.querySelector(selector);el.value=value;el.dispatchEvent(new d.window.Event('change'))}
describe('company and financial disclosure templates',()=>{
 it.each(fundamentalFixtures)('retains the independent $variant contract and Figma source without guessing a sample',data=>{
  expect(financialFundamentalDataIssue(data)).toBeNull();const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));expect(readTemplateModel(spec).data).toEqual(data)
  expect(templateFor(data).figma).toMatch(/^1917:/);expect(templateFor(data).interactions.length).toBeGreaterThan(2);const design=workbenchDesignTemplate({type:'market',artifact:data});expect(researchMarketDimensions({containerSpec:spec})).toEqual({width:design.width,height:design.height})
  expect(WORKBENCH_EARLY_PLAN).toContain(FINANCIAL_FUNDAMENTAL_FIELDS[data.variant]);expect(spec.html).toContain(data.asOf)
 })
 it('rejects absent identity fields, unstated nulls, invented dates, unsafe URLs and duplicate companies',()=>{
  for(const patch of [{employeeCount:-1},{employeeCount:undefined},{ipoDate:'2026-02-30'},{website:'javascript:alert(1)'},{website:'https://user:password@example.com'},{phone:null,missing:{}},{registrations:[],registrationsMissing:''},{description:[],descriptionMissing:''}])expect(financialFundamentalDataIssue({...company,companies:[{...company.companies[0],...patch}]})).toBeTruthy()
  expect(financialFundamentalDataIssue({...company,companies:[company.companies[0],company.companies[0]]})).toMatch(/重复/)
 })
 it('keeps whole paragraphs and distinguishes zero employees from unknown contact data when switching companies',()=>{
  const d=dom(company);try{const doc=d.window.document;expect(doc.querySelector('article').textContent).toContain(company.companies[0].description[1]);expect(doc.querySelector('a').href).toBe('https://example.com/company')
   choose(d,'select','OTHER.CNY');const visible=[...doc.querySelectorAll('article')].filter(r=>!r.hidden);expect(visible).toHaveLength(1);expect(visible[0].textContent).toContain('0 人');expect(visible[0].textContent).toContain('未提供上市日期');expect(visible[0].textContent).toContain('原资料未提供简介')
  }finally{d.window.close()}
 })
 it('requires actual report periods, disclosure dates, row shape and an acyclic source hierarchy',()=>{
  const base=statements.datasets[0]
  for(const patch of [{currency:'人民币'},{basis:''},{periods:[{...base.periods[0],disclosedAt:'2024-12-01'}]},{periods:[{...base.periods[0],endDate:'2024-02-30'}]},{periods:[base.periods[1],base.periods[0]]},{rows:[{id:'x',label:'x',values:[1]}]},{rows:[{id:'x',label:'x',values:[1,null]}]},{rows:[{id:'x',label:'x',values:[1,2],parentId:'x'}]}])expect(financialFundamentalDataIssue({...statements,datasets:[{...base,...patch}]})).toBeTruthy()
  expect(financialFundamentalDataIssue({...statements,datasets:[base,base]})).toMatch(/重复/)
 })
 it('preserves negative amounts, percentages, per-share units and disclosure dates rather than summing or converting rows',()=>{
  const d=dom(statements);try{const doc=d.window.document;expect(doc.querySelector('thead').textContent).toContain('披露 2026-03-01');expect(doc.querySelector('[data-statement-row="netIncome"]').textContent).toContain('-40');expect(doc.querySelector('[data-statement-row="margin"]').textContent).toContain('%-46.6667');expect(doc.querySelector('[data-statement-row="eps"]').textContent).toContain('CNY / 股未提供2024年每股收益未返回0.08')
   expect(doc.querySelectorAll('tbody tr')).toHaveLength(5);doc.querySelector('button').click();expect(doc.querySelector('[data-statement-row="software"]').hidden).toBe(true)
  }finally{d.window.close()}
 })
 it('offers only retrieved statement combinations and restores row selection after datasets are reordered',()=>{
  const before=dom(statements),after=dom({...statements,datasets:[...statements.datasets].reverse()});let a,b
  try{const doc=before.window.document;a=createWorkbenchRefreshSurface(doc.body);choose(before,'[data-statement-period]','quarterly');expect([...doc.querySelector('[data-statement-kind]').options].map(o=>o.value)).toEqual(['cashflow']);const row=doc.querySelector('[data-statement-row="investing"]');row.dispatchEvent(new before.window.KeyboardEvent('keydown',{key:'Enter'}));expect(doc.querySelector('[data-statement-readout]').textContent).toContain('Q2投资现金流未提供')
   b=createWorkbenchRefreshSurface(after.window.document.body);b.apply(a.snapshot(),true);const fresh=after.window.document;expect(fresh.querySelector('[data-statement-period]').value).toBe('quarterly');expect(fresh.querySelector('[data-statement-kind]').value).toBe('cashflow');expect(fresh.querySelector('[aria-selected="true"]').dataset.statementRow).toBe('investing');expect(fresh.querySelector('[data-statement-readout]').textContent).toContain('2026-Q1 -12')
   choose(after,'[data-statement-symbol]','OTHER.CNY');expect(fresh.querySelector('[data-statement-meta]').textContent).toContain('USD · 金额单位：千美元');expect(fresh.querySelectorAll('tbody tr')).toHaveLength(1)
  }finally{a?.dispose();b?.dispose();before.window.close();after.window.close()}
 })
 it('rejects all-empty source records and requires complete custom simulated data on the first call',()=>{
  const noData=copy(statements);noData.datasets.forEach(d=>d.rows.forEach(r=>{r.values=r.values.map(()=>null);r.missing='尚未返回'}));expect(templateSourceDataIssue(noData)).toBeTruthy()
  for(const [title,variant]of [['公司资料','company-profile'],['财务报表','financial-statements']]){expect(marketVariant({title})).toBe(variant);expect(()=>validateWorkbench({requestId:'missing-fundamental',title:'虚构公司',dataMode:'simulated',panels:[{title,type:'market',prompt:'只使用来源资料',size:'large'}]})).toThrow(/完整 artifact/)}
 })
})
