import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import {dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import Ajv from 'ajv'
import {ComponentDataRefresh,evaluateMapping} from '../../../packages/dsh-research-task-runtime/component-data-refresh.js'
import type {IntegrationService} from '../integrations/service'
import type {ScheduledTask} from '../../shared/scheduled-tasks'
import type {CanvasActionBridge} from '../state/canvas-action-bridge'

export function componentRefreshBindings(requests:Array<{connectionId:string;connectionRevision:number;toolId:string;schemaDigest:string}>):NonNullable<ScheduledTask['integrationBindings']>{
 const groups=new Map<string,NonNullable<ScheduledTask['integrationBindings']>[number]>()
 for(const request of requests){
  let binding=groups.get(request.connectionId)
  if(!binding){binding={kind:'connection',entityId:request.connectionId,bindingRevision:request.connectionRevision,toolIds:[],schemaDigests:{},allowWrite:true};groups.set(request.connectionId,binding)}
  if(binding.bindingRevision!==request.connectionRevision||binding.schemaDigests[request.toolId]&&binding.schemaDigests[request.toolId]!==request.schemaDigest)throw Error('数据接口版本不一致，请重新绑定')
  if(!binding.toolIds.includes(request.toolId))binding.toolIds.push(request.toolId)
  binding.schemaDigests[request.toolId]=request.schemaDigest
 }
 return [...groups.values()]
}

export async function createComponentDataService(options:{file:string;integrations:IntegrationService;canvas:CanvasActionBridge;rpc:(method:string,args:any)=>Promise<any>;owner:()=>string|undefined;isShared:(id:string)=>boolean}){
 const ajv=new Ajv({strict:false,allErrors:false,validateFormats:false})
 async function identity(sessionId:string){
  if(options.isShared(sessionId))throw Error('当前数据刷新仅支持个人工作台')
  const [sessions,workspaces]=await Promise.all([options.rpc('session.list',{}),options.rpc('workspace.list',{})])
  const session=sessions.items.find((s:any)=>s.sessionId===sessionId)
  const workspace=workspaces.items.find((w:any)=>session?.cwd?w.path===session.cwd:w.sessionIds?.includes(sessionId))
  if(!session||!workspace)throw Error('组件所属会话或工作区不可用')
  return {session,workspace}
 }
 async function canvas(target:any,method:string,args:any,signal?:AbortSignal){options.canvas.bind({sessionId:target.sessionId,selectedIds:[target.nodeId]});return options.canvas.execute({sessionId:target.sessionId,method,args,scheduled:true},signal) as Promise<any>}
 const engine=new ComponentDataRefresh({owner:options.owner,
  load:async()=>{try{return JSON.parse(await readFile(options.file,'utf8'))}catch(error:any){if(error.code==='ENOENT')return [];throw error}},
  save:async(value:any)=>{await mkdir(dirname(options.file),{recursive:true});const tmp=options.file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value),{encoding:'utf8',mode:0o600});await rename(tmp,options.file)},
  inspect:async(target:any)=>{const result=await canvas(target,'inspect',{ids:[target.nodeId]});const node=result.nodes.find((n:any)=>n.id===target.nodeId);return {revision:result.revision,spec:node?.content?.containerSpec,writable:result.writable&&Boolean(node?.capabilities?.fields?.containerSpec)}},
  apply:async(target:any,revision:string,spec:any,signal:AbortSignal)=>canvas(target,'apply',{requestId:randomUUID(),revision,changes:[{op:'update',id:target.nodeId,fields:{containerSpec:spec}}]},signal),
  validateRequest:async(request:any,target:any)=>{
   const {workspace}=await identity(target.sessionId)
   const state=options.integrations.store.snapshot(),tool=state.tools[request.toolId],connection=tool&&state.connections[tool.connectionId]
   if(!tool||!connection||!tool.enabled||!connection.enabled||connection.ownerAccountId!==options.owner()||connection.authState!=='connected'||!connection.toolGrants.includes(tool.id)||connection.workspaceGrant.mode==='selected'&&!connection.workspaceGrant.workspaceIds.includes(workspace.workspaceId))throw Error('所选数据工具未连接或当前工作区不可用')
   if(!ajv.validate(tool.inputSchema,evaluateMapping(request.args,{})))throw Error('请求参数不符合插件接口定义')
   return {key:request.key,toolId:tool.id,args:request.args,connectionId:connection.id,connectionRevision:connection.revision,schemaDigest:tool.schemaDigest,sourceName:connection.name+' / '+tool.name}
  },
  execute:async(binding:any,request:any,args:any,signal:AbortSignal)=>{
   const live=options.integrations.runtimeSnapshot(),tool=live.tools.find(t=>t.id===request.toolId),connection=live.connections.find(c=>c.id===request.connectionId)
   if(!tool||!connection||connection.revision!==request.connectionRevision||tool.schemaDigest!==request.schemaDigest)throw Error('数据接口配置已变化，请重新绑定')
   if(!ajv.validate<Record<string,unknown>>(tool.inputSchema,args))throw Error('刷新请求参数不符合接口定义')
   return options.integrations.execute({callId:randomUUID(),toolId:request.toolId,connectionRevision:request.connectionRevision,arguments:args,context:{sessionId:binding.sessionId,rootSessionId:binding.sessionId,workspaceId:binding.workspaceId,ownerAccountId:binding.ownerAccountId,runtimeEpoch:live.runtimeEpoch,unattended:true,taskId:'component-data:'+binding.id}},signal)
  }
 })
 await engine.load()
 const contextTasks=():ScheduledTask[]=>engine.list().filter(b=>b.status==='refreshing').map((b:any)=>({id:'component-data:'+b.id,title:'组件数据刷新',prompt:'按已保存接口映射刷新数据',workspaceId:b.workspaceId,component:{sessionId:b.sessionId,nodeId:b.nodeId,title:'组件',boardTitle:'工作台'},state:b.enabled?'enabled':'paused',createdAt:0,nextRun:b.nextRun,schedule:{frequency:'daily',time:'00:00',timezone:'Asia/Shanghai',weekday:0,date:''},notification:'never',runs:[{id:b.id,status:'running',startedAt:b.lastAttempt??0}],integrationBindings:componentRefreshBindings(b.requests)}))
 const request=async(sessionId:string,args:any)=>{
  await identity(sessionId)
  if(!args||typeof args!=='object')throw Error('数据操作参数无效')
  const rows=engine.list(sessionId),binding=rows.find((b:any)=>b.nodeId===args.nodeId)
  if(args.action==='list')return rows
  if(args.action==='bind'||args.action==='bind-generated'){
   const {workspace}=await identity(sessionId)
   const recipe=typeof args.recipe==='string'?JSON.parse(args.recipe):args.recipe
   return engine.bind({...recipe,sessionId,nodeId:args.nodeId,workspaceId:workspace.workspaceId},args.action==='bind-generated'?args.initialSpec:undefined,{preserveSettings:args.action==='bind-generated'})
  }
  if(!binding)throw Error('组件尚未绑定数据接口。请让助手用已调用成功的接口和字段映射设置数据源。')
  if(args.action==='refresh')return engine.refresh(binding.id)
  if(args.action==='configure')return engine.configure(binding.id,args.settings)
  throw Error('不支持的数据操作')
 }
 const timer=setInterval(()=>{void engine.tick().catch(()=>{})},5000);timer.unref()
 return {request,contextTasks,engine,dispose:async()=>{clearInterval(timer);await engine.dispose()}}
}
