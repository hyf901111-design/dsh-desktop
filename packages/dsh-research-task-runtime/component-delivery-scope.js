import {load} from 'cheerio'
import {readTemplateModel} from './component-template-registry.js'
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

function deliveryModel(candidate){
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

export function componentDeliveryScopeIssue(candidate,request='') {
 const data=deliveryModel(candidate)
 if(data?.type==='mind-map'&&/完整|全部|原表|原文件|附件|真实/u.test(request)&&/待填入[^\n]{0,30}(?:原表|数据)|无法列出具体[^\n]{0,60}节点|取得[^\n]{0,25}(?:数据|原表)[^\n]{0,15}后[^\n]{0,15}填充/u.test(data.content??''))return '层级图仍是占位骨架，尚未呈现来源中的实际实体和关系。保留并使用已读取的原始记录生成真实节点，不能把待填字段画成导图后标记完成。'
 const minimums=[...request.matchAll(/(?:不少于|至少|最少|不低于)\s*(?:比较|对比|选取)?\s*(\d+|[一二两三四五六七八九十]+)\s*(?:只|家|个|项|条|篇|款|组|位)/gu)].map(m=>number(m[1])).filter(n=>Number.isSafeInteger(n)&&n>1&&n<=2000)
 if(!minimums.length)return
 const minimum=Math.max(...minimums)
 let identities
 if((data?.type==='table'||data?.type==='market'&&data.variant==='table')&&Array.isArray(data.rows)){
  const columns=(data.columns??[]).map(columnLabel),identity=columns.findIndex(label=>/代码|编号|名称|简称|\b(?:id|code|name|symbol)\b/iu.test(label))
  const quantitative=/收益|回撤|波动|净值|规模|金额|预算|数量|指标|价格|收入|利润|比率|占比/u.test(request)
  identities=data.rows.filter(row=>!quantitative||row.some((cell,i)=>!metadataColumn(columns[i]??'')&&numericFact(cell)))
   .map(row=>identity>=0?row[identity]:JSON.stringify(row))
 }else if(['news','reports','timeline'].includes(data?.type)&&Array.isArray(data.items))identities=data.items.map(item=>item.id??item.url??item.title)
 else if(data?.type==='chart'&&Array.isArray(data.labels)){
  const dated=data.labels.length>0&&data.labels.every(label=>/^\d{4}[-/]?\d{2}[-/]?\d{2}$/u.test(String(label)))
  identities=dated?data.series?.filter(series=>series.values?.some(value=>typeof value==='number'&&Number.isFinite(value))).map(series=>series.name):data.labels.filter((_,i)=>data.series?.some(series=>typeof series.values?.[i]==='number'&&Number.isFinite(series.values[i])))
 }
 if(!Array.isArray(identities))return `交付范围无法核验：本面板要求至少${minimum}个实际条目或对象。切换呈现方式不能取消范围要求；保留真实记录集合，原生模型直接提供 rows/items/series，自定义 HTML 用唯一的 script[type="application/json"][data-component-delivery-records] 保留同一 table/chart/timeline 数据模型并据此绘制，不能用摘要指标个数或自称完成代替对象数。`
 const actual=new Set(identities.filter(v=>v!==undefined&&v!==null&&String(v).trim())).size
 if(actual<minimum)return `交付范围未满足：当前面板要求至少${minimum}个实际条目或对象，实际交付${actual}。保留已取得数据并继续补齐目标集合；仅有代码、候选名称或全部缺失的量化指标不算实际交付，缺失说明不代表比较任务已完成，不能用单条样本替代完整范围。`
}
