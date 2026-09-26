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
it('anchors unqualified paths to the single verified response and persists that scope for refresh',()=>{
 const input=structuredClone(draft)
 input.mapping.items=[{label:'最新价',value:{$path:'data.rows.0.price',$as:'string'},detail:{$path:'data.date'}}]
 const result=resolveBoundComponent(JSON.stringify(input),records,now)
 expect(result.data.items[0]).toEqual({label:'最新价',value:'4.515',detail:'2026-09-25'})
 expect(result.recipe.mapping.items[0].value.$from).toBe('quote')
 expect(input.mapping.items[0].value.$from).toBeUndefined()
 const many=structuredClone(input);many.requests.push({...many.requests[0],key:'other'})
 expect(()=>resolveBoundComponent(JSON.stringify(many),records,now)).toThrow(/接口缺少字段/)
 const missing=structuredClone(input);missing.mapping.items[0].value.$path='data.absent'
 expect(()=>resolveBoundComponent(JSON.stringify(missing),records,now)).toThrow(/接口缺少字段/)
})
it('keeps explicit response keys and array row scopes when filling the default source',()=>{
 const input=structuredClone(draft)
 input.mapping.items={$each:'data.rows',$map:{label:{$path:'name'},value:{$path:'price',$as:'string'}}}
 input.mapping.asOf={$path:'quote.data.date'}
 const result=resolveBoundComponent(JSON.stringify(input),records,now)
 expect(result.data.items[0]).toEqual({label:'沪深300ETF',value:'4.515'})
 expect(result.recipe.mapping.items.$from).toBe('quote')
 expect(result.recipe.mapping.items.$map.value.$from).toBeUndefined()
 expect(result.data.asOf).toBe('2026-09-25')
})
it('formats numeric indicator values and explicit missing summaries without a model repair',()=>{
 const numeric=structuredClone(draft);numeric.mapping.items.$map.value={$path:'price',$as:'number',$digits:3}
 expect(resolveBoundComponent(JSON.stringify(numeric),records,now).data.items[0].value).toBe('4.515')
 const report={...draft,mapping:{version:1,type:'reports',title:'ETF研报',items:{$from:'quote',$each:'data.rows',$map:{title:{$path:'name'},summary:{$path:'absent',$optional:true},date:{$from:'quote',$path:'data.date'}}}}}
 expect(resolveBoundComponent(JSON.stringify(report),records,now).data.items[0].summary).toBe('来源未提供摘要')
})
it('repairs an invalid binding with its observed response instead of reverting to a static contract',async()=>{
 const invalid=structuredClone(draft);invalid.mapping.items.$each='wrongPath'
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?invalid:draft)}],sourceRecords:start.mock.calls.length===1?records:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联，优先使用 market 类型，variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prompt).toContain('responseSample')
  expect(repair.prompt).toContain('列表字段不存在')
  expect(repair.prompt).not.toContain('唯一交付格式：')
  expect(bindData).toHaveBeenCalledOnce()
 } finally {await runtime.dispose()}
})
it('recovers verified data after the retrieval deadline even when the first output is empty',async()=>{
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve(start.mock.calls.length===1
  ?{stopReason:'timeout',localDeadlineExceeded:true,output:[],sourceRecords:records}
  :{stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；必须输出 market.metrics 的结构化数据。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0]).toMatchObject({synthesisOnly:true})
  expect(start.mock.calls[1][0].prompt).toContain('mapping 的模板结构')
  expect(start.mock.calls[1][0].prompt).toContain('responseSample')
  expect(bindData).toHaveBeenCalledOnce()
 }finally{await runtime.dispose()}
})
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
it('rolls a current-date query anchor for recent panels but preserves fixed historical queries',()=>{
 const fixed=structuredClone(draft);fixed.requests[0].args=args
 const result=resolveBoundComponent(JSON.stringify(fixed),records,now,{rollingDates:true})
 expect(result.recipe.requests[0].args.url_params.date).toEqual({$date:{format:'yyyyMMdd',timezone:'Asia/Shanghai'}})
 expect(resolveBoundComponent(JSON.stringify(fixed),records,now).recipe.requests[0].args.url_params.date).toBe('20260926')
 const past=structuredClone(fixed);past.requests[0].args.url_params.date='20260826'
 expect(resolveBoundComponent(JSON.stringify(past),[{...records[0],args:past.requests[0].args}],now,{rollingDates:true}).recipe.requests[0].args.url_params.date).toBe('20260826')
})
it('moves both ends of a recent market or news window so refresh does not freeze on old pages',()=>{
 for(const [begin,end,start,finish]of [['beginDate','endDate','20260916','20260926'],['start_time','end_time','2026-09-01','2026-09-26']]){
  const candidate=structuredClone(draft);candidate.requests[0].args={url_params:{[begin]:start,[end]:finish}}
  const result=resolveBoundComponent(JSON.stringify(candidate),[{...records[0],args:candidate.requests[0].args}],now,{rollingDates:true})
  expect(result.recipe.requests[0].args.url_params[end].$date.offsetDays??0).toBe(0)
  expect(result.recipe.requests[0].args.url_params[begin].$date.offsetDays).toBe(begin==='beginDate'?-10:-25)
  expect(resolveBoundComponent(JSON.stringify(candidate),[{...records[0],args:candidate.requests[0].args}],now).recipe.requests[0].args).toEqual(candidate.requests[0].args)
 }
})
it('captures only matching successful structured plugin results from public events',()=>{
 const collector=componentSourceCollector([tool])
 const call=id=>({type:'tool/call',data:{callId:id,name:tool,arguments:JSON.stringify(args)}})
 const result=(id,error=false)=>({type:'tool/result',data:{message:{source:{kind:'tool',callId:id},content:[{type:'tool-result',isError:error,content:[{type:'text',text:'来源记录\n'+JSON.stringify(response)}]}]}}})
 collector.accept(result('unseen'));collector.accept(call('failed'));collector.accept(result('failed',true))
 collector.accept(call('ok'));collector.accept(result('ok'));collector.accept(result('ok'))
 expect(collector.records).toEqual(records)
})
