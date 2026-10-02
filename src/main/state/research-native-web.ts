import { WebContentsView, session, net, type BrowserWindow, type IpcMain } from 'electron'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { inspectResearchWebContent, normalizeResearchLinkUrl, type ResearchLinkFrameRegistry } from './research-link-frame'
import { guardResearchWebDownloads } from '../search/research-web-downloads'
import { measureResearchWebLayout } from './research-web-layout'
import { ResearchWebNavigationStore } from './research-web-navigation'
import type { ResearchWebSessionPersistence } from './research-web-session'

export function requiresNativeWeb(headers: Pick<Headers, 'get'>): boolean {
  const xfo = headers.get('x-frame-options') ?? ''
  const csp = headers.get('content-security-policy') ?? ''
  return /\b(?:deny|sameorigin)\b/i.test(xfo) || /(?:^|;)\s*frame-ancestors\s+(?!\*\s*(?:;|$))/i.test(csp)
}
export function nativeWebBounds(value: any, hostZoom = 1) {
  const r = value?.bounds
  if (!r || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) <= 30000)) throw Error('Invalid webpage bounds')
  return { x: Math.round(r.x * hostZoom), y: Math.round(r.y * hostZoom), width: Math.max(1, Math.min(4096, Math.round(r.width * hostZoom))), height: Math.max(1, Math.min(4096, Math.round(r.height * hostZoom))) }
}
export function nativeWebViewport(value: any) {
  const size = value?.layoutSize
  if (!size || !['width', 'height'].every(k => Number.isFinite(size[k]) && size[k] > 0 && size[k] <= 16384)) throw Error('Invalid webpage layout size')
  if (!Number.isFinite(value.scale) || value.scale <= 0 || value.scale > 16) throw Error('Invalid webpage display scale')
  return { width: Math.round(size.width), height: Math.round(size.height) }
}
export function nativeWebPageZoom(value: any): number {
  const zoom=value?.pageZoom ?? 1
  if(!Number.isFinite(zoom)||zoom<.5||zoom>2)throw Error('Invalid webpage zoom')
  return zoom
}
function nativeWebResultBefore<T>(operation: Promise<T>, milliseconds: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout>
  const timeout=new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),milliseconds)})
  return Promise.race([operation,timeout]).finally(()=>clearTimeout(timer))
}
export function registerResearchNativeWeb(options: { ipcMain: IpcMain; getMainWindow(): BrowserWindow | undefined; registry: ResearchLinkFrameRegistry; navigation?:ResearchWebNavigationStore; browserSession?:ResearchWebSessionPersistence }) {
  const navigation=options.navigation??new ResearchWebNavigationStore()
  const browserSessions=new Set<ReturnType<typeof session.fromPartition>>()
  const entries = new Map<string, { view: WebContentsView; url: string; image: string; imageRevision: number; error: string; busy: boolean; typing: boolean; ready: boolean; touched: number; presentation: string; bounds: string; layout: string; surfaceScale: number; generation: number; reloadToken: number; capturedAt: number; inspectedAt: number; inspecting: boolean; fitZoom: number; fitWidth: number; fitKey: string; pageZoom: number; zoomMode: 'auto'|'manual'; zoomResetToken: number; fitting: boolean; wasShown: boolean; snapshotRequested: number; snapshotCompleted: number; pageFit: ReturnType<typeof measureResearchWebLayout> | null; inspection: Awaited<ReturnType<typeof inspectResearchWebContent>> }>()
  const routes = new Map<string, Promise<boolean>>()
  const key = (v: any) => { if (!v || typeof v.sessionId !== 'string' || typeof v.nodeId !== 'string' || v.sessionId.length > 256 || v.nodeId.length > 256) throw Error('Invalid webpage identity'); return JSON.stringify([v.sessionId,v.nodeId]) }
  const release = (id: string) => { const e=entries.get(id); if(e){ entries.delete(id);const win=options.getMainWindow();if(win&&!win.isDestroyed())win.contentView.removeChildView(e.view);if(!e.view.webContents.isDestroyed())e.view.webContents.close() } }
  const inspect = async (value: unknown) => {
    const authorization = options.registry.resolve(value)
    const entry = entries.get(key(value))
    if (!authorization || !entry || entry.url !== authorization.url || entry.view.webContents.isDestroyed() || entry.view.webContents.isLoadingMainFrame()) return null
    const generation=entry.generation,result=await inspectResearchWebContent(entry.view.webContents, () => entry.view.webContents.getURL())
    if(entries.get(key(value))===entry&&entry.generation===generation)entry.inspection=result
    return result
  }
  const clear = () => { for(const id of entries.keys())release(id) }
  let hooked: BrowserWindow | undefined
  const window = () => {
    const win=options.getMainWindow(); if(!win||win.isDestroyed())throw Error('Window unavailable')
    if(hooked!==win){hooked=win;win.once('closed',clear);win.webContents.on('did-start-navigation',(_e,_url,inPlace,isMainFrame)=>{if(isMainFrame&&!inPlace)clear()});win.on('resize',()=>{for(const e of entries.values())e.view.setVisible(false)})}
    return win
  }
  const bind=(name:string,fn:(v:any)=>unknown)=>{options.ipcMain.removeHandler(name);registerTrustedMainWindowHandler(options.ipcMain,name,options.getMainWindow,(_e,v)=>fn(v))}
  bind('research:native-web:resolve',async value=>{
    key(value); const {url}=options.registry.authorize({sessionId:value.sessionId,nodeId:value.nodeId,url:value.url})
    // A workbench link is a browsing surface: subsequent pages and new-window
    // links must retain a top-level Chromium document, including frame policies.
    if(value.preferNative===true)return {engine:'native'}
    if(!routes.has(url)){
      if(routes.size>128)routes.clear()
      routes.set(url,(async()=>{try{const r=await net.fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(7000)});return requiresNativeWeb(r.headers)}catch{return /(^|\.)(google\.com|bing\.com)$/.test(new URL(url).hostname)}})())
    }
    return {engine:await routes.get(url)?'native':'iframe'}
  })
  bind('research:native-web:update',async value=>{
    const id=key(value),authorization=options.registry.resolve({sessionId:value.sessionId,nodeId:value.nodeId})
    if(!authorization || authorization.url!==normalizeResearchLinkUrl(value.url))throw Error('Webpage not authorized')
    options.browserSession?.track(authorization.url)
    await options.browserSession?.ready
    if(options.registry.resolve({sessionId:value.sessionId,nodeId:value.nodeId})?.url!==authorization.url)throw Error('Webpage not authorized')
    // Renderer rectangles are CSS pixels. Electron child views use window DIP,
    // just like the conversation browser; Retina density is handled by Electron.
    const win=window(),hostZoom=win.webContents.getZoomFactor()
    const bounds=nativeWebBounds(value,hostZoom), viewport=nativeWebViewport(value),pageZoom=nativeWebPageZoom(value)
    const zoomMode=value.pageZoomMode ?? (pageZoom===1?'auto':'manual')
    if(zoomMode!=='auto'&&zoomMode!=='manual')throw Error('Invalid webpage zoom mode')
    const zoomResetToken=Number.isSafeInteger(value.zoomResetToken)?value.zoomResetToken:0
    let entry=entries.get(id)
    if(entry&&entry.url!==authorization.url){release(id);entry=undefined}
    if(!entry){
      if(entries.size>=12){const oldest=[...entries].sort((a,b)=>a[1].touched-b[1].touched)[0];if(oldest)release(oldest[0])}
      const isolated=session.fromPartition('persist:research-web-pages')
      browserSessions.add(isolated)
      guardResearchWebDownloads(isolated)
      isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
      isolated.setPermissionCheckHandler(()=>false)
      const view=new WebContentsView({webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true}})
      entry={view,url:authorization.url,image:'',imageRevision:0,error:'',busy:false,typing:false,ready:false,touched:Date.now(),presentation:'',bounds:'',layout:'',surfaceScale:1,generation:0,reloadToken:Number(value.reloadToken)||0,capturedAt:0,inspectedAt:0,inspecting:false,fitZoom:1,fitWidth:0,fitKey:'',pageZoom,zoomMode,zoomResetToken,fitting:false,wasShown:false,snapshotRequested:0,snapshotCompleted:0,pageFit:null,inspection:null};entries.set(id,entry)
      const current=entry
      const remember=()=>{
        if(entries.get(id)!==current||view.webContents.isDestroyed())return
        const url=normalizeResearchLinkUrl(view.webContents.getURL())
        if(url){navigation.remember(id,current.url,url);options.browserSession?.track(url)}
        // Chromium batches writes. Commit server-issued login cookies promptly.
        void isolated.cookies?.flushStore().catch(()=>{})
      }
      view.webContents.on('did-navigate',remember)
      view.webContents.on('did-navigate-in-page',(_event,_url,isMainFrame)=>{if(isMainFrame)remember()})
      view.setVisible(false);win.contentView.addChildView(view)
      view.webContents.setWindowOpenHandler(({url})=>{if(normalizeResearchLinkUrl(url))void view.webContents.loadURL(url).catch(()=>{});return {action:'deny'}})
      view.webContents.on('will-navigate',(event,url)=>{if(!normalizeResearchLinkUrl(url))event.preventDefault()})
      view.webContents.on('will-redirect',(event,url)=>{if(!normalizeResearchLinkUrl(url))event.preventDefault()})
      view.webContents.on('did-start-navigation',(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame&&!inPlace){current.generation++;current.error='';current.ready=false;current.inspection=null;current.presentation='';current.layout='';current.fitKey='';current.fitWidth=0;current.pageFit=null;current.capturedAt=0;current.inspectedAt=0;current.wasShown=false;current.snapshotCompleted=current.snapshotRequested;view.setVisible(false)}})
      view.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)current.error=description})
      // Images, ads and other slow subresources must not gate first interaction.
      view.webContents.on('dom-ready',()=>{view.webContents.setZoomFactor(1);current.ready=true;current.error='';current.presentation='';current.layout='';current.fitKey='';current.capturedAt=0;current.inspectedAt=0;current.snapshotRequested++})
      view.webContents.on('did-finish-load',()=>{current.ready=true;current.error='';current.fitKey='';current.capturedAt=0;current.inspectedAt=0})
      view.webContents.on('before-input-event',(event,input)=>{
        if(input.type==='keyDown'&&input.code==='Space'&&!current.typing){event.preventDefault();view.setVisible(false);win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'})}
      })
      void view.webContents.loadURL(navigation.restore(id,authorization.url)).catch(error=>{current.error=String(error.message)})
    }
    entry.touched=Date.now()
    if(entry.zoomMode!==zoomMode||zoomResetToken>entry.zoomResetToken){entry.zoomMode=zoomMode;entry.zoomResetToken=Math.max(entry.zoomResetToken,zoomResetToken);entry.fitKey=''}
    if(entry.pageZoom!==pageZoom){entry.pageZoom=pageZoom;entry.capturedAt=0;entry.snapshotRequested++}
    // A remounted renderer starts at zero. Only a new refresh request may reload
    // the retained page; switching sessions must preserve its navigation/state.
    if(Number.isSafeInteger(value.reloadToken)&&value.reloadToken>entry.reloadToken){entry.reloadToken=value.reloadToken;entry.error='';entry.view.webContents.reload()}
    entry.view.setBorderRadius(Math.max(0,Math.min(16,Math.round((Number(value.radius)||0)*hostZoom))))
    const size=win.getContentSize()
    const show=value.active===true&&entry.ready&&!entry.error&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=(size[0]??0)&&bounds.y+bounds.height<=(size[1]??0)
    // While the live view is visible it renders directly; repeated full-page
    // capture competes with scrolling and input on complex websites. Refresh
    // its fallback image once when leaving interaction instead.
    if(entry.wasShown&&!show)entry.snapshotRequested++
    entry.wasShown=show
    // A hidden Chromium surface does not reliably resize its compositor. Keep
    // the last complete surface and let the canvas scale its snapshot. Only a
    // real component resize or entering interaction may configure the surface.
    const layout = JSON.stringify(viewport)
    if (!show) entry.view.setVisible(false)
    if (entry.zoomMode==='auto'&&entry.layout!==layout&&entry.fitWidth>0)entry.fitZoom=Math.max(.75,Math.min(1,viewport.width/entry.fitWidth))
    if (show || entry.layout !== layout || entry.presentation!==JSON.stringify([viewport,entry.surfaceScale,entry.fitZoom,entry.pageZoom])) {
      const displayScale = show || !entry.presentation ? value.scale * hostZoom : entry.surfaceScale
      const surface = show || !entry.presentation ? bounds : {
        x: bounds.x, y: bounds.y,
        width: Math.max(1, Math.round(viewport.width * displayScale)),
        height: Math.max(1, Math.round(viewport.height * displayScale))
      }
      const presentation = JSON.stringify([viewport, displayScale,entry.fitZoom,entry.pageZoom])
      if (entry.presentation !== presentation) entry.view.setVisible(false)
      // Size the native surface before configuring its fixed CSS viewport.
      const surfaceKey=JSON.stringify(surface)
      if(entry.bounds!==surfaceKey){
        entry.view.setBounds(surface)
        // A hidden Chromium view can keep its old drawing surface after growing.
        // Synchronize its size in this turn and immediately keep it hidden;
        // subsequent capture must include the whole resized viewport.
        if(!show){entry.view.setVisible(true);entry.view.setVisible(false)}
        entry.bounds=surfaceKey
      }
      if (entry.presentation !== presentation) {
        // One emulated viewport owns both fit and manual zoom. Chromium's
        // origin-wide browser zoom otherwise feeds back into layout measurements
        // and can disagree with the device-emulation viewport after a resize.
        const contentScale=entry.fitZoom*entry.pageZoom
        const viewSize={width:Math.max(1,Math.round(viewport.width/contentScale)),height:Math.max(1,Math.round(viewport.height/contentScale))}
        entry.view.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:viewSize,viewPosition:{x:0,y:0},deviceScaleFactor:0,viewSize,scale:displayScale*contentScale})
        entry.capturedAt=0;entry.snapshotRequested++
        entry.presentation = presentation
        entry.surfaceScale = displayScale
        entry.layout = layout
      }
    }
    entry.view.setVisible(show)
    // Geometry IPC must finish immediately. Snapshot capture and body extraction
    // run independently, are rate limited, and cannot hold up the next resize.
    const now=Date.now()
    const fitKey=JSON.stringify([entry.generation,viewport.width,entry.zoomResetToken])
    if(!entry.fitting&&entry.zoomMode==='auto'&&!entry.error&&entry.ready&&entry.fitKey!==fitKey){
      entry.fitting=true;entry.fitKey=fitKey;const current=entry,generation=entry.generation,presentation=entry.presentation
      // Measure once per document/width/reset, never periodically shrink the
      // already fitted page. Retain readable text when a legacy site requests
      // an oversized layout; its own scrollports handle the remaining overflow.
      void nativeWebResultBefore(entry.view.webContents.executeJavaScriptInIsolatedWorld(991,[{code:`(${measureResearchWebLayout.toString()})()`}]),1200).then(size=>{
        if(entries.get(id)!==current||current.generation!==generation||current.presentation!==presentation||current.zoomMode!=='auto'||!size){if(current.fitKey===fitKey)current.fitKey='';return}
        const naturalWidth=Number(size.content)
        if(!Number.isFinite(naturalWidth)||naturalWidth<=0)return
        current.fitWidth=Number(size.content)>Number(size.viewport)+2?naturalWidth:0
        const zoom=current.fitWidth?Math.max(.75,Math.min(1,viewport.width/current.fitWidth)):1
        current.pageFit=size
        if(Math.abs(zoom-current.fitZoom)>.002){current.fitZoom=zoom;current.capturedAt=0;current.snapshotRequested++}
      }).catch(()=>{}).finally(()=>{current.fitting=false})
    }
    if(!entry.busy&&!entry.error&&entry.ready&&(!entry.image||entry.snapshotCompleted<entry.snapshotRequested)&&now-entry.capturedAt>=(!entry.image?1000:0)){
      entry.busy=true;entry.capturedAt=now;const current=entry,generation=entry.generation,presentation=entry.presentation,fitZoom=entry.fitZoom,pageZoom=entry.pageZoom,snapshotRequested=entry.snapshotRequested
      void (async()=>{try {
        // Capturing an interactive page must not resurrect its compositor after
        // the renderer hides it to drag/resize the snapshot in the canvas.
        // Chromium can retain the previous compositor extent while hidden.
        // An explicit capture region follows the current surface dimensions.
        const surface=current.view.getBounds()
        const region={x:0,y:0,width:surface.width,height:surface.height}
        // The first hidden capture submits a frame at the new viewport; do not
        // publish that transitional frame as the completed preview.
        if(!show)await nativeWebResultBefore(entry.view.webContents.capturePage(region,{stayHidden:true,stayAwake:true}),1500)
        const image=await nativeWebResultBefore(entry.view.webContents.capturePage(region,{stayHidden:true,stayAwake:true}),1500)
        if(entries.get(id)===current&&current.generation===generation&&current.presentation===presentation&&current.fitZoom===fitZoom&&current.pageZoom===pageZoom&&current.ready&&image&&!image.isEmpty()){
          const data=image.toDataURL();if(data!==current.image){current.image=data;current.imageRevision++}
          current.snapshotCompleted=Math.max(current.snapshotCompleted,snapshotRequested)
        }
        // An unresponsive focus probe must never lock subsequent preview renders.
        void nativeWebResultBefore(entry.view.webContents.executeJavaScript("!!document.activeElement?.matches('input,textarea,select,[contenteditable=true]')"),1200).then(typing=>{if(entries.get(id)===current&&current.generation===generation&&typeof typing==='boolean')current.typing=typing}).catch(()=>{})
      } catch {} finally {current.busy=false}})()
    }
    if(!entry.inspecting&&!entry.error&&entry.ready&&(show||!entry.inspection)&&now-entry.inspectedAt>=(show?8000:30000)){
      entry.inspecting=true;entry.inspectedAt=now;const current=entry,generation=entry.generation
      void inspect({sessionId:value.sessionId,nodeId:value.nodeId}).then(inspection=>{
        if(entries.get(id)===current&&current.generation===generation)current.inspection=inspection
      }).catch(()=>{}).finally(()=>{current.inspecting=false})
    }
    return {image:value.imageRevision===entry.imageRevision?'':entry.image,imageRevision:entry.imageRevision,error:entry.error,loading:!entry.ready,snapshotPending:!entry.image||entry.snapshotCompleted<entry.snapshotRequested,pageFit:entry.pageFit?{...entry.pageFit,zoom:entry.fitZoom}:null,inspection:entry.inspection}
  })
  bind('research:native-web:hide',value=>{
    if(value?.sessionId!==undefined&&(typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>256))throw Error('Invalid webpage identity')
    if(value?.nodeId!==undefined)key(value)
    for(const [id,e] of entries){const [sessionId,nodeId]=JSON.parse(id);if(value?.sessionId!==undefined&&value.sessionId!==sessionId||value?.nodeId!==undefined&&value.nodeId!==nodeId)continue;e.view.setVisible(false)}
    return true
  })
  const forget=(value:any)=>{const id=key(value);navigation.forget(id);release(id)}
  bind('research:native-web:release',value=>{forget(value);return true})
  return { inspect, release:forget, contents:(value:any)=>entries.get(key(value))?.view.webContents,
    flush:async()=>{await options.browserSession?.flush();await navigation.flush();await Promise.all([...browserSessions].map(s=>s.cookies?.flushStore()))} }
}
