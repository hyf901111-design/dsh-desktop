import {describe,it,expect,vi} from 'vitest'
import {registerWorkbenchExecutionPolicy,workbenchCreationRequest} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {SPREADSHEET_QUICK_PROMPTS} from '../packages/dsh-research-task-runtime/spreadsheet-quick-prompts.js'
import {PANEL_COLOR_INSTRUCTION,designPolicyIssue} from '../packages/dsh-research-task-runtime/design-policy.js'
const policy=await import('../packages/dsh-research-task-runtime/conversation-components-policy.js').catch(()=>null)
const session=text=>({id:'s',header:{},events:[{type:'turn/start',data:{turn:'1'}},{type:'user/message',seq:2,data:{id:'human',source:{kind:'user'},content:[{type:'text',text}]}}]})
const catalog=(s,mode,{callId='catalog-1',error=false,resultCallId=callId}={})=>s.events.push({type:'tool/call',data:{name:'client_capabilities',callId,arguments:'{}'}},{type:'tool/result',data:{message:{source:{kind:'tool',callId:resultCallId},content:[{type:'tool-result',isError:error,content:[{type:'text',text:JSON.stringify({mode,capabilities:[]})}]}]}}})
const schemas=[{name:'research_workbench_create',parameters:{type:'object',properties:{panels:{type:'array'}},required:['panels']}},{name:'client_capabilities'},{name:'client_action'},{name:'public_data_query',parameters:{properties:{operation:{enum:['catalog','query']}}}},{name:'financial_query',parameters:{properties:{intent:{enum:['resolve','catalog','research']}}}},{name:'run_code'},{name:'read_file'},{name:'Bash'}]
function harness(s){
 expect(policy,'conversation policy 尚未实现').not.toBeNull()
 const prompts=[],hooks=new Map(),guards=[],startSubagent=vi.fn(),agent={session:s,steer:vi.fn()}
 const ctx={tools:{schemas:()=>schemas,guard:fn=>{guards.push(fn);return()=>{}}},systemPrompt:{context:v=>{prompts.push(v);return()=>{}}},llm:{resolveModelInfo:vi.fn(async()=>({reasoning:{efforts:[{id:'low'},{id:'high'}]},defaultMaxTokens:16000}))},on:(name,fn)=>{hooks.set(name,[...(hooks.get(name)||[]),fn]);return()=>{}},startSubagent}
 const disposeWorkbench=registerWorkbenchExecutionPolicy(ctx),disposeConversation=policy.registerConversationComponentsPolicy(ctx)
 const invoke=async(name,value)=>{const run=(hooks.get(name)||[]).reduceRight((next,fn)=>()=>fn({agent},next),async()=>value);return run()}
 return{agent,ctx,guards,startSubagent,stop:()=>hooks.get('agent/turn-stopping').forEach(fn=>fn({agent,turn:1})),prompt:()=>prompts.map(v=>v.text({agent})).filter(Boolean).join('\n'),config:()=>invoke('agent/request',{provider:'zai',model:'test',reasoningEffort:'high',maxTokens:16000}),wire:()=>invoke('agent/request-context',{system:'base',tools:schemas}),dispose:()=>{disposeConversation();disposeWorkbench()}}
}
describe('direct conversation component routing',()=>{
 it.each(['给一个6人团队做新品上线协作工作台，用模拟数据。只要三张卡，跨卡用同一批12项任务。','请做跨部门交付看板','为客服团队做工单分析工作台'])('preserves the selected budget and creation path for a natural unquantified build request: %s',async text=>{
  const s=session(text),h=harness(s)
  try{
   expect(workbenchCreationRequest(s)?.text).toBe(text)
   expect((await h.wire()).tools.map(tool=>tool.name)).toContain('research_workbench_create')
   expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000})
  }finally{h.dispose()}
 })
 it.each(['不要做新品上线协作工作台','已经做新品上线协作工作台了，看看当前状态','怎么做新品上线协作工作台？','引用原文：“请做新品上线协作工作台”。只解释其含义。','继续修改现有的新品上线协作工作台'])('does not create a canvas for a negated, historical, quoted or existing-only request: %s',text=>{
  expect(workbenchCreationRequest(session(text))).toBeNull()
 })
 it('requires current catalog for bare components without planning cap or hiding data tools',async()=>{
  const s=session('创建一张模拟数据表格组件'),h=harness(s)
  expect(workbenchCreationRequest(s)).toBeNull();expect(policy.latestClientModeForAuthority(s)).toBeNull()
  expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000});expect(h.ctx.llm.resolveModelInfo).not.toHaveBeenCalled()
  const wire=await h.wire();expect(wire.tools.map(v=>v.name)).toEqual(schemas.filter(v=>v.name!=='research_workbench_create').map(v=>v.name))
  expect(h.prompt()).toContain('client_capabilities');expect(h.prompt()).not.toContain('先规划再取数')
  expect(h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'wrong'})).filter(Boolean).join()).toContain('client_capabilities')
  h.dispose()
 })
 it('conversation retains full artifact budget and directly submits on the main agent',async()=>{
  const s=session('创建两个表格和图表组件'),h=harness(s);catalog(s,'conversation')
  expect(policy.latestClientModeForAuthority(s)).toBe('conversation');expect(workbenchCreationRequest(s)).toBeNull()
  expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000})
  expect((await h.wire()).tools.map(v=>v.name)).toContain('financial_query')
  expect(h.prompt()).toContain('conversation.components.create');expect(h.prompt()).toContain('完整');expect(h.prompt()).toContain('场外基金')
  expect(h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'wrong'})).filter(Boolean).join()).toContain('conversation.components.create')
  expect(h.guards.map(fn=>fn({agent:h.agent,name:'client_action',arguments:{capability:'conversation.components.create'},callId:'create'})).filter(Boolean)).toEqual([])
  expect(h.startSubagent).not.toHaveBeenCalled();h.dispose()
 })
 it('research keeps its existing planning route and budget while notes keeps its capability',async()=>{
  const s=session('创建一个模拟柱状图组件');catalog(s,'research');const h=harness(s)
  expect(workbenchCreationRequest(s)?.text).toContain('柱状图');expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000})
  expect((await h.wire()).tools.map(v=>v.name)).toEqual(schemas.map(v=>v.name));h.dispose()
  const n=session('创建一个表格组件');catalog(n,'notes');const notes=harness(n)
  expect(workbenchCreationRequest(n)).toBeNull();expect(await notes.config()).toMatchObject({maxTokens:16000})
  expect(notes.prompt()).toContain('notes.components.create');expect(notes.prompt()).not.toContain('capability:"conversation.components.create"');notes.dispose()
 })
 it.each(['conversation','research','notes'])('explicit workbench preserves research planning in %s',async mode=>{
  const s=session('创建一个股票研究工作台');catalog(s,mode);const h=harness(s)
  expect(workbenchCreationRequest(s)).not.toBeNull();expect(await h.config()).toMatchObject({maxTokens:16000})
  expect((await h.wire()).tools.map(v=>v.name)).toContain('research_workbench_create');h.dispose()
 })
 it('ordinary quote questions can choose a native card without entering planning',async()=>{
  const s=session('查询宁德时代当前股价和行情');catalog(s,'conversation');const h=harness(s)
  expect(workbenchCreationRequest(s)).toBeNull();expect(await h.config()).toMatchObject({maxTokens:16000})
  expect(h.prompt()).toContain('financial-widget.quote');expect((await h.wire()).tools.map(v=>v.name)).toContain('public_data_query');h.dispose()
 })
 it('accepts only a matching successful current-authority catalog tool receipt',()=>{
  expect(policy).not.toBeNull()
  for(const change of ['old','assistant','wrong-call','failed','steering','new-turn']){
   const s=session('创建表格组件')
   if(change==='old')catalog(s,'research')
   if(change==='old')s.events.push({type:'user/message',data:{id:'next',source:{kind:'user'},content:[{type:'text',text:'创建另一个组件'}]}})
   if(change==='assistant')s.events.push({type:'assistant/message',data:{content:[{type:'text',text:JSON.stringify({mode:'research',capabilities:[]})}]}})
   if(change==='wrong-call')catalog(s,'research',{resultCallId:'other'})
   if(change==='failed')catalog(s,'research',{error:true})
   if(change==='steering'){catalog(s,'research');s.events.push({type:'agent/inbox/spliced',data:{inserted:[{id:'steer',source:{kind:'user'},content:[{type:'text',text:'创建另一个组件'}]}]}})}
   if(change==='new-turn'){catalog(s,'research');s.events.push({type:'turn/start',data:{turn:'2'}})}
   expect(policy.latestClientModeForAuthority(s),change).toBeNull()
  }
 })
 it('cannot assume catalog and a dependent create ran sequentially in one tool batch',async()=>{
  const s=session('创建表格组件'),h=harness(s)
  s.events.push({type:'tool/call',data:{name:'client_capabilities',callId:'parallel-catalog',arguments:'{}'}})
  expect(policy.latestClientModeForAuthority(s)).toBeNull()
  expect(h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',callId:'parallel-create',arguments:{}})).filter(Boolean).join()).toContain('client_capabilities')
  h.dispose()
 })
})
it('keeps an explicitly rejected canvas noun from converting a bare card to a workbench',()=>{
 expect(policy).not.toBeNull()
 for(const text of ['创建一张表格组件而不是工作台','创建一张图表组件而非画布']){
  const s=session(text);catalog(s,'conversation')
  expect(policy.componentCreationRequest(s)?.target).toBe('component')
  expect(workbenchCreationRequest(s)).toBeNull()
 }
 expect(policy.componentCreationRequest(session('建一个画布展示模拟数据'))?.target).toBe('workbench')
})
describe('natural component delivery expressions and defensive canvas boundary',()=>{
 const phrases=['给我一张苹果股票行情卡片','用图表展示苹果过去一年的价格','用一个表格比较三只ETF']
 for(const text of phrases)for(const mode of [null,'conversation','notes','research'])it(`${text} uses ${mode??'unknown'} mode consistently`,async()=>{
  const s=session(text);if(mode)catalog(s,mode);const h=harness(s)
  expect(policy.componentCreationRequest(s)?.target).toBe('component')
  expect((await h.config()).maxTokens).toBe(16000)
  const allowed=(await h.wire()).tools.some(v=>v.name==='research_workbench_create')
  const denied=h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'accidental-canvas'}))
  expect(allowed).toBe(mode==='research');expect(denied).toBe(mode!=='research');h.dispose()
 })
 it.each(['查看苹果公司的当前价格','解释这个图表的含义','请编写React价格图表组件 Quote.tsx'])('also prevents an unrequested canvas if the classifier intentionally returns null: %s',async text=>{
  const s=session(text),h=harness(s)
  expect(policy.componentCreationRequest(s)).toBeNull();expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(v=>v.name==='research_workbench_create')).toBe(false)
  expect(h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'skip-catalog'})).filter(Boolean).join()).toContain('client_capabilities')
  catalog(s,'conversation');expect(h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'hidden-canvas'})).filter(Boolean).join()).toContain('conversation.components.create');h.dispose()
 })
})
describe('existing-object delivery stays read-only while natural new delivery creates',()=>{
 const readers=['给我看看当前工作台','请给我当前工作台的链接','给我已有画布的原始数据','我要这个图表的解释','提供现有表格的来源','需要当前工作台的数据日期','请给我说明如何使用当前工作台','给我工作台的创建方法','我想要已有组件的内容','展示当前图表','用当前图表比较两个时点']
 for(const text of readers)it(`does not turn ${text} into creation`,async()=>{
  for(const mode of [null,'conversation','research','notes']){
   const s=session(text);if(mode)catalog(s,mode);const h=harness(s)
   expect(policy.componentCreationRequest(s),text).toBeNull();expect(workbenchCreationRequest(s),text).toBeNull()
   expect((await h.config()).maxTokens).toBe(16000)
   expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(false)
   expect(h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'read-only'}))).toBe(true)
   h.dispose()
  }
 })
 const creators=[['给我一张苹果股票行情卡片','component'],['用图表展示苹果过去一年的价格','component'],['用一个表格比较三只ETF','component'],['给我一个新的工作台','workbench'],['请提供一个独立的行情研究工作台','workbench'],['给我创建一个新工作台替代当前工作台','workbench'],['给我一个显示当前股价的新工作台','workbench'],['请展示一张比较三只ETF的图表','component'],['给我一张包含原始数据的行情卡片','component'],['创建工作台并解释收入变化','workbench']]
 it.each(creators)('preserves %s as %s',async(text,target)=>{
  const s=session(text);catalog(s,'conversation');const h=harness(s)
  expect(policy.componentCreationRequest(s)?.target).toBe(target)
  expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(target==='workbench');h.dispose()
 })
 it('keeps a later explicit addition after an existing-object inspection',()=>{
  expect(policy.componentCreationRequest(session('给我看看当前工作台，另外给我一个新的工作台'))?.target).toBe('workbench')
 })
})
describe('normalized mixed clauses separate existing sources from creation targets',()=>{
 it.each([
  ['给我一张苹果行情卡片，然后给我看看工作台','component'],
  ['用当前表格的数据创建一个新的工作台','workbench'],
  ['使用已有组件的数据生成一个新工作台','workbench'],
  ['用当前工作台的数据创建一个新的图表','component'],
  ['创建一张展示当前工作台数据的图表','component'],
  ['用图表展示当前工作台中的原始数据','component'],
  ['给我看看当前工作台，然后给我一个新的工作台','workbench'],
 ])('%s creates only the intended %s target',async(text,target)=>{
  const s=session(text);catalog(s,'conversation');const h=harness(s)
  expect(policy.componentCreationRequest(s)?.target).toBe(target)
  expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(target==='workbench')
  expect(h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'mixed'}))).toBe(target!=='workbench');h.dispose()
 })
 it.each(['然后给我看看工作台','另外请给我当前工作台的链接','使用当前表格的数据如何创建一个新的工作台','说明如何使用已有组件的数据生成一个新工作台'])('keeps %s read-only',async text=>{
  const s=session(text);catalog(s,'conversation');const h=harness(s)
  expect(policy.componentCreationRequest(s)).toBeNull();expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(false);h.dispose()
 })
})


// Authored PPT task, with the local attachment path and invocation ID redacted.
const originalPresentationRequest="/ework-skill-example\n📎 文件：`/workspace/Vanguard-2026经济与市场展望.pdf`\n\n请使用内置「PPT制作助手 / efund-ppt-maker」技能，独立阅读工作区中的《Vanguard-2026经济与市场展望.pdf》，制作一份有代表性的、可供专业投研人员内部交流的公司风格PPT。题目可用《人工智能周期与资产配置：2026年展望研读》。这份材料将用于EWork首页生成演示用例，因此请完整完成资料研读、观点与目录规划、原生可编辑PPT制作、逐页渲染和版式修订，再交付成品，不要停在大纲。\n\n内容：约16—20页，具备规范目录与分章目录；明确区分原报告预测、报告历史数据与本稿研读判断。优先讨论AI投资和宏观增长、企业融资与资本回报、估值与情景、不同资产组合角色、观察指标与风险反证。选择PDF里确有依据的数据制作至少6张有分析价值且可编辑的专业图表，配口径、单位、资料页码及截至日期；如自行计算，列出计算口径，不能将测算冒充原报告预测。不要空洞口号、通用模拟数据或编造的最新行情。该PDF是2025年末发布的历史展望，必须如实标注资料时点，不宣称是当前预测。结尾前必须有实质性结论。\n\n品牌和版式：严格执行内置技能，使用其唯一V6公司品牌来源并保留封面、页头Logo、页脚、字体与标准目录；正文采用与信息关系合适的专业排版。尤其：封面可编辑槽位不保留模板占位空格；描述性表格的表头和正文同列左对齐、文字起点一致，蓝色表头内文字垂直居中；左观点右图表页面的小标题下面紧接顶部排列的正文，不能把正文悬在整栏空白的中间。数据图表应清晰、大方，有专业观点但不过度堆满。不要读取、复制或改写其他已经生成的示例PPT，本次从PDF和技能模板独立生成。\n\n质量：运行技能提供的封面、字号/品牌家具、可读性、交付检查及新增文本布局检查；必须逐页实际渲染查看并修正重叠、缺字、截断、超界、错位和不合理空白。所有检查真实执行；有能力缺口如实报告，不能声称未执行的检查通过。最终保存到当前工作区 outputs/，交付《人工智能周期与资产配置.pptx》及便于复核的逐页预览；回复实际本地绝对路径和简要检查结果。\n"
describe('file-document deliverables keep authored file execution rather than UI component routing',()=>{
 const files=[
  ['original attachment task',originalPresentationRequest],
  ['comma-separated chart requirement','根据附件研报制作一份PPT，包含6张可编辑数据图表'],
  ['chart requirement inside deliverable','根据附件研报制作一份包含6张可编辑数据图表的PPT'],
  ['charts preceding the deliverable','根据附件中的图表生成一份PPT'],
  ['natural file delivery','给我一份含原生图表的PPT文件'],
  ['document continuation','继续完成当前PPT，修正其中原生图表的正负轴'],
  ['compact continuation','继续当前PPT修图表'],
  ['exported document','把当前工作台的数据整理成一份PPT，包含可编辑图表'],
  ['document table','制作一份Word报告，包含一个数据表格'],
  ['quoted flow inside deck','制作PPT，内容包括“创建一个工作台”的流程示意图'],
  ['explicitly no new canvas','制作PPT，不要创建工作台'],
  ['explicitly no inline component','制作PPT，不要在对话里创建图表组件'],
 ]
 for(const [label,text] of files)for(const mode of [null,'conversation','research','notes'])it(`${label} keeps file tools and budget in ${mode??'unknown'} mode`,async()=>{
  const s=session(text);if(mode)catalog(s,mode);const h=harness(s)
  expect(policy.componentCreationRequest(s)).toBeNull();expect(workbenchCreationRequest(s)).toBeNull()
  expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000})
  const names=(await h.wire()).tools.map(tool=>tool.name)
  expect(names).toEqual(['client_capabilities','client_action','public_data_query','financial_query','run_code','read_file','Bash'])
  for(const name of ['run_code','read_file','Bash'])expect(h.guards.map(fn=>fn({agent:h.agent,name,arguments:{},callId:name})).filter(Boolean)).toEqual([])
  const denied=h.guards.map(fn=>fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'file-canvas'})).filter(Boolean).join()
  expect(denied).toContain('文件');expect(denied).not.toContain('conversation.components.create')
  expect(h.prompt()).not.toContain('conversation.components.create');expect(h.prompt()).not.toContain('notes.components.create');expect(h.prompt()).not.toContain('【工作台首次规划】')
  h.dispose()
 })
 const components=[
  '在对话里展示一张行情图表组件',
  '请在对话中生成一个行情图表组件',
  '制作PPT，并在对话中展示一张行情图表组件',
  '制作一份PPT，另外生成一个对话组件展示行情',
  '阅读当前PPT后，在对话里展示一张行情卡片',
  '根据附件PDF创建一张行情图表组件',
  '创建一张基于附件PDF数据的行情图表组件',
  '生成一个使用PDF数据的图表组件',
  '给我一张根据PDF数据绘制的行情图表组件',
  '原说明写着“制作一份含图表的PPT”，现在在对话里展示一张行情图表组件',
  '> 制作一份含图表的PPT\n在对话里展示一张行情图表组件',
  '```text\n制作一份含图表的PPT\n```\n在对话里展示一张行情图表组件',
  '不要制作PPT，在对话里展示一张行情图表组件',
 ]
 for(const text of components)for(const mode of [null,'conversation','research','notes'])it(`preserves separate component delivery in ${mode??'unknown'} mode: ${text}`,async()=>{
  const s=session(text);if(mode)catalog(s,mode);const h=harness(s)
  expect(policy.componentCreationRequest(s)?.target).toBe('component')
  expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(mode==='research')
  expect(h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'mixed-component'}))).toBe(mode!=='research')
  if(mode!=='research'&&mode!=='notes')expect(h.prompt()).toContain('conversation.components.create')
  h.dispose()
 })
 for(const text of ['制作PPT，并创建一个股票研究工作台','创建一个工作台，并把它的数据整理成一份PPT'])for(const mode of [null,'conversation','research','notes'])it(`preserves explicitly requested canvas in ${mode??'unknown'} mode: ${text}`,async()=>{
  const s=session(text);if(mode)catalog(s,mode);const h=harness(s)
  expect(policy.componentCreationRequest(s)?.target).toBe('workbench');expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(true)
  expect(h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'mixed-board'}))).toBe(false)
  h.dispose()
 })
})

describe('conversation components follow the public explanation flow',()=>{
 for(const mode of [null,'conversation'])it(`guides natural introduction, immediate creation and following prose in ${mode??'catalog-first'} mode`,()=>{
  const s=session('请按顺序解释预算差异，展示两张原生表格组件，并在各表后分析原因。');if(mode)catalog(s,mode);const h=harness(s)
  try{
   const prompt=h.prompt()
   expect(prompt).toContain('先用简短自然的公开文字引出组件，再在对应的信息位置立即创建')
   expect(prompt).toContain('保存成功后继续解释该组件或展开后续正文')
   expect(prompt).toContain('多个组件按论述顺序逐个交付')
   expect(prompt).toContain('不要等整篇回答结束后再集中创建')
   expect(prompt).toContain('面向用户的正文不展示工具名、requestId、manifest或协议标签')
   expect(prompt).toContain('只依据真实成功回执说明已交付')
   expect(prompt.match(/多个组件按论述顺序逐个交付/g)).toHaveLength(1)
   expect(h.startSubagent).not.toHaveBeenCalled()
  }finally{h.dispose()}
 })
 for(const mode of ['research','notes'])it(`keeps ${mode} delivery guidance independent of conversation prose placement`,()=>{
  const s=session('请生成一张预算表格组件');catalog(s,mode);const h=harness(s)
  try{expect(h.prompt()).not.toContain('多个组件按论述顺序逐个交付')}finally{h.dispose()}
 })
})

it.each([null,'conversation'])('provides the exact host color contract once before authoring C1, catalog=%s',async mode=>{
 const s=session('做个能点击计数、顺便记备注的小组件。');if(mode)catalog(s,mode);const h=harness(s)
 try{
  const prompt=h.prompt();expect(prompt).toContain(PANEL_COLOR_INSTRUCTION);expect(prompt.split(PANEL_COLOR_INSTRUCTION)).toHaveLength(2)
  expect(prompt).toContain('--sherlock-muted');expect(prompt).toContain('--sherlock-control-bg');expect(prompt).toContain('-on-primary（均写完整名称）');expect(prompt).toContain('不添加 #hex、rgb 或固定颜色备用值')
  expect(await h.config()).toMatchObject({reasoningEffort:'high',maxTokens:16000});expect(h.startSubagent).not.toHaveBeenCalled()
 }finally{h.dispose()}
})
it('retains the C1 color fallback gate while its documented text and primary roles pass',()=>{
 // Minimal public CSS from Native C1's failed first artifact; no theme gate is relaxed.
 expect(designPolicyIssue('<style>.cw-num{color:var(--sherlock-accent,#3562e3)}</style><div class="cw-num">0</div>')).toContain('不能硬编码界面颜色')
 expect(designPolicyIssue('<style>.cw-num{color:var(--sherlock-text)}.cw-primary{color:var(--sherlock-control-on-primary)}</style><div class="cw-num">0</div><button class="cw-primary">+1</button>')).toBeNull()
})

it('recognizes domain prototype pages without forcing a component type or editing a source file',()=>{
 const s=session('📎 文件：`/fixture/prototype.html` 这是数据治理系统的原型，请把我的待办和治理统计两个页签页面实现出来。')
 expect(policy.componentCreationRequest(s)?.target).toBe('component')
 expect(workbenchCreationRequest(s)).toBeNull();catalog(s,'research');expect(workbenchCreationRequest(s)?.target).toBe('component')
 for(const text of ['请修改文件源码，把原型里的我的待办页面实现出来。','原型里有两个页面。','如何把原型里的页面实现出来？','不要把原型里的页面实现出来。','资料说明：“把原型里的页面实现出来”。'])expect(policy.componentCreationRequest(session(text))).toBeNull()
})

it('retains an active creation goal across reference steering without reviving completed or cancelled work',()=>{
 const original=session('📎 文件：`/fixture/first.html` 这是系统原型，请把待办和统计两个页面实现出来。')
 original.events.unshift({type:'turn/start',data:{turn:1}})
 original.events.push({type:'user/message',data:{id:'steer-2',source:{kind:'user'},content:[{type:'text',text:'📎 文件：`/fixture/new.html` 以这个为准吧'}]}})
 expect(policy.componentCreationRequest(original)).toMatchObject({messageId:'steer-2',target:'component'})
 expect(policy.componentCreationRequest(original).text).toContain('/fixture/new.html')
 expect(workbenchCreationRequest(original)).toBeNull();catalog(original,'research');expect(workbenchCreationRequest(original)).not.toBeNull()
 for(const text of ['停止，换个任务，以这个为准。','请修改文件源码，以这个为准。','不用生成看板，以这个为准。']){
  const copy=structuredClone(original);copy.events.push({type:'user/message',data:{id:'stop',source:{kind:'user'},content:[{type:'text',text}]}});expect(policy.componentCreationRequest(copy)).toBeNull()
 }
 original.events.push({type:'turn/end',data:{turn:1}});expect(policy.componentCreationRequest(original)).toBeNull()
})


it('routes the right-side cash-flow preset to the workbook before file tools are exposed',async()=>{
 const s=session(SPREADSHEET_QUICK_PROMPTS.zh[2]),h=harness(s)
 try{
  expect((await h.wire()).tools.map(tool=>tool.name)).toEqual(['client_capabilities'])
  catalog(s,'spreadsheet')
  expect((await h.wire()).tools.map(tool=>tool.name)).toEqual(['client_capabilities','client_action'])
  expect(h.prompt()).toContain('NOPAT = EBIT × (1 − 税率)')
  expect(h.prompt()).toContain('从假设独立复算第一年和第五年')
  s.events.push({type:'assistant/chunk',data:{chunk:{type:'finish',reason:{kind:'stop'}}}})
  h.stop();h.stop()
  expect(h.agent.steer).toHaveBeenCalledTimes(1)
  expect(h.agent.steer.mock.calls[0][0].content[0].text).toContain('当前工作簿尚未收到单元格写入回执')
 }finally{h.dispose()}
})

it('accepts a matching workbook write receipt and preserves other input modes and attachment processing',async()=>{
 const s=session(SPREADSHEET_QUICK_PROMPTS.zh[2]),h=harness(s)
 try{
  catalog(s,'spreadsheet')
  s.events.push({type:'tool/call',data:{name:'client_action',callId:'saved',arguments:JSON.stringify({requestId:'cashflow',capability:'spreadsheet.apply'})}},
   {type:'tool/result',data:{message:{source:{kind:'tool',callId:'saved'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({status:'succeeded',capability:'spreadsheet.apply',requestId:'cashflow',data:{saved:true,changed:true,affected:[{sheetId:'cashflow',range:'A1:F10'}]}})}]}]}}},
   {type:'assistant/chunk',data:{chunk:{type:'finish',reason:{kind:'stop'}}}})
  h.stop();expect(h.agent.steer).not.toHaveBeenCalled()
 }finally{h.dispose()}
 const attachment=session(SPREADSHEET_QUICK_PROMPTS.en[1]),r=harness(attachment)
 try{
  catalog(attachment,'spreadsheet')
  expect((await r.wire()).tools.map(tool=>tool.name)).toContain('read_file')
  expect(r.prompt()).not.toContain('NOPAT = EBIT')
 }finally{r.dispose()}
 const conversation=session(SPREADSHEET_QUICK_PROMPTS.en[2]),c=harness(conversation)
 try{
  catalog(conversation,'conversation')
  expect((await c.wire()).tools.map(tool=>tool.name)).toContain('run_code')
 }finally{c.dispose()}
})
