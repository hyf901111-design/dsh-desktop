import { afterEach, expect, it, vi } from 'vitest'
import {canvasTaskTiming,canvasRoundWatchdog} from '../packages/dsh-research-task-runtime/canvas-task-timing.js'
import {CanvasUseTasks} from '../packages/dsh-research-task-runtime/canvas-use-tasks.js'
afterEach(()=>vi.useRealTimers())

it('learns model latency and failed-attempt duration instead of using five-minute recovery',()=>{
 const fast=canvasTaskTiming({modelLatencyMs:20000})
 const slow=canvasTaskTiming({modelLatencyMs:240000})
 const timeout=canvasTaskTiming({lastAttemptMs:300000})
 expect(fast.recoveryMs).toBeGreaterThan(300000)
 expect(slow.idleMs).toBeGreaterThan(fast.idleMs)
 expect(slow.recoveryMs).toBeGreaterThan(fast.recoveryMs)
 expect(timeout.idleMs).toBe(600000)
})
it('ongoing model/tool progress renews silence timeout but never exceeds explicit deadline',async()=>{
 vi.useFakeTimers();const abort=vi.fn(),start=Date.now()
 const watch=canvasRoundWatchdog({deadline:start+420000},abort)
 for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(120000);watch.progress()}
 expect(abort).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(60000)
 expect(abort).toHaveBeenCalledOnce()
 watch.dispose()
})
it('silent calls time out and disposed watches cannot restart',async()=>{
 vi.useFakeTimers();const abort=vi.fn(),watch=canvasRoundWatchdog({deadline:Date.now()+3600000},abort)
 await vi.advanceTimersByTimeAsync(180000);expect(abort).toHaveBeenCalledOnce()
 watch.dispose();watch.progress();await vi.advanceTimersByTimeAsync(600000)
 expect(abort).toHaveBeenCalledOnce()
})
it('waiting for a person survives five minutes, records model latency, and stops explicitly',async()=>{
 vi.useFakeTimers()
 const tasks=new CanvasUseTasks({observe:async()=>({writable:true,fingerprint:'same'}),execute:async()=>{await new Promise(r=>setTimeout(r,20000));return{status:'wait',reason:'等待用户操作'}}})
 const task=await tasks.start({sessionId:'board',goal:'持续协助',completion:'用户停止'})
 try{
  await vi.advanceTimersByTimeAsync(360000)
  expect(tasks.list('board')[0]).toMatchObject({state:'waiting',modelLatencyMs:20000})
  expect(task.deadline-task.createdAt).toBe(480*60000)
  await tasks.control('board',task.id,'stop')
  expect(tasks.list('board')[0].state).toBe('stopped')
 }finally{await tasks.dispose()}
})
