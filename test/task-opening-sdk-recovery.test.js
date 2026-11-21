import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {registerModelTaskReplies} from '../packages/dsh-research-task-runtime/model-task-replies.js'
import {registerFirstResponseEffort} from '../packages/dsh-research-task-runtime/first-response-effort.js'
import sample from './fixtures/task-opening-deepseek-public.json'
const require=createRequire(import.meta.url)
const {patchHumanSteeringYield}=require('../scripts/lib/human-steering-yield.mjs')
const {patchMemoryRequestContext}=require('../scripts/lib/memory-request-context.mjs')
const {patchFirstResponseEffort}=require('../scripts/lib/first-response-effort.mjs')
const {boundedTaskOpeningStream,publicTaskOpeningStream}=require('../scripts/lib/task-opening-stream.mjs')
const closing='已核对实际工作簿。'
const intro=sample.deltas.join('').split('\n\n')[0]
const marker='<｜｜DSML｜｜ calls>'
const tool={type:'tool-call',id:'inspect-sheet',name:'inspect_workbook',arguments:'{}'}
const close=()=>({type:'finish',reason:{kind:'stop'}})
function textStream(deltas) {
 return [{type:'block-start',index:0,blockType:'text'},...deltas.map(text=>({type:'text-delta',index:0,text})),
  {type:'block-end',index:0,block:{type:'text',text:deltas.join('')}},close()]
}
const callStream=()=>[{type:'block-start',index:0,blockType:'tool-call'},{type:'block-end',index:0,block:tool},{type:'finish',reason:{kind:'tool-calls'}}]
const cleanup=[]
afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose()})
async function fullTurn(prompt,produce) {
 const folder=await mkdtemp(join(tmpdir(),'sherlock-opening-sdk-'))
 cleanup.push(()=>rm(folder,{force:true,recursive:true}))
 await symlink(join(process.cwd(),'node_modules'),join(folder,'node_modules'),'dir')
 const vendor=await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js','utf8')
 const prior=patchHumanSteeringYield(patchMemoryRequestContext(vendor))
 const upgraded=patchFirstResponseEffort(prior)
 expect(patchFirstResponseEffort(patchHumanSteeringYield(upgraded))===upgraded).toBe(true)
 const modulePath=join(folder,'loop.mjs')
 await writeFile(modulePath,upgraded)
 const {default:AgentLoop}=await import(pathToFileURL(modulePath).href)
 const ctx=new Context(),requests=[],actions=[],errors=[]
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{})
 new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 cleanup.push(()=>ctx.fiber.dispose())
 ctx.on('agent/error',({error})=>errors.push(error.message))
 ctx.tools.register(defineTool({name:'inspect_workbook',description:'读取工作表',parameters:{},
  output:{schema:{type:'string'},render:(_args,data)=>[{type:'text',text:data}]},
  execute:async()=>{actions.push('inspect_workbook');return '工作表包含真实观测日。'}}))
 registerFirstResponseEffort(ctx);registerModelTaskReplies(ctx)
 class Adapter extends LlmAdapter {
  async resolveModel(provider,id){return {provider,id,name:id,defaultMaxTokens:1000}}
  async *stream(req){requests.push(req);yield*produce(requests.length,req)}
 }
 ctx.llm.registerAdapter(['fixture'],new Adapter())
 const {agent}=await ctx.agents.create({sessionId:'native-task-opening',agentOptions:{provider:'fixture',model:'selected',maxTokens:1000}})
 agent.followup(createUserMessage({source:{kind:'user',clientMode:'spreadsheet'},content:[{type:'text',text:prompt}]}))
 await agent.whenIdle()
 return {events:agent.session.events, requests, actions, errors}
}
const endOf=events=>events.findLast(e=>e.type==='turn/end').data.reason
const publicChunks=events=>events.filter(e=>e.type==='assistant/chunk'&&e.data.chunk.type==='text-delta').map(e=>e.data.chunk.text).join('')
it('replays the public DeepSeek wire chunks through the actual steering-enabled SDK and executes the next model step',async()=>{
 const {events,requests,actions,errors}=await fullTurn(sample.request,n=>[textStream(sample.deltas),callStream(),textStream([closing])][n-1])
 expect(errors).toEqual([]);expect(endOf(events)).toEqual({kind:'completed'});expect(requests).toHaveLength(3)
 expect(requests[0].tools??[]).toEqual([]);expect(requests[1].tools.map(t=>t.name)).toContain('inspect_workbook')
 expect(actions).toEqual(['inspect_workbook']);expect(events.filter(e=>e.type==='tool/call').map(e=>e.data.name)).toEqual(actions)
 expect(events.filter(e=>e.type==='tool/result')).toHaveLength(1)
 expect(publicChunks(events)).toContain(intro);expect(publicChunks(events)).toContain(closing)
 expect(JSON.stringify(events.filter(e=>['assistant/chunk','assistant/message'].includes(e.type)))).not.toMatch(/DSML|pwd && ls/)
 expect(requests[2].messages.some(msg=>msg.source?.kind==='tool' && msg.source.callId==='inspect-sheet')).toBe(true)
 expect(requests.map(req=>req.maxTokens)).toEqual([384,1000,1000])
})
it('passes a normal user-requested protocol example unchanged in one ordinary reply',async()=>{
 const example='字面示例\n'+sample.deltas.join('').split('\n\n')[1]
 const {events,requests,errors}=await fullTurn('请解释这段工具协议的格式，用示例回答。',()=>textStream([example]))
 expect(requests).toHaveLength(1);expect(errors).toEqual([]);expect(endOf(events).kind).toBe('completed');expect(publicChunks(events)).toBe(example)
})
it('continues after an opening stream error and keeps the actual execution error on the correct step',async()=>{
 const {events,requests,errors}=await fullTurn(sample.request,n=>{if(n===1)throw Error('opening transport error');return [{type:'finish',reason:{kind:'error',failure:{code:'UPSTREAM',message:'execution transport error'}}}]})
 expect(requests).toHaveLength(2);expect(errors.join(' ')).toContain('execution transport error')
 expect(endOf(events)).toMatchObject({kind:'error',error:{message:'execution transport error'}})
})
it('protects partial markers without swallowing Markdown examples or unrelated inline syntax',async()=>{
 const prefix='说明\n```xml\n'+marker+'\n```\n> '+marker+'\n句内 '+marker+'\n    '+marker+'\n'
 const text=prefix+sample.deltas.join('').split('\n\n')[1]
 const filter=async wire=>{const chunks=[];for await(const chunk of publicTaskOpeningStream(wire))chunks.push(chunk);return chunks}
 const safe=await filter(textStream([...text]))
 expect(safe.filter(c=>c.type==='text-delta').map(c=>c.text).join('')).toBe(prefix)
 expect(safe.find(c=>c.type==='block-end').block.text).toBe(prefix)
 const snapshot=await filter([{type:'block-end',index:4,block:{type:'text',text}},...callStream(),{...close(),replayState:{unredacted:text}}])
 expect(snapshot.find(c=>c.type==='block-end').block.text).toBe(prefix)
 expect(snapshot.at(-1)).not.toHaveProperty('replayState')
 expect(snapshot.some(c=>c.block?.type==='tool-call')).toBe(false)
 const crossed=await filter([{type:'text-delta',index:0,text:'首句。\n'+marker},{type:'text-delta',index:1,text:'private-parameters'},{type:'block-end',index:1,block:{type:'text',text:'private-parameters'}},close()])
 expect(JSON.stringify(crossed)).not.toContain('private-parameters')
 const truncated=await filter([{type:'text-delta',index:0,text:'首句。\n<｜｜DSML｜｜ ca'},close()])
 expect(truncated.filter(c=>c.type==='text-delta').map(c=>c.text).join('')).toBe('首句。\n')
})

it('filters the hosted workbook opening’s paired ASCII controls from every split without hiding quoted protocol examples',async()=>{
 const begin='<|tool_call_start|>bash<|tool_call_end|>'
 const arg='<|tool_call_argument_start|>{"cmd": "ls -la && find . -maxdepth 2 -type f", "workdir": "/workspace", "timeout": 10000}<|tool_call_argument_end|>'
 const prefix='我先定位并打开工作簿，核对 2024 年 12 月美债曲线所在的表头与日期范围，再在 F、G 列写入可复算的基点利差公式。\n\n'
 const wire=prefix+begin+'\n'+arg+'\n'+begin+'\n'+arg
 const project=async deltas=>{
  const response=[]
  for await(const event of publicTaskOpeningStream(textStream(deltas)))response.push(event)
  return [response.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),response.find(e=>e.type==='block-end').block.text]
 }
 for(let split=0;split<=wire.length;split++) expect(await project([wire.slice(0,split),wire.slice(split)])).toEqual([prefix,prefix])
 expect(await project([...wire])).toEqual([prefix,prefix])
 expect(await project([prefix+begin+'\n<|tool_call_argument_s'])).toEqual([prefix,prefix])
 expect(await project([prefix+'<|tool_call_sta'])).toEqual([prefix,prefix])
 const examples=['三反引号内的示例', '```text',begin,arg,'```','> '+begin,'句内 '+begin,'    '+begin,begin,'这是标记举例。'].join('\n')
 expect(await project([...examples])).toEqual([examples,examples])
})

it('honors a smaller explicit output budget and explicit reasoning setting without rebinding the prepared adapter',async()=>{
 const request={maxTokens:128,reasoningEffort:'high'},calls=[]
 const prepared={stream:wire=>{calls.push(wire);return textStream(['已确认目标。'])}}
 const llm={prepareCall:()=>{throw Error('the original prepared call already has the right budget')}}
 const chunks=[]
 for await(const chunk of boundedTaskOpeningStream(llm,prepared,request,new AbortController().signal,x=>x,x=>x))chunks.push(chunk)
 expect(calls).toEqual([request]);expect(calls[0]).toBe(request);expect(chunks.at(-1).reason.kind).toBe('stop')
})

it.each([
 ['ework-ark','deepseek-v4.1-flash',16384,1024],['ework-ark','deepseek-v4.1-flash',256,256],
 ['ework-ark','other-model',16384,384],['other-provider','deepseek-v4.1-flash',4096,384],
])('caps %s/%s with a %i session limit and omits private opening blocks',async(provider,model,limit,expected)=>{
 const request={provider,model,maxTokens:limit,reasoningEffort:'high'},wire=[]
 const stream=options=>{
  wire.push(options)
  return [{type:'block-start',index:0,blockType:'reasoning'},{type:'reasoning-delta',index:0,text:'private deliberation'},
   {type:'block-end',index:0,block:{type:'reasoning',text:'private deliberation'}},
   ...textStream(['我先核对披露日期。']).map(c=>c.index===0?{...c,index:1}:c).slice(0,-1),
   {...close(),replayState:{reasoning:'private deliberation'}}]
 }
 const prepared={config:request,stream}
 const llm={prepareCall:async config=>({config,stream})}
 const chunks=[]
 for await(const chunk of boundedTaskOpeningStream(llm,prepared,request,new AbortController().signal,x=>x,x=>x))chunks.push(chunk)
 expect(wire).toEqual([{...request,maxTokens:expected}])
 expect(chunks.filter(c=>c.type==='text-delta').map(c=>c.text).join('')).toBe('我先核对披露日期。')
 expect(JSON.stringify(chunks)).not.toMatch(/private deliberation|reasoning|replayState/)
 expect(request.maxTokens).toBe(limit)
})

it('recovers once from a real reasoning-only opening limit without double counting public text or losing usage',async()=>{
 const route={provider:'ework-ark',model:'deepseek-v4.1-flash',maxTokens:16384,reasoningEffort:'high'}
 const budgets=[]
 const llm={prepareCall:async config=>({config,stream:()=>{
  budgets.push(config.maxTokens)
  if (budgets.length===1) return [{type:'block-start',index:0,blockType:'reasoning'},
   {type:'block-end',index:0,block:{type:'reasoning',text:'private'}},{type:'usage',usage:{inputTokens:257,outputTokens:1024}},
   {type:'finish',reason:{kind:'max-tokens'}}]
  return [...textStream(['我先核对两个交易日的曲线。']).slice(0,-1),{type:'usage',usage:{inputTokens:257,outputTokens:350}},close()]
 }})}
 const chunks=[]
 for await(const chunk of boundedTaskOpeningStream(llm,{config:route},route,new AbortController().signal,x=>x,x=>x))chunks.push(chunk)
 expect(budgets).toEqual([1024,2048]);expect(chunks.filter(c=>c.type==='finish')).toHaveLength(1)
 expect(chunks.at(-2)).toEqual({type:'usage',usage:{inputTokens:514,outputTokens:1374}})
 expect(chunks.filter(c=>c.type==='text-delta').map(c=>c.text)).toEqual(['我先核对两个交易日的曲线。'])
 expect(JSON.stringify(chunks)).not.toContain('private')
})

it('keeps component markup out of the dedicated spoken opening without rewriting requested HTML or spending a second opening budget',async()=>{
 const prose='两只持仓适合共用一条百分比刻度。\n'
 const document='<html lang="zh-CN"><body><table><tr><td>3.81%</td></tr></table></body></html>'
 const fenced='```html\n<!DOCTYPE html>\n'+document
 for(const source of [fenced,document]){
  const literal=prose+source
  const text=async explicit=>{const out=[];for await(const e of publicTaskOpeningStream(textStream([...literal]),explicit))out.push(e);return [out.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),out.find(e=>e.type==='block-end').block.text]}
  expect(await text(true)).toEqual([prose,prose])
  expect(await text(false)).toEqual([literal,literal])
 }
 const request={provider:'ework-ark',model:'deepseek-v4.1-flash',maxTokens:4096,[Symbol.for('ework.native-component-opening')]:true}
 const calls=[],chunks=[];const llm={stream:r=>{calls.push(r);return [...textStream([fenced]).slice(0,-1),{type:'finish',reason:{kind:'max-tokens'}}]}}
 for await(const e of boundedTaskOpeningStream(llm,undefined,request,new AbortController().signal,x=>x,x=>x))chunks.push(e)
 expect(calls).toHaveLength(1);expect(JSON.stringify(chunks)).not.toContain('DOCTYPE')
})
