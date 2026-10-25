import {readFile,lstat,realpath} from 'node:fs/promises'
import {join,isAbsolute} from 'node:path'
import {isHomeGuideSessionTitle} from './home-guide-session-titles.js'
import {HOME_BOARD_SMART_PATH,HOME_BOARD_SMART_PROMPT,HOME_BOARD_SMART_ARTIFACT} from './home-board-smart-contract.js'
export {HOME_BOARD_SMART_PATH} from './home-board-smart-contract.js'
const id=value=>typeof value==='string'&&/^[\w:-]{1,128}$/.test(value)
/** The native prepared-task path owns rendering and durable result storage. */
export function createHomeBoardSmartRuntime(ctx,tasks,{env=process.env}={}){
 let closed=false;const pending=new Map()
 return{
  async generate(input,signal){
   signal?.throwIfAborted()
   if(closed||!input||Object.keys(input).some(key=>!['sessionId','runId','canvasNodeId','prompt'].includes(key))||!['sessionId','runId','canvasNodeId'].every(key=>id(input[key]))||input.prompt!==HOME_BOARD_SMART_PROMPT)throw Error('示例智能容器需求已变化。')
   const agent=ctx.agents.get(input.sessionId),session=agent?.session,cwd=session?.header.cwd
   const current=()=>{signal?.throwIfAborted();if(closed||ctx.agents.get(input.sessionId)!==agent||agent.status==='running'||session?.header.cwd!==cwd||session?.header.parentSession||session?.header.origin==='subagent'||session?.events.some(event=>['user/message','assistant/message','turn/start','tool/call'].includes(event.type)))throw Error('只能在独立示例看板中生成。')}
   if(!session||typeof cwd!=='string'||!isAbsolute(cwd)||typeof env.DSH_HOME!=='string')throw Error('示例看板尚未就绪。')
   current()
   const rows=JSON.parse(await readFile(join(env.DSH_HOME,'research-board-directories.json'),'utf8'))
   if(!Object.values(rows).some(row=>row?.sessionId===input.sessionId&&row.path===cwd&&isHomeGuideSessionTitle('board',row.title))||(await lstat(cwd)).isSymbolicLink()||await realpath(cwd)!==cwd)throw Error('示例看板目录尚未登记。')
   current()
   const key=JSON.stringify([input.sessionId,input.canvasNodeId]),fingerprint=JSON.stringify([input.runId,input.prompt]),old=pending.get(key)
   if(old){if(old.fingerprint!==fingerprint)throw Error('智能容器正由另一轮示例使用。');return old.promise}
   const existing=[...tasks.tasks.values()].find(task=>task.parentSessionId===input.sessionId&&task.canvasNodeId===input.canvasNodeId&&task.kind==='container'&&task.prompt===HOME_BOARD_SMART_PROMPT&&task.state==='completed'&&task.finalOutput===JSON.stringify(HOME_BOARD_SMART_ARTIFACT))
   if(existing)return tasks.inspect({parentSessionId:input.sessionId,taskId:existing.taskId})
   const promise=(async()=>{current();const [task]=await tasks.startPreparedBatch({parentSessionId:input.sessionId,panels:[{canvasNodeId:input.canvasNodeId,prompt:HOME_BOARD_SMART_PROMPT,artifact:structuredClone(HOME_BOARD_SMART_ARTIFACT)}]});return task})()
   const record={fingerprint,promise};pending.set(key,record)
   try{return await promise}finally{if(pending.get(key)===record)pending.delete(key)}
  },
  dispose(){closed=true;pending.clear()}
 }
}
export function registerHomeBoardSmartRuntime(ctx,tasks,{isTrustedRequest,readJsonBody,env=process.env}){
 const runtime=createHomeBoardSmartRuntime(ctx,tasks,{env})
 const off=ctx.webServer.register({kind:'exact',path:HOME_BOARD_SMART_PATH,handler:async(req,res)=>{
  const abort=new AbortController(),stop=()=>{if(!res.writableEnded)abort.abort()};req.once('aborted',stop);res.once('close',stop)
  try{
   if(req.method!=='POST'||!isTrustedRequest(req,true)){res.writeHead(403);res.end();return}
   const task=await runtime.generate(await readJsonBody(req),abort.signal)
   if(!res.destroyed){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(task))}
  }catch(error){if(!res.destroyed){res.writeHead(409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:error.message||'示例组件未能生成。'}))}}
  finally{req.off('aborted',stop);res.off('close',stop)}
 }})
 return()=>{off();runtime.dispose()}
}
