import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {IntegrationService} from '../src/main/integrations/service'
// @ts-expect-error Cloudflare Worker is JavaScript and tested in the same runtime.
import {handleRequest} from '../services/fund-data/http.js'
import {bundledDatayesConnection} from '../src/main/integrations/bundled-datayes'
import {McpSupervisor} from '../src/main/integrations/adapters/mcp'
import {CredentialVault} from '../src/main/integrations/vault'

const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const encryption={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from(value),decryptString:(value:Buffer)=>value.toString()}
async function serviceFixture(){
 const root=await mkdtemp(join(tmpdir(),'ework-datayes-'));let owner='account-one'
 const service=await IntegrationService.open({root,encryption,getOwnerId:()=>owner,bundledDatayes:{request:vi.fn(),authenticated:()=>true}} as any)
 cleanup.push(async()=>{await service.dispose();await rm(root,{recursive:true,force:true})})
 const row=async()=>{const reply=await service.request({type:'snapshot'});return (reply as any).snapshot.rows.find((r:any)=>r.id.startsWith('builtin:datayes-mcp:'))}
 return {service,row,setOwner:(value:string)=>{owner=value;service.rotateIdentity()}}
}
it('新用户自动获得默认开启的10个通联工具，内置连接不能停用、删除或改写',async()=>{
 const f=await serviceFixture(),row=await f.row()
 expect(row).toMatchObject({kind:'connection',tab:'mcp',enabled:true,toggleable:false,removable:false,configurable:false,toolCount:10,source:'EWork 内置'})
 const snapshot=f.service.runtimeSnapshot(),c=snapshot.connections.find(item=>item.id===row.id)
 expect(c?.toolGrants).toHaveLength(10)
 expect(snapshot.tools.filter(tool=>tool.connectionId===row.id).map(tool=>tool.rawName)).toContain('call_api')
 const meta={requestId:'locked-attempt',expectedRevision:row.revision}
 for(const command of [{type:'set-enabled',kind:'connection',id:row.id,enabled:false,meta},{type:'uninstall',kind:'connection',id:row.id,meta},{type:'disconnect',id:row.id,meta},{type:'save-connection',draft:{id:row.id},meta}])
  await expect(f.service.request(command)).rejects.toMatchObject({code:'ACCESS_DENIED'})
 expect((await f.row()).enabled).toBe(true)
})
it('账号切换得到独立的内置连接和工作区权限，客户端不保存公共API Key',async()=>{
 const f=await serviceFixture(),first=await f.row()
 f.setOwner('account-two');const second=await f.row()
 expect(second.id).not.toBe(first.id)
 expect(f.service.runtimeSnapshot().connections.every(c=>c.ownerAccountId==='account-two')).toBe(true)
 const stored=f.service.store.snapshot().connections[second.id]!
 expect(stored.config.auth).toEqual({type:'none'})
 expect(stored.workspaceGrant).toEqual({mode:'all-owned',ownerAccountId:'account-two'})
})
it('保留个人连接与失效状态，重复快照不重置已发现工具或连接版本',async()=>{
 const f=await serviceFixture(),row=await f.row()
 const personal={...bundledDatayesConnection('account-one',true),id:'personal-datayes',name:'原有个人通联',toolGrants:['original-tool']}
 await f.service.store.change(state=>{
  state.connections[personal.id]=personal
  const bundled=state.connections[row.id]!
  bundled.authState='expired';bundled.health='unreachable';bundled.lastError='需要重新登录'
 })
 await Promise.all(Array.from({length:4},()=>f.row()))
 expect(f.service.store.snapshot().connections[personal.id]).toEqual(personal)
 expect(f.service.store.snapshot().connections[row.id]).toMatchObject({revision:row.revision,authState:'expired',health:'unreachable',lastError:'需要重新登录'})
})
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
 const f=envFixture(),response=await handleRequest(request(),f.env)
 expect(response.status).toBe(200);expect(response.headers.has('mcp-session-id')).toBe(false)
 expect(await response.json()).toMatchObject({id:7,result:{tools:[{name:'get_catalog'}]}})
 expect(f.calls.every(c=>c.url==='https://gw.datayes.com/rwtracker/datayes-mcp')).toBe(true)
 expect(f.calls.every(c=>new Headers(c.headers).get('authorization')==='Bearer server-only-datayes-key')).toBe(true)
 expect(f.calls.some(c=>new Headers(c.headers).has('cf-connecting-ip'))).toBe(false)
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
 expect((await transport.connect(connection,AbortSignal.timeout(5000))).tools.map(t=>t.name)).toEqual(['get_catalog'])
 const result=await transport.invoke(connection.id,'get_catalog',{},AbortSignal.timeout(5000))
 expect(JSON.stringify(result)).toContain('真实导航结果')
 expect(f.calls.filter(c=>c.body.method==='initialize')).toHaveLength(2)
 expect(f.calls.filter(c=>c.body.method==='tools/call')[0].headers['mcp-session-id']).toBe('private-upstream-session')
})
it('支持SSE工具结果并隐藏上游回显的Key；服务错误不回传敏感响应',async()=>{
 const f=envFixture(),original=f.env.fetch
 f.env.fetch=vi.fn(async(url,options)=>{
  if(JSON.parse(options.body).method!=='tools/call')return original(url,options)
  const event='data: '+JSON.stringify({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:'result server-only-datayes-key'}]}})+'\n\n'
  return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(event))}}),{headers:{'content-type':'text/event-stream','mcp-session-id':'private'}})
 })
 const response=await handleRequest(request('tools/call',{name:'get_catalog',arguments:{}}),f.env)
 expect(response.status).toBe(200)
 expect(await response.text()).toContain('result [redacted]')
 f.env.fetch=vi.fn(async()=>new Response('server-only-datayes-key',{status:401}))
 const failed=await handleRequest(request(),f.env)
 expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('server-only-datayes-key')
})
it('拒绝批量、分页与超大参数请求，防止绕过固定工具边界',async()=>{
 const f=envFixture()
 expect((await handleRequest(request('tools/list',{cursor:'foreign'}),f.env)).status).toBe(400)
 expect((await handleRequest(request('tools/call',{name:'get_catalog',arguments:{value:'x'.repeat(256*1024)}}),f.env)).status).toBe(400)
 expect(f.calls).toHaveLength(0)
})
