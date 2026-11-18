// ECB quotes each currency per EUR. Rebuild both the chart and its detail
// table from the two verified rolling queries, joined on observation date.
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const directions=[
 ['date',/^(?:日期|交易日|参考日期|date|time)$/iu],
 ['usdcny',/^(?:USD\s*\/?\s*CNY|美元(?:兑|对)人民币)(?:汇率)?(?:[（(].*[)）])?$/iu],
 ['eurusd',/^(?:EUR\s*\/?\s*USD|欧元(?:兑|对)美元)(?:汇率)?(?:[（(].*[)）])?$/iu],
 ['eurcny',/^(?:EUR\s*\/?\s*CNY|欧元(?:兑|对)人民币)(?:汇率)?(?:[（(].*[)）])?$/iu],
 ['id',/^(?:id|编号|记录编号)$/iu],
]
const fieldFor=label=>typeof label==='string'&&directions.find(([,pattern])=>pattern.test(label.trim()))?.[0]
function rates(response,currency){
 if(response?.sourceId!=='ecb-fx'||response.units?.value!==currency+' per EUR'||!Array.isArray(response.records)||!response.records.length||response.records.length>100)throw Error('欧洲央行参考汇率的来源或币种口径不匹配')
 const values=new Map()
 for(const row of response.records){
  if(!row||!day(row.time)||row.base!=='EUR'||row.currency!==currency||!Number.isFinite(row.value)||row.value<=0||values.has(row.time))throw Error('欧洲央行参考汇率含缺值、重复日期或其他币种')
  values.set(row.time,row.value)
 }
 return values
}
function commonDates(usd,cny,count){
 const dates=[...new Set([...usd.keys(),...cny.keys()])].sort().slice(-count)
 if(dates.length!==count||dates.some(date=>!usd.has(date)||!cny.has(date)))throw Error('尚未取得同一公布日的两种完整参考汇率')
 return dates
}
export function materializeEcbCrossRate(mapping,responses){
 const {observedWorkbench:projection,title,type}=mapping
 const {count,columnNames,seriesNames,unit,digits,commentary,initialDate}=projection
 if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(digits)||digits<0||digits>8||
    !['table','chart'].includes(type)||!Array.isArray(columnNames)||!columnNames.every(fieldFor))throw Error('参考汇率显示字段或窗口无效')
 const usd=rates(responses.usd,'USD'),cny=rates(responses.cny,'CNY')
 const dates=commonDates(usd,cny,count)
 const rows=dates.map(date=>({date,id:date,eurusd:usd.get(date),eurcny:cny.get(date),usdcny:Number((cny.get(date)/usd.get(date)).toFixed(digits))}))
 const values=rows.map(row=>columnNames.map(label=>row[fieldFor(label)]))
 const base={version:1,type,title,asOf:dates.at(-1),sources:[{label:'欧洲央行日参考汇率（ECB）',url:'https://data.ecb.europa.eu/'}],
  note:`最近 ${count} 个公布日（${dates[0]} 至 ${dates.at(-1)}）。USD/CNY = 同日 EUR/CNY ÷ EUR/USD，保留 ${digits} 位小数。欧洲央行工作日发布，仅供日度参考。`,
  ...(commentary&&day(initialDate)?{body:'生成时说明（'+initialDate+'）\n'+commentary}:{})}
 if(type==='table')return {...base,columns:columnNames,rows:values}
 if(!['line','area','bar','horizontal','groupedBar'].includes(mapping.variant)||!Array.isArray(seriesNames)||!seriesNames.length||seriesNames.some(name=>!['usdcny','eurusd','eurcny'].includes(fieldFor(name))))throw Error('参考汇率图表指标无效')
 return {...base,variant:mapping.variant,...(unit?{unit}:{}),labels:dates,series:seriesNames.map(name=>({name,values:rows.map(row=>row[fieldFor(name)])})),detailColumns:columnNames,detailRows:values}
}
export function observedEcbCrossRate(artifact,entries){
 if(!['chart','table'].includes(artifact?.type)||!artifact.sources?.length||
    !artifact.sources.every(s=>/欧洲央行|欧洲中央银行|\bECB\b/iu.test(s.label)&&(!s.url||/^https:\/\/(?:[\w-]+\.)*ecb\.europa\.eu(?:\/|$)/iu.test(s.url))))return
 const columnNames=artifact.type==='table'?artifact.columns:artifact.detailColumns
 const rows=artifact.type==='table'?artifact.rows:artifact.detailRows
 if(!Array.isArray(columnNames)||!Array.isArray(rows)||!rows.length||rows.length>100)return
 const keys=columnNames.map(fieldFor)
 if(keys.some(key=>!key)||new Set(keys).size!==keys.length||!keys.includes('date')||!keys.includes('usdcny'))return
 const seriesNames=artifact.type==='chart'?artifact.series?.map(series=>series.name):undefined
 if(artifact.type==='chart'&&(!seriesNames?.length||seriesNames.some(name=>!keys.includes(fieldFor(name)))))return
 const selected={}
 for(const entry of entries){
  if(entry.tool!=='public_data_query'||entry.args.source!=='ecb-fx')continue
  let parameters
  try{parameters=JSON.parse(entry.args.parameters_json??'{}')}catch{continue}
  if(!parameters||Object.keys(parameters).some(key=>!['currency','limit'].includes(key))||!['USD','CNY'].includes(parameters.currency))continue
  const key=parameters.currency.toLowerCase()
  if(selected[key])return // Multiple query windows need an explicit source reference.
  selected[key]=entry
 }
 if(!selected.usd||!selected.cny)return
 const dates=rows.map(row=>row[keys.indexOf('date')])
 if(!dates.every(day)||dates.at(-1)!==artifact.asOf||artifact.type==='chart'&&dates.some((date,i)=>date!==artifact.labels?.[i]))return
 const count=dates.length, digits=Number(artifact.note?.match(/保留\s*([0-8])\s*位/u)?.[1]??4)
 const mapping={version:1,type:artifact.type,title:artifact.title,...(artifact.variant?{variant:artifact.variant}:{}),observedWorkbench:{
  kind:'ecb-cross-rate',count,digits,columnNames,...(seriesNames?{seriesNames}:{}),...(artifact.unit?{unit:artifact.unit}:{}),
  ...(artifact.body?{commentary:artifact.body,initialDate:artifact.asOf}:{})
 }}
 const data=materializeEcbCrossRate(mapping,{usd:selected.usd.response,cny:selected.cny.response})
 // The latest N published dates must match the delivered window. Historical
 // slices keep their original bounds even when read from a rolling API.
 const newDates=data.labels??data.rows.map(row=>row[keys.indexOf('date')])
 if(dates.some((date,i)=>date!==newDates[i]))return
 const verified=data.detailRows??data.rows
 if(rows.some((row,i)=>!Array.isArray(row)||row.length!==keys.length||keys.some((key,j)=>
  key==='id'?row[j]!==dates[i]&&row[j]!=='FX'+(i+1):row[j]!==verified[i][j])))return
 if(artifact.type==='chart'&&artifact.series.some((series,i)=>!Array.isArray(series.values)||
  series.values.length!==count||series.values.some((value,j)=>value!==data.series[i].values[j])))return
 return {mapping,selected}
}
