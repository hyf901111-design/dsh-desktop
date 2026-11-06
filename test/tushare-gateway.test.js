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
it('目录明确代理分页上限，错误说明如何修正，空业务日期说明披露延迟',async()=>{
 const env=fixture(),c=await(await handleRequest(request('tushare_catalog',{api_name:'etf_share_size'}),env)).json()
 expect(c.result.structuredContent.queryLimits).toEqual({defaultLimit:200,maxLimit:1000,maxOffset:100000})
 expect(c.result.structuredContent.interfaces[0].description).not.toContain('5000条')
 const invalid=await(await handleRequest(request('tushare_query',{...args,limit:5000}),env)).json()
 expect(invalid.result.content[0].text).toContain('limit 必须为 1–1000')
 env.fetch.mockResolvedValue(Response.json({code:0,data:{fields:['trade_date'],items:[]}}))
 const empty=await(await handleRequest(request('tushare_query',{api_name:'etf_share_size',params:{trade_date:'20261106'},fields:'trade_date'}),env)).json()
 expect(empty.result.structuredContent.note).toContain('上一交易日')
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

it('ETF 汇总复用同一日期窗口、仍逐次鉴权，并保留真实来源和估算口径',async()=>{
 const env=fixture()
 const invalid=(await(await handleRequest(request('tushare_etf_snapshot',{limit:1000}),env)).json()).result
 expect(invalid.isError).toBe(true);expect(invalid.content[0].text).toContain('1–100（默认20）');expect(invalid.content[0].text).not.toContain('1–1000');expect(env.fetch).not.toHaveBeenCalled()
 env.fetch.mockImplementation(async(_url,options)=>{
  const q=JSON.parse(options.body),fields=q.fields.split(',');let rows=[]
  if(q.api_name==='trade_cal')rows=[{cal_date:'20261105',is_open:1},{cal_date:'20261029',is_open:1}]
  if(q.api_name==='etf_basic')rows=[{ts_code:'510300.SH',csname:'沪深300ETF',index_code:'000300.SH'}]
  if(q.api_name==='etf_share_size')rows=[{ts_code:'510300.SH',trade_date:q.params.trade_date,etf_name:'沪深300ETF',total_share:q.params.trade_date==='20261105'?11000:10000,total_size:22000,nav:2,close:2,exchange:'SSE'}]
  return Response.json({code:0,data:{fields,items:rows.map(r=>fields.map(f=>r[f]??null))}})
 })
 const a={end_date:'20261105',lookback_days:7}
 const [one,two]=await Promise.all(['overview','inflows'].map(async view=>(await(await handleRequest(request('tushare_etf_snapshot',{...a,view}),env)).json()).result.structuredContent))
 expect(env.fetch).toHaveBeenCalledTimes(4)
 expect(one.summary.flowEstimateYi).toBe(0.2);expect(two.records[0].flowEstimateYi).toBe(0.2)
 const reused=(await(await handleRequest(request('tushare_etf_snapshot',a),{...env})).json()).result.structuredContent
 expect(reused.cacheHit).toBe(true);expect(env.fetch).toHaveBeenCalledTimes(4)
 expect(two.formula).toContain('不是逐日净申购')
 expect(JSON.stringify([one,two])).not.toContain(env.TUSHARE_TOKEN)
 expect((await handleRequest(request('tushare_etf_snapshot',a,false),env)).status).toBe(401)
 expect(env.fetch).toHaveBeenCalledTimes(4)
 const rotated=(await(await handleRequest(request('tushare_etf_snapshot',a),{...env,TUSHARE_TOKEN:'rotated-test-only'})).json()).result.structuredContent
 expect(rotated.cacheHit).toBe(false);expect(env.fetch).toHaveBeenCalledTimes(8)
})
