import {ipcMain,WebContentsView,type BrowserWindow,type Rectangle} from 'electron'
import {randomUUID} from 'node:crypto'

export type BrowserMenuOverlayState={id:string;revision:number;html:string;css?:string;bounds:Rectangle;zoom:number;focusId?:string;selection?:{start:number;end:number;direction?:string};reducedMotion?:boolean}
export type BrowserMenuOverlayAction={id:string;revision:number;kind:'click'|'input'|'change'|'key'|'scroll'|'dismiss'|'pointer';controlId?:string;value?:string;checked?:boolean;key?:string;metaKey?:boolean;ctrlKey?:boolean;shiftKey?:boolean;altKey?:boolean;over?:boolean;scrollTop?:number;scrollLeft?:number;selectionStart?:number;selectionEnd?:number}
const actionChannel='browser-app:menu-action',stateChannel='browser-app:menu-state'
const kinds=new Set(['click','input','change','key','scroll','dismiss','pointer'])
const keys=new Set(['Escape','Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','l','t','w','r','f','d','p','s','y','n'])
function validateState(state:BrowserMenuOverlayState){
 if(!state||typeof state.id!=='string'||!state.id||state.id.length>256||!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.html!=='string'||!state.html||Buffer.byteLength(state.html,'utf8')>4000000||state.css!==undefined&&(typeof state.css!=='string'||Buffer.byteLength(state.css,'utf8')>1000000))throw Error('原生菜单内容无效或过大。')
 const r=state.bounds
 if(!r||!(['x','y','width','height'] as const).every(key=>Number.isFinite(r[key])&&Math.abs(r[key])<=30000)||r.width<=0||r.height<=0||!Number.isFinite(state.zoom)||state.zoom<.1||state.zoom>5)throw Error('原生菜单位置或缩放无效。')
 if(state.focusId!==undefined&&(typeof state.focusId!=='string'||state.focusId.length>256)||state.selection&&(!Number.isSafeInteger(state.selection.start)||!Number.isSafeInteger(state.selection.end)||state.selection.start<0||state.selection.end<state.selection.start||state.selection.end>1000000||state.selection.direction!==undefined&&!['forward','backward','none'].includes(state.selection.direction)))throw Error('原生菜单焦点无效。')
}

/** A small transparent sibling surface; it never captures or hides the webpage. */
export function createBrowserMenuOverlay(preload:string,getWindow:()=>BrowserWindow,onAction:(action:BrowserMenuOverlayAction)=>void){
 let view:WebContentsView|undefined,owner:BrowserWindow|undefined,state:BrowserMenuOverlayState|undefined,shown=false,ready=false,disposed=false,request=0
 let readyPromise:Promise<boolean>|undefined,resolveReady:((value:boolean)=>void)|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined
 let pending:{request:number;resolve:(value:boolean)=>void;timer:ReturnType<typeof setTimeout>}|undefined
 const finish=(value:boolean)=>{if(!pending)return;clearTimeout(pending.timer);const resolve=pending.resolve;pending=undefined;resolve(value)}
 const hide=()=>{request++;shown=false;state=undefined;finish(false);if(view&&!view.webContents.isDestroyed())view.setVisible(false)}
 const retire=()=>{hide();clearTimeout(readyTimer);resolveReady?.(false);resolveReady=undefined;ready=false;readyPromise=undefined;if(owner){owner.removeListener('closed',retire);owner.removeListener('hide',parentHidden);owner.removeListener('minimize',parentHidden)}const previous=view;view=undefined;owner=undefined;if(previous&&!previous.webContents.isDestroyed())previous.webContents.close()}
 const parentHidden=()=>{const previous=state;hide();if(previous)onAction({id:previous.id,revision:previous.revision,kind:'dismiss'})}
 const validSender=(event:Electron.IpcMainEvent)=>!!view&&!view.webContents.isDestroyed()&&event.sender===view.webContents&&event.senderFrame===view.webContents.mainFrame
 const receive=(event:Electron.IpcMainEvent,value:any)=>{
  if(!validSender(event)||!value||typeof value!=='object')return
  if(value.kind==='ready'){ready=true;clearTimeout(readyTimer);resolveReady?.(true);resolveReady=undefined;return}
  if(!shown||!state||value.id!==state.id||value.revision!==state.revision||value._request!==request)return
  if(value.kind==='painted'){
   if(pending?.request!==request||!view?.getVisible())return
   // Focus the native surface, not an input again. A source-key dispatch may
   // have temporarily focused the owner renderer while preserving this caret.
   if(!view.webContents.isFocused())view.webContents.focus()
   finish(true);return
  }
  if(!kinds.has(value.kind)||value.controlId!==undefined&&(typeof value.controlId!=='string'||!value.controlId||value.controlId.length>256))return
  if(['click','input','change','pointer'].includes(value.kind)&&!value.controlId)return
  if(['input','change'].includes(value.kind)&&(value.value!==undefined&&(typeof value.value!=='string'||value.value.length>1000000)||value.checked!==undefined&&typeof value.checked!=='boolean'))return
  if(value.kind==='key'&&(typeof value.key!=='string'||!keys.has(value.key.length===1?value.key.toLowerCase():value.key)))return
  if(value.kind==='pointer'&&typeof value.over!=='boolean')return
  for(const field of ['scrollTop','scrollLeft','selectionStart','selectionEnd'])if(value[field]!==undefined&&(!Number.isFinite(value[field])||value[field]<0||value[field]>10000000))return
  const action:BrowserMenuOverlayAction={id:state.id,revision:state.revision,kind:value.kind}
  for(const field of ['controlId','value','checked','key','over','scrollTop','scrollLeft','selectionStart','selectionEnd'] as const)if(value[field]!==undefined)(action as any)[field]=value[field]
  for(const field of ['metaKey','ctrlKey','shiftKey','altKey'] as const)if(typeof value[field]==='boolean')action[field]=value[field]
  onAction(action)
 }
 ipcMain.on(actionChannel,receive)
 const warm=():Promise<boolean>=>{
  if(disposed)return Promise.resolve(false)
  const win=getWindow();if(!win||win.isDestroyed())return Promise.resolve(false)
  if(owner&&owner!==win)retire()
  if(view&&!view.webContents.isDestroyed())return ready?Promise.resolve(true):readyPromise!
  owner=win;ready=false;shown=false
  view=new WebContentsView({webPreferences:{preload,partition:'browser-menu-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}})
  const current=view,wc=current.webContents
  current.setBackgroundColor('#00000000');current.setVisible(false);win.contentView.addChildView(current)
  wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false)
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());wc.on('will-redirect',event=>event.preventDefault())
  wc.once('destroyed',()=>{if(view===current)retire()});wc.once('render-process-gone',()=>{if(view===current)retire()})
  win.once('closed',retire);win.on('hide',parentHidden);win.on('minimize',parentHidden)
  readyPromise=new Promise(resolve=>{resolveReady=resolve;readyTimer=setTimeout(()=>{if(view===current)retire()},5000)})
  const document='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data: http://127.0.0.1:*; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Browser menu overlay</title>'
  void wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(document)).catch(()=>{if(view===current)retire()})
  return readyPromise
 }
 const show=async(input:BrowserMenuOverlayState):Promise<boolean>=>{
  validateState(input)
  if(disposed)return false
  if(owner&&owner!==getWindow())retire()
  if(state?.id===input.id&&input.revision<state.revision)return false
  const ticket=++request;finish(false)
  // Retain one immutable scope across warm/paint awaits. A hide or a replacement
  // request must never resurrect this menu when its renderer eventually answers.
  state={...input,bounds:{...input.bounds},...(input.selection?{selection:{...input.selection}}:{})}
  const snapshot=state
  if(!await warm()||disposed||ticket!==request||state!==snapshot||!view||view.webContents.isDestroyed())return false
  const wc=view.webContents,win=owner!
  view.setBounds({x:Math.round(input.bounds.x),y:Math.round(input.bounds.y),width:Math.max(1,Math.round(input.bounds.width)),height:Math.max(1,Math.round(input.bounds.height))})
  wc.setZoomFactor(input.zoom);win.contentView.addChildView(view);view.setVisible(true);wc.setBackgroundThrottling(false);shown=true
  return new Promise<boolean>(resolve=>{
   pending={request:ticket,resolve,timer:setTimeout(()=>{if(pending?.request===ticket)hide()},5000)}
   try{wc.send(stateChannel,{...snapshot,_request:ticket})}catch{hide()}
  })
 }
 return {warm,show,hide,raise:()=>{if(shown&&view&&!view.webContents.isDestroyed()&&owner&&!owner.isDestroyed())owner.contentView.addChildView(view)},dispose:()=>{if(disposed)return;disposed=true;retire();ipcMain.removeListener(actionChannel,receive)},isShown:()=>shown&&!!view&&!view.webContents.isDestroyed()&&view.getVisible()}
}
