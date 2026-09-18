import {it,expect,vi,afterEach} from 'vitest'
import {CanvasUseTasks} from '../packages/dsh-research-task-runtime/canvas-use-tasks.js'

afterEach(()=>vi.useRealTimers())
const settle=()=>vi.advanceTimersByTimeAsync(1)
const start=tasks=>tasks.start({sessionId:'board',goal:'持续观察并操作画布',completion:'用户停止或目标完成',maxMinutes:30,maxActions:20})
const normal=()=>({writable:true,fingerprint:'a'})

it('recovers transient human interaction, view loss and connection loss in the same task',async()=>{
 vi.useFakeTimers();let unavailable=false,state='a'
 const execute=vi.fn(async()=>({status:'wait',reason:'等待下一次变化'}))
 const tasks=new CanvasUseTasks({observe:async()=>{if(unavailable)throw Error('用户正在操作画布');return {...normal(),fingerprint:state}},execute})
 try {
  const task=await start(tasks);await settle();unavailable=true
  await vi.advanceTimersByTimeAsync(2000)
  expect(tasks.list('board')[0]).toMatchObject({id:task.id,state:'waiting',recovery:{attempts:2}})
  unavailable=false;state='b';tasks.wake('board');await settle()
  expect(execute).toHaveBeenCalledTimes(2)
  expect(tasks.list('board')[0]).toMatchObject({id:task.id,state:'waiting',rounds:2})
  expect(tasks.list('board')[0].recovery).toBeUndefined()
 }finally{await tasks.dispose()}
})

it('a round timeout reobserves uncertain actions without replaying them',async()=>{
 vi.useFakeTimers();let value=0
 const observe=vi.fn(async()=>({...normal(),fingerprint:String(value),value}))
 const execute=vi.fn(async(task,observation,_signal,guard)=>{
  if(task.rounds===1){await guard('use',{op:'click'});value++;throw Error('本轮执行超时')}
  expect(observation.value).toBe(1);expect(task.recovery.reason).toContain('超时')
  return {status:'wait',reason:'已确认上轮操作成功，继续等待'}
 })
 const tasks=new CanvasUseTasks({observe,execute})
 try{const t=await start(tasks);await vi.advanceTimersByTimeAsync(2000);expect(value).toBe(1);expect(tasks.list('board')[0]).toMatchObject({id:t.id,state:'waiting',actions:1,rounds:2})}finally{await tasks.dispose()}
})

it('a late executor response after explicit stop cannot issue another action',async()=>{
 vi.useFakeTimers();let guardLater,finish
 const tasks=new CanvasUseTasks({observe:async()=>normal(),execute:async(_t,_o,_s,guard)=>{guardLater=guard;await new Promise(r=>finish=r);return {status:'wait',reason:'晚到回报'}}})
 const t=await start(tasks);await settle();await tasks.control('board',t.id,'stop')
 await expect(guardLater('use',{op:'click'})).rejects.toThrow();finish();await settle()
 expect(tasks.list('board')[0]).toMatchObject({state:'stopped',reason:'用户已停止',actions:0});await tasks.dispose()
})

it('stops retrying after prolonged unavailability and stops immediately for revoked permissions',async()=>{
 vi.useFakeTimers();let response=normal()
 const execute=vi.fn(async()=>({status:'wait',reason:'等待'}))
 const tasks=new CanvasUseTasks({observe:async()=>{if(response instanceof Error)throw response;return response},execute,recoveryMs:300000})
 try {
  await start(tasks);await settle();response=Error('连接暂不可用');await vi.advanceTimersByTimeAsync(305000)
  expect(tasks.list('board')[0]).toMatchObject({state:'paused'});expect(tasks.list('board')[0].reason).toContain('5 分钟')
  response=normal();const t=await start(tasks);await settle();response={...normal(),writable:false,blockedReason:'permission'}
  await vi.advanceTimersByTimeAsync(1000);expect(tasks.list('board').find(x=>x.id===t.id)).toMatchObject({state:'paused',reason:'画板编辑权限已撤销。'})
 }finally{await tasks.dispose()}
})

it('rechecks completion after concurrent changes instead of pausing or falsely completing',async()=>{
 vi.useFakeTimers();let reads=0
 const observe=async()=>({...normal(),fingerprint:++reads===1?'before':'after'})
 const execute=vi.fn(async()=>({status:'complete',reason:'目标完成'}))
 const tasks=new CanvasUseTasks({observe,execute})
 try{await start(tasks);await settle();expect(tasks.list('board')[0].state).toBe('waiting');await vi.advanceTimersByTimeAsync(1000);expect(execute).toHaveBeenCalledTimes(2);expect(tasks.list('board')[0].state).toBe('completed')}finally{await tasks.dispose()}
})

it('explicit stop during recovery cancels timers and future model calls',async()=>{
 vi.useFakeTimers();const execute=vi.fn(async()=>{throw Error('本轮执行超时')})
 const tasks=new CanvasUseTasks({observe:async()=>normal(),execute})
 try{const t=await start(tasks);await settle();await tasks.control('board',t.id,'stop');await vi.advanceTimersByTimeAsync(400000);expect(execute).toHaveBeenCalledTimes(1);expect(tasks.list('board')[0].state).toBe('stopped')}finally{await tasks.dispose()}
})

it('a slow successful model round does not look like client sleep and pause the next round',async()=>{
 vi.useFakeTimers();const execute=vi.fn(async()=>{await new Promise(r=>setTimeout(r,90000));return {status:'wait',reason:'继续等待'}})
 const tasks=new CanvasUseTasks({observe:async()=>normal(),execute})
 try{await start(tasks);await vi.advanceTimersByTimeAsync(100000);expect(tasks.list('board')[0]).toMatchObject({state:'waiting',rounds:1})}finally{await tasks.dispose()}
})

it('keeps an ongoing goal alive when a model completes just one interaction',async()=>{
 vi.useFakeTimers()
 const tasks=new CanvasUseTasks({observe:async()=>normal(),execute:async()=>({status:'complete',reason:'本轮操作已完成'})})
 try {
  const t=await tasks.start({sessionId:'board',goal:'持续协作',completion:'用户停止',completionMode:'until-stopped'})
  await settle();expect(tasks.list('board')[0]).toMatchObject({id:t.id,state:'waiting'})
  await tasks.control('board',t.id,'stop');expect(tasks.list('board')[0].state).toBe('stopped')
 }finally{await tasks.dispose()}
})

it('steers the same goal even without a canvas change and rejects stale in-flight actions',async()=>{
 vi.useFakeTimers();let staleGuard,release
 const execute=vi.fn(async(task,_observation,_signal,guard)=>{
  if(task.rounds===1){staleGuard=guard;await new Promise(r=>release=r)}
  else expect(task.instructions).toEqual(['接下来的内容使用新名称'])
  return {status:'wait',reason:'继续等待'}
 })
 const tasks=new CanvasUseTasks({observe:async()=>normal(),execute})
 try {
  const t=await start(tasks);await settle()
  await tasks.steer('board',t.id,'接下来的内容使用新名称')
  await expect(staleGuard('use',{op:'click'})).rejects.toThrow('要求已补充')
  release();await vi.advanceTimersByTimeAsync(1000)
  expect(tasks.list('board')).toHaveLength(1)
  expect(tasks.list('board')[0]).toMatchObject({id:t.id,state:'waiting',rounds:2,actions:0})
  await expect(tasks.steer('other',t.id,'new')).rejects.toThrow()
 }finally{await tasks.dispose()}
})
