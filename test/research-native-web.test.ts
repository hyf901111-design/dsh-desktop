import {beforeEach,expect,it,vi} from 'vitest'
const handlers=new Map<string,Function>(), views:any[]=[]
const mock=vi.hoisted(()=>({fetch:vi.fn(),permission:vi.fn(),download:vi.fn()}))
vi.mock('electron',()=>({net:{fetch:mock.fetch},session:{fromPartition:()=>({setPermissionRequestHandler:mock.permission,setPermissionCheckHandler:mock.permission,on:mock.download})},WebContentsView:class {
  visible=false;bounds:any; webContents:any
  constructor(public settings:any){views.push(this);this.webContents={isDestroyed:()=>false,isLoadingMainFrame:()=>false,close:vi.fn(),setWindowOpenHandler:vi.fn(),on:vi.fn(),reload:vi.fn(),loadURL:vi.fn(async()=>{}),setZoomFactor:vi.fn(),enableDeviceEmulation:vi.fn(),capturePage:vi.fn(async()=>({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,test'})),executeJavaScript:vi.fn(async()=>false),getURL:()=> 'https://www.google.com/',getTitle:()=> 'Google'}}
  setVisible(v:boolean){this.visible=v} setBounds(v:any){this.bounds=v} setBorderRadius(){}
}}))
import {nativeWebBounds,nativeWebViewport,registerResearchNativeWeb,requiresNativeWeb} from '../src/main/state/research-native-web'
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
 const win:any={isDestroyed:()=>false,webContents:{mainFrame,on:vi.fn(),focus:vi.fn()},contentView:{addChildView:vi.fn(),removeChildView:vi.fn()},once:vi.fn(),on:vi.fn(),getContentSize:()=>[1000,800]}
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
 expect(views[0].webContents.capturePage).toHaveBeenLastCalledWith(undefined,{stayHidden:true,stayAwake:true})
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
 for (const scale of [.08,.5,1.5]) {
   await call('update',{...layout,scale,bounds:{x:100,y:100,width:400*scale,height:300*scale}})
   expect(wc.enableDeviceEmulation).toHaveBeenLastCalledWith(expect.objectContaining({viewSize:{width:400,height:300},scale}))
   expect(wc.setZoomFactor).toHaveBeenLastCalledWith(1)
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

it('rejects malformed webpage layout dimensions',()=>{expect(()=>nativeWebViewport({layoutSize:{width:NaN,height:300},scale:1})).toThrow();expect(()=>nativeWebViewport({layoutSize:{width:400,height:300},scale:0})).toThrow()})
