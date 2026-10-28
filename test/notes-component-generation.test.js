import {createAssistantMessage} from '@deepseek-ai/dsh-llm'
import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {createSubagentAdapter,ResearchTaskRuntime,buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js'
import {noteKrakenQuoteGuidance} from '../packages/dsh-research-task-runtime/notes-kraken-source.js'
import {createQueryClient} from '../skills/ework-free-data-sources/scripts/query.mjs'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

function context(output,sourceRecords=[]){
 const parent={id:'note-session',session:{events:[]}},child={id:'actual-component-child',session:{id:'actual-component-child',events:[]}}
 const listeners=new Set(),run={id:child.id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}],sourceRecords}),dispose:vi.fn(async()=>{})}
 return {agents:{get:id=>id===parent.id?parent:undefined},subagents:{start:vi.fn(async()=>run)},tools:{schemas:()=>['public_data_query','financial_query','web_search','web_fetch','read','write','bash','research_canvas_inspect','research_canvas_apply','research_component_data','research_context_read','ework__t_123abc'].map(name=>({name}))},on:(_name,listener)=>{listeners.add(listener);return()=>listeners.delete(listener)},emit:(event)=>{for(const listener of listeners)listener(child.session,event)},run,apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'chosen',model:'chosen-model'},routable:true}}})}},llm:{stream:vi.fn()}}
}

it('gives a note component child only parent-visible external read tools, preserving the frozen note scope',async()=>{
 const ctx=context({version:1,type:'markdown',title:'测试',content:'正文'}),adapter=createSubagentAdapter(ctx,{surface:'note'})
 const handle=await adapter.start({parentSessionId:'note-session',kind:'container',query:'比特币价格面板',prompt:'生成组件',signal:new AbortController().signal,onSessionEvent:()=>{}})
 expect(ctx.subagents.start).toHaveBeenCalledWith('spawn',expect.objectContaining({parent:expect.objectContaining({id:'note-session'}),toolFilter:{allow:['public_data_query','financial_query','web_search','web_fetch']}}))
 await handle.dispose();await adapter.dispose()
})

it('respects parent-visible web tools in the note host preflight and never searches frozen note evidence',async()=>{
 for(const visible of [[],['web_search'],['web_search','web_fetch']]){
  const ctx=context({version:1,type:'markdown',title:'比特币',content:'来源资料'})
  ctx.tools.schemas=()=>visible.map(name=>({name}));ctx.agents.withInitiator=(_parent,operation)=>operation()
  ctx.web={search:vi.fn(async()=>({sources:[{url:'https://example.com/btc',title:'比特币价格',snippet:'比特币 BTC 价格 123 USD'}],content:'比特币 BTC 价格 123 USD'})),fetch:vi.fn(async()=>({statusCode:200,body:{content:'比特币 BTC 价格 123 USD'}}))}
  const adapter=createSubagentAdapter(ctx,{surface:'note'}),handle=await adapter.start({parentSessionId:'note-session',kind:'container',query:'比特币价格面板',prompt:'共享生成契约',executionContext:'授权参考 NOTE_SCOPE_ONLY',signal:new AbortController().signal,onSessionEvent:()=>{}})
  expect(ctx.web.search).toHaveBeenCalledTimes(visible.includes('web_search')?1:0)
  expect(ctx.web.fetch).toHaveBeenCalledTimes(visible.includes('web_fetch')?1:0)
  if(visible.includes('web_search'))expect(ctx.web.search.mock.calls[0][0].query).not.toContain('NOTE_SCOPE_ONLY')
  expect(ctx.subagents.start.mock.calls[0][1].prompt.at(-1).text).toContain('NOTE_SCOPE_ONLY')
  await handle.dispose();await adapter.dispose()
 }
})

const noteInput={sessionId:'note-session',requestId:'note-request',title:'未授权的整篇标题',markdown:'未授权的整篇正文',selection:'',prompt:'比特币价格面板',mode:'component',context:{scope:'none',components:[]}}
const loadGenerate=async()=> (await import('../packages/dsh-research-task-runtime/notes-component-generation.js')).generateNoteComponent
it('uses the real native component child and shared HTML contract without giving it unreferenced note text',async()=>{
 const ctx=context({version:1,type:'html',title:'价格说明',html:'<article><p>来源可核验的面板正文</p></article>'}),states=[]
 const generate=await loadGenerate(),result=await generate(ctx,{...noteInput,document:'',references:{scope:'none',components:[]}},undefined,state=>states.push(state))
 expect(ctx.subagents.start).toHaveBeenCalledOnce();expect(ctx.llm.stream).not.toHaveBeenCalled()
 const request=ctx.subagents.start.mock.calls[0][1]
 expect(request.prompt[0].text).toContain('HTML');expect(request.prompt[0].text).toContain('完整 JSON');expect(request.prompt[0].text).not.toContain('未授权的整篇正文')
 expect(result).toMatchObject({kind:'component',node:{kind:'generated-container',noteLibrary:true,generationStatus:'completed',containerSpec:{type:'html'}}})
 expect(states.some(state=>state.componentTask?.childSessionId==='actual-component-child')).toBe(true)
 expect(ctx.run.dispose).toHaveBeenCalledOnce()
})

it('preserves frozen note evidence when the shared worker selects a bound native template',async()=>{
 const ctx=context({version:1,type:'market',variant:'metrics',title:'授权收入',asOf:'用户选中资料，日期未提供',items:[{label:'收入',value:'123'}]})
 await(await loadGenerate())(ctx,{...noteInput,prompt:'创建 market.metrics 收入指标面板，不需要补充其他指标',selection:'选中的文字样式',document:'未引用的整篇机密',references:{scope:'selection',components:[{blockId:'picked',type:'research',title:'授权收入',content:'唯一授权收入123，私人检验标记 NOTE_SCOPE_ONLY'}]}})
 const sent=ctx.subagents.start.mock.calls[0][1].prompt.at(-1).text
 expect(sent).toContain('NOTE_SCOPE_ONLY');expect(sent).toContain('选中的文字样式');expect(sent).toContain('scope=selection')
 expect(sent).not.toContain('未引用的整篇机密')
})

it('returns verified Bitcoin binding evidence without applying anything to a canvas or claiming a refresh is bound',async()=>{
 const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'},response={sourceId:'kraken-ticker',source:'Kraken',dataTime:null,receivedAt:'2026-10-15T00:00:00Z',records:[{price:123456.78}]}
 const artifact={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'market',variant:'metrics',title:'比特币价格',asOf:'Kraken · 报价时点未提供',items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string',$suffix:' USD'}}],sources:[{label:'Kraken'}]}}
 const ctx=context(artifact)
 ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'observed',name:'public_data_query',arguments:JSON.stringify(args)}},{seq:2,type:'tool/result',data:{message:{source:{callId:'observed'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}}]
 const result=await(await loadGenerate())(ctx,{...noteInput,prompt:'创建比特币价格面板并绑定已成功接口，每分钟自动更新',document:'',references:{scope:'none',components:[]}})
 expect(result.sourceResult).toMatchObject({status:'verified',refreshStatus:'unbound',sourceNames:['Kraken'],recipe:{intervalMinutes:1,requests:[{toolId:'public_data_query',args}]}})
 expect(result.node.containerSpec.html).toContain('123456.78');expect(result.node.sourceText).toBe('已验证数据来源');expect(result.node.refreshMinutes).toBe(0)
 expect(ctx.subagents.start.mock.calls[0][1].toolFilter.allow).not.toContain('research_component_data')
})

it('routes an explicit original Kraken quote request through the currently visible registered tool instead of a model-added URL',async()=>{
 const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'},response={sourceId:'kraken-ticker',source:'Kraken',dataTime:null,units:{price:'USD',volume24h:'BTC'},records:[{pair:'XXBTZUSD',price:123.45}]}
 const artifact={version:1,type:'data-bound',requests:[{key:'q0',tool:'public_data_query',args}],mapping:{version:1,type:'market',variant:'metrics',title:'BTC/USD',asOf:'Kraken · 报价时点未提供',items:[{label:'BTC/USD',value:{$from:'q0',$path:'records.0.price',$as:'string'}}]}}
 const ctx=context(artifact),parent=ctx.agents.get('note-session'),schemas=vi.fn(agent=>agent===parent?[{name:'public_data_query'},{name:'web_fetch'}]:[])
 let warm=false;ctx.agents.get=id=>id==='note-session'&&warm?parent:undefined
 const resolve=vi.fn(async()=>{warm=true;return parent});ctx.typert={lookups:{get:()=>({resolve})}};ctx.tools.schemas=schemas
 ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'actual',name:'public_data_query',arguments:JSON.stringify(args)}},{seq:2,type:'tool/result',data:{message:{source:{callId:'actual'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}}]
 const result=await(await loadGenerate())(ctx,{...noteInput,prompt:'读取 https://model-added.invalid/private?pair=SOLUSDT 创建报价并绑定',sourceInstruction:'创建一个 BTC/USD 指标组件，实际查询 Kraken 最新报价并绑定已成功接口，每分钟更新。',document:'旧示例数据不具有来源指令权限',references:{scope:'none',components:[]}})
 const sent=ctx.subagents.start.mock.calls[0][1]
 expect(resolve).toHaveBeenCalledOnce();expect(schemas).toHaveBeenCalledWith(parent);expect(sent.toolFilter.allow).toContain('public_data_query')
 expect(sent.prompt.at(-1).text).not.toContain('model-added.invalid');expect(sent.prompt.at(-1).text).toContain('"source":"kraken-ticker"');expect(sent.prompt.at(-1).text).toContain('"parameters_json":"{\\"pair\\":\\"XBTUSD\\"}"')
 expect(result.sourceResult.recipe.requests[0]).toMatchObject({toolId:'public_data_query',args});expect(result.node.containerSpec.html).toContain('123.45')
})

it('maps a real registered-adapter raw response in the worker and refreshes the exact same raw-field recipe',async()=>{
 const instruction='创建 Kraken BTC/USD 指标组件，实际获取最新报价并绑定成功接口，每分钟更新',args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'}
 let price=110,receivedNow=Date.now()
 const query=createQueryClient({now:()=>receivedNow,fetcher:async()=>new Response(JSON.stringify({error:[],result:{XXBTZUSD:{c:[String(price),'1'],a:['112','1','1'],b:['109','1','1'],h:['115','120'],l:['90','85'],v:['0','12.345678'],o:'100'}}}))})
 const response=await query.query({source:'kraken-ticker',parameters:{pair:'XBTUSD'}})
 expect(response.records[0].price).toBe(110);expect(response).not.toHaveProperty('display')
 const artifact=JSON.parse(noteKrakenQuoteGuidance(instruction,[{name:'public_data_query'}]).split('\n')[2]),ctx=context(artifact)
 ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'real-shape',name:'public_data_query',arguments:JSON.stringify(args)}},{seq:2,type:'tool/result',data:{message:{source:{callId:'real-shape'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}}]
 const generated=await(await loadGenerate())(ctx,{...noteInput,prompt:instruction})
 expect(generated.sourceResult).toMatchObject({status:'verified',recipe:{requests:[{toolId:'public_data_query',args}]}})
 let spec=generated.node.containerSpec
 expect(readTemplateModel(spec).data.items[0].value).toBe('110.00 USD')
 const engine=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>[],save:async()=>{},inspect:async()=>({revision:'same-node',spec,writable:true}),apply:async(_target,_revision,next)=>{spec=next},validateRequest:async request=>({...request,connectionId:'builtin:public-data',connectionRevision:1,schemaDigest:'builtin-public-data-v1'}),execute:async(_binding,request)=>query.query({source:request.args.source,parameters:JSON.parse(request.args.parameters_json)})})
 try{
  const binding=await engine.bind({...generated.sourceResult.recipe,sessionId:'note-session',nodeId:'selected-note-node',workspaceId:'workspace'},spec)
  price=115;receivedNow+=120000;const refreshed=await engine.refresh(binding.id)
  expect(refreshed.status).toBe('success');expect(readTemplateModel(spec).data.items[0].value).toBe('115.00 USD')
 }finally{await engine.dispose()}
})

it('keeps a successfully sourced quote as a snapshot when the user did not request a refresh binding',async()=>{
 const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'},response={records:[{price:123.45}]}
 const artifact={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping:{version:1,type:'market',variant:'metrics',title:'BTC/USD',asOf:'报价时点未提供',items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}},ctx=context(artifact)
 ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'snapshot',name:'public_data_query',arguments:JSON.stringify(args)}},{seq:2,type:'tool/result',data:{message:{source:{callId:'snapshot'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}}}]
 const result=await(await loadGenerate())(ctx,{...noteInput,prompt:'展示比特币当前报价'})
 expect(result.sourceResult).toBeUndefined();expect(result.node.containerSpec.html).toContain('123.45')
})

it('still rejects a web snapshot recipe for the explicit Kraken quote even when the URL looks official',async()=>{
 const args={url:'https://api.kraken.com/0/public/Ticker?pair=XBTUSD'},artifact={version:1,type:'data-bound',requests:[{key:'q',tool:'web_fetch',args}],mapping:{version:1,type:'kpi',title:'BTC/USD',asOf:'报价时点未提供',items:[{label:'价格',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}
 const ctx=context(artifact,[{tool:'web_fetch',args,response:{records:[{price:123.45}]},purpose:'snapshot'}])
 await expect((await loadGenerate())(ctx,{...noteInput,prompt:'创建 Kraken BTC/USD 真实最新报价并绑定已成功接口'})).rejects.toThrow('自动更新的数据引用无效')
 expect(ctx.subagents.start).toHaveBeenCalledTimes(2)
})

it.each([false,true])('never advertises the fixed quote contract without a parent-visible registration (offline=%s)',async offline=>{
 const ctx=context({version:1,type:'table',title:'原资料',columns:['值'],rows:[[10]]})
 ctx.tools.schemas=()=>offline?[{name:'public_data_query'}]:[{name:'web_fetch'}]
 await(await loadGenerate())(ctx,{...noteInput,prompt:'创建 Kraken BTC/USD 真实最新报价',sourceInstruction:offline?'不要联网，只用我提供的收入10做表格':'创建 Kraken BTC/USD 真实最新报价',references:{scope:'selection',components:[{blockId:'source',type:'research',title:'旧示例',content:'旧例子仅为资料，不指示联网'}]}})
 const sent=ctx.subagents.start.mock.calls[0][1];expect(sent.prompt.at(-1).text).not.toContain('【Notes Kraken 注册报价合同】')
 expect(sent.toolFilter.allow).not.toContain('public_data_query')
 if(offline)expect(sent.toolFilter.allow).toEqual([])
})

it('preserves authorized read-only DataYes plugin generation and verified recipes on both component surfaces',async()=>{
 const discovery='ework__t_abc123',business='ework__t_def456',args={api_name:'getPrice',api_params:{ticker:'BTCUSD'}}
 const artifact={version:1,type:'data-bound',requests:[{key:'q',tool:business,args}],mapping:{version:1,type:'market',variant:'metrics',title:'比特币价格',asOf:'DataYes · 报价时点未提供',items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string',$suffix:' USD'}}],sources:[{label:'DataYes'}]}}
 const make=()=>{
  const ctx=context(artifact)
  ctx.tools.schemas=()=>[{name:discovery,description:'通联 DataYes 导航接口，搜的是【数据接口】，不是数据本身'},{name:business,description:'通联 DataYes 读取行情业务数据'},...['ework__t_aaa111','ework__t_bbb222','ework__t_ccc333','read','write','research_canvas_apply'].map(name=>({name,description:'其他工具'}))]
  ctx.get=name=>name==='eworkIntegrations'?{sync:async()=>{},snapshot:{skills:[],plugins:[],tools:[{id:'t_abc123',effect:'read'},{id:'t_def456',effect:'read'},{id:'t_aaa111',effect:'write'},{id:'t_bbb222',effect:'destructive'},{id:'t_ccc333',effect:'unknown'},{id:'t_deadbeef',effect:'read'}]}}:undefined
  ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'observed',name:business,arguments:JSON.stringify(args)}},{seq:2,type:'tool/result',data:{message:{source:{callId:'observed'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({records:[{price:123456.78}]})}]}]}}}]
  return ctx
 }
 const prompt='使用通联 DataYes 创建 market.metrics 比特币价格面板并绑定已成功接口，每分钟自动更新',ctx=make()
 const result=await(await loadGenerate())(ctx,{...noteInput,prompt,document:'',references:{scope:'none',components:[]}})
 const noteAllow=ctx.subagents.start.mock.calls[0][1].toolFilter.allow
 expect(noteAllow).toEqual([discovery,business]);expect(result.sourceResult).toMatchObject({status:'verified',sourceNames:['DataYes'],recipe:{requests:[{toolId:'t_def456',args}]}})
 expect(result.node.containerSpec.html).toContain('123456.78')
 const research=make(),adapter=createSubagentAdapter(research),handle=await adapter.start({parentSessionId:'note-session',kind:'container',query:prompt,prompt:'研究组件契约',signal:new AbortController().signal,onSessionEvent:()=>{}})
 try{expect(research.subagents.start.mock.calls[0][1].toolFilter.allow).toEqual(expect.arrayContaining(noteAllow))}
 finally{await handle.dispose();await adapter.dispose()}
})

it('keeps offline component generation local to the supplied evidence without enabling arbitrary local tools',async()=>{
 const ctx=context({version:1,type:'table',title:'选中数据',columns:['收入'],rows:[[10]]}),generate=await loadGenerate()
 await generate(ctx,{...noteInput,prompt:'不要联网，仅把选中收入10做成表格',document:'',references:{scope:'selection',components:[{blockId:'selected',type:'research',title:'收入',content:'收入10'}]}})
 expect(ctx.subagents.start.mock.calls[0][1].toolFilter.allow).toEqual([])
 expect(ctx.subagents.start.mock.calls[0][1].prompt[0].text).toContain('收入10')
})

it('reports bounded public research events and partial output without exposing tool secrets or reasoning',async()=>{
 const ctx=context({version:1,type:'table',title:'选中数据',columns:['收入'],rows:[[10]]}),states=[]
 ctx.run.localAgent.session.events=[{seq:1,type:'tool/call',data:{callId:'search',name:'web_search',arguments:JSON.stringify({query:'BTC /Users/private/secret api_key=hidden https://private.invalid'})}},{seq:2,type:'assistant/chunk',data:{chunk:{type:'reasoning-delta',text:'PRIVATE_REASONING'}}},...Array.from({length:16},(_,index)=>({seq:index+3,type:'assistant/chunk',data:{chunk:{type:'text-delta',text:'组件正文'.repeat(3000)}}}))]
 await(await loadGenerate())(ctx,{...noteInput,document:'',references:{scope:'none',components:[]}},undefined,state=>states.push(state))
 const task=states.at(-1).componentTask
 expect(task).toMatchObject({childSessionId:'actual-component-child',generationTaskId:expect.stringMatching(/^note-component-/)})
 expect(task.generationEvents.length).toBeLessThanOrEqual(12);expect(task.generationPartialText.length).toBe(30000)
 expect(task.generationEvents.some(event=>event.type==='tool-started')).toBe(true)
 expect(states.some(state=>state.componentTask.generationEvents.some(event=>event.type==='tool-started'&&event.tool==='搜索资料'))).toBe(true)
 expect(JSON.stringify(states)).not.toMatch(/PRIVATE_REASONING|\/Users\/private|api_key=hidden|https:\/\/private/)
 expect(states.every(state=>JSON.stringify(state).length<512000)).toBe(true)
})

it('refuses a data binding without an observed successful source response',async()=>{
 const ctx=context({version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args:{operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'}}],mapping:{version:1,type:'market',variant:'metrics',title:'比特币',items:[{label:'BTC/USD',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}})
 await expect((await loadGenerate())(ctx,{...noteInput,document:'',references:{scope:'none',components:[]}})).rejects.toThrow()
 expect(ctx.subagents.start).toHaveBeenCalledTimes(2)
})

it('updates only the explicitly selected research block and never infers a target from references',async()=>{
 const generate=await loadGenerate(),selected={scope:'selection',components:[{blockId:'picked',type:'research',title:'当前组件',content:'资料'}]},artifact={version:1,type:'table',title:'调整',columns:['项目'],rows:[['结果']]}
 expect(await generate(context(artifact),{...noteInput,references:selected,targetBlockId:'picked'})).toMatchObject({targetBlockId:'picked'})
 expect(await generate(context(artifact),{...noteInput,references:selected})).not.toHaveProperty('targetBlockId')
 for(const references of [{scope:'note',components:selected.components},{scope:'none',components:[]},{scope:'selection',components:[{...selected.components[0],type:'attachment'}]}]){
  const ctx=context(artifact)
  await expect(generate(ctx,{...noteInput,references,targetBlockId:'picked'})).rejects.toThrow('引用')
  expect(ctx.subagents.start).not.toHaveBeenCalled()
 }
})

it('propagates cancellation to the actual child and never returns a late component',async()=>{
 const ctx=context({}),controller=new AbortController()
 ctx.subagents.start.mockImplementation(async(_provider,request)=>{ctx.run.result=new Promise(resolve=>request.signal.addEventListener('abort',()=>resolve({stopReason:'aborted',output:[]}),{once:true}));return ctx.run})
 const generate=await loadGenerate(),pending=generate(ctx,{...noteInput,document:'',references:{scope:'none',components:[]}},controller.signal)
 await vi.waitFor(()=>expect(ctx.subagents.start).toHaveBeenCalledOnce());controller.abort()
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(ctx.run.dispose).toHaveBeenCalledOnce()
})

const capturedCharts=JSON.parse(readFileSync(new URL('./fixtures/notes-real-chart-missing-variant.json',import.meta.url),'utf8'))
const chartRequest='请在当前插入位置创建一个折线图组件，标题“原位图表验收”。仅用演示数据10月1日10、10月2日20、10月3日15，注明演示，不查行情，保留上下段落。'
it('accepts captured native chart finals only by the exact host declared contract, preserving all business data',async()=>{
 for(const index of [0,1,3]){
  const raw=capturedCharts[index],ctx=context(raw),result=await(await loadGenerate())(ctx,{...noteInput,prompt:chartRequest,document:'',references:{scope:'none',components:[]}})
  const data=readTemplateModel(result.node.containerSpec)?.data??result.node.containerSpec
  expect(data).toEqual({...raw,variant:'line'});expect(ctx.subagents.start).toHaveBeenCalledOnce();expect(ctx.llm.stream).not.toHaveBeenCalled()
  expect(ctx.subagents.start.mock.calls[0][1].prompt[0].text).toContain('"variant":"line"')
 }
})
it('does not erase the invalid empty unit in the captured native chart while recovering its discriminator',async()=>{
 const ctx=context(capturedCharts[2])
 await expect((await loadGenerate())(ctx,{...noteInput,prompt:chartRequest,document:'',references:{scope:'none',components:[]}})).rejects.toThrow('生成内容格式无效')
 expect(capturedCharts[2].unit).toBe('')
})

function liveRepairContext(first,repaired){
 const ctx=context(first),parent=ctx.agents.get('note-session'),child=ctx.run.localAgent,repairPrompts=[];let allowed=['web_search']
 ctx.agents.get=id=>id===parent.id?parent:id===child.id?child:undefined
 const append=(type,data)=>{const event={type,seq:child.session.events.length,time:Date.now(),data};child.session.events.push(event);ctx.emit(event)}
 const message=value=>createAssistantMessage({content:[{type:'text',text:JSON.stringify(value)}],source:{provider:'fixture',model:'fixture'}})
 append('turn/start',{turn:1});append('step/start',{turn:1,step:0});append('assistant/message',{turn:1,step:0,message:message(first)});append('step/end',{turn:1,step:0});append('turn/end',{turn:1,reason:{kind:'completed'}})
 child.ctx={tools:{restrict(filter){const previous=allowed;allowed=filter.allow;return()=>{allowed=previous}}}}
 child.whenIdle=()=>Promise.resolve();child.cancel=vi.fn()
 child.followup=prompt=>{
  if(allowed.length)throw Error('Repair unexpectedly has tools')
  repairPrompts.push(prompt);append('turn/start',{turn:2});append('step/start',{turn:2,step:0});append('assistant/message',{turn:2,step:0,message:message(repaired)});append('step/end',{turn:2,step:0});append('turn/end',{turn:2,reason:{kind:'completed'}})
 }
 return {ctx,child,repairPrompts}
}
it('repairs the captured invalid-unit response in a second native turn of one child, keeping its validated result',async()=>{
 const repaired=capturedCharts[3],final={...repaired,variant:'line'},f=liveRepairContext(capturedCharts[2],repaired),states=[]
 const result=await(await loadGenerate())(f.ctx,{...noteInput,prompt:chartRequest,document:'',references:{scope:'none',components:[]}},undefined,state=>states.push(state))
 expect(readTemplateModel(result.node.containerSpec)?.data??result.node.containerSpec).toEqual(final)
 expect(f.ctx.subagents.start).toHaveBeenCalledOnce();expect(f.repairPrompts).toHaveLength(1)
 expect(f.child.session.events.filter(event=>event.type==='turn/end').map(event=>event.data.turn)).toEqual([1,2])
 expect(new Set(states.map(state=>state.componentTask?.childSessionId).filter(Boolean))).toEqual(new Set([f.child.id]))
 expect(f.repairPrompts[0].content[0].text).toContain('本轮是无工具的内容修复阶段');expect(f.ctx.run.dispose).toHaveBeenCalledOnce()
})

const capturedOfflineHtml=JSON.parse(readFileSync(new URL('./fixtures/notes-real-offline-line-html.json',import.meta.url),'utf8'))
const offlineHtmlRequest='在这个位置新建另一个可交互的离线 HTML 折线图组件，标题“原位图表验收二”。仅用demo10/1=10,10/2=20,10/3=15，明确demo，默认折叠「查看全部数据」明细+可填写备注input，用于save/reopen，不查询外部数据，保留旧chart和上下段落。'
it('repairs the actual offline interactive HTML in one child and accepts its guarded real dispatch without dropping the chart or input',async()=>{
 const f=liveRepairContext(capturedOfflineHtml[0],capturedOfflineHtml[1]),states=[]
 const result=await(await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}},undefined,state=>states.push(state))
 expect(result.node).toMatchObject({generationStatus:'completed',noteLibrary:true,containerSpec:{type:'html',title:'原位图表验收二'}})
 const html=result.node.containerSpec.html;expect(html).toContain('[10,20,15]');expect(html).toContain('查看全部数据');expect(html).toContain('id="accept-note"');expect(html).toContain('shared.dispatch')
 expect(f.ctx.subagents.start).toHaveBeenCalledOnce();expect(f.repairPrompts).toHaveLength(1);expect(f.child.session.events.filter(event=>event.type==='turn/end').map(event=>event.data.turn)).toEqual([1,2]);expect(new Set(states.map(state=>state.componentTask?.childSessionId).filter(Boolean))).toEqual(new Set([f.child.id]));expect(f.repairPrompts[0].content[0].text).toContain('无工具');expect(f.ctx.run.dispose).toHaveBeenCalledOnce()
})
it('does not promote the captured empty registration into a completed HTML component if repair is also empty',async()=>{
 const f=liveRepairContext(capturedOfflineHtml[0],capturedOfflineHtml[0]);await expect((await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})).rejects.toThrow('空注册');expect(f.ctx.subagents.start).toHaveBeenCalledOnce();expect(f.repairPrompts).toHaveLength(1)
})

const latestOfflineHtml=JSON.parse(readFileSync(new URL('./fixtures/notes-real-third-offline-line-html.json',import.meta.url),'utf8'))
it('projects the actual stale offline chart geometry from its declared data without losing custom input or spending another child',async()=>{
 const f=liveRepairContext(latestOfflineHtml[0],latestOfflineHtml[1])
 const result=await(await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})
 const html=result.node.containerSpec.html,points=html.match(/<polyline points="([^"]+)"/)[1].split(' ').map(p=>p.split(',').map(Number)),ys=points.map(p=>p[1])
 expect(ys[0]-ys[2]).toBeCloseTo(ys[2]-ys[1]);expect(ys).toEqual([250,50,150])
 expect(html).toContain('>9.5</text>');expect(html).toContain('>20.5</text>');expect(html).toContain('[10,20,15]')
 expect(html.slice(html.indexOf('<script>'))).toBe(latestOfflineHtml[1].html.slice(latestOfflineHtml[1].html.indexOf('<script>')))
 expect(html.slice(html.indexOf('<details>'),html.indexOf('<script>'))).toBe(latestOfflineHtml[1].html.slice(latestOfflineHtml[1].html.indexOf('<details>'),latestOfflineHtml[1].html.indexOf('<script>')))
 expect(f.ctx.subagents.start).toHaveBeenCalledOnce();expect(f.repairPrompts).toHaveLength(1)
})

it('collects shared and chart problems before the sole child repair, then accepts the complete corrected HTML',async()=>{
 const bad={...latestOfflineHtml[1],html:latestOfflineHtml[1].html.replace('shared.dispatch','missing.dispatch').replace('points="145,213.1578947368421','points="145,14')},f=liveRepairContext(bad,latestOfflineHtml[1])
 const result=await(await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})
 expect(result.node.generationStatus).toBe('completed');expect(f.repairPrompts).toHaveLength(1);const repair=f.repairPrompts[0].content[0].text
 expect(repair).toContain('共享状态');expect(repair).toContain('线与数据点不一致');expect(repair).toContain('无工具');expect(f.ctx.subagents.start).toHaveBeenCalledOnce()
})
it.each(['markdown','chart'])('does not use a %s downgrade or readable fallback after a proven HTML geometry repair error',async type=>{
 const bad={...latestOfflineHtml[1],html:latestOfflineHtml[1].html.replace('points="145,213.1578947368421','points="145,14')},replacement=type==='markdown'?{version:1,type,title:'说明',content:'仅返回说明不能替代用户需要的图形和可输入备注。'}:{version:1,type,variant:'line',title:'线图',labels:['A','B'],series:[{name:'A',values:[10,20]}]},f=liveRepairContext(bad,replacement)
 await expect((await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})).rejects.toThrow(/图表几何修复必须保留/);expect(f.repairPrompts).toHaveLength(1);expect(f.ctx.subagents.start).toHaveBeenCalledOnce()
})
it.each(['drop-chart','change-values','drop-input','drop-details'])('does not accept %s as a complete HTML geometry repair',async change=>{
 const bad={...latestOfflineHtml[1],html:latestOfflineHtml[1].html.replace('points="145,213.1578947368421','points="145,14')}
 let html=latestOfflineHtml[1].html
 if(change==='drop-chart')html=html.replace(/<svg[\s\S]*?<\/svg>/,'')
 if(change==='change-values')html=html.replace('values:[10,20,15]','values:[10,99,15]')
 if(change==='drop-input')html=html.replace(/<textarea[\s\S]*?<\/textarea>/,'')
 if(change==='drop-details')html=html.replace(/<details>[\s\S]*?<\/details>/,'')
 const f=liveRepairContext(bad,{...latestOfflineHtml[1],html})
 await expect((await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})).rejects.toThrow(/图表几何修复必须保留/);expect(f.repairPrompts).toHaveLength(1);expect(f.ctx.subagents.start).toHaveBeenCalledOnce()
})

it('does not change declared business values while repairing an independent shared-state failure',async()=>{
 const bad={...latestOfflineHtml[1],html:latestOfflineHtml[1].html.replace('shared.dispatch','missing.dispatch')},changed={...latestOfflineHtml[1],html:latestOfflineHtml[1].html.replace('values:[10,20,15]','values:[10,99,15]').replace('演示数据：20','演示数据：99').replace('>20</td>','>99</td>')},f=liveRepairContext(bad,changed)
 await expect((await loadGenerate())(f.ctx,{...noteInput,prompt:offlineHtmlRequest,document:'',references:{scope:'none',components:[]}})).rejects.toThrow(/图表几何修复必须保留/);expect(f.repairPrompts).toHaveLength(1)
})
