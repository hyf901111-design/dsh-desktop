import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {componentSourceInstruction} from '../packages/dsh-research-task-runtime/component-source-tools.js'
import {recoverObservedTable} from '../packages/dsh-research-task-runtime/observed-table-recovery.js'
import {publishResearchWorkbenchProgress,workbenchProgressState,requestResearchWorkbenchRetry,installResearchWorkbenchRetry} from '../scripts/lib/research-workbench-feedback.mjs'

// Only public source responses and the failed JSON are retained, without model
// reasoning, user credentials, or surrounding conversation.
const captured=JSON.parse(readFileSync(new URL('./fixtures/component-native-scalar-tables-20261108.json',import.meta.url),'utf8'))
it('discovers the latest actually filed Tushare period instead of guessing a quarter, while keeping explicit periods',()=>{
 const tools=[{name:'ework__query',description:'Tushare 金融数据查询'}]
 for(const planning of [false,true])expect(componentSourceInstruction(tools,'688981.SH 最近一期财务对比',new Date(),{planning})).toContain('不按日历猜 period')
 expect(componentSourceInstruction(tools,'688981.SH 2026年第三季度财报')).not.toContain('不按日历猜 period')
})
it.each(captured)('compiles the real $name table without another model request',({draft,draftText,records,name})=>{
 const original=structuredClone({draft,records})
 const result=resolveBoundComponent(draftText,records,new Date('2026-11-07T22:09:00Z'))
 expect(result.data.columns).toEqual(draft.mapping.columns.map(c=>c.label))
 expect(result.data.rows).toHaveLength(2)
 expect(result.data.rows.flat().every(c=>typeof c==='string'||typeof c==='number')).toBe(true)
 if(name==='semiconductor'){
  expect(result.data.rows[0].slice(5)).toEqual(Array(4).fill('本次未取得'))
  expect(result.data.rows[1][5]).toBe('31467092379.45')
 }else{
  expect(result.data.rows.map(r=>r[0])).toEqual(['600519.SH','000858.SZ'])
  expect(result.data.rows.map(r=>r[5])).toEqual(['18163.69','2924.4'])
 }
 expect({draft,records}).toEqual(original)
})

const mapping={version:1,type:'table',title:'单值字段',columns:[{key:'value',label:'真实值'}],rows:[{value:{$from:'q',$each:'records',$map:[{$path:'value'}]}}]}
it('retains zero and rejects distinct records instead of picking one or summing them',()=>{
 expect(materializeComponentMapping(mapping,{q:{records:[{value:0}]}}).rows).toEqual([['0']])
 expect(()=>materializeComponentMapping(mapping,{q:{records:[{value:1},{value:2}]}})).toThrow(/单值.*2/)
 expect(()=>materializeComponentMapping(mapping,{q:{records:[]}})).toThrow(/单值.*0/)
})
it('does not unwrap real multi-field tuples into a scalar column',()=>{
 const bad=structuredClone(mapping);bad.rows[0].value.$map.push({$path:'other'})
 expect(()=>materializeComponentMapping(bad,{q:{records:[{value:0,other:2}]}})).toThrow(/rows\[0\].*value|单元格/)
})

async function fallbackTask(originalRequest='创建一张来源数据表',policy,lostPresentation=false){
 const f=structuredClone(captured[0]);f.draft.mapping.columns[0].label={invalid:'label'}
 const start=vi.fn(async()=>({childSessionId:'table-recovery-'+start.mock.calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',sourceRecords:start.mock.calls.length===1?f.records:[],output:[{type:'text',text:lostPresentation?'最终JSON未能完成':JSON.stringify(f.draft)}]})}))
 let saved
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async document=>{saved=structuredClone(document)}},retryDelayMs:0})
 try{
  const receipt=await runtime.start({parentSessionId:'recovery',canvasNodeId:'table',kind:'container',prompt:'工作台：真实数据研究\n本面板：来源数据表\n保留已取得的真实数据和来源。\n优先使用 table 类型。'},{workbenchRequest:{originalRequest,dataMode:'source'},sourceRequirement:originalRequest,sourcePolicy:policy??{pluginRequired:false,pluginProhibited:false,preferenceRequest:originalRequest}})
  await runtime.tasks.get(receipt.taskId).runPromise
  return {task:runtime.inspect({parentSessionId:'recovery',taskId:receipt.taskId}),start,saved}
 }finally{await runtime.dispose()}
}
it('switches from a failed model repair to complete host-rendered source records',async()=>{
 const {task,start,saved}=await fallbackTask()
 expect(task.state,task.error).toBe('completed');expect(start).toHaveBeenCalledTimes(2)
 expect(task).toMatchObject({deliveryStatus:'partial',recoveryMode:'source-snapshot',unmetRequirements:['原定制呈现尚未完成']})
 const reloaded=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>saved,save:async()=>{}}})
 try{await reloaded.restore();expect(reloaded.inspect({parentSessionId:'recovery',taskId:task.taskId})).toMatchObject({deliveryStatus:'partial',recoveryMode:'source-snapshot'})}finally{await reloaded.dispose()}
 const output=JSON.parse(task.finalOutput)
 expect(output.type).toBe('html');expect(output.html).toContain('已切换为来源明细')
 expect(output.html).toContain('31467092379.45');expect(output.html).toContain('20261106')
 expect(output.html).toContain('94957074.777');expect(output.html).toContain('万元')
 expect(output.html).toContain('本次未返回记录');expect(output.html).toContain('自动更新未绑定')
 expect(output.html).not.toContain('<script>')
})
it('reports recovered source views separately and offers a fresh retry while retaining their content',async()=>{
 const {task}=await fallbackTask(),spec=JSON.parse(task.finalOutput),target=new EventTarget(),plans=[{id:'plan',count:1}]
 const node={id:'node',workbenchId:'plan',generationTaskId:task.taskId,generationStatus:'completed',containerSpec:spec}
 const snapshot=publishResearchWorkbenchProgress(target,'recovery',[node])
 const state=workbenchProgressState(plans,snapshot)
 expect(state).toMatchObject({phase:'partial',completed:0,partial:1,total:1,unknown:0})
 expect(state.detail).toContain('原功能未完成');expect(JSON.stringify(snapshot)).not.toContain('31467092379.45')
 const retry=vi.fn(async()=>{}),stop=installResearchWorkbenchRetry({eventTarget:target,sessionId:'recovery',getArtifacts:()=>[node],canRetry:()=>true,retry})
 try{expect(await requestResearchWorkbenchRetry(target,'recovery',plans,snapshot)).toBe(true);expect(retry).toHaveBeenCalledOnce();expect(node.containerSpec).toBe(spec)}finally{stop()}
})
it.each(['每分钟刷新','每5分钟刷新','手动刷新'])('does not bypass an explicit %s requirement',mode=>{
 const f=captured[0]
 expect(recoverObservedTable(f.records,{panelType:'table',originalRequest:'创建财务表，'+mode,draft:JSON.stringify(f.draft),error:'table.columns[0] 无效'})).toBeNull()
})
it.each(['请以K线展示这些数据','K线必须保留'])('does not let a model table plan override the original graphic requirement: %s',originalRequest=>{
 const f=captured[0]
 expect(recoverObservedTable(f.records,{panelType:'table',panelRequest:'模型错误规划的表格',originalRequest,draft:JSON.stringify(f.draft),error:'table.columns[0] 无效'})).toBeNull()
})
it('keeps structured units, source timestamps and partial-source omissions in the alternative view',()=>{
 const f=structuredClone(captured[0]);Object.assign(f.records[0].response,{unit:'亿元',currency:'CNY',asOf:'2026-09-30',status:'partial',missingFields:['profit']});f.records[0].response.fieldInfo.total_mv={label:'市值',unit:'万元'}
 const result=recoverObservedTable(f.records,{panelType:'table',draft:JSON.stringify(f.draft),error:'table.columns[0] 无效'})
 const html=JSON.parse(result.output).html
 for(const value of ['亿元','CNY','2026-09-30','partial','profit','万元'])expect(html).toContain(value)
 expect(result).toMatchObject({deliveryStatus:'partial'})
})
it('does not replace an explicitly requested interactive table with static source records',async()=>{
 const {task}=await fallbackTask('创建一张支持筛选和排序的数据表')
 expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined()
})
it('does not bypass a human prohibition on plugin sources',async()=>{
 const {task}=await fallbackTask('禁止使用插件，只使用网页',{pluginRequired:false,pluginProhibited:true,preferenceRequest:'禁止使用插件，只使用网页'})
 expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined()
})
it('does not replace a chart or turn wholly empty sources into a completed card',()=>{
 const f=structuredClone(captured[0]),options={panelType:'chart',draft:JSON.stringify(f.draft),error:'table.columns[0] 无效'}
 expect(recoverObservedTable(f.records,options)).toBeNull()
 for(const r of f.records)r.response.records=[]
 expect(recoverObservedTable(f.records,{...options,panelType:'table'})).toBeNull()
})
it('retains structured business responses on transport retry and only fetches remaining gaps',async()=>{
 const f=captured[1],calls=[]
 const runtime=new ResearchTaskRuntime({adapter:{start:async request=>{
  calls.push(request)
  if(calls.length===1)request.onSessionEvent({type:'turn/end',data:{reason:{kind:'error',error:{code:'RATE_LIMIT'}}}})
  return {childSessionId:'retained-'+calls.length,dispose:async()=>{},result:Promise.resolve(calls.length===1?{stopReason:'error',output:[],sourceRecords:f.records}:{stopReason:'completed',output:[{type:'text',text:f.draftText}]})}
 }},storage:{save:async()=>{}},retryDelayMs:0})
 try{
  const receipt=await runtime.start({parentSessionId:'retained',canvasNodeId:'table',kind:'container',prompt:'工作台：估值研究\n本面板：估值表\n使用真实数据，优先使用 table 类型。'})
  await runtime.tasks.get(receipt.taskId).runPromise
  const task=runtime.inspect({parentSessionId:'retained',taskId:receipt.taskId})
  expect(task.state,task.error).toBe('completed');expect(calls).toHaveLength(2)
  expect(calls[1].synthesisOnly).toBe(false)
  expect(calls[1].prompt).toContain('宿主已保留以下成功业务响应')
  expect(calls[1].prompt).toContain('不重复调用这些成功请求')
  expect(calls[1].prompt).toContain('更换可用来源')
  expect(calls[1].prompt).toContain('181636856.48')
 }finally{await runtime.dispose()}
})
it('uses owned successful source responses when the bounded repair loses the JSON presentation entirely',()=>{
 const f=structuredClone(captured[0]),options={panelType:'table',originalRequest:'创建普通财务数据表',draft:'最终JSON未能完成',error:'生成内容格式无效，自动恢复未完成。'}
 const result=recoverObservedTable(f.records,options)
 expect(result).toMatchObject({deliveryStatus:'partial',recoveryMode:'source-snapshot'})
 expect(JSON.parse(result.output).html).toContain('94957074.777')
 for(const originalRequest of ['按K线展示','创建可排序表格','财务表每5分钟刷新','只用Tushare来源'])expect(recoverObservedTable(f.records,{...options,originalRequest})).toBeNull()
 for(const error of ['来源单位冲突','日期不一致','权限不足','请求参数未匹配'])expect(recoverObservedTable(f.records,{...options,error})).toBeNull()
 for(const r of f.records)r.purpose='discovery'
 expect(recoverObservedTable(f.records,options)).toBeNull()
})

it('finishes malformed JSON recovery as partial after exactly one model repair',async()=>{
 const {task,start}=await fallbackTask('创建普通财务数据表',undefined,true)
 expect(start).toHaveBeenCalledTimes(2)
 expect(task).toMatchObject({state:'completed',deliveryStatus:'partial',recoveryMode:'source-snapshot'})
 expect(JSON.parse(task.finalOutput).html).toContain('94957074.777')
})
