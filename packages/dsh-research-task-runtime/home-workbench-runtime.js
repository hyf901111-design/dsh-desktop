import { notifyModelDirectory, presentHomeGuideReplayRoute } from './home-guide-replay-route.js'
import {LlmAdapter} from '@deepseek-ai/dsh-llm'
import {lstat,readFile,realpath} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'
import {isHomeGuideSessionTitle,homeGuideSessionTitle} from './home-guide-session-titles.js'
import {financialWidgetDefaults} from './financial-widget-contract.js'
import {homeWorkbenchStudySpec} from './home-workbench-study-contract.js'
import {HOME_WORKBENCH_PATH,HOME_WORKBENCH_EVENT,HOME_WORKBENCH_PURPOSE,HOME_WORKBENCH_PROMPT,HOME_WORKBENCH_PANELS,homeWorkbenchNodeId,homeWorkbenchStage,homeWorkbenchPlanReceipt} from './home-workbench-contract.js'
const PROVIDER='sherlock-home-workbench'
const abort=()=>new DOMException('工作台演示已结束。','AbortError')
const identifier=value=>typeof value==='string'&&/^[\w:-]{1,128}$/.test(value)
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return {promise,resolve,reject}}
const symbols=[{market:'SH',code:'600519',name:'贵州茅台'},{market:'SZ',code:'000858',name:'五粮液'},{market:'SZ',code:'000568',name:'泸州老窖'}]
export function homeWorkbenchPreparedArtifact(sessionId,panel){
 const parent=panel.parent?homeWorkbenchNodeId(sessionId,panel.tab,panel.parent):undefined
 if(panel.role==='watchlist'||panel.role==='quote')return {...financialWidgetDefaults(panel.role),title:panel.title,symbols:panel.role==='watchlist'?symbols.map(s=>({...s})):[{...symbols[0]}],refreshMinutes:0,refreshEnabled:false,...panel.role==='watchlist'?{selectedSymbol:'SH:600519'}:{linkedWatchlistId:parent,visibleBars:120}}
 return homeWorkbenchStudySpec(panel.role,'600519',parent?{linkedSourceId:parent}:{})
}
/** The real native agent owns persisted messages; this scoped adapter never calls a network model. */
export function createHomeWorkbenchRuntime(ctx,tasks,{env=process.env}={}){
 const runs=new Map(),preparing=new Map(),cancelled=new Set(),closed=new Map();let stopped=false
 const key=input=>JSON.stringify([input?.sessionId,input?.runId])
 const current=input=>{const run=runs.get(input?.sessionId);if(stopped||!run||run.runId!==input.runId||run.cancelled||run.interrupted||ctx.agents.get(run.sessionId)!==run.agent||run.agent.session.header.cwd!==run.cwd)throw abort();return run}
 const notify=run=>{for(const wake of run.waiters)wake();run.waiters.clear()}
 const wait=async(run,predicate,signal)=>{for(;;){signal?.throwIfAborted();current(run);if(predicate())return;await new Promise((resolve,reject)=>{const clean=()=>{run.waiters.delete(wake);signal?.removeEventListener('abort',stop)},wake=()=>{clean();resolve()},stop=()=>{clean();reject(abort())};run.waiters.add(wake);signal?.addEventListener('abort',stop,{once:true})})}}
 const releaseRoute=async run=>{for(const off of run.off.splice(0))off();await Promise.resolve();const header=run.agent.session.requestHeader();if(ctx.agents.get(run.sessionId)===run.agent&&header?.config.provider===PROVIDER&&run.originalConfig.provider&&run.originalConfig.model)run.agent.session.append('request/header',{header:{...header,config:run.originalConfig},reason:'change'});notifyModelDirectory(ctx)}
 const progress=(run,kind,extra={})=>{if(run.receipt)run.agent.session.append(HOME_WORKBENCH_EVENT,{version:1,purpose:HOME_WORKBENCH_PURPOSE,runId:run.runId,turn:run.receipt.turn,kind,...extra})}
 const stopProgress=run=>{if(run.receipt&&!run.complete&&!run.progressStopped){progress(run,'stopped');run.progressStopped=true}}
 const stopRun=async run=>{if(run.cancelled)return;run.cancelled=true;stopProgress(run);notify(run);for(const gate of run.milestones.values())gate.reject(abort());const release=releaseRoute(run);if(!run.complete){await run.agent.cancel({kind:'user'});await run.agent.whenIdle()}await release}
 const summaries={3:'已收到需求，正在规划研究工作台。',5:'\n\n按三个页签组织：行情与业绩、估值与回报、公告与关注。使用2025年报、2026年一季报及2026-04-30日终快照。',6:'\n\n规划已完成，开始搭建。',14:'\n\n行情与业绩已完成，继续搭建估值与回报。',19:'\n\n估值与回报已完成，继续搭建公告与关注。',24:'\n\n工作台已搭好。可在每页自选切换公司，调整估值参数，或切换报告查看原文。'}
 class WorkbenchPreset extends LlmAdapter{
  async resolveModel(provider,id){return{provider,id,name:'工作台用例回看',context:{contextWindow:32000},defaultMaxTokens:2048}}
  async *stream(request){
   const run=current({sessionId:request.sessionId,runId:runs.get(request.sessionId)?.runId});request.signal?.throwIfAborted()
   if(request.purpose!==undefined){if(!['session-title','compaction'].includes(request.purpose))throw Error('用例不支持此辅助请求。');const text=request.purpose==='session-title'?homeGuideSessionTitle('workbench'):'白酒龙头研究工作台用例，保留固定历史数据和当前生成状态。';yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text};yield{type:'block-end',index:0,block:{type:'text',text}};yield{type:'finish',reason:{kind:'stop'}};return}
   await wait(run,()=>run.playing,request.signal)
   const user=run.agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user')
   if(run.started||user.length!==1||user[0].data.content?.filter(p=>p.type==='text').map(p=>p.text).join('')!==HOME_WORKBENCH_PROMPT||user[0].data.content.some(p=>p.type!=='text'))throw Error('演示仅接受当前固定研究需求，已停止自动执行。')
   const turn=run.agent.session.events.findLast(event=>event.type==='turn/start')?.data.turn
   if(!Number.isSafeInteger(turn)||turn<1)throw Error('当前研究轮次不可用。')
   run.turn=turn;run.started=true;run.accepted.resolve();let text='';yield{type:'block-start',index:0,blockType:'text'}
   for(let stage=3;stage<=24;stage++){
    await wait(run,()=>run.playing&&run.allowed>=stage,request.signal)
    // The canvas must hydrate its last component before the assistant can
    // declare success. Release wb24 first so the renderer can perform that work.
    if(stage===24){run.milestones.get(stage).resolve();await wait(run,()=>run.completionConfirmed&&run.playing,request.signal)}
    const addition=summaries[stage];if(addition){text+=addition;yield{type:'text-delta',index:0,text:addition}}
    if(stage===6&&!run.receipt){
     request.signal?.throwIfAborted();current(run)
     run.receipt=homeWorkbenchPlanReceipt(run.sessionId,run.runId,run.turn);run.agent.session.append(HOME_WORKBENCH_EVENT,run.receipt)
     // Playback may pause while the preceding planning delta is being consumed,
     // before a receipt exists to receive that update. Preserve its actual state.
     if(!run.playing)progress(run,'playback',{playing:false})
     if(await ctx.sessions.flush(run.agent.session)!==true)throw Error('工作台计划回执尚未保存。');request.signal?.throwIfAborted();current(run)
    }
    if(stage<24)run.milestones.get(stage).resolve()
   }
   yield{type:'block-end',index:0,block:{type:'text',text}};run.complete=true;progress(run,'completed');yield{type:'finish',reason:{kind:'stop'}}
  }
 }
 const offAdapter=ctx.llm.registerAdapter([PROVIDER],new WorkbenchPreset())
 return{
  async prepare(input){
   if(stopped||cancelled.has(key(input)))throw abort()
   if(!identifier(input?.sessionId)||!identifier(input.runId)||input.fresh!==true||typeof input.cwd!=='string'||!isAbsolute(input.cwd))throw Error('工作台示例准备参数无效。')
   if(runs.has(input.sessionId)){const run=current(input);if(run.cwd!==input.cwd)throw Error('示例目录已变化。');return run.prepared}
   if(preparing.has(input.sessionId))throw Error('示例正在准备。')
   const ticket={...input};preparing.set(input.sessionId,ticket)
   const valid=()=>{if(stopped||cancelled.has(key(input))||preparing.get(input.sessionId)!==ticket)throw abort()}
   try{
    const agent=ctx.agents.get(input.sessionId),session=agent?.session
    const empty=()=>!session?.events.some(e=>['user/message','assistant/message','tool/call','turn/start',HOME_WORKBENCH_EVENT].includes(e.type))
    if(!session||session.header.cwd!==input.cwd||session.header.parentSession||session.header.origin==='subagent'||agent.status==='running'||!empty()||typeof env.DSH_HOME!=='string')throw Error('请从首页创建独立的空白工作台示例。')
    const rows=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'));valid()
    if(!Object.values(rows).some(row=>row?.sessionId===input.sessionId&&row.path===input.cwd&&isHomeGuideSessionTitle('workbench',row.title))||(await lstat(input.cwd)).isSymbolicLink())throw Error('工作台示例目录未登记。')
    const root=await realpath(input.cwd);valid();if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||!empty())throw Error('会话已有内容，未启动回看。')
    const prepared={ready:true,brief:HOME_WORKBENCH_PROMPT,asOf:'2026-04-30',taskCount:13,instanceCount:15}
    const originalConfig=session.requestHeader()?.config??{provider:agent.options.provider,model:agent.options.model,...agent.options.maxTokens===undefined?{}:{maxTokens:agent.options.maxTokens}}
    const run={...input,root,agent,prepared,originalConfig,allowed:2,playing:false,started:false,complete:false,cancelled:false,completionConfirmed:false,waiters:new Set(),accepted:deferred(),milestones:new Map(Array.from({length:22},(_,i)=>[i+3,deferred()])),panels:new Map(),off:[]}
    session.append(HOME_WORKBENCH_EVENT,{version:1,runId:input.runId,purpose:HOME_WORKBENCH_PURPOSE,asOf:'2026-04-30',cwd:input.cwd})
    const expectedEvents=session.events.length
    if(await ctx.sessions.flush(session)!==true)throw Error('示例记录保存失败。');valid()
    if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||session.events.length!==expectedEvents||await realpath(input.cwd)!==root)throw Error('示例会话或目录已变化，未安装预置执行器。')
    runs.set(input.sessionId,run)
    run.off.push(agent.ctx.on('agent/request',()=>{current(run);return{provider:PROVIDER,model:'v1',maxTokens:2048}},{prepend:true}))
    run.off.push(ctx.on('session/event',async(owner,event)=>{if(owner!==session||event.type!=='turn/end')return;if(run.complete)return releaseRoute(run);if(event.data.reason?.kind!=='completed'){run.interrupted=true;notify(run);const error=Error(event.data.reason?.error?.message||'示例执行已停止。');run.accepted.reject(error);for(const gate of run.milestones.values())gate.reject(error);await Promise.resolve();stopProgress(run)}}))
    presentHomeGuideReplayRoute(ctx, run, PROVIDER, 2048)
    return prepared
   }finally{if(preparing.get(input.sessionId)===ticket)preparing.delete(input.sessionId)}
  },
  async playback(input){const run=current(input),playing=input.playing===true,changed=run.playing!==playing;run.playing=playing;if(changed&&!run.complete){progress(run,'playback',{playing});if(run.receipt&&await ctx.sessions.flush(run.agent.session)!==true)throw Error('工作台播放状态尚未保存。')}notify(run);return {playing:run.playing}},
  async checkpoint(input){
   const run=current(input)
   if(input.stage==='accepted'){await run.accepted.promise;current(input);return{stage:'accepted'}}
   if(input.stage==='completed'){
    const panels=HOME_WORKBENCH_PANELS.filter(panel=>!panel.reused)
    if(!run.receipt||run.allowed!==24||run.panels.size!==panels.length||panels.some(panel=>!run.panels.has(panel.tab+':'+panel.role)))throw Error('工作台组件尚未全部就绪。')
    if(!run.complete){await wait(run,()=>run.playing);const results=await Promise.all(panels.map(panel=>run.panels.get(panel.tab+':'+panel.role)));current(run);if(results.some(result=>result?.task?.state!=='completed'||!result.task.finalOutput))throw Error('工作台组件尚未全部保存。');run.completionConfirmed=true;notify(run)}
    await run.agent.whenIdle();current(run);if(!run.complete||await ctx.sessions.flush(run.agent.session)!==true)throw Error('工作台完成回执尚未保存。');return{stage:'completed'}
   }
   const stage=homeWorkbenchStage(input.stage);if(stage<3||stage>24||stage>run.allowed+1)throw Error('工作台演绎步骤顺序已变化。');run.allowed=Math.max(run.allowed,stage);notify(run);await run.milestones.get(stage).promise;current(input);return {stage:input.stage}
  },
  async panel(input){
   const run=current(input),panel=HOME_WORKBENCH_PANELS.find(p=>p.tab===input.tab&&p.role===input.role)
   if(!panel||panel.reused||input.nodeId!==homeWorkbenchNodeId(run.sessionId,panel.tab,panel.role)||run.allowed<panel.complete)throw Error('组件尚未到达当前生成阶段。')
   const id=panel.tab+':'+panel.role;if(run.panels.has(id))return run.panels.get(id)
   const artifact=homeWorkbenchPreparedArtifact(run.sessionId,panel)
   if(!artifact||typeof tasks?.startPreparedBatch!=='function')throw Error('工作台预置内容尚未就绪。')
   const promise=(async()=>{
    // Pause can arrive while a valid panel request is already crossing IPC.
    // Retain the request and its deduplication identity until play resumes.
    await wait(run,()=>run.playing);
    if(panel.parent){const parentKey=(panel.parent==='watchlist'?'overview':panel.tab)+':'+panel.parent,parent=run.panels.get(parentKey);if(!parent)throw Error('父组件内容尚未生成。');await parent}
    await wait(run,()=>run.playing);current(run);const [task]=await tasks.startPreparedBatch({parentSessionId:run.sessionId,panels:[{canvasNodeId:input.nodeId,prompt:'白酒龙头 · '+panel.title,artifact}]});current(run);if(task?.state!=='completed'||!task.taskId||!task.finalOutput)throw Error('组件结果尚未保存。');return{task}})()
   run.panels.set(id,promise);try{return await promise}catch(error){if(run.panels.get(id)===promise)run.panels.delete(id);throw error}
  },
  async flush(input){if(closed.has(key(input)))return await closed.get(key(input));const run=current(input);if(run.complete)await run.agent.whenIdle();if(await ctx.sessions.flush(run.agent.session)!==true)throw Error('研究会话尚未保存。');return{saved:true}},
  async disposeRun(input){
   if(closed.has(key(input)))return await closed.get(key(input));cancelled.add(key(input));if(cancelled.size>256)cancelled.delete(cancelled.values().next().value)
   if(preparing.get(input.sessionId)?.runId===input.runId)preparing.delete(input.sessionId)
   const run=runs.get(input.sessionId);if(run?.runId!==input.runId)return{}
   const closing=(async()=>{run.accepted.reject(abort());await stopRun(run);if(await ctx.sessions.flush(run.agent.session)!==true)throw Error('研究会话尚未保存。');if(runs.get(input.sessionId)===run)runs.delete(input.sessionId);return{saved:true}})();closed.set(key(input),closing);closing.catch(()=>{});if(closed.size>64)closed.delete(closed.keys().next().value);return await closing
  },
  async dispose(){if(stopped)return;stopped=true;for(const run of runs.values()){run.accepted.reject(abort());await stopRun(run)}offAdapter();runs.clear();preparing.clear()}
 }
}
export function registerHomeWorkbenchRuntime(ctx,tasks,{isTrustedRequest,readJsonBody,env=process.env}){
 const runtime=createHomeWorkbenchRuntime(ctx,tasks,{env})
 const off=ctx.webServer.register({kind:'exact',path:HOME_WORKBENCH_PATH,handler:async(req,res)=>{
  let status=200,payload
  try{if(req.method!=='POST'||!isTrustedRequest(req,true)){status=403;throw Error('示例请求未授权。')}const input=await readJsonBody(req),methods={prepare:'prepare',playback:'playback',checkpoint:'checkpoint',panel:'panel',flush:'flush',dispose:'disposeRun'},method=methods[input?.action];if(!method||Object.keys(input).some(k=>!['action','sessionId','runId','cwd','fresh','playing','stage','tab','role','nodeId'].includes(k)))throw Error('工作台示例命令无效。');payload={ok:true,...await runtime[method](input)}}catch(error){if(status===200)status=409;payload={ok:false,message:error?.message||'工作台演示暂未就绪。'}}
  if(!res.destroyed){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload))}
 }})
 return async()=>{off();await runtime.dispose()}
}
