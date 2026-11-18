import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {captureWorkbenchObservedSources} from '../packages/dsh-research-task-runtime/workbench-observed-sources.js'
import {matchObservedContent} from '../packages/dsh-research-task-runtime/observed-content-refresh.js'
import {prepareObservedWorkbenchRefresh} from '../packages/dsh-research-task-runtime/workbench-observed-refresh.js'
import {compileComponentContent} from '../packages/dsh-research-task-runtime/component-content.js'
import ecbPanel from './fixtures/workbench-ecb-currency-content.json'

const dispose=[]
afterEach(async()=>{for(const close of dispose.splice(0).reverse())await close()})
const publicTool='public_data_query',plugin='ework__t_abc123'
const human=text=>({type:'user/message',data:{id:'user',source:{kind:'user'},content:[{type:'text',text}]}})
const pair=(name,args,response,index)=>[
 {type:'tool/call',data:{callId:index,name,arguments:JSON.stringify(args)}},
 {type:'tool/result',data:{message:{source:{kind:'tool',callId:index},content:[{type:'tool-result',toolCallId:index,isError:false,content:[{type:'text',text:JSON.stringify(response)}]}]}}},
]
const observedRates=ecbPanel.content.rows
const ecbArgs=currency=>({operation:'query',source:'ecb-fx',parameters_json:JSON.stringify({currency,limit:60})})
const ecbResponse=(currency,rows=observedRates)=>({
 sourceId:'ecb-fx',source:'欧洲央行日参考汇率',dataTime:rows.at(-1).date,units:{value:currency+' per EUR'},
 records:rows.map(row=>({time:row.date,value:row[currency==='USD'?'eurusd':'eurcny'],currency,base:'EUR',status:'A'})).reverse(),
})
const ecbEvents=()=>['USD','CNY'].flatMap(currency=>pair(publicTool,ecbArgs(currency),ecbResponse(currency),currency))
async function fixture(text,events,execute,effect='read'){
 const session={id:'board-refresh',events:[human(text),...events]},sources=[{name:publicTool},{name:plugin},{name:'financial_query'}]
 const directory=await mkdtemp(join(tmpdir(),'observed-refresh-'))
 dispose.push(()=>rm(directory,{recursive:true,force:true}))
 const documents=new Map(),bindings=[],tools=new Map();let now=Date.parse('2026-11-18T00:00:00Z'),revision=1
 const engine=new ComponentDataRefresh({now:()=>now,owner:()=>'owner',load:async()=>bindings,save:async values=>bindings.splice(0,bindings.length,...structuredClone(values)),
  validateRequest:async request=>({...request,connectionId:request.toolId,connectionRevision:1,schemaDigest:'tested',sourceName:request.toolId}),
  inspect:async binding=>({spec:documents.get(binding.nodeId),writable:true,revision:String(revision)}),
  apply:async(binding,_revision,spec)=>{documents.set(binding.nodeId,spec);revision++},execute})
 await engine.load();dispose.push(()=>engine.dispose())
 const adapter={start:vi.fn(),bindData:vi.fn(async(task,recipe,output)=>engine.bind({...recipe,sessionId:session.id,nodeId:task.canvasNodeId,workspaceId:'workspace'},JSON.parse(output),{preserveSettings:true}))}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}}});dispose.push(()=>runtime.dispose())
 const ctx={get:()=>({snapshot:{tools:[{id:'t_abc123',effect}]}}),agents:{get:()=>({})},tools:{schemas:()=>sources,register:tool=>{tools.set(tool.name,tool);return()=>{}}},webServer:{register:()=>()=>{}}}
 const saved=join(directory,'workbench.json')
 dispose.push(await registerWorkbench(ctx,runtime,{filePath:saved,isTrustedRequest:()=>true,readJsonBody:async()=>({})}))
 const exec={agent:{session},signal:new AbortController().signal}
 return {engine,adapter,documents,bindings,session,saved,
  catalog:()=>tools.get('research_workbench_source_catalog').execute({},exec),
  async create(plan){
   const receipt=await tools.get('research_workbench_create').execute(plan,exec)
   for(const task of runtime.tasks.values())if(task.finalOutput)documents.set(task.canvasNodeId,JSON.parse(task.finalOutput))
   return receipt
  },
  async due(minutes){now+=minutes*60000;engine.setVisible(session.id,true);await engine.tick()},
  model:node=>readTemplateModel(documents.get(node)).data,
 }
}
it('binds the delivered ECB chart to the two successful parent calls, joins by published day on every tick and retains the last chart on failure',async()=>{
 const roll=[...observedRates,{date:'2026-11-18',eurusd:1.1,eurcny:7.48}]
 const query=vi.fn(async(_binding,_request,args)=>ecbResponse(JSON.parse(args.parameters_json).currency,roll))
 const f=await fixture('生成一个外汇宏观联动研究工作台。',ecbEvents(),query)
 const receipt=await f.create({requestId:'fx',title:'外汇观察',panels:[ecbPanel]})
 expect(receipt.status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled()
 const [binding]=f.bindings
 expect(binding).toMatchObject({enabled:true,intervalMinutes:1440,status:'idle'})
 expect(binding.requests.map(r=>r.args)).toEqual([ecbArgs('USD'),ecbArgs('CNY')])
 expect(query).not.toHaveBeenCalled()
 const node=binding.nodeId,first=f.model(node)
 expect(first.series[0].values).toEqual(observedRates.map(row=>row.usdcny));expect(first.detailRows).toHaveLength(5)
 await f.due(1440)
 const second=f.model(node),success=f.bindings[0].lastSuccess
 expect(second.labels).toEqual(roll.slice(-5).map(row=>row.date));expect(second.series[0].values.at(-1)).toBe(6.8)
 expect(second.detailRows.at(-1)).toEqual(['2026-11-18',1.1,7.48,6.8,'2026-11-18'])
 expect(second.asOf).toBe('2026-11-18');expect(second.body).toContain('生成时说明（2026-11-17）')
 expect(f.bindings[0]).toMatchObject({status:'success',successSequence:1});expect(query).toHaveBeenCalledTimes(2)
 query.mockImplementation(async(_b,_r,args)=>ecbResponse(JSON.parse(args.parameters_json).currency,JSON.parse(args.parameters_json).currency==='CNY'?observedRates:roll))
 await f.due(1440)
 expect(f.model(node)).toEqual(second);expect(f.bindings[0]).toMatchObject({status:'error',lastSuccess:success,failures:1})
 query.mockRejectedValue(Error('provider-test-private-credential'));await f.engine.refresh(binding.id)
 expect(f.model(node)).toEqual(second);expect(JSON.stringify(f.bindings)).not.toContain('provider-test-private-credential')
 await f.engine.configure(binding.id,{intervalMinutes:10,enabled:false});await f.due(1440);expect(query).toHaveBeenCalledTimes(6)
})

const sensorRows=[{station:'北站',level:18.4},{station:'南站',level:22.1}]
const sensor=(records=sensorRows,asOf='2026-11-17')=>({source:'已授权的水位传感器',asOf,records})
it('refreshes an ordinary authored ranking only if its complete attributed records match one successful query',async()=>{
 const args={basin:'test',limit:10},events=pair(plugin,args,sensor(),'sensor')
 const changed=[{station:'北站',level:24.5},{station:'南站',level:21},{station:'东站',level:23}]
 const query=vi.fn(async()=>sensor(changed,'2026-11-18'))
 const f=await fixture('创建水位监控工作台，每10分钟刷新。',events,query)
 const title='测站水位比较', content={title,columns:[{key:'station',label:'名称'},{key:'level',label:'水位'}],
  rows:sensorRows,sources:[{label:sensor().source}],asOf:'2026-11-17',unit:'米'}
 const item={title,type:'table',prompt:'比较各测站的最新水位',content}
 await f.create({requestId:'authored',title:'区域水位',panels:[item]})
 expect(f.bindings).toHaveLength(1);const [binding]=f.bindings
 expect(binding).toMatchObject({enabled:true,intervalMinutes:10,mapping:{observedWorkbench:{kind:'content'}}})
 expect(f.model(binding.nodeId).series[0].values).toEqual([22.1,18.4]);await f.due(10)
 expect(f.model(binding.nodeId)).toMatchObject({labels:['北站','东站','南站'],unit:'米',asOf:'2026-11-18',detailRows:[['北站',24.5],['东站',23],['南站',21]]})
 const entry={rows:sensorRows,label:sensor().source,response:sensor()},model=f.model(binding.nodeId)
 for(const difference of [{rows:sensorRows.slice(0,1)},{rows:[sensorRows[0],{station:'南站',level:16}]},{asOf:'2026-10-01'},{sources:[{label:'另一份报告'}]}]){
  expect(matchObservedContent({...content,...difference},model,[entry])).toBeUndefined()
 }
 expect(matchObservedContent(content,model,[entry,entry])).toBeUndefined()
})
it('replays an authorized read-only connector through both a prepared chart and a shared filtered view',async()=>{
 const args={basin:'test',limit:10},changed=[{station:'北站',level:20.3},{station:'南站',level:21.1},{station:'东站',level:18}]
 const query=vi.fn(async()=>sensor(changed,'2026-11-18'))
 const f=await fixture('创建水位监控工作台，每10分钟刷新。',pair(plugin,args,sensor(),'sensor'),query)
 const {sourceRef}=(await f.catalog()).sources[0]
 const plan={requestId:'monitor',title:'水位监控',sharedDatasets:[{id:'sensors',label:'测站',sourceRef,identity:'station',fields:[{key:'station',label:'测站'},{key:'level',label:'水位',unit:'米'}]}],
  panels:[{title:'测站水位图',type:'chart',prompt:'比较各测站的水位',sourceView:{sourceRef,chart_spec:{chartType:'Bar Chart',encodings:{x:{field:'station'},y:{field:'level'}},unit:'米'}}},
   {title:'监控明细',type:'view',prompt:'保留每个测站的水位与筛选。',view:{dataset:'sensors',filters:['station'],sections:[{kind:'records',fields:['station','level']}]}}]}
 const receipt=await f.create(plan)
 expect(receipt.status).toBe('prepared');expect(f.bindings).toHaveLength(2);expect(f.adapter.start).not.toHaveBeenCalled()
 expect(f.bindings.every(b=>b.intervalMinutes===10&&b.enabled&&isOriginalQuery(b))).toBe(true)
 function isOriginalQuery(binding){return binding.requests.length===1&&binding.requests[0].toolId==='t_abc123'&&JSON.stringify(binding.requests[0].args)===JSON.stringify(args)}
 const chart=f.bindings.find(b=>b.templateId==='chart.bar'),view=f.bindings.find(b=>b.templateId==='view')
 await f.due(10)
 expect(f.model(chart.nodeId).series[0].values).toEqual([20.3,21.1,18])
 expect(f.model(view.nodeId).dataset.records).toEqual(changed.map(row=>({id:row.station,...row})))
 expect(f.model(view.nodeId).view.filters).toEqual(['station']);expect(f.bindings.every(b=>b.dataAsOf==='2026-11-18')).toBe(true)
 expect(query).toHaveBeenCalledOnce()
 query.mockResolvedValue({...sensor(),status:'partial'});await f.due(10)
 expect(f.bindings.every(b=>b.status==='error')).toBe(true);expect(f.model(chart.nodeId).labels).toHaveLength(3)
 expect(f.model(view.nodeId).dataset.records).toHaveLength(3)
 expect((await f.create(plan)).planId).toBe(receipt.planId);expect(f.bindings).toHaveLength(2)
})
it.each(['创建截至2026-11-17的外汇历史工作台。','只保留静态快照，创建外汇工作台。'])('keeps an explicit snapshot fixed: %s',async text=>{
 const f=await fixture(text,ecbEvents(),vi.fn())
 await f.create({requestId:'fixed',title:'外汇资料',panels:[ecbPanel]})
 expect(f.bindings).toEqual([]);expect(f.documents.size).toBe(1)
})
it('saves manual-only FX with usable requests and no automatic execution',async()=>{
 const query=vi.fn(async(_binding,_request,args)=>ecbResponse(JSON.parse(args.parameters_json).currency))
 const f=await fixture('创建外汇研究工作台，暂停自动刷新。',ecbEvents(),query)
 await f.create({requestId:'manual',title:'汇率资料',panels:[ecbPanel]})
 expect(f.bindings[0]).toMatchObject({intervalMinutes:0,enabled:false})
 await f.due(2880);expect(query).not.toHaveBeenCalled();await f.engine.refresh(f.bindings[0].id);expect(query).toHaveBeenCalledTimes(2)
})
it('omits nested credentials and signed URLs before any parent receipt is persisted or offered for replay',()=>{
 const cases=[{parameters_json:'{"api_key":"sensitive"}'},{headers:{Authorization:'Bearer sensitive'}},{url:'https://example.org/path?X-Amz-Signature=sensitive'}]
 const events=[human('创建监控工作台'),...cases.flatMap((args,i)=>pair(plugin,args,sensor(),String(i)))]
 expect(captureWorkbenchObservedSources({session:{events},messageId:'user',schemas:[{name:plugin}]})).toBeUndefined()
})
it('requires every delivered ECB observation and plotted point to agree with the published values and currency directions',()=>{
 const observed=['USD','CNY'].map(currency=>({tool:publicTool,args:ecbArgs(currency),response:ecbResponse(currency)}))
 const {data:artifact}=compileComponentContent(ecbPanel.content)
 const options={observed,originalRequest:'创建汇率研究工作台',tools:new Set([publicTool])}
 const check=data=>prepareObservedWorkbenchRefresh({title:data.title,prompt:'观察美元兑人民币汇率',artifact:data},options)
 expect(check(artifact)?.recipe.mapping.observedWorkbench.kind).toBe('ecb-cross-rate')
 for(const change of [
  data=>{data.detailRows[0][1]+=0.001},data=>{data.detailRows[1][3]+=0.002},
  data=>{data.series[0].values[0]+=0.1},data=>{data.detailRows[0][4]='FX5'},
  data=>{data.sources=[{label:'其他汇率源'}]},
 ]){
  const altered=structuredClone(artifact);change(altered);expect(check(altered)).toBeUndefined()
 }
})
it('retains the initially rendered card if saving its refresh binding is interrupted or denied',async()=>{
 const started=Promise.withResolvers(),release=Promise.withResolvers(),ctx={parentSessionId:'board-refresh'}
 const adapter={start:vi.fn(),bindData:vi.fn(async()=>{started.resolve();await release.promise;throw Error('provider-private-test')})}
 let saved
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async value=>{saved=structuredClone(value)}}});dispose.push(()=>runtime.dispose())
 const observed=['USD','CNY'].map(currency=>({tool:publicTool,args:ecbArgs(currency),response:ecbResponse(currency)}))
 const spec=prepareObservedWorkbenchRefresh({title:ecbPanel.title,prompt:'观察汇率',artifact:compileComponentContent(ecbPanel.content).data},{observed,originalRequest:'创建外汇工作台',tools:new Set([publicTool])})
 const panel={canvasNodeId:'ready',prompt:'工作台：外汇工作台\n本面板：美元汇率\n展示美元汇率。',artifact:spec.data,observedRefreshRecipe:spec.recipe}
 const creating=runtime.startPreparedBatch({...ctx,panels:[panel]})
 await started.promise
 const during=structuredClone(saved),task=during.tasks[0]
 expect(task.state).toBe('running');expect(task.deliveryStatus).toBeUndefined();expect(task.finalOutput).toContain('sherlock-template-data')
 const restored=new ResearchTaskRuntime({adapter,storage:{load:async()=>during,save:async()=>{}}});dispose.push(()=>restored.dispose())
 await restored.restore()
 expect(restored.inspect({...ctx,taskId:task.taskId})).toMatchObject({state:'interrupted',finalOutput:task.finalOutput})
 await runtime.cancel({...ctx,taskId:task.taskId});release.resolve()
 expect((await creating)[0]).toMatchObject({state:'cancelled',finalOutput:task.finalOutput})
 const [denied]=await runtime.startPreparedBatch({...ctx,panels:[{...panel,canvasNodeId:'denied'}]})
 expect(denied).toMatchObject({state:'completed',deliveryStatus:'partial',finalOutput:task.finalOutput})
 expect(denied.unmetRequirements[0]).toContain('刷新设置未能保存');expect(JSON.stringify(saved)).not.toContain('provider-private-test')
})
