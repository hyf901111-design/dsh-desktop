import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile,symlink,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import vm from 'node:vm'
import {createServer} from 'node:http'
import ShellExecutor from '@deepseek-ai/dsh-shell'
import {ShellEnvRegistry} from '@deepseek-ai/dsh-shell-env'
import {patchBashBackgroundLifecycle} from '../scripts/lib/bash-background-lifecycle.mjs'
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

async function fixture(script,{legacy=false,failOnce=false,failAlways=false,permissionDenied=false,conclude=false,jobs=false,bashService=false}={}){
 const root=await mkdtemp(join(tmpdir(),'ework-task-continuation-sdk-')),ctx=new Context(),requests=[],work=[],errors=[]
 await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'))
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8'),source=legacy?legacyTaskProgressSource(original):patchTaskProgressRuntime(original)
 await writeFile(join(root,'todo.mjs'),source)
 const {apply}=await import(pathToFileURL(join(root,'todo.mjs')).href)
 new SessionStore(ctx);new Persistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1});new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 let server,serviceUrl
 if(jobs){new Jobs(ctx,{maxConcurrentJobsPerOwner:4});jobTools(ctx,{})}
 if(bashService){
  server=createServer((_req,res)=>{res.writeHead(200);res.end('service healthy')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));serviceUrl='http://127.0.0.1:'+server.address().port
  new ShellEnvRegistry(ctx)
  class ReadyServiceShell extends ShellExecutor{
   resolve(request){return request}
   start(){let settle,read=false;const proc={status:'running',exitCode:null,signal:null,done:new Promise(resolve=>settle=resolve),readOutput:()=>({delta:read?'':(read=true,'HTTP service listening at '+serviceUrl),lossy:false}),kill(){if(proc.status!=='running')return false;proc.status='killed';proc.signal='SIGTERM';settle();return true}};return proc}
  }
  new ReadyServiceShell(ctx)
  await writeFile(join(root,'bash.mjs'),patchBashBackgroundLifecycle(await readFile('node_modules/@deepseek-ai/dsh-tool-bash/lib/index.js','utf8')))
  const bash=await import(pathToFileURL(join(root,'bash.mjs')).href);bash.apply(ctx,{})
 }
 apply(ctx,{allowParallelInProgress:false})
 if(permissionDenied)ctx.on('tools/pre-execute',async exec=>exec.name==='work_stage'?{kind:'deny',reason:'需要用户授权才能修改此文件。'}:{kind:'allow'})
 ctx.on('agent/error',({error})=>errors.push(error.message))
 let attempts=0,jobId,releaseJob,jobFinished=false
 const startJob=owner=>{if(jobId)throw Error('duplicate job start');jobId=ctx.jobs.start({kind:'guard',label:'渲染文稿',owner,run:()=>({cancel:()=>{jobFinished=true;releaseJob?.({status:'killed'})},done:new Promise(resolve=>{releaseJob=value=>{jobFinished=true;resolve(value??{status:'completed',detail:'exit code: 0'})}}),readOutput:()=>jobFinished?'render verified':'render still running'})});return jobId}
 ctx.tools.register(defineTool({name:'work_stage',description:'执行当前任务的下一项真实检查',parameters:{stage:{type:'string',required:true}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>{
  attempts++
  if(failAlways||failOnce&&attempts===1)throw Object.assign(Error('render font unavailable; attempt '+attempts),{code:'FONT_NOT_FOUND'})
  work.push(args.stage)
  if(args.stage==='verify-service'){const response=await fetch(serviceUrl);if(response.status!==200||await response.text()!=='service healthy')throw Error('service not ready');return 'verified current service HTTP 200 at '+serviceUrl}
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
 closes.push(async()=>{await ctx.fiber.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await rm(root,{recursive:true,force:true})})
 return{ctx,agent,run,disk,requests,work,errors,source,startJob:()=>startJob(agent),releaseJob:result=>releaseJob?.(result),get jobId(){return jobId??ctx.jobs?.list(agent).find(job=>job.kind==='bash-service')?.id}}
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
it('durably blocks a no-checklist task with an owned live job after a permission denial without retrying the denied action',async()=>{
 const f=await fixture(n=>[call('work_stage',{stage:'start-background'}),call('work_stage',{stage:'modify-protected-file'}),text('修改受到权限限制，后台渲染仍未交付。')][n-1],{jobs:true})
 f.ctx.on('tools/pre-execute',async exec=>exec.name==='work_stage'&&exec.arguments?.stage==='modify-protected-file'?{kind:'deny',reason:'需要用户授权。'}:{kind:'allow'})
 await f.run('启动渲染并修复文件，核验后交付。')
 expect(f.requests).toHaveLength(3);expect(f.work).toEqual(['start-background'])
 expect(f.ctx.jobs.get(f.jobId,f.agent).status).toBe('running')
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(f.agent.session.events.findLast(e=>e.type==='user/message').data.source.summary).toBe('等待授权或条件')
})
it.each(['absent','prematurely-completed','prematurely-completed-read-running','completed-after-reading-running'])('keeps the current owned finite job pending and collects it before completion when the checklist is %s',async checklist=>{
 const outputs=checklist==='completed-after-reading-running'?[todo(false),call('work_stage',{stage:'start-background'}),call('job_output',{job_id:'guard-1'}),todo(true),text('有限任务仍在运行，不能当作已交付。'),text('等待有限任务终态。'),call('job_output',{job_id:'guard-1'}),text('已核验最终结果并交付。')]:checklist==='absent'
  ? [call('work_stage',{stage:'start-background'}),text('渲染已启动，接下来核验。'),text('等待本次渲染完成。'),call('job_output',{job_id:'guard-1'}),text('已读取最终渲染结果并交付。')]
  : [todo(true),call('work_stage',{stage:'start-background'}),...(checklist==='prematurely-completed-read-running'?[call('job_output',{job_id:'guard-1'})]:[]),text('清单已提前完成，但渲染尚未结束。'),text('等待本次渲染完成。'),call('job_output',{job_id:'guard-1'}),text('已读取最终渲染结果并交付。')]
 const f=await fixture(n=>outputs[n-1]??text('unexpected additional model request'),{jobs:true}),done=f.run()
 await expect.poll(()=>f.requests.length,{timeout:1000}).toBe(checklist==='absent'?3:checklist==='prematurely-completed'?4:checklist==='prematurely-completed-read-running'?5:6)
 expect(f.agent.status).toBe('running');expect(f.agent.session.events.some(e=>e.type==='turn/end')).toBe(false)
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'running',reported:false})
 f.releaseJob();await done
 expect(f.errors).toEqual([]);expect(f.work).toEqual(['start-background']);expect(f.requests).toHaveLength(outputs.length)
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'completed',reported:true})
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.agent.session.events.filter(e=>e.type==='user/message'&&e.data.source.kind==='user')).toHaveLength(1)
})
it.each(['completed','failed','killed'])('collects an owned finite job that already %s before a no-checklist final, rather than trusting its terminal notification',async status=>{
 let f
 f=await fixture(async n=>{
  if(n===1)return call('work_stage',{stage:'start-background'})
  if(n===2){f.releaseJob({status,detail:status==='completed'?'exit code: 0':'render '+status});await f.ctx.jobs.wait(f.jobId,1000,f.agent);return text('后台已终态，尚未读取最终输出。')}
  return [text('仍需读取终态结果，不能以通知代替收集。'),call('job_output',{job_id:'guard-1'}),text(status==='completed'?'已读取完成输出并核验最终交付。':'已读取最终输出；本次渲染'+status+'，未生成最终成果。')][n-3]??text('unexpected extra request')
 },{jobs:true})
 await f.run('只执行一次渲染并报告真实最终状态；失败或被终止时明确报告，不重复执行。')
 expect(f.errors).toEqual([]);expect(f.requests).toHaveLength(5)
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status,reported:true})
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.agent.session.events.filter(e=>e.type==='user/message'&&e.data.source.plugin==='sherlock-task-progress').length).toBeGreaterThanOrEqual(2)
 expect(f.agent.session.events.findLast(e=>e.type==='assistant/message').data.message.content[0].text).toContain(status==='completed'?'交付':status)
})
it('bounds an explicitly reread unknown prior job without a checklist and gives a usable follow-up instead of a nonexistent checklist button',async()=>{
 const f=await fixture(n=>n===1?call('job_output',{job_id:'guard-1'}):text('旧后台任务尚未结束，需要确认真实状态。'),{jobs:true});f.startJob()
 await f.run('查看上次任务的输出并说明能否交付。')
 expect(f.errors).toEqual([]);expect(f.requests).toHaveLength(4)
 expect(f.ctx.jobs.get(f.jobId,f.agent).status).toBe('running')
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 const notice=f.agent.session.events.findLast(e=>e.type==='user/message').data.content[0].text
 expect(notice).toContain('可直接发送“继续”');expect(notice).not.toContain('点击')
 expect(f.agent.session.events.some(e=>e.type==='todo/write')).toBe(false)
})
it('reproduces v1 marking a task complete while its actual owned background render is still running',async()=>{
 const f=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),text('渲染已启动，稍后核验。'),text('等待渲染结果。')][n-1],{jobs:true,legacy:true});await f.run()
 expect(f.requests).toHaveLength(4);expect(f.work).toEqual(['start-background'])
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({status:'running',reported:false})
 expect(f.agent.session.events.findLast(e=>e.type==='todo/write').data.todos).toEqual(list)
})
it('allows a verified ready long-lived service to finish setup without waiting for its exit, while excluding unrelated old jobs',async()=>{
 const daemon=await fixture(n=>[todo(false),call('bash',{command:'fixture-http-service',description:'启动本次请求的常驻HTTP服务',run_in_background:true,background_kind:'service'}),call('job_output',{job_id:'bash-service-1'}),call('work_stage',{stage:'verify-service'}),todo(true),text('已读取启动输出并核验HTTP 200；服务已就绪，保持后台运行。')][n-1],{jobs:true,bashService:true});await daemon.run('启动服务，确认就绪即可，保持后台运行。')
 expect(daemon.errors).toEqual([]);expect(daemon.requests).toHaveLength(6);expect(daemon.work).toEqual(['verify-service']);expect(daemon.ctx.jobs.get(daemon.jobId,daemon.agent)).toMatchObject({status:'running',kind:'bash-service'})
 const old=await fixture(n=>n===1?todo(false):text('未取得新进展。'),{jobs:true});old.startJob();await old.run('只做当前独立任务。')
 expect(old.requests).toHaveLength(4);expect(old.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(old.ctx.jobs.get(old.jobId,old.agent)).toMatchObject({status:'running',reported:false})
})
it('rejects service intent without an explicit background launch at the real bash validation seam and creates no fake ready job',async()=>{
 const f=await fixture(n=>n===1?call('bash',{command:'fixture-http-service',description:'invalid foreground service',background_kind:'service'}):text('启动参数已拒绝，没有创建后台服务。'),{jobs:true,bashService:true});await f.run('检查一次服务参数并报告结果。')
 expect(f.requests).toHaveLength(2);expect(f.ctx.jobs.list(f.agent)).toEqual([])
 expect(f.agent.session.events.findLast(e=>e.type==='tool/result').data.message.content[0].isError).toBe(true)
})
it.each(['unread','no-later-milestone'])('durably blocks an explicitly long-lived service with %s readiness evidence instead of waiting forever or claiming completion',async readiness=>{
 const outputs=[todo(true),call('bash',{command:'fixture-http-service',description:'启动显式常驻HTTP服务',run_in_background:true,background_kind:'service'}),...(readiness==='no-later-milestone'?[call('job_output',{job_id:'bash-service-1'})]:[])]
 const f=await fixture(n=>outputs[n-1]??text('服务尚未核验，不能确认最终成果。'),{jobs:true,bashService:true});await f.run('启动服务并验证就绪，不能只启动后结束。')
 expect(f.errors).toEqual([]);expect(f.requests.length).toBeLessThanOrEqual(outputs.length+3)
 expect(f.ctx.jobs.get(f.jobId,f.agent)).toMatchObject({kind:'bash-service',status:'running'})
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('blocked')
 expect(f.agent.session.events.findLast(e=>e.type==='user/message').data.content[0].text).toContain('后台工作仍在运行')
})
it('keeps unrelated prior and other-session jobs out of a simple no-checklist answer',async()=>{
 const prior=await fixture(()=>text('只回答当前问题，不继续旧任务。'),{jobs:true});prior.startJob();await prior.run('解释当前状态即可，不改旧任务。')
 expect(prior.requests).toHaveLength(1);expect(prior.ctx.jobs.get(prior.jobId,prior.agent).status).toBe('running')
 const other=await fixture(()=>text('当前问题已回答。'),{jobs:true}),foreign=(await other.ctx.agents.create({sessionId:'other-owner',agentOptions:{provider:'fixture',model:'fixture',maxTokens:1000}})).agent
 let release;const id=other.ctx.jobs.start({kind:'render',label:'其他会话渲染',owner:foreign,run:()=>({cancel:()=>release({status:'killed'}),done:new Promise(resolve=>release=resolve),readOutput:()=>''})})
 await other.run('只回答当前独立问题。');expect(other.requests).toHaveLength(1);expect(other.ctx.jobs.get(id,foreign).status).toBe('running')
})
it('cancels a no-checklist owned-job observation on explicit User Stop and never wakes model work from its late result',async()=>{
 const f=await fixture(n=>n===1?call('work_stage',{stage:'start-background'}):text('等待本次渲染结果。'),{jobs:true}),done=f.run()
 await expect.poll(()=>f.requests.length).toBe(3);f.agent.cancel({kind:'user'});await done
 expect(f.agent.session.events.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('aborted')
 f.releaseJob();await f.ctx.jobs.wait(f.jobId,1000,f.agent);await f.agent.whenIdle();expect(f.requests).toHaveLength(3)
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
  // This fixture persists uncompressed, unpacked JSONL with a leading header.
  // The live persistence service correctly refuses to reopen an open turn;
  // read only event records and verify them against the actual live journal.
  const journal=(await f.disk()).filter(event=>Number.isSafeInteger(event.seq))
  expect(journal).toEqual(f.agent.session.events)
  if(f.agent.status!=='running')expect((await f.ctx.sessionPersistence.load(f.agent.id)).events).toEqual(journal)
  const original=JSON.stringify(journal),projection=await projectNativeJournal(journal),humans=projection.nodes.filter(node=>['user','steering'].includes(node.kind)),humanIndex=projection.flow.findIndex(row=>row.key===humans[0]?.key),activityIndices=projection.flow.map((row,index)=>row.kind==='execution'?index:-1).filter(index=>index>=0)
  expect(humans).toHaveLength(1);expect(humanIndex).toBe(0);expect(activityIndices.length).toBeGreaterThan(0);expect(activityIndices.every(index=>index>humanIndex)).toBe(true)
  expect(journal.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user')).toHaveLength(1)
  expect(journal.some(event=>event.type==='user/message'&&event.data.source?.plugin==='sherlock-task-progress')).toBe(true)
  expect(JSON.stringify(journal)).toBe(original)
  return {label,requests:f.requests.length,events:journal,projection,journalUnchanged:true}
 }
 const pending=[]
 try{
 const completed=await fixture(n=>[todo(false),call('work_stage',{stage:'start-background'}),text('渲染已启动。'),text('独立检查已完成，等待后台结果。'),call('job_output',{job_id:'guard-1'}),todo(true),text('文稿已核验并交付。')][n-1],{jobs:true});beforeHuman(completed.ctx)
 const done=completed.run('请保留附件文字，修复文稿并核验后交付。');pending.push([completed,done]);await expect.poll(()=>completed.requests.length).toBe(4)
 expect(completed.agent.status).toBe('running');expect(completed.ctx.jobs.get(completed.jobId,completed.agent).status).toBe('running')
 const waiting=await inspect(completed,'waiting');completed.releaseJob();await done
 expect(completed.requests).toHaveLength(7);expect(completed.agent.session.events.findLast(event=>event.type==='turn/end').data.reason.kind).toBe('completed')
 const delivered=await inspect(completed,'delivered')
 const stopped=await fixture(n=>n===1?todo(false):n===2?call('work_stage',{stage:'start-background'}):text('等待后台渲染。'),{jobs:true});beforeHuman(stopped.ctx)
 const stoppedRun=stopped.run();pending.push([stopped,stoppedRun]);await expect.poll(()=>stopped.requests.length).toBe(4);stopped.agent.cancel({kind:'user'});await stoppedRun
 const requestCount=stopped.requests.length;stopped.releaseJob();await stopped.ctx.jobs.wait(stopped.jobId,1000,stopped.agent);await stopped.agent.whenIdle()
 expect(stopped.requests).toHaveLength(requestCount);expect(stopped.agent.session.events.findLast(event=>event.type==='todo/write').data.todos).toEqual(list)
 const late=await inspect(stopped,'stopped-late-job')
 const evidence=process.env.SHERLOCK_CHAT_RELIABILITY_EVIDENCE||'/tmp/sherlock-chat-reliability-20261031';await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'combined-real-journal-cross.json'),JSON.stringify({waiting,delivered,late},null,2))
 }finally{for(const [f,run] of pending){if(f.agent.status==='running')f.agent.cancel({kind:'user'});await run}}
},20000)
