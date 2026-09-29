import { it, expect } from 'vitest'
import { CanvasActionBridge } from '../src/main/state/canvas-action-bridge'
it('requires a bound session and correlates only its renderer response',async()=>{
 let sent:any
 const bridge=new CanvasActionBridge({send:value=>{sent=value},canRead:()=>true})
 await expect(bridge.execute({sessionId:'s',method:'inspect',args:{}})).rejects.toThrow()
 bridge.bind({sessionId:'s',selectedIds:['one']})
 const pending=bridge.execute({sessionId:'s',method:'inspect',args:{}})
 expect(sent.selectedIds).toEqual(['one'])
 bridge.respond({requestId:sent.requestId,sessionId:'other',result:{bad:true}})
 bridge.respond({requestId:sent.requestId,sessionId:'s',result:{ok:true}})
 expect(await pending).toEqual({ok:true});bridge.dispose()
})
it('cancels pending renderer work when its runtime request disconnects',async()=>{
 const sent:any[]=[]
 const bridge=new CanvasActionBridge({send:value=>sent.push(value),canRead:()=>true})
 bridge.bind({sessionId:'s',selectedIds:[]})
 const controller=new AbortController(),pending=bridge.execute({sessionId:'s',method:'apply',args:{}},controller.signal)
 controller.abort()
 await expect(pending).rejects.toThrow(/取消/)
 expect(sent[1]).toEqual({requestId:sent[0].requestId,cancel:true});bridge.dispose()
})
it('carries refresh origin without marking ordinary scheduled canvas edits as data refresh',async()=>{
 let sent:any
 const bridge=new CanvasActionBridge({send:value=>{sent=value},canRead:()=>true});bridge.bind({sessionId:'s',selectedIds:[]})
 for(const source of ['component-data-refresh',undefined]){
  const pending=bridge.execute({sessionId:'s',method:'apply',args:{},scheduled:true,source})
  expect(sent.source).toBe(source)
  bridge.respond({requestId:sent.requestId,sessionId:'s',result:{ok:true}});await pending
 }
 bridge.dispose()
})
