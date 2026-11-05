import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {finalAssistantOutput} from '@deepseek-ai/dsh-subagent'
import {foldConsumedWork} from '@deepseek-ai/dsh-agent'

function supportsRepair(ctx,child){
 return typeof ctx?.agents?.get==='function'&&!!child?.id&&Array.isArray(child.session?.events)&&
  ['followup','whenIdle','cancel'].every(name=>typeof child[name]==='function')&&typeof child.ctx?.tools?.restrict==='function'
}

/** A repair needs the original local agent, never a replacement with its ID. */
export function canRepairNoteComponentChild({ctx,child}={}){
 if(!supportsRepair(ctx,child))return false
 try{return ctx.agents.get(child.id)===child}catch{return false}
}

const abortError=()=>new DOMException('Note component repair cancelled','AbortError')
function repairError(code,message){return Object.assign(new Error(message),{code})}
function stopReason(reason){
 switch(reason?.kind){
  case 'completed':return 'completed'
  case 'max-tokens':return 'max-tokens'
  case 'aborted':return 'aborted'
  case 'blocked':return 'refusal'
  default:return 'error'
 }
}

/**
 * One format-repair turn in the original owned child. queueWait, when supplied,
 * reads its cumulative model-queue wait in milliseconds, just as the initial
 * component attempt does; only newly accrued queue wait pauses this budget.
 * The caller retains ownership of the original run and must finally dispose it.
 */
export function createNoteComponentRepair({ctx,child,signal,timeoutMs=90000,queueWait}={}){
 let used=false
 return async function repair({prompt,synthesisOnly=true,prepare,interruptOriginal=false}={}){
  if(used)throw repairError('NOTE_COMPONENT_REPAIR_USED','Note component repair can run only once')
  used=true
  if(!supportsRepair(ctx,child))throw repairError('NOTE_COMPONENT_REPAIR_UNAVAILABLE','Note component repair SDK capability unavailable')
  if(typeof prompt!=='string'||!prompt.trim())throw new TypeError('Note component repair prompt is required')
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new RangeError('Note component repair timeout must be positive')
  const session=child.session
  const assertLive=()=>{
   if(ctx.agents.get(child.id)!==child||child.session!==session)throw repairError('NOTE_COMPONENT_CHILD_CHANGED','组件子会话已变化，请重试。')
  }
  const cancel=()=>{try{child.cancel({kind:'parent'})}catch{/* A disposed child still must not keep its owner waiting. */}}
  const assertNotAborted=()=>{if(signal?.aborted)throw abortError()}
  assertLive()
  if(signal?.aborted){cancel();throw abortError()}
  let boundary,timer,lift,resolveTerminal,rejectTerminal,idleWait,quiescent=true
  const terminal=new Promise((resolve,reject)=>{resolveTerminal=resolve;rejectTerminal=reject})
  const expired=Symbol('repair deadline')
  const startedAt=Date.now()
  const readQueueWait=()=>{
   const value=typeof queueWait==='function'?queueWait():0
   return Number.isFinite(value)&&value>0?value:0
  }
  const initialQueueWait=readQueueWait()
  const waitForIdle=()=>{
   quiescent=false
   const pending=Promise.resolve().then(()=>child.whenIdle())
   idleWait=pending
   const settled=()=>{if(idleWait===pending)quiescent=true}
   void pending.then(settled,settled)
   return pending
  }
  const output=()=>boundary===undefined?[]:finalAssistantOutput(session.events.slice(boundary))??[]
  const timedOut=()=>{
   assertNotAborted();assertLive()
   return {stopReason:'timeout',localDeadlineExceeded:true,output:output()}
  }
  const onAbort=()=>{cancel();rejectTerminal(abortError())}
  const deadline=()=>{
   const remaining=timeoutMs-(Date.now()-startedAt-Math.max(0,readQueueWait()-initialQueueWait))
   if(remaining>0){timer=setTimeout(deadline,remaining);return}
   cancel();resolveTerminal(expired)
  }
  signal?.addEventListener('abort',onAbort,{once:true})
  timer=setTimeout(deadline,timeoutMs)
  try{
   // A source-phase handoff can return before its model turn has stopped.
   // Cancel that owned turn before waiting; do not spend the repair budget
   // allowing it to keep reasoning about already complete records.
   if(interruptOriginal)cancel()
   // A bounded initial attempt may still be converging to idle. Never enqueue
   // its repair into an unfinished turn or count that turn as repair output.
   if(await Promise.race([waitForIdle(),terminal])===expired)return timedOut()
   assertNotAborted();assertLive()
   if(synthesisOnly)lift=child.ctx.tools.restrict({allow:[]})
   assertNotAborted();assertLive()
   // Install a child-owned submission only after its original turn is idle.
   // Preparation is synchronous so it cannot escape the same execution budget.
   const prepared=prepare?.()
   const followupPrompt=prepared?.prompt??prompt
   if(typeof followupPrompt!=='string'||!followupPrompt.trim())throw new TypeError('Component repair prompt is required')
   assertNotAborted();assertLive()
   boundary=session.events.length
   child.followup(createUserMessage({content:[{type:'text',text:followupPrompt}],source:{kind:'plugin',plugin:'dsh-research-task-runtime'}}))
   const completed=Symbol('owned submission')
   const settled=await Promise.race([waitForIdle(),terminal,...prepared?.result?[Promise.resolve(prepared.result).then(result=>({kind:completed,result}))]:[]])
   if(settled===expired)return timedOut()
   assertNotAborted();assertLive()
   // The host receipt already passed semantic validation and durable step-end.
   // Stop further prose without releasing the restriction before actual idle.
   if(settled?.kind===completed){cancel();return settled.result}
   const own=session.events.slice(boundary),work=foldConsumedWork(own)
   if(work.droppedUnrun)return {stopReason:'aborted',output:[]}
   return {stopReason:stopReason(work.end?.data.reason),output:finalAssistantOutput(own)??[]}
  }catch(error){
   assertNotAborted()
   throw error
  }finally{
   clearTimeout(timer)
   signal?.removeEventListener('abort',onAbort)
   if(lift){
    const release=lift
    if(quiescent)release()
    // Cancellation can return to the owner before the native loop has stopped.
    // Keep synthesis tools closed until that same idle observation converges;
    // the caller may meanwhile dispose the owned run, which also waits for idle.
    else void idleWait.then(release,release).catch(()=>{})
   }
  }
 }
}

// Notes and prototype components share the exact ownership, deadline and
// cancellation lifecycle; retain the Notes exports for existing callers.
export const canRepairComponentChild=canRepairNoteComponentChild
export const createComponentRepair=createNoteComponentRepair
