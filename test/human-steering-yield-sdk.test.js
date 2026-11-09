import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {createRequire} from 'node:module'
const {patchHumanSteeringYield,runHumanSteerableGeneration}=createRequire(import.meta.url)('../scripts/lib/human-steering-yield.mjs')
const {patchMemoryRequestContext}=createRequire(import.meta.url)('../scripts/lib/memory-request-context.mjs')
const clean=[]
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn()})
const human=text=>createUserMessage({source:{kind:'user'},content:[{type:'text',text}]})
const message=text=>[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text},{type:'block-end',index:0,block:{type:'text',text}},{type:'finish',reason:{kind:'stop'}}]
const call=()=>[{type:'block-start',index:0,blockType:'tool-call'},{type:'block-end',index:0,block:{type:'tool-call',id:'read-1',name:'read_fixture',arguments:'{}'}},{type:'finish',reason:{kind:'tool-calls'}}]
async function fixture(stream,execute=async()=>'已取到完整文档'){
 const root=await mkdtemp(join(tmpdir(),'steering-yield-'));await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'),'dir')
 const source=patchHumanSteeringYield(patchMemoryRequestContext(await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js','utf8')))
 await writeFile(join(root,'loop.mjs'),source);const {default:AgentLoop}=await import(pathToFileURL(join(root,'loop.mjs')).href)
 const ctx=new Context(),requests=[],errors=[],tools=[];new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 ctx.on('agent/error',({error})=>errors.push(error.message))
 ctx.tools.register(defineTool({name:'read_fixture',description:'读取测试资料',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>{tools.push(exec);return execute(exec)}}))
 class Adapter extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id,defaultMaxTokens:1000}}async *stream(request){requests.push(request);yield*stream(request,requests.length)}}
 ctx.llm.registerAdapter(['fixture'],new Adapter());const agent=(await ctx.agents.create({sessionId:'steering',agentOptions:{provider:'fixture',model:'fixture',maxTokens:1000}})).agent
 clean.push(async()=>{agent.cancel({kind:'user'});await agent.whenIdle();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
 return{agent,ctx,requests,errors,tools}
}
it('yields an unfinished model stream immediately, retaining completed tool data and claiming the real human once in the same turn',async()=>{
 let waiting=false,aborted=false
 const f=await fixture(async function*(request,n){if(n===1)yield*call();else if(n===2){waiting=true;yield{type:'block-start',index:0,blockType:'tool-call'};await new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>{aborted=true;reject(request.signal.reason)},{once:true}));}else yield*message('已按补充要求继续。')})
 f.agent.followup(human('读取附件并整理'));await expect.poll(()=>waiting).toBe(true)
 const started=performance.now();f.agent.steer(human('改用新附件，先告诉我收到'))
 await expect.poll(()=>f.requests.length,{timeout:1000}).toBe(3);await f.agent.whenIdle()
 expect(performance.now()-started).toBeLessThan(1000);expect(aborted).toBe(true);expect(f.errors).toEqual([]);expect(f.tools).toHaveLength(1)
 const log=f.agent.session.events;expect(log.filter(e=>e.type==='turn/start')).toHaveLength(1);expect(log.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user')).toHaveLength(2)
 expect(log.filter(e=>e.type==='assistant/message'&&e.data.step===2)).toHaveLength(0)
 expect(JSON.stringify(f.requests[2].messages)).toContain('已取到完整文档');expect(JSON.stringify(f.requests[2].messages)).toContain('改用新附件')
 expect(log.findLast(e=>e.type==='turn/end').data.reason.kind).toBe('completed')
})
it('waits for an already dispatched tool safely, then reads steering before the next model request',async()=>{
 let release,inside=false,aborted=false
 const f=await fixture(async function*(_request,n){yield*(n===1?call():message('已按新要求继续'))},async exec=>{inside=true;exec.signal.addEventListener('abort',()=>aborted=true);return new Promise(resolve=>release=()=>resolve('已完成的写入结果'))})
 f.agent.followup(human('执行并保存'));await expect.poll(()=>inside).toBe(true);f.agent.steer(human('补充新的整理要求'))
 expect(aborted).toBe(false);expect(f.requests).toHaveLength(1);release();await f.agent.whenIdle()
 expect(f.requests).toHaveLength(2);expect(JSON.stringify(f.requests[1].messages)).toContain('已完成的写入结果');expect(JSON.stringify(f.requests[1].messages)).toContain('补充新的整理要求');expect(f.errors).toEqual([])
})
it('does not interrupt generation for ordinary queued input or plugin context',async()=>{
 let release,waiting=false,signal
 const f=await fixture(async function*(request,n){if(n===1){signal=request.signal;waiting=true;await new Promise(resolve=>release=resolve)}yield*message('处理完成')})
 f.agent.followup(human('原始请求'));await expect.poll(()=>waiting).toBe(true)
 f.agent.followup(human('正常排队'));f.agent.inject(createUserMessage({source:{kind:'plugin',plugin:'test'},content:[{type:'text',text:'进度上下文'}]}))
 expect(signal.aborted).toBe(false);release();await f.agent.whenIdle();expect(f.errors).toEqual([])
})
it('retains user Stop and provider failures rather than swallowing them as steering',async()=>{
 const controller=new AbortController(),agent={inbox:{nextStep:[]},ctx:{on:()=>()=>{}}};const error=Error('provider failed')
 await expect(runHumanSteerableGeneration(agent,controller.signal,async()=>{throw error})).rejects.toBe(error)
 const stop={kind:'user'};controller.abort(stop);await expect(runHumanSteerableGeneration(agent,controller.signal,async()=>null)).rejects.toBe(stop)
})
it('keeps the memory request seam exact and guards patch idempotence and drift',async()=>{
 const source=patchMemoryRequestContext(await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js','utf8')),one=patchHumanSteeringYield(source)
 expect(patchHumanSteeringYield(one)).toBe(one);expect(patchMemoryRequestContext(one)).toBe(one)
 expect(()=>patchHumanSteeringYield(one.replace('generated === null','generated !== null'))).toThrow('drifted')
})
