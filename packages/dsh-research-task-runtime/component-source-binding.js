import { templateDataIssue, templateSourceDataIssue } from './template-data-contract.js'
import { isDeepStrictEqual } from 'node:util'
import { decodeDataResponse, evaluateMapping, materializeComponentMapping } from './component-data-refresh.js'
import { extractArtifactObjects, acceptArtifactOutput } from './artifact-output.js'
import { templateFor } from './component-template-registry.js'

// Only observed successful plugin responses can back a refresh recipe. These
// records never include private model reasoning, guessed APIs or credentials.
export function componentSourceCollector(allowed,schemas=[]) {
  const discovery=new Set(schemas.filter(schema=>{
    const introduction=(schema.description??'').slice(0,300)
    return /导航接口|搜的是【数据接口】，不是数据本身/u.test(introduction)||/^(?:获取|读取).{0,40}(?:API|接口).{0,10}(?:完整定义|参数定义)/iu.test(introduction)
  }).map(schema=>schema.name))
  const calls=new Map(), records=[]
  return {
    records,
    accept(event) {
      if(event?.type==='tool/call'&&allowed.includes(event.data?.name)) {
        try { const args=typeof event.data.arguments==='string'?JSON.parse(event.data.arguments):event.data.arguments;calls.set(event.data.callId,{tool:event.data.name,args}) } catch {}
      }
      if(event?.type!=='tool/result')return
      const message=event.data?.message,call=calls.get(message?.source?.callId)
      if(!call)return
      calls.delete(message.source.callId)
      const result=message.content?.find(b=>b.type==='tool-result')
      if(!result||result.isError)return
      const purpose=discovery.has(call.tool)?'discovery':undefined
      let response
      try { response=decodeDataResponse(result) }
      catch { if(!purpose)return;response=null }
      // Plain-text API definitions still establish discovery, never data.
      {
        const previous=records.findIndex(r=>r.tool===call.tool&&isDeepStrictEqual(r.args,call.args))
        if(previous>=0)records.splice(previous,1)
        records.push({...call,response,...(purpose?{purpose}:{})})
        // A late business response must never be lost because discovery filled
        // the first slots. Evict directory responses first, then oldest data.
        while(records.length>32||Buffer.byteLength(JSON.stringify(records))>8_000_000){
          const directory=records.findIndex(r=>r.purpose==='discovery')
          records.splice(directory<0?0:directory,1)
        }
      }
    }
  }
}

export const COMPONENT_BOUND_DATA_PROMPT = `
自动绑定数据交付协议：通过已配置插件取得可映射的结构化数据后，最终必须交付一个 data-bound 对象。此协议替代上文直接提交静态模板 JSON 的输出要求；mapping 仍使用上文模板 schema。由宿主映射真实响应、渲染当前固定模板并自动保存一分钟刷新。无需抄写数百行数值，也不调用额外工具设置刷新。行情、K线、表格、资讯、研报均适用。保留可复用的原始字段和摘要，不为改写摘要退回静态输出。格式：
{"version":1,"type":"data-bound","requests":[{"key":"q","tool":"实际成功调用的 ework__ 工具名","args":{"原参数":"原值"}}],"mapping":{"version":1,"type":"market","variant":"本面板模板","title":"标题","asOf":{"$from":"q","$path":"真实日期路径","$suffix":" · 通联 DataYes"},"items":{"$from":"q","$each":"真实数组路径","$map":{"label":{"$path":"名称字段"},"value":{"$path":"数值字段","$as":"string"}}}}}
mapping 内的整体结构必须符合上文当前模板 schema；例子里的 items 仅演示指标映射，K线须用 candles，表格须用 columns/rows。$from 指 requests.key，$path 是点分路径或数组下标，$each/$map 映射原始数组，数组可加 $sortBy:"实际日期字段"、$order:"asc|desc" 排序，$take:5 取前5条、$take:-20 取最后20条；$single:true 要求恰好一条并返回单值，用于最新行情或数据日期，避免写死随分页变化的数组下标。$as 为 string/number；放在 $each 同层时逐项转换标量列表，放在 $map 字段内时转换该字段；$single:true 后转换单值。表格的 $map 必须是单元格数组，例如 [{"$path":"name"},{"$path":"weight","$as":"number"}]。$scale 换算单位，$digits:2 在换算后控制小数位（0–8）；百分比与亿元通常保留2位，价格按精度保留2–3位，避免显示浮点长尾。$prefix/$suffix 加文字，$optional:true 将来源缺失值保留为 null；文本字段可用 $default:"来源未提供摘要" 为缺失、null 或空字符串提供明确的缺失说明，不能用假数值填补。列表中存在 url 时将其映射到条目 url，保留来源链接。无脚本。请求 args 必须原样复制本轮成功业务调用，包括日期值和所有参数类型；无需创建日期表达式。宿主会为最新数据自动推导滚动窗口，固定历史需求保持原日期。不要把日期写成表达式字符串。通联 ai_search 的 SOURCES/EVIDENCE 文本由宿主按实际来源规范化为 {sources:[{id,category,source,date,title,url,summary,excerpts}]}；summary 是第一条证据原句，excerpts 为全部原句，可直接绑定 news.items。除此之外只引用实际 JSON 结构，不猜字段。
批量多证券列表先使用 $filter:{"ticker":"实际证券代码"} 按行字段等值筛选，再排序和截取；$filter 只支持 1–16 个标量条件，多个条件同时成立，不支持表达式。近20日曲线的 labels 和每条 series.values 必须使用相同的日期排序及 $take:-20，保证日期和值对齐。单对象接口响应使用 {"$from":"q","$map":{"label":{"$path":"data.data.name"},"weight":{"$path":"data.data.marketValue","$scale":1e-8}}}，路径相对该请求响应根对象，无需 $each；$single:true 可省略。
最新单值的完整例子：{"$from":"q","$each":"真实列表路径","$sortBy":"真实日期字段","$order":"desc","$take":1,"$single":true,"$map":{"$path":"真实数值字段"},"$as":"number","$scale":100,"$digits":2,"$suffix":"%"}。数据日期使用同一结构，$map 改为 {"$path":"真实日期字段"}，删除 $as:number、$scale、$digits。$path 读取字段，$each 选择列表，$map 在行内读取；只能用上述运算符，禁止发明 $path2、$field 或把整条记录格式化成文字。
来源只有非结构化文本或映射不能表达必要内容时，保留正常模板 JSON 和可核查来源，不伪造可刷新绑定。`

// A bounded sample teaches paths without resending long datasets or fetching
// them again. Validation still evaluates against the complete observed result.
export function componentBindingEvidence(records) {
 const sample=(value,depth=0)=>{
  if(depth>12)return null
  if(Array.isArray(value))return value.slice(0,3).map(v=>sample(v,depth+1))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,80).map(([k,v])=>[k,sample(v,depth+1)]))
  return typeof value==='string'?value.slice(0,3000):value
 }
 let used=0
 return records.filter(record=>record.purpose!=='discovery').slice(-8).flatMap(record=>{
  const text=JSON.stringify({tool:record.tool,args:record.args,responseSample:sample(record.response)})
  if(used+Buffer.byteLength(text)>100000)return []
  used+=Buffer.byteLength(text);return [text]
 }).join('\n')
}

function rollingTodayAnchors(args,now) {
 const formats=['yyyyMMdd','yyyy-MM-dd','yyyyMMdd000000']
 const today=new Map(formats.map(format=>[evaluateMapping({$date:{format}}, {}, now),format]))
 const endKey=/^(dateString|end|endDate|end_date|end_time|to_date|tradeDate|trade_date|date)$/i
 const beginKey=/^(start|begin|startDate|beginDate|start_date|begin_date|start_time|begin_time|from_date)$/i
 const dateParts=value=>typeof value==='string'?(value.match(/^(\d{4})-(\d{2})-(\d{2})$/)??value.match(/^(\d{4})(\d{2})(\d{2})(?:000000)?$/)):null
 const day=parts=>Date.UTC(Number(parts[1]),Number(parts[2])-1,Number(parts[3]))
 const todayDay=day(dateParts(evaluateMapping({$date:{format:'yyyy-MM-dd'}},{},now)))
 const isToday=value=>today.has(typeof value==='string'?value:value?.$date?evaluateMapping(value,{},now):null)
 const visit=(value,key='')=>{
  if(typeof value==='string'&&endKey.test(key)&&today.has(value))return {$date:{format:today.get(value),timezone:'Asia/Shanghai'}}
  if(Array.isArray(value))return value.map(v=>visit(v))
  if(value&&typeof value==='object'){
   const entries=Object.entries(value),hasRollingEnd=entries.some(([k,v])=>endKey.test(k)&&isToday(v))
   return Object.fromEntries(entries.map(([k,v])=>{
    const parts=beginKey.test(k)&&hasRollingEnd?dateParts(v):null
    if(parts){
     const offsetDays=(day(parts)-todayDay)/86400000
     if(Number.isInteger(offsetDays)&&offsetDays<=0&&offsetDays>=-3660){
      const format=v.includes('-')?'yyyy-MM-dd':v.length===14?'yyyyMMdd000000':'yyyyMMdd'
      const rule={$date:{format,timezone:'Asia/Shanghai',offsetDays}}
      if(evaluateMapping(rule,{},now)===v)return [k,rule]
     }
    }
    return [k,visit(v,k)]
   }))
  }
  return value
 }
 return visit(args)
}

function singleSourceMapping(mapping,responses) {
  const keys=Object.keys(responses)
  if(keys.length!==1)return mapping
  // A lone verified source is unambiguous. Persist the explicit reference so
  // generation and every subsequent refresh use identical scopes. Array maps
  // retain their per-row scope; already-qualified response paths stay intact.
  const visit=(value,inRow=false)=>{
    if(Array.isArray(value))return value.map(v=>visit(v,inRow))
    if(!value||typeof value!=='object')return value
    const path=value.$each??value.$path
    const inferred=!inRow&&value.$from===undefined&&typeof path==='string'&&!Object.hasOwn(responses,path.split('.')[0])
    return Object.fromEntries([
      ...(inferred?[['$from',keys[0]]]:[]),
      ...Object.entries(value).map(([k,v])=>[k,visit(v,inRow||k==='$map')])
    ])
  }
  return visit(mapping)
}

function normalizeRequestDates(value,depth=0) {
  if(depth>24)throw Error('数据请求超出嵌套限制')
  if(Array.isArray(value))return value.map(v=>normalizeRequestDates(v,depth+1))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeRequestDates(v,depth+1)]))
  if(typeof value!=='string'||!/^\s*\{\s*(?:"\$date"|\$date)\s*:/u.test(value))return value
  // Some models serialize the small date object as a query-string value. Parse
  // only this grammar, never code; exact observed-argument matching still follows.
  let parsed
  try {
    if(value.length>512)throw Error()
    parsed=JSON.parse(value.replace(/([{,]\s*)(\$date|format|timezone|offsetDays)\s*:/gu,'$1"$2":'))
    const rule=parsed.$date
    if(Object.keys(parsed).length!==1||!rule||typeof rule!=='object'||Array.isArray(rule)||
      Object.keys(rule).some(k=>!['format','timezone','offsetDays'].includes(k)))throw Error()
  }catch {throw Error('日期规则必须为 JSON 对象；也可直接复制成功调用中的原日期参数，由宿主生成滚动窗口。')}
  return parsed
}

export function resolveBoundComponent(text,records,now=new Date(),options={}) {
  const candidate=extractArtifactObjects(text).reverse().find(value=>value?.type==='data-bound')
  if(!candidate)return null
  if(candidate.version!==1||!Array.isArray(candidate.requests)||!candidate.requests.length||candidate.requests.length>8||!templateFor(candidate.mapping))throw Error('自动更新配置需要已成功调用的接口及当前模板字段映射。')
  const requests=[],responses={}
  for(const request of candidate.requests) {
    if(typeof request.key!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(request.key)||Object.hasOwn(responses,request.key)||!/^ework__t_[a-f\d]+$/i.test(request.tool??''))throw Error('自动更新的数据引用无效。')
    const requestArgs=normalizeRequestDates(request.args)
    const args=evaluateMapping(requestArgs,{},now)
    const source=records.findLast(record=>record.tool===request.tool&&isDeepStrictEqual(record.args,args))
    if(source?.purpose==='discovery'){const error=Error('接口目录和参数定义不是业务数据；必须继续调用已确认的业务接口取得真实数值，再生成映射。');error.code='SOURCE_DATA_REQUIRED';throw error}
    if(!source)throw Error('自动更新只能绑定本轮已成功取数且参数一致的插件接口，请保留原请求及真实字段。')
    responses[request.key]=source.response
    requests.push({key:request.key,toolId:request.tool.slice('ework__'.length),args:options.rollingDates?rollingTodayAnchors(requestArgs,now):requestArgs})
  }
  const mapping=singleSourceMapping(candidate.mapping,responses)
  const data=materializeComponentMapping(mapping,responses,now)
  const sourceIssue=templateSourceDataIssue(data)
  if(sourceIssue)throw Object.assign(new Error(sourceIssue),{code:'SOURCE_DATA_REQUIRED'})
  const issue=templateDataIssue(data)
  if(issue)throw Error(issue)
  const output=acceptArtifactOutput(JSON.stringify(data))
  if(!output)throw Error('数据映射结果不符合当前组件模板，请根据真实响应修正路径、类型或单位。')
  return {data,output,recipe:{requests,mapping,intervalMinutes:1}}
}
