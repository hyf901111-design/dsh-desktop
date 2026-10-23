import {describe,it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {renderReport,validateReport} from '../skills/ework-equity-research/scripts/lib/report.mjs'
const fixture=()=>{
 const facts=[]
 for(const [i,year]of [2020,2021,2022,2023,2024,2025].entries())for(const [metric,values]of [['revenue',[100,120,110,150,150,170]],['netIncomeAttributableToParent',[40,45,42,60,70,75]],['costOfRevenue',[60,75,68,90,80,95]]])facts.push({id:metric+year,metric,period:'FY'+year,scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY',normalizedValue:String(values[i]*1e8),evidence:{locator:{page:6}}})
 const calculations=[{id:'growth23',op:'yoy',inputs:['revenue2023','revenue2022'],value:'0.363636363636363636',unit:'ratio',period:'FY2023',scope:'合并',status:'calculated'},{id:'growth24',op:'yoy',inputs:['revenue2024','revenue2023'],value:'0',unit:'ratio',period:'FY2024',scope:'合并',status:'calculated'},{id:'growth25',op:'yoy',inputs:['revenue2025','revenue2024'],value:'0.133333333333333333',unit:'ratio',period:'FY2025',scope:'合并',status:'calculated'},{id:'revenueChange25',op:'periodDifference',inputs:['revenue2025','revenue2024'],value:'2000000000',unit:'CNY',period:'FY2025',scope:'合并',status:'calculated'},{id:'costImpact25',op:'periodDifference',inputs:['costOfRevenue2024','costOfRevenue2025'],value:'-1500000000',unit:'CNY',period:'FY2025',scope:'合并',status:'calculated'}]
 const packet={company:{name:'离线图表验证公司',ticker:'TEST'},asOf:'2026-10-23',financialAsOf:'2025-12-31',sources:[{id:'annual',title:'年度披露原文',kind:'text-snapshot'}],report:{title:'经营质量复核',summary:[{text:'本稿用已核验数据检验业务判断。'}],sections:[{kind:'performance',title:'历史经营',paragraphs:[{text:'各期间以同一范围比较。'}],charts:[]}]}}
 return {packet,validation:{ok:true,facts,diagnostics:[]},calculation:{ok:true,calculations,diagnostics:[]}}
}
const line=()=>({kind:'line',title:'年度收入回溯',series:[{name:'营业收入',refs:['revenue2020','revenue2021','revenue2022','revenue2023','revenue2024','revenue2025']}]})
const combo=()=>({kind:'combo',title:'收入规模与同比',series:[{name:'营业收入',type:'bar',refs:['revenue2023','revenue2024','revenue2025']},{name:'收入同比',type:'line',refs:['growth23','growth24','growth25']}]})
const waterfall=()=>({kind:'waterfall',title:'利润变化算术桥',startRef:'netIncomeAttributableToParent2024',endRef:'netIncomeAttributableToParent2025',steps:[{label:'收入变化',ref:'revenueChange25'},{label:'成本变化反向影响',ref:'costImpact25'}]})
const codes=f=>validateReport(f.packet,f.validation,f.calculation).map(x=>x.code)
const chart=(f,c)=>f.packet.report.sections[0].charts=[c]
describe('semantically selected offline research chart types',()=>{
 it('renders ordered multiyear lines with real axes and exact detail values rather than bars',()=>{
  const f=fixture();chart(f,line());expect(codes(f)).toEqual([])
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('data-chart-kind="line"');expect(html).toContain('<polyline');expect(html).toContain('年度收入回溯 · 图示数据');expect(html).toContain('FY2020');expect(html).toContain('170.00 亿元');expect(html).toContain('class="axis-tick"');expect(html).not.toContain('<script')
 })
 it('requires at least three strictly ordered comparable periods for lines and keeps two-period bars compatible',()=>{
  const f=fixture(),c=line();c.series[0].refs=['revenue2024','revenue2025'];chart(f,c);expect(codes(f)).toContain('REPORT_CHART')
  delete c.kind;expect(codes(f)).toEqual([])
  c.kind='line';c.series[0].refs=['revenue2025','revenue2023','revenue2024'];expect(codes(f)).toContain('REPORT_CHART')
  c.series[0].refs=['revenue2023','revenue2024','revenue2025'];f.validation.facts.find(x=>x.id==='revenue2024').period='2024H1';expect(codes(f)).toContain('REPORT_CHART')
 })
 it('renders money bars and growth lines against explicitly distinct left/right axes',()=>{
  const f=fixture();chart(f,combo());expect(codes(f)).toEqual([])
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('data-chart-kind="combo"');expect(html).toContain('左轴：亿元');expect(html).toContain('右轴：同比%');expect(html).toMatch(/class="[^"]*axis-right/);expect(html).toContain('class="zero-line"')
  f.calculation.calculations.find(x=>x.id==='growth24').op='ratio';expect(codes(f)).toContain('REPORT_CHART')
 })
 it('rejects incompatible combo scales, swapped types, unknown kinds and nonmatching periods',()=>{
  for(const mutate of[c=>c.series[1].refs=['growth25','growth24','growth23'],c=>c.series[1].type='bar',c=>c.kind='pie',c=>c.series[0].refs=['costOfRevenue2023','revenue2024','revenue2025']]){const f=fixture(),c=combo();mutate(c);chart(f,c);expect(codes(f)).toContain('REPORT_CHART')}
 })
 it('validates Decimal-exact waterfall closure and prints the arithmetic-not-causal boundary with source refs',()=>{
  const f=fixture();chart(f,waterfall());expect(codes(f)).toEqual([])
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('data-chart-kind="waterfall"');expect(html).toContain('算术桥，不代表因果归因');expect(html).toContain('成本变化反向影响');expect(html).toContain('75.00 亿元');expect(html).toContain('href="#source-annual"')
  f.calculation.calculations.find(x=>x.id==='costImpact25').value='-1500000000.01';expect(codes(f)).toContain('REPORT_CHART')
 })
 it('rejects fact steps, wrong scope, excessive labels and raw numbers in waterfall labels',()=>{
  for(const mutate of[(f,c)=>c.steps[0].ref='revenue2025',(f,c)=>f.calculation.calculations[3].scope='母公司',(f,c)=>c.steps[0].label='长'.repeat(81)]){const f=fixture(),c=waterfall();mutate(f,c);chart(f,c);expect(codes(f)).toContain('REPORT_CHART')}
  const f=fixture(),c=waterfall();c.steps[0].label='变化99亿元';chart(f,c);expect(codes(f)).toContain('UNTEMPLATED_NUMBER')
 })
 it('uses the supplied official logo bytes offline at their original ratio and removes the invented subtitle',async()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation),asset=await readFile('skills/ework-equity-research/assets/ework-odyssey-logo.svg','utf8')
  expect(html).toContain(asset.trim());expect(html).toMatch(/class="[^"]*official-logo/);expect(html).not.toContain('投资研究');expect(html).not.toContain('fill:#fff');expect(asset).not.toMatch(/<script|<image|<foreignObject|href=/i)
 })
 it('rejects missing annual observations and unrelated periods inside a cross-period arithmetic bridge',()=>{
  const f=fixture(),c=line();c.series[0].refs=['revenue2020','revenue2021','revenue2025'];chart(f,c);expect(codes(f)).toContain('REPORT_CHART')
  chart(f,waterfall());f.calculation.calculations.find(x=>x.id==='costImpact25').period='FY2023';expect(codes(f)).toContain('REPORT_CHART')
 })
 it('keeps zero and negative observations visible and scales huge numbers without invalid geometry',()=>{
  const f=fixture(),c=line();c.series[0].refs=['revenue2023','revenue2024','revenue2025'];chart(f,c)
  for(const fact of f.validation.facts.filter(x=>c.series[0].refs.includes(x.id)))fact.normalizedValue='0'
  let html=renderReport(f.packet,f.validation,f.calculation);expect(html).toContain('<polyline');expect(html).toContain('class="zero-line"')
  f.validation.facts.find(x=>x.id==='revenue2023').normalizedValue='-'+'9'.repeat(1024);f.validation.facts.find(x=>x.id==='revenue2025').normalizedValue='9'.repeat(1024)
  html=renderReport(f.packet,f.validation,f.calculation);expect(html).toContain('×10^');expect(html).not.toMatch(/(?:x|y|cx|cy|height|width|points)="[^"]*(?:NaN|Infinity)/)
 })
 it('marks a focused percentage line axis explicitly instead of disguising a truncated zero',()=>{
  const f=fixture();for(const [i,year]of[2023,2024,2025].entries())f.calculation.calculations.push({id:'margin'+year,op:'grossMargin',inputs:['revenue'+year,'costOfRevenue'+year],value:['0.91','0.90','0.895'][i],unit:'ratio',period:'FY'+year,scope:'合并',status:'calculated'})
  chart(f,{kind:'line',title:'毛利率变化',series:[{name:'毛利率',refs:['margin2023','margin2024','margin2025']}]})
  expect(renderReport(f.packet,f.validation,f.calculation)).toContain('纵轴未从零起')
 })

 it('binds the combo growth numerator to the money series instead of silently pairing another metric',()=>{
  const f=fixture();for(const c of f.calculation.calculations.filter(x=>x.op==='yoy'))c.inputs=c.inputs.map(id=>id.replace('revenue','costOfRevenue'))
  chart(f,combo());expect(codes(f)).toContain('REPORT_CHART')
 })

 it('reserves sufficient space between negative bar value labels and period captions',()=>{
  const f=fixture();f.calculation.calculations.find(x=>x.id==='growth23').value='-0.2'
  chart(f,{kind:'bar',title:'同比对照',series:[{name:'收入同比',refs:['growth23','growth24','growth25']}]})
  const html=renderReport(f.packet,f.validation,f.calculation),value=html.match(/<text x="[^"]+" y="([^"]+)" text-anchor="middle">-20.00<\/text>/),period=[...html.matchAll(/<text x="[^"]+" y="([^"]+)" text-anchor="middle">FY2023<\/text>/g)].at(-1)
  expect(value).toBeTruthy();expect(Number(period[1])-Number(value[1])).toBeGreaterThanOrEqual(20)
 })

})
