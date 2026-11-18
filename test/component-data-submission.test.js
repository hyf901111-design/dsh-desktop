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
import {resolveBoundComponent,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {createSubagentAdapter,ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {workbenchPanelPrompt,DATA_FIRST_PRESENTATION} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {releaseTimelineScope,observedReleaseTimeline} from '../packages/dsh-research-task-runtime/observed-dated-feed.js'
import {componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'

const args={operation:'query',source:'fixture',parameters_json:'{}'}
const response={source:'Fixture',asOf:'2026-11-06',records:[{name:'甲',value:2.1},{name:'乙',value:-3.2}]}
const record={tool:'public_data_query',args,response}
const input={requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'chart',variant:'horizontal',title:'变动排名',unit:'亿元',asOf:{$from:'q',$path:'asOf'},labels:{$from:'q',$each:'records',$map:{$path:'name'}},series:[{name:'变动',values:{$from:'q',$each:'records',$map:{$path:'value'}}}]}}
const cleanup=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
function context(){const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});cleanup.push(()=>ctx.fiber.dispose());return ctx}
async function fixture(validateSnapshot,options={}){
 const ctx=context(),child=(await ctx.agents.create({sessionId:'data-child',agentOptions:{}})).agent,parent=(await ctx.agents.create({sessionId:'data-parent',agentOptions:{}})).agent
 const controller=new AbortController(),records=[structuredClone(record)],submission=createComponentDataSubmission({observeRecords:()=>records,signal:controller.signal,validateSnapshot,...options});cleanup.push(submission.dispose);child.ctx.tools.restrict({allow:[]});submission.register(child)
 return{ctx,child,parent,records,submission,controller,invoke:(value=input,agent=child,id='data-submit')=>ctx.tools.execute({name:'submit_component_data',arguments:value,callId:id,agent,signal:controller.signal})}
}
const receipt=(callId='data-submit',isError=false)=>({type:'tool/result',data:{message:{source:{callId},content:[{type:'tool-result',toolCallId:callId,isError,content:[{type:'text',text:'{"accepted":true}'}]}]}}})
it('delivers parsed material without fabricated structured requests and waits for its own successful receipt',async()=>{
 const validateArtifact=(artifact,records)=>{
  expect(records).toHaveLength(1)
  if(!artifact.source?.text)throw Error('保留实际材料出处')
  return JSON.stringify(artifact)
 }
 const f=await fixture(undefined,{validateArtifact}),artifact={version:1,type:'mind-map',title:'关系',content:'# 主体\n- 部门\n  - 岗位\n    - 职责\n      - 依据',source:{title:'附件',text:'原始文档 P4–P6'}}
 let done=false;f.submission.result.then(()=>{done=true})
 expect((await f.invoke({artifact:{...artifact,source:undefined}})).isError).toBe(true)
 expect((await f.invoke({artifact},f.parent)).isError).toBe(true)
 expect((await f.invoke({artifact,requests:[]})).isError).toBe(true)
 expect((await f.invoke({artifact})).isError).toBe(false)
 f.submission.accept(receipt('other-call'));f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 expect(JSON.parse((await f.submission.result).output[0].text)).toEqual(artifact)
 expect((await f.invoke({artifact})).isError).toBe(true)
})
it.each(['refresh','unvalidated'])('rejects static delivery for %s instead of bypassing its contract',async mode=>{
 const f=await fixture(undefined,mode==='refresh'?{bindingRequested:true,validateArtifact:JSON.stringify}:{})
 const result=await f.invoke({artifact:{version:1,type:'markdown',title:'说明',content:'来源内容'}})
 expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain(mode==='refresh'?'自动刷新':'校验边界不可用')
})
it('offers document and custom presentation schemas without pretending that every type is a KPI',async()=>{
 const f=await fixture()
 const lookup=async type=>f.ctx.tools.execute({name:'component_presentation_schema',arguments:{type},callId:'schema-'+type,agent:f.child,signal:f.controller.signal})
 for(const type of ['mind-map','summary','markdown','html']){
  const result=await lookup(type);expect(result.isError).toBe(false);expect(JSON.stringify(result)).toContain(type)
 }
 expect((await lookup('unsupported')).isError).toBe(true)
})
it('lists only callable presentation types while preserving successful source references',async()=>{
 const f=await fixture(),lookup=arguments_=>f.ctx.tools.execute({name:'component_presentation_schema',arguments:arguments_,callId:'presentation-catalog',agent:f.child,signal:f.controller.signal})
 const catalogResult=await lookup({});expect(catalogResult.isError).toBe(false)
 const catalog=JSON.parse(catalogResult.content[0].text)
 expect(catalog.types).toEqual(expect.arrayContaining(['table','chart','market','html','view']))
 expect(catalog.variants.chart).toContain('horizontal');expect(catalog.sources).toHaveLength(1)
 for(const type of catalog.types){
  const result=await lookup({type});expect(result.isError,type).toBe(false)
  const value=JSON.parse(result.content[0].text);expect(value.type).toBe(type);expect(value.schema).toBeTruthy();expect(value.sources).toEqual(catalog.sources)
 }
 expect(f.records).toEqual([record])
})
it.each([['research.table','table'],['research.html','html'],['research.chart','chart','horizontal'],['research.market','market','charting']])('resolves the exact design alias %s without fetching or changing records',async(alias,type,variant)=>{
 const f=await fixture(),lookup=arguments_=>f.ctx.tools.execute({name:'component_presentation_schema',arguments:arguments_,callId:'presentation-alias',agent:f.child,signal:f.controller.signal})
 const canonical=await lookup({type,...(variant?{variant}:{})}),aliased=await lookup({type:alias,...(variant?{variant}:{})})
 expect(aliased.isError).toBe(false);expect(JSON.parse(aliased.content[0].text)).toEqual(JSON.parse(canonical.content[0].text))
 expect(f.records).toEqual([record])
})
it('rejects invented presentation names and inapplicable variants while keeping real schemas available',async()=>{
 const f=await fixture(),lookup=arguments_=>f.ctx.tools.execute({name:'component_presentation_schema',arguments:arguments_,callId:'presentation-conflict',agent:f.child,signal:f.controller.signal})
 for(const type of ['research.table.invented','research.research.table','research.chart.invented'])expect((await lookup({type})).isError).toBe(true)
 for(const [type,variant] of [['research.chart','invented'],['table','horizontal']]){
  const result=await lookup({type,variant});expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain('不适用')
 }
 expect((await lookup({type:'research.table'})).isError).toBe(false)
})
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
it('keeps real rows when an optional fetch timestamp is missing, without forgiving missing business values',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 f.records[0].response.dataTime='2026-11-06'
 candidate.mapping.asOf.$path='receivedAt'
 const bad=structuredClone(candidate);bad.mapping.series[0].values.$map.$path='unit_nav'
 expect((await f.invoke(bad)).isError).toBe(true)
 expect(f.submission.lastIssue()).toContain('unit_nav')
 expect((await f.invoke(candidate)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const snapshot=resolveBoundComponent((await f.submission.result).output[0].text,f.records)
 expect(snapshot.data.series[0].values).toEqual([2.1,-3.2]);expect(snapshot.data.asOf).toContain('2026-11-06')
})

it.each(['empty','missing-field'])('automatically reacquires after a %s result rather than doing a tool-free formatting retry',async mode=>{
 const originalRequest='对比至少2个产品的真实净值'
 const prompt=workbenchPanelPrompt({title:'净值比较',dataMode:'source',originalRequest},{title:'净值比较',type:'table',prompt:originalRequest})
 const previous={...record,response:{records:mode==='empty'?[]:[{name:'甲',manager:'示例机构'}]}}
 const followup={...record,args:{...args,source:'verified-alternative'},response:{source:'Fixture',asOf:'2026-11-06',records:[{name:'甲',unit_nav:1.15},{name:'乙',unit_nav:1.18}]}}
 const ready={version:1,type:'data-bound',requests:[{key:'q',tool:followup.tool,args:followup.args}],mapping:{version:1,type:'table',title:'净值比较',columns:['名称','净值'],rows:{$from:'q',$each:'records',$map:[{$path:'name'},{$path:'unit_nav'}]}}}
 const starts=[]
 const forbiddenRepair=()=>{throw Error('Insufficient acquisition must not enter format-only repair')}
 const adapter={dispose:async()=>{},start:async request=>{
  starts.push(request)
  const result=starts.length===1?{stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,sourceRecords:[previous],output:[],submissionIssue:mode==='missing-field'?'接口缺少字段：unit_nav':undefined}:{stopReason:'completed',sourceRecords:[followup],output:[{type:'text',text:JSON.stringify(ready)}]}
  return{childSessionId:'acquisition-'+starts.length,result:Promise.resolve(result),dispose:async()=>{},repair:forbiddenRepair}
 }}
 const runtime=new ResearchTaskRuntime({adapter,storage:{load:async()=>undefined,save:async()=>{}},createId:()=> 'acquisition-task'})
 cleanup.push(()=>runtime.dispose())
 await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt},{workbenchRequest:{dataMode:'source',originalRequest},sourceRequirement:originalRequest,sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:originalRequest}})
 await runtime.tasks.get('acquisition-task').runPromise
 const task=runtime.inspect({parentSessionId:'parent',taskId:'acquisition-task'})
 expect(task.state,task.error).toBe('completed');expect(starts).toHaveLength(2)
 expect(starts[1].synthesisOnly).toBe(false);expect(starts[1].retainedSourceRecords).toEqual([previous]);expect(starts[1].prompt).toContain('续接取数')
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

it.each(['mind-map','markdown'])('finishes a real child with %s from webpage prose through the static submission path',async type=>{
 const ctx=context();new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'})
 const parent=(await ctx.agents.create({sessionId:'prose-'+type,agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[]
 let fetches=0,queries=0
 ctx.tools.register(defineTool({name:'public_data_query',description:'Structured data',parameters:{},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},isConcurrencySafe:()=>true,execute(){queries++;return response}}))
 const url='https://vuejs.org/guide/introduction.html',body='Vue is a framework for building user interfaces. Vue builds on standard HTML, CSS and JavaScript, and provides a declarative, component-based programming model.'
 ctx.tools.register(defineTool({name:'web_fetch',description:'Read official guide',parameters:{url:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},isConcurrencySafe:()=>true,execute(){fetches++;return 'Fetched '+url+' (HTTP 200)\n\n'+body}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length;if(n>2)throw Error('Prose submission restarted acquisition')
   const artifact=type==='mind-map'?{version:1,type,title:'Vue 关系',content:'# Vue\n- 用户界面\n  - 声明式组件\n- Web 标准\n  - HTML\n  - CSS\n  - JavaScript',source:{title:'Vue 官方指南',text:body+'\n'+url}}:{version:1,type,title:'Vue 简介',content:body+'\n\n[官方指南]('+url+')'}
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'prose-'+n,name:n===1?'web_fetch':'submit_component_data',arguments:JSON.stringify(n===1?{url}:{artifact})}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const query=workbenchPanelPrompt({title:'开发说明',dataMode:'source',originalRequest:'读取官方指南，梳理关系与说明'},{title:'Vue 简介',prompt:'仅使用 Vue 官方指南的真实正文，保留原始出处',type})
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,signal:controller.signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const result=await handle.result
 expect(result.stopReason).toBe('completed');expect(requests).toHaveLength(2);expect(fetches).toBe(1);expect(queries).toBe(0)
 expect(result.sourceRecords).toHaveLength(1);expect(result.output[0].text).toContain(type==='mind-map'?'Vue 关系':body)
 expect(result.sourceRecords[0].tool).toBe('web_fetch')
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

it('submits one of several observed calls by sourceRef and serializes the original request', async () => {
 const f=await fixture()
 const other={...record,args:{...args,parameters_json:'{"series":"second"}'},response:{...response,records:[{name:'乙',value:8}]}}
 f.records.push(other)
 const lookup=await f.ctx.tools.execute({name:'component_presentation_schema',arguments:{},callId:'sources',agent:f.child,signal:f.controller.signal})
 expect(lookup.isError).toBe(false)
 const {sources}=JSON.parse(lookup.content[0].text)
 expect(sources).toHaveLength(2)
 const candidate={...input,requests:[{key:'q',sourceRef:sources[1].sourceRef}]}
 expect((await f.invoke({...candidate,requests:[{key:'q',sourceRef:'other-task'}]})).isError).toBe(true)
 expect((await f.invoke({...candidate,requests:[{...candidate.requests[0],tool:'web_fetch'}]})).isError).toBe(true)
 expect((await f.invoke({...candidate,requests:[{...candidate.requests[0],args}]})).isError).toBe(true)
 expect((await f.invoke({...candidate,requests:[{...candidate.requests[0],tool:'public_data_query',args:other.args}]})).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const text=(await f.submission.result).output[0].text
 expect(JSON.parse(text).requests).toEqual([{key:'q',tool:'public_data_query',args:other.args}])
 expect(resolveBoundComponent(text,f.records).data.series[0].values).toEqual([8])
})

it('maps original web object and array paths without changing row scope or provenance', async () => {
 const f=await fixture()
 const sourceUrl='https://example.com/repos/sample'
 const listUrl=sourceUrl+'/releases'
 f.records.splice(0,1,
  {tool:'web_fetch',purpose:'snapshot',args:{url:sourceUrl},response:{source:'example.com',sourceUrl,data:{stargazers_count:53}}},
  {tool:'web_fetch',purpose:'snapshot',args:{url:listUrl},response:{source:'example.com',sourceUrl:listUrl,records:[{name:'v2',downloads:4},{name:'v1',downloads:9}]}})
 const candidate={
  requests:f.records.map((source,i)=>({key:i===0?'repo':'releases',tool:source.tool,args:source.args})),
  mapping:{type:'kpi',version:1,title:'Repository observations',items:[
   {label:'Stars',value:{$from:'repo',$path:'stargazers_count'}},
   {label:'First release',value:{$from:'releases',$path:'[0].downloads'}}]}
 }
 const bad=structuredClone(candidate)
 bad.mapping.items[0].value.$path='nonexistent'
 expect((await f.invoke(bad)).isError).toBe(true)
 expect((await f.invoke(candidate)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const output=(await f.submission.result).output[0].text
 expect(resolveComponentSnapshot(output,f.records).data.items.map(item=>item.value)).toEqual(['53','4'])
 const chart=structuredClone(input.mapping)
 delete chart.asOf
 chart.labels={$from:'releases',$each:'',$map:{$path:'name'}}
 chart.series=[{name:'Downloads',values:{$from:'releases',$each:'',$path:'downloads'}}]
 const mapped=resolveComponentSnapshot(JSON.stringify({type:'data-bound',version:1,requests:candidate.requests,mapping:chart}),f.records)
 expect(mapped.data.labels).toEqual(['v2','v1'])
 expect(mapped.data.series[0].values).toEqual([4,9])
})

it('accepts a JSON-wrapped MCP parameter object only when it selects the same observed request',async()=>{
 const f=await fixture(),tool='ework__t_abcd'
 const args={api_name:'index_daily',params:{ts_code:'000300.SH',start_date:'20261101'},fields:'ts_code,close',limit:100}
 f.records.splice(0,1,{tool,args,response},{tool,args:{...args,params:{...args.params,ts_code:'000905.SH'}},response:{...response,records:[{name:'丙',value:7}]}})
 const candidate={...input,requests:[{key:'q',tool,args:{...args,params:JSON.stringify(args.params)}}]}
 const wrong={...candidate,requests:[{key:'q',tool,args:{...args,params:JSON.stringify({...args.params,start_date:'20261001'})}}]}
 expect((await f.invoke(wrong)).isError).toBe(true)
 expect((await f.invoke(candidate)).isError).toBe(false)
 const text=JSON.stringify({version:1,type:'data-bound',...candidate})
 const bound=resolveBoundComponent(text,f.records)
 expect(bound.recipe.requests[0].args).toEqual(args)
 expect(bound.data.series[0].values).toEqual([2.1,-3.2])
 expect(resolveComponentSnapshot(text,f.records).data.series[0].values).toEqual([2.1,-3.2])
})

it('keeps grouped comparison charts valid when the default sign coloring is explicitly off',async()=>{
 const f=await fixture(),candidate=structuredClone(input)
 candidate.mapping.variant='groupedBar'
 candidate.mapping.colorBySign=false
 candidate.mapping.series.push({...candidate.mapping.series[0],name:'对照'})
 expect((await f.invoke({...candidate,mapping:{...candidate.mapping,colorBySign:true}})).isError).toBe(true)
 expect((await f.invoke(candidate)).isError).toBe(false)
})

it('accepts a verified release list with a long body in the original submit call',async()=>{
 const f=await fixture(),sourceUrl='https://example.com/api/releases',link='https://example.com/releases/v2'
 const body='完整发布说明。'.repeat(500)
 f.records.splice(0,1,{tool:'web_fetch',purpose:'snapshot',args:{url:sourceUrl},response:{
  source:'example.com',sourceUrl,records:[{id:21,tag:'v2',published:'2026-11-08T01:02:03Z',link,body}]
 }})
 const candidate={requests:[{key:'q',tool:'web_fetch',args:{url:sourceUrl}}],mapping:{type:'timeline',version:1,title:'发布动态',
  items:{$from:'q',$each:'',$map:{id:{$path:'id'},title:{$path:'tag'},time:{$path:'published'},url:{$path:'link'},summary:{$path:'body'}}}}}
 expect((await f.invoke(candidate)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const result=await f.submission.result
 const snapshot=resolveComponentSnapshot(result.output[0].text,f.records)
 expect(result.stopReason).toBe('completed')
 expect(snapshot.capacitySnapshot).toBe(true)
 expect(snapshot.data.items[0]).toEqual({id:'21',title:'v2',time:'2026-11-08T01:02:03Z',url:link,summary:body})
 expect(JSON.parse(snapshot.output).html).toContain('href="'+link+'"')
})

it('hands a complete oversized release collection from the retrieval step to the host without a model artifact',async()=>{
 const ctx=context()
 new SubagentRuntime(ctx)
 spawn(ctx,{providerName:'spawn'})
 const parent=(await ctx.agents.create({sessionId:'release-handoff',agentOptions:{provider:'fixture',model:'fixture'}})).agent
 const originalRequest='只放一张发布动态卡。请使用公开 GitHub Releases，保留 example/a 和 example/b 最近各 2 条记录，完整保留发布说明。先按时间线呈现，超出容量时切换成可分页来源列表。'
 const query='工作台：测试\n本面板：发布动态\n使用 GitHub Releases。\n仅生成本面板，优先使用 html 类型。'
 const urls=['a','b'].map(repo=>`https://api.github.com/repos/example/${repo}/releases?per_page=2`)
 const body='真实完整发布说明。'.repeat(500),scope=releaseTimelineScope(originalRequest)
 const calls=[]
 ctx.tools.register(defineTool({
  name:'web_fetch',description:'Read an authorized URL.',parameters:{url:{type:'string',required:true}},
  output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:`Fetched ${value.url} (HTTP 200)\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n${JSON.stringify(value.rows)}`}]},
  isConcurrencySafe:()=>true,execute({url}){
   calls.push(url)
   const repo=url.includes('/example/a/')?'a':'b'
   return {url,rows:[1,2].map(index=>({tag_name:'v'+index,draft:false,published_at:`2026-11-0${index}T10:00:00Z`,html_url:`https://github.com/example/${repo}/releases/tag/v${index}`,body}))}
  }
 }))
 let modelSteps=0
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}} async listModels(){return[]}
  async *stream(request){
   modelSteps++
   if(modelSteps!==1)throw Error('host should not need a model artifact')
   expect(request.tools.map(tool=>tool.name)).toContain('web_fetch')
   for(const [index,url] of urls.entries()){
    yield {type:'block-start',index,blockType:'tool-call'}
    yield {type:'block-end',index,block:{type:'tool-call',id:'release-'+index,name:'web_fetch',arguments:JSON.stringify({url})}}
   }
   yield {type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController()
 cleanup.push(()=>adapter.dispose())
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest,dataMode:'source'}},signal:controller.signal,onSessionEvent:()=>{}})
 cleanup.push(()=>handle.dispose())
 const result=await handle.result
 expect(result.stopReason).toBe('completed')
 expect(new Set(calls)).toEqual(new Set(urls))
 const snapshot=resolveComponentSnapshot(result.output[0].text,result.sourceRecords)
 expect(snapshot.capacitySnapshot).toBe(true)
 expect(snapshot.data.items).toHaveLength(4)
 expect(snapshot.data.items.every(item=>item.summary===body)).toBe(true)
 expect(observedReleaseTimeline(scope,result.sourceRecords.slice(0,1),'发布动态')).toBeUndefined()
 const short=structuredClone(result.sourceRecords)
 short[0].response.records.pop()
 expect(observedReleaseTimeline(scope,short,'发布动态')).toBeUndefined()
 expect(releaseTimelineScope(originalRequest+' 仅保留稳定版。')).toBeNull()
})

it('returns nested response paths with the requested schema in one bounded call without copying the dataset',async()=>{
 const f=await fixture()
 f.records.splice(0,1,{tool:'web_fetch',args:{url:'https://example.test/series'},purpose:'snapshot',response:{data:{result:{data:Array.from({length:100},(_,i)=>({SOLAR_DATE:'2026-11-'+String(i+1),RATE:1.2+i,SECRET:'do-not-copy-records'}))}},sourceUrl:'https://example.test/series'}})
 const lookup=await f.ctx.tools.execute({name:'component_presentation_schema',arguments:{type:'chart',variant:'line'},callId:'schema-source',agent:f.child,signal:f.controller.signal})
 expect(lookup.isError).toBe(false)
 const value=JSON.parse(lookup.content[0].text)
 expect(value.schema).toBeTruthy();expect(value.sources).toHaveLength(1)
 expect(value.sources[0].collections).toContainEqual({path:'data.result.data',count:100,fields:[{name:'SOLAR_DATE',type:'string'},{name:'RATE',type:'number'},{name:'SECRET',type:'string'}]})
 expect(value.sources[0].sourceRef).toMatch(/^[a-f0-9]{24}$/)
 expect(JSON.stringify(value.sources)).not.toContain('do-not-copy-records')
 expect(JSON.stringify(value.sources).length).toBeLessThan(3500)
})
it('submits content through its own validation and successful receipt boundary',async()=>{
 const validateContent=(snapshot,records)=>{
  expect(snapshot.data.rows).toEqual([['甲',0],['乙',2]])
  expect(records).toHaveLength(1)
  return JSON.stringify(snapshot.data)
 }
 const f=await fixture(undefined,{validateContent,options:{panelRequest:'完整资料只要表格。'}}),content={title:'比较',rows:[{name:'甲',value:0},{name:'乙',value:2}]}
 let done=false;f.submission.result.then(()=>{done=true})
 expect((await f.invoke({content},f.parent)).isError).toBe(true)
 expect((await f.invoke({content,artifact:{}})).isError).toBe(true)
 expect((await f.invoke({content})).isError).toBe(false)
 f.submission.accept(receipt('unrelated'));f.submission.accept({type:'step/end'});await Promise.resolve()
 expect(done).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 expect(JSON.parse((await f.submission.result).output[0].text).rows).toEqual([['甲',0],['乙',2]])
})
it('requires a real refresh recipe when submitted content requested automatic updates',async()=>{
 const f=await fixture(undefined,{bindingRequested:true,validateContent:()=>{throw Error('must not call')}})
 const result=await f.invoke({content:{title:'快照',body:'正文'}})
 expect(result.isError).toBe(true)
 expect(JSON.stringify(result)).toContain('自动刷新')
})
it('retains the real missing-cohort issue across title and empty retries until its successful delivery receipt',async()=>{
 const validateContent=snapshot=>{
  const issue=componentDeliveryScopeIssue(snapshot.data,'至少比较8只基金的收益')
  if(issue)throw Error(issue)
  return JSON.stringify(snapshot.data)
 }
 const f=await fixture(undefined,{validateContent}),content=count=>({title:'收益比较',rows:Array.from({length:count},(_,i)=>({name:'基金'+i,value:i+1}))})
 expect((await f.invoke({content:content(5)})).isError).toBe(true)
 const issue=f.submission.acquisitionIssue();expect(issue).toContain('实际交付5')
 expect((await f.invoke({content:{note:'资料未齐'}})).isError).toBe(true);expect(f.submission.lastIssue()).toContain('content.title')
 for(let i=0;i<3;i++)expect((await f.invoke({content:{title:'收益比较',note:'资料未齐'}})).isError).toBe(true)
 expect(f.submission.lastIssue()).toContain('尚无正文或记录');expect(f.submission.acquisitionIssue()).toBe(issue)
 expect((await f.invoke({content:content(8)},f.parent)).isError).toBe(true);expect(f.submission.acquisitionIssue()).toBe(issue)
 expect((await f.invoke({content:content(8)})).isError).toBe(false)
 f.submission.accept(receipt('unrelated'));f.submission.accept({type:'step/end'});expect(f.submission.acquisitionIssue()).toBe(issue)
 f.submission.accept(receipt('data-submit',true));f.submission.accept({type:'step/end'});expect(f.submission.acquisitionIssue()).toBe(issue)
 expect((await f.invoke({content:content(8)})).isError).toBe(false)
 f.submission.accept(receipt());expect(f.submission.acquisitionIssue()).toBe(issue)
 f.submission.accept({type:'step/end'})
 const delivered=JSON.parse((await f.submission.result).output[0].text)
 expect(delivered.variant).toBe('horizontal')
 expect(delivered.detailRows).toHaveLength(8)
 expect(f.submission.acquisitionIssue()).toBeUndefined();expect(f.submission.lastIssue()).toBeUndefined()
})
it('keeps an observed missing-field issue local and does not clear it after cancellation',async()=>{
 const f=await fixture(),other=await fixture(),bad=structuredClone(input)
 bad.mapping.series[0].values.$map.$path='unit_nav'
 expect((await f.invoke(bad)).isError).toBe(true)
 const issue=f.submission.acquisitionIssue();expect(issue).toMatch(/^接口缺少字段：unit_nav/u)
 expect((await f.invoke({content:{note:'缺失'}})).isError).toBe(true)
 expect(f.submission.acquisitionIssue()).toBe(issue);expect(other.submission.acquisitionIssue()).toBeUndefined()
 f.controller.abort();expect((await f.invoke()).isError).toBe(true)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 expect(f.submission.acquisitionIssue()).toBe(issue);expect(f.ctx.tools.schemas(f.child)).toEqual([])
})
