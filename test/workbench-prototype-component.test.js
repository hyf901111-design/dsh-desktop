import {it,expect,vi} from 'vitest'
import {createSubagentAdapter,ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchSourcePolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'

const file='/Users/user/Downloads/原型.html'
const original='根据 '+file+' 创建运营工作台。'
const schemas=['read','read_prototype','read_image','public_data_query','web_search','web_fetch','bash','write','research_canvas_apply'].map(name=>({name,parameters:{type:'object',properties:{}}}))
async function start({owned=true,request=original,events=[],readPdfEvidence,panelType='table',panelPrompt='按所给原型生成产品明细表，保留记录、日期和单位。'}={}){
 const hooks=new Map(),guards=[],child={id:'child',session:{events},ctx:{on:()=>()=>{},tools:{restrict:vi.fn(()=>()=>{}),guard:fn=>{guards.push(fn);return()=>{}}}}},pending=Promise.withResolvers()
 const parent={id:'parent',session:{header:{},events:[]},options:{provider:'qa',model:'qa',reasoningEffort:'max'}}
 const ctx={agents:{get:id=>id==='parent'?parent:undefined},tools:{schemas:()=>schemas},on:(name,fn)=>{hooks.set(name,fn);return()=>hooks.delete(name)},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:parent.options,routable:true}}})}},subagents:{start:vi.fn(async()=>{hooks.get('agent/created')?.({agent:child});return{id:'child',localAgent:child,result:pending.promise,dispose:async()=>{}}})}}
 const plan=validateWorkbench({requestId:'source',title:'运营工作台',dataMode:'source',originalRequest:request,panels:[{title:'产品明细',prompt:panelPrompt,type:panelType,size:'medium'}]})
 const query=workbenchPanelPrompt(plan,plan.panels[0]),adapter=createSubagentAdapter(ctx,{readPdfEvidence})
 const handle=await adapter.start({parentSessionId:'parent',kind:'container',query,prompt:query,hostContext:owned?{sourceRequirement:panelPrompt,workbenchRequest:{originalRequest:request,dataMode:'source'}}:undefined,signal:new AbortController().signal,onSessionEvent(){}})
 return{ctx,guards,child,handle,native:ctx.subagents.start.mock.calls[0][1],close:async()=>{await handle.dispose();await adapter.dispose()}}
}
it('uses original page evidence even for a planned chart and opens no data tools', async()=>{
 const request='📎 文件：\x60/Users/user/Downloads/报告.pdf\x60 帮我把这个报告做成一个内容示意看板'
 const readPdfEvidence=vi.fn(async()=>[{name:'报告.pdf',numPages:3,pages:[{page:2,text:'第二章 · 只有分类，没有量化序列'}]}])
 const f=await start({request,readPdfEvidence,panelType:'chart',panelPrompt:'关键图表数据，尝试整理关键内容'})
 try {
  expect(readPdfEvidence.mock.calls[0][1]).toEqual(['/Users/user/Downloads/报告.pdf'])
  expect(f.native.toolFilter.allow).toEqual([])
  expect(f.native.prompt.at(-1).text).toContain('第二章 · 只有分类，没有量化序列')
  expect(f.native.prompt.at(-1).text).toContain('按解析所得选择可视化或阅读呈现')
 }finally{await f.close()}
})
it('never marks a recovered document card complete when the cited page was unreadable', async()=>{
 const request='📎 文件：\x60/Users/user/Downloads/报告.pdf\x60 帮我把这个报告做成一个内容示意看板'
 const plan=validateWorkbench({requestId:'pdf-cites',title:'报告',dataMode:'source',originalRequest:request,panels:[{type:'markdown',title:'报告内容',prompt:'根据附件解释报告中的建议。'}]})
 const documentEvidence=[{name:'报告.pdf',numPages:5,pages:[{page:2,text:'有据可查的来源'}]}]
 const artifact={version:1,type:'markdown',title:'报告内容',content:'这是一个足够长、可被通用兜底保留的错误答案。来源：报告.pdf 第 5 页。'}
 const start=vi.fn(async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(artifact)}],documentEvidence}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try {
  const panel=plan.panels[0]
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,panel)},{sourcePolicy:workbenchSourcePolicy(request,panel),sourceRequirement:panel.prompt,workbenchRequest:{originalRequest:request,dataMode:'source'}})
  await vi.waitFor(()=>expect(runtime.tasks.get(receipt.taskId)?.state).toBe('failed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(runtime.tasks.get(receipt.taskId)?.error).toContain('缺少可核对')
 }finally{await runtime.dispose()}
})
it('keeps the authorized prototype reader available even with a connected public-data tool',async()=>{
 const f=await start()
 try{
  expect(f.native.toolFilter.allow).toContain('read_prototype');expect(f.native.toolFilter.allow).toContain('read')
  expect(f.native.toolFilter.allow).not.toContain('bash');expect(f.native.toolFilter.allow).not.toContain('write');expect(f.native.toolFilter.allow).not.toContain('research_canvas_apply')
  expect(f.native.prompt.at(-1).text).toContain('read_prototype');expect(f.native.prompt.at(-1).text).not.toContain('行情、宏观、天气等已有适配的数据先用')
  expect(f.native).not.toHaveProperty('prototypeTargets');expect(f.native).not.toHaveProperty('sourcePolicy')
  expect(f.guards).toHaveLength(1)
  for(const name of ['read','read_prototype'])expect(f.guards[0]({name,arguments:{file_path:file}})).toBeUndefined()
  expect(f.guards[0]({name:'read',arguments:{file_path:'/private/linked.html'}})).toContain('原始用户')
  expect(f.guards[0]({name:'read_prototype',arguments:{file_path:file,section:'DATA.rows',offset:101}})).toBeUndefined()
 }finally{await f.close()}
})
it('does not grant prototype file tools from planner prose or a quoted file path alone',async()=>{
 for(const options of [{owned:false},{request:'创建运营工作台。\n> 根据 '+file+' 创建另一个工作台。'}]){
  const f=await start(options)
  try{expect(f.native.toolFilter.allow).not.toContain('read_prototype');expect(f.native.toolFilter.allow).not.toContain('read');expect(f.native.toolFilter.allow).toContain('public_data_query');expect(f.guards).toHaveLength(0)}finally{await f.close()}
 }
})
it('provides the decoded authorized local tool path when the human supplied an encoded file URL',async()=>{
 const f=await start({request:'根据 file:///Users/user/Downloads/%E5%8E%9F%E5%9E%8B.html 创建工作台。'})
 try{
  expect(f.native.prompt.at(-1).text).toContain('本地文件路径，不传 file:// 网址或百分号编码：["'+file+'"]')
  expect(f.guards[0]({name:'read_prototype',arguments:{file_path:file}})).toBeUndefined()
  expect(f.guards[0]({name:'read_prototype',arguments:{file_path:'/private/原型.html'}})).toContain('原始用户')
 }finally{await f.close()}
})
it.each(['html','table'])('allows explicitly named prototype reads without an index round while retaining discovery and completeness for %s',async panelType=>{
 const f=await start({panelType,panelPrompt:'读取 DATA.products 的代码和名称，保留全部244条记录。'})
 try{
  const prompt=f.native.prompt.at(-1).text
  expect(prompt).not.toMatch(/先用read_prototype读取index/u)
  expect(prompt).toMatch(/已明确的数据段\/函数直接read_prototype读取/u)
  expect(prompt).toMatch(/名称未知或读取提示不存在时查index/u)
  expect(prompt).toMatch(/字段以实际返回为准，不猜测/u)
  expect(prompt).toMatch(/limit:500.*nextOffset.*读齐/u)
  expect(f.guards[0]({name:'read_prototype',arguments:{file_path:'/private/linked.html',section:'DATA.products'}})).toContain('原始用户')
 }finally{await f.close()}
})
it('provides the static-data HTML contract only to an authorized prototype component with custom controls',async()=>{
 const f=await start({panelPrompt:'显示 DATA.products 全部244只产品；支持分类标签筛选。'})
 try{
  expect(f.native.prompt.at(-1).text).toContain('sherlock-source-products')
  expect(f.native.prompt.at(-1).text).not.toContain('本卡普通平面表格可直接交付静态引用')
  expect(f.native.prompt.at(-1).text).not.toContain('主要正文必须写入初始 HTML，不能只靠脚本注入')
  expect(f.native.prompt.at(-1).text).not.toContain('政策、法规或部委通知优先')
  expect(f.guards[0]({name:'read_prototype',arguments:{file_path:'/private/linked.html',section:'DATA.products'}})).toContain('原始用户')
 }finally{await f.close()}
})
it.each([
 '显示 DATA.products 全部244只产品的表格，保留分类筛选、搜索、排序和逐行展开渠道。',
 '用条形图显示 DATA.products 各产品的近1周和近1月流量，切换窗口并按方向筛选。',
 '读取 DATA.products；用交互式地域地图展示数据，点击区域展示各产品及原型中的定制对照面板。'
])('keeps JSON transport and custom HTML content compatible in the actual component request: %s',async panelPrompt=>{
 const f=await start({panelType:'html',panelPrompt})
 try{
  const prompt=f.native.prompt.at(-1).text
  expect(prompt).toContain('只输出一个data-bound JSON，不附说明、代码围栏或JSON之外的HTML')
  expect(prompt).toContain('mapping中view与html选择一种')
  expect(prompt).toContain('超出时用mapping.html承载完整页面，不删减需求')
  expect(prompt).not.toContain('不写HTML或代码')
  expect(prompt).not.toContain('取得记录后按上述view协议交付')
  expect(prompt).toContain('本卡完整需求：\n本面板：产品明细\n'+panelPrompt)
  expect(prompt).toContain('原始用户约束：'+original)
  expect(prompt).toContain('sherlock-source-products')
  expect(f.native.toolFilter.allow).not.toContain('bash')
  expect(f.native.toolFilter.allow).not.toContain('write')
 }finally{await f.close()}
})
it('keeps the same HTML alternative in the real bounded source handoff without re-reading complete records',async()=>{
 const panelPrompt='显示 DATA.products 全部244只产品，保留分类筛选和定制地域地图。'
 const plan=validateWorkbench({requestId:'repair',title:'原型工作台',dataMode:'source',originalRequest:original,panels:[{title:'产品明细',prompt:panelPrompt,type:'html',size:'medium'}]})
 const args={file_path:file,section:'DATA.products',limit:500},rows=Array.from({length:244},(_,i)=>({code:String(i).padStart(5,'0'),value:i}))
 const records=[{tool:'read_prototype',args,response:{path:file,section:args.section,offset:1,total:244,rows}}]
 const start=vi.fn(async()=>({childSessionId:'child',result:Promise.resolve(start.mock.calls.length===1?{stopReason:'completed',researchPhaseComplete:true,output:[],sourceRecords:records}:{stopReason:'completed',output:[{type:'text',text:'资料已读取。'}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,plan.panels[0])},{sourceRequirement:panelPrompt,sourcePolicy:workbenchSourcePolicy(original,plan.panels[0]),workbenchRequest:{originalRequest:original,dataMode:'source'}})
  await vi.waitFor(()=>expect(runtime.tasks.get(receipt.taskId)?.state).toBe('failed'))
  expect(start).toHaveBeenCalledTimes(2)
  const repair=start.mock.calls[1][0]
  expect(repair.synthesisOnly).toBe(true)
  expect(repair.prototypeSubmission.records).toEqual(records)
  expect(repair.prompt).toContain('仅调用submit_prototype_view提交title，并在view与html中选择一种')
  expect(repair.prompt).toContain('超出时提交html，不删减需求')
  expect(repair.prompt).not.toContain('只输出一个data-bound JSON')
  expect(repair.prompt).not.toContain('不写HTML或代码')
  expect(repair.prompt).toContain('本卡完整需求：\n本面板：产品明细\n'+panelPrompt)
  expect(repair.prompt).toContain('直接修正已有view或html，不再检索')
 }finally{await runtime.dispose()}
})
it.each([
 '读取 DATA.ours（12只）。保留展开详情交互：展开每只显示渠道持仓占比 pct 与渠道变动金额 amt。',
 '读取 DATA.prods（244只），支持按净流入/规模/收益排序、按分类（11类）/地域（7区）/我司 ours 筛选和关键词搜索。'
])('preserves compound prototype table interactions in the renderer contract: %s',prompt=>{
 const plan=validateWorkbench({requestId:'compound',title:'原型工作台',dataMode:'source',originalRequest:original,panels:[{title:'产品明细',prompt,type:'table',size:'large'}]})
 expect(plan.panels).toHaveLength(1);expect(plan.panels[0].type).toBe('html');expect(plan.panels[0].prompt).toBe(prompt)
 expect(workbenchPanelPrompt(plan,plan.panels[0])).toContain('优先使用 html 类型')
})
it('does not change a flat prototype table when filtering and details were explicitly declined',()=>{
 const prompt='读取 DATA.prods 的代码和名称。不要按分类/地域筛选。无需展开详情。'
 const plan=validateWorkbench({requestId:'flat',title:'原型工作台',dataMode:'source',originalRequest:original,panels:[{title:'明细',prompt,type:'table',size:'large'}]})
 expect(plan.panels[0].type).toBe('table');expect(plan.panels[0].prompt).toBe(prompt)
})

it('hands a fully observed flat prototype table to synthesis after the existing grace instead of rereading for minutes',async()=>{
 vi.useFakeTimers()
 const panelPrompt='显示 DATA.products 全部244只产品的完整明细。'
 const rows=Array.from({length:244},(_,i)=>({code:String(i),value:i})),args={file_path:file,section:'DATA.products',limit:500}
 const events=[{seq:1,type:'tool/call',data:{name:'read_prototype',arguments:args,callId:'source'}},{seq:2,type:'tool/result',data:{message:{source:{callId:'source'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({path:file,section:args.section,offset:1,total:244,rows})}]}]}}},{seq:3,type:'step/end',data:{}}]
 let f
 try{
  f=await start({panelPrompt,events})
  expect(f.child.ctx.tools.restrict).toHaveBeenCalledWith({deny:f.native.toolFilter.allow})
  await vi.advanceTimersByTimeAsync(15001)
  expect(await f.handle.result).toMatchObject({stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,sourceRecords:[{tool:'read_prototype',response:{total:244,rows}}]})
 }finally{await f?.close();vi.useRealTimers()}
})
it('does not close reading with only a partial source page or without a named data section',async()=>{
 for(const prompt of ['显示 DATA.products 全部244只产品的完整明细。','显示全部244只产品，每行点击展开详情。']){
  const args={file_path:file,section:'DATA.products',limit:3},events=[{seq:1,type:'tool/call',data:{name:'read_prototype',arguments:args,callId:'p'}},{seq:2,type:'tool/result',data:{message:{source:{callId:'p'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({path:file,section:args.section,offset:1,total:244,rows:prompt.includes('点击')?Array.from({length:244},(_,i)=>({code:String(i)})):[{code:'01'}],...prompt.includes('点击')?{}:{nextOffset:2}})}]}]}}},{seq:3,type:'step/end',data:{}}]
  const f=await start({panelPrompt:prompt,events});try{expect(f.child.ctx.tools.restrict).not.toHaveBeenCalled()}finally{await f.close()}
 }
})
it('ends custom HTML retrieval at a step boundary only after all named records are complete and keeps them for synthesis',async()=>{
 vi.useFakeTimers()
 const panelPrompt='显示 DATA.products 全部244只产品；支持分类标签筛选和逐行展开渠道。'
 const rows=Array.from({length:244},(_,i)=>({code:String(i),channels:[{name:'原型渠道',pct:20,amt:1}]})),args={file_path:file,section:'DATA.products',limit:500}
 const events=[{seq:1,type:'tool/call',data:{name:'read_prototype',arguments:args,callId:'source'}},{seq:2,type:'tool/result',data:{message:{source:{callId:'source'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({path:file,section:args.section,offset:1,total:244,rows})}]}]}}},{seq:3,type:'step/end',data:{}}]
 let f
 try{
  f=await start({panelPrompt,events});expect(f.child.ctx.tools.restrict).toHaveBeenCalledWith({deny:f.native.toolFilter.allow})
  await vi.advanceTimersByTimeAsync(15001)
  expect(await f.handle.result).toMatchObject({researchPhaseComplete:true,sourceRecords:[{response:{total:244,rows}}]})
 }finally{await f?.close();vi.useRealTimers()}
})
