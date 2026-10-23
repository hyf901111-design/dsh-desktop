import{afterEach,expect,it,vi}from'vitest'
import{readFileSync}from'node:fs'
import{Window}from'happy-dom'
import{ResearchTaskRuntime}from'../packages/dsh-research-task-runtime/index.js'
import{resolveBoundComponent,componentBindingRequested}from'../packages/dsh-research-task-runtime/component-source-binding.js'
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-static-kpi18.json',import.meta.url),'utf8')),cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function run(f,outputs=[f.repair]){
 const start=vi.fn(async()=>({childSessionId:'static-kpi-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',sourceRecords:start.mock.calls.length===1?f.records:[],output:[{type:'text',text:JSON.stringify(outputs[Math.min(start.mock.calls.length-1,outputs.length-1)])}]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>f.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'static-kpi-parent',canvasNodeId:'static-kpi-node',kind:'container',prompt:f.prompt},f.hostContext);await runtime.tasks.get(receipt.taskId).runPromise
 return{task:runtime.inspect({parentSessionId:'static-kpi-parent',taskId:receipt.taskId}),start,bindData}
}
async function dom(output,check){const w=new Window();try{w.document.body.innerHTML=JSON.parse(output).html;await check(w.document)}finally{await w.happyDOM.abort()}}
it('replays the actual native literal first result and source-mapped repair without requery, refresh or metadata-based failure',async()=>{
 const f=structuredClone(captured),{task,start,bindData}=await run(f,[f.first,f.repair])
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledTimes(2);expect(bindData).not.toHaveBeenCalled()
 expect(start.mock.calls[0][0].prompt).toContain('本卡仅生成本次静态组件，不建立自动更新绑定')
 for(const [call]of start.mock.calls){expect(call.prompt).not.toContain('无需data-bound或映射');expect(call.prompt).toContain('完整 source-backed mapping')}
 expect(start.mock.calls[1][0].synthesisOnly).toBe(true)
 expect(start.mock.calls[1][0].prompt).toContain('指标、表格、列表或曲线均优先提交完整 data-bound')
 await dom(task.finalOutput,document=>{
  const rows=[...document.querySelectorAll('tbody tr')];expect(rows).toHaveLength(18)
  const actual=f.records[0].response.records,fields=['price','previousClose','open','high','low','changePercent']
  expect(rows.map(row=>row.children[1].textContent)).toEqual(actual.flatMap(row=>fields.map(key=>String(row[key]))))
  expect(document.body.textContent).toContain(f.records[0].response.source)
  expect(document.querySelector('[data-readable-meta="asOf"]').textContent).toBe(f.records[0].response.dataTime)
  expect(document.body.textContent).not.toContain('tencent-quotes')
  expect(document.body.textContent).toContain('静态快照，自动更新未绑定')
 })
})
it('does not display unverified literal detail, source or URL while retaining all real business values and original guard semantics',async()=>{
 const f=structuredClone(captured)
 f.repair.mapping.items.forEach(item=>Object.assign(item,{detail:'报价时间2099-01-01 · 通联 DataYes',source:'通联 DataYes',url:'https://unobserved.example.org/fake'}))
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 await dom(task.finalOutput,document=>{expect(document.querySelectorAll('tbody tr')).toHaveLength(18);expect(document.body.textContent).not.toMatch(/2099|通联|DataYes/);expect(document.querySelector('a[href="https://unobserved.example.org/fake"]')).toBeNull()})
 const semantic=resolveBoundComponent(JSON.stringify(f.repair),f.records,new Date(f.createdAt)).data
 expect(semantic.items[0].detail).toContain('2099');expect(semantic.items[0].source).toBe('通联 DataYes')
})
it('retains source-selected detail/source/link using the original per-stock row scope rather than literal metadata decorations',async()=>{
 const f=structuredClone(captured)
 f.repair.mapping.items.forEach(item=>{
  item.detail={...item.value,$map:{$path:'time'},$prefix:'假时点2099 ', $suffix:' · DataYes'}
  delete item.detail.$as
  item.source={$from:'q',$path:'source',$suffix:' · DataYes'};item.url={$from:'q',$path:'sourceUrl'}
 })
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 await dom(task.finalOutput,document=>{
  const header=[...document.querySelectorAll('thead th')].map(cell=>cell.textContent),details=[...document.querySelectorAll('tbody tr')].map(row=>row.children[header.indexOf('指标说明')].textContent)
  expect(details).toEqual(f.records[0].response.records.flatMap(row=>Array(6).fill(row.time)))
  expect(document.body.textContent).not.toMatch(/2099|DataYes/)
  expect(document.body.textContent).toContain(f.records[0].response.sourceUrl)
 })
})
it('keeps actual detail selections inside each row when the items mapping is a source collection',async()=>{
 const f=structuredClone(captured),response=f.records[0].response
 response.records=Array.from({length:18},(_,i)=>({name:'指标'+i,price:i-2,time:'实际行时点'+i,priceUnit:'CNY'}))
 f.repair.mapping.items={$from:'q',$each:'records',$map:{label:{$path:'name'},value:{$path:'price'},unit:{$path:'priceUnit'},detail:{$path:'time'},source:'伪造DataYes'}}
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 await dom(task.finalOutput,document=>{for(let i=0;i<18;i++)expect(document.querySelectorAll('tbody tr')[i].textContent).toContain('实际行时点'+i);expect(document.body.textContent).not.toContain('DataYes')})
})
it.each(['literal-value','numeric-default','unobserved-request','unknown-field'])('does not extend display tolerance to %s',async kind=>{
 const f=structuredClone(captured)
 if(kind==='literal-value')f.repair.mapping.items[0].value='999'
 if(kind==='numeric-default'){f.records[0].response.records[0].price=null;f.repair.mapping.items[0].value.$map.$default=999}
 if(kind==='unobserved-request')f.repair.requests[0].args.parameters_json='{"symbols":["sh600000"]}'
 if(kind==='unknown-field')f.repair.mapping.items[0].unprovedBusinessAmount='999'
 const {task}=await run(f);expect(task.state).not.toBe('completed');expect(task.finalOutput).toBeUndefined()
})

it.each(['不开启自动更新','不启用自动刷新','不启动定时更新'])('honors an explicit static prohibition: %s',request=>{
 expect(componentBindingRequested('静态快照，'+request+'。')).toBe(false)
 expect(componentBindingRequested(request+'，但本卡需要每分钟自动更新。')).toBe(true)
})
