// Use the interface definition already observed in this child, not an API-name
// allowlist or guessed provider behavior. An undocumented batch can return an
// empty set successfully and is therefore not evidence that all entities lack data.
export function scalarEntityArgumentIssue(args,records=[]) {
 if(typeof args?.api_name!=='string'||!args.params||typeof args.params!=='object')return
 const definitions=records.flatMap(record=>record.response?.kind==='catalog'?record.response.interfaces??[]:[])
 const api=definitions.findLast(api=>api.api===args.api_name)
 if(!api?.parameters)return
 for(const [key,value] of Object.entries(args.params)){
  const parameter=api.parameters[key],description=parameter?.description??''
  if(!parameter||!['str','string'].includes(parameter.type)||typeof value!=='string'||
    !/(?:代码|标的|证券|\bsymbol\b|\bidentifier\b)/iu.test(description)||
    /多个|多值|批量|逗号|分隔|列表|\b(?:multiple|batch|list|comma|separated)\b/iu.test(description))continue
  const values=value.split(/[,，]/u).map(value=>value.trim())
  if(values.length>1&&values.length<=100&&values.every(value=>/^[\w.-]{1,40}$/u.test(value)))
   return `接口 ${args.api_name} 的 ${key} 是单个对象参数，当前已读取定义未声明多值能力；不要把 ${values.length} 个代码拼成一个值后将空响应当作数据不存在。按已确认参数逐个读取，或先用接口明确支持的集合筛选取得名单再逐个补指标，复用成功响应并核对每个对象。`
 }
}
