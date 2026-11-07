import {defineTool} from '@deepseek-ai/dsh-tools'
import {resolveBoundComponent,resolveComponentSnapshot,COMPONENT_MAPPING_EXAMPLES} from './component-source-binding.js'
import {chartTemplateSchema} from './chart-template-contract.js'
import {marketPanelSchema} from './market-artifact.js'
import {TABLE_INPUT_SCHEMA} from './template-data-contract.js'
import {KPI_GUIDANCE} from './kpi-template-contract.js'
import {COMPONENT_DERIVED_VALUE_GUIDANCE} from './component-derived-values.js'

const NAME='submit_component_data'
const SCHEMA='component_presentation_schema'

export const COMPONENT_SUBMISSION_MAPPING_GUIDANCE = `requests 只引用本卡已成功执行的工具名和原参数；mapping 描述呈现结构，数据用真实字段路径引用完整响应，不复制整组数值。
public_data_query 的 requests 项为 {key:"q",tool:"public_data_query",args:{operation:"query",source:"实际来源标识",parameters_json:"成功查询时的原 JSON"}}；完整复用调用的外层 args，不把 symbol、limit 等内层参数平铺出来。
${COMPONENT_DERIVED_VALUE_GUIDANCE}
$from 指 requests.key；$path 为响应内的点分路径；$each 选择实际数组，$map 映射每行字段。表格 rows 使用 {$from:"q",$each:"实际列表",$map:[{$path:"名称字段"},{$path:"数值字段"}]}，columns 与单元格一一对应。
列表可用 $filter:{字段:原值} 等值筛选、$sortBy:"字段"、$order:"asc|desc" 排序、$take:5 取前五或 $take:-20 取末二十；$single:true 在筛选后恰好一条时取单值。$as:"number|string" 转标量，$scale 换单位，$digits:2 控制精度，$prefix/$suffix 加文字。图表 labels 和 series.values 的 $map 必须是单个字段选择器，不用表格行的数组写法；每个标的聚合后得到单值时，使用由这些选择器组成的 values 数组。日期区间可用 $filter:{真实日期字段:{$gte:"YYYY-MM-DD",$lte:"YYYY-MM-DD"}}，边界包含当天，支持实际 YYYY-MM-DD/ YYYYMMDD 日期，先筛选再统计；自然月不能替换为固定交易日数量。共同基期比较在 values 的列表选择器用 $normalize:"base100"；日期和值必须采用完全相同的筛选排序，不把缺失填成0。
可用字段才使用相应示例：指标 ${JSON.stringify(COMPONENT_MAPPING_EXAMPLES.metric)}；排名 ${JSON.stringify(COMPONENT_MAPPING_EXAMPLES.ranking)}。排名保留负号。不支持 $concat/$join/$format；名称直接选原字段，代码放明细。chart 的补充明细用 detailColumns 与 detailRows（二维数组，和表格 rows 的映射相同）；首格对应 labels，其余为辅助字段，两者必须同批筛选排序、表头与每行等长。宿主将绘图数值合并进折叠明细，主图不堆放这些字段。
$optional/$default 写在字段选择器内，不能和 label/value 并列。不存在的非必需字段直接省略；关键缺失明确说明，不能猜路径或填假数值。来源、数据日期、单位保留真实含义；获取时间不冒充报价时间。容量不足仍引用完整响应，不删记录。宿主会从本卡实际响应补齐来源和统计区间，不必拼接 asOf；如需显式来源，kpi 使用 sources:[{name,url?}]，table/chart/market 使用 sources:[{label,url?}]，没有顶层 source 字段。非必需口径字段不存在时省略，不猜 summary.note 等路径。note 只写影响理解的一两句口径，详细来源由底栏提供，不重述所有数值、工具参数或生成过程。不要凭日历推算交易日数；如说明实际观测数量，必须按筛选后真实记录计数，不用查询 limit 或原始响应条数代替。`

// Validate only an explicit per-series count for a daily chart. A requested
// lookback, source coverage or the combined point count is a different fact.
// Run at submission, not when opening a saved chart; records stay untouched.
function observationCountIssue(data){
 if(data?.type!=='chart'||!Array.isArray(data.labels)||!data.labels.length||!data.labels.every(label=>/^\d{4}-\d{2}-\d{2}$/u.test(label))||!data.series?.every(series=>series.values?.length===data.labels.length))return null
 for(const key of ['note','subtitle']){
  const claims=String(data[key]??'').matchAll(/(?:均为|均有|各为|各有|每条序列(?:包含|含有|有)|每个指数(?:包含|含有|有))\s*(\d+)\s*个?\s*(?:交易日|数据点|观测(?:值|点|记录))/gu)
  for(const claim of claims)if(Number(claim[1])!==data.labels.length)return `${key} 中每条序列的观测数量写为${claim[1]}，但筛选后实际为${data.labels.length}条。只修正或省略这句数量说明，保留完整日期与数值，无需重新取数。`
 }
 return null
}

// Acquisition and presentation are separate. The child chooses a renderer
// after seeing its own complete responses, and receives correctable validation
// feedback before ending. No source values are supplied by this tool's caller.
export function createComponentDataSubmission({observeRecords,signal,options={},bindingRequested=false,validateSnapshot}){
 let child,disposed=false,pending,accepted,finish
 const releases=[],result=new Promise(resolve=>{finish=resolve})
 const check=exec=>{
  signal?.throwIfAborted();exec.signal?.throwIfAborted()
  if(disposed||exec.agent!==child||pending||accepted)throw Error('This component submission is closed or belongs to another execution.')
 }
 const schema=defineTool({
  name:SCHEMA,description:'Read a presentation schema only when changing the suggested renderer. Choose from actual data and user intent; this does not fetch data or change the component.',
  parameters:{type:{type:'string',enum:['kpi','table','chart','market'],required:true},variant:{type:'string'}},
  output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,
  execute(args,exec){check(exec);return{schema:args.type==='chart'?chartTemplateSchema(args.variant):args.type==='market'?marketPanelSchema(args.variant):args.type==='table'?TABLE_INPUT_SCHEMA:'{"version":1,"type":"kpi","title":"标题","asOf":"数据时点","items":[{"label":"指标","value":"来源字段映射","unit":"单位"}]}',guidance:args.type==='kpi'?KPI_GUIDANCE:'Use real observed source paths. Template fields describe presentation, never required business metrics.'}}
 })
 const definition=defineTool({
  name:NAME,description:'Submit this component using already observed data. requests identify exact successful calls; mapping chooses the appropriate presentation (kpi/table/chart/market etc.) and references actual fields. Validation errors are returned here: fix only the presentation and resubmit using the same data. Acceptance ends this component. Never submit placeholders to probe.',
  parameters:{requests:{type:'array',required:true,items:{type:'object',properties:{key:{type:'string',required:true},tool:{type:'string',required:true},args:{type:'object',required:true,additionalProperties:true}},additionalProperties:false}},mapping:{type:'object',required:true,additionalProperties:true}},
  output:{schema:{type:'object',properties:{accepted:{type:'boolean',required:true}},additionalProperties:false},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>false,
  execute(args,exec){
   check(exec)
   if(!args||Object.keys(args).some(key=>!['requests','mapping'].includes(key)))throw Error('Submit only requests and mapping; do not include source response values.')
   const candidate={version:1,type:'data-bound',requests:args.requests,mapping:args.mapping},text=JSON.stringify(candidate)
   if(Buffer.byteLength(text)>256000)throw Error('Use paths into the complete observed responses instead of copying source records into the submission.')
   const records=structuredClone(observeRecords()),now=new Date()
   const observedTools=[...new Set(records.filter(record=>record.purpose!=='discovery').map(record=>record.tool))]
   if(observedTools.length&&Array.isArray(args.requests)&&args.requests.some(request=>!observedTools.includes(request?.tool)))throw Error('数据引用的工具名必须逐字复用本卡成功调用，不能使用来源别名。本卡实际工具名：'+observedTools.slice(0,8).join('、')+'。保留其原参数及真实字段，无需重新取数。')
   let snapshot
   try{snapshot=resolveBoundComponent(text,records,now,{...options,staticSnapshot:!bindingRequested})}catch(error){
    let snapshotError
    if(!bindingRequested)snapshot=resolveComponentSnapshot(text,records,now,{...options,onSnapshotError:issue=>{snapshotError=issue}})
    if(!snapshot)throw snapshotError??error
   }
   if(!snapshot)throw Error('No verified component data yet. Obtain the requested records, then submit their exact request parameters and real field paths.')
   const countIssue=observationCountIssue(snapshot.data)
   if(countIssue)throw Error(countIssue)
   validateSnapshot?.(snapshot,records)
   check(exec)
   pending={callId:exec.callId,text}
   return{accepted:true}
  }
 })
 const dispose=()=>{if(disposed)return;disposed=true;for(const release of releases.splice(0).reverse())release();signal?.removeEventListener('abort',dispose);pending=accepted=undefined}
 signal?.addEventListener('abort',dispose,{once:true})
 return{
  instruction:'【数据先行的组件交付】先取得并理解本卡所需的真实数据，再决定呈现形式。规划类型只是建议，模板提供样式和交互，不要求数据迁就模板字段；用户明确要求的图形、比较范围、口径和功能必须保留。指标用紧凑指标区；类别排名使用 chart 的 horizontal 变体，只绘制排名指标，辅助规模等信息放明细，不用折线连接无时间关系的产品；时间序列适合趋势图，明细用可排序、可调列宽的表格。需要换形式且不熟悉字段时才调用 component_presentation_schema。取得足够数据后调用 submit_component_data，传 requests 与 mapping 两个对象；不再把完整 JSON 写成最终回复。数值和记录引用真实路径，不复制数值或构造假数据。提交若返回校验错误，在当前任务直接修正并再次提交，不重新取数、不退出、不把内部错误写入正文。缺失仅标记实际未取得的字段，已有数据必须保留；不能用空状态冒充完成。',
  result,
  register(agent){
   signal?.throwIfAborted()
   if(disposed||child||!agent.ctx.tools?.register||!agent.ctx.tools?.guard)throw Error('组件提交边界不可用。')
   child=agent
   try{
    releases.push(agent.ctx.tools.guard(exec=>[NAME,SCHEMA].includes(exec.name)&&exec.agent!==agent?'This submission belongs only to its component child.':undefined))
    releases.push(agent.ctx.tools.register(schema),agent.ctx.tools.register(definition))
   }catch(error){dispose();throw error}
  },
  accept(event){
   if(disposed||signal?.aborted||!pending&&!accepted)return
   if(event?.type==='tool/result'&&pending){
    const message=event.data?.message,matching=(message?.content??[]).filter(block=>block.toolCallId===pending.callId)
    if(message?.source?.callId===pending.callId||matching.length){
     if(!event.data?.error&&!matching.some(block=>block.isError===true||block.error!=null))accepted=pending
     pending=undefined
    }
   }
   if(event?.type==='step/end'&&accepted)finish({stopReason:'completed',output:[{type:'text',text:accepted.text}]})
  },
  dispose
 }
}
