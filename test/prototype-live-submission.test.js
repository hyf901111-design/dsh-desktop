import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import {apply as spawn} from '@deepseek-ai/dsh-subagent-spawn-in-process'
import {observedPrototypeSources,resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import {createPrototypeSubmission} from '../packages/dsh-research-task-runtime/prototype-view-submission.js'
import {createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {SHARED_PANEL_USAGE} from '../packages/dsh-research-task-runtime/shared-component-contract.js'
import {PANEL_COLOR_INSTRUCTION} from '../packages/dsh-research-task-runtime/design-policy.js'
import {designPolicyIssue} from '../packages/dsh-research-task-runtime/design-policy.js'

const file='/fixture/user.html',targets={files:[file]},args={file_path:file,section:'DYN.products',limit:500}
const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:2,rows:[{code:'00001',tag:'甲',flow:2},{code:'00002',tag:'甲',flow:3}]}}
const selection=[{key:'products',section:args.section}],view={source:'products',path:'rows',kind:'table',key:'code',value:'flow',columns:[{field:'code',label:'编号'},{field:'flow',label:'流入'}],search:['code'],groupBy:{field:'tag',label:'赛道',columns:[{operation:'count',label:'数量'},{operation:'sum',field:'flow',label:'流入'}]}}
const input={title:'赛道对照',sources:selection,view}
const cleanup=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
it.each(['unread','partial','foreign-file','discovery','index','function','ambiguous'])('does not authorize an initial submission from %s evidence',mode=>{
 let records=[structuredClone(record)],sources=selection
 if(mode==='unread')records=[]
 if(mode==='partial'){records[0].response.rows.pop();records[0].response.nextOffset=2}
 if(mode==='foreign-file')records[0].args.file_path='/fixture/other.html'
 if(mode==='discovery')records[0].purpose='discovery'
 if(mode==='index'||mode==='function'){records[0].args.section=records[0].response.section=mode==='index'?'index':'function:boardPeers';sources=[{key:'products',section:records[0].args.section}]}
 if(mode==='ambiguous'){records.push({...structuredClone(record),args:{...args,file_path:'/fixture/other.html'}});expect(observedPrototypeSources(records,sources,{files:[file,'/fixture/other.html']})).toBeNull();return}
 expect(observedPrototypeSources(records,sources,targets)).toBeNull()
})
it('selects complete reads without caller arguments, retains leading zeros and freezes each source',()=>{
 const records=[structuredClone(record),{...structuredClone(record),response:{...record.response,rows:[record.response.rows[0]],nextOffset:2}}]
 const result=observedPrototypeSources(records,selection,targets)
 expect(result.requests).toEqual([{key:'products',tool:'read_prototype',args}]);expect(result.records[0].response.rows).toHaveLength(2)
 records[0].response.rows[0].code='changed';expect(result.records[0].response.rows[0].code).toBe('00001')
 expect(observedPrototypeSources(records,[{...selection[0],args}],targets)).toBeNull()
 expect(observedPrototypeSources(records,[selection[0],selection[0]],targets)).toBeNull()
 expect(observedPrototypeSources(records,[{key:'constructor',section:args.section}],targets)).toBeNull()
})
async function fixture(validateSnapshot){
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});cleanup.push(()=>ctx.fiber.dispose())
 const child=(await ctx.agents.create({sessionId:'live-submit-child',agentOptions:{}})).agent,parent=(await ctx.agents.create({sessionId:'live-submit-parent',agentOptions:{}})).agent
 const controller=new AbortController(),records=[],submission=createPrototypeSubmission({observeRecords:()=>records,targets,signal:controller.signal,validateSnapshot});cleanup.push(submission.dispose);child.ctx.tools.restrict({allow:[]});submission.register(child)
 return{ctx,child,parent,records,submission,controller,invoke:(value=input,agent=child)=>ctx.tools.execute({name:'submit_prototype_view',arguments:value,callId:'live-submit',agent,signal:controller.signal})}
}
it('allows another authorized dataset in the same live call without another task or schema registration',async()=>{
 const f=await fixture(),other={tool:'read_prototype',args:{...args,section:'DATA.summary'},response:{section:'DATA.summary',value:{rows:[{code:'总计',tag:'甲',flow:5}]}}}
 expect((await f.invoke()).isError).toBe(true)
 f.records.push(structuredClone(record),other)
 const value={title:'两组资料',sources:[...selection,{key:'summary',section:'DATA.summary'}],repairSummary:'修正内部校验问题',note:'原型快照，点评规则待确认',view:{kind:'tabs',tabs:[{label:'明细',view},{label:'汇总',view:{...view,source:'summary',path:'value.rows'}}]}}
 expect((await f.invoke(value)).isError).toBe(false)
 f.submission.accept({type:'tool/result',data:{message:{source:{callId:'live-submit'},content:[{type:'tool-result',toolCallId:'live-submit',content:[{type:'text',text:'{"accepted":true}'}]}]}}});f.submission.accept({type:'step/end'})
 const candidate=JSON.parse((await f.submission.result).output[0].text)
 expect(candidate.requests.map(request=>request.args.section)).toEqual([args.section,'DATA.summary']);expect(candidate.mapping).not.toHaveProperty('sources')
 expect(candidate.mapping.note).toBe(value.note);expect(candidate.mapping).not.toHaveProperty('repairSummary');expect(JSON.stringify(candidate)).not.toContain(value.repairSummary)
 expect(resolvePrototypeHtmlSnapshot(candidate,f.records).data.html).toContain('00002')
 expect(f.ctx.tools.schemas(f.parent).map(tool=>tool.name)).not.toContain('submit_prototype_view');expect((await f.invoke(input,f.parent)).isError).toBe(true)
})
it('keeps the native initial child through retrieval, final-gate feedback and corrected typed submission',async()=>{
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'live-submit-native-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 ctx.tools.register(defineTool({name:'read_prototype',description:'Read authorized prototype',parameters:{file_path:{type:'string',required:true},section:{type:'string'},limit:{type:'integer'}},output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,execute(){return record.response}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}
  async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length
   if(n>4)throw Error('The same initial child must finish without another attempt')
   expect(request.tools.map(tool=>tool.name)).toContain('submit_prototype_view')
   const value=n===1?input:n===2?args:n===3?{title:'赛道对照',sources:selection,html:'<button>展开</button><p></p><script id="sherlock-source-products" type="application/json"></script><script>const data=JSON.parse(document.getElementById("sherlock-source-products").textContent);document.querySelector("p").textContent=data.rows[0].code;window.sherlockShared.register({initialState:{},reduce:s=>s,render(){}})</script>'}:input
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'live-call-'+n,name:n===2?'read_prototype':'submit_prototype_view',arguments:JSON.stringify(value)}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx),signal=new AbortController();cleanup.push(()=>adapter.dispose())
 const query='工作台：根据 /fixture/user.html 创建工作台\n本面板：竞品赛道对照\n读取 boardPeers 相关数据，保留汇总与成员展开。\n仅生成本面板，优先使用 html 类型。'
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:'读取 boardPeers 相关数据，保留汇总与成员展开。'},signal:signal.signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const result=await handle.result
 expect(result.stopReason).toBe('completed');expect(children).toHaveLength(1);expect(requests).toHaveLength(4);expect(result.sourceRecords).toHaveLength(1)
 const toolErrors=requests.flatMap(request=>request.messages.flatMap(message=>message.content??[])).filter(block=>block.type==='tool-result'&&block.isError)
 expect(JSON.stringify(toolErrors)).toContain('has not read its complete data');expect(JSON.stringify(toolErrors)).toContain('dispatch')
 const prompt=requests[0].messages.filter(message=>message.role==='user').flatMap(message=>message.content??[]).map(block=>block.text??'').join('')
 expect(prompt).toContain('sources:[{key:');expect(prompt).not.toContain('只输出一个data-bound JSON')
 expect(prompt).toContain('kind:"table"');expect(prompt).toContain('groupBy:');expect(prompt).not.toContain('mapping.html')
 expect(prompt.match(/仅调用submit_prototype_view/g)).toHaveLength(1);expect(prompt).toContain('内部校验修复说明仅写repairSummary')
 expect(prompt.split(SHARED_PANEL_USAGE)).toHaveLength(2)
 expect(prompt.split(PANEL_COLOR_INSTRUCTION)).toHaveLength(2)
 const candidate=JSON.parse(result.output[0].text);expect(candidate.requests).toEqual([{key:'products',tool:'read_prototype',args}]);expect(candidate.mapping.view.groupBy).toEqual(view.groupBy)
 expect(resolvePrototypeHtmlSnapshot(candidate,result.sourceRecords).data.html).toContain('00002')
 expect(ctx.tools.schemas(parent).map(tool=>tool.name)).not.toContain('submit_prototype_view')
 await handle.dispose();expect(ctx.tools.schemas(children[0]).map(tool=>tool.name)).not.toContain('submit_prototype_view')
})
it('cancels and unregisters an initial submission without publishing an artifact',async()=>{
 const f=await fixture();f.records.push(record);f.controller.abort()
 expect(f.ctx.tools.schemas(f.child).map(tool=>tool.name)).not.toContain('submit_prototype_view')
 expect((await f.invoke()).isError).toBe(true)
})
it('keeps authorized source reads open after a named dataset is complete until the live HTML child submits',async()=>{
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'named-source-extra-evidence-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 const extraArgs={file_path:file,section:'EV'},extra={section:'EV',value:{rows:[{code:'证据',tag:'甲',flow:5}]}}
 ctx.tools.register(defineTool({name:'read_prototype',description:'Read authorized prototype',parameters:{file_path:{type:'string',required:true},section:{type:'string'},limit:{type:'integer'}},output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,execute(value){return value.section==='EV'?extra:record.response}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}
  async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length
   if(n>3)throw Error('The same child must finish after reading its remaining evidence')
   if(n<3)expect(request.tools.map(tool=>tool.name)).toContain('read_prototype')
   const value=n===1?args:n===2?extraArgs:{...input,sources:[...selection,{key:'evidence',section:'EV'}],view:{kind:'sections',sections:[{label:'产品',view},{label:'证据',view:{...view,source:'evidence',path:'value.rows'}}]}}
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'additional-source-'+n,name:n<3?'read_prototype':'submit_prototype_view',arguments:JSON.stringify(value)}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx);cleanup.push(()=>adapter.dispose())
 const requirement='读取 DYN.products，保留完整产品指标及其相关来源证据，所需资料由本卡继续读取。',query='工作台：根据 /fixture/user.html 创建工作台\n本面板：产品与证据\n'+requirement+'\n仅生成本面板，优先使用 html 类型。'
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:requirement},signal:new AbortController().signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const result=await handle.result
 expect(result.stopReason).toBe('completed');expect(children).toHaveLength(1);expect(requests).toHaveLength(3);expect(result.sourceRecords).toHaveLength(2)
 expect(JSON.parse(result.output[0].text).requests.map(request=>request.args.section)).toEqual(['DYN.products','EV'])
})
it('returns complete-record feedback before typed acceptance and lets the original child correct the source',async()=>{
 const ctx=new Context();new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new SubagentRuntime(ctx);spawn(ctx,{providerName:'spawn'});cleanup.push(()=>ctx.fiber.dispose())
 const parent=(await ctx.agents.create({sessionId:'coverage-before-ack-parent',agentOptions:{provider:'fixture',model:'fixture'}})).agent,requests=[],children=[]
 ctx.on('agent/created',({agent})=>{if(agent.id!==parent.id)children.push(agent)})
 const summaryArgs={...args,section:'DATA.summary'},summary={section:summaryArgs.section,offset:1,total:1,rows:[{code:'全部',tag:'甲',flow:5}]}
 ctx.tools.register(defineTool({name:'read_prototype',description:'Read authorized prototype',parameters:{file_path:{type:'string',required:true},section:{type:'string'},limit:{type:'integer'}},output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,execute(value){return value.section===summaryArgs.section?summary:record.response}}))
 ctx.llm.registerAdapter(['fixture'],new class extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:id}}
  async listModels(){return[]}
  async *stream(request){
   requests.push(request);const n=requests.length
   if(n>4)throw Error('The complete source must be corrected in the same initial child')
   const value=n===1?summaryArgs:n===2?args:n===3?{...input,sources:[{key:'products',section:summaryArgs.section}]}:input
   yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:'coverage-call-'+n,name:n<3?'read_prototype':'submit_prototype_view',arguments:JSON.stringify(value)}};yield{type:'finish',reason:{kind:'tool-calls'}}
  }
 }())
 const adapter=createSubagentAdapter(ctx);cleanup.push(()=>adapter.dispose())
 const requirement='保留 DYN.products 的完整2条产品明细与分组展开。',query='工作台：根据 /fixture/user.html 创建工作台\n本面板：产品明细\n'+requirement+'\n仅生成本面板，优先使用 html 类型。'
 const handle=await adapter.start({parentSessionId:parent.id,kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:'根据 /fixture/user.html 创建工作台',dataMode:'source'},sourceRequirement:requirement},signal:new AbortController().signal,onSessionEvent:()=>{}});cleanup.push(()=>handle.dispose())
 const result=await handle.result
 expect(result.stopReason).toBe('completed');expect(children).toHaveLength(1);expect(requests).toHaveLength(4)
 const errorBlocks=requests.at(-1).messages.flatMap(message=>message.content??[]).filter(block=>block.type==='tool-result'&&block.isError)
 expect(JSON.stringify(errorBlocks)).toContain('完整 2 条记录')
 const accepted=JSON.parse(result.output[0].text)
 expect(accepted.requests).toEqual([{key:'products',tool:'read_prototype',args}]);expect(resolvePrototypeHtmlSnapshot(accepted,result.sourceRecords).data.html).toContain('00002')
})
it('keeps a source-only probe unaccepted and lets the same child submit the real records',async()=>{
 const f=await fixture();f.records.push(structuredClone(record))
 let finished=false;f.submission.result.then(()=>{finished=true})
 const rejected=await f.invoke({title:'占位',sources:selection,note:'待补齐',html:'<script id="sherlock-source-products" type="application/json"></script>'})
 expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected.content)).toContain('尚未使用已注入来源呈现内容')
 f.submission.accept({type:'tool/result',data:{error:true,message:{source:{callId:'live-submit'},content:[]}}});f.submission.accept({type:'step/end'})
 await Promise.resolve();expect(finished).toBe(false)
 expect((await f.invoke(input)).isError).toBe(false)
 f.submission.accept({type:'tool/result',data:{message:{source:{callId:'live-submit'},content:[]}}});f.submission.accept({type:'step/end'})
 const candidate=JSON.parse((await f.submission.result).output[0].text)
 expect(candidate.mapping.view).toEqual(view);expect(candidate.mapping.title).toBe(input.title)
})
it('pinpoints a nonempty source slot and accepts its local repair with the original readRows helper',async()=>{
 const f=await fixture();f.records.push(structuredClone(record))
 const empty='<script id="sherlock-source-products" type="application/json"></script>'
 const page='<main></main>'+empty+'<script>function readRows(id){var t=document.getElementById(id).textContent;return JSON.parse(t).rows}const rows=readRows("sherlock-source-products");rows.forEach(row=>{const p=document.createElement("p");p.textContent=row.code;document.querySelector("main").append(p)})</script>'
 const draft={title:'真实明细',sources:selection,html:page.replace(empty,empty.replace('></script>','>{"rows":[]}</script>'))}
 const rejected=await f.invoke(draft)
 expect(rejected.isError).toBe(true)
 expect(JSON.stringify(rejected.content)).toContain('来源槽');expect(JSON.stringify(rejected.content)).toContain('sherlock-source-products');expect(JSON.stringify(rejected.content)).toContain('删除槽内样本/占位 JSON')
 expect((await f.invoke({...draft,html:page})).isError).toBe(false)
 f.submission.accept({type:'tool/result',data:{message:{source:{callId:'live-submit'},content:[]}}});f.submission.accept({type:'step/end'})
 const candidate=JSON.parse((await f.submission.result).output[0].text),snapshot=resolvePrototypeHtmlSnapshot(candidate,f.records)
 expect(snapshot.data.html).toContain('00001');expect(snapshot.data.html).toContain('00002');expect(snapshot.data.html).toContain('function readRows(id)')
 expect(snapshot.data.html).not.toContain('rows":[]')
})
const editablePage='<div id="legend-swatch" class="legend-dot" style="background:#1E6FFF"></div><main></main><script id="sherlock-source-products" type="application/json"></script><script>const rows=JSON.parse(document.getElementById("sherlock-source-products").textContent).rows;rows.forEach(row=>{const p=document.createElement("p");p.textContent=row.code;document.querySelector("main").append(p)})</script>'
it('repairs an initial page through its live typed tool without resending HTML or skipping any validation',async()=>{
 const f=await fixture(snapshot=>{const issue=designPolicyIssue(snapshot.data.html);if(issue)throw Error(issue)})
 f.records.push(structuredClone(record))
 const initial={title:'明细',sources:selection,note:'保留来源口径',html:editablePage},first=await f.invoke(initial)
 expect(first.isError).toBe(true)
 const feedback=JSON.stringify(first.content);expect(feedback).toContain('内联样式第1项');expect(feedback).toContain('legend-swatch.legend-dot');expect(feedback).toContain('background:#1E6FFF');expect(feedback).toContain('htmlEdits')
 const repaired=await f.invoke({title:initial.title,sources:selection,repairSummary:'仅修复内联背景',htmlEdits:[{find:'background:#1E6FFF',replace:'background:var(--sherlock-chart-1)'}]})
 expect(repaired.isError).toBe(false)
 f.submission.accept({type:'tool/result',data:{message:{source:{callId:'live-submit'},content:[]}}});f.submission.accept({type:'step/end'})
 const accepted=JSON.parse((await f.submission.result).output[0].text)
 expect(accepted.mapping.note).toBe(initial.note);expect(accepted.mapping.html).toBe(editablePage.replace('#1E6FFF','var(--sherlock-chart-1)'))
 expect(accepted.mapping).not.toHaveProperty('htmlEdits');expect(accepted.mapping).not.toHaveProperty('repairSummary')
 const artifact=resolvePrototypeHtmlSnapshot(accepted,f.records);expect(artifact.data.html).toContain('00001');expect(artifact.data.html).toContain('00002');expect(designPolicyIssue(artifact.data.html)).toBeNull()
})
it('rejects a cached helper reading fields from the wrong envelope and accepts the local unwrap edit',async()=>{
 const f=await fixture()
 const provenanceArgs={file_path:file,section:'PROV'},sources=[{key:'prov',section:'PROV'}]
 const payload={confidence:{recon:'222/240'},recon_rows:Array.from({length:30},(_,i)=>({code:String(i).padStart(5,'0')}))}
 f.records.push({tool:'read_prototype',args:provenanceArgs,response:{path:file,section:'PROV',value:payload}})
 const parse='data = JSON.parse(el.textContent)'
 const html='<main></main><script id="sherlock-source-prov" type="application/json"></script><script>(function(){var data=null;function getData(){if(data)return data;var el=document.getElementById("sherlock-source-prov");try{'+parse+'}catch(e){data=null}return data}function renderStatic(d){var c=d.confidence||{};document.querySelector("main").append(c.recon||"—",String((d.recon_rows||[]).length))}var shared=window.sherlockShared.register({initialState:{},reduce:s=>s,render(){var d=getData();if(d)renderStatic(d)}})})()</script>'
 const initial={title:'三层对账',sources,html}
 const rejected=await f.invoke(initial)
 expect(rejected.isError).toBe(true)
 const feedback=JSON.stringify(rejected.content)
 expect(feedback).toContain('sherlock-source-prov');expect(feedback).toContain('value.confidence');expect(feedback).toContain('htmlEdits');expect(feedback).not.toContain(file)
 const repaired=await f.invoke({title:initial.title,sources,htmlEdits:[{find:parse,replace:parse+'.value'}]})
 expect(repaired.isError).toBe(false)
 f.submission.accept({type:'tool/result',data:{message:{source:{callId:'live-submit'},content:[]}}});f.submission.accept({type:'step/end'})
 const accepted=JSON.parse((await f.submission.result).output[0].text)
 expect(accepted.mapping.html).toBe(html.replace(parse,parse+'.value'))
 const artifact=resolvePrototypeHtmlSnapshot(accepted,f.records)
 expect(artifact.data.html).toContain(JSON.stringify(payload))
})
it('keeps initial rejected drafts private and refuses ambiguous edits, changed aliases and combined outputs',async()=>{
 const f=await fixture(snapshot=>{const issue=designPolicyIssue(snapshot.data.html);if(issue)throw Error(issue)}),edit={title:'明细',sources:selection,htmlEdits:[{find:'#1E6FFF',replace:'var(--sherlock-chart-1)'}]}
 f.records.push(structuredClone(record))
 expect(JSON.stringify((await f.invoke(edit)).content)).toContain('No rejected HTML from this child')
 expect((await f.invoke({title:'明细',sources:selection,html:editablePage})).isError).toBe(true)
 expect((await f.invoke(edit,f.parent)).isError).toBe(true)
 expect(JSON.stringify((await f.invoke({...edit,sources:[{key:'different',section:args.section}]})).content)).toContain('retain the latest rejected page source aliases')
 expect((await f.invoke({...edit,view})).isError).toBe(true)
 expect((await f.invoke({...edit,html:editablePage})).isError).toBe(true)
 expect(JSON.stringify((await f.invoke({...edit,htmlEdits:[{find:'p',replace:'x'}]})).content)).toContain('exactly once')
 expect((await f.invoke(edit)).isError).toBe(false)
})
it('names an unread required section so the same child can retrieve it without rewriting its artifact',async()=>{
 const f=await fixture();f.records.push(structuredClone(record))
 const extra={key:'channels',section:'CH4'},value={...input,sources:[...selection,extra]}
 const rejected=await f.invoke(value)
 expect(rejected.isError).toBe(true)
 const text=JSON.stringify(rejected.content)
 expect(text).toContain('channels');expect(text).toContain('CH4');expect(text).toContain('retain the existing page')
 expect(text).not.toContain(file)
 f.records.push({tool:'read_prototype',args:{file_path:file,section:'CH4'},response:{section:'CH4',offset:1,total:2,rows:[{label:'渠道甲'},{label:'渠道乙'}]}})
 expect((await f.invoke(value)).isError).toBe(false)
})
it('reports the missing page of an owned partial read without granting data from a foreign file',()=>{
 let issue
 const partial=structuredClone(record);partial.response.rows.pop();partial.response.nextOffset=2
 expect(observedPrototypeSources([partial],selection,targets,{onIssue:value=>{issue=value}})).toBeNull()
 expect(issue).toContain('1 of 2 rows');expect(issue).toContain('offset 2')
 const foreign=structuredClone(record);foreign.args.file_path='/private/foreign.html';foreign.response.nextOffset=987654
 expect(observedPrototypeSources([foreign],selection,targets,{onIssue:value=>{issue=value}})).toBeNull()
 expect(issue).not.toContain('987654');expect(issue).not.toContain('/private/foreign.html')
})
