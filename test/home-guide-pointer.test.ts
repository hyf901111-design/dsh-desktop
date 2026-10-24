// @vitest-environment happy-dom
import {afterEach,expect,test,vi} from 'vitest'
import {createHomeGuidePointer} from '../src/preload/home-guide-pointer'
const releases:Array<()=>void>=[]
afterEach(()=>{for(const release of releases.splice(0))release();document.body.innerHTML='';vi.useRealTimers()})
function fixture(){
 vi.useFakeTimers();const abort=new AbortController(),target=document.createElement('button'),source=document.createElement('button');document.body.append(target,source)
 target.getBoundingClientRect=()=>({left:320,top:220,right:400,bottom:260,width:80,height:40,x:320,y:220,toJSON:()=>({})})
 source.getBoundingClientRect=()=>({left:80,top:100,right:100,bottom:120,width:20,height:20,x:80,y:100,toJSON:()=>({})})
 let gate:Promise<void>|undefined,resume:()=>void=()=>{}
 const pointer=createHomeGuidePointer(document,{runId:'run',signal:abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>gate??Promise.resolve()})
 releases.push(pointer.dispose);return{pointer,abort,target,source,pause:()=>{gate=new Promise(resolve=>{resume=()=>{gate=undefined;resolve()}})},resume:()=>resume()}
}
test('moves a DOM arrow then acknowledges its click without clicking or focusing the target',async()=>{
 const f=fixture(),click=vi.fn();f.target.addEventListener('click',click);let finished=false
 const action=f.pointer.perform({target:f.target,action:'click'}).then(()=>{finished=true})
 await vi.advanceTimersByTimeAsync(80);expect(finished).toBe(false);expect(document.querySelector('[data-home-guide-pointer]')?.getAttribute('aria-hidden')).toBe('true');expect(document.activeElement).not.toBe(f.target)
 await vi.runAllTimersAsync();await action;expect(finished).toBe(true);expect(click).not.toHaveBeenCalled();expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('pauses mid-travel and only finishes the same action after resume',async()=>{
 const f=fixture();let finished=false;const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source}).then(()=>{finished=true})
 await vi.advanceTimersByTimeAsync(160);f.pause();await vi.advanceTimersByTimeAsync(80);const paused=f.pointer.snapshot();await vi.advanceTimersByTimeAsync(4000)
 expect(f.pointer.snapshot()).toEqual(paused);expect(finished).toBe(false);f.resume();await vi.runAllTimersAsync();await action;expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('abort or a disappearing target rejects before an actor may submit its operation',async()=>{
 const f=fixture();const action=f.pointer.perform({target:f.target,action:'click'});const result=action.catch(error=>error.name)
 await vi.advanceTimersByTimeAsync(80);f.abort.abort();expect(await result).toBe('AbortError');expect(document.querySelector<HTMLElement>('[data-home-guide-pointer]')?.hidden).toBe(true)
})
test('rejects a vanished target and serializes actions rather than leaving a late visual click',async()=>{
 const f=fixture(),first=f.pointer.perform({target:f.target,action:'move'}),result=first.catch(error=>error.message)
 await expect(f.pointer.perform({target:f.source,action:'click'})).rejects.toThrow('上一项')
 await vi.advanceTimersByTimeAsync(60);f.target.remove();await vi.runAllTimersAsync();expect(await result).toContain('不可用');expect(f.pointer.snapshot().state).toBe('idle')
})
test('rejects targets clipped out by a scroll ancestor rather than pointing at hidden content',async()=>{
 const f=fixture(),parent=document.createElement('div');parent.style.overflow='hidden';parent.getBoundingClientRect=()=>({left:20,top:20,right:100,bottom:100,width:80,height:80,x:20,y:20,toJSON:()=>({})});document.body.append(parent);parent.append(f.target)
 const result=f.pointer.perform({target:f.target}).catch(error=>error.message);await vi.runAllTimersAsync();expect(await result).toContain('不可用')
})
