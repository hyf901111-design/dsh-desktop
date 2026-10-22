import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {resolveBoundComponent,COMPONENT_BOUND_DATA_PROMPT,COMPONENT_STATIC_CHART_PROMPT} from '../packages/dsh-research-task-runtime/component-source-binding.js'

// Exact public response and mapping captured from root-owned native task
// a03aa90a-cb35-4168-ada3-b4afc1e81db5. No live/model transport is used.
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-kpi18.json',import.meta.url),'utf8')),cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function run(f){
 const start=vi.fn(async()=>({childSessionId:'native-kpi-child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',sourceRecords:f.records,output:[{type:'text',text:JSON.stringify(f.draft)}]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>f.createdAt,retryDelayMs:0});cleanup.push(()=>runtime.dispose())
 const receipt=await runtime.start({parentSessionId:'native-kpi-parent',canvasNodeId:'native-kpi-node',kind:'container',prompt:f.prompt},f.hostContext)
 await runtime.tasks.get(receipt.taskId).runPromise
 return {task:runtime.inspect({parentSessionId:'native-kpi-parent',taskId:receipt.taskId}),start,bindData}
}
it('completes the actual 18-selector KPI with only its redundant type label normalized and honest source/time presentation',async()=>{
 const f=structuredClone(captured),{task,start,bindData}=await run(f)
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 const window=new Window();try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  const rows=[...window.document.querySelectorAll('tbody tr')]
  expect(rows).toHaveLength(18)
  for(const item of f.draft.mapping.items)expect(rows.some(row=>row.firstElementChild.textContent===item.label)).toBe(true)
  expect(window.document.body.textContent).toContain(f.records[0].response.source)
  expect(window.document.querySelector('[data-readable-meta="asOf"]').textContent).toBe(f.records[0].response.dataTime)
  expect(window.document.body.textContent).not.toMatch(/通联|DataYes/)
  const semantic=resolveBoundComponent(JSON.stringify(f.draft),f.records,new Date(f.createdAt)).data
  expect(semantic.variant).toBeUndefined()
  // Presentation correction never changes the semantic date inspected by gates.
  expect(semantic.asOf).toContain(f.records[0].response.dataTime)
 }finally{await window.happyDOM.abort()}
})
it.each(['null','absent'])('displays an honest missing time when the actual %s date cannot support a model default or provider suffix',async mode=>{
 const f=structuredClone(captured)
 if(mode==='null')f.records[0].response.dataTime=null
 else delete f.records[0].response.dataTime
 Object.assign(f.draft.mapping.asOf,{$optional:true,$default:'2026-10-22 · 通联 DataYes'})
 const {task}=await run(f);expect(task.state,task.error).toBe('completed')
 const window=new Window();try{
  window.document.body.innerHTML=JSON.parse(task.finalOutput).html
  expect(window.document.querySelector('[data-readable-meta="asOf"]').textContent).toBe('来源未提供')
  expect(window.document.querySelector('[data-readable-meta="asOf"] [data-workbench-status-text]')).not.toBeNull()
  expect(window.document.body.textContent).not.toMatch(/通联|DataYes/)
  expect(window.document.querySelectorAll('tbody tr')).toHaveLength(18)
 }finally{await window.happyDOM.abort()}
})
it.each(['incompatible-variant','unknown-key','literal-value','unobserved-request','old-quote'])('does not use redundant-label recovery to bypass %s',async kind=>{
 const f=structuredClone(captured)
 if(kind==='incompatible-variant')f.draft.mapping.variant='metrics'
 if(kind==='unknown-key')f.draft.mapping.unrecognized={allowed:false}
 if(kind==='literal-value')f.draft.mapping.items[0].value='999 CNY'
 if(kind==='unobserved-request')f.draft.requests[0].args.parameters_json='{"symbols":["sh600000"]}'
 if(kind==='old-quote'){
  f.records[0].response.dataTime='2025-01-01 15:00:00';f.records[0].response.records.forEach(row=>row.time='2025-01-01 15:00:00')
  f.draft.mapping.type='market';f.draft.mapping.variant='metrics'
  f.prompt='工作台：最新股票行情\n本面板：最新股票18项行情\n优先使用 market 类型；variant: metrics。保持全部18项。'
  f.hostContext=undefined
 }
 const {task}=await run(f);expect(task.state).not.toBe('completed');expect(task.finalOutput).toBeUndefined()
})
it('teaches source-neutral time selectors and only template-required variants in mapping examples',()=>{
 expect(COMPONENT_BOUND_DATA_PROMPT).not.toContain('$suffix":" · 通联 DataYes')
 expect(COMPONENT_BOUND_DATA_PROMPT).toContain('kpi 不使用 variant')
 expect(COMPONENT_STATIC_CHART_PROMPT).toContain('仅需要变体的模板')
})
