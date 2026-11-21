import {expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {readFileSync} from 'node:fs'
import {componentCreationRequest} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import {workbenchCreationRequest,registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {registerCanvasUseTool} from '../packages/dsh-research-task-runtime/canvas-use-tools.js'
import {classifyResearchCreationRequest} from '../scripts/lib/research-creation-progress.mjs'
const file='/Users/heyafeng/Downloads/指数运营工作台_v3_候选.html'
const original=pathToFileURL(file).href+' 你去根据这个原型文件，在研究看板上帮我把这个原型里的指数运营看板用工作台形式做出来'
const session=text=>({header:{},events:[{type:'user/message',data:{id:'user',role:'user',source:{kind:'user'},content:[{type:'text',text}]}}],append(type,data){this.events.push({type,data})}})
it('plans a disclosure placed on the research board and reserves blank drafts for manual requests', async () => {
 const text='我是这只 ETF 的估值核算员，收盘后要照着季报和托管系统逐笔勾稽。请把下面五笔持仓整理到研究看板，我打开就按披露顺序从第一笔核到第五笔。每笔要对得上序号、代码、名称、股数、公允价值和占基金净值比例。\n1\t300750\t宁德时代\t31173566\t11448803849.16\t3.81'
 const s=session(text)
 s.events[0].data.source.clientMode='research'
 expect(workbenchCreationRequest(s)).toMatchObject({target:'workbench',researchComposer:true})
 expect(classifyResearchCreationRequest('请把这张卡片放到研究看板','research')).toBeNull()
 expect(classifyResearchCreationRequest('如果把五笔持仓整理到研究看板会怎样？','research')).toBeNull()
 expect(classifyResearchCreationRequest('请用智能容器展示宁德时代持仓','manual-container')).toBe(true)
 expect(classifyResearchCreationRequest('Please create a blank smart container','manual-container')).toBe(true)
 expect(classifyResearchCreationRequest('请不要使用智能容器','manual-container')).toBe(false)
 let tool
 registerCanvasUseTool({tools:{register(value){tool=value}}})
 await expect(tool.execute({op:'create',args:JSON.stringify({kind:'component'})},{agent:{session:s}}))
   .rejects.toThrow('research_workbench_create')
})
it.each(['弄个美元兑人民币的看板。','帮我弄个一周待办看板。','请帮我搞个项目进度工作台','来个天气看板'])('routes a short spoken request through both canvas entry points: %s',text=>{
 expect(classifyResearchCreationRequest(text)).toMatchObject({kind:'workbench',request:text})
 expect(workbenchCreationRequest(session(text))?.target).toBe('workbench')
 expect(componentCreationRequest(session(text))?.target).toBe('workbench')
})
it.each(['别给我弄个看板','给我别弄个新看板','我刚弄了个看板','如何弄个看板？','他说“帮我弄个看板”','把这个看板弄得清楚点','帮我弄个看板的截图','来个看板的链接'])('keeps non-creation uses out of the planner: %s',text=>{
 expect(classifyResearchCreationRequest(text)).toBeNull()
 expect(workbenchCreationRequest(session(text))).toBeNull()
})
const publicTableRequests=JSON.parse(readFileSync(new URL('./fixtures/workbench-public-table-requests.json',import.meta.url),'utf8'))
const layoutRequests=JSON.parse(readFileSync(new URL('./fixtures/workbench-layout-delivery-requests.json',import.meta.url),'utf8'))
it.each(Object.entries(layoutRequests))('keeps a specifically named research destination outside the research composer: %s',(_name,text)=>{
 expect(classifyResearchCreationRequest(text)?.kind).toBe('workbench')
 expect(workbenchCreationRequest(session(text))?.target).toBe('workbench')
})
it('keeps a note without a board destination in its active workspace',()=>{
 expect(classifyResearchCreationRequest('留一张交接便签')).toBeNull()
 expect(workbenchCreationRequest(session('给个人笔记留一张交接便签'))).toBeNull()
})
it.each(Object.entries(publicTableRequests))('plans the entire board from the published %s data in the original request',(_role,text)=>{
 expect(classifyResearchCreationRequest(text)?.kind).toBe('workbench')
 expect(workbenchCreationRequest(session(text))).toMatchObject({target:'workbench',text})
})
it.each(['请按这份台账建一张研究看板','使用所附数据建风险研究工作台','依据这份报告建经营看板','根据所附文件建经营看板'])('recognizes an imperative with a named source: %s',text=>{
 expect(workbenchCreationRequest(session(text))?.target).toBe('workbench')
})
it.each(['不要仅用所附原表建工作台','请解释“仅用所附原表建工作台”的含义','他说“请按这份台账建一张研究看板”','如何用原表建工作台？','用原表建工作台的截图在哪里？','请只做一张原生折线卡','给我做一张可交互网页'])('keeps other destinations or quoted instructions out of workbench planning: %s',text=>{
 expect(workbenchCreationRequest(session(text))).toBeNull()
})
it('rejects a planning placeholder before it can become a durable receipt',()=>{
 const base={requestId:'report',title:'报告工作台',dataMode:'source'}
 expect(()=>validateWorkbench({...base,panels:[{title:'占位',prompt:'占位',type:'markdown'}]})).toThrow('面板只有占位文字')
 expect(validateWorkbench({...base,panels:[{title:'核心判断',prompt:'提取报告原文的核心判断和页码',type:'markdown'}]}).panels).toHaveLength(1)
})
it.each([original,'帮我把这个原型里的客户留存看板做出来。','请把这个HTML转成一个研究工作台。','将原型还原成可使用的仪表盘。'])('admits authored resultative creation: %s',text=>{
 expect(componentCreationRequest(session(text))?.target).toBe('workbench')
 expect(workbenchCreationRequest(session(text))?.messageId).toBe('user')
 expect(classifyResearchCreationRequest(text)?.kind).toBe('workbench')
})
it.each(['不要把原型里的看板做出来，先读一下。','我已经把原型里的看板做出来了。','这个按原型做出来的看板是什么？','这个做出来的图表是什么？','刚才做出来的工作台有哪些内容？','如何把原型里的看板做出来？','请修改当前工作台，按原型调整布局。','先不把这个HTML转成工作台。','请解释“把原型里的看板做出来”是什么意思。'])('does not authorize a new board: %s',text=>{
 expect(workbenchCreationRequest(session(text))).toBeNull()
 expect(classifyResearchCreationRequest(text)).toBeNull()
})
it('still recognizes a separate creation after a question about an existing result',()=>{
 expect(workbenchCreationRequest(session('这个按原型做出来的看板是什么？另外创建一个活动工作台。'))?.target).toBe('workbench')
})
it('uses the original file read gate and selected model budget for the exact failed user wording',async()=>{
 const hooks=new Map(),s=session(original),agent={session:s};let guard
 const tools=[{name:'read',parameters:{type:'object',properties:{file_path:{type:'string'}}}},{name:'research_workbench_create',parameters:{type:'object',properties:{}}},{name:'bash',parameters:{}}]
 const dispose=registerWorkbenchExecutionPolicy({on:(name,fn)=>{hooks.set(name,fn);return()=>{}},systemPrompt:{context:()=>()=>{}},llm:{resolveModelInfo:async()=>({reasoning:{efforts:[{id:'low'},{id:'max'}]},defaultMaxTokens:16000})},tools:{schemas:()=>tools,guard:fn=>{guard=fn;return()=>{}}}})
 try{
  const opts=await hooks.get('agent/request')({agent},async()=>({provider:'qa',model:'qa',reasoningEffort:'max',maxTokens:16000}))
  expect(opts).toMatchObject({reasoningEffort:'max',maxTokens:16000})
  const wire=await hooks.get('agent/request-context')({agent},async()=>({system:'',messages:[s.events[0].data],tools}))
  expect(wire.tools.map(t=>t.name)).toEqual(['read','research_workbench_create'])
  expect(wire.tools[1].parameters.properties.dataMode.enum).toEqual(['source'])
  expect(wire.tools[1].description).toContain('已解析的真实正文')
  expect(wire.tools[0].parameters.properties.file_path.enum).toEqual([file])
  expect(guard({agent,name:'research_workbench_create',arguments:{},callId:'early'})).toContain('先读取')
 }finally{dispose()}
})
it('retains parsed content and artifact routes in prototype planning without changing the shared tool definition',async()=>{
 const hooks=new Map(),s=session(original),agent={session:s};let prompt
 const panel={type:'object',properties:{title:{type:'string'},prompt:{type:'string'},type:{enum:['chart','html','view']},size:{type:'string'},layout:{type:'string'},artifact:{type:'object'},content:{type:'object'},publicData:{type:'object'},view:{type:'object'}},required:['title','prompt']}
 const params={type:'object',properties:{title:{type:'string'},preset:{enum:['cn-hot-etf-live']},sharedDatasets:{type:'array'},panels:{type:'array',items:panel}}}
 const dispose=registerWorkbenchExecutionPolicy({on:(name,fn)=>{hooks.set(name,fn);return()=>{}},systemPrompt:{context:value=>{prompt=value;return()=>{}}},tools:{guard:()=>()=>{}}})
 try{
  const wire=await hooks.get('agent/request-context')({agent},async()=>({system:'base',messages:[s.events[0].data],tools:[{name:'research_workbench_create',parameters:params}]}))
  expect(Object.keys(wire.tools[0].parameters.properties.panels.items.properties)).toEqual(['title','prompt','type','size','layout','artifact','content','view'])
  expect(wire.tools[0].parameters.properties).not.toHaveProperty('preset')
  expect(wire.tools[0].parameters.properties.panels.items.additionalProperties).toBe(false)
  expect(wire.system).toContain('已解析的真实正文')
  expect(wire.tools[0].parameters.properties).toHaveProperty('sharedDatasets')
  expect(wire.system).not.toContain('已有真实记录直接保留完整 artifact')
  expect(prompt.text({agent})).not.toContain('一次提供完整sharedDatasets')
  expect(prompt.text({agent})).toContain('多卡复用同一份数据')
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

it('识别无量词的搭工作台请求，保留只读与否定句',()=>{
 expect(classifyResearchCreationRequest('帮我根据成交台账搭工作台。')).toMatchObject({kind:'workbench'})
 expect(classifyResearchCreationRequest('怎么根据成交台账搭工作台？')).toBeNull()
 expect(classifyResearchCreationRequest('不要根据成交台账搭工作台。')).toBeNull()
})

it('识别客户端在句末追加原型附件的同一用户请求',()=>{
 const attached='你去根据这个原型文件，在研究看板上帮我把这个原型里的指数运营看板用工作台形式做出来📎 文件：`'+file+'`'
 expect(workbenchCreationRequest(session(attached))?.target).toBe('workbench')
 expect(workbenchCreationRequest(session(attached))?.text).toContain(file)
})
