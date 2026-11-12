import {it,expect} from 'vitest'
import {componentSourceCollector,componentBindingEvidence} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {componentAcquisitionFollowup} from '../packages/dsh-research-task-runtime/component-acquisition-followup.js'

const args={intent:'analysis',capability:'fund_performance',schema_hash:'a'.repeat(64),arguments_json:JSON.stringify({fundCodes:Array.from({length:12},(_,i)=>String(i).padStart(6,'0'))})}
function collect(text,{isError=true,input=args}={}){
 const collector=componentSourceCollector(['financial_query'])
 collector.accept({type:'tool/call',data:{callId:'observed-overflow',name:'financial_query',arguments:JSON.stringify(input)}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'observed-overflow'},content:[{type:'tool-result',isError,content:[{type:'text',text}]}]}}})
 return collector
}
it('preserves the actual oversized request across acquisition recovery without promoting it to business data',()=>{
 const collector=collect('Error: 研究结果过大，请缩小基金范围、日期区间或分页查询。')
 expect(collector.records).toEqual([]);expect(componentBindingEvidence(collector.records)).toBeFalsy()
 expect(collector.attempts).toContainEqual({kind:'acquisition-overflow',tool:'financial_query',args})
 const followup=componentAcquisitionFollowup([],{attempts:collector.attempts})
 expect(followup).toContain('目标集合不变');expect(followup).toContain('逐批');expect(followup).toContain('000011')
 // A smaller successful response does not erase the original acquisition scope.
 expect(componentAcquisitionFollowup([{tool:'financial_query',args:{...args,arguments_json:'{"fundCodes":["000000"]}'},response:{records:[{instrument:'000000',value:1}]}}],{attempts:collector.attempts})).toContain('000011')
})
it('never treats data prose, permission errors or credential-bearing inputs as permission to retry',()=>{
 for(const collector of [collect('研究结果过大',{isError:false}),collect('Error: PERMISSION_DENIED 研究结果过大'),collect('Error: RESEARCH_RESULT_TOO_LARGE',{input:{...args,arguments_json:'{"token":"private"}'}})]){
  expect(collector.attempts.filter(x=>x.kind==='acquisition-overflow')).toEqual([])
  expect(componentAcquisitionFollowup([],{attempts:collector.attempts})).toBe('')
 }
})
it('keeps acquisition available during automatic recovery and passes the full failed cohort to the next child',async()=>{
 const {ResearchTaskRuntime}=await import('../packages/dsh-research-task-runtime/index.js'),calls=[]
 const receipt=collect('Error: 研究结果过大，请缩小基金范围、日期区间或分页查询。').attempts
 const runtime=new ResearchTaskRuntime({adapter:{start:async request=>{
  calls.push(request)
  return {childSessionId:'overflow-child-'+calls.length,dispose:async()=>{},result:Promise.resolve(calls.length===1?{stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,output:[],sourceAttempts:receipt}:{stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'table',title:'模拟恢复数据',columns:['代码','来源值'],rows:Array.from({length:12},(_,i)=>[String(i).padStart(6,'0'),i])})}]})}
 }},storage:{save:async()=>{}},createId:()=> 'overflow-task'})
 try{
  const task=await runtime.start({parentSessionId:'overflow-parent',canvasNodeId:'overflow-card',kind:'container',prompt:'工作台：范围不变的比较\n本面板：完整对象明细\n仅生成本面板，优先使用 table 类型。'})
  await runtime.tasks.get(task.taskId).runPromise
  expect(calls).toHaveLength(2);expect(calls[1].synthesisOnly).toBe(false)
  expect(calls[1].prompt).toContain('目标集合不变');expect(calls[1].prompt).toContain('000011')
  expect(calls[1].prompt).not.toContain('本轮是无工具的内容修复阶段')
  expect(runtime.inspect({parentSessionId:'overflow-parent',taskId:task.taskId}).state).toBe('completed')
 }finally{await runtime.dispose()}
})
it('retires an old capacity failure after the same request succeeds, without mistaking partial or different scopes as recovered',()=>{
 const attempts=collect('Error: RESEARCH_RESULT_TOO_LARGE').attempts
 const recovered={tool:'financial_query',args:structuredClone(args),response:{status:'complete',records:[{instrument:'000000',value:1}]}}
 expect(componentAcquisitionFollowup([recovered],{attempts})).toBe('')
 for(const response of [{status:'partial',records:[{instrument:'000000',value:1}]},{status:'complete',truncated:true,records:[{instrument:'000000',value:1}]},{status:'complete',records:[{instrument:'000000',value:1}],pagination:{possiblyMore:true,nextOffset:1}},{status:'unavailable',records:[]}])expect(componentAcquisitionFollowup([{...recovered,response}],{attempts})).toContain('超限')
})

it('retains only unresolved read calls skipped by a local acquisition deadline',()=>{
 const interrupted=collect('Error: tool call aborted before dispatch').attempts
 const received={tool:'financial_query',args:{...args,arguments_json:'{"fundCodes":["000021"]}'},response:{status:'complete',records:[{value:1}]}}
 const options={attempts:interrupted,acquisitionRequired:true,hasUsableData:true,resumeInterrupted:true}
 expect(componentAcquisitionFollowup([received],options)).toContain('000011')
 expect(componentAcquisitionFollowup([received],{...options,resumeInterrupted:false})).toBe('')
 expect(componentAcquisitionFollowup([{...received,args}],options)).toBe('')
 expect(collect('Error: cancelled by user').attempts).toEqual([])
 expect(collect('Error: tool call aborted before dispatch',{input:{...args,arguments_json:'{"token":"private"}'}}).attempts).toEqual([])
})

it('continues partial acquisition when a timed-out step never dispatches the remaining business reads',async()=>{
 const {ResearchTaskRuntime}=await import('../packages/dsh-research-task-runtime/index.js'),calls=[]
 const attempted=collect('Error: tool call aborted before dispatch').attempts
 const prior={tool:'financial_query',args:{...args,arguments_json:'{"fundCodes":["000021"]}'},response:{status:'complete',records:[{code:'000021',value:2}]}}
 const data={version:1,type:'table',title:'完整样本',columns:['代码','收益'],rows:Array.from({length:12},(_,i)=>[String(i).padStart(6,'0'),i])}
 const runtime=new ResearchTaskRuntime({adapter:{start:async request=>{
  calls.push(request)
  const result=calls.length===1?{stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,output:[],sourceRecords:[prior],sourceAttempts:attempted}:{stopReason:'completed',output:[{type:'text',text:JSON.stringify(data)}]}
  return {childSessionId:'interrupted-child-'+calls.length,dispose:async()=>{},result:Promise.resolve(result)}
 }},storage:{save:async()=>{}},createId:()=> 'interrupted-task'})
 try{
  const originalRequest='至少比较8只产品的收益'
  const task=await runtime.start({parentSessionId:'interrupted-parent',canvasNodeId:'interrupted-card',kind:'container',prompt:'工作台：真实数据比较\n本面板：至少8只产品的收益明细，读取真实业务数据。\n仅生成本面板，优先使用 table 类型。'},{workbenchRequest:{dataMode:'source',originalRequest},sourceRequirement:originalRequest,sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:originalRequest}})
  await runtime.tasks.get(task.taskId).runPromise
  expect(calls).toHaveLength(2)
  expect(calls[1].synthesisOnly).toBe(false)
  expect(calls[1].prompt).toContain('000011')
  expect(calls[1].retainedSourceRecords).toEqual([prior])
  expect(runtime.inspect({parentSessionId:'interrupted-parent',taskId:task.taskId}).state).toBe('completed')
 }finally{await runtime.dispose()}
})
