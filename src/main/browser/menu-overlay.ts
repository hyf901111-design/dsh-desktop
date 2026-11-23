import {ipcMain,BrowserWindow,WebContentsView,screen,type Rectangle} from 'electron'
import {randomUUID} from 'node:crypto'

export type BrowserMenuOverlayState={id:string;revision:number;html:string;css?:string;bounds:Rectangle;zoom:number;focusId?:string;selection?:{start:number;end:number;direction?:string};reducedMotion?:boolean;passive?:boolean;hoverCard?:boolean;focusOwner?:boolean;switcherAnchor?:Rectangle;material?:'menu'}
export type BrowserMenuOverlayAction={id:string;revision:number;kind:'click'|'input'|'change'|'key'|'scroll'|'dismiss'|'pointer'|'switcher-hover';controlId?:string;value?:string;checked?:boolean;key?:string;metaKey?:boolean;ctrlKey?:boolean;shiftKey?:boolean;altKey?:boolean;over?:boolean;scrollTop?:number;scrollLeft?:number;selectionStart?:number;selectionEnd?:number;through?:{x:number;y:number;button?:'left'|'middle'|'right'}}
export type BrowserMenuKeyInput={type:string;key:string;meta?:boolean;control?:boolean;shift?:boolean;alt?:boolean;isComposing?:boolean}
const actionChannel='browser-app:menu-action',stateChannel='browser-app:menu-state',clearChannel='browser-app:menu-clear'
const kinds=new Set(['click','input','change','key','scroll','dismiss','pointer'])
const menuKeys=new Set(['Escape','Enter',' ','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'])
const keys=new Set([...menuKeys,'l','t','w','r','f','d','p','s','y','n'])
const documentHtml='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data: http://127.0.0.1:*; font-src data: http://127.0.0.1:*; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Browser menu overlay</title>'
function validateState(state:BrowserMenuOverlayState){
 if(!state||typeof state.id!=='string'||!state.id||state.id.length>256||!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.html!=='string'||!state.html||Buffer.byteLength(state.html,'utf8')>4000000||state.css!==undefined&&(typeof state.css!=='string'||Buffer.byteLength(state.css,'utf8')>1000000)||['passive','hoverCard','focusOwner','reducedMotion'].some(key=>(state as any)[key]!==undefined&&typeof (state as any)[key]!=='boolean'))throw Error('原生菜单内容无效或过大。')
 if(state.material!==undefined&&(state.material!=='menu'||state.passive))throw Error('原生菜单材质无效。')
 const anchor=state.switcherAnchor
 if(anchor&&(!['x','y','width','height'].every(key=>Number.isFinite(anchor[key as keyof Rectangle])&&Math.abs(anchor[key as keyof Rectangle])<=30000)||anchor.width<=0||anchor.height<=0))throw Error('主页按钮位置无效。')
 const r=state.bounds
 if(!r||!(['x','y','width','height'] as const).every(key=>Number.isFinite(r[key])&&Math.abs(r[key])<=30000)||r.width<=0||r.height<=0||!Number.isFinite(state.zoom)||state.zoom<.1||state.zoom>5)throw Error('原生菜单位置或缩放无效。')
 if(state.focusId!==undefined&&(typeof state.focusId!=='string'||state.focusId.length>256)||state.selection&&(!Number.isSafeInteger(state.selection.start)||!Number.isSafeInteger(state.selection.end)||state.selection.start<0||state.selection.end<state.selection.start||state.selection.end>1000000||state.selection.direction!==undefined&&!['forward','backward','none'].includes(state.selection.direction)))throw Error('原生菜单焦点无效。')
}
type Surface={view?:WebContentsView;popup?:BrowserWindow;ready:boolean;readyPromise?:Promise<boolean>;resolveReady?:(value:boolean)=>void;readyTimer?:ReturnType<typeof setTimeout>;hasContent:boolean;clearToken:number;clearPromise?:Promise<boolean>;resolveClear?:(value:boolean)=>void;clearTimer?:ReturnType<typeof setTimeout>}

/** Opaque menus use a rect-sized sibling; glass menus and passive hints use separate native windows. */
export function createBrowserMenuOverlay(preload:string,getWindow:()=>BrowserWindow,onAction:(action:BrowserMenuOverlayAction)=>void){
 const interactive:Surface={ready:false,hasContent:false,clearToken:0},passive:Surface={ready:false,hasContent:false,clearToken:0},material:Surface={ready:false,hasContent:false,clearToken:0},surfaces=[interactive,passive,material]
 let owner:BrowserWindow|undefined,state:BrowserMenuOverlayState|undefined,shown=false,disposed=false,request=0
 let pointerTimer:ReturnType<typeof setInterval>|undefined,pointerSignature=''
 let switcherBoundary:{id:string;inside:boolean}|undefined
 const stopPointer=()=>{clearInterval(pointerTimer);pointerTimer=undefined;pointerSignature=''}
 const samplePointer=()=>{
  if(!shown||!state||!owner||owner.isDestroyed())return
  const surface=active(),popup=surface.popup
  if(!popup?.isVisible()&&!state.switcherAnchor)return
  const parent=owner.getContentBounds(),bounds=popup?.getContentBounds()??{...state.bounds,x:parent.x+state.bounds.x,y:parent.y+state.bounds.y}
  const point=screen.getCursorScreenPoint(),z=state.zoom,x=(point.x-bounds.x)/z,y=(point.y-bounds.y)/z
  const inside=x>=0&&y>=0&&x<bounds.width/z&&y<bounds.height/z
  // The shell and the native glass window have separate pointer event streams.
  // Test the button, the crossing strip and the panel as one hover region.
  const anchor=state.switcherAnchor
  if(anchor){
   const overAnchor=x>=anchor.x&&x<anchor.x+anchor.width&&y>=anchor.y&&y<anchor.y+anchor.height
   const overBridge=x>=anchor.x+anchor.width&&x<0&&y>=0&&y<bounds.height/z
   const over=inside||overAnchor||overBridge
   if(switcherBoundary?.id!==state.id||switcherBoundary.inside!==over){
    switcherBoundary={id:state.id,inside:over}
    onAction({id:state.id,revision:state.revision,kind:'switcher-hover',over})
   }
  }
  if(surface!==material)return
  const hitX=inside?x:-1,hitY=inside?y:-1,signature=JSON.stringify([state.id,state.revision,request,hitX,hitY])
  if(signature===pointerSignature)return;pointerSignature=signature
  contents(material)?.send('browser-app:menu-pointer',{id:state.id,revision:state.revision,_request:request,x:hitX,y:hitY})
 }
 const startPointer=()=>{stopPointer();if(active()!==material&&!state?.switcherAnchor)return;samplePointer();pointerTimer=setInterval(samplePointer,32);pointerTimer.unref?.()}
 let pending:{request:number;resolve:(value:boolean)=>void;timer:ReturnType<typeof setTimeout>}|undefined
 const contents=(surface:Surface)=>surface.view?.webContents??surface.popup?.webContents
 const active=()=>state?.passive?passive:state?.material==='menu'?material:interactive
 const finish=(value:boolean)=>{if(!pending)return;clearTimeout(pending.timer);const resolve=pending.resolve;pending=undefined;resolve(value)}
 const clear=(surface:Surface)=>{
  const wc=contents(surface)
  if(surface.clearPromise||!surface.hasContent||!surface.ready||!wc||wc.isDestroyed())return
  surface.resolveClear?.(false);clearTimeout(surface.clearTimer)
  const token=++surface.clearToken
  surface.clearPromise=new Promise(resolve=>{surface.resolveClear=resolve;surface.clearTimer=setTimeout(()=>{surface.resolveClear=undefined;resolve(false)},250)})
  wc.send(clearChannel,{_clear:token})
 }
 const conceal=(surface:Surface)=>{if(surface.view&&!surface.view.webContents.isDestroyed())surface.view.setVisible(false);if(surface.popup&&!surface.popup.isDestroyed())surface.popup.hide();clear(surface)}
 const hide=()=>{stopPointer();request++;shown=false;state=undefined;finish(false);surfaces.forEach(conceal)}
 const destroy=(surface:Surface)=>{
  clearTimeout(surface.readyTimer);clearTimeout(surface.clearTimer);surface.resolveReady?.(false);surface.resolveClear?.(false)
  const view=surface.view,popup=surface.popup;surface.view=undefined;surface.popup=undefined;surface.ready=false;surface.readyPromise=undefined;surface.resolveReady=undefined;surface.hasContent=false;surface.clearPromise=undefined;surface.resolveClear=undefined
  if(view){if(owner&&!owner.isDestroyed())owner.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close()}
  if(popup&&!popup.isDestroyed())popup.destroy()
 }
 const retire=()=>{hide();if(owner){owner.removeListener('closed',retire);owner.removeListener('hide',parentHidden);owner.removeListener('minimize',parentHidden);owner.removeListener('blur',parentBlurred)}surfaces.forEach(destroy);owner=undefined}
 const parentHidden=()=>{const previous=state;hide();if(previous)onAction({id:previous.id,revision:previous.revision,kind:'dismiss'})}
 const parentBlurred=()=>{if(state&&active()===material)parentHidden()}
 const receive=(event:Electron.IpcMainEvent,value:any)=>{
  const surface=surfaces.find(surface=>{const wc=contents(surface);return wc&&!wc.isDestroyed()&&event.sender===wc&&event.senderFrame===wc.mainFrame})
  if(!surface||!value||typeof value!=='object')return
  if(value.kind==='ready'){surface.ready=true;clearTimeout(surface.readyTimer);surface.resolveReady?.(true);surface.resolveReady=undefined;return}
  if(value.kind==='cleared'&&surface.resolveClear&&value._clear===surface.clearToken){surface.hasContent=false;clearTimeout(surface.clearTimer);surface.resolveClear?.(true);surface.resolveClear=undefined;return}
  if(!shown||!state||surface!==active()||value.id!==state.id||value.revision!==state.revision||value._request!==request)return
  if(value.kind==='painted'){
   if(pending?.request!==request)return
   // A material window paints while initially hidden, then reveals the fully
   // prepared contents together with its native effect, never an empty glass rect.
   if(surface===material&&surface.popup&&!surface.popup.isVisible())surface.popup.showInactive()
   if(!isShown())return
   const wc=contents(surface)!
   // Source-key dispatch may temporarily focus the owner renderer. Return to
   // this surface without focusing an input or disturbing its composition.
   if(surface===interactive&&!state.focusOwner&&!wc.isFocused())wc.focus()
   startPointer();finish(true);return
  }
  if(state.passive||!kinds.has(value.kind)||value.controlId!==undefined&&(typeof value.controlId!=='string'||!value.controlId||value.controlId.length>256))return
  if(['click','input','change','pointer'].includes(value.kind)&&!value.controlId)return
  if(['input','change'].includes(value.kind)&&(value.value!==undefined&&(typeof value.value!=='string'||value.value.length>1000000)||value.checked!==undefined&&typeof value.checked!=='boolean'))return
  if(value.kind==='key'&&(typeof value.key!=='string'||!keys.has(value.key.length===1?value.key.toLowerCase():value.key)))return
  if(value.kind==='pointer'&&typeof value.over!=='boolean')return
  for(const field of ['scrollTop','scrollLeft','selectionStart','selectionEnd'])if(value[field]!==undefined&&(!Number.isFinite(value[field])||value[field]<0||value[field]>10000000))return
  if(value.through!==undefined&&(value.kind!=='dismiss'||!Number.isFinite(value.through?.x)||!Number.isFinite(value.through?.y)||value.through.x<0||value.through.y<0||value.through.x>state.bounds.width/state.zoom||value.through.y>state.bounds.height/state.zoom||!['left','middle','right'].includes(value.through.button)))return
  const action:BrowserMenuOverlayAction={id:state.id,revision:state.revision,kind:value.kind}
  if(value.through)action.through={x:value.through.x,y:value.through.y,button:value.through.button}
  for(const field of ['controlId','value','checked','key','over','scrollTop','scrollLeft','selectionStart','selectionEnd'] as const)if(value[field]!==undefined)(action as any)[field]=value[field]
  for(const field of ['metaKey','ctrlKey','shiftKey','altKey'] as const)if(typeof value[field]==='boolean')action[field]=value[field]
  // The source card owns its copy handler and needs document focus to write.
  if(state.hoverCard&&(value.kind==='click'||value.kind==='key'&&['Enter',' '].includes(value.key)))owner?.webContents.focus()
  onAction(action)
 }
 ipcMain.on(actionChannel,receive)
 const warmSurface=(surface:Surface):Promise<boolean>=>{
  if(disposed)return Promise.resolve(false)
  const win=getWindow();if(!win||win.isDestroyed())return Promise.resolve(false)
  if(owner&&owner!==win)retire()
  if(!owner){owner=win;win.once('closed',retire);win.on('hide',parentHidden);win.on('minimize',parentHidden);win.on('blur',parentBlurred)}
  const existing=contents(surface);if(existing&&!existing.isDestroyed())return surface.ready?Promise.resolve(true):surface.readyPromise!
  const webPreferences={preload,partition:'browser-menu-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}
  if(surface===passive||surface===material){
   surface.popup=new BrowserWindow({parent:win,width:1,height:1,show:false,frame:false,transparent:true,backgroundColor:'#00000000',focusable:false,acceptFirstMouse:true,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,hasShadow:surface===material,paintWhenInitiallyHidden:true,...(surface===material&&process.platform==='darwin'?{vibrancy:'menu' as const,visualEffectState:'active' as const,roundedCorners:true}:{}),webPreferences})
   surface.popup.setIgnoreMouseEvents(surface===passive)
   // NSVisualEffectView samples the live native compositor; Chromium backdrop
   // filters cannot blur sibling WebContentsViews. No webpage bitmap is used.
   if(surface===material&&process.platform==='darwin')surface.popup.setVibrancy('menu')
  }
  else{surface.view=new WebContentsView({webPreferences});surface.view.setBackgroundColor('#00000000');surface.view.setVisible(false);win.contentView.addChildView(surface.view)}
  const wc=contents(surface)!
  // Non-key macOS popups do not reliably update Chromium's :hover state.
  // Forward their native movement without focusing either window.
  wc.on('before-mouse-event',(_event,input)=>{if(surface!==material||!shown||active()!==material||!state||!['mouseMove','mouseLeave'].includes(input.type))return;const z=state.zoom||1;wc.send('browser-app:menu-pointer',{id:state.id,revision:state.revision,_request:request,x:input.type==='mouseLeave'?-1:input.x/z,y:input.type==='mouseLeave'?-1:input.y/z})})
  // The menu document has an opaque origin. Reuse only this application's
  // local font/icon assets without changing the webpage's session or CORS.
  try{
   const assets=new URL(win.webContents.getURL())
   if(assets.protocol==='http:'&&assets.hostname==='127.0.0.1')wc.session.webRequest.onHeadersReceived({urls:[assets.origin+'/*']},(details,callback)=>{
    const headers={...details.responseHeaders}
    if(['font','image'].includes(details.resourceType)){
     for(const key of Object.keys(headers))if(key.toLowerCase()==='access-control-allow-origin')delete headers[key]
     headers['Access-Control-Allow-Origin']=['*']
    }
    callback({responseHeaders:headers})
   })
  }catch{}
  surface.ready=false;wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false)
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());wc.on('will-redirect',event=>event.preventDefault())
  const gone=()=>{if(contents(surface)===wc){if(active()===surface)hide();destroy(surface)}}
  wc.once('destroyed',gone);wc.once('render-process-gone',gone)
  surface.readyPromise=new Promise(resolve=>{surface.resolveReady=resolve;surface.readyTimer=setTimeout(()=>{if(contents(surface)===wc)destroy(surface)},5000)})
  void wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(documentHtml)).catch(()=>{if(contents(surface)===wc)destroy(surface)})
  return surface.readyPromise
 }
 const warm=()=>warmSurface(interactive)
 const isShown=()=>{const surface=active(),wc=contents(surface);return shown&&!!wc&&!wc.isDestroyed()&&(surface.view?.getVisible()??surface.popup?.isVisible()??false)}
 const show=async(input:BrowserMenuOverlayState):Promise<boolean>=>{
  validateState(input);if(disposed)return false
  // Text controls need the established WCV keyboard/IME ownership contract.
  // Pure glass menus remain non-key so their parent keeps its active chrome.
  if(input.material&&/<(?:input|textarea|select)\b|\bcontenteditable(?:\s|=|>)/i.test(input.html))input={...input,material:undefined}
  if(owner&&owner!==getWindow())retire()
  if(state?.id===input.id&&input.revision<state.revision)return false
  stopPointer()
  if(state&&(state.id!==input.id||!!state.passive!==!!input.passive||state.material!==input.material))conceal(active())
  const ticket=++request;finish(false)
  state={...input,bounds:{...input.bounds},...(input.selection?{selection:{...input.selection}}:{})}
  const snapshot=state,surface=active(),current=()=>!disposed&&ticket===request&&state===snapshot
  if(!await warmSurface(surface)||!current())return false
  // A hidden prepared surface paints transparent content before a different
  // menu can appear. If it cannot acknowledge that clear, recreate an empty
  // surface rather than briefly displaying the previous menu's retained frame.
  if(surface.clearPromise&&!await surface.clearPromise){destroy(surface);if(!await warmSurface(surface)||!current())return false}
  if(!current())return false
  const wc=contents(surface)!,bounds={x:Math.round(input.bounds.x),y:Math.round(input.bounds.y),width:Math.max(1,Math.round(input.bounds.width)),height:Math.max(1,Math.round(input.bounds.height))}
  wc.setZoomFactor(input.zoom)
  if(surface.popup){const origin=owner!.getContentBounds();surface.popup.setBounds({...bounds,x:origin.x+bounds.x,y:origin.y+bounds.y});surface.popup.setIgnoreMouseEvents(surface===passive);if(surface!==material)surface.popup.showInactive()}
  else{surface.view!.setBounds(bounds);owner!.contentView.addChildView(surface.view!);surface.view!.setVisible(true)}
  wc.setBackgroundThrottling(false);shown=true;surface.clearPromise=undefined;surface.hasContent=true
  return new Promise<boolean>(resolve=>{pending={request:ticket,resolve,timer:setTimeout(()=>{if(pending?.request===ticket)hide()},5000)};try{wc.send(stateChannel,{...snapshot,_request:ticket})}catch{hide()}})
 }
 const key=(input:BrowserMenuKeyInput)=>{
  if(!state||active()!==material||state.focusOwner||!input||!['keyDown','keyUp'].includes(input.type)||input.isComposing||input.meta||input.control||input.alt||!menuKeys.has(input.key))return false
  if(!isShown()){
   if(input.key!=='Escape')return false
   if(input.type==='keyDown'){const previous=state;hide();onAction({id:previous.id,revision:previous.revision,kind:'dismiss'})}
   return true
  }
  // Key releases are consumed too, without dispatching a second action.
  if(input.type==='keyUp')return true
  try{contents(material)!.send('browser-app:menu-key',{id:state!.id,revision:state!.revision,_request:request,key:input.key,shiftKey:input.shift===true});return true}catch{hide();return false}
 }
 return {warm,show,hide,key,raise:()=>{if(!isShown())return;const surface=active();if(surface.view)owner!.contentView.addChildView(surface.view);else surface.popup?.moveTop()},dispose:()=>{if(disposed)return;disposed=true;retire();ipcMain.removeListener(actionChannel,receive)},isShown,isFocused:()=>{const wc=contents(active());return shown&&active()===interactive&&!!wc&&!wc.isDestroyed()&&wc.isFocused()}}
}
