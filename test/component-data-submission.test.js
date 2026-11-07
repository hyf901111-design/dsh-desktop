import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import {apply as spawn} from '@deepseek-ai/dsh-subagent-spawn-in-process'
import {createComponentDataSubmission} from '../packages/dsh-research-task-runtime/component-data-submission.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {workbenchPanelPrompt,DATA_FIRST_PRESENTATION} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js'

const args={operation:'query',source:'fixture',parameters_json:'{}'}
const response={source:'Fixture',asOf:'2026-11-06',records:[{name:'甲',value:2.1},{name:'乙',value:-3.2}]}
const record={tool:'public_data_query',args,response}
const input={requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'chart',variant:'horizontal',title:'变动排名',unit:'亿元',asOf:{$from:'q',$path:'asOf'},labels:{$from:'q',$each:'records',$map:{$path:'name'}},series:[{name:'变动',values:{$from:'q',$each:'records',$map:{$path:'value'}}}]}}
const cleanup=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
function context(){const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});cleanup.push(()=>ctx.fiber.dispose());return ctx}
async function fixture(validateSnapshot){
 const ctx=context(),child=(await ctx.agents.create({sessionId:'data-child',agentOptions:{}})).agent,parent=(await ctx.agents.create({sessionId:'data-parent',agentOptions:{}})).agent
 const controller=new AbortController(),records=[structuredClone(record)],submission=createComponentDataSubmission({observeRecords:()=>records,signal:controller.signal,validateSnapshot});cleanup.push(submission.dispose);child.ctx.tools.restrict({allow:[]});submission.register(child)
 return{ctx,child,parent,records,submission,controller,invoke:(value=input,agent=child,id='data-submit')=>ctx.tools.execute({name:'submit_component_data',arguments:value,callId:id,agent,signal:controller.signal})}
}
const receipt=(callId='data-submit',isError=false)=>({type:'tool/result',data:{message:{source:{callId},content:[{type:'tool-result',toolCallId:callId,isError,content:[{type:'text',text:'{"accepted":true}'}]}]}}})
it('accepts source-backed chart labels with redundant numeric precision without losing leading zeroes',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].response.records=[{name:'000300.SH',value:-13.644},{name:'000905.SH',value:-17.334}]
 candidate.mapping.labels.$map.$digits=0
 candidate.mapping.series[0].values.$map.$digits=2
 expect((await f.invoke(candidate)).isError).toBe(false)
 const resolved=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',...candidate}),f.records)
 expect(resolved.data.labels).toEqual(['000300.SH','000905.SH'])
 expect(resolved.data.series[0].values).toEqual([-13.64,-17.33])
 expect(f.records[0].response.records[0].value).toBe(-13.644)
})
it('rejects malformed mapping inside the same child and accepts corrected data without another query',async()=>{
 const f=await fixture(),bad=structuredClone(input);bad.mapping.labels.$map={$concat:[{$path:'name'},'产品']}
 let done=false;f.submission.result.then(()=>{done=true})
 const rejected=await f.invoke(bad);expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected)).toContain('$concat')
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 expect((await f.invoke()).isError).toBe(false)
 f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const output=(await f.submission.result).output[0].text
 expect(resolveBoundComponent(output,f.records).data.series[0].values).toEqual([2.1,-3.2]);expect(f.records).toHaveLength(1)
})
it.each(['public_data_query','ework__t_48cd5c8d6962ae3cb7caba80a77c15fe'])('reuses the sole successful %s call without model-authored defaults and persists a complete recipe',async(tool)=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].tool=tool;f.records[0].args=tool==='public_data_query'?args:{view:'overview'}
 f.records.unshift({tool,args:{operation:'catalog'},purpose:'discovery',response:{tools:[]}})
 candidate.requests=[{key:'q',tool}]
 expect((await f.invoke(candidate)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const text=(await f.submission.result).output[0].text,stored=JSON.parse(text)
 expect(stored.requests).toEqual([{key:'q',tool,args:f.records[1].args}])
 expect(resolveBoundComponent(text,f.records).data.series[0].values).toEqual([2.1,-3.2])
 expect(candidate.requests[0]).not.toHaveProperty('args')
})
it('requires explicit selection when a tool has multiple successful requests and returns their exact parameters',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].args={...args,parameters_json:'{"symbol":"sh000300"}'}
 f.records.push({...record,args:{...args,parameters_json:'{"symbol":"sh000905"}'},response:{...response,records:[{name:'其他',value:10}]}})
 delete candidate.requests[0].args
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected)).toContain('sh000300');expect(JSON.stringify(rejected)).toContain('sh000905')
 candidate.requests[0].args=f.records[0].args
 expect((await f.invoke(candidate)).isError).toBe(false)
})
it.each(['none','discovery','other-tool'])('does not infer a source from %s observations',async(kind)=>{
 const f=await fixture(),candidate=structuredClone(input);delete candidate.requests[0].args
 if(kind==='none')f.records.length=0
 if(kind==='discovery')f.records[0].purpose='discovery'
 if(kind==='other-tool')f.records[0].tool='financial_query'
 expect((await f.invoke(candidate)).isError).toBe(true)
})
it('rejects explicit altered defaults and offers the original business call for a correction',async()=>{
 const f=await fixture(),candidate=structuredClone(input),tool='ework__t_48cd5c8d6962ae3cb7caba80a77c15fe'
 f.records[0].tool=tool;f.records[0].args={view:'overview'}
 candidate.requests=[{key:'q',tool,args:{view:'overview',end_date:null,lookback_days:7}}]
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected)).toContain('省略 args')
 expect(JSON.stringify(rejected)).toContain('本卡已成功请求')
 delete candidate.requests[0].args
 expect((await f.invoke(candidate)).isError).toBe(false)
 expect(f.records).toHaveLength(1);expect(f.records[0].args).toEqual({view:'overview'})
})
it.each(['operator','path'])('reports the actual %s error in financial snapshots and accepts a correction without refetching',async(kind)=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0]={tool:'financial_query',purpose:'snapshot',args:{intent:'history',symbols:['000300.SH']},response:{schema_version:'financial-1',status:'complete',records:response.records}}
 candidate.requests[0]={key:'q',tool:'financial_query',args:f.records[0].args}
 delete candidate.mapping.asOf
 const bad=structuredClone(candidate)
 if(kind==='operator')bad.mapping.labels.$map={$concat:[{$path:'name'},'产品']}
 else bad.mapping.series[0].values.$map.$path='missingValue'
 const rejected=await f.invoke(bad)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected)).toContain(kind==='operator'?'$concat':'missingValue')
 expect(JSON.stringify(rejected)).not.toContain('自动更新的数据引用无效')
 expect((await f.invoke(candidate)).isError).toBe(false)
 expect(f.records).toHaveLength(1)
})
it('explains an unsupported chart variant without silently changing the selected presentation',async()=>{
 const f=await fixture(),candidate=structuredClone(input);candidate.mapping.variant='trend'
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected)).toContain('趋势折线用 line')
 expect(JSON.stringify(rejected)).toContain('无需重新取数')
 expect(candidate.mapping.variant).toBe('trend')
 candidate.mapping.variant='line'
 expect((await f.invoke(candidate)).isError).toBe(false)
 expect(f.records).toHaveLength(1)
})
it.each(['unobserved','wrong-args','discovery','wrong-path'])('does not accept %s data or turn it into empty success',async(mode)=>{
 const f=await fixture(),candidate=structuredClone(input)
 if(mode==='unobserved')f.records.length=0
 if(mode==='wrong-args')candidate.requests[0].args.parameters_json='{"unknown":1}'
 if(mode==='discovery')f.records[0].purpose='discovery'
 if(mode==='wrong-path')candidate.mapping.series[0].values.$map.$path='notThere'
 expect((await f.invoke(candidate)).isError).toBe(true)
})
it.each(['object','reordered-json'])('reuses the observed public query for equivalent %s parameters without changing its replay arguments',async(kind)=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].args={operation:'query',source:'fixture',parameters_json:'{"symbol":"sh000300","limit":65}'}
 candidate.requests[0].args={source:'fixture',parameters_json:kind==='object'?{limit:65,symbol:'sh000300'}:'{ "limit": 65, "symbol": "sh000300" }'}
 expect((await f.invoke(candidate)).isError).toBe(false)
 const resolved=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',...candidate}),f.records)
 expect(resolved.recipe.requests[0].args).toEqual(f.records[0].args)
 expect(resolved.data.series[0].values).toEqual([2.1,-3.2])
})
it.each(['symbol','limit','source','extra','catalog'])('does not canonicalize a changed %s into an observed query',async(kind)=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].args={operation:'query',source:'fixture',parameters_json:'{"symbol":"sh000300","limit":65}'}
 candidate.requests[0].args={source:'fixture',parameters_json:{symbol:'sh000300',limit:65}}
 if(kind==='symbol')candidate.requests[0].args.parameters_json.symbol='sh000905'
 if(kind==='limit')candidate.requests[0].args.parameters_json.limit=64
 if(kind==='source')candidate.requests[0].args.source='different'
 if(kind==='extra')candidate.requests[0].args.extra=true
 if(kind==='catalog')candidate.requests[0].args.operation='catalog'
 expect((await f.invoke(candidate)).isError).toBe(true)
})
it.each(['flattened','missing-source'])('explains an incomplete %s public request and accepts the original call without refetching',async(kind)=>{
 const f=await fixture(),candidate=structuredClone(input)
 const original={operation:'query',source:'fixture',parameters_json:'{"symbol":"sh000300","limit":100}'}
 f.records[0].args=structuredClone(original)
 candidate.requests[0].args=kind==='flattened'?{symbol:'sh000300',limit:100}:{operation:'query',parameters_json:original.parameters_json}
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected)).toContain('requests[q].args')
 expect(JSON.stringify(rejected)).toContain('source')
 expect(JSON.stringify(rejected)).toContain('parameters_json')
 expect(JSON.stringify(rejected)).toContain('无需重新取数')
 candidate.requests[0].args=original
 expect((await f.invoke(candidate)).isError).toBe(false)
 expect(f.records).toHaveLength(1);expect(f.records[0].args).toEqual(original)
})
it('corrects a claimed per-series observation count against the selected dates without discarding source records',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].response={...response,records:[{date:'2026-11-05',value:100},{date:'2026-11-06',value:102}]}
 candidate.mapping.variant='line';candidate.mapping.labels.$map.$path='date'
 candidate.mapping.note='两条序列均为3个交易日，以首日为100。'
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected)).toContain('实际为2条')
 candidate.mapping.note='实际观测均为2个交易日，以首日为100。'
 expect((await f.invoke(candidate)).isError).toBe(false);expect(f.records[0].response.records).toHaveLength(2)
})
it.each(['近90个交易日的可用记录，基期为100。','数据源覆盖62个交易日，本图展示其中两日。','三个指数合计6个数据点。'])('does not confuse a window or source coverage with a plotted count: %s',async(note)=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].response={...response,records:[{date:'2026-11-05',value:100},{date:'2026-11-06',value:102}]}
 candidate.mapping.variant='line';candidate.mapping.labels.$map.$path='date';candidate.mapping.note=note
 expect((await f.invoke(candidate)).isError).toBe(false)
})
it('does not treat a category ranking as a daily observation count',async()=>{
 const f=await fixture(),candidate=structuredClone(input);candidate.mapping.note='两指数均为60个交易日的区间收益。'
 expect((await f.invoke(candidate)).isError).toBe(false)
})
it('returns the exact observed tool name when a model invents a source alias',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 candidate.requests[0].tool='fixture_query'
 const rejected=await f.invoke(candidate)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected)).toContain('public_data_query')
 expect(JSON.stringify(rejected)).toContain('工具名')
 expect((await f.invoke(input)).isError).toBe(false)
})
it('keeps final semantic validation correctable before acknowledging delivery',async()=>{
 let calls=0;const f=await fixture(()=>{if(++calls===1)throw Error('缺少请求范围')})
 expect((await f.invoke()).isError).toBe(true);expect((await f.invoke()).isError).toBe(false);expect(calls).toBe(2)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});expect((await f.submission.result).stopReason).toBe('completed')
})
it('isolates the submit/schema tools, cancellation and failed receipts',async()=>{
 const f=await fixture();expect(f.ctx.tools.schemas(f.parent).map(t=>t.name)).not.toContain('submit_component_data');expect((await f.invoke(input,f.parent)).isError).toBe(true)
 const schema=await f.ctx.tools.execute({name:'component_presentation_schema',arguments:{type:'chart',variant:'horizontal'},callId:'schema',agent:f.child,signal:f.controller.signal});expect(schema.isError).toBe(false)
 expect((await f.invoke()).isError).toBe(false);f.submission.accept(receipt('data-submit',true));f.submission.accept({type:'step/end'})
 expect((await f.invoke()).isError).toBe(false);f.controller.abort();expect(f.ctx.tools.schemas(f.child)).toEqual([])
})
it('treats a source plan as a suggestion but retains explicitly requested chart semantics',()=>{
 const panel={title:'资金流出前五',prompt:'比较各产品最近一周资金变动',type:'market'}
 const planned=workbenchPanelPrompt({title:'ETF',dataMode:'source',originalRequest:'看看最近一周资金进出前五'},panel)
 expect(planned).toContain(DATA_FIRST_PRESENTATION);expect(planned).not.toContain('必须输出 market.')
 const actual=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',...input}),[record]).output
 expect(workbenchMarketVariantIssue(actual,planned)).toBeNull()
 const candle=workbenchPanelPrompt({title:'走势',dataMode:'source',originalRequest:'沪深300日K线'}, {title:'沪深300K线',prompt:'日K线',type:'market'})
 expect(candle).toContain('必须输出 market.candlestick')
 const simulated=workbenchPanelPrompt({title:'模拟',dataMode:'simulated'},{title:'模拟趋势',prompt:'趋势',type:'chart'})
 expect(simulated).not.toContain(DATA_FIRST_PRESENTATION);expect(simulated).toContain('必须输出 chart.line')
})
it('uses one real child through acquisition, rejected mapping and adaptive corrected submission',async()=>{
 const ctx=context();new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'})
 const parent=(await ctx.agents.create({sessionId:'data-native-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 ctx.tools.register(defineTool({name:'public_data_query',description:'Read requested data',parameters:{operation:{type:'string'},source:{type:'string'},parameters_json:{type:'string'}},output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,execute(){return response}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length;if(n>3)throw Error('Repeated acquisition or child restart')
   expect(request.tools.map(t=>t.name)).toContain('submit_component_data')
   const bad=structuredClone(input);bad.mapping.labels.$map={$concat:[{$path:'name'},'产品']}
   const reused=structuredClone(input);delete reused.requests[0].args
   const value=n===1?args:n===2?bad:reused
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'call-'+n,name:n===1?'public_data_query':'submit_component_data',arguments:JSON.stringify(value)}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const query=workbenchPanelPrompt({title:'ETF',dataMode:'source',originalRequest:'看看资金进出前五'},{title:'资金变动',prompt:'读取真实来源，比较产品资金变动',type:'kpi'})
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:'看看资金进出前五',dataMode:'source'}},signal:controller.signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const result=await handle.result;expect(result.stopReason).toBe('completed');expect(children).toHaveLength(1);expect(requests).toHaveLength(3);expect(result.sourceRecords).toHaveLength(1)
 expect(JSON.parse(result.output[0].text).mapping.type).toBe('chart');expect(JSON.parse(result.output[0].text).requests[0].args).toEqual(args);expect(JSON.stringify(requests.at(-1).messages)).toContain('$concat')
 const prompt=requests[0].messages.filter(m=>m.role==='user').flatMap(m=>m.content??[]).map(b=>b.text??'').join('')
 expect(prompt).not.toContain('唯一交付格式');expect(prompt).toContain('规划类型只是建议')
 expect(prompt).not.toContain('最终输出严格 JSON');expect(prompt).not.toContain('仅输出完整JSON');expect(prompt.length).toBeLessThan(12000)
 expect(ctx.tools.schemas(children[0]).map(t=>t.name)).not.toContain('submit_component_data')
})

it('retains source-owned submission tools during bounded repair and lets the same child correct again',async()=>{
 const ctx=context();new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'})
 const parent=(await ctx.agents.create({sessionId:'repair-data-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 let queries=0
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 ctx.tools.register(defineTool({name:'public_data_query',description:'Read data',parameters:{operation:{type:'string'},source:{type:'string'},parameters_json:{type:'string'}},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},isConcurrencySafe:()=>true,execute(){queries++;return response}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length;if(n>4)throw Error('Repair did not finish')
   if(n===2){yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'{"version":1,"type":"kpi","table":[]}'}};yield{type:'finish',reason:{kind:'completed'}};return}
   expect(request.tools.map(t=>t.name)).toContain('submit_component_data')
   if(n>=3){expect(request.tools.map(t=>t.name)).not.toContain('public_data_query');expect(request.tools.map(t=>t.name)).toContain('component_presentation_schema')}
   const value=n===1?args:structuredClone(input)
   if(n===3)value.mapping.labels.$map={$concat:[{$path:'name'},'产品']}
   if(n===4)delete value.requests[0].args
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'repair-call-'+n,name:n===1?'public_data_query':'submit_component_data',arguments:JSON.stringify(value)}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const query=workbenchPanelPrompt({title:'ETF',dataMode:'source',originalRequest:'看看资金进出前五'},{title:'资金变动',prompt:'读取真实来源比较产品资金变动',type:'kpi'})
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,signal:controller.signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const original=await handle.result
 expect(original.sourceRecords).toHaveLength(1)
 const repaired=handle.repair({synthesisOnly:true,prompt:'具体校验问题：指标卡不支持 table，保留内容选择合适呈现。'})
 expect(repaired).toBe(handle)
 const result=await repaired.result
 expect(result.stopReason).toBe('completed');expect(result.sourceRecords).toHaveLength(0)
 expect(children).toHaveLength(1);expect(queries).toBe(1);expect(requests).toHaveLength(4)
 expect(resolveBoundComponent(result.output[0].text,original.sourceRecords).data.series[0].values).toEqual([2.1,-3.2])
 expect(JSON.stringify(requests[2].messages)).toContain('指标卡不支持 table')
 expect(ctx.tools.schemas(children[0]).map(t=>t.name)).not.toContain('submit_component_data')
 expect(()=>handle.repair({synthesisOnly:true,prompt:'again'})).toThrow('恢复已结束')
})
