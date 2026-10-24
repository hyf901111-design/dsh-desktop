import {LlmAdapter} from '@deepseek-ai/dsh-llm'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash} from 'node:crypto'
import {lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'
import {fileURLToPath} from 'node:url'

export function createHomePresentationBrief(metadata){return `请根据附件中的 Vanguard《2026年经济与市场展望》，制作${metadata.presentationSlides}页符合公司品牌与模板规范的投资研究汇报PPT，主题为「人工智能周期与资产配置」。\n设置符合公司规范的目录与章节导航，围绕AI资本开支、增长与估值的张力、2026年宏观基准情景及相对配置逻辑，形成有证据支撑的专业研究观点。充分呈现关键数据、可编辑图表与对比分析，逐页标注原报告页码和数据时点；保留历史预测口径，不将其表述为当前投资建议。`}
export const HOME_PRESENTATION_FILE='人工智能周期与资产配置.pptx'
export const HOME_PRESENTATION_SOURCE_FILE='Vanguard-2026经济与市场展望.pdf'
export const HOME_PRESENTATION_PATH='/sherlock/home-guide/presentation'
const PROVIDER='sherlock-home-presentation',EVENT='home-guide/presentation',TOOL='home_presentation_publish'
const SOURCE_HASH='af3b10b6b05f8ee4734b35bfaeb3f272a370133a7949b7203f87cacf4c9de229'
const SKILL_WIRE='ework-skill-'+createHash('sha256').update('builtin:efund-ppt-maker').digest('hex').slice(0,16)
const labels=metadata=>['研读原始研报，核对观点与数据时点',`编排${metadata.presentationSlides}页汇报，重绘图表并标注来源`,'套用公司模板，校验并交付可编辑PPT']
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const aborted=()=>new DOMException('离线示例已停止。','AbortError')
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return{promise,resolve,reject}}
const checkedString=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\x00-\x1f]/.test(value)
const message=run=>'/'+SKILL_WIRE+' 📎 文件：`'+run.sourcePath.replaceAll('`','\\`')+'` \n'+run.prepared.brief

/** Only the two packaged, hash-checked research example assets may be copied. */
export async function loadHomePresentationAssets(directory=fileURLToPath(new URL('./assets/home-presentation/',import.meta.url))){
 const read=async name=>{const path=join(directory,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('固定研报示例资源不可用。');return readFile(path)}
 const metadata=JSON.parse((await read('source-metadata.json')).toString('utf8'))
 if(metadata.schemaVersion!==1||metadata.sourceFile!=='source-report.pdf'||metadata.presentationFile!=='company-research-briefing.pptx'||metadata.sourceSha256!==SOURCE_HASH||!/^[a-f0-9]{64}$/.test(metadata.presentationSha256)||metadata.sourcePages!==28||!Number.isInteger(metadata.presentationSlides)||metadata.presentationSlides<8||metadata.presentationSlides>24||metadata.historicalResearchExample!==true||metadata.localPresetOnly!==true||!Array.isArray(metadata.pageOutline)||metadata.pageOutline.length!==metadata.presentationSlides||metadata.pageOutline.some((page,index)=>page.slide!==index+1||!checkedString(page.title)||!Array.isArray(page.sourcePages)||page.sourcePages.some(n=>!Number.isInteger(n)||n<1||n>28)))throw Error('内置研报示例清单无效。')
 const [sourceBytes,bytes]=await Promise.all([read(metadata.sourceFile),read(metadata.presentationFile)])
 if(hash(sourceBytes)!==metadata.sourceSha256||hash(bytes)!==metadata.presentationSha256||sourceBytes.subarray(0,5).toString()!=='%PDF-'||bytes.subarray(0,2).toString()!=='PK')throw Error('内置研报示例文件校验失败。')
 return{metadata,sourceBytes,bytes}
}

/** A distinct provider, scoped to one new native session. It never forwards to a model. */
export function createHomePresentationRuntime(ctx,{env=process.env}={}){
 const runs=new Map(),preparing=new Map(),cancelledRuns=new Set();let stopped=false
 const key=input=>JSON.stringify([input?.sessionId,input?.runId])
 const rememberCancellation=input=>{cancelledRuns.add(key(input));if(cancelledRuns.size>256)cancelledRuns.delete(cancelledRuns.values().next().value)}
 const current=(input)=>{const run=runs.get(input.sessionId);if(stopped||!run||run.runId!==input.runId||run.cancelled||ctx.agents.get(run.agent.id)!==run.agent||run.agent.session.header.cwd!==run.cwd)throw aborted();return run}
 const notify=run=>{for(const wake of run.waiters)wake();run.waiters.clear()}
 const wait=async(run,condition,signal)=>{
  for(;;){signal?.throwIfAborted();current(run);if(condition())return
   await new Promise((resolve,reject)=>{const finish=()=>{run.waiters.delete(finish);signal?.removeEventListener('abort',abort);resolve()},abort=()=>{run.waiters.delete(finish);reject(aborted())};run.waiters.add(finish);signal?.addEventListener('abort',abort,{once:true})})
  }
 }
 const todo=(run,phase)=>labels(run.metadata).map((content,index)=>({content,status:phase>=3||index<phase?'completed':index===phase?'in_progress':'pending'}))
 const emitText=async function*(run,text,signal){yield{type:'block-start',index:0,blockType:'text'};for(let i=0;i<text.length;i+=9){await wait(run,()=>run.playing,signal);yield{type:'text-delta',index:0,text:text.slice(i,i+9)};await new Promise(resolve=>setTimeout(resolve,28))}yield{type:'block-end',index:0,block:{type:'text',text}}}
 const emitTool=function*(name,args,id){yield{type:'block-start',index:1,blockType:'tool-call'};yield{type:'block-end',index:1,block:{type:'tool-call',id,name,arguments:JSON.stringify(args)}};yield{type:'finish',reason:{kind:'tool-calls'}}}
 class PresetAdapter extends LlmAdapter{
  async resolveModel(provider,model){return{provider,id:model,name:'离线预置演示',context:{contextWindow:32000},defaultMaxTokens:1024}}
  async *stream(request){
   const run=current({sessionId:request.sessionId,runId:runs.get(request.sessionId)?.runId});await wait(run,()=>run.playing,request.signal)
   const user=run.agent.session.events.filter(e=>e.type==='user/message')
   if(user.length!==1||user[0].data.content?.filter(block=>block.type==='text').map(block=>block.text).join('')!==message(run))throw Error('离线预置只接受本次研报附件和制作需求，请退出演示后继续。')
   const n=run.sequence++
   if(n===0){await wait(run,()=>run.playing&&run.allowed>=1,request.signal);yield*emitText(run,`已收到 Vanguard 的28页原始研报。这是一份发表于2025年12月10日的历史展望，预测面向2026年。我会保留原报告的预测口径，先提炼观点与证据，再按公司规范组织成${run.metadata.presentationSlides}页内部汇报，包含目录、章节导航、专业解读与可编辑数据图表。`,request.signal);yield*emitTool('todo_write',{todos:todo(run,0)},'home-plan')}
   else if(n===1){run.milestones.get('plan').resolve();await wait(run,()=>run.playing&&run.allowed>=2,request.signal);yield*emitText(run,'汇报按以下结构展开：\n\n'+run.metadata.pageOutline.map(page=>page.slide+'. '+page.title).join('\n')+'\n\n采用公司品牌模板，重绘可编辑图表与表格；预测、情景假设和风险说明分别标注，逐页保留原报告页码。',request.signal);yield*emitTool('todo_write',{todos:todo(run,1)},'home-layout')}
   else if(n===2){run.milestones.get('layout').resolve();await wait(run,()=>run.playing&&run.allowed>=3,request.signal);yield*emitTool(TOOL,{},'home-publish')}
   else if(n===3){if(!run.published)throw Error('预置文件未能保存。');yield*emitTool('todo_write',{todos:todo(run,3)},'home-complete')}
   else if(n===4){yield*emitText(run,'已完成《人工智能周期与资产配置》'+run.metadata.presentationSlides+'页公司风格汇报，含目录、章节导航与可编辑数据图表。\n\n[打开可编辑演示文稿](./'+HOME_PRESENTATION_FILE+')\n\n[查看原始研究报告](./'+HOME_PRESENTATION_SOURCE_FILE+')\n\n已核对原报告页码、预测时点及图表口径。原研报、PPT和制作记录均已保存，可回到这段会话继续使用。\n\n本教程使用离线预制成稿，不调用模型；内容仅演示历史研报转换流程。',request.signal);yield{type:'finish',reason:{kind:'stop'}};run.complete=true;run.milestones.get('deliver').resolve()}
   else throw Error('预置示例已结束，请在普通新对话中继续。')
  }
 }
 const offAdapter=ctx.llm.registerAdapter([PROVIDER],new PresetAdapter())
 const releaseRoute=async run=>{for(const off of run.off.splice(0))off();await Promise.resolve();const header=run.agent.session.requestHeader();if(ctx.agents.get(run.agent.id)===run.agent&&header?.config.provider===PROVIDER&&run.originalConfig.provider&&run.originalConfig.model)run.agent.session.append('request/header',{header:{...header,config:run.originalConfig},reason:'change'})}
 const cancel=async run=>{if(run.cancelled)return;run.cancelled=true;const released=releaseRoute(run);notify(run);for(const gate of run.milestones.values())gate.reject(aborted());if(!run.complete){await run.agent.cancel({kind:'user'});await run.agent.whenIdle()}await released}
 return{
  async prepare(input){
   if(stopped||cancelledRuns.has(key(input)))throw aborted()
   if(!checkedString(input?.sessionId)||!checkedString(input.runId)||input.fresh!==true||typeof input.cwd!=='string'||!isAbsolute(input.cwd)||preparing.has(input.sessionId))throw Error('示例会话准备参数无效。')
   if(runs.has(input.sessionId)){const run=current(input);if(run.cwd!==input.cwd)throw Error('示例目录已变化。');return run.prepared}
   const ticket={...input,cancelled:false};preparing.set(input.sessionId,ticket)
   const checkPreparing=()=>{if(stopped||ticket.cancelled||preparing.get(input.sessionId)!==ticket||cancelledRuns.has(key(input)))throw aborted()}
   try{
    const agent=ctx.agents.get(input.sessionId),session=agent?.session
    if(!agent||session.header.cwd!==input.cwd||session.header.parentSession||session.header.origin==='subagent'||agent.status==='running'||session.events.some(e=>['user/message','assistant/message','tool/call','turn/start',EVENT].includes(e.type)))throw Error('演示只能在新建的独立空白会话中启动。')
    if(typeof env.DSH_HOME!=='string')throw Error('客户端示例资源尚未就绪。')
    const rows=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'))
    if(!Object.values(rows).some(row=>row.sessionId===session.id&&row.path===input.cwd&&/^公司风格演示示例(?: · 练习副本)?$/.test(row.title)))throw Error('示例会话未登记专属目录。')
    await mkdir(input.cwd,{recursive:true});if((await lstat(input.cwd)).isSymbolicLink())throw Error('示例目录不能是符号链接。');const root=await realpath(input.cwd)
    const {metadata,sourceBytes,bytes}=await loadHomePresentationAssets()
    checkPreparing()
    if(ctx.agents.get(input.sessionId)!==agent||session.events.some(e=>['user/message','assistant/message','turn/start',EVENT].includes(e.type)))throw Error('会话已有内容或执行器已停止，未启动演示。')
    const sourcePath=join(input.cwd,HOME_PRESENTATION_SOURCE_FILE)
    if(await realpath(input.cwd)!==root)throw Error('示例目录已变化。')
    await writeFile(sourcePath,sourceBytes,{flag:'wx',mode:0o600});checkPreparing()
    if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||session.events.some(e=>['user/message','assistant/message','turn/start',EVENT].includes(e.type)))throw Error('会话内容已变化，未启动演示。')
    const prepared={ready:true,brief:createHomePresentationBrief(metadata),sourcePath,presentationPath:join(input.cwd,HOME_PRESENTATION_FILE),sourceTitle:metadata.sourceTitle,publicationDate:metadata.publicationDate,outline:metadata.pageOutline.map(page=>({slide:page.slide,title:page.title}))}
    const originalConfig=session.requestHeader()?.config??{provider:agent.options.provider,model:agent.options.model,...agent.options.maxTokens===undefined?{}:{maxTokens:agent.options.maxTokens}}
    const run={...input,root,agent,bytes,sourceBytes,sourcePath,metadata,prepared,originalConfig,sequence:0,allowed:0,playing:false,cancelled:false,complete:false,waiters:new Set(),milestones:new Map(['plan','layout','deliver'].map(stage=>[stage,deferred()])),off:[]}
    session.append(EVENT,{version:2,runId:run.runId,purpose:'offline-investment-report-presentation',cwd:run.cwd,sourceFile:HOME_PRESENTATION_SOURCE_FILE,presentationFile:HOME_PRESENTATION_FILE,sourceSha256:metadata.sourceSha256,presentationSha256:metadata.presentationSha256})
    const expectedEventCount=session.events.length
    if(!(await ctx.sessions.flush(session)))throw Error('示例所有权未能保存。')
    checkPreparing()
    if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||session.events.length!==expectedEventCount)throw Error('会话内容已变化，未启动演示。')
    runs.set(session.id,run)
    run.off.push(ctx.on('session/event',(session,event)=>{if(session!==agent.session||event.type!=='turn/end')return;if(run.complete){return releaseRoute(run)}else if(event.data.reason?.kind!=='completed'){for(const gate of run.milestones.values())gate.reject(Error(event.data.reason?.error?.message||'示例执行已停止。'))}}))
    // The ordinary host installs its own outer model-selection waterfall.
    // This scoped preset must veto that route, including its post-next override.
    run.off.push(agent.ctx.on('agent/request',()=>{current(run);return{provider:PROVIDER,model:'v1',maxTokens:1024}},{prepend:true}))
    run.off.push(agent.ctx.tools.register(defineTool({name:TOOL,description:`交付基于固定Vanguard研报预制的${metadata.presentationSlides}页公司风格PPT，不能接受路径或内容参数。`,parameters:{},output:{schema:{type:'string'},render:(_args,result)=>[{type:'text',text:result}]},async execute(args,exec){
     current(run);exec.signal?.throwIfAborted();if(exec.agent!==agent||Object.keys(args).length||!run.playing||run.allowed!==3)throw Error('示例交付上下文已变化。')
     if(await realpath(run.cwd)!==run.root)throw Error('示例目录已变化。')
     const sourceInfo=await lstat(run.sourcePath);if(!sourceInfo.isFile()||sourceInfo.isSymbolicLink()||hash(await readFile(run.sourcePath))!==run.metadata.sourceSha256)throw Error('原始研报附件已变化，未交付演示文件。')
     current(run);exec.signal?.throwIfAborted();if(!run.playing||run.allowed!==3)throw aborted()
     await writeFile(join(run.cwd,HOME_PRESENTATION_FILE),run.bytes,{flag:'wx',mode:0o600})
     run.published=true;return'已保存 '+HOME_PRESENTATION_FILE+'（'+run.metadata.presentationSlides+'页、可编辑PPTX）；原始附件 '+HOME_PRESENTATION_SOURCE_FILE+' 已保留。'
    }})))
    return prepared
   }finally{if(preparing.get(input.sessionId)===ticket)preparing.delete(input.sessionId)}
  },
  async playback(input){const run=current(input);run.playing=input.playing===true;notify(run);return{playing:run.playing}},
  async checkpoint(input){const run=current(input),index=['plan','layout','deliver'].indexOf(input.stage);if(index<0||index+1<run.allowed||index>run.allowed)throw Error('示例步骤顺序已变化。');run.allowed=index+1;notify(run);await run.milestones.get(input.stage).promise;return{stage:input.stage}},
  async disposeRun(input){rememberCancellation(input);const ticket=preparing.get(input.sessionId);if(ticket?.runId===input.runId)ticket.cancelled=true;const run=runs.get(input.sessionId);if(run?.runId===input.runId){await cancel(run);if(runs.get(input.sessionId)===run)runs.delete(input.sessionId)}return{}},
  async dispose(){if(stopped)return;stopped=true;for(const ticket of preparing.values())ticket.cancelled=true;for(const run of runs.values())await cancel(run);offAdapter();runs.clear()}
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
