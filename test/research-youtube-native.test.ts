import {expect,it,vi} from 'vitest'
vi.mock('electron',()=>({app:{isPackaged:false,getAppPath:()=>'/fixture'}}))
import {ResearchLinkFrameRegistry} from '../src/main/state/research-link-frame'
import {registerResearchYoutubeNative,youtubeNativeBounds} from '../src/main/state/research-youtube-native'

function fixture(){
 const handlers=new Map<string,Function>(), registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,getNativeWindowHandle:()=>Buffer.alloc(8),getContentSize:()=>[1000,800],webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},once:vi.fn(),on:vi.fn()}
 const driver={mount:vi.fn(),place:vi.fn(),state:vi.fn(()=>({loading:false,error:'',image:'',imageRevision:0,loginStatus:'idle'})),login:vi.fn(),reload:vi.fn(),release:vi.fn()}
 const service=registerResearchYoutubeNative({ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any,getMainWindow:()=>win,registry,driver,platform:'darwin',appId:'com.evanarts.sherlock'})
 const event={sender:win.webContents,senderFrame:mainFrame},identity={sessionId:'s',nodeId:'n'},url='https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1&playsinline=1&start=90'
 const call=async(name:string,value:any,source=event)=>handlers.get('research:youtube-native:'+name)!(source,value)
 return {call,registry,driver,win,event,identity,url,service}
}
it('accepts only registered official players from the trusted main frame and never accepts a login URL',async()=>{
 const f=fixture(),update={...f.identity,url:f.url,bounds:{x:100,y:100,width:480,height:270},active:true,reloadToken:0}
 await expect(f.call('update',update)).rejects.toThrow('not authorized')
 f.registry.authorize({...f.identity,url:f.url})
 await expect(f.call('update',update,{...f.event,senderFrame:{processId:3,routingId:4}})).rejects.toThrow()
 await f.call('update',update)
 expect(f.driver.mount).toHaveBeenCalledWith(expect.any(Buffer),JSON.stringify(['s','n']),f.url,'https://com.evanarts.sherlock/')
 expect(f.driver.place).toHaveBeenLastCalledWith(JSON.stringify(['s','n']),100,100,480,270,true)
 f.registry.authorize({...f.identity,url:'https://accounts.google.com/ServiceLogin'})
 await expect(f.call('update',{...update,url:'https://accounts.google.com/ServiceLogin'})).rejects.toThrow('not authorized')
 expect(f.driver.release).toHaveBeenCalledWith(JSON.stringify(['s','n']))
})
it('keeps the player across view changes, scopes login to that player, and releases on removal',async()=>{
 const f=fixture(),update={...f.identity,url:f.url,bounds:{x:100,y:100,width:480,height:270},active:true,reloadToken:0}
 f.registry.authorize({...f.identity,url:f.url});await f.call('update',update)
 await f.call('update',{...update,active:false});expect(f.driver.mount).toHaveBeenCalledTimes(1)
 await f.call('login',f.identity);expect(f.driver.login).toHaveBeenCalledWith(JSON.stringify(['s','n']))
 await f.call('update',{...update,reloadToken:1});await f.call('update',{...update,reloadToken:1});expect(f.driver.reload).toHaveBeenCalledTimes(1)
 f.service.release(f.identity);expect(f.driver.release).toHaveBeenCalledWith(JSON.stringify(['s','n']))
 await expect(f.call('login',f.identity)).rejects.toThrow()
})
it('hides out-of-window and undersized player surfaces and rejects malformed rectangles',async()=>{
 const f=fixture();f.registry.authorize({...f.identity,url:f.url})
 await f.call('update',{...f.identity,url:f.url,bounds:{x:900,y:100,width:480,height:270},active:true,reloadToken:0})
 expect(f.driver.place.mock.calls.at(-1)?.at(-1)).toBe(false)
 await f.call('update',{...f.identity,url:f.url,bounds:{x:100,y:100,width:150,height:150},active:true,reloadToken:0})
 expect(f.driver.place.mock.calls.at(-1)?.at(-1)).toBe(false)
 expect(()=>youtubeNativeBounds({x:0,y:0,width:Infinity,height:200},1)).toThrow()
 expect(()=>youtubeNativeBounds({x:0,y:0,width:480,height:270},NaN)).toThrow()
})
it('reads login progress without moving the player and rejects revoked or untrusted status requests',async()=>{
 const f=fixture();f.registry.authorize({...f.identity,url:f.url})
 await f.call('update',{...f.identity,url:f.url,bounds:{x:100,y:100,width:480,height:270},active:true,reloadToken:0})
 f.driver.place.mockClear();f.driver.mount.mockClear()
 expect(await f.call('status',f.identity)).toEqual({loading:false,error:'',loginStatus:'idle',loginTrace:''})
 expect(f.driver.place).not.toHaveBeenCalled();expect(f.driver.mount).not.toHaveBeenCalled()
 await expect(f.call('status',f.identity,{...f.event,senderFrame:{processId:3,routingId:4}})).rejects.toThrow()
 f.registry.release(f.identity)
 await expect(f.call('status',f.identity)).rejects.toThrow('not authorized')
})
