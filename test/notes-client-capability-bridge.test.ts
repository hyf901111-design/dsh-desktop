import {expect,it,vi} from 'vitest'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'
const context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes' as const,editable:true,selectedBlockIds:[]}
it('cancels pending renderer work and rejects stale export writes and replies',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const pending=bridge.request('notes.export',{format:'pdf'},context,'generation',controller.signal,()=>true),id=sent[0].requestId
 expect(bridge.allowed(id,'alice','note')).toBe(true);expect(bridge.allowed(id,'bob','note')).toBe(false)
 controller.abort();expect(bridge.allowed(id,'alice','note')).toBe(false);bridge.respond({requestId:id,sessionId:'note',error:'已取消'},'alice');expect(await pending).toMatchObject({status:'cancelled'});expect(sent.at(-1)).toMatchObject({cancel:true,requestId:id});expect(bridge.allowed(id,'alice','note')).toBe(false)
 expect(bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',path:'/tmp/stale.pdf'}},'alice')).toEqual({ok:false});bridge.dispose()
})
it('will not resolve a request from another owner or session and checks live context at completion',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value));let current=true
 const promise=bridge.request('context',{},context,'generation',new AbortController().signal,()=>current),id=sent[0].requestId
 expect(bridge.respond({requestId:id,sessionId:'other',result:{}},'alice')).toEqual({ok:false});expect(bridge.respond({requestId:id,sessionId:'note',result:{}},'bob')).toEqual({ok:false})
 current=false;bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded'}},'alice');await expect(promise).rejects.toThrow('会话已变化');bridge.dispose()
})
it('retains saved style effects when cancellation arrives before the final renderer receipt',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const promise=bridge.request('notes.components.style',{scope:'note',theme:'enterprise'},context,'generation',controller.signal,()=>!controller.signal.aborted),id=sent[0].requestId
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',changedBlockIds:['r']}},'alice')).toEqual({ok:true})
 controller.abort()
 expect(bridge.respond({requestId:id,sessionId:'other',result:{status:'succeeded'}},'alice')).toEqual({ok:false})
 expect(bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',changedBlockIds:['r']}},'alice')).toEqual({ok:true})
 expect(await promise).toMatchObject({status:'cancelled',effect:{state:'saved',changedBlockIds:['r']},message:expect.stringContaining('已保存')})
 expect(bridge.allowed(id,'alice','note')).toBe(false);bridge.dispose()
})

it('keeps the latest saved phase on timeout without accepting a foreign or late receipt',async()=>{
 vi.useFakeTimers()
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value))
 try{
  const pending=bridge.request('notes.components.style',{scope:'note',theme:'enterprise'},context,'generation',new AbortController().signal,()=>true),id=sent[0].requestId
  bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',changedBlockIds:['r']}},'alice')
  await vi.advanceTimersByTimeAsync(100000)
  expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',changedBlockIds:['foreign']}},'bob')).toEqual({ok:false})
  expect(bridge.allowed(id,'alice','note')).toBe(false)
  await vi.advanceTimersByTimeAsync(5000)
  expect(await pending).toMatchObject({status:'cancelled',effect:{state:'saved',changedBlockIds:['r']}})
  expect(bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded'}},'alice')).toEqual({ok:false})
 }finally{bridge.dispose();vi.useRealTimers()}
})
it('accepts a same-request saved checkpoint arriving during cancellation and rejects forged export effects',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const pending=bridge.request('notes.export',{format:'md'},context,'generation',controller.signal,()=>!controller.signal.aborted),id=sent[0].requestId
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',path:'/tmp/forged.md'}},'alice')).toEqual({ok:false})
 bridge.exportEffect(id,'alice','note',{state:'writing',path:'/tmp/actual.md'});controller.abort()
 expect(bridge.exportEffect(id,'alice','other',{state:'saved',path:'/tmp/foreign.md'})).toBe(false)
 bridge.exportEffect(id,'alice','note',{state:'saved',path:'/tmp/actual.md'})
 bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',path:'/tmp/actual.md'}},'alice')
 expect(await pending).toMatchObject({status:'cancelled',path:'/tmp/actual.md',effect:{state:'saved',path:'/tmp/actual.md'}});bridge.dispose()
})
it('preserves a created block saved before cancellation and rejects a different block in a later phase',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const pending=bridge.request('notes.components.create',{prompt:'表格'},context,'generation',controller.signal,()=>!controller.signal.aborted),id=sent[0].requestId
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'placeholder',blockId:'created'}},'alice')).toEqual({ok:true})
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'applied',blockId:'created'}},'alice')).toEqual({ok:true})
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',blockId:'created'}},'alice')).toEqual({ok:true})
 controller.abort()
 expect(bridge.respond({requestId:id,sessionId:'note',effect:{state:'saved',blockId:'different'}},'alice')).toEqual({ok:false})
 expect(bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',effect:{state:'saved',blockId:'different'}}},'alice')).toEqual({ok:false})
 bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',blockId:'created'}},'alice')
 expect(await pending).toMatchObject({status:'cancelled',blockId:'created',effect:{state:'saved',blockId:'created'},message:expect.stringContaining('已生成并保存')});bridge.dispose()
})
