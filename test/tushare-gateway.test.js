import {it,expect,vi} from 'vitest'
import {handleRequest} from '../services/fund-data/http.js'
import {validateTushareQuery} from '../services/fund-data/tushare-mcp.js'

const args={api_name:'daily_basic',params:{ts_code:'600519.SH',trade_date:'20261106'},fields:'ts_code,trade_date,pe_ttm,total_mv',limit:10}
function fixture() {
  const run=vi.fn(async()=>({success:true}))
  return {TUSHARE_TOKEN:'test-server-only-secret',TUSHARE_REQUEST_LIMITER:{limit:vi.fn(async()=>({success:true}))},
    ACCOUNTS_DB:{prepare:()=>({bind:()=>({first:async()=>({id:'user-one'}),run})})},
    fetch:vi.fn(async()=>Response.json({code:0,data:{fields:['ts_code','trade_date','pe_ttm','total_mv'],items:[['600519.SH','20261106',22.1,181636856.48]]}}))}
}
function request(name='tushare_query',arguments_=args,authenticated=true) {
  return new Request('https://updates.evanarts.com/v1/tushare/mcp',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(authenticated?{authorization:'Bearer '+'a'.repeat(64)}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:arguments_}})})
}
it('拒绝匿名调用，既不请求上游也不泄露服务是否配置',async()=>{
  const env=fixture();delete env.TUSHARE_TOKEN
  const r=await handleRequest(request('tushare_catalog',{},false),env)
  expect(r.status).toBe(401);expect(env.fetch).not.toHaveBeenCalled()
})
it('只有云端注入凭据，固定 HTTPS 且不跟随重定向，返回带口径业务记录',async()=>{
  const env=fixture(),r=await handleRequest(request(),env),d=await r.json()
  const [url,options]=env.fetch.mock.calls[0]
  expect(url).toBe('https://api.tushare.pro');expect(options.redirect).toBe('manual')
  expect(JSON.parse(options.body)).toMatchObject({token:env.TUSHARE_TOKEN,api_name:'daily_basic',params:{limit:10,offset:0}})
  expect(options.headers.authorization).toBeUndefined()
  expect(d.result.structuredContent.records[0]).toMatchObject({pe_ttm:22.1,total_mv:181636856.48})
  expect(d.result.structuredContent.fieldInfo.total_mv).toContain('万元')
  expect(JSON.stringify(d)).not.toContain(env.TUSHARE_TOKEN)
})
it('限制接口、参数、字段、日期和分页，不允许凭据或任意 URL 进入代理',()=>{
  for(const invalid of [{...args,token:'x'},{...args,api_name:'arbitrary'}, {...args,params:{url:'https://evil'}},{...args,fields:'token'}, {...args,limit:1001},{...args,offset:-1},{...args,params:{trade_date:'tomorrow'}},{...args,params:{trade_date:'20260231'}},{api_name:'index_weight',params:{},fields:'weight'}])expect(()=>validateTushareQuery(invalid)).toThrow()
})
it('错误不冒充空数据，不回显上游凭据；频率限制不触发重试',async()=>{
  const env=fixture();env.fetch.mockResolvedValue(Response.json({code:2002,msg:'permission '+env.TUSHARE_TOKEN}))
  const d=await(await handleRequest(request(),env)).json()
  expect(d.result.isError).toBe(true);expect(d.result.structuredContent).toBeUndefined();expect(JSON.stringify(d)).not.toContain(env.TUSHARE_TOKEN);expect(env.fetch).toHaveBeenCalledOnce()
  env.TUSHARE_REQUEST_LIMITER.limit.mockResolvedValue({success:false})
  expect((await handleRequest(request(),env)).status).toBe(429);expect(env.fetch).toHaveBeenCalledOnce()
})
it('目录不是业务证据，分页达到上限明确提示可能未取齐',async()=>{
  const env=fixture();const catalog=await(await handleRequest(request('tushare_catalog',{api_name:'etf_share_size'}),env)).json()
  expect(catalog.result.structuredContent.kind).toBe('catalog');expect(catalog.result.structuredContent.interfaces[0].fields.total_share).toContain('万份');expect(env.fetch).not.toHaveBeenCalled()
  const d=await(await handleRequest(request('tushare_query',{...args,limit:1}),env)).json()
  expect(d.result.structuredContent.pagination).toMatchObject({returned:1,possiblyMore:true,nextOffset:1})
})
it('不接受错列或嵌套的异常上游结果',async()=>{
  const env=fixture();env.fetch.mockResolvedValue(Response.json({code:0,data:{fields:['unrequested'],items:[[{token:'bad'}]]}}))
  const d=await(await handleRequest(request(),env)).json();expect(d.result.isError).toBe(true)
})

it('上游重定向不会被跟随，登录失败不触达上游',async()=>{
  const env=fixture();env.fetch.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://other.example'}}))
  const d=await(await handleRequest(request(),env)).json();expect(d.result.isError).toBe(true);expect(env.fetch).toHaveBeenCalledOnce()
  env.fetch.mockClear();env.ACCOUNTS_DB.prepare=()=>({bind:()=>({first:async()=>null})})
  expect((await handleRequest(request(),env)).status).toBe(401);expect(env.fetch).not.toHaveBeenCalled()
})
