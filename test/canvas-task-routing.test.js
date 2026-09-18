import {it,expect} from 'vitest'
import {ongoingCanvasRequest,canvasTaskRoutingGuard} from '../packages/dsh-research-task-runtime/canvas-task-routing.js'
const event=(text,kind='user')=>({type:'user/message',data:{id:'m',source:{kind},content:[{type:'text',text}]}})
const agent=text=>({session:{events:[event(text)]}})
it('recognizes ongoing human intent across components rather than game-specific rules',()=>{
 for(const text of ['陪我下棋，我用黑子','陪我填写这些表格','帮我持续监控这个面板','每次我修改数字就自动填写对应内容','keep monitoring this canvas'])expect(ongoingCanvasRequest(agent(text).session)).not.toBeNull()
 for(const text of ['只帮我下一步','不要持续监控','解释这张图','“陪我下棋”是什么意思','> 持续监控这里'])expect(ongoingCanvasRequest(agent(text).session)).toBeNull()
})
it('ignores tool and document context and respects the latest human request',()=>{
 expect(ongoingCanvasRequest({events:[event('陪我下棋','plugin')]})).toBeNull()
 expect(ongoingCanvasRequest({events:[event('陪我填写表格'),event('只操作一次'),event('陪我下棋','tool')]})).toBeNull()
})
it('blocks one-shot writes for ongoing goals and preserves the owning executor and ordinary one-shot actions',()=>{
 const exec={agent:agent('陪我下棋，我用黑子')}
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'click'})).toThrow('CONTINUOUS_TASK_REQUIRED')
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'observe'})).not.toThrow()
 exec.agent[Symbol.for('sherlock.canvas-task-owned')]=true
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'click'})).not.toThrow()
 expect(()=>canvasTaskRoutingGuard({agent:agent('点一下按钮')},'use',{op:'click'})).not.toThrow()
 expect(()=>canvasTaskRoutingGuard({agent:agent('改用新名称')},'use',{op:'input'},[{id:'same'}])).toThrow('steer')
})

it('separates attached research content from the actual human request',()=>{
 const header='␞SHERLOCK_RESEARCH_FILES_V1 '+JSON.stringify({artifacts:[{excerpt:'陪我下棋，持续监控'}]})+'␟'
 expect(ongoingCanvasRequest(agent(header+'解释这个组件').session)).toBeNull()
 expect(ongoingCanvasRequest(agent(header+'陪我填写表格').session)?.text).toBe('陪我填写表格')
 expect(ongoingCanvasRequest(agent('␞SHERLOCK_RESEARCH_FILES_V1 陪我下棋').session)).toBeNull()
})

it('admits a real continuous goal without waiting for the parent model to choose a task tool',async()=>{
 const {registerCanvasTaskAdmission}=await import('../packages/dsh-research-task-runtime/canvas-task-routing.js')
 const {CanvasUseTasks}=await import('../packages/dsh-research-task-runtime/canvas-use-tasks.js')
 let handler,unbound=false
 const ctx={on:(_name,fn)=>{handler=fn;return()=>unbound=true}}
 const tasks=new CanvasUseTasks({observe:async()=>({writable:true,fingerprint:'a'}),execute:async()=>({status:'wait',reason:'等待操作'})})
 const dispose=registerCanvasTaskAdmission(ctx,tasks)
 const user=event('陪我填写表格'),session={id:'board',events:[user],header:{}}
 try {
  handler(session,user)
  await new Promise(r=>setTimeout(r,20))
  expect(tasks.list('board')).toHaveLength(1)
  expect(tasks.list('board')[0]).toMatchObject({state:'waiting',completionMode:'until-stopped',goal:'陪我填写表格'})
  handler(session,user)
  const next=event('陪我继续');next.data.id='m2';session.events.push(next);handler(session,next)
  await new Promise(r=>setTimeout(r,20));expect(tasks.list('board')).toHaveLength(1)
  const foreign=event('陪我执行','plugin');handler({id:'foreign',events:[foreign],header:{}},foreign)
  const child=event('陪我操作');handler({id:'child',events:[child],header:{parentSession:'board'}},child)
  expect(tasks.list('foreign')).toEqual([]);expect(tasks.list('child')).toEqual([])
 }finally{dispose();await tasks.dispose()}
 expect(unbound).toBe(true)
})

it('human inbox steering releases only the parent wait and preserves the durable executor',async()=>{
 const {registerCanvasTaskAdmission}=await import('../packages/dsh-research-task-runtime/canvas-task-routing.js')
 const {CanvasUseTasks}=await import('../packages/dsh-research-task-runtime/canvas-use-tasks.js')
 let handler
 const tasks=new CanvasUseTasks({observe:async()=>({writable:true,fingerprint:'a'}),execute:async()=>({status:'wait',reason:'等待变化'})})
 registerCanvasTaskAdmission({on:(_name,fn)=>{handler=fn;return()=>{}}},tasks)
 try {
  const task=await tasks.start({sessionId:'board',goal:'持续观察',completion:'用户停止',completionMode:'until-stopped'})
  let settled=false;const waiting=tasks.wait('board',task.id).then(()=>settled=true)
  handler({id:'board',header:{}},{type:'agent/inbox/spliced',data:{inserted:[{source:{kind:'plugin'}}]}})
  await Promise.resolve();expect(settled).toBe(false)
  handler({id:'board',header:{}},{type:'agent/inbox/spliced',data:{inserted:[{source:{kind:'user'}}]}})
  await waiting
  expect(['running','waiting']).toContain(tasks.list('board')[0].state)
  expect(tasks.runs.get(task.id).abort.signal.aborted).toBe(false)
  expect(tasks.runs.get(task.id).inputWaiters.size).toBe(0)
 }finally{await tasks.dispose()}
})
