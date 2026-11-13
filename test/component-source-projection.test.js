import {afterEach,expect,it,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {apply as applySpill} from '@deepseek-ai/dsh-spill-policy'
import {compactBusinessEvidence,expandBusinessEvidence,registerComponentSourceProjection} from '../packages/dsh-research-task-runtime/component-source-projection.js'
import {componentSourceCollector,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {captureWorkbenchObservedSources,restoreWorkbenchObservedSources} from '../packages/dsh-research-task-runtime/workbench-observed-sources.js'

const response={retCode:1,retMsg:'Success',data:Array.from({length:60},(_,i)=>({secID:'600027.XSHG',ticker:'600027',exchangeCD:'XSHG',publishDate:i<30?'2026-08-28':'2026-07-25',endDate:'2026-06-30',fiscalPeriod:6,source:'公司已披露公告',itemName:'真实指标'+i,value:i===0?0:i%2?-i:i,unit:i%2?'万千瓦':'亿千瓦时',content:(i<30?'半年报经营说明。':'上半年发电量公告。').repeat(80),unusualMetric:{active:false,detail:null,list:[i,'未知字段保留']},...(i%3?{}:{optional:null})}))}
const payload={content:[{type:'text',text:JSON.stringify(response)}],executionOnlySecret:'not-for-model-content'}
const nav={source:'Tushare',api:'fund_nav',fields:['ts_code','nav_date','unit_nav','accum_nav','net_asset','adj_nav'],
 records:Array.from({length:288},(_,i)=>({ts_code:'110037.OF',nav_date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10).replaceAll('-',''),unit_nav:1+i/10000,accum_nav:1.2+i/10000,net_asset:i%94?null:i*10000,adj_nav:i?1.03+i/10000:0})),
 pagination:{offset:0,limit:1000,returned:288,possiblyMore:false},sourceUrl:'https://tushare.pro/document/2?doc_id=119'}

it('round trips the Tushare NAV shape in positional rows and fails closed on missing fields or tampering',()=>{
 const before=JSON.stringify(nav),projection=compactBusinessEvidence(nav,{tushareRecords:true})
 expect(projection).toBeTruthy();expect(projection.records).toHaveLength(288)
 expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(Buffer.byteLength(before)*.5)
 expect(expandBusinessEvidence(projection)).toEqual(nav);expect(JSON.stringify(nav)).toBe(before)
 expect(projection.pagination).toEqual(nav.pagination);expect(projection.sourceUrl).toBe(nav.sourceUrl)
 const sparse=structuredClone(nav);delete sparse.records[0].net_asset
 expect(compactBusinessEvidence(sparse,{tushareRecords:true})).toBeUndefined()
 const corrupted=structuredClone(projection);corrupted.records[0][1]=999
 expect(()=>expandBusinessEvidence(corrupted)).toThrow(/无损/)
 const oversized=structuredClone(projection);oversized.__eworkEvidenceProjection.constants.ts_code='x'.repeat(9000)
 expect(()=>expandBusinessEvidence(oversized)).toThrow(/超出/)
})

it('projects only an accepted Tushare root call belonging to the current authored workbench turn and restores it from the source handoff',async()=>{
 const hooks=new Map(),turn=1,signal=new AbortController().signal
 const tool='ework__t_tushare_test',builtin={[Symbol.for('ework.builtin-tushare.read')]:true}
 const ctx={tools:{get:name=>name===tool?builtin:undefined},systemPrompt:{context:()=>()=>{}},on:(name,fn)=>{hooks.set(name,fn);return ()=>hooks.delete(name)}}
 const stop=registerWorkbenchExecutionPolicy(ctx)
 try{
  const human={id:'human',role:'user',source:{kind:'user'},content:[{type:'text',text:'创建纯债基金比较工作台。'}]}
  const args={api_name:'fund_nav',params:{ts_code:'110037.OF'}},callId='nav'
  const agent={session:{events:[{type:'user/message',data:human},{type:'tool/call',data:{name:tool,arguments:args,turn,callId}}]}}
  const request={system:'base',messages:[human],tools:[{name:'research_workbench_create'},{name:tool}]}
  await hooks.get('agent/request-context')({agent,turn,signal},async()=>request)
  const value={content:[{type:'text',text:JSON.stringify(nav)}],privateMetadata:'not for model'}
  const result={isError:false,value,content:value.content},original={kind:'accept'}
  const exec={agent,name:tool,callId,arguments:args,signal}
  const post=hooks.get('tools/post-execute')
  const projected=await post(exec,result,async()=>original)
  expect(projected.content[0].text).not.toContain('not for model')
  expect(expandBusinessEvidence(JSON.parse(projected.content[0].text))).toEqual(nav)
  expect(result.value).toBe(value);expect(result.content).toEqual(value.content)
  agent.session.events.push({type:'tool/result',data:{message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,content:projected.content}]}}})
  expect(captureWorkbenchObservedSources({session:agent.session,messageId:'human',schemas:[{name:tool}]})).toEqual([{tool,args,response:nav}])
  for(const unapproved of [{...exec,callId:'not-durable'},{...exec,parent:Symbol('nested')},{...exec,agent:{session:agent.session}},{...exec,name:'ework__spoof'}]) {
   expect(await post(unapproved,result,async()=>original)).toBe(original)
  }
  const replacement={kind:'accept',value:{filtered:true}}
  expect(await post(exec,result,async()=>replacement)).toBe(replacement)
  const blocked={kind:'block',feedback:[]}
  expect(await post(exec,result,async()=>blocked)).toBe(blocked)
  expect(await post(exec,result,async()=>{
   agent.session.events.push({type:'user/message',data:{...human,id:'next',content:[{type:'text',text:'解释上一张图。'}]}})
   return original
  })).toBe(original)
 }finally{stop()}
})

it('saves computed NAV metrics with the complete observed source and restores them after reopening', async () => {
 const hooks=new Map(),turn=1,signal=new AbortController().signal
 const tool='ework__t_tushare_test',schemas=[{name:tool},{name:'ework__untrusted'}]
 const trusted={[Symbol.for('ework.builtin-tushare.read')]:true}
 const ctx={
  tools:{get:name=>name===tool?trusted:undefined,schemas:()=>schemas},
  systemPrompt:{context:()=>()=>{}},on:(name,fn)=>{hooks.set(name,fn);return ()=>hooks.delete(name)}
 }
 const stop=registerWorkbenchExecutionPolicy(ctx)
 const human={id:'funds',role:'user',source:{kind:'user'},content:[{type:'text',text:'创建纯债基金比较工作台。至少比较3只中长期纯债基金的近一年收益、近半年最大回撤、年化波动率、最新净值、规模和管理人。'}]}
 const agent={session:{events:[{type:'user/message',data:human}]}}
 let sequence=0
 async function record(name,api,params,rows,offset=0,nextOffset=null){
  const args={api_name:api,params,offset},callId=String(++sequence)
  const raw={source:'Tushare',api,records:rows,pagination:{offset,returned:rows.length,possiblyMore:nextOffset!==null,nextOffset},
    sourceUrl:api==='fund_nav'?'https://tushare.pro/document/2?doc_id=119':'https://tushare.pro/document/2?doc_id=19'}
  const content=[{type:'text',text:JSON.stringify(raw)}]
  agent.session.events.push({type:'tool/call',data:{name,arguments:args,turn,callId}})
  const result=await hooks.get('tools/post-execute')({agent,name,callId,arguments:args,signal},{content},async()=>({kind:'accept'}))
  const rendered=result.content??content
  agent.session.events.push({type:'tool/result',data:{message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,content:rendered}]}}})
  return {raw,rendered:JSON.parse(rendered[0].text)}
 }
 try{
  await hooks.get('agent/request-context')({agent,turn,signal},async()=>({system:'base',messages:[human],tools:[{name:'research_workbench_create'},...schemas]}))
  let last
  for(let fund=1;fund<=3;fund++){
   const code=String(fund).padStart(6,'0')+'.OF'
   const params={ts_code:code,start_date:'20250101',end_date:'20260101'}
   const records=Array.from({length:366},(_,i)=>({ts_code:code,nav_date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10).replaceAll('-',''),
    unit_nav:1+i/4000,adj_nav:1+i*fund/4000,net_asset:2e8,ann_date:null}))
   await record(tool,'fund_basic',{ts_code:code},[{ts_code:code,name:'基金'+fund,management:'管理人'}])
   await record(tool,'fund_nav',params,records.slice(0,75),0,75)
   expect((await record('ework__untrusted','fund_nav',params,records.slice(75),75)).rendered.workbenchCalculation).toBeUndefined()
   last=await record(tool,'fund_nav',params,records.slice(75),75)
   if(fund<3)expect(last.rendered.workbenchCalculation).toBeUndefined()
   else {
    const calculation=last.rendered.workbenchCalculation
    expect(last.rendered.records[0]).toBeInstanceOf(Array)
    expect(calculation).toMatchObject({start:'20250101',end:'20260101',basis:{navField:'adj_nav',annualizationPeriods:252},missing:{scale:0,annDate:3}})
    expect(calculation.rows.map(row=>row.gain)).toEqual([27.375,18.25,9.125])
    expect(calculation.rows.every(row=>row.annDate===null)).toBe(true)
    const tampered=structuredClone(last.rendered)
    tampered.workbenchCalculation.rows[0].gain=99
    expect(()=>expandBusinessEvidence(tampered)).toThrow(/无损/)
    // A retry replaces this source by its exact arguments in the durable collector.
    last=await record(tool,'fund_nav',params,records.slice(75),75)
    expect(last.rendered.workbenchCalculation).toEqual(calculation)
   }
  }
  const reopened=JSON.parse(JSON.stringify(agent.session))
  const saved=captureWorkbenchObservedSources({session:reopened,messageId:human.id,schemas:[{name:tool}]})
  const restored=restoreWorkbenchObservedSources(JSON.parse(JSON.stringify(saved)))
  expect(restored).toHaveLength(9)
  expect(restored.at(-1).response).toEqual({...last.raw,workbenchCalculation:last.rendered.workbenchCalculation})
 }finally{stop()}
})

it('losslessly factors all repeated fields and descriptions while preserving every row, missing field, zero, negative value and unknown column',()=>{
 const before=JSON.stringify(response),projection=compactBusinessEvidence(response)
 expect(projection).toBeTruthy()
 expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(40000)
 expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(Buffer.byteLength(before)*.5)
 expect(projection.data).toHaveLength(60)
 expect(expandBusinessEvidence(projection)).toEqual(response)
 expect(JSON.stringify(response)).toBe(before)
 expect(compactBusinessEvidence(projection)).toBeUndefined()
})

it.each(['retCode','too-small','different-shape','collision'])('preserves unsupported data rather than pretending it was compacted: %s',mode=>{
 const input=structuredClone(response)
 if(mode==='retCode')input.retCode=-1
 if(mode==='too-small')input.data=[{value:2},{value:3}]
 if(mode==='different-shape')input.data=[['a'],['b'],['c'],['d']]
 if(mode==='collision')input.__eworkEvidenceProjection={provider:'owned metadata'}
 expect(compactBusinessEvidence(input)).toBeUndefined()
 expect(expandBusinessEvidence(input)).toEqual(input)
})

it.each(['changed-value','overlapping-default','invalid-index','missing-text'])('rejects a corrupted projection before it can become authoritative source data: %s',mode=>{
 const input=compactBusinessEvidence(response);expect(input).toBeTruthy()
 const changed=structuredClone(input)
 if(mode==='changed-value')changed.data[0].value=999
 if(mode==='overlapping-default')changed.data[0].ticker='600011'
 if(mode==='invalid-index')changed.__eworkEvidenceProjection.textReferences[0][2].push(99999)
 if(mode==='missing-text')changed.__eworkEvidenceProjection.texts=[]
 expect(()=>expandBusinessEvidence(changed)).toThrow()
})

it('rejects an expansion that would exceed source capacity before materializing a large reconstructed response',()=>{
 const input=compactBusinessEvidence(response);expect(input).toBeTruthy()
 input.__eworkEvidenceProjection.defaults.largeText='x'.repeat(100000)
 const stringify=JSON.stringify.bind(JSON),spy=vi.spyOn(JSON,'stringify').mockImplementation((value,...args)=>{
  if(value?.data?.[0]?.largeText)throw Error('expanded response was materialized')
  return stringify(value,...args)
 })
 try{expect(()=>expandBusinessEvidence(input)).toThrow(/超出/)}finally{spy.mockRestore()}
})

const cleanups=[]
afterEach(async()=>{for(const fn of cleanups.splice(0).reverse())await fn()})
async function fixture(){
 const ctx=new Context()
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 cleanups.push(()=>ctx.fiber.dispose())
 const child=(await ctx.agents.create({sessionId:'projection-child',agentOptions:{}})).agent
 const sibling=(await ctx.agents.create({sessionId:'projection-sibling',agentOptions:{}})).agent
 const saveText=vi.fn(async()=>({locator:'fixture:spill',retrievalHint:'fixture only'}))
 ctx.provide('spillStore',{saveText})
 applySpill(ctx,{maxInlineBytes:50000})
 const name='ework__t_abcd1234'
 ctx.tools.register({name,description:'读取经营数据业务记录',parameters:{type:'object',properties:{}},output:{schema:{},render:(_args,value)=>value.content},execute:async()=>structuredClone(payload)})
 const stop=registerComponentSourceProjection(ctx,{child,allowed:[name],discoveryTools:new Set(),signal:new AbortController().signal})
 cleanups.push(stop)
 const invoke=(agent=child,id='operating')=>ctx.tools.execute({name,arguments:{},callId:id,agent,signal:new AbortController().signal})
 return {ctx,child,sibling,name,saveText,stop,invoke}
}

it('runs before the real generic spill policy, keeps canonical output untouched and restores a full source from the actual durable projection',async()=>{
 const f=await fixture(),result=await f.invoke()
 expect(result.isError).toBe(false)
 expect(result.value).toEqual(payload)
 expect(f.saveText).not.toHaveBeenCalled()
 expect(result.content[0].text).not.toContain('not-for-model-content')
 const projection=JSON.parse(result.content[0].text)
 expect(expandBusinessEvidence(projection)).toEqual(response)
 const collector=componentSourceCollector([f.name])
 collector.accept({type:'tool/call',data:{name:f.name,callId:'operating',arguments:{}}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'operating'},content:[{type:'tool-result',isError:false,toolCallId:'operating',content:result.content}]}}})
 expect(collector.records[0].response).toEqual(response)
 const mapping={version:1,type:'data-bound',requests:[{key:'source',tool:f.name,args:{}}],mapping:{version:1,type:'table',title:'全部经营记录',columns:['指标','数值','单位'],rows:{$from:'source',$each:'data',$map:[{$path:'itemName'},{$path:'value'},{$path:'unit'}]}}}
 const snapshot=resolveComponentSnapshot(JSON.stringify(mapping),collector.records)
 expect(snapshot.data.rows).toHaveLength(60)
 expect(snapshot.data.rows[0]).toEqual(['真实指标0','0','亿千瓦时'])
 expect(snapshot.data.rows[59]).toEqual(['真实指标59','-59','万千瓦'])
})

it('keeps sibling results and disposed child observations on their original pipeline',async()=>{
 const f=await fixture()
 const sibling=await f.invoke(f.sibling)
 expect(sibling.content[0].text).toContain('Omitted ')
 expect(f.saveText).toHaveBeenCalledTimes(1)
 f.stop();f.stop()
 const stopped=await f.invoke(f.child,'after-dispose')
 expect(stopped.content[0].text).toContain('Omitted ')
 expect(stopped.value).toEqual(payload)
 expect(f.saveText).toHaveBeenCalledTimes(2)
})

it('delivers host interpretation context with an approved web result without changing its canonical evidence',async()=>{
 const f=await fixture();f.stop()
 const value={content:[{type:'text',text:'approved original web content'}]},observe=vi.fn(()=> '宿主核验的目标集合：v4.0.9、v4.0.8、v4.0.7')
 f.ctx.tools.register({name:'web_fetch',description:'读取网页',parameters:{type:'object',properties:{}},output:{schema:{},render:(_args,value)=>value.content},execute:async()=>value})
 const stop=registerComponentSourceProjection(f.ctx,{child:f.child,allowed:['web_fetch'],signal:new AbortController().signal,onWebResponse:observe});cleanups.push(stop)
 const invoke=agent=>f.ctx.tools.execute({name:'web_fetch',arguments:{url:'https://example.com/releases'},callId:'web',agent,signal:new AbortController().signal})
 const result=await invoke(f.child)
 expect(observe).toHaveBeenCalledWith({url:'https://example.com/releases'},'approved original web content')
 expect(result.value).toEqual(value)
 expect(result.content).toEqual([...value.content,{type:'text',text:observe.mock.results[0].value}])
 expect((await invoke(f.sibling)).content).toEqual(value.content)
})

it('respects a policy that replaces canonical data instead of resurrecting the original response',async()=>{
 const f=await fixture(),replacement={content:[{type:'text',text:'{"retCode":1,"data":[]}'}]}
 f.ctx.on('tools/post-execute',async()=>({kind:'accept',value:replacement}))
 const result=await f.invoke()
 expect(result.value).toEqual(replacement)
 expect(result.content).toEqual(replacement.content)
 expect(result.content[0].text).not.toContain('真实指标')
})

it.each(['discovery','cancelled'])('leaves %s calls on the existing projection policy',async mode=>{
 const f=await fixture();f.stop()
 const cancellation=new AbortController();if(mode==='cancelled')cancellation.abort()
 const stop=registerComponentSourceProjection(f.ctx,{child:f.child,allowed:[f.name],discoveryTools:new Set(mode==='discovery'?[f.name]:[]),signal:cancellation.signal});cleanups.push(stop)
 const result=await f.invoke()
 expect(result.value).toEqual(payload)
 expect(result.content[0].text).toContain('Omitted ')
 expect(f.saveText).toHaveBeenCalledOnce()
})

it('does not project a blocked result into a successful business response',async()=>{
 const f=await fixture()
 f.ctx.on('tools/post-execute',async()=>({kind:'block',feedback:[{type:'text',text:'current source access denied'}]}))
 const result=await f.invoke()
 expect(result.isError).toBe(true)
 expect(result.value).toBeUndefined()
 expect(result.content[0].text).toContain('denied')
 expect(f.saveText).not.toHaveBeenCalled()
})

it('retains complete approved web JSON before spill without changing the model or sibling pipeline',async()=>{
 const f=await fixture(),url='https://example.org/api/records?limit=40'
 const data=Array.from({length:40},(_,i)=>({title:'记录'+i,date:'2026-11-08',url:'https://example.org/items/'+i,body:('第'+i+'条完整正文。').repeat(180)}))
 const text=`Fetched ${url} (HTTP 200)\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n${JSON.stringify(data)}`
 const collector=componentSourceCollector(['web_fetch'])
 f.ctx.tools.register({name:'web_fetch',description:'读取网页',parameters:{type:'object',properties:{url:{type:'string'}}},output:{schema:{},render:(_args,value)=>value.content},execute:async()=>({content:[{type:'text',text}]})})
 const stop=registerComponentSourceProjection(f.ctx,{child:f.child,allowed:['web_fetch'],onWebResponse:(args,body)=>collector.acceptWebResponse(args,body)});cleanups.push(stop)
 const invoke=agent=>f.ctx.tools.execute({name:'web_fetch',arguments:{url},callId:'web-json',agent,signal:new AbortController().signal})
 const result=await invoke(f.child)
 expect(result.content[0].text).toContain('Omitted ')
 expect(collector.records[0]?.response.records).toEqual(data)
 collector.accept({type:'tool/call',data:{name:'web_fetch',callId:'web-json',arguments:{url}}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'web-json'},content:[{type:'tool-result',content:result.content}]}}})
 expect(collector.records).toHaveLength(1)
 expect(collector.records[0].response.records).toEqual(data)
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:'web_fetch',args:{url}}],mapping:{version:1,type:'table',title:'完整记录',columns:['标题','日期','正文','原链接'],rows:{$from:'q',$each:'',$map:[{$path:'title'},{$path:'date'},{$path:'body'},{$path:'url'}]}}}
 const snapshot=resolveComponentSnapshot(JSON.stringify(draft),collector.records)
 expect(snapshot?.data.rows).toHaveLength(40)
 expect(snapshot.data.rows[39]).toEqual([data[39].title,data[39].date,data[39].body,data[39].url])
 const observed=collector.records[0]
 await invoke(f.sibling);expect(collector.records).toEqual([observed])
})

it.each(['blocked','replaced','partial'])('does not establish complete web evidence from a %s response',async mode=>{
 const f=await fixture(),url='https://example.org/data',collector=componentSourceCollector(['web_fetch'])
 f.ctx.tools.register({name:'web_fetch',description:'读取网页',parameters:{type:'object',properties:{}},output:{schema:{},render:(_args,value)=>value.content},execute:async()=>({content:[{type:'text',text:`Fetched ${url} (HTTP 200)\n\n[网页读取状态：${mode==='partial'?'正文尚未完整收集':'已滚动至文末，完成正文收集'}]\n\n[{"value":1}]`}]})})
 const stop=registerComponentSourceProjection(f.ctx,{child:f.child,allowed:['web_fetch'],onWebResponse:(args,text)=>collector.acceptWebResponse(args,text)});cleanups.push(stop)
 if(mode==='blocked')f.ctx.on('tools/post-execute',async()=>({kind:'block',feedback:[{type:'text',text:'denied'}]}))
 if(mode==='replaced')f.ctx.on('tools/post-execute',async()=>({kind:'accept',value:{content:[{type:'text',text:'redacted'}]}}))
 await f.ctx.tools.execute({name:'web_fetch',arguments:{url},callId:'web-'+mode,agent:f.child,signal:new AbortController().signal})
 expect(collector.records).toEqual([])
})
