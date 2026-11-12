import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {createScope} from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {createWorkbenchSourceSnapshot,WORKBENCH_SOURCE_TOOL} from '../packages/dsh-research-task-runtime/workbench-source-snapshot.js'
import {restoreWorkbenchHostContext,workbenchPublicSourceCallIssue,workbenchPublicSourceEvidenceIssue} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
import {componentSourceCollector,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {createComponentDataSubmission} from '../packages/dsh-research-task-runtime/component-data-submission.js'
import {componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'
import {createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'

const context=(dataMode='source',count=125)=>({sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'复用共同记录'},sourceRequirement:'保留完整记录与来源',workbenchRequest:{originalRequest:'用这些记录制作工作台',dataMode},sharedDatasets:[{
 id:'records',label:'共同原记录',asOf:'2026-11-11',note:dataMode==='simulated'?'用户授权演练，全部为模拟记录':'来源：用户提供的原始明细，缺失保持null',
 fields:[{key:'id',label:'编号'},{key:'value',label:'原值',unit:'亿元'},{key:'body',label:'完整正文'},{key:'unknown',label:'未提供'},{key:'tags',label:'标签'}],
 records:Array.from({length:count},(_,i)=>({id:'R'+i,value:i,body:'原文'+i+'x'.repeat(160),unknown:null,tags:['原标签','标签'+i]}))
}]})
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
function fixture(hostContext=context()){
 const ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx);cleanup.push(()=>ctx.fiber.dispose())
 const child={id:'snapshot-child'},other={id:'other-child'},childScope=createScope(ctx,child),otherScope=createScope(ctx,other)
 child.ctx=childScope.ctx;other.ctx=otherScope.ctx;cleanup.push(()=>otherScope.dispose());cleanup.push(()=>childScope.dispose())
 child.ctx.tools.restrict({allow:[]})
 const controller=new AbortController(),snapshot=createWorkbenchSourceSnapshot({hostContext:restoreWorkbenchHostContext(hostContext),signal:controller.signal})
 cleanup.push(snapshot.dispose);snapshot.register(child)
 return {ctx,child,other,controller,snapshot,read:(args={},agent=child)=>ctx.tools.execute({name:WORKBENCH_SOURCE_TOOL,arguments:args,callId:Math.random().toString(),agent,signal:controller.signal})}
}
const value=result=>{expect(result.isError,JSON.stringify(result)).toBe(false);return JSON.parse(result.content[0].text)}

it.each([false,true])('starts a scoped source reader through the real SDK tool filter (synthesis: %s)',async synthesisOnly=>{
 const ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx);cleanup.push(()=>ctx.fiber.dispose())
 const parent={id:'parent',session:{id:'parent',events:[]}},child={id:'child',session:{id:'child',events:[]}}
 const scope=createScope(ctx,child);child.ctx=scope.ctx;cleanup.push(()=>scope.dispose())
 const signal=new AbortController().signal
 ctx.provide('agents',{get:id=>id===parent.id?parent:undefined})
 ctx.provide('subagents',{async start(_mode,request){
  // Match the SDK order: restrict global tools before publishing a scoped reader.
  child.ctx.tools.restrict(request.toolFilter)
  ctx.emit('agent/created',{agent:child})
  const page=await ctx.tools.execute({name:WORKBENCH_SOURCE_TOOL,arguments:{dataset:'records',limit:2},callId:'snapshot-read',agent:child,signal})
  expect(value(page).records.map(row=>row.id)).toEqual(['R0','R1'])
  return {id:child.id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[]}),dispose:async()=>{}}
 }})
 const adapter=createSubagentAdapter(ctx)
 const query='工作台：研究资料\n本面板：已取得记录\n整理真实数据。\n仅生成本面板，优先使用 table 类型。'
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,
  hostContext:restoreWorkbenchHostContext(context('source',3)),signal,synthesisOnly,onSessionEvent:()=>{}})
 cleanup.push(()=>handle.dispose())
 expect(await handle.result).toMatchObject({stopReason:'completed'})
})

it('restores a detached deeply frozen host snapshot without inferring missing source fields',()=>{
 const original=context(),restored=restoreWorkbenchHostContext(original)
 expect(restored.sharedDatasets).toEqual(original.sharedDatasets)
 original.sharedDatasets[0].records[0].value=999;original.sharedDatasets[0].records[0].tags.push('changed')
 expect(restored.sharedDatasets[0].records[0]).toMatchObject({value:0,tags:['原标签','标签0']})
 expect(Object.isFrozen(restored.sharedDatasets)).toBe(true);expect(Object.isFrozen(restored.sharedDatasets[0].records[0].tags)).toBe(true)
 for(const key of ['asOf','note']){const broken=context();delete broken.sharedDatasets[0][key];expect(()=>restoreWorkbenchHostContext(broken)).toThrow()}
 const orphan=context();delete orphan.workbenchRequest;expect(()=>restoreWorkbenchHostContext(orphan)).toThrow()
 const incomplete=context();delete incomplete.sharedDatasets[0].records[0].unknown;expect(()=>restoreWorkbenchHostContext(incomplete)).toThrow(/缺少/)
})

it.each(['source','simulated'])('serves %s records offline in full-field pages while keeping one complete host source',async dataMode=>{
 const original=context(dataMode),f=fixture(original),catalog=value(await f.read())
 expect(f.ctx.tools.schemas(f.child).map(tool=>tool.name)).toEqual([WORKBENCH_SOURCE_TOOL])
 expect(catalog).toMatchObject({dataMode,snapshotOnly:true,datasets:[{id:'records',recordCount:125,dataMode}]})
 expect(JSON.stringify(catalog)).not.toContain('原标签');expect(f.snapshot.instruction).not.toContain(original.sharedDatasets[0].records[0].body)
 const pages=[];let offset=0
 for(let i=0;i<3;i++){
  const page=value(await f.read({dataset:'records',offset}));pages.push(page)
  expect(page.fields).toEqual(original.sharedDatasets[0].fields);expect(page.asOf).toBe('2026-11-11');expect(page.note).toBe(original.sharedDatasets[0].note)
  expect(page.sourceRef).toBe(catalog.datasets[0].sourceRef);expect(page.dataMode).toBe(dataMode)
  offset=page.pagination.nextOffset
 }
 expect(pages.map(page=>page.records.length)).toEqual([50,50,25]);expect(offset).toBeUndefined()
 expect(pages.flatMap(page=>page.records)).toEqual(original.sharedDatasets[0].records)
 expect(pages.at(-1).pagination).toMatchObject({total:125,returned:25,possiblyMore:false})
 expect(value(await f.read({dataset:'records',offset:125})).records).toEqual([])
 const full=value(await f.read({dataset:'records',offset:0,limit:200})),record=f.snapshot.sourceRecords[0]
 expect(record).toMatchObject({tool:WORKBENCH_SOURCE_TOOL,purpose:'snapshot',args:{dataset:'records',offset:0,limit:125}})
 expect(record.response.records).toEqual(full.records);expect(Object.isFrozen(record.response.records[0])).toBe(true)
 full.records[0].body='edited response';expect(value(await f.read({dataset:'records',limit:1})).records[0].body).toBe(original.sharedDatasets[0].records[0].body)
})

it('rejects foreign datasets, invalid pages, extra capabilities and other sessions without changing its snapshot',async()=>{
 const f=fixture(),before=JSON.stringify(f.snapshot.sourceRecords)
 for(const args of [{dataset:'other'},{dataset:'records',offset:-1},{dataset:'records',offset:126},{dataset:'records',limit:0},{dataset:'records',limit:201},{offset:1},{dataset:'records',url:'https://example.com'},{dataset:'records',path:'/tmp/other'}])expect((await f.read(args)).isError).toBe(true)
 expect((await f.read({},f.other)).isError).toBe(true);expect(f.ctx.tools.schemas(f.other)).toEqual([])
 expect(JSON.stringify(f.snapshot.sourceRecords)).toBe(before)
 f.controller.abort();expect((await f.read()).isError).toBe(true);expect(f.ctx.tools.schemas(f.child)).toEqual([])
 expect(()=>f.snapshot.register(f.other)).toThrow();f.snapshot.dispose()
})

it.each([201,1944])('maps all %i retained records after one 50-row observation page and rejects partial delivery',async count=>{
 const original=context('source',count),f=fixture(original),collector=componentSourceCollector([WORKBENCH_SOURCE_TOOL],[],f.snapshot.sourceRecords)
 expect(Buffer.byteLength(JSON.stringify(original.sharedDatasets))).toBeGreaterThan(48000)
 const args={dataset:'records'},page=await f.read(args)
 expect(value(page).pagination).toMatchObject({limit:50,returned:50,total:count,possiblyMore:true,nextOffset:50})
 expect(value(await f.read({dataset:'records',limit:200})).records).toHaveLength(200)
 expect((await f.read({dataset:'records',limit:201})).isError).toBe(true)
 expect(value(await f.read({dataset:'records',offset:count-1})).records).toEqual(original.sharedDatasets[0].records.slice(-1))
 collector.accept({type:'tool/call',data:{callId:'page',name:WORKBENCH_SOURCE_TOOL,arguments:args}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'page'},content:[{type:'tool-result',toolCallId:'page',...page}]}}})
 expect(collector.records.map(record=>record.response.records.length)).toEqual([count,50])
 expect(f.snapshot.sourceRecords[0].response.pagination).toMatchObject({returned:count,total:count,possiblyMore:false})
 const submission=createComponentDataSubmission({observeRecords:()=>collector.records,signal:f.controller.signal,validateSnapshot:snapshot=>{
  const issue=componentDeliveryScopeIssue(snapshot.data,`至少${count}条记录，保留全部原值`)
  if(issue)throw Error(issue)
 }})
 cleanup.push(submission.dispose);submission.register(f.child)
 const execute=(name,args)=>f.ctx.tools.execute({name,arguments:args,callId:'delivery',agent:f.child,signal:f.controller.signal})
 const sources=value(await execute('component_presentation_schema',{})).sources
 const small=sources.find(source=>source.collections.find(collection=>collection.path==='records')?.count===50)
 const full=sources.find(source=>source.sourceRef===value(page).sourceRef)
 expect(full.collections).toContainEqual(expect.objectContaining({path:'records',count}))
 const candidate=sourceRef=>({requests:[{key:'q',sourceRef}],mapping:{version:1,type:'table',title:'共同原记录',columns:['编号','原值','完整正文','未提供'],rows:{$from:'q',$each:'records',$map:[{$path:'id'},{$path:'value'},{$path:'body'},{$path:'unknown'}]}}})
 expect((await execute('submit_component_data',candidate(small.sourceRef))).isError).toBe(true)
 expect(submission.acquisitionIssue(),submission.lastIssue()).toContain('实际交付50')
 expect((await execute('submit_component_data',candidate(full.sourceRef))).isError).toBe(false)
 submission.accept({type:'tool/result',data:{message:{source:{callId:'delivery'},content:[{type:'tool-result',toolCallId:'delivery',isError:false,content:[{type:'text',text:'{"accepted":true}'}]}]}}})
 submission.accept({type:'step/end'})
 const output=(await submission.result).output[0].text,resolved=resolveComponentSnapshot(output,collector.records)
 expect(resolved.data.rows).toHaveLength(count);expect(resolved.data.rows.at(-1)).toEqual(['R'+(count-1),String(count-1),original.sharedDatasets[0].records.at(-1).body,'本次未取得'])
 expect(f.snapshot.sourceRecords[0].response.records).toEqual(original.sharedDatasets[0].records)
 expect(submission.acquisitionIssue()).toBeUndefined()
})

it('restores and serves eight datasets without reducing each source to a 200-row observation page',async()=>{
 const original=context();original.sharedDatasets=Array.from({length:8},(_,i)=>({...context('source',243).sharedDatasets[0],id:'source'+i}))
 const f=fixture(original),catalog=value(await f.read())
 expect(catalog.datasets.map(d=>d.recordCount)).toEqual(Array(8).fill(243))
 expect(f.snapshot.sourceRecords.map(r=>r.response.records)).toEqual(original.sharedDatasets.map(d=>d.records))
 for(const d of original.sharedDatasets){
  const last=value(await f.read({dataset:d.id,offset:200}))
  expect(last.records).toEqual(d.records.slice(200));expect(last.pagination).toMatchObject({returned:43,total:243,possiblyMore:false})
  expect(last.sourceRef).toBe(catalog.datasets.find(item=>item.id===d.id).sourceRef)
 }
})

it('submits the full raw response by the same sourceRef returned with its first local page',async()=>{
 const host=context();delete host.sharedDatasets
 host.sharedObservedRecords=[{tool:'ework__t_ab12',args:{symbol:'ABC'},response:{
  source:'原始行情',asOf:'2026-11-11',status:'partial',pagination:{returned:241,total:300,possiblyMore:true},
  payload:{'ABC.EX':{items:Array.from({length:241},(_,i)=>({id:'R'+i,value:i}))}}
 }}]
 const f=fixture(host),collector=componentSourceCollector([WORKBENCH_SOURCE_TOOL],[],f.snapshot.sourceRecords)
 const [source]=value(await f.read()).datasets
 const path='data.payload["ABC.EX"].items'
 expect(source.collections).toContainEqual({path,recordCount:241,fields:['id','value']})
 const page=value(await f.read({dataset:source.id,collection:path}))
 expect(page).toMatchObject({sourceRef:source.sourceRef,pagination:{returned:241,total:300,possiblyMore:true},pagePagination:{returned:50,total:241,possiblyMore:true}})
 const submission=createComponentDataSubmission({observeRecords:()=>collector.records,signal:f.controller.signal,validateSnapshot:snapshot=>{
  expect(snapshot.data.rows).toHaveLength(241)
  expect(snapshot.data.rows.at(-1)).toEqual(['R240','240'])
 }})
 cleanup.push(submission.dispose);submission.register(f.child)
 const execute=(name,args)=>f.ctx.tools.execute({name,arguments:args,callId:'raw-delivery',agent:f.child,signal:f.controller.signal})
 const candidates=value(await execute('component_presentation_schema',{})).sources
 expect(candidates).toContainEqual(expect.objectContaining({sourceRef:page.sourceRef,snapshotOnly:true,collections:expect.arrayContaining([expect.objectContaining({path,count:241})])}))
 expect(value(await execute('submit_component_data',{requests:[{key:'q',sourceRef:page.sourceRef}],mapping:{
  version:1,type:'table',title:'原始行情记录',columns:['编号','原值'],rows:{$from:'q',$each:path,$map:[{$path:'id'},{$path:'value'}]}
 }}))).toEqual({accepted:true})
})

it('does not create a reader without host data or let local records replace an exclusive network-source receipt',()=>{
 expect(createWorkbenchSourceSnapshot()).toBeUndefined()
 const policy={publicSourceRequests:[{operation:'query',source:'tencent-quotes',parameters_json:'{"symbols":["sh600000"]}'}]}
 expect(workbenchPublicSourceCallIssue(policy,WORKBENCH_SOURCE_TOOL,{dataset:'records'})).toBeUndefined()
 expect(workbenchPublicSourceCallIssue(policy,'web_fetch',{url:'https://example.com'})).toContain('仅允许')
 const snapshot=createWorkbenchSourceSnapshot({hostContext:context()});cleanup.push(snapshot.dispose)
 expect(workbenchPublicSourceEvidenceIssue(policy,snapshot.sourceRecords)).toContain('必须实际取得')
})
