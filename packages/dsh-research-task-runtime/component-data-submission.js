import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {resolveBoundComponent,resolveComponentSnapshot,componentMappableSource,COMPONENT_MAPPING_EXAMPLES} from './component-source-binding.js'
import {chartTemplateSchema} from './chart-template-contract.js'
import {marketPanelSchema} from './market-artifact.js'
import {TABLE_INPUT_SCHEMA} from './template-data-contract.js'
import {KPI_GUIDANCE} from './kpi-template-contract.js'
import {COMPONENT_DERIVED_VALUE_GUIDANCE} from './component-derived-values.js'
import {TIMELINE_DATA_GUIDANCE} from './timeline-template-contract.js'
import {COMPONENT_TEMPLATES} from './component-template-registry.js'
import {DERIVED_GUIDANCE} from './derived-template-contract.js'

const NAME='submit_component_data'
const SCHEMA='component_presentation_schema'

export const COMPONENT_SUBMISSION_MAPPING_GUIDANCE = `requests 引用本卡已成功执行的数据请求；mapping 描述呈现结构，数据用真实字段路径引用完整响应，不复制整组数值。
同一工具有多个响应时，可调用 component_presentation_schema({}) 查看本卡 sourceRef 与可引用的根字段，提交 {key:"q",sourceRef:"实际编号"}，由宿主恢复精确原请求。无需重新取数或手抄参数。静态卡支持本轮 web_fetch 完整 JSON；数组读 records，对象读 data.字段。网页纯文本、截断、目录或错误响应不能作为结构化引用，也不能建立刷新绑定。
同一工具在本卡仅有一个成功业务请求时，优先写 {key:"q",tool:"实际工具名"}，省略 args，由宿主复用其完整原参数；不要补写默认值或 null。若同一工具有多个成功业务请求，才提供原 args 明确选择，不能省略；接口目录不计为业务请求。
需要明确选择 public_data_query 的多次请求时，requests 项为 {key:"q",tool:"public_data_query",args:{operation:"query",source:"实际来源标识",parameters_json:"成功查询时的原 JSON"}}；完整复用调用的外层 args，不把 symbol、limit 等内层参数平铺出来。
${COMPONENT_DERIVED_VALUE_GUIDANCE}
$from 指 requests.key；$path 为响应内的点分路径；$each 选择实际数组，$map 映射每行字段。表格 rows 使用 {$from:"q",$each:"实际列表",$map:[{$path:"名称字段"},{$path:"数值字段"}]}，columns 与单元格一一对应。
带点的原始键用 JSON 字符串下标逐字引用，例如 data.data["usAAPL.OQ"].day；不要删掉交易所后缀或把一个原始键拆为多个字段。遇到同名嵌套键时使用下标明确消歧。
时间线或发布动态列表用 items:[{$from:"q",$each:"records",$map:{id:{$path:"实际ID"},title:{$path:"原始标题"},time:{$path:"原始发布日期"},url:{$path:"原文链接"}}}]。每个来源可提供一组。title、time、url 必须直接取自同一条记录，不改写、拼接或猜测。只要这些核心字段可核验，条数、附加长说明和原生载荷超限时宿主自动交付可浏览的完整来源列表，无需重取或删记录；需要完整正文时仍可引用原始长字段，由宿主提供展开查看。
列表可用 $filter:{字段:原值} 等值筛选、$sortBy:"字段"、$order:"asc|desc" 排序、$take:5 取前五或 $take:-20 取末二十；$single:true 在筛选后恰好一条时取单值。$as:"number|string" 转标量，$scale 换单位，$digits:2 控制精度，$prefix/$suffix 加文字。图表 labels 和 series.values 的 $map 必须是单个字段选择器，不用表格行的数组写法；每个标的聚合后得到单值时，使用由这些选择器组成的 values 数组。日期区间可用 $filter:{真实日期字段:{$gte:"YYYY-MM-DD",$lte:"YYYY-MM-DD"}}，边界包含当天，支持实际 YYYY-MM-DD/ YYYYMMDD 日期，先筛选再统计；自然月不能替换为固定交易日数量。共同基期比较在 values 的列表选择器用 $normalize:"base100"；日期和值必须采用完全相同的筛选排序，不把缺失填成0。
可用字段才使用相应示例：指标 ${JSON.stringify(COMPONENT_MAPPING_EXAMPLES.metric)}；排名 ${JSON.stringify(COMPONENT_MAPPING_EXAMPLES.ranking)}。排名保留负号。不支持 $concat/$join/$format；名称直接选原字段，代码放明细。chart 的补充明细用 detailColumns 与 detailRows（二维数组，和表格 rows 的映射相同）；labels 和 detailRows 使用完全相同的 $from/$each/筛选/排序/截取，$map 选择各自所需字段，表头与每行等长。宿主会关联同一记录的名称并加入绘图数值，辅助明细不必重复名称，主图不堆放这些字段。不同来源或不同排序不能按行号强行拼接。
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

function observedRequestChoices(records,tool){
 const choices=records.filter(record=>record.tool===tool&&record.purpose!=='discovery').map(({tool,args})=>({tool,args}))
 // Return only request identity, never response records. Keep the error bounded
 // without truncating JSON into an unusable correction.
 const text=JSON.stringify(choices.slice(0,8))
 return text.length<=4096?` 本卡已成功请求（tool/args）：${text}`:''
}

const sourceReference = record => createHash('sha256').update(JSON.stringify([record.tool,record.args])).digest('hex').slice(0,24)

// Describe paths, not source values. A schema lookup must not spend another
// model round trip rediscovering a nested business array or retranscribing it.
function sourceCollections(response) {
 const collections=[],seen=new Set();let visited=0
 const segment=key=>/^[A-Za-z_$][\w$]*$/.test(key)?'.'+key:'['+JSON.stringify(key)+']'
 const walk=(value,path,depth)=>{
  if(!value||typeof value!=='object'||path.length>512||depth>7||visited++>=160||seen.has(value)||collections.length>=12)return
  seen.add(value)
  if(Array.isArray(value)){
   const sample=value.find(item=>item!==null&&item!==undefined)
   const fields=sample&&typeof sample==='object'&&!Array.isArray(sample)?Object.keys(sample).filter(name=>name.length<=128).slice(0,32).map(name=>({name,type:sample[name]===null?'null':Array.isArray(sample[name])?'array':typeof sample[name]})):[]
   collections.push({path,count:value.length,fields})
   return
  }
  for(const key of Object.keys(value).filter(key=>key.length<=128).slice(0,32))walk(value[key],path?path+segment(key):/^[A-Za-z_$][\w$]*$/.test(key)?key:'['+JSON.stringify(key)+']',depth+1)
 }
 walk(response,'',0);return collections
}

function sourceReferences(records) {
 return records.filter(componentMappableSource).slice(-16).map(record => {
  const sample = Array.isArray(record.response.records) ? record.response.records[0] : undefined
  return {sourceRef:sourceReference(record), tool:record.tool,
   ...(typeof record.response.source === 'string' ? {source:record.response.source.slice(0,128)} : {}),
   ...(record.tool === 'web_fetch' ? {url:record.response.sourceUrl} : {}),
   ...(typeof record.response.api === 'string' ? {api:record.response.api.slice(0,64)} : {}),
   ...(typeof sample?.ts_code === 'string' ? {symbol:sample.ts_code.slice(0,32)} : {}),
   ...(record.purpose === 'snapshot' ? {snapshotOnly:true} : {}),
   fields:Object.keys(record.response).filter(key=>key.length<=128).slice(0,20),collections:sourceCollections(record.response),
   ...(sample && typeof sample === 'object' ? {recordFields:Object.keys(sample).filter(key=>key.length<=128).slice(0,24)} : {}),
   ...(record.tool === 'web_fetch' && record.response.data ? {dataFields:Object.keys(record.response.data).filter(key=>key.length<=128).slice(0,24)} : {})}
 })
}

function reuseObservedRequests(requests,records){
 if(!Array.isArray(requests))throw Error('requests 必须列出本卡已成功执行的数据请求。')
 return requests.map(request=>{
  if (Object.hasOwn(request,'sourceRef')) {
   const matches=records.filter(record=>componentMappableSource(record)&&sourceReference(record)===request.sourceRef)
   if(matches.length!==1)throw Error('该 sourceRef 不属于当前组件的唯一成功响应。调用 component_presentation_schema({}) 查看当前来源。')
   const {tool,args}=matches[0]
   if (Object.hasOwn(request,'tool') && request.tool !== tool || Object.hasOwn(request,'args') && !isDeepStrictEqual(request.args,args))
    throw Error('sourceRef 与提交的 tool/args 指向不同请求。请保留 sourceRef 并省略重复参数，或提交实际成功调用的原参数。')
   return {key:request.key,tool,args:structuredClone(args)}
  }
  if(typeof request.tool!=='string')throw Error('每个请求需要 sourceRef 或实际工具名。')
  if(Object.hasOwn(request,'args'))return request
  const matches=records.filter(record=>record.tool===request.tool&&componentMappableSource(record))
  if(matches.length!==1)throw Error(matches.length
   ?`同一工具有多个成功业务请求，请用原 args 明确选择；不会自动选取最近一次。${observedRequestChoices(records,request.tool)}`
   :'该工具在本卡没有成功业务请求，不能引用目录、失败调用或其他组件的数据。')
  return {...request,args:structuredClone(matches[0].args)}
 })
}

// Acquisition and presentation are separate. The child chooses a renderer
// after seeing its own complete responses, and receives correctable validation
// feedback before ending. No source values are supplied by this tool's caller.
export function createComponentDataSubmission({observeRecords,signal,options={},bindingRequested=false,validateSnapshot,validateArtifact}){
 let child,disposed=false,pending,accepted,finish
 const releases=[],result=new Promise(resolve=>{finish=resolve})
 const check=exec=>{
  signal?.throwIfAborted();exec.signal?.throwIfAborted()
  if(disposed||exec.agent!==child||pending||accepted)throw Error('This component submission is closed or belongs to another execution.')
 }
 const schema=defineTool({
  name:SCHEMA,description:'List successful responses for this component as sourceRef, or inspect a presentation schema by passing type. This does not fetch data or change the component.',
  parameters:{type:{type:'string'},variant:{type:'string'}},
  output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,
  execute(args,exec){
   check(exec);if(!args.type)return {sources:sourceReferences(observeRecords()),staticDelivery:'文档解析、网页正文及关系图可用 submit_component_data({artifact:完整宿主组件JSON})；不需要伪造 requests 或 mapping。原始取数、来源和完整性校验仍执行。'}
   const schema=args.type==='chart'?chartTemplateSchema(args.variant):args.type==='market'?marketPanelSchema(args.variant):args.type==='table'?TABLE_INPUT_SCHEMA:args.type==='timeline'?TIMELINE_DATA_GUIDANCE:args.type==='kpi'?'{"version":1,"type":"kpi","title":"标题","asOf":"数据时点","items":[{"label":"指标","value":"来源字段映射","unit":"单位"}]}':['mind-map','summary'].includes(args.type)?DERIVED_GUIDANCE:args.type==='markdown'?'{"version":1,"type":"markdown","title":"标题","content":"完整正文与原始出处链接"}':args.type==='html'?'{"version":1,"type":"html","title":"标题","html":"完整自包含离线HTML"}':COMPONENT_TEMPLATES.find(template=>template.type===args.type&&template.schema)?.schema
   if(!schema)throw Error('该呈现形式没有独立映射协议。可沿已提供的宿主组件协议提交 artifact；不为通过提交而改变业务内容。')
   return{schema,sources:sourceReferences(observeRecords()),guidance:args.type==='kpi'?KPI_GUIDANCE:'结构化数据用 requests/mapping；文档或网页正文用 artifact。呈现字段不规定业务内容。保留原始出处、日期、完整记录与必要交互。'}
  }
 })
 const definition=defineTool({
  name:NAME,description:'Deliver this component after acquisition and processing. For structured observed responses use requests:[{key,sourceRef}] and mapping; sourceRef comes from component_presentation_schema({}). Alternatively requests:[{key,tool}] reuses a sole successful call; multiple calls require exact original args. For parsed documents, webpage prose or custom relationships, use artifact with the complete host component JSON instead, without requests/mapping. This static path still checks sources, content and completeness, and cannot provide automatic refresh. Correct errors in the same child using acquired material. Acceptance ends this component.',
  parameters:{requests:{type:'array',items:{type:'object',properties:{key:{type:'string',required:true},tool:{type:'string'},sourceRef:{type:'string',description:'The exact reference returned by component_presentation_schema({}); omit tool and args.'},args:{type:'object',description:'Omit to reuse the sole successful business call of this tool. Required only to select among multiple calls; copy exact original arguments without adding defaults.',additionalProperties:true}},additionalProperties:false}},mapping:{type:'object',additionalProperties:true},artifact:{type:'object',description:'Static delivery of the complete existing host component JSON after reading actual documents or webpages. Mutually exclusive with requests/mapping. No invented data, no refresh recipe.',additionalProperties:true}},
  output:{schema:{type:'object',properties:{accepted:{type:'boolean',required:true}},additionalProperties:false},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>false,
  execute(args,exec){
   check(exec)
   if(!args||Object.keys(args).some(key=>!['requests','mapping','artifact'].includes(key)))throw Error('只提交 requests/mapping，或单独提交完整静态 artifact。')
   if(Buffer.byteLength(JSON.stringify(args))>256000)throw Error('Use paths into the complete observed responses instead of copying source records into the submission.')
   if(Object.hasOwn(args,'artifact')){
    if(Object.hasOwn(args,'requests')||Object.hasOwn(args,'mapping'))throw Error('artifact 与 requests/mapping 互斥；静态材料不需要伪造数据请求。')
    if(bindingRequested)throw Error('本卡要求自动刷新，静态 artifact 不能替代已验证的刷新配方。')
    if(typeof validateArtifact!=='function')throw Error('静态组件校验边界不可用。')
    const text=validateArtifact(structuredClone(args.artifact),structuredClone(observeRecords()))
    if(typeof text!=='string'||!text.trim())throw Error('静态组件正文或来源尚未通过校验，请保留完整内容修正后提交。')
    check(exec);pending={callId:exec.callId,text};return{accepted:true}
   }
   if(!Object.hasOwn(args,'requests')||!Object.hasOwn(args,'mapping'))throw Error('结构化引用需要 requests 与 mapping；文档或网页正文使用 artifact。')
   const records=structuredClone(observeRecords()),now=new Date()
   const observedTools=[...new Set(records.filter(record=>record.purpose!=='discovery').map(record=>record.tool))]
   if(observedTools.length&&Array.isArray(args.requests)&&args.requests.some(request=>!Object.hasOwn(request,'sourceRef')&&!observedTools.includes(request?.tool)))throw Error('数据引用的工具名必须逐字复用本卡成功调用，不能使用来源别名。本卡实际工具名：'+observedTools.slice(0,8).join('、')+'。保留其原参数及真实字段，无需重新取数。')
   const candidate={version:1,type:'data-bound',requests:reuseObservedRequests(args.requests,records),mapping:args.mapping},text=JSON.stringify(candidate)
   if(Buffer.byteLength(text)>256000)throw Error('完整数据请求与映射超过容量限制，不能截断来源参数。')
   if (bindingRequested && candidate.requests.some(request => ['web_fetch','financial_query'].includes(request.tool)))
    throw Error('网页或查询快照不能建立刷新绑定。需要自动更新时使用原授权范围内支持刷新的来源。')
   let snapshot
   try{snapshot=resolveBoundComponent(text,records,now,{...options,staticSnapshot:!bindingRequested})}catch(error){
    let snapshotError
    if(!bindingRequested)snapshot=resolveComponentSnapshot(text,records,now,{...options,onSnapshotError:issue=>{snapshotError=issue}})
    if(!snapshot){
     const issue=snapshotError??error
     if(String(issue?.message).includes('未匹配本轮已成功取数的原参数')){
      const choices=[...new Set(candidate.requests.map(request=>request.tool))].map(tool=>observedRequestChoices(records,tool)).join('')
      throw Error(issue.message+' 可用 component_presentation_schema({}) 获取 sourceRef；同一工具仅有一个成功业务请求时，可省略 args 直接复用。'+choices)
     }
     throw issue
    }
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
  instruction:'【数据先行的组件交付】先取得并理解本卡所需的真实数据，再决定呈现形式。规划类型只是建议，模板提供样式和交互，不要求数据迁就模板字段；用户明确要求的图形、比较范围、口径和功能必须保留。指标用紧凑指标区；类别排名使用 chart 的 horizontal 变体，只绘制排名指标，辅助规模等信息放明细，不用折线连接无时间关系的产品；时间序列适合趋势图，明细用可排序、可调列宽的表格。需要换形式且不熟悉字段时只调用一次 component_presentation_schema({type,variant})，同一响应会给出呈现协议、当前 sourceRef、实际嵌套数组路径及条数；直接映射完整数组，不再单独查询空参数目录，不手抄长序列。取得结构化数据后调用 submit_component_data，传 requests 与 mapping。已解析的文档、网页正文、关系图或自定义静态呈现，调用同一工具传 artifact:完整宿主组件JSON，不传 requests/mapping；不用为文字内容伪造业务请求，不将正文包装成刷新配方。两条路径均保留本卡真实来源并继续校验完整性；静态交付不能替代明确要求的刷新。数值和记录引用真实路径，不复制数值或构造假数据。提交若返回校验错误，在当前任务直接修正并再次提交，不重新取数、不退出、不把内部错误写入正文。缺失仅标记实际未取得的字段，已有数据必须保留；不能用空状态冒充完成。',
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
