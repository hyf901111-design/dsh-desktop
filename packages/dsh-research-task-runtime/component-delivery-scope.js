import {load} from 'cheerio'
import {readTemplateModel} from './component-template-registry.js'
import {normalizeKeyedTableProjection} from './table-projection.js'
import {derivedOutline} from './derived-template-contract.js'
// Quantitative delivery obligations belong to the current panel, regardless of
// its renderer. Missing-data prose cannot turn a smaller sample into that set.
const number=value=>{
 if(/^\d+$/u.test(value))return Number(value)
 const digits='零一二三四五六七八九',parts=value.replaceAll('两','二').split('十')
 return parts.length===2?(parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0):digits.indexOf(value)
}
const columnLabel=column=>typeof column==='string'?column:column?.label??column?.key??''
const metadataColumn=label=>/代码|编号|名称|简称|日期|时间|区间|时点|来源|出处|管理人|负责人|\b(?:id|code|name|symbol|date|time|source|url)\b/iu.test(label)
const numericFact=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&/^\s*[+−-]?(?:\d[\d,]*)(?:\.\d+)?\s*(?:%|％|万元|亿元|元|万|亿|人|条|项|bp|倍)?\s*$/iu.test(value)
const datedLabel=value=>/^\d{4}[-/]?\d{2}[-/]?\d{2}$/u.test(String(value))
const dateKey=value=>String(value).replace(/[-/]/gu,'')

export const isDecimalPrecisionScope=(unit,entity='')=>unit==='位'&&/^(?:小数|有效数字)/u.test(entity)
export const isActionScope=(unit,entity='')=>unit==='个'&&/^(?:操作(?:按钮|控件)?|按钮|控件|交互(?:操作|控件)?)(?:$|[，。；和及])/u.test(entity)

export function isCalendarDateScope(unit,entity='') {
 return unit==='个'&&/^(?:不同的?|独立的?)?(?:日期|净值日|交易日|观测日)(?!历)/u.test(entity)
}

export function isDatedRecordScope(unit,entity='') {
 return unit==='条'&&/^(?:完整|真实|原始|实际)*(?:(?:净值|行情|价格|时序|时间序列|观测)(?:记录|数据|明细|点)|数据点|记录)/u.test(entity)||
  isCalendarDateScope(unit,entity)
}

export function datedRecordIdentities(data, rows=data?.rows, datesOnly=false) {
 if(datesOnly&&['candlestick','ohlc'].includes(data?.variant)&&Array.isArray(data.candles)){
  return data.candles.filter(item=>datedLabel(item?.date)&&['open','high','low','close'].every(key=>Number.isFinite(item[key]))).map(item=>dateKey(item.date))
 }
 if(datesOnly&&data?.type==='timeline'&&Array.isArray(data.items)){
  return data.items.flatMap(item=>{
   const time=String(item.time??'')
   const day=/^(\d{4}[-/]?\d{2}[-/]?\d{2})(?:$|[ T])/u.exec(time)?.[1]??(/^\d{2}:\d{2}/u.test(time)?data.date:undefined)
   return datedLabel(day)?[dateKey(day)]:[]
  })
 }
 if((data?.type==='chart'||datesOnly&&data?.type==='market'&&data.variant==='trend')&&Array.isArray(data.labels)&&data.labels.length&&data.labels.every(datedLabel)){
  return data.labels.flatMap((label,index)=>data.series?.some(series=>Number.isFinite(series.values?.[index]))?[dateKey(label)]:[])
 }
 if(!Array.isArray(rows)||!Array.isArray(data?.columns))return
 const columns=data.columns.map(columnLabel)
 const date=columns.findIndex(label=>/^(?:日期|净值日期|交易日期|观测日期|(?:nav_|trade_|price_)?date)$/iu.test(label))
 if(date<0)return
 const entity=columns.findIndex(label=>/代码|编号|名称|简称|\b(?:id|code|name|symbol)\b/iu.test(label.replaceAll('_',' ')))
 return rows.flatMap(row=>Array.isArray(row)&&datedLabel(row[date])?[datesOnly?dateKey(row[date]):JSON.stringify([row[entity]??null,dateKey(row[date])])]:[])
}

export function componentDeliveryModel(candidate){
 const native=readTemplateModel(candidate)?.data
 if(native)return native
 if(candidate?.type==='html'&&typeof candidate.html==='string'){
  // Custom rendering remains available. Its actual collection must be explicit
  // data, not a claimed count, metric-card count, CSS or executable source.
  const $=load(candidate.html),blocks=$('script[type="application/json"][data-component-delivery-records]')
  if(blocks.length===1){try{return JSON.parse(blocks.text())}catch{}}
 }
 return candidate
}

// A renderer-specific panel may refer to the same cohort without repeating its
// original count/category. Inherit only explicit entity comparisons, never the
// board's card count, record limit or a methodology/aggregate-only obligation.
export function componentCohortRequest(panel='',original='') {
 if(typeof panel!=='string'||typeof original!=='string')return panel
 const count=/(?:不少于|至少|最少|不低于)\s*(?:比较|对比|选取)?\s*(\d+|[一二两三四五六七八九十]+)\s*(只|家|款|个(?:机构|企业|项目|产品|对象|实体))/u.exec(original)
 if(!count||!/(?:同批|同一批|同组|对照|比较|对比|排名|逐(?:只|家|项)|分布|明细)/u.test(panel)||/^(?:本面板：[^\n]+\n)?[^。\n]*(?:来源与口径|方法说明|口径说明|整体.{0,12}摘要)/u.test(panel))return panel
 return panel+'\n【同批对象约束】至少'+count[1]+count[2]+'实际对象；原始对象选择、类别、区间及字段要求：'+original
}

// A group row counts its verified members, not as one fund. Require an
// exact match to the host-acquired cohort; a claimed total is insufficient.
export function verifiesFundManagerGroups(candidate, panel, evidence) {
 if(typeof evidence!=='string'||!/按(?:基金)?管理人(?:汇总|分组|聚合)/u.test(panel))return false
 let source
 try{source=JSON.parse(evidence)}catch{return false}
 const code=source?.columns?.indexOf('代码'),manager=source?.columns?.indexOf('管理人')
 if(!(code>=0&&manager>=0)||!Array.isArray(source.rows)||!source.rows.length)return false
 const expected=new Map(),codes=new Set()
 for(const row of source.rows){
  const id=row[code],group=row[manager]
  if(typeof id!=='string'||!id||typeof group!=='string'||!group||codes.has(id))return false
  codes.add(id)
  expected.set(group,(expected.get(group)??0)+1)
 }
 const data=normalizeKeyedTableProjection(componentDeliveryModel(candidate)).data
 const columns=data?.columns??data?.detailColumns,rows=data?.rows??data?.detailRows
 if(!Array.isArray(columns)||!Array.isArray(rows)||rows.length!==expected.size)return false
 const groupIndex=columns.findIndex(column=>/^(?:基金)?管理人(?:名称)?$/u.test(columnLabel(column)))
 const countIndex=columns.findIndex(column=>/^(?:旗下)?(?:入选|样本)?(?:产品|基金)(?:数量|数|只数)(?:[（(]只[）)])?$/u.test(columnLabel(column)))
 if(groupIndex<0||countIndex<0)return false
 const observed=new Set()
 return rows.every(row=>{
  const name=row[groupIndex],count=row[countIndex]
  if(observed.has(name)||expected.get(name)!==count)return false
  observed.add(name)
  return true
 }) ? codes.size : false
}

export function verifiedOutlineCoverage(artifact,datasets) {
 if(artifact?.type!=='mind-map'||!Array.isArray(datasets))return null
 const outline=derivedOutline(artifact.content)
 if(!outline)return null
 const leaves=new Map()
 const collect=(node,parents)=>{
  if(node.children.length)return node.children.every(child=>collect(child,[...parents,node.label]))
  const id=/^[A-Za-z0-9][A-Za-z0-9_.-]*(?=$|[\s：:·])/u.exec(node.label)?.[0]
  if(!id||leaves.has(id))return false
  leaves.set(id,parents)
  return true
 }
 if(!outline.children.every(node=>collect(node,[])))return null
 for(const dataset of datasets){
  if(dataset.groupBy?.length||dataset.records.length!==leaves.size)continue
  const identities=dataset.fields.filter(field=>field.key==='id'||/^(?:任务|事项|记录|条目)(?:编号|ID)$/iu.test(field.label))
  const identity=identities.find(field=>new Set(dataset.records.map(row=>row[field.key]).filter(id=>leaves.has(id))).size===leaves.size)
  if(!identity)continue
  const groups=new Map()
  const matches=(label,value)=>label===value||label.startsWith(value)&&/[\s（(·：:]/u.test(label[value.length])
  for(const {key,label} of dataset.fields){
   if(!dataset.records.every(row=>typeof row[key]==='string'&&row[key].trim()&&
      leaves.get(row[identity.key]).some(parent=>matches(parent,row[key]))))continue
   groups.set(label,new Set(dataset.records.map(row=>row[key])).size)
  }
  return {records:leaves.size,groups}
 }
 return null
}

// The portable cost renderer derives these names from the same plans it puts
// into the editable page. Its single attachment is a different counting unit.
export function comparisonNamesForScope(data, unit, entity) {
 if(data?.type!=='files' || data.presentation!=='webpage' || !Array.isArray(data.comparisonPlanNames) ||
    !data.comparisonPlanNames.every(name=>typeof name==='string' && name.trim()))return
 const planScope=/^(?:方案|选项|报价方案|预算方案|费用方案)/u.test(entity)
 const businessScope=unit==='家' && (!entity || /^(?:店|门店|商店|饭店|餐馆|饭馆|餐厅|聚餐地点|酒店|商家|供应商|服务商|厂商|公司)/u.test(entity))
 if(planScope || businessScope)return [...new Set(data.comparisonPlanNames.map(name=>name.normalize('NFKC').trim()))]
}

export function componentDeliveryScopeIssue(candidate,request='') {
 const data=normalizeKeyedTableProjection(componentDeliveryModel(candidate)).data
 if(data?.type==='mind-map'&&/完整|全部|原表|原文件|附件|真实/u.test(request)&&/待填入[^\n]{0,30}(?:原表|数据)|无法列出具体[^\n]{0,60}节点|取得[^\n]{0,25}(?:数据|原表)[^\n]{0,15}后[^\n]{0,15}填充/u.test(data.content??''))return '层级图仍是占位骨架，尚未呈现来源中的实际实体和关系。保留并使用已读取的原始记录生成真实节点，不能把待填字段画成导图后标记完成。'
 const quantitativeRequest=request.split('原始对象选择、类别、区间及字段要求：')[0]
 const minimums=[...quantitativeRequest.matchAll(/(?:不少于|至少|最少|不低于)\s*(?:比较|对比|选取)?\s*(\d+|[一二两三四五六七八九十]+)\s*(只|家|个|项|条|篇|款|组|位)\s*([\p{L}\p{N}_-]{0,16})/gu)]
  .filter(m=>!isDecimalPrecisionScope(m[2],m[3])&&!isActionScope(m[2],m[3]))
  .map(m=>({minimum:number(m[1]),unit:m[2],entity:m[3],dated:isDatedRecordScope(m[2],m[3])}))
  .filter(({minimum})=>Number.isSafeInteger(minimum)&&minimum>1&&minimum<=2000)
 if(!minimums.length)return
 let identities,datedIdentities,dateRows
 if((data?.type==='table'||data?.type==='market'&&data.variant==='table')&&Array.isArray(data.rows)&&Array.isArray(data.columns)&&data.columns.length&&data.rows.every(row=>Array.isArray(row)&&row.length===data.columns.length)){
  const columns=data.columns.map(columnLabel),identity=columns.findIndex(label=>/代码|编号|名称|简称|\b(?:id|code|name|symbol)\b/iu.test(label))
  const quantitative=/收益|回撤|波动|净值|规模|金额|预算|数量|指标|价格|收入|利润|比率|占比/u.test(request)
  const rows=data.rows.filter(row=>!quantitative||row.some((cell,i)=>!metadataColumn((columns[i]??'').replaceAll('_',' '))&&numericFact(cell)))
  identities=rows.map(row=>identity>=0?row[identity]:JSON.stringify(row))
  dateRows=rows;datedIdentities=datedRecordIdentities(data,rows)
 }else if(['news','reports','timeline'].includes(data?.type)&&Array.isArray(data.items))identities=data.items.map(item=>item.id??item.url??item.title)
 else if(data?.type==='market'&&data.variant==='scatter'&&Array.isArray(data.items)){
  identities=data.items.filter(item=>Number.isFinite(item?.x)&&Number.isFinite(item?.y)).map(item=>item.label)
 }else if(data?.type==='chart'&&['scatter','bubble'].includes(data.variant)&&Array.isArray(data.points)){
  identities=data.points.filter(item=>Number.isFinite(item?.x)&&Number.isFinite(item?.y)).map(item=>item.label)
 }else if(['candlestick','ohlc'].includes(data?.variant)&&Array.isArray(data.candles)){
  datedIdentities=identities=data.candles.filter(item=>['open','high','low','close'].every(key=>Number.isFinite(item?.[key]))).map(item=>item.date)
 }
 else if(data?.type==='chart'&&Array.isArray(data.labels)){
  const dated=data.labels.length>0&&data.labels.every(datedLabel)
  identities=dated?data.series?.filter(series=>series.values?.some(value=>typeof value==='number'&&Number.isFinite(value))).map(series=>series.name):data.labels.filter((_,i)=>data.series?.some(series=>typeof series.values?.[i]==='number'&&Number.isFinite(series.values[i])))
  datedIdentities=datedRecordIdentities(data)
 }
 for(const {minimum,dated,unit,entity} of minimums.sort((a,b)=>b.minimum-a.minimum)){
  const observed=comparisonNamesForScope(data,unit,entity) ?? (isCalendarDateScope(unit,entity)?datedRecordIdentities(data,dateRows,true):dated?datedIdentities??identities:identities)
  if(!Array.isArray(observed))return `交付范围无法核验：本面板要求至少${minimum}个实际条目或对象。切换呈现方式不能取消范围要求；保留真实记录集合，原生模型直接提供 rows/items/series，自定义 HTML 用唯一的 script[type="application/json"][data-component-delivery-records] 保留同一 table/chart/timeline 数据模型并据此绘制，不能用摘要指标个数或自称完成代替对象数。`
  const actual=new Set(observed.filter(v=>v!==undefined&&v!==null&&String(v).trim())).size
  if(actual<minimum)return `交付范围未满足：当前面板要求至少${minimum}个实际条目或对象，实际交付${actual}。保留已取得数据并继续补齐目标集合；仅有代码、候选名称或全部缺失的量化指标不算实际交付，缺失说明不代表比较任务已完成，不能用单条样本替代完整范围。`
 }
}
