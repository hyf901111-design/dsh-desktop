// Acquisition coverage is separate from visual templates and numeric validation.
export function statementOperatingRequested(request=''){
 const positive=request.split(/[。；;\n]/u).filter(part=>!/(?:不(?:要|取|含|查|需要)|无需|不用|禁止).{0,12}(?:装机|发电量|上网电量|售电量|经营数据)/u.test(part)).join('\n')
 return /装机(?:容量)?|发电量|上网电量|售电量/u.test(positive)&&/营业收入|归母净利|财务与经营|财务.{0,8}(?:对比|指标|差异)/u.test(positive)&&!/(?:全部|仅|只)(?:用|使用).{0,4}模拟数据/u.test(positive)
}
function identifiers(args){
 const values=[]
 for(const key of ['ticker','secID']){
  const value=args?.url_params?.[key]
  if(typeof value!=='string'||value.length>1000)continue
  for(const id of value.split(/[|,;]/u).map(s=>s.trim()))if(/^(?:\d{6}|\d{6}\.(?:SH|SZ|BJ|XSHG|XSHE|XBEI))$/u.test(id))values.push(id)
 }
 return [...new Set(values)].slice(0,32)
}
function resultCode(result){
 let value=result?.structuredContent
 if(!value){
  const text=(result?.content??[]).filter(block=>block?.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n')
  if(text.length<=100000){try{value=JSON.parse(text)}catch{}}
 }
 const code=value?.code??value?.error?.code??result?.error?.code
 return typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/u.test(code)?code:undefined
}
export function operatingSourceAttempt(call,result,response,purpose){
 if(!call?.tool?.startsWith('ework__')||purpose==='discovery'||call.args?.http_method!=='GET'||call.args?.nameEn!=='getEquOperData')return
 const entities=identifiers(call.args);if(!entities.length)return
 const code=resultCode(result)
 const invalid=/^(?:INVALID_API_PARAMETERS|SCHEMA_CHANGED|INVALID_ARGUMENTS|INVALID_PARAMS|TOOL_ARGUMENT_ERROR)$/u.test(code??'')
 const unavailable=/^(?:PERMISSION_DENIED|AUTH_REQUIRED|UNAUTHORIZED|FORBIDDEN|TIMEOUT|FETCH_FAILED|HTTP_ERROR|SOURCE_UNAVAILABLE|NETWORK_ERROR)$/u.test(code??'')
 const status=invalid?'invalid_request':!result?.isError&&!result?.error&&response?.retCode===1&&Array.isArray(response.data)?response.data.length?'result':'empty':unavailable?'unavailable':'unverified'
 // Only public identifiers and status: never error bodies, credentials or full arguments.
 return {tool:call.tool,api:'getEquOperData',entities,status,...(code?{code}:{})}
}
const exchange={SH:'XSHG',SZ:'XSHE',BJ:'XBEI'}
const includesEntity=(ids,code)=>ids?.includes(code)||ids?.includes(code.slice(0,6))||ids?.includes(code.slice(0,6)+'.'+exchange[code.slice(7)])
const rowEntity=(row,code)=>row?.ticker===code.slice(0,6)&&row.exchangeCD===exchange[code.slice(7)]&&row.secID===code.slice(0,6)+'.'+exchange[code.slice(7)]
function missingReason(data,code,status){
 const domain=/经营|装机|发电量|上网电量|售电量|电量情况/u,segments=[]
 for(const row of Array.isArray(data?.rows)?data.rows:[]){
  if(!Array.isArray(row)||!row.some(cell=>typeof cell==='string'&&cell.includes(code)))continue
  for(let i=0;i<row.length;i++)if(domain.test(data.columns?.[i]??'')&&typeof row[i]==='string')segments.push(row[i])
 }
 for(const item of Array.isArray(data?.items)?data.items:[]){
  if(!item||typeof item!=='object')continue
  const text=Object.values(item).filter(value=>typeof value==='string').join(' ')
  if(text.includes(code)&&domain.test(text))segments.push(text)
 }
 for(const text of typeof data?.note==='string'?data.note.split(/[。；;\n]/u):[])if(text.includes(code)&&domain.test(text))segments.push(text)
 return segments.some(text=>status==='empty'?/来源未返回|空结果|无(?:可用)?(?:记录|数据)/u.test(text):/权限不足|无权限|来源不可用|查询失败|接口失败|数据源失败|查询超时/u.test(text))
}
export function statementOperatingCoverageIssue(data,request,records=[],attempts=[]){
 if(!statementOperatingRequested(request)||!data||data.type==='error')return
 const codes=[...new Set(request.match(/(?<![A-Z0-9])\d{6}\.(?:SH|SZ|BJ)(?![A-Z0-9])/gu)??[])]
 // Request plus actual income rows establish identity; do not infer from labels.
 const income=records.filter(record=>record?.tool?.startsWith('ework__')&&record.purpose!=='discovery'&&record.args?.http_method==='GET'&&record.args?.nameEn==='getFdmtISLT2018'&&record.response?.retCode===1&&Array.isArray(record.response.data))
 const entities=codes.filter(code=>income.some(record=>record.response.data.some(row=>rowEntity(row,code))))
 if(!entities.length)return
 const missing=entities.filter(code=>{
  if(records.some(record=>record?.tool?.startsWith('ework__')&&record.purpose!=='discovery'&&record.args?.http_method==='GET'&&record.args?.nameEn==='getEquOperData'&&record.response?.retCode===1&&Array.isArray(record.response.data)&&(record.response.data.some(row=>rowEntity(row,code))||!record.response.data.length&&includesEntity(identifiers(record.args),code)&&missingReason(data,code,'empty'))))return false
  if(attempts.some(attempt=>attempt.api==='getEquOperData'&&attempt.tool?.startsWith('ework__')&&['empty','unavailable'].includes(attempt.status)&&includesEntity(attempt.entities,code)&&missingReason(data,code,attempt.status)))return false
  const names=income.flatMap(record=>record.response.data.filter(row=>rowEntity(row,code)).map(row=>row.secShortName)).filter(name=>typeof name==='string'&&name.trim().length>=2)
  // A fetched primary report is an alternative. Recommendations are not fetched reports.
  return !records.some(record=>record.tool==='web_fetch'&&record.snapshotRows?.some(row=>row.primary===true&&typeof row.sourceTitle==='string'&&(row.sourceTitle.includes(code)||names.some(name=>row.sourceTitle.includes(name)))&&/(?:装机|发电量|上网电量|售电量|电量(?:情况|公告)|经营数据|经营情况|年度报告|半年度报告|季度报告|年报|半年报|季报)/u.test(row.sourceTitle)))
 })
 if(missing.length)return `经营数据尚未实际查询：${missing.join('、')}。利润表不覆盖装机或发电量，不能把未查询写成来源缺失。只补查这些公司的经营数据，不重新查询已取得的利润表、不重做其他组件；按当前接口定义和实际报告期取数，或读取明确对应公司的原始经营公告/定期报告。参数或目录错误不算有效取数；确因权限、超时或来源无记录未能取得时，逐公司在内容中说明实际原因，保留全部已核实财务数据、单位和报告期。`
}
