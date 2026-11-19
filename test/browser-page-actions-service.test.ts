import {EventEmitter} from 'node:events'
import {mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from 'node:fs'
import {shell} from 'electron'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {BrowserSnapshot} from '../src/shared/browser-app'
import type {BrowserRegionRect} from '../src/shared/browser-region'

const mock=vi.hoisted(()=>({views:[] as any[],templates:[] as any[],region:null as any,regionEvent:null as any,translation:null as any,menu:null as any,app:null as any,partition:null as any,corners:null as any}))
vi.mock('electron',()=>{
 const app=Object.assign(new EventEmitter(),{getPath:()=>'/tmp'});mock.app=app
 const partition=Object.assign(new EventEmitter(),{setPermissionCheckHandler:vi.fn(),setPermissionRequestHandler:vi.fn(),clearStorageData:async()=>{},cookies:{get:async()=>[]}})
 mock.partition=partition
 return{app,Menu:{buildFromTemplate:(template:any[])=>{mock.templates.push(template);return{popup:vi.fn()}}},clipboard:{writeText:vi.fn()},dialog:{},safeStorage:{isEncryptionAvailable:()=>false},shell:{openExternal:vi.fn(),openPath:vi.fn(async()=>''),showItemInFolder:vi.fn()},session:{fromPartition:()=>partition},WebContentsView:class{
  bounds:any;visible=false;webContents:any
  constructor(){let url='',zoom=1,destroyed=false;const wc=Object.assign(new EventEmitter(),{mainFrame:{processId:11,routingId:22},isDestroyed:()=>destroyed,isLoadingMainFrame:()=>false,getURL:()=>url,getTitle:()=> 'Synthetic page',getZoomFactor:()=>zoom,setZoomFactor:(value:number)=>{zoom=value},setAudioMuted:vi.fn(),setBackgroundThrottling:vi.fn(),setWindowOpenHandler:vi.fn(),focus:vi.fn(),stop:vi.fn(),close:()=>{destroyed=true},navigationHistory:{canGoBack:()=>false,canGoForward:()=>false},capturePage:vi.fn(async()=>({getSize:()=>({width:101,height:61}),isEmpty:()=>false,toPNG:()=>Buffer.from('original page PNG')})),loadURL:async(value:string)=>{url=value;wc.emit('did-start-navigation',{},url,false,true);wc.emit('did-finish-load')},copy:vi.fn(),paste:vi.fn(),cut:vi.fn(),undo:vi.fn(),redo:vi.fn(),selectAll:vi.fn(),copyImageAt:vi.fn(),downloadURL:vi.fn()});this.webContents=wc;mock.views.push(this)}
  setBounds=(value:any)=>{this.bounds=value};setVisible=(value:boolean)=>{this.visible=value}
 }}
})
vi.mock('../src/main/browser/corners',()=>({createBrowserCorners:()=>(mock.corners={layout:vi.fn(),dispose:vi.fn()})}))
vi.mock('../src/main/browser/favicon',()=>({trackBrowserFavicon:vi.fn()}))
vi.mock('../src/main/browser/page-agent',()=>({createBrowserPageAgent:()=>({invalidate:vi.fn(),dispose:vi.fn()})}))
vi.mock('../src/main/browser/find-overlay',()=>({createBrowserFindOverlay:()=>({update:vi.fn(),raise:vi.fn(),hide:vi.fn(),layout:vi.fn(),dispose:vi.fn()})}))
vi.mock('../src/main/browser/menu-overlay',()=>({createBrowserMenuOverlay:()=>(mock.menu={show:vi.fn(async()=>true),key:vi.fn(()=>false),warm:vi.fn(),hide:vi.fn(),raise:vi.fn(),dispose:vi.fn(),isShown:()=>false,isFocused:()=>false})}))
vi.mock('../src/main/browser/region-overlay',()=>({createBrowserRegionOverlay:(_preload:any,_window:any,listener:any)=>{mock.regionEvent=listener;return mock.region}}))
vi.mock('../src/main/browser/translation',()=>({createBrowserTranslationManager:()=>mock.translation}))
import {registerBrowserApp} from '../src/main/browser/service'

const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return{promise,resolve}}
const cleanup:(()=>void)[]=[]
afterEach(()=>{for(const close of cleanup.splice(0))close();vi.restoreAllMocks()})
beforeEach(()=>{mock.partition.removeAllListeners();mock.views=[];mock.templates=[];mock.region={warm:vi.fn(async()=>true),start:vi.fn(async()=>({x:24.2,y:32.8,width:100.1,height:60.1})),cancel:vi.fn(),cancelSelecting:vi.fn(),raise:vi.fn(),showQuestion:vi.fn(),updateQuestion:vi.fn(),dispose:vi.fn()};mock.translation={status:()=>({state:'idle',completed:0,total:0,canRestore:false}),start:vi.fn(async()=>{}),restore:vi.fn(async()=>{}),cancel:vi.fn(),dispose:vi.fn()}})
async function fixture(owner='owner-A'){
 const directory=mkdtempSync(join(tmpdir(),'browser-page-actions-mock-')),mainWC=Object.assign(new EventEmitter(),{mainFrame:{processId:1,routingId:2},getZoomFactor:()=>1.25,send:vi.fn(),isDestroyed:()=>false}),win=Object.assign(new EventEmitter(),{isDestroyed:()=>false,webContents:mainWC,getContentSize:()=>[1500,1000],contentView:{addChildView:vi.fn(),removeChildView:vi.fn()}}),handlers=new Map<string,Function>(),ipcMain={handle:(channel:string,fn:Function)=>handlers.set(channel,fn),removeHandler:vi.fn()}
 const service=registerBrowserApp({ipcMain:ipcMain as any,getMainWindow:()=>win as any,root:directory,materialDirectory:async()=>directory,menuPreload:resolve('src/preload/browser/menu-preload.cjs'),regionPreload:resolve('src/preload/browser/region-preload.cjs')})
 cleanup.push(()=>{service.dispose();mock.app.removeAllListeners();rmSync(directory,{recursive:true,force:true})})
 const state=await service.request('new',{url:'https://page.example.test/a'}) as BrowserSnapshot,page=mock.views[0],bounds={x:140,y:96,width:640,height:360},layout=(patch:any={})=>service.request('layout',{active:true,visible:true,sessionId:owner,bounds,...patch})
 await layout();page.webContents.setZoomFactor(1.4)
 const menu=(params:any={})=>{page.webContents.emit('context-menu',{}, {isEditable:false,selectionText:'',editFlags:{},x:50,y:60,...params});return mainWC.send.mock.calls.filter(([name]:any)=>name==='browser-app:context-menu').at(-1)?.[1]}
 const context=(label='框选并询问AI',params:any={})=>{const value=menu(params),item=value.items.find((item:any)=>item.label===label);void service.request('context-command',{contextToken:value.contextToken,itemId:item.id});return mainWC.send.mock.calls.filter(([name]:any)=>name==='browser-app:context-action').at(-1)?.[1]}
 const capture=async()=>service.request('region-start',{contextToken:context().contextToken,dark:true}) as Promise<{operationId:string;rect:BrowserRegionRect;png:string}>
 return{service,page,win,mainWC,layout,context,menu,capture,handlers,bounds,state,directory}
}
const state=(owner:string|null='owner-A')=>({ticket:'ticket-A',ownerSessionId:owner,draft:'提问草稿',draftRev:3,phase:'plain',busy:false,sequence:2,syncVersion:1,canSend:true})

it('allows toolbar restore without a right-click token only while the browser is active',async()=>{const f=await fixture();await f.service.request('translation-restore');expect(mock.translation.restore).toHaveBeenCalledWith(f.state.activeId);await f.layout({active:false});await expect(f.service.request('translation-restore')).rejects.toThrow('变化')})

it('crops original page-relative integer DIP at independent host/page zoom and preserves authoritative selection',async()=>{
 const f=await fixture(),capture=await f.capture();expect(mock.region.start).toHaveBeenCalledWith(expect.objectContaining({bounds:{x:175,y:120,width:800,height:450},dark:true}))
 expect(f.page.webContents.capturePage).toHaveBeenCalledWith({x:24,y:32,width:101,height:61});expect(capture.rect).toEqual({x:24,y:32,width:101,height:61});expect(capture.png).toBe(Buffer.from('original page PNG').toString('base64'));expect(f.page.visible).toBe(true)
 await f.service.request('region-question',{operationId:capture.operationId,rect:{x:0,y:0,width:800,height:450},state:state()})
 expect(mock.region.showQuestion).toHaveBeenCalledWith(expect.objectContaining({rect:capture.rect,operationId:capture.operationId,draft:'提问草稿'}))
})
it('rejects stale context tokens after replacement, owner change, same-URL document navigation and expiration',async()=>{
 const f=await fixture(),first=f.context(),second=f.context();await expect(f.service.request('context-authorize',{contextToken:first.contextToken})).rejects.toThrow('变化');await expect(f.service.request('context-authorize',{contextToken:second.contextToken})).resolves.toBe(true)
 await f.layout({sessionId:'owner-B'});await expect(f.service.request('reload',{id:f.state.activeId,contextToken:second.contextToken})).rejects.toThrow('变化')
 await f.layout();const third=f.context();f.page.webContents.emit('did-start-navigation',{},third.url,false,true);await expect(f.service.request('context-authorize',{contextToken:third.contextToken})).rejects.toThrow('变化')
 const fourth=f.context(),now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+120001);await expect(f.service.request('context-authorize',{contextToken:fourth.contextToken})).rejects.toThrow('变化')
})
it('revalidates pending capture against changed bounds and drops events from canceled operations',async()=>{
 const f=await fixture(),bitmap=deferred<any>();f.page.webContents.capturePage.mockImplementation(()=>bitmap.promise)
 const pending=f.capture();await vi.waitFor(()=>expect(f.page.webContents.capturePage).toHaveBeenCalled());await f.layout({bounds:{...f.bounds,width:620}})
 bitmap.resolve({getSize:()=>({width:101,height:61}),isEmpty:()=>false,toPNG:()=>Buffer.from('stale PNG')});await expect(pending).rejects.toThrow('变化')
 f.mainWC.send.mockClear();mock.regionEvent({kind:'send',operationId:mock.region.start.mock.calls[0][0].operationId});expect(f.mainWC.send).not.toHaveBeenCalled();expect(mock.region.showQuestion).not.toHaveBeenCalled()
})

it('does not let a canceled capture completion close a later selection',async()=>{
 const f=await fixture(),bitmap=deferred<any>();f.page.webContents.capturePage.mockImplementationOnce(()=>bitmap.promise)
 const old=f.capture();await vi.waitFor(()=>expect(f.page.webContents.capturePage).toHaveBeenCalledOnce());await f.service.request('region-cancel')
 const next=await f.capture();mock.region.cancel.mockClear();bitmap.resolve({getSize:()=>({width:101,height:61}),isEmpty:()=>false,toPNG:()=>Buffer.from('old')})
 await expect(old).rejects.toThrow('变化');expect(mock.region.cancel).not.toHaveBeenCalled();await expect(f.service.request('region-question',{operationId:next.operationId,rect:next.rect,state:state()})).resolves.toBe(true)
})

it('ends a stuck region screenshot with a visible error and permits another capture',async()=>{
 const f=await fixture(),bitmap=deferred<any>();vi.useFakeTimers();try{f.page.webContents.capturePage.mockImplementationOnce(()=>bitmap.promise);const pending=f.capture(),failure=expect(pending).rejects.toThrow('截取选区超时');await vi.advanceTimersByTimeAsync(8001);await failure;const next=await f.capture();expect(next.png).toBeTruthy();bitmap.resolve({getSize:()=>({width:101,height:61}),isEmpty:()=>false,toPNG:()=>Buffer.from('late')});await Promise.resolve();await expect(f.service.request('region-question',{operationId:next.operationId,rect:next.rect,state:state()})).resolves.toBe(true)}finally{vi.useRealTimers()}
})
it('rejects operation, ticket and nonpending owner substitution and forwards only current operation events',async()=>{
 const f=await fixture(),capture=await f.capture();await f.service.request('region-question',{operationId:capture.operationId,rect:capture.rect,state:state()})
 await expect(f.service.request('region-question',{operationId:'old-operation',state:state()})).rejects.toThrow('变化')
 await expect(f.service.request('region-question',{operationId:capture.operationId,state:{...state(),ticket:'other-ticket'}})).rejects.toThrow('变化')
 await expect(f.service.request('region-question',{operationId:capture.operationId,state:state('owner-B')})).rejects.toThrow('变化')
 f.mainWC.send.mockClear();mock.regionEvent({kind:'send',operationId:'old-operation'});expect(f.mainWC.send).not.toHaveBeenCalled();mock.regionEvent({kind:'send',operationId:capture.operationId});expect(f.mainWC.send).toHaveBeenCalledWith('browser-app:region-event',{kind:'send',operationId:capture.operationId})
})
it('keeps the same pending question through its busy first-send owner handoff and rejects unrelated session changes',async()=>{
 const f=await fixture(''),capture=await f.capture();await f.service.request('region-question',{operationId:capture.operationId,rect:capture.rect,state:state(null)})
 await f.service.request('region-question',{operationId:capture.operationId,state:{...state('created-owner'),busy:true,phase:'submitting'}});await f.layout({sessionId:'created-owner'})
 await expect(f.service.request('region-question',{operationId:capture.operationId,state:state('created-owner')})).resolves.toBe(true)
 await f.layout({sessionId:'unrelated-owner'});await expect(f.service.request('region-question',{operationId:capture.operationId,state:state('created-owner')})).rejects.toThrow('变化')
})
it('keeps pending translation selection explicit and rejects page/subframe invocation of privileged requests',async()=>{
 const f=await fixture(''),token=f.context('翻译为中文').contextToken,selection={provider:'pending-provider',model:'pending-model',reasoningEffort:'high'}
 await f.service.request('translation-start',{contextToken:token,selection});expect(mock.translation.start).toHaveBeenCalledWith(expect.objectContaining({tabId:f.state.activeId,webContents:f.page.webContents}),{selection,sessionId:undefined})
 const handler=f.handlers.get('browser-app:request')!
 expect(()=>handler({sender:f.page.webContents,senderFrame:f.page.webContents.mainFrame},'region-start',{contextToken:token})).toThrow('main EWork Odyssey')
 expect(()=>handler({sender:f.mainWC,senderFrame:{processId:1,routingId:999}},'region-start',{contextToken:token})).toThrow('main EWork Odyssey')
})

it('prewarms selection controls from the initial browser snapshot without starting selection',async()=>{const f=await fixture();await f.service.request('snapshot');expect(mock.region.warm).toHaveBeenCalledOnce();expect(mock.region.start).not.toHaveBeenCalled();expect(mock.region.showQuestion).not.toHaveBeenCalled()})

it('exports a bounded client menu point and rejects forged or repeated commands',async()=>{const f=await fixture(),menu=f.menu();expect(menu.x).toBe(180);expect(menu.y).toBe(144);expect(menu.items.some((row:any)=>row.label==='框选并询问AI')).toBe(true);await expect(f.service.request('context-command',{contextToken:menu.contextToken,itemId:'forged'})).rejects.toThrow();const item=menu.items.find((row:any)=>row.label==='刷新');await f.service.request('context-command',{contextToken:menu.contextToken,itemId:item.id});await expect(f.service.request('context-command',{contextToken:menu.contextToken,itemId:item.id})).rejects.toThrow()})
it('saves the actual clicked inline image through a native save dialog and download record',async()=>{const f=await fixture(),url='data:image/png;base64,iVBORw0KGgo=',command=f.context('保存图片…',{hasImageContents:true,srcURL:url,mediaType:'image'});await f.service.request('save-image',{contextToken:command.contextToken});expect(f.page.webContents.downloadURL).toHaveBeenCalledWith(url);const item=Object.assign(new EventEmitter(),{getURL:()=>url,getFilename:()=> 'download',getMimeType:()=> 'image/png',getReceivedBytes:()=>10,getTotalBytes:()=>10,isPaused:()=>false,getState:()=> 'progressing',getSavePath:()=>'',setSavePath:vi.fn(),setSaveDialogOptions:vi.fn()}),event={preventDefault:vi.fn()};mock.partition.emit('will-download',event,item,f.page.webContents);expect(event.preventDefault).not.toHaveBeenCalled();expect(item.setSavePath).not.toHaveBeenCalled();expect(item.setSaveDialogOptions).toHaveBeenCalledWith(expect.objectContaining({title:'保存图片',defaultPath:expect.stringMatching(/图片\.png$/)}));const snapshot=f.service.snapshot();expect(snapshot.downloads[0]!.url).toBe('data:image/png;base64');expect(snapshot.downloads[0]!.name).toBe('图片.png')})

it('routes material menu navigation from the parent and webpage only under the live scope',async()=>{const f=await fixture();await f.service.request('menu',{id:'native-menu',revision:1,owner:'owner-A',tabId:f.state.activeId,url:f.state.tabs.find(tab=>tab.id===f.state.activeId)!.url,bounds:{x:150,y:120,width:200,height:200},html:'<button>菜单</button>',css:''});mock.menu.key.mockReturnValue(true);for(const target of [f.mainWC,f.page.webContents]){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};target.emit('before-input-event',event,{type:'keyDown',key:'ArrowDown',meta:false,control:false});expect(event.defaultPrevented).toBe(true)}expect(mock.menu.key).toHaveBeenCalledTimes(2);await f.layout({sessionId:'other'});const after={preventDefault:vi.fn()};f.mainWC.emit('before-input-event',after,{type:'keyDown',key:'Enter'});expect(after.preventDefault).not.toHaveBeenCalled()})

it('cancels selection on actual parent-surface mouse down and removes that listener at disposal',async()=>{const f=await fixture();f.mainWC.emit('before-mouse-event',{}, {type:'mouseMove'});expect(mock.region.cancelSelecting).not.toHaveBeenCalled();f.mainWC.emit('before-mouse-event',{}, {type:'mouseDown'});expect(mock.region.cancelSelecting).toHaveBeenCalledOnce();f.service.dispose();f.mainWC.emit('before-mouse-event',{}, {type:'mouseDown'});expect(mock.region.cancelSelecting).toHaveBeenCalledOnce()})

it('notifies shell menus about a click in the visible webpage without consuming the click', async () => {
 const f=await fixture(), event={preventDefault:vi.fn()}
 f.mainWC.send.mockClear()
 f.page.webContents.emit('before-mouse-event',event,{type:'mouseMove'})
 expect(f.mainWC.send).not.toHaveBeenCalled()
 f.page.webContents.emit('before-mouse-event',event,{type:'mouseDown'})
 expect(f.mainWC.send).toHaveBeenCalledWith('browser-app:page-pointer-down',f.state.activeId)
 expect(event.preventDefault).not.toHaveBeenCalled()
 await f.layout({active:false})
 f.mainWC.send.mockClear()
 f.page.webContents.emit('before-mouse-event',event,{type:'mouseDown'})
 expect(f.mainWC.send).not.toHaveBeenCalled()
})

it('does not reorder native corner views underneath an active selection during stable layout',async()=>{const f=await fixture();await f.capture();mock.corners.layout.mockClear();await f.layout();await f.layout();expect(mock.corners.layout).not.toHaveBeenCalled();await f.service.request('region-cancel');await f.layout();expect(mock.corners.layout).toHaveBeenCalledOnce()})

it('reveals a saved download, copies it into the current project, and handles its subsequent removal',async()=>{
 const f=await fixture(), path=join(f.directory,'研究材料.txt')
 writeFileSync(path,'下载的原文件')
 const item=Object.assign(new EventEmitter(),{
  getURL:()=>'https://example.test/report.txt',getFilename:()=>'研究材料.txt',getMimeType:()=>'text/plain',
  getReceivedBytes:()=>18,getTotalBytes:()=>18,getSavePath:()=>path,setSavePath:vi.fn(),isPaused:()=>false,getState:()=>'completed'
 })
 mock.partition.emit('will-download',{preventDefault:vi.fn()},item,f.page.webContents)
 item.emit('done',{},'completed')
 const {id}=f.service.snapshot().downloads[0]!
 const action=(value:string)=>f.service.request('download',{id,action:value,sessionId:'owner-A'})
 await action('reveal')
 expect(shell.showItemInFolder).toHaveBeenCalledWith(path)
 const copy=await action('material') as {path:string}
 expect(readFileSync(copy.path,'utf8')).toBe('下载的原文件')
 unlinkSync(path)
 await f.service.request('check-downloads')
 expect(f.service.snapshot().downloads[0]?.fileMissing).toBe(true)
 expect(await action('material')).toMatchObject({unavailable:true})
 expect(await action('reveal')).toMatchObject({notice:expect.stringContaining('打开下载文件夹')})
 expect(shell.openPath).toHaveBeenCalledWith(f.directory)
 expect(readFileSync(copy.path,'utf8')).toBe('下载的原文件')
})
