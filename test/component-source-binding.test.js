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
it('uses verified response samples to recover a bound card when the model only returns progress prose',async()=>{
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve(start.mock.calls.length===1
  ?{stopReason:'completed',output:[{type:'text',text:'已获取数据。由于映射需按指数分别绑定最新记录，按单指数分别调用以便可重复刷新。'}],sourceRecords:records}
  :{stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；必须输出 market.metrics 的结构化数据。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prompt).toContain('只输出一个 data-bound JSON')
  expect(repair.prompt).toContain('responseSample')
  expect(repair.prompt).toContain('"price":4.515')
  expect(bindData).toHaveBeenCalledOnce()
  expect(bindData.mock.calls[0][1].intervalMinutes).toBe(1)
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
it('binds manual-only source data with automatic scheduling disabled while allowing a manual refresh',async()=>{
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records}),dispose:async()=>{}}),bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'使用通联生成ETF行情指标面板，variant: metrics。设置仅手动刷新，失败保留旧数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(bindData.mock.calls[0][1].intervalMinutes).toBe(0)
  const result=resolveBoundComponent(JSON.stringify(draft),records,now,{intervalMinutes:0})
  const execute=vi.fn(async()=>response)
  const engine=new ComponentDataRefresh({now:()=>now.getTime(),owner:()=> 'o',load:async()=>[],save:async()=>{},inspect:async()=>({writable:true,spec:JSON.parse(result.output),revision:'r'}),validateRequest:async r=>r,execute,apply:async()=>{}})
  const binding=await engine.bind({...result.recipe,sessionId:'s',nodeId:'n',workspaceId:'w'},JSON.parse(result.output))
  expect(binding).toMatchObject({intervalMinutes:0,enabled:false})
  expect(execute).not.toHaveBeenCalled()
  await engine.refresh(binding.id)
  expect(execute).toHaveBeenCalledOnce()
 } finally {await runtime.dispose()}
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
it('normalizes serialized date rules only when their resolved arguments match a successful call',()=>{
 for(const date of ['{$date:{format:"yyyyMMdd",timezone:"Asia/Shanghai",offsetDays:0}}','{"$date":{"format":"yyyyMMdd","timezone":"Asia/Shanghai"}}']){
  const input=structuredClone(draft);input.requests[0].args.url_params.date=date
  const result=resolveBoundComponent(JSON.stringify(input),records,now)
  expect(result.data.items[0].value).toBe('4.515 元')
  expect(result.recipe.requests[0].args.url_params.date.$date.format).toBe('yyyyMMdd')
  expect(input.requests[0].args.url_params.date).toBe(date)
 }
 const wrong=structuredClone(draft)
 wrong.requests[0].args.url_params.date='{$date:{format:"yyyyMMdd",offsetDays:-1}}'
 expect(()=>resolveBoundComponent(JSON.stringify(wrong),records,now)).toThrow(/本轮已成功/)
 wrong.requests[0].args.url_params.date='{$date:{format:"yyyyMMdd",extra:"ignored"}}'
 expect(()=>resolveBoundComponent(JSON.stringify(wrong),records,now)).toThrow(/日期规则/)
 wrong.requests[0].args.url_params.date='{$date:{format:process.env.SECRET}}'
 expect(()=>resolveBoundComponent(JSON.stringify(wrong),records,now)).toThrow(/日期规则/)
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
it('retains the business response after many interface discovery calls',()=>{
 const collector=componentSourceCollector([tool])
 for(let i=0;i<25;i++){
  const callArgs={query:'catalog-'+i}
  collector.accept({type:'tool/call',data:{callId:String(i),name:tool,arguments:JSON.stringify(callArgs)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:String(i)},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({apis:[]})}]}]}}})
 }
 collector.accept({type:'tool/call',data:{callId:'business',name:tool,arguments:JSON.stringify(args)}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'business'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}})
 expect(resolveBoundComponent(JSON.stringify(draft),collector.records,now).data.items[0].value).toBe('4.515 元')
})
it('does not bind interface directory discovery as financial data and permits business retrieval during recovery',async()=>{
 const discovery={...records[0],purpose:'discovery'}
 expect(()=>resolveBoundComponent(JSON.stringify(draft),[discovery],now)).toThrow(/业务数据/)
 const start=vi.fn(async input=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:start.mock.calls.length===1?[discovery]:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData:async()=>{},dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；variant: metrics。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start.mock.calls[1][0].synthesisOnly).toBe(false)
 }finally{await runtime.dispose()}
})
it('classifies discovery from scoped tool descriptions without rejecting actual API calls',()=>{
 const directory='ework__t_abc1',business='ework__t_abc2'
 const collector=componentSourceCollector([directory,business],[{name:directory,description:'搜索 Datayes 平台中与查询词最匹配的金融数据 API，返回候选接口列表。导航接口，不消耗额度。'},{name:business,description:'调用 Datayes 业务 API 并返回数据。必须在 get_api_info 之后执行。'}])
 for(const name of [directory,business]){
  collector.accept({type:'tool/call',data:{callId:name,name,arguments:JSON.stringify(args)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:name},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}})
 }
 expect(collector.records[0].purpose).toBe('discovery')
 expect(collector.records[1].purpose).toBeUndefined()
 const input=structuredClone(draft);input.requests[0].tool=business
 expect(resolveBoundComponent(JSON.stringify(input),collector.records,now).data.items[0].value).toBe('4.515 元')
})

it('allows a real retrieval repair after an empty K-line response rather than locking the repair into synthesis',async()=>{
 const empty={version:1,type:'market',variant:'candlestick',title:'ETF K线',asOf:'2026-09-26',candles:[],missing:'请求向未来返回空数组'}
 const full={...empty,asOf:'2026-09-24',candles:[{date:'2026-09-24',open:4.5,high:4.6,low:4.4,close:4.52,volume:null}]}
 const mapped={version:1,type:'data-bound',requests:[{key:'quote',tool,args}],mapping:{...full,asOf:{$from:'quote',$path:'data.date'},candles:{$from:'quote',$path:'data.kline'}}}
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?empty:mapped)}],sourceRecords:[{tool,args,response:{data:{date:full.asOf,kline:start.mock.calls.length===1?[]:full.candles}}}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF K线\n优先使用 market 类型；variant: candlestick。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start.mock.calls[1][0].synthesisOnly).toBe(false)
  expect(start.mock.calls[1][0].prompt).toContain('时间方向')
 }finally{await runtime.dispose()}
})

it('does not complete an all-empty claimed-unavailable dashboard without a tool-enabled recovery',async()=>{
 const missing={version:1,type:'dashboard',title:'行业配置',asOf:'数据暂不可用',items:[{label:'行业权重',value:'—',detail:'未提供工具'}]}
 const start=vi.fn(async()=>({childSessionId:'c-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?missing:{...missing,asOf:'2026-09-24',items:[{label:'银行',value:'12.5%'}]})}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'使用通联获取真实行业配置'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start.mock.calls).toHaveLength(2)
  expect(start.mock.calls[1][0].synthesisOnly).toBe(false)
 }finally{await runtime.dispose()}
})

it.each(['empty','static'])('keeps retrieval enabled when %s output has only API definitions, never business data',async mode=>{
 const sample={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'文档样例',items:[{label:'价格',value:'100'}]}
 const start=vi.fn(async()=>({childSessionId:'c-'+start.mock.calls.length,result:Promise.resolve(start.mock.calls.length===1
  ? {stopReason:'completed',output:mode==='empty'?[]:[{type:'text',text:JSON.stringify(sample)}],researchEvidence:'API定义包含价格100的请求样例，并非行情',sourceRecords:[{tool,args,response:null,purpose:'discovery'}]}
  : {stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData:async()=>{},dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；variant: metrics。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start.mock.calls).toHaveLength(2);expect(start.mock.calls[1][0].synthesisOnly).toBe(false)
  expect(start.mock.calls[1][0].prompt).toContain('接口文档')
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).not.toContain('文档样例')
 }finally{await runtime.dispose()}
})
it('does not publish a sample card when a retrieval repair again returns only discovery',async()=>{
 const start=vi.fn(async()=>({childSessionId:'c-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'market',variant:'heatmap',title:'行情',asOf:'文档样例',items:[{label:'比亚迪',weight:825106379,change:2.075}]})}],sourceRecords:[{tool,args,response:null,purpose:'discovery'}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：股票研究\n本面板：热力图\n优先使用 market 类型；variant: heatmap。使用通联真实数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('failed'))
  expect(start.mock.calls).toHaveLength(2);expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toBeUndefined()
 }finally{await runtime.dispose()}
})
it('retains discovery provenance even when a successful API definition is plain text',()=>{
 const collector=componentSourceCollector([tool],[{name:tool,description:'获取 API 完整定义。导航接口，不消耗额度。'}])
 collector.accept({type:'tool/call',data:{callId:'definition',name:tool,arguments:JSON.stringify(args)}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'definition'},content:[{type:'tool-result',content:[{type:'text',text:'接口文档、参数和样例，不是业务数据'}]}]}}})
 expect(collector.records).toEqual([{tool,args,response:null,purpose:'discovery'}])
})
