import {beforeEach,expect,it,vi} from 'vitest'
const handlers=new Map<string,Function>(), views:any[]=[]
const mock=vi.hoisted(()=>({fetch:vi.fn(),permission:vi.fn(),download:vi.fn()}))
vi.mock('electron',()=>({net:{fetch:mock.fetch},session:{fromPartition:()=>({setPermissionRequestHandler:mock.permission,setPermissionCheckHandler:mock.permission,on:mock.download})},WebContentsView:class {
  visible=false;bounds:any; webContents:any
  constructor(public settings:any){views.push(this);this.webContents={isDestroyed:()=>false,isLoadingMainFrame:()=>false,close:vi.fn(),setWindowOpenHandler:vi.fn(),on:vi.fn(),reload:vi.fn(),loadURL:vi.fn(async()=>{this.webContents.on.mock.calls.find(([n]:any[])=>n==='dom-ready')?.[1]()}),setZoomFactor:vi.fn(),enableDeviceEmulation:vi.fn(),capturePage:vi.fn(async()=>({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,test'})),executeJavaScript:vi.fn(async()=>false),executeJavaScriptInIsolatedWorld:vi.fn(async()=>({viewport:400,content:400})),getURL:()=> 'https://www.google.com/',getTitle:()=> 'Google'}}
  setVisible(v:boolean){this.visible=v} setBounds(v:any){this.bounds=v} getBounds(){return this.bounds} setBorderRadius(){}
}}))
import {nativeWebBounds,nativeWebViewport,nativeWebPageZoom,registerResearchNativeWeb,requiresNativeWeb} from '../src/main/state/research-native-web'
import {registerResearchLinkFrameHandlers,ResearchLinkFrameRegistry} from '../src/main/state/research-link-frame'
beforeEach(()=>{handlers.clear();views.length=0;mock.fetch.mockReset()})
it('routes denied and same-origin frames to native views, leaving permitted sites in iframes',()=>{
 expect(requiresNativeWeb(new Headers({'x-frame-options':'SAMEORIGIN'}))).toBe(true)
 expect(requiresNativeWeb(new Headers({'content-security-policy':"frame-ancestors 'self'"}))).toBe(true)
 expect(requiresNativeWeb(new Headers({'content-security-policy':'frame-ancestors *'}))).toBe(false)
 expect(requiresNativeWeb(new Headers())).toBe(false)
})
it('isolates native content, enforces trusted IPC, hides overlays and releases views',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),focus:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1000,800]}
 const ipcMain={removeHandler:()=>{},handle:(name:string,fn:Function)=>handlers.set(name,fn)} as any
 const native=registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:ipcMain})
 registerResearchLinkFrameHandlers({registry,getMainWindow:()=>win,ipcMain,inspectNative:native.inspect})
 const event={sender:win.webContents,senderFrame:mainFrame},identity={sessionId:'s',nodeId:'n'},call=(name:string,value:any)=>handlers.get('research:native-web:'+name)!(event,value)
 mock.fetch.mockResolvedValue({headers:new Headers({'x-frame-options':'SAMEORIGIN'})})
 await expect(call('resolve',{...identity,url:'https://www.google.com/'})).resolves.toEqual({engine:'native'})
 mock.fetch.mockResolvedValue({headers:new Headers()})
 await expect(call('resolve',{sessionId:'s',nodeId:'baidu',url:'https://www.baidu.com/',preferNative:true})).resolves.toEqual({engine:'native'})
 await expect(call('resolve',{sessionId:'s',nodeId:'bad',url:'javascript:alert(1)',preferNative:true})).rejects.toThrow()
 const layout={...identity,url:'https://www.google.com/',bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},active:true,scale:1,radius:9}
 await call('update',layout)
 expect(views[0].webContents.capturePage).toHaveBeenLastCalledWith({x:0,y:0,width:400,height:300},{stayHidden:true,stayAwake:true})
 expect(mock.download).toHaveBeenCalledWith('will-download',expect.any(Function))
 expect(views[0].settings.webPreferences).toMatchObject({nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true})
 expect(views[0].visible).toBe(true)
 const wc=views[0].webContents
 const fire=(name:string,...args:any[])=>wc.on.mock.calls.find(([n]:any[])=>n===name)?.[1](...args)
 const initialImage=(await call('update',layout)).image
 wc.isLoadingMainFrame=()=>true
 fire('did-start-navigation',{},'https://www.google.com/search',false,true)
 const captures=wc.capturePage.mock.calls.length
 expect((await call('update',layout)).image).toBe(initialImage)
 expect(wc.capturePage.mock.calls.length).toBe(captures)
 expect(views[0].visible).toBe(false)
 wc.isLoadingMainFrame=()=>false
 fire('dom-ready')
 fire('did-finish-load')
 const configurations=wc.enableDeviceEmulation.mock.calls.length
 await call('update',layout)
 expect(wc.enableDeviceEmulation.mock.calls.length).toBe(configurations+1)
 await call('update',{...layout,reloadToken:1})
 await call('update',{...layout,reloadToken:1})
 expect(wc.reload).toHaveBeenCalledTimes(1)
 expect(wc.loadURL).toHaveBeenCalledTimes(1)
 await call('update',layout)
 expect(wc.enableDeviceEmulation.mock.calls.length).toBe(configurations+1)
 wc.setZoomFactor.mockClear()
 for (const scale of [.08,.5,1.5]) {
   await call('update',{...layout,scale,bounds:{x:100,y:100,width:400*scale,height:300*scale}})
   expect(wc.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:{width:400,height:300},scale}))
   expect(wc.setZoomFactor).not.toHaveBeenCalled()
 }
 await call('update',{...layout,layoutSize:{width:600,height:450},bounds:{x:100,y:100,width:600,height:450}})
 expect(wc.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:{width:600,height:450},scale:1}))
 await call('update',layout)
 const previousBounds={...views[0].bounds}
 wc.enableDeviceEmulation.mockClear()
 wc.setZoomFactor.mockClear()
 for (const scale of [.5,.6,.7,1.4,.08]) {
   await call('update',{...layout,scale,active:false,bounds:{x:30,y:20,width:400*scale,height:300*scale}})
   expect(views[0].bounds).toEqual(previousBounds)
 }
 expect(wc.enableDeviceEmulation).not.toHaveBeenCalled()
 expect(wc.setZoomFactor).not.toHaveBeenCalled()
 const scaled={...layout,scale:.7,bounds:{x:100,y:100,width:280,height:210}}
 await call('update',scaled)
 expect(wc.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:{width:400,height:300},scale:.7}))
 wc.enableDeviceEmulation.mockClear()
 for (const active of [false,true,false,true]) {
   await call('update',{...scaled,active})
   expect(views[0].visible).toBe(active)
   expect(views[0].bounds).toEqual(scaled.bounds)
 }
 expect(wc.enableDeviceEmulation).not.toHaveBeenCalled()
 await call('update',{...scaled,active:false,layoutSize:{width:500,height:350}})
 expect(wc.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:{width:500,height:350},scale:.7}))
 expect(views[0].bounds).toEqual({x:100,y:100,width:350,height:245})
 wc.executeJavaScript.mockResolvedValue({title:'搜索结果',sourceText:' 最新网页正文\n第二段 ',scrollWidth:400,clientWidth:400})
 const inspect=()=>handlers.get('research:link-frame:inspect')!(event,identity)
 await expect(inspect()).resolves.toMatchObject({title:'搜索结果',sourceText:'最新网页正文\n第二段'})
 const updated=await call('update',layout)
 expect(updated.inspection.sourceText).toBe('最新网页正文\n第二段')
 wc.executeJavaScript.mockResolvedValue({title:'搜索结果',sourceText:'同标题动态更新正文',scrollWidth:400,clientWidth:400})
 expect((await inspect()).sourceText).toBe('同标题动态更新正文')
 wc.isLoadingMainFrame=()=>true
 await expect(inspect()).resolves.toBeNull()
 wc.isLoadingMainFrame=()=>false
 let url='https://www.google.com/'
 wc.getURL=()=>url
 wc.executeJavaScript.mockImplementation(async()=>{url='https://www.google.com/search?q=new';return {title:'旧页面',sourceText:'旧正文',scrollWidth:400,clientWidth:400}})
 await expect(inspect()).resolves.toBeNull()

 await call('hide',{});expect(views[0].visible).toBe(false)
 await call('update',{...layout,bounds:{...layout.bounds,x:900}});expect(views[0].visible).toBe(false)
 expect(()=>handlers.get('research:native-web:hide')!({sender:{},senderFrame:mainFrame},{})).toThrow()
 await call('release',identity);expect(views[0].webContents.close).toHaveBeenCalled()
 await expect(call('update',{...layout,nodeId:'other'})).rejects.toThrow('not authorized')
})
it('rejects malformed native geometry',()=>{expect(()=>nativeWebBounds({bounds:{x:NaN}})).toThrow()})

it('离屏网页改变卡片尺寸后重新生成预览，不一直显示旧尺寸的截图',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1000,800]}
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any})
 const identity={sessionId:'resize-preview',nodeId:'link',url:'https://example.com/'},event={sender:win.webContents,senderFrame:mainFrame},call=(v:any)=>handlers.get('research:native-web:update')!(event,v)
 registry.authorize(identity)
 const request={...identity,active:false,bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},scale:1,radius:3}
 await call(request)
 await vi.waitFor(async()=>expect((await call(request)).image).toBe('data:image/png;base64,test'))
 const wc=views[0].webContents,captured=wc.capturePage.mock.calls.length
 wc.capturePage.mockResolvedValue({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,resized'})
 const resized={...request,bounds:{x:100,y:100,width:600,height:900},layoutSize:{width:600,height:900}}
 await call(resized)
 expect(wc.capturePage.mock.calls.length).toBeGreaterThan(captured)
 expect(wc.capturePage).toHaveBeenLastCalledWith({x:0,y:0,width:600,height:900},{stayHidden:true,stayAwake:true})
 await vi.waitFor(async()=>expect((await call(resized)).image).toBe('data:image/png;base64,resized'))
 expect(views[0].visible).toBe(false)
 expect(wc.loadURL).toHaveBeenCalledTimes(1);expect(wc.reload).not.toHaveBeenCalled()
})

it('会话隐藏后复用同一网页和当前导航，旧刷新计数不会触发重新加载',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1200,900]}
 const ipcMain={removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any
 const native=registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain})
 registerResearchLinkFrameHandlers({registry,getMainWindow:()=>win,ipcMain,releaseNative:native.release})
 const identity={sessionId:'remember-page',nodeId:'link',url:'https://example.com/'},event={sender:win.webContents,senderFrame:mainFrame},call=(name:string,v:any)=>handlers.get('research:native-web:'+name)!(event,v)
 registry.authorize(identity)
 const request={...identity,active:true,bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},scale:1,radius:3,reloadToken:0}
 await call('update',request);const wc=views[0].webContents
 wc.getURL=()=> 'https://example.com/account/inbox'
 await call('update',{...request,reloadToken:1})
 await call('hide',{sessionId:identity.sessionId})
 expect(views[0].visible).toBe(false);expect(wc.close).not.toHaveBeenCalled()
 win.webContents.on.mock.calls.find(([name]:any[])=>name==='did-start-navigation')?.[1]({},'https://ework.local/#another-session',true,true)
 expect(wc.close).not.toHaveBeenCalled()
 await call('resolve',{...identity,preferNative:true});await call('update',request)
 expect(views).toHaveLength(1);expect(wc.loadURL).toHaveBeenCalledTimes(1);expect(wc.reload).toHaveBeenCalledTimes(1)
 expect(native.contents(identity)?.getURL()).toBe('https://example.com/account/inbox')
 await handlers.get('research:link-frame:release')!(event,{sessionId:identity.sessionId,nodeId:identity.nodeId})
 expect(wc.close).toHaveBeenCalledOnce();expect(native.contents(identity)).toBeUndefined()
})

it('网页焦点探针迟迟不返回也不阻塞下一次尺寸预览，空截图仍会重试',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1000,800]}
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any})
 const identity={sessionId:'stalled-probe',nodeId:'link',url:'https://example.com/'},event={sender:win.webContents,senderFrame:mainFrame},call=(v:any)=>handlers.get('research:native-web:update')!(event,v)
 registry.authorize(identity)
 const request={...identity,active:false,bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},scale:1,radius:3}
 await call(request);await vi.waitFor(async()=>expect((await call(request)).image).toBe('data:image/png;base64,test'))
 const wc=views[0].webContents;wc.executeJavaScript.mockImplementation(()=>new Promise(()=>{}))
 wc.capturePage.mockResolvedValueOnce({isEmpty:()=>true,toDataURL:()=>''}).mockResolvedValue({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,recovered'})
 const resized={...request,layoutSize:{width:600,height:900}}
 await call(resized)
 expect((await call(resized)).snapshotPending).toBe(true)
 await vi.waitFor(async()=>expect((await call(resized)).image).toBe('data:image/png;base64,recovered'))
})

it('慢截图和正文提取不阻塞网页尺寸更新，正文就绪即可显示而无需等待图片全部加载',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1200,900]}
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any})
 const identity={sessionId:'performance',nodeId:'link',url:'https://www.baidu.com/'},event={sender:win.webContents,senderFrame:mainFrame},call=(v:any)=>handlers.get('research:native-web:update')!(event,v)
 registry.authorize(identity)
 const request={...identity,active:true,bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},scale:1,radius:3}
 await call(request)
 const wc=views[0].webContents,fire=(name:string,...args:any[])=>wc.on.mock.calls.find(([n]:any[])=>n===name)?.[1](...args)
 wc.isLoadingMainFrame=()=>true;fire('did-start-navigation',{},'https://www.baidu.com/next',false,true);fire('dom-ready')
 wc.capturePage.mockImplementation(()=>new Promise(()=>{}));wc.executeJavaScript.mockImplementation(()=>new Promise(()=>{}))
 const slow=call({...request,layoutSize:{width:500,height:320},bounds:{x:100,y:100,width:500,height:320}})
 const result=await Promise.race([slow,new Promise(resolve=>setTimeout(()=>resolve('blocked'),80))])
 expect(result).not.toBe('blocked');expect(views[0].visible).toBe(true)
 expect(views[0].bounds).toEqual({x:100,y:100,width:500,height:320})
 await call({...request,layoutSize:{width:600,height:340},bounds:{x:100,y:100,width:600,height:340}})
 expect(views[0].bounds).toEqual({x:100,y:100,width:600,height:340})
 expect(wc.loadURL).toHaveBeenCalledTimes(1)
})

it('rejects malformed webpage layout dimensions',()=>{expect(()=>nativeWebViewport({layoutSize:{width:NaN,height:300},scale:1})).toThrow();expect(()=>nativeWebViewport({layoutSize:{width:400,height:300},scale:0})).toThrow()})
it('manual webpage zoom survives canvas scaling and resets independently',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2}
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>1},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1200,900]}
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any})
 const identity={sessionId:'zoom-control',nodeId:'link',url:'https://www.baidu.com/'},event={sender:win.webContents,senderFrame:mainFrame},call=(v:any)=>handlers.get('research:native-web:update')!(event,v)
 registry.authorize(identity)
 const request={...identity,active:true,bounds:{x:100,y:100,width:400,height:300},layoutSize:{width:400,height:300},scale:1,radius:3}
 await call(request);const wc=views[0].webContents
 await call({...request,pageZoom:1.1});expect(wc.setZoomFactor).toHaveBeenLastCalledWith(1.1)
 wc.setZoomFactor.mockClear()
 await call({...request,pageZoom:1.1,scale:.8,bounds:{x:100,y:100,width:320,height:240}})
 expect(wc.setZoomFactor).not.toHaveBeenCalled()
 await call({...request,pageZoom:1});expect(wc.setZoomFactor).toHaveBeenLastCalledWith(1)
 expect(()=>nativeWebPageZoom({pageZoom:2.1})).toThrow();expect(()=>nativeWebPageZoom({pageZoom:NaN})).toThrow()
})

it('maps webpage CSS bounds through host window zoom so live surface matches the snapshot',async()=>{
 const registry=new ResearchLinkFrameRegistry(),mainFrame={processId:1,routingId:2};let zoom=1.1
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),getZoomFactor:()=>zoom},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1400,1000]}
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n:string,f:Function)=>handlers.set(n,f)} as any})
 const e={sender:win.webContents,senderFrame:mainFrame},identity={sessionId:'zoom',nodeId:'link',url:'https://www.baidu.com/'},call=(v:any)=>handlers.get('research:native-web:update')!(e,v)
 registry.authorize(identity)
 const request={...identity,active:true,bounds:{x:92,y:340,width:780,height:355},layoutSize:{width:780,height:355},scale:1,radius:9}
 await call(request)
 expect(views[0].bounds).toEqual({x:101,y:374,width:858,height:391})
 expect(views[0].webContents.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:request.layoutSize,scale:1.1}))
 zoom=.8
 await call(request)
 expect(views[0].bounds).toEqual({x:74,y:272,width:624,height:284})
 expect(views[0].webContents.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({scale:.8}))
 await call({...request,bounds:{...request.bounds,x:1400}})
 expect(views[0].visible).toBe(false)
})
