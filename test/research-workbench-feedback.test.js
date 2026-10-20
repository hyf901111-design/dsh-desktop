import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {publishResearchWorkbenchProgress,observeResearchWorkbenchProgress,workbenchProgressState,patchResearchWorkbenchFeedback} from '../scripts/lib/research-workbench-feedback.mjs'
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

it('deduplicates actual plan receipts, rejects unrelated nodes, and translates real completion counts',()=>{
 const target=new EventTarget(),snapshot=publishResearchWorkbenchProgress(target,'s',[...done(),card('unrelated','failed',{workbenchId:'another-plan'})])
 const state=workbenchProgressState([...plans,...plans],snapshot,true)
 expect(state).toMatchObject({phase:'completed',completed:4,failed:0,planned:4,total:4})
 expect(state.title).toContain('4/4')
 expect(state.title).not.toContain('generating')
})

it('installs a live status for settled creation turns while preserving the existing planning-only feedback',()=>{
 const original=restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const source=patchResearchCreationProgress(original)
 expect(source).toContain('data-research-workbench-progress')
 expect(source).toContain('const workbenchMeta=planningResponseMetadata(activityNodes)')
 expect(source).toContain('sessionId, plans:workbenchMeta.plans')
 expect(source).toContain('const planningRequest=entry.running && entry.turn===runningTurnNumber')
 expect(patchResearchWorkbenchFeedback(source)).toBe(source)
 expect(patchResearchCreationProgress(source)).toBe(source)
 const start=source.indexOf('/* ework:workbench-feedback:v1 */'),end=source.indexOf('const ExecutionStatusGroup =',start)
 const element=(type,props)=>({type,props})
 const snapshot=publishResearchWorkbenchProgress(new EventTarget(),'s',done())
 const Component=runInNewContext(source.slice(start,end)+';ResearchWorkbenchProgress',{react:{useState:initializer=>[snapshot,()=>{}],useEffect:()=>{}},react_jsx_runtime:{jsx:element,jsxs:element},window:new EventTarget(),document:{documentElement:{dataset:{}}}})
 const view=Component({sessionId:'s',plans})
 expect(view.props['data-research-workbench-progress']).toBe('completed')
 expect(JSON.stringify(view)).toContain('4/4')
 expect(JSON.stringify(view)).not.toContain('PRIVATE')
})
