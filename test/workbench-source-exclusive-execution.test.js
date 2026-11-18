import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Context} from '@deepseek-ai/cordis'
import {createScope} from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import {startComponentAgent} from '../packages/dsh-research-task-runtime/component-agent-scope.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt,workbenchQuoteSourceRequests} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchSourcePolicy,restoreWorkbenchHostContext,workbenchPublicSourceCallIssue,workbenchPublicSourceEvidenceIssue} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
import {workbenchText} from '../packages/dsh-research-task-runtime/workbench-locale.js'

const native=JSON.parse(readFileSync(new URL('./fixtures/workbench-source-layout-exclusive-tencent.json',import.meta.url),'utf8'))
const observed=JSON.parse(readFileSync(new URL('./fixtures/component-native-static-kpi18.json',import.meta.url),'utf8'))
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
function fixture(){
 const plan=validateWorkbench({...structuredClone(native.second),requestId:'exclusive-execution'}),panel=plan.panels[0]
 const policy=workbenchSourcePolicy(native.humanRequest,panel,{publicSourceRequests:workbenchQuoteSourceRequests(native.second.panels[0])})
 const context=restoreWorkbenchHostContext({sourcePolicy:policy,sourceRequirement:panel.prompt,workbenchRequest:{originalRequest:native.humanRequest,dataMode:'source'}})
 const records=structuredClone(observed.records),args=records[0].args
 const path=(key,optional=false)=>({$path:key,...optional?{$optional:true,$default:'来源未提供'}:{}})
 const fields=['code','name','price','changePercent','volume','amount','time','reportDate']
 const columns=['证券代码','公司名称','最新价（元）','涨跌幅（%）','成交量（手）','成交额（元）','实际报价时点','最新财务报告期']
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'table',title:panel.title,asOf:{$from:'q',$path:'dataTime'},note:'腾讯行情未提供成交量、成交额与财务报告期，逐项标注来源未提供；仅静态快照，不自动刷新。',columns,rows:{$from:'q',$each:'records',$map:fields.map(key=>path(key,['volume','amount','reportDate'].includes(key)))}}}
 return {plan,panel,context,policy,args,records,draft,prompt:workbenchPanelPrompt(plan,panel)}
}
async function run(f,{outputs=[f.draft],records=f.records,storage}={}){
 const start=vi.fn(async()=>({childSessionId:'exclusive-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(outputs[Math.min(start.mock.calls.length-1,outputs.length-1)])}],sourceRecords:start.mock.calls.length===1?records:[]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:storage??{save:async()=>{}},now:()=>observed.createdAt,retryDelayMs:0})
 cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({kind:'container',parentSessionId:'exclusive-parent',canvasNodeId:'exclusive-card',prompt:f.prompt},f.context)
 await runtime.tasks.get(receipt.taskId).runPromise
 return {runtime,start,bindData,task:runtime.inspect({parentSessionId:'exclusive-parent',taskId:receipt.taskId})}
}

it('freezes the validated original recipe and preserves it through private JSON storage restore',()=>{
 const f=fixture(),restored=restoreWorkbenchHostContext(JSON.parse(JSON.stringify(f.context)))
 expect(restored).toEqual(f.context);expect(Object.isFrozen(restored.sourcePolicy.publicSourceRequests[0])).toBe(true)
 for(const change of [p=>{p.pluginRequired=true},p=>{p.pluginProhibited=false},p=>{p.publicSourceRequests[0].parameters_json='{"symbols":["sz300308"],"url":"https://not-authorized.invalid"}'},p=>{p.publicSourceRequests[0].source='sina-news'},p=>{p.publicSourceRequests[0].operation='catalog'}]){
  const bad=JSON.parse(JSON.stringify(f.context));change(bad.sourcePolicy);expect(()=>restoreWorkbenchHostContext(bad)).toThrow()
 }
})

it('permits only the complete validated request and bounded catalog discovery without treating discovery as data',()=>{
 const {policy,args,records}=fixture()
 expect(workbenchPublicSourceCallIssue(policy,'public_data_query',{...args,parameters_json:JSON.stringify(JSON.parse(args.parameters_json),null,2)})).toBeUndefined()
 expect(workbenchPublicSourceCallIssue(policy,'public_data_query',{operation:'catalog'})).toBeUndefined()
 expect(workbenchPublicSourceCallIssue(policy,'public_data_query',{operation:'catalog',source:'tencent-quotes',category:'market'})).toBeUndefined()
 expect(workbenchPublicSourceEvidenceIssue(policy,records)).toBeUndefined()
 expect(workbenchPublicSourceEvidenceIssue(policy,[{tool:'public_data_query',purpose:'discovery',args:{operation:'catalog'},response:{sources:['tencent-quotes']}}])).toContain('必须实际取得')
 for(const [name,value] of [['web_fetch',{url:'https://not-authorized.invalid'}],['ework__t_test',{}],['public_data_query',{...args,source:'sina-news'}],['public_data_query',{...args,parameters_json:'{"symbols":["sz300308"]}'}],['public_data_query',{...args,parameters_json:'{"symbols":["sz300308","sz300502","sh601138"],"url":"https://not-authorized.invalid"}'}],['public_data_query',{operation:'catalog',source:'sina-news'}]])expect(workbenchPublicSourceCallIssue(policy,name,value)).toContain('仅允许')
})

it('installs a real SDK monotonic guard before the component first tool call and leaves another agent unchanged',async()=>{
 const f=fixture(),ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx)
 cleanup.push(()=>ctx.fiber.dispose())
 const execute=vi.fn(async()=>({ok:true})),schema={type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}}}
 for(const name of ['public_data_query','web_fetch'])ctx.tools.register(defineTool({name,description:'Offline guard fixture',parameters:{},output:{schema,render:()=>[]},execute}))
 const child={id:'bounded-child'},other={id:'unrelated-child'},childScope=createScope(ctx,child),otherScope=createScope(ctx,other)
 child.ctx=childScope.ctx;other.ctx=otherScope.ctx;cleanup.push(()=>childScope.dispose());cleanup.push(()=>otherScope.dispose())
 const call=(agent,name,args)=>ctx.tools.execute({name,arguments:args,agent,callId:Math.random().toString(),signal:new AbortController().signal})
 let request,first
 ctx.provide('subagents',{async start(_mode,options){request=options;await Promise.resolve();ctx.emit('agent/created',{agent:child});first=await call(child,'public_data_query',{...f.args,source:'sina-news'});return{localAgent:child}}})
 await startComponentAgent(ctx,{parent:{id:'parent'},sourcePolicy:f.policy})
 expect(request).not.toHaveProperty('sourcePolicy');expect(first).toMatchObject({isError:true});expect(execute).not.toHaveBeenCalled()
 expect(await call(child,'web_fetch',{})).toMatchObject({isError:true})
 expect(await call(child,'public_data_query',f.args)).toMatchObject({isError:false,value:{ok:true}})
 expect(await call(other,'web_fetch',{})).toMatchObject({isError:false,value:{ok:true}})
 expect(execute).toHaveBeenCalledTimes(2)
})

it('skips parent-confirmed missing Tushare APIs before a child dispatch and leaves other agents and APIs usable',async()=>{
 const ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx);cleanup.push(()=>ctx.fiber.dispose())
 const executes=[],scope={catalog:'ework__catalog',read:'ework__read',apis:['fut_daily']}
 for(const [kind,name] of [['read',scope.read],['catalog',scope.catalog]]){
  ctx.tools.register({name,description:'受信来源',parameters:{type:'object',properties:{api_name:{type:'string'}}},
   [Symbol.for('ework.builtin-tushare.'+kind)]:true,output:{schema:{},render:()=>[]},execute:async args=>{executes.push([name,args.api_name]);return {}}})
 }
 const child={id:'source-child'},other={id:'other'},childScope=createScope(ctx,child),otherScope=createScope(ctx,other)
 child.ctx=childScope.ctx;other.ctx=otherScope.ctx;cleanup.push(()=>childScope.dispose());cleanup.push(()=>otherScope.dispose())
 const call=(agent,name,api_name)=>ctx.tools.execute({name,arguments:{api_name},agent,callId:crypto.randomUUID(),signal:new AbortController().signal})
 let first
 ctx.provide('subagents',{async start(){ctx.emit('agent/created',{agent:child});first=await call(child,scope.read,'fut_daily');return{localAgent:child}}})
 await startComponentAgent(ctx,{parent:{id:'parent'},sourcePolicy:{unavailableTushare:scope}})
 expect(first.isError).toBe(true)
 expect((await call(child,scope.catalog,'fut_daily')).isError).toBe(true)
 expect((await call(child,scope.read,'fund_nav')).isError).toBe(false)
 expect((await call(other,scope.read,'fut_daily')).isError).toBe(false)
 expect(executes).toEqual([[scope.read,'fund_nav'],[scope.read,'fut_daily']])
})

it('completes the offline three-company eight-column source mapping with honest missing report dates and no refresh binding',async()=>{
 const f=fixture(),{task,start,bindData}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 for(const row of f.records[0].response.records)for(const key of ['code','name','price','changePercent','time'])expect(task.finalOutput).toContain(String(row[key]))
 for(const name of f.draft.mapping.columns)expect(task.finalOutput).toContain(name)
 expect(task.finalOutput).toContain('来源未提供');expect(task.finalOutput).not.toContain('2026-10-23 · DataYes')
})

it.each(['no-query','catalog-only','wrong-provider','changed-entities','extra-plugin'])('does not accept or recover a source-looking card that violates the frozen actual-source boundary: %s',async kind=>{
 const f=fixture(),records=structuredClone(f.records)
 if(kind==='no-query')records.length=0
 if(kind==='catalog-only')records.splice(0,records.length,{tool:'public_data_query',purpose:'discovery',args:{operation:'catalog'},response:{sources:['tencent-quotes']}})
 if(kind==='wrong-provider')records[0].response.sourceId='sina-news'
 if(kind==='changed-entities')records[0].args.parameters_json='{"symbols":["sz300308"]}'
 if(kind==='extra-plugin')records.push({tool:'ework__t_test',args:{},response:{value:1}})
 const {task,bindData}=await run(f,{records});expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(bindData).not.toHaveBeenCalled()
})

it('preserves the bounded policy on a stored unchanged retry and its existing one-shot output repair',async()=>{
 const f=fixture(),initial=await run(f,{records:[]}),stored=JSON.parse(JSON.stringify(initial.runtime.persistedDocument()))
 const start=vi.fn(async()=>({childSessionId:'restored-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?{version:1,type:'table',title:'坏结构'}:f.draft)}],sourceRecords:start.mock.calls.length===1?f.records:[]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>stored,save:async()=>{}},now:()=>observed.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose());await runtime.restore()
 const receipt=await runtime.start({kind:'container',parentSessionId:'exclusive-parent',canvasNodeId:'exclusive-card',prompt:f.panel.prompt});await runtime.tasks.get(receipt.taskId).runPromise
 expect(runtime.tasks.get(receipt.taskId).state,runtime.tasks.get(receipt.taskId).error).toBe('completed');expect(start).toHaveBeenCalledTimes(2)
 for(const call of start.mock.calls)expect(call[0].hostContext.sourcePolicy.publicSourceRequests).toEqual(f.policy.publicSourceRequests)
})

it('cannot turn a readable draft into accepted evidence when the bounded output repair throws',async()=>{
 const f=fixture(),start=vi.fn(async()=>{
  if(start.mock.calls.length>1)throw Error('Synthetic repair transport failed')
  return {childSessionId:'wrong-source-fallback',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',sourceRecords:[],output:[{type:'text',text:JSON.stringify({version:1,type:'markdown',title:'报价说明',content:'三家公司行情信息仍然保留，但本次尚未实际执行已校验的腾讯报价请求；这段可读文字不能冒充已取数结果。'})}]})}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},now:()=>observed.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({kind:'container',parentSessionId:'exclusive-parent',canvasNodeId:'exclusive-fallback',prompt:f.prompt},f.context);await runtime.tasks.get(receipt.taskId).runPromise
 const task=runtime.tasks.get(receipt.taskId);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(task.error).toContain('腾讯')
})

it.each(['本组件仅允许已校验的腾讯报价请求；其他来源或参数不能替代。','本组件必须实际取得已校验的腾讯报价响应；接口目录或其他来源不能作为取数结果。','当前来源执行边界不可用，尚未发起取数。'])('translates the new actionable source status in English: %s',message=>{
 expect(workbenchText(message,'en')).not.toBe(message);expect(workbenchText(message,'zh')).toBe(message)
})
