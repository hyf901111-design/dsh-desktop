import {isObject,isText,periodKey} from './schema.mjs'

const fail=(code,message)=>{throw Error(code+':'+message)}
const exactKeys=(value,allowed)=>isObject(value)&&Object.keys(value).every(key=>allowed.includes(key))
const originalLine=(lines,n)=>Number.isInteger(n)&&n>=1&&n<=lines.length?lines[n-1]:null
const reportPeriod=text=>typeof text==='string'&&/报告$/.test(text)&&/^(?:FY20\d{2}|20\d{2}(?:H1|Q[1-4]))$/.test(periodKey(text)??'')?periodKey(text):null
const reportEnd=period=>/^FY/.test(period)?period.slice(2)+'-12-31':period.slice(0,4)+'-'+({H1:'06-30',Q1:'03-31',Q2:'06-30',Q3:'09-30',Q4:'12-31'}[period.slice(4)])
const roles={current:new Set(['本期金额','本期发生额','本期数']),prior:new Set(['上期金额','上期发生额','上年同期数'])}

export function resolveFactUnitMapping(packet,fact){
 const mapping=fact.evidence?.unitMapping
 if(mapping===undefined)return null
 if(packet.schemaVersion!==2||!exactKeys(mapping,['kind'])||mapping.kind!=='per-share-currency'||!['cashDividendPerShare','basicEarningsPerShare','dilutedEarningsPerShare','netAssetsPerShare'].includes(fact.metric)||!fact.evidence.metricText.includes('每股')||!['元','人民币元'].includes(fact.evidence.unitText)||fact.unit!=='CNY_per_share')fail('UNIT_MAPPING','每股金额映射仅接受含每股字面的受控股利/EPS/每股净资产指标及无倍率的原文人民币元。')
 return{kind:mapping.kind,unit:'CNY_per_share',scale:'1'}
}

function reportTitle(packet,mapping,lines,locator,valueLine){
 const title=originalLine(lines,mapping.reportTitleLine),period=reportPeriod(mapping.reportPeriodText)
 if(!period||!title||!title.trim().endsWith(mapping.reportPeriodText)||mapping.reportTitleLine<locator.lineStart||mapping.reportTitleLine>=valueLine)fail('PERIOD_MAPPING','报告期必须逐字来自本证据窗口内、目标值之前的真实报告标题。')
 const compact=title.replace(/\s/g,''),suffix=mapping.reportPeriodText.replace(/\s/g,''),issuer=compact.slice(0,-suffix.length),allowedIssuers=['',packet.company.name,...(packet.entityScopes??[])].map(name=>name.replace(/\s/g,''))
 if(!allowedIssuers.includes(issuer))fail('PERIOD_MAPPING','报告标题只能是报告期标题本身或已声明公司的完整报告标题，正文中的引用不构成报告标题。')
 return period
}
function recognizedReportTitlePeriod(packet,line){
 const title=line.replace(/\s/g,'')
 for(const issuer of ['',packet.company.name,...(packet.entityScopes??[])]){
  const name=issuer.replace(/\s/g,'')
  if(title.startsWith(name)){const period=reportPeriod(title.slice(name.length));if(period)return period}
 }
 return null
}

export function resolveFactPeriodMapping(packet,fact,lines){
 const evidence=fact.evidence,m=evidence?.periodMapping,loc=evidence?.locator
 if(m===undefined)return null
 if(packet.schemaVersion!==2||!isObject(m)||!Number.isInteger(loc?.column))fail('PERIOD_MAPPING','受控期间映射仅用于v2且必须指定实际TSV列。')
 const valueLine=loc.valueLine??(loc.lineStart===loc.lineEnd?loc.lineStart:undefined),row=originalLine(lines,valueLine)
 if(!row)fail('PERIOD_MAPPING','期间映射需要有效目标行。')
 const period=reportTitle(packet,m,lines,loc,valueLine)
 if(m.kind==='report-current-prior'){
  if(!exactKeys(m,['kind','reportTitleLine','reportPeriodText','headerLine','role'])||!roles[m.role]||!roles[m.role].has(evidence.periodText)||!Number.isInteger(m.headerLine)||m.headerLine<=m.reportTitleLine||m.headerLine>=valueLine||originalLine(lines,m.headerLine)?.split('\t')[loc.column-1]?.trim()!==evidence.periodText)fail('PERIOD_MAPPING','本期/上期角色必须匹配真实报告标题之后、目标值之前同列的原字面表头。')
  for(let n=m.reportTitleLine+1;n<valueLine;n++){
   const cells=lines[n-1].split('\t'),token=cells[loc.column-1]?.trim()
   const nearerReportPeriod=recognizedReportTitlePeriod(packet,cells[0])
   if(nearerReportPeriod&&nearerReportPeriod!==period)fail('PERIOD_MAPPING','锚定标题至目标值之间出现不同期间的较新报告标题，不能沿用旧报告本期/上期映射。')
   if(n<=m.headerLine)continue
   if(roles.current.has(token)||roles.prior.has(token)||/^(?:FY20\d{2}|20\d{2}(?:[HQ]|年|-))/.test(token??'')&&periodKey(token))fail('PERIOD_MAPPING','目标值前出现较新的期间表头，不能跨用旧本期/上期映射。')
  }
  const mapped=m.role==='current'?period:period.replace(/20\d{2}/,year=>String(Number(year)-1))
  if(periodKey(fact.period)!==mapped)fail('PERIOD_MAPPING','事实期间须等于报告本期或同频上年期间，不能任意覆盖。')
  return{kind:m.kind,period:mapped,reportPeriod:period}
 }
 if(m.kind==='share-capital-period-end'){
  if(!exactKeys(m,['kind','reportTitleLine','reportPeriodText','groupHeaderLine','subHeaderLine'])||fact.metric!=='shares'||evidence.periodText!=='本次变动后'||!Number.isInteger(m.groupHeaderLine)||!Number.isInteger(m.subHeaderLine)||m.groupHeaderLine<=m.reportTitleLine||m.subHeaderLine<=m.groupHeaderLine||m.subHeaderLine>=valueLine)fail('PERIOD_MAPPING','期末股本映射仅适用股份总数，须引用真实分组表头与数量/比例子表头。')
  const group=originalLine(lines,m.groupHeaderLine)?.split('\t').map(x=>x.trim()),sub=originalLine(lines,m.subHeaderLine)?.split('\t').map(x=>x.trim()),cells=row.split('\t')
  if(!group||group.at(-1)!=='本次变动后'||!sub||sub.length!==cells.length-1||sub.at(-2)!=='数量'||!/^比例[（(][%％][）)]$/.test(sub.at(-1))||loc.column!==cells.length-1||sub[loc.column-2]!=='数量'||fact.period!==reportEnd(period)||evidence.unitText!=='股')fail('PERIOD_MAPPING','只能取最后本次变动后分组的数量列，不能取变动前、百分比或错误报告期末。')
  const unitLines=[]
  for(let n=loc.lineStart;n<m.groupHeaderLine;n++)if(/^\s*单位\s*[:：]\s*股\s*$/.test(lines[n-1]))unitLines.push(n)
  const unitLine=unitLines.at(-1)
  if(!unitLine||lines.slice(unitLine,valueLine-1).some(line=>/^\s*单位\s*[:：]/.test(line)&&!/^\s*单位\s*[:：]\s*股\s*$/.test(line)))fail('PERIOD_MAPPING','股本数量必须有独立的原文单位：股，不能借用相邻比例表头或其他金额单位。')
  return{kind:m.kind,period:reportEnd(period),reportPeriod:period,shareQuantity:true,unitLine}
 }
 fail('PERIOD_MAPPING','不支持任意作者期间声明，仅接受两种受控映射。')
}

// Report page furniture is not a statement scope. This recognizer is used for
// carrying a real scope chapter forward, never for ordinary prose mentions.
export function explicitScopeHeadings(line,allowedScopes=['合并','母公司']){
 const result=new Set(),compact=line.trim(),label=compact.match(/^(?:范围|报表范围|口径)\s*[:：]\s*(.*)$/)
 for(const scope of allowedScopes){
  if(label&&(label[1]===scope||label[1].startsWith(scope+' ')||label[1].startsWith(scope+'\t')))result.add(scope)
  if(['合并','母公司'].includes(scope)&&new RegExp('^(?:[一二三四五六七八九十百零〇、.．()（）\\d\\s]*)(?:'+scope+')(?:资产负债表|利润表|现金流量表|财务报表(?:项目注释)?)').test(compact))result.add(scope)
 }
 return result
}

function continuousPdfContext(source,lines,context,valueLocator,valueLine){
 const pages=source.extraction?.pages,startPage=context.locator.page,endPage=valueLocator.page
 if(!Number.isInteger(startPage)||!Number.isInteger(endPage)||startPage>endPage||!Array.isArray(pages))fail('SCOPE_CONTEXT_PAGE','PDF范围上下文与目标值均需真实页号。')
 let previous
 for(let page=startPage;page<=endPage;page++){
  const entries=pages.filter(p=>p.page===page)
  if(entries.length!==1)fail('SCOPE_CONTEXT_PAGE','范围标题至目标值之间的PDF页必须连续、唯一且完整映射，不能跳过可能的报表切换。')
  const item=entries[0]
  if(![item.lineStart,item.lineEnd].every(Number.isInteger)||item.lineStart<1||item.lineEnd<item.lineStart||item.lineEnd>lines.length||previous&&item.lineStart!==previous.lineEnd+1)fail('SCOPE_CONTEXT_PAGE','连续PDF页的原文行范围必须完整相接。')
  if(page===startPage&&(item.lineStart>context.locator.lineStart||item.lineEnd<context.locator.lineEnd)||page===endPage&&(item.lineStart>valueLine||item.lineEnd<valueLine))fail('SCOPE_CONTEXT_PAGE','范围上下文或目标值行不属于声明PDF页面。')
  previous=item
 }
}

export function resolveFactScopeContext(packet,fact,lines,source){
 const context=fact.evidence?.scopeContext
 if(context===undefined)return null
 const loc=context?.locator,valueLoc=fact.evidence.locator,valueLine=valueLoc.valueLine??valueLoc.lineStart
 if(packet.schemaVersion!==2||!exactKeys(context,['quote','locator','scopeText'])||!exactKeys(loc,['lineStart','lineEnd','page'])||![loc.lineStart,loc.lineEnd].every(Number.isInteger)||loc.lineStart<1||loc.lineEnd<loc.lineStart||loc.lineEnd-loc.lineStart>80||loc.lineEnd>=valueLine||!isText(context.quote)||context.scopeText!==fact.scope||context.scopeText!==fact.evidence.scopeText||lines.slice(loc.lineStart-1,loc.lineEnd).join('\n')!==context.quote)fail('SCOPE_CONTEXT','范围上下文必须来自同源原文的有界、逐字匹配、目标值之前的真实范围标题，不能改写或跨源。')
 const allowed=['合并','母公司','市场',...(packet.entityScopes??[])],markers=new Set(lines.slice(loc.lineStart-1,loc.lineEnd).flatMap(line=>[...explicitScopeHeadings(line,allowed)]))
 if(markers.size!==1||!markers.has(fact.scope))fail('SCOPE_CONTEXT','上下文窗口必须包含唯一且与事实相同的明确报表范围标题。')
 if(source.kind==='pdf-extract')continuousPdfContext(source,lines,context,valueLoc,valueLine)
 else if(loc.page!==undefined)fail('SCOPE_CONTEXT_PAGE','文本快照没有可验证的PDF页号。')
 for(const line of lines.slice(loc.lineEnd,valueLine))for(const scope of explicitScopeHeadings(line,allowed))if(scope!==fact.scope)fail('SCOPE_CONTEXT','范围标题至目标值之间发生真实报表范围切换，不能沿用旧合并/母公司口径。')
 return new Set([fact.scope])
}

export function issuerReportScope(packet,fact,window){
 if(packet.schemaVersion!==2||!(packet.entityScopes??[]).includes(fact.scope))return false
 const scope=fact.scope.replace(/\s/g,'')
 return window.some((line,i)=>{
  const compact=line.replace(/\s/g,'');if(!compact.startsWith(scope))return false
  const suffix=compact.slice(scope.length)
  if(reportPeriod(suffix)!==null)return true
  // Dividend notices can split the issuer/year and the fixed notice name over
  // two real lines. They prove issuer scope only for a dividend fact.
  return fact.metric==='cashDividendPerShare'&&(/^20\d{2}年(?:中期|年度)权益分派实施公告$/.test(suffix)||/^20\d{2}年(?:中期|年度)$/.test(suffix)&&window[i+1]?.replace(/\s/g,'')==='权益分派实施公告')
 })
}

export function isIssuerReportTitle(packet,line){
 return(packet.entityScopes??[]).some(scope=>{const compact=line.replace(/\s/g,'');return compact.startsWith(scope.replace(/\s/g,''))&&reportPeriod(compact.slice(scope.replace(/\s/g,'').length))!==null})
}
