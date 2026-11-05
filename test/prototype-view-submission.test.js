import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import {createPrototypeSubmission} from '../packages/dsh-research-task-runtime/prototype-view-submission.js'
import {resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'

const path='/fixture/user.html',args={file_path:path,section:'DATA.products',limit:500}
const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:244,rows:Array.from({length:244},(_,i)=>({code:String(i).padStart(5,'0'),value:i/100})),presentation:{numericFormats:[{field:'value',scale:1}]}}}
const input={title:'全部记录',view:{source:'products',path:'rows',kind:'table',columns:[{field:'code',label:'编号'},{field:'value',label:'规模',unit:'亿'}],search:['code']}}
const prepare=(records=[record],signal,validateSnapshot,candidate,panelRequest='DATA.products 全部244条记录，搜索与排序')=>createPrototypeSubmission({records,panelRequest,targets:{files:[path]},signal,validateSnapshot,candidate})
const cleanup=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
it('keeps the typed submission available for a generic panel only when the rejected draft names exact complete owned sources',()=>{
 const options={records:[record],panelRequest:'竞品赛道对照与展开',targets:{files:[path]}},candidate={version:1,type:'data-bound',requests:[{key:'peerRows',tool:'read_prototype',args}],mapping:{version:1,type:'html',presentation:{}}}
 expect(createPrototypeSubmission(options)).toBeUndefined()
 const submission=createPrototypeSubmission({...options,candidate});expect(submission).toBeTruthy();cleanup.push(submission.dispose)
 expect(submission.instruction).toContain('"key":"products"');expect(submission.instruction).toContain(JSON.stringify(args))
 const changed=structuredClone(candidate);changed.requests[0].args.limit=40
 expect(createPrototypeSubmission({...options,candidate:changed})).toBeUndefined()
})
async function fixture(validateSnapshot,candidate,panelRequest){
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 cleanup.push(()=>ctx.fiber.dispose())
 const child=(await ctx.agents.create({sessionId:'submission-child',agentOptions:{}})).agent
 const parent=(await ctx.agents.create({sessionId:'submission-parent',agentOptions:{}})).agent
 const sibling=(await ctx.agents.create({sessionId:'submission-sibling',agentOptions:{}})).agent
 const signal=new AbortController(),submission=prepare(undefined,signal.signal,validateSnapshot,candidate,panelRequest);cleanup.push(submission.dispose)
 child.ctx.tools.restrict({allow:[]});submission.register(child)
 return{ctx,child,parent,sibling,submission,signal,invoke:(value=input,agent=child,id='view-submit')=>ctx.tools.execute({name:'submit_prototype_view',arguments:value,callId:id,agent,signal:signal.signal})}
}
const receipt=(id='view-submit',isError=false)=>({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',toolCallId:id,isError,content:[{type:'text',text:'{"accepted":true}'}]}]}}})
it('returns missing stacked regions through the real typed tool and accepts a complete correction in the same child',async()=>{
 const f=await fixture(undefined,undefined,'DATA.products 全部244条记录。①指标总表；②双层水平条形；③渠道堆叠条。')
 const schema=f.ctx.tools.schemas(f.child)[0].parameters.properties.view.oneOf
 expect(schema[0].properties.series.items.properties).toHaveProperty('subtract');expect(schema[2].required).toEqual(['kind','sections'])
 const partial=await f.invoke(input);expect(partial.isError).toBe(true);expect(JSON.stringify(partial.content)).toContain('明确要求2处')
 const stacked={source:'products',path:'rows',kind:'stacked-bars',label:'code',key:'code',series:[{field:'value',label:'原值'},{field:'value',subtract:'value',label:'差额'}]}
 const value={title:'完整区域',view:{kind:'sections',sections:[{label:'指标总表',view:input.view},{label:'规模拆分',view:stacked},{label:'渠道结构',view:stacked}]}}
 expect((await f.invoke(value,f.child,'complete')).isError).toBe(false)
 f.submission.accept(receipt('complete'));f.submission.accept({type:'step/end'})
 const result=JSON.parse((await f.submission.result).output[0].text)
 expect(result.mapping.view.sections).toHaveLength(3);expect(resolvePrototypeHtmlSnapshot(result,[record]).data.html).toContain('00243')
})
it('accepts a typed source grouping while retaining authoritative source and format validation',async()=>{
 const f=await fixture(),value=structuredClone(input)
 value.view.groupBy={field:'code',label:'编号',columns:[{operation:'count',label:'数量'},{operation:'sum',field:'value',label:'总值',digits:2}]}
 const schema=f.ctx.tools.schemas(f.child)[0].parameters.properties.view.oneOf[0].properties.groupBy
 expect(schema.properties.columns.items.properties.operation.enum).toEqual(['count','sum','any']);expect(schema.required).toEqual(['field','label','columns'])
 const invalid=structuredClone(value);invalid.view.groupBy.columns[1].field='invented'
 expect((await f.invoke(invalid)).isError).toBe(true);expect((await f.invoke(value)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const output=JSON.parse((await f.submission.result).output[0].text);expect(output.mapping.view.groupBy).toEqual(value.view.groupBy);expect(resolvePrototypeHtmlSnapshot(output,[record]).data.html).toContain('00243')
})
const sourcePaint='const data=JSON.parse(document.getElementById("sherlock-source-products").textContent);document.querySelector("p").textContent=data.rows[0].code;'
const draftHtml='<style>input{color:red}</style><input aria-label="搜索"><p>保留成员展开</p><p>相同</p><p>相同</p><script id="sherlock-source-products" type="application/json"></script><script>'+sourcePaint+'const search=document.querySelector("input"),shared=window.sherlockShared.register({initialState:{query:""},reduce:(s,a)=>({...s,query:a.query}),render:s=>{search.value=s.query}});search.oninput=()=>shared.dispatch({query:search.value});</script>'
const repairDraft=()=>({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'原页面',html:draftHtml,note:'保留来源说明',presentation:{}}})
const edits={title:'原页面',htmlEdits:[{find:'input{color:red}',replace:'input{color:var(--sherlock-control-text)}'}]}
it('repairs a frozen custom draft without regenerating its interface or losing full source records',async()=>{
 const draft=repairDraft(),f=await fixture(snapshot=>expect(snapshot.data.html).toContain('00243'),draft)
 draft.mapping.html='<p>调用方已改变</p>'
 expect(f.ctx.tools.schemas(f.child)[0].parameters.properties).toHaveProperty('htmlEdits')
 expect(f.ctx.tools.schemas(f.child)[0].parameters.properties).not.toHaveProperty('view')
 expect(f.ctx.tools.schemas(f.child)[0].parameters.required).toContain('htmlEdits')
 expect(f.ctx.tools.schemas(f.child)[0].parameters.properties).not.toHaveProperty('note')
 expect(f.ctx.tools.schemas(f.child)[0].parameters.properties).toHaveProperty('repairSummary')
 expect(f.submission.instruction).toContain('局部修复优先')
 expect((await f.invoke(input)).isError).toBe(true)
 expect((await f.invoke({...edits,repairSummary:'修正变量与内部校验，不显示在组件中'})).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'})
 const output=JSON.parse((await f.submission.result).output[0].text)
 expect(output.mapping.html).toBe(draftHtml.replace('input{color:red}','input{color:var(--sherlock-control-text)}'))
 expect(output.mapping.note).toBe('保留来源说明');expect(output.mapping).not.toHaveProperty('htmlEdits');expect(output.mapping).not.toHaveProperty('presentation')
 expect(output.mapping).not.toHaveProperty('repairSummary');expect(JSON.stringify(output)).not.toContain('内部校验')
 expect(resolvePrototypeHtmlSnapshot(output,[record]).data.html).toContain('00243')
})
it.each([
 ['ambiguous',[{find:'<p>相同</p>',replace:''}],'match exactly once'],
 ['missing',[{find:'not in draft',replace:''}],'match exactly once'],
 ['overlapping',[{find:'input{color:red}',replace:'x'},{find:'color:red',replace:'y'}],'overlap'],
 ['empty',[{find:'',replace:''}],'nonempty find']
])('rejects %s HTML edits atomically and permits a corrected submission',async(_name,htmlEdits,error)=>{
 const f=await fixture(undefined,repairDraft())
 const rejected=await f.invoke({title:'原页面',htmlEdits});expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected.content)).toContain(error)
 expect((await f.invoke(edits,f.child,'corrected')).isError).toBe(false)
 f.submission.accept(receipt('corrected'));f.submission.accept({type:'step/end'});await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'})
})
it('keeps source slots and final semantic validation authoritative for partial HTML repairs',async()=>{
 let calls=0
 const f=await fixture(()=>{if(++calls===1)throw Error('仍需修正完整交互')},repairDraft())
 const removed=await f.invoke({title:'原页面',htmlEdits:[{find:'sherlock-source-products',replace:'sherlock-source-forged'}]})
 expect(removed.isError).toBe(true);expect(calls).toBe(0)
 const rejected=await f.invoke(edits);expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected.content)).toContain('仍需修正完整交互')
 expect((await f.invoke({...edits,html:'<p>混用</p>'})).isError).toBe(true)
 expect((await f.invoke(edits,f.child,'corrected')).isError).toBe(false)
 f.submission.accept(receipt('corrected'));f.submission.accept({type:'step/end'});await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'});expect(calls).toBe(2)
})
it('does not apply partial repairs without an owned draft using exactly the host source aliases',async()=>{
 const f=await fixture()
 expect(f.ctx.tools.schemas(f.child)[0].parameters.properties).toHaveProperty('htmlEdits')
 const rejected=await f.invoke(edits);expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected.content)).toContain('No rejected HTML from this child')
 const candidate=repairDraft();candidate.requests[0].key='different-alias'
 const submission=prepare(undefined,undefined,undefined,candidate);cleanup.push(submission.dispose)
 expect(submission.instruction).not.toContain('htmlEdits')
})
it('allows a full custom HTML redesign while requiring explicit repair content',async()=>{
 const f=await fixture(undefined,repairDraft())
 expect((await f.invoke({title:'空提交'})).isError).toBe(true)
 expect((await f.invoke({title:'重排',html:draftHtml.replace('color:red','color:var(--sherlock-control-text)'),htmlEdits:[]})).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});const output=JSON.parse((await f.submission.result).output[0].text)
 expect(output.mapping.html).toContain('color:var(--sherlock-control-text)');expect(output.mapping).not.toHaveProperty('htmlEdits')
})
it('returns final-gate errors before acceptance so the same child can correct its content',async()=>{
 let calls=0
 const f=await fixture(snapshot=>{expect(snapshot.data.html).toContain('00243');if(++calls===1)throw Error('真实最终交互校验未通过')})
 let done=false;f.submission.result.then(()=>{done=true})
 const rejected=await f.invoke();expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected.content)).toContain('真实最终交互校验未通过')
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 const corrected=await f.invoke(input,f.child,'corrected');expect(corrected.isError).toBe(false)
 f.submission.accept(receipt('corrected'));f.submission.accept({type:'step/end'})
 await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'});expect(calls).toBe(2)
})
it('exposes only the child scoped tool despite an empty global allowlist; parent and sibling cannot call it',async()=>{
 const f=await fixture()
 expect(f.ctx.tools.schemas(f.child).map(t=>t.name)).toEqual(['submit_prototype_view'])
 for(const agent of [f.parent,f.sibling]){
  expect(f.ctx.tools.schemas(agent).map(t=>t.name)).not.toContain('submit_prototype_view')
  expect((await f.invoke(input,agent)).isError).toBe(true)
 }
})
it('waits for durable successful tool receipt and step end, fixes source authority and retains all 244 records',async()=>{
 const f=await fixture(),value=structuredClone(input)
 let done=false;f.submission.result.then(()=>{done=true})
 const native=await f.invoke(value);expect(native.isError).toBe(false)
 value.view.columns[0].field='changed';f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 f.submission.accept(receipt('other'));f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 f.submission.accept(receipt());await Promise.resolve();expect(done).toBe(false)
 f.submission.accept({type:'step/end'})
 const result=await f.submission.result,candidate=JSON.parse(result.output[0].text)
 expect(candidate.requests).toEqual([{key:'products',tool:'read_prototype',args}]);expect(candidate.mapping).toEqual({version:1,type:'html',...input})
 const resolved=resolvePrototypeHtmlSnapshot(candidate,[record]);expect(resolved).toBeTruthy();expect(resolved.data.html).toContain('00243')
 f.submission.dispose();expect(f.ctx.tools.schemas(f.child)).toEqual([])
})
it('returns a correctable native tool error for wrong percentage scaling without accepting a result',async()=>{
 const f=await fixture(),bad=structuredClone(input);bad.view.columns[1]={field:'value',label:'规模',unit:'%',scale:100}
 const rejected=await f.invoke(bad);expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected.content)).toContain('当前为 100')
 const good=await f.invoke();expect(good.isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'})
})
it('accepts advertised numeric formats and reports the actual invalid source path for a correctable submission',async()=>{
 const f=await fixture(),bad=structuredClone(input);bad.view.path='value.missing'
 const rejected=await f.invoke(bad);expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected.content)).toContain('view.path');expect(JSON.stringify(rejected.content)).toContain('Available root fields: section, offset, total, rows, presentation')
 const good=structuredClone(input);good.view.digits=3;good.view.scale=1
 expect((await f.invoke(good)).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'})
})
it.each(['partial','unread','other-path'])('does not expose submission for unproved data: %s',mode=>{
 const source=structuredClone(record)
 if(mode==='partial')source.response.nextOffset=245
 if(mode==='unread')source.purpose='discovery'
 if(mode==='other-path')source.args.file_path='/not-authorized.html'
 expect(prepare([source])).toBeUndefined()
})
it('allows custom HTML for requirements beyond a record view and injects only empty fixed source slots',async()=>{
 const f=await fixture(),html='<p>自定义界面</p><script id="sherlock-source-products" type="application/json"></script><script>'+sourcePaint+'</script>'
 expect((await f.invoke({title:'自定义',html})).isError).toBe(false)
 f.submission.accept(receipt());f.submission.accept({type:'step/end'});await expect(f.submission.result).resolves.toMatchObject({stopReason:'completed'})
})
it.each(['abort','failed-receipt','dispose'])('never accepts stale or unsuccessful execution: %s',async mode=>{
 const f=await fixture();await f.invoke();let done=false;f.submission.result.then(()=>{done=true})
 if(mode==='abort')f.signal.abort()
 if(mode==='dispose')f.submission.dispose()
 f.submission.accept(receipt('view-submit',mode==='failed-receipt'));f.submission.accept({type:'step/end'});await Promise.resolve();expect(done).toBe(false)
 if(mode!=='failed-receipt')expect(f.ctx.tools.schemas(f.child)).toEqual([])
})

it('advertises submission on the real native first request even when the outer task includes a dotted HTML file path',async()=>{
 const {default:SubagentRuntime}=await import('@deepseek-ai/dsh-subagent'),{apply:spawn}=await import('@deepseek-ai/dsh-subagent-spawn-in-process')
 const {createSubagentAdapter}=await import('../packages/dsh-research-task-runtime/index.js')
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'native-submit-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent
 const wire=Promise.withResolvers(),errors=[]
 ctx.on('agent/error',({error})=>errors.push(error?.message))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async listModels(){return[]}async *stream(request){wire.resolve(request);yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:'fixture'};yield{type:'block-end',index:0,block:{type:'text',text:'fixture'}};yield{type:'finish',reason:'stop'}}}())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query:'工作台：根据 /fixture/user.html 建立工作台\n本面板：全部产品\nDATA.products 全部244条记录，搜索与筛选\n仅生成本面板，优先使用 html 类型。',prompt:'调用submit_prototype_view交付。',synthesisOnly:true,preservePrompt:true,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:'DATA.products 全部244条记录，搜索与筛选'},prototypeSubmission:{records:[record]},signal:controller.signal,onSessionEvent:()=>{}})
 cleanup.push(()=>handle.dispose())
 const request=await Promise.race([wire.promise,handle.result.then(result=>{throw Error('Native child ended before wire: '+JSON.stringify({result,errors}))})])
 expect(request.tools.map(tool=>tool.name)).toEqual(['submit_prototype_view'])
 expect(request.messages.at(-1).content[0].text).not.toContain('当前是无工具的最终内容生成阶段')
 await handle.result;expect(ctx.tools.schemas(parent)).toEqual([])
})
it('feeds actual final interaction errors back through the native tool before accepting a corrected source view',async()=>{
 const {default:SubagentRuntime}=await import('@deepseek-ai/dsh-subagent'),{apply:spawn}=await import('@deepseek-ai/dsh-subagent-spawn-in-process')
 const {createSubagentAdapter}=await import('../packages/dsh-research-task-runtime/index.js')
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'native-final-gate-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[]
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}
  async listModels(){return[]}
  async *stream(request){
   requests.push(request)
   if(requests.length>2)throw Error('A rejected submission should need only the corrected native call')
   const args=requests.length===1?{title:'全部记录',html:'<button>展开</button><p></p><script id="sherlock-source-products" type="application/json"></script><script>'+sourcePaint+'window.sherlockShared.register({initialState:{},reduce:s=>s,render(){}})</script>'}:input
   yield{type:'block-start',index:0,blockType:'tool-call'}
   yield{type:'block-end',index:0,block:{type:'tool-call',id:'submit-'+requests.length,name:'submit_prototype_view',arguments:JSON.stringify(args)}}
   yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query:'工作台：根据 /fixture/user.html 创建工作台\n本面板：全部产品\nDATA.products 全部244条记录，搜索和展开\n仅生成本面板，优先使用 html 类型。',prompt:'调用submit_prototype_view交付。',synthesisOnly:true,preservePrompt:true,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:'DATA.products 全部记录'},prototypeSubmission:{records:[record]},signal:controller.signal,onSessionEvent:()=>{}})
 cleanup.push(()=>handle.dispose())
 const result=await handle.result;expect(result.stopReason).toBe('completed');expect(requests).toHaveLength(2)
 const errors=requests[1].messages.flatMap(message=>message.content??[]).filter(block=>block.type==='tool-result'&&block.isError)
 expect(JSON.stringify(errors)).toContain('dispatch');expect(JSON.parse(result.output[0].text).mapping.view).toEqual(input.view)
})

it.each(['source-handoff','custom-repair','draftless-repair','rejected-alias-repair','partial-source','unobserved-source'])('keeps prototype recovery tied to the actual child source ownership: %s',async mode=>{
 const {default:SubagentRuntime}=await import('@deepseek-ai/dsh-subagent'),{apply:spawn}=await import('@deepseek-ai/dsh-subagent-spawn-in-process')
 const {createSubagentAdapter}=await import('../packages/dsh-research-task-runtime/index.js')
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'native-retained-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 let reads=0
 ctx.tools.register(defineTool({name:'read_prototype',description:'Read authorized prototype',parameters:{file_path:{type:'string',required:true},section:{type:'string'},limit:{type:'integer'}},output:{schema:{type:'object',properties:{},additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,execute(){reads++;return mode==='partial-source'?{...record.response,rows:record.response.rows.slice(0,40),nextOffset:41}:record.response}}))
 const candidate=mode==='custom-repair'?repairDraft():undefined
 const priorText=candidate?JSON.stringify(candidate):'SOURCE_PHASE_COMPLETE'
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}
  async listModels(){return[]}
  async *stream(request){
   requests.push(request)
   if(requests.length>(mode==='rejected-alias-repair'?4:3))throw Error('Repair should finish in the original child without a further model turn')
   const submitting=request.tools?.length===1&&request.tools[0].name==='submit_prototype_view'&&!request.tools[0].parameters.properties.sources
   if(!submitting&&((requests.length===(mode==='rejected-alias-repair'?3:2))||mode==='unobserved-source')){
    yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:priorText}};yield{type:'finish',reason:'stop'};return
   }
   if(mode==='rejected-alias-repair'&&!submitting&&requests.length===2){
    const draft=repairDraft(),bad={title:draft.mapping.title,sources:[{key:'holdings',section:args.section}],html:draft.mapping.html.replaceAll('sherlock-source-products','sherlock-source-holdings')}
    yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'initial-rejected-html',name:'submit_prototype_view',arguments:JSON.stringify(bad)}};yield{type:'finish',reason:{kind:'tool-calls'}};return
   }
   const call=!submitting?{id:'source',name:'read_prototype',arguments:JSON.stringify(args)}:{id:'retained-submit',name:'submit_prototype_view',arguments:JSON.stringify(candidate||mode==='rejected-alias-repair'?edits:input)}
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',...call}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),controller=new AbortController();cleanup.push(()=>adapter.dispose())
 const query='工作台：根据 /fixture/user.html 创建工作台\n本面板：全部产品\nDATA.products 全部244条记录，搜索与筛选\n仅生成本面板，优先使用 html 类型。'
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:['custom-repair','draftless-repair'].includes(mode)?'竞品赛道对照与展开':'DATA.products 全部244条记录'},signal:controller.signal,onSessionEvent:()=>{}})
 cleanup.push(()=>handle.dispose())
 const initial=await handle.result
 expect(initial.sourceRecords).toHaveLength(mode==='unobserved-source'?0:1);expect(reads).toBe(mode==='unobserved-source'?0:1);expect(handle.repair).toBeTypeOf('function')
 if(['partial-source','unobserved-source'].includes(mode)){
  // A caller cannot turn another panel's complete record into this child's
  // evidence, even when the path and metadata look authorized.
  expect(handle.repair({prompt:'修复',synthesisOnly:true,prototypeSubmission:{records:[record]}})).toBeUndefined()
  expect(requests).toHaveLength(mode==='unobserved-source'?1:2)
  expect(ctx.tools.schemas(children[0]).map(tool=>tool.name)).not.toContain('submit_prototype_view')
  return
 }
 const retained=handle.repair({prompt:'FULL_FALLBACK_MUST_NOT_BE_REPEATED',synthesisOnly:true,prototypeSubmission:{records:[],candidate,observedSources:mode==='draftless-repair',retainedRepairPrompt:'修复实际校验问题，继续交付原组件。'}})
 expect(retained).toBe(handle)
 const result=await retained.result
 expect(result.stopReason).toBe('completed');expect(reads).toBe(1);expect(children).toHaveLength(1)
 expect(requests).toHaveLength(mode==='rejected-alias-repair'?4:3);expect(requests.at(-1).tools.map(tool=>tool.name)).toEqual(['submit_prototype_view'])
 const followup=requests.at(-1).messages.filter(message=>message.role==='user').at(-1).content[0].text
 expect(followup).toContain('修复实际校验问题');expect(followup).not.toContain('FULL_FALLBACK');expect(followup).not.toContain(priorText)
 const value=JSON.parse(result.output[0].text)
 expect(value.requests).toEqual([{key:mode==='rejected-alias-repair'?'holdings':'products',tool:'read_prototype',args}]);expect(resolvePrototypeHtmlSnapshot(value,[record]).data.html).toContain('00243')
 expect(result.sourceRecords).toEqual([]);expect(ctx.tools.schemas(parent).map(tool=>tool.name)).not.toContain('submit_prototype_view')
 await retained.dispose();expect(ctx.tools.schemas(children[0]).map(tool=>tool.name)).not.toContain('submit_prototype_view')
})
