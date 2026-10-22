import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {readFileSync} from 'node:fs'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {resolveBoundComponent,COMPONENT_STATIC_CHART_PROMPT,COMPONENT_BOUND_DATA_PROMPT} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {readableSnapshotRuntime} from '../packages/dsh-research-task-runtime/component-readable-snapshot.js'
import {installWorkbenchLocaleMessages,validWorkbenchLocaleMessage} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {WORKBENCH_ENGLISH} from '../packages/dsh-research-task-runtime/workbench-locale.js'

const now=new Date('2026-10-22T08:00:00Z'),tool='ework__t_abcdef',args={api_name:'observed_business'},cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const path=(value,extra={})=>({$path:value,...extra})
it('asks actual source mappings to preserve complete data beyond layout limits without promising a refresh binding',()=>{
 for(const prompt of [COMPONENT_STATIC_CHART_PROMPT,COMPONENT_BOUND_DATA_PROMPT]){
  expect(prompt).toContain('仍提交完整 source-backed mapping');expect(prompt).toContain('不要为适配容量删除标的、指标、行列或序列')
  expect(prompt).toContain('不要截断长单元格');expect(prompt).toContain('自动更新以实际绑定回执为准')
 }
})
function fixture(kind){
 let response,mapping,prompt
 if(kind==='metrics'||kind==='missing'){
  response={asOf:'2026-10-22',rows:kind==='missing'?[{name:'真实零值',value:0},{name:'真实负值',value:-2},{name:'来源缺项',value:null}]:Array.from({length:18},(_,i)=>({name:'已取得指标'+i,value:i-2}))}
  mapping={version:1,type:'market',variant:'metrics',title:'完整指标',asOf:{$from:'q',$path:'asOf'},note:'原单位：件；保留实际零和负数。',items:{$from:'q',$each:'rows',$map:{label:path('name'),value:path('value',{$optional:true})}}}
  prompt='工作台：已取得业务资料\n本面板：完整指标\n优先使用 market 类型；variant: metrics。保留所有实际指标和来源缺项。'
 }else if(kind==='table'){
  response={asOf:'2026-10-22',rows:Array.from({length:101},(_,i)=>({name:'已取得明细'+i,value:i-2,unit:'件'}))}
  mapping={version:1,type:'table',title:'完整资料表',asOf:{$from:'q',$path:'asOf'},note:'原单位：件；完整资料。',columns:['名称','原值','单位'],rows:{$from:'q',$each:'rows',$map:[path('name'),path('value'),path('unit')]}}
  prompt='工作台：已取得业务资料\n本面板：完整资料表\n必须输出 table 的结构化数据，保留全部行列和原单位。'
 }else{
  response={asOf:'2026-10-22',labels:Array.from({length:200},(_,i)=>'第'+i+'期'),series:Array.from({length:4},(_,n)=>({name:'实际序列'+n,values:Array.from({length:200},(_,i)=>n*1000+i-2)}))}
  mapping={version:1,type:'chart',variant:'line',title:'完整序列',unit:'件',asOf:{$from:'q',$path:'asOf'},note:'保留实际序列、日期与原始单位。',labels:{$from:'q',$path:'labels'},series:{$from:'q',$each:'series',$map:{name:path('name'),values:path('values')}}}
  prompt='工作台：已取得业务资料\n本面板：完整序列\n必须输出 chart.line 的结构化数据，保留全部序列、日期与原单位。'
 }
 return {response,draft:{version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping},prompt,records:[{tool,args,response}]}
}
async function run(f,hostContext){
 const start=vi.fn(async()=>({childSessionId:'readable-child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',sourceRecords:f.records,output:[{type:'text',text:JSON.stringify(f.draft)}]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'readable-parent',canvasNodeId:'readable-node',kind:'container',prompt:f.prompt},hostContext)
 await runtime.tasks.get(receipt.taskId).runPromise
 return {task:runtime.inspect({parentSessionId:'readable-parent',taskId:receipt.taskId}),start,bindData}
}
async function dom(output,check){const window=new Window();try{window.document.body.innerHTML=JSON.parse(output).html;await check(window.document)}finally{await window.happyDOM.abort()}}
it.each(['metrics','missing','table','chart'])('completes source-materialized %s with one runtime response and a complete readable snapshot',async kind=>{
 const f=fixture(kind),{task,start,bindData}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 expect(readTemplateModel(JSON.parse(task.finalOutput))).toBeNull()
 await dom(task.finalOutput,document=>{
  expect(document.body.textContent).toContain(f.draft.mapping.note)
  expect(document.body.textContent).toContain('静态快照，自动更新未绑定')
  if(kind==='metrics'){expect(document.querySelectorAll('tbody tr')).toHaveLength(18);expect(document.body.textContent).toContain('已取得指标17')}
  if(kind==='missing'){expect(document.querySelectorAll('tbody tr')).toHaveLength(3);expect(document.body.textContent).toContain('来源未提供');expect([...document.querySelectorAll('tbody td')].map(cell=>cell.textContent)).toEqual(expect.arrayContaining(['0','-2']))}
  if(kind==='table'){expect(document.querySelectorAll('tbody tr')).toHaveLength(101);expect(document.body.textContent).toContain('已取得明细100');expect(document.querySelector('[data-readable-next]')).not.toBeNull()}
  if(kind==='chart'){expect(document.querySelectorAll('tbody tr')).toHaveLength(200);expect(document.querySelectorAll('thead th')).toHaveLength(5);for(const s of f.response.series)expect(document.body.textContent).toContain(s.name);expect(document.body.textContent).toContain('3197');expect(document.body.textContent).toContain('第199期');expect(document.body.textContent).toContain('件')}
 })
})
it.each(['literal','partial-literal','wrong-path','wrong-request','discovery','bad-row','object-cell','bad-chart','fake-marker','table-literal-cell','numeric-missing-default','numeric-missing-suffix','numeric-missing-prefix','numeric-en-default','no-source','empty-response'])('does not grant a source snapshot to %s',async mode=>{
 const f=fixture(['bad-row','object-cell','table-literal-cell'].includes(mode)?'table':mode==='bad-chart'?'chart':'metrics')
 if(mode==='literal')f.draft.mapping.items=Array.from({length:18},(_,i)=>({label:'伪指标'+i,value:String(900+i)}))
 if(mode==='partial-literal')f.draft.mapping.items.$map.value='900'
 if(mode==='wrong-path')f.draft.mapping.items.$map.value=path('misspelled_value',{$optional:true})
 if(mode==='wrong-request')f.draft.requests[0].args={api_name:'never_called'}
 if(mode==='discovery')f.records[0].purpose='discovery'
 if(mode==='numeric-missing-default'){f.response.rows[17].value=null;f.draft.mapping.items.$map.value=path('value',{$default:'900（来源未提供）'})}
 if(mode==='numeric-missing-suffix'){f.response.rows[17].value=null;f.draft.mapping.items.$map.value=path('value',{$default:'来源未提供',$suffix:'900'})}
 if(mode==='numeric-missing-prefix')f.draft.mapping.items.$map.value=path('value',{$prefix:'900'})
 if(mode==='numeric-en-default'){f.response.rows[17].value=null;f.draft.mapping.items.$map.value=path('value',{$default:'900 N/A'})}
 if(mode==='no-source')f.records=[]
 if(mode==='empty-response')f.response.rows=[]
 if(mode==='bad-row')f.draft.mapping.rows.$map.pop()
 if(mode==='table-literal-cell')f.draft.mapping.rows.$map[1]='999'
 if(mode==='object-cell')f.response.rows[50].value={invented:true}
 if(mode==='bad-chart')f.response.series[3].values.pop()
 if(mode==='fake-marker')f.draft={version:1,type:'html',title:'伪快照',html:'<html><body data-readable-snapshot><p>仅有模型内容</p></body></html>'}
 if(mode==='fake-marker'){
  const result=resolveBoundComponent(JSON.stringify(f.draft),f.records,now);expect(result).toBeNull();return
 }
 const {task}=await run(f)
 expect(task.state).not.toBe('completed');expect(task.finalOutput).toBeUndefined()
})
it.each(['no-default','pure-default','placeholder-default','N/A','Not provided','Unavailable','all-null-chart'])('honestly renders observed all-null data with %s as unavailable, without invented zeroes or a plot',async mode=>{
 const f=fixture(mode==='all-null-chart'?'chart':'metrics')
 if(mode==='all-null-chart')f.response.series.forEach(series=>{series.values.fill(null)})
 else{
  f.response.rows.forEach(row=>{row.value=null})
  if(mode!=='no-default')f.draft.mapping.items.$map.value=path('value',{$default:mode==='pure-default'?'来源未提供':mode==='placeholder-default'?'—':mode})
 }
 const {task,start,bindData}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,document=>{
  expect(document.querySelector('[data-readable-availability]').textContent).toBe('来源未提供可用数值；已保留实际字段与来源。')
  expect(document.querySelector('canvas,svg')).toBeNull()
  const values=[...document.querySelectorAll('tbody tr')].flatMap(row=>[...row.querySelectorAll('td')].slice(1).map(cell=>cell.textContent))
  expect(values.every(value=>['来源未提供','—','N/A','Not provided','Unavailable'].includes(value))).toBe(true)
 })
})
it.each(['columns','plain-columns','long-cell','periods','kpi','kpi-unit','trend','optional-omission'])('preserves every source-backed %s beyond compact template capacity',async kind=>{
 const f=fixture(kind==='periods'||kind==='trend'?'chart':kind==='kpi'||kind==='kpi-unit'||kind==='optional-omission'?'metrics':'table')
 if(kind==='columns'||kind==='plain-columns'){
  const columns=kind==='columns'?33:13
  f.response.rows=Array.from({length:2},(_,r)=>Object.fromEntries(Array.from({length:columns},(_,c)=>['c'+c,`行${r}列${c}`])))
  f.draft.mapping.columns=Array.from({length:columns},(_,i)=>'字段'+i);f.draft.mapping.rows.$map=Array.from({length:columns},(_,i)=>path('c'+i))
  if(kind==='plain-columns'){delete f.draft.mapping.asOf;delete f.draft.mapping.note}
 }
 if(kind==='long-cell'){f.response.rows=f.response.rows.slice(0,1);f.response.rows[0].name='全文'.repeat(400)+'末尾原文保留'}
 if(kind==='periods'){f.response.labels=Array.from({length:367},(_,i)=>'第'+i+'期');f.response.series=[{name:'实际序列',values:Array.from({length:367},(_,i)=>i-2)}]}
 if(kind==='kpi'){delete f.draft.mapping.variant;f.draft.mapping.type='kpi';f.prompt='工作台：实际经营数据\n本面板：完整指标\n必须输出 kpi 的结构化数据。';f.draft.mapping.items.$map.unit={$from:'q',$path:'unit'};f.response.unit='件'}
 if(kind==='kpi-unit'){delete f.draft.mapping.variant;f.draft.mapping.type='kpi';f.prompt='工作台：实际经营数据\n本面板：完整指标\n必须输出 kpi 的结构化数据。';f.draft.mapping.items.$map.unit='件';f.response.unit='件'}
 if(kind==='trend'){f.response.labels=Array.from({length:367},(_,i)=>'第'+i+'期');f.response.series.forEach((series,n)=>{series.values=Array.from({length:367},(_,i)=>n*1000+i-2)});f.draft.mapping.type='market';f.draft.mapping.variant='trend';delete f.draft.mapping.unit;f.prompt='工作台：已取得业务数据\n本面板：完整序列\n优先使用 market 类型；variant: trend。'}
 if(kind==='optional-omission')delete f.response.rows[17].value
 const {task,start,bindData}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,document=>{
  if(kind==='columns'){expect(document.querySelectorAll('thead th')).toHaveLength(33);expect(document.body.textContent).toContain('行1列32')}
  if(kind==='plain-columns'){expect(document.querySelectorAll('thead th')).toHaveLength(13);expect(document.body.textContent).toContain('行1列12')}
  if(kind==='long-cell')expect(document.querySelector('tbody td').textContent).toBe(f.response.rows[0].name)
  if(kind==='periods'){expect(document.querySelectorAll('tbody tr')).toHaveLength(367);expect(document.body.textContent).toContain('第366期')}
  if(kind==='kpi'||kind==='kpi-unit'){expect(document.querySelectorAll('tbody tr')).toHaveLength(18);expect([...document.querySelectorAll('thead th')].map(cell=>cell.textContent)).toContain('单位');expect([...document.querySelectorAll('tbody tr')].every(row=>row.lastElementChild.textContent==='件')).toBe(true)}
  if(kind==='trend')expect(document.querySelectorAll('tbody tr')).toHaveLength(367)
  if(kind==='optional-omission')expect([...document.querySelectorAll('tbody tr')].at(-1).textContent).toContain('来源未提供')
 })
})
it('preserves the existing native market trend and refresh recipe when 800 total points fit its original contract',()=>{
 const f=fixture('chart');f.draft.mapping.type='market';f.draft.mapping.variant='trend';delete f.draft.mapping.unit
 const mapped=resolveBoundComponent(JSON.stringify(f.draft),f.records,now)
 expect(mapped.capacitySnapshot).toBeUndefined();expect(mapped.recipe).toBeDefined()
 expect(readTemplateModel(JSON.parse(mapped.output)).data.series).toEqual(f.response.series)
})
it('uses the same pure-English missing vocabulary in the existing financial snapshot entry',async()=>{
 const f=fixture('metrics');f.records[0].tool='financial_query';f.records[0].purpose='snapshot';f.draft.requests[0].tool='financial_query'
 f.response.records=f.response.rows;delete f.response.rows;f.response.records.forEach(row=>{row.value=null});f.response.status='complete'
 f.draft.mapping.items.$each='records';f.draft.mapping.items.$map.value=path('value',{$default:'N/A'})
 const {task,start,bindData}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,document=>{expect(document.querySelector('[data-readable-availability]')).not.toBeNull();expect(document.querySelectorAll('tbody tr')).toHaveLength(18)})
})
it('can page, search and browse all the actual table rows through the shared-state DOM without truncation',async()=>{
 const f=fixture('table'),{task}=await run(f),window=new Window()
 try{
  window.document.write(JSON.parse(task.finalOutput).html)
  let state,render
  const shared={register:config=>{state=config.initialState;render=()=>config.render(state,{connected:true,readOnly:false});render();return {dispatch:action=>{state=config.reduce(state,action);render()}}}}
  runInNewContext('('+readableSnapshotRuntime.toString()+')()',{document:window.document,window:{sherlockShared:shared}})
  const visible=()=>[...window.document.querySelectorAll('tbody tr')].filter(row=>!row.hidden)
  expect(visible()).toHaveLength(25);window.document.querySelector('[data-readable-next]').click();expect(visible()[0].textContent).toContain('已取得明细25')
  window.document.querySelector('[data-readable-all]').click();expect(visible()).toHaveLength(101)
  const search=window.document.querySelector('[data-readable-search]');search.value='已取得明细100';search.dispatchEvent(new window.Event('input'))
  expect(visible()).toHaveLength(1);expect(visible()[0].textContent).toContain('已取得明细100')
  expect(window.document.querySelectorAll('tbody tr')).toHaveLength(101)
 }finally{await window.happyDOM.abort()}
})
it.each(['raw-null','cn-default'])('translates fixed snapshot controls and %s missing states while preserving source text and original metadata',async mode=>{
 const f=fixture('missing');f.response.rows[0].name='浏览全部'
 if(mode==='cn-default')f.draft.mapping.items.$map.value=path('value',{$default:'来源未提供'})
 const {task}=await run(f),window=new Window()
 try{
  window.document.write(JSON.parse(task.finalOutput).html)
  const listeners=new Map(),context={document:window.document,NodeFilter:window.NodeFilter,MutationObserver:window.MutationObserver,queueMicrotask,addEventListener:(name,fn)=>listeners.set(name,fn),parent:{},validWorkbenchLocaleMessage}
  runInNewContext('('+installWorkbenchLocaleMessages.toString()+')(english)',{...context,english:WORKBENCH_ENGLISH})
  listeners.get('DOMContentLoaded')();listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'en'}});await Promise.resolve()
  expect(window.document.querySelector('[data-readable-search]').getAttribute('placeholder')).toBe('Search all data')
  expect(window.document.querySelector('[data-readable-all]').textContent).toBe('Browse all')
  expect(window.document.querySelector('thead th').textContent).toBe('Metric')
  expect(window.document.querySelector('tbody td').textContent).toBe('浏览全部')
  expect(window.document.body.textContent).toContain('Static snapshot; automatic updates are not linked')
  expect(window.document.body.textContent).toContain('Not provided by the source')
  expect(window.document.body.textContent).toContain(f.draft.mapping.note)
  listeners.get('message')({source:context.parent,data:{type:'sherlock-workbench-locale',locale:'zh'}});await Promise.resolve()
  expect(window.document.querySelector('thead th').textContent).toBe('指标');expect(window.document.querySelector('[data-readable-all]').textContent).toBe('浏览全部')
 }finally{await window.happyDOM.abort()}
})
it('uses observed provider names and URLs instead of promoting model-declared sources in the snapshot footer',async()=>{
 const f=fixture('metrics');f.response.source='实际业务来源';f.response.sourceUrl='https://source.example.com/actual'
 f.draft.mapping.sources=[{label:'模型误写DataYes',url:'https://unobserved.example.com/fake'}]
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 await dom(task.finalOutput,document=>{
  expect(document.querySelector('aside').textContent).toContain('实际业务来源')
  expect(document.querySelector('aside a').href).toBe(f.response.sourceUrl)
  expect(document.body.textContent).not.toContain('模型误写DataYes')
  expect(document.querySelector('a[href="https://unobserved.example.com/fake"]')).toBeNull()
 })
})
it.each(['source-policy','old-quote','bad-unit','variant'])('keeps the original %s gate active after capacity materialization',async kind=>{
 const f=fixture(kind==='bad-unit'||kind==='variant'?'chart':'metrics')
 let context
 if(kind==='source-policy')context={sourcePolicy:{pluginRequired:false,pluginProhibited:true,preferenceRequest:'只使用公开网页，不调用插件'},sourceRequirement:'仅公开网页业务数据'}
 if(kind==='old-quote'){f.response.asOf='2025-01-01';f.prompt='工作台：最新股票行情\n本面板：最新行情\n优先使用 market 类型；variant: metrics。'}
 if(kind==='bad-unit'){f.draft.mapping.variant='percentBar';f.draft.mapping.unit='%';f.response.series.forEach(series=>{series.values=series.values.map(()=>80)})}
 if(kind==='variant')f.draft.mapping.variant='bar'
 const {task}=await run(f,context);expect(task.state).not.toBe('completed');expect(task.finalOutput).toBeUndefined()
})
it('passes original financial semantics through both gates and cannot reuse a failed capacity receipt in repair',async()=>{
 const observed=JSON.parse(readFileSync(new URL('./fixtures/statement-table-evidence/compute-b-observed.json',import.meta.url),'utf8'))
 const record=structuredClone(observed.records.find(record=>record.args?.url_params?.ticker==='300502'))
 const row=record.response.data.find(row=>row.endDate==='2026-06-30'&&row.endDateRep==='2026-06-30'&&row.mergedFlag==='1')
 record.response.data=Array.from({length:101},()=>structuredClone(row))
 const f={records:[record],prompt:'工作台：DataYes财务资料\n本面板：财务指标\nDataYes 300502.SZ 财务指标，保留销售毛利率与报告期。\n优先使用 market 类型；variant: table。',draft:{version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args:record.args}],mapping:{version:1,type:'market',variant:'table',title:'财务指标',asOf:'DataYes 2026-06-30',note:'来源：DataYes；合并口径',columns:['公司','报告期','销售毛利率'],rows:{$from:'q',$each:'data',$map:[path('secID'),path('endDate'),path('grossMargin')]}}}}
 f.draft.mapping.rows.$map[2].$suffix='%'
 const good=await run(f);expect(good.task.state,good.task.error).toBe('completed')
 const bad=structuredClone(f);bad.draft.mapping.rows.$map[2]=path('revenueYoy',{$suffix:'%'})
 const failed=await run(bad);expect(failed.task.state).toBe('failed');expect(failed.task.error).toMatch(/grossMargin|毛利率/)
 // A later model can copy the exact host-looking HTML, but no attempt-local
 // semantic receipt accompanies it after a source/financial failure.
 let calls=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'repair-'+(++calls),result:Promise.resolve({stopReason:'completed',sourceRecords:f.records,output:[{type:'text',text:calls===1?JSON.stringify(bad.draft):good.task.finalOutput}]}),dispose:async()=>{}})},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'repair-parent',canvasNodeId:'repair-node',kind:'container',prompt:f.prompt});await runtime.tasks.get(receipt.taskId).runPromise
 expect(runtime.inspect({parentSessionId:'repair-parent',taskId:receipt.taskId}).state).toBe('failed')
})
it('cannot bypass a failed source-date gate by copying previously rendered capacity HTML in repair',async()=>{
 const current=fixture('metrics');current.prompt='工作台：最新股票行情\n本面板：最新行情\n优先使用 market 类型；variant: metrics。'
 const good=await run(current);expect(good.task.state,good.task.error).toBe('completed')
 const old=fixture('metrics');old.response.asOf='2025-01-01'
 let calls=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'dated-repair-'+(++calls),result:Promise.resolve({stopReason:'completed',sourceRecords:old.records,output:[{type:'text',text:calls===1?JSON.stringify(old.draft):good.task.finalOutput}]}),dispose:async()=>{}})},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'dated-repair-parent',canvasNodeId:'dated-repair-node',kind:'container',prompt:current.prompt});await runtime.tasks.get(receipt.taskId).runPromise
 const task=runtime.inspect({parentSessionId:'dated-repair-parent',taskId:receipt.taskId})
 expect(task.state,task.error).toBe('failed');expect(task.finalOutput).toBeUndefined()
})
it('allows a failed capacity date check to repair from a newly observed correct response and mapping',async()=>{
 const old=fixture('metrics'),current=fixture('metrics');old.response.asOf='2025-01-01'
 let calls=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{const f=++calls===1?old:current;return {childSessionId:'mapped-repair-'+calls,result:Promise.resolve({stopReason:'completed',sourceRecords:f.records,output:[{type:'text',text:JSON.stringify(f.draft)}]}),dispose:async()=>{}}}},storage:{save:async()=>{}},now:()=>now.valueOf(),retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'mapped-repair-parent',canvasNodeId:'mapped-repair-node',kind:'container',prompt:'工作台：最新股票行情\n本面板：最新行情\n优先使用 market 类型；variant: metrics。'});await runtime.tasks.get(receipt.taskId).runPromise
 const task=runtime.inspect({parentSessionId:'mapped-repair-parent',taskId:receipt.taskId})
 expect(task.state,task.error).toBe('completed');expect(calls).toBe(2)
})
