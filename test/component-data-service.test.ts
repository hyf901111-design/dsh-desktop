import {expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {componentRefreshBindings,createComponentDataService} from '../src/main/component-data/service'
import {validateIntegrationBindings} from '../src/shared/scheduled-tasks'
const {acceptArtifactOutput}=await import(new URL('../packages/dsh-research-task-runtime/artifact-output.js',import.meta.url).href)

it('合并同账号并发身份读取，后续检查重新读取，账号切换不复用旧请求',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'component-identity-flight-'))
 let owner='alice'
 const pending:Array<(value:any)=>void>=[]
 const rpc=vi.fn(()=>new Promise(resolve=>pending.push(resolve)))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=>owner,isShared:()=>false,rpc,integrations:{} as any,canvas:{} as any})
 const release=()=>pending.shift()!({items:[{sessionId:'s',cwd:'/workspace'}]})
 try{
  const batch=Promise.all([1,2,3].map(()=>service.request('s',{action:'list'})))
  await Promise.resolve();expect(rpc).toHaveBeenCalledTimes(1);release();await expect(batch).resolves.toEqual([[],[],[]])
  const old=service.request('s',{action:'list'});const rejected=expect(old).rejects.toThrow('账号已变化')
  await Promise.resolve();expect(rpc).toHaveBeenCalledTimes(2)
  owner='bob';const current=service.request('s',{action:'list'})
  await Promise.resolve();expect(rpc).toHaveBeenCalledTimes(3)
  release();await rejected;release();await expect(current).resolves.toEqual([])
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('新建个人看板直接绑定内置公开数据，不依赖工作区列表扫描，移除看板后停止取数',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'personal-board-data-'))
 const data={version:1,type:'kpi',title:'公开报价',asOf:'来源时点',items:[{label:'报价',value:'100'}]}
 let spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!),at=Date.now(),available=true
 const rpc=vi.fn(async()=>{throw Error('不应扫描全部会话与工作区')})
 const query=vi.fn(async()=>({records:[{price:101}]}))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,rpc,
  personalBoard:(id:string)=>available&&id==='personal-board'?{sessionId:id,cwd:'/private/app/boards/new-board',dedicated:true}:undefined,
  publicData:{validate:async()=>({sourceId:'tencent-quotes',sourceName:'腾讯财经'}),query},integrations:{} as any,
  canvas:{bind:()=>{},execute:async(call:any)=>{
   if(call.method==='apply'){spec=call.args.changes[0].fields.containerSpec;return {}}
   return {revision:'r',writable:true,nodes:[{id:'n',content:{containerSpec:spec},capabilities:{fields:{containerSpec:true}}}]}
  }}} as any)
 ;(service.engine as any).options.now=()=>at
 try{
  const args={operation:'query',source:'tencent-quotes',parameters_json:'{"symbols":["sh510300"]}'}
  await expect(service.request('personal-board',{action:'bind-generated',nodeId:'n',initialSpec:spec,recipe:{intervalMinutes:1,requests:[{key:'q',toolId:'public_data_query',args}],mapping:{...data,items:[{label:'报价',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}})).resolves.toMatchObject({workspaceId:'builtin-personal-board:personal-board',enabled:true})
  await expect(service.request('personal-board',{action:'list'})).resolves.toHaveLength(1)
  at+=60000;service.engine.setVisible('personal-board',true);await service.engine.tick()
  expect(query).toHaveBeenCalledOnce();expect(rpc).not.toHaveBeenCalled();expect(service.engine.list('personal-board')[0]).toMatchObject({status:'success',successSequence:1})
  const previous=spec;available=false;at+=60000;service.engine.setVisible('personal-board',true);await service.engine.tick()
  expect(query).toHaveBeenCalledOnce();expect(spec).toEqual(previous);expect(service.engine.list('personal-board')[0]!.status).toBe('error')
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('个人看板的内置来源身份不能为插件工具或其他会话授予工作区权限',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'personal-board-grants-'))
 const rpc=vi.fn(async(method:string)=>({items:method==='session.list'?[{sessionId:'personal-board',cwd:'/private/app/boards/new-board'}]:[]}))
 const validate=vi.fn(),query=vi.fn()
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,rpc,
  personalBoard:(id:string)=>id==='personal-board'?{sessionId:id,cwd:'/private/app/boards/new-board',dedicated:true}:undefined,
  publicData:{validate,query},integrations:{} as any,canvas:{} as any} as any)
 try{
  await expect(service.request('personal-board',{action:'bind',nodeId:'n',recipe:{requests:[{key:'q',toolId:'plugin-tool',args:{}}]}})).rejects.toThrow(/工作区/)
  await expect(service.request('other-session',{action:'bind',nodeId:'n',recipe:{requests:[{key:'q',toolId:'public_data_query',args:{}}]}})).rejects.toThrow(/会话/)
  expect(validate).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(service.engine.list()).toEqual([])
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it.each([
 {action:'list',pauseAt:1},
 {action:'bind-generated',pauseAt:2},
 {action:'bind-generated',pauseAt:4}
])('rejects $action when the owner changes during identity RPC $pauseAt',async({action,pauseAt})=>{
 const directory=await mkdtemp(join(tmpdir(),'component-data-owner-'))
 let owner='alice',calls=0
 const data={version:1,type:'kpi',title:'Alice price',asOf:'Kraken',items:[{label:'BTC/USD',value:'100'}]},spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!)
 const validate=vi.fn(async()=>({sourceId:'kraken-ticker',sourceName:'Kraken'}))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=>owner,isShared:()=>false,integrations:{} as any,canvas:{} as any,
  publicData:{validate,query:vi.fn()},
  rpc:async(method:string)=>{if(++calls===pauseAt)owner='bob';return {items:method==='session.list'?[{sessionId:'note',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}}})
 try{
  await expect(service.request('note',{action,nodeId:'note-component-alice',initialSpec:spec,recipe:{requests:[{key:'q',toolId:'public_data_query',args:{sourceId:'kraken-ticker'}}],mapping:data}})).rejects.toThrow('账号已变化')
  expect(service.engine.list()).toEqual([]);owner='alice';expect(service.engine.list()).toEqual([]);expect(validate).not.toHaveBeenCalled()
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('refreshes note components through the same engine using an independent note sink and visibility lease',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'note-data-refresh-'))
 const data={version:1,type:'kpi',title:'BTC',asOf:'Kraken',items:[{label:'BTC/USD',value:'100'}]}
 let spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!),at=Date.now()
 const noteBind=vi.fn(),noteExecute=vi.fn(async(call:any)=>{
  if(call.method==='apply'){spec=call.args.changes[0].fields.containerSpec;return {status:'applied'}}
  return {revision:'note-current',writable:true,nodes:[{id:'note-component-one',content:{containerSpec:spec},capabilities:{fields:{containerSpec:true}}}]}
 })
 const query=vi.fn(async()=>({records:[{price:101}]}))
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,
  publicData:{validate:async()=>({sourceId:'kraken-ticker',sourceName:'Kraken'}),query},integrations:{} as any,
  rpc:async(method:string)=>({items:method==='session.list'?[{sessionId:'note',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),
  canvas:{bind:noteBind,execute:noteExecute}} as any)
 ;(service.engine as any).options.now=()=>at
 try{
  await service.request('note',{action:'bind-generated',nodeId:'note-component-one',initialSpec:spec,recipe:{intervalMinutes:1,requests:[{key:'q',toolId:'public_data_query',args:{sourceId:'kraken-ticker',parameters:{pair:'XBTUSD'}}}],mapping:{...data,items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}})
  at+=60000;service.engine.setVisible('note',true);await service.engine.tick()
  expect(query).toHaveBeenCalledOnce();expect(noteExecute.mock.calls.map(call=>call[0].method)).toEqual(['inspect','inspect','apply'])
  expect(noteBind).toHaveBeenCalledWith({sessionId:'note',selectedIds:['note-component-one']})
  expect(service.engine.list('note')[0]).toMatchObject({status:'success',successSequence:1})
  service.engine.setVisible('note',false);at+=60000;await service.engine.tick();expect(query).toHaveBeenCalledOnce()
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

it('refreshes a builtin source every minute without MCP grants, pauses outside the board and retains data on failure',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'public-data-refresh-'))
 const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'}
 let value=100,at=Date.now()
 const validate=vi.fn(async()=>({sourceId:'kraken-ticker',sourceName:'Kraken'})),query=vi.fn(async()=>({records:[{price:value}]}))
 const data={version:1,type:'kpi',title:'BTC',asOf:'Kraken · 报价时点未提供',items:[{label:'BTC/USD',value:'100'}]}
 let spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!)
 const canvasExecute=vi.fn(async(call:any)=>{if(call.method==='apply'){spec=call.args.changes[0].fields.containerSpec;return {}}return {revision:'r',writable:true,nodes:[{id:'n',content:{containerSpec:spec},capabilities:{fields:{containerSpec:true}}}]}})
 const onStatusChange=vi.fn()
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'o',isShared:()=>false,publicData:{validate,query},integrations:{} as any,onStatusChange,
  rpc:async(method:string)=>({items:method==='session.list'?[{sessionId:'s',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),canvas:{bind:()=>{},execute:canvasExecute} as any})
 ;(service.engine as any).options.now=()=>at
 try{
  await service.request('s',{action:'bind-generated',nodeId:'n',initialSpec:spec,recipe:{intervalMinutes:1,requests:[{key:'q',toolId:'public_data_query',args}],mapping:{...data,items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}})
  at+=60000;service.engine.setVisible('s',true);value=101;await service.engine.tick()
  expect(query).toHaveBeenCalledOnce();expect(query.mock.calls[0]).toEqual([args,expect.any(AbortSignal)])
  expect(service.engine.list('s')[0]).toMatchObject({intervalMinutes:1,status:'success',successSequence:1,lastSuccess:at})
  const first=spec
  at+=60000;service.engine.setVisible('s',false);await service.engine.tick();expect(query).toHaveBeenCalledOnce()
  service.engine.setVisible('s',true);await service.engine.tick();expect(query).toHaveBeenCalledTimes(2)
  expect(service.engine.list('s')[0]!.status).toBe('unchanged')
  query.mockRejectedValueOnce(Error('来源暂不可用'));at+=60000;service.engine.setVisible('s',true);await service.engine.tick()
  expect(service.engine.list('s')[0]!.status).toBe('error');expect(spec).toEqual(first)
  const pushed=onStatusChange.mock.calls.at(-1)![1][0]
  expect(pushed).toMatchObject({nodeId:'n',status:'error',sourceNames:['Kraken']})
  expect(pushed).not.toHaveProperty('requests');expect(pushed).not.toHaveProperty('mapping')
  expect(componentRefreshBindings(service.engine.list('s')[0]!.requests)).toEqual([])
 }finally{await service.dispose();await rm(directory,{recursive:true,force:true})}
})

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
  rpc:async(method:string)=>({items:method==='session.list'?[{sessionId:'s',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),
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
