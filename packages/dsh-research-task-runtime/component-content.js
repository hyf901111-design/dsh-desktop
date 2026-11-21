import {chartDataIssue} from './chart-template-contract.js'
import {componentReadableDocumentTable} from './component-readable-snapshot.js'
import {nativeProvenance} from './component-provenance.js'
import {tableShapeIssue} from './template-data-contract.js'
import {kpiDataIssue} from './kpi-template-contract.js'
import {parseDerivedSpec} from './derived-template-contract.js'
import {contentChartSelection} from './component-metric-view.js'

// One content model, independent of the renderer. Choosing a chart is a hint;
// it must never remove rows or force the model to reacquire the same material.
export const COMPONENT_CONTENT_GUIDANCE = '常规交付直接用 content:{title,body?,rows?,columns?,visualization?,sources?,asOf?,note?}。body 是完整正文；rows 是完整对象记录数组，columns 可省略（自动保留全部字段），或 [{key,label}]；技术字段名须用 label 保留用户可读的指标名称。基础图表用 visualization:{kind:"bar|horizontal|line|area|groupedBar|dumbbell",label:"名称或日期字段",values:["真实数值字段"],unit?}。观察走势时选日期和同单位的目标指标生成折线，横向比较时选类别和排名依据生成排序条形。两个明确可比的同单位指标可用分组柱图并列，需要突出两个端点的差距时用哑铃图。其他字段和计算依据保留在明细。分类名录、口径不一致和用户指定的表格使用原表。结构关系用 visualization:{kind:"hierarchy",outline:"一个 # 根标题和嵌套项目列表"}，body 保留完整依据。K线、散点、瀑布、环图、风险矩阵等用对应原生 artifact。sources:[{label,url?}] 保存真实出处。content 不填 version/type、HTML、样式或交互代码。已取结构化响应优先用来源引用，避免复制大量数据。'

const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const cell = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? String(value) : value
const detailCell = value => value == null ? null : typeof value === 'object' ? JSON.stringify(value) : value
const chartKind = view => typeof view?.kind==='string' ? view.kind.replace(/^chart\./u,'') : undefined
const contentChartKinds = ['bar','horizontal','line','area','groupedBar','dumbbell']

function hierarchyOutline(outline) {
 if(typeof outline!=='string')return outline
 const headings=outline.trim().split(/\r?\n/).filter(line=>line.trim()).map(line=>/^(#{1,6})[ \t]+(\S.*)$/u.exec(line.trim()))
 if(headings.length<2||headings[0]?.[1]!=='#')return outline
 let previous=1
 const lines=[headings[0][0]]
 for(const heading of headings.slice(1)){
  const depth=heading?.[1].length
  if(!depth||depth<2||depth>previous+1)return outline
  lines.push('  '.repeat(depth-2)+'- '+heading[2]);previous=depth
 }
 return lines.join('\n')
}

export function compileComponentContent(content, scope) {
 if (!plain(content)) throw Error('content 需要正文或完整记录。')
 const keys=['title','body','rows','columns','visualization','sources','asOf','note','unit','metrics']
 if(Object.keys(content).some(key=>!keys.includes(key)))throw Error('content 中未知字段请保留在 body 或 rows 中，不能丢弃内容。')
 if(typeof content.title!=='string'||!content.title.trim())throw Error('content.title 需要可读标题。')
 for(const key of ['body','asOf','note'])if(content[key]!==undefined&&typeof content[key]!=='string')throw Error(key+' 必须是文本。')
 const declared=content.visualization
 if(content.unit!==undefined && (declared!==undefined&&!contentChartKinds.includes(chartKind(declared))||!content.rows||typeof content.unit!=='string'||!content.unit.trim()||declared?.unit!==undefined&&declared.unit!==content.unit))throw Error('图表单位须为同一原始单位，填写 visualization.unit。')
 if(content.sources!==undefined && (!Array.isArray(content.sources)||content.sources.length&&nativeProvenance({type:'table',sources:content.sources}).invalid))throw Error('sources 需要真实出处数组和安全的 http/https 链接。')
 const base={version:1,title:content.title,...(content.sources?.length?{sources:content.sources}:{}),...(content.asOf?{asOf:content.asOf}:{}),...(content.note?{note:content.note}:{})}
 if(content.metrics!==undefined){
  if(Object.keys(content).some(key=>!['title','metrics','sources','asOf','note'].includes(key)))throw Error('指标记录需独立提交，保留实际指标、单位及来源。');
  const data={...base,type:'kpi',items:content.metrics},provenance=nativeProvenance(data);
  const issue=provenance.invalid?'指标来源无效':kpiDataIssue(provenance.data);
  if(issue)throw Error(issue);
  return {data};
 }
 if(chartKind(declared)==='hierarchy'&&content.rows!==undefined)throw Error('有层级字段的记录请用 sharedDatasets 与 hierarchy 保留全部行。')
 if(content.rows===undefined){
  if(!content.body?.trim())throw Error('尚无正文或记录，不能把空组件标记完成。')
  // Markdown has a strict wire shape. Keep its evidence in the readable
  // footer instead of passing metadata keys the native parser rejects.
  const sourceLines=(content.sources??[]).map(row=>[row.label??row.name??row.title,row.text,row.url].filter(Boolean).join(' · '))
  if(chartKind(declared)==='hierarchy'){
   const data=parseDerivedSpec({version:1,type:'mind-map',title:base.title,content:hierarchyOutline(declared.outline),
    source:{title:content.sources?.[0]?.label||base.title,text:[content.body,...sourceLines].join('\n\n')},
    ...(base.asOf?{asOf:base.asOf}:{}),...(base.note?{note:base.note}:{})})
   if(!data)throw Error('关系图需要一个 # 根标题，其下用两空格缩进的逐项列表保留材料里的上下级关系。')
   return {data}
  }
  return {data:{version:1,title:base.title,type:'markdown',
   content:[content.body,content.note,content.asOf,...sourceLines].filter(Boolean).join('\n\n')}}
 }
 if(!Array.isArray(content.rows)||!content.rows.length||!content.rows.every(plain))throw Error('rows 需要完整对象记录数组；没有记录时请如实交付已知正文。')
 const fields=[...new Set(content.rows.flatMap(Object.keys))]
 if(!fields.length)throw Error('记录尚无实际字段。')
 let columns=content.columns??fields.map(key=>({key,label:key}))
 if(!Array.isArray(columns)||!columns.every(column=>plain(column)&&typeof column.key==='string'&&typeof column.label==='string'&&column.label.trim()&&Object.keys(column).every(key=>['key','label'].includes(key)))||new Set(columns.map(c=>c.key)).size!==columns.length)throw Error('columns 使用唯一的 {key,label} 声明。')
 // Explicit labels/order are optional. Fields not listed by the model still
 // belong to the acquired record and remain available in the delivered table.
 if(columns.some(column=>!fields.includes(column.key)))throw Error('columns 引用了记录中不存在的字段，请使用实际字段名。')
 columns=[...columns,...fields.filter(key=>!columns.some(column=>column.key===key)).map(key=>({key,label:key}))]
 const data={...base,type:'table',columns:columns.map(c=>c.label),rows:content.rows.map(row=>columns.map(column=>cell(row[column.key])))}
 const selection=contentChartSelection(content,columns,scope)
 const view=selection?.view,kind=chartKind(view),unit=view?.unit??content.unit
 if(plain(view)&&contentChartKinds.includes(kind)&&fields.includes(view.label)&&Array.isArray(view.values)&&view.values.length&&new Set(view.values).size===view.values.length&&view.values.every(key=>fields.includes(key)&&content.rows.every(row=>typeof row[key]==='number'&&Number.isFinite(row[key])))&&content.rows.every(row=>typeof row[view.label]==='string'&&row[view.label].trim())){
  const ordered=[columns.find(c=>c.key===view.label),...columns.filter(c=>c.key!==view.label)]
  const rows=kind==='groupedBar'&&content.rows.every(row=>/^\d{4}Q[1-4]$/u.test(row[view.label]))
   ?content.rows.toSorted((a,b)=>a[view.label].localeCompare(b[view.label])):selection.rows
  const chart={...base,type:'chart',variant:kind,labels:rows.map(row=>row[view.label]),series:view.values.map(key=>({name:columns.find(c=>c.key===key).label,values:rows.map(row=>row[key])})),...(typeof unit==='string'?{unit}:{}),detailColumns:ordered.map(c=>c.label),detailRows:rows.map(row=>ordered.map(c=>detailCell(row[c.key])))}
  if(!chartDataIssue(nativeProvenance(chart).data))return{data:{...chart,...(content.body?{body:content.body}:{})}}
 }
 const complete={...data,...(content.body?{body:content.body}:{}),...(content.unit?{note:[content.note,`单位：${content.unit}`].filter(Boolean).join('\n')}:{} )}
 if(!tableShapeIssue(data,{generic:true}))return{data:complete}
 // Capacity is a renderer concern, not a business-data rejection. The host
 // renderer supplies search, pagination and complete long-cell expansion.
 const output=componentReadableDocumentTable(data)
 if(!output)throw Error('记录无法呈现，请保留原始内容与实际字段；不要删减记录。')
 return{data:complete,output:JSON.stringify(complete),capacitySnapshot:true}
}
