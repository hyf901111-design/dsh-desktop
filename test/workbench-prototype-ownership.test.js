import {describe,it,expect} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter,createToolResultMessage} from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {registerWorkbenchExecutionPolicy,workbenchCreationRequest} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {planningPrototypeEvidence,prototypeEvidenceCall,prototypeEvidenceProgress,prototypeEvidenceSchema} from '../packages/dsh-research-task-runtime/workbench-prototype-evidence.js'

const human=(text,id='a')=>({id,role:'user',source:{kind:'user'},content:[{type:'text',text}]})
const makeSession=(text,id)=>({header:{},events:[{type:'user/message',data:human(text,id)}]})
const original='/tmp/authorized.html',extra='/tmp/output-only.html'
const tools=[{name:'research_workbench_create',description:'create',parameters:{type:'object',properties:{}}},{name:'read',description:'read',parameters:{type:'object',properties:{file_path:{type:'string'},offset:{type:'integer',minimum:1}},required:['file_path'],additionalProperties:false}},{name:'web_fetch',description:'web',parameters:{type:'object',properties:{url:{type:'string'}},required:['url']}},{name:'bash',description:'bash',parameters:{type:'object',properties:{command:{type:'string'}}}}]
function harness(s){
 const hooks=new Map();let guard
 const dispose=registerWorkbenchExecutionPolicy({tools:{guard:fn=>{guard=fn;return()=>{}},schemas:()=>tools},systemPrompt:{context:()=>()=>{}},on:(name,fn)=>{hooks.set(name,fn);return()=>{}}})
 const agent={session:s},wire={system:'original',messages:[s.events[0].data],tools}
 return{agent,wire,dispose,context:signal=>hooks.get('agent/request-context')({agent,signal},async()=>wire),guard:(name,args,callId=name)=>guard({agent,name,arguments:args,callId})}
}
function evidence(text){const s=makeSession(text);return planningPrototypeEvidence(s,workbenchCreationRequest(s))}
function record(s,name,args,id,options={}){
 const call={seq:s.events.length,type:'tool/call',data:{turn:1,step:0,callId:id,name,arguments:JSON.stringify(args)}}
 s.events.push(call,{seq:s.events.length+1,type:'tool/result',sourceEventSeqs:[call.seq],data:{turn:1,step:0,message:structuredClone(createToolResultMessage({callId:id,content:[{type:'text',text:'reference body'}],isError:!!options.failed}))}})
 return s.events.at(-1)
}
describe('prototype author intent and request ownership',()=>{
 it.each(['输出文件路径为 ','输出文件：','结果保存在 ','导出至 ','output file path: ','save the result to '])('does not promote an output destination after %s',label=>{
  const result=evidence('参考 '+original+' 创建工作台，'+label+extra+'。')
  expect(result.files).toEqual([original]);expect(prototypeEvidenceCall('read',{file_path:extra},result)).toBeUndefined()
 })
 it.each([
  '参考以下原型HTML创建工作台：<main><a href="file:///tmp/output-only.html">链接</a></main>',
  '参考以下HTML创建工作台：\n<main>\n<a href="file:///tmp/output-only.html">链接</a>\n</main>',
  '参考 '+original+' 创建工作台，说明中放[网站](https://example.test/not-reference)。',
  '参考 '+original+' 创建工作台，正文原文：[原型](file:///tmp/output-only.html)。',
  '参考 '+original+' 创建工作台。正文中的原型链接是 [页面](file:///tmp/output-only.html)。',
  '参考 '+original+' 创建工作台。原文写着“读取 /tmp/output-only.html”。',
  '参考 '+original+' 创建工作台。不要读取 '+extra+'。',
  '参考 '+original+' 创建工作台。工作目录 /tmp/project/ 不构成目录授权。'
 ])('does not mine linked or quoted document bodies: %s',text=>{
  const result=evidence(text);expect(result.files).toEqual(text.includes(original)?[original]:[]);expect(result.urls).toEqual([])
 })
 it.each([
  '参考 [原型]('+pathToFileURL(original).href+') 创建工作台。',
  '根据 '+original+' 和 /tmp/second.html 创建工作台。',
  pathToFileURL(original).href+'\n根据这个原型创建工作台。',
  '分析原型 '+pathToFileURL(original).href+' 后创建工作台。',
  '参考 https://example.test/prototype 创建工作台。'
 ])('retains directly authored reference intent: %s',text=>{
  const result=evidence(text);expect(result.required.length).toBeGreaterThan(0)
  if(text.includes('second'))expect(result.files).toEqual([original,'/tmp/second.html'])
 })
 it('intersects original read schema without removing its constraints',()=>{
  const targets=evidence('参考 '+original+' 和 '+extra+' 创建工作台')
  const originalSchema={...tools[1],parameters:{...tools[1].parameters,properties:{...tools[1].parameters.properties,file_path:{type:'string',enum:[original],pattern:'^/tmp/'}}}}
  const projected=prototypeEvidenceSchema(originalSchema,targets)
  expect(projected.parameters.properties.file_path).toEqual({type:'string',enum:[original],pattern:'^/tmp/'})
  expect(projected.parameters.additionalProperties).toBe(false);expect(originalSchema.parameters.properties.file_path.enum).toEqual([original])
 })
 it.each(['queued-create','queued-cancel'])('rejects a stale wire before establishing scope: %s',next=>{
  const s=makeSession('参考 '+original+' 创建工作台。'),h=harness(s)
  s.events.push({type:'agent/inbox/spliced',data:{inserted:[human(next==='queued-create'?'参考 '+extra+' 创建另一个工作台。':'取消创建，不再继续','b')]}})
  return expect(h.context()).rejects.toThrow(/需求已更新/).finally(()=>h.dispose())
 })
 it.each([[],undefined])('never grants prototype reads without an identified human wire: %s',messages=>{
  const h=harness(makeSession('参考 '+original+' 创建工作台。'));h.wire.messages=messages
  return expect(h.context()).rejects.toThrow(/需求已更新/).finally(()=>h.dispose())
 })
 it('allows a valid new wire after rejecting A/B mismatch, never transferring A receipts to B',async()=>{
  const s=makeSession('参考 '+original+' 创建工作台。'),h=harness(s)
  await h.context();record(s,'read',{file_path:original},'read-a')
  s.events.push({type:'user/message',data:human('参考 '+extra+' 创建另一个工作台。','b')})
  await expect(h.context()).rejects.toThrow(/需求已更新/)
  h.wire.messages.push(s.events.at(-1).data)
  const current=await h.context();expect(current.tools.find(tool=>tool.name==='read').parameters.properties.file_path.enum).toEqual([extra])
  expect(h.guard('research_workbench_create',{})).toContain('先读取');expect(h.guard('read',{file_path:original})).toBeTruthy();h.dispose()
 })
 it('does not revive a cancelled queued draft as the latest planning author',async()=>{
  const s=makeSession('参考 '+original+' 创建工作台。'),h=harness(s)
  s.events.push({type:'agent/inbox/spliced',data:{target:'next-turn',start:0,inserted:[human('参考 '+extra+' 创建另一工作台','b')]}},{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'canceled'}})
  const wire=await h.context();expect(workbenchCreationRequest(s).messageId).toBe('a');expect(wire.tools.find(tool=>tool.name==='read').parameters.properties.file_path.enum).toEqual([original]);h.dispose()
 })
 it.each(['wrong-source','wrong-block','wrong-seq','wrong-turn','next-human','no-current-human'])('does not count an unrelated receipt as actual evidence: %s',kind=>{
  const s=makeSession('参考 '+original+' 创建工作台。'),targets=evidence('参考 '+original+' 创建工作台。')
  if(kind==='next-human')s.events.push({type:'user/message',data:human('解释上一张图','b')})
  const result=record(s,'read',{file_path:original},'actual')
  if(kind==='wrong-source')result.data.message.source.kind='plugin'
  if(kind==='wrong-block')result.data.message.content[0].toolCallId='other-call'
  if(kind==='wrong-seq')result.sourceEventSeqs=[0]
  if(kind==='wrong-turn')result.data.turn=2
  if(kind==='no-current-human')s.events.shift()
  expect(prototypeEvidenceProgress(s,'a',targets).inspected.size).toBe(0)
 })
 it('counts actual failed read receipts for honest partial planning and releases on cancel/accept',async()=>{
  const s=makeSession('参考 '+original+' 创建工作台。'),h=harness(s),abort=new AbortController()
  await h.context(abort.signal);record(s,'read',{file_path:original},'failure',{failed:true})
  expect(h.guard('research_workbench_create',{})).toBeUndefined()
  record(s,'research_workbench_create',{},'plan').data.message=createToolResultMessage({callId:'plan',content:[{type:'text',text:JSON.stringify({planId:'accepted',status:'accepted'})}]})
  expect(h.guard('bash',{command:'unchanged original authority'})).toBeUndefined();h.dispose()
  const c=harness(makeSession('参考 '+original+' 创建工作台。'));await c.context(abort.signal);abort.abort();expect(c.guard('bash',{})).toBeUndefined();c.dispose()
 })
})

it('keeps production ToolRuntime grants, schema and actual receipts authoritative before partial planning',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sherlock-reference-boundary-'))
 const reference=join(directory,'user 原型.html'),denied=join(directory,'denied.html'),output=join(directory,'output.html'),body=join(directory,'linked.html')
 await Promise.all([writeFile(reference,'<main><h1>运营诊断</h1><a href="'+pathToFileURL(body).href+'">内部链接不能授权</a></main>'),writeFile(denied,'not allowed'),writeFile(output,'must not read output'),writeFile(body,'must not read linked body')])
 const ctx=new Context(),reads=[],permissionChecks=[],errors=[],requests=[],timeline=[]
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:2})
 ctx.on('agent/error',({error})=>errors.push(String(error)))
 ctx.on('tools/pre-execute',async(exec,next)=>{
  permissionChecks.push(exec.name+':'+(exec.arguments?.file_path??''))
  return exec.name==='read'&&exec.arguments.file_path===denied?{kind:'deny',reason:'existing parent file permission denied'}:next()
 })
 const register=(schema,execute)=>ctx.tools.register({...schema,output:{schema:{},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},execute})
 register({...tools[1],parameters:{...tools[1].parameters,properties:{...tools[1].parameters.properties,file_path:{type:'string',enum:[reference,denied,output,body]}}}},async args=>{
  reads.push(args.file_path);timeline.push('read');return{body:await readFile(args.file_path,'utf8')}
 })
 register(tools[0],async(_args,exec)=>{
  const progress=prototypeEvidenceProgress(exec.agent.session,workbenchCreationRequest(exec.agent.session).messageId,{files:[reference,denied],urls:[]})
  expect([...progress.inspected]).toEqual(['file:'+reference]);expect([...progress.failed]).toEqual(['file:'+denied])
  timeline.push('plan')
  const child=(await ctx.agents.create({sessionId:'reference-boundary-child',meta:{parentSession:exec.agent.id,origin:'subagent'},agentOptions:{provider:'local',model:'local'}})).agent
  expect(ctx.tools.schemas(child).find(tool=>tool.name==='read').parameters.properties.file_path.enum).toEqual([reference,denied,output,body]);timeline.push('child')
  return{planId:'partial-real-reference',status:'accepted'}
 })
 class Model extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id,defaultMaxTokens:16000,reasoning:{efforts:[{id:'low',name:'Low'},{id:'max',name:'Max'}],defaultEffort:'max'}}}
  async *stream(request){
   requests.push(request)
   const calls=requests.length===1?[
    ['research_workbench_create',{}],['read',{file_path:output}],['read',{file_path:body}],['read',{file_path:reference}],['read',{file_path:denied}]
   ]:requests.length===2?[['research_workbench_create',{}]]:[]
   if(requests.length===1)expect(request.tools.find(tool=>tool.name==='read').parameters.properties.file_path.enum).toEqual([reference,denied])
   if(requests.length===2){expect(JSON.stringify(request.messages)).toContain('运营诊断');expect(JSON.stringify(request.messages)).toContain('existing parent file permission denied')}
   for(const [index,[name,args]] of calls.entries()){yield{type:'block-start',index,blockType:'tool-call'};yield{type:'block-end',index,block:{type:'tool-call',id:'ownership-'+requests.length+'-'+index,name,arguments:JSON.stringify(args)}}}
   if(!calls.length){yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'按已读取原型规划；另一个附件没有权限，未声称读取。'}}}
   yield{type:'finish',reason:{kind:'stop'}}
  }
 }
 ctx.llm.registerAdapter(['local'],new Model());const dispose=registerWorkbenchExecutionPolicy(ctx)
 try{
  const parent=(await ctx.agents.create({sessionId:'reference-boundary-parent',agentOptions:{provider:'local',model:'local',reasoningEffort:'max'}})).agent
  const input=human('参考 '+pathToFileURL(reference).href+' 和 '+pathToFileURL(denied).href+' 创建工作台。输出文件路径为 '+output+'。\n粘贴的HTML：<a href="'+pathToFileURL(body).href+'">页面链接</a>\n正文中放[普通链接]('+pathToFileURL(body).href+')。')
  input.content.unshift({type:'image',attachment:{attachmentId:'local-fixture-image',mediaType:'image/png',bytes:3,width:1,height:1}})
  parent.followup(input)
  await parent.whenIdle()
  expect(errors).toEqual([]);expect(reads).toEqual([reference]);expect(timeline).toEqual(['read','plan','child']);expect(requests).toHaveLength(3)
  expect(permissionChecks).toContain('read:'+denied)
  expect(requests[0].messages.find(message=>message.id==='a').content[0]).toEqual(input.content[0])
  expect(parent.session.events.filter(event=>event.type==='tool/result'&&event.data.message.content[0].isError)).toHaveLength(4)
  expect(requests[2].reasoningEffort).toBe('max')
 }finally{dispose();await ctx.fiber.dispose();await rm(directory,{recursive:true,force:true})}
},15000)

it.each(['next-turn','next-step'])('binds production AgentLoop %s input to its actual wire without borrowing another reference',async target=>{
 const directory=await mkdtemp(join(tmpdir(),'sherlock-reference-queue-')),a=join(directory,'a.html'),b=join(directory,'b.html')
 await Promise.all([writeFile(a,'<h1>A source</h1>'),writeFile(b,'<h1>B source</h1>')])
 const ctx=new Context(),reads=[],plans=[],requests=[],errors=[],ready=Promise.withResolvers(),resume=Promise.withResolvers()
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[]})
 ctx.on('agent/error',({error})=>errors.push(String(error)))
 const register=(schema,execute)=>ctx.tools.register({...schema,output:{schema:{},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},execute})
 register(tools[1],async(args,exec)=>{reads.push([workbenchCreationRequest(exec.agent.session).messageId,args.file_path]);return{html:await readFile(args.file_path,'utf8')}})
 register(tools[0],async(_args,exec)=>{const id=workbenchCreationRequest(exec.agent.session).messageId;plans.push(id);return{planId:'plan-'+id,status:'accepted'}})
 const dispose=registerWorkbenchExecutionPolicy(ctx)
 let gated=false
 ctx.on('agent/request-context',async(_event,next)=>{const request=await next();if(!gated){gated=true;ready.resolve();await resume.promise}return request})
 const phases=new Map()
 class Model extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id,reasoning:{efforts:[{id:'low',name:'Low'},{id:'max',name:'Max'}],defaultEffort:'max'}}}
  async *stream(request){
   const id=request.messages.findLast(message=>message.source.kind==='user').id,phase=(phases.get(id)??0)+1;phases.set(id,phase);requests.push([id,phase])
   const path=id==='a'?a:b,calls=phase===1?[['read',{file_path:path}]]:phase===2?[['research_workbench_create',{}]]:[]
   if(phase===1)expect(request.tools.find(tool=>tool.name==='read').parameters.properties.file_path.enum).toEqual([path])
   for(const [index,[name,args]] of calls.entries()){yield{type:'block-start',index,blockType:'tool-call'};yield{type:'block-end',index,block:{type:'tool-call',id:'queue-'+id+'-'+phase+'-'+index,name,arguments:JSON.stringify(args)}}}
   if(!calls.length){yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'已根据该轮实际参考规划。'}}}
   yield{type:'finish',reason:{kind:'stop'}}
  }
 }
 ctx.llm.registerAdapter(['local'],new Model())
 try{
  const parent=(await ctx.agents.create({sessionId:'reference-queue-'+target,agentOptions:{provider:'local',model:'local'}})).agent
  parent.followup(human('参考 '+pathToFileURL(a).href+' 创建A工作台。','a'));await ready.promise
  parent.send(human('参考 '+pathToFileURL(b).href+' 创建B工作台。','b'),target,true);resume.resolve();await parent.whenIdle()
  if(target==='next-turn'){
   expect(errors).toEqual([]);expect(reads).toEqual([['a',a],['b',b]]);expect(plans).toEqual(['a','b']);expect(requests).toEqual([['a',1],['a',2],['a',3],['b',1],['b',2],['b',3]])
  }else{
   expect(errors).toEqual([]);expect(reads).toEqual([['a',a],['b',b]]);expect(plans).toEqual(['b']);expect(requests).toEqual([['a',1],['b',1],['b',2],['b',3]])
  }
 }finally{resume.resolve();dispose();await ctx.fiber.dispose();await rm(directory,{recursive:true,force:true})}
},15000)
