import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {patchConversationFailureCopy} from '../scripts/lib/conversation-failure-copy.mjs'
import {homeWorkbenchReceiptEvent,homeWorkbenchReceiptAnchors,homeWorkbenchProgressState,patchHomeWorkbenchProgress,stripHomeWorkbenchProgress} from '../scripts/lib/home-workbench-progress.mjs'
import {homeWorkbenchPlanReceipt} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
import {workbenchProgressState,researchWorkbenchReceiptAnchors} from '../scripts/lib/research-workbench-feedback.mjs'
const require=createRequire(import.meta.url)
const data=homeWorkbenchPlanReceipt('demo','run-1',1)
const plans=()=>data.plans.map(plan=>({...plan,replay:{runId:data.runId,phase:'running'}}))
const snapshot=(count,status='completed')=>({sessionId:'demo',active:true,nodes:Array.from({length:count},(_,i)=>({id:'node-'+i,planId:data.plans[Math.floor(i/5)].id,status}))})
const progress=(p,s)=>homeWorkbenchProgressState(p,s,false,workbenchProgressState(p,s))
it('accepts only durable typed replay registrations with exactly three real five-instance plans',()=>{
 expect(homeWorkbenchReceiptEvent({type:'home-guide/workbench',data})).toEqual(data)
 for(const bad of [{...data,kind:undefined},{...data,turn:undefined},{...data,purpose:'other'},{...data,plans:data.plans.slice(0,1)},{...data,plans:data.plans.map(p=>({...p,count:4}))}])expect(homeWorkbenchReceiptEvent({type:'home-guide/workbench',data:bad})).toBeNull()
 expect(homeWorkbenchReceiptEvent({type:'assistant/message',data})).toBeNull()
})
it('keeps all fifteen planned instances visible until actual component hydration, including hidden tabs and reused watchlists',()=>{
 const p=plans()
 for(const count of [0,5,10,14]){const state=progress(p,snapshot(count));expect(state.planned).toBe(15);expect(state.completed).toBe(count);expect(state.phase).not.toBe('completed');expect(state.title).toContain(count+'/15');expect(state.detail).toContain('待放置 '+(15-count))}
 expect(progress(p,snapshot(15))).toMatchObject({phase:'completed',completed:15,total:15})
 const pending=snapshot(15);pending.nodes[14].status='running';expect(progress(p,pending)).toMatchObject({phase:'running',completed:14,pending:1})
})
it('labels only typed demo receipts as frozen historical snapshots after a real component completes',()=>{
 const staleRefresh={refreshLines:['刷新状态待确认 11','仅手动刷新，最近刷新成功 4'],refreshHistory:'上次观察：',refreshDetail:'上次观察：刷新状态待确认 11'}
 for(const count of [1,5,15]){const p=plans(),state=homeWorkbenchProgressState(p,snapshot(count),false,{...workbenchProgressState(p,snapshot(count)),...staleRefresh});expect(state.refreshLines).toEqual(['固定历史快照 · 不接入实时更新']);expect(state.refreshHistory).toBe('');expect(state.refreshDetail).toBe('固定历史快照 · 不接入实时更新')}
 const p=plans(),empty=homeWorkbenchProgressState(p,snapshot(0),false,{...workbenchProgressState(p,snapshot(0)),...staleRefresh});expect(empty.refreshLines).toEqual([]);expect(empty.refreshDetail).toBe('')
 const ordinary=[{id:'normal-plan',count:15}],normal={...workbenchProgressState(ordinary,snapshot(15)),...staleRefresh};expect(homeWorkbenchProgressState(ordinary,snapshot(15),false,normal)).toBe(normal)
 expect(homeWorkbenchProgressState(p,snapshot(15),true,workbenchProgressState(p,snapshot(15),true)).refreshLines).toEqual(['Fixed historical snapshot · No live updates'])
})
it('pause and cancellation preserve truthful counts without generic model retry or false completion',()=>{
 const paused=plans().map(p=>({...p,replay:{...p.replay,phase:'paused'}})),stopped=plans().map(p=>({...p,replay:{...p.replay,phase:'stopped'}}))
 expect(progress(paused,snapshot(5))).toMatchObject({phase:'paused',completed:5,unplaced:10})
 const state=progress(stopped,snapshot(5));expect(state.phase).toBe('partial');expect(state.detail).toContain('未开始 10');expect(state.title).toContain('已停止')
})
it('does not resume generation if a completed replay later has a component removed',()=>{
 const p=plans().map(p=>({...p,replay:{...p.replay,phase:'completed'}})),state=progress(p,snapshot(14));expect(state.phase).toBe('partial');expect(state.title).toContain('已结束');expect(state.detail).toContain('当前画布缺少 1')
})
it('anchors a typed plan to its actual assistant turn and never moves it under the next user or steering reply',()=>{
 const map=new Map([['user',{kind:'user',anchorSeq:1}],['assistant',{kind:'assistant-step',data:{turn:1},anchorSeq:3}],['receipt',{kind:'home-workbench-plan',data:{...data,phase:'running'},anchorSeq:4}],['steer',{kind:'steering',anchorSeq:5}],['later',{kind:'assistant-step',data:{turn:1},anchorSeq:6}]])
 const flow=[...map.keys()].map(key=>({kind:'node',key})),anchors=homeWorkbenchReceiptAnchors(flow,map,n=>n?.data?.turn,researchWorkbenchReceiptAnchors(flow,map,()=>({plans:[]})))
 expect([...anchors.keys()]).toEqual(['assistant']);expect(anchors.get('assistant')).toHaveLength(3);expect(anchors.get('assistant').map(p=>p.count)).toEqual([5,5,5]);expect([...map.values()].some(n=>n.kind==='tool-call')).toBe(false)
})
it('projects and restores the typed plan through the real SessionRuntime event registry without tool calls',()=>{
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const window=Object.assign(new Window(),{__ModuleLoader__:{load:value=>{window.descriptor=value}}}),vm={window,document:window.document,console,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,AbortController,URL,Map,Set}
 const ctx={get:()=>undefined,reflect:{provide(){}},effect(start){return start()??(()=>{})}},cordis={Service:class{constructor(context){this.ctx=context}}}
 runInNewContext(readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),vm)
 const rt=window.descriptor.factory(id=>id==='@deepseek-ai/cordis'?cordis:fake)
 const original=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchHomeWorkbenchProgress(original)
 expect(stripHomeWorkbenchProgress(patched)).toBe(stripHomeWorkbenchProgress(original));expect(patchHomeWorkbenchProgress(patched)).toBe(patched)
 runInNewContext(patchConversationFailureCopy(patched).replace('exports.apply = apply;','exports.apply = apply; exports.__register=registerConversationNodes; exports.__anchors=researchWorkbenchReceiptAnchors; exports.__retry=requestResearchWorkbenchRetry;exports.__flow=compactConversationFlow;exports.__turn=conversationNodeTurn;exports.__Progress=ResearchWorkbenchProgress;'),vm)
 const native=window.descriptor.factory(id=>id==='react'?require('react'):id==='react/jsx-runtime'?require('react/jsx-runtime'):id==='@deepseek-ai/dsh-client-runtime/client'?rt:fake)
 expect(native.__anchors([{kind:'node',key:'plain'}],new Map([['plain',{kind:'assistant-step',data:{turn:1}}]]),()=>({plans:[]})).size).toBe(0)
 const events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:views})
 const runtime=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views}),session=runtime.manager.get('demo')
 const rows=[{type:'turn/start',data:{turn:1}},{type:'home-guide/workbench',data},{type:'home-guide/workbench',data:{...data,kind:'playback',playing:false}},{type:'home-guide/workbench',data:{...data,kind:'stopped'}}].map((event,seq)=>({event:{...event,seq:seq+1,time:seq+1},surface:'append'}))
 for(let repeat=0;repeat<2;repeat++){session.installWindow(rows,false);const chat=session.getSnapshot().chat,receipts=chat.nodes.values().filter(n=>n.kind==='home-workbench-plan');expect(receipts).toHaveLength(1);expect(receipts[0].data).toMatchObject({turn:1,phase:'stopped',plans:data.plans});expect(chat.nodes.values().some(n=>n.kind==='tool-call')).toBe(false);const anchors=native.__anchors(native.__flow(chat.order,chat.nodes,1),chat.nodes,()=>({plans:[]}),native.__turn);expect([...anchors.values()].flat()).toHaveLength(3)}
 const legacyError={code:'UNKNOWN',message:'演示仅接受当前固定研究需求，已停止自动执行。'}
 for(const [receiptTurn,kind,error,hidden] of [
  [1,'completed',legacyError,true],
  [2,'completed',legacyError,false],
  [1,'stopped',legacyError,false],
  [1,'completed',{...legacyError,message:'工作台保存失败'},false]
 ]){
  const history=[
   {type:'turn/start',data:{turn:1}},
   {type:'home-guide/workbench',data},
   {type:'home-guide/workbench',data:{...data,kind,turn:receiptTurn}},
   {type:'turn/end',data:{turn:1,reason:{kind:'error',error}}}
  ].map((event,seq)=>({event:{...event,seq:seq+1,time:seq+1},surface:'append'}))
  session.installWindow(history,false)
  const nodes=session.getSnapshot().chat.nodes.values()
  expect(nodes.find(node=>node.kind==='home-workbench-plan')?.data.phase).toBe(receiptTurn===1?kind:'running')
  expect(nodes.some(node=>node.kind==='turn-error')).toBe(!hidden)
 }
 // A retry attempt alone must neither complete a turn nor hide its final failure on replay.
 for (const reason of [{kind:'error',error:{code:'TRANSPORT',message:'stream ended'}},{kind:'completed'}]) {
  const retry={turn:1,step:1,retry:1,retryId:'model-attempt'}
  const history=[
   {type:'turn/start',data:{turn:1}},
   {type:'llm/retry',data:retry},
   {type:'llm/retry-started',data:retry},
   {type:'turn/end',data:{turn:1,reason}}
  ].map((event,i)=>({event:{...event,seq:i+1,time:i+1},surface:'append'}))
  session.installWindow(history,false)
  const errors=session.getSnapshot().chat.nodes.values().filter(node=>node.kind==='turn-error'&&node.visibility!=='hidden')
  expect(errors).toHaveLength(reason.kind==='error'?1:0)
 }
 window.__sherlockWorkbenchGenerationV1=new Map([['demo',snapshot(5,'cancelled')]]);vm.document.documentElement.dataset.odysseyLocale='zh'
 const stoppedPlans=plans().map(p=>({...p,replay:{...p.replay,phase:'stopped'}})),html=require('react-dom/server').renderToString(require('react').createElement(native.__Progress,{sessionId:'demo',plans:stoppedPlans,footer:true}));expect(html).toContain('data-research-workbench-progress="partial"');expect(html).not.toContain('<button');expect(html).not.toContain('animateTransform');expect(html).toContain('未开始 10');
 const target=new EventTarget();let retries=0;target.addEventListener('sherlock:workbench-retry',()=>retries++);return native.__retry(target,'demo',plans(),{...snapshot(15,'cancelled'),retryAvailable:true}).then(ok=>{expect(ok).toBe(false);expect(retries).toBe(0)})
})
