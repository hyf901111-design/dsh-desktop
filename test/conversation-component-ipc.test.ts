import {expect,it,vi} from 'vitest'
import {installConversationComponentHandlers} from '../src/main/conversation-components/ipc'
import {createConversationComponentsBridge} from '../src/preload/conversation-components'
const methods=['read','rename','setTheme','exportContent','commitHtmlInteraction','updateNativeSpec','queryNative','readNativeSnapshot','copy','saveLibrary','reference','resolveReference'] as const
it('only installs the twelve fixed trusted main-window handlers and removes them on disposal',async()=>{
 const handlers=new Map<string,any>(),removeHandler=vi.fn((channel:string)=>handlers.delete(channel)),ipcMain={handle:(channel:string,fn:any)=>handlers.set(channel,fn),removeHandler},webContents={mainFrame:{processId:1,routingId:2}},window={isDestroyed:()=>false,webContents},service=Object.fromEntries(methods.map(m=>[m,vi.fn(async(value:any)=>({method:m,value}))]))
 const dispose=installConversationComponentHandlers({ipcMain,getWindow:()=>window,service:service as any})
 expect([...handlers.keys()].sort()).toEqual(methods.map(m=>'conversation-components:'+m).sort())
 const event={sender:webContents,senderFrame:webContents.mainFrame},input={sessionId:'s',componentId:'c'}
 expect(await handlers.get('conversation-components:read')(event,input)).toEqual({method:'read',value:input})
 expect(await handlers.get('conversation-components:setTheme')(event,{...input,expectedRevision:1,theme:'dark'})).toEqual({method:'setTheme',value:{...input,expectedRevision:1,theme:'dark'}});service.setTheme!.mockClear()
 for(const untrusted of [{...event,sender:{}},{...event,senderFrame:{processId:1,routingId:3}},{...event,senderFrame:null},{...event,senderFrame:{processId:99,routingId:2}}])for(const method of ['copy','rename','setTheme','exportContent','commitHtmlInteraction'])expect(()=>handlers.get('conversation-components:'+method)(untrusted,input)).toThrow(/main EWork Odyssey window/)
 expect(service.copy).not.toHaveBeenCalled();expect(service.rename).not.toHaveBeenCalled();expect(service.setTheme).not.toHaveBeenCalled();expect(service.exportContent).not.toHaveBeenCalled();expect(service.commitHtmlInteraction).not.toHaveBeenCalled();dispose();expect(handlers.size).toBe(0)
})
it('the frozen preload bridge exposes fixed typed methods and never an arbitrary channel API',async()=>{
 const invoke=vi.fn(async(channel:string,value:unknown)=>({channel,value})),bridge=createConversationComponentsBridge(invoke),target={sessionId:'s',componentId:'c'}
 expect(Object.isFrozen(bridge)).toBe(true);expect(Object.keys(bridge).sort()).toEqual([...methods].sort());expect(bridge).not.toHaveProperty('invoke')
 await bridge.read(target);await bridge.copy(target);await bridge.saveLibrary(target);await bridge.reference(target);await bridge.updateNativeSpec({...target,expectedRevision:1,spec:{version:1}});await bridge.queryNative({...target,expectedRevision:1,query:{action:'quotes'}});await bridge.readNativeSnapshot!({...target,expectedRevision:1,query:{action:'quotes'}});await bridge.resolveReference({sessionId:'s',reference:{version:1,kind:'conversation-component',sessionId:'s',componentId:'c',revision:1,title:'模拟'}});await bridge.commitHtmlInteraction!({...target,expectedRevision:1,htmlVersion:'version',kind:'shared',revision:1,state:{selected:1}})
 await bridge.rename!({...target,expectedRevision:1,title:'新名称'});await bridge.setTheme!({...target,expectedRevision:1,theme:'enterprise'});await bridge.exportContent!({...target,expectedRevision:1,kind:'text',format:'svg',content:'<svg/>'})
 expect(invoke.mock.calls.map(([channel])=>channel)).toEqual(['read','copy','saveLibrary','reference','updateNativeSpec','queryNative','readNativeSnapshot','resolveReference','commitHtmlInteraction','rename','setTheme','exportContent'].map(m=>'conversation-components:'+m))
})
