import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {IntegrationService} from '../src/main/integrations/service'
// @ts-expect-error Cloudflare Worker is JavaScript and tested in the same runtime.
import {handleRequest} from '../services/fund-data/http.js'
import {bundledTushareConnection,bundledTushareToolEffect,TUSHARE_TOOLS} from '../src/main/integrations/bundled-tushare'
import {McpSupervisor} from '../src/main/integrations/adapters/mcp'
import {CredentialVault} from '../src/main/integrations/vault'

const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const encryption={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from(value),decryptString:(value:Buffer)=>value.toString()}
async function serviceFixture(options={}){
 const root=await mkdtemp(join(tmpdir(),'ework-tushare-'));let owner='account-one'
 const service=await IntegrationService.open({root,encryption,getOwnerId:()=>owner,bundledTushare:{request:vi.fn(),authenticated:()=>true},...options} as any)
 cleanup.push(async()=>{await service.dispose();await rm(root,{recursive:true,force:true})})
 const row=async()=>{const reply=await service.request({type:'snapshot'});return (reply as any).snapshot.rows.find((r:any)=>r.id.startsWith('builtin:tushare-mcp:'))}
 return {service,row,setOwner:(value:string)=>{owner=value;service.rotateIdentity()}}
}
it('新用户自动获得默认开启的3个Tushare工具，内置连接可以停用，不能删除或改写',async()=>{
 const f=await serviceFixture(),row=await f.row()
 expect(row).toMatchObject({kind:'connection',tab:'mcp',enabled:true,toggleable:true,removable:false,configurable:false,toolCount:3,source:'EWork 内置'})
 const snapshot=f.service.runtimeSnapshot(),c=snapshot.connections.find(item=>item.id===row.id)
 expect(c?.toolGrants).toHaveLength(3)
 expect(snapshot.tools.filter(tool=>tool.connectionId===row.id).map(tool=>tool.rawName)).toContain('tushare_query')
 const meta={requestId:'locked-attempt',expectedRevision:row.revision}
 for(const command of [{type:'uninstall',kind:'connection',id:row.id,meta},{type:'disconnect',id:row.id,meta},{type:'save-connection',draft:{id:row.id},meta},{type:'save-connection',id:'misleading-extra-id',draft:{id:row.id},meta}])
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
 const personal={...bundledTushareConnection('account-one',true),id:'personal-tushare',name:'原有个人Tushare',toolGrants:['original-tool']}
 await f.service.store.change(state=>{
  state.connections[personal.id]=personal
  const bundled=state.connections[row.id]!
  bundled.authState='expired';bundled.health='unreachable';bundled.lastError='需要重新登录'
 })
 await Promise.all(Array.from({length:4},()=>f.row()))
 expect(f.service.store.snapshot().connections[personal.id]).toEqual(personal)
 expect(f.service.store.snapshot().connections[row.id]).toMatchObject({revision:row.revision,authState:'expired',health:'unreachable',lastError:'需要重新登录'})
})
it('保留已验证的实时目录，快照和同账号重新登录不再恢复已移除的旧工具或制造首次调用失败',async()=>{
 const approveWrite=vi.fn(async()=>false),f=await serviceFixture({approveWrite}),first=await f.row()
 const discovered=TUSHARE_TOOLS.filter(tool=>tool.name!=='tushare_query').map(({effect,...tool})=>tool)
 vi.spyOn(f.service.mcp,'connect').mockResolvedValue({tools:discovered,negotiatedVersion:'2025-03-26'} as any)
 const invoke=vi.spyOn(f.service.mcp,'invoke').mockResolvedValue({content:[{type:'text',text:'真实业务资料'}]} as any)
 await f.service.probe(first.id)
 const snapshot=()=>Object.values(f.service.store.snapshot().tools).filter(tool=>tool.connectionId===first.id).sort((a,b)=>a.id.localeCompare(b.id))
 const learned=structuredClone(snapshot());expect(learned).toHaveLength(2)
 expect(learned.every(tool=>tool.effect==='read')).toBe(true)
 await f.row();expect(snapshot()).toEqual(learned)
 f.service.rotateIdentity();await f.row();expect(snapshot()).toEqual(learned)
 const connection=f.service.store.snapshot().connections[first.id]!,tool=snapshot().find(tool=>tool.rawName==='tushare_catalog')!
 const result=await f.service.execute({callId:'after-login',toolId:tool.id,connectionRevision:connection.revision,arguments:{query:'真实财务资料'},context:{sessionId:'session',rootSessionId:'session',workspaceId:'workspace',ownerAccountId:'account-one',runtimeEpoch:f.service.runtimeEpoch,unattended:false}},new AbortController().signal)
 expect(result.content[0]).toEqual({type:'text',text:'真实业务资料'})
 expect(invoke).toHaveBeenCalledOnce()
 expect(approveWrite).not.toHaveBeenCalled()
})
it('修复旧缓存的未知效果，保留实时定义和停用状态并使旧授权版本失效',async()=>{
 const f=await serviceFixture(),first=await f.row()
 const discovered=TUSHARE_TOOLS.filter(tool=>tool.name!=='tushare_etf_snapshot').map(({effect,...tool})=>structuredClone(tool))
 ;(discovered[0]!.inputSchema as any).properties.remoteVersion={type:'string'}
 vi.spyOn(f.service.mcp,'connect').mockResolvedValue({tools:discovered} as any)
 await f.service.probe(first.id)
 await f.service.store.change(state=>{
  const c=state.connections[first.id]!;c.enabled=false
  c.unattendedToolGrants=[...c.toolGrants]
  for(const tool of Object.values(state.tools))if(tool.connectionId===c.id){tool.effect='unknown';tool.schemaDigest='legacy-effect-digest'}
 })
 const before=f.service.store.snapshot(),prior=before.connections[first.id]!
 await f.row()
 const after=f.service.store.snapshot(),current=after.connections[first.id]!
 expect(current.enabled).toBe(false)
 expect(current.toolGrants).toEqual(prior.toolGrants)
 expect(current.revision).toBe(prior.revision+1)
 expect(current.unattendedToolGrants).toEqual([])
 const tools=Object.values(after.tools).filter(tool=>tool.connectionId===current.id)
 expect(tools).toHaveLength(2)
 for(const tool of tools){expect(tool.effect).toBe('read');expect(tool.inputSchema).toEqual(before.tools[tool.id]!.inputSchema);expect(tool.schemaDigest).not.toBe('legacy-effect-digest')}
 await f.row();expect(f.service.store.snapshot().connections[first.id]!.revision).toBe(current.revision)
})
it('只信任内置网关的已知只读操作，不信任新操作或同名个人工具',()=>{
 const c=bundledTushareConnection('account-one',true)
 expect(bundledTushareToolEffect(c,'tushare_query')).toBe('read')
 expect(bundledTushareToolEffect(c,'tushare_write')).toBe('unknown')
 expect(bundledTushareToolEffect({...c,id:'personal'},'tushare_query')).toBe('unknown')
 expect(bundledTushareToolEffect({...c,config:{...c.config,url:'https://example.com'} as any},'tushare_query')).toBe('unknown')
 expect(bundledTushareToolEffect({...c,ownerAccountId:'account-two'},'tushare_query')).toBe('unknown')
})
it('真实工具定义变化仍在执行前拒绝旧调用，目录不会被预置定义覆盖',async()=>{
 const f=await serviceFixture({approveWrite:async()=>true}),first=await f.row()
 const discovered=TUSHARE_TOOLS.filter(tool=>tool.name!=='tushare_query').map(({effect,...tool})=>structuredClone(tool))
 const connect=vi.spyOn(f.service.mcp,'connect').mockResolvedValue({tools:discovered,negotiatedVersion:'2025-03-26'} as any)
 const invoke=vi.spyOn(f.service.mcp,'invoke')
 await f.service.probe(first.id);await f.row()
 const connection=f.service.store.snapshot().connections[first.id]!,tool=Object.values(f.service.store.snapshot().tools).find(tool=>tool.connectionId===first.id&&tool.rawName==='tushare_catalog')!
 const changed=structuredClone(discovered),search=changed.find(tool=>tool.name==='tushare_catalog')!
 ;(search.inputSchema as any).properties.mustProvide={type:'string'}
 ;(search.inputSchema as any).required=['mustProvide']
 connect.mockResolvedValue({tools:changed,negotiatedVersion:'2025-03-26'} as any)
 await expect(f.service.execute({callId:'changed-schema',toolId:tool.id,connectionRevision:connection.revision,arguments:{query:'真实财务资料'},context:{sessionId:'session',rootSessionId:'session',workspaceId:'workspace',ownerAccountId:'account-one',runtimeEpoch:f.service.runtimeEpoch,unattended:false}},new AbortController().signal)).rejects.toMatchObject({code:'SCHEMA_CHANGED'})
 expect(invoke).not.toHaveBeenCalled()
 await f.row()
 const current=Object.values(f.service.store.snapshot().tools).find(item=>item.id===tool.id)!
 expect(current.inputSchema.required).toContain('mustProvide')
})
it('缺少工具定义的内置缓存仍由已知预置安全修复',async()=>{
 const f=await serviceFixture(),first=await f.row(),connection=f.service.store.snapshot().connections[first.id]!
 await f.service.store.change(state=>{delete state.tools[connection.toolGrants[0]!]})
 await f.row()
 expect(Object.values(f.service.store.snapshot().tools).filter(tool=>tool.connectionId===first.id)).toHaveLength(3)
})

it('升级移除旧内置通联及其工具，保留个人连接和已保存历史',async()=>{
 const f=await serviceFixture(),old={...bundledTushareConnection('account-one',true),id:'builtin:datayes-mcp:0123456789abcdef'},personal={...old,id:'personal-datayes'}
 await f.service.store.change(state=>{state.connections[old.id]=old;state.connections[personal.id]=personal;state.tools['legacy']={id:'legacy',connectionId:old.id} as any})
 await f.row();expect(f.service.store.snapshot().connections[old.id]).toBeUndefined();expect(f.service.store.snapshot().tools.legacy).toBeUndefined();expect(f.service.store.snapshot().connections[personal.id]).toEqual(personal)
})
it('真实 MCP SDK 通过登录网关读取 Tushare 定义和业务数据',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tushare-sdk-'))
 const upstream=vi.fn(async(_url:string,init:RequestInit)=>Response.json({code:0,data:{fields:['ts_code','trade_date','close'],items:[['000300.SH','20261106',4054.2769]]}}))
 const env={TUSHARE_TOKEN:'fixture-only',TUSHARE_REQUEST_LIMITER:{limit:async()=>({success:true})},ACCOUNTS_DB:{prepare:()=>({bind:()=>({first:async()=>({id:'one'}),run:async()=>({success:true})})})},fetch:upstream}
 const request=async(body:string,signal:AbortSignal)=>handleRequest(new Request('https://updates.evanarts.com/v1/tushare/mcp',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1',authorization:'Bearer '+'a'.repeat(64)},body,signal}),env)
 const transport=new McpSupervisor(new CredentialVault(root,encryption),undefined,request)
 cleanup.push(async()=>{await transport.disposeAll();await rm(root,{recursive:true,force:true})})
 const c=bundledTushareConnection('one',true),signal=AbortSignal.timeout(5000)
 const connected=await transport.connect(c,signal);expect(connected.tools.map(t=>t.name)).toEqual(['tushare_catalog','tushare_query','tushare_etf_snapshot'])
 const args={api_name:'index_daily',params:{ts_code:'000300.SH',start_date:'2026-11-01',end_date:'20261107'},fields:'ts_code,trade_date,close'}
 const value=await transport.invoke(c.id,'tushare_query',args,signal)
 expect(value.isError).not.toBe(true);expect(JSON.stringify(value)).toContain('4054.2769');expect(JSON.stringify(value)).not.toContain('fixture-only')
 expect(JSON.parse(String(upstream.mock.calls[0]?.[1].body)).params).toMatchObject({ts_code:'000300.SH',start_date:'20261101',end_date:'20261107'})
 expect(args.params.start_date).toBe('2026-11-01')
 for(const start_date of ['2026-02-30','2026-11-01T12:00:00Z','2026-11-08']){
  expect((await transport.invoke(c.id,'tushare_query',{...args,params:{...args.params,start_date}},signal)).isError).toBe(true)
 }
 expect(upstream).toHaveBeenCalledOnce()
})
