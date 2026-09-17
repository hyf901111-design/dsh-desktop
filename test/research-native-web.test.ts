import {beforeEach,expect,it,vi} from 'vitest'
const handlers=new Map<string,Function>(), views:any[]=[]
const mock=vi.hoisted(()=>({fetch:vi.fn(),permission:vi.fn()}))
vi.mock('electron',()=>({net:{fetch:mock.fetch},session:{fromPartition:()=>({setPermissionRequestHandler:mock.permission,setPermissionCheckHandler:mock.permission})},WebContentsView:class {
  visible=false;bounds:any; webContents:any
  constructor(public settings:any){views.push(this);this.webContents={close:vi.fn(),setWindowOpenHandler:vi.fn(),on:vi.fn(),loadURL:vi.fn(async()=>{}),setZoomFactor:vi.fn(),capturePage:vi.fn(async()=>({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,test'})),executeJavaScript:vi.fn(async()=>false),getURL:()=> 'https://www.google.com/',getTitle:()=> 'Google'}}
  setVisible(v:boolean){this.visible=v} setBounds(v:any){this.bounds=v} setBorderRadius(){}
}}))
import {nativeWebBounds,registerResearchNativeWeb,requiresNativeWeb} from '../src/main/state/research-native-web'
import {ResearchLinkFrameRegistry} from '../src/main/state/research-link-frame'
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
 registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(name:string,fn:Function)=>handlers.set(name,fn)} as any})
 const event={sender:win.webContents,senderFrame:mainFrame},identity={sessionId:'s',nodeId:'n'},call=(name:string,value:any)=>handlers.get('research:native-web:'+name)!(event,value)
 mock.fetch.mockResolvedValue({headers:new Headers({'x-frame-options':'SAMEORIGIN'})})
 await expect(call('resolve',{...identity,url:'https://www.google.com/'})).resolves.toEqual({engine:'native'})
 const layout={...identity,url:'https://www.google.com/',bounds:{x:100,y:100,width:400,height:300},active:true,scale:1,radius:9}
 await call('update',layout)
 expect(views[0].settings.webPreferences).toMatchObject({nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true})
 expect(views[0].visible).toBe(true)
 await call('hide',{});expect(views[0].visible).toBe(false)
 await call('update',{...layout,bounds:{...layout.bounds,x:900}});expect(views[0].visible).toBe(false)
 expect(()=>handlers.get('research:native-web:hide')!({sender:{},senderFrame:mainFrame},{})).toThrow()
 await call('release',identity);expect(views[0].webContents.close).toHaveBeenCalled()
 await expect(call('update',{...layout,nodeId:'other'})).rejects.toThrow('not authorized')
})
it('rejects malformed native geometry',()=>{expect(()=>nativeWebBounds({bounds:{x:NaN}})).toThrow()})
