import {ipcMain,WebContentsView,type BrowserWindow} from 'electron'
import {randomUUID} from 'node:crypto'
import type {BrowserRegionOverlayEvent,BrowserRegionQuestion,BrowserRegionRect,BrowserRegionStart} from '../../shared/browser-region'

const channel='browser-app:region-action',stateChannel='browser-app:region-state'
const html='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>询问 EWork</title>'
function finiteRect(value:BrowserRegionRect):boolean{return !!value&&(['x','y','width','height'] as const).every(k=>Number.isFinite(value[k])&&Math.abs(value[k])<=30000)&&value.width>0&&value.height>0}
/** Only controls live here. The original webpage remains the sole page surface. */
export function createBrowserRegionOverlay(preload:string,getWindow:()=>BrowserWindow,onEvent:(event:BrowserRegionOverlayEvent)=>void){
 let view:WebContentsView|undefined,owner:BrowserWindow|undefined,ready=false,disposed=false,epoch=0
 let state:(BrowserRegionStart&Partial<BrowserRegionQuestion>&{mode:'selecting'|'waiting'|'question'})|undefined
 let readyPromise:Promise<boolean>|undefined,resolveReady:((value:boolean)=>void)|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined
 let selected:((rect:BrowserRegionRect|null)=>void)|undefined
 const finish=(rect:BrowserRegionRect|null)=>{const resolve=selected;selected=undefined;resolve?.(rect)}
 const send=()=>{if(ready&&view&&!view.webContents.isDestroyed()&&state)view.webContents.send(stateChannel,state)}
 const cancel=()=>{epoch++;state=undefined;finish(null);if(view&&!view.webContents.isDestroyed()){view.setVisible(false);view.webContents.send(stateChannel,{mode:'closed'})}}
 const dismiss=()=>{const old=state;cancel();if(old)onEvent({kind:'close',operationId:old.operationId})}
 const selectingBlur=()=>{if(state?.mode==='selecting')dismiss()}
 const destroy=()=>{
  cancel();clearTimeout(readyTimer);resolveReady?.(false);resolveReady=undefined;readyPromise=undefined;ready=false
  const old=view;view=undefined
  if(owner){owner.removeListener('closed',destroy);owner.removeListener('hide',dismiss);owner.removeListener('minimize',dismiss);owner.removeListener('blur',selectingBlur);if(!owner.isDestroyed()&&old)owner.contentView.removeChildView(old)}owner=undefined
  if(old&&!old.webContents.isDestroyed())old.webContents.close()
 }
 const warm=()=>{
  if(disposed)return Promise.resolve(false)
  const win=getWindow();if(!win||win.isDestroyed())return Promise.resolve(false)
  if(owner&&owner!==win)destroy()
  if(view&&!view.webContents.isDestroyed())return ready?Promise.resolve(true):readyPromise!
  owner=win;ready=false
  const next=new WebContentsView({webPreferences:{preload,partition:'browser-region-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});view=next
  next.setBackgroundColor('#00000000');next.setVisible(false);win.contentView.addChildView(next)
  win.once('closed',destroy);win.on('hide',dismiss);win.on('minimize',dismiss);win.on('blur',selectingBlur)
  const wc=next.webContents;wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false)
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());wc.on('will-redirect',event=>event.preventDefault());wc.on('blur',selectingBlur)
  wc.once('destroyed',()=>{if(view===next){const old=state;destroy();if(old)onEvent({kind:'close',operationId:old.operationId})}})
  wc.once('render-process-gone',()=>{if(view===next){const old=state;destroy();if(old)onEvent({kind:'close',operationId:old.operationId})}})
  readyPromise=new Promise(resolve=>{resolveReady=resolve;readyTimer=setTimeout(()=>{if(view===next)destroy()},5000)})
  void wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)).catch(()=>{if(view===next)destroy()})
  return readyPromise
 }
 const receive=(event:Electron.IpcMainEvent,value:any)=>{
  if(!view||view.webContents.isDestroyed()||event.sender!==view.webContents||event.senderFrame!==view.webContents.mainFrame)return
  if(value?.kind==='ready'){ready=true;clearTimeout(readyTimer);resolveReady?.(true);resolveReady=undefined;return}
  if(!state||!value||value.operationId!==state.operationId)return
  if(value.kind==='selection'){
   const r=value.rect as BrowserRegionRect
   if(state.mode!=='selecting'||!finiteRect(r)||r.x<0||r.y<0||r.width<4||r.height<4||r.x+r.width>state.bounds.width+.01||r.y+r.height>state.bounds.height+.01)return
   const rect={x:r.x,y:r.y,width:r.width,height:r.height};state={...state,mode:'waiting',rect};send();finish(rect);onEvent({kind:'selection',operationId:state.operationId,rect});return
  }
  if(['close','delete','send','undo','redo'].includes(value.kind)){
   if(value.kind!=='close'&&state.mode!=='question')return
   const operationId=state.operationId
   if(value.kind==='close'){cancel();onEvent({kind:'close',operationId})}
   else if(!state.busy)onEvent({kind:value.kind as 'send'|'delete'|'undo'|'redo',operationId})
   return
  }
  if(value.kind==='draft'&&state.mode==='question'&&!state.busy&&typeof value.draft==='string'&&value.draft.length<=1000000&&[value.draftRev,value.sequence,value.syncVersion].every(n=>Number.isSafeInteger(n)&&n>=0))onEvent({kind:'draft',operationId:state.operationId,draft:value.draft,draftRev:value.draftRev,sequence:value.sequence,syncVersion:value.syncVersion})
 }
 ipcMain.on(channel,receive)
 return{
  start(input:BrowserRegionStart):Promise<BrowserRegionRect|null>{
   if(!input||typeof input.operationId!=='string'||!input.operationId||input.operationId.length>256||!finiteRect(input.bounds)||input.bounds.width<4||input.bounds.height<4)throw Error('网页框选位置无效。')
   cancel();const token=epoch;state={...input,bounds:{...input.bounds},mode:'selecting'}
   return new Promise(resolve=>{selected=resolve;void warm().then(ok=>{if(token!==epoch)return;if(!ok||!view||!owner){cancel();return}view.setBounds({x:Math.round(input.bounds.x),y:Math.round(input.bounds.y),width:Math.round(input.bounds.width),height:Math.round(input.bounds.height)});view.webContents.setZoomFactor(1);owner.contentView.addChildView(view);view.setVisible(true);send();view.webContents.focus()})})
  },
  showQuestion(input:BrowserRegionQuestion){
   if(!state||state.operationId!==input.operationId||!finiteRect(input.rect))return
   state={...state,...input,mode:'question'};send()
  },
  updateQuestion(input:Partial<BrowserRegionQuestion>&{operationId:string}){
   if(!state||state.operationId!==input.operationId||state.mode!=='question')return
   if(input.ownerSessionId===state.ownerSessionId&&input.draftRev!==undefined&&state.draftRev!==undefined&&input.draftRev<state.draftRev)return
   state={...state,...input};if(input.sent){cancel();return}send()
  },
  cancel,
  raise(){if(state&&view&&!view.webContents.isDestroyed()&&owner&&!owner.isDestroyed())owner.contentView.addChildView(view)},
  dispose(){if(disposed)return;disposed=true;destroy();ipcMain.removeListener(channel,receive)}
 }
}
