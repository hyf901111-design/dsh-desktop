import {stripConversationGridOverlays} from './fixtures/strip-conversation-transient-ui.mjs'
import {stripConversationComponents} from '../scripts/lib/conversation-components.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {createSourceFile,ScriptTarget,ScriptKind,isFunctionDeclaration,forEachChild} from 'typescript'
import {publishResearchWorkbenchProgress,publishInactiveResearchWorkbenchProgress,observeResearchWorkbenchProgress,workbenchProgressState,patchResearchWorkbenchFeedback,researchWorkbenchReceiptPlans,researchWorkbenchReceiptAnchors} from '../scripts/lib/research-workbench-feedback.mjs'
import {componentDataStatusDefinitions,createComponentDataStatusStore} from '../scripts/lib/component-data-status.mjs'
import {planningResponseMetadata} from '../scripts/lib/research-planning-feedback.mjs'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'

const plans=[{id:'plan',count:4}]
const card=(id,status='completed',extra={})=>({id,workbenchId:'plan',kind:'generated-container',generationTaskId:'task-'+id,generationStatus:status,...(status==='completed'?{containerSpec:{version:1,type:'html',html:'PRIVATE SOURCE CONTENT'}}:{}),title:'PRIVATE TITLE',containerPrompt:'PRIVATE PROMPT',generationError:'PRIVATE ERROR',...extra})
const done=()=>[0,1,2,3].map(i=>card('card-'+i))

it('projects only actual current card identity and state, without private content or failed-attempt history',()=>{
 const target=new EventTarget(),listener=vi.fn();target.addEventListener('sherlock:workbench-generation',listener)
 const nodes=done(),snapshot=publishResearchWorkbenchProgress(target,'session',nodes)
 expect(snapshot.nodes).toHaveLength(4)
 expect(snapshot.nodes[0]).toMatchObject({id:'card-0',planId:'plan',taskId:'task-card-0',status:'completed'})
 expect(JSON.stringify(snapshot)).not.toContain('PRIVATE')
 expect(listener).toHaveBeenCalledOnce()
 expect(publishResearchWorkbenchProgress(target,'session',nodes.map(n=>({...n,x:500})))).toBe(snapshot)
 expect(listener).toHaveBeenCalledOnce()
})

it('reports all off-screen cards, current retries, removed cards and real terminal failures',()=>{
 const target=new EventTarget(),nodes=done()
 nodes[3]=card('card-3','running',{generationTaskId:'new-attempt'})
 let snapshot=publishResearchWorkbenchProgress(target,'s',nodes)
 expect(workbenchProgressState(plans,snapshot)).toMatchObject({phase:'running',completed:3,pending:1,total:4})
 nodes[3]=card('card-3','failed',{generationTaskId:'new-attempt'})
 snapshot=publishResearchWorkbenchProgress(target,'s',nodes)
 expect(workbenchProgressState(plans,snapshot)).toMatchObject({phase:'partial',completed:3,failed:1,pending:0})
 nodes.pop();snapshot=publishResearchWorkbenchProgress(target,'s',nodes)
 const state=workbenchProgressState(plans,snapshot)
 expect(state).toMatchObject({phase:'completed',completed:3,total:3,planned:4})
 expect(state.detail).toContain('原计划 4')
 expect(state.detail).toContain('当前画布 3')
})

it('does not call an empty, missing, unknown, or inactive pending canvas completed',()=>{
 const target=new EventTarget()
 expect(workbenchProgressState(plans,null).phase).toBe('waiting')
 expect(workbenchProgressState(plans,publishResearchWorkbenchProgress(target,'s',[])).phase).toBe('empty')
 const missing=card('broken');delete missing.containerSpec
 expect(workbenchProgressState(plans,publishResearchWorkbenchProgress(target,'s',[missing])).phase).toBe('unknown')
 expect(workbenchProgressState(plans,publishResearchWorkbenchProgress(target,'s',[card('running','running')],false)).phase).toBe('inactive')
})

it('observes the current session only, including a snapshot published before the right panel mounts',()=>{
 const target=new EventTarget(),listen=vi.fn();publishResearchWorkbenchProgress(target,'s',done())
 const stop=observeResearchWorkbenchProgress(target,'s',listen)
 expect(listen).toHaveBeenCalledOnce()
 publishResearchWorkbenchProgress(target,'other',[card('other','failed')]);expect(listen).toHaveBeenCalledOnce()
 publishResearchWorkbenchProgress(target,'s',[card('retry','retrying')]);expect(listen).toHaveBeenCalledTimes(2)
 stop();publishResearchWorkbenchProgress(target,'s',done());expect(listen).toHaveBeenCalledTimes(2)
})

it('restores saved card feedback on a cold notes/chat entry without claiming a live inspection',()=>{
 const target=new EventTarget(),listen=vi.fn(),nodes=done()
 nodes[3]=card('card-3','failed')
 const stop=observeResearchWorkbenchProgress(target,'s',listen)
 expect(listen).toHaveBeenLastCalledWith(null)
 const snapshot=publishInactiveResearchWorkbenchProgress(target,'s',nodes)
 expect(snapshot).toMatchObject({sessionId:'s',active:false,retryAvailable:false})
 expect(workbenchProgressState(plans,snapshot)).toMatchObject({phase:'partial',completed:3,failed:1})
 expect(workbenchProgressState(plans,snapshot).detail).toContain('以上为上次状态')
 expect(listen).toHaveBeenLastCalledWith(snapshot)
 expect(JSON.stringify(snapshot)).not.toContain('PRIVATE')
 expect(publishInactiveResearchWorkbenchProgress(target,'s',nodes)).toBe(snapshot)
 stop()
})

it('never replaces the mounted canvas state with saved feedback, and follows saved changes after it unmounts',()=>{
 const target=new EventTarget(),nodes=done()
 nodes[3]=card('card-3','running')
 const live=publishResearchWorkbenchProgress(target,'s',nodes,true,true)
 expect(publishInactiveResearchWorkbenchProgress(target,'s',done())).toBe(live)
 expect(workbenchProgressState(plans,live).phase).toBe('running')
 publishResearchWorkbenchProgress(target,'s',nodes,false,false)
 const saved=publishInactiveResearchWorkbenchProgress(target,'s',done())
 expect(workbenchProgressState(plans,saved)).toMatchObject({phase:'completed',completed:4})
 const invalid=card('invalid');delete invalid.containerSpec
 const other=publishInactiveResearchWorkbenchProgress(target,'other',[invalid])
 expect(other.nodes[0].status).toBe('unknown')
 expect(target.__sherlockWorkbenchGenerationV1.get('s')).toBe(saved)
})

it('deduplicates actual plan receipts, rejects unrelated nodes, and translates real completion counts',()=>{
 const target=new EventTarget(),snapshot=publishResearchWorkbenchProgress(target,'s',[...done(),card('unrelated','failed',{workbenchId:'another-plan'})])
 const state=workbenchProgressState([...plans,...plans],snapshot,true)
 expect(state).toMatchObject({phase:'completed',completed:4,failed:0,planned:4,total:4})
 expect(state.title).toContain('4/4')
 expect(state.title).not.toContain('generating')
})

it('keeps successful creation receipts for a visible footer after a long final answer without reading prose as a receipt',()=>{
 const tool=id=>({kind:'tool-call',data:{root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId:id,status:'accepted',panels:['a','b']})}]}}})
 const nodes=new Map([['first',tool('first-plan')],['again',tool('first-plan')],['second',tool('second-plan')],['long-reply',{kind:'assistant-step',data:{blocks:[{kind:'text',text:'PRIVATE LONG ANSWER'.repeat(1000)}]}}]])
 expect(researchWorkbenchReceiptPlans([...nodes.keys()],nodes,planningResponseMetadata)).toEqual([{id:'first-plan',count:2},{id:'second-plan',count:2}])
})

it('anchors each persisted plan to its first actual receipt and keeps retries on that turn',()=>{
 const tool=(id,count)=>({kind:'tool-call',data:{root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId:id,status:'accepted',panelCount:count})}]}}})
 const nodes=new Map([['original',tool('first-plan',2)],['second',tool('second-plan',1)],['retry',tool('first-plan',3)],['prose',{kind:'assistant-step',data:{text:'first-plan'}}]])
 const flow=[{kind:'execution',key:'execution:1',nodeKeys:['original']},{kind:'node',key:'prose'},{kind:'execution',key:'execution:2',nodeKeys:['second','retry']},{kind:'node',key:'new-user'}]
 expect([...researchWorkbenchReceiptAnchors(flow,nodes,planningResponseMetadata)]).toEqual([['execution:1',[{id:'first-plan',count:3}]],['execution:2',[{id:'second-plan',count:1}]]])
 // A fresh restored session with a reused plan ID has its own receipt location.
 expect([...researchWorkbenchReceiptAnchors([{kind:'node',key:'retry'}],nodes,planningResponseMetadata)]).toEqual([['retry',[{id:'first-plan',count:3}]]])
 expect([...researchWorkbenchReceiptAnchors([{kind:'node',key:'prose'}],nodes,planningResponseMetadata)]).toEqual([])
})

it('places feedback after the owning turn answer and falls back to the receipt when turn metadata is absent',()=>{
 const tool=(id,turn)=>({kind:'tool-call',data:{turn,root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId:id,status:'accepted',panelCount:1})}]}}})
 const nodes=new Map([['receipt',tool('first',1)],['answer',{kind:'assistant-step',data:{turn:1}}],['tail',{kind:'turn-tail',data:{turn:1}}],['hello',{kind:'user',data:{turn:1}}],['later-answer',{kind:'assistant-step',data:{turn:2}}],['unknown',tool('second',undefined)]])
 const flow=[{kind:'execution',key:'execution:1',turn:1,nodeKeys:['receipt']},...['answer','tail','hello','later-answer','unknown'].map(key=>({kind:'node',key}))]
 expect([...researchWorkbenchReceiptAnchors(flow,nodes,planningResponseMetadata,node=>node?.data?.turn??null)]).toEqual([['tail',[{id:'first',count:1}]],['unknown',[{id:'second',count:1}]]])
})

it('keeps native pending and admitted steering from moving earlier plans to same-turn continuations',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const names=['conversationNodeTurn','assistantStepText','substantialAssistantReplies','conversationPublicReplies','conversationResponseHistory','isExecutionDetailNode','compactConversationFlow','mergePendingSteeringFlow']
 const tree=createSourceFile('client.js',source,ScriptTarget.Latest,false,ScriptKind.JS),declarations=new Map()
 const visit=node=>{if(isFunctionDeclaration(node)&&names.includes(node.name?.text))declarations.set(node.name.text,node.getText(tree));forEachChild(node,visit)};visit(tree)
 const functions=names.map(name=>{const value=declarations.get(name);if(!value)throw Error('Native flow function missing: '+name);return value})
 const native=runInNewContext(functions.join('\n')+';({conversationNodeTurn,compactConversationFlow,mergePendingSteeringFlow})')
 const location={kind:'step',turn:{turn:7}},row=(key,kind,seq,data={})=>({key,kind,anchorSeq:seq,location,data})
 const tool=(key,seq,id,count)=>row(key,'tool-call',seq,{root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId:id,status:'accepted',panelCount:count})}]}})
 const original=[row('user','user',1),tool('receipt',2,'first-plan',8),row('original-answer','assistant-step',3,{finalNode:{seq:3},blocks:[{kind:'text',text:'Fixture answer. '.repeat(15)}]})]
 const anchor=(rows,pending=[])=>{const nodes=new Map(rows.map(node=>[node.key,node]));const flow=native.mergePendingSteeringFlow(native.compactConversationFlow(rows.map(node=>node.key),nodes,7),pending,nodes);return [...researchWorkbenchReceiptAnchors(flow,nodes,planningResponseMetadata,native.conversationNodeTurn)]}
 const expected=[['original-answer',[{id:'first-plan',count:8}]]]
 expect(anchor(original)).toEqual(expected)
 expect(anchor(original,[{id:'pending',anchorSeq:4,placement:'steering',content:[]}])).toEqual(expected)
 const admitted=[...original,row('steering','steering',4)]
 expect(anchor(admitted)).toEqual(expected)
 const continued=[...admitted,row('continued-answer','assistant-step',5,{finalNode:{seq:5},blocks:[{kind:'text',text:'Fixture continuation.'}]})]
 expect(anchor(continued)).toEqual(expected)
 const final=[...continued,tool('same-plan-again',6,'first-plan',9),tool('new-plan',7,'second-plan',2),row('closing','turn-tail',8,{closing:{finalNode:{seq:8},blocks:[{kind:'text',text:'Fixture closing.'}]}})]
 expect(anchor(final)).toEqual([['original-answer',[{id:'first-plan',count:9}]],['closing',[{id:'second-plan',count:2}]]])
 expect(anchor(final.map(node=>node.key==='steering'?{...node,kind:'user'}:node))).toEqual([['original-answer',[{id:'first-plan',count:9}]],['closing',[{id:'second-plan',count:2}]]])
})

it('installs a live status for settled creation turns while preserving the existing planning-only feedback',()=>{
 const installed=restoreResearchGridWorkbench(stripConversationComponents(stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))))
 // The shared resident bundle may be from a newer integration branch. This
 // branch tests the v8 -> v9 upgrade, keeping the resident shell and
 // replacing only the in-memory feedback helper block with a v8 installation.
 // The locale hook is the sole helper change between these two versions.
 const definitions=readFileSync('scripts/lib/research-workbench-feedback.mjs','utf8')
 const helperEnd=definitions.indexOf('\nexport function patchResearchWorkbenchFeedback(')
 const v8Helpers=definitions.slice(0,helperEnd).replace(/^export /gm,'').replace(/^ const \[,renderLocale\]=react\.useState\(0\)\n react\.useEffect\([^\n]+\n/m,'')
 expect(helperEnd).toBeGreaterThan(0);expect(v8Helpers).not.toContain('renderLocale')
 const helperStart=installed.search(/\/\* ework:workbench-feedback:v\d+ \*\//),shellStart=installed.indexOf('const ExecutionStatusGroup =',helperStart)
 expect(helperStart).toBeGreaterThan(0);expect(shellStart).toBeGreaterThan(helperStart)
 const original=installed.slice(0,helperStart)+'/* ework:workbench-feedback:v8 */\n'+v8Helpers+'\n'+installed.slice(shellStart)
 expect(original.slice(0,helperStart)).toBe(installed.slice(0,helperStart))
 expect(original.slice(original.indexOf('const ExecutionStatusGroup =',helperStart))).toBe(installed.slice(shellStart))
 const source=patchResearchCreationProgress(original)
 const upgraded=patchResearchWorkbenchFeedback(original)
 expect(upgraded).toContain('/* ework:workbench-feedback:v12 */')
 expect(upgraded).toContain('const [,renderLocale]=react.useState(0)')
 expect(patchResearchWorkbenchFeedback(upgraded)).toBe(upgraded)
 expect(source).toContain('const [,renderLocale]=react.useState(0)')
 expect(source.split('/* ework:workbench-feedback:v12 */')).toHaveLength(2)
 expect(source).toContain('data-research-workbench-progress')
 expect(source).toContain('const workbenchMeta=planningResponseMetadata(activityNodes)')
 expect(source).not.toContain('sessionId, plans:workbenchMeta.plans')
 expect(source.indexOf('footer:true')).toBeGreaterThan(source.indexOf('function ChatView('))
 expect(source).toContain('researchWorkbenchReceiptAnchors(renderFlow,nodeStore,planningResponseMetadata,conversationNodeTurn)')
 expect(source).not.toContain('ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}')
 expect(source.includes('publishInactiveResearchWorkbenchProgress(window,sessionId,researchWorkspaceSnapshot2.artifacts)')).toBe(true)
 expect(source).toContain('const planningRequest=entry.running && entry.turn===runningTurnNumber')
 expect(patchResearchWorkbenchFeedback(source)).toBe(source)
 expect(patchResearchCreationProgress(source)).toBe(source)
 const start=source.indexOf('/* ework:workbench-feedback:v12 */'),end=source.indexOf('const ExecutionStatusGroup =',start)
 const element=(type,props)=>({type,props})
 let snapshot=publishResearchWorkbenchProgress(new EventTarget(),'s',done())
 const Component=runInNewContext(componentDataStatusDefinitions()+source.slice(start,end)+';ResearchWorkbenchProgress',{react:{useState:initializer=>[typeof initializer==='function'?snapshot:false,()=>{}],useEffect:()=>{},useCallback:fn=>fn,useSyncExternalStore:(_subscribe,read)=>read()},react_jsx_runtime:{jsx:element,jsxs:element},window:new EventTarget(),document:{documentElement:{dataset:{}}}})
 const view=Component({sessionId:'s',plans})
 expect(view.props['data-research-workbench-progress']).toBe('completed')
 expect(JSON.stringify(view)).toContain('4/4')
 expect(JSON.stringify(view)).not.toContain('PRIVATE')
 const footer=Component({sessionId:'s',plans,footer:true})
 expect(footer.props['data-research-workbench-footer']).toBe(true)
 expect(JSON.stringify(footer.props.children[1])).toContain('刷新状态待确认 4')
 snapshot={...snapshot,active:false}
 expect(JSON.stringify(Component({sessionId:'s',plans,footer:true}))).toContain('刷新状态待确认 4')
 snapshot={...snapshot,nodes:[{id:'pending',planId:'plan',status:'running'}]}
 expect(JSON.stringify(Component({sessionId:'s',plans,footer:true}))).toContain('上次状态')
 snapshot={...snapshot,active:true,nodes:[{id:'other',planId:'other-plan',status:'completed'}]}
 expect(Component({sessionId:'s',plans,footer:true})).toBeNull()
 const legacy=source.replace('/* ework:workbench-feedback:v12 */','/* ework:workbench-feedback:v1 */')
  .replace('\nreact.useEffect(()=>{publishInactiveResearchWorkbenchProgress(window,sessionId,researchWorkspaceSnapshot2.artifacts)},[sessionId,researchWorkspaceSnapshot2]);','')
  .replace('\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);','')
  .replace(', workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null','')
 expect(patchResearchWorkbenchFeedback(legacy)).toBe(source)
 // Simulate the installed v4 wiring, including its global footer and duplicate
 // execution status, so an existing client patch upgrades to the same output.
 const v4=source.replace('/* ework:workbench-feedback:v12 */','/* ework:workbench-feedback:v4 */')
  .replace('/* ework:workbench-flow:v1 */\nconst workbenchReceiptAnchors=researchWorkbenchReceiptAnchors(renderFlow,nodeStore,planningResponseMetadata,conversationNodeTurn);\n','')
  .replace('const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);')
  .replace('renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{','renderFlow.map((entry) => {')
  .replace('};const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];})','}), workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null')
  .replace('planningMeta && !workbenchMeta.plans.length ? react_jsx_runtime.jsx(ResearchPlanningFeedback,','workbenchMeta.plans.length&&sessionId ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId, plans:workbenchMeta.plans}) : null, planningMeta && !workbenchMeta.plans.length ? react_jsx_runtime.jsx(ResearchPlanningFeedback,')
 expect(patchResearchWorkbenchFeedback(v4)).toBe(source)
 const v7=source.replace('/* ework:workbench-feedback:v12 */','/* ework:workbench-feedback:v7 */').replace('refreshSnapshot.complete===true','true /* STALE_V7_INCOMPLETE_IS_STATIC */')
 expect(v7).toContain('STALE_V7_INCOMPLETE_IS_STATIC')
 expect(patchResearchWorkbenchFeedback(v7)).toBe(source)
 const v6=source.replace('/* ework:workbench-feedback:v12 */','/* ework:workbench-feedback:v6 */').replace("const cacheKey='__sherlockWorkbenchGenerationV1'","const cacheKey='STALE_V6_PUBLISHER'")
 expect(v6).toContain('STALE_V6_PUBLISHER')
 expect(patchResearchWorkbenchFeedback(v6)).toBe(source)
 expect(source.split('/* ework:workbench-feedback:v12 */')).toHaveLength(2)
 const v5=source.replace('/* ework:workbench-feedback:v12 */','/* ework:workbench-feedback:v5 */')
 expect(patchResearchWorkbenchFeedback(v5)).toBe(source)
})


it('reports actual refresh facts rather than the minute plan, including unmounted builtins and last observed notes',()=>{
 const target=new EventTarget(),store=createComponentDataStatusStore()
 const nodes=['static','manual','paused','configured','failed','success','native'].map(id=>card(id,'completed',id==='native'?{containerSpec:{type:'financial-widget',config:{secret:'PRIVATE'}}}:{}))
 const snapshot=publishResearchWorkbenchProgress(target,'s',nodes)
 expect(snapshot.nodes.find(n=>n.id==='native').builtin).toBe(true)
 let state=workbenchProgressState([{id:'plan',count:7}],snapshot,false,store.snapshotSession('s'))
 expect(state.refreshDetail).toContain('刷新状态待确认 7')
 store.publish('s',[
  {nodeId:'manual',status:'idle',enabled:false,intervalMinutes:0},
  {nodeId:'paused',status:'idle',enabled:false,intervalMinutes:1},
  {nodeId:'configured',status:'idle',enabled:true,intervalMinutes:1},
  {nodeId:'failed',status:'error',enabled:true,intervalMinutes:1,lastSuccess:1000},
  {nodeId:'success',status:'success',enabled:true,intervalMinutes:5,lastSuccess:2000}
 ])
 state=workbenchProgressState([{id:'plan',count:7}],snapshot,false,store.snapshotSession('s'))
 for(const text of ['静态内容 1','仅手动刷新 1','刷新已暂停 1','已配置每分钟刷新，尚无成功记录 1','最近刷新失败 1','已配置每 5 分钟刷新，最近刷新成功 1','刷新状态待确认 1'])expect(state.refreshDetail).toContain(text)
 expect(state.refreshDetail).not.toContain('已自动更新')
 store.publishNative('s','native',{status:'success',enabled:true,intervalMinutes:1,lastSuccess:3000,error:'PRIVATE'})
 expect(workbenchProgressState([{id:'plan',count:7}],snapshot,false,store.snapshotSession('s')).refreshDetail).toContain('已配置每分钟刷新，最近刷新成功 1')
 store.clearNative('s','native');store.clear('s')
 state=workbenchProgressState([{id:'plan',count:7}],{...snapshot,active:false},false,store.snapshotSession('s'))
 expect(state.refreshDetail).toContain('上次观察')
 expect(state.refreshDetail).not.toContain('正在自动')
 expect(JSON.stringify(store.snapshotSession('s'))).not.toContain('PRIVATE')
})

it('final historical refresh groups use one qualifier while mixed current and retired facts stay local',()=>{
 const target=new EventTarget(),snapshot=publishResearchWorkbenchProgress(target,'s',done())
 const rows=[{nodeId:'card-0',enabled:true,intervalMinutes:1,lastSuccess:10},{nodeId:'card-1',enabled:false,intervalMinutes:0},{nodeId:'card-2',enabled:false,intervalMinutes:5},{nodeId:'card-3',enabled:true,intervalMinutes:5,lastRefreshFailed:true}]
 const stale=workbenchProgressState(plans,{...snapshot,active:false},false,{ready:false,observed:true,complete:true,rows})
 expect(stale.refreshDetail.match(/上次观察：/g)).toHaveLength(1)
 expect(stale.refreshLines).toHaveLength(4)
 expect(stale.refreshLines.join(' ')).toContain('仅手动刷新 1')
 const mixed=workbenchProgressState(plans,snapshot,false,{ready:true,observed:true,complete:true,rows:rows.map((row,i)=>i===3?{...row,lastObserved:true}:row)})
 expect(mixed.refreshHistory).toBe('')
 expect(mixed.refreshDetail).toContain('上次观察：已配置每 5 分钟刷新，最近刷新失败 1')
 expect(mixed.refreshDetail).not.toContain('上次观察：已配置每分钟刷新')
})
