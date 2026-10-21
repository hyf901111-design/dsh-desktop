import {readTemplateModel} from './component-template-registry.js'
import {displayedAmountMatches,statementGrowthPercent} from './observed-statement-growth.js'

const apis=['getFdmtMainDataLt','getFdmtISLT2018','getFdmtCFLT']
const fields=['revenue','nIncomeAttrP','grossMargin','roeW','revenueYoy','niAttrPYoy','nCFOpa']
const iso=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const security=text=>[...new Set(typeof text==='string'?(text.match(/(?<![A-Z0-9])\d{6}\.(?:XSHE|XSHG|SZ|SH)(?![A-Z0-9])/gu)??[]).map(code=>code.replace(/\.SZ$/u,'.XSHE').replace(/\.SH$/u,'.XSHG')):[])]
const sourceRecords=records=>records.filter(record=>record?.tool?.startsWith('ework__')&&record.purpose!=='discovery'&&record.args?.http_method==='GET'&&apis.includes(record.args?.nameEn)&&record.response?.retCode===1&&Array.isArray(record.response.data))
const rowCode=row=>typeof row?.secID==='string'&&row.secID===`${row.ticker}.${row.exchangeCD}`&&security(row.secID)[0]===row.secID?row.secID:undefined
const textOf=data=>[data.title,data.asOf,data.note,data.source].filter(v=>typeof v==='string').join('\n')
const missing=value=>value===null||typeof value==='string'&&/^(?:—|--|N\/A|本次未取得|未取得|来源未提供|来源缺失|来源返回null|来源返回 null|未披露|不适用)(?:[（(：:].*)?$/iu.test(value.trim())
function columnMetric(header){
 const label=header.replace(/\s/gu,'').replace(/[（(](?:亿元|万元|元|%|％|计算值)[）)]/gu,'')
 const names=[['营业收入|营收','revenue','revenueYoy'],['归母净利润|归母净利','nIncomeAttrP','niAttrPYoy']]
 for(const [name,amount,yoy] of names){
  if(new RegExp(`^(?:${name})$`,'u').test(label))return {fields:[amount]}
  if(new RegExp(`^(?:${name})同比(?:增速|增长率)?$`,'u').test(label))return {fields:[yoy]}
  if(new RegExp(`^(?:${name})[/／]同比(?:增速|增长率)?$`,'u').test(label))return {fields:[amount,yoy]}
 }
 if(/^(?:销售)?毛利率$/u.test(label))return {fields:['grossMargin']}
 if(/^(?:加权(?:平均)?ROE|加权平均净资产收益率|roeW)$/iu.test(label))return {fields:['roeW']}
 if(/^(?:经营活动(?:产生的)?现金流(?:量)?净额|经营现金流净额|nCFOpa)$/u.test(label))return {fields:['nCFOpa']}
 if(/毛利率|ROE|净资产收益率|经营.*现金流|(?:营业收入|营收|归母净利).*同比/iu.test(label))return {ambiguous:true}
}
function correspondence(row,columns){
 const codes=[...new Set(row.flatMap(security))]
 const periodColumns=columns.flatMap((column,i)=>/报告期|会计期间|财报期间|^期间$/u.test(column)&&!/经营/u.test(column)?[i]:[])
 const periods=[],publications=[]
 for(const i of periodColumns){
  const text=typeof row[i]==='string'?row[i]:''
  // The second date must be explicitly labelled as a disclosure date. Never
  // interpret an arbitrary range, a publication date, or "latest" as endDate.
  const pub=[...text.matchAll(/(?:披露|发布)(?:日期|日)?\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})|(20\d{2}-\d{2}-\d{2})\s*(?:披露|发布)/gu)].map(m=>m[1]??m[2])
  publications.push(...pub)
  periods.push(...(text.match(/20\d{2}-\d{2}-\d{2}/gu)??[]).filter(date=>!pub.includes(date)))
  if(/至|到|~|～/u.test(text))return
 }
 const unique=[...new Set(periods)]
 if(codes.length!==1||unique.length!==1||!iso(unique[0])||publications.some(date=>!iso(date)))return
 return {code:codes[0],date:unique[0],publications}
}
function scopeFlag(text){
 const parent=/母公司(?:口径|利润表|报表)|非合并(?:口径|利润表)/u.test(text),merged=/(?<!非)合并(?:口径|利润表|报表)/u.test(text)
 return parent&&merged?'conflict':parent?'2':merged?'1':undefined
}
function candidates(records,id,field,scope){
 const api=['revenue','nIncomeAttrP'].includes(field)?'getFdmtISLT2018':field==='nCFOpa'?'getFdmtCFLT':'getFdmtMainDataLt'
 return records.filter(record=>record.args.nameEn===api).flatMap(record=>record.response.data).filter(row=>rowCode(row)===id.code&&row.endDate===id.date&&iso(row.endDateRep)&&iso(row.publishDate)&&(!id.publications.length||id.publications.every(date=>date===row.publishDate))&&(!scope||row.mergedFlag===scope))
}
function expectedValue(rows,field){
 if(!rows.length)return {reason:'同公司同期间的来源记录未取得'}
 // Even equal numbers in different revisions/scopes cannot prove correspondence.
 const identities=new Set(rows.map(row=>JSON.stringify([row.endDateRep,row.publishDate,row.reportType,row.fiscalPeriod,row.mergedFlag,row.currencyCD,row.accoutingStandards])))
 if(identities.size!==1||rows.some(row=>!['1','2'].includes(row.mergedFlag)))return {reason:'存在冲突修订或报表口径，需明确选取同一披露记录'}
 const values=[...new Set(rows.map(row=>row[field]))]
 if(values.length!==1)return {reason:'同一字段存在冲突修订值'}
 if(values[0]===null)return {reason:'来源字段为 null'}
 if(values[0]===undefined)return {reason:'来源明确缺少该字段'}
 if(typeof values[0]!=='number'||!Number.isFinite(values[0]))return {reason:'来源字段不是有限数值'}
 if(['revenue','nIncomeAttrP','nCFOpa'].includes(field)&&rows.some(row=>row.currencyCD!=='CNY'))return {reason:'来源币种未明确为 CNY'}
 return {value:values[0]}
}
function cellMatches(cell,expected,field,header){
 const percent=['grossMargin','roeW','revenueYoy','niAttrPYoy'].includes(field)
 let value=typeof cell==='number'?String(cell):typeof cell==='string'?cell.trim():''
 if(percent){
  const matched=value.match(/^([+-]?\d+(?:,\d{3})*(?:\.\d{1,12})?)\s*[%％](?:[（(][^）)]*[）)])?$/u)
  if(matched)value=matched[1]
  else if(!/[%％]/u.test(header))return false
  return displayedAmountMatches(value,expected,'元')
 }
 const inline=value.match(/^([+-]?\d+(?:,\d{3})*(?:\.\d{1,12})?)\s*(亿元|万元|元)$/u)
 const unit=header.match(/亿元|万元|元/u)?.[0]
 if(inline&&unit&&unit!==inline[2])return false
 return Boolean(inline||unit)&&displayedAmountMatches(inline?.[1]??value,expected,inline?.[2]??unit)
}
function computedGrowth(records,id,field,scope,cell){
 const numeric=String(cell).match(/^[-+]?\d+(?:,\d{3})*(?:\.(\d{1,12}))?\s*[%％]/u)
 if(!numeric)return
 const digits=numeric[1]?.length??0
 const amount=field==='revenueYoy'?'revenue':'nIncomeAttrP',current=candidates(records,id,amount,scope)
 const expected=expectedValue(current,amount);if(expected.value===undefined)return
 const first=current[0],priorDate=String(Number(id.date.slice(0,4))-1)+id.date.slice(4)
 if(typeof first.accoutingStandards!=='string'||!first.accoutingStandards||typeof first.reportType!=='string'||!first.reportType||!Number.isInteger(first.fiscalPeriod)||first.fiscalPeriod<1||first.fiscalPeriod>12)return
 const prior=records.filter(record=>record.args.nameEn==='getFdmtISLT2018').flatMap(record=>record.response.data).filter(row=>rowCode(row)===id.code&&row.endDate===priorDate&&['endDateRep','publishDate','reportType','fiscalPeriod','mergedFlag','currencyCD','accoutingStandards'].every(key=>row[key]===first[key]))
 const before=expectedValue(prior,amount)
 if(before.value===undefined||before.value<=0)return
 const value=Number(statementGrowthPercent(expected.value,before.value,digits)?.replace('%',''))
 return Number.isFinite(value)?value:undefined
}

// Undefined means no issue in this deliberately narrow guard, not an audit of
// arbitrary prose, other providers, or unrelated table fields.
export function statementTableEvidenceIssue(spec,request='',records=[],{requiredData}={}){
 const data=readTemplateModel(spec)?.data??spec
 const previous=readTemplateModel(requiredData)?.data??requiredData
 if(data?.type==='error')return
 if(!data||!(data.type==='table'||data.type==='market'&&data.variant==='table'))return previous?'财务表来源核验未通过：修复不得替换为文字或无可核验表模型的 HTML；保留原有公司与全部财务字段。':undefined
 const simulated=request.split(/[。；;\n]/u).some(part=>!/(?:不要|禁止|不用|不使用|无需|不得).{0,16}(?:模拟|演示|示例)/u.test(part)&&/(?:仅|只|全部)(?:用|使用).{0,4}模拟数据|^(?:模拟|演示|示例)数据/iu.test(part))
 if(simulated)return
 const sources=sourceRecords(records);if(!sources.length)return
 const metadata=textOf(data)
 if(!previous&&!/DataYes|通联/iu.test(request)&&/东方财富|Wind|同花顺|公司公告|交易所/iu.test(request)&&/(?:数据来源|来源)[:：]\s*(?:东方财富|Wind|同花顺|公司公告|交易所)/iu.test(metadata)&&!/DataYes|通联/iu.test(metadata))return
 if(!Array.isArray(data.columns)||!data.columns.every(c=>typeof c==='string')||!Array.isArray(data.rows))return previous?'财务表来源核验未通过：修复后表格结构无法核验，请保留全部列与公司。':undefined
 const metrics=data.columns.map(columnMetric)
 if(!previous&&!metrics.some(metric=>metric?.ambiguous||metric?.fields.some(field=>!['revenue','nIncomeAttrP'].includes(field)))){
  const financialRows=data.rows.some(row=>Array.isArray(row)&&row.some(cell=>typeof cell==='string'&&/毛利率|ROE|经营.*现金流|(?:营业收入|营收|归母净利).*同比/iu.test(cell)))
  return financialRows?'财务表来源核验未通过：当前财务字段位于未支持的行结构，无法逐字段核验；请明确证券、报告期和指标字段，不将未知结构标为已证明。':undefined
 }
 const issues=[],add=message=>{if(issues.length<24)issues.push(message)}
 if(previous?.columns&&previous.columns.some(column=>!data.columns.includes(column)))add('修复不得删除原有财务字段/列；缺失需保留并说明')
 const previousCodes=previous?.rows?.flatMap(row=>Array.isArray(row)?row.flatMap(security):[])??[]
 const requestedCodes=security(request).filter(code=>sources.some(source=>source.response.data.some(row=>rowCode(row)===code)))
 const outputCodes=data.rows.flatMap(row=>Array.isArray(row)?row.flatMap(security):[])
 for(const code of new Set([...requestedCodes,...previousCodes]))if(!outputCodes.includes(code))add(`${code}：修复不得删除公司`)
 const currentIdentities=data.rows.filter(Array.isArray).map(row=>correspondence(row,data.columns)).filter(Boolean)
 for(const row of previous?.rows??[]){
  const prior=Array.isArray(row)&&correspondence(row,previous.columns)
  if(prior&&!currentIdentities.some(current=>current.code===prior.code&&current.date===prior.date))add(`${prior.code} ${prior.date}：修复不得删除或切换原报告期`)
 }
 const scope=scopeFlag([metadata,...data.columns].join('\n'))
 for(const row of data.rows){
  if(!Array.isArray(row)||row.length!==data.columns.length){add('财务表行结构无法核验，请保留字段并使用明确单元格');continue}
  const id=correspondence(row,data.columns),label=id?`${id.code} ${id.date}`:'证券/报告期不明确'
  for(let i=0;i<metrics.length;i++){
   const metric=metrics[i];if(!metric)continue
   if(metric.ambiguous){add(`${label} ${data.columns[i]}：字段口径含糊，无法核验`);continue}
   const cells=metric.fields.length===2&&typeof row[i]==='string'?row[i].split(/\s*[/／]\s*/u):[row[i]]
   for(let j=0;j<metric.fields.length;j++){
    const field=metric.fields[j],cell=cells[j]
    if(missing(cell)){
     if(id&&scope!=='conflict'&&expectedValue(candidates(sources,id,field,scope),field).value!==undefined)add(`${label} ${field}：同期间来源已取得，不能改成缺失来规避核验`)
     continue
    }
    if(!id){add(`${label} ${field}：需明确证券代码与实际报告期，不能按名称或发布日期猜测`);continue}
    if(scope==='conflict'){add(`${label} ${field}：报表口径冲突`);continue}
    if(cells.length!==metric.fields.length){add(`${label} ${field}：金额/同比单元格结构无法核验`);continue}
    const selected=candidates(sources,id,field,scope),expected=expectedValue(selected,field)
    if(['revenueYoy','niAttrPYoy'].includes(field)&&(/计算值/u.test(data.columns[i]+String(cell))||!selected.length&&!/披露值|接口值|直接取/u.test(data.columns[i]+String(cell)))){
     const calculated=computedGrowth(sources,id,field,scope,cell)
     expected.value=calculated
     if(calculated===undefined)expected.reason='计算同比缺少同份披露、同口径的本期/上年同期原始金额，或基期不为正数'
    }
    if(expected.value===undefined)add(`${label} ${field}：${expected.reason}；不能由比例倒算或以其他公司/期间数值替代`)
    else if(!cellMatches(cell,expected.value,field,data.columns[i]))add(`${label} ${field}：展示 ${String(cell)} 与同期间来源 ${expected.value}${['revenue','nIncomeAttrP','nCFOpa'].includes(field)?' 元':'%'} 不符`)
   }
  }
 }
 // Check only the known false provenance pattern reproduced by this incident.
 // A negative statement about an unqueried API is an honest limitation.
 for(const api of apis){
  if(sources.some(source=>source.args.nameEn===api))continue
  for(const clause of metadata.split(/[。；;\n]/u))if(clause.includes(api)&&!/未(?:实际)?(?:查询|调用|取得|获取)|没有(?:调用|查询)|尚未|未返回/u.test(clause)&&/来源|成功|获取|取得|查询|调用/u.test(clause))add(`${api}：没有实际成功业务响应，请修正来源声明`)
 }
 for(const clause of metadata.split(/[。；;\n]/u))if(/(?:grossMargin|roeW|revenueYoy|niAttrPYoy|nCFOpa)\s*[=＝:：（(]\s*[-+]?\d/u.test(clause))add('正文包含未逐公司/报告期对应的财务字段数值声明；请与表格同步核对，将数值保留在可核验的字段单元格，说明中保留来源、口径与限制')
 const hasMissing=data.rows.some(row=>Array.isArray(row)&&row.some(missing))
 if(hasMissing&&/无缺失指标|全部指标(?:已取得|完整)|全部取到/u.test(metadata))add('缺失字段与“无缺失指标/全部已取得”声明冲突，请同步修正说明')
 if(issues.length)return '财务表来源核验未通过：'+issues.join('；')+'。复用已取得记录，仅修正这些字段或实际补查缺失字段；保留全部公司和列，不重新规划研究，不补造金额，并同步修正来源和缺失说明。'
}

export function statementTableRepairEvidence(records=[]){
 const keys=['secID','ticker','exchangeCD','secShortName','endDate','endDateRep','publishDate','reportType','fiscalPeriod','mergedFlag','currencyCD','accoutingStandards',...fields]
 const sources=sourceRecords(records).slice(0,32)
 const evidence=sources.map(record=>({tool:record.tool,args:record.args,receivedRows:record.response.data.length,selectedRows:0,data:[]}))
 // Keep this bounded recovery smaller than a new research prompt. Distribute
 // rows across calls so a long first response cannot hide later companies.
 if(Buffer.byteLength(JSON.stringify(evidence))>32000)for(const entry of evidence){entry.args={nameEn:entry.args.nameEn};entry.argumentsOmitted=true}
 let bytes=Buffer.byteLength(JSON.stringify(evidence))
 for(let i=0;i<200;i++)for(let j=0;j<sources.length;j++){
  const row=sources[j].response.data[i];if(!row||typeof row!=='object')continue
  const projected=Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]))
  const size=Buffer.byteLength(JSON.stringify(projected))+1
  if(bytes+size>47000)continue
  evidence[j].data.push(projected);bytes+=size
 }
 for(const entry of evidence)entry.selectedRows=entry.data.length
 return JSON.stringify(evidence)
}
