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
function percent(current,prior,digits=2){
 if(!Number.isInteger(digits)||digits<0||digits>12)return
 const a=decimal(current),b=decimal(prior)
 if(!a||!b)return
 if(b.n<=0n)return `不适用（上年同期原始金额 ${prior} 元，零或负基期不作普通同比）`
 const factor=pow(digits),basisPoints=rounded((a.n*pow(b.scale)-b.n*pow(a.scale))*100n*factor,b.n*pow(a.scale)),absolute=basisPoints<0n?-basisPoints:basisPoints
 return `${basisPoints<0n?'-':basisPoints>0n?'+':''}${absolute/factor}${digits?'.'+String(absolute%factor).padStart(digits,'0'):''}%`
}
export function displayedAmountMatches(value,raw,unit){
 const text=typeof value==='number'?String(value):value
 if(typeof text!=='string'||text.length>40||!/^[-+]?\d+(?:,\d{3})*(?:\.\d{1,12})?$/u.test(text))return false
 const clean=text.replaceAll(',',''),digits=clean.split('.')[1]?.length??0,a=decimal(raw)
 if(!a)return false
 const shown=BigInt(clean.replace('.','').replace(/^\+/,'')),scale=unit==='亿元'?8:unit==='万元'?4:0
 return rounded(a.n*pow(digits),pow(a.scale+scale))===shown
}
function financialAmountMatches(value,raw,header,metric){
 const headerUnit=header.match(/[（(](亿元|万元|元)[）)]$/u)?.[1]
 if(headerUnit&&displayedAmountMatches(value,raw,headerUnit))return true
 if(typeof value!=='string'||value.length>120)return false
 const label=metric.names.toSorted((a,b)=>b.length-a.length).find(name=>value.startsWith(name))
 if(label)value=value.slice(label.length).trim().replace(/^[:：]\s*/u,'')
 const amount='([-+]?\\d+(?:,\\d{3})*(?:\\.\\d{1,6})?)'
 const inline=value.trim().match(new RegExp(`^${amount}\\s*(亿元|万元|元)(?:\\s*[（(]\\s*${amount}\\s*(亿元|万元|元)(?:[，,]\\s*(?:人民币|CNY))?\\s*[）)])?$`,'u'))
 if(!inline||headerUnit&&headerUnit!==inline[2]||!displayedAmountMatches(inline[1],raw,inline[2]))return false
 return inline[3]===undefined||displayedAmountMatches(inline[3],raw,inline[4])
}
const metricName=header=>header.replaceAll(/\s/gu,'').replace(/[（(](?:亿元|万元|元|原始值|原始金额|原始数值)[）)]$/u,'')
const metrics=[{names:['营业收入','营收','收入'],field:'revenue'},{names:['归母净利润','归母净利','归母'],field:'nIncomeAttrP'}]
const securityCodes=value=>typeof value==='string'?value.match(/(?<![A-Z0-9])\d{6}\.(?:SH|SZ|BJ)(?![A-Z0-9])/gu)??[]:[]
function longMetric(row,columns,metric){
 const labels=columns.flatMap((column,i)=>/^(?:指标|财务指标|项目|科目)$/u.test(column)?[i]:[])
 return labels.length===1&&typeof row[labels[0]]==='string'&&metric.names.includes(metricName(row[labels[0]]))
}
function amountColumns(row,columns,metric){
 return columns.flatMap((column,i)=>metric.names.includes(metricName(column))||longMetric(row,columns,metric)&&/^(?:数值|金额|本期(?:数值|金额|值)?)(?:[（(](?:亿元|万元|元)[）)])?$/u.test(column)?[i]:[])
}
function growthColumn(row,columns,metric){
 const specific=new RegExp(`^(?:${metric.names.join('|')})同比(?:增速|增长率)?(?:[（(]计算值[）)])?$`,'u')
 const found=columns.flatMap((column,i)=>specific.test(column)||longMetric(row,columns,metric)&&/^同比(?:增速|增长率)?(?:[（(]计算值[）)])?$/u.test(column)?[i]:[])
 return found.length===1?found[0]:-1
}
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
 return [...pairs.values()]
}
// Presentation headers are not evidence. Locate the single full security code
// and source report date across the row, then reject any other displayed date
// except that same disclosure's publication date. A combined period/disclosure
// field needs an explicitly labelled publication date; ranges remain ambiguous.
function rowCorrespondence(row,records,columns){
 const codes=row.flatMap(securityCodes)
 // Financial and operating disclosures can legitimately have different dates.
 // Prefer an explicit report-period field, while keeping the old all-row
 // ambiguity check when presentation columns do not identify that field.
 const periodColumns=columns.flatMap((column,i)=>!/经营|来源/u.test(column)&&/报告期|会计期间|财报期间|^期间$/u.test(column)?[i]:[])
 const timingColumns=periodColumns.length?[...new Set([...periodColumns,...columns.flatMap((column,i)=>/^(?:财报|报告)?(?:披露日期|披露日|发布日期)$/u.test(column)?[i]:[])])]:row.map((_,i)=>i)
 const dateCells=timingColumns.map(i=>typeof row[i]==='string'?row[i].match(/\d{4}-\d{2}-\d{2}/gu)??[]:[]),declared=[],publications=[],periods=[]
 for(const i of timingColumns){
  if(typeof row[i]!=='string')continue
  for(const match of row[i].matchAll(/(?:披露|发布)(?:日期|日)?\s*[:：]?\s*(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2}-\d{2})\s*(?:披露|发布)/gu))publications.push(match[1]??match[2])
  for(const match of row[i].matchAll(/(?:截至|截止|报告期|期末)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/gu))periods.push(match[1])
 }
 for(const i of periodColumns){
  if(typeof row[i]!=='string')continue
  // A stated calendar reporting period is exact evidence, never an inference
  // from "latest", the publication date, or an operating-period caption.
  for(const match of row[i].matchAll(/(20\d{2})\s*年?\s*(?:上半年|半年报|半年度(?:报告)?|中报|H1)(?![A-Z0-9])/giu))declared.push({date:match[1]+'-06-30',span:6,type:'S1'})
  for(const match of row[i].matchAll(/(20\d{2})\s*年?\s*(?:年度报告|年报)(?![A-Z0-9])/giu))declared.push({date:match[1]+'-12-31',span:12,type:'A'})
 }
 if(codes.length!==1||dateCells.some((dates,index)=>{
  if(dates.length<=1)return false
  const column=timingColumns[index],value=row[column],publication=typeof value==='string'?[...value.matchAll(/(?:披露|发布)(?:日期|日)?\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/gu)]:[]
  return dates.length!==2||!periodColumns.includes(column)||!/披露|发布/u.test(columns[column])||publication.length!==1||!dates.includes(publication[0][1])||/至|到|~|～|—|–/u.test(value)
 }))return
 const dates=[...new Set(dateCells.flat())]
 if(!dates.length&&!declared.length||dates.some(date=>!iso(date)))return
 const scope=[...columns,...row].filter(value=>typeof value==='string').join('\n'),parent=/母公司(?:口径|利润表)|非合并(?:口径|利润表)|个别(?:口径|报表)/u.test(scope),merged=/(?<!非)合并(?:口径|利润表)/u.test(scope)
 if(parent&&merged)return
 const amounts=metrics.flatMap(metric=>amountColumns(row,columns,metric).map(column=>({metric,column})))
 const candidates=[...new Set([...dates,...declared.map(period=>period.date)])],pairs=candidates.flatMap(date=>matchingPairs(records,codes[0],date)).filter(pair=>
  !dates.some(date=>date!==pair.current.endDate&&date!==pair.current.publishDate)&&
  !publications.some(date=>date!==pair.current.publishDate)&&!periods.some(date=>date!==pair.current.endDate)&&
  !declared.some(period=>period.date!==pair.current.endDate||period.span!==pair.current.fiscalPeriod||period.type!==pair.current.reportType)&&
  (!parent&&!merged||pair.current.mergedFlag===(parent?'0':'1'))&&
  amounts.some(({metric,column})=>financialAmountMatches(row[column],pair.current[metric.field],columns[column],metric)))
 // Displayed values can distinguish parent/consolidated rows returned together;
 // identical amounts with different comparative records stay unresolved.
 if(pairs.length!==1)return
 const identity=row.find(value=>securityCodes(value).length),name=identity.replace(codes[0],'').replace(/[\s()（）/·]/gu,'')
 return {code:codes[0],name,...pairs[0]}
}

// Only replace a pure list repeating this table's explicitly computed cells.
// Every name must unambiguously identify a validated row and every percentage
// must equal that row's pre-normalization cell. Dates, analysis, reported values
// and unknown clauses stay untouched; this is not a global number replacement.
function computedNarrative(note,facts){
 if(typeof note!=='string'||!facts.length)return note
 const names=metrics.flatMap(metric=>metric.names).join('|')
 return note.replace(new RegExp(`(^|[。；;\\n])(\\s*(?:${names})同比(?:增速|增长率)?)([：:])([^。；;\\n]{1,600})(?=[。；;\\n]|$)`,'gu'),(original,boundary,heading,colon,body)=>{
  const metric=metrics.find(metric=>metric.names.some(name=>heading.trim().startsWith(name+'同比')))
  const entries=body.trim().split(/[、，,]/u),matched=[],seen=new Set()
  if(!metric||entries.length>40)return original
  for(const entry of entries){
   const match=entry.trim().match(/^(.+?)\s*([+-]?\d+(?:\.\d+)?%)$/u)
   if(!match)return original
   const label=match[1].trim(),candidates=facts.filter(fact=>fact.field===metric.field&&(label===fact.code||/^[\p{Script=Han}]{2,}$/u.test(label)&&fact.name.startsWith(label))&&Number(match[2].slice(0,-1))===Number(fact.original.slice(0,-1)))
   if(candidates.length!==1||seen.has(candidates[0].code))return original
   seen.add(candidates[0].code);matched.push({fact:candidates[0],shown:match[2]})
  }
  if(!matched.some(({fact,shown})=>fact.value!==shown))return original
  return boundary+heading+colon+matched.map(({fact})=>fact.code+' '+fact.value).join('、')
 })
}
export function observedStatementGrowth(data,records){
 if(data?.version!==1||!(data.type==='table'||data.type==='market'&&data.variant==='table')||!Array.isArray(data.columns)||data.columns.length>40||!data.columns.every(c=>typeof c==='string')||!Array.isArray(data.rows)||data.rows.length>1000)return
 const facts=[]
 let changed=false
 const rows=data.rows.map(row=>{
  if(!Array.isArray(row)||row.length!==data.columns.length)return row
  const pair=rowCorrespondence(row,records,data.columns);if(!pair)return row
  const output=[...row]
  for(const metric of metrics){
   const growth=growthColumn(row,data.columns,metric)
   const amounts=amountColumns(row,data.columns,metric).filter(i=>financialAmountMatches(row[i],pair.current[metric.field],data.columns[i],metric))
   if(growth<0||amounts.length!==1)continue
   const computed=/[（(]计算值[）)]$/u.test(data.columns[growth])||typeof row[growth]==='string'&&/[（(]\s*计算值(?:[，,；;：:\s）)]|$)/u.test(row[growth])
   if(!computed||/披露值|非计算值|未计算/u.test(data.columns[growth]+row[growth]))continue
   const {current,prior,code,name}=pair
   if(typeof row[growth]!=='string')continue
   const original=row[growth].match(/^[+-]?\d+(?:\.\d+)?%/u),value=percent(current[metric.field],prior[metric.field])
   if(!original||!value)continue
   const cell=value.startsWith('不适用')?value:value+row[growth].slice(original[0].length)
   const fact={cell:output,column:growth,field:metric.field,code,name,original:original[0],value,changed:cell!==row[growth],text:`${code} ${metric.names[0]}：${current.endDate} 原始金额 ${current[metric.field]} 元；${prior.endDate} 比较期 ${prior[metric.field]} 元（同份披露 ${current.publishDate}），${value}。`}
   facts.push(fact)
   if(!fact.changed)continue
   output[growth]=cell;changed=true
  }
  return output
 })
 const correctedNote=computedNarrative(data.note,facts)
 if(!changed&&correctedNote===data.note)return
 const changedFacts=facts.filter(fact=>fact.changed)
 const provenance=changedFacts.length?'宿主使用同份利润表、同币种和相同报表口径的原始金额计算同比，最后保留两位小数。'+changedFacts.map(fact=>fact.text).join(''):''
 const note=[correctedNote,provenance].filter(Boolean).join('\n')
 // Keep the user's source/limitation text intact, including on a long note.
 if(note.length>2000){
  for(const fact of changedFacts)fact.cell[fact.column]+='；宿主按原始金额计算：'+fact.text
  return {...data,rows,...(correctedNote!==data.note?{note:correctedNote}:{})}
 }
 return {...data,rows,note}
}

export {percent as statementGrowthPercent}
