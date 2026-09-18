import { WebContentsView, session, type BrowserWindow, type IpcMain } from 'electron'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { readablePageUrl } from './browser-page-reader'
// @ts-ignore Fixed sandbox API, shared with canvas browser interaction.
import { createCanvasUseSurface } from '../../../packages/dsh-research-task-runtime/canvas-use-surface.js'

const channel = 'conversation:browser'
export function browserRequest(value: any) {
  if (!value || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 256) throw Error('浏览器需要当前会话身份。')
  if (!['open','observe','click','input','scroll','key','select','back','close'].includes(value.op)) throw Error('不支持的浏览器操作。')
  if (value.op === 'open') readablePageUrl(value.url)
  if (JSON.stringify(value).length > 16000) throw Error('浏览器参数过大。')
  return value
}
// A shadow label does not contaminate page text, references or revision hashes.
export function browserCursorScript(x: number, y: number, label: string) {
  return `(() => { let cursor=document.querySelector('[data-odyssey-browser-cursor]');
    if(!cursor){cursor=document.createElement('div');cursor.setAttribute('data-odyssey-browser-cursor','');cursor.setAttribute('data-canvas-use-cursor','');cursor.setAttribute('aria-hidden','true');cursor.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;left:24px;top:24px';const shadow=cursor.attachShadow({mode:'closed'});const arrow=document.createElement('div');arrow.style.cssText='width:18px;height:23px;background:#0d99ff;clip-path:polygon(0 0,100% 60%,48% 68%,30% 100%);filter:drop-shadow(0 0 2px white)';const tag=document.createElement('span');tag.style.cssText='position:absolute;left:16px;top:18px;background:#0d99ff;color:white;padding:2px 6px;border-radius:4px;font:12px/18px system-ui;white-space:nowrap';shadow.append(arrow,tag);cursor.__label=tag;document.documentElement.append(cursor)}
    cursor.style.left=Math.max(0,Math.min(innerWidth-1,${JSON.stringify(x)}*innerWidth))+'px';cursor.style.top=Math.max(0,Math.min(innerHeight-1,${JSON.stringify(y)}*innerHeight))+'px';cursor.__label.style.left=${JSON.stringify(x)}>.75?'auto':'16px';cursor.__label.style.right=${JSON.stringify(x)}>.75?'8px':'auto';cursor.__label.style.top=${JSON.stringify(y)}>.85?'-24px':'18px';cursor.__label.textContent=${JSON.stringify(label)};
  })()`
}
type Entry = { view: WebContentsView; snapshot: any; x: number; y: number; label: string; tail: Promise<unknown>; visible: boolean; ready: Promise<void> }
export function registerConversationBrowser(options: { ipcMain: IpcMain; getMainWindow(): BrowserWindow | undefined }) {
  const entries = new Map<string, Entry>()
  const main = () => { const win=options.getMainWindow();if(!win||win.isDestroyed())throw Error('客户端窗口不可用');return win }
  const publish = (sessionId: string, entry: Entry) => {
    const wc=entry.view.webContents
    if(!wc.isDestroyed())main().webContents.send(channel,{sessionId,url:wc.getURL(),title:wc.getTitle()||'浏览器'})
  }
  const cursor = async (entry: Entry, label: string) => {
    entry.label=label
    if(!entry.view.webContents.getURL())return
    await entry.view.webContents.executeJavaScriptInIsolatedWorld(988,[{code:browserCursorScript(entry.x,entry.y,label)}]).catch(()=>{})
  }
  const close = (id: string) => {
    const e=entries.get(id);if(!e)return
    const win=options.getMainWindow();if(win&&!win.isDestroyed())win.contentView.removeChildView(e.view);if(!e.view.webContents.isDestroyed())e.view.webContents.close();entries.delete(id)
  }
  const ensure = (id: string) => {
    let e=entries.get(id);if(e)return e
    if(entries.size >= 8)throw Error('已打开 8 个会话浏览器，请先关闭不用的网页。')
    const browserSession=session.fromPartition('persist:research-web-pages')
    browserSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
    browserSession.setPermissionCheckHandler(()=>false)
    const view=new WebContentsView({webPreferences:{session:browserSession,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}})
    e={view,snapshot:null,x:.08,y:.12,label:'Agent · 正在载入',tail:Promise.resolve(),visible:false,ready:view.webContents.loadURL('about:blank')};entries.set(id,e)
    main().contentView.addChildView(view);view.setVisible(false)
    const entry=e
    view.webContents.setAudioMuted(true)
    view.webContents.setWindowOpenHandler(({url})=>{try{void view.webContents.loadURL(readablePageUrl(url)).catch(()=>{});}catch{}return {action:'deny'}})
    const guard=(event:{preventDefault():void},url:string)=>{try{readablePageUrl(url)}catch{event.preventDefault()}}
    view.webContents.on('will-navigate',guard);view.webContents.on('will-redirect',guard)
    view.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMain)=>{if(isMain){entry.snapshot=null;void cursor(entry,'Agent · 正在载入')}})
    view.webContents.on('dom-ready',()=>{void cursor(entry,entry.label)})
    view.webContents.on('did-finish-load',()=>{void cursor(entry,'Agent · 待命');publish(id,entry)})
    return entry
  }
  const surface = async (e: Entry, args: any) => {
    const code=`globalThis.__ewBrowserUse ??= (${createCanvasUseSurface.toString()})(document.body,()=>null,(el,event)=>event instanceof KeyboardEvent?true:el.dispatchEvent(event),{viewport:true}); globalThis.__ewBrowserUse(${JSON.stringify({...args,externalCursor:true,images:false})})`
    return e.view.webContents.executeJavaScriptInIsolatedWorld(987,[{code}])
  }
  const observe = async (e: Entry) => {
    readablePageUrl(e.view.webContents.getURL())
    e.snapshot=await surface(e,{op:'observe'})
    return { ...e.snapshot,title:e.view.webContents.getTitle(),visible:e.visible }
  }
  const run = async (input: any, signal: AbortSignal) => {
    const v=browserRequest(input),id=v.sessionId
    signal.throwIfAborted()
    if(v.op==='close'){close(id);return {closed:true}}
    const e=entries.get(id)??(v.op==='open'?ensure(id):null)
    if(!e)throw Error('请先用 browser_use open 打开网址。')
    const operation=async()=>{
      signal.throwIfAborted()
      const wc=e.view.webContents
      if(wc.isDestroyed())throw Error('网页已关闭，请重新打开。')
      const stop=()=>{if(!wc.isDestroyed())wc.stop()}
      const bounded=<T>(promise:Promise<T>)=>new Promise<T>((resolve,reject)=>{
        const abort=()=>{cleanup();stop();reject(signal.reason??Error('浏览器操作已取消'))}
        const timer=setTimeout(()=>{cleanup();stop();reject(Error('网页响应超时，请 observe 检查当前页面后继续。'))},30000)
        const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
        signal.addEventListener('abort',abort,{once:true});promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});if(signal.aborted)abort()
      })
      signal.addEventListener('abort',stop,{once:true})
      try {
        if(v.op==='open') {
          await bounded(e.ready)
          await cursor(e,'Agent · 正在载入')
          // Open the panel immediately, including while a navigation is pending.
          main().webContents.send(channel,{sessionId:id,url:readablePageUrl(v.url),title:'浏览器',open:true})
          await bounded(wc.loadURL(readablePageUrl(v.url)))
        } else if(v.op==='back') {
          if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack()
        } else if(v.op!=='observe') {
          const latest=e.snapshot
          if(!latest||v.revision!==latest.revision)throw Error('请先 observe 并使用最新 revision 和元素 ref。')
          const target=v.ref?latest.elements.find((el:any)=>el.ref===v.ref):null
          if(v.ref&&!target)throw Error('元素引用已失效，请重新观察。')
          const b=target?.bounds
          e.x=b?b.x+b.width/2:.5;e.y=b?b.y+b.height/2:.5
          await cursor(e,`Agent · ${({click:'点击',input:'输入',scroll:'滚动',key:'按键',select:'选择'} as Record<string,string>)[v.op]??'操作'}`)
          await surface(e,{op:v.op,revision:v.revision,ref:v.ref,text:v.text,key:v.key,value:v.value,x:v.x,y:v.y})
          if(v.op==='key') {
            // Real key events retain default browser behavior (Enter submits forms).
            wc.sendInputEvent({type:'keyDown',keyCode:v.key});wc.sendInputEvent({type:'keyUp',keyCode:v.key})
          }
        }
        signal.throwIfAborted()
        await new Promise(resolve=>setTimeout(resolve,250))
        signal.throwIfAborted()
        await cursor(e,'Agent · 正在观察')
        const observation=await bounded(observe(e))
        await cursor(e,'Agent · 待命')
        await new Promise(resolve=>setTimeout(resolve,100))
        const image=await bounded(wc.capturePage()).catch(()=>null)
        publish(id,e)
        return {observation,screenshot:!image||image.isEmpty()?undefined:'data:image/jpeg;base64,'+image.resize({width:Math.min(1400,image.getSize().width)}).toJPEG(70).toString('base64')}
      } finally {signal.removeEventListener('abort',stop)}
    }
    const pending=e.tail.then(operation,operation);e.tail=pending.catch(()=>{});return pending
  }
  registerTrustedMainWindowHandler(options.ipcMain,channel+':layout',options.getMainWindow,(_event,v:any)=>{
    const e=entries.get(v?.sessionId);if(!e)return false
    if(!v.bounds){e.view.setVisible(false);e.visible=false;return true}
    const r=v.bounds,win=main(),zoom=win.webContents.getZoomFactor(),[width,height]=win.getContentSize()
    if(!['x','y','width','height'].every(k=>Number.isFinite(r[k])))return false
    const rect={x:Math.round(r.x*zoom),y:Math.round(r.y*zoom),width:Math.round(r.width*zoom),height:Math.round(r.height*zoom)}
    const visible=v.visible===true&&rect.width>0&&rect.height>0&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=(width??0)&&rect.y+rect.height<=(height??0)
    if(visible){e.view.setBounds(rect);e.view.webContents.setZoomFactor(zoom);void cursor(e,e.label)}
    e.view.setVisible(visible);e.visible=visible;return true
  })
  main().once('closed',()=>{for(const id of entries.keys())close(id)})
  return {run,dispose:()=>{for(const id of entries.keys())close(id)}}
}
