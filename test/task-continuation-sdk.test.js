import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import {patchTaskProgressRuntime} from '../scripts/lib/task-progress-runtime.mjs'
import {legacyTaskProgressSource} from './fixtures/task-progress-v1.js'

const closes=[]
afterEach(async()=>{for(const close of closes.splice(0).reverse())await close()})
const list=[{content:'读取参考资料',status:'in_progress'},{content:'修复并渲染文稿',status:'pending'},{content:'核验并交付',status:'pending'}]
const text=value=>({text:value})
const call=(name,args)=>({name,args})
const todo=done=>call('todo_write',{todos:list.map(item=>({...item,status:done?'completed':item.status}))})

async function fixture(script,{legacy=false,failOnce=false,failAlways=false,conclude=false}={}){
 const root=await mkdtemp(join(tmpdir(),'ework-task-continuation-sdk-')),ctx=new Context(),requests=[],work=[],errors=[]
 await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'))
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8'),source=legacy?legacyTaskProgressSource(original):patchTaskProgressRuntime(original)
 await writeFile(join(root,'todo.mjs'),source)
 const {apply}=await import(pathToFileURL(join(root,'todo.mjs')).href)
 new SessionStore(ctx);new Persistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1});new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 apply(ctx,{allowParallelInProgress:false})
 ctx.on('agent/error',({error})=>errors.push(error.message))
 let attempts=0
 ctx.tools.register(defineTool({name:'work_stage',description:'执行当前任务的下一项真实检查',parameters:{stage:{type:'string',required:true}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>{
  attempts++
  if(failAlways||failOnce&&attempts===1)throw Object.assign(Error('render font unavailable; attempt '+attempts),{code:'FONT_NOT_FOUND'})
  work.push(args.stage)
  if(conclude)exec.concludeTurn()
  return 'verified '+args.stage
 }}))
 class Adapter extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id,defaultMaxTokens:1000}}
  async *stream(request){
   requests.push(request)
   const output=await script(requests.length,{requests,work,ctx})
   if(output.name){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'call-'+requests.length,name:output.name,arguments:JSON.stringify(output.args)}}}
   else{yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:output.text};yield{type:'block-end',index:0,block:{type:'text',text:output.text}}}
   yield{type:'finish',reason:{kind:output.finish??'stop'}}
  }
 }
 ctx.llm.registerAdapter(['fixture'],new Adapter())
 const agent=(await ctx.agents.create({sessionId:'task-continuation',agentOptions:{provider:'fixture',model:'fixture',maxTokens:1000}})).agent
 const run=async(prompt='修复文稿，核验所有页面后交付最终文件。')=>{agent.followup(createUserMessage({content:[{type:'text',text:prompt}],source:{kind:'user'}}));await agent.whenIdle();await ctx.sessions.flush(agent.session)}
 const disk=async()=>{const file=ctx.sessionPersistence.locate(agent.session.header);return(await readFile(file.path,'utf8')).trim().split('\n').map(line=>JSON.parse(line))}
 closes.push(async()=>{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
 return{ctx,agent,run,disk,requests,work,errors,source}
}
const deliverScript=n=>[todo(false),call('work_stage',{stage:'read'}),text('资料已读，接下来渲染。'),call('work_stage',{stage:'render'}),text('预览已经准备好，继续核验。'),call('work_stage',{stage:'verify-and-deliver'}),todo(true),text('文稿已修复、核验并交付。')][n-1]??text('unexpected additional model request')

it('reproduces the installed v1 premature normal completion after only one reconciliation',async()=>{
 const f=await fixture(deliverScript,{legacy:true});await f.run()
 expect(f.requests).toHaveLength(5);expect(f.work).toEqual(['read','render'])
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.agent.session.events.findLast(e=>e.type==='todo/write').data.todos.some(item=>item.status!=='completed')).toBe(true)
})
it('continues across multiple intermediate finals until the real authorized work and checklist are complete',async()=>{
 const f=await fixture(deliverScript);await f.run()
 expect(f.errors).toEqual([]);expect(f.requests).toHaveLength(8);expect(f.work).toEqual(['read','render','verify-and-deliver'])
 const events=await f.disk()
 expect(events.filter(e=>e.type==='turn/start')).toHaveLength(1)
 expect(events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(events.findLast(e=>e.type==='todo/write').data.todos.every(item=>item.status==='completed')).toBe(true)
 expect(events.filter(e=>e.type==='user/message'&&e.data.source.kind==='user')).toHaveLength(1)
})
it('ends repeated no-progress responses as durable blocked with unfinished work retained, without self-waking on reload or another user goal',async()=>{
 const f=await fixture(n=>n===1?todo(false):text('接下来继续处理。'));await f.run()
 expect(f.errors).toEqual([]);expect(f.requests).toHaveLength(4);expect(f.work).toEqual([])
 const events=await f.disk();expect(events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
 expect(events.findLast(e=>e.type==='user/message').data.source.summary).toBe('任务尚未完成')
 // The persisted native session is reconstructed, not represented by a token.
 const loaded=await f.ctx.sessionPersistence.load(f.agent.id)
 expect(loaded.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(loaded.events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
 expect(f.requests).toHaveLength(4)
 await f.run('取消旧任务，回答当前问题。')
 expect(f.requests).toHaveLength(5)
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
})
it('recovers after one recoverable tool failure and finishes rather than immediately blocking',async()=>{
 const f=await fixture(n=>[todo(false),call('work_stage',{stage:'render'}),text('第一次渲染缺字体，改用可用字体重试。'),call('work_stage',{stage:'render-with-installed-font'}),todo(true),text('渲染检查已通过并交付。')][n-1],{failOnce:true});await f.run()
 expect(f.requests).toHaveLength(6);expect(f.work).toEqual(['render-with-installed-font'])
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.agent.session.events.filter(e=>e.type==='tool/result').some(e=>e.data.message.content[0].isError)).toBe(true)
})
it('does not count changing failure messages as progress and durably blocks repeated unsuccessful recovery with pending work intact',async()=>{
 const f=await fixture(n=>n===1?todo(false):n%2===0?call('work_stage',{stage:'render-attempt-'+n/2}):text('尝试另一种可用的渲染方式。'),{failAlways:true});await f.run()
 expect(f.requests).toHaveLength(7);expect(f.work).toEqual([]);expect(f.errors).toEqual([])
 const events=await f.disk(),results=events.filter(e=>e.type==='tool/result'&&e.data.message.content[0].isError)
 expect(results).toHaveLength(3)
 expect(new Set(results.map(e=>JSON.stringify(e.data.message.content[0].content))).size).toBe(3)
 expect(events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
})
it('does not revive a native concluding tool or an explicit user stop',async()=>{
 const conclude=await fixture(n=>n===1?todo(false):call('work_stage',{stage:'wait-for-human'}),{conclude:true});await conclude.run()
 expect(conclude.requests).toHaveLength(2)
 const cancelled=await fixture(async(n,{ctx})=>{if(n===1)return todo(false);ctx.agents.get('task-continuation').cancel({kind:'user'});return text('不会继续。')});await cancelled.run()
 expect(cancelled.requests).toHaveLength(2);expect(cancelled.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('aborted')
})
