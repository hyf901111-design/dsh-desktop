import {expect,it} from 'vitest'
const module = await import('../packages/dsh-research-task-runtime/client-capabilities.js').catch(()=>null)
it('registers bounded semantic handlers with schemas instead of accepting arbitrary IPC',()=>{
 expect(module, 'typed capability registry has not been implemented').not.toBeNull()
 const registry=module.createClientCapabilityRegistry({exportNote:async()=>({status:'succeeded',path:'/tmp/report.pdf'}),styleComponents:async()=>({status:'succeeded'}),inspectCanvas:async()=>({status:'succeeded'}),resetZoom:async()=>({status:'succeeded'})})
 expect(registry.catalog(context).map(x=>x.id)).toEqual(['notes.components.create','notes.export','notes.components.style','notes.blocks.align','notes.components.inspect','notes.components.apply','canvas.inspect','ui.zoom.reset'])
 expect(registry.catalog(context).every(x=>x.parameters.additionalProperties===false)).toBe(true)
})
const context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[],componentBlockIds:['one','two']}
const run=async()=>{expect(module).not.toBeNull();return module}
it('executes whole-note style and export in order, caches exact repeats and rejects changed identities or arguments',async()=>{
 const m=await run(),effects=[],registry=m.createClientCapabilityRegistry({styleComponents:async(args)=>{effects.push(args);return{status:'succeeded',changedBlockIds:['one','two']}},exportNote:async()=>{effects.push('pdf');return{status:'succeeded',path:'/tmp/report.pdf'}}}),controller=m.createCapabilityExecutor(registry,()=>context)
 const first={requestId:'a',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise',titleBar:false}}
 const a=await controller.execute(first,context);expect(a.status).toBe('succeeded');expect(await controller.execute(first,context)).toEqual(a);expect(effects).toHaveLength(1)
 expect((await controller.execute({...first,arguments:{scope:'note',theme:'dark'}},context)).status).toBe('failed')
 expect((await controller.execute({requestId:'b',capability:'notes.export',arguments:{format:'pdf',path:'/tmp/report.pdf'}},context)).path).toBe('/tmp/report.pdf');expect(effects.at(-1)).toBe('pdf')
 expect((await controller.execute({requestId:'c',capability:'ui.any',arguments:{}},context)).status).toBe('unavailable')
 expect((await controller.execute({...first,requestId:'d',arguments:{scope:'selected',theme:'enterprise'}},context)).status).toBe('failed')
 expect((await controller.execute({...first,requestId:'e'}, {...context,owner:'old'})).status).toBe('unavailable')
 expect((await controller.execute({...first,requestId:'f',arguments:{scope:'note',evil:'ipc'}},context)).status).toBe('failed')
 const signal=AbortSignal.abort();expect((await controller.execute({...first,requestId:'g'},context,signal)).status).toBe('cancelled');expect(effects).toHaveLength(2)
})
it('does not turn adapter exceptions or pending interaction into success',async()=>{
 const m=await run(),registry=m.createClientCapabilityRegistry({exportNote:async()=>{throw Error('磁盘已满')}}),executor=m.createCapabilityExecutor(registry,()=>context)
 expect(await executor.execute({requestId:'x',capability:'notes.export',arguments:{format:'pdf'}},context)).toMatchObject({status:'failed',message:'磁盘已满'})
})
it('runs structured calls sequentially with real receipts and stops after a failed dependency',async()=>{
 const m=await import('../packages/dsh-research-task-runtime/client-capability-loop.js').catch(()=>null);expect(m,'bounded host tool loop is absent').not.toBeNull()
 const order=[],receipts=[],result=await m.runClientCapabilityLoop({generate:async history=>history.length?{kind:'conversation',markdown:'model claims success'}:{kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]},execute:async call=>{order.push(call.capability);return{...call,status:call.capability==='notes.export'?'failed':'succeeded',message:call.capability==='notes.export'?'磁盘已满':undefined}},onReceipts:r=>receipts.push(...r)})
 expect(order).toEqual(['notes.components.style','notes.export']);expect(result.markdown).toContain('磁盘已满');expect(result.markdown).not.toContain('model claims success');expect(receipts).toHaveLength(2)
})
it('shares one in-flight execution, rechecks session identity and propagates pending user interaction',async()=>{
 let current=context,finish,executions=0
 const registry=module.createClientCapabilityRegistry({exportNote:async()=>{executions++;return new Promise(resolve=>{finish=resolve})}}),executor=module.createCapabilityExecutor(registry,()=>current),call={requestId:'dialog',capability:'notes.export',arguments:{format:'pdf'}}
 const first=executor.execute(call,context),second=executor.execute(call,context);await Promise.resolve();expect(executions).toBe(1);finish({status:'pending',message:'等待保存位置'});expect((await first).status).toBe('pending');expect(await second).toEqual(await first)
 current={...context,sessionId:'other'};expect((await executor.execute({...call,requestId:'new'},context)).status).toBe('unavailable');expect(executions).toBe(1)
})
it('bounds repeated tool rounds and retains verified effects when a later model result is invalid',async()=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js');let n=0
 const bounded=await runClientCapabilityLoop({generate:async()=>({kind:'capabilities',calls:[{requestId:String(n++),capability:'ui.zoom.reset',arguments:{}}]}),execute:async call=>({...call,status:'succeeded'})})
 expect(n).toBe(6);expect(bounded.capabilityReceipts).toHaveLength(6);expect(bounded.markdown).toContain('上限')
 let rounds=0;const malformed=await runClientCapabilityLoop({generate:async()=>rounds++?{kind:'capabilities',calls:[]}:{kind:'capabilities',calls:[{requestId:'one',capability:'ui.zoom.reset',arguments:{}}]},execute:async()=>({status:'succeeded',capability:'ui.zoom.reset'})})
 expect(malformed.capabilityReceipts).toHaveLength(1);expect(malformed.markdown).toContain('未继续执行')
})
it('keeps new prose unapplied while exposing completed operation receipts beside its preview',async()=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js');let round=0
 const result=await runClientCapabilityLoop({generate:async()=>round++?{kind:'text',markdown:'尚未采纳的新正文'}:{kind:'capabilities',calls:[{requestId:'zoom',capability:'ui.zoom.reset',arguments:{}}]},execute:async()=>({status:'succeeded',capability:'ui.zoom.reset'})})
 expect(result.kind).toBe('text');expect(result.markdown).toBe('尚未采纳的新正文');expect(result.capabilitySummary).toContain('恢复缩放：已完成')
})
it.each([
 ['notes.components.create',{prompt:''}],
 ['notes.components.create',{prompt:'x'.repeat(8001)}],
 ['notes.export',{format:'pdf',path:''}],
 ['notes.export',{format:'pdf',path:'x'.repeat(4097)}],
 ['notes.export',{format:'PDF'}],
 ['notes.components.style',{scope:'note',titleBar:'false'}],
 ['notes.components.style',{scope:'note',theme:'enterprise',ipc:'execute'}],
 ['notes.export',{}],
 ['notes.export',null],
])('rejects invalid %s arguments before invoking any effect (case %#)',async(capability,args)=>{
 const effects=[],handler=async input=>{effects.push(input);return{status:'succeeded'}}
 const registry=module.createClientCapabilityRegistry({createComponent:handler,exportNote:handler,styleComponents:handler})
 const before=JSON.stringify(args)
 await expect(registry.execute({capability,arguments:args},context)).rejects.toThrow('客户端能力参数无效')
 expect(effects).toEqual([]);expect(JSON.stringify(args)).toBe(before)
})
it('accepts schema boundary lengths without coercing or mutating validated arguments',async()=>{
 const effects=[],handler=async input=>{effects.push(input);return{status:'succeeded'}}
 const registry=module.createClientCapabilityRegistry({createComponent:handler,exportNote:handler,styleComponents:handler})
 for(const [capability,args] of [['notes.components.create',{prompt:'字'.repeat(8000)}],['notes.export',{format:'pdf',path:'x'.repeat(4096)}],['notes.components.style',{scope:'note',titleBar:false}]]){
  const before=JSON.stringify(args)
  expect(await registry.execute({capability,arguments:args},context)).toEqual({status:'succeeded'})
  expect(effects.at(-1)).toBe(args);expect(JSON.stringify(args)).toBe(before)
 }
})
