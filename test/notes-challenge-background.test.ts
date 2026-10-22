import {afterEach,expect,it,vi} from 'vitest'
import {NoteChallengeScheduler} from '../src/preload/notes/challenge-scheduler'

const blocks=(text='这是一段稳定正文。')=>[{id:'p',type:'paragraph',text}]
const answer={version:1 as const,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]}
afterEach(()=>vi.useRealTimers())

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
