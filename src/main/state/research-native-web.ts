import { WebContentsView, session, net, type BrowserWindow, type IpcMain } from 'electron'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { inspectResearchWebContent, normalizeResearchLinkUrl, type ResearchLinkFrameRegistry } from './research-link-frame'
import { guardResearchWebDownloads } from '../search/research-web-downloads'

export function requiresNativeWeb(headers: Pick<Headers, 'get'>): boolean {
  const xfo = headers.get('x-frame-options') ?? ''
  const csp = headers.get('content-security-policy') ?? ''
  return /\b(?:deny|sameorigin)\b/i.test(xfo) || /(?:^|;)\s*frame-ancestors\s+(?!\*\s*(?:;|$))/i.test(csp)
}
export function nativeWebBounds(value: any) {
  const r = value?.bounds
  if (!r || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) <= 30000)) throw Error('Invalid webpage bounds')
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.min(4096, Math.round(r.width))), height: Math.max(1, Math.min(4096, Math.round(r.height))) }
}
export function nativeWebViewport(value: any) {
  const size = value?.layoutSize
  if (!size || !['width', 'height'].every(k => Number.isFinite(size[k]) && size[k] > 0 && size[k] <= 16384)) throw Error('Invalid webpage layout size')
  if (!Number.isFinite(value.scale) || value.scale <= 0 || value.scale > 16) throw Error('Invalid webpage display scale')
  return { width: Math.round(size.width), height: Math.round(size.height) }
}
export function registerResearchNativeWeb(options: { ipcMain: IpcMain; getMainWindow(): BrowserWindow | undefined; registry: ResearchLinkFrameRegistry }) {
  const entries = new Map<string, { view: WebContentsView; url: string; image: string; error: string; busy: boolean; typing: boolean; touched: number; presentation: string; layout: string; surfaceScale: number }>()
  const routes = new Map<string, Promise<boolean>>()
  const key = (v: any) => { if (!v || typeof v.sessionId !== 'string' || typeof v.nodeId !== 'string' || v.sessionId.length > 256 || v.nodeId.length > 256) throw Error('Invalid webpage identity'); return JSON.stringify([v.sessionId,v.nodeId]) }
  const release = (id: string) => { const e=entries.get(id); if(e){ options.getMainWindow()?.contentView.removeChildView(e.view); e.view.webContents.close(); entries.delete(id) } }
  const inspect = async (value: unknown) => {
    const authorization = options.registry.resolve(value)
    const entry = entries.get(key(value))
    if (!authorization || !entry || entry.url !== authorization.url || entry.view.webContents.isDestroyed() || entry.view.webContents.isLoadingMainFrame()) return null
    return inspectResearchWebContent(entry.view.webContents, () => entry.view.webContents.getURL())
  }
  const clear = () => { for(const id of entries.keys())release(id) }
  let hooked: BrowserWindow | undefined
  const window = () => {
    const win=options.getMainWindow(); if(!win||win.isDestroyed())throw Error('Window unavailable')
    if(hooked!==win){hooked=win;win.once('closed',clear);win.webContents.on('did-start-navigation',(_e,_url,_inPlace,isMainFrame)=>{if(isMainFrame)clear()});win.on('resize',()=>{for(const e of entries.values())e.view.setVisible(false)})}
    return win
  }
  const bind=(name:string,fn:(v:any)=>unknown)=>{options.ipcMain.removeHandler(name);registerTrustedMainWindowHandler(options.ipcMain,name,options.getMainWindow,(_e,v)=>fn(v))}
  bind('research:native-web:resolve',async value=>{
    key(value); const {url}=options.registry.authorize(value)
    if(!routes.has(url)){
      if(routes.size>128)routes.clear()
      routes.set(url,(async()=>{try{const r=await net.fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(7000)});return requiresNativeWeb(r.headers)}catch{return /(^|\.)(google\.com|bing\.com)$/.test(new URL(url).hostname)}})())
    }
    return {engine:await routes.get(url)?'native':'iframe'}
  })
  bind('research:native-web:update',async value=>{
    const id=key(value),authorization=options.registry.resolve({sessionId:value.sessionId,nodeId:value.nodeId})
    if(!authorization || authorization.url!==normalizeResearchLinkUrl(value.url))throw Error('Webpage not authorized')
    const bounds=nativeWebBounds(value), viewport=nativeWebViewport(value), win=window()
    let entry=entries.get(id)
    if(entry&&entry.url!==authorization.url){release(id);entry=undefined}
    if(!entry){
      if(entries.size>=12){const oldest=[...entries].sort((a,b)=>a[1].touched-b[1].touched)[0];if(oldest)release(oldest[0])}
      const isolated=session.fromPartition('persist:research-web-pages')
      guardResearchWebDownloads(isolated)
      isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
      isolated.setPermissionCheckHandler(()=>false)
      const view=new WebContentsView({webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true}})
      entry={view,url:authorization.url,image:'',error:'',busy:false,typing:false,touched:Date.now(),presentation:'',layout:'',surfaceScale:1};entries.set(id,entry)
      const current=entry
      view.setVisible(false);win.contentView.addChildView(view)
      view.webContents.setWindowOpenHandler(({url})=>{if(normalizeResearchLinkUrl(url))void view.webContents.loadURL(url).catch(()=>{});return {action:'deny'}})
      view.webContents.on('will-navigate',(event,url)=>{if(!normalizeResearchLinkUrl(url))event.preventDefault()})
      view.webContents.on('will-redirect',(event,url)=>{if(!normalizeResearchLinkUrl(url))event.preventDefault()})
      view.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)current.error=description})
      view.webContents.on('did-finish-load',()=>{current.error=''})
      view.webContents.on('before-input-event',(event,input)=>{
        if(input.type==='keyDown'&&input.code==='Space'&&!current.typing){event.preventDefault();view.setVisible(false);win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'})}
      })
      void view.webContents.loadURL(authorization.url).catch(error=>{current.error=String(error.message)})
    }
    entry.touched=Date.now()
    entry.view.setBorderRadius(Math.max(0,Math.min(16,Math.round(Number(value.radius)||0))))
    const size=win.getContentSize()
    const show=value.active===true&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=(size[0]??0)&&bounds.y+bounds.height<=(size[1]??0)
    // A hidden Chromium surface does not reliably resize its compositor. Keep
    // the last complete surface and let the canvas scale its snapshot. Only a
    // real component resize or entering interaction may configure the surface.
    const layout = JSON.stringify(viewport)
    if (!show) entry.view.setVisible(false)
    if (show || entry.layout !== layout) {
      const displayScale = show || !entry.presentation ? value.scale : entry.surfaceScale
      const surface = show || !entry.presentation ? bounds : {
        x: bounds.x, y: bounds.y,
        width: Math.max(1, Math.round(viewport.width * displayScale)),
        height: Math.max(1, Math.round(viewport.height * displayScale))
      }
      const presentation = JSON.stringify([viewport, displayScale])
      if (entry.presentation !== presentation) entry.view.setVisible(false)
      // Size the native surface before configuring its fixed CSS viewport.
      entry.view.setBounds(surface)
      if (entry.presentation !== presentation) {
        entry.view.webContents.setZoomFactor(1)
        entry.view.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:viewport,viewPosition:{x:0,y:0},deviceScaleFactor:0,viewSize:viewport,scale:displayScale})
        entry.presentation = presentation
        entry.surfaceScale = displayScale
        entry.layout = layout
      }
    }
    entry.view.setVisible(show)
    if(!entry.busy){
      entry.busy=true;const current=entry
      try {
        const image=await entry.view.webContents.capturePage(undefined,{stayHidden:!show,stayAwake:true})
        if(!image.isEmpty())current.image=image.toDataURL()
        current.typing=await entry.view.webContents.executeJavaScript("!!document.activeElement?.matches('input,textarea,select,[contenteditable=true]')").catch(()=>false)
      } catch {} finally {current.busy=false}
    }
    const inspection = await inspect({sessionId:value.sessionId,nodeId:value.nodeId})
    return {image:entry.image,error:entry.error,inspection}
  })
  bind('research:native-web:hide',()=>{for(const e of entries.values())e.view.setVisible(false);return true})
  bind('research:native-web:release',value=>{release(key(value));return true})
  return { inspect, contents:(value:any)=>entries.get(key(value))?.view.webContents }
}
