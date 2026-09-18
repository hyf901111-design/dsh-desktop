import {AsyncLocalStorage} from 'node:async_hooks'
import {bindCanvasChild} from './canvas-tools.js'
import {withComponentAgentCreation} from './component-agent-scope.js'

const creating = new AsyncLocalStorage()
// One durable conversation per task, not one disposable child per observation.
// Register authority before prompt admission, and revoke it before cancellation.
export class CanvasTaskExecutor {
  constructor(ctx) { this.ctx=ctx;this.children=new Map() }
  async execute(taskId,request) {
    const {ctx}=this,{parent,signal,guard,taskSessionId,...options}=request
    signal.throwIfAborted()
    let childId=this.children.get(taskId),agent,unbind,closed=false,output=[],stream='',settled=false
    const owner={},disposers=[]
    let resolve,reject
    const result=new Promise((yes,no)=>{resolve=yes;reject=no});result.catch(()=>{})
    const bind=child=>{
      agent=child;childId=child.id;this.children.set(taskId,childId)
      unbind?.();unbind=bindCanvasChild(childId,taskSessionId,async(method,args)=>{
        signal.throwIfAborted();if(closed)throw Error('本轮执行已结束，请重新观察。');return guard(method,args)
      })
    }
    disposers.push(ctx.on('agent/created',({agent:child})=>{
      if(child.id===childId||creating.getStore()===owner)bind(child)
    }))
    disposers.push(ctx.on('session/event',(session,event)=>{
      if(session.id!==childId||settled)return
      if(event.type==='assistant/message')output=event.data.message.content??[]
      if(event.type==='assistant/chunk'&&event.data.chunk?.type==='text-delta')stream+=event.data.chunk.text??event.data.chunk.delta??''
      if(event.type==='turn/end'){
        settled=true
        if(!['completed','max-tokens'].includes(event.data.reason?.kind))reject(Error('执行轮次被中断，重新观察后继续。'))
        else resolve({output:output.length?output:[{type:'text',text:stream}]})
      }
    }))
    const abort=()=>{
      closed=true
      if(childId)ctx.subagents.interrupt(childId,{kind:'ancestor',agent:parent})
      reject(Error('本轮执行超时或中断，将重新观察后继续；不重复发送尚未确认的操作。'))
    }
    signal.addEventListener('abort',abort,{once:true})
    try {
      if(childId){
        const existing=ctx.agents.get(childId);if(existing){await existing.whenIdle();bind(existing)}
        signal.throwIfAborted()
        await creating.run(owner,()=>withComponentAgentCreation(()=>ctx.subagents.followup(parent,childId,options.prompt,{source:{kind:'coordinator',form:'relay',senderSessionId:parent.id},signal})))
      }else{
        const started=await creating.run(owner,()=>withComponentAgentCreation(()=>ctx.subagents.startContinuable({provider:'spawn',label:options.label,request:{...options,parent},signal})))
        childId=started.childId;this.children.set(taskId,childId)
        if(!agent){const existing=ctx.agents.get(childId);if(existing)bind(existing)}
      }
      if(signal.aborted)abort()
      if(!agent)throw Error('无法绑定持续画布执行器。')
      return await result
    } finally {
      closed=true;signal.removeEventListener('abort',abort);disposers.forEach(dispose=>dispose())
      // A cancelled round must become idle before its next continuation can act.
      if(signal.aborted&&childId)ctx.subagents.interrupt(childId,{kind:'ancestor',agent:parent})
      try {await agent?.whenIdle()} finally {unbind?.()}
    }
  }
}
