import {evaluateMapping} from './component-data-refresh.js'
import {hostStructuredWebRecord} from './component-source-binding.js'

export function commonPriceScope(original,panel,format){
 if(!['chart','market'].includes(format)||!/基期|归一化|base\s*100/iu.test(panel??'')||
  /复权|基准指数|超额收益|腾讯|雅虎|指定来源|仅.{0,8}来源|插件|禁止联网|不联网/iu.test(original??''))return
 const matches=[...(original??'').matchAll(/近\s*(\d{1,3})\s*个共同交易日.{0,8}(?:基期|基准)\s*100/gu)]
 const symbols=[...new Set((original??'').match(/(?<![\w.])[A-Z]{2,6}(?![\w.])/gu)??[])]
 const count=Number(matches[0]?.[1])
 if(matches.length!==1||count<2||count>100||symbols.length!==2)return
 return {symbols,count}
}

const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const series=(rows)=>Array.isArray(rows)&&rows.length>=2&&rows.every((r,i)=>
 day(r[0])&&Number.isFinite(r[1])&&r[1]>0&&(!i||r[0]>rows[i-1][0]))
 ?new Map(rows):undefined
const yahooUrl=(symbol,host)=>`https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
const yahooHosts=['query2','query1']

function yahooSeries(record,symbol){
 if(!yahooHosts.some(host=>record.args?.url===yahooUrl(symbol,host)))return
 const data=record.response?.data?.chart?.result
 const block=Array.isArray(data)&&data.length===1?data[0]:null
 if(block?.meta?.symbol!==symbol||block.meta.currency!=='USD'||!['America/New_York','US/Eastern'].includes(block.meta.exchangeTimezoneName))return
 const dates=block.timestamp,closes=block.indicators?.quote?.[0]?.close
 if(!Array.isArray(dates)||!Array.isArray(closes)||dates.length!==closes.length||dates.length>366)return
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:block.meta.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'})
 return series(dates.map((timestamp,i)=>{
  if(!Number.isSafeInteger(timestamp)||timestamp<0||timestamp>4_102_444_800)return ['',NaN]
  const values=Object.fromEntries(format.formatToParts(timestamp*1000).map(({type,value})=>[type,value]))
  return [values.year+'-'+values.month+'-'+values.day,closes[i]]
 }).filter(row=>row[1]!==null))
}

function tencentSeries(record,symbol){
 let url
 try{url=new URL(record.args?.url)}catch{return}
 if(url.origin!=='https://web.ifzq.gtimg.cn'||url.pathname!=='/appstock/app/fqkline/get')return
 const [key,period,start,end,limit,basis]=url.searchParams.get('param')?.split(',')??[]
 if(![symbol,symbol+'.OQ',symbol+'.N'].map(value=>'us'+value).includes(key)||
  period!=='day'||start||end||!/^\d{1,3}$/u.test(limit??'')||!['','qfq',undefined].includes(basis)||record.response?.data?.code!==0)return
 const rows=evaluateMapping({$path:`data.data[${JSON.stringify(key)}].day`},record.response,undefined,record.response)
 return Array.isArray(rows)&&rows.length<=366?series(rows.map(row=>[row?.[0],Number(row?.[2])])):undefined
}

export function observedCommonPriceComparison(scope,records,title){
 for(const [reader,label] of [[tencentSeries,'腾讯财经公开日线'],[yahooSeries,'Yahoo Finance 公开日线']]){
  const candidates=scope.symbols.map(symbol=>{
   for(const record of records.toReversed()){
    if(record.tool!=='web_fetch'||record.purpose!=='snapshot'||record.args?.url!==record.response?.sourceUrl)continue
    const values=reader(record,symbol)
    if(values)return {values,url:record.response.sourceUrl,symbol}
   }
  })
  if(!candidates.every(Boolean))continue
  const dates=[...candidates[0].values.keys()].filter(date=>candidates.every(item=>item.values.has(date))).slice(-scope.count)
  if(dates.length!==scope.count)continue
  return {version:1,type:'chart',variant:'line',title:title?.trim().slice(0,256)||'共同交易日基期 100 对比',
   labels:dates,unit:'基期 100',asOf:dates.at(-1),note:`取最后 ${dates.length} 个共同交易日。按各自未复权收盘价 ÷ 共同基期收盘价 × 100 计算，来源为美元报价。静态快照。`,
   sources:candidates.map(({symbol,url})=>({label:symbol+' · '+label,url})),
   series:candidates.map(({symbol,values})=>({name:symbol,values:dates.map(date=>Number((values.get(date)/values.get(dates[0])*100).toFixed(2)))}))}
 }
}

export async function readCommonPriceComparison(scope,fetchPage,signal){
 const records=await Promise.all(scope.symbols.map(async symbol=>{
  for(const host of yahooHosts){
   signal?.throwIfAborted()
   const url=yahooUrl(symbol,host)
   const record=hostStructuredWebRecord(await fetchPage(url,signal),url)
   if(record&&yahooSeries(record,symbol))return record
  }
 }))
 return records.filter(Boolean)
}
