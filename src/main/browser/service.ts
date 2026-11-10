import {createBrowserPageAgent} from './page-agent'
import {trackBrowserFavicon} from './favicon'
import {createBrowserCorners} from './corners'
import {app,clipboard,dialog,safeStorage,session,shell,WebContentsView,type BrowserWindow,type IpcMain,type DownloadItem,type Session} from 'electron'
import {mkdirSync,readFileSync,renameSync,writeFileSync,existsSync,copyFileSync} from 'node:fs'
import {join,basename} from 'node:path'
import {randomUUID} from 'node:crypto'
import {load} from 'cheerio'
import {createBrowserFindOverlay} from './find-overlay'
import {registerTrustedMainWindowHandler} from '../ipc-trust'
import {BrowserModel,browserAddress,browserDownloadAddress,availableDownloadPath} from './model'
import type {BrowserSnapshot,BrowserDownload,BrowserTab} from '../../shared/browser-app'

const channel='browser-app:request',eventChannel='browser-app:state'
type Options={ipcMain:IpcMain;getMainWindow():BrowserWindow|undefined;root:string;materialDirectory(sessionId:string):Promise<string>;findPreload?:string}
type Live={view:WebContentsView;awake?:boolean;epoch:number;findRequestId?:number;timeout?:ReturnType<typeof setTimeout>}
export function registerBrowserApp(options:Options){
 const path=join(options.root,'browser-state.bin')
 let saved:any,storageWarning:string|undefined
 try{if(existsSync(path))saved=JSON.parse(safeStorage.decryptString(readFileSync(path)))}catch{storageWarning='上次浏览状态未能读取，原文件已保留。'}
 const model=new BrowserModel(saved),live=new Map<string,Live>(),downloads:BrowserDownload[]=Array.isArray(saved?.downloads)?saved.downloads.filter((d:any)=>d&&typeof d.id==='string'&&typeof d.path==='string'&&typeof d.url==='string'&&typeof d.name==='string'&&d.private!==true&&['completed','interrupted','cancelled'].includes(d.state)).slice(0,100):[],items=new Map<string,DownloadItem>(),sessions=new Set<Session>(),permissions=new Map<string,Record<string,string>>((Array.isArray(saved?.permissions)?saved.permissions:[]).filter((row:any)=>Array.isArray(row)&&typeof row[0]==='string'&&/^normal:https?:\/\//.test(row[0])&&row[1]&&typeof row[1]==='object'))
 let appActive=false,ownerSessionId='',pageEdited=false,appEpoch=0,ownerEpoch=0;let privateSession:Session|undefined,visible=false,disposed=false,persistTimer:ReturnType<typeof setTimeout>|undefined,downloadPublishTimer:ReturnType<typeof setTimeout>|undefined,rect:{x:number;y:number;width:number;height:number}|undefined
 let attachedWindow:BrowserWindow|undefined
 const window=()=>{const win=options.getMainWindow();if(!win||win.isDestroyed())throw Error('客户端窗口不可用。');if(attachedWindow!==win){attachedWindow=win;win.once('closed',detachWindow)}return win}
 const permissionKey=(tab:BrowserTab,origin:string)=>(tab.private?'private:':'normal:')+origin
 const activePermissions=()=>{try{const tab=model.tab(model.activeId);return permissions.get(permissionKey(tab,new URL(tab.url).origin))??{}}catch{return {}}}
 const findPreload=options.findPreload||join(__dirname,'../preload/browser-find.cjs'),nativeFind=existsSync(findPreload)
 const finder=nativeFind?createBrowserFindOverlay(findPreload,window,value=>{const tab=current();if(value.kind==='close'){finder?.hide();live.get(tab.id)?.view.webContents.focus();window().webContents.send('browser-app:shortcut',{key:'Escape'});void request('find',{id:tab.id,text:''}).catch(()=>{})}else if(value.kind==='shortcut'){window().webContents.send('browser-app:shortcut',value)}else void request('find',{id:tab.id,text:value.text,next:value.kind==='next',forward:value.forward}).catch(()=>{})}):undefined
 const snapshot=():BrowserSnapshot=>({nativeFind,pageEdited,sitePermissions:activePermissions(),tabs:model.tabs,activeId:model.activeId,history:model.history,bookmarks:model.bookmarks,closed:model.closed,folders:model.folders,downloads,settings:model.settings,...(storageWarning?{storageWarning}:{})})
 const pageAgent=createBrowserPageAgent(()=>{const tab=current(),entry=live.get(tab.id);if(!appActive||!entry||entry.view.webContents.isDestroyed()||!tab.url||tab.error)return undefined;return {tabId:tab.id,url:entry.view.webContents.getURL(),title:entry.view.webContents.getTitle()||tab.title,webContents:entry.view.webContents}})
 const authority=(documentBound=false)=>{const epoch=documentBound?appEpoch:ownerEpoch,owner=ownerSessionId,tabId=current().id;return()=>{if(!appActive||(documentBound?appEpoch:ownerEpoch)!==epoch||ownerSessionId!==owner||current().id!==tabId)throw Error('当前页签或会话已变化，旧请求已拒绝。')}}
 const persist=()=>{
  try{if(!safeStorage.isEncryptionAvailable()){storageWarning='系统加密不可用，本次浏览记录仅保留在内存。';return}mkdirSync(options.root,{recursive:true});const temp=path+'.tmp';writeFileSync(temp,safeStorage.encryptString(JSON.stringify({...model.serialize(),permissions:[...permissions].filter(([key])=>key.startsWith('normal:')),downloads:downloads.filter(d=>!d.private).map(d=>({...d,state:['progressing','paused'].includes(d.state)?'interrupted':d.state}))})),{mode:0o600});renameSync(temp,path)}catch{storageWarning='浏览状态暂时无法保存，请检查磁盘空间。'}
 }
 const publish=()=>{if(disposed)return;finder?.update(current());const win=options.getMainWindow();if(win&&!win.isDestroyed())win.webContents.send(eventChannel,snapshot());clearTimeout(persistTimer);persistTimer=setTimeout(persist,300)}
 const publishDownload=()=>{if(downloadPublishTimer)return;downloadPublishTimer=setTimeout(()=>{downloadPublishTimer=undefined;publish()},100)}
 const current=()=>model.tab(model.activeId)
 const corners=createBrowserCorners(window);let cornerColor=[17,17,17]
 const sync=()=>{let shown=false;for(const [id,e]of live){const show=visible&&id===model.activeId&&!model.tab(id).error,awake=appActive&&id===model.activeId&&!model.tab(id).error;if(e.awake!==awake){e.view.webContents.setBackgroundThrottling(!awake);e.awake=awake}if(show&&rect){e.view.setBounds(rect);shown=true}e.view.setVisible(show&&!!rect)}corners.layout(rect,shown,cornerColor,shown?window().webContents.getZoomFactor():1);finder?.raise()}
 const sessionFor=(tab:BrowserTab)=>{
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
   const tabId=[...live].find(([,e])=>e.view.webContents===wc)?.[0]
   if(!tabId){event.preventDefault();return}
   try{if(policy(new URL(wc.getURL()).origin,'downloads')==='block')throw Error('站点下载已阻止');browserDownloadAddress(item.getURL(),wc.getURL())}catch{event.preventDefault();return}
   // Native save dialogs remain the authority for overwrite confirmation.
   let target='';if(!model.settings.askDownload){const directory=model.settings.downloadPath||app.getPath('downloads');target=availableDownloadPath(directory,item.getFilename(),new Set(downloads.filter(d=>['progressing','paused'].includes(d.state)).map(d=>d.path)),existsSync);item.setSavePath(target)}
   const row:BrowserDownload={id:randomUUID(),tabId,private:model.tab(tabId).private,url:item.getURL(),name:item.getFilename(),path:target,received:0,total:item.getTotalBytes(),state:'progressing'}
   downloads.unshift(row);items.set(row.id,item)
   const update=()=>{row.received=item.getReceivedBytes();row.total=item.getTotalBytes();row.path=item.getSavePath()||row.path;row.state=item.isPaused()?'paused':item.getState();publishDownload()}
   item.on('updated',update);item.once('done',(_event,state)=>{row.state=state;row.path=item.getSavePath()||row.path;row.received=item.getReceivedBytes();publish()});publish()
  })
  return s
 }
 const ensure=(tab:BrowserTab)=>{
  const found=live.get(tab.id);if(found)return found
  const view=new WebContentsView({webPreferences:{session:sessionFor(tab),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}})
  const e:Live={view,epoch:0};live.set(tab.id,e);window().contentView.addChildView(view);view.setVisible(false)
  const wc=view.webContents;wc.setAudioMuted(tab.muted);wc.setZoomFactor(tab.zoom)
  trackBrowserFavicon(wc,favicon=>{if(disposed||live.get(tab.id)!==e||tab.favicon===favicon)return;tab.favicon=favicon;publish()})
  const valid=(event:{preventDefault():void},url:string)=>{try{browserAddress(url)}catch{event.preventDefault()}}
  wc.on('will-navigate',valid);wc.on('will-redirect',valid)
  let popupGestureAt=0
  wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown')popupGestureAt=Date.now()})
  wc.on('before-input-event',(_event,input)=>{if(input.type==='keyDown')popupGestureAt=Date.now()})
  wc.setWindowOpenHandler(({url})=>{try{const origin=new URL(wc.getURL()).origin,gesture=Date.now()-popupGestureAt<1000;popupGestureAt=0;if(!gesture&&permissions.get(permissionKey(tab,origin))?.popups!=='allow')return {action:'deny'};const target=browserAddress(url);const next=model.newTab(tab.private);void navigate(next,target);publish()}catch{}return {action:'deny'}})
  wc.on('did-start-loading',()=>{if(model.activeId===tab.id){appEpoch++;pageEdited=false}tab.loading=true;tab.error=undefined;publish()})
  const refresh=()=>{if(wc.isDestroyed())return;tab.canBack=wc.navigationHistory.canGoBack();tab.canForward=wc.navigationHistory.canGoForward();const url=wc.getURL();if(/^https?:/.test(url)){tab.url=url;tab.title=wc.getTitle()||new URL(url).hostname}publish()}
  wc.on('did-navigate',refresh);wc.on('did-navigate-in-page',refresh);wc.on('page-title-updated',refresh)
  wc.on('did-finish-load',()=>{if(wc.getURL().startsWith('about:'))return;tab.loading=false;tab.error=undefined;clearTimeout(e.timeout);try{model.visited(tab.id,browserAddress(wc.getURL()),wc.getTitle()||new URL(wc.getURL()).hostname)}catch{}refresh();sync()})
  wc.on('did-stop-loading',()=>{tab.loading=false;publish()})
  wc.on('did-fail-load',(_ev,code,description,url,isMain)=>{if(!isMain||code===-3)return;clearTimeout(e.timeout);tab.loading=false;tab.error=description||'网页加载失败';if(url)tab.url=url;sync();publish()})
  wc.on('render-process-gone',()=>{tab.loading=false;tab.error='网页进程已退出，请重新加载。';sync();publish()})
  wc.on('found-in-page',(_ev,result)=>{if(result.requestId!==e.findRequestId)return;tab.find={activeMatchOrdinal:result.activeMatchOrdinal,matches:result.matches};publish()})
  wc.on('before-input-event',(event,input)=>{if(!(input.meta||input.control)||input.type!=='keyDown')return;if(['l','t','w','r','f','d','p','s','y','n'].includes(input.key.toLowerCase())){event.preventDefault();window().webContents.send('browser-app:shortcut',{key:input.key,metaKey:input.meta,ctrlKey:input.control,shiftKey:input.shift,altKey:input.alt})}})
  return e
 }
 const navigate=async(tab:BrowserTab,url:string)=>{
  const e=ensure(tab),epoch=++e.epoch;clearTimeout(e.timeout);tab.favicon=undefined;tab.url=url;tab.title=new URL(url).hostname;tab.loading=true;tab.error=undefined;sync();publish()
  e.timeout=setTimeout(()=>{if(epoch!==e.epoch)return;tab.error='ERR_CONNECTION_TIMED_OUT';e.view.webContents.stop();tab.loading=false;sync();publish()},45000)
  try{await e.view.webContents.loadURL(url)}catch(error){if(epoch===e.epoch&&(error as any)?.code!=='ERR_ABORTED'){tab.error='暂时无法加载网页';tab.loading=false;sync();publish()}}finally{if(epoch===e.epoch)clearTimeout(e.timeout)}
 }
 const close=(id:string)=>{
  const e=live.get(id);if(e){clearTimeout(e.timeout);e.epoch++;window().contentView.removeChildView(e.view);e.view.webContents.close();live.delete(id)}
  const tab=model.close(id)
  if(tab.private&&!model.tabs.some(t=>t.private)&&privateSession){const old=privateSession;privateSession=undefined;sessions.delete(old);for(const key of permissions.keys())if(key.startsWith('private:'))permissions.delete(key);for(const row of [...downloads])if(row.private){const item=items.get(row.id);if(item&&['progressing','paused'].includes(row.state))item.cancel();items.delete(row.id);downloads.splice(downloads.indexOf(row),1)}void old.clearStorageData().catch(()=>{})}
  sync();publish()
 }
 const inputString=(value:unknown,max=1024)=>{if(typeof value!=='string'||value.length>max)throw Error('参数无效。');return value}
 const request=async(method:string,input:Record<string,any>={})=>{
  if(typeof method!=='string'||!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>32000)throw Error('浏览器参数无效。')
  if(!model.tabs.length)model.newTab()
  if(method==='snapshot')return snapshot()
  if(method==='context'){if(!appActive)return undefined;if(current().url&&current().loading)throw Error('网页正在加载，请稍候再发送。');return pageAgent.context(authority(true))}
  if(method==='undo-page'){const authorize=authority(true);authorize();const source=await pageAgent.context(authorize);if(!source?.canUndo)throw Error('当前网页没有可撤销的修改。');await pageAgent.run({op:'undo',revision:source.revision,tabId:source.tabId,url:source.url},undefined,authorize);authorize();pageEdited=false;publish();return snapshot()}
  if(method==='layout'){
   if(Array.isArray(input.cornerColor)&&input.cornerColor.length===3&&input.cornerColor.every((v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=255))cornerColor=input.cornerColor
   const active=input.active===true,owner=typeof input.sessionId==='string'?input.sessionId:'';if(appActive!==active||ownerSessionId!==owner){appEpoch++;ownerEpoch++;pageAgent.invalidate();const wasEdited=pageEdited;pageEdited=false;if(wasEdited)publish()}appActive=active;ownerSessionId=owner;
   visible=false;const r=input.bounds,win=window(),z=win.webContents.getZoomFactor(),[w,h]=win.getContentSize()
   if(input.visible===true&&r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))){const b={x:Math.round(r.x*z),y:Math.round(r.y*z),width:Math.round(r.width*z),height:Math.round(r.height*z)};if(b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=(w??0)&&b.y+b.height<=(h??0)){rect=b;visible=true}}
   sync();const f=input.find;let findBounds:typeof rect;if(visible&&rect&&f?.bounds&&['x','y','width','height'].every(k=>Number.isFinite(f.bounds[k]))){const b={x:Math.round(f.bounds.x*z),y:Math.round(f.bounds.y*z),width:Math.round(f.bounds.width*z),height:Math.round(f.bounds.height*z)};if(b.x>=rect.x&&b.y>=0&&b.width>0&&b.height>0&&b.width<=468*z+2&&b.height<=60*z+2&&b.x+b.width<=rect.x+rect.width&&b.y+b.height<=rect.y+rect.height)findBounds=b}finder?.layout(findBounds,{...f,zoom:z},current());return true
  }
  if(['new','select','close','restore'].includes(method)){appEpoch++;ownerEpoch++;pageAgent.invalidate();pageEdited=false}
  if(method==='new'){const tab=model.newTab(input.private===true);if(input.url)void navigate(tab,browserAddress(input.url,model.settings.engine));sync();publish();return snapshot()}
  if(method==='select'){model.activeId=model.tab(input.id).id;const tab=current();if(tab.url&&!live.has(tab.id))void navigate(tab,tab.url);sync();publish();return snapshot()}
  if(method==='close'){close(model.tab(input.id).id);return snapshot()}
  if(method==='reorder'){model.reorder(input.id,input.beforeId);sync();publish();return snapshot()}
  if(method==='restore'){const tab=model.restore();if(tab?.url)void navigate(tab,tab.url);sync();publish();return snapshot()}
  if(method==='bookmark'){
   const url=browserAddress(input.url),title=inputString(input.title).trim()||new URL(url).hostname,folder=inputString(input.folder??'',100).trim();const old=model.bookmarks.find(b=>b.url===url)
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
   else if(input.action==='retry'){const tab=model.tabs.find(t=>t.id===row.tabId)??current();ensure(tab).view.webContents.downloadURL(browserDownloadAddress(row.url,ensure(tab).view.webContents.getURL()))}
   else if(input.action==='reveal'&&row.path)shell.showItemInFolder(row.path)
   else if(input.action==='open'&&row.state==='completed')await shell.openPath(row.path)
   else if(input.action==='material'&&row.state==='completed'){const id=inputString(input.sessionId,256);if(!id)throw Error('请先打开工作区会话。');const directory=await options.materialDirectory(id);mkdirSync(directory,{recursive:true});const target=join(directory,Date.now()+'-'+basename(row.name));copyFileSync(row.path,target);return {path:target}}
   else if(input.action==='remove'&&['completed','cancelled','interrupted'].includes(row.state)){downloads.splice(downloads.indexOf(row),1);items.delete(row.id)}
   publish();return snapshot()
  }
  const tab=model.tab(input.id??model.activeId)
  if(method==='capture'){const wc=live.get(tab.id)?.view.webContents;if(!wc||wc.isDestroyed())return '';const bitmap=await wc.capturePage();return bitmap.isEmpty()?'':bitmap.resize({width:Math.min(1600,bitmap.getSize().width)}).toDataURL()}
  if(method==='navigate'){void navigate(tab,browserAddress(input.url,model.settings.engine));return snapshot()}
  if(method==='home'){const e=live.get(tab.id);if(e){e.epoch++;clearTimeout(e.timeout);e.view.webContents.stop();void e.view.webContents.loadURL('about:blank')}Object.assign(tab,{url:'',title:'新标签页',favicon:undefined,error:undefined,loading:false});sync();publish();return snapshot()}
  if(method==='duplicate'){const next=model.newTab(tab.private);if(tab.url)void navigate(next,tab.url);publish();return snapshot()}
  if(method==='pin'){tab.pinned=!tab.pinned;model.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));publish();return snapshot()}
  if(method==='mute'){tab.muted=!tab.muted;live.get(tab.id)?.view.webContents.setAudioMuted(tab.muted);publish();return snapshot()}
  if(method==='close-others'){for(const t of [...model.tabs])if(t.id!==tab.id)close(t.id);return snapshot()}
  if(method==='external'){await shell.openExternal(browserAddress(tab.url));return true}
  if(method==='copy'){clipboard.writeText(browserAddress(tab.url));return true}
  if(method==='material'){
   const sessionId=inputString(input.sessionId,256);if(!sessionId)throw Error('请先打开一个工作区会话。')
   const directory=await options.materialDirectory(sessionId);mkdirSync(directory,{recursive:true});const target=join(directory,'网页来源-'+Date.now()+'-'+randomUUID().slice(0,6)+'.md');const source={title:tab.title,url:browserAddress(tab.url),at:Date.now()};writeFileSync(target,`# ${source.title.replace(/[\r\n]/g,' ')}\n\n来源：${source.url}\n\n访问时间：${new Date(source.at).toISOString()}\n`,{mode:0o600});return {path:target,source}
  }
  if(!tab.url)throw Error('请先打开网页。')
  const e=ensure(tab),wc=e.view.webContents
  if(method==='back'){if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack()}
  else if(method==='forward'){if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward()}
  else if(method==='reload'){tab.error=undefined;void navigate(tab,tab.url)}
  else if(method==='stop'){e.epoch++;clearTimeout(e.timeout);wc.stop();tab.loading=false}
  else if(method==='zoom'){if(!Number.isFinite(input.value))throw Error('缩放比例无效。');tab.zoom=Math.max(.25,Math.min(3,input.value));wc.setZoomFactor(tab.zoom);await Promise.race([wc.executeJavaScriptInIsolatedWorld(1007,[{code:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'}]).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,120))])}
  else if(method==='find'){const text=inputString(input.text,500);if(text)e.findRequestId=wc.findInPage(text,{forward:input.forward!==false,findNext:input.next!==true});else{e.findRequestId=undefined;wc.stopFindInPage('clearSelection');tab.find=undefined}}
  else if(method==='site-data')return {cookies:(await sessionFor(tab).cookies.get({url:new URL(tab.url).origin})).length}
  else if(method==='site-clear'){await sessionFor(tab).clearStorageData({origin:new URL(tab.url).origin});publish();return true}
  else if(method==='site')return {origin:new URL(tab.url).origin,secure:tab.url.startsWith('https:'),permissions:permissions.get(permissionKey(tab,new URL(tab.url).origin))||{}}
  else if(method==='permission'){
   if(!['geolocation','camera','microphone','downloads','popups','media','notifications','fullscreen'].includes(input.permission)||!['block','allow','ask'].includes(input.value)||(['downloads','popups'].includes(input.permission)&&input.value==='ask'))throw Error('权限设置无效。')
   const origin=new URL(tab.url).origin;const key=permissionKey(tab,origin);permissions.set(key,{...permissions.get(key),[input.permission]:input.value});publish();return true
  }
  else if(method==='save'){
   const result=await dialog.showSaveDialog(window(),{title:'另存网页',defaultPath:join(app.getPath('downloads'),'网页.html'),filters:[{name:'网页',extensions:['html']}]});if(!result.canceled&&result.filePath){await wc.savePage(result.filePath,'HTMLComplete');return {saved:true,path:result.filePath}}return {saved:false}
  }
  else if(method==='pdf'){
   const result=await dialog.showSaveDialog(window(),{title:'保存 PDF',defaultPath:join(app.getPath('downloads'),'网页.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled||!result.filePath)return {saved:false}
   const bytes=await wc.printToPDF({landscape:input.landscape===true,pageSize:input.paper==='Letter'?'Letter':'A4',printBackground:true,scale:Math.max(.1,Math.min(2,Number(input.scale)||1)),pageRanges:typeof input.pages==='string'?input.pages:'',margins:input.margins==='none'?{top:0,bottom:0,left:0,right:0}:undefined});writeFileSync(result.filePath,bytes);return {saved:true,path:result.filePath}
  }
  else if(method==='print'){await new Promise<void>((resolve,reject)=>wc.print({silent:false,landscape:input.landscape===true,printBackground:true},(success,error)=>success?resolve():reject(Error(error||'打印已取消。'))));return true}
  else throw Error('不支持的浏览器操作。')
  sync();publish();return snapshot()
 }
 const detachWindow=()=>{corners.dispose();appEpoch++;ownerEpoch++;pageAgent.invalidate();appActive=false;ownerSessionId='';finder?.hide();visible=false;rect=undefined;for(const e of live.values()){e.epoch++;clearTimeout(e.timeout);if(!e.view.webContents.isDestroyed())e.view.webContents.close()}live.clear();for(const t of [...model.tabs]){t.loading=false;t.canBack=false;t.canForward=false;if(t.private)model.close(t.id)}if(privateSession){const old=privateSession;privateSession=undefined;sessions.delete(old);void old.clearStorageData().catch(()=>{})}for(const row of [...downloads])if(row.private){items.get(row.id)?.cancel();items.delete(row.id);downloads.splice(downloads.indexOf(row),1)}persist()}
 registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,method:string,input:any)=>request(method,input))
 const dispose=()=>{if(disposed)return;persist();pageAgent.dispose();finder?.dispose();corners.dispose();disposed=true;clearTimeout(persistTimer);clearTimeout(downloadPublishTimer);for(const e of live.values()){clearTimeout(e.timeout);if(!e.view.webContents.isDestroyed())e.view.webContents.close()}live.clear();options.ipcMain.removeHandler(channel)}
 window();app.once('before-quit',dispose)
 const agent=async(input:any,signal?:AbortSignal)=>{
  const sessionId=input?.sessionId;if(!appActive||!ownerSessionId||sessionId!==ownerSessionId)throw Error('当前浏览器不属于此对话，请重新打开当前对话后再操作。');if(signal?.aborted)throw Error('网页操作已取消。');
  if(input.op==='open'){const tab=current(),entry=ensure(tab),epoch=entry.epoch+1,owner=ownerEpoch;await navigate(tab,browserAddress(input.url));if(current().id!==tab.id||entry.epoch!==epoch||!appActive||ownerEpoch!==owner||ownerSessionId!==sessionId)throw Error('当前网页已变化，请重新观察。');return pageAgent.run({op:'observe'},signal,authority())}
  const authorize=authority();authorize();const result=await pageAgent.run(input.op==='close'?{op:'observe'}:input,signal,authorize);authorize();pageEdited=result.observation.canUndo;publish();return result
 }
 return {request,snapshot,dispose,agent,isActive:()=>appActive,ownsSession:(id:unknown)=>appActive&&typeof id==='string'&&!!id&&id===ownerSessionId}
}
