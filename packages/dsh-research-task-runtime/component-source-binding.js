import { isDeepStrictEqual } from 'node:util'
import { decodeDataResponse, evaluateMapping } from './component-data-refresh.js'
import { extractArtifactObjects, acceptArtifactOutput } from './artifact-output.js'
import { templateFor } from './component-template-registry.js'

// Only observed successful plugin responses can back a refresh recipe. These
// records never include private model reasoning, guessed APIs or credentials.
export function componentSourceCollector(allowed) {
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
      try { const response=decodeDataResponse(result);if(records.length<16)records.push({...call,response}) } catch { /* Prose alone has no repeatable field mapping. */ }
    }
  }
}

export const COMPONENT_BOUND_DATA_PROMPT = `
自动绑定数据：通过已配置插件取得结构化 JSON 后，最终优先交付一个 data-bound 对象，由宿主映射真实响应、渲染当前固定模板并自动保存一分钟刷新。无需抄写数百行数值，也不调用额外工具设置刷新。格式：
{"version":1,"type":"data-bound","requests":[{"key":"q","tool":"实际成功调用的 ework__ 工具名","args":{"原参数":"原值"}}],"mapping":{"version":1,"type":"market","variant":"本面板模板","title":"标题","asOf":{"$from":"q","$path":"真实日期路径","$suffix":" · 通联 DataYes"},"items":{"$from":"q","$each":"真实数组路径","$map":{"label":{"$path":"名称字段"},"value":{"$path":"数值字段","$as":"string"}}}}}
mapping 内的整体结构必须符合上文当前模板 schema；例子里的 items 仅演示指标映射，K线须用 candles，表格须用 columns/rows。$from 指 requests.key，$path 是点分路径或数组下标，$each/$map 映射原始数组，数组可加 $sortBy:"实际日期字段"、$order:"asc|desc" 排序，$take:5 取前5条、$take:-20 取最后20条；$single:true 要求恰好一条并返回单值，用于最新行情或数据日期，避免写死随分页变化的数组下标。$as 为 string/number，$scale 换算单位，$prefix/$suffix 加文字，$optional:true 将来源缺失值保留为 null；无脚本。请求 args 必须与本轮成功业务调用一致；随当前日期移动的参数可替换为 {$date:{format:"yyyyMMdd|yyyy-MM-dd|yyyyMMdd000000",timezone:"Asia/Shanghai",offsetDays:-42}}，宿主会核对当前求值与实际调用一致。通联 ai_search 的 SOURCES/EVIDENCE 文本由宿主按实际来源规范化为 {sources:[{id,category,source,date,title,url,summary,excerpts}]}；summary 是第一条证据原句，excerpts 为全部原句，可直接绑定 news.items。除此之外只引用实际 JSON 结构，不猜字段。来源只有非结构化文本或映射不能表达必要内容时，保留正常模板 JSON 和可核查来源，不伪造可刷新绑定。`

export function resolveBoundComponent(text,records,now=new Date()) {
  const candidate=extractArtifactObjects(text).reverse().find(value=>value?.type==='data-bound')
  if(!candidate)return null
  if(candidate.version!==1||!Array.isArray(candidate.requests)||!candidate.requests.length||candidate.requests.length>8||!templateFor(candidate.mapping))throw Error('自动更新配置需要已成功调用的接口及当前模板字段映射。')
  const requests=[],responses={}
  for(const request of candidate.requests) {
    if(typeof request.key!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(request.key)||Object.hasOwn(responses,request.key)||!/^ework__t_[a-f\d]+$/i.test(request.tool??''))throw Error('自动更新的数据引用无效。')
    const args=evaluateMapping(request.args,{},now)
    const source=records.findLast(record=>record.tool===request.tool&&isDeepStrictEqual(record.args,args))
    if(!source)throw Error('自动更新只能绑定本轮已成功取数且参数一致的插件接口，请保留原请求及真实字段。')
    responses[request.key]=source.response
    requests.push({key:request.key,toolId:request.tool.slice('ework__'.length),args:request.args})
  }
  const data=evaluateMapping(candidate.mapping,responses,now)
  const output=acceptArtifactOutput(JSON.stringify(data))
  if(!output)throw Error('数据映射结果不符合当前组件模板，请根据真实响应修正路径、类型或单位。')
  return {data,output,recipe:{requests,mapping:candidate.mapping,intervalMinutes:1}}
}
