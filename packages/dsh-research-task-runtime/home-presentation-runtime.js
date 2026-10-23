import {LlmAdapter} from '@deepseek-ai/dsh-llm'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash} from 'node:crypto'
import {lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'

export const HOME_PRESENTATION_BRIEF='请制作一页 EWork Odyssey 产品介绍，沿用公司品牌模板，突出产品定位、关键能力与使用价值。\n\n这是离线预置操作示例，不调用模型。'
export const HOME_PRESENTATION_FILE='公司风格演示示例.pptx'
export const HOME_PRESENTATION_PATH='/sherlock/home-guide/presentation'
const PROVIDER='sherlock-home-presentation',EVENT='home-guide/presentation',TOOL='home_presentation_publish'
const SOURCE_HASH='0339571db281bad6a2d45e36ca0d75505c8614e521a8e322576f99b9564074ff'
const labels=['核对品牌与演示目标','安排信息层级与页面结构','完成版式并交付可编辑文件']
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const aborted=()=>new DOMException('离线示例已停止。','AbortError')
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return{promise,resolve,reject}}
const checkedString=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\x00-\x1f]/.test(value)

/** A distinct provider, scoped to one new native session. It never forwards to a model. */
export function createHomePresentationRuntime(ctx,{env=process.env}={}){
 const runs=new Map(),preparing=new Set();let stopped=false
 const current=(input)=>{const run=runs.get(input.sessionId);if(stopped||!run||run.runId!==input.runId||run.cancelled||ctx.agents.get(run.agent.id)!==run.agent||run.agent.session.header.cwd!==run.cwd)throw aborted();return run}
 const notify=run=>{for(const wake of run.waiters)wake();run.waiters.clear()}
 const wait=async(run,condition,signal)=>{
  for(;;){signal?.throwIfAborted();current(run);if(condition())return
   await new Promise((resolve,reject)=>{const finish=()=>{run.waiters.delete(finish);signal?.removeEventListener('abort',abort);resolve()},abort=()=>{run.waiters.delete(finish);reject(aborted())};run.waiters.add(finish);signal?.addEventListener('abort',abort,{once:true})})
  }
 }
 const todo=(phase)=>labels.map((content,index)=>({content,status:phase>=3||index<phase?'completed':index===phase?'in_progress':'pending'}))
 const emitText=function*(text){yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text};yield{type:'block-end',index:0,block:{type:'text',text}}}
 const emitTool=function*(name,args,id){yield{type:'block-start',index:1,blockType:'tool-call'};yield{type:'block-end',index:1,block:{type:'tool-call',id,name,arguments:JSON.stringify(args)}};yield{type:'finish',reason:{kind:'tool-calls'}}}
 class PresetAdapter extends LlmAdapter{
  async resolveModel(provider,model){return{provider,id:model,name:'离线预置演示',context:{contextWindow:32000},defaultMaxTokens:1024}}
  async *stream(request){
   const run=current({sessionId:request.sessionId,runId:runs.get(request.sessionId)?.runId});await wait(run,()=>run.playing,request.signal)
   const user=run.agent.session.events.filter(e=>e.type==='user/message')
   if(user.length!==1||user[0].data.content?.filter(block=>block.type==='text').map(block=>block.text).join('')!==HOME_PRESENTATION_BRIEF)throw Error('离线预置只接受本次示例需求，请使用普通新对话继续。')
   const n=run.sequence++
   if(n===0){await wait(run,()=>run.playing&&run.allowed>=1,request.signal);yield*emitText('这是离线预置示例。我会先确认演示目标，再整理信息层级，最后交付公司模板的一页可编辑演示文稿。');yield*emitTool('todo_write',{todos:todo(0)},'home-plan')}
   else if(n===1){run.milestones.get('plan').resolve();await wait(run,()=>run.playing&&run.allowed>=2,request.signal);yield*emitText('页面采用标题与左右分区：左侧说明产品定位与价值，右侧用结构化图形呈现核心能力，保留公司品牌规范与留白。');yield*emitTool('todo_write',{todos:todo(1)},'home-layout')}
   else if(n===2){run.milestones.get('layout').resolve();await wait(run,()=>run.playing&&run.allowed>=3,request.signal);yield*emitTool(TOOL,{},'home-publish')}
   else if(n===3){if(!run.published)throw Error('预置文件未能保存。');yield*emitTool('todo_write',{todos:todo(3)},'home-complete')}
   else if(n===4){yield*emitText('已完成公司风格演示示例。\n\n[打开可编辑演示文稿](./'+HOME_PRESENTATION_FILE+')\n\n离线预置示例：本次展示使用客户端内置的一页成稿，不调用模型。文件和这段对话会保留，可随时回访。');yield{type:'finish',reason:{kind:'stop'}};run.complete=true;run.milestones.get('deliver').resolve()}
   else throw Error('预置示例已结束，请在普通新对话中继续。')
  }
 }
 const offAdapter=ctx.llm.registerAdapter([PROVIDER],new PresetAdapter())
 const cancel=async run=>{if(run.cancelled)return;run.cancelled=true;notify(run);for(const gate of run.milestones.values())gate.reject(aborted());if(!run.complete){await run.agent.cancel({kind:'user'});await run.agent.whenIdle()}for(const off of run.off.splice(0))off()}
 return{
  async prepare(input){
   if(stopped||!checkedString(input?.sessionId)||!checkedString(input.runId)||input.fresh!==true||typeof input.cwd!=='string'||!isAbsolute(input.cwd)||preparing.has(input.sessionId))throw Error('示例会话准备参数无效。')
   if(runs.has(input.sessionId)){const run=current(input);if(run.cwd!==input.cwd)throw Error('示例目录已变化。');return{ready:true}}
   preparing.add(input.sessionId)
   try{
    const agent=ctx.agents.get(input.sessionId),session=agent?.session
    if(!agent||session.header.cwd!==input.cwd||session.header.parentSession||session.header.origin==='subagent'||agent.status==='running'||session.events.some(e=>['user/message','assistant/message','tool/call','turn/start',EVENT].includes(e.type)))throw Error('演示只能在新建的独立空白会话中启动。')
    if(typeof env.DSH_HOME!=='string'||typeof env.DSH_BUNDLED_SKILL_DIR!=='string')throw Error('客户端示例资源尚未就绪。')
    const rows=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'))
    if(!Object.values(rows).some(row=>row.sessionId===session.id&&row.path===input.cwd&&/^公司风格演示示例(?: · 练习副本)?$/.test(row.title)))throw Error('示例会话未登记专属目录。')
    await mkdir(input.cwd,{recursive:true});if((await lstat(input.cwd)).isSymbolicLink())throw Error('示例目录不能是符号链接。');const root=await realpath(input.cwd)
    const source=join(env.DSH_BUNDLED_SKILL_DIR,'efund-ppt-maker','assets','efund-ework-onepage.pptx'),info=await lstat(source)
    if(!info.isFile()||info.isSymbolicLink())throw Error('固定演示资源不可用。')
    const bytes=await readFile(source);if(hash(bytes)!==SOURCE_HASH)throw Error('内置演示文件校验失败。')
    if(stopped||ctx.agents.get(input.sessionId)!==agent||session.events.some(e=>['user/message','assistant/message','turn/start',EVENT].includes(e.type)))throw Error('会话已有内容或执行器已停止，未启动演示。')
    const run={...input,root,agent,bytes,sequence:0,allowed:0,playing:false,cancelled:false,complete:false,waiters:new Set(),milestones:new Map(['plan','layout','deliver'].map(stage=>[stage,deferred()])),off:[]}
    session.append(EVENT,{version:1,runId:run.runId,purpose:'offline-company-presentation',cwd:run.cwd})
    if(!(await ctx.sessions.flush(session)))throw Error('示例所有权未能保存。')
    if(stopped||ctx.agents.get(input.sessionId)!==agent)throw aborted()
    runs.set(session.id,run)
    run.off.push(ctx.on('session/event',(session,event)=>{if(session===agent.session&&event.type==='turn/end'&&event.data.reason?.kind!=='completed'&&!run.complete){for(const gate of run.milestones.values())gate.reject(Error(event.data.reason?.error?.message||'示例执行已停止。'))}}))
    run.off.push(agent.ctx.on('agent/request',()=>{current(run);return{provider:PROVIDER,model:'v1',maxTokens:1024}}))
    run.off.push(agent.ctx.tools.register(defineTool({name:TOOL,description:'交付本次离线预置演示的一页公司模板，不能接受路径或内容参数。',parameters:{},output:{schema:{type:'string'},render:(_args,result)=>[{type:'text',text:result}]},async execute(args,exec){
     current(run);exec.signal?.throwIfAborted();if(exec.agent!==agent||Object.keys(args).length||!run.playing||run.allowed!==3)throw Error('示例交付上下文已变化。')
     if(await realpath(run.cwd)!==run.root)throw Error('示例目录已变化。')
     await writeFile(join(run.cwd,HOME_PRESENTATION_FILE),run.bytes,{flag:'wx',mode:0o600})
     run.published=true;return'已保存 '+HOME_PRESENTATION_FILE+'（离线预置，可编辑 PPTX）。'
    }})))
    return{ready:true}
   }finally{preparing.delete(input.sessionId)}
  },
  async playback(input){const run=current(input);run.playing=input.playing===true;notify(run);return{playing:run.playing}},
  async checkpoint(input){const run=current(input),index=['plan','layout','deliver'].indexOf(input.stage);if(index<0||index+1<run.allowed||index>run.allowed)throw Error('示例步骤顺序已变化。');run.allowed=index+1;notify(run);await run.milestones.get(input.stage).promise;return{stage:input.stage}},
  async disposeRun(input){const run=runs.get(input.sessionId);if(run?.runId===input.runId){await cancel(run);if(runs.get(input.sessionId)===run)runs.delete(input.sessionId)}return{}},
  async dispose(){if(stopped)return;stopped=true;for(const run of runs.values())await cancel(run);offAdapter();runs.clear()}
 }
}

export function registerHomePresentationRuntime(ctx,{isTrustedRequest,readJsonBody,env=process.env}){
 const runtime=createHomePresentationRuntime(ctx,{env})
 const off=ctx.webServer.register({kind:'exact',path:HOME_PRESENTATION_PATH,handler:async(req,res)=>{
  let status=200,payload
  try{if(req.method!=='POST'||!isTrustedRequest(req,true)){status=403;throw Error('示例请求未授权。')}
   const input=await readJsonBody(req),methods={prepare:'prepare',playback:'playback',checkpoint:'checkpoint',dispose:'disposeRun'},method=methods[input.action]
   if(!method||Object.keys(input).some(key=>!['action','sessionId','cwd','runId','fresh','playing','stage'].includes(key)))throw Error('示例命令无效。')
   payload={ok:true,...await runtime[method](input)}
  }catch(error){if(status===200)status=409;payload={ok:false,message:error?.message||'离线示例暂未就绪。'}}
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload))
 }})
 return async()=>{off();await runtime.dispose()}
}
