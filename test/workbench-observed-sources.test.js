import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {captureWorkbenchObservedSources,restoreWorkbenchObservedSources,WORKBENCH_OBSERVED_SOURCE_LIMITS} from '../packages/dsh-research-task-runtime/workbench-observed-sources.js'
import {restoreWorkbenchHostContext,workbenchObservedSourcesForPolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
import {createWorkbenchSourceSnapshot} from '../packages/dsh-research-task-runtime/workbench-source-snapshot.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'

const clean=[]
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
const human=(id='current',text='用已取得的资料创建工作台，保留全部记录和来源。')=>({type:'user/message',data:{id,source:{kind:'user'},content:[{type:'text',text}]}})
const schemas=[{name:'ework__business',description:'读取实际业务记录'},{name:'ework__schema',description:'获取 API 参数完整定义'},{name:'public_data_query'},{name:'web_fetch'},{name:'financial_query'}]
const response=(count=2)=>({source:'实际业务来源',sourceUrl:'https://example.com/records',receivedAt:'2026-11-11T12:00:00Z',fields:['id','detail','missing'],records:Array.from({length:count},(_,i)=>({id:'R'+i,detail:{labels:['原始字段',String(i)],text:'完整正文 '+i},missing:null})),pagination:{offset:0,limit:count,returned:count,total:10,possiblyMore:true,nextOffset:count},status:'partial',missingFields:['metric']})
const pair=(id='call',name='ework__business',args={entity:'A'},value=response(),extra={})=>[
 {type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}},
 {type:'tool/result',data:{message:{source:{kind:'tool',callId:id},content:[{type:'tool-result',toolCallId:id,content:[{type:'text',text:JSON.stringify(value)}],isError:false,...extra}]}}}
]
const capture=events=>captureWorkbenchObservedSources({session:{events},messageId:'current',schemas})
const context=records=>({sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'保留原始资料'},sourceRequirement:'保留全部记录',workbenchRequest:{originalRequest:'创建真实工作台',dataMode:'source'},sharedObservedRecords:records})

it('captures only successful current human-request tool pairs, never prose, injected messages or another request',()=>{
 const prior=pair('prior'),unpaired=pair('unpaired'),current=pair()
 const events=[human('old'),...prior,unpaired[0],human(),unpaired[1],{type:'assistant/message',data:{message:{content:[{type:'text',text:JSON.stringify(response(15))}]}}},...pair('schema','ework__schema',{},response(20)),...pair('failed','ework__business',{},response(20),{isError:true}),...pair('mismatched','ework__business',{},response(20),{toolCallId:'wrong-id'}),...pair('provider-error','ework__business',{}, {success:false,error:'failed',records:[{invented:true}]}),...pair('hidden','ework__hidden',{},response(20)),...current,human('later'),...pair('later')]
 const observed=capture(events)
 expect(observed).toHaveLength(1);expect(observed[0]).toEqual({tool:'ework__business',args:{entity:'A'},response:response()})
 expect(captureWorkbenchObservedSources({session:{events},messageId:'missing',schemas})).toBeUndefined()
 expect(captureWorkbenchObservedSources({session:{events},messageId:'current',schemas:[]})).toBeUndefined()
})

it('captures observations for the claimed inbox message and ignores later queued or canceled drafts',()=>{
 const queued=id=>({type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[human(id).data]}})
 const removed=outcome=>({type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome}})
 const events=[human('old'),...pair('prior','ework__business',{entity:'prior'}),queued('current'),removed('consumed'),
  ...pair('first','ework__business',{entity:'A'}),queued('discarded'),removed('canceled'),queued('next'),
  ...pair('second','ework__business',{entity:'B'})]
 expect(capture(events).map(record=>record.args.entity)).toEqual(['A','B'])
 expect(captureWorkbenchObservedSources({session:{events},messageId:'next',schemas})).toBeUndefined()
})

it('retains full nested data, original pagination and uncertainty, with detached frozen storage',()=>{
 const source=capture([human(),...pair()]),restored=restoreWorkbenchHostContext(context(source))
 expect(restored.sharedObservedRecords[0].response).toEqual(response())
 expect(Object.isFrozen(restored.sharedObservedRecords[0].response.records[0].detail.labels)).toBe(true)
 expect(restored.sharedObservedRecords[0].response.pagination).toMatchObject({possiblyMore:true,total:10,returned:2})
 const raw=structuredClone(source);raw[0].response.records[0].detail.text='changed';expect(restored.sharedObservedRecords[0].response.records[0].detail.text).toBe('完整正文 0')
})

it('deduplicates exact requests while retaining distinct source pages and all large shared collections',()=>{
 const pages=[...pair('p0','ework__business',{offset:0},response(265)),...pair('p1','ework__business',{offset:265},response(265)),...pair('p0-later','ework__business',{offset:0},{...response(265),receivedAt:'2026-11-11T12:01:00Z'})]
 const records=capture([human(),...pages]);expect(records).toHaveLength(2);expect(records.reduce((n,r)=>n+r.response.records.length,0)).toBe(530)
 expect(records.find(r=>r.args.offset===0).response.receivedAt).toBe('2026-11-11T12:01:00Z')
 const eight=capture([human(),...Array.from({length:8},(_,i)=>pair('fund'+i,'ework__business',{entity:i},response(265))).flat()])
 expect(eight).toHaveLength(8);expect(eight.reduce((n,r)=>n+r.response.records.length,0)).toBe(2120)
})

it('preserves root arrays and empty successful collections without inventing coverage',()=>{
 const records=capture([human(),...pair('array','financial_query',{intent:'query'},[{id:'A',items:[1,2]}]),...pair('empty','ework__business',{entity:'empty'},{records:[],pagination:{returned:0,possiblyMore:false}})])
 expect(records[0]).toMatchObject({tool:'financial_query',purpose:'snapshot',response:[{id:'A',items:[1,2]}]})
 expect(records[1].response.records).toEqual([])
})

it('rejects invalid or over-budget storage explicitly instead of deleting fields or sources',()=>{
 const record=capture([human(),...pair()])[0]
 expect(()=>restoreWorkbenchObservedSources([{...record,purpose:'discovery'}])).toThrow()
 expect(()=>restoreWorkbenchObservedSources([{...record,args:'not-object'}])).toThrow()
 expect(()=>restoreWorkbenchObservedSources([{...record,response:{value:Infinity}}])).toThrow()
 expect(()=>restoreWorkbenchObservedSources(Array.from({length:129},()=>record))).toThrow(/配额/)
 expect(()=>restoreWorkbenchObservedSources([{...record,response:{records:[{body:'x'.repeat(WORKBENCH_OBSERVED_SOURCE_LIMITS.bytes)}]}}])).toThrow(/未被截取/)
 const events=[human(),...Array.from({length:129},(_,i)=>pair('source'+i,'ework__business',{entity:i})).flat()]
 expect(()=>capture(events)).toThrow(/未被截取/)
})

it('reports an oversized business response instead of handing off only its smaller peers',()=>{
 const oversized={records:[{body:'x'.repeat(2_000_000)}]}
 expect(()=>capture([human(),...pair(),...pair('oversized','ework__business',{entity:'large'},oversized)])).toThrow(/原始记录未被截取/)
 const catalog=pair('catalog','public_data_query',{operation:'catalog'},oversized)
 expect(capture([human(),...pair(),...catalog])).toHaveLength(1)
})

it('can report rejected observations while preserving usable records for the workbench',()=>{
 const events=[human(),...pair(),
  ...pair('oversized','ework__business',{entity:'large'},{records:[{body:'x'.repeat(2_000_000)}]}),
  ...pair('unsafe','ework__business',{entity:'unsafe'},{records:[JSON.parse('{"__proto__":{"polluted":true}}')]}),
  ...pair('other','ework__business',{entity:'B'})]
 const warnings=[]
 const records=captureWorkbenchObservedSources({session:{events},messageId:'current',schemas,onRejected:warning=>warnings.push(warning)})
 expect(records.map(record=>record.args.entity)).toEqual(['A','B'])
 expect(warnings).toEqual([expect.stringContaining('超过宿主保留容量'),expect.stringContaining('无法完整校验')])
 expect(warnings.every(warning=>warning.includes('按原授权补齐缺口'))).toBe(true)
})

it('applies each card source policy without treating saved sources as a new network grant',()=>{
 const plugin=capture([human(),...pair()]),publicArgs={operation:'query',source:'tencent-quotes',parameters_json:'{"symbols":["sh510300"]}'},publicRecord=capture([human(),...pair('public','public_data_query',publicArgs,{sourceId:'tencent-quotes',records:[{symbol:'sh510300'}]})])
 expect(workbenchObservedSourcesForPolicy(plugin,{pluginProhibited:true})).toBeUndefined()
 const policy={pluginRequired:false,pluginProhibited:true,preferenceRequest:'腾讯报价',publicSourceRequests:[publicArgs]}
 expect(workbenchObservedSourcesForPolicy([...plugin,...publicRecord],policy)).toEqual(publicRecord)
 expect(()=>restoreWorkbenchHostContext({...context(plugin),sourcePolicy:policy})).toThrow()
 expect(()=>restoreWorkbenchHostContext({...context(plugin),workbenchRequest:{originalRequest:'模拟工作台',dataMode:'simulated'}})).toThrow()
 expect(()=>restoreWorkbenchHostContext({...context(plugin),workbenchRequest:undefined})).toThrow()
})

async function deliverPluginPanel({refresh=false,childAcquired=false}={}){
 const tool='ework__t_abc123',args={entity:'A'},asOf='2026-11-10';
 const requirement='仅使用 DataYes 获取业务明细，保留原始数据时点。'+(refresh?'每分钟自动刷新。':'仅静态快照。');
 const business={source:'DataYes',asOf,records:[{name:'甲公司',value:123}]};
 const session={events:[human('current',requirement),...pair('parent-business',tool,args,business)]};
 const sharedObservedRecords=captureWorkbenchObservedSources({session,messageId:'current',schemas:[{name:tool,description:'读取业务明细'}]});
 const hostContext={...context(sharedObservedRecords),sourceRequirement:requirement,
  sourcePolicy:{pluginRequired:true,pluginProhibited:false,preferenceRequest:requirement}};
 const snapshot=createWorkbenchSourceSnapshot({hostContext});
 clean.push(snapshot.dispose);
 const table={version:1,type:'table',title:'业务明细',asOf,note:'来源 DataYes',columns:['名称','金额']};
 const artifact=refresh?{version:1,type:'data-bound',requests:[{key:'business',tool,args}],mapping:{...table,
  asOf:{$from:'business',$path:'asOf'},rows:{$from:'business',$each:'records',$map:[{$path:'name'},{$path:'value'}]}}}
  :{...table,rows:[['甲公司',123]]};
 const sourceRecords=[...snapshot.sourceRecords,...(childAcquired?sharedObservedRecords:[])];
 const start=vi.fn(async()=>({childSessionId:'plugin-child',dispose:async()=>{},result:Promise.resolve({
  stopReason:'completed',output:[{type:'text',text:JSON.stringify(artifact)}],sourceRecords
 })}));
 const bindData=vi.fn(async()=>{});
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}}});
 clean.push(()=>runtime.dispose());
 const parentSessionId='plugin-parent';
 const {taskId}=await runtime.start({kind:'container',parentSessionId,canvasNodeId:'table',
  prompt:'工作台：业务资料\n本面板：业务明细\n'+requirement+'\n仅生成本面板，优先使用 table 类型。'},hostContext);
 const inspect=()=>runtime.inspect({parentSessionId,taskId});
 await vi.waitFor(()=>expect(['completed','failed']).toContain(inspect().state));
 return {task:inspect(),start,bindData,sourceRecords,args};
}

it('delivers a named-plugin static table using verified parent records without a duplicate child query',async()=>{
 const {task,start,bindData,sourceRecords}=await deliverPluginPanel();
 expect(sourceRecords.map(record=>record.tool)).toEqual(['workbench_source_read']);
 expect(task.state,task.error).toBe('completed');
 expect(task).not.toHaveProperty('deliveryStatus');
 expect(readTemplateModel(JSON.parse(task.finalOutput)).data).toMatchObject({
  asOf:expect.stringContaining('2026-11-10'),note:expect.stringContaining('DataYes'),rows:[['甲公司',123]]
 });
 expect(start).toHaveBeenCalledOnce();
 expect(bindData).not.toHaveBeenCalled();
});

it('requires the current child to acquire the plugin response before enabling live binding',async()=>{
 const snapshotOnly=await deliverPluginPanel({refresh:true});
 expect(snapshotOnly.task.state).toBe('failed');
 expect(snapshotOnly.task.finalOutput).toBeUndefined();
 expect(snapshotOnly.bindData).not.toHaveBeenCalled();
 const acquired=await deliverPluginPanel({refresh:true,childAcquired:true});
 expect(acquired.task.state,acquired.task.error).toBe('completed');
 expect(acquired.bindData).toHaveBeenCalledOnce();
 expect(acquired.bindData.mock.calls[0][1]).toMatchObject({intervalMinutes:1,requests:[{toolId:'t_abc123',args:acquired.args}]});
});

async function fixture(request,events=[],partial=false){
 const directory=await mkdtemp(join(tmpdir(),'workbench-observed-'));clean.push(()=>rm(directory,{recursive:true,force:true}))
 const filePath=join(directory,'plans.json');const tools=new Map();let route
 const runtime={startBatch:vi.fn(async({panels})=>panels.map((_,i)=>({taskId:'pending-'+i}))),startPreparedBatch:vi.fn(async({panels})=>panels.map((_,i)=>({taskId:'prepared-'+i,...(partial?{deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:['实际交付1项，仍缺31项。']}:{})}))),inspect:()=>({finalOutput:'retained-output',deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:['实际交付1项，仍缺31项。']})}
 const ctx={agents:{get:()=>({})},tools:{schemas:()=>schemas,register:value=>{tools.set(value.name,value);return()=>{}}},webServer:{register:value=>{route=value;return()=>{}}}}
 clean.push(await registerWorkbench(ctx,runtime,{filePath,isTrustedRequest:()=>true,readJsonBody:async()=>({parentSessionId:'observed-parent'})}))
 const exec={agent:{session:{id:'observed-parent',events:[human('current',request),...events]}},signal:new AbortController().signal}
 return {runtime,exec,run:args=>tools.get('research_workbench_create').execute(args,exec),catalog:()=>tools.get('research_workbench_source_catalog').execute({},exec),plans:async()=>JSON.parse(await readFile(filePath,'utf8')),route:()=>route}
}

it('uses one observed response for both prepared cards and pinpoints a broken chart field before retry',async()=>{
 const rows=[{date:'2026-11-10',netValue:1.02},{date:'2026-11-09',netValue:1.01}]
 const events=pair('read','ework__business',{entity:'A'},{source:'实际业务来源',records:rows,pagination:{returned:2,possiblyMore:false}})
 const f=await fixture('用已取得的真实记录创建工作台，做完整明细表与净值折线图。',events)
 const {sourceRef}=(await f.catalog()).sources[0]
 const table={title:'明细表',type:'table',prompt:'保留全部记录与原始字段。',sourceView:{sourceRef}}
 const chart={title:'净值折线图',type:'chart',prompt:'按日期升序绘制实际净值。',sourceView:{sourceRef,
   chart_spec:{chartType:'Line Chart',encodings:{x:{field:'date'},y:{field:'unknown'}}}}}
 await expect(f.run({title:'净值工作台',panels:[table,chart]})).rejects.toThrow(/\/panels\/1\/sourceView\/chart_spec\/encodings\/y\/field/)
 chart.sourceView.chart_spec.encodings.y.field='netValue'
 await f.run({title:'净值工作台',panels:[table,chart]})
 expect(f.runtime.startBatch).not.toHaveBeenCalled()
 const [prepared]=f.runtime.startPreparedBatch.mock.calls[0]
 expect(prepared.panels.map(({artifact})=>artifact.type)).toEqual(['table','chart'])
 expect(prepared.panels[1].artifact.series[0].values).toEqual([1.01,1.02])
})

it('automatically passes actual main-session evidence to all pending cards without model sharedDatasets or prompt replay',async()=>{
 const f=await fixture('用已取得的真实记录创建工作台，做明细表与图表。',pair())
 const input={title:'来源交接',requestId:'observed',panels:[{title:'明细表',type:'table',prompt:'保留全部记录与原始字段。'},{title:'比较图',type:'chart',prompt:'按实际数值绘制比较图，保留来源。'}]}
 expect((await f.run(input)).status).toBe('accepted')
 const [batch,host]=f.runtime.startBatch.mock.calls[0]
 for(const panel of host.panels)expect(panel.sharedObservedRecords[0].response).toEqual(response())
 for(const panel of batch.panels)expect(panel.prompt).not.toContain('完整正文 0')
 expect(input).not.toHaveProperty('sharedDatasets');expect(f.runtime.startPreparedBatch).not.toHaveBeenCalled()
})

it('passes source evidence to prepared cards while keeping simulation isolated from real observations',async()=>{
 const f=await fixture('用已取得的真实资料创建工作台。',pair())
 await f.run({title:'现有资料',requestId:'prepared',panels:[{title:'原始明细',type:'table',prompt:'呈现已取得的原始明细。',content:{title:'原始明细',rows:[{id:'R0',name:'实际条目'}]}}]})
 expect(f.runtime.startPreparedBatch.mock.calls[0][0].panels[0].hostContext.sharedObservedRecords[0].response).toEqual(response())
 const simulated=await fixture('创建明确模拟数据工作台。',pair())
 await simulated.run({title:'演练',requestId:'simulated',dataMode:'simulated',generationMode:'deferred',sharedContext:'仅使用明确模拟的数据。',panels:[{title:'演练明细',type:'table',prompt:'生成明确模拟的任务清单。'}]})
 expect(simulated.runtime.startBatch.mock.calls[0][1].panels[0]).not.toHaveProperty('sharedObservedRecords')
})

it('retains validated partial artifacts, passes deficits and metadata, and retries the same plan without duplicate tasks',async()=>{
 const f=await fixture('创建32项任务的工作台，保留完整任务清单。',pair(),true)
 const input={title:'任务清单',requestId:'partial',panels:[{title:'任务清单',type:'table',prompt:'呈现32项完整任务。',content:{title:'任务清单',rows:[{id:'T1',task:'已取得任务',status:'进行中'}]}}]}
 const receipt=await f.run(input);expect(receipt.status).toBe('incomplete')
 const prepared=f.runtime.startPreparedBatch.mock.calls[0][0].panels[0]
 expect(prepared.artifact.rows).toHaveLength(1);expect(prepared.scopeDeficits).toContainEqual(expect.objectContaining({expected:32,actual:1,missing:31}))
 expect(prepared.hostContext.workbenchRequest.originalRequest).toContain('32项任务');expect(prepared.hostContext.sharedObservedRecords).toHaveLength(1)
 const again=await f.run(input);expect(again).toMatchObject({planId:receipt.planId,status:'incomplete'});expect(f.runtime.startPreparedBatch).toHaveBeenCalledOnce()
 const [saved]=await f.plans();expect(saved.panels[0]).toMatchObject({taskId:'prepared-0',deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:['实际交付1项，仍缺31项。']})
 expect(saved.panels[0].artifact.rows).toHaveLength(1);expect(f.runtime.startBatch).not.toHaveBeenCalled()
 const bad=structuredClone(input);bad.requestId='invalid';bad.panels[0].content.rows='invalid';
 const recovered=await f.run(bad);expect(recovered.status).toBe('accepted');
 expect(f.runtime.startPreparedBatch).toHaveBeenCalledOnce();expect(f.runtime.startBatch).toHaveBeenCalledOnce();
 expect((await f.plans()).find(plan=>plan.id===recovered.planId).panels[0].artifact).toBeUndefined()
})
