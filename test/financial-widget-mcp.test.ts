import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createBundledFinancialMcp} from '../src/main/financial/bundled-mcp'
import {bundledDatayesConnection,bundledDatayesId} from '../src/main/integrations/bundled-datayes'
import {createFinancialWidgetData} from '../src/main/financial/widget-data'
import type {Connection} from '../src/shared/integrations'
import {McpSupervisor} from '../src/main/integrations/adapters/mcp'

const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})

function fixture(){
 let owner:string|null='account-one'
 const builtin=bundledDatayesConnection(owner,true),personal:Connection={...builtin,id:'personal-datayes',name:'通联 DataYes MCP',config:{type:'mcp',transport:'http',url:'https://personal.example/mcp',auth:{type:'none'},network:{allowedOrigins:['https://personal.example']}}}
 const connections:Record<string,Connection>={[builtin.id]:builtin,[personal.id]:personal}
 const mcp={connect:vi.fn<McpSupervisor['connect']>(async()=>({tools:[]})),invoke:vi.fn<McpSupervisor['invoke']>(async()=>({content:[{type:'text',text:'[]'}]}))}
 const callTool=createBundledFinancialMcp({identity:()=>owner,connection:id=>connections[id],mcp})
 return {callTool,mcp,connections,builtin,personal,setOwner:(value:string|null)=>owner=value}
}
it('组件固定使用当前账号的默认内置MCP，个人同名连接和凭据不参与选择',async()=>{
 const f=fixture(),signal=AbortSignal.timeout(5000),before=structuredClone(f.personal)
 await f.callTool('get_api_info',{nameEn:'market_snapshot'},signal)
 expect(f.mcp.connect).toHaveBeenCalledWith(f.builtin,signal)
 expect(f.mcp.invoke).toHaveBeenCalledWith(bundledDatayesId('account-one'),'get_api_info',{nameEn:'market_snapshot'},signal)
 expect(f.personal).toEqual(before)
})
it('默认MCP缺失或被篡改时不会回退到个人连接',async()=>{
 const f=fixture();delete f.connections[f.builtin.id]
 await expect(f.callTool('get_api_info',{},AbortSignal.timeout(5000))).rejects.toThrow('默认数据源暂不可用')
 f.connections[f.builtin.id]={...f.builtin,config:f.personal.config} as any
 await expect(f.callTool('get_api_info',{},AbortSignal.timeout(5000))).rejects.toThrow('默认数据源暂不可用')
 expect(f.mcp.connect).not.toHaveBeenCalled();expect(f.mcp.invoke).not.toHaveBeenCalled()
})
it('账户切换取消连接中的旧请求；退出登录与未知工具不触发调用',async()=>{
 const f=fixture();let release!:()=>void
 f.mcp.connect.mockImplementationOnce(()=>new Promise(resolve=>release=()=>resolve({tools:[]})))
 const pending=f.callTool('get_api_info',{},AbortSignal.timeout(5000));f.setOwner('account-two');release()
 await expect(pending).rejects.toThrow('账户已变化');expect(f.mcp.invoke).not.toHaveBeenCalled()
 f.setOwner(null);await expect(f.callTool('get_api_info',{},AbortSignal.timeout(5000))).rejects.toThrow('请先登录')
 f.setOwner('account-one');await expect(f.callTool('get_catalog',{},AbortSignal.timeout(5000))).rejects.toThrow('金融组件工具无效')
})
it('默认MCP连接错误使用通用提示，显式重试重新连接；复用原API定义校验',async()=>{
 const f=fixture();f.mcp.connect.mockRejectedValueOnce(Error('Personal MCP HTTP 402 credits'))
 const service=createFinancialWidgetData({callTool:f.callTool,identity:()=> 'account-one'})
 await expect(service.query({action:'news'})).rejects.toThrow('默认数据源暂不可用')
 f.mcp.invoke.mockImplementation(async(_id,name)=>({content:[{type:'text',text:JSON.stringify(name==='get_api_info'?{httpMethod:'POST',httpUrl:'https://gw.datayes.com/intelligent_feed',parametersInput:[] }:{code:1,data:{feeds:[{mongoId:'news-one',title:'测试市场资讯',createTime:'2026-10-10T09:00:00+0800'}]}})}]}))
 const result=await service.query({action:'news',refresh:true})
 expect(result.news[0].title).toBe('测试市场资讯');expect(f.mcp.connect).toHaveBeenCalledTimes(3)
 expect(f.mcp.invoke.mock.calls.every(call=>call[0]===f.builtin.id)).toBe(true)
 f.mcp.invoke.mockResolvedValue({content:[{type:'text',text:JSON.stringify({httpMethod:'POST',httpUrl:'https://personal.example/export',parametersInput:[]})}]})
 await expect(service.query({action:'search',query:'茅台'})).rejects.toThrow('此数据接口暂不支持固定组件')
})
it('真实MCP SDK经默认连接完成发现、API定义和资讯调用',async()=>{
 const root=await mkdtemp(join(tmpdir(),'financial-default-mcp-')),calls:string[]=[]
 const transport=new McpSupervisor({read:async()=>{throw Error('不读取个人凭据')}},async(body)=>{
  const rpc=JSON.parse(body);calls.push(rpc.method==='tools/call'?rpc.params.name:rpc.method)
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202})
  const result=rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'test-default-mcp',version:'1'}}
   :rpc.method==='tools/list'?{tools:['get_api_info','call_api'].map(name=>({name,inputSchema:{type:'object',additionalProperties:true}}))}
   :{content:[{type:'text',text:JSON.stringify(rpc.params.name==='get_api_info'?{httpMethod:'POST',httpUrl:'https://gw.datayes.com/intelligent_feed',parametersInput:[]}:{code:1,data:{feeds:[{mongoId:'sdk-news',title:'默认连接测试资讯'}]}})}]}
  return Response.json({jsonrpc:'2.0',id:rpc.id,result})
 })
 cleanup.push(async()=>{await transport.disposeAll();await rm(root,{recursive:true,force:true})})
 const connection=bundledDatayesConnection('account-one',true),identity=()=> 'account-one'
 const callTool=createBundledFinancialMcp({identity,connection:id=>id===connection.id?connection:undefined,mcp:transport})
 const result=await createFinancialWidgetData({identity,callTool}).query({action:'news'})
 expect(result.news[0].id).toBe('sdk-news');expect(calls).toContain('initialize');expect(calls).toContain('tools/list');expect(calls).toContain('get_api_info');expect(calls).toContain('call_api')
})
