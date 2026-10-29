import {expect,it,vi} from 'vitest'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge'
it('accepts public canvas requests but never promotes caller-supplied metadata into the trusted data-refresh channel',async()=>{
 const canvasAction=vi.fn(async(value:unknown)=>({ok:true,value}))
 const server=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,canvasAction})
 const endpoint=await server.start()
 const post=(value:unknown)=>fetch(endpoint.url+'/canvas-actions',{method:'POST',headers:{authorization:'Bearer '+endpoint.token,'content-type':'application/json'},body:JSON.stringify(value)})
 try{
  const request={sessionId:'board',method:'inspect',args:{}}
  expect((await post(request)).status).toBe(200);expect(canvasAction).toHaveBeenCalledTimes(1)
  const apply={sessionId:'board',method:'apply',args:{requestId:'r',revision:'v',changes:[{op:'update',id:'component',fields:{title:'变更'}}]}}
  expect((await post(apply)).status).toBe(200);expect(canvasAction).toHaveBeenLastCalledWith(apply,expect.any(AbortSignal))
  for(const extra of [{source:'component-data-refresh'},{scheduled:true},{guardId:'forged-private-guard'}])expect((await post({...request,...extra})).status).toBe(400)
  expect(canvasAction).toHaveBeenCalledTimes(2)
 }finally{await server.stop()}
})
