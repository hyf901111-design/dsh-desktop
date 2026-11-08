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

const response={retCode:1,retMsg:'Success',data:Array.from({length:60},(_,i)=>({secID:'600027.XSHG',ticker:'600027',exchangeCD:'XSHG',publishDate:i<30?'2026-08-28':'2026-07-25',endDate:'2026-06-30',fiscalPeriod:6,source:'公司已披露公告',itemName:'真实指标'+i,value:i===0?0:i%2?-i:i,unit:i%2?'万千瓦':'亿千瓦时',content:(i<30?'半年报经营说明。':'上半年发电量公告。').repeat(80),unusualMetric:{active:false,detail:null,list:[i,'未知字段保留']},...(i%3?{}:{optional:null})}))}
const payload={content:[{type:'text',text:JSON.stringify(response)}],executionOnlySecret:'not-for-model-content'}

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
