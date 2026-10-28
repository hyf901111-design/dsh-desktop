// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { mountHomeWorkbenchGuide } from '../src/preload/home-guide-workbench'
import { HOME_WORKBENCH_STEPS } from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
const cleanups:Array<()=>void>=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());document.body.replaceChildren();vi.useRealTimers()})
function fixture(auto=true){
 const host=document.createElement('div');document.body.append(host)
 const controller=new AbortController(),requests:any[]=[]
 const reply=(detail:any,ok=true)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-workbench-reply',{detail:{...detail,ok}}))
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;requests.push(detail);if(auto||detail.command==='mount')reply(detail)}
 window.addEventListener('sherlock:home-guide-workbench-request',receive)
 const options={signal:controller.signal,sessionId:'session-a',runId:'run-a',cwd:'/examples/a',fresh:true,waitUntilPlaying:async()=>{}}
 cleanups.push(()=>{controller.abort();window.removeEventListener('sherlock:home-guide-workbench-request',receive)})
 return{host,controller,requests,reply,options,play(playing:boolean){window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'run-a',sessionId:'session-a',playing}}))}}
}
test('uses the native actor for all 25 stages and flushes while playback is stopped',async()=>{
 const f=fixture(),adapter=await mountHomeWorkbenchGuide(document,f.host,f.options)
 expect(f.requests[0]).toMatchObject({command:'mount',kind:'workbench',runId:'run-a',sessionId:'session-a',cwd:'/examples/a',fresh:true,hostId:f.host.id})
 for(const step of HOME_WORKBENCH_STEPS)await adapter.runStep(step.id)
 f.play(false);await adapter.flush();adapter.dispose()
 expect(f.requests.map(row=>row.command)).toEqual(['mount',...HOME_WORKBENCH_STEPS.map(row=>row.id),'flush','dispose'])
 expect(f.host.id).toBe('');expect(f.host.childElementCount).toBe(0)
})
test('ignores stale replies, pauses the action budget, and releases listeners on abort',async()=>{
 vi.useFakeTimers();const f=fixture(false),adapter=await mountHomeWorkbenchGuide(document,f.host,f.options)
 const step=adapter.runStep('wb-00');await Promise.resolve();const request=f.requests.at(-1);let settled=false;void step.then(()=>{settled=true},()=>{settled=true})
 f.reply({...request,sessionId:'other'});f.reply({...request,runId:'stale'});await Promise.resolve();expect(settled).toBe(false)
 await vi.advanceTimersByTimeAsync(90000);expect(settled).toBe(false)
 f.play(true);f.reply(request);await step
 const next=adapter.runStep('wb-01');await Promise.resolve();const rejected=expect(next).rejects.toMatchObject({name:'AbortError'});f.controller.abort();await rejected
 expect(f.requests.at(-1).command).toBe('dispose');expect(f.host.id).toBe('')
})
test('rejects out-of-order stages and preserves an existing host id',async()=>{
 const f=fixture();f.host.id='native-host';const adapter=await mountHomeWorkbenchGuide(document,f.host,f.options)
 await expect(adapter.runStep('wb-02')).rejects.toThrow('顺序');expect(f.requests.map(row=>row.command)).toEqual(['mount'])
 adapter.dispose();expect(f.host.id).toBe('native-host')
})
test('bounds flush even when the replay is paused',async()=>{
 vi.useFakeTimers();const f=fixture(false),adapter=await mountHomeWorkbenchGuide(document,f.host,f.options)
 const flushed=expect(adapter.flush()).rejects.toThrow('保存');await vi.advanceTimersByTimeAsync(16000);await flushed
})

test('retains the actor receipt channel after a failed step so closing can confirm saved progress',async()=>{
 const f=fixture(false),adapter=await mountHomeWorkbenchGuide(document,f.host,f.options)
 const rejected=expect(adapter.runStep('wb-00')).rejects.toThrow('工作台演示未能完成');await Promise.resolve();f.reply(f.requests.at(-1),false);await rejected
 expect(f.requests.some(row=>row.command==='dispose')).toBe(false)
 const saving=adapter.flush();expect(f.requests.at(-1).command).toBe('flush');f.reply(f.requests.at(-1));await saving
 adapter.dispose();expect(f.requests.at(-1).command).toBe('dispose')
})
