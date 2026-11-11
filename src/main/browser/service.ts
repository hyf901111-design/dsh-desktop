import {browserImageAddress,browserImageFilename} from './image-download'
import {browserPageContextMenu} from './context-menu'
import {createBrowserTranslationManager} from './translation'
import {createBrowserRegionOverlay} from './region-overlay'
import {browserBookmarkAddress,updateBrowserBookmark,removeBrowserBookmarks} from './bookmarks'
import {createBrowserPageAgent} from './page-agent'
import {trackBrowserFavicon} from './favicon'
import {createBrowserCorners} from './corners'
import {app,clipboard,dialog,safeStorage,screen,session,shell,WebContentsView,type BrowserWindow,type WebContents,type IpcMain,type DownloadItem,type Session} from 'electron'
import {mkdirSync,readFileSync,renameSync,writeFileSync,existsSync,copyFileSync} from 'node:fs'
import {join,basename} from 'node:path'
import {randomUUID} from 'node:crypto'
import {load} from 'cheerio'
import {createBrowserFindOverlay} from './find-overlay'
import {createBrowserMenuOverlay} from './menu-overlay'
import {registerTrustedMainWindowHandler} from '../ipc-trust'
import {BrowserModel,browserAddress,browserDownloadAddress,availableDownloadPath,browserInternalPage} from './model'
import type {BrowserSnapshot,BrowserDownload,BrowserTab} from '../../shared/browser-app'

const channel='browser-app:request',eventChannel='browser-app:state'
type Options={ipcMain:IpcMain;getMainWindow():BrowserWindow|undefined;root:string;materialDirectory(sessionId:string):Promise<string>;findPreload?:string;menuPreload?:string;regionPreload?:string;runtimeUrl?:()=>string|undefined}
type Live={view:WebContentsView;awake?:boolean;epoch:number;documentEpoch:number;findRequestId?:number;timeout?:ReturnType<typeof setTimeout>}
type DownloadOwner={id:string;private:boolean;view:WebContentsView}
const retryDownloadAddress=(url:string)=>{if(!/^https?:\/\//i.test(url))throw Error('只能重试 HTTP(S) 下载，请重新打开原网页导出其他文件。');return browserAddress(url)}
export function registerBrowserApp(options:Options){
 const path=join(options.root,'browser-state.bin')
 let saved:any,storageWarning:string|undefined
 try{if(existsSync(path))saved=JSON.parse(safeStorage.decryptString(readFileSync(path)))}catch{storageWarning='上次浏览状态未能读取，原文件已保留。'}
 const model=new BrowserModel(saved),live=new Map<string,Live>(),downloads:BrowserDownload[]=Array.isArray(saved?.downloads)?saved.downloads.filter((d:any)=>d&&typeof d.id==='string'&&typeof d.path==='string'&&typeof d.url==='string'&&typeof d.name==='string'&&d.private!==true&&['completed','interrupted','cancelled'].includes(d.state)).slice(0,100):[],items=new Map<string,DownloadItem>(),sessions=new Set<Session>(),permissions=new Map<string,Record<string,string>>((Array.isArray(saved?.permissions)?saved.permissions:[]).filter((row:any)=>Array.isArray(row)&&typeof row[0]==='string'&&/^normal:https?:\/\//.test(row[0])&&row[1]&&typeof row[1]==='object'))
 let appActive=false,ownerSessionId='',pageEdited=false,appEpoch=0,ownerEpoch=0;let privateSession:Session|undefined,visible=false,disposed=false,persistTimer:ReturnType<typeof setTimeout>|undefined,downloadPublishTimer:ReturnType<typeof setTimeout>|undefined,rect:{x:number;y:number;width:number;height:number}|undefined
 let attachedWindow:BrowserWindow|undefined,attachedKeyContents:WebContents|undefined
 const downloadOwners=new Map<boolean,DownloadOwner>()
 const imageDownloads=new Map<number,{url:string;at:number}[]>()
 const window=()=>{const win=options.getMainWindow();if(!win||win.isDestroyed())throw Error('客户端窗口不可用。');if(attachedWindow!==win){attachedKeyContents?.removeListener('before-input-event',routeMenuKey);attachedKeyContents?.removeListener('before-mouse-event',routeRegionPointer);attachedWindow=win;attachedKeyContents=win.webContents;attachedKeyContents.on('before-input-event',routeMenuKey);attachedKeyContents.on('before-mouse-event',routeRegionPointer);win.once('closed',detachWindow)}return win}
 const permissionKey=(tab:Pick<BrowserTab,'private'>,origin:string)=>(tab.private?'private:':'normal:')+origin
 const activePermissions=()=>{try{const tab=model.tab(model.activeId);return permissions.get(permissionKey(tab,new URL(tab.url).origin))??{}}catch{return {}}}
 const findPreload=options.findPreload||join(__dirname,'../preload/browser-find.cjs'),nativeFind=existsSync(findPreload)
 const finder=nativeFind?createBrowserFindOverlay(findPreload,window,value=>{const tab=current();if(value.kind==='close'){finder?.hide();live.get(tab.id)?.view.webContents.focus();window().webContents.send('browser-app:shortcut',{key:'Escape'});void request('find',{id:tab.id,text:''}).catch(()=>{})}else if(value.kind==='shortcut'){window().webContents.send('browser-app:shortcut',value)}else void request('find',{id:tab.id,text:value.text,next:value.kind==='next',forward:value.forward}).catch(()=>{})}):undefined
 const menuPreload=options.menuPreload||join(__dirname,'../preload/browser-menu.cjs'),nativeMenus=existsSync(menuPreload)
 let menuScope:{id:string;revision:number;owner:string;tabId:string;url:string;bounds?:{x:number;y:number;width:number;height:number};zoom?:number}|undefined
 const menu=createBrowserMenuOverlay(menuPreload,window,value=>{const scope=menuScope;if(!scope||value.id!==scope.id||value.revision!==scope.revision||!appActive||ownerSessionId!==scope.owner||current().id!==scope.tabId||current().url!==scope.url){menu.hide();menuScope=undefined;return}window().webContents.send('browser-app:menu-event',value);if(value.kind==='dismiss'){hideMenu();const through=value.through,b=scope.bounds,z=scope.zoom||1;if(through&&b){const win=window(),[width=0,height=0]=win.getContentSize(),x=Math.round(b.x+through.x*z),y=Math.round(b.y+through.y*z);if(x>=0&&y>=0&&x<width&&y<height){const within=rect&&visible&&x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height,target=within?live.get(scope.tabId)?.view.webContents:win.webContents;if(target&&!target.isDestroyed()){target.focus();const point={x:within?x-rect!.x:x,y:within?y-rect!.y:y,button:through.button||'left',clickCount:1};target.sendInputEvent({...point,type:'mouseDown'});target.sendInputEvent({...point,type:'mouseUp'})}}}}})
 const hideMenu=(notify=false)=>{const scope=menuScope;menuScope=undefined;menu.hide();if(notify&&scope)window().webContents.send('browser-app:menu-event',{id:scope.id,revision:scope.revision,kind:'dismiss'})}
 const routeMenuKey=(event:{preventDefault():void},input:Electron.Input)=>{const scope=menuScope;if(!scope||!appActive||scope.owner!==ownerSessionId||scope.tabId!==current().id||scope.url!==current().url)return false;if(menu.key(input)){event.preventDefault();return true}return false}
 const routeRegionPointer=(_event:unknown,input:{type:string})=>{if(input.type==='mouseDown')region.cancelSelecting()}
 const translation=createBrowserTranslationManager({runtimeUrl:()=>options.runtimeUrl?.(),onChange:()=>publish()})
 const regionPreload=options.regionPreload||join(__dirname,'../preload/browser-region.cjs'),nativeRegion=existsSync(regionPreload)
 type RegionScope={ticket?:string;handoffOwner?:string;selection?:{x:number;y:number;width:number;height:number};operationId:string;owner:string;tabId:string;url:string;documentEpoch:number;bounds:{x:number;y:number;width:number;height:number}}
 let regionScope:RegionScope|undefined
 const region=createBrowserRegionOverlay(regionPreload,window,value=>{if(value.kind==='selection')return;if(!regionScope||value.operationId!==regionScope.operationId)return;if(!regionValid()){cancelRegion();return}window().webContents.send('browser-app:region-event',value)})
 const regionValid=()=>{const scope=regionScope,e=scope&&live.get(scope.tabId);return !!scope&&appActive&&visible&&ownerSessionId===scope.owner&&current().id===scope.tabId&&current().url===scope.url&&!!e&&!e.view.webContents.isDestroyed()&&e.documentEpoch===scope.documentEpoch&&e.view.webContents.getURL()===scope.url&&JSON.stringify(rect)===JSON.stringify(scope.bounds)}
 const cancelRegion=()=>{const old=regionScope;regionScope=undefined;region.cancel();if(old){const win=options.getMainWindow();if(win&&!win.isDestroyed())win.webContents.send('browser-app:region-event',{kind:'close',operationId:old.operationId})}}
 let contextScope:{token:string;owner:string;tabId:string;url:string;documentEpoch:number;expires:number;imageURL?:string;commands:Map<string,()=>void>;commanded?:boolean}|undefined
 const checkContext=(token:unknown)=>{const c=contextScope,e=c&&live.get(c.tabId);if(typeof token!=='string'||!c||token!==c.token||Date.now()>c.expires||!appActive||ownerSessionId!==c.owner||current().id!==c.tabId||current().url!==c.url||!e||e.documentEpoch!==c.documentEpoch||e.view.webContents.isDestroyed()||e.view.webContents.getURL()!==c.url)throw Error('当前网页已变化，请重新打开右键菜单。')}
 const snapshot=():BrowserSnapshot=>({nativeFind,nativeMenus,nativeRegion,translation:translation.status(model.activeId),pageEdited,sitePermissions:activePermissions(),tabs:model.tabs,activeId:model.activeId,history:model.history,bookmarks:model.bookmarks,closed:model.closed,folders:model.folders,downloads,settings:model.settings,...(storageWarning?{storageWarning}:{})})
 const pageAgent=createBrowserPageAgent(()=>{const tab=current(),entry=live.get(tab.id);if(!appActive||!entry||entry.view.webContents.isDestroyed()||tab.page||!tab.url||tab.error)return undefined;return {tabId:tab.id,url:entry.view.webContents.getURL(),title:entry.view.webContents.getTitle()||tab.title,webContents:entry.view.webContents}})
 const authority=(documentBound=false)=>{const epoch=documentBound?appEpoch:ownerEpoch,owner=ownerSessionId,tabId=current().id;return()=>{if(!appActive||(documentBound?appEpoch:ownerEpoch)!==epoch||ownerSessionId!==owner||current().id!==tabId)throw Error('当前页签或会话已变化，旧请求已拒绝。')}}
 const persist=()=>{
  try{if(!safeStorage.isEncryptionAvailable()){storageWarning='系统加密不可用，本次浏览记录仅保留在内存。';return}mkdirSync(options.root,{recursive:true});const temp=path+'.tmp';writeFileSync(temp,safeStorage.encryptString(JSON.stringify({...model.serialize(),permissions:[...permissions].filter(([key])=>key.startsWith('normal:')),downloads:downloads.filter(d=>!d.private).map(d=>({...d,state:['progressing','paused'].includes(d.state)?'interrupted':d.state}))})),{mode:0o600});renameSync(temp,path)}catch{storageWarning='浏览状态暂时无法保存，请检查磁盘空间。'}
 }
 const publish=()=>{if(disposed)return;finder?.update(current());const win=options.getMainWindow();if(win&&!win.isDestroyed())win.webContents.send(eventChannel,snapshot());clearTimeout(persistTimer);persistTimer=setTimeout(persist,300)}
 const publishDownload=()=>{if(downloadPublishTimer)return;downloadPublishTimer=setTimeout(()=>{downloadPublishTimer=undefined;publish()},100)}
 const current=()=>model.tab(model.activeId)
 const closeDownloadOwners=(isPrivate?:boolean)=>{for(const [key,owner]of downloadOwners)if(isPrivate===undefined||key===isPrivate){downloadOwners.delete(key);if(!owner.view.webContents.isDestroyed())owner.view.webContents.close()}}
 const corners=createBrowserCorners(window);let cornerColor=[17,17,17]
 const sync=()=>{
  if(regionScope&&!regionValid())cancelRegion()
  if(menuScope&&(!appActive||ownerSessionId!==menuScope.owner||current().id!==menuScope.tabId||current().url!==menuScope.url))hideMenu()
  let shown=false
  for(const [id,e]of live){
   const tab=model.tab(id),show=visible&&id===model.activeId&&!tab.page&&!!tab.url&&!tab.error
   if(show&&rect){e.view.setBounds(rect);shown=true}e.view.setVisible(show&&!!rect)
   // First activation needs an attached surface; a prepared page stays awake behind overlays.
   const awake=appActive&&id===model.activeId&&!tab.page&&!!tab.url&&!tab.error&&(e.awake===true||show&&!!rect)
   if(e.awake!==awake){e.view.webContents.setBackgroundThrottling(!awake);e.awake=awake}
  }
  // Valid region operations pin the viewport. Re-adding the corner siblings
  // here would unseat its native pointer capture on every shell layout pass.
  if(!regionScope)corners.layout(rect,shown,cornerColor,shown?window().webContents.getZoomFactor():1);finder?.raise();region.raise();menu.raise()
 }
 const sessionFor=(tab:Pick<BrowserTab,'private'>)=>{
  const s=tab.private?(privateSession??=session.fromPartition('browser-private-'+randomUUID())):session.fromPartition('persist:odyssey-browser-app')
  if(sessions.has(s))return s;sessions.add(s)
  const keys=(permission:string,types:string[]=[])=>permission==='media'?(types.length?types:['video','audio']).map(type=>type==='video'?'camera':'microphone'):[permission]
  const policy=(origin:string,key:string)=>{const row=permissions.get(permissionKey(tab,origin));return row?.[key]??(['camera','microphone'].includes(key)?row?.media:undefined)??(['geolocation','camera','microphone'].includes(key)?'ask':key==='downloads'?'allow':'block')}
  s.setPermissionCheckHandler((wc,permission,origin,details)=>{try{return !!wc&&[...live.values()].some(e=>e.view.webContents===wc)&&keys(permission,details.mediaType&&details.mediaType!=='unknown'?[details.mediaType]:[]).every(key=>policy(new URL(origin).origin,key)==='allow')}catch{return false}})
  s.setPermissionRequestHandler((wc,permission,callback,details)=>{
   try{
    if(![...live.values()].some(e=>e.view.webContents===wc)){callback(false);return}
    const origin=new URL(details.requestingUrl||wc.getURL()).origin,requested=keys(permission,'mediaTypes'in details?details.mediaTypes:[]),values=requested.map(key=>policy(origin,key))
    if(values.includes('block')){callback(false);return}if(values.every(value=>value==='allow')){callback(true);return}
    if(!visible||live.get(model.activeId)?.view.webContents!==wc){callback(false);return}
    const labels:Record<string,string>={geolocation:'位置',camera:'摄像头',microphone:'麦克风'},before=wc.getURL()
    void dialog.showMessageBox(window(),{type:'question',message:'网站请求访问'+requested.map(key=>labels[key]||key).join('、'),detail:origin,buttons:['允许本次','阻止'],defaultId:1,cancelId:1,noLink:true}).then(result=>callback(!wc.isDestroyed()&&wc.getURL()===before&&result.response===0)).catch(()=>callback(false))
   }catch{callback(false)}
  })
  s.on('will-download',(event,item,wc)=>{
   const tabId=[...live].find(([,e])=>e.view.webContents===wc)?.[0],owner=tabId?model.tab(tabId):[...downloadOwners.values()].find(row=>row.view.webContents===wc)
   if(!owner){event.preventDefault();return}
   const jobs=imageDownloads.get(wc.id)||[],imageIndex=jobs.findIndex(job=>job.url===item.getURL()&&Date.now()-job.at<60000),image=imageIndex>=0
   if(image){jobs.splice(imageIndex,1);if(!jobs.length)imageDownloads.delete(wc.id)}
   try{const source=tabId?wc.getURL():retryDownloadAddress(item.getURL());if(policy(new URL(source).origin,'downloads')==='block')throw Error('站点下载已阻止');if(image)browserImageAddress(item.getURL(),source);else browserDownloadAddress(item.getURL(),source)}catch{event.preventDefault();return}
   // Native save dialogs remain the authority for overwrite confirmation.
   const imageName=image?browserImageFilename(item.getFilename(),item.getMimeType()):undefined;if(image)item.setSaveDialogOptions({title:'保存图片',defaultPath:join(model.settings.downloadPath||app.getPath('downloads'),imageName!)})
   let target='';if(!image&&!model.settings.askDownload){const directory=model.settings.downloadPath||app.getPath('downloads');target=availableDownloadPath(directory,item.getFilename(),new Set(downloads.filter(d=>['progressing','paused'].includes(d.state)).map(d=>d.path)),existsSync);item.setSavePath(target)}
   const row:BrowserDownload={id:randomUUID(),tabId:owner.id,private:owner.private,url:image&&item.getURL().startsWith('data:')?item.getURL().slice(0,item.getURL().indexOf(',')):item.getURL(),name:imageName||item.getFilename(),path:target,received:0,total:item.getTotalBytes(),state:'progressing'}
   downloads.unshift(row);items.set(row.id,item)
   const update=()=>{row.received=item.getReceivedBytes();row.total=item.getTotalBytes();row.path=item.getSavePath()||row.path;if(image&&row.path)row.name=basename(row.path);row.state=item.isPaused()?'paused':item.getState();publishDownload()}
   item.on('updated',update);item.once('done',(_event,state)=>{row.state=state;row.path=item.getSavePath()||row.path;if(image&&row.path)row.name=basename(row.path);row.received=item.getReceivedBytes();publish()});publish()
  })
  return s
 }
 const downloadOwner=(isPrivate:boolean)=>{
  if(isPrivate&&!privateSession)throw Error('隐私浏览已结束，请重新打开原网页下载。')
  const found=downloadOwners.get(isPrivate);if(found&&!found.view.webContents.isDestroyed())return found
  const view=new WebContentsView({webPreferences:{session:sessionFor({private:isPrivate}),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}}),owner={id:randomUUID(),private:isPrivate,view}
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',event=>event.preventDefault());downloadOwners.set(isPrivate,owner);return owner
 }
 const ensure=(tab:BrowserTab)=>{
  if(tab.page)throw Error('请先打开网页。')
  const found=live.get(tab.id);if(found)return found
  const view=new WebContentsView({webPreferences:{session:sessionFor(tab),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}})
  const e:Live={view,epoch:0,documentEpoch:0};live.set(tab.id,e);window().contentView.addChildView(view);view.setVisible(false)
  const wc=view.webContents;wc.setAudioMuted(tab.muted);wc.setZoomFactor(tab.zoom)
  wc.on('did-start-navigation',(_event,_url,inPlace,isMain)=>{if(isMain){if(!inPlace)e.documentEpoch++;if(regionScope?.tabId===tab.id)cancelRegion();contextScope=undefined}})
  wc.on('context-menu',(_event,params)=>{
   if(!appActive||!visible||current().id!==tab.id||!tab.url||tab.page||tab.error)return
   hideMenu(true);cancelRegion();let imageURL:string|undefined;if(params.hasImageContents&&params.srcURL){try{imageURL=browserImageAddress(params.srcURL,wc.getURL())}catch{}}const scope={token:randomUUID(),owner:ownerSessionId,tabId:tab.id,url:wc.getURL(),documentEpoch:e.documentEpoch,expires:Date.now()+120000,imageURL,commands:new Map<string,()=>void>()};contextScope=scope
   const safe=(fn:()=>void)=>()=>{try{checkContext(scope.token);fn()}catch{}}
   const perform=(action:string)=>safe(()=>window().webContents.send('browser-app:context-action',{action,tabId:tab.id,url:scope.url,ownerSessionId:scope.owner,contextToken:scope.token}))()
   const t=translation.status(tab.id),template=browserPageContextMenu({isEditable:params.isEditable,selectionText:params.selectionText,linkURL:params.linkURL,hasImageContents:params.hasImageContents,finderPath:'',editFlags:params.editFlags},{openLink:url=>safe(()=>{void request('new',{url}).catch(()=>{})})(),openDesktopLink:url=>safe(()=>{void shell.openExternal(browserAddress(url)).catch(()=>{})})(),copyLink:url=>safe(()=>clipboard.writeText(url))(),copyImage:safe(()=>wc.copyImageAt(params.x,params.y)),revealItem:()=>{}},{loading:wc.isLoadingMainFrame(),translating:t.state==='translating',canRestore:t.canRestore,region:nativeRegion,image:!!imageURL,perform,edit:action=>safe(()=>{const edits:Record<string,()=>void>={undo:()=>wc.undo(),redo:()=>wc.redo(),cut:()=>wc.cut(),copy:()=>wc.copy(),paste:()=>wc.paste(),selectAll:()=>wc.selectAll()};edits[action]?.()})()})
   const shortcuts:Record<string,string>={'复制':'⌘C','全选':'⌘A','剪切':'⌘X','粘贴':'⌘V','撤销':'⌘Z','重做':'⇧⌘Z','另存网页…':'⌘S','打印…':'⌘P','刷新':'⌘R'},items=template.map((item,index)=>{const id='item-'+index;if(item.type==='separator')return{id,separator:true};if(item.enabled!==false&&item.click)scope.commands.set(id,()=>item.click!(undefined as any,window(),{} as any));return{id,label:item.label||'',enabled:item.enabled!==false,shortcut:shortcuts[item.label||'']}}),z=window().webContents.getZoomFactor(),b=rect!
   window().webContents.send('browser-app:context-menu',{contextToken:scope.token,tabId:scope.tabId,url:scope.url,ownerSessionId:scope.owner,x:(b.x+Math.max(0,Math.min(b.width,params.x)))/z,y:(b.y+Math.max(0,Math.min(b.height,params.y)))/z,items})
  })
  trackBrowserFavicon(wc,favicon=>{if(disposed||live.get(tab.id)!==e||tab.favicon===favicon)return;tab.favicon=favicon;publish()})
  const valid=(event:{preventDefault():void},url:string)=>{if(url==='about:blank')return;try{browserAddress(url)}catch{event.preventDefault()}}
  wc.once('destroyed',()=>imageDownloads.delete(wc.id))
  wc.on('will-navigate',valid);wc.on('will-redirect',valid)
  let popupGestureAt=0
  wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown')popupGestureAt=Date.now()})
  wc.on('before-mouse-event',(_event,mouse)=>{if(mouse.type==='mouseDown'&&menu.isShown())hideMenu(true)})
  wc.on('before-input-event',(event,input)=>{if(routeMenuKey(event,input))return;if(input.type==='keyDown')popupGestureAt=Date.now()})
  wc.setWindowOpenHandler(({url})=>{try{const origin=new URL(wc.getURL()).origin,gesture=Date.now()-popupGestureAt<1000;popupGestureAt=0;if(!gesture&&permissions.get(permissionKey(tab,origin))?.popups!=='allow')return {action:'deny'};const target=browserAddress(url);const next=model.newTab(tab.private);void navigate(next,target);publish()}catch{}return {action:'deny'}})
  wc.on('did-start-loading',()=>{if(model.activeId===tab.id){appEpoch++;pageEdited=false}tab.loading=true;tab.error=undefined;publish()})
  const refresh=()=>{if(wc.isDestroyed())return;tab.canBack=wc.navigationHistory.canGoBack();tab.canForward=wc.navigationHistory.canGoForward();const url=wc.getURL();if(/^https?:/.test(url)){tab.url=url;tab.title=wc.getTitle()||new URL(url).hostname}else if(url==='about:blank'){Object.assign(tab,{url:'',title:'新标签页',favicon:undefined,error:undefined,find:undefined})}sync();publish()}
  wc.on('did-navigate',refresh);wc.on('did-navigate-in-page',refresh);wc.on('page-title-updated',refresh)
  wc.on('did-finish-load',()=>{if(wc.getURL().startsWith('about:'))return;tab.loading=false;tab.error=undefined;clearTimeout(e.timeout);try{model.visited(tab.id,browserAddress(wc.getURL()),wc.getTitle()||new URL(wc.getURL()).hostname)}catch{}refresh();sync()})
  wc.on('did-stop-loading',()=>{tab.loading=false;publish()})
  wc.on('did-fail-load',(_ev,code,description,url,isMain)=>{if(!isMain||code===-3)return;clearTimeout(e.timeout);tab.loading=false;tab.error=description||'网页加载失败';if(url)tab.url=url;sync();publish()})
  wc.on('render-process-gone',()=>{tab.loading=false;tab.error='网页进程已退出，请重新加载。';sync();publish()})
  wc.on('found-in-page',(_ev,result)=>{if(result.requestId!==e.findRequestId)return;tab.find={activeMatchOrdinal:result.activeMatchOrdinal,matches:result.matches};publish()})
  wc.on('before-input-event',(event,input)=>{if(event.defaultPrevented)return;if(!(input.meta||input.control)||input.type!=='keyDown')return;if(['l','t','w','r','f','d','p','s','y','j','n'].includes(input.key.toLowerCase())){event.preventDefault();window().webContents.send('browser-app:shortcut',{key:input.key,metaKey:input.meta,ctrlKey:input.control,shiftKey:input.shift,altKey:input.alt})}})
  return e
 }
 const navigate=async(tab:BrowserTab,url:string)=>{
  tab.page=undefined;const e=ensure(tab),epoch=++e.epoch;clearTimeout(e.timeout);tab.favicon=undefined;tab.url=url;tab.title=new URL(url).hostname;tab.loading=true;tab.error=undefined;sync();publish()
  e.timeout=setTimeout(()=>{if(epoch!==e.epoch)return;tab.error='ERR_CONNECTION_TIMED_OUT';e.view.webContents.stop();tab.loading=false;sync();publish()},45000)
  try{await e.view.webContents.loadURL(url)}catch(error){if(epoch===e.epoch&&(error as any)?.code!=='ERR_ABORTED'){tab.error='暂时无法加载网页';tab.loading=false;sync();publish()}}finally{if(epoch===e.epoch)clearTimeout(e.timeout)}
 }
 const close=(id:string)=>{
  if(regionScope?.tabId===id)cancelRegion();translation.cancel(id,{discard:true})
  const e=live.get(id);if(e){clearTimeout(e.timeout);e.epoch++;window().contentView.removeChildView(e.view);e.view.webContents.close();live.delete(id)}
  const tab=model.close(id)
  if(tab.private&&!model.tabs.some(t=>t.private)&&privateSession){const old=privateSession;privateSession=undefined;sessions.delete(old);closeDownloadOwners(true);for(const key of permissions.keys())if(key.startsWith('private:'))permissions.delete(key);for(const row of [...downloads])if(row.private){const item=items.get(row.id);if(item&&['progressing','paused'].includes(row.state))item.cancel();items.delete(row.id);downloads.splice(downloads.indexOf(row),1)}void old.clearStorageData().catch(()=>{})}
  sync();publish()
 }
 const inputString=(value:unknown,max=1024)=>{if(typeof value!=='string'||value.length>max)throw Error('参数无效。');return value}
 const request=async(method:string,input:Record<string,any>={})=>{
  if(typeof method!=='string'||!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>(method==='menu'?6000000:method==='bookmarks-remove'?700000:method==='region-question'?2200000:32000))throw Error('浏览器参数无效。')
  if(input.contextToken!==undefined)checkContext(input.contextToken)
  const internalPage=method==='internal-page'?browserInternalPage(input.page):undefined
  if(!model.tabs.length)model.newTab()
  if(method==='snapshot'){if(nativeMenus)void menu.warm();if(nativeRegion)void region.warm().catch(()=>{});return snapshot()}
  if(method==='workspace-pointer-in-bar'){
   const bounds=input.bounds
   if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key]))||bounds.width<=0||bounds.height<=0)return false
   const win=window()
   if(!win.isVisible()||win.isMinimized())return false
   const content=win.getContentBounds(),pointer=screen.getCursorScreenPoint(),zoom=win.webContents.getZoomFactor()
   const x=(pointer.x-content.x)/zoom,y=(pointer.y-content.y)/zoom
   return x>=bounds.x&&x<bounds.x+bounds.width&&y>=bounds.y&&y<bounds.y+bounds.height
  }
  if(method==='menu-hide'){if(!input?.id||input.id===menuScope?.id){const focused=menu.isFocused();hideMenu();if(focused)window().webContents.focus()}return true}
  if(method==='menu'){
   if(!nativeMenus||!appActive||input.owner!==ownerSessionId||input.tabId!==current().id||input.url!==current().url||!current().url||current().page||current().error)throw Error('菜单所属网页已变化。')
   const win=window(),z=win.webContents.getZoomFactor(),[width=0,height=0]=win.getContentSize(),b=input.bounds
   if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x*z+b.width*z>width+2||b.y*z+b.height*z>height+2)throw Error('菜单位置无效。')
   menuScope={id:input.id,revision:input.revision,owner:ownerSessionId,tabId:current().id,url:current().url,bounds:{x:Math.round(b.x*z),y:Math.round(b.y*z),width:Math.round(b.width*z),height:Math.round(b.height*z)},zoom:z}
   return menu.show({...input,id:input.id,revision:input.revision,html:input.html,bounds:{x:Math.round(b.x*z),y:Math.round(b.y*z),width:Math.min(width-Math.round(b.x*z),Math.round(b.width*z)),height:Math.min(height-Math.round(b.y*z),Math.round(b.height*z))},zoom:z})
  }
  if(method==='context-command'){checkContext(input.contextToken);const scope=contextScope!,command=scope.commands.get(inputString(input.itemId,40));if(!command||scope.commanded)throw Error('菜单操作已失效。');scope.commanded=true;command();return true}
  if(method==='save-image'){
   checkContext(input.contextToken);const scope=contextScope!,entry=live.get(scope.tabId),url=scope.imageURL;if(!url||!entry)throw Error('请重新右键点击需要保存的图片。');if(activePermissions().downloads==='block')throw Error('此网站的下载已被阻止。');browserImageAddress(url,scope.url);const wc=entry.view.webContents,jobs=(imageDownloads.get(wc.id)||[]).filter(job=>Date.now()-job.at<60000);if(jobs.length>=4)throw Error('请等待当前图片保存完成。');const job={url,at:Date.now()};jobs.push(job);imageDownloads.set(wc.id,jobs);const cleanup=setTimeout(()=>{const current=imageDownloads.get(wc.id);if(current){const remaining=current.filter(row=>row!==job);if(remaining.length)imageDownloads.set(wc.id,remaining);else imageDownloads.delete(wc.id)}},60000);cleanup.unref();try{wc.downloadURL(url)}catch(error){jobs.splice(jobs.indexOf(job),1);throw error}return{started:true}
  }
  if(method==='context-authorize'){checkContext(input.contextToken);return true}
  if(method==='translation-start'){
   checkContext(input.contextToken);const tab=current(),entry=live.get(tab.id);if(!entry||tab.page||!tab.url)throw Error('请先打开网页。')
   if(input.selection!==undefined&&(!input.selection||typeof input.selection.provider!=='string'||!input.selection.provider||input.selection.provider.length>256||typeof input.selection.model!=='string'||!input.selection.model||input.selection.model.length>256||input.selection.reasoningEffort!==undefined&&(typeof input.selection.reasoningEffort!=='string'||input.selection.reasoningEffort.length>256)))throw Error('当前模型选择无效。')
   cancelRegion();void translation.start({tabId:tab.id,url:entry.view.webContents.getURL(),title:tab.title,webContents:entry.view.webContents},{selection:input.selection,sessionId:ownerSessionId||undefined}).catch(()=>{});return snapshot()
  }
  if(method==='translation-restore'||method==='translation-stop'){authority(true)();if(method==='translation-stop')translation.cancel(current().id);else await translation.restore(current().id);return snapshot()}
  if(method==='region-cancel'){if(!input.operationId||input.operationId===regionScope?.operationId)cancelRegion();return true}
  if(method==='region-start'){
   checkContext(input.contextToken);if(!nativeRegion||!visible||!rect)throw Error('当前网页暂时无法框选。')
   cancelRegion();hideMenu(true);finder?.hide();const tab=current(),entry=live.get(tab.id)!;if(entry.view.webContents.isLoadingMainFrame())throw Error('请等待网页载入。')
   const scope:RegionScope={operationId:randomUUID(),owner:ownerSessionId,tabId:tab.id,url:entry.view.webContents.getURL(),documentEpoch:entry.documentEpoch,bounds:{...rect}};regionScope=scope
   const cancelOwn=()=>{if(regionScope===scope)cancelRegion()},valid=()=>regionScope===scope&&regionValid()
   const selection=await region.start({operationId:scope.operationId,bounds:scope.bounds,dark:input.dark===true});if(!selection){cancelOwn();return null}
   if(!valid()){cancelOwn();throw Error('网页位置已变化，请重新框选。')}
   if(selection.width<4||selection.height<4||selection.x<0||selection.y<0||selection.x+selection.width>scope.bounds.width||selection.y+selection.height>scope.bounds.height){cancelOwn();throw Error('网页选区无效。')}
   const crop={x:Math.floor(selection.x),y:Math.floor(selection.y),width:Math.min(scope.bounds.width,Math.ceil(selection.x+selection.width))-Math.floor(selection.x),height:Math.min(scope.bounds.height,Math.ceil(selection.y+selection.height))-Math.floor(selection.y)}
   scope.selection=crop;let timer:ReturnType<typeof setTimeout>|undefined,bitmap:Electron.NativeImage
   try{bitmap=await Promise.race([entry.view.webContents.capturePage(crop),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('截取选区超时，请重新框选。')),8000)})])}catch(error){cancelOwn();throw error}finally{clearTimeout(timer)}
   if(!valid()){cancelOwn();throw Error('网页已变化，请重新框选。')}
   const size=bitmap.getSize();if(bitmap.isEmpty()||size.width*size.height>20000000){cancelOwn();throw Error('选区过大或未能截取，请缩小后重试。')}
   const png=bitmap.toPNG();if(png.length>15000000){cancelOwn();throw Error('选区图片过大，请缩小后重试。')}
   return {operationId:scope.operationId,rect:crop,png:png.toString('base64'),name:'网页选区.png',tabId:scope.tabId,url:scope.url}
  }
  if(method==='region-question'){
   if(!regionValid()||input.operationId!==regionScope?.operationId)throw Error('选区所属网页已变化。')
   const scope=regionScope!;if(!scope.selection)throw Error('请先框选网页。');const value=input.state;if(!value||typeof value.draft!=='string'||value.draft.length>1000000||!Number.isSafeInteger(value.draftRev)||!['plain','claimed','adjudicating','submitting'].includes(value.phase)||typeof value.busy!=='boolean')throw Error('询问草稿无效。')
   if(typeof value.ticket!=='string'||!value.ticket||value.ticket.length>256||scope.ticket&&scope.ticket!==value.ticket)throw Error('询问草稿所属已变化。')
   const stateOwner=value.ownerSessionId===null?'':typeof value.ownerSessionId==='string'&&value.ownerSessionId.length<=256?value.ownerSessionId:undefined
   const ownHandoff=scope.owner===''&&!!scope.ticket&&!!stateOwner&&(value.busy===true||scope.handoffOwner===stateOwner)
   if(stateOwner===undefined||stateOwner!==scope.owner&&!ownHandoff)throw Error('询问草稿所属会话已变化。')
   scope.ticket=value.ticket;if(ownHandoff)scope.handoffOwner=stateOwner
   const state={operationId:scope.operationId,ownerSessionId:value.ownerSessionId,draft:value.draft,draftRev:value.draftRev,phase:value.phase,busy:value.busy,sequence:value.sequence,syncVersion:value.syncVersion,canSend:value.canSend===true,error:typeof value.error==='string'?value.error.slice(0,500):undefined,sent:value.sent===true}
   if(input.rect)region.showQuestion({...state,rect:scope.selection});else region.updateQuestion(state);return true
  }
  if(method==='context'){if(!appActive)return undefined;if(current().url&&current().loading)throw Error('网页正在加载，请稍候再发送。');return pageAgent.context(authority(true))}
  if(method==='undo-page'){const authorize=authority(true);authorize();const source=await pageAgent.context(authorize);if(!source?.canUndo)throw Error('当前网页没有可撤销的修改。');await pageAgent.run({op:'undo',revision:source.revision,tabId:source.tabId,url:source.url},undefined,authorize);authorize();pageEdited=false;publish();return snapshot()}
  if(method==='layout'){
   if(Array.isArray(input.cornerColor)&&input.cornerColor.length===3&&input.cornerColor.every((v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=255))cornerColor=input.cornerColor
   const active=input.active===true,owner=typeof input.sessionId==='string'?input.sessionId:'';if(appActive!==active||ownerSessionId!==owner){const ownHandoff=active&&appActive&&regionScope?.owner===''&&regionScope.handoffOwner===owner&&!!owner;if(ownHandoff){regionScope!.owner=owner;regionScope!.handoffOwner=undefined}else cancelRegion();translation.cancel(current().id);contextScope=undefined;appEpoch++;ownerEpoch++;pageAgent.invalidate();const wasEdited=pageEdited;pageEdited=false;if(wasEdited)publish()}appActive=active;ownerSessionId=owner;
   visible=false;const r=input.bounds,win=window(),z=win.webContents.getZoomFactor(),[w,h]=win.getContentSize()
   if(input.visible===true&&r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))){const b={x:Math.round(r.x*z),y:Math.round(r.y*z),width:Math.round(r.width*z),height:Math.round(r.height*z)};if(b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=(w??0)&&b.y+b.height<=(h??0)){rect=b;visible=true}}
   sync();const f=input.find;let findBounds:typeof rect;if(visible&&rect&&current().url&&!current().page&&f?.bounds&&['x','y','width','height'].every(k=>Number.isFinite(f.bounds[k]))){const b={x:Math.round(f.bounds.x*z),y:Math.round(f.bounds.y*z),width:Math.round(f.bounds.width*z),height:Math.round(f.bounds.height*z)};if(b.x>=rect.x&&b.y>=0&&b.width>0&&b.height>0&&b.width<=468*z+2&&b.height<=60*z+2&&b.x+b.width<=rect.x+rect.width&&b.y+b.height<=rect.y+rect.height)findBounds=b}finder?.layout(findBounds,{...f,zoom:z},current());return true
  }
  if(['new','select','close','restore','duplicate','internal-page'].includes(method)){cancelRegion();translation.cancel(current().id);contextScope=undefined;appEpoch++;ownerEpoch++;pageAgent.invalidate();pageEdited=false}
  if(method==='new'){const tab=model.newTab(input.private===true);if(input.url)void navigate(tab,browserAddress(input.url,model.settings.engine));sync();publish();return snapshot()}
  if(method==='internal-page'){const tab=model.tabs.find(t=>t.page===internalPage&&!t.private)??model.newTab(false,internalPage);model.activeId=tab.id;finder?.hide();sync();publish();return snapshot()}
  if(method==='select'){model.activeId=model.tab(input.id).id;const tab=current();if(tab.page)finder?.hide();else if(tab.url&&!live.has(tab.id))void navigate(tab,tab.url);sync();publish();return snapshot()}
  if(method==='close'){close(model.tab(input.id).id);return snapshot()}
  if(method==='reorder'){model.reorder(input.id,input.beforeId);sync();publish();return snapshot()}
  if(method==='restore'){const tab=model.restore();if(tab?.url)void navigate(tab,tab.url);sync();publish();return snapshot()}
  if(method==='bookmark-update'){updateBrowserBookmark(model,input);publish();return snapshot()}
  if(method==='bookmarks-remove'){removeBrowserBookmarks(model,input);publish();return snapshot()}
  if(method==='history-remove'){const id=inputString(input.id,256);if(!id)throw Error('参数无效。');model.history=model.history.filter(row=>row.id!==id);publish();return snapshot()}
  if(method==='bookmark'){
   const url=browserBookmarkAddress(input.url),title=inputString(input.title).trim()||new URL(url).hostname,folder=inputString(input.folder??'',100).trim();const old=model.bookmarks.find(b=>b.url===url)
   if(input.remove)model.bookmarks=model.bookmarks.filter(b=>b.url!==url)
   else if(old)Object.assign(old,{title,folder});else model.bookmarks.unshift({id:randomUUID(),title,url,folder,at:Date.now()})
   if(folder&&!model.folders.includes(folder))model.folders.push(folder);publish();return snapshot()
  }
  if(method==='folder'){const name=inputString(input.name,100).trim();if(!name)throw Error('请输入文件夹名称。');if(!model.folders.includes(name))model.folders.push(name);publish();return snapshot()}
  if(method==='folder-rename'){const name=inputString(input.name,100).trim(),previous=inputString(input.previous,100);if(!name||!model.folders.includes(previous)||model.folders.includes(name))throw Error('文件夹名称不可用。');model.folders=model.folders.map(f=>f===previous?name:f);for(const b of model.bookmarks)if(b.folder===previous)b.folder=name;publish();return snapshot()}
  if(method==='folder-remove'){const folder=inputString(input.name,100);model.folders=model.folders.filter(f=>f!==folder);for(const b of model.bookmarks)if(b.folder===folder)b.folder='';publish();return snapshot()}
  if(method==='import'){
   const chosen=await dialog.showOpenDialog(window(),{title:'导入收藏',properties:['openFile'],filters:[{name:'浏览器收藏',extensions:['html','htm','json']}]});if(chosen.canceled||!chosen.filePaths[0])return {imported:0}
   const raw=readFileSync(chosen.filePaths[0],'utf8');if(raw.length>5_000_000)throw Error('收藏文件过大。')
   let rows:{title:string;url:string;folder?:string}[]=[]
   if(chosen.filePaths[0].endsWith('.json')){const value=JSON.parse(raw);rows=Array.isArray(value)?value:value.bookmarks;if(!Array.isArray(rows))throw Error('收藏格式无效。')}
   else{const $=load(raw);$('a[href]').each((_i,el)=>{rows.push({title:$(el).text(),url:$(el).attr('href')!})})}
   let imported=0;for(const row of rows.slice(0,5000)){try{const url=browserAddress(row.url);if(model.bookmarks.some(b=>b.url===url))continue;model.bookmarks.push({id:randomUUID(),url,title:inputString(row.title).trim()||new URL(url).hostname,folder:'',at:Date.now()});imported++}catch{}}
   publish();return {imported}
  }
  if(method==='settings'){
   if(['Google','Bing','百度'].includes(input.engine))model.settings.engine=input.engine
   if(['restore','new'].includes(input.startup))model.settings.startup=input.startup
   for(const key of ['bookmarksBar','askDownload'] as const)if(typeof input[key]==='boolean')model.settings[key]=input[key]
   if(input.chooseDirectory){const result=await dialog.showOpenDialog(window(),{properties:['openDirectory','createDirectory'],title:'选择下载位置'});if(!result.canceled)model.settings.downloadPath=result.filePaths[0]??''}
   publish();return snapshot()
  }
  if(method==='clear'){
   if(!['hour','day','week','all'].includes(input.range))throw Error('请选择时间范围。')
   const since=input.range==='all'?0:Date.now()-({hour:3600000,day:86400000,week:604800000}[input.range as 'hour']??0)
   const origins=[...new Set(model.history.filter(h=>h.at>=since).map(h=>new URL(h.url).origin))]
   const s=session.fromPartition('persist:odyssey-browser-app')
   if(input.cookies){const storages:('cookies'|'localstorage'|'indexdb'|'serviceworkers'|'cachestorage')[]=['cookies','localstorage','indexdb','serviceworkers','cachestorage'];if(since){for(const origin of origins)await s.clearStorageData({origin,storages})}else await s.clearStorageData({storages})}
   if(input.cache)await s.clearCache()
   if(input.history)model.clearHistory(since)
   publish();return snapshot()
  }
  if(method==='download'){
   if(input.action==='directory'){await shell.openPath(model.settings.downloadPath||app.getPath('downloads'));return true}
   const row=downloads.find(d=>d.id===input.id),item=items.get(input.id);if(!row)throw Error('下载记录已不存在。')
   if(input.action==='pause'&&row.state==='progressing'&&item){item.pause();row.state='paused'}
   else if(input.action==='resume'&&item?.canResume()){item.resume();row.state='progressing'}
   else if(input.action==='cancel'&&item){item.cancel();row.state='cancelled'}
   else if(input.action==='retry'){
    const url=retryDownloadAddress(row.url),isPrivate=row.private===true,tab=model.tabs.find(t=>t.id===row.tabId&&t.private===isPrivate&&!t.page),source=tab?live.get(tab.id)?.view.webContents:undefined
    // Retrying a saved download must not depend on an open webpage or select a tab.
    const wc=source&&!source.isDestroyed()&&/^https?:\/\//i.test(source.getURL())?source:downloadOwner(isPrivate).view.webContents;wc.downloadURL(url)
   }
   else if(input.action==='reveal'&&row.path)shell.showItemInFolder(row.path)
   else if(input.action==='open'&&row.state==='completed')await shell.openPath(row.path)
   else if(input.action==='material'&&row.state==='completed'){const id=inputString(input.sessionId,256);if(!id)throw Error('请先打开工作区会话。');const directory=await options.materialDirectory(id);mkdirSync(directory,{recursive:true});const target=join(directory,Date.now()+'-'+basename(row.name));copyFileSync(row.path,target);return {path:target}}
   else if(input.action==='remove'&&['completed','cancelled','interrupted'].includes(row.state)){downloads.splice(downloads.indexOf(row),1);items.delete(row.id)}
   publish();return snapshot()
  }
  const tab=model.tab(input.id??model.activeId)
  if(method==='capture'){if(input.purpose==='overlay')throw Error('界面菜单不使用网页截图。');const wc=live.get(tab.id)?.view.webContents;if(!wc||wc.isDestroyed())return '';const bitmap=await wc.capturePage();if(bitmap.isEmpty())return '';const image=bitmap.resize({width:Math.min(1600,bitmap.getSize().width)});return image.toDataURL()}
  if(method==='navigate'){void navigate(tab,browserAddress(input.url,model.settings.engine));return snapshot()}
  if(method==='home'){
   cancelRegion();translation.cancel(tab.id,{discard:true});contextScope=undefined;
   if(!tab.page&&!tab.url&&!tab.loading&&!tab.error)return snapshot()
   appEpoch++;ownerEpoch++;pageAgent.invalidate();pageEdited=false
   const e=live.get(tab.id),epoch=e?++e.epoch:0;clearTimeout(e?.timeout)
   Object.assign(tab,{page:undefined,url:'',title:'新标签页',favicon:undefined,error:undefined,find:undefined,loading:false,canBack:false,canForward:false});sync();publish()
   if(e&&!e.view.webContents.isDestroyed()){
    const wc=e.view.webContents;wc.stop();try{await wc.loadURL('about:blank')}catch{}
    if(e.epoch===epoch&&!wc.isDestroyed()){tab.loading=false;tab.canBack=wc.navigationHistory.canGoBack();tab.canForward=wc.navigationHistory.canGoForward();sync();publish()}
   }
   return snapshot()
  }
  if(method==='duplicate'){const next=model.newTab(tab.private,tab.page);if(tab.url)void navigate(next,tab.url);if(next.page)finder?.hide();sync();publish();return snapshot()}
  if(method==='pin'){tab.pinned=!tab.pinned;model.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));publish();return snapshot()}
  if(method==='mute'){tab.muted=!tab.muted;live.get(tab.id)?.view.webContents.setAudioMuted(tab.muted);publish();return snapshot()}
  if(method==='close-others'){for(const t of [...model.tabs])if(t.id!==tab.id)close(t.id);return snapshot()}
  if(method==='external'){await shell.openExternal(browserAddress(tab.url));return true}
  if(method==='copy'){clipboard.writeText(browserAddress(tab.url));return true}
  if(method==='material'){
   const sessionId=inputString(input.sessionId,256);if(!sessionId)throw Error('请先打开一个工作区会话。')
   const directory=await options.materialDirectory(sessionId);mkdirSync(directory,{recursive:true});const target=join(directory,'网页来源-'+Date.now()+'-'+randomUUID().slice(0,6)+'.md');const source={title:tab.title,url:browserAddress(tab.url),at:Date.now()};writeFileSync(target,`# ${source.title.replace(/[\r\n]/g,' ')}\n\n来源：${source.url}\n\n访问时间：${new Date(source.at).toISOString()}\n`,{mode:0o600});return {path:target,source}
  }
  if(method==='back'||method==='forward'){
   cancelRegion();translation.cancel(tab.id);contextScope=undefined;
   const e=live.get(tab.id),wc=e?.view.webContents
   if(wc&&!wc.isDestroyed()){
    tab.canBack=wc.navigationHistory.canGoBack();tab.canForward=wc.navigationHistory.canGoForward()
    if(method==='back'?tab.canBack:tab.canForward){appEpoch++;ownerEpoch++;pageAgent.invalidate();pageEdited=false;e!.epoch++;clearTimeout(e!.timeout);tab.error=undefined;if(method==='back')wc.navigationHistory.goBack();else wc.navigationHistory.goForward()}
   }else{tab.canBack=false;tab.canForward=false}
   sync();publish();return snapshot()
  }
  if(!tab.url)throw Error('请先打开网页。')
  const e=ensure(tab),wc=e.view.webContents
  if(method==='reload'){cancelRegion();translation.cancel(tab.id,{discard:true});tab.error=undefined;void navigate(tab,tab.url)}
  else if(method==='stop'){e.epoch++;clearTimeout(e.timeout);wc.stop();tab.loading=false}
  else if(method==='zoom'){cancelRegion();if(!Number.isFinite(input.value))throw Error('缩放比例无效。');tab.zoom=Math.max(.25,Math.min(3,input.value));wc.setZoomFactor(tab.zoom);await Promise.race([wc.executeJavaScriptInIsolatedWorld(1007,[{code:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'}]).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,120))])}
  else if(method==='find'){const text=inputString(input.text,500);if(text)e.findRequestId=wc.findInPage(text,{forward:input.forward!==false,findNext:input.next!==true});else{e.findRequestId=undefined;wc.stopFindInPage('clearSelection');tab.find=undefined}}
  else if(method==='site-data')return {cookies:(await sessionFor(tab).cookies.get({url:new URL(tab.url).origin})).length}
  else if(method==='site-clear'){await sessionFor(tab).clearStorageData({origin:new URL(tab.url).origin});publish();return true}
  else if(method==='site')return {origin:new URL(tab.url).origin,secure:tab.url.startsWith('https:'),permissions:permissions.get(permissionKey(tab,new URL(tab.url).origin))||{}}
  else if(method==='permission'){
   if(!['geolocation','camera','microphone','downloads','popups','media','notifications','fullscreen'].includes(input.permission)||!['block','allow','ask'].includes(input.value)||(['downloads','popups'].includes(input.permission)&&input.value==='ask'))throw Error('权限设置无效。')
   const origin=new URL(tab.url).origin;const key=permissionKey(tab,origin);permissions.set(key,{...permissions.get(key),[input.permission]:input.value});publish();return true
  }
  else if(method==='save'){
   const result=await dialog.showSaveDialog(window(),{title:'另存网页',defaultPath:join(app.getPath('downloads'),'网页.html'),filters:[{name:'网页',extensions:['html']}]});if(!result.canceled&&result.filePath){if(input.contextToken!==undefined)checkContext(input.contextToken);await wc.savePage(result.filePath,'HTMLComplete');return {saved:true,path:result.filePath}}return {saved:false}
  }
  else if(method==='pdf'){
   const result=await dialog.showSaveDialog(window(),{title:'保存 PDF',defaultPath:join(app.getPath('downloads'),'网页.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled||!result.filePath)return {saved:false}
   const bytes=await wc.printToPDF({landscape:input.landscape===true,pageSize:input.paper==='Letter'?'Letter':'A4',printBackground:true,scale:Math.max(.1,Math.min(2,Number(input.scale)||1)),pageRanges:typeof input.pages==='string'?input.pages:'',margins:input.margins==='none'?{top:0,bottom:0,left:0,right:0}:undefined});writeFileSync(result.filePath,bytes);return {saved:true,path:result.filePath}
  }
  else if(method==='print'){await new Promise<void>((resolve,reject)=>wc.print({silent:false,landscape:input.landscape===true,printBackground:true},(success,error)=>success?resolve():reject(Error(error||'打印已取消。'))));return true}
  else throw Error('不支持的浏览器操作。')
  sync();publish();return snapshot()
 }
 const detachWindow=()=>{attachedKeyContents?.removeListener('before-input-event',routeMenuKey);attachedKeyContents?.removeListener('before-mouse-event',routeRegionPointer);attachedKeyContents=undefined;imageDownloads.clear();cancelRegion();for(const tab of model.tabs)translation.cancel(tab.id,{discard:true});hideMenu();corners.dispose();appEpoch++;ownerEpoch++;pageAgent.invalidate();appActive=false;ownerSessionId='';finder?.hide();visible=false;rect=undefined;closeDownloadOwners();for(const e of live.values()){e.epoch++;clearTimeout(e.timeout);if(!e.view.webContents.isDestroyed())e.view.webContents.close()}live.clear();for(const t of [...model.tabs]){t.loading=false;t.canBack=false;t.canForward=false;if(t.private)model.close(t.id)}if(privateSession){const old=privateSession;privateSession=undefined;sessions.delete(old);void old.clearStorageData().catch(()=>{})}for(const row of [...downloads])if(row.private){items.get(row.id)?.cancel();items.delete(row.id);downloads.splice(downloads.indexOf(row),1)}persist()}
 registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,method:string,input:any)=>request(method,input))
 const dispose=()=>{if(disposed)return;persist();attachedKeyContents?.removeListener('before-input-event',routeMenuKey);attachedKeyContents?.removeListener('before-mouse-event',routeRegionPointer);attachedKeyContents=undefined;imageDownloads.clear();cancelRegion();region.dispose();translation.dispose();pageAgent.dispose();finder?.dispose();menu.dispose();corners.dispose();disposed=true;clearTimeout(persistTimer);clearTimeout(downloadPublishTimer);closeDownloadOwners();for(const e of live.values()){clearTimeout(e.timeout);if(!e.view.webContents.isDestroyed())e.view.webContents.close()}live.clear();options.ipcMain.removeHandler(channel)}
 window();app.once('before-quit',dispose)
 const agent=async(input:any,signal?:AbortSignal)=>{
  const sessionId=input?.sessionId;if(!appActive||!ownerSessionId||sessionId!==ownerSessionId)throw Error('当前浏览器不属于此对话，请重新打开当前对话后再操作。');if(signal?.aborted)throw Error('网页操作已取消。');
  if(['close','reload'].includes(input.op)){
   const tab=current(),entry=live.get(tab.id),url=entry&&!entry.view.webContents.isDestroyed()?entry.view.webContents.getURL():tab.url
   if(typeof input.tabId!=='string'||input.tabId!==tab.id||typeof input.url!=='string'||input.url!==url)throw Error('当前页签或网址已变化，恢复操作已拒绝。')
   pageAgent.invalidate()
   if(input.op==='close'){await request('close',{id:tab.id});return {closed:true,closedTabId:tab.id}}
   await request('reload',{id:tab.id});return {reloading:true,tabId:tab.id,url}
  }
  if(input.op==='open'){
   const tab=current(),epoch=(live.get(tab.id)?.epoch??0)+1,owner=ownerEpoch;await navigate(tab,browserAddress(input.url))
   const check=()=>{if(current().id!==tab.id||live.get(tab.id)?.epoch!==epoch||!appActive||ownerEpoch!==owner||ownerSessionId!==sessionId)throw Error('当前网页已变化，请重新观察。')};check()
   // Chromium can resolve loadURL just before its loading flag clears.
   const wc=live.get(tab.id)!.view.webContents;if(wc.isLoadingMainFrame())await new Promise<void>(resolve=>{const ready=()=>{clearTimeout(timer);wc.removeListener('did-stop-loading',ready);resolve()};const timer=setTimeout(ready,1000);wc.once('did-stop-loading',ready);if(!wc.isLoadingMainFrame())ready()})
   check();return pageAgent.run({op:'observe'},signal,authority())
  }
  const authorize=authority();authorize();const result=await pageAgent.run(input,signal,authorize);authorize();pageEdited=result.observation.canUndo;publish();return result
 }
 return {request,snapshot,dispose,agent,isActive:()=>appActive,ownsSession:(id:unknown)=>appActive&&typeof id==='string'&&!!id&&id===ownerSessionId}
}
