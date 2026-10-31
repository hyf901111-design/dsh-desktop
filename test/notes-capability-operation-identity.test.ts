import {expect,it,vi} from 'vitest'
import {createClientCapabilityHost} from '../packages/dsh-research-task-runtime/client-capability-host.js'
import {createNoteCapabilityExecutor} from '../src/main/notes/capability-operation-identity'

function fixture(){
 const original={owner:'alice',sessionId:'note',documentId:'visible-document',mode:'notes' as const,editable:true,selectedBlockIds:[]}
 let visible:typeof original|undefined=original
 const read=vi.fn(async()=>({status:'succeeded' as const,data:{revision:'read-revision',blocks:[]}})),apply=vi.fn(async()=>({status:'succeeded' as const,effect:{kind:'native-blocks' as const,state:'saved' as const,actionId:'root-generation',changedBlockIds:['code'],revision:'saved-revision'}}))
 const current=()=>visible,host=createClientCapabilityHost({current,handlers:{readNoteBlocks:read,applyNoteBlocks:apply}}),executor=createNoteCapabilityExecutor(host,current)
 const readCall={requestId:'insert-python-code-1',capability:'notes.blocks.read' as const,arguments:{scope:'note' as const}},writeCall={requestId:readCall.requestId,capability:'notes.blocks.apply' as const,arguments:{revision:'read-revision',operations:[{op:'insert' as const,anchor:{blockId:'anchor',placement:'after' as const},blocks:[{type:'codeBlock',props:{language:'python'},content:'def mean(values):\n    return sum(values) / len(values) if values else None'}]}]}}
 return{original,host,executor,read,apply,readCall,writeCall,visible:(value:typeof visible)=>visible=value}
}
it('separates provider read/apply IDs only in the Notes generation while the general Host stays strict',async()=>{
 const f=fixture()
 expect(await f.executor.execute(f.readCall,f.original)).toMatchObject({requestId:'insert-python-code-1',capability:'notes.blocks.read',status:'succeeded'})
 expect(await f.executor.execute(f.writeCall,f.original)).toMatchObject({requestId:'insert-python-code-1',capability:'notes.blocks.apply',status:'succeeded'})
 expect(f.read).toHaveBeenCalledTimes(1);expect(f.apply).toHaveBeenCalledTimes(1)
 const strict=fixture();await strict.host.executor.execute(strict.readCall,strict.original)
 expect(await strict.host.executor.execute(strict.writeCall,strict.original)).toMatchObject({status:'failed',message:'请求标识已用于不同操作。'});expect(strict.apply).not.toHaveBeenCalled()
})
it('replays the same pending and completed write once, and rejects changed arguments under the same operation ID',async()=>{
 const f=fixture();let release!:(value:any)=>void
 f.apply.mockImplementationOnce(()=>new Promise(resolve=>release=resolve))
 const pending=f.executor.execute(f.writeCall,f.original),duplicate=f.executor.execute(structuredClone(f.writeCall),f.original)
 await vi.waitFor(()=>expect(f.apply).toHaveBeenCalledTimes(1));release({status:'succeeded',message:'已保存'})
 const first=await pending;expect(await duplicate).toEqual(first);expect(await f.executor.execute(f.writeCall,f.original)).toEqual(first)
 const changed=structuredClone(f.writeCall);changed.arguments.operations[0]!.blocks[0]!.content='different payload'
 expect(await f.executor.execute(changed,f.original)).toMatchObject({status:'failed',message:'请求标识已用于不同操作。'});expect(f.apply).toHaveBeenCalledTimes(1)
})
it.each(['session','document','owner','hidden'] as const)('does not borrow another %s context for a late read-to-write operation',async change=>{
 const f=fixture();await f.executor.execute(f.readCall,f.original)
 f.visible(change==='hidden'?undefined:{...f.original,...change==='session'?{sessionId:'other'}:change==='document'?{documentId:'new-editor'}:{owner:'bob'}})
 expect(await f.executor.execute(f.writeCall,f.original)).toMatchObject({status:'unavailable'});expect(f.apply).not.toHaveBeenCalled()
})
it('keeps raw ID/schema validation and cancellation before dispatch rather than replacing caller IDs',async()=>{
 const f=fixture()
 for(const requestId of ['',null,'x'.repeat(257)])expect(await f.executor.execute({...f.writeCall,requestId} as any,f.original)).toMatchObject({status:'failed'})
 expect(await f.executor.execute({...f.writeCall,requestId:'bad-args',arguments:{...f.writeCall.arguments,sessionId:'forged-target'}} as any,f.original)).toMatchObject({status:'failed'})
 const stopped=new AbortController();stopped.abort()
 expect(await f.executor.execute(f.writeCall,f.original,stopped.signal)).toMatchObject({status:'cancelled'});expect(f.apply).not.toHaveBeenCalled()
})
