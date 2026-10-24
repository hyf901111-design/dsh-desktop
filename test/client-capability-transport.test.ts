import {it,expect} from 'vitest'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge'
import {ClientCapabilityService} from '../src/main/state/client-capability-service'
import {CanvasActionBridge} from '../src/main/state/canvas-action-bridge'
// @ts-expect-error Existing JS canvas protocol has no declaration file.
import {createCanvasActionController} from '../packages/dsh-research-task-runtime/canvas-actions.js'
import {registerClientTools} from '../packages/dsh-research-task-runtime/client-tools.js'
import {Context} from '@deepseek-ai/cordis'
import {SessionId,SessionStore} from '@deepseek-ai/dsh-session'
it('transports Harness semantic actions through the authenticated Main endpoint and actual canvas CAS/undo engine',async()=>{
 let state:any={files:[],artifacts:[{id:'n',title:'Original',kind:'generated-container',x:100,y:100,width:320,height:220}],selection:{selectedNodeIds:['n'],orderedFileIds:[]}},prior:any,flushes=0,zoom=0
 const engine=createCanvasActionController({snapshot:()=>state,canWrite:()=>true,describe:()=>({title:{type:'string'}}),validate:(node:any)=>node,arrange:(value:any)=>value,commit:async(next:any,before:any)=>{prior=before;state=next},undo:async()=>{state=prior;return true},flush:async()=>{flushes++}})
 const cancelled=new Set<string>();let bridge:CanvasActionBridge
 bridge=new CanvasActionBridge({canRead:id=>id==='s',send:(value:any)=>{if(value.cancel){cancelled.add(value.requestId);return}Promise.resolve((engine as any)[value.method](value.args,{isCancelled:()=>cancelled.has(value.requestId)})).then(result=>bridge.respond({requestId:value.requestId,sessionId:value.sessionId,result}),error=>bridge.respond({requestId:value.requestId,sessionId:value.sessionId,error:error.message}))}})
 bridge.bind({sessionId:'s',selectedIds:['n']})
 const service=new ClientCapabilityService({owner:()=> 'alice',canRead:id=>id==='s',scheduled:()=>false,send:()=>{},canvasAvailable:id=>bridge.isAvailable(id),canvas:(sessionId,method,args,signal)=>bridge.execute({sessionId,method,args},signal),window:async(action)=>{if(action==='zoom-in')zoom+=.5;return{zoomLevel:zoom}}})
 service.bind({sessionId:'s',mode:'research',active:true})
 const endpoint=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,clientCapability:(value,signal)=>service.request(value,signal)})
 const address=await endpoint.start(),tools=new Map<string,any>(),dispose=registerClientTools({tools:{register:(tool:any)=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:address.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:address.token}})
 const exec={agent:{session:{id:'s',header:{},events:[{type:'turn/start',data:{turn:1}}]}},signal:new AbortController().signal}
 const call=async(capability:string,args:any,requestId=capability)=>JSON.parse(await tools.get('client_action').execute({requestId,capability,arguments:args},exec))
 try{
  expect(JSON.parse(await tools.get('client_capabilities').execute({},exec)).mode).toBe('research')
  const read=await call('canvas.inspect',{});expect(read.data.nodes[0].id).toBe('n')
  const applied=await call('canvas.apply',{revision:read.data.revision,operations:[{op:'update',id:'n',fields:{title:'Updated'}}]})
  expect(applied).toMatchObject({status:'succeeded',data:{status:'applied'}});expect(state.artifacts[0].title).toBe('Updated');expect(flushes).toBe(1)
  expect(await call('canvas.apply',{revision:read.data.revision,operations:[{op:'update',id:'n',fields:{title:'Updated'}}]})).toEqual(applied);expect(flushes).toBe(1)
  const undo=await call('canvas.undo',{revision:applied.data.revision,actionId:applied.data.actionId});expect(undo.status).toBe('succeeded');expect(state.artifacts[0].title).toBe('Original')
  expect((await call('ui.zoom.in',{})).data.zoomLevel).toBe(.5)
  const omitted={requestId:'optional-empty-arguments',capability:'ui.zoom.in'}
  expect(JSON.parse(await tools.get('client_action').execute(omitted,exec)).data.zoomLevel).toBe(1)
  expect((await call('ui.zoom.in',{},omitted.requestId)).data.zoomLevel).toBe(1);expect(zoom).toBe(1)
  const missingRequired=JSON.parse(await tools.get('client_action').execute({requestId:'missing-required-mode',capability:'ui.mode.set'},exec))
  expect(missingRequired.status).toBe('failed');expect(zoom).toBe(1)
  const denied=await fetch(address.url+'/client-capabilities',{method:'POST',headers:{authorization:'Bearer '+address.token,origin:'https://attacker.invalid','content-type':'application/json'},body:JSON.stringify({sessionId:'s',turnId:'1',method:'catalog'})});expect(denied.status).toBe(403)
 }finally{dispose();service.dispose();bridge.dispose();await endpoint.stop()}
})

it('admits a real SDK user fork only through its own visible binding, not its parent or a delegated/scheduled session',async()=>{
 const ctx=new Context(),sessions=new SessionStore(ctx),parent=sessions.create(SessionId('parent')),fork=sessions.fork(parent,undefined,SessionId('visible-fork'))
 fork.append('turn/start',{turn:1})
 const child=sessions.create(SessionId('delegated-child'),{meta:{parentSession:parent.id,origin:'subagent',delegationDepth:1}});child.append('turn/start',{turn:1})
 let scheduled=false,mutations=0
 const service=new ClientCapabilityService({owner:()=> 'alice',canRead:()=>true,scheduled:()=>scheduled,send:()=>{},canvasAvailable:()=>false,canvas:async()=>{throw Error('not used')},window:async()=>{mutations++;return{zoomLevel:.5}}})
 service.bind({sessionId:parent.id,mode:'conversation',active:true})
 const endpoint=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,clientCapability:(value,signal)=>service.request(value,signal)})
 const address=await endpoint.start(),tools=new Map<string,any>(),dispose=registerClientTools({tools:{register:(tool:any)=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:address.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:address.token}})
 const execution=(session:any)=>({agent:{session},signal:new AbortController().signal})
 try{
  expect(fork.header).toMatchObject({parentSession:parent.id,seedLength:0});expect(fork.header.origin).toBeUndefined();expect(fork.header.delegationDepth).toBeUndefined()
  await expect(tools.get('client_capabilities').execute({},execution(fork))).rejects.toThrow('未绑定')
  service.bind({sessionId:fork.id,mode:'conversation',active:true})
  expect(JSON.parse(await tools.get('client_capabilities').execute({},execution(fork))).mode).toBe('conversation')
  const receipt=JSON.parse(await tools.get('client_action').execute({requestId:'fork-zoom',capability:'ui.zoom.in',arguments:{}},execution(fork)))
  expect(receipt.status).toBe('succeeded');expect(mutations).toBe(1)
  // A child sharing the exact lineage is still refused, even if it has an active UI binding.
  service.bind({sessionId:child.id,mode:'conversation',active:true})
  await expect(tools.get('client_capabilities').execute({},execution(child))).rejects.toThrow('主会话');expect(mutations).toBe(1)
  service.bind({sessionId:fork.id,mode:'conversation',active:true})
  scheduled=true
  await expect(tools.get('client_capabilities').execute({},execution(fork))).rejects.toThrow('未绑定')
  expect(()=>service.bind({sessionId:fork.id,mode:'conversation',active:true})).toThrow('不可用');expect(mutations).toBe(1)
 }finally{dispose();service.dispose();await endpoint.stop();await ctx.fiber.dispose()}
})
it('returns a verified saved conversation receipt when cancellation arrives after RPC JSON acknowledgement',async()=>{
 for(const corrupt of [false,true]){
  const controller=new AbortController(),tools=new Map<string,any>()
  const receipt={requestId:'saved',capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved',componentId:'c'},data:{renderManifest:{version:1,kind:'conversation-component',componentId:corrupt?'wrong':'c',sessionId:'s',turnId:'1',requestId:'saved',status:'ready'}},message:'已保存模拟组件。'}
  const dispose=registerClientTools({tools:{register:(tool:any)=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'simulated-token'},fetch:async()=>({ok:true,json:async()=>{controller.abort();return receipt}}) as Response})
  const exec={agent:{session:{id:'s',header:{},events:[{type:'turn/start',data:{turn:1}}]}},signal:controller.signal}
  try{
   const result=tools.get('client_action').execute({requestId:'saved',capability:'conversation.components.create',arguments:{artifact:{version:1,type:'markdown',title:'模拟',content:'模拟正文'}}},exec)
   if(corrupt)await expect(result).rejects.toThrow()
   else expect(JSON.parse(await result)).toEqual(receipt)
  }finally{dispose()}
 }
})
it('keeps a committed cancellation effect bound to the exact SDK execution token',async()=>{
 const tools=new Map<string,any>(),controller=new AbortController(),token=Symbol('saved-execution'),other=Symbol('different-execution')
 const receipt={requestId:'saved',capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved',componentId:'c'},data:{renderManifest:{version:1,kind:'conversation-component',componentId:'c',sessionId:'s',turnId:'1',requestId:'saved',status:'ready'}}}
 const dispose=registerClientTools({tools:{register:(tool:any)=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'simulated-token'},fetch:async()=>({ok:true,json:async()=>receipt}) as Response})
 const exec={agent:{session:{id:'s',header:{},events:[{type:'turn/start',data:{turn:1}}]}},signal:controller.signal,token}
 try{
  const tool=tools.get('client_action'),args={requestId:'saved',capability:'conversation.components.create',arguments:{artifact:{version:1,type:'markdown',title:'模拟',content:'模拟正文'}}}
  await tool.execute(args,exec);controller.abort()
  expect(tool.finalizeContent({...exec,token:other},{isError:true})).toBeUndefined()
  const content=tool.finalizeContent(exec,{isError:true})
  expect(JSON.parse(content[0].text)).toMatchObject({cancelledAfterSave:true,message:'组件已保存，后续操作已取消。',effect:{componentId:'c'}})
  expect(tool.finalizeContent(exec,{isError:true})).toBeUndefined()
 }finally{dispose()}
})
