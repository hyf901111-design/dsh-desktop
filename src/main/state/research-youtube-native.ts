import {app,type BrowserWindow,type IpcMain} from 'electron'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {registerTrustedMainWindowHandler} from '../ipc-trust'
import type {ResearchLinkFrameRegistry} from './research-link-frame'

export type YoutubeNativeDriver={
 mount(handle:Buffer,id:string,url:string,referer:string):void
 place(id:string,x:number,y:number,width:number,height:number,visible:boolean):void
 state(id:string):{loading:boolean;error:string;image:string;imageRevision:number;loginStatus:string}
 login(id:string):void;reload(id:string):void;release(id:string):void
}
function identity(value:any){
 if(!value||![value.sessionId,value.nodeId].every(v=>typeof v==='string'&&v.length>0&&v.length<=256))throw Error('Invalid YouTube identity')
 return JSON.stringify([value.sessionId,value.nodeId])
}
function officialPlayer(value:unknown):value is string{
 if(typeof value!=='string'||value.length>8192)return false
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='www.youtube.com'&&!url.username&&!url.password&&!url.port&&/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)}catch{return false}
}
export function youtubeNativeBounds(value:any,zoom:number){
 if(!Number.isFinite(zoom)||zoom<=0||zoom>5||!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k])&&Math.abs(value[k])<=30000)||value.width<=0||value.height<=0)throw Error('Invalid YouTube bounds')
 return {x:Math.round(value.x*zoom),y:Math.round(value.y*zoom),width:Math.max(1,Math.min(4096,Math.round(value.width*zoom))),height:Math.max(1,Math.min(4096,Math.round(value.height*zoom)))}
}
export function registerResearchYoutubeNative(options:{ipcMain:IpcMain;getMainWindow():BrowserWindow|undefined;registry:ResearchLinkFrameRegistry;driver?:YoutubeNativeDriver;platform?:string;appId?:string}){
 let driver=options.driver,failed=false,hooked:BrowserWindow|undefined
 const entries=new Map<string,{url:string;reloadToken:number}>()
 const native=()=>{
  if((options.platform??process.platform)!=='darwin'||failed)return undefined
  if(!driver)try{driver=createRequire(import.meta.url)(join(app.isPackaged?process.resourcesPath:join(app.getAppPath(),'build'),'native','youtube-player.node')) as YoutubeNativeDriver}catch{failed=true}
  return driver
 }
 const release=(value:unknown)=>{const id=typeof value==='string'?value:identity(value);if(entries.delete(id))driver?.release(id)}
 const clear=()=>{for(const id of entries.keys())release(id)}
 const window=()=>{
  const win=options.getMainWindow();if(!win||win.isDestroyed())throw Error('Window unavailable')
  if(hooked!==win){hooked=win;win.once('closed',clear);win.webContents.on('did-start-navigation',(_e,_url,inPlace,isMainFrame)=>{if(isMainFrame&&!inPlace)clear()});win.on('resize',()=>{for(const id of entries.keys())driver?.place(id,0,0,1,1,false)})}
  return win
 }
 const authorized=(value:any)=>{const id=identity(value),auth=options.registry.resolve({sessionId:value.sessionId,nodeId:value.nodeId});if(!auth||!officialPlayer(auth.url)||value.url!==undefined&&value.url!==auth.url){release(id);throw Error('YouTube player not authorized')}return {id,url:auth.url}}
 const bind=(name:string,fn:(value:any)=>unknown)=>{options.ipcMain.removeHandler(name);registerTrustedMainWindowHandler(options.ipcMain,name,options.getMainWindow,(_e,value)=>fn(value))}
 bind('research:youtube-native:available',()=>({available:!!native()}))
 bind('research:youtube-native:update',value=>{
  const {id,url}=authorized(value),win=window(),engine=native();if(!engine)throw Error('System YouTube player unavailable')
  const bounds=youtubeNativeBounds(value.bounds,win.webContents.getZoomFactor()),size=win.getContentSize()
  let entry=entries.get(id)
  if(entry&&entry.url!==url){release(id);entry=undefined}
  if(!entry){
   if(entries.size>=16)throw Error('Too many YouTube players')
   const appId=options.appId??(app.isPackaged?'com.evanarts.sherlock':'io.dsh.desktop.dev')
   if(!/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/.test(appId))throw Error('Invalid player app identity')
   engine.mount(win.getNativeWindowHandle(),id,url,'https://'+appId+'/');entry={url,reloadToken:Number(value.reloadToken)||0};entries.set(id,entry)
  }
  if(Number.isSafeInteger(value.reloadToken)&&value.reloadToken>entry.reloadToken){engine.reload(id);entry.reloadToken=value.reloadToken}
  const visible=value.active===true&&bounds.width>=200&&bounds.height>=200&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=(size[0]??0)&&bounds.y+bounds.height<=(size[1]??0)
  engine.place(id,bounds.x,bounds.y,bounds.width,bounds.height,visible)
  return engine.state(id)
 })
 bind('research:youtube-native:login',value=>{const {id}=authorized(value);if(!entries.has(id)||!native())throw Error('YouTube player unavailable');driver!.login(id);return {opened:true}})
 bind('research:youtube-native:hide',value=>{const id=identity(value);if(entries.has(id))driver?.place(id,0,0,1,1,false);return {ok:true}})
 bind('research:youtube-native:release',value=>{release(value);return {ok:true}})
 return {release,clear}
}
