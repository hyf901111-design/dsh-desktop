import {expect,it} from 'vitest'
import {registerIntegrationIpc} from '../src/main/integrations/ipc'
it('rejects foreign frames before dispatch and restricts the request surface',async()=>{
  const callbacks=new Map<string,Function>()
  const window={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2}}}
  let requests=0
  registerIntegrationIpc({handle:(name:string,fn:Function)=>callbacks.set(name,fn)},()=>window,{request:async()=>{requests++;return {type:'snapshot',snapshot:{revision:0,rows:[]}}}})
  const fn=callbacks.get('integrations:request')!
  const trusted={sender:window.webContents,senderFrame:{processId:1,routingId:2}}
  await expect(fn({...trusted,senderFrame:{processId:1,routingId:3}},{type:'snapshot'})).rejects.toThrow('main EWork')
  await expect(fn(trusted,{type:'eval',code:'not allowed'})).rejects.toMatchObject({code:'INVALID_CONFIG'})
  await expect(fn(trusted,{type:'compile-openapi',document:'x'.repeat(3*1024*1024)})).rejects.toMatchObject({code:'INVALID_CONFIG'})
  expect(requests).toBe(0)
  expect(await fn(trusted,{type:'snapshot'})).toMatchObject({type:'snapshot'})
  expect(requests).toBe(1)
})
