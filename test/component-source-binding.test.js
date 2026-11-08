import {describe,it,expect,vi} from 'vitest'
import {componentSourceCollector,componentBindingEvidence,componentBindingRequested,resolveBoundComponent,resolveComponentSnapshot,COMPONENT_MAPPING_EXAMPLES} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import officialSchemas from './fixtures/official-mcp-source-schemas.json'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
const tool='ework__t_123abc',now=new Date('2026-09-26T08:00:00Z')
const args={api_name:'quote',url_params:{date:'20260926',ticker:'510300'}}
const response={data:{date:'2026-09-25',rows:[{name:'沪深300ETF',price:4.515}]}}
const draft={version:1,type:'data-bound',requests:[{key:'quote',tool,args:{...args,url_params:{...args.url_params,date:{$date:{format:'yyyyMMdd'}}}}}],mapping:{version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:{$from:'quote',$path:'data.date',$suffix:' · 通联 DataYes'},items:{$from:'quote',$each:'data.rows',$map:{label:{$path:'name'},value:{$path:'price',$as:'string',$suffix:' 元'}}}}}
const records=[{tool,args,response}]
it('combines nine verified company financial queries without forcing absent metrics into the card',()=>{
 const observations=Array.from({length:9},(_,i)=>({tool,args:{company:i%3,metric:Math.floor(i/3)},response:{source:'验收数据',date:'2026-11-06',records:i===8?[]:[{value:100+i}]}}))
 const requests=observations.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args}))
 const mapping={version:1,type:'table',title:'三家公司财务对比',asOf:{$from:'q0',$path:'date'},columns:['公司','估值','营收','利润'],rows:Array.from({length:3},(_,i)=>['公司'+i,...[i,i+3,i+6].map(j=>({$from:'q'+j,$each:'records',$map:{$path:'value'},$reduce:'first',$optional:true}))])}
 const input={version:1,type:'data-bound',requests,mapping}
 expect(componentBindingEvidence(observations).split('\n')).toHaveLength(9)
 for(const resolve of [resolveBoundComponent,resolveComponentSnapshot]){
  const result=resolve(JSON.stringify(input),observations,now)
  expect(result?.data.rows.slice(0,2)).toEqual([['公司0','100','103','106'],['公司1','101','104','107']])
  expect(result?.data.rows[2].slice(0,3)).toEqual(['公司2','102','105'])
  expect(result?.data.rows[2][3]).toBe('本次未取得')
 }
 const tooMany={...input,requests:Array.from({length:17},(_,i)=>({...requests[0],key:'r'+i}))}
 expect(()=>resolveBoundComponent(JSON.stringify(tooMany),observations,now)).toThrow()
 expect(resolveComponentSnapshot(JSON.stringify(tooMany),observations,now)).toBeNull()
})
it('never supplies a transport-successful MCP parameter rejection as usable business evidence',()=>{
 const collector=componentSourceCollector([tool])
 collector.accept({type:'tool/call',data:{callId:'invalid-parameters',name:tool,arguments:JSON.stringify({api_name:'getFdmtISLT2018',url_params:{ticker:'600011',mergedFlag:'1'}})}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'invalid-parameters'},content:[{type:'tool-result',isError:false,content:[{type:'text',text:JSON.stringify({error:'API parameter validation failed',code:'INVALID_API_PARAMETERS',api_name:'getFdmtISLT2018',details:[{field:'mergedFlag',message:'not supported'}]})}]}]}}})
 expect(collector.records).toEqual([])
 expect(componentBindingEvidence(collector.records)).toBeFalsy()
})
it('classifies the actual current MCP search, directory and parameter definitions as discovery rather than financial data',()=>{
 const collector=componentSourceCollector(officialSchemas.map(s=>s.name),officialSchemas);
 for(const schema of officialSchemas){
  const callId=schema.name;
  collector.accept({type:'tool/call',data:{callId,name:schema.name,arguments:'{}'}});
  collector.accept({type:'tool/result',data:{message:{source:{callId},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(schema.name==='ework__business'?{data:[{code:'600011',revenue:123}]}:{api:'financials',example:{code:'600011',revenue:999}})}]}]}}});
 }
 expect(collector.records.map(r=>r.purpose)).toEqual(['discovery','discovery','discovery',undefined]);
 const evidence=componentBindingEvidence(collector.records);
 expect(evidence).toContain('ework__business');expect(evidence).toContain('123');
 expect(evidence).not.toContain('999');expect(evidence).not.toContain('ework__definition');
});
it.each([
 ['使用通联真实数据，优先使用 market 类型；variant: metrics。',false],
 ['更新当前卡片的真实行情。',false],
 ['每分钟自动更新，失败保留已有数据。',true],
 ['仅手动刷新。',true],
 ['不要自动更新，但需要手动刷新。',true],
 ['不需要自动刷新，只手动刷新。',true],
 ['不要自动更新但需要手动刷新。',true],
 ['不要手动刷新，只要本次数据。',false],
 ['无需自动刷新，只取本次真实数据。',false],
 ['不要求自动刷新。',false],
 ['no automatic refresh',false],
 ['do not auto refresh',false],
 ["don't auto refresh",false],
 ['no automatic refresh, manual refresh only',true],
 ['不要自动更新，只要真实静态快照。',false],
 ['仅静态快照，明确未绑定自动刷新。',false],
 ['引用示例：“每分钟自动更新”。只取本次数据。',false]
])('detects requested refresh separately from real-data retrieval: %s',(prompt,required)=>{
 expect(componentBindingRequested(prompt)).toBe(required)
})
it.each(['literal','missing-path','missing-source','numeric-default'])('does not salvage %s into a verified mapped snapshot',mode=>{
 const invalid=structuredClone(draft)
 invalid.requests.push({key:'unused',tool,args:{...args,url_params:{...args.url_params,ticker:'600519'}}})
 if(mode==='literal')invalid.mapping.items=[{label:'价格',value:'100 元'}]
 if(mode==='missing-path')invalid.mapping.items.$each='missing'
 if(mode==='missing-source')invalid.mapping.items.$from='unused'
 if(mode==='numeric-default')invalid.mapping.items.$map.value={$path:'missing',$default:100,$as:'string'}
 expect(resolveComponentSnapshot(JSON.stringify(invalid),records,now)).toBeNull()
})
// Real failed LOF quote: the model put the security name in a label-only item.
const oilArgs={operation:'query',source:'tencent-quotes',parameters_json:'{"symbols":["sh501018"]}'}
const oilRecords=[{tool:'public_data_query',args:oilArgs,response:{source:'腾讯财经公开报价',dataTime:'2026-10-12 16:14:05',records:[{name:'南方原油LOF',price:2.059,changePercent:.78}]}}]
const oilDraft={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args:oilArgs}],mapping:{version:1,type:'market',variant:'metrics',title:'油价风向标（南方原油LOF）',asOf:{$from:'q',$path:'dataTime',$suffix:' · 腾讯财经公开报价'},items:[{label:{$from:'q',$path:'records',$single:true,$map:{$path:'name'}}},{label:'最新价',value:{$from:'q',$path:'records',$single:true,$map:{$path:'price'},$as:'number',$digits:3,$suffix:' 元'}},{label:'涨跌幅',value:{$from:'q',$path:'records',$single:true,$map:{$path:'changePercent'},$as:'number',$digits:2,$suffix:'%'}}]}}
it('identifies the actual missing metric value before rendering instead of blaming source paths or units',()=>{
 expect(()=>resolveBoundComponent(JSON.stringify(oilDraft),oilRecords,now)).toThrow(/metrics\.items\[0\]\.value/)
 const corrected=structuredClone(oilDraft);corrected.mapping.items[0]={label:'证券',value:oilDraft.mapping.items[0].label}
 expect(resolveBoundComponent(JSON.stringify(corrected),oilRecords,now).data.items).toEqual([{label:'证券',value:'南方原油LOF'},{label:'最新价',value:'2.059 元'},{label:'涨跌幅',value:'0.78%'}])
})
it('repairs a label-only metric using the exact field diagnostic and full template contract without fetching again',async()=>{
 const corrected=structuredClone(oilDraft);corrected.mapping.items[0]={label:'证券',value:oilDraft.mapping.items[0].label}
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?oilDraft:corrected)}],sourceRecords:start.mock.calls.length===1?oilRecords:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'油价风向标（南方原油LOF）\n优先使用 market 类型；variant: metrics。每分钟自动更新。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prompt).toContain('metrics.items[0].value')
  expect(repair.prompt).toContain('mapping 的模板结构：')
  expect(repair.prompt).toContain('每项必须同时有 label 和 value')
  expect(repair.prompt).toContain('"price":2.059')
  expect(bindData).toHaveBeenCalledOnce()
  expect(readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data.items[0]).toEqual({label:'证券',value:'南方原油LOF'})
 }finally{await runtime.dispose()}
})
it.each([
 ['items[0].label',s=>{s.items[0].label=''}],
 ['items[0].value',s=>{s.items[0].value=null}],
 ['items[0].detail',s=>{s.items[0].detail={unexpected:true}}],
 ['asOf',s=>{s.asOf=['2026-10-12']}]
])('reports %s precisely for a bound metric so the bounded repair can correct the right field',(field,mutate)=>{
 const candidate=structuredClone(oilDraft);candidate.mapping.items[0]={label:'证券',value:'南方原油LOF'};mutate(candidate.mapping)
 expect(()=>resolveBoundComponent(JSON.stringify(candidate),oilRecords,now)).toThrow('metrics.'+field)
})
it('binds only an observed successful builtin query, never a catalog or changed parameters',()=>{
 const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'}
 const response={sourceId:'kraken-ticker',source:'Kraken',receivedAt:'2026-10-11T00:00:00Z',records:[{price:100}],dataTime:null}
 const candidate={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'kpi',title:'BTC',asOf:'Kraken · 报价时点未提供',items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}
 const collector=componentSourceCollector(['public_data_query'])
 const result=(id,value)=>({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(value)}]}]}}})
 collector.accept({type:'tool/call',data:{callId:'catalog',name:'public_data_query',arguments:{operation:'catalog'}}})
 collector.accept(result('catalog',{sources:[]}))
 collector.accept({type:'tool/call',data:{callId:'q',name:'public_data_query',arguments:args}})
 collector.accept(result('q',response))
 expect(collector.records[0].purpose).toBe('discovery')
 const mapped=resolveBoundComponent(JSON.stringify(candidate),collector.records,now)
 expect(mapped.recipe).toMatchObject({intervalMinutes:1,requests:[{toolId:'public_data_query',args}]})
 expect(mapped.data.items[0].value).toBe('100')
 candidate.requests[0].args={...args,parameters_json:'{"pair":"ETHUSD"}'}
 expect(()=>resolveBoundComponent(JSON.stringify(candidate),collector.records,now)).toThrow(/本轮已成功/)
})
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
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联，优先使用 market 类型，variant: metrics。每分钟自动更新。'})
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
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；必须输出 market.metrics 的结构化数据。使用通联真实数据，每分钟自动更新。'})
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
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n优先使用 market 类型；必须输出 market.metrics 的结构化数据。使用通联真实数据，每分钟自动更新。'})
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
it('repairs a static plugin-backed card once when periodic updates were requested without fetching again',async()=>{
 const staticData={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'}]}
 const start=vi.fn(async input=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?staticData:draft)}],sourceRecords:start.mock.calls.length===1?records:[]}),dispose:async()=>{}}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情指标\n优先使用 market 类型；variant: metrics。使用通联真实数据，每分钟自动更新。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].synthesisOnly).toBe(true)
  expect(start.mock.calls[1][0].prompt).toContain('data-bound')
  expect(start.mock.calls[1][0].prompt).toContain('"price":4.515')
  expect(bindData).toHaveBeenCalledOnce()
 } finally {await runtime.dispose()}
})
it('delivers a verified static quote without a mapping repair when only real data was requested',async()=>{
 const snapshot={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'},{label:'可选指标',value:'—',detail:'本次未取得'}]}
 const start=vi.fn(async()=>({childSessionId:'snapshot',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(snapshot)}],sourceRecords:records})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items).toEqual(snapshot.items)
  expect(data.asOf).toContain('2026-09-25')
  expect(data.asOf).toContain('静态快照')
  expect(start).toHaveBeenCalledOnce()
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('repairs ordinary retrieved content into a static card without adding a refresh protocol or querying again',async()=>{
 const snapshot={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'}]}
 const start=vi.fn(async()=>({childSessionId:'snapshot-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:start.mock.calls.length===1?'已取得真实行情，准备展示。':JSON.stringify(snapshot)}],sourceRecords:start.mock.calls.length===1?records:[]})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prompt).not.toContain('自动绑定数据交付协议')
  expect(repair.prompt).toContain('"price":4.515')
  expect(bindData).not.toHaveBeenCalled()
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items[0].value).toBe('4.515 元')
 }finally{await runtime.dispose()}
})
it('repairs a static data task through a mapping of all twenty observed rows despite a three-row evidence sample',async()=>{
 const fullResponse={data:{date:'2026-09-25',rows:Array.from({length:20},(_,i)=>({day:'2026-09-'+String(i+1).padStart(2,'0'),price:i+1}))}}
 const mapped={version:1,type:'data-bound',requests:[{key:'quote',tool,args}],mapping:{version:1,type:'table',title:'已核验历史数据',asOf:{$from:'quote',$path:'data.date',$suffix:' · 通联 DataYes'},columns:['日期','价格'],rows:{$from:'quote',$each:'data.rows',$map:[{$path:'day'},{$path:'price',$as:'string'}]}}}
 const start=vi.fn(async()=>({childSessionId:'snapshot-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:start.mock.calls.length===1?'已取得20条真实记录，准备展示。':JSON.stringify(mapped)}],sourceRecords:start.mock.calls.length===1?[{tool,args,response:fullResponse}]:[]})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：历史记录\n使用通联真实数据，完整展示20条记录。优先使用 table 类型。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prompt).not.toContain('不输出 data-bound')
  const sampled=repair.prompt.split('\n').find(line=>line.startsWith('{"tool":'))
  expect(JSON.parse(sampled).responseSample.data.rows).toHaveLength(3)
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.rows).toHaveLength(20)
  expect(data.rows[19]).toEqual(['2026-09-20','20'])
  expect(data.asOf).toContain('静态快照')
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('materializes a legacy bound draft without enabling automatic refresh when it was not requested',async()=>{
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'snapshot',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records})}),bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items[0].value).toBe('4.515 元')
  expect(data.asOf).toContain('静态快照')
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('keeps a mapped snapshot when an unused refresh request has no successful source record',async()=>{
 const invalid=structuredClone(draft)
 invalid.requests.push({key:'optional',tool,args:{...args,url_params:{...args.url_params,ticker:'600519'}}})
 const start=vi.fn(async()=>({childSessionId:'snapshot',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(invalid)}],sourceRecords:records})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items).toEqual([{label:'沪深300ETF',value:'4.515 元'}])
  expect(data.asOf).toContain('自动更新未绑定')
  expect(start).toHaveBeenCalledOnce()
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('keeps a verified snapshot after one failed refresh repair without retrieving it again',async()=>{
 const invalid=structuredClone(draft)
 invalid.requests.push({key:'unused',tool,args:{...args,url_params:{...args.url_params,ticker:'600519'}}})
 const start=vi.fn(async()=>({childSessionId:'repair-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(invalid)}],sourceRecords:start.mock.calls.length===1?records:[]})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据，每分钟自动更新。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].synthesisOnly).toBe(true)
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items[0].value).toBe('4.515 元')
  expect(data.asOf).toContain('自动更新未绑定')
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('does not publish or bind a recovered snapshot when cancellation arrives during its repair',async()=>{
 const invalid=structuredClone(draft)
 invalid.requests.push({key:'unused',tool,args:{...args,url_params:{...args.url_params,ticker:'600519'}}})
 let finishRepair
 const start=vi.fn(async()=>({childSessionId:'repair-'+start.mock.calls.length,dispose:async()=>{},result:start.mock.calls.length===1?Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(invalid)}],sourceRecords:records}):new Promise(resolve=>{finishRepair=resolve})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n使用通联真实数据，每分钟自动更新。优先使用 market 类型；variant: metrics。'})
  await vi.waitFor(()=>expect(start).toHaveBeenCalledTimes(2))
  await runtime.cancel({parentSessionId:'parent',taskId:'task'})
  finishRepair({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}]})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('cancelled'))
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toBeUndefined()
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it.each(['literal','unobserved-reference','wrong-source'])('rejects an unverified %s snapshot even after a real business query',async mode=>{
 const invalid=structuredClone(draft)
 invalid.requests[0].args={...args,url_params:{...args.url_params,ticker:'600519'}}
 if(mode==='literal')invalid.mapping={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'100 元'}]}
 const sourceRecords=mode==='wrong-source'?[{tool:'public_data_query',args:{operation:'query',source:'tencent-quotes',parameters_json:'{}'},response}]:records
 const output=mode==='wrong-source'?{version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'}]}:invalid
 const start=vi.fn(async()=>({childSessionId:'invalid-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}],sourceRecords})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：ETF研究\n本面板：ETF行情\n数据源：通联 DataYes。优先使用 market 类型；variant: metrics。禁止模拟数据。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('failed'))
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toBeUndefined()
  expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
it('preserves verified data and persists the unbound status when saving refresh settings fails',async()=>{
 const bindData=vi.fn(async()=>{throw Error('刷新服务暂不可用')})
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'child',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records})}),bindData},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'使用通联生成ETF行情指标面板，variant: metrics。每分钟自动更新。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(data.items[0].value).toBe('4.515 元')
  expect(data.asOf).toContain('自动更新未绑定')
  expect(bindData).toHaveBeenCalledOnce()
 }finally{await runtime.dispose()}
})
it('publishes the normal rendered card and binds it to the same task node before completion',async()=>{
 const bindData=vi.fn(async()=>{})
 const adapter={start:async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records}),dispose:async()=>{}}),bindData,dispose:async()=>{}}
 const runtime=new ResearchTaskRuntime({adapter,storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'使用通联生成ETF行情指标面板，variant: metrics。每分钟自动更新。'})
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
it.each(['设置仅手动刷新','不要自动更新，但需要手动刷新','不需要自动刷新，只手动刷新'])('binds manual-only source data with automatic scheduling disabled while allowing a manual refresh: %s',async setting=>{
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],sourceRecords:records}),dispose:async()=>{}}),bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try {
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:`使用通联生成ETF行情指标面板，variant: metrics。${setting}，失败保留旧数据。`})
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

it.each([{matched:true,failed:false},{matched:false,failed:false},{matched:true,failed:true}])('accepts a public snapshot after failed MCP retrieval only when its source was actually fetched (%j)',async ({matched,failed})=>{
 const url='https://example.com/market/600519'
 const collector=componentSourceCollector([tool,'web_fetch'],[{name:tool,description:'获取 API 完整定义。'}])
 const reply=(id,text,isError=false)=>({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',isError,content:[{type:'text',text}]}]}}})
 collector.accept({type:'tool/call',data:{callId:'definition',name:tool,arguments:JSON.stringify(args)}})
 collector.accept(reply('definition','调用: GET https://gw.datayes.com/api\n【入参】\n接口定义及样例'))
 collector.accept({type:'tool/call',data:{callId:'page',name:'web_fetch',arguments:JSON.stringify({url})}})
 collector.accept(reply('page',failed?'HTTP 403，未取得网页':'贵州茅台 600519 最近收盘价 1282 元，交易日期 2026-10-09。',failed))
 const snapshot={version:1,type:'market',variant:'metrics',title:'公开行情快照',asOf:'2026-10-09 · 公开来源',items:[{label:'收盘价',value:'1282 元'}],sources:[{label:'已获取行情页',url:matched?url:'https://unobserved.example/quote'}]}
 const start=vi.fn(async()=>({childSessionId:'public-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(snapshot)}],sourceRecords:collector.records})}))
 const bindData=vi.fn(async()=>{})
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData,dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task',now:()=>now.getTime()})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'工作台：个股研究\n本面板：公开行情快照\n优先使用 market 类型；variant: metrics。通联接口已返回402，改用 web_fetch 核验公开来源；仅静态快照，明确未绑定自动刷新。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe(matched&&!failed?'completed':'failed'))
  expect(start.mock.calls).toHaveLength(matched&&!failed?1:2)
  expect(bindData).not.toHaveBeenCalled()
  if(matched&&!failed)expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput).toContain('1282')
 }finally{await runtime.dispose()}
})

const etfResponse={source:'Tushare',api:'etf_share_size + etf_basic + trade_cal',period:{start:'20261029',end:'20261105'},summary:{sizeYi:100,shareYi:50,netCreatedProducts:12,netRedeemedProducts:7},records:[],fieldInfo:{sizeYi:'期末规模（亿元）',shareYi:'期末份额（亿份）'}}
const etfRecords=[{tool,args:{view:'overview'},response:etfResponse}]
const etfDraft=()=>({version:1,type:'data-bound',requests:[{key:'q',tool,args:{view:'overview'}}],mapping:{version:1,type:'kpi',title:'ETF总览',asOf:{$from:'q',$path:'period.end'},items:[{label:'ETF总规模',value:{$from:'q',$path:'summary.sizeYi',$digits:2},unit:'亿元'}]}})
it('executes the synthesis and repair examples against real-shaped ETF responses without fabricated defaults',()=>{
 const d=etfDraft();d.mapping.items=[COMPONENT_MAPPING_EXAMPLES.metric,COMPONENT_MAPPING_EXAMPLES.missing]
 const snapshot=resolveComponentSnapshot(JSON.stringify(d),etfRecords,now)
 expect(snapshot.data.items.map(item=>item.value)).toEqual(['100','本次未取得'])
 const ranking=structuredClone(COMPONENT_MAPPING_EXAMPLES.ranking)
 const rows=[{name:'ETF甲',flowEstimateYi:-31.788},{name:'ETF乙',flowEstimateYi:-27.61}]
 const ranked={...d,mapping:ranking}
 const result=resolveComponentSnapshot(JSON.stringify(ranked),[{...etfRecords[0],response:{...etfResponse,records:rows}}],now)
 expect(result.data.variant).toBe('horizontal')
 expect(result.data.labels).toEqual(['ETF甲','ETF乙'])
 expect(result.data.series[0].values).toEqual([-31.79,-27.61])
 // A successfully rendered template must still be tied to an observed call.
 expect(resolveComponentSnapshot(JSON.stringify(ranked),[],now)).toBeNull()
})
it.each(['bound','snapshot'])('rejects repeated ETF unit conversion before displaying a %s',mode=>{
 const d=etfDraft();d.mapping.items[0].value.$scale=100
 if(mode==='bound')expect(()=>resolveBoundComponent(JSON.stringify(d),etfRecords,now)).toThrow(/summary.sizeYi.*亿元/)
 else expect(resolveComponentSnapshot(JSON.stringify(d),etfRecords,now)).toBeNull()
 d.mapping.items[0].value.$scale=1
 expect(resolveBoundComponent(JSON.stringify(d),etfRecords,now).data.items[0].value).toBe('100')
 d.mapping.items[0].value.$scale=.0001;d.mapping.items[0].unit='万亿元'
 expect(resolveBoundComponent(JSON.stringify(d),etfRecords,now).data.items[0].value).toBe('0.01')
})
it('rejects swapped ETF creation/redemption counts and preserves correct bindings',()=>{
 const d=etfDraft();d.mapping.items=[{label:'净申购产品数',value:{$from:'q',$path:'summary.netRedeemedProducts'},unit:'只'}]
 expect(()=>resolveBoundComponent(JSON.stringify(d),etfRecords,now)).toThrow(/netCreatedProducts/)
 d.mapping.items[0].value.$path='summary.netCreatedProducts'
 expect(resolveBoundComponent(JSON.stringify(d),etfRecords,now).data.items[0].value).toBe('12')
})

it('normalizes only verified public record envelopes for static snapshots too',()=>{
 const d={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args:oilArgs}],mapping:{version:1,type:'market',variant:'metrics',title:'报价',asOf:{$from:'q',$path:'dataTime'},items:{$from:'q',$each:'data.records',$map:{label:{$path:'name'},value:{$path:'price',$as:'string'}}}}}
 expect(resolveComponentSnapshot(JSON.stringify(d),oilRecords,now).data.items[0].value).toBe('2.059')
 const ambiguous=[{...oilRecords[0],response:{...oilRecords[0].response,data:{}}}]
 expect(resolveComponentSnapshot(JSON.stringify(d),ambiguous,now)).toBeNull()
})

describe('observed structured web snapshots', () => {
 const args={url:'https://example.com/releases'}
 const text=(payload,address=args.url,status='已滚动至文末，完成正文收集')=>`Fetched ${address} (HTTP 200)\n\n\n[网页读取状态：${status}]\n\n${payload}`
 function observed(raw,request=args) {
  const collector=componentSourceCollector(['web_fetch'])
  collector.accept({type:'tool/call',data:{callId:'web',name:'web_fetch',arguments:request}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:'web'},content:[{type:'tool-result',content:[{type:'text',text:raw}]}]}}})
  return collector.records
 }
 it('projects complete JSON records without copying values or granting refresh access', () => {
  const records=observed(text(JSON.stringify([{name:'Version A',count:0},{name:'Version B',count:2}])))
  expect(records[0]).toMatchObject({purpose:'snapshot',response:{source:'example.com',sourceUrl:args.url}})
  const draft={version:1,type:'data-bound',requests:[{key:'r',tool:'web_fetch',args}],mapping:{
   version:1,type:'table',title:'版本记录',columns:['版本','数量'],
   rows:{$from:'r',$each:'records',$map:[{$path:'name'},{$path:'count'}]}
  }}
  const encoded=JSON.stringify(draft),snapshot=resolveComponentSnapshot(encoded,records)
  expect(snapshot.data.rows).toEqual([['Version A','0'],['Version B','2']])
  expect(snapshot.data.sources).toEqual([{label:'example.com',url:args.url}])
  expect(snapshot.data.asOf).toContain('静态快照')
  expect(snapshot.recipe).toBeUndefined()
  expect(()=>resolveBoundComponent(encoded,records)).toThrow('自动更新的数据引用无效')
  expect(resolveComponentSnapshot(JSON.stringify({...draft,requests:[{...draft.requests[0],args:{url:'https://example.com/elsewhere'}}]}),records)).toBeNull()
 })
 it('keeps an object snapshot in data and rejects incomplete, redirected, error and credential-bearing pages', () => {
  expect(observed(text('{"count":2}'))[0].response.data).toEqual({count:2})
  const invalid=[
   text('{"count":2','https://example.com/releases'),
   text('{"count":2}','https://example.com/redirect'),
   text('{"count":2}',args.url,'正文收集不完整，请勿当作全文'),
   text('{"error":{"code":403}}'),
   text('{"count":2}')+'\n[结果截断]',
   text('说明文字\n{"count":2}'),
   text('{"$schema":"schema","count":2}')
  ]
  for(const raw of invalid)expect(observed(raw)[0].response).toBeNull()
  const url=args.url+'?access_token=private'
  expect(observed(text('{"count":2}',url),{url})[0].response).toBeNull()
 })
})

it('uses complete observed fields despite an explanatory optional missing-text default, and never turns invented defaults into data',()=>{
 const source={tool:'web_fetch',args:{url:'https://example.org/api/items'},purpose:'snapshot',response:{source:'example.org',sourceUrl:'https://example.org/api/items',records:[{title:'真实标题',body:'完整正文',url:'https://example.org/1'},{title:'缺失正文',url:'https://example.org/2'}]}}
 const input={version:1,type:'data-bound',requests:[{key:'q',tool:source.tool,args:source.args}],mapping:{version:1,type:'table',title:'记录',columns:['标题','正文','原链接'],rows:{$from:'q',$each:'records',$map:[{$path:'title'},{$path:'body',$optional:true,$default:'该记录未提供逐条说明'},{$path:'url'}]}}}
 const result=resolveComponentSnapshot(JSON.stringify(input),[source])
 expect(result?.data.rows).toEqual([['真实标题','完整正文','https://example.org/1'],['缺失正文','本次未取得','https://example.org/2']])
 input.mapping.rows.$map[1].$default='无风险且已完成'
 expect(resolveComponentSnapshot(JSON.stringify(input),[source])).toBeNull()
})

it('repairs a narrative panel as readable sourced content without forcing a tabular data binding',async()=>{
 const start=vi.fn(async()=>({childSessionId:'narrative-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',sourceRecords:records,output:[{type:'text',text:start.mock.calls.length===1?'组件内容稍后给出':JSON.stringify({version:1,type:'markdown',title:'使用说明',content:'依据实际资料整理的使用说明。来源：https://example.org/manual'})}]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData:vi.fn()},storage:{save:async()=>{}},retryDelayMs:0})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'narrative',kind:'container',prompt:'工作台：阅读与分析\n本面板：使用说明\n优先使用 markdown 类型；以完整可读正文说明实际资料。'})
  await runtime.tasks.get(receipt.taskId).runPromise
  const task=runtime.inspect({parentSessionId:'parent',taskId:receipt.taskId})
  expect(task.state,task.error).toBe('completed')
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].prompt).not.toContain('优先提交完整 data-bound')
  expect(JSON.parse(task.finalOutput).type).toBe('markdown')
 }finally{await runtime.dispose()}
})

it('automatically repairs a requested diagram instead of counting a prose substitution as visual delivery',async()=>{
 const outputs=[{version:1,type:'markdown',title:'关系说明',content:'这里只用文字描述关系。'},{version:1,type:'mind-map',title:'实际关系图',content:'# 实际对象\n- 第一分支\n  - 关联对象\n- 第二分支'}]
 const start=vi.fn(async()=>({childSessionId:'diagram-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(outputs[Math.min(start.mock.calls.length-1,1)])}]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},retryDelayMs:0})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'diagram',kind:'container',prompt:'工作台：对象关系分析\n本面板：关系图\n优先使用 mind-map 类型；需要实际可视化关系图，不可仅说明。'})
  await runtime.tasks.get(receipt.taskId).runPromise
  const task=runtime.inspect({parentSessionId:'parent',taskId:receipt.taskId})
  expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledTimes(2)
  expect(JSON.parse(task.finalOutput).type).not.toBe('markdown')
 }finally{await runtime.dispose()}
})
