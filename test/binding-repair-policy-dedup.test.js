import {afterAll,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {createAssistantMessage,createUserMessage} from '@deepseek-ai/dsh-llm'
import {ResearchTaskRuntime,createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {generateNoteComponent} from '../packages/dsh-research-task-runtime/notes-component-generation.js'
import {COMPONENT_BOUND_DATA_PROMPT} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const protocol=COMPONENT_BOUND_DATA_PROMPT
const copies=text=>text.split(protocol).length-1
const textOf=parts=>parts.filter(part=>part.type==='text').map(part=>part.text).join('\n')
const sha=text=>createHash('sha256').update(text).digest('hex')
const measurements=[]
afterAll(()=>{if(process.env.SHERLOCK_BINDING_DEDUP_CAPTURE)writeFileSync(process.env.SHERLOCK_BINDING_DEDUP_CAPTURE,JSON.stringify({unit:'UTF-16 code units / UTF-8 bytes',scope:'Each newly composed prompt; retained prior messages are measured separately and are never rewritten.',protocolChars:protocol.length,protocolBytes:Buffer.byteLength(protocol),measurements},null,2))})
const tool='ework__t_123abc',args={api_name:'quote',url_params:{date:'20260926',ticker:'510300'}}
const response={data:{date:'2026-09-25',rows:[{name:'沪深300ETF',price:4.515}]}}
const staticData={version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'沪深300ETF',value:'4.515 元'}]}
const mapped={version:1,type:'data-bound',requests:[{key:'quote',tool,args}],mapping:{version:1,type:'market',variant:'metrics',title:'ETF行情',asOf:{$from:'quote',$path:'data.date'},items:{$from:'quote',$each:'data.rows',$map:{label:{$path:'name'},value:{$path:'price',$as:'string',$suffix:' 元'}}}}}
const query=binding=>'工作台：ETF研究\n本面板：ETF行情指标\n优先使用 market 类型；variant: metrics。使用通联真实数据，'+(binding?'每分钟自动更新。':'仅本次快照，不需要自动更新。')
const frozen={scope:'selection',title:'',document:'',selection:'仅授权这一段',references:{scope:'selection',components:[]}}

function fixture({surface='research',owned=false,outputs=[mapped],offline=false,reference=frozen}={}){
 const parent={id:'binding-parent',session:{id:'binding-parent',events:[]}},agents=new Map([[parent.id,parent]]),native=[],repairMessages=[],histories=[],restrictions=[]
 const ctx={agents,on:()=>()=>{},tools:{schemas:()=>offline?[]:[{name:tool,description:'通联 DataYes financial business source'},{name:'public_data_query'}]},get:name=>name==='eworkIntegrations'?{sync:async()=>{},snapshot:{skills:[{id:'builtin:ework-workbench-components',enabled:true},{id:'builtin:ework-free-data-sources',enabled:true}],tools:[{id:'t_123abc',effect:'read'}]}}:undefined,
  subagents:{start:vi.fn(async(_provider,request)=>{
   native.push(request)
   const id='binding-child-'+native.length,events=[],original=createUserMessage({content:request.prompt,source:{kind:'plugin',plugin:'fixture'}})
   const append=(type,data)=>events.push({seq:events.length,time:Date.now(),type,data,...(['user/message','assistant/message'].includes(type)?{surfaceOp:'append'}:{})})
   const answer=value=>createAssistantMessage({content:[{type:'text',text:JSON.stringify(value)}],source:{provider:'fixture',model:'fixture'}})
   const finish=(turn,value)=>{append('assistant/message',{turn,step:0,message:answer(value)});append('step/end',{turn,step:0});append('turn/end',{turn,reason:{kind:'completed'}})}
   append('user/message',original);append('turn/start',{turn:1});append('step/start',{turn:1,step:0})
   if(!offline&&native.length===1){append('tool/call',{callId:'observed',name:tool,arguments:JSON.stringify(args)});append('tool/result',{message:{source:{callId:'observed'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(response)}]}]}})}
   const first=outputs[Math.min(native.length-1,outputs.length-1)];finish(1,first)
   const child={id,session:{id,events}}
   if(owned)Object.assign(child,{ctx:{tools:{restrict:filter=>{restrictions.push(filter);return()=>{}}}},whenIdle:async()=>{},cancel:vi.fn(),followup:message=>{
    const before=JSON.stringify(events),previous=JSON.stringify(original)
    repairMessages.push(message)
    append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[message]});append('turn/start',{turn:2});append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]});append('user/message',message);append('step/start',{turn:2,step:0});finish(2,outputs.at(-1))
    histories.push({before,afterPrefix:JSON.stringify(events.slice(0,JSON.parse(before).length)),previous,afterPrevious:JSON.stringify(original),initialText:textOf(original.content),currentText:textOf(message.content)})
   }})
   agents.set(id,child)
   return{id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(first)}]}),dispose:async()=>{}}
  })}}
 const run=async(prompt=query(true))=>{
  if(surface==='note')return generateNoteComponent(ctx,{sessionId:parent.id,prompt,title:'未引用的标题',document:'未引用的整篇正文',selection:reference.selection,references:reference.references})
  const adapter=createSubagentAdapter(ctx),bindData=vi.fn(async()=>{});adapter.bindData=bindData
  const runtime=new ResearchTaskRuntime({adapter,retryDelayMs:0,createId:()=> 'binding-task',now:()=>Date.parse('2026-09-26T08:00:00Z'),storage:{load:async()=>undefined,save:async()=>{}}})
  try{await runtime.start({parentSessionId:parent.id,canvasNodeId:'binding-card',kind:'container',prompt});await runtime.tasks.get('binding-task').runPromise;const task=runtime.inspect({parentSessionId:parent.id,taskId:'binding-task'});return{task,bindData}}finally{await runtime.dispose()}
 }
 const measure=(label)=>{
  const prompts=[...native.map(request=>({kind:'native-spawn',text:textOf(request.prompt),tools:request.toolFilter.allow})),...repairMessages.map(message=>({kind:'owned-child-followup',text:textOf(message.content),tools:[]}))]
  for(const [index,request]of prompts.entries())measurements.push({label,phase:index===0?'initial':'repair',kind:request.kind,copies:copies(request.text),chars:request.text.length,bytes:Buffer.byteLength(request.text),sha256:sha(request.text),tools:request.tools})
  for(const history of histories)measurements.push({label,kind:'retained-history-plus-current',initialCopies:copies(history.initialText),currentCopies:copies(history.currentText),combinedCopies:copies(history.initialText)+copies(history.currentText),historyUnchanged:history.before===history.afterPrefix})
  return prompts
 }
 return{ctx,native,repairMessages,histories,restrictions,run,measure}
}

it.each(['research','note'])('keeps one initial host protocol for a valid refresh component on %s',async surface=>{
 const f=fixture({surface}),result=await f.run(),requests=f.measure(surface+' valid binding')
 expect(requests).toHaveLength(1);expect(copies(requests[0].text)).toBe(1)
 if(surface==='note'){expect(result.sourceResult.refreshStatus).toBe('unbound');expect(requests[0].text).toContain(JSON.stringify(frozen));expect(requests[0].text).toContain('尚未保存刷新设置，不声称已开始持续刷新')}
 else{expect(result.task.state).toBe('completed');expect(result.bindData).toHaveBeenCalledOnce()}
})

it.each([{surface:'research',owned:false},{surface:'note',owned:false},{surface:'note',owned:true}])('uses one current binding repair declaration without changing prior evidence: %j',async route=>{
 const f=fixture({...route,outputs:[staticData,mapped]}),result=await f.run(),requests=f.measure(route.surface+(route.owned?' owned':' fallback')+' refresh repair')
 expect(requests).toHaveLength(2);for(const request of requests)expect(copies(request.text)).toBe(1)
 expect(requests[1].text).toContain('mapping 的模板结构：');expect(requests[1].text).toContain('只输出一个 data-bound JSON');expect(requests[1].text).toContain('responseArrayLengths');expect(requests[1].text).toContain('"price":4.515');expect(requests[1].tools).toEqual([])
 if(route.surface==='note'){expect(result.sourceResult.refreshStatus).toBe('unbound');expect(requests[0].text).toContain(JSON.stringify(frozen));if(!route.owned)expect(requests[1].text).toContain(JSON.stringify(frozen))}
 else{expect(result.task.state).toBe('completed');expect(result.bindData).toHaveBeenCalledOnce()}
 if(route.owned){expect(f.native).toHaveLength(1);expect(f.repairMessages).toHaveLength(1);expect(f.restrictions).toEqual([{allow:[]}]);for(const history of f.histories){expect(history.before).toBe(history.afterPrefix);expect(history.previous).toBe(history.afterPrevious);expect(copies(history.initialText)+copies(history.currentText)).toBe(2)}}
 else expect(f.native).toHaveLength(2)
})

it.each([{surface:'research',owned:false},{surface:'note',owned:false},{surface:'note',owned:true}])('keeps the full typed repair template for malformed data-bound output: %j',async route=>{
 const {surface}=route
 const malformed=structuredClone(mapped);delete malformed.mapping.items.$map.value
 const f=fixture({...route,outputs:[malformed,mapped]}),result=await f.run(),requests=f.measure(surface+(route.owned?' owned':' fallback')+' malformed bound repair')
 expect(requests).toHaveLength(2);expect(copies(requests[1].text)).toBe(1);expect(requests[1].text).toContain('每项必须同时有 label 和 value');expect(requests[1].text).toContain('实际成功调用的 ework__ 工具名或 public_data_query');expect(requests[1].text).toContain('实际绑定回执为准')
 expect(surface==='note'?result.node.generationStatus:result.task.state).toBe('completed')
 if(route.owned){expect(f.native).toHaveLength(1);expect(f.repairMessages).toHaveLength(1)}
})

it.each([false,true])('preserves frozen Notes evidence quoting the protocol through actual binding repair (owned=%s)',async owned=>{
 const reference={scope:'selection',title:'',document:'',selection:protocol,references:{scope:'selection',components:[{blockId:'selected',type:'research',title:'协议原文',content:protocol}]}}
 const f=fixture({surface:'note',owned,outputs:[staticData,mapped],reference}),result=await f.run(),requests=f.measure('note quoted evidence '+(owned?'owned':'fallback'))
 expect(result.sourceResult.refreshStatus).toBe('unbound');expect(requests).toHaveLength(2)
 for(const request of requests)expect(copies(request.text)).toBe(1)
 expect(requests[0].text).toContain(JSON.stringify(reference));expect(requests[0].text).not.toContain('未引用的整篇正文')
 if(owned){expect(f.histories[0].initialText).toContain(JSON.stringify(reference));expect(f.histories[0].before).toBe(f.histories[0].afterPrefix)}
 else expect(requests[1].text).toContain(JSON.stringify(reference))
})

it('revokes incoming ownership when an ordinary typed adapter rebuilds a static Notes prompt',async()=>{
 const f=fixture({surface:'note'}),adapter=createSubagentAdapter(f.ctx,{surface:'note',noteBindingProtocol:true})
 f.ctx.subagents.start.mockImplementation(async(_provider,request)=>{f.native.push(request);throw Error('CAPTURE_ONLY')})
 try{await expect(adapter.start({parentSessionId:'binding-parent',kind:'container',query:query(false),prompt:'OLD_PRODUCER_DECLARATION\n'+protocol,bindingProtocolIncluded:true,signal:new AbortController().signal,onSessionEvent(){}})).rejects.toThrow('CAPTURE_ONLY')
  const sent=textOf(f.native[0].prompt);expect(copies(sent)).toBe(1);expect(sent).not.toContain('OLD_PRODUCER_DECLARATION');expect(sent).toContain(query(false))
 }finally{await adapter.dispose()}
})

it.each(['research','note'])('retains static data repair policy without forcing refresh on %s',async surface=>{
 const invalid={version:1,type:'market',variant:'metrics',title:'ETF行情',items:[{label:'沪深300ETF',value:'999 元'}]}
 const f=fixture({surface,outputs:[invalid,staticData]}),result=await f.run(query(false)),requests=f.measure(surface+' static repair')
 expect(requests).toHaveLength(2);expect(copies(requests[0].text)).toBe(surface==='note'?1:0);expect(copies(requests[1].text)).toBe(surface==='note'?1:0);expect(requests[1].text).toContain('本轮不建立自动更新绑定、不重新检索');expect(requests[1].text).toContain('仅物化数据而不保存刷新配方')
 expect(surface==='note'?result.node.generationStatus:result.task.state).toBe('completed')
 if(surface==='research')expect(result.bindData).not.toHaveBeenCalled()
})

it.each(['research','note'])('retains one full protocol when an untyped data-bound repair has no typed builder on %s',async surface=>{
 const malformed=structuredClone(mapped);delete malformed.mapping.items.$map.value
 const f=fixture({surface,outputs:[malformed,mapped]}),result=await f.run('创建一个ETF指标组件，使用通联真实数据并每分钟自动更新。'),requests=f.measure(surface+' untyped bound repair')
 expect(requests).toHaveLength(2);expect(copies(requests[1].text)).toBe(1);expect(requests[1].text).toContain('自动绑定数据交付协议');expect(requests[1].text).toContain('responseArrayLengths');expect(requests[1].tools).toEqual([])
 expect(surface==='note'?result.node.generationStatus:result.task.state).toBe('completed')
})

it.each(['research','note'])('keeps offline supplied records and tool restrictions unchanged on %s',async surface=>{
 const data={version:1,type:'table',title:'用户记录',columns:['项目','值'],rows:[['甲',10],['乙',0]]},prompt='只用用户给出的甲10、乙0创建一个table组件，禁止联网。'
 const f=fixture({surface,offline:true,outputs:[data]}),result=await f.run(prompt),requests=f.measure(surface+' offline')
 expect(requests).toHaveLength(1);expect(requests[0].tools).toEqual([]);expect(copies(requests[0].text)).toBe(surface==='note'?1:0);expect(requests[0].text).toContain(prompt)
 const output=surface==='note'?result.node.containerSpec:JSON.parse(result.task.finalOutput);expect(readTemplateModel(output)?.data??output).toMatchObject(data)
})

it.each([false,true])('retains a quoted protocol in source evidence even when fallback metadata owns the host declaration: %s',async owns=>{
 const f=fixture({surface:'note',offline:true}),adapter=createSubagentAdapter(f.ctx,{surface:'note',noteBindingProtocol:true})
 f.ctx.subagents.start.mockImplementation(async(_provider,request)=>{f.native.push(request);throw Error('CAPTURE_ONLY')})
 const user='用户参考资料原字节：'+protocol,host=owns?'宿主当前声明：'+protocol+'\n':'',prompt=host+user
 try{await expect(adapter.start({parentSessionId:'binding-parent',kind:'container',query:'只使用给定资料，不联网。',prompt,preservePrompt:true,bindingProtocolIncluded:owns,executionContext:'冻结资料：'+JSON.stringify({selection:protocol}),signal:new AbortController().signal,onSessionEvent(){}})).rejects.toThrow('CAPTURE_ONLY')
  const sent=textOf(f.native[0].prompt);expect(sent).toContain(prompt);expect(sent).toContain(JSON.stringify({selection:protocol}));expect(copies(sent)).toBe(2)
 }finally{await adapter.dispose()}
})
