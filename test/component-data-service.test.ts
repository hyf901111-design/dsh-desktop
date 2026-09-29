import {expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {componentRefreshBindings,createComponentDataService} from '../src/main/component-data/service'
import {validateIntegrationBindings} from '../src/shared/scheduled-tasks'
const {acceptArtifactOutput}=await import(new URL('../packages/dsh-research-task-runtime/artifact-output.js',import.meta.url).href)

it('reads unbound personal-board settings after its workspace is removed without allowing data execution',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'component-data-orphan-'))
 const rpc=vi.fn(async(method:string)=>({items:method==='session.list'?[{sessionId:'board',cwd:'/removed-board'}]:[]}))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,rpc,
  integrations:{} as any,canvas:{} as any})
 try{
  await expect(service.request('board',{action:'list'})).resolves.toEqual([])
  expect(rpc.mock.calls.map(call=>call[0])).not.toContain('workspace.list')
  await expect(service.request('missing',{action:'list'})).rejects.toThrow(/会话/)
  await expect(service.request('board',{action:'bind',nodeId:'n',recipe:{}})).rejects.toThrow(/工作区/)
  await expect(service.request('board',{action:'refresh',nodeId:'n'})).rejects.toThrow(/工作区/)
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('binds and refreshes successful MCP numeric query arguments through the same schema normalization',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'component-data-service-'))
 const tool={id:'t',connectionId:'c',name:'call_api',enabled:true,schemaDigest:'d',inputSchema:{type:'object',properties:{url_params:{type:'object',additionalProperties:{type:'string'}}}}}
 const connection={id:'c',enabled:true,ownerAccountId:'o',authState:'connected',toolGrants:['t'],workspaceGrant:{mode:'all'},revision:1,config:{type:'mcp'}}
 const data={version:1,type:'market',variant:'metrics',title:'行情',asOf:'2026-09-26',items:[{label:'价格',value:'1'}]}
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!)
 const execute=vi.fn(async(_call:any)=>({content:[{type:'text',text:'{"value":2}'}]}))
 const canvasExecute=vi.fn(async()=>({revision:'r',writable:true,nodes:[{id:'n',content:{containerSpec:spec},capabilities:{fields:{containerSpec:true}}}]}))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,
  integrations:{store:{snapshot:()=>({tools:{t:tool},connections:{c:connection}})},runtimeSnapshot:()=>({tools:[tool],connections:[connection],runtimeEpoch:'e'}),execute} as any,
  rpc:async(method)=>({items:method==='session.list'?[{sessionId:'s',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),
  canvas:{bind:()=>{},execute:canvasExecute} as any})
 try{
  await service.request('s',{action:'bind-generated',nodeId:'n',initialSpec:spec,recipe:{requests:[{key:'q',toolId:'t',args:{url_params:{num:20,flag:1,dateString:{$date:{format:'yyyyMMdd000000'}}}}}],mapping:{...data,items:[{label:'价格',value:{$from:'q',$path:'value',$as:'string'}}]}}})
  await service.request('s',{action:'refresh',nodeId:'n'})
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0].arguments.url_params).toMatchObject({num:'20',flag:'1',dateString:expect.stringMatching(/^\d{14}$/)})
  expect(service.engine.list('s')[0]!.lastSuccess).toBeTruthy()
  expect(canvasExecute.mock.calls.map(call=>(call as any[])[0])).toEqual(expect.arrayContaining([expect.objectContaining({method:'apply',scheduled:true,source:'component-data-refresh'})]))
  expect(canvasExecute.mock.calls.every(call=>(call as any[])[0].source==='component-data-refresh')).toBe(true)
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('combines repeated requests into one valid connection grant with all tool schemas',()=>{
 const first={connectionId:'datayes',connectionRevision:2,toolId:'call-api',schemaDigest:'a'.repeat(64)}
 const second={...first,toolId:'reports',schemaDigest:'b'.repeat(64)}
 const bindings=componentRefreshBindings([first,first,second,{...first,connectionId:'other'}])
 expect(validateIntegrationBindings(bindings)).toHaveLength(2)
 expect(bindings[0]).toMatchObject({entityId:'datayes',bindingRevision:2,toolIds:['call-api','reports'],schemaDigests:{'call-api':first.schemaDigest,reports:second.schemaDigest}})
 expect(()=>componentRefreshBindings([first,{...first,connectionRevision:3}])).toThrow(/版本/)
})
