import {it,expect,vi} from 'vitest'
import {componentSourceCollector,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
const tool='ework__t_123abc',now=new Date('2026-09-26T08:00:00Z')
const args={api_name:'quote',url_params:{date:'20260926',ticker:'510300'}}
const response={data:{date:'2026-09-25',rows:[{name:'沪深300ETF',price:4.515}]}}
const draft={version:1,type:'data-bound',requests:[{key:'quote',tool,args:{...args,url_params:{...args.url_params,date:{$date:{format:'yyyyMMdd'}}}}}],mapping:{version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:{$from:'quote',$path:'data.date',$suffix:' · 通联 DataYes'},items:{$from:'quote',$each:'data.rows',$map:{label:{$path:'name'},value:{$path:'price',$as:'string',$suffix:' 元'}}}}}
const records=[{tool,args,response}]
it('repairs a static plugin-backed card once using observed data without fetching again',async()=>{
 const staticData={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'}]}
 const start=vi.fn(async input=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?staticData:draft)}],sourceRecords:start.mock.calls.length===1?records:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情指标\n优先使用 market 类型；variant: metrics。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].synthesisOnly).toBe(true)
  expect(start.mock.calls[1][0].prompt).toContain('data-bound')
  expect(start.mock.calls[1][0].prompt).toContain('"price":4.515')
  expect(bindData).toHaveBeenCalledOnce()
 } finally {await runtime.dispose()}
})
it('publishes the normal rendered card and binds it to the same task node before completion',async()=>{
 const bindData=vi.fn(async()=>{})
 const adapter={start:async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records}),dispose:async()=>{}}),bindData,dispose:async()=>{}}
 const runtime=new ResearchTaskRuntime({adapter,storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'使用通联生成ETF行情指标面板，variant: metrics'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(bindData).toHaveBeenCalledOnce()
  expect(bindData.mock.calls[0][0]).toMatchObject({parentSessionId:'parent',canvasNodeId:'node'})
  expect(bindData.mock.calls[0][1].intervalMinutes).toBe(1)
  expect(readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data.items[0].value).toBe('4.515 元')
 } finally {await runtime.dispose()}
})
it('materializes observed data and saves the same mapping for model-free updates',async()=>{
 const result=resolveBoundComponent(JSON.stringify(draft),records,now)
 expect(result.data.items).toEqual([{label:'沪深300ETF',value:'4.515 元'}])
 expect(result.recipe.requests[0].toolId).toBe('t_123abc')
 const spec=JSON.parse(result.output),saved=[]
 const engine=new ComponentDataRefresh({now:()=>now.getTime(),owner:()=> 'o',load:async()=>[],save:async()=>{},inspect:async()=>({writable:true,spec,revision:'r'}),validateRequest:async r=>r,execute:async()=>({data:{...response.data,rows:[{name:'沪深300ETF',price:4.6}]}}),apply:async(_b,_r,next)=>saved.push(next)})
 const b=await engine.bind({...result.recipe,sessionId:'s',nodeId:'n',workspaceId:'w'},spec)
 await engine.refresh(b.id)
 expect(readTemplateModel(saved[0]).data.items).toEqual([{label:'沪深300ETF',value:'4.6 元'}])
 expect(b.intervalMinutes).toBe(1)
})
it('rejects unobserved requests, changed securities, failed calls and invented fields',()=>{
 expect(()=>resolveBoundComponent(JSON.stringify(draft),[],now)).toThrow(/本轮已成功/)
 const changed=structuredClone(draft);changed.requests[0].args.url_params.ticker='600519'
 expect(()=>resolveBoundComponent(JSON.stringify(changed),records,now)).toThrow(/本轮已成功/)
 const missing=structuredClone(draft);missing.mapping.items.$each='invented'
 expect(()=>resolveBoundComponent(JSON.stringify(missing),records,now)).toThrow(/列表字段/)
 expect(resolveBoundComponent(JSON.stringify({version:1,type:'market'}),records,now)).toBeNull()
})
it('captures only matching successful structured plugin results from public events',()=>{
 const collector=componentSourceCollector([tool])
 const call=id=>({type:'tool/call',data:{callId:id,name:tool,arguments:JSON.stringify(args)}})
 const result=(id,error=false)=>({type:'tool/result',data:{message:{source:{kind:'tool',callId:id},content:[{type:'tool-result',isError:error,content:[{type:'text',text:'来源记录\n'+JSON.stringify(response)}]}]}}})
 collector.accept(result('unseen'));collector.accept(call('failed'));collector.accept(result('failed',true))
 collector.accept(call('ok'));collector.accept(result('ok'));collector.accept(result('ok'))
 expect(collector.records).toEqual(records)
})
