import {describe,expect,it} from 'vitest'
import {publicationMetadata} from '../skills/ework-equity-research/scripts/lib/publication.mjs'
import {renderReport,validateReport} from '../skills/ework-equity-research/scripts/lib/report.mjs'
import {publicationTargetCount} from '../skills/ework-equity-research/scripts/lib/publication-layout.mjs'

function fixture(){
 const refs=['financial'],sources=[{id:'disclosure',title:'正式财务披露',kind:'text-snapshot'},{id:'quotes',title:'行情及基准快照',kind:'text-snapshot'},{id:'discount-source',title:'估值参数来源',kind:'text-snapshot'}]
 const facts=[['financial','revenue','CNY','1000000000','disclosure'],['quote','currentPrice','CNY_per_share','25','quotes'],['risk-free','riskFree','ratio','0.03','discount-source']].map(([id,metric,normalizedUnit,normalizedValue,sourceId])=>({id,metric,normalizedUnit,normalizedValue,sourceId,period:'FY2025',scope:'合并',status:'verified',evidence:{locator:{page:1}}}))
 const forecastRows=['FY2027','FY2028','FY2029','FY2030','FY2031','FY2032'].map(period=>({id:period,period,end:period.slice(2)+'-12-31',revenueGrowth:'0.05',volumeGrowth:'0.03',priceMixGrowth:'0.0194174757281553',revenue:'1200000000',ebitMargin:'0.2',ebit:'240000000',tax:'0.25',nopat:'180000000',da:'20000000',capex:'30000000',nwc:'120000000',deltaNWC:'5000000',fcff:'165000000',fcffOwners:'156750000',sourceRefs:refs}))
 const scenarios=['bear','base','bull'].map(id=>({id,status:'calculated',reason:'以核验经营事实构造研究假设。',forecastRows,h2:null,discountRows:forecastRows.map(r=>({id:r.id,period:r.period,end:r.end,cashFlow:r.fcffOwners,timeYears:'1.25',days:'456',discountFactor:'0.9',presentValue:'141075000',sourceRefs:refs})),terminal:{nextNOPAT:'190000000',reinvestmentRate:'0.2',reinvestment:'38000000',fcff:'152000000',undiscounted:'2500000000',presentValue:'1800000000',valueShare:'0.68',sourceRefs:refs},presentFCFF:'846450000',enterpriseValue:'2646450000',ownersOperatingValue:'2514127500',equityValue:'2614152500',perShareValue:'26.141525',priceReturn:'0.045661',bridgeRows:[{id:'operating',label:'归属经营价值',value:'2514127500',unit:'CNY',kind:'calculated',role:'operating-value',sourceRefs:refs},{id:'cash',label:'超额现金',value:'100000000',unit:'CNY',kind:'reported',role:'adjustment',sourceRefs:refs},{id:'small',label:'小额权益调整',value:'25000',unit:'CNY',kind:'assumption',role:'adjustment',sourceRefs:refs}],sourceRefs:refs}))
 const dcf={method:'driver-fcff-v2',status:'calculated',rating:null,currency:'CNY',asOf:'2026-10-23',valuationAsOf:'2026-10-22',financialAsOf:'2026-06-30',wacc:{value:'0.085',riskFree:'0.03',beta:'1.1',erp:'0.05',debtWeight:'0',debtCost:'0.04',tax:'0.25',formula:'WACC = equity cost × equity weight + after-tax debt cost × debt weight',sourceRefs:['risk-free']},assumptions:[{id:'margin',label:'经营利润率',value:'0.2',unit:'ratio',kind:'assumption',reason:'研究判断，非公司指引。',refs}],scenarios,currentPrice:{value:'25',asOf:'2026-10-22',sourceRefs:['quote']},shares:{value:'100000000',asOf:'2026-06-30',sourceRefs:refs},limitations:['情景估值不构成收益承诺。'],sensitivities:{waccGrowth:{growthRates:['0.02','0.03'],rows:[{wacc:'0.08',perShareValues:['28.25','31.5'],sourceRefs:refs},{wacc:'0.09',perShareValues:['24.75','27.25'],sourceRefs:refs}]},beta:[{beta:'0.9',wacc:'0.075',perShareValue:'29',sourceRefs:refs},{beta:'1.1',wacc:'0.085',perShareValue:'26.141525',sourceRefs:refs}],cash:[{cashShift:'-10000000',perShareValue:'26.041525',sourceRefs:refs},{cashShift:'10000000',perShareValue:'26.241525',sourceRefs:refs}],financialPB:[{multiple:'0.8',perShareValue:'25',sourceRefs:refs},{multiple:'1.2',perShareValue:'27',sourceRefs:refs}],reverseGrowth:{status:'not-requested',reason:'本次未请求受控反向增长求解。'}}}
 const marketRows=[{date:'2025-10-22',stock:'20',benchmark:'4000',stockNormalized100:'100',benchmarkNormalized100:'100',stockRefs:['quote'],benchmarkRefs:['quote']},{date:'2026-04-22',stock:'22',benchmark:'4200',stockNormalized100:'110',benchmarkNormalized100:'105',stockRefs:['quote'],benchmarkRefs:['quote']},{date:'2026-10-22',stock:'25',benchmark:'4400',stockNormalized100:'125',benchmarkNormalized100:'110',stockRefs:['quote'],benchmarkRefs:['quote']}]
 const market={status:'calculated',valuationAsOf:'2026-10-22',windowStart:'2025-10-22',windowEnd:'2026-10-22',priceBasis:'unadjusted-price',benchmark:{name:'市场基准',ticker:'000300.SH'},currency:'CNY',rows:marketRows,monthly:marketRows,stockReturn:'0.25',benchmarkReturn:'0.1',excessPercentagePoints:'15',relativeReturn:'0.1363636363636364',sourceRefs:['quote'],limitations:['未复权价格回报不含现金股息。'],dividends:[],coverage:{commonTradingDays:243,fullYear:true,startBoundaryDays:0,endBoundaryDays:0},statistics:{beta:null,rSquared:null}}
 const quarterly={status:'calculated',latest:'2026Q2',quarters:['2025Q3','2025Q4','2026Q1','2026Q2'].map(period=>({period,revenue:'300000000',parentNetIncome:'60000000',operatingCashFlow:null,revenueYoY:'0.05',parentNetIncomeYoY:'-0.02',sourceRefs:refs})),sourceRefs:refs,disclosureSearch:{asOf:'2026-10-23',note:'已检索研究截止日之前正式披露。',refs}}
 const packet={company:{name:'示例股份有限公司',ticker:'600000.SH'},asOf:'2026-10-23',financialAsOf:'2026-06-30',sources,report:{profile:'brief',title:'经营质量与情景价值',publication:{companyShortName:'示例公司',reportType:'公司深度研究与DCF情景估值报告'},summary:[{text:'经营质量仍需验证。',refs}],sections:[{kind:'performance',title:'经营观察',paragraphs:[{text:'以正式披露为准。',refs}]}]}}
 return {packet,validation:{ok:true,facts,observations:[],diagnostics:[]},calculation:{ok:true,calculations:[],dcf,market,quarterly,diagnostics:[]}}
}
function fullFixture(){
 const f=fixture();f.packet.schemaVersion=2;f.packet.report.profile='full'
 f.packet.report.sections=['business','industry','performance','profitability','balance','cashflow','forecast','valuation','risks','monitoring'].map(kind=>({kind,status:'supported',title:'研究专题',paragraphs:[{text:'依据已经核验的正式披露。',refs:['financial']}]}))
 f.packet.report.theses=[{statement:'经营质量需要验证。',inference:'披露不等同价值。',assumption:'研究假设仍需跟踪。',falsifier:'经营方向改变。',monitoring:'持续核对正式披露。',evidenceRefs:['financial']}]
 f.calculation.dcf.sensitivities.reverseGrowth={status:'unavailable',code:'NO_BRACKET',reason:'显式区间内无可行根。',sourceRefs:['financial']}
 return f
}

describe('V5 deep research publication',()=>{
 it('retains the disclosed financial basis in the formal deep-report filename',()=>{
  const packet={company:{name:'示例股份有限公司',ticker:'600000.SH'},asOf:'2026-10-23',financialAsOf:'2026-06-30',report:{profile:'full',publication:{companyShortName:'示例公司',reportType:'公司深度研究与DCF情景估值报告'}}}
  expect(publicationMetadata(packet)).toMatchObject({financialPeriodLabel:'2026中报',reportName:'示例公司（600000.SH）2026中报公司深度研究与DCF情景估值报告',fileStem:'示例公司（600000.SH）2026中报公司深度研究与DCF情景估值报告_2026-10-23'})
 })
 it('automatically publishes all successful driver forecasts, discounting, bridges and sensitivity results with real navigation',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  for(const anchor of ['section-dcf-assumptions','section-dcf-forecast','section-dcf-discount','section-dcf-terminal','section-dcf-owner-bridge','section-dcf-sensitivity','section-dcf-reverse','section-market-year','section-quarterly-actuals']){
   expect(html).toContain(`id="${anchor}"`);expect(html).toContain(`data-publication-target="${anchor}"`)
  }
  for(const text of ['FY2032','经营利润率','折现系数','终值占企业价值','权益价值','WACC','Beta','金融资产PB','本次未请求受控反向增长求解。'])expect(html).toContain(text)
  expect(html).not.toContain('手工预测假设');expect(html).not.toContain('本次未运行估值模型')
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]),targets=[...html.matchAll(/data-publication-target="([^"]+)"/g)].map(m=>m[1])
  expect(new Set(ids).size).toBe(ids.length);expect(new Set(targets).size).toBe(targets.length);expect(targets.every(id=>ids.includes(id))).toBe(true)
  expect(publicationTargetCount(f.packet,f.validation.facts,new Map(),f.calculation,0)).toBe(targets.length)
 })
 it('keeps dated market prices, price return and quarterly actuals separate from financial and valuation bases',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('一年股价与基准表现');expect(html).toContain('2025-10-22');expect(html).toContain('2026-10-22');expect(html).toContain('起点 = 100')
  expect(html).toContain('15.00 个百分点');expect(html).toContain('未复权价格回报不含现金股息。');expect(html).toContain('2025Q3');expect(html).toContain('2026Q2');expect(html).toContain('-2.00%')
  const cover=html.split('<header class="publication-cover">')[1].split('</header>')[0]
  expect(cover).toContain('财务披露基期');expect(cover).toContain('估值基准日');expect(cover).toContain('估值参数来源');expect(cover).toContain('href="#source-discount-source"')
  expect(cover).not.toContain('小额权益调整')
 })
 it('shows every signed owner adjustment with a zero-origin value bridge and readable small amounts',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('小额权益调整');expect(html).toContain('2.50 万元');expect(html).toContain('data-chart-kind="value-bridge"');expect(html).toContain('data-zero-origin="true"')
  expect(html).toContain('href="#source-disclosure"');expect(html).toContain('href="#source-quotes"');expect(html).toContain('href="#source-discount-source"');expect(html).not.toContain('[0]')
 })
 it('retains the legacy report path when no driver valuation or validated market series exists',()=>{
  const f=fixture();delete f.calculation.dcf;delete f.calculation.market;delete f.calculation.quarterly
  f.packet.report.publication.reportType='公司研究简报'
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('本次未运行估值模型');expect(html).not.toContain('section-dcf-forecast');expect(html).not.toContain('section-market-year');expect(html).not.toContain('section-quarterly-actuals')
 })
 it('reuses calculated model tokens in prose and traces their original sources',()=>{
  const f=fixture();f.packet.report.summary=[{text:'股价回报{{market.stockReturn}}，超额{{market.excessPercentagePoints}}，季度收入{{quarter.2026Q2.revenue}}，基准模型值{{dcf.base.perShareValue}}。'}]
  expect(validateReport(f.packet,f.validation,f.calculation)).toEqual([])
  const html=renderReport(f.packet,f.validation,f.calculation),summary=html.split('<div class="summary">')[1].split('</div>')[0]
  expect(summary).toContain('股价回报25.00%');expect(summary).toContain('超额15.00 个百分点');expect(summary).toContain('季度收入3.00 亿元');expect(summary).toContain('基准模型值26.14 元/股')
  expect(summary).toContain('href="#source-quotes"');expect(summary).toContain('href="#source-disclosure"')
 })
 it('shows a full-scope V5 report with an explicit method gap as incomplete',()=>{
  const f=fixture();f.packet.schemaVersion=2;f.packet.report.profile='full'
  f.packet.report.sections=['business','industry','performance','profitability','balance','cashflow','forecast','valuation','risks','monitoring'].map(kind=>({kind,status:'supported',title:'研究专题',paragraphs:[{text:'依据已经核验的正式披露。',refs:['financial']}]}))
  f.packet.report.theses=[{statement:'经营质量需要验证。',inference:'披露不等同价值。',assumption:'研究假设仍需跟踪。',falsifier:'经营方向改变。',monitoring:'持续核对正式披露。',evidenceRefs:['financial']}]
  f.packet.methodGap={method:'替代估值',reason:'适用方法仍需实现。',missing:'替代估值实现尚未完成。',impact:'不能称为完整估值研究。',nextStep:'补充适用方法与实现。',refs:['financial']}
  f.calculation.dcf.sensitivities.reverseGrowth={status:'unavailable',code:'NO_BRACKET',reason:'显式区间内无可行根。',sourceRefs:['financial']}
  const html=renderReport(f.packet,f.validation,f.calculation),cover=html.split('<header class="publication-cover">')[1].split('</header>')[0]
  expect(cover).toContain('研究稿 · 存在资料缺口');expect(cover).not.toContain('完整研究稿 · 需复核');expect(cover).toContain('替代估值实现尚未完成。')
 })
 it('keeps daily market facts in machine evidence instead of expanding the financial appendix',()=>{
  const f=fixture();f.validation.facts.push({id:'daily-market-sentinel',metric:'currentPrice',period:'2026-10-22',scope:'市场',status:'verified',sourceId:'quotes',normalizedUnit:'CNY_per_share',normalizedValue:'25'})
  const html=renderReport(f.packet,f.validation,f.calculation),appendix=html.split('<section id="fact-evidence">')[1].split('<section id="calculation-evidence">')[0]
  expect(appendix).not.toContain('daily-market-sentinel');expect(html).toContain('href="calculations.json"')
 })
 it('publishes controlled reverse-growth roots and actual remaining-period cash splits',()=>{
  const f=fixture();f.calculation.dcf.sensitivities.reverseGrowth={status:'calculated',constantRevenueGrowth:'-0.035',perShareValue:'25',price:'25',residualPerShare:'0.000000000001',iterations:42,isConsensus:false,fixedAssumptions:'固定其他经营率、折现和价值桥假设。',lowerGrowth:'-0.2',upperGrowth:'0.2',sourceRefs:['financial']}
  f.calculation.dcf.scenarios[1].h2={period:'2026H2',end:'2026-12-31',basis:'annual-less-reported-ytd',revenue:'200000000',nopat:'40000000',da:'2000000',capex:'3000000',deltaNWC:'1000000',h1FCFF:'60000000',fcff:'38000000',fcffOwners:'36100000',elapsedDays:114,remainingDays:70,totalDays:184,elapsedCashAccumulation:'22364130.4347826087',remainingStubCashFlow:'14456521.7391304348',sourceRefs:['financial']}
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('现价隐含常量收入增长');expect(html).toContain('-3.50%');expect(html).toContain('0.000000000001 元/股');expect(html).toContain('固定其他经营率、折现和价值桥假设。');expect(html).toContain('非一致预期')
  expect(html).toContain('已过区间现金积累');expect(html).toContain('未来余期现金流');expect(html).toContain('2026H2')
 })
 it('uses the calculated one-year market miniature on a full V2 cover and counts its real navigation target',()=>{
  const f=fullFixture(),html=renderReport(f.packet,f.validation,f.calculation),cover=html.split('<header class="publication-cover">')[1].split('</header>')[0]
  expect(cover).toContain('class="cover-market-chart"');expect(cover).toContain('data-chart-kind="market-thumbnail"')
  expect(cover).toContain('一年股价与基准表现');expect(cover).toContain('viewBox="0 0 280 170"');expect(cover.match(/<polyline /g)).toHaveLength(2)
  expect(cover).not.toContain('历史年度收入与归母净利润')
  expect(html).toContain('id="section-market-year"')
  expect(publicationTargetCount(f.packet,f.validation.facts,new Map(),f.calculation,0)).toBe([...html.matchAll(/data-publication-target=/g)].length)
 })
 it('limits cover financial citations to displayed basic facts and uses one formal subtitle',()=>{
  const f=fullFixture();f.packet.sources.push({id:'financial-detail',title:'未在封面展示的报表分项',kind:'text-snapshot'})
  f.validation.facts.push({id:'unused-financial-ref',metric:'tradePayables',period:'2026H1',scope:'合并',status:'verified',sourceId:'financial-detail',normalizedUnit:'CNY',normalizedValue:'123000000'})
  const html=renderReport(f.packet,f.validation,f.calculation),cover=html.split('<header class="publication-cover">')[1].split('</header>')[0],basis=cover.split('<div class="cover-basis">')[1].split('估值基准日')[0],subtitle=cover.split('<div class="cover-subtitle">')[1].split('</div>')[0]
  expect(basis).not.toContain('source-financial-detail');expect(html).toContain('id="source-financial-detail"')
  expect(subtitle.match(/公司深度研究与DCF情景估值报告/g)).toHaveLength(1)
 })
 it('balances six forecast years across readable tables without a singleton trailing year',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation),forecast=html.split('id="section-dcf-forecast"')[1].split('id="section-dcf-discount"')[0]
  expect(forecast).toContain('FY2027—FY2029');expect(forecast).toContain('FY2030—FY2032')
  expect(forecast).not.toContain('FY2032—FY2032');expect(forecast).not.toContain('FY2027—FY2031')
  expect(publicationTargetCount(f.packet,f.validation.facts,new Map(),f.calculation,0)).toBe([...html.matchAll(/data-publication-target=/g)].length)
 })
 it('uses compact model source numbers and preserves complete unique assumption reasons once',()=>{
  const f=fixture(),reason='重复研究依据必须完整保留，不能截断、不能冒充公司数值指引。'
  f.calculation.dcf.assumptions.push(...['one','two'].map(id=>({id,label:id,value:'0.1',unit:'ratio',kind:'assumption',reason,refs:['financial']})))
  const html=renderReport(f.packet,f.validation,f.calculation),model=html.split('id="section-dcf-summary"')[1].split('id="financial-statements"')[0],visible=model.replace(/<[^>]*>/g,'')
  expect(visible).not.toContain('正式财务披露');expect(model).toContain('title="正式财务披露"');expect(model).toContain('href="#source-disclosure"')
  expect(model.match(new RegExp(reason,'g'))).toHaveLength(1);expect(model).toContain('研究依据全文索引');expect(model).toContain('R02')
 })
 it('maps concise bridge-axis keys to full adjustment names in the exact detail table',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation),bridge=html.split('id="section-dcf-owner-bridge"')[1].split('id="section-dcf-sensitivity"')[0]
  expect(bridge).toContain('B01 · 归属经营价值');expect(bridge).toContain('B03 · 小额权益调整');expect(bridge).toContain('data-bridge-key="B01"')
  expect(bridge).toContain('data-zero-origin="true"');expect(bridge).toContain('small-value-marker');expect(bridge).toContain('2.50 万元')
 })
 it('places the opening bridge amount to the right of its column instead of over the value axis',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation),bridge=html.split('id="section-dcf-owner-bridge"')[1].split('id="section-dcf-sensitivity"')[0]
  const firstAmount=bridge.match(/<text[^>]+data-value-key="B01"[^>]*>/)?.[0]
  expect(firstAmount).toContain('text-anchor="start"')
 })
 it('sorts sensitivity parameters numerically for both detail and line geometry without changing model rows',()=>{
  const f=fixture(),s=f.calculation.dcf.sensitivities
  s.beta=[{beta:'2',wacc:'0.12',perShareValue:'18',sourceRefs:['financial']},{beta:'0.7',wacc:'0.07',perShareValue:'33',sourceRefs:['financial']},{beta:'0.8',wacc:'0.075',perShareValue:'31',sourceRefs:['financial']}]
  s.cash.reverse();s.financialPB.reverse();const before=JSON.stringify(s)
  const html=renderReport(f.packet,f.validation,f.calculation),model=html.split('id="section-dcf-sensitivity"')[1].split('id="section-dcf-reverse"')[0]
  for(const[title,ordered]of[['Beta',['0.70 倍','0.80 倍','2.00 倍']],['现金调整',['-0.10 亿元','0.10 亿元']],['金融资产PB',['0.80 倍','1.20 倍']]]){
   const body=model.split(title+'敏感性明细</h3>')[1].split('</tbody>')[0].replace(/<[^>]*>/g,'')
   expect(ordered.map(value=>body.indexOf(value))).toEqual([...ordered.map(value=>body.indexOf(value))].sort((a,b)=>a-b));expect(ordered.every(value=>body.includes(value))).toBe(true)
  }
  const betaFigure=[...model.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].find(m=>m[0].includes('aria-label="Beta敏感性"'))[0],xs=[...betaFigure.matchAll(/<circle cx="([^"]+)"/g)].map(m=>Number(m[1]))
  expect(xs).toHaveLength(3);expect(xs[2]-xs[1]).toBeGreaterThan((xs[1]-xs[0])*10)
  expect(JSON.stringify(s)).toBe(before)
 })
})
