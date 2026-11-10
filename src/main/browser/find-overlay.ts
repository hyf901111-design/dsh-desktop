import {ipcMain,WebContentsView,type BrowserWindow} from 'electron'
import type {BrowserTab} from '../../shared/browser-app'

// A trusted sibling view paints above the webpage without replacing it with a bitmap.
export function createBrowserFindOverlay(preload:string,getWindow:()=>BrowserWindow,onAction:(value:any)=>void){
 let view:WebContentsView|undefined,owner:BrowserWindow|undefined,state:any,shown=false,ready=false
 const channel='browser-app:find-action'
 const receive=(event:Electron.IpcMainEvent,value:any)=>{
  if(!view||view.webContents.isDestroyed()||event.sender!==view.webContents||event.senderFrame!==view.webContents.mainFrame)return
  if(value?.kind==='ready'){ready=true;if(shown){send();view.webContents.focus();view.webContents.send('browser-app:find-focus')}return}
  if(!shown)return
  if(!['input','next','close','shortcut'].includes(value?.kind))return
  if(value.kind==='input'||value.kind==='next'){if(typeof value.text!=='string'||value.text.length>500)return;state.text=value.text}
  onAction(value)
 }
 ipcMain.on(channel,receive)
 const send=()=>{if(ready&&view&&!view.webContents.isDestroyed()){view.webContents.send('browser-app:find-state',state);if(state)state.reset=false}}
 const hide=()=>{shown=false;if(view&&!view.webContents.isDestroyed())view.setVisible(false)}
 return {
  layout(bounds:{x:number;y:number;width:number;height:number}|undefined,input:any,tab:BrowserTab){
   if(!bounds){hide();return}
   const win=getWindow();if(owner&&owner!==win){if(view&&!view.webContents.isDestroyed())view.webContents.close();view=undefined;ready=false}
   if(!view||view.webContents.isDestroyed()){
    ready=false;owner=win;view=new WebContentsView({webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});view.setBackgroundColor('#00000000');win.contentView.addChildView(view);view.setVisible(false)
    view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',event=>event.preventDefault())
    void view.webContents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><title>Browser find overlay</title>'))
   }
   const opening=!shown||state?.tabId!==tab.id,focus=opening||state?.focusToken!==input.focusToken
   state={private:tab.private,focusToken:input.focusToken,reset:opening,tabId:tab.id,text:state&&state.private!==tab.private?'':state?.text||input.text||'',dark:input.dark===true,icons:input.icons,find:tab.find}
   if(opening){win.contentView.removeChildView(view);win.contentView.addChildView(view)}
   shown=true;view.webContents.setZoomFactor(input.zoom||1);view.setBounds(bounds);view.setVisible(true);if(opening)onAction({kind:'input',text:state.text});send()
   if(focus&&ready){view.webContents.focus();view.webContents.send('browser-app:find-focus')}
  },
  update(tab:BrowserTab){if(shown&&state?.tabId===tab.id){state.find=tab.find;send()}},
  raise(){if(shown&&view&&!view.webContents.isDestroyed()&&owner&&!owner.isDestroyed())owner.contentView.addChildView(view)},
  hide,
  dispose(){hide();ipcMain.removeListener(channel,receive);if(view&&!view.webContents.isDestroyed())view.webContents.close();view=undefined;owner=undefined;ready=false}
 }
}
