import {it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {ClientCapabilityService} from '../src/main/state/client-capability-service'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge'
import {registerClientTools} from '../packages/dsh-research-task-runtime/client-tools.js'
import {latestClientModeForAuthority,registerConversationComponentsPolicy} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import {registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {conversationComponentReceiptAnchors} from '../scripts/lib/conversation-components.mjs'

for(const phase of ['after-save','before-save'])it(`real SDK loop persists a truthful conversation receipt when cancelled ${phase} across native HTTP fetch`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'conversation-receipt-sdk-')),ctx=new Context(),file=join(root,'components.json'),store=new ConversationComponentStore(file)
 await store.load()
 new SessionStore(ctx);new JsonlPersistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false});new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 let agent,creates=0,receipts=0,requests=0
 const errors=[];ctx.on('agent/error',({error})=>errors.push(error))
 const service=new ClientCapabilityService({owner:()=> 'fixture-owner',canRead:id=>id==='receipt-session',scheduled:()=>false,send:()=>{},canvasAvailable:()=>false,canvas:async()=>{throw Error('no canvas')},window:async()=>({}),conversationComponents:{
  create:async(args,identity,signal,id)=>{
   creates++
   if(phase==='before-save'){
    agent.cancel({kind:'user'})
    if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}))
   }
   signal.throwIfAborted()
   return store.create(args,identity,id,()=>!signal.aborted&&identity.current())
  },recover:(args,identity,id)=>store.recover(args,identity,id)
 }})
 service.bind({sessionId:'receipt-session',mode:'conversation',active:true})
 const endpoint=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,clientCapability:async(value,signal)=>{
  if(value.method==='receipt')receipts++
  const result=await service.request(value,signal)
  if(phase==='after-save'&&value.method==='execute'&&result.status==='succeeded'){
   // The actual store already completed atomic rename. Abort the native socket
   // before the first HTTP JSON acknowledgement becomes available to fetch.
   expect(JSON.parse(await readFile(file,'utf8')).items).toHaveLength(1)
   agent.cancel({kind:'user'})
   await new Promise(resolve=>setTimeout(resolve,30))
  }
  return result
 }})
 const address=await endpoint.start(),disposeTools=registerClientTools(ctx,{env:{SHERLOCK_RESEARCH_CONTEXT_URL:address.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:address.token}}),disposeConversation=registerConversationComponentsPolicy(ctx),disposeWorkbench=registerWorkbenchExecutionPolicy(ctx)
 class Model extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id,defaultMaxTokens:16000,reasoning:{efforts:[{id:'low',name:'Low'},{id:'high',name:'High'}],defaultEffort:'high'}}}
  async *stream(_request){
   requests++
   if(requests===2)expect(latestClientModeForAuthority(agent.session)).toBe('conversation')
   const name=requests===1?'client_capabilities':'client_action',args=requests===1?{}:{requestId:'saved-request',capability:'conversation.components.create',arguments:{artifact:{version:1,type:'markdown',title:'模拟组件',content:'模拟正文'}}}
   yield{type:'block-start',index:0,blockType:'tool-call'}
   yield{type:'block-end',index:0,block:{type:'tool-call',id:'sdk-call-'+requests,name,arguments:JSON.stringify(args)}}
   yield{type:'finish',reason:{kind:'stop'}}
  }
 }
 ctx.llm.registerAdapter(['fixture'],new Model())
 try{
  agent=(await ctx.agents.create({sessionId:'receipt-session',agentOptions:{provider:'fixture',model:'fixture',maxTokens:16000}})).agent
  agent.followup({role:'user',source:{kind:'user'},content:[{type:'text',text:'给我一张模拟组件卡片'}]})
  await agent.whenIdle()
  expect(errors).toEqual([]);expect(creates).toBe(1);expect(receipts).toBe(1);expect(requests).toBe(2)
  const results=agent.session.events.filter((event)=>event.type==='tool/result'),last=results.at(-1).data.message.content[0]
  expect(last.isError,JSON.stringify(last)).toBe(true)
  if(phase==='after-save'){
   const value=JSON.parse(last.content[0].text)
   expect(value.cancelledAfterSave).toBe(true);expect(value.message).toBe('组件已保存，后续操作已取消。')
   expect(value).toMatchObject({requestId:'saved-request',capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved'},data:{renderManifest:{turnId:'1',status:'ready'}}})
   expect(JSON.parse(await readFile(file,'utf8')).items).toHaveLength(1)
  }else{
   expect(last.content[0].text).toContain('aborted');expect(await readFile(file,'utf8').catch(()=>null)).toBeNull()
  }
  expect(agent.session.events.findLast((event)=>event.type==='turn/end')?.data.reason.kind).toBe('aborted')
  await ctx.sessions.flush(agent.session)
  const location=ctx.sessionPersistence.locate(agent.session.header),raw=await readFile(location.path,'utf8')
  expect(raw).toContain('tool/result');expect(raw).toContain(phase==='after-save'?'conversation-component':'aborted')
  const diskEvents=raw.trim().split('\n').map(line=>JSON.parse(line)),resultEvent=diskEvents.findLast(event=>event.type==='tool/result'),callEvent=diskEvents.find(event=>event.seq===resultEvent.sourceEventSeqs[0])
  expect(callEvent.type).toBe('tool/call');expect(callEvent.data.callId).toBe(resultEvent.data.message.source.callId)
  const diskResult=resultEvent.data.message.content[0],node={kind:'tool-call',data:{turn:resultEvent.data.turn,root:{kind:'tool-result',call:{name:callEvent.data.name,argsRaw:callEvent.data.arguments},content:diskResult.content,isError:diskResult.isError,error:resultEvent.data.error}}}
  const nodes=new Map([['actual-disk-receipt',node],['actual-aborted-tail',{kind:'turn-error',data:{turn:resultEvent.data.turn}}]])
  const flow=[{kind:'execution',key:'actual-execution:1',turn:resultEvent.data.turn,nodeKeys:['actual-disk-receipt']},{kind:'node',key:'actual-aborted-tail'}]
  const anchors=[...conversationComponentReceiptAnchors(flow,nodes,'receipt-session')]
  if(phase==='after-save')expect(anchors).toEqual([['actual-disk-receipt',[JSON.parse(diskResult.content[0].text).data.renderManifest]]])
  else expect(anchors).toEqual([])
  // Exercise steering invalidation against the real SDK's durable inbox splice.
  agent.inject({role:'user',source:{kind:'user'},content:[{type:'text',text:'改为另一项需求'}]})
  expect(latestClientModeForAuthority(agent.session)).toBeNull()
 }finally{disposeTools();disposeConversation();disposeWorkbench();service.dispose();await ctx.fiber.dispose();await endpoint.stop();await rm(root,{recursive:true,force:true})}
},15000)
