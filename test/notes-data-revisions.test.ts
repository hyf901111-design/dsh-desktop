import {expect,it,vi} from 'vitest'
import {createNoteDataRevisionHandler} from '../src/main/notes/data-revisions'
import type {CapabilityReceipt} from '../packages/dsh-research-task-runtime/client-capabilities.js'
const inspect=(revision=1,nodeId='node'):CapabilityReceipt=>({status:'succeeded',data:{bound:true,nodeId,revision,enabled:true,intervalMinutes:1}})
const configure=(revision=2):CapabilityReceipt=>({status:'succeeded',effect:{kind:'data',state:'saved',operation:'configure',blockId:'block',enabled:true,intervalMinutes:2},data:{bound:true,nodeId:'node',revision,enabled:true,intervalMinutes:2}})
it('follows multiple own exact configure edges for refresh and leaves model arguments immutable',async()=>{
 let current=1
 const invoke=vi.fn(async(args:any)=>args.action==='inspect'?inspect(current):args.action==='configure'?configure(++current):inspect(current))
 const handle=createNoteDataRevisionHandler('block',invoke)
 await handle({action:'inspect'});await handle({action:'configure',revision:1,settings:{intervalMinutes:2}});await handle({action:'configure',revision:2,settings:{enabled:true}})
 const original={action:'refresh' as const,revision:1};await handle(original)
 expect(invoke.mock.calls.at(-1)![0]).toEqual({action:'refresh',revision:3});expect(original.revision).toBe(1)
 await handle({action:'refresh',revision:3});expect(invoke.mock.calls.at(-1)![0].revision).toBe(3)
})
it.each(['failed','pending','cancelled','applied','wrong-operation','wrong-block','wrong-node','jump','missing-revision','wrong-settings','unbound'])('does not trust a %s configure receipt as a revision edge',async mode=>{
 const result=configure() as any
 if(['failed','pending','cancelled'].includes(mode))result.status=mode
 if(mode==='applied')result.effect.state='applied'
 if(mode==='wrong-operation')result.effect.operation='refresh'
 if(mode==='wrong-block')result.effect.blockId='other-block'
 if(mode==='wrong-node')result.data.nodeId='other-node'
 if(mode==='jump')result.data.revision=3
 if(mode==='missing-revision')delete result.data.revision
 if(mode==='wrong-settings')result.effect.intervalMinutes=4
 if(mode==='unbound')result.data.bound=false
 const invoke=vi.fn(async(args:any):Promise<CapabilityReceipt>=>args.action==='inspect'?inspect():args.action==='configure'?result:{status:'failed'})
 const handle=createNoteDataRevisionHandler('block',invoke)
 await handle({action:'inspect'});await handle({action:'configure',revision:1,settings:{intervalMinutes:2}});await handle({action:'refresh',revision:1})
 expect(invoke.mock.calls.at(-1)![0]).toEqual({action:'refresh',revision:1})
})
it('requires this request own inspection and does not generalize a known edge to another stale number or configure',async()=>{
 const invoke=vi.fn(async(args:any):Promise<CapabilityReceipt>=>args.action==='inspect'?inspect(5):args.action==='configure'?configure(6):{status:'failed'})
 const handle=createNoteDataRevisionHandler('block',invoke)
 await handle({action:'configure',revision:5,settings:{enabled:true}});await handle({action:'refresh',revision:5});expect(invoke.mock.calls.at(-1)![0].revision).toBe(5)
 await handle({action:'inspect'});await handle({action:'configure',revision:5,settings:{enabled:true}})
 await handle({action:'refresh',revision:4});expect(invoke.mock.calls.at(-1)![0].revision).toBe(4)
 await handle({action:'configure',revision:5,settings:{enabled:true}});expect(invoke.mock.calls.at(-1)![0].revision).toBe(5)
})
it('clears previous edges after a new inspection instead of borrowing an external binding change',async()=>{
 let current=1
 const invoke=vi.fn(async(args:any)=>args.action==='inspect'?inspect(current):args.action==='configure'?configure(++current):inspect(current))
 const handle=createNoteDataRevisionHandler('block',invoke)
 await handle({action:'inspect'});await handle({action:'configure',revision:1,settings:{enabled:true}});current=3
 await handle({action:'inspect'});await handle({action:'refresh',revision:1})
 expect(invoke.mock.calls.at(-1)![0].revision).toBe(1)
})
it.each(['failed','unavailable','unbound'])('clears old authority when a later inspection is %s',async mode=>{
 let inspected=0
 const invoke=vi.fn(async(args:any):Promise<CapabilityReceipt>=>args.action==='inspect'?(++inspected===1?inspect():mode==='unbound'?{status:'succeeded',data:{bound:false}}:{status:mode as 'failed'|'unavailable'}):args.action==='configure'?configure():{status:'failed'})
 const handle=createNoteDataRevisionHandler('block',invoke)
 await handle({action:'inspect'});await handle({action:'configure',revision:1,settings:{enabled:true}});await handle({action:'inspect'});await handle({action:'refresh',revision:1})
 expect(invoke.mock.calls.at(-1)![0].revision).toBe(1)
})
it('keeps revision proof private to one request instance and captured block',async()=>{
 const invoke=vi.fn(async(args:any)=>args.action==='inspect'?inspect():args.action==='configure'?configure():inspect(2))
 const first=createNoteDataRevisionHandler('block',invoke)
 await first({action:'inspect'});await first({action:'configure',revision:1,settings:{enabled:true}})
 const second=createNoteDataRevisionHandler('block',invoke);await second({action:'refresh',revision:1});expect(invoke.mock.calls.at(-1)![0].revision).toBe(1)
 const other=createNoteDataRevisionHandler('other-block',invoke);await other({action:'inspect'});await other({action:'configure',revision:1,settings:{enabled:true}});await other({action:'refresh',revision:1});expect(invoke.mock.calls.at(-1)![0].revision).toBe(1)
})
