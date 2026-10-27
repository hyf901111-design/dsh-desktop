// @ts-ignore Serialized sandbox code is deliberately shared with the JS runtime.
import { createCanvasUseSurface } from '../../../packages/dsh-research-task-runtime/canvas-use-surface.js'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import type { BrowserWindow, IpcMain, WebContents, WebFrameMain } from 'electron'
import { normalizeResearchLinkUrl, type ResearchLinkFrameRegistry } from './research-link-frame'

export function registerCanvasUseWeb(options:{ipcMain:IpcMain;getMainWindow():BrowserWindow|undefined;registry:ResearchLinkFrameRegistry;native(value:any):WebContents|undefined;authorize(sessionId:string,write:boolean):void}) {
  registerTrustedMainWindowHandler(options.ipcMain,'research:canvas-use:web',options.getMainWindow,async (_event,value:any)=>{
    const identity={sessionId:value?.sessionId,nodeId:value?.nodeId}, auth=options.registry.resolve(identity)
    if(!auth)throw Error('网页组件已不可用。')
    const args=value.args
    if(!args||JSON.stringify(args).length>16000)throw Error('网页操作无效。')
    options.authorize(identity.sessionId,args.op!=='observe')
    let target:WebContents|WebFrameMain|undefined=options.native(identity)
    target??=options.getMainWindow()?.webContents.mainFrame.framesInSubtree.find(f=>f.name===auth.frameName)
    if(!target||target.isDestroyed())throw Error('网页尚未加载，请稍后重新观察。')
    const url='getURL' in target?target.getURL():target.url
    if(!normalizeResearchLinkUrl(url))throw Error('网页已离开可操作范围。')
    // Isolated world protects the API from site redefinitions. Only fixed code
    // and JSON data are passed, never selectors or JavaScript supplied by a model.
    const code=`globalThis.__ewCanvasUse ??= (${createCanvasUseSurface.toString()})(document.body); globalThis.__ewCanvasUse(${JSON.stringify(args)})`
    return 'executeJavaScriptInIsolatedWorld' in target ? target.executeJavaScriptInIsolatedWorld(987,[{code}]) : target.executeJavaScript(code)
  })
  registerTrustedMainWindowHandler(options.ipcMain,'research:canvas-use:capture',options.getMainWindow,async(_event,value:any)=>{
    const win=options.getMainWindow();if(!win)throw Error('窗口不可用')
    const input=value?.rect,zoom=input?.cssPixels===true?win.webContents.getZoomFactor():1
    const r=input&&(['x','y','width','height'] as const).every(k=>Number.isFinite(input[k]))?{x:input.x*zoom,y:input.y*zoom,width:input.width*zoom,height:input.height*zoom}:null,size=win.getContentSize()
    if(!r||!(['x','y','width','height'] as const).every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>(size[0]??0)||r.y+r.height>(size[1]??0))throw Error('画布截图区域无效。')
    const image=await win.webContents.capturePage({x:Math.round(r.x),y:Math.round(r.y),width:Math.floor(r.width),height:Math.floor(r.height)})
    const bounded=image.getSize().width>1600?image.resize({width:1600}):image
    return 'data:image/jpeg;base64,'+bounded.toJPEG(75).toString('base64')
  })
}
