import {it,expect} from 'vitest'
const host=await import('../packages/dsh-research-task-runtime/client-capability-host.js').catch(()=>null)
it('shares semantic canvas/window handlers, bounds arguments and preserves real ordered receipts',async()=>{
 expect(host,'shared host factory missing').not.toBeNull()
 const effects=[],context={owner:'alice',sessionId:'s',documentId:'s',mode:'research',editable:true,selectedBlockIds:[],canvasAvailable:true}
 const h=host.createClientCapabilityHost({current:()=>context,canvas:async(method,args)=>{effects.push([method,args]);return method==='inspect'?{revision:'r1',nodes:[]}:{actionId:'a',canUndo:true}},window:async(action,args)=>{effects.push([action,args]);return{zoomLevel:0}},navigate:async()=>({mode:'notes'})})
 expect(h.registry.catalog(context).filter(d=>d.available).map(d=>d.id)).toContain('canvas.apply')
 expect((await h.executor.execute({requestId:'read',capability:'canvas.inspect',arguments:{}},context)).data.revision).toBe('r1')
 const call={requestId:'write',capability:'canvas.apply',arguments:{revision:'r1',operations:[{op:'arrange'}]}}
 expect((await h.executor.execute(call,context)).status).toBe('succeeded');await h.executor.execute(call,context)
 expect(effects.filter(e=>e[0]==='apply')).toHaveLength(1)
 expect((await h.executor.execute({...call,requestId:'bad',arguments:{...call.arguments,sessionId:'other'}},context)).status).toBe('failed')
 expect((await h.executor.execute({requestId:'z',capability:'ui.zoom.in',arguments:{}},context)).status).toBe('succeeded')
 expect(h.registry.catalog({...context,mode:'conversation',canvasAvailable:false}).find(d=>d.id==='canvas.apply').available).toBe(false)
 expect(h.registry.catalog(context).find(d=>d.id==='notes.export').available).toBe(false)
})
it('translates the new fixed capability receipt labels without treating document text as UI copy',async()=>{
 const {capabilityReceiptText}=await import('../packages/dsh-research-task-runtime/client-capabilities.js')
 expect(capabilityReceiptText([{capability:'canvas.apply',status:'pending'},{capability:'ui.fullscreen.set',status:'succeeded'}],'en')).toBe('Modify canvas: Synchronization unconfirmed\nWindow fullscreen: Completed')
})
