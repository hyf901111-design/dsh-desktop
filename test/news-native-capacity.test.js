import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {componentFeedEvidenceIssue,fetchedWebPageRecord,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {installWorkbenchLocaleMessages,validWorkbenchLocaleMessage} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {WORKBENCH_ENGLISH} from '../packages/dsh-research-task-runtime/workbench-locale.js'
import {controlledNewsHtml} from '../packages/dsh-research-task-runtime/news-topic-filter.js'

const now=new Date('2026-10-22T14:45:00Z'),names=['中际旭创','新易盛','工业富联'],codes=['300308','300502','601138']
const originalRequest='分别检索中际旭创（300308）、新易盛（300502）、工业富联（601138）近30天相关新闻，每家公司独立查询。保留所有实际取得且相关的记录；无结果、失败或未完成均明确披露，不使用模拟数据。'
const plan=validateWorkbench({requestId:'native-news',title:'三家公司新闻容量',dataMode:'source',originalRequest,panels:[{title:'三家公司新闻容量',type:'news',size:'large',prompt:'按三家公司展示近30天的实际新闻标题、原始摘要、日期、来源和链接，保留全部相关记录及缺口。'}]})
const prompt=workbenchPanelPrompt(plan,plan.panels[0])
const hostContext={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:originalRequest},sourceRequirement:plan.panels[0].prompt,workbenchRequest:{dataMode:'source',originalRequest}}
const options={newsScope:prompt,feedOptions:{...hostContext,panelRequest:plan.panels[0].prompt,panelType:'news'}}
function fixture(count=20){
 const records=names.map((name,i)=>({tool:'public_data_query',args:{operation:'query',source:'eastmoney-news',parameters_json:JSON.stringify({limit:count,query:name})},response:{source:'东方财富关键词新闻搜索',dataTime:'2026-10-22T09:00:00+08:00',records:Array.from({length:count},(_,n)=>({title:`${name}业务新闻合成回归${n}`,summary:`${name}实际来源片段${n}`,time:'2026-10-22T09:00:00+08:00',url:`https://news.example.com/${codes[i]}/${n}`,publisher:'实际媒体'}))}}))
 const draft={version:1,type:'data-bound',requests:records.map((record,i)=>({key:'q'+i,tool:record.tool,args:record.args})),mapping:{version:1,type:'news',title:'三家公司新闻容量',asOf:{$from:'q0',$path:'dataTime',$suffix:' · 通联 DataYes'},note:'保留原缺口说明，其他来源尚未查询。',items:records.map((_,i)=>({$from:'q'+i,$each:'records',$sortBy:'time',$order:'desc',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},category:names[i],url:{$path:'url'}}}))}}
 return {records,draft}
}
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function dom(output,check){const window=new Window();try{window.document.body.innerHTML=JSON.parse(output).html;await check(window.document)}finally{await window.happyDOM.abort()}}

it('renders three successful 20-record mappings without publicData as a source-verified readable snapshot, not a refresh recipe',async()=>{
 expect(prompt).not.toContain('【宿主新闻查询集合】');expect(prompt).not.toContain('【新闻容量适配】')
 const {records,draft}=fixture()
 draft.mapping.items.forEach(group=>Object.assign(group.$map,{summary:'未取得来源支持的模型结论',category:'通联DataYes',publisher:'伪媒体'}))
 const result=resolveBoundComponent(JSON.stringify(draft),records,now,options)
 expect(result.recipe).toBeUndefined();expect(readTemplateModel(JSON.parse(result.output))).toBeNull()
 await dom(result.output,document=>{
  expect(document.querySelectorAll('article')).toHaveLength(60)
  expect([...document.querySelectorAll('article a')].map(a=>a.href).sort()).toEqual(records.flatMap(record=>record.response.records.map(row=>row.url)).sort())
  expect(document.body.textContent).toContain(records[2].response.records[19].summary)
  expect(document.body.textContent).not.toContain(draft.mapping.note)
  expect(document.querySelector('[data-news-original-note]')).toBeNull()
  for(const value of ['未取得来源支持的模型结论','通联DataYes','通联 DataYes','伪媒体'])expect(document.body.textContent).not.toContain(value)
  expect(document.body.textContent).toContain('当前为静态快照');expect(document.body.textContent).toContain('来源查询：'+names[2]);expect(document.querySelector('#next')).not.toBeNull()
 })
})
it('honors explicit retain-all human intent by merging every proven relevant in-window observation, while ordinary mapping takes remain intact',async()=>{
 const {records,draft}=fixture(25)
 records[0].response.records[24]=structuredClone(records[1].response.records[0])
 records[1].response.records[24].time='2026-01-01T09:00:00+08:00'
 Object.assign(records[2].response.records[24],{title:'气象观测合成记录',summary:'与研究公司和业务无关的降雨实况'})
 draft.mapping.items.forEach(group=>{group.$take=15})
 const result=resolveBoundComponent(JSON.stringify(draft),records,now,options)
 await dom(result.output,document=>{
  expect(document.querySelectorAll('article')).toHaveLength(72)
  expect(document.body.textContent).toContain(records[2].response.records[23].title)
  expect(document.querySelector(`a[href="${records[1].response.records[24].url}"]`)).toBeNull()
  expect(document.querySelector(`a[href="${records[2].response.records[24].url}"]`)).toBeNull()
  expect(document.querySelectorAll(`a[href="${records[1].response.records[0].url}"]`)).toHaveLength(1)
  expect(document.body.textContent).toContain('窗口外：1')
 })
 const ordinary={...options,feedOptions:{...options.feedOptions,workbenchRequest:{dataMode:'source',originalRequest:originalRequest.split('保留所有')[0]}}}
 const restricted=resolveBoundComponent(JSON.stringify(draft),records,now,ordinary)
 await dom(restricted.output,document=>expect(document.querySelectorAll('article')).toHaveLength(45))
 for(const negation of ['不要','不用','无需','不必','禁止','不得','不需要']){
  const human=originalRequest.split('保留所有')[0]+negation+'保留全部实际取得记录，只展示每家公司15条。'
  const negative=resolveBoundComponent(JSON.stringify(draft),records,now,{...options,feedOptions:{...options.feedOptions,workbenchRequest:{dataMode:'source',originalRequest:human}}})
  await dom(negative.output,document=>expect(document.querySelectorAll('article')).toHaveLength(45))
 }
})
it('uses captured human relative days and frozen Shanghai now; a model note cannot widen the window',async()=>{
 const {records,draft}=fixture(41)
 draft.requests=draft.requests.slice(0,1);draft.mapping.items=draft.mapping.items.slice(0,1);draft.mapping.note='模型建议按全年展示，此说明不构成日期授权。'
 records[0].response.records.forEach(row=>{row.time='2026-01-01T09:00:00+08:00'})
 records[0].response.records[40].time='2026-09-22T00:00:00+08:00'
 const human='仅展示中际旭创（300308）近30天相关新闻；保留全部已取得的相关记录。'
 const relative={newsScope:human,feedOptions:{workbenchRequest:{dataMode:'source',originalRequest:human},panelType:'news',panelRequest:'近30天相关新闻'}}
 expect(componentFeedEvidenceIssue(JSON.stringify({version:1,type:'news',title:'旧闻',items:[{...records[0].response.records[0],date:records[0].response.records[0].time}]}),records,relative.feedOptions)).toBeNull()
 const result=resolveBoundComponent(JSON.stringify(draft),records,now,relative)
 await dom(result.output,document=>{
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(document.querySelector('article time').textContent).toBe('2026-09-22T00:00:00+08:00')
  expect(document.querySelector(`a[href="${records[0].response.records[0].url}"]`)).toBeNull();expect(document.body.textContent).toContain('窗口外：40')
 })
 for(const span of ['0','999']){
  const originalRequest='中际旭创近'+span+'天相关新闻，保留全部实际取得相关记录。'
  expect(()=>resolveBoundComponent(JSON.stringify(draft),records,now,{newsScope:originalRequest,feedOptions:{workbenchRequest:{dataMode:'source',originalRequest}}})).toThrow(/相对天数范围/)
 }
})
it('does not mistake another company article returned by one query for proof that the other company was independently searched',async()=>{
 const {records,draft}=fixture(30)
 records[0].response.records[0]=structuredClone(records[2].response.records[0])
 draft.requests=draft.requests.slice(0,2);draft.mapping.items=draft.mapping.items.slice(0,2)
 const result=resolveBoundComponent(JSON.stringify(draft),records.slice(0,2),now,options)
 await dom(result.output,document=>{
  expect(document.body.textContent).toContain(records[2].response.records[0].title)
  expect(document.body.textContent).toContain('尚未证明独立查询：601138')
  expect(document.body.textContent).toContain('未列出的研究对象尚未证明已完成查询。')
 })
})
it('retains the existing item schema and same-record title/date/URL evidence gates before any controlled HTML can be emitted',()=>{
 const {records,draft}=fixture()
 const missing=structuredClone(draft);missing.mapping.items[0].$map.title='中际旭创未观察到的伪造标题'
 expect(()=>resolveBoundComponent(JSON.stringify(missing),records,now,options)).toThrow(/标题|原文链接/)
 const bad=structuredClone(draft);bad.mapping.items[0].$map.summary=true
 expect(()=>resolveBoundComponent(JSON.stringify(bad),records,now,options)).toThrow(/字段/)
 const wrong=structuredClone(draft);wrong.requests[0].args.parameters_json='{"query":"未执行请求","limit":20}'
 expect(()=>resolveBoundComponent(JSON.stringify(wrong),records,now,options)).toThrow(/已成功取数/)
})
it('supports source-proven snapshot fingerprints without inventing missing summaries or provider names',async()=>{
 const rows=fixture(41).records[0].response.records,web=fetchedWebPageRecord('https://news.example.com/list',JSON.stringify({articles:rows}))
 const record={tool:'public_data_query',args:{operation:'query',source:'gdelt-news',parameters_json:'{"query":"中际旭创","limit":41}'},response:{articles:rows},snapshotRows:web.snapshotRows,purpose:'snapshot'}
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args:record.args}],mapping:{version:1,type:'news',title:'中际旭创相关新闻',items:{$from:'q',$each:'articles',$map:{title:{$path:'title'},summary:'模型摘要不能代替来源',date:{$path:'time'},url:{$path:'url'}}}}}
 const result=resolveBoundComponent(JSON.stringify(draft),[record],now,{newsScope:originalRequest,feedOptions:options.feedOptions})
 await dom(result.output,document=>{expect(document.querySelectorAll('article')).toHaveLength(41);expect(document.body.textContent).toContain('来源未提供摘要');expect(document.body.textContent).toContain('news.example.com');expect(document.body.textContent).not.toContain('模型摘要不能代替来源')})
})
it('does not let retain-all import another provider that was observed but never authorized by the actual mapping',async()=>{
 const {records,draft}=fixture()
 records.forEach((record,i)=>{record.tool='ework__t_abcdef';record.args={api_name:'news',query:names[i]};record.response.source='通联 DataYes'})
 draft.requests=records.map((record,i)=>({key:'q'+i,tool:record.tool,args:record.args}));draft.mapping.items.forEach(group=>{group.$take=15})
 const extra=fixture(1).records[0];extra.response.records[0]={...extra.response.records[0],title:'中际旭创额外来源记录不得混入',url:'https://another-provider.example.com/unmapped'}
 const human=originalRequest+'新闻只使用通联 DataYes。',sourceOptions={newsScope:human,feedOptions:{...options.feedOptions,workbenchRequest:{dataMode:'source',originalRequest:human}}}
 const result=resolveBoundComponent(JSON.stringify(draft),[...records,extra],now,sourceOptions)
 await dom(result.output,document=>{expect(document.querySelectorAll('article')).toHaveLength(60);expect(document.querySelector('a[href="https://another-provider.example.com/unmapped"]')).toBeNull();expect(document.body.textContent).not.toContain('东方财富')})
})
it('completes the actual workbench runtime entry in one model response without publicData or a refresh binding',async()=>{
 const {records,draft}=fixture(),start=vi.fn(async()=>({childSessionId:'native-shape-child',result:Promise.resolve({stopReason:'completed',sourceRecords:records,output:[{type:'text',text:JSON.stringify(draft)}]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'native-capacity-parent',canvasNodeId:'native-capacity-node',kind:'container',prompt},hostContext)
 await runtime.tasks.get(receipt.taskId).runPromise;const task=runtime.inspect({parentSessionId:'native-capacity-parent',taskId:receipt.taskId})
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,document=>expect(document.querySelectorAll('article')).toHaveLength(60))
})
it.each([[20,'groups'],[5,'sections']])('adapts source-bound company groups of %s rows using %s without asking the model to rewrite a valid collection',async(count,key)=>{
 const {records,draft}=fixture(count)
 const items=draft.mapping.items;delete draft.mapping.items
 draft.mapping.variant='company-news-groups'
 draft.mapping[key]=items.map((items,i)=>({company:names[i],status:'伪造状态：全部来源覆盖完整',items}))
 draft.mapping[key][0].company={name:names[0],code:codes[0]};draft.mapping[key][0].metadata={sourceNotes:['不可作为真实来源凭据的展示说明']}
 const start=vi.fn(async()=>({childSessionId:'grouped-native-child',result:Promise.resolve({stopReason:'completed',sourceRecords:records,output:[{type:'text',text:JSON.stringify(draft)}]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'grouped-native-parent',canvasNodeId:'grouped-native-node',kind:'container',prompt},hostContext)
 await runtime.tasks.get(receipt.taskId).runPromise;const task=runtime.inspect({parentSessionId:'grouped-native-parent',taskId:receipt.taskId})
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,document=>{
  expect(document.querySelectorAll('article')).toHaveLength(count*3)
  for(const name of names)expect(document.body.textContent).toContain('来源查询：'+name)
  expect(document.body.textContent).not.toContain('伪造状态');expect(document.body.textContent).not.toContain(draft.mapping.note)
  expect(document.querySelector('[data-news-original-note]')).toBeNull()
  let state,render
  const bridge={register:config=>{state=config.initialState;render=()=>config.render(state,{connected:true,readOnly:false});render();return {dispatch:action=>{state=config.reduce(state,action);render()}}}}
  runInNewContext(document.querySelector('script').textContent,{document,window:{sherlockShared:bridge}})
  const filter=document.querySelector('#source-query');filter.value=names[2];filter.dispatchEvent(new document.defaultView.Event('change'))
  expect([...document.querySelectorAll('article')].filter(article=>!article.hidden)).toHaveLength(count)
  expect([...document.querySelectorAll('article')].filter(article=>!article.hidden).every(article=>article.dataset.newsQuery===names[2])).toBe(true)
  filter.value='';filter.dispatchEvent(new document.defaultView.Event('change'));expect([...document.querySelectorAll('article')].filter(article=>!article.hidden)).toHaveLength(Math.min(20,count*3))
 })
})
it.each(['title','date','url','shape','competing-items'])('keeps grouped-news %s errors inside the existing verification and repair gate',mode=>{
 const {records,draft}=fixture(20),items=draft.mapping.items
 delete draft.mapping.items;draft.mapping.groups=items.map(items=>({company:'不能作为来源证据的分组标签',items}))
 if(mode==='shape')draft.mapping.groups[0].items=null
 else if(mode==='competing-items')draft.mapping.items=items
 else draft.mapping.groups[0].items.$map[mode]=mode==='title'?'源中不存在的标题':mode==='date'?'2099-01-01':'https://unobserved.example.com/fake'
 expect(()=>resolveBoundComponent(JSON.stringify(draft),records,now,options)).toThrow()
})
it('retains actual source-query characters while safely serializing the filter script',async()=>{
 const query='实际查询</script><来源>',spec=controlledNewsHtml('安全查询分组',[{title:'实际条目',summary:'实际摘要',url:'https://news.example.com/a',query},{title:'其他实际条目',summary:'其他摘要',url:'https://news.example.com/b',query:'其他查询'}])
 await dom(JSON.stringify(spec),document=>{
  expect(document.querySelectorAll('script')).toHaveLength(1)
  const bridge={register:config=>{let state=config.initialState;const render=()=>config.render(state,{connected:true,readOnly:false});render();return {dispatch:action=>{state=config.reduce(state,action);render()}}}}
  runInNewContext(document.querySelector('script').textContent,{document,window:{sherlockShared:bridge}})
  const filter=document.querySelector('#source-query');filter.value=query;filter.dispatchEvent(new document.defaultView.Event('change'))
  const visible=[...document.querySelectorAll('article')].filter(row=>!row.hidden);expect(visible).toHaveLength(1);expect(visible[0].dataset.newsQuery).toBe(query)
 })
})
it('translates fixed source-query and coverage labels without changing source names or actual excerpts, and omits model notes',async()=>{
 const {records,draft}=fixture(),result=resolveBoundComponent(JSON.stringify(draft),records,now,options),window=new Window()
 try{
  window.document.body.innerHTML=JSON.parse(result.output).html
  const listeners=new Map(),context={document:window.document,NodeFilter:window.NodeFilter,MutationObserver:window.MutationObserver,queueMicrotask,addEventListener:(name,fn)=>listeners.set(name,fn),parent:{},validWorkbenchLocaleMessage}
  runInNewContext('('+installWorkbenchLocaleMessages.toString()+')(english)',{...context,english:WORKBENCH_ENGLISH})
  listeners.get('DOMContentLoaded')();listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'en'}});await Promise.resolve()
  expect(window.document.querySelector('[data-news-source-query]').textContent).toBe('Source search: '+names[0])
  expect(window.document.querySelector('[data-news-query-coverage]').textContent).toContain('Source records: 20')
  expect(window.document.body.textContent).toContain(records[0].response.records[0].summary);expect(window.document.body.textContent).not.toContain(draft.mapping.note)
  listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'zh'}});await Promise.resolve();expect(window.document.querySelector('[data-news-source-query]').textContent).toBe('来源查询：'+names[0])
 }finally{await window.happyDOM.abort()}
})

it('uses host-observed coverage instead of model execution notes when rebuilding a controlled news snapshot',async()=>{
 const {records,draft}=fixture()
 draft.mapping.note='保留来源首页全部返回记录（含部分行情类条目），请按category分组；接口原参数'+JSON.stringify(draft.requests)
 const result=resolveBoundComponent(JSON.stringify(draft),records,now,options)
 await dom(result.output,document=>{
  expect(document.querySelectorAll('article')).toHaveLength(60)
  expect(document.querySelector('[data-news-original-note]')).toBeNull()
  expect(document.body.textContent).not.toContain('请按category分组')
  expect(document.body.textContent).not.toContain('接口原参数')
  expect(document.body.textContent).toContain('来源返回：20')
  expect(document.body.textContent).toContain('未列出的研究对象尚未证明已完成查询。')
 })
})
