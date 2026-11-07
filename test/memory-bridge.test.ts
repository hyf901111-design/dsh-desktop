import { afterEach, expect, it } from 'vitest'
let dispose: (()=>Promise<void>)|undefined
afterEach(async()=>{await dispose?.();dispose=undefined})
it('makes memory transport available only to the authenticated local runtime',async()=>{
  const {startMemoryBridge}=await import('../src/main/memory/bridge')
  let calls=0
  const endpoint=await startMemoryBridge({recall:async()=>{calls++;return {entries:[]}},capture:async()=>({enabled:false}),commitExtraction:async()=>({ok:true}),validate:async()=>({valid:true}),usage:async()=>({ok:true}),failure:async()=>({ok:true}),pending:async()=>({items:[]}),attempt:async()=>({allowed:true})})
  dispose=endpoint.dispose
  const send=(headers:Record<string,string>,body='{}')=>fetch(endpoint.url+'/recall',{method:'POST',headers:{'content-type':'application/json',...headers},body})
  expect((await send({})).status).toBe(403)
  expect((await send({authorization:'Bearer '+endpoint.token,origin:'https://foreign.example'})).status).toBe(403)
  expect((await send({authorization:'Bearer '+endpoint.token,'x-forwarded-for':'127.0.0.1'})).status).toBe(403)
  expect((await send({authorization:'Bearer '+endpoint.token},'x'.repeat(200000))).status).toBe(413)
  expect(calls).toBe(0)
  expect((await send({authorization:'Bearer '+endpoint.token})).status).toBe(200)
  expect(calls).toBe(1)
})
it('rejects foreign renderer frames before dispatching a management mutation',async()=>{
  const {registerMemoryIpc}=await import('../src/main/memory/ipc')
  const callbacks=new Map<string,Function>(),window={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2}}}
  let calls=0
  registerMemoryIpc({handle:(name:string,fn:Function)=>callbacks.set(name,fn)},()=>window,{request:async()=>{calls++;return {}}})
  const invoke=callbacks.get('memory:request')!,trusted={sender:window.webContents,senderFrame:{processId:1,routingId:2}}
  await expect(invoke({...trusted,senderFrame:{processId:1,routingId:3}},{type:'save'})).rejects.toThrow('main EWork')
  await expect(invoke(trusted,{type:'eval'})).rejects.toThrow(/未知/)
  await expect(invoke(trusted,{type:'save',input:{content:'x'.repeat(200000)}})).rejects.toThrow(/过大/)
  expect(calls).toBe(0)
  await invoke(trusted,{type:'snapshot'});expect(calls).toBe(1)
})
it('protects document reads and saves with trusted-frame checks and rejects removed session controls',async()=>{
  const {registerMemoryIpc}=await import('../src/main/memory/ipc')
  const callbacks=new Map<string,Function>(),window={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2}}},commands:any[]=[]
  registerMemoryIpc({handle:(name:string,fn:Function)=>callbacks.set(name,fn)},()=>window,{request:async c=>{commands.push(c);return {}}})
  const invoke=callbacks.get('memory:request')!,trusted={sender:window.webContents,senderFrame:{processId:1,routingId:2}}
  for(const type of ['document-read','document-save'])await expect(invoke({...trusted,senderFrame:{processId:1,routingId:3}},{type})).rejects.toThrow('main EWork')
  await expect(invoke(trusted,{type:'session',disabled:true})).rejects.toThrow(/未知/)
  await invoke(trusted,{type:'document-read'});await invoke(trusted,{type:'document-save',content:'文档内容',expectedHash:'hash'})
  expect(commands.map(c=>c.type)).toEqual(['document-read','document-save'])
})
