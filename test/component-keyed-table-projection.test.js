import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ComponentDataRefresh,materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {normalizeKeyedTableProjection} from '../packages/dsh-research-task-runtime/table-projection.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

it('preserves undeclared source fields on a prepared table without a model repair',()=>{
 const artifact={version:1,type:'table',title:'任务清单',columns:[{key:'name',label:'任务'}],
  rows:[{name:'任务 A',status:'待办'},{name:'任务 B',status:'完成',owner:'李明'}]}
 const plan=validateWorkbench({requestId:'complete-keyed-table',title:'项目工作台',dataMode:'source',
  panels:[{title:artifact.title,prompt:'显示全部任务明细。',type:'table',artifact}]})
 const final=readTemplateModel(JSON.parse(acceptArtifactOutput(JSON.stringify(plan.panels[0].artifact)))).data
 expect(final.columns).toEqual(['任务','status','owner'])
 expect(final.rows).toEqual([['任务 A','待办',null],['任务 B','完成','李明']])
 expect(artifact.columns).toHaveLength(1)
})

// Reuse the complete captured response, without repeating the native KPI task
// or making a new query. Only the table's presentation shape is constructed.
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-static-kpi18.json',import.meta.url),'utf8'))
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const path=key=>({$path:key})
function fixture(capacity=false){
 const records=structuredClone(captured.records),response=records[0].response
 const fields=capacity?Object.keys(response.records[0]):['code','name','price','priceUnit','time']
 const labels={code:'证券代码',name:'证券名称',price:'价格',priceUnit:'价格单位',time:'报价时点'}
 const mapping={version:1,type:capacity?'table':'market',...(!capacity?{variant:'table',asOf:{$from:'q',$path:'dataTime'}}:{}),title:'三家公司真实行情明细',columns:fields.map(key=>({key,label:labels[key]??key})),rows:{$from:'q',$each:'records',$map:Object.fromEntries([...fields].reverse().map(key=>[key,path(key)]))}}
 return {records,response,fields,mapping,draft:{version:1,type:'data-bound',requests:[{key:'q',tool:records[0].tool,args:records[0].args}],mapping},prompt:'工作台：三家公司真实行情资料\n本面板：三家公司真实行情明细\n完整保留中际旭创、新易盛、工业富联本次响应的代码、名称、价格、原始单位与报价时点，不补值；静态快照，不开启自动更新。\n'+(capacity?'优先使用 table 类型。':'优先使用 market 类型；variant: table。')}
}
async function run(f,outputs=[f.draft],context){
 const start=vi.fn(async()=>({childSessionId:'keyed-table-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',sourceRecords:start.mock.calls.length===1?f.records:[],output:[{type:'text',text:typeof outputs[Math.min(start.mock.calls.length-1,outputs.length-1)]==='string'?outputs[Math.min(start.mock.calls.length-1,outputs.length-1)]:JSON.stringify(outputs[Math.min(start.mock.calls.length-1,outputs.length-1)])}]})})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({storage:{save:async()=>{}},now:()=>captured.createdAt,retryDelayMs:0,adapter:{start,bindData}});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'keyed-table-parent',canvasNodeId:'keyed-table-node',kind:'container',prompt:f.prompt},context);await runtime.tasks.get(receipt.taskId).runPromise
 return {task:runtime.inspect({parentSessionId:'keyed-table-parent',taskId:receipt.taskId}),start,bindData}
}
async function dom(output,check){const w=new Window();try{w.document.body.innerHTML=JSON.parse(output).html;await check(w.document)}finally{await w.happyDOM.abort()}}

it.each([false,true])('creates a complete source-backed keyed table on the first attempt (capacity=%s)',async capacity=>{
 const f=fixture(capacity),{task,start,bindData}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 const expected=f.response.records.map(row=>f.fields.map(key=>String(row[key])))
 await dom(task.finalOutput,document=>{
  expect([...document.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent))).toEqual(expected)
  if(capacity){expect(f.fields.length).toBeGreaterThan(12);expect(document.querySelector('[data-readable-search]')).not.toBeNull()}
 })
 const resolved=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))
 expect(resolved.data.columns).toEqual(f.mapping.columns.map(column=>column.label))
 if(capacity)expect(resolved.recipe).toBeUndefined()
 else {expect(resolved.recipe.mapping.columns).toEqual(resolved.data.columns);expect(Array.isArray(resolved.recipe.mapping.rows.$map)).toBe(true)}
})

it('renders positional source rows with keyed column declarations and preserves refresh selectors',async()=>{
 const f=fixture();f.mapping.rows.$map=f.fields.map(path)
 const before=JSON.stringify(f.draft),{task,start}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce()
 const resolved=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))
 expect(resolved.data.columns).toEqual(f.mapping.columns.map(column=>column.label))
 expect(resolved.data.rows).toEqual(f.response.records.map(row=>f.fields.map(key=>String(row[key]))))
 expect(resolved.recipe.mapping.rows.$map).toEqual(f.fields.map(path))
 expect(materializeComponentMapping(resolved.recipe.mapping,{q:f.response})).toEqual(resolved.data)
 expect(JSON.stringify(f.draft)).toBe(before)
})

it('unwraps a single explicit table list without losing rows or refresh selection',async()=>{
 const f=fixture();f.mapping.rows=[{...f.mapping.rows,$map:f.fields.map(path),$sortBy:'code',$order:'asc'}]
 const before=JSON.stringify(f.draft),{task,start}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce()
 const resolved=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))
 expect(resolved.data.rows).toEqual([...f.response.records].sort((a,b)=>a.code.localeCompare(b.code)).map(row=>f.fields.map(key=>String(row[key]))))
 expect(resolved.recipe.mapping.rows).toMatchObject({$each:'records',$sortBy:'code',$order:'asc',$map:f.fields.map(path)})
 expect(materializeComponentMapping(resolved.recipe.mapping,{q:f.response})).toEqual(resolved.data)
 expect(JSON.stringify(f.draft)).toBe(before)
})

it.each(['short','long','nested','mixed'])('rejects ambiguous positional rows (%s)',kind=>{
 const data={version:1,type:'table',title:'列对齐',columns:[{key:'a',label:'甲'},{key:'b',label:'乙'}],rows:[[0,null]]}
 if(kind==='short')data.rows[0].pop()
 if(kind==='long')data.rows[0].push(3)
 if(kind==='nested')data.rows[0][0]={value:1}
 if(kind==='mixed')data.rows.push({a:1,b:2})
 expect(normalizeKeyedTableProjection(data).data).toBe(data)
})

it.each(['generated-recipe','legacy-keyed-recipe'])('reloads and refreshes the same source projection without generation (%s)',async kind=>{
 const f=fixture(),resolved=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))
 let stored=[],spec=JSON.parse(resolved.output),revision='r1'
 const execute=vi.fn(async()=>structuredClone(f.response)),apply=vi.fn(async(_binding,expected,next)=>{expect(expected).toBe(revision);spec=next;revision+='x'})
 const options={now:()=>captured.createdAt,owner:()=> 'owner',load:async()=>structuredClone(stored),save:async rows=>{stored=JSON.parse(JSON.stringify(rows))},execute,apply,inspect:async()=>({revision,spec,writable:true}),validateRequest:async request=>({...request,connectionId:'c',connectionRevision:1,schemaDigest:'d'})}
 const first=new ComponentDataRefresh(options);cleanup.push(()=>first.dispose());await first.load()
 const binding=await first.bind({sessionId:'session',nodeId:'node',workspaceId:'workspace',intervalMinutes:0,requests:resolved.recipe.requests,mapping:kind==='generated-recipe'?resolved.recipe.mapping:f.mapping})
 if(kind==='generated-recipe')expect(stored[0].mapping.rows.$map).toEqual(f.fields.map(path))
 await first.dispose()
 const reloaded=new ComponentDataRefresh(options);cleanup.push(()=>reloaded.dispose());await reloaded.load();await reloaded.refresh(binding.id)
 expect(execute).toHaveBeenCalledOnce();expect(reloaded.list()[0]).toMatchObject({status:'unchanged',failures:0});expect(apply).not.toHaveBeenCalled()
 expect(readTemplateModel(spec).data.rows).toEqual(f.response.records.map(row=>f.fields.map(key=>String(row[key]))))
})

it.each(['collection-path-map','nested-object-map','single-row-selectors'])('preserves explicit row selection scope with %s',kind=>{
 const f=fixture(true),allKeys=f.fields
 if(kind==='collection-path-map')f.mapping.rows={$from:'q',$path:'records',$map:f.mapping.rows.$map}
 if(kind==='nested-object-map')f.mapping.rows={$from:'q',$map:{$path:'records',$map:f.mapping.rows.$map}}
 if(kind==='single-row-selectors')f.mapping.rows=f.response.records.map(row=>({$from:'q',$each:'records',$filter:{symbol:row.symbol},$single:true,$map:f.mapping.rows.$map}))
 const resolved=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))
 expect(resolved.capacitySnapshot).toBe(true)
 expect(resolved.data.rows).toEqual(f.response.records.map(row=>allKeys.map(key=>String(row[key]))))
})

it.each(['missing-key','extra-key','duplicate-column','dangerous-key','column-extra-field','computed-key','computed-label','nested-cell','extra-root'])('rejects %s rather than dropping fields into an HTML snapshot',async kind=>{
 const f=fixture(true)
 if(kind==='missing-key')delete f.mapping.rows.$map[f.fields[0]]
 if(kind==='extra-key')f.mapping.rows.$map.unmapped=path('price')
 if(kind==='duplicate-column')f.mapping.columns[1].key=f.mapping.columns[0].key
 if(kind==='dangerous-key'){
  f.mapping.columns[0].key='__proto__'
  f.mapping.rows.$map=JSON.parse(JSON.stringify(f.mapping.rows.$map).replace('"symbol":','"__proto__":'))
 }
 if(kind==='column-extra-field')f.mapping.columns[0].hidden=true
 if(kind==='computed-key')f.mapping.columns[0].key={$default:f.mapping.columns[0].key}
 if(kind==='computed-label')f.mapping.columns[0].label={$default:f.mapping.columns[0].label}
 if(kind==='nested-cell')f.mapping.rows.$map[f.fields[0]]={nested:path('price')}
 if(kind==='extra-root')f.mapping.unrecognized='不能被宿主忽略'
 const {task}=await run(f);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined()
})

it.each(['constructor','prototype','__proto__','$from'])('does not normalize dangerous declared keys (%s) at final rendering',key=>{
 const rows=JSON.parse('[{"'+key+'":"unsafe"}]'),data={version:1,type:'market',variant:'table',title:'无效列键',asOf:'2026-10-22',columns:[{key,label:'列'}],rows}
 expect(normalizeKeyedTableProjection(data).data).toBe(data);expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined()
})

it.each(['raw-extra-fields','raw-whole-rows','ignored-take','ignored-single'])('does not change or discard source selection semantics (%s)',kind=>{
 const f=fixture(kind!=='raw-extra-fields');f.mapping.rows={$from:'q',$path:'records'}
 if(kind==='ignored-take')f.mapping.rows.$take=1
 if(kind==='ignored-single')f.mapping.rows.$single=true
 expect(()=>resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))).toThrow()
})

it('retains zero, signed values, null and declared column order without mutating data or selectors',()=>{
 const mapping={version:1,type:'table',title:'来源边界',columns:[{key:'unknown',label:'缺失'},{key:'negative',label:'负数'},{key:'zero',label:'零值'}],rows:{$from:'q',$each:'rows',$map:{zero:path('zero'),unknown:path('unknown'),negative:path('negative')}}},responses={q:{rows:[{zero:0,negative:-3.125,unknown:null}]}}
 const before=JSON.stringify({mapping,responses}),data=materializeComponentMapping(mapping,responses)
 expect(data.columns).toEqual(['缺失','负数','零值']);expect(data.rows).toEqual([[null,'-3.125','0']]);expect(JSON.stringify({mapping,responses})).toBe(before)
 const staticData={...mapping,asOf:'来源时点',rows:responses.q.rows}
 const rendered=JSON.parse(acceptArtifactOutput(JSON.stringify(staticData)))
 expect(readTemplateModel(rendered).data.rows).toEqual([['—',-3.125,0]])
})

function financialFixture(){
 const observed=JSON.parse(readFileSync(new URL('./fixtures/statement-table-evidence/compute-b-observed.json',import.meta.url),'utf8')),record=structuredClone(observed.records.find(record=>record.args?.url_params?.ticker==='300502'))
 const mapping={version:1,type:'market',variant:'table',title:'财务指标',asOf:'DataYes 2026-06-30',note:'来源：DataYes；合并口径',columns:[{key:'company',label:'公司'},{key:'period',label:'报告期'},{key:'margin',label:'销售毛利率'}],rows:{$from:'q',$each:'data',$filter:{endDate:'2026-06-30',endDateRep:'2026-06-30',mergedFlag:'1'},$map:{margin:{...path('grossMargin'),$suffix:'%'},period:path('endDate'),company:path('secID')}}}
 return {records:[record],mapping,draft:{version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args:record.args}],mapping},prompt:'工作台：DataYes财务资料\n本面板：财务指标\nDataYes 300502.SZ 财务指标，保留2026-06-30报告期与销售毛利率及原单位。静态快照，不开启自动更新。\n优先使用 market 类型；variant: table。'}
}
it('keeps the financial source gate on canonical semantic data',async()=>{
 const f=financialFixture(),{task,start}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce()
 expect(readTemplateModel(JSON.parse(task.finalOutput)).data.columns).toEqual(['公司','报告期','销售毛利率'])
})
it.each(['wrong-metric','wrong-report-date','wrong-scale','unobserved-call','source-policy'])('keeps the original %s gate after keyed normalization',async kind=>{
 const f=financialFixture();let context
 if(kind==='wrong-metric')f.mapping.rows.$map.margin={...path('revenueYoy'),$suffix:'%'}
 if(kind==='wrong-report-date')f.mapping.rows.$map.period=path('publishDate')
 if(kind==='wrong-scale')f.mapping.rows.$map.margin.$scale=0.01
 if(kind==='unobserved-call')f.draft.requests[0].args={...f.draft.requests[0].args,unobserved:true}
 if(kind==='source-policy')context={sourcePolicy:{pluginRequired:false,pluginProhibited:true,preferenceRequest:'只使用公开网页，不调用插件'},sourceRequirement:'仅公开网页业务数据'}
 const {task}=await run(f,undefined,context);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined()
})
it('does not let copied good HTML replace the failed financial projection proof',async()=>{
 const good=financialFixture(),completed=await run(good);expect(completed.task.state,completed.task.error).toBe('completed')
 const bad=financialFixture();bad.mapping.rows.$map.margin={...path('revenueYoy'),$suffix:'%'}
 const bare=JSON.parse(completed.task.finalOutput);bare.html=bare.html.replace(/<script id="sherlock-template-data" type="application\/json">[^<]*<\/script>/gu,'')
 const {task}=await run(bad,[bad.draft,JSON.stringify(bare)]);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined()
})

// Captured ETF generator emitted {code:"code", name:"name", ...} inside $map.
it('expands a fully declared identity row projection into observed field selectors',()=>{
 const f=fixture();f.mapping.rows.$map=Object.fromEntries(f.fields.map(key=>[key,key]));
 const before=JSON.stringify(f.draft),result=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt));
 expect(result.data.rows).toEqual(f.response.records.map(row=>f.fields.map(key=>String(row[key]))));
 expect(result.recipe.mapping.rows.$map).toEqual(f.fields.map(path));
 const updated=structuredClone(f.response);updated.records[0].price=123.45;
 expect(materializeComponentMapping(result.recipe.mapping,{q:updated}).rows[0][f.fields.indexOf('price')]).toBe('123.45');
 expect(JSON.stringify(f.draft)).toBe(before);
})
it('does not accept a field-name projection when a declared field is absent',()=>{
 const f=fixture();f.mapping.rows.$map=Object.fromEntries(f.fields.map(key=>[key,key]));delete f.response.records[0].price;
 expect(()=>resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt))).toThrow(/price/);
})
it('normalizes only the absent data envelope of an observed builtin public quote response',()=>{
 const f=fixture();expect(f.records[0].tool).toBe('public_data_query');
 f.mapping.rows.$each='data.records';
 const result=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(captured.createdAt));
 expect(result.recipe.mapping.rows.$each).toBe('records');
 expect(result.data.rows).toEqual(f.response.records.map(row=>f.fields.map(key=>String(row[key]))));
 const ambiguous=structuredClone(f.records);ambiguous[0].response.data={records:[]};
 expect(()=>resolveBoundComponent(JSON.stringify(f.draft),ambiguous,new Date(captured.createdAt))).toThrow();
 const other=structuredClone(f);other.records[0].tool='ework__t_abc123';other.draft.requests[0].tool=other.records[0].tool;
 expect(()=>resolveBoundComponent(JSON.stringify(other.draft),other.records,new Date(captured.createdAt))).toThrow(/列表字段/);
})
