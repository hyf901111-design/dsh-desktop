import {afterEach,expect,it,vi} from 'vitest'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'

const context={owner:'alice',sessionId:'note',documentId:'editor-one',mode:'notes' as const,editable:true,selectedBlockIds:[]}
const bridges:NotesCapabilityBridge[]=[]
afterEach(()=>{for(const bridge of bridges.splice(0))bridge.dispose();vi.useRealTimers()})
const applied={kind:'native-blocks',state:'applied',actionId:'native-action-one',changedBlockIds:['paragraph-one','table-one'],revision:'revision-after-one'}
const saved={...applied,state:'saved'}
function fixture(action='notes.blocks.apply',allowPreview=false,selectedBlockIds:string[]=[]){
 const sent:any[]=[],controller=new AbortController(),bridge=new NotesCapabilityBridge(value=>sent.push(value));bridges.push(bridge)
 let current=true
 const promise=bridge.request(action as any,{},{...context,selectedBlockIds},'generation-one',controller.signal,()=>current,allowPreview);void promise.catch(()=>{})
 const requestId=sent[0].requestId
 const respond=(input:any,owner='alice',sessionId='note')=>bridge.respond({requestId,sessionId,...input},owner)
 return{bridge,promise,sent,requestId,respond,controller,hide:()=>{current=false}}
}

it.each(['notes.blocks.apply','notes.blocks.undo'])('accepts only the matching native mutation phases for %s',async action=>{
 const f=fixture(action)
 expect(f.sent[0]).toMatchObject({action,owner:'alice',sessionId:'note',generationId:'generation-one',context})
 expect(f.respond({effect:applied},'bob')).toEqual({ok:false})
 expect(f.respond({effect:applied},'alice','another-note')).toEqual({ok:false})
 expect(f.respond({effect:applied})).toEqual({ok:true})
 expect(f.respond({effect:saved})).toEqual({ok:true})
 expect(f.respond({result:{status:'succeeded',effect:saved}})).toEqual({ok:true})
 expect(await f.promise).toMatchObject({status:'succeeded',effect:saved})
 expect(f.bridge.allowed(f.requestId,'alice','note')).toBe(false)
})

it.each([
 {...saved,kind:'content'},
 {...saved,state:'placeholder'},
 {...saved,actionId:''},
 {...saved,actionId:'a'.repeat(257)},
 {...saved,revision:''},
 {...saved,revision:42},
 {...saved,changedBlockIds:['paragraph-one','paragraph-one']},
 {...saved,changedBlockIds:['']},
 {...saved,changedBlockIds:[42]},
 {...saved,changedBlockIds:Array.from({length:40000},(_,index)=>String(index).padEnd(256,'x'))},
 {...saved,sessionId:'another-note'}
])('refuses malformed native progress and final effects without consuming the pending request (%#)',async effect=>{
 const f=fixture()
 expect(f.respond({effect})).toEqual({ok:false})
 expect(f.respond({result:{status:'succeeded',effect}})).toEqual({ok:false})
 expect(f.bridge.allowed(f.requestId,'alice','note')).toBe(true)
 expect(f.respond({result:{status:'succeeded',effect:saved}})).toEqual({ok:true})
 expect(await f.promise).toMatchObject({effect:saved})
})

it('binds native progress to the same action, changed block order and revision, and never regresses a saved phase',async()=>{
 const f=fixture();expect(f.respond({effect:applied})).toEqual({ok:true})
 for(const effect of [{...saved,actionId:'other-action'},{...saved,revision:'other-revision'},{...saved,changedBlockIds:['other-block']},{...saved,changedBlockIds:['table-one','paragraph-one']}]){
  expect(f.respond({effect})).toEqual({ok:false})
  expect(f.respond({result:{status:'succeeded',effect}})).toEqual({ok:false})
 }
 expect(f.respond({effect:saved})).toEqual({ok:true})
 expect(f.respond({effect:applied})).toEqual({ok:false})
 expect(f.respond({result:{status:'succeeded',effect:applied}})).toEqual({ok:false})
 f.respond({result:{status:'succeeded',effect:saved}})
 expect(await f.promise).toMatchObject({effect:saved})
})

it('does not accept a native write effect on a read or other non-native action',async()=>{
 const read=fixture('notes.blocks.read')
 expect(read.respond({effect:saved})).toEqual({ok:false})
 expect(read.respond({result:{status:'succeeded',effect:saved}})).toEqual({ok:false})
 read.respond({result:{status:'succeeded',data:{revision:'read-revision',blocks:[]}}})
 expect(await read.promise).toEqual({status:'succeeded',data:{revision:'read-revision',blocks:[]}})
 const style=fixture('notes.components.style')
 expect(style.respond({effect:saved})).toEqual({ok:false})
 style.respond({result:{status:'failed'}});await style.promise
})

it('does not call a native mutation successful until a matching saved effect exists',async()=>{
 const f=fixture()
 expect(f.respond({result:{status:'succeeded'}})).toEqual({ok:false})
 expect(f.respond({effect:applied})).toEqual({ok:true})
 expect(f.respond({result:{status:'succeeded'}})).toEqual({ok:false})
 expect(f.respond({effect:saved})).toEqual({ok:true})
 expect(f.respond({result:{status:'succeeded'}})).toEqual({ok:true})
 expect(await f.promise).toMatchObject({status:'succeeded',effect:saved})
})

it('keeps a matching saved native checkpoint that arrives after cancellation',async()=>{
 const f=fixture();f.respond({effect:applied});f.controller.abort()
 expect(f.bridge.allowed(f.requestId,'alice','note')).toBe(false)
 expect(f.sent.at(-1)).toMatchObject({requestId:f.requestId,cancel:true})
 expect(f.respond({effect:saved})).toEqual({ok:true})
 expect(f.respond({result:{status:'succeeded',effect:saved}})).toEqual({ok:true})
 expect(await f.promise).toMatchObject({status:'cancelled',effect:saved,changedBlockIds:['paragraph-one','table-one'],message:expect.stringMatching(/已保存.*笔记/)})
})

it('bounds cancellation settlement while preserving the acknowledged native effect',async()=>{
 vi.useFakeTimers()
 const f=fixture();f.respond({effect:applied});f.controller.abort()
 await vi.advanceTimersByTimeAsync(5000)
 expect(await f.promise).toMatchObject({status:'cancelled',effect:applied,message:expect.stringContaining('未确认保存')})
 expect(f.respond({effect:saved})).toEqual({ok:false})
})

it('retains applied native work on persistence failure and saved work after context changes',async()=>{
 const failed=fixture();failed.respond({effect:applied});failed.respond({error:'保存失败'})
 expect(await failed.promise).toMatchObject({status:'failed',effect:applied,message:expect.stringContaining('保存失败')})
 const hidden=fixture('notes.blocks.undo');hidden.respond({effect:saved});hidden.hide();hidden.respond({result:{status:'succeeded',effect:saved}})
 expect(await hidden.promise).toMatchObject({status:'cancelled',effect:saved})
})

it('cancels native reads immediately without inventing a write effect',async()=>{
 const f=fixture('notes.blocks.read');f.controller.abort()
 await expect(f.promise).rejects.toThrow('已取消')
 expect(f.respond({effect:saved})).toEqual({ok:false})
})

it('retains complete native effect metadata for a legal batch changing more than ten thousand nested or before/after IDs',async()=>{
 const f=fixture('notes.blocks.apply'),effect={...saved,changedBlockIds:Array.from({length:20000},(_,index)=>'block-'+index)}
 expect(f.respond({result:{status:'succeeded',effect}})).toEqual({ok:true})
 expect((await f.promise).effect.changedBlockIds).toHaveLength(20000)
})

const prepared={status:'succeeded',data:{pendingPreview:true,actionId:'generation-one'}}
it('keeps native saved-only admission unless the composer explicitly enables a generation-bound preview',async()=>{
 const ordinary=fixture()
 expect(ordinary.respond({result:prepared})).toEqual({ok:false})
 expect(ordinary.bridge.allowed(ordinary.requestId,'alice','note')).toBe(true)
 ordinary.respond({result:{status:'failed'}});await ordinary.promise
 const composer=fixture('notes.blocks.apply',true)
 expect(composer.respond({result:prepared})).toEqual({ok:true})
 expect(await composer.promise).toEqual(prepared)
})
it.each([
 {pendingPreview:true,actionId:'foreign'},
 {pendingPreview:true},
 {pendingPreview:true,actionId:'generation-one',effect:{state:'saved'}},
 {pendingPreview:false,actionId:'generation-one'}
])('rejects an unowned or malformed prepared native reply without consuming it (%#)',async data=>{
 const f=fixture('notes.blocks.undo',true)
 expect(f.respond({result:{status:'succeeded',data}})).toEqual({ok:false})
 expect(f.bridge.allowed(f.requestId,'alice','note')).toBe(true)
 f.respond({result:prepared});expect(await f.promise).toEqual(prepared)
})
it('never turns an acknowledged applied write into a no-effect preview',async()=>{
 const f=fixture('notes.blocks.apply',true)
 expect(f.respond({effect:applied})).toEqual({ok:true})
 expect(f.respond({result:prepared})).toEqual({ok:false})
 f.respond({result:{status:'succeeded',effect:saved}})
 expect(await f.promise).toMatchObject({effect:saved})
})
it('does not expose a preview after cancellation or a context change',async()=>{
 const stopped=fixture('notes.blocks.apply',true);stopped.controller.abort()
 expect(stopped.respond({result:prepared})).toEqual({ok:true})
 expect(await stopped.promise).toMatchObject({status:'cancelled'})
 const changed=fixture('notes.blocks.apply',true);changed.hide()
 expect(changed.respond({result:prepared})).toEqual({ok:true})
 await expect(changed.promise).rejects.toThrow('会话已变化')
})

const componentPrepared={status:'succeeded',data:{pendingPreview:true,actionId:'generation-one',blockId:'selected-component',revision:'component-sha'}}
it('admits a prepared component content reply only for the enabled composer and its one selected target',async()=>{
 const disabled=fixture('notes.components.apply',false,['selected-component'])
 expect(disabled.respond({result:componentPrepared})).toEqual({ok:false});disabled.respond({result:{status:'failed'}});await disabled.promise
 const enabled=fixture('notes.components.apply',true,['selected-component'])
 for(const data of [{...componentPrepared.data,blockId:'other'},{...componentPrepared.data,actionId:'other'},{...componentPrepared.data,revision:''},{...componentPrepared.data,extra:true}])expect(enabled.respond({result:{status:'succeeded',data}})).toEqual({ok:false})
 expect(enabled.respond({result:componentPrepared})).toEqual({ok:true});expect(await enabled.promise).toEqual(componentPrepared)
 const unselected=fixture('notes.components.apply',true)
 expect(unselected.respond({result:componentPrepared})).toEqual({ok:false});unselected.respond({result:{status:'failed'}});await unselected.promise
})
