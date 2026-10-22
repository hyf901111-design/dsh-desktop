import {expect,it} from 'vitest'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'
const context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes' as const,editable:true,selectedBlockIds:[]}
it('cancels pending renderer work and rejects stale export writes and replies',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const pending=bridge.request('notes.export',{format:'pdf'},context,'generation',controller.signal,()=>true),id=sent[0].requestId
 expect(bridge.allowed(id,'alice','note')).toBe(true);expect(bridge.allowed(id,'bob','note')).toBe(false)
 controller.abort();await expect(pending).rejects.toThrow('已取消');expect(sent.at(-1)).toMatchObject({cancel:true,requestId:id});expect(bridge.allowed(id,'alice','note')).toBe(false)
 expect(bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded',path:'/tmp/stale.pdf'}},'alice')).toEqual({ok:false});bridge.dispose()
})
it('will not resolve a request from another owner or session and checks live context at completion',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value));let current=true
 const promise=bridge.request('context',{},context,'generation',new AbortController().signal,()=>current),id=sent[0].requestId
 expect(bridge.respond({requestId:id,sessionId:'other',result:{}},'alice')).toEqual({ok:false});expect(bridge.respond({requestId:id,sessionId:'note',result:{}},'bob')).toEqual({ok:false})
 current=false;bridge.respond({requestId:id,sessionId:'note',result:{status:'succeeded'}},'alice');await expect(promise).rejects.toThrow('会话已变化');bridge.dispose()
})
