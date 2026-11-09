import {readTemplateModel} from './component-template-registry.js'
// Quantitative delivery obligations belong to the current panel, regardless of
// its renderer. Missing-data prose cannot turn a smaller sample into that set.
const number=value=>{
 if(/^\d+$/u.test(value))return Number(value)
 const digits='零一二三四五六七八九',parts=value.replaceAll('两','二').split('十')
 return parts.length===2?(parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0):digits.indexOf(value)
}
export function componentDeliveryScopeIssue(candidate,request='') {
 const minimums=[...request.matchAll(/(?:不少于|至少|最少|不低于)\s*(\d+|[一二两三四五六七八九十]+)\s*(?:只|家|个|项|条|篇|款|组|位)/gu)].map(m=>number(m[1])).filter(n=>Number.isSafeInteger(n)&&n>1&&n<=2000)
 if(!minimums.length)return
 const data=readTemplateModel(candidate)?.data??candidate
 let identities
 if(['table'].includes(data?.type)&&Array.isArray(data.rows))identities=data.rows.map(row=>JSON.stringify(row))
 else if(['news','reports','timeline'].includes(data?.type)&&Array.isArray(data.items))identities=data.items.map(item=>item.id??item.url??item.title)
 else if(data?.type==='chart'&&Array.isArray(data.labels)){
  const dated=data.labels.length>0&&data.labels.every(label=>/^\d{4}[-/]?\d{2}[-/]?\d{2}$/u.test(String(label)))
  identities=dated?data.series?.map(series=>series.name):data.labels
 }
 // Arbitrary custom HTML has no host-verifiable record model. Its own source
 // and semantic gates still apply; never invent a count from DOM decoration.
 if(!Array.isArray(identities))return
 const actual=new Set(identities.filter(v=>v!==undefined&&v!==null&&String(v).trim())).size,minimum=Math.max(...minimums)
 if(actual<minimum)return `交付范围未满足：当前面板要求至少${minimum}个实际条目或对象，实际交付${actual}。保留已取得数据并继续补齐目标集合；缺失说明不代表比较任务已完成，不能用单条样本替代完整范围。`
}
