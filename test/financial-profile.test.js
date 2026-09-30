import {describe,it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {financialProfileDataIssue,renderFinancialProfile} from '../packages/dsh-research-task-runtime/financial-profile.js'
import {templateSourceDataIssue} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {marketPanelSchema} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

const common={version:1,type:'market',title:'明确虚构的金融模板验证',symbol:'DEMO.SH',asOf:'2026-09-30 · 模拟数据',note:'全部为虚构记录，不代表任何真实证券或个人。'}
const ticker={...common,variant:'ticker-information',name:'模拟企业',price:12.5,priceUnit:'元',dayChange:-.3,dayChangePercent:-2.34,info:[{label:'成交量',value:'120 万股'},{label:'行业',value:'模拟行业'}],sparkline:{labels:['09-28','09-29','09-30'],values:[13,null,12.5]}}
const metrics={...common,variant:'key-metrics',items:[{label:'市值',value:'10 亿元',period:'2026-09-30'},{label:'营业收入',value:'2 亿元',period:'2025年度',detail:'合并报表'},{label:'ROE',value:null,period:'2025年度',missing:'来源未披露'}]}
const team={...common,variant:'management-team',period:'2025年度',compensationBasis:'年度总报酬（模拟）',members:[{name:'模拟成员甲',role:'首席执行官兼研发负责人',compensation:1500000,currency:'CNY'},{name:'模拟成员乙',role:'独立董事',compensation:null,currency:null,missing:'未披露'},{name:'模拟成员丙',role:'财务负责人',compensation:1000000,currency:'CNY'},{name:'模拟成员丁',role:'海外运营负责人',compensation:90000,currency:'USD',period:'2025财年'}]}
describe('three sourced financial profile templates',()=>{
 it.each([ticker,metrics,team])('retains the complete $variant source object and disclosure',data=>{
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
  expect(readTemplateModel(spec).data).toEqual(data)
  expect(spec.html).toContain(data.asOf);expect(spec.html).toContain(data.symbol)
  expect(spec.html).toContain(`data-sherlock-market="${data.variant}"`)
  expect(templateFor(data).figma).toMatch(/^1917:/)
  expect(researchMarketDimensions({containerSpec:spec})).toEqual({width:workbenchDesignTemplate({type:'market',artifact:data}).width,height:workbenchDesignTemplate({type:'market',artifact:data}).height})
 })
 it('preserves missing historical observations and a flat real series without inventing geometry',()=>{
  expect(renderFinancialProfile(ticker).body).toMatch(/M8\.00,12\.00\s+M192\.00,68\.00/)
  expect(renderFinancialProfile(ticker).body.match(/<circle /g)).toHaveLength(2)
  const flat=renderFinancialProfile({...ticker,sparkline:{labels:['A','B'],values:[12.5,12.5]}}).body
  expect(flat).not.toMatch(/NaN|Infinity/);expect(flat).toContain('M8.00,40.00 L192.00,40.00')
  const missing={...ticker,sparkline:undefined,sparklineMissing:'来源未提供日线',price:null,missing:'停牌时报价未提供'}
  expect(acceptArtifactOutput(JSON.stringify(missing))).toBeTruthy()
  expect(renderFinancialProfile(missing).body).not.toContain('<svg')
  for(const patch of [{sparkline:{labels:['A','B'],values:[null,null]}},{dayChangePercent:2},{price:null},{sparkline:undefined}])expect(financialProfileDataIssue({...ticker,...patch})).toBeTruthy()
 })
 it('requires a period for each metric and an explicit reason instead of zero for missing observations',()=>{
  for(const items of [[{label:'收入',value:'1亿元'}],[{label:'ROE',value:null,period:'2025'}],[{label:'ROE',value:10,period:'2025'}]])expect(financialProfileDataIssue({...metrics,items})).toBeTruthy()
  expect(templateSourceDataIssue({...metrics,items:[{label:'ROE',value:null,period:'2025',missing:'无响应'}]})).toMatch(/全部未提供/)
  expect(templateSourceDataIssue({...ticker,price:null,dayChange:null,dayChangePercent:null,sparkline:undefined})).toMatch(/全空报价/)
 })
 it('keeps currency and disclosure period attached to each remuneration record',()=>{
  const body=renderFinancialProfile(team).body
  expect(body).toContain('1,500,000');expect(body).toContain('2025财年');expect(body).toContain('USD');expect(body).toContain('未披露')
  for(const members of [[{...team.members[0],currency:null}],[{...team.members[1],missing:undefined}],[{...team.members[0],compensation:-1}]])expect(financialProfileDataIssue({...team,members})).toBeTruthy()
 })
 it('filters, selects and sorts records within currency without losing unknown amounts',()=>{
  const {body,script}=renderFinancialProfile(team),dom=new JSDOM(body,{runScripts:'outside-only'}),w=dom.window
  try{w.eval(script);const d=w.document,input=d.querySelector('input'),sort=d.querySelector('button'),rows=()=>[...d.querySelectorAll('tbody tr')]
   sort.click();expect(rows().map(r=>r.cells[0].textContent)).toEqual(['模拟成员甲','模拟成员丙','模拟成员丁','模拟成员乙'])
   sort.click();expect(rows().map(r=>r.cells[0].textContent)).toEqual(['模拟成员丙','模拟成员甲','模拟成员丁','模拟成员乙'])
   input.value='海外';input.dispatchEvent(new w.Event('input'));expect(d.querySelector('[data-financial-count]').textContent).toBe('1 / 4 人')
   const row=rows().find(r=>!r.hidden);row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(d.querySelector('[data-financial-readout]').textContent).toContain('2025财年')
   input.value='不存在';input.dispatchEvent(new w.Event('input'));expect(d.querySelector('[data-financial-empty]').hidden).toBe(false);expect(row.getAttribute('aria-selected')).toBe('false')
  }finally{w.close()}
 })
 it('maps each title to its own data contract and does not override an explicit variant',()=>{
  for(const [title,variant]of [['个股信息','ticker-information'],['核心指标','key-metrics'],['管理团队','management-team']]){
   expect(marketVariant({type:'market',title})).toBe(variant)
   expect(marketPanelSchema(variant)).toContain(variant)
  }
  expect(marketVariant({title:'核心指标',artifact:{variant:'metrics'}})).toBe('metrics')
  const input=validateWorkbench({requestId:'financial-profile-supplied',title:common.title,dataMode:'simulated',panels:[ticker,metrics,team].map(artifact=>({title:artifact.variant,type:'market',size:'large',prompt:'只使用明确提供的虚构记录',artifact}))})
  expect(input.panels.map(p=>p.artifact.variant)).toEqual(['ticker-information','key-metrics','management-team'])
  for(const [title,variant] of [['个股信息','ticker-information'],['核心指标','key-metrics'],['管理团队','management-team']]){
   expect(()=>validateWorkbench({requestId:'missing-profile',title:'模拟个股工作台',dataMode:'simulated',panels:[{title,type:'market',size:'medium',prompt:`variant: ${variant}`}]})).toThrow(/完整 artifact/)
  }
 })
 it('escapes source text and reserves a complete metrics footer before data has arrived',()=>{
  const data={...metrics,items:[{label:'</script><script>alert(1)</script>',value:'1亿元',period:'2025'}]}
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)));expect(spec.html).not.toContain('<script>alert(1)</script>');expect(readTemplateModel(spec).data).toEqual(data)
  expect(workbenchDesignTemplate({type:'market',title:'指数概览',prompt:'variant: metrics'})).toMatchObject({width:656,height:334})
 })
})
