import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {IntegrationService} from '../src/main/integrations/service'
// @ts-expect-error Cloudflare Worker is JavaScript and tested in the same runtime.
import {handleRequest} from '../services/fund-data/http.js'
import {bundledDatayesConnection,DATAYES_TOOLS} from '../src/main/integrations/bundled-datayes'
import {McpSupervisor} from '../src/main/integrations/adapters/mcp'
import {CredentialVault} from '../src/main/integrations/vault'

const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const encryption={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from(value),decryptString:(value:Buffer)=>value.toString()}
function request(method='tools/list',params:any={},headers:Record<string,string>={}){
 return new Request('https://updates.evanarts.com/v1/datayes/mcp',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1',authorization:'Bearer '+'a'.repeat(64),...headers},body:JSON.stringify({jsonrpc:'2.0',id:7,method,params})})
}
function envFixture(){
 const calls:any[]=[]
 return {calls,env:{DATAYES_MCP_API_KEY:'server-only-datayes-key',DATAYES_REQUEST_LIMITER:{limit:vi.fn(async()=>({success:true}))},ACCOUNTS_DB:{prepare:()=>({bind:()=>({first:async()=>({id:'user-one'}),run:async()=>({success:true})})})},fetch:vi.fn(async(url:string,options:any)=>{
  const body=JSON.parse(options.body);calls.push({url,headers:options.headers,body})
  const result=body.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'datayes',version:'0.2.0'}}:body.method==='tools/list'?{tools:[{name:'get_catalog',description:'导航',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:'真实导航结果'}]}
  return body.method==='notifications/initialized'?new Response(null,{status:202}):Response.json({jsonrpc:'2.0',id:body.id,result},{headers:{'mcp-session-id':'private-upstream-session'}})
 })}}
}
it('云端鉴权后只代理固定通联服务，以Secret替换用户认证且不公开上游Session',async()=>{
 const f=envFixture(),response=await handleRequest(request('tools/call',{name:'call_api',arguments:{nameEn:'getMktEqudEval',http_method:'GET',url:'https://gw.datayes.com/aladdin_proxy/data_api/api/market/getMktEqudEval.json',url_params:{ticker:'600519'}}}),f.env)
 expect(response.status).toBe(200);expect(response.headers.has('mcp-session-id')).toBe(false)
 expect(await response.json()).toMatchObject({id:7,result:{content:[{type:'text',text:'真实导航结果'}]}})
 expect(f.calls.every(c=>c.url==='https://dataapi-mcp-server.datayes.com/stock-mkt/mcp')).toBe(true)
 expect(f.env.fetch.mock.calls.every(([,options])=>options.redirect==='manual')).toBe(true)
 expect(f.calls.every(c=>new Headers(c.headers).get('authorization')==='Bearer server-only-datayes-key')).toBe(true)
 expect(f.calls.some(c=>new Headers(c.headers).has('cf-connecting-ip'))).toBe(false)
})
it('上游重定向立即失败，密钥不跟随到新地址，错误只包含受控诊断',async()=>{
 const f=envFixture()
 f.env.fetch=vi.fn(async()=>new Response(null,{status:302,headers:{location:'https://untrusted.invalid/collect'}}))
 const response=await handleRequest(request('tools/call',{name:'get_api_info',arguments:{nameEn:'getMktEqudEval'}}),f.env)
 expect(response.status).toBe(503)
 expect(response.headers.get('x-ework-datayes-stage')).toBe('initialize')
 expect(response.headers.get('x-ework-datayes-status')).toBe('302')
 expect(response.headers.get('x-ework-datayes-error')).toBe('http')
 expect(await response.text()).toBe(JSON.stringify({error:{code:'DATAYES_SERVICE_UNAVAILABLE'}}))
 expect(f.env.fetch).toHaveBeenCalledTimes(1)
})
it('云端拒绝未登录用户、未知工具与超额请求，不向通联发请求',async()=>{
 const f=envFixture()
 expect((await handleRequest(request('tools/list',{}, {authorization:''}),f.env)).status).toBe(401)
 expect((await handleRequest(request('tools/call',{name:'arbitrary_action',arguments:{}}),f.env)).status).toBe(400)
 f.env.DATAYES_REQUEST_LIMITER.limit.mockResolvedValueOnce({success:false})
 expect((await handleRequest(request(),f.env)).status).toBe(429)
 expect(f.calls).toHaveLength(0)
})
it('MCP SDK经账号传输完成发现与工具调用，上游使用独立会话',async()=>{
 const f=envFixture(),root=await mkdtemp(join(tmpdir(),'datayes-sdk-'))
 const transport=new McpSupervisor(new CredentialVault(root,encryption),(body,signal)=>handleRequest(new Request(request().url,{method:'POST',headers:request().headers,body,signal}),f.env))
 cleanup.push(async()=>{await transport.disposeAll();await rm(root,{recursive:true,force:true})})
 const connection=bundledDatayesConnection('account-one',true)
 expect((await transport.connect(connection,AbortSignal.timeout(5000))).tools.map(t=>t.name)).toEqual(['search_api','get_catalog','get_api_info','call_api'])
 const result=await transport.invoke(connection.id,'get_catalog',{},AbortSignal.timeout(5000))
 expect(JSON.stringify(result)).toContain('官网 MCP 积分服务接口目录')
 expect(f.calls).toHaveLength(0)
})
it('内置服务不可用时立即结束发现，不以重复请求掩盖服务错误',async()=>{
 const root=await mkdtemp(join(tmpdir(),'datayes-failure-'))
 const remote=vi.fn(async()=>new Response(null,{status:503}))
 const transport=new McpSupervisor(new CredentialVault(root,encryption),remote)
 cleanup.push(async()=>{await transport.disposeAll();await rm(root,{recursive:true,force:true})})
 await expect(transport.connect(bundledDatayesConnection('account-one',true),AbortSignal.timeout(1000))).rejects.toMatchObject({code:'RUNTIME_UNAVAILABLE'})
 expect(remote).toHaveBeenCalledTimes(1)
})
it('支持SSE工具结果并隐藏上游回显的Key；服务错误不回传敏感响应',async()=>{
 const f=envFixture(),original=f.env.fetch
 f.env.fetch=vi.fn(async(url,options)=>{
  if(JSON.parse(options.body).method!=='tools/call')return original(url,options)
  const event='data: '+JSON.stringify({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:'result server-only-datayes-key'}]}})+'\n\n'
  return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(event))}}),{headers:{'content-type':'text/event-stream','mcp-session-id':'private'}})
 })
 const response=await handleRequest(request('tools/call',{name:'call_api',arguments:{nameEn:'getMktEqudEval',http_method:'GET',url:'https://gw.datayes.com/aladdin_proxy/data_api/api/market/getMktEqudEval.json'}}),f.env)
 expect(response.status).toBe(200)
 expect(await response.text()).toContain('result [redacted]')
 f.env.fetch=vi.fn(async()=>new Response('server-only-datayes-key',{status:401}))
 const failed=await handleRequest(request('tools/call',{name:'get_api_info',arguments:{nameEn:'getMktEqudEval'}}),f.env)
 expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('server-only-datayes-key')
})
it('拒绝批量、分页与超大参数请求，防止绕过固定工具边界',async()=>{
 const f=envFixture()
 expect((await handleRequest(request('tools/list',{cursor:'foreign'}),f.env)).status).toBe(400)
 expect((await handleRequest(request('tools/call',{name:'get_catalog',arguments:{value:'x'.repeat(256*1024)}}),f.env)).status).toBe(400)
 expect(f.calls).toHaveLength(0)
})

it('内置通联额度错误仅解释当前接口，不误判整个账号，其他接口和到期重试仍可用',async()=>{
 const businessCalls:Array<{name:string;nameEn?:string}>=[]
 let exhausted=true
 const transport=new McpSupervisor({read:async()=>{throw Error('UNEXPECTED_VAULT_READ')}},async(body)=>{
  const rpc=JSON.parse(body)
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202})
  const result=rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}}
   :rpc.method==='tools/list'?{tools:['call_api','get_api_info'].map(name=>({name,inputSchema:{type:'object'}}))}
   :(()=>{
    const {name,arguments:args}=rpc.params;businessCalls.push({name,nameEn:args.nameEn})
    return name==='call_api'&&args.nameEn==='market_snapshot'&&exhausted
     ?{isError:true,content:[{type:'text',text:'请求失败 HTTP 402: {"code":402,"message":"订单额度已用完"}'}]}
     :{content:[{type:'text',text:'{"code":1,"data":[{"price":123}]}'}]}
   })()
  return Response.json({jsonrpc:'2.0',id:rpc.id,result})
 })
 const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now)
 const connection=bundledDatayesConnection('account-one',true),signal=AbortSignal.timeout(5000)
 try {
  await transport.connect(connection,signal)
  const first=await transport.invoke(connection.id,'call_api',{nameEn:'market_snapshot',ticker:'600519'},signal)
  expect(first).toMatchObject({isError:true,errorCode:'RUNTIME_UNAVAILABLE'})
  expect(first.content[0]?.text).toContain('当前通联接口返回 HTTP 402')
  expect(first.content[0]?.text).toContain('不代表其他数据包或整个账号')
  expect(first.content[0]?.text).not.toContain('ai.datayes.com/pricing')
  const repeated=await transport.invoke(connection.id,'call_api',{nameEn:'market_snapshot',ticker:'000858'},signal)
  expect(repeated).toMatchObject({isError:true,errorCode:'RUNTIME_UNAVAILABLE'})
  expect(businessCalls).toEqual([{name:'call_api',nameEn:'market_snapshot'}])
  expect((await transport.invoke(connection.id,'get_api_info',{nameEn:'market_snapshot'},signal)).isError).not.toBe(true)
  expect((await transport.invoke(connection.id,'call_api',{nameEn:'another-api'},signal)).isError).not.toBe(true)
  exhausted=false;clock.mockReturnValue(now+61000)
  expect((await transport.invoke(connection.id,'call_api',{nameEn:'market_snapshot'},signal)).isError).not.toBe(true)
  expect(businessCalls.filter(c=>c.name==='call_api'&&c.nameEn==='market_snapshot')).toHaveLength(2)
 } finally {clock.mockRestore();await transport.disposeAll()}
})
