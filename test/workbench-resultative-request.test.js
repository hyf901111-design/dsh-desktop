import {expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {componentCreationRequest} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import {workbenchCreationRequest,registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {classifyResearchCreationRequest} from '../scripts/lib/research-creation-progress.mjs'
const file='/Users/heyafeng/Downloads/指数运营工作台_v3_候选.html'
const original=pathToFileURL(file).href+' 你去根据这个原型文件，在研究看板上帮我把这个原型里的指数运营看板用工作台形式做出来'
const session=text=>({header:{},events:[{type:'user/message',data:{id:'user',role:'user',source:{kind:'user'},content:[{type:'text',text}]}}],append(type,data){this.events.push({type,data})}})
it.each([original,'帮我把这个原型里的客户留存看板做出来。','请把这个HTML转成一个研究工作台。','将原型还原成可使用的仪表盘。'])('admits authored resultative creation: %s',text=>{
 expect(componentCreationRequest(session(text))?.target).toBe('workbench')
 expect(workbenchCreationRequest(session(text))?.messageId).toBe('user')
 expect(classifyResearchCreationRequest(text)?.kind).toBe('workbench')
})
it.each(['不要把原型里的看板做出来，先读一下。','我已经把原型里的看板做出来了。','这个按原型做出来的看板是什么？','如何把原型里的看板做出来？','请修改当前工作台，按原型调整布局。','先不把这个HTML转成工作台。','请解释“把原型里的看板做出来”是什么意思。'])('does not authorize a new board: %s',text=>{
 expect(workbenchCreationRequest(session(text))).toBeNull()
 expect(classifyResearchCreationRequest(text)).toBeNull()
})
it('uses the original file read gate and bounded planning budget for the exact failed user wording',async()=>{
 const hooks=new Map(),s=session(original),agent={session:s};let guard
 const tools=[{name:'read',parameters:{type:'object',properties:{file_path:{type:'string'}}}},{name:'research_workbench_create',parameters:{type:'object',properties:{}}},{name:'bash',parameters:{}}]
 const dispose=registerWorkbenchExecutionPolicy({on:(name,fn)=>{hooks.set(name,fn);return()=>{}},systemPrompt:{context:()=>()=>{}},llm:{resolveModelInfo:async()=>({reasoning:{efforts:[{id:'low'},{id:'max'}]},defaultMaxTokens:16000})},tools:{schemas:()=>tools,guard:fn=>{guard=fn;return()=>{}}}})
 try{
  const opts=await hooks.get('agent/request')({agent},async()=>({provider:'qa',model:'qa',reasoningEffort:'max',maxTokens:16000}))
  expect(opts).toMatchObject({reasoningEffort:'low',maxTokens:4096})
  const wire=await hooks.get('agent/request-context')({agent},async()=>({system:'',messages:[s.events[0].data],tools}))
  expect(wire.tools.map(t=>t.name)).toEqual(['read','research_workbench_create'])
  expect(wire.tools[1].parameters.properties.dataMode.enum).toEqual(['source'])
  expect(wire.tools[1].description).toContain('不抄写全量记录')
  expect(wire.tools[0].parameters.properties.file_path.enum).toEqual([file])
  expect(guard({agent,name:'research_workbench_create',arguments:{},callId:'early'})).toContain('先读取')
 }finally{dispose()}
})
it('removes complete artifact routes from prototype planning without changing the shared tool definition',async()=>{
 const hooks=new Map(),s=session(original),agent={session:s};let prompt
 const panel={type:'object',properties:{title:{type:'string'},prompt:{type:'string'},type:{enum:['chart','html','view']},size:{type:'string'},layout:{type:'string'},artifact:{type:'object'},publicData:{type:'object'},view:{type:'object'}},required:['title','prompt']}
 const params={type:'object',properties:{title:{type:'string'},preset:{enum:['cn-hot-etf-live']},sharedDatasets:{type:'array'},panels:{type:'array',items:panel}}}
 const dispose=registerWorkbenchExecutionPolicy({on:(name,fn)=>{hooks.set(name,fn);return()=>{}},systemPrompt:{context:value=>{prompt=value;return()=>{}}},tools:{guard:()=>()=>{}}})
 try{
  const wire=await hooks.get('agent/request-context')({agent},async()=>({system:'base',messages:[s.events[0].data],tools:[{name:'research_workbench_create',parameters:params}]}))
  expect(Object.keys(wire.tools[0].parameters.properties.panels.items.properties)).toEqual(['title','prompt','type','size','layout'])
  expect(wire.tools[0].parameters.properties).not.toHaveProperty('preset')
  expect(wire.tools[0].parameters.properties.panels.items.additionalProperties).toBe(false)
  expect(wire.system).toContain('首次只提交')
  expect(wire.system).not.toContain('已有真实记录直接保留完整 artifact')
  expect(prompt.text({agent})).not.toContain('一次提供完整sharedDatasets')
  expect(prompt.text({agent})).toContain('独立组件会读取原型')
  expect(params.properties.panels.items.properties).toHaveProperty('artifact')
  expect(params.properties).toHaveProperty('preset')
 }finally{dispose()}
})
it('keeps explicit permission to generate new simulated data with a reference',async()=>{
 const hooks=new Map(),s=session(original+'，请使用新的模拟数据。'),agent={session:s}
 const params={type:'object',properties:{dataMode:{type:'string',enum:['source','simulated']}}},tools=[{name:'research_workbench_create',parameters:params}]
 const dispose=registerWorkbenchExecutionPolicy({on:(name,fn)=>{hooks.set(name,fn);return()=>{}},systemPrompt:{context:()=>()=>{}},tools:{schemas:()=>tools,guard:()=>()=>{}}})
 try{const wire=await hooks.get('agent/request-context')({agent},async()=>({system:'',messages:[s.events[0].data],tools}));expect(wire.tools[0].parameters).toBe(params)}finally{dispose()}
})
