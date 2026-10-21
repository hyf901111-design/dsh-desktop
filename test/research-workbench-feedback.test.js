import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {publishResearchWorkbenchProgress,publishInactiveResearchWorkbenchProgress,observeResearchWorkbenchProgress,workbenchProgressState,patchResearchWorkbenchFeedback,researchWorkbenchReceiptPlans,researchWorkbenchReceiptAnchors} from '../scripts/lib/research-workbench-feedback.mjs'
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

it('installs a live status for settled creation turns while preserving the existing planning-only feedback',()=>{
 const original=restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const source=patchResearchCreationProgress(original)
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
 const start=source.indexOf('/* ework:workbench-feedback:v5 */'),end=source.indexOf('const ExecutionStatusGroup =',start)
 const element=(type,props)=>({type,props})
 let snapshot=publishResearchWorkbenchProgress(new EventTarget(),'s',done())
 const Component=runInNewContext(source.slice(start,end)+';ResearchWorkbenchProgress',{react:{useState:initializer=>[snapshot,()=>{}],useEffect:()=>{}},react_jsx_runtime:{jsx:element,jsxs:element},window:new EventTarget(),document:{documentElement:{dataset:{}}}})
 const view=Component({sessionId:'s',plans})
 expect(view.props['data-research-workbench-progress']).toBe('completed')
 expect(JSON.stringify(view)).toContain('4/4')
 expect(JSON.stringify(view)).not.toContain('PRIVATE')
 const footer=Component({sessionId:'s',plans,footer:true})
 expect(footer.props['data-research-workbench-footer']).toBe(true)
 expect(footer.props.children[1]).toBeNull()
 snapshot={...snapshot,active:false}
 expect(Component({sessionId:'s',plans,footer:true})).toBeNull()
 snapshot={...snapshot,nodes:[{id:'pending',planId:'plan',status:'running'}]}
 expect(JSON.stringify(Component({sessionId:'s',plans,footer:true}))).toContain('上次状态')
 snapshot={...snapshot,active:true,nodes:[{id:'other',planId:'other-plan',status:'completed'}]}
 expect(Component({sessionId:'s',plans,footer:true})).toBeNull()
 const legacy=source.replace('/* ework:workbench-feedback:v5 */','/* ework:workbench-feedback:v1 */')
  .replace('\nreact.useEffect(()=>{publishInactiveResearchWorkbenchProgress(window,sessionId,researchWorkspaceSnapshot2.artifacts)},[sessionId,researchWorkspaceSnapshot2]);','')
  .replace('\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);','')
  .replace(', workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null','')
 expect(patchResearchWorkbenchFeedback(legacy)).toBe(source)
 // Simulate the installed v4 wiring, including its global footer and duplicate
 // execution status, so an existing client patch upgrades to the same output.
 const v4=source.replace('/* ework:workbench-feedback:v5 */','/* ework:workbench-feedback:v4 */')
  .replace('/* ework:workbench-flow:v1 */\nconst workbenchReceiptAnchors=researchWorkbenchReceiptAnchors(renderFlow,nodeStore,planningResponseMetadata,conversationNodeTurn);\n','')
  .replace('const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);\nconst workbenchReceiptPlans=researchWorkbenchReceiptPlans(order,nodeStore,planningResponseMetadata);')
  .replace('renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{','renderFlow.map((entry) => {')
  .replace('};const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];})','}), workbenchReceiptPlans.length ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:workbenchReceiptPlans,footer:true}) : null')
  .replace('planningMeta && !workbenchMeta.plans.length ? react_jsx_runtime.jsx(ResearchPlanningFeedback,','workbenchMeta.plans.length&&sessionId ? react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId, plans:workbenchMeta.plans}) : null, planningMeta && !workbenchMeta.plans.length ? react_jsx_runtime.jsx(ResearchPlanningFeedback,')
 expect(patchResearchWorkbenchFeedback(v4)).toBe(source)
})
