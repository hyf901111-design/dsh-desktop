// Shared by prompt construction, renderers and mapping validation. Keep data
// limits here so a compact prompt cannot promise a shape the renderer rejects.
export const TEMPLATE_LIMITS=Object.freeze({trendSeries:12,trendPoints:366,scatterItems:20,allocationItems:12,fundMetrics:12,fundIndustries:40,holdingsColumns:8,holdingsRows:30})
export const TEMPLATE_RULES=Object.freeze({
 trend:`1–${TEMPLATE_LIMITS.trendSeries} 条同单位同纵轴序列，2–${TEMPLATE_LIMITS.trendPoints} 个时点；每条 values 必须与 labels 等长且全为有限数值，允许负数`,
 scatter:`1–${TEMPLATE_LIMITS.scatterItems} 个样本；x/y 为有限数值，允许负数；可选 size 必须大于0`,
 'fund-kpi':`1–${TEMPLATE_LIMITS.fundMetrics} 项，value 使用数值与单位字符串；缺失值用“—”并解释，不编造数值`,
 'fund-holdings':`1–${TEMPLATE_LIMITS.holdingsColumns} 列、1–${TEMPLATE_LIMITS.holdingsRows} 行；rows 每一行是与 columns 等长的数组，不是对象`,
 'fund-industry':`1–${TEMPLATE_LIMITS.fundIndustries} 项；weight 是0–100百分数；benchmark 可省略或null，缺失时只展示实际权重，不编造基准和偏离`
})
export function normalizeIndexedTableRows(data){
 if(!(data?.type==='table'||data?.type==='market'&&['table','fund-holdings'].includes(data.variant))||!Array.isArray(data.columns)||!Array.isArray(data.rows))return data
 const keys=data.columns.map((_,i)=>String(i))
 return {...data,rows:data.rows.map(row=>{
  // A per-symbol query with take:1 returns [row] unless $single is set.
  // Only unwrap an unambiguous one-row envelope; never flatten multi-row data.
  if(Array.isArray(row)&&row.length===1&&Array.isArray(row[0])&&row[0].length===keys.length&&row[0].every(cell=>typeof cell==='string'||Number.isFinite(cell)||cell===null))return row[0]

  if(!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==keys.length||!keys.every(k=>Object.hasOwn(row,k)))return row
  return keys.map(k=>row[k])
 })}
}
// Return paths rather than an opaque "format invalid" result. The same rule
// text is included in the model's original schema and its bounded repair.
export function templateDataIssue(data){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)
 const array=(key,max,min=1)=>!Array.isArray(data[key])||data[key].length<min||data[key].length>max?`${key} 必须包含 ${min}–${max} 项`:null
 if(data?.type!=='market')return null
 const rule=TEMPLATE_RULES[data.variant],fail=issue=>issue?`${data.variant}.${issue}。${rule??''}`:null
 if(data.variant==='trend'){
  const issue=array('labels',TEMPLATE_LIMITS.trendPoints,2)||array('series',TEMPLATE_LIMITS.trendSeries);if(issue)return fail(issue)
  for(const [i,s]of data.series.entries())if(!Array.isArray(s?.values)||s.values.length!==data.labels.length||!s.values.every(finite))return fail(`series[${i}].values 必须是与 labels 等长的有限数值数组`)
 }
 if(data.variant==='scatter'){
  const issue=array('items',TEMPLATE_LIMITS.scatterItems);if(issue)return fail(issue)
  for(const [i,item]of data.items.entries())if(!finite(item?.x)||!finite(item?.y)||item.size!==undefined&&(!finite(item.size)||item.size<=0))return fail(`items[${i}] 的 x/y 或 size 类型无效`)
 }
 if(data.variant==='fund-kpi'){const issue=array('items',TEMPLATE_LIMITS.fundMetrics);if(issue)return fail(issue)}
 if(data.variant==='fund-industry'){
  const issue=array('items',TEMPLATE_LIMITS.fundIndustries);if(issue)return fail(issue)
  for(const [i,item]of data.items.entries())if(!finite(item?.weight)||item.weight<0||item.weight>100||item.benchmark!=null&&(!finite(item.benchmark)||item.benchmark<0||item.benchmark>100))return fail(`items[${i}] 的权重必须是0–100百分数`)
 }
 if(['table','fund-holdings'].includes(data.variant)&&Array.isArray(data.rows)&&Array.isArray(data.columns)){
  const index=data.rows.findIndex(row=>!Array.isArray(row)||row.length!==data.columns.length)
  if(index>=0)return fail(`rows[${index}] 必须是 ${data.columns.length} 个单元格的数组`)
 }
 return null
}

// Empty retrieval is a source problem, not malformed visual JSON. A bounded
// repair must retain tools so it can correct the query's time direction.
export function templateSourceDataIssue(data) {
  if(['dashboard','market'].includes(data?.type)&&Array.isArray(data.items)&&data.items.length&&data.items.every(item=>typeof item.value==='string'&&/^(?:—|--|N\/A)(?:[（(].*)?$/iu.test(item.value.trim()))&&/不可用|未提供|未取得/u.test(JSON.stringify(data)))
    return '全部核心指标为空，尚无业务数据。必须先实际调用当前可用的数据工具；接口目录或无工具声明不能代替取数。若数据源确实无法提供，说明具体查询和缺失原因，不把全空面板标为生成完成。'

  if(data?.type==='market'&&data.variant==='candlestick'&&Array.isArray(data.candles)&&data.candles.length===0)
    return 'K线来源返回空数组。请检查接口定义中的锚点日期与时间方向：最近历史交易日应向过去查询，不可照抄向未来查询的示例。修正参数实际取数；休市不代表历史行情不存在。仍无数据时如实说明，不编造价格。'
  return null
}
