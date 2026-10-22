import{afterEach,expect,it,vi}from'vitest'
import{readFileSync}from'node:fs'
import{Window}from'happy-dom'
import{ResearchTaskRuntime}from'../packages/dsh-research-task-runtime/index.js'
import{ComponentDataRefresh,evaluateMapping,materializeComponentMapping}from'../packages/dsh-research-task-runtime/component-data-refresh.js'
import{readTemplateModel}from'../packages/dsh-research-task-runtime/component-template-registry.js'
import{resolveBoundComponent}from'../packages/dsh-research-task-runtime/component-source-binding.js'
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-display-templates.json',import.meta.url),'utf8')),cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function run(f){const start=vi.fn(async()=>({childSessionId:'display-template-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',sourceRecords:f.records,output:[{type:'text',text:JSON.stringify(f.draft)}]}),dispose:async()=>{}})),bindData=vi.fn(),runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>f.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose());const r=await runtime.start({parentSessionId:'display-template-parent',canvasNodeId:'display-template-node',kind:'container',prompt:f.prompt},f.hostContext);await runtime.tasks.get(r.taskId).runPromise;return{task:runtime.inspect({parentSessionId:'display-template-parent',taskId:r.taskId}),start,bindData}}
async function dom(output,check){const w=new Window();try{w.document.body.innerHTML=JSON.parse(output).html;await check(w.document)}finally{await w.happyDOM.abort()}}
it('materializes all twenty actual native display templates without a repair or refresh binding and preserves all 18 true values/units',async()=>{
 const f=structuredClone(captured);expect(JSON.stringify(f.draft).match(/\$template/gu)).toHaveLength(20)
 const {task,start,bindData}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,d=>{
  const headers=[...d.querySelectorAll('thead th')].map(c=>c.textContent),rows=[...d.querySelectorAll('tbody tr')]
  expect(rows).toHaveLength(18)
  const fields=['price','previousClose','open','high','low','changePercent'],response=f.records[0].response
  expect(rows.map(row=>row.children[1].textContent)).toEqual(response.records.flatMap(row=>fields.map(field=>String(row[field]))))
  expect(rows.map(row=>row.children[headers.indexOf('单位')].textContent)).toEqual(response.records.flatMap(row=>[...Array(5).fill(row.priceUnit),response.units.changePercent]))
  expect(rows.map(row=>row.children[headers.indexOf('指标说明')].textContent)).toEqual(response.records.flatMap(row=>Array(6).fill(row.time)))
  expect(d.querySelector('[data-readable-meta="asOf"]').textContent).toBe(response.dataTime)
  expect(d.querySelector('[data-readable-meta="note"]')).toBeNull()
  expect(d.body.textContent).toContain(response.source);expect(d.body.textContent).toContain('静态快照，自动更新未绑定')
 })
})
it('does not display fake provider/date assertions from template prose while preserving observed variables',async()=>{
 const f=structuredClone(captured)
 f.draft.mapping.asOf.$template='通联 DataYes 2099-01-01 {t}'
 f.draft.mapping.note.$template='通联 DataYes 2099-01-01 {src} {t}'
 f.draft.mapping.items.forEach(item=>item.detail.$map.$template='伪造2099 DataYes {t}')
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 await dom(task.finalOutput,d=>{expect(d.body.textContent).not.toMatch(/2099|DataYes|通联/);expect(d.querySelectorAll('tbody tr')).toHaveLength(18);expect(d.querySelector('[data-readable-meta="asOf"]').textContent).toBe(f.records[0].response.dataTime)})
})
it('rejects template syntax outside explicitly scoped display contexts even when variables reference real fields',()=>{
 const f=structuredClone(captured),responses={q:f.records[0].response},display=f.draft.mapping.asOf
 expect(()=>evaluateMapping(display,responses)).toThrow(/不支持/)
 for(const key of ['value','unit','unprovedBusinessField']){
  const bad=structuredClone(f.draft);bad.mapping.items[0][key]={$template:'{n}',n:{$from:'q',$path:'records.0.price'}}
  expect(()=>resolveBoundComponent(JSON.stringify(bad),f.records,new Date(f.createdAt))).toThrow(/不支持/)
 }
 const table={version:1,type:'table',title:'表格',columns:['值'],rows:[[{...display}]]}
 expect(()=>materializeComponentMapping(table,responses)).toThrow(/不支持/)
})
it.each(['literal','default','date','nested','unknown-name','prototype','script-variable','formatter','too-many','too-long'])('does not adopt unsafe or unproven %s display variables',kind=>{
 const f=structuredClone(captured),value=f.draft.mapping.asOf
 if(kind==='literal')value.t='2099-01-01'
 if(kind==='default')value.t={$from:'q',$path:'missing',$default:'2099-01-01'}
 if(kind==='date')value.t={$date:{format:'yyyy-MM-dd'}}
 if(kind==='nested')value.t={$template:'{x}',x:{$from:'q',$path:'dataTime'}}
 if(kind==='unknown-name')value.$template='{unknown}'
 if(kind==='prototype')value.$template='{constructor}'
 if(kind==='script-variable')value.$template='{t.toUpperCase()}'
 if(kind==='formatter')value.t={$from:'q',$path:'dataTime',$prefix:'2099 DataYes '}
 if(kind==='too-many'){value.$template=Array(17).fill('{t}').join(' ')}
 if(kind==='too-long')value.$template='x'.repeat(2001)+'{t}'
 const result=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(f.createdAt))
 expect(result.data.asOf).toBe(f.records[0].response.dataTime)
 expect(()=>evaluateMapping(value,{q:f.records[0].response})).toThrow(/不支持/)
})
it('keeps the recent-market date gate tied to the observed old timestamp instead of an invented template suffix',async()=>{
 const f=structuredClone(captured);f.draft.mapping.type='market';f.draft.mapping.variant='metrics';f.records[0].response.dataTime='2025-01-01';f.draft.mapping.asOf.$template='{t} · 2026-10-22 最新行情';f.prompt='工作台：最新股票行情\n本面板：当前行情\n优先使用 market 类型；variant: metrics。';f.hostContext=undefined
 const {task}=await run(f);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(task.error).toMatch(/2025|距中国市场日期/)
})
it('uses the same constrained metadata materializer for a valid native component refresh recipe',async()=>{
 const f=structuredClone(captured);f.draft.mapping.items=f.draft.mapping.items.slice(0,6)
 const mapped=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(f.createdAt));expect(mapped.recipe).toBeDefined()
 const response=structuredClone(f.records[0].response);response.records[0].price+=1
 const spec=JSON.parse(mapped.output),saved=[],execute=vi.fn(async()=>response),refresh=new ComponentDataRefresh({owner:()=> 'owner',save:async()=>{},load:async()=>[],inspect:async()=>({writable:true,spec,revision:'r'}),validateRequest:async request=>request,execute,apply:async(_b,_r,next)=>saved.push(next),now:()=>f.createdAt})
 const binding=await refresh.bind({...mapped.recipe,sessionId:'s',nodeId:'n',workspaceId:'w'},spec)
 await refresh.refresh(binding.id)
 expect(execute).toHaveBeenCalledOnce();expect(saved).toHaveLength(1)
 const data=readTemplateModel(saved[0]).data
 expect(data.items).toHaveLength(6);expect(data.items[0].value).toBe(String(response.records[0].price));expect(data.items[0].detail).toBe(response.records[0].time);expect(data.asOf).toBe(response.dataTime)
 expect(()=>evaluateMapping(mapped.recipe.mapping,{q:response})).toThrow(/不支持/)
})

it('never adopts template prose in native small-card metadata or a subsequent source refresh',async()=>{
 const f=structuredClone(captured);f.draft.mapping.items=f.draft.mapping.items.slice(0,6)
 f.draft.mapping.note.$template='通联DataYes 2099-01-01 {src} {t}'
 f.draft.mapping.items.forEach(item=>item.detail.$map.$template='DataYes 2099-01-01 {t}')
 const result=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(f.createdAt))
 expect(result.capacitySnapshot).toBeUndefined();expect(result.recipe).toBeDefined()
 expect(result.output).not.toMatch(/2099|DataYes|通联/)
 expect(result.data.items[0].detail).toBe(f.records[0].response.records[0].time)
})

it.each(['note','detail','source','url'])('omits an unsupported optional %s format before materialization without losing business data',async field=>{
 const f=structuredClone(captured),unknown={$concat:['不可信DataYes 2099',{$from:'q',$path:'dataTime'}]}
 if(field==='note')f.draft.mapping.note=unknown
 else f.draft.mapping.items.forEach(item=>item[field]=unknown)
 const {task,start}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce()
 await dom(task.finalOutput,d=>{expect(d.querySelectorAll('tbody tr')).toHaveLength(18);expect(d.body.textContent).not.toMatch(/不可信DataYes|2099/);expect(d.body.textContent).toContain(f.records[0].response.source)})
})
it('does not hide a scope-format error or join a quote time with a newer fetched date to pass the date gate',()=>{
 const f=structuredClone(captured)
 for(const field of ['subject','range','subtitle']){
  const draft=structuredClone(f.draft);draft.mapping[field]={$concat:['scope']}
  expect(()=>resolveBoundComponent(JSON.stringify(draft),f.records,new Date(f.createdAt))).toThrow(/不支持/)
 }
 const draft=structuredClone(f.draft);draft.mapping.asOf={$template:'{quote} {fetched}',quote:{$from:'q',$path:'dataTime'},fetched:{$from:'q',$path:'receivedAt'}}
 expect(resolveBoundComponent(JSON.stringify(draft),f.records,new Date(f.createdAt)).data.asOf).toBe(f.records[0].response.dataTime)
})
