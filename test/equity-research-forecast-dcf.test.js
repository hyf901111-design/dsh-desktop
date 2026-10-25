import {describe,expect,it} from 'vitest'
import {createForecastDcfFixture} from './fixtures/equity-research-forecast-dcf.fixture.mjs'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {validatePacket} from '../skills/ework-equity-research/scripts/lib/index.mjs'
import {runCalculations} from '../skills/ework-equity-research/scripts/lib/calculations.mjs'

const module=await import('../skills/ework-equity-research/scripts/lib/forecast-dcf.mjs').catch(()=>null)
const discounts=await import('../skills/ework-equity-research/scripts/lib/discount.mjs').catch(()=>null)
const run=(fixture=createForecastDcfFixture())=>{const diagnostics=[];return{...fixture,diagnostics,result:module.runForecastDCF(fixture.packet,fixture.facts,fixture.calculations,diagnostics,fixture.observations)}}
const parameter=(f,id)=>f.packet.dcf.parameters.find(p=>p.id===id)

describe('V5 deterministic driver FCFF',()=>{
 it('exposes the controlled model API',()=>{expect(typeof module?.runForecastDCF).toBe('function')})
 // Literals independently evaluated with Python Decimal precision 90, not the
 // JS arithmetic or model implementation. The fixture amounts are synthetic.
 it.each([[0,'1'],[70,'0.987108189355269920427622'],[365,'0.934579439252336448598131'],[366,'0.934406215905647609111098'],[1896,'0.703664049072695322191064']])('discounts actual/365 for %i days without binary financial arithmetic',(days,want)=>{
  expect(discounts.discountActual365('0.07',days)?.toString(24)).toBe(want)
 })
 it('matches an independent Decimal forecast, stub, reinvestment and equity bridge vector',()=>{
  const{result,diagnostics}=run();expect(diagnostics).toEqual([]);expect(result.status).toBe('calculated')
  const s=result.scenarios.find(s=>s.id==='base')
  expect(s.forecastRows).toHaveLength(6);expect(s.forecastRows.map(r=>r.fcff)).toEqual(Array(6).fill('140'))
  expect(s.h2.fcff).toBe('80');expect(s.h2.h1FCFF).toBe('60')
  expect(s.discountRows[0].cashFlow).toBe('30.434782608695652173913043')
  expect(s.discountRows[0].presentValue).toBe('30.042423154290823665188488')
  expect(s.presentFCFF).toBe('596.588723351231859064003201')
  expect(s.terminal.nextNOPAT).toBe('153');expect(s.terminal.reinvestment).toBe('15.3');expect(s.terminal.fcff).toBe('137.7')
  expect(s.terminal.presentValue).toBe('1937.890791146202917314189415')
  expect(s.enterpriseValue).toBe('2534.479514497434776378192616')
  expect(s.equityValue).toBe('2425.640258699865211783851615');expect(s.perShareValue).toBe('242.564025869986521178385162')
  expect(s.bridgeRows.find(r=>r.id.endsWith('cash-roll')).value).toBe('44.608695652173913043478261')
  expect(result.forecasts).toHaveLength(18);expect(result.discountRows).toHaveLength(18)
  expect(result.sensitivities.waccGrowth.rows).toHaveLength(2)
  expect(result.sensitivities.beta).toHaveLength(2);expect(result.sensitivities.cash).toHaveLength(2);expect(result.sensitivities.financialPB).toHaveLength(2)
 })
 it('keeps assumption values separate from verified facts and emits only real evidence IDs for renderers',()=>{
  const{result}=run();expect(result.assumptions.find(p=>p.id==='other-cash')).toMatchObject({kind:'assumption',value:'0'})
  expect(result.scenarios[0].sourceRefs).toContain('research-basis')
  expect(result.scenarios[0].sourceRefs).not.toContain('margin')
  expect(result.currentPrice.asOf).toBe('2026-10-22');expect(result.rating).toBeNull()
  expect(result.operatingBoundary.usesOperatingProfitProxy).toBe(true)
 })
 it.each([
  ['missing baseline cash input',f=>{delete f.packet.dcf.baseFY.daRef},'DCF_BASE'],
  ['unverified underlying fact',f=>{f.facts.find(x=>x.id==='base-revenue').status='invalid'},'DCF_REF'],
  ['unexplained future assumption',f=>{parameter(f,'margin').reason=''},'DCF_PARAMETER'],
  ['assumption without traceable evidence',f=>{parameter(f,'margin').refs=['missing']},'DCF_PARAMETER'],
  ['number instead of decimal string',f=>{parameter(f,'margin').value=0.2},'DCF_PARAMETER'],
  ['missing sixth driver year',f=>{f.packet.dcf.scenarios[0].drivers.pop()},'DCF_FORECAST'],
  ['duplicated scenario',f=>{f.packet.dcf.scenarios[0].id='base'},'DCF_SCHEMA'],
  ['future valuation date',f=>{f.packet.dcf.valuationAsOf='2026-10-24'},'DCF_DATE'],
  ['duplicated country risk',f=>{f.packet.dcf.wacc.countryRiskRef='erp'},'DCF_WACC'],
  ['growth without reinvestment capacity',f=>{parameter(f,'roic').value='0.01'},'DCF_TERMINAL'],
  ['terminal growth above WACC',f=>{parameter(f,'g').value='0.08'},'DCF_TERMINAL'],
  ['already attributed cash flow with second NCI deduction',f=>{f.facts.find(x=>x.id==='nci').normalizedValue='5'},'DCF_OWNERSHIP'],
  ['financial cash double count',f=>{f.packet.dcf.bridge.cashBasis='nonfinancial-consolidated'},'DCF_CASH'],
  ['financial customer deposits used as debt',f=>{f.packet.dcf.bridge.debtBasis='financial-customer-deposits'},'DCF_DEBT'],
  ['stale share capital',f=>{f.facts.find(x=>x.id==='shares').period='2026-06-30'},'DCF_SHARES'],
  ['stale price',f=>{f.facts.find(x=>x.id==='price').asOf='2026-10-21T15:00:00+08:00'},'DCF_PRICE'],
  ['implicit zero post balance cash',f=>{delete f.packet.dcf.bridge.postBalanceCashRef},'DCF_CASH'],
  ['cash parameter with no valuation date',f=>{delete parameter(f,'other-cash').asOf},'DCF_CASH'],
  ['unknown model keys that could hide failed data ingestion',f=>{f.packet.dcf.fcff=['999']},'DCF_SCHEMA'],
  ['pure financial company using industrial FCFF',f=>{f.packet.dcf.businessType='financial'},'DCF_METHOD'],
  ['missing required beta sensitivity',f=>{delete f.packet.dcf.sensitivities.betaRefs},'DCF_SENSITIVITY'],
  ['model and packet valuation date disagree',f=>{f.packet.valuationAsOf='2026-10-21'},'DCF_DATE'],
  ['missing mixed operating boundary',f=>{delete f.packet.dcf.operatingBoundary},'DCF_BOUNDARY'],
  ['raw financial operations called industrial',f=>{f.packet.dcf.operatingBoundary.kind='non-financial'},'DCF_BOUNDARY'],
  ['single quarter passed as annual baseline',f=>{f.facts.find(x=>x.id==='base-revenue').period='2025Q4'},'DCF_BASE_PERIOD'],
  ['ambiguous standalone third quarter used as YTD',f=>{for(const x of f.facts.filter(x=>x.id.startsWith('interim-')))x.period='2026Q3';f.packet.dcf.interim.end='2026-09-30';f.packet.financialAsOf='2026-09-30'},'DCF_BASE_PERIOD'],
  ['unsupported noncalendar financial year',f=>{f.packet.dcf.baseFY.end='2025-06-30'},'DCF_BASE_PERIOD'],
  ['research parameter masquerading as a quote',f=>{f.packet.dcf.parameters.push({id:'assumed-price',value:'100',unit:'CNY_per_share',kind:'assumption',reason:'价格估计。',refs:['research-basis'],asOf:'2026-10-22'});f.packet.dcf.bridge.priceRef='assumed-price'},'DCF_PRICE'],
  ['research parameter masquerading as official issued shares',f=>{f.packet.dcf.parameters.push({id:'assumed-shares',value:'10',unit:'shares',kind:'assumption',reason:'股数估计。',refs:['research-basis'],asOf:'2026-10-22'});f.packet.dcf.bridge.sharesRef='assumed-shares'},'DCF_SHARES'],
  ['group NCI deducted again after separately attributed financial NAV',f=>{parameter(f,'owner').value='1';f.packet.dcf.bridge.ownershipMode='enterprise-minus-nci';f.facts.find(x=>x.id==='nci').normalizedValue='5'},'DCF_OWNERSHIP'],
  ['same-period arbitrary sum used as D&A',f=>{f.calculations.push({id:'fake-da',status:'calculated',op:'sum',metric:'sum',inputs:['base-revenue','base-revenue'],value:'2000',unit:'CNY',scope:'合并',period:'FY2025'});f.packet.dcf.baseFY.daRef='fake-da'},'DCF_BASE_METRIC'],
  ['same-date cash plus assets masquerading as cash',f=>{f.calculations.push({id:'fake-cash',status:'calculated',op:'sum',metric:'sum',inputs:['cash','assets'],value:'60',unit:'CNY',scope:'母公司',period:'2026-06-30'});f.packet.dcf.bridge.cashRef='fake-cash'},'DCF_BRIDGE_METRIC'],
  ['two separate disclosures of the same complete revenue added together',f=>{f.facts.push({...f.facts.find(x=>x.id==='base-revenue'),id:'second-revenue',sourceId:'another-source'});f.calculations.push({id:'fake-total',status:'calculated',op:'sum',metric:'sum',inputs:['base-revenue','second-revenue'],value:'2000',unit:'CNY',scope:'合并',period:'FY2025'});f.packet.dcf.baseFY.revenueRef='fake-total'},'DCF_BASE_METRIC'],
  ['standalone quarter leaf hidden by a cumulative calculation label',f=>{const row=f.facts.find(x=>x.id==='interim-revenue');row.period='2026Q3';row.periodBasis='standalone';f.calculations.push({id:'fake-ytd',status:'calculated',op:'sum',metric:'sum',inputs:['interim-revenue','zero'],value:'500',unit:'CNY',scope:'合并',period:'2026Q3',periodBasis:'cumulative'},{id:'zero',status:'calculated',op:'difference',metric:'difference',inputs:['interim-depreciationAmortization','interim-depreciationAmortization'],value:'0',unit:'CNY',scope:'合并',period:'2026Q3'});f.packet.dcf.interim.revenueRef='fake-ytd';f.packet.dcf.interim.end='2026-09-30';f.packet.financialAsOf='2026-09-30'},'DCF_BASE_METRIC'],
  ['reported operating profit asserted as pure EBIT without a proxy boundary',f=>{f.packet.dcf.businessType='non-financial';f.packet.dcf.bridge.financialEntities=[];f.packet.dcf.operatingBoundary.kind='non-financial'},'DCF_BOUNDARY'],
  ['quote metadata disagrees with its source security',f=>{f.facts.find(x=>x.id==='price').evidence.quote=f.facts.find(x=>x.id==='price').evidence.quote.replace('SYNTHETIC','OTHER')},'DCF_PRICE'],
  ['adjusted source close passed off as current raw quote',f=>{f.facts.find(x=>x.id==='price').evidence.quote+='\n前复权价格'},'DCF_PRICE'],
 ])('blocks %s',(_name,mutate,code)=>{
  const f=createForecastDcfFixture();mutate(f);const{result,diagnostics}=run(f)
  expect(result.status).toBe('blocked');expect(result.scenarios).toEqual([]);expect(diagnostics.map(d=>d.code)).toContain(code)
 })
 it('validates synthetic source bytes before consuming the returned facts and observations',async()=>{
  const f=createForecastDcfFixture(),root=await mkdtemp(join(tmpdir(),'forecast-dcf-v5-'))
  try{await writeFile(join(root,'v5-source.txt'),f.sourceText);const checked=await validatePacket(f.packet,{root});expect(checked.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(checked.ok).toBe(true);const diagnostics=[],result=module.runForecastDCF(f.packet,checked.facts,[],diagnostics,checked.observations);expect(diagnostics).toEqual([]);expect(result.status).toBe('calculated');expect(result.scenarios[1].perShareValue).toBe('242.564025869986521178385162')}finally{await rm(root,{recursive:true,force:true})}
 })
 it('models an annual-only latest disclosure without fabricating missing interim facts',()=>{
  const f=createForecastDcfFixture();delete f.packet.dcf.interim;f.packet.financialAsOf='2025-12-31'
  for(const row of f.facts.filter(row=>['cash','debt','assets','nci','nav'].includes(row.id)))row.period='2025-12-31'
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.status).toBe('calculated');expect(result.scenarios[0].h2.h1FCFF).toBe('0');expect(result.scenarios[0].h2.basis).toBe('empty-year-to-date-interval');expect(result.scenarios[0].h2.fcff).toBe('140')
 })
 it('solves only future constant revenue growth against the same valuation price',()=>{
  const{result}=run();const reverse=result.sensitivities.reverseGrowth
  expect(reverse.status).toBe('calculated');expect(reverse.isConsensus).toBe(false)
  expect(reverse.constantRevenueGrowth).toMatch(/^-0\./);expect(reverse.residualPerShare).toMatch(/^-?0\.0{10}/)
 })
 it('reports an unbracketed reverse case as unavailable rather than inventing a root',()=>{
  const f=createForecastDcfFixture();parameter(f,'reverse-low').value='0.1';parameter(f,'reverse-high').value='0.3'
  const{result}=run(f);expect(result.status).toBe('calculated');expect(result.sensitivities.reverseGrowth).toMatchObject({status:'unavailable',code:'NO_BRACKET'})
 })
 it('retains exact evaluated endpoints for an unavailable reverse range without changing its scenario or inventing a root',()=>{
  const f=createForecastDcfFixture();parameter(f,'reverse-low').value='0.1';parameter(f,'reverse-high').value='0.3'
  const{result,diagnostics}=run(f),reverse=result.sensitivities.reverseGrowth
  expect(diagnostics).toEqual([]);expect(reverse).toMatchObject({status:'unavailable',code:'NO_BRACKET',lowerGrowth:'0.1',upperGrowth:'0.3',price:'100',isConsensus:false})
  expect(reverse.fixedAssumptions).toContain('首个预测年保持原情景');expect(reverse.constantRevenueGrowth).toBeUndefined()
  expect(result.scenarios.find(s=>s.id==='base').perShareValue).toBe('242.564025869986521178385162')
  // Independent public model inputs express the same two endpoint scenarios:
  // the first year is unchanged; only subsequent years use constant growth.
  for(const [growth,field]of[['0.1','lowerPerShareValue'],['0.3','upperPerShareValue']]){
   const endpoint=createForecastDcfFixture();endpoint.packet.dcf.reverseGrowth.requested=false
   endpoint.packet.dcf.parameters.push({id:'endpoint-growth',value:growth,unit:'ratio',kind:'assumption',reason:'受控测试端点，非市场预期。',refs:['research-basis']})
   endpoint.packet.dcf.scenarios.find(s=>s.id==='base').drivers.slice(1).forEach(row=>row.volumeGrowthRef='endpoint-growth')
   const calculated=run(endpoint);expect(calculated.diagnostics).toEqual([])
   expect(reverse[field]).toBe(calculated.result.scenarios.find(s=>s.id==='base').perShareValue)
  }
 })
 it('rolls official issued shares forward only by dated verified share-count events',()=>{
  const f=createForecastDcfFixture();f.facts.find(x=>x.id==='shares').period='2026-06-30'
  f.facts.push({id:'cancelled',metric:'sharesChange',period:'2026-08-31',scope:'合并',status:'verified',normalizedValue:'-1',normalizedUnit:'shares'})
  f.packet.dcf.bridge.shareRollForward={events:[{date:'2026-08-31',deltaRef:'cancelled'}],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'已核对公告范围，仍受未披露事件限制。'}
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.shares.value).toBe('9');expect(result.shares.sourceDate).toBe('2026-06-30');expect(result.shares.sourceRefs).toContain('cancelled');expect(result.shares.kind).toBe('rolled-forward-reported')
  expect(result.scenarios[0].perShareValue).toBe('269.515584299985023531539068');expect(result.shares.coverageNote).toContain('不证明')
 })
 it('negates a positive reported cancellation count without falsifying its source sign',()=>{
  const f=createForecastDcfFixture();f.facts.find(x=>x.id==='shares').period='2026-06-30'
  f.facts.push({id:'cancelled',metric:'sharesCancelled',period:'2026-08-31',scope:'合并',status:'verified',normalizedValue:'1',normalizedUnit:'shares'})
  f.packet.dcf.bridge.shareRollForward={events:[{date:'2026-08-31',deltaRef:'cancelled'}],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'复核已披露注销数量。'}
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.shares.value).toBe('9');expect(result.shares.events[0].delta).toBe('-1')
 })
 it('accepts positive issued shares as an addition to the official source capital',()=>{
  const f=createForecastDcfFixture();f.facts.find(x=>x.id==='shares').period='2026-06-30'
  f.facts.push({id:'issued',metric:'sharesIssued',period:'2026-08-31',scope:'合并',status:'verified',normalizedValue:'2',normalizedUnit:'shares'})
  f.packet.dcf.bridge.shareRollForward={events:[{date:'2026-08-31',deltaRef:'issued'}],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'复核已披露新增股数。'}
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.shares.value).toBe('12')
 })
 it('blocks arbitrary baseline arithmetic after real source verification and calculation',async()=>{
  const f=createForecastDcfFixture(),root=await mkdtemp(join(tmpdir(),'forecast-dcf-provenance-'))
  f.packet.calculations=[{id:'fake-da',op:'sum',inputs:['base-revenue','base-revenue']}];f.packet.dcf.baseFY.daRef='fake-da'
  try{await writeFile(join(root,'v5-source.txt'),f.sourceText);const checked=await validatePacket(f.packet,{root});expect(checked.ok).toBe(true);const diagnostics=[],calcs=runCalculations(f.packet,checked.facts,diagnostics);expect(calcs[0].status).toBe('calculated');const result=module.runForecastDCF(f.packet,checked.facts,calcs,diagnostics,checked.observations);expect(result.status).toBe('blocked');expect(diagnostics.map(d=>d.code)).toContain('DCF_BASE_METRIC')}finally{await rm(root,{recursive:true,force:true})}
 })
 it('verifies a positive original cancellation count before applying its negative model effect',async()=>{
  const f=createForecastDcfFixture(),root=await mkdtemp(join(tmpdir(),'forecast-dcf-cancellation-'))
  const shares=f.packet.facts.find(row=>row.id==='shares'),oldQuote=shares.evidence.quote
  shares.period='2026-06-30';shares.evidence.periodText='2026-06-30';shares.evidence.quote=oldQuote.replaceAll('2026-10-22','2026-06-30');f.sourceText=f.sourceText.replace(oldQuote,shares.evidence.quote)
  const start=f.sourceText.split('\n').length,quote='范围：合并\n单位：股\n指标\t2026-08-31\n本次注销股份数量\t1';f.sourceText+=quote+'\n'
  f.packet.facts.push({id:'cancelled',metric:'sharesCancelled',period:'2026-08-31',value:'1',unit:'shares',scope:'合并',sourceId:f.packet.sources[0].id,evidence:{quote,locator:{lineStart:start,lineEnd:start+3,valueLine:start+3,column:2},metricText:'本次注销股份数量',periodText:'2026-08-31',scopeText:'合并',unitText:'股',valueText:'1'}})
  f.packet.sources[0].sha256=createHash('sha256').update(f.sourceText).digest('hex');f.packet.dcf.bridge.shareRollForward={events:[{date:'2026-08-31',deltaRef:'cancelled'}],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'虚构公告原文注销一股，程序取负；覆盖声明不证明不存在未披露事件。'}
  try{await writeFile(join(root,'v5-source.txt'),f.sourceText);const checked=await validatePacket(f.packet,{root});expect(checked.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(checked.ok).toBe(true);const diagnostics=[],result=module.runForecastDCF(f.packet,checked.facts,[],diagnostics,checked.observations);expect(diagnostics).toEqual([]);expect(result.shares.value).toBe('9');expect(checked.facts.find(x=>x.id==='cancelled').normalizedValue).toBe('1')}finally{await rm(root,{recursive:true,force:true})}
 })
 it('rejects a cancellation event already included in the source share count',()=>{
  const f=createForecastDcfFixture();f.facts.find(x=>x.id==='shares').period='2026-06-30'
  f.facts.push({id:'cancelled',metric:'sharesChange',period:'2026-05-31',scope:'合并',status:'verified',normalizedValue:'-1',normalizedUnit:'shares'})
  f.packet.dcf.bridge.shareRollForward={events:[{date:'2026-05-31',deltaRef:'cancelled'}],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'公告复核。'}
  const{result,diagnostics}=run(f);expect(result.status).toBe('blocked');expect(diagnostics.map(d=>d.code)).toContain('DCF_SHARES')
 })
 it('preserves explicit review coverage when the reported share count has no known later events',()=>{
  const f=createForecastDcfFixture();f.facts.find(x=>x.id==='shares').period='2026-06-30'
  f.packet.dcf.bridge.shareRollForward={events:[],reviewRefs:['research-basis'],reviewedThrough:'2026-10-22',reason:'已核对可获得的公告，未发现需量化的后续股数事件；不证明没有未披露事项。'}
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.shares.value).toBe('10');expect(result.shares.events).toEqual([]);expect(result.shares.coverageNote).toContain('不证明')
 })
 it('computes a base reserve ratio separately from each scenario first-year revenue',()=>{
  const f=createForecastDcfFixture();parameter(f,'reserve').value='0.05';parameter(f,'reserve').unit='ratio'
  f.packet.dcf.parameters.push({id:'bull-volume',value:'0.1',unit:'ratio',kind:'assumption',reason:'虚构乐观增长情景。',refs:['research-basis']});f.packet.dcf.scenarios[2].drivers[0].volumeGrowthRef='bull-volume'
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([])
  expect(result.scenarios[1].bridgeRows.find(r=>r.id==='base-reserve').value).toBe('-50')
  expect(result.scenarios[2].bridgeRows.find(r=>r.id==='bull-reserve').value).toBe('-55')
  expect(result.scenarios[1].perShareValue).toBe('237.564025869986521178385162')
 })
 it('accepts a controlled complete EBIT proxy instead of treating every calculation as a metric',()=>{
  const f=createForecastDcfFixture(),components=[['cost','costOfRevenue','700'],['taxes','taxesAndSurcharges','10'],['selling','sellingExpenses','30'],['admin','administrativeExpenses','40'],['research','researchExpenses','20']]
  for(const[id,metric,value]of components)f.facts.push({id,metric,period:'FY2025',scope:'合并',status:'verified',normalizedValue:value,normalizedUnit:'CNY'})
  f.packet.calculations=[{id:'gross',op:'grossProfit',inputs:['base-revenue','cost']},{id:'expenses',op:'sum',inputs:['taxes','selling','admin','research']},{id:'ebit-proxy',op:'difference',inputs:['gross','expenses']}]
  f.packet.dcf.baseFY.ebitRef='ebit-proxy';const ds=[];f.calculations=runCalculations(f.packet,f.facts,ds);expect(ds).toEqual([])
  const{result,diagnostics}=run(f);expect(diagnostics).toEqual([]);expect(result.scenarios[0].perShareValue).toBe('242.564025869986521178385162')
 })
 it('does not reuse elapsed H2 cash as a future discounted flow',()=>{
  const{result}=run();const s=result.scenarios[0]
  expect(s.discountRows.map(r=>r.period)).toEqual(['2026-stub','2027','2028','2029','2030','2031'])
  expect(s.discountRows[0].days).toBe(70);expect(s.h2.elapsedDays).toBe(114);expect(s.h2.totalDays).toBe(184)
 })
})
