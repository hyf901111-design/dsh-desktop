import {LlmAdapter} from '@deepseek-ai/dsh-llm'
import {parse as parseHtml} from 'parse5'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash,randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {lstat,mkdir,open,readFile,realpath,writeFile,link,unlink} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {homeGuideSessionTitle,isHomeGuideSessionTitle} from './home-guide-session-titles.js'
import {streamHomePresentationReplayText} from './home-presentation-runtime.js'
import {HOME_REPORT_PATH,HOME_REPORT_EVENT,HOME_REPORT_SKILL_ID,HOME_REPORT_HTML_FILE,HOME_REPORT_PDF_FILE,HOME_REPORT_AUDIT_FILES,HOME_REPORT_ORIGIN_SESSION_ID,createHomeReportBrief} from './home-report-contract.js'

export {HOME_REPORT_PATH,HOME_REPORT_EVENT,HOME_REPORT_HTML_FILE,HOME_REPORT_PDF_FILE,createHomeReportBrief} from './home-report-contract.js'
const PROVIDER='sherlock-home-report',TOOL='home_report_publish'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const wire='ework-skill-'+hash(HOME_REPORT_SKILL_ID).slice(0,16)
const checked=value=>typeof value==='string'&&value.length>0&&value.length<=1200&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const aborted=()=>new DOMException('离线报告示例已停止。','AbortError')
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return{promise,resolve,reject}}

/** Public conclusions only; delivery files use the native tool/card protocol. */
export function createHomeReportReplay(metadata){
 return{
  intro:`好的，我会以${metadata.researchAsOf}为研究时点，围绕${metadata.companyName}梳理投资逻辑、业绩和估值，并区分事实、判断与风险。`,
  structure:'报告按以下目录展开：\n\n'+metadata.chapters.map((chapter,index)=>`${index+1}. ${chapter.title}`).join('\n')+'\n\n关键图表：'+metadata.chartCatalog.map(chart=>chart.title).join('、')+'。数据和观点会标明来源与时点。',
  layout:'研究观点和图表已整理。接下来核对财务口径、估值假设与风险因素，统一目录和来源标注，保存可阅读的HTML全文与PDF。',
  delivery:`已保存《${metadata.reportTitle}》。主要结论：\n\n`+metadata.keyFindings.map((finding,index)=>`${index+1}. ${finding}`).join('\n')+`\n\n研究时点：${metadata.researchAsOf}。可在本会话继续讨论和修改。`,
  todos:['梳理研究框架，核对公开资料与研究时点','整理专业观点、财务数据和关键图表','保存HTML全文与PDF报告'],
 }
}

/** App-owned files only. Missing real K3 output never turns into a substitute report. */
export async function loadHomeReportAssets(directory=fileURLToPath(new URL('./assets/home-report/',import.meta.url))){
 const read=async(name,limit)=>{
  const target=join(directory,name),file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW)
  try{const info=await file.stat();if(!info.isFile()||info.size>limit)throw Error('报告示例资源不可用。');const bytes=await file.readFile();if(bytes.length!==info.size||bytes.length>limit)throw Error('报告示例读取期间已变化。');return bytes}finally{await file.close()}
 }
 const metadata=JSON.parse((await read('source-metadata.json',512000)).toString('utf8'))
 const validList=(items,min,max)=>Array.isArray(items)&&items.length>=min&&items.length<=max&&items.every(item=>item&&checked(item.id)&&checked(item.title))&&new Set(items.map(item=>item.id)).size===items.length
 const provenance=metadata.provenance
 if(![1,2].includes(metadata.schemaVersion)||!checked(metadata.reportTitle)||!checked(metadata.companyName)||!checked(metadata.companyCode)||!date(metadata.researchAsOf)||!Number.isSafeInteger(metadata.reportPages)||metadata.reportPages<4||metadata.reportPages>80||metadata.htmlFile!=='research-report.html'||metadata.pdfFile!=='research-report.pdf'||!/^[a-f0-9]{64}$/.test(metadata.htmlSha256)||!/^[a-f0-9]{64}$/.test(metadata.pdfSha256)||metadata.localPresetOnly!==true||!validList(metadata.chapters,4,30)||!validList(metadata.sources,2,100)||!validList(metadata.chartCatalog,3,60)||!Array.isArray(metadata.keyFindings)||metadata.keyFindings.length<3||metadata.keyFindings.length>6||!metadata.keyFindings.every(checked)||provenance?.product!=='EWork Odyssey'||provenance.sessionId!==HOME_REPORT_ORIGIN_SESSION_ID||!checked(provenance.model)||!checked(provenance.generatedAt)||Number.isNaN(Date.parse(provenance.generatedAt)))throw Error('内置报告示例清单无效。')
 const sourceIds=new Set(metadata.sources.map(source=>source.id))
 if(metadata.sources.some(source=>!date(source.asOf)||!/^https?:\/\//.test(source.url)||!checked(source.url))||metadata.chartCatalog.some(chart=>!date(chart.asOf)||!Array.isArray(chart.sourceIds)||!chart.sourceIds.length||chart.sourceIds.some(id=>!sourceIds.has(id))))throw Error('报告来源或图表目录无效。')
 const [htmlBytes,pdfBytes]=await Promise.all([read(metadata.htmlFile,8*1024*1024),read(metadata.pdfFile,64*1024*1024)])
 if(hash(htmlBytes)!==metadata.htmlSha256||hash(pdfBytes)!==metadata.pdfSha256||!/^\s*(?:<!doctype\s+html|<html)/i.test(htmlBytes.toString('utf8'))||pdfBytes.subarray(0,5).toString()!=='%PDF-')throw Error('内置报告文件校验失败。')
 const links=[],pending=[parseHtml(htmlBytes.toString('utf8'))]
 while(pending.length){
  const node=pending.pop();pending.push(...node.childNodes??[]);if(node.content)pending.push(node.content)
  for(const attribute of node.attrs??[]){
   if(attribute.name!=='href')continue
   // parse5 decodes real HTML entities; URL parsing discards literal tabs/newlines.
   const raw=attribute.value.replace(/[\t\r\n]/g,'').trim()
   if(!raw||raw.startsWith('#')||/^(?:https?:|mailto:|tel:|\/\/)/i.test(raw))continue
   let file;try{file=decodeURIComponent(raw.split(/[?#]/)[0])}catch{throw Error('报告辅助链接无效。')}
   if(!/\.json$/i.test(file))continue
   const name=file.startsWith('./')?file.slice(2):file
   if(!HOME_REPORT_AUDIT_FILES.includes(name))throw Error('报告引用了未许可的辅助JSON。')
   links.push(name)
  }
 }
 const auditBytes={}
 if(metadata.schemaVersion===1){
  if(links.length||metadata.audit!==undefined||metadata.deliveryNames!==undefined)throw Error('旧版报告缺少完整辅助文件清单。')
 }else{
  const names=metadata.deliveryNames,audit=metadata.audit
  const basename=(name,ext)=>typeof name==='string'&&name.length>ext.length&&Buffer.byteLength(name,'utf8')<=255&&!/[\/\\:<>`\u0000-\u001f]/.test(name)&&name.endsWith(ext)
  if(!names||Array.isArray(names)||Object.keys(names).sort().join(',')!=='html,pdf'||!basename(names.html,'.html')||!basename(names.pdf,'.pdf')||!audit||Array.isArray(audit)||Object.keys(audit).sort().join(',')!==[...HOME_REPORT_AUDIT_FILES].sort().join(',')||HOME_REPORT_AUDIT_FILES.some(name=>!/^[a-f0-9]{64}$/.test(audit[name])))throw Error('报告交付名称或辅助清单无效。')
  for(const name of HOME_REPORT_AUDIT_FILES){
   const bytes=await read(name,4*1024*1024)
   if(hash(bytes)!==audit[name])throw Error('报告辅助文件校验失败。')
   try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('报告辅助文件不是有效JSON。')}
   auditBytes[name]=bytes
  }
  const manifest=JSON.parse(auditBytes['run.json'].toString('utf8'))
  if(manifest?.artifacts?.html!==names.html||manifest?.artifacts?.pdf!==names.pdf||manifest?.outputs?.[names.html]!==metadata.htmlSha256||manifest?.outputs?.[names.pdf]!==metadata.pdfSha256||HOME_REPORT_AUDIT_FILES.filter(name=>name!=='run.json').some(name=>manifest?.outputs?.[name]!==audit[name]))throw Error('原始报告清单与交付文件不一致。')
 }
 return{metadata,htmlBytes,pdfBytes,auditBytes}
}

/** One fresh, directory-registered native session; never a route for an ordinary request. */
export function createHomeReportRuntime(ctx,{env=process.env,assetsDirectory}={}){
 const runs=new Map(),preparing=new Map(),cancelled=new Set();let stopped=false
 const key=input=>JSON.stringify([input?.sessionId,input?.runId])
 const remember=input=>{cancelled.add(key(input));if(cancelled.size>256)cancelled.delete(cancelled.values().next().value)}
 const current=input=>{const run=runs.get(input.sessionId);if(stopped||!run||run.runId!==input.runId||run.cancelled||ctx.agents.get(run.agent.id)!==run.agent||run.agent.session.header.cwd!==run.cwd)throw aborted();return run}
 const notify=run=>{for(const wake of run.waiters)wake();run.waiters.clear()}
 const wait=async(run,predicate,signal)=>{
  for(;;){signal?.throwIfAborted();current(run);if(predicate())return
   await new Promise((resolve,reject)=>{const finish=()=>{run.waiters.delete(finish);signal?.removeEventListener('abort',abort);resolve()},abort=()=>{run.waiters.delete(finish);reject(aborted())};run.waiters.add(finish);signal?.addEventListener('abort',abort,{once:true})})
  }
 }
 const prompt=run=>'/'+wire+' '+run.prepared.brief
 const todo=(run,phase)=>run.replay.todos.map((content,index)=>({content,status:phase>=3||index<phase?'completed':index===phase?'in_progress':'pending'}))
 const text=(run,value,signal,thinkingMs)=>streamHomePresentationReplayText(value,{waitUntilPlaying:()=>wait(run,()=>run.playing,signal),signal,thinkingMs})
 const tool=function*(name,args,id){yield{type:'block-start',index:1,blockType:'tool-call'};yield{type:'block-end',index:1,block:{type:'tool-call',id,name,arguments:JSON.stringify(args)}};yield{type:'finish',reason:{kind:'tool-calls'}}}
 class ReportPresetAdapter extends LlmAdapter{
  async resolveModel(provider,model){return{provider,id:model,name:'离线报告示例',context:{contextWindow:32000},defaultMaxTokens:1024}}
  async *stream(request){
   const run=current({sessionId:request.sessionId,runId:runs.get(request.sessionId)?.runId});request.signal?.throwIfAborted()
   if(request.purpose!==undefined){
    if(!['compaction','session-title'].includes(request.purpose))throw Error('离线报告示例不接受此辅助请求。')
    const value=request.purpose==='session-title'?homeGuideSessionTitle('report'):`当前为《${run.metadata.reportTitle}》离线示例，按演示检查点继续。研究时点${run.metadata.researchAsOf}；HTML/PDF${run.published?'已保存':'尚未保存'}。`
    yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:value};yield{type:'block-end',index:0,block:{type:'text',text:value}};yield{type:'finish',reason:{kind:'stop'}};return
   }
   await wait(run,()=>run.playing,request.signal)
   const users=run.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user')
   if(users.length!==1||users[0].data.content?.filter(block=>block.type==='text').map(block=>block.text).join('')!==prompt(run))throw Error('报告示例只接受本次固定研究需求，请退出示例后继续普通任务。')
   run.milestones.get('accepted').resolve()
   const index=run.sequence++
   if(index===0){await wait(run,()=>run.playing&&run.allowed>=1,request.signal);yield*text(run,run.replay.intro+'\n\n'+run.replay.structure,request.signal,1800);yield*tool('todo_write',{todos:todo(run,0)},'home-report-plan')}
   else if(index===1){run.milestones.get('plan').resolve();await wait(run,()=>run.playing&&run.allowed>=2,request.signal);yield*text(run,run.replay.layout,request.signal,1500);yield*tool('todo_write',{todos:todo(run,1)},'home-report-layout')}
   else if(index===2){run.milestones.get('layout').resolve();await wait(run,()=>run.playing&&run.allowed>=3,request.signal);yield*tool(TOOL,{},'home-report-publish')}
   else if(index===3){if(!run.published)throw Error('预置报告未能保存。');yield*tool('todo_write',{todos:todo(run,3)},'home-report-complete')}
   else if(index===4){yield*text(run,run.replay.delivery,request.signal,1500);yield{type:'finish',reason:{kind:'stop'}};run.complete=true;run.milestones.get('deliver').resolve()}
   else throw Error('报告示例已结束，请在普通对话中继续。')
  }
 }
 const offAdapter=ctx.llm.registerAdapter([PROVIDER],new ReportPresetAdapter())
 const releaseRoute=async run=>{for(const off of run.off.splice(0))off();await Promise.resolve();const header=run.agent.session.requestHeader();if(ctx.agents.get(run.agent.id)===run.agent&&header?.config.provider===PROVIDER&&run.originalConfig.provider&&run.originalConfig.model)run.agent.session.append('request/header',{header:{...header,config:run.originalConfig},reason:'change'})}
 const cancel=async run=>{if(run.cancelled)return;run.cancelled=true;const release=releaseRoute(run);notify(run);for(const gate of run.milestones.values())gate.reject(aborted());if(!run.complete){await run.agent.cancel({kind:'user'});await run.agent.whenIdle()}await release}
 const publish=async(run,signal)=>{
  current(run);signal?.throwIfAborted()
  if(!run.playing||run.allowed!==3||await realpath(run.cwd)!==run.root)throw aborted()
  const targets=[{target:run.prepared.htmlPath,bytes:run.htmlBytes},{target:run.prepared.pdfPath,bytes:run.pdfBytes},...HOME_REPORT_AUDIT_FILES.filter(name=>run.auditBytes[name]).map(name=>({target:join(run.cwd,name),bytes:run.auditBytes[name]}))],staged=[],published=[]
  try{
   for(const entry of targets){
    try{await lstat(entry.target);throw Error('已有同名文件，报告示例不会覆盖。')}catch(error){if(error.code!=='ENOENT')throw error}
    const temporary=join(run.cwd,'.home-report-'+randomUUID()+'.tmp');await writeFile(temporary,entry.bytes,{flag:'wx',mode:0o600});staged.push({...entry,temporary})
   }
   for(const entry of staged){
    current(run);signal?.throwIfAborted();if(!run.playing||run.allowed!==3||await realpath(run.cwd)!==run.root)throw aborted()
    // link is exclusive; an intervening user save wins without being overwritten.
    await link(entry.temporary,entry.target);published.push(entry)
   }
   current(run);signal?.throwIfAborted();if(!run.playing||run.allowed!==3)throw aborted();run.published=true
  }catch(error){
   for(const entry of published){try{const [origin,target]=await Promise.all([lstat(entry.temporary),lstat(entry.target)]);if(origin.ino===target.ino&&origin.dev===target.dev&&hash(await readFile(entry.target))===hash(entry.bytes))await unlink(entry.target)}catch{}}
   throw error
  }finally{for(const entry of staged)await unlink(entry.temporary).catch(()=>{})}
 }
 return{
  async prepare(input){
   if(stopped||cancelled.has(key(input)))throw aborted()
   if(!checked(input?.sessionId)||!checked(input.runId)||input.fresh!==true||typeof input.cwd!=='string'||!isAbsolute(input.cwd)||preparing.has(input.sessionId))throw Error('报告示例会话参数无效。')
   if(runs.has(input.sessionId)){const run=current(input);if(run.cwd!==input.cwd)throw Error('报告示例目录已变化。');return structuredClone(run.prepared)}
   const ticket={...input,cancelled:false};preparing.set(input.sessionId,ticket)
   const valid=()=>{if(stopped||ticket.cancelled||preparing.get(input.sessionId)!==ticket||cancelled.has(key(input)))throw aborted()}
   try{
    const agent=ctx.agents.get(input.sessionId),session=agent?.session
    const occupied=()=>session.events.some(event=>['user/message','assistant/message','tool/call','turn/start',HOME_REPORT_EVENT].includes(event.type))
    if(!agent||session.header.cwd!==input.cwd||session.header.parentSession||session.header.origin==='subagent'||agent.status==='running'||occupied())throw Error('报告示例只能在新建独立空白会话中启动。')
    if(typeof env.DSH_HOME!=='string')throw Error('报告示例资料尚未就绪。')
    const directories=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'))
    if(!Object.values(directories).some(row=>row.sessionId===session.id&&row.path===input.cwd&&isHomeGuideSessionTitle('report',row.title)))throw Error('报告示例尚未登记专属目录。')
    await mkdir(input.cwd,{recursive:true});if((await lstat(input.cwd)).isSymbolicLink())throw Error('报告示例目录不能是符号链接。');const root=await realpath(input.cwd)
    const {metadata,htmlBytes,pdfBytes,auditBytes}=await loadHomeReportAssets(assetsDirectory);valid()
    if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||occupied())throw Error('会话已有内容，未启动报告示例。')
    const deliveryNames=metadata.schemaVersion===2?metadata.deliveryNames:{html:HOME_REPORT_HTML_FILE,pdf:HOME_REPORT_PDF_FILE}
    const htmlPath=join(input.cwd,deliveryNames.html),pdfPath=join(input.cwd,deliveryNames.pdf)
    const prepared={ready:true,brief:createHomeReportBrief(metadata),htmlPath,pdfPath,deliveryPaths:{html:htmlPath,pdf:pdfPath},reportTitle:metadata.reportTitle,researchAsOf:metadata.researchAsOf,chapters:metadata.chapters}
    const originalConfig=session.requestHeader()?.config??{provider:agent.options.provider,model:agent.options.model,...agent.options.maxTokens===undefined?{}:{maxTokens:agent.options.maxTokens}}
    const run={...input,root,agent,htmlBytes,pdfBytes,auditBytes,metadata,replay:createHomeReportReplay(metadata),prepared,originalConfig,sequence:0,allowed:0,playing:false,cancelled:false,complete:false,published:false,waiters:new Set(),milestones:new Map(['accepted','plan','layout','deliver'].map(stage=>[stage,deferred()])),off:[]}
    session.append(HOME_REPORT_EVENT,{version:1,runId:run.runId,purpose:'offline-professional-investment-report',cwd:run.cwd,htmlFile:deliveryNames.html,pdfFile:deliveryNames.pdf,htmlSha256:metadata.htmlSha256,pdfSha256:metadata.pdfSha256,...metadata.schemaVersion===2?{audit:metadata.audit}:{},researchAsOf:metadata.researchAsOf,provenance:metadata.provenance})
    const expected=session.events.length
    if(!(await ctx.sessions.flush(session)))throw Error('报告示例所有权未能保存。')
    valid();if(ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||session.events.length!==expected)throw Error('会话内容已变化，未启动报告示例。')
    runs.set(session.id,run)
    run.off.push(ctx.on('session/event',(active,event)=>{if(active!==session||event.type!=='turn/end')return;if(run.complete)return releaseRoute(run);if(event.data.reason?.kind!=='completed')for(const gate of run.milestones.values())gate.reject(Error(event.data.reason?.error?.message||'报告示例执行已停止。'))}))
    run.off.push(agent.ctx.on('agent/request',()=>{current(run);return{provider:PROVIDER,model:'v1',maxTokens:1024}},{prepend:true}))
    run.off.push(agent.ctx.tools.register(defineTool({name:TOOL,description:'保存已经核验的内置公司研究报告HTML/PDF，不能指定路径或替换内容。',parameters:{},output:{schema:{type:'string'},render:(_args,result)=>[{type:'text',text:result},{type:'text',text:JSON.stringify({kind:'ework-home-guide-delivery',version:1,tool:TOOL,ok:true,status:'completed',files:[{format:'html',path:run.prepared.htmlPath},{format:'pdf',path:run.prepared.pdfPath}]})}]},async execute(args,exec){
     current(run);exec.signal?.throwIfAborted();if(exec.agent!==agent||Object.keys(args).length)throw Error('报告示例交付上下文无效。')
     await publish(run,exec.signal);return'已保存 '+deliveryNames.html+' 和 '+deliveryNames.pdf+'；研究时点 '+metadata.researchAsOf+'。'
    }})))
    return structuredClone(prepared)
   }finally{if(preparing.get(input.sessionId)===ticket)preparing.delete(input.sessionId)}
  },
  async playback(input){const run=current(input);run.playing=input.playing===true;notify(run);return{playing:run.playing}},
  async checkpoint(input){const run=current(input);if(input.stage==='accepted'){await run.milestones.get('accepted').promise;current(input);return{stage:input.stage}}const index=['plan','layout','deliver'].indexOf(input.stage);if(index<0||index+1<run.allowed||index>run.allowed)throw Error('报告示例步骤顺序已变化。');run.allowed=index+1;notify(run);await run.milestones.get(input.stage).promise;return{stage:input.stage}},
  async disposeRun(input){remember(input);const ticket=preparing.get(input.sessionId);if(ticket?.runId===input.runId)ticket.cancelled=true;const run=runs.get(input.sessionId);if(run?.runId===input.runId){await cancel(run);if(runs.get(input.sessionId)===run)runs.delete(input.sessionId)}return{}},
  async dispose(){if(stopped)return;stopped=true;for(const ticket of preparing.values())ticket.cancelled=true;for(const run of runs.values())await cancel(run);offAdapter();runs.clear()},
 }
}

export function registerHomeReportRuntime(ctx,{isTrustedRequest,readJsonBody,env=process.env}){
 const runtime=createHomeReportRuntime(ctx,{env})
 const off=ctx.webServer.register({kind:'exact',path:HOME_REPORT_PATH,handler:async(req,res)=>{
  let status=200,payload
  try{
   if(req.method!=='POST'||!isTrustedRequest(req,true)){status=403;throw Error('报告示例请求未授权。')}
   const input=await readJsonBody(req),method={prepare:'prepare',playback:'playback',checkpoint:'checkpoint',dispose:'disposeRun'}[input.action]
   if(!method||Object.keys(input).some(key=>!['action','sessionId','cwd','runId','fresh','playing','stage'].includes(key)))throw Error('报告示例命令无效。')
   payload={ok:true,...await runtime[method](input)}
  }catch(error){if(status===200)status=409;payload={ok:false,message:error?.message||'报告示例尚未就绪。'}}
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload))
 }})
 return async()=>{off();await runtime.dispose()}
}
