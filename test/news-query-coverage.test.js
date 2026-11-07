import {afterEach,expect,it,vi} from 'vitest'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {ResearchTaskRuntime,createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {componentSourceCollector} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {NEWS_EMPTY_NOTE} from '../packages/dsh-research-task-runtime/news-topic-filter.js'
import {NEWS_QUERY_MARKER,plannedNewsQueries,newsQueryArgs,newsCoverageState,restoreNewsCoverage,completeNewsQueries} from '../packages/dsh-research-task-runtime/news-query-coverage.js'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {installWorkbenchLocaleMessages,validWorkbenchLocaleMessage} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {WORKBENCH_ENGLISH} from '../packages/dsh-research-task-runtime/workbench-locale.js'
const names=['中际旭创','新易盛','工业富联']
const plan=names.map(query=>({source:'eastmoney-news',query,limit:12}))
const panel={title:'三公司相关新闻',prompt:'分别查询三家公司的真实相关新闻。缺失如实说明，仅手动快照。',type:'news',size:'large',publicData:{profile:'news',requests:plan.map(row=>({source:row.source,parameters_json:JSON.stringify({query:row.query,limit:row.limit})})),intervalMinutes:0}}
const input={requestId:'coverage',title:'三公司研究',originalRequest:'分别展示中际旭创（300308）、新易盛（300502）、工业富联（601138）的真实相关新闻；取不到明确缺失，不缩小范围。仅手动快照。',panels:[panel]}
const normalized=validateWorkbench(input),prompt=workbenchPanelPrompt(normalized,normalized.panels[0])
const article=(name,index=0)=>({title:name+'业务动态（合成记录）'+index,summary:name+'公开业务进展的合成摘要。',time:'2026-10-22T10:00:00+08:00',url:`https://example.org/${encodeURIComponent(name)}/${index}`})
const record=(request,rows)=>({tool:'public_data_query',args:newsQueryArgs(request),response:{sourceId:request.source,records:rows}})
const data=(rows=[article(names[0])],note='仅使用实际来源记录，当前为手动快照。')=>({version:1,type:'news',title:'三公司相关新闻',items:rows.map(row=>({title:row.title,summary:row.summary,date:row.time,url:row.url})),note})
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();vi.restoreAllMocks()})
async function fixture({rows=[record(plan[0],[article(names[0])])],attempts=[],output=data(),queryNews,storage,outputs,requestPrompt=prompt,bindData}={}){
 let saved,calls=0;storage??={save:async value=>{saved=structuredClone(value)},load:async()=>saved}
 const start=vi.fn(async()=>({childSessionId:'coverage-child',result:Promise.resolve({stopReason:'completed',sourceRecords:rows,sourceAttempts:attempts,output:[{type:'text',text:JSON.stringify(outputs?.[calls++]??output)}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,queryNews,bindData},storage,retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const request={parentSessionId:'p',canvasNodeId:'n',kind:'container',prompt:requestPrompt}
 const receipt=await runtime.start(request);return {runtime,receipt,request,start,storage,snapshot:()=>saved}
}
function visible(task){const window=new Window();try{window.document.body.innerHTML=JSON.parse(task.finalOutput).html;return window.document.querySelector('[data-news-query-coverage]')?.textContent??''}finally{void window.happyDOM.abort()}}
async function settled(f){await f.runtime.tasks.get(f.receipt.taskId).runPromise;const task=f.runtime.inspect({parentSessionId:'p',taskId:f.receipt.taskId});return {task,model:task.finalOutput&&readTemplateModel(JSON.parse(task.finalOutput))}}

it('新闻两次格式修复仍失败时直接呈现已核验的相关新闻，不重复取数',async()=>{
 const rows=[record(plan[0],[article(names[0]),article('无关公司')])]
 const f=await fixture({rows,outputs:[{invalid:true},{invalid:true}]}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed')
 expect(f.start).toHaveBeenCalledTimes(2)
 expect(model.data.items).toHaveLength(1)
 expect(model.data.items[0]).toMatchObject({title:article(names[0]).title,date:article(names[0]).time,url:article(names[0]).url})
 expect(JSON.parse(task.finalOutput).html).not.toContain('宿主按用户')
})
it('没有已核验业务记录时不能用新闻回退伪装生成成功',async()=>{
 const f=await fixture({rows:[],outputs:[{invalid:true},{invalid:true}]}),{task}=await settled(f)
 expect(task.state).toBe('failed')
 expect(task.finalOutput).toBeUndefined()
})

it('captures the finite validated plan through normalization without exposing an arbitrary URL or page cursor',()=>{
 expect(plannedNewsQueries(prompt)).toEqual(plan)
 expect(validateWorkbench(normalized)).toEqual(normalized)
 for(const invalid of [[{...plan[0],url:'https://private.test'}],[{...plan[0],source:'other-source'}],Array(9).fill(plan[0]),[{...plan[0],limit:101}]])expect(plannedNewsQueries(NEWS_QUERY_MARKER+'\n'+JSON.stringify(invalid))).toBeUndefined()
})
it('supplements only unattempted queries and preserves success while distinguishing empty from unavailable',async()=>{
 const queryNews=vi.fn(async({request,onStarted})=>{onStarted();if(request.query===names[1])return {response:{records:[]}};throw Error('private upstream failure text')})
 const f=await fixture({queryNews}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items.map(row=>row.title)).toEqual([article(names[0]).title])
 expect(queryNews.mock.calls.map(([call])=>call.request.query)).toEqual(names.slice(1))
 expect(visible(task)).toContain(names[1]+'：来源返回空结果');expect(visible(task)).toContain(names[2]+'：来源暂不可用');expect(visible(task)).not.toContain('private')
 expect(f.snapshot().tasks[0].newsCoverage.entries.map(row=>row.status)).toEqual(['success','empty','unavailable'])
})
it('merges newly retrieved real-identity records without asking another model to rewrite the card',async()=>{
 const queryNews=vi.fn(async({request})=>({response:{records:[article(request.query)]}})),f=await fixture({queryNews}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items).toHaveLength(3);expect(f.start).toHaveBeenCalledOnce()
 expect(model.data.items.map(row=>row.title)).toEqual(names.map(name=>article(name).title));expect(model.data.note).toContain('仅使用实际来源记录')
})
it('does not retry an already observed empty response or source failure',async()=>{
 const queryNews=vi.fn(),f=await fixture({rows:[record(plan[0],[article(names[0])]),record(plan[1],[])],attempts:[{api:'news',source:'eastmoney-news',query:names[2],status:'unavailable'}],queryNews})
 const {task,model}=await settled(f);expect(task.state,task.error).toBe('completed');expect(queryNews).not.toHaveBeenCalled();expect(visible(task)).toContain('来源返回空结果');expect(visible(task)).toContain('来源暂不可用')
})
it('keeps queries without a current grant visibly unattempted rather than labelling them empty',async()=>{
 const f=await fixture({queryNews:async()=>undefined}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(visible(task)).toContain(names[1]+'：尚未完成查询');expect(visible(task)).not.toContain('来源返回空结果')
})
it('keeps a true all-empty card valid while adding explicit coverage disclosure',async()=>{
 const f=await fixture({rows:[],output:data([],NEWS_EMPTY_NOTE),queryNews:async()=>({response:{records:[]}})}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items).toEqual([]);expect(model.data.note).toBe(NEWS_EMPTY_NOTE);expect(visible(task)).toContain(names[2]+'：来源返回空结果')
})
it('retains a full existing note and places the receipt in an escaped visible host region',async()=>{
 const note='来源范围未完整覆盖。'.repeat(199),f=await fixture({output:data(undefined,note),queryNews:async()=>undefined}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.note).toBe(note)
 const window=new Window();try{window.document.body.innerHTML=JSON.parse(task.finalOutput).html;expect(window.document.querySelector('[data-news-query-coverage]').textContent).toContain(names[2]+'：尚未完成查询')}finally{await window.happyDOM.abort()}
})
it('captures only finite public news attempts and does not retain private failure bodies',()=>{
 const collector=componentSourceCollector(['public_data_query'])
 for(const [i,response]of [[0,{records:[]}],[1,{error:'secret raw failure',code:'HTTP_ERROR'}]]){
  collector.accept({type:'tool/call',data:{callId:String(i),name:'public_data_query',arguments:JSON.stringify(newsQueryArgs(plan[i]))}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:String(i)},content:[{type:'tool-result',isError:i===1,content:[{type:'text',text:JSON.stringify(response)}]}]}}})
 }
 expect(collector.attempts.map(row=>row.status)).toEqual(['empty','unavailable']);expect(JSON.stringify(collector.attempts)).not.toContain('secret');expect(collector.records).toHaveLength(1)
})
it('cancellation during supplementation cannot publish results even if the tool later resolves',async()=>{
 const pending=Promise.withResolvers(),queryNews=vi.fn(()=>pending.promise),f=await fixture({queryNews})
 await vi.waitFor(()=>expect(queryNews).toHaveBeenCalled());await f.runtime.cancel({parentSessionId:'p',taskId:f.receipt.taskId});pending.resolve({response:{records:[article(names[1])]}})
 await settled(f);const task=f.runtime.inspect({parentSessionId:'p',taskId:f.receipt.taskId});expect(task.state).toBe('cancelled');expect(task.finalOutput).toBeUndefined()
})
it('restores a checkpoint and queries only the remaining target without repeating the model or successful requests',async()=>{
 const pending=Promise.withResolvers(),queryNews=vi.fn(async({request})=>request.query===names[1]?{response:{records:[article(names[1])]}}:pending.promise),f=await fixture({queryNews})
 await vi.waitFor(()=>expect(f.snapshot().tasks[0].newsCoverage.entries.map(row=>row.status)).toEqual(['success','success','not_attempted']))
 await f.runtime.dispose();const saved=f.snapshot(),start=vi.fn(),remaining=vi.fn(async({request})=>({response:{records:[article(request.query)]}}))
 const restored=new ResearchTaskRuntime({adapter:{start,queryNews:remaining},storage:{load:async()=>saved,save:async()=>{}},retryDelayMs:0});cleanup.push(()=>restored.dispose());await restored.restore()
 const receipt=await restored.start(f.request);await restored.tasks.get(receipt.taskId).runPromise;const task=restored.inspect({parentSessionId:'p',taskId:receipt.taskId})
 expect(task.state,task.error).toBe('completed');expect(start).not.toHaveBeenCalled();expect(remaining.mock.calls.map(([call])=>call.request.query)).toEqual([names[2]])
 expect(readTemplateModel(JSON.parse(task.finalOutput)).data.items).toHaveLength(3)
})
it('does not reuse a checkpoint from another session, node or edited requirement',async()=>{
 const f=await fixture({queryNews:async()=>undefined});await settled(f)
 for(const change of [{parentSessionId:'other'},{canvasNodeId:'other'},{prompt:prompt+'\n改为只读用户新资料。'}]){
  const receipt=await f.runtime.start({...f.request,...change});await f.runtime.tasks.get(receipt.taskId).runPromise
 }
 expect(f.start).toHaveBeenCalledTimes(4)
 const ledger=f.snapshot().tasks[0].newsCoverage
 expect(restoreNewsCoverage(ledger,prompt+'\n'+NEWS_QUERY_MARKER+'\n[]')).toBeUndefined()
 expect(restoreNewsCoverage({...ledger,entries:ledger.entries.slice(1)},prompt)).toBeUndefined()
})
it('shares one bounded supplement deadline and leaves queries never started distinct from timed-out calls',async()=>{
 const state=newsCoverageState(plan),query=vi.fn((_request,_signal,onStarted)=>{onStarted();return new Promise(()=>{})})
 await completeNewsQueries(state,{query,budgetMs:15})
 expect(query).toHaveBeenCalledTimes(2);expect(state.entries.map(row=>row.status)).toEqual(['unavailable','unavailable','not_attempted'])
})
it('executes only an exactly planned query through the registered parent tool and rechecks grants and source policy',async()=>{
 const parent={id:'p'},execute=vi.fn(async()=>({content:[{type:'text',text:JSON.stringify({records:[article(names[1])]})}]})),schemas=vi.fn(()=>[{name:'public_data_query'}])
 const adapter=createSubagentAdapter({agents:{get:id=>id==='p'?parent:undefined},tools:{schemas,execute}})
 const base={parentSessionId:'p',query:prompt,request:plan[1],signal:new AbortController().signal}
 expect((await adapter.queryNews(base)).response.records).toHaveLength(1);expect(execute.mock.calls[0][0]).toMatchObject({agent:parent,arguments:newsQueryArgs(plan[1])})
 schemas.mockReturnValue([]);expect(await adapter.queryNews(base)).toBeUndefined();schemas.mockReturnValue([{name:'public_data_query'}])
 expect(await adapter.queryNews({...base,hostContext:{sourcePolicy:{pluginRequired:true}}})).toBeUndefined()
 expect(await adapter.queryNews({...base,request:{...plan[1],query:'unplanned'}})).toBeUndefined()
 expect(await adapter.queryNews({...base,query:'禁止联网\n'+NEWS_QUERY_MARKER+'\n'+JSON.stringify(plan)})).toBeUndefined();expect(execute).toHaveBeenCalledOnce()
})

it('keeps all verified records accessible through the existing controlled HTML when supplementation exceeds 40 items',async()=>{
 const rows=Array.from({length:40},(_,i)=>article(names[0],i)),queryNews=vi.fn(async({request})=>({response:{records:Array.from({length:12},(_,i)=>article(request.query,i))}}))
 const f=await fixture({rows:[record({...plan[0],limit:40},rows)],output:data(rows,'保留三家公司、来源与真实缺口的原说明。'),queryNews}),{task}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(f.start).toHaveBeenCalledOnce()
 const window=new Window();try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  expect(window.document.querySelectorAll('article')).toHaveLength(64)
  expect(window.document.querySelectorAll('article a')).toHaveLength(64)
  expect(window.document.body.textContent).toContain(article(names[2],11).title)
  expect(window.document.body.textContent).toContain('保留三家公司、来源与真实缺口的原说明。')
  expect(window.document.querySelector('#next')).not.toBeNull()
 }finally{await window.happyDOM.abort()}
})
it('does not promote an unproven original item to trusted HTML merely because supplementation exceeds capacity',async()=>{
 const rows=Array.from({length:40},(_,i)=>article(names[0],i)),bad=data(rows);bad.items[0].url='https://example.org/unobserved'
 const f=await fixture({rows:[record({...plan[0],limit:40},rows)],output:bad,queryNews:async({request})=>({response:{records:Array.from({length:12},(_,i)=>article(request.query,i))}})}),{task}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2);expect(f.snapshot().tasks[0].newsCoverage.draft).toBeUndefined()
 const window=new Window();try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  expect(window.document.querySelectorAll('article')).toHaveLength(64)
  expect(window.document.querySelector('article a[href="https://example.org/unobserved"]')).toBeNull()
 }finally{await window.happyDOM.abort()}
})
it('keeps previously obtained records but reports the latest failed query instead of claiming latest success',async()=>{
 const f=await fixture({attempts:[{api:'news',source:'eastmoney-news',query:names[0],status:'success'},{api:'news',source:'eastmoney-news',query:names[0],status:'unavailable'}],queryNews:async()=>undefined}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items).toHaveLength(1)
 expect(visible(task)).toContain(names[0]+'：最近查询失败，保留已取得记录');expect(f.snapshot().tasks[0].newsCoverage.entries[0].status).toBe('unavailable')
})
it('retries unavailable only for a user-started replacement task, even when older records remain, without refetching success or empty',async()=>{
 const old=article(names[2]),f=await fixture({rows:[record(plan[0],[article(names[0])]),record(plan[1],[]),record(plan[2],[old])],attempts:[{api:'news',source:'eastmoney-news',query:names[2],status:'unavailable'}],output:data([article(names[0]),old]),queryNews:vi.fn()})
 await settled(f);const saved=f.snapshot();saved.tasks[0].state='interrupted'
 const start=vi.fn(),queryNews=vi.fn(async({request,onStarted})=>{onStarted();return {response:{records:[article(request.query,1)]}}})
 const restored=new ResearchTaskRuntime({adapter:{start,queryNews},storage:{load:async()=>saved,save:async()=>{}},retryDelayMs:0});cleanup.push(()=>restored.dispose());await restored.restore()
 expect(restored.tasks.get(f.receipt.taskId).newsCoverage.entries.map(row=>row.status)).toEqual(['success','empty','unavailable']);expect(queryNews).not.toHaveBeenCalled()
 const receipt=await restored.start(f.request);await restored.tasks.get(receipt.taskId).runPromise
 const task=restored.inspect({parentSessionId:'p',taskId:receipt.taskId}),items=readTemplateModel(JSON.parse(task.finalOutput)).data.items
 expect(task.state,task.error).toBe('completed');expect(start).not.toHaveBeenCalled();expect(queryNews.mock.calls.map(([call])=>call.request.query)).toEqual([names[2]])
 expect(items.map(row=>row.title)).toContain(old.title);expect(items.map(row=>row.title)).toContain(article(names[2],1).title)
 expect(restored.tasks.get(receipt.taskId).newsCoverage.entries.map(row=>row.status)).toEqual(['success','empty','success'])
})
it('repairs extractable but invalid model JSON without caching it as a resumable accepted draft',async()=>{
 const bad={...data(),title:''},f=await fixture({outputs:[bad,data()],queryNews:async()=>undefined}),{task}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2);expect(f.snapshot().tasks[0].newsCoverage.draft).toBeUndefined()
})
it('discards a legacy invalid cached draft and synthesizes from retained evidence instead of replaying it forever',async()=>{
 const f=await fixture({queryNews:async()=>undefined});await settled(f)
 const saved=f.snapshot();saved.tasks[0].state='interrupted';saved.tasks[0].newsCoverage.draft=JSON.stringify({...data(),title:''})
 const start=vi.fn(async()=>({childSessionId:'repair-restored',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(data())}]}),dispose:async()=>{}}))
 const restored=new ResearchTaskRuntime({adapter:{start,queryNews:async()=>undefined},storage:{load:async()=>saved,save:async()=>{}},retryDelayMs:0});cleanup.push(()=>restored.dispose());await restored.restore()
 const receipt=await restored.start(f.request);await restored.tasks.get(receipt.taskId).runPromise
 const task=restored.inspect({parentSessionId:'p',taskId:receipt.taskId});expect(task.state,task.error).toBe('completed')
 expect(start).toHaveBeenCalledOnce();expect(start.mock.calls[0][0]).toMatchObject({synthesisOnly:true,preservePrompt:true});expect(start.mock.calls[0][0].prompt).toContain('同一未完成任务已取得的来源')
})
it('checkpoints a successful tool read before the model has produced any draft and resumes without re-fetching it',async()=>{
 let saved;const storage={save:async value=>{saved=structuredClone(value)},load:async()=>saved},pending=Promise.withResolvers()
 const start=vi.fn(async({onSessionEvent,signal})=>{
  onSessionEvent({type:'tool/call',data:{callId:'a',name:'public_data_query',arguments:JSON.stringify(newsQueryArgs(plan[0]))}})
  onSessionEvent({type:'tool/result',data:{message:{source:{callId:'a'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({records:[article(names[0])]})}]}]}}})
  signal.addEventListener('abort',()=>pending.resolve({stopReason:'aborted',output:[]}),{once:true})
  return {childSessionId:'first-read',result:pending.promise,dispose:async()=>{}}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage,retryDelayMs:0});cleanup.push(()=>runtime.dispose());const request={parentSessionId:'p',canvasNodeId:'n',kind:'container',prompt}
 await runtime.start(request);await vi.waitFor(()=>expect(saved.tasks[0].newsCoverage.entries[0].status).toBe('success'));expect(saved.tasks[0].newsCoverage.draft).toBeUndefined();await runtime.dispose()
 const resumedStart=vi.fn(async()=>({childSessionId:'resumed-read',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(data())}]}),dispose:async()=>{}})),queryNews=vi.fn(async({request})=>({response:{records:[article(request.query)]}}))
 const restored=new ResearchTaskRuntime({adapter:{start:resumedStart,queryNews},storage,retryDelayMs:0});cleanup.push(()=>restored.dispose());await restored.restore();const receipt=await restored.start(request);await restored.tasks.get(receipt.taskId).runPromise
 expect(restored.inspect({parentSessionId:'p',taskId:receipt.taskId}).state).toBe('completed');expect(resumedStart.mock.calls[0][0].synthesisOnly).toBe(true);expect(queryNews.mock.calls.map(([call])=>call.request.query)).toEqual(names.slice(1))
})
it('does not reuse an older interrupted checkpoint after a later completed execution when the user regenerates again',async()=>{
 const f=await fixture({queryNews:async()=>undefined});await settled(f)
 const first=f.runtime.tasks.get(f.receipt.taskId);first.state='interrupted'
 const second=await f.runtime.start(f.request);await f.runtime.tasks.get(second.taskId).runPromise
 expect(f.start).toHaveBeenCalledTimes(1)
 const third=await f.runtime.start(f.request);await f.runtime.tasks.get(third.taskId).runPromise;expect(f.start).toHaveBeenCalledTimes(2)
})
it('localizes only fixed host coverage labels, preserving query names, source notes and article content',async()=>{
 const f=await fixture({queryNews:async()=>undefined}),{task}=await settled(f),window=new Window()
 try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  const listeners=new Map(),context={document:window.document,NodeFilter:window.NodeFilter,MutationObserver:window.MutationObserver,queueMicrotask,addEventListener:(name,fn)=>listeners.set(name,fn),parent:{},validWorkbenchLocaleMessage}
  runInNewContext('('+installWorkbenchLocaleMessages.toString()+')(english)',{...context,english:WORKBENCH_ENGLISH})
  listeners.get('DOMContentLoaded')();listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'en'}});await Promise.resolve()
  const receipt=window.document.querySelector('[data-news-query-coverage]').textContent
  expect(receipt).toContain('Search coverage:');expect(receipt).toContain('Search not completed');expect(receipt).toContain(names[1]);expect(receipt).not.toContain('尚未完成查询')
  expect(window.document.body.textContent).toContain(article(names[0]).summary)
  listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'zh'}});await Promise.resolve();expect(window.document.querySelector('[data-news-query-coverage]').textContent).toContain('尚未完成查询')
 }finally{await window.happyDOM.abort()}
})

it('rejects a planner set above eight without truncating its range or silently omitting coverage',()=>{
 const requests=Array.from({length:9},(_,i)=>({source:'eastmoney-news',parameters_json:JSON.stringify({query:names[0]+i,limit:12})})),value={...input,panels:[{...panel,publicData:{...panel.publicData,requests}}]}
 expect(()=>validateWorkbench(value)).toThrow('1–8');expect(value.panels[0].publicData.requests).toHaveLength(9)
})
it('makes new query results accessible for the actual planned large-news table route while retaining every original table field',async()=>{
 const largePanel={...panel,publicData:{...panel.publicData,requests:plan.map(row=>({source:row.source,parameters_json:JSON.stringify({query:row.query,limit:20})}))}},large=validateWorkbench({...input,panels:[largePanel]}),largePrompt=workbenchPanelPrompt(large,large.panels[0])
 expect(large.panels[0].type).toBe('table')
 const rows=Array.from({length:20},(_,i)=>article(names[0],i)),table={version:1,type:'table',title:'三公司相关新闻',columns:['公司','标题','发布日期','原文'],rows:rows.map(row=>[names[0],row.title,row.time,row.url]),note:'保留原表的全部字段和来源说明。'}
 const f=await fixture({requestPrompt:largePrompt,rows:[record({...plan[0],limit:20},rows)],output:table,queryNews:async({request})=>({response:{records:Array.from({length:20},(_,i)=>article(request.query,i))}})}),{task}=await settled(f)
 expect(task.state,task.error).toBe('completed')
 const window=new Window();try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  expect(window.document.querySelectorAll('article')).toHaveLength(60)
  expect(window.document.querySelectorAll('[data-news-original-table] tbody tr')).toHaveLength(20)
  expect(window.document.querySelector('[data-news-original-table]').textContent).toContain('发布日期')
  expect(window.document.body.textContent).toContain(article(names[2],19).title)
  expect(window.document.body.textContent).toContain(table.note)
 }finally{await window.happyDOM.abort()}
})
it('requires actual title, date and URL identities before retaining the original news table, then permits one source-only repair',async()=>{
 const large=validateWorkbench({...input,panels:[{...panel,publicData:{...panel.publicData,requests:plan.map(row=>({source:row.source,parameters_json:JSON.stringify({query:row.query,limit:20})}))}}]}),largePrompt=workbenchPanelPrompt(large,large.panels[0]),rows=Array.from({length:20},(_,i)=>article(names[0],i))
 const table={version:1,type:'table',title:'三公司相关新闻',columns:['公司','标题','发布日期','原文'],rows:rows.map(row=>[names[0],row.title,row.time,row.url]),note:'原来源范围说明。'}
 const badTables=[[1,'模型伪造标题'],[2,'2099-01-01'],[3,'https://example.org/unobserved']].map(([column,value])=>{const bad=structuredClone(table);bad.rows[0][column]=value;return bad})
 badTables.push({...structuredClone(table),columns:['公司','未识别资讯字段','发布日期','原文']},{...structuredClone(table),rows:[null]})
 for(const bad of badTables){
  const failed=await fixture({requestPrompt:largePrompt,rows:[record({...plan[0],limit:20},rows)],output:bad,queryNews:async({request})=>({response:{records:[article(request.query)]}})}),{task}=await settled(failed)
  expect(task.state,task.error).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(failed.start,JSON.stringify({columns:bad.columns,firstRow:bad.rows[0],error:task.error})).toHaveBeenCalledTimes(2)
  expect(failed.start.mock.calls[1][0].synthesisOnly).toBe(true);expect(failed.snapshot().tasks[0].newsCoverage.draft).toBeUndefined()
 }
 const bad=structuredClone(table);bad.rows[0][3]='https://example.org/unobserved'
 const repaired=await fixture({requestPrompt:largePrompt,rows:[record({...plan[0],limit:20},rows)],outputs:[bad,table],queryNews:async({request})=>({response:{records:Array.from({length:20},(_,i)=>article(request.query,i))}})}),{task}=await settled(repaired)
 expect(task.state,task.error).toBe('completed');expect(repaired.start).toHaveBeenCalledTimes(2);expect(task.finalOutput).not.toContain('https://example.org/unobserved')
 const window=new Window();try{window.document.body.innerHTML=JSON.parse(task.finalOutput).html;expect(window.document.querySelectorAll('article')).toHaveLength(60);expect(window.document.querySelectorAll('[data-news-original-table] tbody tr')).toHaveLength(20)}finally{await window.happyDOM.abort()}
})
it('extends only verified successful native-news requests and keeps every company after a real refresh',async()=>{
 const liveInput={...input,originalRequest:input.originalRequest.replace('仅手动快照。','每分钟自动刷新。'),panels:[{...panel,prompt:'分别查询三家公司的真实相关新闻，每分钟自动刷新。',publicData:{...panel.publicData,intervalMinutes:1}}]},live=validateWorkbench(liveInput),livePrompt=workbenchPanelPrompt(live,live.panels[0])
 const original={version:1,type:'data-bound',requests:[{key:'q0',tool:'public_data_query',args:newsQueryArgs(plan[0])}],mapping:{version:1,type:'news',title:'三公司相关新闻',items:{$from:'q0',$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}}}
 let bound;const bindData=vi.fn(async(_task,recipe,output)=>{bound={recipe,output}}),f=await fixture({requestPrompt:livePrompt,output:original,queryNews:async({request})=>({response:{records:[article(request.query)]}}),bindData}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items).toHaveLength(3);expect(bindData).toHaveBeenCalledOnce();expect(bound.recipe.requests).toHaveLength(3)
 let spec=JSON.parse(bound.output),stored=[]
 const execute=vi.fn(async(_binding,request)=>({records:[article(JSON.parse(request.args.parameters_json).query,1)]}))
 const service=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>stored,save:async value=>{stored=structuredClone(value)},validateRequest:async value=>value,execute,inspect:async()=>({spec,revision:'r',writable:true}),apply:async(_b,_r,value)=>{spec=value}});cleanup.push(()=>service.dispose());await service.load()
 const binding=await service.bind({sessionId:'p',nodeId:'n',workspaceId:'w',...bound.recipe},spec);await service.refresh(binding.id)
 expect(readTemplateModel(spec).data.items.map(row=>row.title)).toEqual(names.map(name=>article(name,1).title));expect(execute).toHaveBeenCalledTimes(3)
 expect(visible({finalOutput:JSON.stringify(spec)})).toContain(names[2]+'：本任务已取得记录')
})
it('keeps the verified large-news union as a disclosed snapshot rather than binding an incomplete old mapping',async()=>{
 const requestPrompt=prompt.replace('仅手动快照。','每分钟自动刷新。'),rows=Array.from({length:40},(_,i)=>article(names[0],i)),binding={version:1,type:'data-bound',requests:[{key:'q0',tool:'public_data_query',args:newsQueryArgs({...plan[0],limit:40})}],mapping:{version:1,type:'news',title:'三公司相关新闻',items:{$from:'q0',$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}}},bindData=vi.fn()
 const f=await fixture({requestPrompt,rows:[record({...plan[0],limit:40},rows)],output:binding,queryNews:async({request})=>({response:{records:Array.from({length:12},(_,i)=>article(request.query,i))}}),bindData}),{task}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(bindData).not.toHaveBeenCalled();expect(visible(task)).toContain('当前为静态快照；逐查询自动更新尚未完整绑定。')
 const window=new Window();try{window.document.body.innerHTML=JSON.parse(task.finalOutput).html;expect(window.document.querySelectorAll('article')).toHaveLength(64)}finally{await window.happyDOM.abort()}
})
it('keeps all retrieved companies and the coverage receipt when the registered refresh binding fails',async()=>{
 const requestPrompt=prompt.replace('仅手动快照。','每分钟自动刷新。'),binding={version:1,type:'data-bound',requests:[{key:'q0',tool:'public_data_query',args:newsQueryArgs(plan[0])}],mapping:{version:1,type:'news',title:'三公司相关新闻',items:{$from:'q0',$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}}}
 const f=await fixture({requestPrompt,output:binding,queryNews:async({request})=>({response:{records:[article(request.query)]}}),bindData:async()=>{throw Error('binding unavailable')}}),{task,model}=await settled(f)
 expect(task.state,task.error).toBe('completed');expect(model.data.items).toHaveLength(3);expect(visible(task)).toContain(names[2]+'：本任务已取得记录');expect(visible(task)).toContain('当前为静态快照；逐查询自动更新尚未完整绑定。')
})
