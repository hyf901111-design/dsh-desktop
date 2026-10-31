import {createHash} from 'node:crypto'
import {readFile,lstat,realpath} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'
import {isHomeGuideSessionTitle} from './home-guide-session-titles.js'
import {noteConversationRows,recordNoteConversation,setNoteConversationRunning} from './notes-session.js'
import {noteMessageReferences} from './notes-message-references.js'
import {homeNotesGuideChart,homeNotesGuideSummaryReferences} from './home-notes-guide-artifacts.js'
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT} from './home-notes-guide-contract.js'

export const HOME_NOTES_PATH='/sherlock/home-guide/notes'
const abortError=()=>new DOMException('笔记示例已停止。','AbortError')
const id=value=>typeof value==='string'&&/^[\w:-]{1,128}$/.test(value)
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop)},stop=()=>{clean();reject(abortError())},timer=setTimeout(()=>{clean();resolve()},ms);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop()})

/** Fixed prose uses the ordinary durable Notes conversation, never a model route. */
export function createHomeNotesRuntime(ctx,{env=process.env}={}){
 const runs=new Map(),cancelled=new Set();let closed=false
 const key=input=>JSON.stringify([input?.sessionId,input?.runId])
 const current=input=>{const run=runs.get(input?.sessionId);if(closed||!run||run.runId!==input.runId||run.abort.signal.aborted||ctx.agents.get(run.sessionId)!==run.agent||run.agent.session.header.cwd!==run.cwd||run.agent.status==='running')throw abortError();return run}
 const active=async(run,signal)=>{for(;;){signal.throwIfAborted();current(run);if(run.playing)return;await pause(35,signal)}}
 const wait=async(run,ms,signal)=>{for(let left=ms;left>0;){await active(run,signal);const slice=Math.min(60,left);await pause(slice,signal);left-=slice}await active(run,signal)}
 const disposeRun=async input=>{cancelled.add(key(input));if(cancelled.size>256)cancelled.delete(cancelled.values().next().value);const run=runs.get(input.sessionId);if(run?.runId===input.runId){run.abort.abort();runs.delete(input.sessionId)}}
 return{
  async prepare(input){
   if(closed||cancelled.has(key(input))||!id(input?.sessionId)||!id(input.runId)||input.fresh!==true||typeof input.cwd!=='string'||!isAbsolute(input.cwd)||typeof env.DSH_HOME!=='string')throw Error('笔记示例参数无效。')
   const old=runs.get(input.sessionId);if(old){current(input);if(old.cwd!==input.cwd)throw Error('笔记示例目录已变化。');return{prompts:{chart:HOME_NOTES_CHART_PROMPT,note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}}}
   const agent=ctx.agents.get(input.sessionId),session=agent?.session
   if(!session||session.header.cwd!==input.cwd||session.header.parentSession||session.header.origin==='subagent'||agent.status==='running'||session.events.some(event=>['user/message','assistant/message','turn/start','tool/call','workspace-note/edited','workspace-note/conversation'].includes(event.type)))throw Error('只能在新建的独立笔记示例会话中启动。')
   const rows=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'))
   if(!Object.values(rows).some(row=>row.sessionId===input.sessionId&&row.path===input.cwd&&isHomeGuideSessionTitle('note',row.title)))throw Error('笔记示例目录尚未登记。')
   if((await lstat(input.cwd)).isSymbolicLink()||await realpath(input.cwd)!==input.cwd)throw Error('笔记示例目录已变化。')
   if(closed||cancelled.has(key(input))||ctx.agents.get(input.sessionId)!==agent||session.events.some(event=>['user/message','assistant/message','turn/start','workspace-note/edited','workspace-note/conversation'].includes(event.type)))throw abortError()
   if(runs.has(input.sessionId)){current(input);if(runs.get(input.sessionId).cwd!==input.cwd)throw Error('笔记示例目录已变化。');return{prompts:{chart:HOME_NOTES_CHART_PROMPT,note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}}}
   runs.set(input.sessionId,{...input,agent,abort:new AbortController(),playing:false,next:0,requests:new Map()})
   return{prompts:{chart:HOME_NOTES_CHART_PROMPT,note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}}
  },
  async playback(input){const run=current(input);run.playing=input.playing===true;return{playing:run.playing}},
  async generate(input,requestedSignal,progress=()=>{}){
   const run=current(input),value=input.input
   if(!value||value.sessionId!==run.sessionId||!id(value.requestId)||value.mode!=='write'||typeof value.markdown!=='string'||value.markdown.length>100000||typeof value.selection!=='string'||!Array.isArray(value.context?.components)||value.context.components.length>2||value.images!==undefined&&(!Array.isArray(value.images)||value.images.length)||JSON.stringify(value).length>180000)throw Error('笔记示例生成请求无效。')
   const stage=value.prompt===HOME_NOTES_CHART_PROMPT?0:value.prompt===HOME_NOTES_REWRITE_PROMPT?1:value.prompt===HOME_NOTES_TASK_PROMPT?2:-1
   const composer=value.entryPoint===undefined||value.entryPoint==='composer'
   const anchor=value.insertionAnchor,inline=stage===0&&value.entryPoint==='inline'&&anchor&&id(anchor.documentId)&&id(anchor.blockId)&&anchor.position&&typeof anchor.position==='object'&&!Array.isArray(anchor.position)&&JSON.stringify(anchor.position).length<2048
   const valid=stage===0?inline&&value.context.scope==='note'&&value.context.components.length===0&&value.selection===''&&['增长兑现与估值','2025年10月23日','2026年10月23日','222.81','环比增长174.57%'].every(marker=>value.markdown.includes(marker))
    :stage===1?composer&&value.insertionAnchor===undefined&&value.context.scope==='selection'&&value.context.components.length===0&&value.markdown===''&&value.selection.trim()===HOME_NOTES_GUIDE_SELECTION
    :stage===2?composer&&value.insertionAnchor===undefined&&value.context.scope==='note'&&value.selection===''&&['环比增长14.29%','现金流净额18.00亿元','同比下降44.08%','不把单期业绩或历史涨幅当作确定性依据','沪深300同期下跌10.88%'].every(marker=>value.markdown.includes(marker))&&homeNotesGuideSummaryReferences(value.context.components):false
   if(!valid)throw Error('示例需求或引用内容已变化，请重新播放。')
   const fingerprint=createHash('sha256').update(JSON.stringify(value)).digest('hex'),old=run.requests.get(value.requestId)
   if(old){if(old.fingerprint!==fingerprint)throw Error('请求标识已用于其他内容。');return old.promise}
   if(stage!==run.next||run.busy)throw Error('笔记示例步骤顺序已变化。')
   const signal=AbortSignal.any([run.abort.signal,...requestedSignal?[requestedSignal]:[]]);signal.throwIfAborted();run.busy=true
   const promise=(async()=>{
    let started=false,ready=false
    try{
     if(stage>0){for(let remaining=10000;;remaining-=40){current(run);signal.throwIfAborted();const first=[...run.requests.values()].find(item=>item.stage===stage-1),row=noteConversationRows(run.agent.session).find(row=>row.requestId===first?.requestId);if(row?.phase==='accepted')break;if(remaining<=0||['discarded','failed','stopped'].includes(row?.phase))throw Error('请先采纳上一条笔记建议。');await active(run,signal);await pause(40,signal)}}
     setNoteConversationRunning(run.agent.session,value.requestId,true)
     const metadata=recordNoteConversation(run.agent.session,{requestId:value.requestId,phase:'preparing',prompt:value.prompt,references:noteMessageReferences(value.context,value.selection),homeGuide:{runId:run.runId,localPresetOnly:true,provider:'home-notes-script'}});started=true
     const report=(stage,outputChars)=>progress({stage,reasoning:'',outputChars,...metadata})
     report('thinking',0);await wait(run,1800,signal)
     const result=stage===0?homeNotesGuideChart(run.runId):{kind:'text',markdown:stage===1?HOME_NOTES_REWRITE_RESULT:HOME_NOTES_TASK_RESULT},characters=Array.from(result.kind!=='component'?result.markdown:result.node.title+' · 一年股价与沪深300价格基准已核对')
     for(let count=3;count<characters.length+3;count+=3){await active(run,signal);report('writing',Math.min(count,characters.length));await wait(run,45,signal)}
     signal.throwIfAborted();current(run)
     recordNoteConversation(run.agent.session,{requestId:value.requestId,phase:'ready',result,outputChars:characters.length,finishedAt:Date.now()});ready=true;run.next++;return result
    }catch(error){if(started&&!ready)recordNoteConversation(run.agent.session,{requestId:value.requestId,phase:signal.aborted?'stopped':'failed',error:signal.aborted?'生成已停止。':error.message,finishedAt:Date.now()});throw error}
    finally{if(started)setNoteConversationRunning(run.agent.session,value.requestId,false);run.busy=false}
   })()
   run.requests.set(value.requestId,{requestId:value.requestId,stage,fingerprint,promise});return promise
  },
  disposeRun,
  async dispose(){if(closed)return;closed=true;for(const run of runs.values())run.abort.abort();runs.clear()}
 }
}

export function registerHomeNotesRuntime(ctx,{isTrustedRequest,readJsonBody,env=process.env}){
 const runtime=createHomeNotesRuntime(ctx,{env})
 const off=ctx.webServer.register({kind:'exact',path:HOME_NOTES_PATH,handler:async(req,res)=>{
  const abort=new AbortController(),stop=()=>{if(!res.writableEnded)abort.abort()};req.once('aborted',stop);res.once('close',stop)
  let streaming=false
  try{
   if(req.method!=='POST'||!isTrustedRequest(req,true)){res.writeHead(403);res.end();return}
   const input=await readJsonBody(req),methods={prepare:'prepare',playback:'playback',generate:'generate',dispose:'disposeRun'},method=methods[input.action]
   if(!method||Object.keys(input).some(key=>!['action','sessionId','runId','cwd','fresh','playing','input'].includes(key)))throw Error('笔记示例命令无效。')
   if(input.action==='generate'){
    streaming=true;res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store'})
    const result=await runtime.generate(input,abort.signal,progress=>{if(!res.destroyed)res.write(JSON.stringify({type:'progress',progress})+'\n')})
    if(!res.destroyed)res.end(JSON.stringify({type:'result',result})+'\n')
   }else{const result=await runtime[method](input);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,...result}))}
  }catch(error){if(!res.destroyed){if(streaming)res.end(JSON.stringify({type:'error',message:error.message||'笔记示例已停止。'})+'\n');else{res.writeHead(409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:false,message:error.message||'笔记示例未完成。'}))}}}
  finally{res.off('close',stop);req.off('aborted',stop)}
 }})
 return async()=>{off();await runtime.dispose()}
}
