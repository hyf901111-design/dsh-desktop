import {it,expect,vi} from 'vitest'
import {CanvasTaskExecutor} from '../packages/dsh-research-task-runtime/canvas-task-executor.js'
import {CanvasUseTasks} from '../packages/dsh-research-task-runtime/canvas-use-tasks.js'
import {guardCanvas,canvasSession} from '../packages/dsh-research-task-runtime/canvas-tools.js'

function fixture() {
 const listeners=new Map(),agents=new Map(),parent={id:'board'}, emit=(name,...args)=>{for(const f of listeners.get(name)??[])f(...args)}
 let serial=0,current
 const ctx={agents,on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn)},subagents:{
  startContinuable:vi.fn(async()=>{current={id:'child-'+ ++serial,whenIdle:async()=>{}};current.session={id:current.id};agents.set(current.id,current);emit('agent/created',{agent:current});return{childId:current.id,messageId:'m1'}}),
  followup:vi.fn(async(_parent,id)=>{current=agents.get(id);return'm2'}),interrupt:vi.fn()
 }}
 const executor=new CanvasTaskExecutor(ctx)
 const request=signal=>({parent,signal,taskSessionId:'board',guard:vi.fn(async()=>{}),prompt:[{type:'text',text:'观察'}]})
 const finish=(text='{"status":"wait","reason":"等待变化"}')=>{emit('session/event',current,{type:'assistant/message',data:{message:{content:[{type:'text',text}]}}});emit('session/event',current,{type:'turn/end',data:{reason:{kind:'completed'}}})}
 const ready=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
 return {ctx,executor,request,finish,ready,listeners,get agent(){return current}}
}
it('reuses one durable child and registers canvas authority before any turn is admitted',async()=>{
 const f=fixture(),signal=new AbortController().signal
 for(let round=0;round<3;round++){
  const request=f.request(signal),run=f.executor.execute('task',request);await f.ready()
  expect(canvasSession({agent:f.agent})).toBe('board')
  await guardCanvas({agent:f.agent},'use',{op:'click'});expect(request.guard).toHaveBeenCalledTimes(1)
  f.finish('round '+round);expect((await run).output[0].text).toBe('round '+round)
 }
 expect(f.ctx.subagents.startContinuable).toHaveBeenCalledTimes(1)
 expect(f.ctx.subagents.followup).toHaveBeenCalledTimes(2)
 expect(f.ctx.subagents.interrupt).not.toHaveBeenCalled()
 for(const set of f.listeners.values())expect(set.size).toBe(0)
})
it('cancels a round without creating another child, rejects late writes and resumes its context',async()=>{
 const f=fixture(),controller=new AbortController(),req=f.request(controller.signal)
 const run=f.executor.execute('task',req);await f.ready();controller.abort()
 await expect(run).rejects.toThrow(/中断/)
 expect(f.ctx.subagents.interrupt).toHaveBeenCalledWith('child-1',{kind:'ancestor',agent:req.parent})
 const next=f.executor.execute('task',f.request(new AbortController().signal));await f.ready();f.finish();await next
 expect(f.ctx.subagents.startContinuable).toHaveBeenCalledTimes(1)
 expect(f.ctx.subagents.followup).toHaveBeenCalledTimes(1)
})
it('keeps the initiating tool pending through changes and resolves only when stopped',async()=>{
 let fingerprint='a';const execute=vi.fn(async()=>({status:'wait',reason:'等待下一次变化'}))
 const tasks=new CanvasUseTasks({observe:async()=>({writable:true,fingerprint}),execute,pollMs:10})
 try {
  const t=await tasks.start({sessionId:'board',goal:'持续操作',completion:'用户停止',maxMinutes:1,maxActions:5})
  let ended=false;const pending=tasks.wait('board',t.id,new AbortController().signal).then(value=>{ended=true;return value})
  await new Promise(r=>setTimeout(r,20));fingerprint='b';tasks.wake('board');await new Promise(r=>setTimeout(r,20))
  expect(execute).toHaveBeenCalledTimes(2);expect(ended).toBe(false)
  await tasks.control('board',t.id,'stop');expect((await pending).state).toBe('stopped')
 }finally{await tasks.dispose()}
})
it('propagates main composer cancellation to the task watcher',async()=>{
 const tasks=new CanvasUseTasks({observe:async()=>({writable:true,fingerprint:'a'}),execute:async()=>({status:'wait',reason:'等待'}),pollMs:10})
 try{const t=await tasks.start({sessionId:'board',goal:'等待',completion:'主动停止'}),abort=new AbortController();const pending=tasks.wait('board',t.id,abort.signal);abort.abort();expect((await pending).state).toBe('stopped')}finally{await tasks.dispose()}
})
