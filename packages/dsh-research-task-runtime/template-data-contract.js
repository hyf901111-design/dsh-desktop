import {timelineDataIssue} from './timeline-template-contract.js'
import {kpiDataIssue} from './kpi-template-contract.js'
import {chartDataIssue} from './chart-template-contract.js'
import {operationsDataIssue} from './operations-template-contract.js'
import {FINANCIAL_PROFILE_VARIANTS,financialProfileDataIssue} from './financial-profile.js'
// Shared by prompt construction, renderers and mapping validation. Keep data
// limits here so a compact prompt cannot promise a shape the renderer rejects.
export const TEMPLATE_LIMITS=Object.freeze({tableColumns:32,tableRows:100,trendSeries:12,trendPoints:366,scatterItems:20,allocationItems:12,fundMetrics:12,fundIndustries:40,holdingsColumns:8,holdingsRows:30})
export const TABLE_INPUT_GUIDANCE='表格支持两种等价输入：columns:[列名] 配等宽 rows:[[单元格]]；或 columns:[{key,label}] 配 rows:[{列键:单元格}] 对象行。后一种按声明的 key 顺序无损转成宿主数组，key 必须唯一，每行恰好包含全部列键，不含额外键或嵌套单元格；列声明只含 key/label，单位写入 label。data-bound 的 mapping 使用相同列声明与逐列路径，宿主同时规范化映射和结果，不手抄源数据。真实映射结果超过交互模板容量时保留完整数据与映射，由宿主改用可读快照，不裁剪行列。'
export const TABLE_INPUT_SCHEMA='{"version":1,"type":"table","title":"标题","columns":[{"key":"code","label":"证券代码"},{"key":"price","label":"最新价（元）"}],"rows":[{"code":"原证券代码","price":"原数值"}]}'
export const TEMPLATE_RULES=Object.freeze({
 table:`1–${TEMPLATE_LIMITS.tableColumns}列、1–${TEMPLATE_LIMITS.tableRows}行；${TABLE_INPUT_GUIDANCE}保留所有字段和原始精度，不删列或截断；最终交付仍须满足 HTML 字节容量限制`,
 metrics:'1–12 项，每项必须同时有 label 和 value，均为非空文字；数值与单位放 value，detail 为可选非空文字。证券名称可作为 value 或写入标题，不能只提交 label；缺失指标写“—”并解释，不编造数值',
 trend:`1–${TEMPLATE_LIMITS.trendSeries} 条同单位同纵轴序列，2–${TEMPLATE_LIMITS.trendPoints} 个时点；每条 values 必须与 labels 等长且全为有限数值，允许负数`,
 scatter:`1–${TEMPLATE_LIMITS.scatterItems} 个样本；x/y 为有限数值，允许负数；可选 size 必须大于0`,
 'fund-kpi':`1–${TEMPLATE_LIMITS.fundMetrics} 项，value 使用数值与单位字符串；缺失值用“—”并解释，不编造数值`,
 'fund-holdings':`1–${TEMPLATE_LIMITS.holdingsColumns} 列、1–${TEMPLATE_LIMITS.holdingsRows} 行；${TABLE_INPUT_GUIDANCE}`,
 'fund-industry':`1–${TEMPLATE_LIMITS.fundIndustries} 项；weight 是0–100百分数；benchmark 可省略或null，缺失时只展示实际权重，不编造基准和偏离`
})
export const TABLE_GUIDANCE=`table 仅支持 version/type/title/columns/rows/asOf/note；不使用 variant 或 notes，完整说明合并为 note 单个非空字符串，asOf/note 可省略，提供时为1–2000字。带 asOf 或 note 的可信交互表格支持${TEMPLATE_RULES.table}；无来源原生表格仍限1–12列、1–100行。title 为1–256字，列名为1–128字，单元格为1–512字非空文字或绝对值不超过1e15的有限数值。证券代码、名称、单位和报价时间必须引用各行真实字段，不把一个证券代码或交易所固定拼到所有行；缺失字段明确说明。`
// Only dimensions are relaxed for trusted tables. Sourced generic tables keep
// the native scalar/text capacities; existing market tables keep theirs.
export function tableShapeIssue(data,{generic=false,maxColumns=TEMPLATE_LIMITS.tableColumns}={}){
 const text=(value,limit)=>typeof value==='string'&&value.trim().length>0&&value.length<=limit
 if(!Array.isArray(data.columns)||data.columns.length<1||data.columns.length>maxColumns)return `columns 必须包含 1–${maxColumns} 列`
 const column=data.columns.findIndex(value=>!text(value,generic?128:2000))
 if(column>=0)return `columns[${column}] 必须为1–${generic?128:2000}字的非空文字`
 const emptyNews=data.note==='本次未取得与用户主题相关的新闻；未用全市场或其他主题内容补齐。'
 if(!Array.isArray(data.rows)||data.rows.length<1&&!emptyNews||data.rows.length>TEMPLATE_LIMITS.tableRows)return `rows 必须包含 1–${TEMPLATE_LIMITS.tableRows} 行`
 for(const [i,row]of data.rows.entries()){
  if(!Array.isArray(row)||row.length!==data.columns.length)return `rows[${i}] 必须是 ${data.columns.length} 个单元格的数组`
  const cell=row.findIndex(value=>generic
   ? !(text(value,512)||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e15)
   : !(typeof value==='string'||typeof value==='number'&&Number.isFinite(value)))
  if(cell>=0)return `rows[${i}][${cell}] 必须为${generic?'1–512字的非空文字或绝对值不超过1e15的有限数值':'文字或有限数值'}`
 }
 return null
}
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
 if(data?.type==='timeline')return timelineDataIssue(data)
 if(data?.type==='kpi')return kpiDataIssue(data)
 if(['progress','tasks','approval','alerts','form','code','clock','note','rss'].includes(data?.type))return operationsDataIssue(data)
 if(data?.type==='chart')return chartDataIssue(data)
 if(data?.type==='table'){
  const unsupported=Object.keys(data).filter(key=>!['version','type','title','columns','rows','asOf','note'].includes(key))
  if(unsupported.length)return `table 不支持字段：${unsupported.join('、')}。${TABLE_GUIDANCE}`
  for(const key of ['asOf','note'])if(data[key]!==undefined&&(typeof data[key]!=='string'||!data[key].trim()||data[key].length>2000))return `table.${key} 必须为1–2000字的非空文字。${TABLE_GUIDANCE}`
  if(data.version!==1)return `table.version 必须为1。${TABLE_GUIDANCE}`
  if(typeof data.title!=='string'||!data.title.trim()||data.title.length>256)return `table.title 必须为1–256字的非空文字。${TABLE_GUIDANCE}`
  const issue=tableShapeIssue(data,{generic:true,maxColumns:data.asOf!==undefined||data.note!==undefined?TEMPLATE_LIMITS.tableColumns:12})
  return issue?`table.${issue}。${TABLE_GUIDANCE}`:null
 }
 const finite=v=>typeof v==='number'&&Number.isFinite(v)
 const array=(key,max,min=1)=>!Array.isArray(data[key])||data[key].length<min||data[key].length>max?`${key} 必须包含 ${min}–${max} 项`:null
 if(data?.type!=='market')return null
 const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000
 const rule=TEMPLATE_RULES[data.variant],fail=issue=>issue?`${data.variant}.${issue}。${rule??''}`:null
 if(data.version!==1)return fail('version 必须为1')
 for(const key of ['title','asOf'])if(!text(data[key]))return fail(`${key} 必须为1–2000字的非空文字，不能使用数组或对象`)
 if(data.note!==undefined&&!text(data.note))return fail('note 必须为非空文字；没有说明时省略此字段')
 if(data.sources!==undefined){
  if(!Array.isArray(data.sources)||data.sources.length>30)return fail('sources 必须为不超过30项的数组')
  for(const [i,source]of data.sources.entries()){
   if(!text(source?.label))return fail(`sources[${i}].label 必须为非空文字`)
   if(source.url!==undefined&&source.url!==''){
    let valid=false
    try{const url=new URL(source.url);valid=text(source.url)&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password}catch{}
    if(!valid)return fail(`sources[${i}].url 必须为已核验的 http/https 链接；没有链接时省略`)
   }
  }
 }
 if(FINANCIAL_PROFILE_VARIANTS.includes(data.variant))return financialProfileDataIssue(data)
 if(data.variant==='table')return fail(tableShapeIssue(data))
 if(['metrics','fund-kpi'].includes(data.variant)){
  const issue=array('items',TEMPLATE_LIMITS.fundMetrics);if(issue)return fail(issue)
  for(const [i,item]of data.items.entries()){
   for(const key of ['label','value'])if(!text(item?.[key]))return fail(`items[${i}].${key} 必须为非空文字；每项必须同时有 label 和 value`)
   if(item.detail!==undefined&&!text(item.detail))return fail(`items[${i}].detail 必须为非空文字；来源未提供时省略或写明确缺失说明`)
  }
 }
 if(data.variant==='trend'){
  const issue=array('labels',TEMPLATE_LIMITS.trendPoints,2)||array('series',TEMPLATE_LIMITS.trendSeries);if(issue)return fail(issue)
  for(const [i,s]of data.series.entries())if(!Array.isArray(s?.values)||s.values.length!==data.labels.length||!s.values.every(finite))return fail(`series[${i}].values 必须是与 labels 等长的有限数值数组`)
 }
 if(data.variant==='scatter'){
  const issue=array('items',TEMPLATE_LIMITS.scatterItems);if(issue)return fail(issue)
  for(const [i,item]of data.items.entries())if(!finite(item?.x)||!finite(item?.y)||item.size!==undefined&&(!finite(item.size)||item.size<=0))return fail(`items[${i}] 的 x/y 或 size 类型无效`)
 }
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
  if(data?.type==='market'&&['stock-ownership','historical-price'].includes(data.variant)&&data.datasets?.length){
    const keys=data.variant==='stock-ownership'?['shares','marketValue','ownershipPercent','quarterEndPrice']:['open','high','low','close','volume','vwap'];
    const rows=data.datasets.flatMap(d=>d.rows);
    if(rows.length&&rows.every(r=>keys.every(k=>r[k]===null)))return '尚无来源记录数值。必须取得来源响应，不能把全空股东/历史行情表标为取数完成。';
  }
  if(data?.type==='market'&&data.variant==='institutional-ownership'&&data.companies?.length&&data.companies.every(c=>c.snapshots.every(p=>p.metrics.every(m=>['current','previous','change','changePercent'].every(k=>m[k]===null)))))
    return '机构持仓汇总尚无来源统计数值。必须实际取得披露响应，不能从部分机构明细推导汇总或把全空统计标为取数完成。'

  if(data?.type==='market'&&['revenue-geography','revenue-business'].includes(data.variant)&&data.datasets?.length&&data.datasets.every(d=>d.segments.every(r=>r.values.every(v=>v===null))))
    return '收入分项尚无已披露数值。必须取得来源记录，不能用全空分项或总收入替代收入结构。'

  if(data?.type==='market'&&data.variant==='company-profile'&&data.companies?.length&&data.companies.every(r=>['address','phone','website','sector','industry','employeeCount','exchange','ipoDate'].every(k=>r[k]===null)&&!r.registrations?.length&&!r.description?.length))
    return '公司资料全部未提供。必须取得来源记录，不能只用公司名称和全空信息标为取数完成。'
  if(data?.type==='market'&&data.variant==='financial-statements'&&data.datasets?.length&&data.datasets.every(d=>d.rows.every(r=>r.values.every(v=>v===null))))
    return '财务报表尚无已披露数值。必须取得来源记录，不能用全空科目表标为取数完成。'
  if(data?.type==='market'&&data.variant==='price-performance'&&!data.candles?.length)
    return '价格表现尚无已取得OHLCV。检查实际业务查询，不把示意蜡烛或空历史标为取数完成。'
  if(data?.type==='market'&&data.variant==='valuation-multiples'&&data.datasets?.length&&data.datasets.every(d=>d.series.every(r=>r.values.every(v=>v===null))))
    return '估值倍数尚无来源观测。必须取得业务响应，不能把全空年度/季度数据标为完成。'
  if(data?.type==='market'&&data.variant==='price-target'&&data.currentPrice===null&&data.forecasts?.every(r=>r.targetPrice===null)&&!data.history?.some(p=>p.value!==null))
    return '目标价和实际报价均未提供。必须保留实际查询与缺失原因，不能把全空机构名单标为取数完成。'
  if(data?.type==='market'&&data.variant==='share-statistics'&&['totalShares','floatShares','freeFloatPercent'].every(k=>data[k]===null))
    return '股本统计全部未提供。必须取得业务响应，不能把全空股本标为取数完成。'
  if(data?.type==='market'&&data.variant==='market-overview'&&data.indices?.length&&data.indices.every(r=>r.price===null&&r.changePercent===null&&!r.sparkline?.values?.some(v=>typeof v==='number'&&Number.isFinite(v))))
    return '市场概览尚无报价或历史观测。必须取得业务响应，不能把指数名称当成取数完成。'
  if(data?.type==='market'&&data.variant==='currency-snapshot'&&data.pairs?.length&&data.pairs.every(r=>r.rate===null))
    return '外汇快照尚无汇率观测。必须取得业务响应，不把全空货币对标为取数完成。'
  if(data?.type==='market'&&data.variant==='watchlist'&&data.quotes?.length&&data.quotes.every(r=>r.price===null))
    return '自选股尚无行情观测。必须取得业务响应，不把全空列表标为取数完成。'
  if(data?.type==='market'&&data.variant==='ticker-information'&&data.price===null&&data.dayChange===null&&data.dayChangePercent===null&&!data.sparkline?.values?.some(v=>typeof v==='number'&&Number.isFinite(v)))
    return '个股信息尚无可核验的报价或历史观测。必须取得业务响应，不能把证券名称和全空报价当成取数成功。'
  if(data?.type==='market'&&data.variant==='key-metrics'&&data.items?.length&&data.items.every(i=>i.value===null))
    return '核心指标全部未提供。必须先实际取得业务响应，不把全空指标面板标为生成完成。'
  if(['dashboard','market'].includes(data?.type)&&Array.isArray(data.items)&&data.items.length&&data.items.every(item=>typeof item.value==='string'&&/^(?:—|--|N\/A)(?:[（(].*)?$/iu.test(item.value.trim()))&&/不可用|未提供|未取得/u.test(JSON.stringify(data)))
    return '全部核心指标为空，尚无业务数据。必须先实际调用当前可用的数据工具；接口目录或无工具声明不能代替取数。若数据源确实无法提供，说明具体查询和缺失原因，不把全空面板标为生成完成。'

  if(data?.type==='market'&&data.variant==='candlestick'&&Array.isArray(data.candles)&&data.candles.length===0)
    return 'K线来源返回空数组。请检查接口定义中的锚点日期与时间方向：最近历史交易日应向过去查询，不可照抄向未来查询的示例。修正参数实际取数；休市不代表历史行情不存在。仍无数据时如实说明，不编造价格。'
  return null
}
