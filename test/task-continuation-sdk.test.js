import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile,symlink,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Jobs from '@deepseek-ai/dsh-jobs-local'
import {apply as jobTools} from '@deepseek-ai/dsh-tool-jobs'
import {legacyTaskProgressSource} from './fixtures/task-progress-v1.js'
import {patchConversationTurnOrder} from '../scripts/lib/conversation-turn-order.mjs'

// The installer fingerprints Function.toString() bytes. Load the production
// Node module unchanged, as the installer does; Vitest inserts semicolons.
const {patchTaskProgressRuntime}=createRequire(import.meta.url)('../scripts/lib/task-progress-runtime.mjs')

const closes=[]
afterEach(async()=>{for(const close of closes.splice(0).reverse())await close()})
const list=[{content:'读取参考资料',status:'in_progress'},{content:'修复并渲染文稿',status:'pending'},{content:'核验并交付',status:'pending'}]
const text=value=>({text:value})
const call=(name,args)=>({name,args})
const todo=done=>call('todo_write',{todos:list.map(item=>({...item,status:done?'completed':item.status}))})

// Project a real AgentLoop journal through the installed SDK assembler and the
// production compact function. Plugin notices must stay context, not humans.
async function projectNativeJournal(log){
 const require=createRequire(import.meta.url),window=new Window({url:'https://chat-reliability.test'}),descriptors=[]
 closes.push(()=>window.happyDOM.abort());window.__ModuleLoader__={load:value=>descriptors.push(value)}
 const context=vm.createContext({window,document:window.document,console,setTimeout,clearTimeout,queueMicrotask,AbortController,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout})
 vm.runInContext(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),context)
 const source=patchConversationTurnOrder(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 vm.runInContext(source.replace('exports.apply = apply;','exports.apply = apply;exports.__register=registerConversationNodes;exports.__flow=compactConversationFlow;'),context)
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const modules=id=>id==='react'?require('react'):id==='react/jsx-runtime'?require('react/jsx-runtime'):id==='react-dom'?require('react-dom'):id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake
 const rt=descriptors[0].factory(modules),native=descriptors[1].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),ctx={get:()=>undefined,reflect:{provide(){}},effect:fn=>fn()??(()=>{})},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx)
 native.__register({...ctx,conversationEvents:events,conversationViews:views})
 const session=new rt.SessionRuntime(ctx,{},{},{events,views}).manager.get('task-continuation')
 session.openState='open';session.installWindow(log.map(event=>({event})),false)
 const chat=session.getSnapshot().chat,flow=native.__flow(chat.order,chat.nodes,null)
 return {flow,nodes:chat.order.map(key=>({key,kind:chat.nodes.get(key).kind,anchorSeq:chat.nodes.get(key).anchorSeq}))}
}

async function fixture(script,{legacy=false,failOnce=false,failAlways=false,permissionDenied=false,conclude=false,jobs=false}={}){
 const root=await mkdtemp(join(tmpdir(),'ework-task-continuation-sdk-')),ctx=new Context(),requests=[],work=[],errors=[]
 await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'))
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8'),source=legacy?legacyTaskProgressSource(original):patchTaskProgressRuntime(original)
 await writeFile(join(root,'todo.mjs'),source)
 const {apply}=await import(pathToFileURL(join(root,'todo.mjs')).href)
 new SessionStore(ctx);new Persistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1});new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 if(jobs){new Jobs(ctx,{maxConcurrentJobsPerOwner:4});jobTools(ctx,{})}
 apply(ctx,{allowParallelInProgress:false})
 if(permissionDenied)ctx.on('tools/pre-execute',async exec=>exec.name==='work_stage'?{kind:'deny',reason:'需要用户授权才能修改此文件。'}:{kind:'allow'})
 ctx.on('agent/error',({error})=>errors.push(error.message))
 let attempts=0,jobId,releaseJob,jobFinished=false
 const startJob=owner=>{if(jobId)throw Error('duplicate job start');jobId=ctx.jobs.start({kind:'guard',label:'渲染文稿',owner,run:()=>({cancel:()=>{jobFinished=true;releaseJob?.({status:'killed'})},done:new Promise(resolve=>{releaseJob=value=>{jobFinished=true;resolve(value??{status:'completed',detail:'exit code: 0'})}}),readOutput:()=>jobFinished?'render verified':'render still running'})});return jobId}
 ctx.tools.register(defineTool({name:'work_stage',description:'执行当前任务的下一项真实检查',parameters:{stage:{type:'string',required:true}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>{
  attempts++
  if(failAlways||failOnce&&attempts===1)throw Object.assign(Error('render font unavailable; attempt '+attempts),{code:'FONT_NOT_FOUND'})
  work.push(args.stage)
  if(args.stage==='start-background')return 'started background job '+startJob(exec.agent)
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
 return{ctx,agent,run,disk,requests,work,errors,source,startJob:()=>startJob(agent),releaseJob:()=>releaseJob?.(),get jobId(){return jobId}}
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
it('retains pending work and durably waits for a real permission denial without automatically retrying that action',async()=>{
 const f=await fixture(n=>[todo(false),call('work_stage',{stage:'modify-protected-file'}),text('需要授权后才能继续修改。')][n-1],{permissionDenied:true});await f.run()
 const events=await f.disk()
 expect(f.requests).toHaveLength(3);expect(f.work).toEqual([])
 expect(events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
 expect(events.findLast(e=>e.type==='user/message').data.source.summary).toBe('等待授权或条件')
})
it('keeps a real current job waiting without model polling or false completion, then collects it and delivers once',async()=>{
 const f=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),text('渲染已启动。'),text('独立检查已整理，等待渲染结果。'),call('job_output',{job_id:'guard-1'}),todo(true),text('渲染已核验并交付。')][n-1],{jobs:true})
 const done=f.run()
 await expect.poll(()=>f.requests.length).toBe(4)
 expect(f.agent.status).toBe('running');expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'running',reported:false})
 await new Promise(resolve=>setTimeout(resolve,25))
 expect(f.requests).toHaveLength(4);expect(f.agent.session.events.some(e=>e.type==='turn/end')).toBe(false)
 f.releaseJob();await done
 expect(f.errors).toEqual([]);expect(f.work).toEqual(['start-background']);expect(f.requests).toHaveLength(7)
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'completed',reported:true})
})
it('reproduces v1 marking a task complete while its actual owned background render is still running',async()=>{
 const f=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),text('渲染已启动，稍后核验。'),text('等待渲染结果。')][n-1],{jobs:true,legacy:true});await f.run()
 expect(f.requests).toHaveLength(4);expect(f.work).toEqual(['start-background'])
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'running',reported:false})
 expect(f.agent.session.events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
})
it('allows a verified ready long-lived service to finish setup without waiting for its exit, while excluding unrelated old jobs',async()=>{
 const daemon=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),call('job_output',{job_id:'guard-1'}),todo(true),text('服务已就绪，保持后台运行。')][n-1],{jobs:true});await daemon.run('启动服务，确认就绪即可。')
 expect(daemon.requests).toHaveLength(5);expect(daemon.ctx.jobs.get(daemon.jobId,daemon.agent).status).toBe('running')
 const old=await fixture(n=>n===1?todo(false):text('未取得新进展。'),{jobs:true});old.startJob();await old.run('只做当前独立任务。')
 expect(old.requests).toHaveLength(4);expect(old.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(old.ctx.jobs.get(old.jobId,old.agent)).toMatchObject({status:'running',reported:false})
})
it('rebinds a prior owned job only after this human turn actually reads that same job and waits for its result',async()=>{
 const f=await fixture(n=>[todo(false),call('job_output',{job_id:'guard-1'}),text('继续等待刚才的渲染。'),text('其他核验已完成，等待结果。'),call('job_output',{job_id:'guard-1'}),todo(true),text('已核验并交付。')][n-1],{jobs:true});f.startJob()
 const done=f.run('继续完成上一次未完成的任务。')
 await expect.poll(()=>f.requests.length).toBe(4);expect(f.agent.status).toBe('running')
 f.releaseJob();await done
 expect(f.requests).toHaveLength(7);expect(f.work).toEqual([]);expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
})
it('cancels the observation on a user stop and does not auto-resume from the later real job notification',async()=>{
 const f=await fixture(n=>n===1?todo(false):n===2?call('work_stage',{stage:'start-background'}):text('等待渲染。'),{jobs:true})
 const done=f.run();await expect.poll(()=>f.requests.length).toBe(4)
 f.agent.cancel({kind:'user'});await done
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('aborted')
 f.releaseJob();await f.ctx.jobs.wait(f.jobId,1000,f.agent);await f.agent.whenIdle()
 expect(f.requests).toHaveLength(4);expect(f.agent.session.events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
})
it('lets a new human steering request interrupt the old observation promptly without reusing its checklist scope',async()=>{
 const f=await fixture(n=>n===1?todo(false):n===2?call('work_stage',{stage:'start-background'}):text(n<5?'等待渲染。':'只解释现在的状态，不继续旧修改。'),{jobs:true})
 const done=f.run();await expect.poll(()=>f.requests.length).toBe(4)
 f.agent.steer(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'不要继续旧修改，只解释现在状态。'}]}))
 await done
 expect(f.requests).toHaveLength(5);expect(f.ctx.jobs.get(f.jobId,f.agent).status).toBe('running')
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
})
it('keeps one human before real continued work and background notices in the combined native flow, including a late job after User Stop',async()=>{
 const beforeHuman=ctx=>ctx.on('agent/pre-step',async(event,next)=>{const decision=await next();return event.step===1&&decision.messages?.some(message=>message.source?.kind==='user')?{...decision,messages:[createUserMessage({content:[{type:'text',text:'已读取附件PPT上下文'}],source:{kind:'plugin',plugin:'fixture-file-context'}}),...decision.messages]}:decision})
 const inspect=async(f,label)=>{
  await f.ctx.sessions.flush(f.agent.session)
  const journal=await f.disk(),original=JSON.stringify(journal),projection=await projectNativeJournal(journal),humans=projection.nodes.filter(node=>['user','steering'].includes(node.kind)),humanIndex=projection.flow.findIndex(row=>row.key===humans[0]?.key),activityIndices=projection.flow.map((row,index)=>row.kind==='execution'?index:-1).filter(index=>index>=0)
  expect(humans).toHaveLength(1);expect(humanIndex).toBe(0);expect(activityIndices.length).toBeGreaterThan(0);expect(activityIndices.every(index=>index>humanIndex)).toBe(true)
  expect(journal.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user')).toHaveLength(1)
  expect(journal.some(event=>event.type==='user/message'&&event.data.source?.plugin==='sherlock-task-progress')).toBe(true)
  expect(JSON.stringify(journal)).toBe(original)
  return {label,requests:f.requests.length,events:journal,projection,journalUnchanged:true}
 }
 const completed=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),text('渲染已启动。'),text('独立检查已完成，等待后台结果。'),call('job_output',{job_id:'guard-1'}),todo(true),text('文稿已核验并交付。')][n-1],{jobs:true});beforeHuman(completed.ctx)
 const done=completed.run('请保留附件文字，修复文稿并核验后交付。');await expect.poll(()=>completed.requests.length).toBe(4)
 expect(completed.agent.status).toBe('running');expect(completed.ctx.jobs.get(completed.jobId,completed.agent).status).toBe('running')
 const waiting=await inspect(completed,'waiting');completed.releaseJob();await done
 expect(completed.requests).toHaveLength(7);expect(completed.agent.session.events.findLast(event=>event.type==='turn/end').data.reason.kind).toBe('completed')
 const delivered=await inspect(completed,'delivered')
 const stopped=await fixture(n=>n===1?todo(false):n===2?call('work_stage',{stage:'start-background'}):text('等待后台渲染。'),{jobs:true});beforeHuman(stopped.ctx)
 const stoppedRun=stopped.run();await expect.poll(()=>stopped.requests.length).toBe(4);stopped.agent.cancel({kind:'user'});await stoppedRun
 const requestCount=stopped.requests.length;stopped.releaseJob();await stopped.ctx.jobs.wait(stopped.jobId,1000,stopped.agent);await stopped.agent.whenIdle()
 expect(stopped.requests).toHaveLength(requestCount);expect(stopped.agent.session.events.findLast(event=>event.type==='todo/write').data.todos).toEqual(list)
 const late=await inspect(stopped,'stopped-late-job')
 const evidence=process.env.SHERLOCK_CHAT_RELIABILITY_EVIDENCE||'/tmp/sherlock-chat-reliability-20261031';await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'combined-real-journal-cross.json'),JSON.stringify({waiting,delivered,late},null,2))
},20000)
