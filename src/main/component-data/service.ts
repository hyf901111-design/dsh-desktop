import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import {dirname,isAbsolute} from 'node:path'
import {randomUUID} from 'node:crypto'
import Ajv from 'ajv'
import {ComponentDataRefresh,evaluateMapping} from '../../../packages/dsh-research-task-runtime/component-data-refresh.js'
import type {IntegrationService} from '../integrations/service'
import type {ScheduledTask} from '../../shared/scheduled-tasks'
import type {CanvasActionBridge} from '../state/canvas-action-bridge'
import {normalizeMcpQueryArguments} from '../integrations/query-arguments'
import {createPublicDataClient,PUBLIC_DATA_CONNECTION,PUBLIC_DATA_SCHEMA} from '../../../packages/dsh-research-task-runtime/public-data-client.js'

export type ComponentDataControl={signal?:AbortSignal;guardId?:string}

export function componentRefreshBindings(requests:Array<{connectionId:string;connectionRevision:number;toolId:string;schemaDigest:string}>):NonNullable<ScheduledTask['integrationBindings']>{
 const groups=new Map<string,NonNullable<ScheduledTask['integrationBindings']>[number]>()
 for(const request of requests){
  if(request.connectionId===PUBLIC_DATA_CONNECTION)continue
  let binding=groups.get(request.connectionId)
  if(!binding){binding={kind:'connection',entityId:request.connectionId,bindingRevision:request.connectionRevision,toolIds:[],schemaDigests:{},allowWrite:true};groups.set(request.connectionId,binding)}
  if(binding.bindingRevision!==request.connectionRevision||binding.schemaDigests[request.toolId]&&binding.schemaDigests[request.toolId]!==request.schemaDigest)throw Error('数据接口版本不一致，请重新绑定')
  if(!binding.toolIds.includes(request.toolId))binding.toolIds.push(request.toolId)
  binding.schemaDigests[request.toolId]=request.schemaDigest
 }
 return [...groups.values()]
}

export async function createComponentDataService(options:{file:string;integrations:IntegrationService;canvas:CanvasActionBridge;rpc:(method:string,args:any)=>Promise<any>;owner:()=>string|undefined;isShared:(id:string)=>boolean;personalBoard?:(id:string)=>{sessionId:string;cwd?:string;dedicated?:boolean}|undefined;skillDirectory?:string;publicData?:{validate:(args:any)=>Promise<{sourceId:string;sourceName:string}>;query:(args:any,signal:AbortSignal)=>Promise<any>};onStatusChange?:(sessionId:string,rows:unknown[])=>void}){
 const ajv=new Ajv({strict:false,allErrors:false,validateFormats:false})
 const publicData=options.publicData??createPublicDataClient({root:options.skillDirectory})
 // A component batch must not launch one expensive historical-session scan
 // per card. Share only reads currently in flight, within the same account;
 // every later authorization check still reads fresh host state.
 const identityReads=new Map<string,{owner:string|undefined;promise:Promise<any>}>()
 async function identityList(method:string){
  const owner=options.owner(),pending=identityReads.get(method)
  if(pending&&pending.owner===owner)return pending.promise
  const entry={owner,promise:Promise.resolve().then(()=>options.rpc(method,{}))}
  identityReads.set(method,entry)
  try{return await entry.promise}finally{if(identityReads.get(method)===entry)identityReads.delete(method)}
 }
 // The desktop's dedicated personal-board registry is authoritative for these
 // sessions. Builtin public sources do not need an MCP workspace grant, and
 // scanning every historical session/workspace can time out during a batch.
 function personalIdentity(sessionId:string){
  if(options.isShared(sessionId))throw Error('当前数据刷新仅支持个人工作台')
  const board=options.personalBoard?.(sessionId)
  if(!board?.dedicated||board.sessionId!==sessionId||!board.cwd||!isAbsolute(board.cwd))return
  return {session:{sessionId,cwd:board.cwd},workspace:{workspaceId:'builtin-personal-board:'+sessionId,path:board.cwd}}
 }
 async function sessionIdentity(sessionId:string,allowPersonalBoard=false){
  if(options.isShared(sessionId))throw Error('当前数据刷新仅支持个人工作台')
  const personal=allowPersonalBoard&&personalIdentity(sessionId)
  if(personal)return personal.session
  const sessions=await identityList('session.list')
  const session=sessions.items.find((s:any)=>s.sessionId===sessionId)
  if(!session)throw Error('组件所属会话不可用，请重新打开看板后重试')
  return session
 }
 async function identity(sessionId:string,allowPersonalBoard=false){
  const owner=options.owner(),checkOwner=()=>{if(options.owner()!==owner)throw Error('账号已变化，请重新打开后重试。')}
  const personal=allowPersonalBoard&&personalIdentity(sessionId)
  checkOwner();if(personal)return personal
  const session=await sessionIdentity(sessionId);checkOwner()
  const workspaces=await identityList('workspace.list');checkOwner()
  const workspace=workspaces.items.find((w:any)=>session.cwd?w.path===session.cwd:w.sessionIds?.includes(sessionId))
  if(!workspace)throw Error('组件所属工作区未连接，请重新连接原工作区后再绑定或刷新数据；现有内容已保留')
  return {session,workspace}
 }
 async function canvas(target:any,method:string,args:any,signal?:AbortSignal){signal?.throwIfAborted();options.canvas.bind({sessionId:target.sessionId,selectedIds:[target.nodeId]});return options.canvas.execute({sessionId:target.sessionId,method,args,scheduled:true,source:'component-data-refresh',...(target.guardId?{guardId:target.guardId}:{})},signal) as Promise<any>}
 const engine=new ComponentDataRefresh({owner:options.owner,
  onChange:(records)=>{
   const rows=records.filter(row=>row.ownerAccountId===options.owner()),sessions=new Set(rows.map(row=>row.sessionId))
   for(const sessionId of sessions)options.onStatusChange?.(sessionId,rows.filter(row=>row.sessionId===sessionId).map(row=>{
    const names=[...new Set(row.requests.map(request=>request.sourceName?.trim()).filter((name):name is string=>Boolean(name)))],selected=row.sources?.find(source=>source.id===row.sourceId)?.name?.trim()
    return {nodeId:row.nodeId,status:row.status,lastSuccess:row.lastSuccess,successSequence:row.successSequence,dataAsOf:row.dataAsOf,enabled:row.enabled,intervalMinutes:row.intervalMinutes,sourceNames:names.length?names:selected?[selected]:[],viewPaused:row.enabled&&!engine.isVisible(sessionId)}
   }))
  },
  load:async()=>{try{return JSON.parse(await readFile(options.file,'utf8'))}catch(error:any){if(error.code==='ENOENT')return [];throw error}},
  save:async(value:any)=>{await mkdir(dirname(options.file),{recursive:true});const tmp=options.file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value),{encoding:'utf8',mode:0o600});await rename(tmp,options.file)},
  inspect:async(target:any,signal?:AbortSignal)=>{const result=await canvas(target,'inspect',{ids:[target.nodeId]},signal);const node=result.nodes.find((n:any)=>n.id===target.nodeId);return {revision:result.revision,spec:node?.content?.containerSpec,writable:result.writable&&Boolean(node?.capabilities?.fields?.containerSpec)}},
  apply:async(target:any,revision:string,spec:any,signal:AbortSignal)=>canvas(target,'apply',{requestId:randomUUID(),revision,changes:[{op:'update',id:target.nodeId,fields:{containerSpec:spec}}]},signal),
  validateRequest:async(request:any,target:any)=>{
   const {workspace}=await identity(target.sessionId,request.toolId==='public_data_query')
   if(request.toolId==='public_data_query'){
    const source=await publicData.validate(evaluateMapping(request.args,{}))
    return {...request,connectionId:PUBLIC_DATA_CONNECTION,connectionRevision:1,schemaDigest:PUBLIC_DATA_SCHEMA,sourceName:source.sourceName}
   }
   const state=options.integrations.store.snapshot(),tool=state.tools[request.toolId],connection=tool&&state.connections[tool.connectionId]
   if(!tool||!connection||!tool.enabled||!connection.enabled||connection.ownerAccountId!==options.owner()||connection.authState!=='connected'||!connection.toolGrants.includes(tool.id)||connection.workspaceGrant.mode==='selected'&&!connection.workspaceGrant.workspaceIds.includes(workspace.workspaceId))throw Error('所选数据工具未连接或当前工作区不可用')
   if(target.mapping?.observedWorkbench&&tool.effect!=='read')throw Error('组件来源需要已授权的只读查询')
   const evaluated=evaluateMapping(request.args,{})
   if(!ajv.validate(tool.inputSchema,connection.config.type==='mcp'?normalizeMcpQueryArguments(tool.inputSchema,evaluated):evaluated))throw Error('请求参数不符合插件接口定义')
   return {key:request.key,toolId:tool.id,args:request.args,connectionId:connection.id,connectionRevision:connection.revision,schemaDigest:tool.schemaDigest,sourceName:connection.name+' / '+tool.name}
  },
  execute:async(binding:any,request:any,args:any,signal:AbortSignal)=>{
   if(request.toolId==='public_data_query'){
    if(request.connectionId!==PUBLIC_DATA_CONNECTION||request.connectionRevision!==1||request.schemaDigest!==PUBLIC_DATA_SCHEMA)throw Error('内置数据源版本已变化，请重新绑定')
    const owner=options.owner();await identity(binding.sessionId,true)
    if(options.owner()!==owner||binding.ownerAccountId!==owner)throw Error('账号已变化，请重新打开后重试。')
    return publicData.query(args,signal)
   }
   const live=options.integrations.runtimeSnapshot(),tool=live.tools.find(t=>t.id===request.toolId),connection=live.connections.find(c=>c.id===request.connectionId)
   if(!tool||!connection||connection.revision!==request.connectionRevision||tool.schemaDigest!==request.schemaDigest)throw Error('数据接口配置已变化，请重新绑定')
   if(binding.mapping?.observedWorkbench&&tool.effect!=='read')throw Error('组件来源的只读授权已变化')
   if(options.integrations.store.snapshot().connections[request.connectionId]?.config.type==='mcp')args=normalizeMcpQueryArguments(tool.inputSchema,args)
   if(!ajv.validate<Record<string,unknown>>(tool.inputSchema,args))throw Error('刷新请求参数不符合接口定义')
   return options.integrations.execute({callId:randomUUID(),toolId:request.toolId,connectionRevision:request.connectionRevision,arguments:args,context:{sessionId:binding.sessionId,rootSessionId:binding.sessionId,workspaceId:binding.workspaceId,ownerAccountId:binding.ownerAccountId,runtimeEpoch:live.runtimeEpoch,unattended:true,taskId:'component-data:'+binding.id}},signal)
  }
 })
 await engine.load()
 const contextTasks=():ScheduledTask[]=>engine.list().filter(b=>b.status==='refreshing').map((b:any)=>({id:'component-data:'+b.id,title:'组件数据刷新',prompt:'按已保存接口映射刷新数据',workspaceId:b.workspaceId,component:{sessionId:b.sessionId,nodeId:b.nodeId,title:'组件',boardTitle:'工作台'},state:b.enabled?'enabled':'paused',createdAt:0,nextRun:b.nextRun,schedule:{frequency:'daily',time:'00:00',timezone:'Asia/Shanghai',weekday:0,date:''},notification:'never',runs:[{id:b.id,status:'running',startedAt:b.lastAttempt??0}],integrationBindings:componentRefreshBindings(b.requests)}))
 // Provider errors may embed URLs, request parameters or plugin credentials.
 // Conversation inspection exposes state, never the saved recipe or raw error.
 const summary=(binding:any)=>({bound:true,nodeId:binding.nodeId,revision:binding.revision,status:binding.status,enabled:binding.enabled,intervalMinutes:binding.intervalMinutes,lastAttempt:binding.lastAttempt,lastSuccess:binding.lastSuccess,successSequence:binding.successSequence,dataAsOf:binding.dataAsOf,error:binding.error?'数据接口刷新失败；原有内容及上次成功记录已保留。':undefined,sourceNames:[...new Set(binding.requests.map((r:any)=>r.sourceName).filter(Boolean))]})
 const request=async(sessionId:string,args:any,control?:ComponentDataControl)=>{
  if(!args||typeof args!=='object')throw Error('数据操作参数无效')
  if(Object.hasOwn(args,'guardId')||Object.hasOwn(args,'signal'))throw Error('数据控制信息不能来自组件操作参数。')
  if(control!==undefined&&(!control||typeof control!=='object'||Object.keys(control).some(key=>!['guardId','signal'].includes(key))||control.guardId!==undefined&&(typeof control.guardId!=='string'||!control.guardId||control.guardId.length>256)||control.signal!==undefined&&!(control.signal instanceof AbortSignal)||!['inspect','configure','refresh'].includes(args.action)))throw Error('数据操作控制参数无效。')
  if((control!==undefined||args.revision!==undefined)&&['configure','refresh'].includes(args.action)&&(!Number.isInteger(args.revision)||args.revision<1))throw Error('组件数据绑定版本无效，请重新读取。')
  const owner=options.owner(),checkAccount=()=>{if(options.owner()!==owner)throw Error('账号已变化，请重新打开后重试。')},checkOwner=()=>{control?.signal?.throwIfAborted();checkAccount()}
  checkOwner()
  // Reading saved state does not execute tools and must remain available for
  // static boards whose original workspace was removed from the sidebar.
  if(args.action==='list'){await sessionIdentity(sessionId,true);checkOwner();return engine.list(sessionId)}
  const rows=engine.list(sessionId),binding=rows.find((b:any)=>b.nodeId===args.nodeId)
  if(control!==undefined&&args.action==='inspect'&&!binding){await sessionIdentity(sessionId,true);checkOwner();return {bound:false,nodeId:args.nodeId,status:'unbound'}}
  const bindingAction=args.action==='bind'||args.action==='bind-generated'
  const recipe=bindingAction?(typeof args.recipe==='string'?JSON.parse(args.recipe):args.recipe):undefined
  const requests=bindingAction?recipe?.requests:binding?.requests
  const builtinOnly=Array.isArray(requests)&&requests.length>0&&requests.every((r:any)=>r?.toolId==='public_data_query')
  const {workspace}=await identity(sessionId,builtinOnly);checkOwner()
  if(args.action==='bind'||args.action==='bind-generated'){
   return engine.bind({...recipe,sessionId,nodeId:args.nodeId,workspaceId:workspace.workspaceId},args.action==='bind-generated'?args.initialSpec:undefined,{preserveSettings:args.action==='bind-generated'})
  }
  if(!binding)throw Error('组件尚未绑定数据接口。请让助手用已调用成功的接口和字段映射设置数据源。')
  if(args.action==='inspect'||control!==undefined&&args.action==='configure'){
   await canvas({...binding,guardId:control?.guardId},'inspect',{ids:[binding.nodeId]},control?.signal);checkOwner()
  }
  if(args.action==='inspect'){
   const current=engine.list(sessionId).find(row=>row.id===binding.id)
   if(!current)throw Error('组件数据绑定已变化，请重新读取。')
   return summary(current)
  }
  if(args.action==='refresh'){
   const result=await engine.refresh(binding.id,false,control!==undefined||args.revision!==undefined?{expectedRevision:args.revision,...control}:undefined);checkOwner()
   return result&&control!==undefined?summary(result):result
  }
  if(args.action==='configure'){
   const result=await engine.configure(binding.id,args.settings,{expectedRevision:args.revision,signal:control?.signal})
   // The engine has persisted this effect. A late cancellation stops later
   // operations, but must not hide the saved settings from the receipt journal.
   checkAccount()
   return control!==undefined?summary(result):result
  }
  throw Error('不支持的数据操作')
 }
 const timer=setInterval(()=>{void engine.tick().catch(()=>{})},5000);timer.unref()
 return {request,contextTasks,engine,dispose:async()=>{clearInterval(timer);await engine.dispose()}}
}
