import{afterEach,expect,it,vi}from'vitest'
import{readFileSync}from'node:fs'
import{Window}from'happy-dom'
import{ResearchTaskRuntime}from'../packages/dsh-research-task-runtime/index.js'
import{ComponentDataRefresh,evaluateMapping,materializeComponentMapping,componentSourceMetadata}from'../packages/dsh-research-task-runtime/component-data-refresh.js'
import{resolveBoundComponent}from'../packages/dsh-research-task-runtime/component-source-binding.js'
import{readTemplateModel}from'../packages/dsh-research-task-runtime/component-template-registry.js'
import{WORKBENCH_ENGLISH}from'../packages/dsh-research-task-runtime/workbench-locale.js'
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-source-metadata.json',import.meta.url),'utf8')),cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const clone=()=>structuredClone(captured)
async function run(f,first=true){const drafts=first?[f.first,f.repair]:[f.repair],start=vi.fn(async()=>{const i=start.mock.calls.length-1;return{childSessionId:'source-metadata-'+i,result:Promise.resolve({stopReason:'completed',sourceRecords:i===0?f.records:[],output:[{type:'text',text:JSON.stringify(drafts[Math.min(i,drafts.length-1)])}]}),dispose:async()=>{}}}),bindData=vi.fn(),runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>f.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose());const r=await runtime.start({parentSessionId:'source-metadata-parent',canvasNodeId:'source-metadata-node',kind:'container',prompt:f.prompt},f.hostContext);await runtime.tasks.get(r.taskId).runPromise;return{task:runtime.inspect({parentSessionId:'source-metadata-parent',taskId:r.taskId}),start,bindData}}
async function dom(output,check){const w=new Window();try{w.document.body.innerHTML=JSON.parse(output).html;await check(w.document)}finally{await w.happyDOM.abort()}}
const resolve=f=>resolveBoundComponent(JSON.stringify(f.repair),f.records,new Date(f.createdAt))
it('replays exact c05 first→repair using the one actually observed query and preserves 18 values, units and individual quote times',async()=>{
 const f=clone();expect(f.nativeTaskId).toBe('f7661ce7-7b44-44a1-860d-9e93fba31ab5');expect(f.repair.requests[0].args).toEqual(f.records[0].args)
 expect(typeof f.first.requests[0].args.parameters_json).toBe('object');expect(f.first.requests[0].args.operation).toBeUndefined()
 const{task,start,bindData}=await run(f);expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledTimes(2);expect(bindData).not.toHaveBeenCalled()
 await dom(task.finalOutput,d=>{
  const rows=[...d.querySelectorAll('tbody tr')],headers=[...d.querySelectorAll('thead th')].map(cell=>cell.textContent),column=name=>rows.map(row=>row.children[headers.indexOf(name)]?.textContent),response=f.records[0].response,fields=['price','previousClose','open','high','low','changePercent']
  expect(rows).toHaveLength(18);expect(column('原值')).toEqual(response.records.flatMap(row=>fields.map(field=>String(row[field]))))
  expect(column('单位')).toEqual(response.records.flatMap(row=>[...Array(5).fill(row.priceUnit),response.units.changePercent]))
  expect(column('指标说明')).toEqual(response.records.flatMap(row=>Array(6).fill(row.time)))
  expect(new Set(column('指标说明')).size).toBe(3);expect(d.querySelector('[data-readable-meta="asOf"]').textContent).toBe(response.dataTime)
  expect(d.querySelector('[data-readable-source-gaps]')).toBeNull();expect(d.body.textContent).toContain(response.source);expect(d.body.textContent).not.toMatch(/DataYes|通联/)
 })
})
it.each(['$concat','$format','$unrecognizedDisplayWrapper'])('uses actual canonical time and row selectors without executing %s',operator=>{
 const f=clone(),m=f.repair.mapping;m.asOf={[operator]:[{$from:'q',$path:'dataTime'},'DataYes 2099-01-01']};m.items.forEach(item=>{const value=item.value;item.detail={...value,$map:{[operator]:[{$path:'time'},'DataYes 2099-01-01']}}})
 const result=resolve(f);expect(result.capacitySnapshot).toBe(true);expect(result.output).not.toMatch(/DataYes|2099/);expect(result.data.asOf).toBe(f.records[0].response.dataTime)
 expect(result.data.items.map(item=>item.detail)).toEqual(f.records[0].response.records.flatMap(row=>Array(6).fill(row.time)))
 expect(()=>evaluateMapping(m.asOf,{q:f.records[0].response})).toThrow(/不支持/)
})
it('requires matching observed records instead of treating arbitrary responses or fetchedAt as canonical time',()=>{
 const f=clone(),responses={q:f.records[0].response}
 expect(()=>materializeComponentMapping({...f.repair.mapping,missing:undefined},responses,new Date(f.createdAt),[])).toThrow()
 const mapping=structuredClone(f.repair.mapping);delete mapping.missing
 expect(()=>materializeComponentMapping(mapping,responses,new Date(f.createdAt),[{...f.records[0],response:{...responses.q,dataTime:'2099-01-01'}}])).toThrow(/不支持/)
 const other=structuredClone(responses.q);other.dataTime='2026-10-23 01:00:00';mapping.items[0].value={$from:'q2',$path:'records.0.price'}
 expect(()=>materializeComponentMapping(mapping,{...responses,q2:other},new Date(f.createdAt),[...f.records,{...f.records[0],response:other}])).toThrow(/不支持/)
})
it.each(['absent','null'])('shows an honest unknown timestamp when the actual canonical time is %s without using receivedAt',async mode=>{
 const f=clone();if(mode==='absent')delete f.records[0].response.dataTime;else f.records[0].response.dataTime=null
 const result=resolve(f);expect(result.capacitySnapshot).toBe(true);expect(result.data.asOf).toBe('来源未提供')
 await dom(result.output,d=>{expect(d.querySelector('[data-readable-meta="asOf"]').textContent).toBe('来源未提供');expect(d.querySelector('[data-readable-meta="asOf"]').textContent).not.toBe(f.records[0].response.receivedAt);expect(d.querySelectorAll('tbody tr')).toHaveLength(18)})
})
it('renders actual nonempty missingSymbols independently of model note formatting without creating business values',async()=>{
 const f=clone();f.records[0].response.missingSymbols=['sz000001','sh600000'];f.repair.mapping.note={$format:['无缺失 DataYes 2099']}
 const result=resolve(f);expect(result.capacitySnapshot).toBe(true);expect(result.data.items).toHaveLength(18);expect(result.data.note).toContain('来源缺失项：sz000001、sh600000')
 await dom(result.output,d=>{expect(d.querySelector('[data-readable-source-gaps]').textContent).toBe('来源缺失项：sz000001、sh600000');expect(d.body.textContent).not.toMatch(/无缺失|DataYes|2099/)})
 expect(WORKBENCH_ENGLISH['来源缺失项：']).toBe('Missing from the source: ')
})
it.each(['literal','default','different-path'])('does not strip an unproven %s root missing field to bypass the contract',kind=>{
 const f=clone();f.repair.mapping.missing=kind==='literal'?[]:kind==='default'?{$from:'q',$path:'missingSymbols',$default:'无缺失'}:{$from:'q',$path:'records'}
 expect(()=>resolve(f)).toThrow(/missingSymbols/)
})
it.each(['value','unit','unknownBusinessField'])('does not recover an unknown formatter or literal in business %s',field=>{
 const f=clone();f.repair.mapping.items[0][field]={$concat:[{$from:'q',$path:'records.0.price'},'999']};expect(()=>resolve(f)).toThrow(/不支持/)
 if(field==='value'){f.repair.mapping.items[0].value='999';expect(()=>resolve(f)).toThrow()}
})
it('does not let a malformed formatter wash an old actual quote date through the current-market gate',async()=>{
 const f=clone();f.records[0].response.dataTime='2025-01-01';f.repair.mapping.type='market';f.repair.mapping.variant='metrics';delete f.repair.mapping.missing;f.repair.mapping.asOf={$format:[{$from:'q',$path:'dataTime'},'2026-10-22 最新行情']};f.prompt='工作台：最新股票行情\n本面板：当前行情\n优先使用 market 类型；variant: metrics。';f.hostContext=undefined
 const{task}=await run(f,false);expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(task.error).toMatch(/2025|距中国市场日期/)
})
it('persists and reloads the shared canonical timestamp and source-gap logic for native refresh',async()=>{
 const f=clone();f.repair.mapping.items=f.repair.mapping.items.slice(0,6);f.records[0].response.missingSymbols=['sz000001']
 const result=resolve(f);expect(result.recipe).toBeDefined();expect(result.data.note).toContain('sz000001');const response=structuredClone(f.records[0].response);response.records[0].price+=1;response.dataTime='2026-10-23 09:31:00';response.records[0].time=response.dataTime;response.missingSymbols=['sh600000']
 let stored=[],saved=[],spec=JSON.parse(result.output);const options={owner:()=> 'o',save:async bindings=>{stored=JSON.parse(JSON.stringify(bindings))},load:async()=>stored,inspect:async()=>({writable:true,spec,revision:'r'}),validateRequest:async request=>request,execute:vi.fn(async()=>response),apply:async(_b,_r,next)=>saved.push(next),now:()=>f.createdAt}
 const first=new ComponentDataRefresh(options),b=await first.bind({...result.recipe,sessionId:'s',nodeId:'n',workspaceId:'w'},spec)
 const refreshed=new ComponentDataRefresh(options);await refreshed.load();await refreshed.refresh(b.id)
 expect(options.execute).toHaveBeenCalledOnce();expect(saved).toHaveLength(1);const data=readTemplateModel(saved[0]).data
 expect(data.asOf).toBe(response.dataTime);expect(data.items[0].detail).toBe(response.dataTime);expect(data.items[0].value).toBe(String(response.records[0].price));expect(data.note).toContain('sh600000');expect(data.note).not.toContain('sz000001')
})

it('bounds canonical metadata scanning before recursively traversing model mappings',()=>{
 const f=clone();let deep={$from:'q',$path:'records.0.price'};for(let i=0;i<30;i++)deep={nested:deep}
 expect(componentSourceMetadata({items:deep},{q:f.records[0].response},f.records)).toBeNull()
 expect(componentSourceMetadata({items:Array(30001).fill({$from:'q',$path:'records.0.price'})},{q:f.records[0].response},f.records)).toBeNull()
})
it('recovers malformed timestamp prose only from canonical observed time, not its bogus variables',()=>{
 const f=clone();f.repair.mapping.asOf={$template:'DataYes 2099 {missing}',t:{$from:'q',$path:'receivedAt'}}
 const result=resolve(f);expect(result.data.asOf).toBe(f.records[0].response.dataTime);expect(result.output).not.toMatch(/DataYes|2099/)
 const response=structuredClone(f.records[0].response);response.dataTime='2025-01-01';f.repair.mapping.items[0].value={$from:'other',$path:'records.0.price'}
 expect(()=>materializeComponentMapping(f.repair.mapping,{q:f.records[0].response,other:response},new Date(f.createdAt),[...f.records,{...f.records[0],response}])).toThrow(/展示文本模板/)
})
