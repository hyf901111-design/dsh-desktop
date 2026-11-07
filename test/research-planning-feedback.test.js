import {stripConversationGridOverlays} from './fixtures/strip-conversation-transient-ui.mjs'
import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {planningResponseMetadata,advancePlanningHeartbeat,planningFeedbackState,researchPlanningRequest,patchResearchPlanningFeedback} from '../scripts/lib/research-planning-feedback.mjs'
import {classifyResearchCreationRequest,patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench,patchResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
const currentClient=()=>restoreResearchGridWorkbench(stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))))
const model=(text='private reasoning')=>({key:'m',kind:'assistant-step',data:{blocks:[{kind:'reasoning',text}]}})
it('projects actual response metadata without retaining private reasoning or tool payloads',()=>{
 const meta=planningResponseMetadata([model(),{key:'t',kind:'tool-call',data:{root:{name:'read',argsRaw:'private/path'}}}])
 expect(meta.responding).toBe(true);expect(meta.toolCount).toBe(1);expect(meta.accepted).toBe(false)
 expect(JSON.stringify(meta)).not.toMatch(/private|reasoning.*text|\/path/)
 const first=advancePlanningHeartbeat(null,meta,1000)
 expect(advancePlanningHeartbeat(first,meta,4000)).toBe(first)
 expect(advancePlanningHeartbeat(first,planningResponseMetadata([model('longer private reasoning')]),5000)).toMatchObject({firstAt:1000,lastAt:5000})
})
it('distinguishes waiting, active streaming, a stalled response and an actual accepted receipt',()=>{
 const empty=planningResponseMetadata([])
 expect(planningFeedbackState(empty,null,0,20000,true)).toMatchObject({phase:'waiting',warning:''})
 const meta=planningResponseMetadata([model()]),beat=advancePlanningHeartbeat(null,meta,120000)
 const active=planningFeedbackState(meta,beat,0,125000,true)
 expect(active.phase).toBe('responding');expect(active.warning).toContain('仍在处理中')
 expect(active.warning).not.toContain('%');expect(active.detail).toContain('内容生成还未开始')
 expect(planningFeedbackState(meta,beat,0,170000,true).warning).toContain('暂未收到新的进展')
 expect(planningFeedbackState(meta,beat,0,170000,false)).toMatchObject({phase:'ended',warning:''})
 const accepted=planningResponseMetadata([{key:'create',kind:'tool-call',data:{root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId:'plan',status:'accepted',panels:[{},{}]})}]}}}])
 expect(planningFeedbackState(accepted,null,0,180000,true)).toMatchObject({phase:'accepted',warning:''})
 expect(planningFeedbackState(accepted,null,0,180000,true).detail).toContain('2 个组件')
 expect(accepted.prepared).toBe(false)
 expect(planningFeedbackState(empty,null,0,130000,true,true).warning).toContain('exceeded 2 minutes')
})
it('limits the feedback to the matching user creation turn, excluding ordinary chats and stale turns',()=>{
 const nodes=new Map([['old',{kind:'user',location:{kind:'turn',turn:{turn:1}},data:{content:[{text:'生成金融工作台'}]}}],['current',{kind:'user',location:{kind:'turn',turn:{turn:2}},data:{content:[{text:'做一个艺术节筹备工作台，用模拟记录'}]}}],['qa',{kind:'user',location:{kind:'turn',turn:{turn:3}},data:{content:[{text:'为什么生成工作台这么慢'}]}}]])
 const read=parts=>parts.map(p=>p.text).join('')
 expect(researchPlanningRequest([...nodes.keys()],nodes,2,classifyResearchCreationRequest,read)).toMatchObject({kind:'workbench'})
 expect(researchPlanningRequest([...nodes.keys()],nodes,3,classifyResearchCreationRequest,read)).toBeNull()
 expect(researchPlanningRequest([...nodes.keys()],nodes,4,classifyResearchCreationRequest,read)).toBeNull()
})
it('shows transport feedback for a single-component creation without exposing private response content',()=>{
 const nodes=new Map([['single',{kind:'user',location:{kind:'turn',turn:{turn:7}},data:{content:[{text:'创建一个装置撤展交接组件，用8条模拟记录'}]}}]])
 const request=researchPlanningRequest(['single'],nodes,7,classifyResearchCreationRequest,parts=>parts.map(p=>p.text).join(''),true)
 expect(request).toMatchObject({kind:'component'})
 const meta=planningResponseMetadata([model('PRIVATE_SINGLE_COMPONENT_REASONING')])
 expect(planningFeedbackState(meta,advancePlanningHeartbeat(null,meta,12000),0,15000,true).phase).toBe('responding')
 expect(JSON.stringify(meta)).not.toContain('PRIVATE_SINGLE_COMPONENT_REASONING')
 expect(researchPlanningRequest(['single'],nodes,8,classifyResearchCreationRequest,parts=>parts.map(p=>p.text).join(''))).toBeNull()
 const original=currentClient()
 const current=patchResearchCreationProgress(original)
 const legacy=current.replace("return request?.kind==='workbench'||research&&request?.kind==='component'?request:null", "return request?.kind==='workbench'?request:null")
 const reinstalled=patchResearchCreationProgress(legacy),start=reinstalled.indexOf('/* ework:planning-feedback:v1 */'),end=reinstalled.indexOf('/* ework:workbench-feedback:',start)
 const installed=runInNewContext(reinstalled.slice(start,end)+';researchPlanningRequest',{})
 expect(installed(['single'],nodes,7,classifyResearchCreationRequest,parts=>parts.map(p=>p.text).join(''),true)).toMatchObject({kind:'component'})
})
it('does not label a conversation-native component response as research planning',()=>{
 const text='请在当前对话中生成1个原生表格组件，使用用户提供的模拟数据。不创建工作台，不切换视图。',nodes=new Map([['user',{kind:'user',data:{turn:1,content:[{text}]}}]])
 const read=parts=>parts.map(part=>part.text).join('')
 expect(researchPlanningRequest(['user'],nodes,1,classifyResearchCreationRequest,read,false)).toBeNull()
 expect(researchPlanningRequest(['user'],nodes,1,classifyResearchCreationRequest,read,true)).toMatchObject({kind:'component'})
})
it('excludes coding requests from fresh and previously installed planning feedback',()=>{
 const nodes=new Map([['coding',{kind:'user',data:{turn:3,content:[{text:'创建一个React组件，写入src/Card.tsx'}]}}],['single',{kind:'user',data:{turn:4,content:[{text:'创建一个装置撤展交接组件，用8条模拟记录'}]}}]])
 const read=parts=>parts.map(p=>p.text).join('')
 expect(researchPlanningRequest([...nodes.keys()],nodes,3,classifyResearchCreationRequest,read)).toBeNull()
 const original=currentClient()
 const fresh=patchResearchCreationProgress(original)
 const oldHelper="function researchPlanningRequest(order,nodeStore,turn,classify,readText) {\n if(turn===null||turn===undefined)return null\n for(let i=order.length-1;i>=0;i--){\n  const node=nodeStore.get(order[i]);if(node?.kind!=='user')continue\n  const location=node.location,number=node.data?.turn??location?.turn?.turn??location?.turn\n  if(number!==turn)continue\n  const request=classify(readText(node.data?.content||[]))\n  return request?.kind==='workbench'||request?.kind==='component'?request:null\n }\n return null\n}"
 const legacy=fresh.replace(researchPlanningRequest.toString(),oldHelper)
 for(const source of [fresh,patchResearchCreationProgress(legacy)]){
  const start=source.indexOf('/* ework:planning-feedback:v1 */'),end=source.indexOf('/* ework:workbench-feedback:',start)
  const installed=runInNewContext(source.slice(start,end)+';researchPlanningRequest',{})
  expect(installed([...nodes.keys()],nodes,3,classifyResearchCreationRequest,read)).toBeNull()
  expect(installed([...nodes.keys()],nodes,4,classifyResearchCreationRequest,read,true)).toMatchObject({kind:'component'})
  expect(patchResearchCreationProgress(source)).toBe(source)
 }
})
it('refreshes the actual inlined classifier when upgrading an installed planning report',()=>{
 const original=currentClient()
 const fresh=patchResearchCreationProgress(original)
 const prefix='const planningRequest=entry.running && entry.turn===runningTurnNumber ? researchPlanningRequest(order,nodeStore,entry.turn,'
 const suffix=',parts=>parseResearchPrompt(contentParts(parts).text).text,researchPlanningSurface) : null;'
 const start=fresh.indexOf(prefix),end=fresh.indexOf(suffix,start)
 const legacyClassifier='function oldClassify(text){return /生成/.test(text)&&/工作台|组件/.test(text)?{kind:"workbench",request:text}:null}'
 const legacy=patchResearchGridWorkbench(fresh.slice(0,start+prefix.length)+legacyClassifier+fresh.slice(end))
 const reinstalled=patchResearchCreationProgress(restoreResearchGridWorkbench(legacy))
 const helpersStart=reinstalled.indexOf('/* ework:planning-feedback:v1 */'),helpersEnd=reinstalled.indexOf('/* ework:workbench-feedback:',helpersStart)
 const callStart=reinstalled.indexOf(prefix),callEnd=reinstalled.indexOf(suffix,callStart)+suffix.length
 const nodes=new Map([['repair',{kind:'user',data:{turn:6,content:[{text:'修复现有工作台的图表生成失败问题，保留原组件和数据。'}]}}]])
 const request=runInNewContext(reinstalled.slice(helpersStart,helpersEnd)+reinstalled.slice(callStart,callEnd)+';planningRequest',{
  entry:{running:true,turn:6},runningTurnNumber:6,researchPlanningSurface:false,order:['repair'],nodeStore:nodes,parseResearchPrompt:text=>({text}),contentParts:parts=>({text:parts.map(p=>p.text).join('')})
 })
 expect(request).toBeNull()
 expect(reinstalled.slice(callStart,callEnd)).not.toContain('function oldClassify')
},15000)
it('patches the real progress component and its owning turn without duplicating the report on reinstall',()=>{
 const original=currentClient()
 const patched=patchResearchCreationProgress(original)
 expect(patchResearchCreationProgress(patched)).toBe(patched)
 expect(patched).toContain('/* ework:workbench-feedback:v9 */')
 expect(patched).toContain('function publishResearchWorkbenchProgress(')
 expect(patched).toContain('data-research-planning-feedback')
 expect(patched).toContain('const planningRequest=entry.running && entry.turn===runningTurnNumber ? researchPlanningRequest(order,nodeStore,entry.turn,')
 expect(patched).toContain('planningRequest,\n\t\t\t\t\t\t\t\t\tstartTime:')
 const start=patched.indexOf('/* ework:planning-feedback:v1 */'),end=patched.indexOf('/* ework:workbench-feedback:',start)
 const statuses=[]
 const react={useRef:()=>({current:null})},jsx=(type,props)=>({type,props})
 const win=new Window()
 const Feedback=runInNewContext(patched.slice(start,end)+';ResearchPlanningFeedback',{react,react_jsx_runtime:{jsx,jsxs:jsx},document:win.document})
 const view=Feedback({meta:planningResponseMetadata([model('SECRET_REASONS')]),startedAt:0,now:20000,running:true})
 expect(JSON.stringify(view)).not.toContain('SECRET_REASONS')
 expect(view).toBeNull()
 const delayed=Feedback({meta:planningResponseMetadata([model('SECRET_REASONS')]),startedAt:0,now:130000,running:true})
 expect(delayed.props.children).toContain('准备已超过 2 分钟')
 expect(JSON.stringify(delayed)).not.toMatch(/SECRET_REASONS|最近响应|模型|组件清单/)
 expect(planningFeedbackState(planningResponseMetadata([model()]),null,0,20000,true).title).toBe('正在准备工作台')
 void win.happyDOM.abort()
})
it('upgrades the legacy production planning call without a surface argument exactly once',()=>{
 const fresh=patchResearchCreationProgress(currentClient()),surface='const researchPlanningSurface = useStore((s) => s.view === "research");',suffix=',parts=>parseResearchPrompt(contentParts(parts).text).text,researchPlanningSurface) : null;'
 const legacy=fresh.replace('\n'+surface,'').replace(suffix,',parts=>parseResearchPrompt(contentParts(parts).text).text) : null;'),upgraded=patchResearchCreationProgress(legacy)
 expect(upgraded.includes(surface)).toBe(true);expect(upgraded.includes(suffix)).toBe(true)
 expect(patchResearchCreationProgress(upgraded)===upgraded).toBe(true)
 expect(()=>patchResearchCreationProgress(fresh.replace(surface,'const researchPlanningSurface = unknownSurface;'))).toThrow(/surface anchor drifted/)
})
it('recognizes code-mode nested host receipts without interpreting arguments or unrelated result text',()=>{
 const receipt={kind:'tool-result',call:{name:'research_workbench_create',argsRaw:'PRIVATE'},content:[{type:'text',text:'{"planId":"p","status":"accepted","panels":[{}]}'}]}
 const meta=planningResponseMetadata([{key:'code',kind:'tool-call',data:{root:{kind:'tool-result',call:{name:'code'},subCalls:[receipt],content:[{type:'text',text:'PRIVATE'}]}}}])
 expect(meta).toMatchObject({accepted:true,prepared:false,count:1,toolCount:2})
 expect(JSON.stringify(meta)).not.toContain('PRIVATE')
 receipt.isError=true
 expect(planningResponseMetadata([{key:'code',kind:'tool-call',data:{root:receipt}}])).toMatchObject({accepted:false,failedTools:1})
})
it('retains only verified plan identities and deduplicates repeated receipts for live component feedback',()=>{
 const receipt=id=>({kind:'tool-result',call:{name:'research_workbench_create',argsRaw:'PRIVATE'},content:[{type:'text',text:JSON.stringify({planId:id,status:'accepted',panels:['a','b','c','d']})}]})
 const meta=planningResponseMetadata([{key:'one',kind:'tool-call',data:{root:receipt('actual-plan')}},{key:'duplicate',kind:'tool-call',data:{root:receipt('actual-plan')}}])
 expect(meta.plans).toEqual([{id:'actual-plan',count:4}])
 expect(JSON.stringify(meta.plans)).not.toContain('PRIVATE')
 const failed=receipt('failed');failed.isError=true
 expect(planningResponseMetadata([{key:'bad',kind:'tool-call',data:{root:failed}}]).plans).toEqual([])
})
it('marks ordinary composer cancellation as stopping before the actual session stops',()=>{
 const original=currentClient()
 const patched=patchResearchCreationProgress(original),start=patched.indexOf('stop=()=>{/* ODYSSEY_PLANNING_COMPOSER_STOP */'),end=patched.indexOf(';',patched.indexOf('ordinaryStop?.()',start))+1
 expect(start).toBeGreaterThan(-1)
 const intents=new Map([['s',{id:'intent',state:'planning'}]]),events=[]
 const stop=runInNewContext(patched.slice(start,end)+';stop',{odysseyCreationIntents:intents,sessionId:'s',odysseyCreationEmit:id=>events.push(id),canvasRunning:false,ordinaryStop:()=>events.push('stop')})
 stop();expect(intents.get('s')).toMatchObject({id:'intent',state:'stopping'});expect(events).toEqual(['s','stop'])
})
it('uses the event timestamp when reopening a running conversation instead of inventing a fresh response',()=>{
 const meta={...planningResponseMetadata([model()]),lastActivityAt:1000}
 const beat=advancePlanningHeartbeat(null,meta,90000)
 expect(beat.lastAt).toBe(1000)
 expect(planningFeedbackState(meta,beat,0,130000,true).activity).toContain('129 秒前')
 expect(advancePlanningHeartbeat(beat,meta,140000)).toBe(beat)
 expect(advancePlanningHeartbeat(beat,{...meta,lastActivityAt:145000},150000).lastAt).toBe(145000)
})
it('also installs on an older client without the planning-card action hook',()=>{
 const original=currentClient()
 const prior=original
  .replace(/\/\* ODYSSEY_CREATION_CARD_ACTIONS \*\/[\s\S]*?resolveSubmitMode, subagent\]\);/u,'')
  .replace(/stop=\(\)=>\{\/\* ODYSSEY_PLANNING_COMPOSER_STOP \*\/[\s\S]*?ordinaryStop\?\.\(\)\};/u,'stop=()=>{if(canvasRunning)void canvasExecution.stop().catch(error=>showToast(error.message));ordinaryStop?.()};')
 expect(prior).not.toContain('/* ODYSSEY_CREATION_CARD_ACTIONS */')
 expect(prior).not.toContain('/* ODYSSEY_PLANNING_COMPOSER_STOP */')
 const patched=patchResearchCreationProgress(prior)
 expect(patched).toContain('/* ODYSSEY_CREATION_CARD_ACTIONS */')
 expect(patched).toContain('/* ODYSSEY_PLANNING_COMPOSER_STOP */')
 expect(patchResearchCreationProgress(patched)).toBe(patched)
})
it('projects the latest actual assistant event time, including after transcript hydration',()=>{
 const original=currentClient()
 const patched=patchResearchCreationProgress(original),start=patched.indexOf('function projectAssistant('),end=patched.indexOf('/** Per-step Assistant',start)
 const project=runInNewContext(patched.slice(start,end)+';projectAssistant',{finalNode:()=>undefined,compactBlocks:x=>x,hasVisibleContent:()=>true})
 const state={turn:2,step:1,blocks:[{kind:'reasoning',text:'PRIVATE'}],firstVisibleTime:100,firstVisibleSeq:2}
 const projection=project({state,matches:[{event:{time:100,seq:2}},{event:{time:4500,seq:5}}]})
 expect(projection.data.time).toBe(100)
 expect(projection.data.lastActivityAt).toBe(4500)
 expect(planningResponseMetadata([{key:'assistant',kind:'assistant-step',data:projection.data}]).lastActivityAt).toBe(4500)
})

it('never presents an ended accepted plan as currently generating',()=>{
 const meta={...planningResponseMetadata([]),accepted:true,count:10}
 const ended=planningFeedbackState(meta,null,0,400000,false)
 expect(ended.phase).toBe('ended')
 expect(ended.title).not.toContain('正在')
 expect(ended.detail).not.toContain('正在')
 const original=currentClient()
 const patched=patchResearchCreationProgress(original)
 const at=patched.indexOf('const planningRequest=entry.running'),line=patched.slice(at,patched.indexOf('return (0, react_jsx_runtime.jsx)(ExecutionStatusGroup',at))
 for(const [running,turn,active] of [[false,1,2],[true,1,2],[false,2,2]]){
  const request=runInNewContext(line+';planningRequest',{entry:{running,turn},runningTurnNumber:active,researchPlanningRequest:()=>{throw Error('historical turn must not be projected')}})
  expect(request).toBeNull()
 }
})
