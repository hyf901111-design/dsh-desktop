import {describe,it,expect} from 'vitest'
import {renderReport,validateReport} from '../skills/ework-equity-research/scripts/lib/report.mjs'
const fixture=()=>{
 const facts=[]
 for(const scope of ['合并','母公司'])for(const [metric,mul]of[['revenue',10],['netIncomeAttributableToParent',4],['operatingCashFlow',3],['capex',1]])for(const [i,period]of['FY2024','FY2025','2025H1','2026H1'].entries())facts.push({id:metric+period+scope,metric,period,scope,status:'verified',sourceId:'annual',normalizedUnit:'CNY',normalizedValue:String((i+1)*mul*1e8),evidence:{locator:{page:6}}})
 for(const [i,period]of['2024-12-31','2025-12-31','2026-06-30'].entries())facts.push({id:'cash'+period,metric:'cash',period,scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY',normalizedValue:String((i+1)*5e8),evidence:{locator:{page:8}}})
 const packet={company:{name:'贵州茅台酒股份有限公司',ticker:'600519.SH'},asOf:'2026-10-23',financialAsOf:'2026-06-30',sources:[{id:'annual',title:'公司定期报告',kind:'text-snapshot'}],report:{title:'现金质量与经营恢复的验证',publication:{companyShortName:'贵州茅台',reportType:'财报点评报告',industry:'食品饮料 / 白酒'},summary:[{label:'核心判断',text:'收入{{revenueFY2025合并|yi}}需要现金验证。'}],sections:[{title:'收入与利润',kind:'performance',paragraphs:[{text:'保持相同期间口径。',refs:['revenueFY2025合并']}],tables:[{title:'历史业绩',columns:['营业收入'],rows:[[{text:'{{revenueFY2025合并|yi}}'}]]}],charts:[{title:'年度经营表现',series:[{name:'营业收入',refs:['revenueFY2024合并','revenueFY2025合并']}]}]}]}}
 return {packet,validation:{ok:true,facts,diagnostics:[]},calculation:{ok:true,calculations:[],diagnostics:[]}}
}
describe('formal publication layout',()=>{
 it('renders a research-summary cover with separate opinion and publication titles, verified basics and truthful valuation status',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('<title>贵州茅台（600519.SH）2026中报财报点评报告</title>')
  expect(html).toContain('class="publication-cover"');expect(html).toContain('class="cover-main"');expect(html).toContain('class="cover-sidebar"')
  expect(html).toContain('现金质量与经营恢复的验证');expect(html).toContain('核心判断');expect(html).toContain('投资要点');expect(html).toContain('食品饮料 / 白酒')
  expect(html).toContain('未评级');expect(html).toContain('财务基本数据');expect(html).toContain('历史财务摘要与预测状态');expect(html).toContain('营业收入同比');expect(html).toContain('归母净利润同比');expect(html).toContain('基本每股收益')
  expect(html).not.toContain('目标价</th>');expect(html).not.toContain('评级：买入')
 })
 it('provides real anchors and continuous figure/table numbering with adjacent sources, no invented page numbers',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('目录');expect(html).toContain('图表索引');expect(html).toContain('href="#section-performance"')
  expect(html).toContain('href="#financial-statements"');expect(html).toContain('href="#chart-1"');expect(html).toContain('id="chart-1"');expect(html).toContain('图 1：历史年度收入与归母净利润')
  expect(html).toContain('图 2：年度经营表现');expect(html).toContain('表 1：历史财务摘要')
  expect(html).toContain('data-publication-page="section-performance"');expect(html).toContain('data-publication-target="chart-1"')
  expect(html).toContain('viewBox="0 0 280 170"')
  expect(html).toContain('id="table-');expect(html).toContain('来源：');expect(html).not.toMatch(/目录页码|\.\.{4,}\s*\d/)
 })
 it('separates financial statement groups by consolidation scope and period frequency and retains raw evidence appendices',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('盈利摘要 · 合并 · 全年');expect(html).toContain('盈利摘要 · 合并 · 半年度');expect(html).toContain('盈利摘要 · 母公司 · 全年')
  expect(html).toContain('现金流摘要 · 合并 · 半年度');expect(html).toContain('资产负债摘要 · 合并 · 时点')
  expect(html).toContain('财务事实与证据');expect(html).toContain('来源台账')
  const groups=[...html.matchAll(/<div class="financial-group"[\s\S]*?<\/table>/g)].map(m=>m[0])
  expect(groups.some(g=>g.includes('FY2024')&&g.includes('2026H1'))).toBe(false)
  expect(html).not.toMatch(/202[0-9]E|202[0-9]预测/)
 })
 it('rejects unbound numbers or unknown tokens in cover labels and malformed publication metadata',()=>{
  const f=fixture();f.packet.report.summary[0].label='增长99%';expect(validateReport(f.packet,f.validation,f.calculation).map(d=>d.code)).toContain('UNTEMPLATED_NUMBER')
  f.packet.report.summary[0].label='{{missing}}';expect(validateReport(f.packet,f.validation,f.calculation).map(d=>d.code)).toContain('UNKNOWN_REPORT_REF')
  f.packet.report.summary[0].label='观察';f.packet.report.publication.industry='<img>';expect(validateReport(f.packet,f.validation,f.calculation).map(d=>d.code)).toContain('REPORT_PUBLICATION')
 })
 it('escapes labels and preserves flowing long content without clipping or forcing each research section to a page',()=>{
  const f=fixture();f.packet.report.summary[0].label='<b>投资要点</b>';f.packet.report.summary[0].text='长段落。'.repeat(500)
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('&lt;b&gt;投资要点&lt;/b&gt;');expect(html).toContain('长段落。'.repeat(500))
  expect(html).not.toMatch(/line-clamp|text-overflow:ellipsis|transform:scale|zoom:|section\s*\{[^}]*break-before:page/)
 })
 it('keeps EPS, ROE and dated quotes in their real units and creates unique anchors for repeated brief kinds',()=>{
  const f=fixture();f.validation.facts.push({id:'eps',metric:'basicEarningsPerShare',period:'FY2025',scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY_per_share',normalizedValue:'52.45'},{id:'roe',metric:'returnOnEquity',period:'FY2025',scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'ratio',normalizedValue:'0.31'},{id:'price',metric:'currentPrice',period:'2026-09-01',scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY_per_share',normalizedValue:'1400'})
  f.packet.report.sections.push({...f.packet.report.sections[0]})
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('52.45 元/股');expect(html).toContain('31.00%');expect(html).toContain('2026-09-01');expect(html).toContain('报价时点单列')
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(ids.length)
  const targetIds=[...html.matchAll(/data-publication-target="([^"]+)"/g)].map(m=>m[1]);expect(targetIds.every(id=>ids.includes(id))).toBe(true)
 })

 it('uses full-width plots with exact data tables when a half-column would crowd the values',()=>{
  const f=fixture();f.packet.report.sections[0].charts[0]={title:'多期可比收入',series:[{name:'收入',refs:['revenueFY2024合并','revenueFY2025合并','revenue2025H1合并','revenue2026H1合并']}]}
  // Keep periods at one frequency; facts remain supplied by the same verified set.
  for(const [i,id]of f.packet.report.sections[0].charts[0].series[0].refs.entries())f.validation.facts.find(x=>x.id===id).period='FY'+(2022+i)
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('class="wide"');expect(html).toContain('多期可比收入 · 图示数据');expect(html).toContain('40.00 亿元')
 })

 it('refuses failed calculations even when a malformed caller leaves the overall flag true',()=>{
  const f=fixture();f.calculation.calculations.push({id:'blockedSentinel',status:'blocked',op:'ratio',inputs:['revenueFY2025合并'],period:'FY2025',scope:'合并',unit:'ratio',value:'9.87654321'})
  expect(validateReport(f.packet,f.validation,f.calculation).map(d=>d.code)).toContain('REPORT_CALCULATION_STATUS')
  expect(()=>renderReport(f.packet,f.validation,f.calculation)).toThrow('报告校验未通过')
 })
 it('chooses actual latest financial dates rather than lexically putting FY before interim EPS',()=>{
  const f=fixture();f.validation.facts.push(...[['epsAnnual','FY2025','52.45'],['epsInterim','2026H1','35.44']].map(([id,period,value])=>({id,period,metric:'basicEarningsPerShare',scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY_per_share',normalizedValue:value})))
  const html=renderReport(f.packet,f.validation,f.calculation),sidebar=html.split('<aside class="cover-sidebar">')[1].split('</aside>')[0]
  expect(sidebar).toContain('35.44 元/股');expect(sidebar).not.toContain('52.45 元/股')
 })

 it('keeps future accounting periods out of historical cover and statement summaries without deleting evidence',()=>{
  const f=fixture();f.validation.facts.push({id:'futureRevenue',metric:'revenue',period:'FY2027',scope:'合并',status:'verified',sourceId:'annual',normalizedUnit:'CNY',normalizedValue:'1900000000000'})
  const html=renderReport(f.packet,f.validation,f.calculation),cover=html.split('<header class="publication-cover">')[1].split('</header>')[0],statements=html.split('<section id="financial-statements"')[1].split('<section id="fact-evidence"')[0]
  expect(cover).not.toContain('FY2027');expect(statements).not.toContain('FY2027');expect(html).toContain('futureRevenue')
 })

 it('uses controlled unique fallback anchors for prototype-like or arbitrary brief kinds',()=>{
  const f=fixture();f.packet.report.sections=['toString','__proto__','constructor','hasOwnProperty','任意 kind',undefined].map(kind=>({kind,title:'重复标题',paragraphs:[{text:'该判断仍需证据。',refs:['revenueFY2025合并']}]}))
  const html=renderReport(f.packet,f.validation,f.calculation),targets=[...html.matchAll(/data-publication-target="([^"]+)"/g)].map(m=>m[1])
  expect(targets.filter(id=>id.startsWith('section-'))).toEqual(['section-analysis-1','section-analysis-2','section-analysis-3','section-analysis-4','section-analysis-5','section-analysis-6'])
  f.packet.report.profile='full';f.packet.report.sections[0].status='supported'
  expect(validateReport(f.packet,f.validation,f.calculation).some(d=>d.path==='report.sections[0]'&&d.code==='RESEARCH_STRUCTURE')).toBe(true)
 })

 it('keeps narrow print viewports in publication columns instead of activating the mobile layout',()=>{
  const f=fixture(),html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('@media screen and (max-width:700px)')
  expect(html).not.toContain('@media(max-width:700px)');expect(html).not.toContain('@page:first')
 })
 it('diagnoses total navigation slots including generated financial and evidence tables before rendering',()=>{
  const f=fixture(),section=f.packet.report.sections[0]
  f.packet.report.sections=Array.from({length:30},(_,i)=>({...section,tables:Array.from({length:8},()=>section.tables[0]),charts:Array.from({length:i<16?7:8},()=>section.charts[0])}))
  const diagnostics=validateReport(f.packet,f.validation,f.calculation)
  expect(diagnostics.map(d=>d.code)).toContain('REPORT_PUBLICATION_BUDGET')
  expect(()=>renderReport(f.packet,f.validation,f.calculation)).toThrow('报告校验未通过')
  // 501 explicit/appendix targets plus generated cover/statements reach 513.
  // One fewer chart is exactly 512 and must remain a valid, complete report.
  f.packet.report.sections[0].charts.pop()
  expect(validateReport(f.packet,f.validation,f.calculation)).toEqual([])
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect([...html.matchAll(/data-publication-page=/g)]).toHaveLength(512)
 })

})
