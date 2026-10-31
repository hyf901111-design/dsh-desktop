// @vitest-environment happy-dom
import {expect,test,vi} from 'vitest'
import {playHomeGuideFromOperations,type HomeGuideKind} from '../src/preload/home-guides'
import {playHomeGuideFromExplore} from '../src/preload/explore-menu-actions'

test.each<HomeGuideKind>(['board','note','ppt','report','workbench'])('hands the still-open Explore %s entry to the native controller without hiding its first click',async kind=>{
 const context={signal:new AbortController().signal,revealComposer:vi.fn(async()=>{})},start=vi.fn(async()=>{})
 await playHomeGuideFromExplore({start},kind,context)
 expect(context.revealComposer).not.toHaveBeenCalled()
 expect(start).toHaveBeenCalledExactlyOnceWith(kind,{replay:true,entry:context})
})
test('does not start an Explore example after cancellation',async()=>{
 const abort=new AbortController(),start=vi.fn(async()=>{});abort.abort()
 await expect(playHomeGuideFromExplore({start},'note',{signal:abort.signal,revealComposer:async()=>{}})).rejects.toMatchObject({name:'AbortError'})
 expect(start).not.toHaveBeenCalled()
})
test('propagates a failed native Explore opening without independently dismissing it',async()=>{
 const error=Error('浮层未关闭'),context={signal:new AbortController().signal,revealComposer:vi.fn(async()=>{})},start=vi.fn(async()=>{throw error})
 await expect(playHomeGuideFromExplore({start},'note',context)).rejects.toBe(error)
 expect(context.revealComposer).not.toHaveBeenCalled()
})

test.each<HomeGuideKind>(['board','note','ppt','report','workbench'])('hands the intact %s entry to the controller before any independent navigation',async kind=>{
 const start=vi.fn(async()=>{}),context={signal:new AbortController().signal,revealComposer:vi.fn(async()=>{}),handoff:vi.fn(),origin:{x:240,y:320}}
 await playHomeGuideFromOperations({start},kind,context)
 expect(start).toHaveBeenCalledExactlyOnceWith(kind,{replay:true,entry:context})
 // The real controller owns the visual return, real Tab and new-session order.
 expect(context.revealComposer).not.toHaveBeenCalled();expect(context.handoff).not.toHaveBeenCalled()
})
test('does not enter the controller for an already cancelled operation',async()=>{
 const abort=new AbortController(),start=vi.fn(async()=>{});abort.abort()
 await expect(playHomeGuideFromOperations({start},'ppt',{signal:abort.signal,revealComposer:async()=>{}})).rejects.toMatchObject({name:'AbortError'});expect(start).not.toHaveBeenCalled()
})
test('propagates the entry or preparation failure to the operations caller',async()=>{
 const error=Error('输入框暂未就绪'),start=vi.fn(async()=>{throw error})
 await expect(playHomeGuideFromOperations({start},'note',{signal:new AbortController().signal,revealComposer:async()=>{}})).rejects.toBe(error)
})
