import {afterEach,expect,it,vi} from 'vitest'
import {NoteChallengeScheduler} from '../src/preload/notes/challenge-scheduler'

const blocks=(text='这是一段稳定正文。')=>[{id:'p',type:'paragraph',text}]
const answer={version:1 as const,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]}
afterEach(()=>vi.useRealTimers())

it('claims an explicit tier recheck before an immediate session switch can pause it',async()=>{
 vi.useFakeTimers();let finish!:(value:any)=>void,signal!:AbortSignal
 const run=vi.fn((_request,current)=>{signal=current;return new Promise<typeof answer>(resolve=>{finish=resolve})}),onResult=vi.fn(),scheduler=new NoteChallengeScheduler({sessionId:'a',run,onResult})
 scheduler.update({title:'文稿',blocks:blocks(),active:true,busy:true});scheduler.setLevel(4)
 scheduler.update({title:'文稿',blocks:blocks(),active:true,busy:false});scheduler.recheck(true)
 expect(run).toHaveBeenCalledOnce()
 scheduler.update({title:'文稿',blocks:blocks(),active:false})
 expect(signal.aborted).toBe(false)
 finish(answer);await vi.advanceTimersByTimeAsync(1);expect(onResult).toHaveBeenCalledOnce()
 scheduler.recheck(true);await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce()
 scheduler.dispose()
})

it.each(['inactive','busy','composing','budget'])('keeps an immediate recheck gated by %s',async gate=>{
 vi.useFakeTimers();const run=vi.fn(async()=>answer),scheduler=new NoteChallengeScheduler({sessionId:'a',run,onResult:vi.fn()})
 scheduler.update({title:'文稿',blocks:blocks(),active:gate!=='inactive',busy:gate==='busy',composing:gate==='composing'})
 if(gate==='budget')scheduler.restoreUsage({version:1,sessionId:'a',usage:[{at:Date.now(),chars:1,input:1,output:4000}]})
 scheduler.setLevel(4,true);scheduler.recheck(true)
 expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).not.toHaveBeenCalled()
 scheduler.dispose()
})

it('finishes an already-started review while inactive without launching another hidden batch',async()=>{
 vi.useFakeTimers();let finish!:(value:any)=>void;let signal!:AbortSignal
 const run=vi.fn((_request:any,current:AbortSignal)=>{signal=current;return new Promise<any>(resolve=>{finish=resolve})}),onResult=vi.fn(),states:any[]=[]
 const scheduler=new NoteChallengeScheduler({sessionId:'a',run,onResult,onState:state=>states.push(state)})
 scheduler.update({title:'文稿',blocks:blocks(),active:true});scheduler.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 scheduler.update({title:'文稿',blocks:blocks(),active:false})
 expect(signal.aborted).toBe(false);expect(states.at(-1).phase).toBe('running')
 finish(answer);await vi.advanceTimersByTimeAsync(1);expect(onResult).toHaveBeenCalledOnce()
 scheduler.recheck(true);await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce();expect(states.at(-1).phase).toBe('paused')
 scheduler.dispose()
})

it('discards a background response for changed text without checking the new text in the background',async()=>{
 vi.useFakeTimers();let finish!:(value:any)=>void
 const run=vi.fn(()=>new Promise<any>(resolve=>{finish=resolve})),onResult=vi.fn(),scheduler=new NoteChallengeScheduler({sessionId:'a',run,onResult})
 scheduler.update({title:'文稿',blocks:blocks(),active:true});scheduler.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 scheduler.update({title:'文稿',blocks:blocks('已经更新的正文。'),active:false});finish(answer);await vi.advanceTimersByTimeAsync(60000)
 expect(onResult).not.toHaveBeenCalled();expect(run).toHaveBeenCalledOnce();scheduler.dispose()
})

it.each(['off','dispose'])('still cancels a real review on explicit %s',async action=>{
 vi.useFakeTimers();let signal!:AbortSignal;let finish!:(value:any)=>void
 const onResult=vi.fn(),scheduler=new NoteChallengeScheduler({sessionId:'a',run:(_request,current)=>{signal=current;return new Promise(resolve=>{finish=resolve})},onResult})
 scheduler.update({title:'文稿',blocks:blocks(),active:true});scheduler.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 scheduler.update({title:'文稿',blocks:blocks(),active:false});if(action==='off')scheduler.setLevel(0);else scheduler.dispose()
 expect(signal.aborted).toBe(true);finish(answer);await vi.advanceTimersByTimeAsync(1);expect(onResult).not.toHaveBeenCalled();scheduler.dispose()
})
