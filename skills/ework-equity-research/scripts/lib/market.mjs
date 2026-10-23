import {decimal} from './numbers.mjs'
import {isObject,isText,isDate,isTimestamp,diagnostic} from './schema.mjs'
import {selectedFactContext} from './evidence-basis.mjs'
const day=s=>Date.parse(s+'T00:00:00Z')/86400000
const fail=(code,message)=>{throw Error(code+':'+message)}
const keys=(o,allowed)=>isObject(o)&&Object.keys(o).every(k=>allowed.includes(k))
export function runMarket(packet,facts,diagnostics,observations=[]){
 if(packet.market===undefined)return null
 const result={status:'blocked',rows:[],monthly:[],rating:null};const m=packet.market
 try{
  if(!keys(m,['valuationAsOf','windowStart','windowEnd','currency','priceBasis','benchmark','rows','dividends','completeness','limitations'])||m.valuationAsOf!==packet.valuationAsOf||m.windowEnd!==m.valuationAsOf||!isDate(m.windowStart)||m.currency!==packet.company.currency||m.priceBasis!=='unadjusted-price'||!keys(m.benchmark,['name','ticker'])||!isText(m.benchmark.name)||!isText(m.benchmark.ticker)||m.benchmark.ticker===packet.company.ticker||!Array.isArray(m.rows)||m.rows.length<180||m.rows.length>400)fail('MARKET_SCHEMA','需一年完整共同收盘序列、独立估值日、真实基准及同口径未复权价格；拒绝手工标准化/收益输入')
  const span=day(m.windowEnd)-day(m.windowStart)
  if(span<364||span>366)fail('MARKET_WINDOW','起止须为完整一年日历窗口')
  const c=m.completeness,obs=new Map(observations.filter(o=>o.status==='verified').map(o=>[o.id,o]))
  if(!keys(c,['expectedDates','calendarObservationRef','method','note'])||!Array.isArray(c.expectedDates)||c.expectedDates.length!==m.rows.length||!isText(c.method)||!isText(c.note)||!obs.has(c.calendarObservationRef))fail('MARKET_CALENDAR','需核验交易日历原文引用和完整共同交易日列表，不能仅画月末点')
  const calendarQuote=obs.get(c.calendarObservationRef).quote
  if(c.expectedDates.some(d=>!isDate(d)||!calendarQuote.includes(d)))fail('MARKET_CALENDAR','每个声明的交易日须出现在已核验日历观察原文')
  const quotedDates=[...new Set((calendarQuote.match(/20\d{2}-\d{2}-\d{2}/g)??[]).filter(d=>isDate(d)&&d>=m.windowStart&&d<=m.windowEnd))].sort()
  if(JSON.stringify(quotedDates)!==JSON.stringify(c.expectedDates))fail('MARKET_CALENDAR','共同交易日声明必须覆盖核验日历原文的全部窗口内日期，不能同时删行与删声明来隐藏缺日')
  if(!Array.isArray(m.limitations)||m.limitations.length>30||m.limitations.some(x=>!isText(x)||x.length>2000))fail('MARKET_SCHEMA','需显式来源等级/权限与价格收益限制说明数组')
  const fs=new Map(facts.filter(f=>f.status==='verified').map(f=>[f.id,f]))
  const sourceRefs=new Set([c.calendarObservationRef]);let previous=''
  const get=(id,metric,date,securityId)=>{
   const f=fs.get(id)
   if(!f||f.metric!==metric||f.scope!=='市场'||f.period!==date||f.securityId!==securityId||!f.evidence?.quote?.includes(securityId)||f.marketSession!=='close'||!isTimestamp(f.asOf)||f.asOf===date||f.asOf.slice(0,10)!==date||f.normalizedUnit!==(metric==='indexLevel'?'index_points':'CNY_per_share')||decimal(f.normalizedValue).cmp('0')<=0)fail('MARKET_FACT','行情必须绑定正确证券/日期/单位、已核验且为正的完整收盘事实')
   const basis=selectedFactContext(f).replace(/未复权|不复权|unadjusted/giu,'raw')
   if(/(?:前|后)复权|复权收盘|\badjusted\s*close|\b(?:qfq|hfq)\b/iu.test(basis))fail('MARKET_BASIS','原文明确复权价格，不能以顶层unadjusted-price声明覆盖原口径')
   sourceRefs.add(id);return f.normalizedValue
  }
  for(const [i,row]of m.rows.entries()){
   if(!keys(row,['date','stockRef','benchmarkRef','stockCrossCheckRef','benchmarkCrossCheckRef'])||!isDate(row.date)||row.date<=previous||row.date<m.windowStart||row.date>m.windowEnd||row.date!==c.expectedDates[i])fail('MARKET_DATES','交易日须唯一升序、与完整共同日历逐日一致，且不含未来/窗口外点')
   const stock=get(row.stockRef,'currentPrice',row.date,packet.company.ticker),benchmark=get(row.benchmarkRef,'indexLevel',row.date,m.benchmark.ticker)
   for(const [kind,id,value,metric,security]of [['stock',row.stockCrossCheckRef,stock,'currentPrice',packet.company.ticker],['benchmark',row.benchmarkCrossCheckRef,benchmark,'indexLevel',m.benchmark.ticker]])if(id){const other=get(id,metric,row.date,security);if(decimal(other).sub(value).cmp('0')!==0)fail('MARKET_CROSSCHECK',kind+'双源不一致，需先解决而非挑选价格')}
   result.rows.push({date:row.date,stock,benchmark,stockRefs:[row.stockRef,...(row.stockCrossCheckRef?[row.stockCrossCheckRef]:[])],benchmarkRefs:[row.benchmarkRef,...(row.benchmarkCrossCheckRef?[row.benchmarkCrossCheckRef]:[])]});previous=row.date
  }
  const first=result.rows[0],last=result.rows.at(-1),startGap=day(first.date)-day(m.windowStart),endGap=day(m.windowEnd)-day(last.date)
  if(startGap>5||endGap>5||last.date!==m.valuationAsOf)fail('MARKET_WINDOW','须覆盖一年前附近完整交易日起点，并以估值日完整收盘结束；边界缺口不得超过五日')
  for(const r of result.rows){r.stockNormalized100=decimal(r.stock).div(first.stock).mul('100').toString(24);r.benchmarkNormalized100=decimal(r.benchmark).div(first.benchmark).mul('100').toString(24)}
  const monthly=new Map();for(const r of result.rows)monthly.set(r.date.slice(0,7),r)
  const sr=decimal(last.stock).div(first.stock).sub('1'),br=decimal(last.benchmark).div(first.benchmark).sub('1')
  const dividends=[]
  if(!Array.isArray(m.dividends)||m.dividends.length>20)fail('MARKET_DIVIDENDS','需显式分红事件数组；空数组需在限制说明无已核验事件')
  for(const event of m.dividends){if(!keys(event,['date','amountRef'])||!isDate(event.date)||event.date<m.windowStart||event.date>m.windowEnd)fail('MARKET_DIVIDENDS','除息日需在窗口内');const f=fs.get(event.amountRef);if(!f||f.metric!=='cashDividendPerShare'||f.normalizedUnit!=='CNY_per_share'||decimal(f.normalizedValue).cmp('0')<0)fail('MARKET_DIVIDENDS','每股现金分红需原文核验，不进入本价格收益');sourceRefs.add(f.id);dividends.push({date:event.date,amount:f.normalizedValue,sourceRefs:[f.id]})}
  Object.assign(result,{status:'calculated',valuationAsOf:m.valuationAsOf,windowStart:m.windowStart,windowEnd:m.windowEnd,priceBasis:m.priceBasis,benchmark:m.benchmark,currency:m.currency,monthly:[...monthly.values()],stockReturn:sr.toString(24),benchmarkReturn:br.toString(24),excessPercentagePoints:sr.sub(br).mul('100').toString(24),relativeReturn:decimal(last.stock).div(first.stock).div(decimal(last.benchmark).div(first.benchmark)).sub('1').toString(24),dividends,sourceRefs:[...sourceRefs],limitations:[...m.limitations,'未复权价格/价格指数比较，现金红利不加回；不代表投资总回报。','日历与来源在本地快照绑定，外部真实性与停牌/适用基准仍需研究复核。'],coverage:{commonTradingDays:result.rows.length,fullYear:true,startBoundaryDays:startGap,endBoundaryDays:endGap},statistics:null})
 }catch(error){const [code,...message]=error.message.split(':');diagnostics.push(diagnostic(/^[A-Z_]+$/.test(code)?code:'MARKET_SCHEMA','market',message.join(':')||error.message));result.rows=[];result.monthly=[]}
 return result
}
