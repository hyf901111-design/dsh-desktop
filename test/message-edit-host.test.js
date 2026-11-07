import {it,expect} from 'vitest'
import {patchMessageEditClient} from '../scripts/lib/message-edit.mjs'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import {createApiProxy} from '@deepseek-ai/dsh-host-apiproxy'

it('keeps explicit forks separate and resends an edited message through the original host session',async()=>{
 const ctx=new Context(),requests=[],handles=[]
 try{
  new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new SkillRegistry(ctx)
  new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
  class Model extends LlmAdapter{
   async resolveModel(provider,id){return{provider,id,name:id}}
   async listModels(provider){return[{provider,id:'local',name:'Local'}]}
   async *stream(request){requests.push(request);const text='answer-'+requests.length;yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text};yield{type:'block-end',index:0,block:{type:'text',text}};yield{type:'finish',reason:'stop'}}
  }
  ctx.llm.registerAdapter(['edit-fixture'],new Model())
  ctx.provide('workspaceRegistry',{list:()=>[],resolveByPath:async()=>undefined})
  ctx.provide('userQuestions',{registerProvider:()=>()=>{}})
  ctx.provide('settings',{register:()=>({get:()=>({selections:[]}),replace:async()=>{}})})
  const selection={provider:'edit-fixture',model:'local'}
  handles.push(await ctx.agents.create({sessionId:'original',meta:{cwd:'/tmp'},agentOptions:selection}))
  const api=createApiProxy(ctx,{cwd:'/tmp',defaultModelSelection:()=>selection})
  const rpc=payload=>({rpcId:randomUUID(),payload})
  const prompt=async(id,text)=>{
   const before=ctx.sessions.get(id).events.filter(e=>e.type==='turn/end').length
   const response=await api.sessions.prompt(rpc({sessionId:id,content:[{type:'text',text}],mode:'queue'}));expect(response.result.ok).toBe(true)
   await expect.poll(()=>ctx.sessions.get(id).events.filter(e=>e.type==='turn/end').length,{timeout:3000}).toBe(before+1)
  }
  await prompt('original','first question');await prompt('original','second question')
  const original=JSON.stringify(ctx.sessions.get('original').events)
  const messages=ctx.sessions.get('original').events.filter(e=>e.type==='user/message')
  for(const [index,message]of messages.entries()){
   const fork=await api.sessions.fork(rpc({sessionId:'original',beforeMessageSeq:message.seq}));expect(fork.result,JSON.stringify(fork)).toMatchObject({ok:true})
   const child=fork.result.value.sessionId
   await prompt(child,'revised '+index)
   const history=JSON.stringify(requests.at(-1))
   expect(history).toContain('revised '+index);expect(history).not.toContain('second question');expect(history).not.toContain('answer-2')
   if(index===0){expect(history).not.toContain('first question');expect(history).not.toContain('answer-1')}
   else{expect(history).toContain('first question');expect(history).toContain('answer-1')}
   expect(JSON.stringify(ctx.sessions.get('original').events)).toBe(original)
  }
  const native=createRequire(import.meta.url),helpers=native('../scripts/lib/message-edit.mjs')
  const client=patchMessageEditClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  const start=client.indexOf('editMessage: request=>sendMessageRevision('),end=client.indexOf('\nforkAt:',start)
  const binding={getSnapshot:()=>({running:false,queue:[]}),prompt:async(content,mode)=>(await api.sessions.prompt(rpc({sessionId:'original',content,mode}))).result}
  const sessions={binding:id=>{expect(id).toBe('original');return {session:binding}},fork:()=>{throw Error('unexpected fork')},open:()=>{throw Error('unexpected navigation')}}
  const edit=new Function('sessions','sessionId','sendMessageRevision','return ({'+client.slice(start,end)+'}).editMessage')(sessions,'original',helpers.sendMessageRevision)
  const count=ctx.sessions.get('original').events.filter(e=>e.type==='turn/end').length
  await edit({seq:messages[0].seq,content:[{type:'text',text:'first question'}],text:'revised in this conversation'})
  await expect.poll(()=>ctx.sessions.get('original').events.filter(e=>e.type==='turn/end').length,{timeout:3000}).toBe(count+1)
  expect(JSON.stringify(requests.at(-1))).toContain('revised in this conversation')
  expect(JSON.stringify(requests.at(-1))).toContain('second question')
  expect(ctx.sessions.get('original').events.filter(e=>e.type==='user/message').at(-1).data.content).toEqual([{type:'text',text:'revised in this conversation'}])

 }finally{await ctx.fiber.dispose()}
},15000)
