import {expect,it,vi} from 'vitest'
import {handleRequest} from '../services/fund-data/http.js'
import {parseFinancialApiDefinition} from '../src/main/financial/widget-data'

const legacy='https://gw.datayes.com/rwtracker/datayes-mcp'
const official='https://dataapi-mcp-server.datayes.com/stock-mkt/mcp'
const row={ticker:'600519',secShortName:'贵州茅台',tradeDate:'2026-10-09',PE:19.3881,PB:6.2839}
const definition={name:'getMktEqudEval',service:'stock-mkt',description:'调用样例 url：/api/market/getMktEqudEval.json?field=&ticker=&tradeDate=',parameters:[{name:'ticker',type:'string',required:false},{name:'tradeDate',type:'string',required:false},{name:'pagenum',type:'integer',required:false,default:1},{name:'pagesize',type:'integer',required:false,default:50}],response:{description:'retCode=1 时返回业务数据'}}
function req(name,args={}){return new Request('https://updates.evanarts.com/v1/datayes/mcp',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name,arguments:args}})})}
function fixture(){
 const calls=[]
 const env={DATAYES_MCP_API_KEY:'only-server-secret',DATAYES_REQUEST_LIMITER:{limit:async()=>({success:true})},ACCOUNTS_DB:{prepare:()=>({bind:()=>({first:async()=>({id:'user'}),run:async()=>({success:true})})})},fetch:vi.fn(async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,body,headers:new Headers(init.headers)})
  if(body.method==='notifications/initialized')return new Response(null,{status:202})
  const result=body.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}
   :url===legacy?{isError:true,content:[{type:'text',text:'HTTP 402 订单额度已用完'}]}
   :body.params.name==='stock_mkt_get_info'?{content:[{type:'text',text:JSON.stringify(definition)}],structuredContent:definition}
   :{content:[{type:'text',text:JSON.stringify({retCode:1,data:[row]})}],structuredContent:{retCode:1,data:[row]}}
  return Response.json({jsonrpc:'2.0',id:body.id,result},{headers:{'mcp-session-id':'private-session'}})
 })}
 return {env,calls}
}
const args={nameEn:'getMktEqudEval',http_method:'GET',url:'https://gw.datayes.com/aladdin_proxy/data_api/api/market/getMktEqudEval.json',url_params:{ticker:'600519',tradeDate:'20261009',pagenum:'1',pagesize:'1'}}
it('同一个Key旧综合入口402时，官网DataAPI仍可取数且保留客户端工具名称',async()=>{
 const f=fixture(),response=await handleRequest(req('call_api',args),f.env),reply=await response.json()
 expect(response.status).toBe(200);expect(reply).toMatchObject({id:9,result:{structuredContent:{retCode:1,data:[row]}}})
 expect(f.calls.every(c=>c.url===official)).toBe(true)
 const data=f.calls.find(c=>c.body.params?.name==='stock_mkt_get_data')
 expect(data.body.params.arguments).toEqual({api_name:'getMktEqudEval',api_parameters:args.url_params})
 expect(f.calls.every(c=>c.headers.get('authorization')==='Bearer only-server-secret')).toBe(true)
 expect(f.calls.every(c=>!c.headers.has('cf-connecting-ip'))).toBe(true)
 expect(response.headers.has('mcp-session-id')).toBe(false)
 expect(JSON.stringify(reply)).not.toContain('only-server-secret')
})
it('接口定义使用官网实时参数，保留固定金融组件可解析的定义格式',async()=>{
 const f=fixture(),reply=await (await handleRequest(req('get_api_info',{nameEn:'getMktEqudEval'}),f.env)).json()
 expect(f.calls.every(c=>c.url===official)).toBe(true)
 expect(reply.result.structuredContent).toMatchObject({nameEn:'getMktEqudEval',httpMethod:'GET',httpUrl:args.url,parametersInput:[{name:'ticker',location:'Query'},{name:'tradeDate',location:'Query'},{name:'pagenum',location:'Query'},{name:'pagesize',location:'Query'}]})
 expect(reply.result.content[0].text).toContain('调用: GET '+args.url)
 expect(reply.result.content[0].text).not.toContain('响应样例')
 expect(parseFinancialApiDefinition(reply.result.content[0].text)).toMatchObject({httpMethod:'GET',httpUrl:args.url,parametersInput:[{name:'ticker',required:false,location:'Query'},{name:'tradeDate',required:false,location:'Query'},{name:'pagenum',required:false,location:'Query'},{name:'pagesize',required:false,location:'Query'}]})
})
it('业务失败不会误切回旧套餐取数，也不改变供应商错误和缺失状态',async()=>{
 const f=fixture(),fetch=f.env.fetch
 f.env.fetch=vi.fn(async(url,init)=>JSON.parse(init.body).params?.name==='stock_mkt_get_data'?Response.json({jsonrpc:'2.0',id:2,result:{isError:true,content:[{type:'text',text:'HTTP 402 此数据包积分不足'}]}}):fetch(url,init))
 const reply=await (await handleRequest(req('call_api',args),f.env)).json()
 expect(reply.result.isError).toBe(true);expect(reply.result.content[0].text).toContain('此数据包积分不足')
 expect(f.calls.every(c=>c.url===official)).toBe(true)
})
it.each([
 {...args,url:'https://untrusted.invalid/getMktEqudEval.json'},
 {...args,url:args.url.replace('getMktEqudEval','getEqu')},
 {...args,http_method:'POST',body:{ticker:'600519'}},
 {...args,url_params:[]}
])('不将不匹配的调用静默改成另一接口或传出密钥',async bad=>{
 const f=fixture(),reply=await (await handleRequest(req('call_api',bad),f.env)).json()
 expect(reply.result?.isError).toBe(true);expect(f.calls).toHaveLength(0)
})
it('股票估值搜索优先返回官网积分接口，发现结果与业务数据明确分开',async()=>{
 const f=fixture(),reply=await (await handleRequest(req('search_api',{query:'股票估值市盈率市净率'}),f.env)).json()
 expect(reply.result.isError).not.toBe(true)
 expect(reply.result.content[0].text).toContain('getMktEqudEval')
 expect(reply.result.content[0].text).toContain('接口发现')
 expect(f.calls).toHaveLength(0)
})
