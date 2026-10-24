import {describe,it,expect,vi} from 'vitest'
import {registerWorkbenchExecutionPolicy,workbenchCreationRequest} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
const policy=await import('../packages/dsh-research-task-runtime/conversation-components-policy.js').catch(()=>null)
const session=text=>({id:'s',header:{},events:[{type:'turn/start',data:{turn:'1'}},{type:'user/message',seq:2,data:{id:'human',source:{kind:'user'},content:[{type:'text',text}]}}]})
const catalog=(s,mode,{callId='catalog-1',error=false,resultCallId=callId}={})=>s.events.push({type:'tool/call',data:{name:'client_capabilities',callId,arguments:'{}'}},{type:'tool/result',data:{message:{source:{kind:'tool',callId:resultCallId},content:[{type:'tool-result',isError:error,content:[{type:'text',text:JSON.stringify({mode,capabilities:[]})}]}]}}})
const schemas=[{name:'research_workbench_create',parameters:{type:'object',properties:{panels:{type:'array'}},required:['panels']}},{name:'client_capabilities'},{name:'client_action'},{name:'public_data_query',parameters:{properties:{operation:{enum:['catalog','query']}}}},{name:'financial_query',parameters:{properties:{intent:{enum:['resolve','catalog','research']}}}},{name:'run_code'}]
function harness(s){
 expect(policy,'conversation policy 尚未实现').not.toBeNull()
 const prompts=[],hooks=new Map(),guards=[],startSubagent=vi.fn(),agent={session:s}
 const ctx={tools:{schemas:()=>schemas,guard:fn=>{guards.push(fn);return()=>{}}},systemPrompt:{context:v=>{prompts.push(v);return()=>{}}},llm:{resolveModelInfo:vi.fn(async()=>({reasoning:{efforts:[{id:'low'},{id:'high'}]},defaultMaxTokens:16000}))},on:(name,fn)=>{hooks.set(name,[...(hooks.get(name)||[]),fn]);return()=>{}},startSubagent}
 const disposeWorkbench=registerWorkbenchExecutionPolicy(ctx),disposeConversation=policy.registerConversationComponentsPolicy(ctx)
 const invoke=async(name,value)=>{const run=(hooks.get(name)||[]).reduceRight((next,fn)=>()=>fn({agent},next),async()=>value);return run()}
 return{agent,ctx,guards,startSubagent,prompt:()=>prompts.map(v=>v.text({agent})).filter(Boolean).join('\n'),config:()=>invoke('agent/request',{provider:'zai',model:'test',reasoningEffort:'high',maxTokens:16000}),wire:()=>invoke('agent/request-context',{system:'base',tools:schemas}),dispose:()=>{disposeConversation();disposeWorkbench()}}
}
describe('direct conversation component routing',()=>{
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
  expect(workbenchCreationRequest(s)?.text).toContain('柱状图');expect(await h.config()).toMatchObject({reasoningEffort:'low',maxTokens:4096})
  expect((await h.wire()).tools.map(v=>v.name)).toEqual(['research_workbench_create']);h.dispose()
  const n=session('创建一个表格组件');catalog(n,'notes');const notes=harness(n)
  expect(workbenchCreationRequest(n)).toBeNull();expect(await notes.config()).toMatchObject({maxTokens:16000})
  expect(notes.prompt()).toContain('notes.components.create');expect(notes.prompt()).not.toContain('capability:"conversation.components.create"');notes.dispose()
 })
 it.each(['conversation','research','notes'])('explicit workbench preserves research planning in %s',async mode=>{
  const s=session('创建一个股票研究工作台');catalog(s,mode);const h=harness(s)
  expect(workbenchCreationRequest(s)).not.toBeNull();expect(await h.config()).toMatchObject({maxTokens:4096})
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
  expect((await h.config()).maxTokens).toBe(mode==='research'?4096:16000)
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
  expect((await h.config()).maxTokens).toBe(target==='workbench'?4096:16000)
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
  expect((await h.config()).maxTokens).toBe(target==='workbench'?4096:16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(target==='workbench')
  expect(h.guards.some(fn=>!!fn({agent:h.agent,name:'research_workbench_create',arguments:{},callId:'mixed'}))).toBe(target!=='workbench');h.dispose()
 })
 it.each(['然后给我看看工作台','另外请给我当前工作台的链接','使用当前表格的数据如何创建一个新的工作台','说明如何使用已有组件的数据生成一个新工作台'])('keeps %s read-only',async text=>{
  const s=session(text);catalog(s,'conversation');const h=harness(s)
  expect(policy.componentCreationRequest(s)).toBeNull();expect((await h.config()).maxTokens).toBe(16000)
  expect((await h.wire()).tools.some(tool=>tool.name==='research_workbench_create')).toBe(false);h.dispose()
 })
})
