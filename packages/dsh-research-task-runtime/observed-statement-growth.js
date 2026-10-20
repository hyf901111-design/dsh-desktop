// Recalculate only cells explicitly marked as computed growth. A same-report
// comparative record, full security identity and unchanged displayed amount
// establish correspondence; names or a rounded comparative amount do not.
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const pow=n=>10n**BigInt(n)
function decimal(value){
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)return
 const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u)
 if(!match)return
 const scale=(match[3]?.length??0)-Number(match[4]??0),coefficient=BigInt((match[1]??'')+match[2]+(match[3]??''))
 return scale<0?{n:coefficient*pow(-scale),scale:0}:{n:coefficient,scale}
}
function rounded(n,d){
 const negative=n<0n; if(negative)n=-n
 return (negative?-1n:1n)*(n/d+(n%d*2n>=d?1n:0n))
}
function percent(current,prior){
 const a=decimal(current),b=decimal(prior)
 if(!a||!b)return
 if(b.n<=0n)return `不适用（上年同期原始金额 ${prior} 元，零或负基期不作普通同比）`
 const basisPoints=rounded((a.n*pow(b.scale)-b.n*pow(a.scale))*10000n,b.n*pow(a.scale)),absolute=basisPoints<0n?-basisPoints:basisPoints
 return `${basisPoints<0n?'-':basisPoints>0n?'+':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}%`
}
function displayedAmountMatches(value,raw,unit){
 const text=typeof value==='number'?String(value):value
 if(typeof text!=='string'||text.length>40||!/^[-+]?\d+(?:,\d{3})*(?:\.\d{1,6})?$/u.test(text))return false
 const clean=text.replaceAll(',',''),digits=clean.split('.')[1]?.length??0,a=decimal(raw)
 if(!a)return false
 const shown=BigInt(clean.replace('.','').replace(/^\+/,'')),scale=unit==='亿元'?8:unit==='万元'?4:0
 return rounded(a.n*pow(digits),pow(a.scale+scale))===shown
}
const metricName=header=>header.replaceAll(/\s/gu,'').replace(/[（(](?:亿元|万元|元)[）)]$/u,'')
function matchingPairs(records,code,date){
 const [ticker,exchange]=code.split('.'),exchangeCD={SH:'XSHG',SZ:'XSHE',BJ:'XBEI'}[exchange],pairs=new Map()
 for(const source of records??[]){
  if(!source?.tool?.startsWith('ework__')||source.purpose==='discovery'||source.args?.nameEn!=='getFdmtISLT2018'||source.response?.retCode!==1||!Array.isArray(source.response.data)||source.response.data.length>10000)continue
  const rows=source.response.data.filter(row=>row?.ticker===ticker&&row.exchangeCD===exchangeCD&&row.secID===`${ticker}.${exchangeCD}`)
  for(const current of rows){
   if(current.endDate!==date||current.endDateRep!==date||!iso(current.publishDate)||!current.reportType||!Number.isInteger(current.fiscalPeriod)||current.fiscalPeriod<1||current.fiscalPeriod>12||!['0','1'].includes(current.mergedFlag)||current.currencyCD!=='CNY'||typeof current.accoutingStandards!=='string'||!current.accoutingStandards)continue
   const priorDate=String(Number(date.slice(0,4))-1)+date.slice(4)
   const prior=rows.filter(row=>row.endDate===priorDate&&['endDateRep','publishDate','reportType','fiscalPeriod','mergedFlag','currencyCD','accoutingStandards'].every(key=>row[key]===current[key]))
   // Multiple restatements require an explicit selection, never first-row wins.
   if(prior.length!==1)continue
   const pair={current,prior:prior[0]},key=JSON.stringify([current,prior[0]])
   pairs.set(key,pair)
  }
 }
 return pairs.size===1?[...pairs.values()][0]:undefined
}
export function observedStatementGrowth(data,records){
 if(data?.version!==1||!(data.type==='table'||data.type==='market'&&data.variant==='table')||!Array.isArray(data.columns)||data.columns.length>40||!data.columns.every(c=>typeof c==='string')||!Array.isArray(data.rows)||data.rows.length>1000)return
 const find=re=>{const found=data.columns.flatMap((c,i)=>re.test(c)?[i]:[]);return found.length===1?found[0]:-1}
 const codeColumn=find(/^(?:证券代码|股票代码|代码)(?:\s*\/\s*(?:简称|名称))?$/u),periodColumn=find(/^报告期(?:[（(][^）)]*[）)])?$/u)
 if(codeColumn<0||periodColumn<0)return
 const metrics=[{names:['营业收入','营收','收入'],field:'revenue'},{names:['归母净利润','归母净利','归母'],field:'nIncomeAttrP'}],facts=[]
 let changed=false
 const rows=data.rows.map(row=>{
  if(!Array.isArray(row)||row.length!==data.columns.length||typeof row[codeColumn]!=='string'||typeof row[periodColumn]!=='string')return row
  const codes=row[codeColumn].match(/(?<![A-Z0-9])\d{6}\.(?:SH|SZ|BJ)(?![A-Z0-9])/gu),dates=row[periodColumn].match(/\d{4}-\d{2}-\d{2}/gu)
  if(codes?.length!==1||dates?.length!==1||!iso(dates[0]))return row
  const pair=matchingPairs(records,codes[0],dates[0]);if(!pair)return row
  const output=[...row]
  for(const metric of metrics){
   const growth=find(new RegExp(`^(?:${metric.names.join('|')})同比(?:增速|增长率)?(?:[（(]计算值[）)])?$`,'u'))
   const amountColumns=data.columns.flatMap((c,i)=>metric.names.includes(metricName(c))&&/[（(](亿元|万元|元)[）)]$/u.test(c)?[i]:[])
   if(growth<0||amountColumns.length!==1)continue
   // A generated layout may put the explicit calculation marker in the cell
   // instead of its header. The metric meaning and source checks stay equal.
   const computed=/[（(]计算值[）)]$/u.test(data.columns[growth])||typeof row[growth]==='string'&&/[（(]\s*计算值(?:[，,；;：:\s）)]|$)/u.test(row[growth])
   if(!computed||/披露值|非计算值|未计算/u.test(data.columns[growth]+row[growth]))continue
   const amount=amountColumns[0],unit=data.columns[amount].match(/[（(](亿元|万元|元)[）)]$/u)[1],{current,prior}=pair
   if(!displayedAmountMatches(row[amount],current[metric.field],unit)||typeof row[growth]!=='string')continue
   const original=row[growth].match(/^[+-]?\d+(?:\.\d+)?%/u),value=percent(current[metric.field],prior[metric.field])
   if(!original||!value)continue
   const cell=value.startsWith('不适用')?value:value+row[growth].slice(original[0].length)
   if(cell===row[growth])continue
   output[growth]=cell;changed=true
   facts.push({cell:output,column:growth,text:`${codes[0]} ${metric.names[0]}：${current.endDate} 原始金额 ${current[metric.field]} 元；${prior.endDate} 比较期 ${prior[metric.field]} 元（同份披露 ${current.publishDate}），${value}。`})
  }
  return output
 })
 if(!changed)return
 const provenance='宿主使用同份利润表、同币种和合并口径的原始金额计算同比，最后保留两位小数。'+facts.map(fact=>fact.text).join('')
 const note=[data.note,provenance].filter(Boolean).join('\n')
 // Keep the user's source/limitation text intact, including on a long note.
 if(note.length>2000){
  for(const fact of facts)fact.cell[fact.column]+='；宿主按原始金额计算：'+fact.text
  return {...data,rows}
 }
 return {...data,rows,note}
}
