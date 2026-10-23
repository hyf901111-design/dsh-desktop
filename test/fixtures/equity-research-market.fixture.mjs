import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
export async function createMarketFixture(){
 const packet=JSON.parse(await readFile(resolve('skills/ework-equity-research/examples/synthetic/packet.json'),'utf8'))
 packet.schemaVersion=2;packet.asOf='2026-10-22';packet.valuationAsOf=packet.asOf;packet.financialAsOf='2026-06-30';delete packet.dcf;delete packet.research
 packet.sources=[];packet.facts=[];packet.calculations=[];packet.observations=[]
 packet.report={profile:'brief',title:'{{company}}研究报告',summary:[],sections:[]}
 const lines=['交易所完整交易日历（合成测试，非真实日历）'];let seq=0
 const sourceId='market-source'
 function fact(id,metric,period,value,{scope='合并',unit='CNY',securityId,periodBasis}={}){
  const start=lines.length+1,unitText={CNY:'元',CNY_per_share:'元/股',index_points:'点'}[unit]
  const label={revenue:'营业收入',netIncomeAttributableToParent:'归母净利润',operatingCashFlow:'经营活动产生的现金流量净额',currentPrice:'收盘价',indexLevel:'收盘指数'}[metric]
  lines.push('范围：'+scope,...(securityId?['证券：'+securityId]:[]),'单位：'+unitText,'指标\t'+period,label+'\t'+value)
  const end=lines.length
  packet.facts.push({id,metric,period,scope,unit,value,sourceId,...(securityId?{securityId,marketSession:'close',asOf:period+'T15:00:00+08:00'}:{}),...(periodBasis?{periodBasis}:{}),evidence:{quote:lines.slice(start-1,end).join('\n'),locator:{lineStart:start,lineEnd:end,valueLine:end,column:2},metricText:label,periodText:period,scopeText:scope,unitText,valueText:value}})
  return id
 }
 const rows=[],expectedDates=[]
 for(let date=new Date('2025-10-22T00:00:00Z');date<=new Date('2026-10-22T00:00:00Z');date.setUTCDate(date.getUTCDate()+1)){
  if([0,6].includes(date.getUTCDay()))continue
  const d=date.toISOString().slice(0,10),n=++seq;expectedDates.push(d)
  rows.push({date:d,stockRef:fact('stock'+n,'currentPrice',d,String(100+n),{scope:'市场',unit:'CNY_per_share',securityId:packet.company.ticker}),benchmarkRef:fact('index'+n,'indexLevel',d,String(1000+2*n),{scope:'市场',unit:'index_points',securityId:'000300.SH'})})
 }
 lines[0]+=' '+expectedDates.join(' ')
 packet.observations.push({id:'calendar',sourceId,quote:lines[0],locator:{lineStart:1,lineEnd:1}})
 packet.market={valuationAsOf:packet.asOf,windowStart:'2025-10-22',windowEnd:packet.asOf,currency:'CNY',priceBasis:'unadjusted-price',benchmark:{name:'沪深300',ticker:'000300.SH'},rows,dividends:[],completeness:{expectedDates,calendarObservationRef:'calendar',method:'合成完整交易日历',note:'仅测试，不用于真实投资。'},limitations:['合成价格序列，仅检验计算。']}
 const qperiods=['2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2']
 for(const [n,q]of qperiods.entries())for(const [m,v]of [['revenue',String(1000+100*n)],['netIncomeAttributableToParent',String(100+10*n)]])fact('q'+q+'-'+m,m,q,v,{periodBasis:'standalone'})
 packet.quarterly={latest:'2026Q2',quarters:qperiods.slice(4).map((period,n)=>({period,revenueRef:'q'+period+'-revenue',parentNetIncomeRef:'q'+period+'-netIncomeAttributableToParent',priorRevenueRef:'q'+qperiods[n]+'-revenue',priorParentNetIncomeRef:'q'+qperiods[n]+'-netIncomeAttributableToParent'})),disclosureSearch:{asOf:packet.asOf,refs:['calendar'],note:'合成披露检索记录；最近已披露中报。'}}
 const text=lines.join('\n')+'\n'
 packet.sources=[{id:sourceId,title:'合成行情及披露快照',publisher:'合成测试',kind:'text-snapshot',textFile:'market.txt',sha256:createHash('sha256').update(text).digest('hex'),publishedAt:'2026-10-22',accessedAt:'2026-10-22'}]
 return {packet,text,fact,lines}
}
