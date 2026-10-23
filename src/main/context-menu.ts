import { contextMenuCaptureScript, contextMenuTargetScript } from './context-menu-target'
import { generatedFileFinderPath } from './generated-file-finder'
import { buildNativeFileMenu } from './native-file-menu'
import { registerTrustedMainWindowHandler } from './ipc-trust'
import { clipboard, ipcMain, Menu, shell, type BrowserWindow, type WebContents } from 'electron'
import {openClientLink} from './search/open-client-link'
import { existsSync } from 'node:fs'
import { buildContextMenuTemplate, resolveFinderPath } from './context-menu-template'

async function clickedElementPathCandidates(
  window: BrowserWindow,
  x: number,
  y: number
): Promise<{ values: string[]; sessionId?: string; fileName?: string; targeted?: boolean; suppressMenu?: boolean }> {
  if (window.isDestroyed()) return { values: [] }
  try {
    const result = await window.webContents.executeJavaScript(contextMenuTargetScript(x, y), true)
    if (!result || !Array.isArray(result.values)) return { values: [] }
    return {
      suppressMenu: result.suppressMenu === true,
      targeted: result.targeted === true,
      values: result.values.filter((value: unknown): value is string => typeof value === 'string'),
      fileName: typeof result.fileName === 'string' ? result.fileName : undefined,
      sessionId: typeof result.sessionId === 'string' ? result.sessionId : undefined
    }
  } catch {
    return { values: [] }
  }
}

export function installContextMenu(
  window: BrowserWindow,
  locale: () => 'en' | 'zh',
  resolveRoot?: (sessionId: string) => Promise<string | null>
): void {
  const installCapture = (): void => {
    if (!window.isDestroyed()) void window.webContents.executeJavaScript(contextMenuCaptureScript).catch(() => {})
  }
  window.webContents.on('dom-ready', installCapture)
  installCapture()
  ipcMain.removeHandler('ui:file-context-menu')
  registerTrustedMainWindowHandler(ipcMain, 'ui:file-context-menu', () => window,
    (_event, items: unknown) => new Promise<string | null>((resolve) => {
      const template = buildNativeFileMenu(items, resolve)
      if (template.length === 0 || window.isDestroyed()) { resolve(null); return }
      Menu.buildFromTemplate(template).popup({ window, callback: () => resolve(null) })
    }))
  window.webContents.on('context-menu', async (_event, params) => {
    const elementCandidates = await clickedElementPathCandidates(window, params.x, params.y)
    if (window.isDestroyed() || elementCandidates.suppressMenu && !params.isEditable) return
    // Workspace lookup failure must not suppress the standard context menu.
    const cwd = elementCandidates.sessionId
      ? await resolveRoot?.(elementCandidates.sessionId).catch(() => null)
      : undefined
    if (window.isDestroyed()) return
    let finderPath = resolveFinderPath(
      [...elementCandidates.values, params.linkURL, ...(elementCandidates.targeted ? [] : [params.selectionText])],
      existsSync, cwd
    )
    if (!finderPath && cwd && elementCandidates.sessionId && elementCandidates.fileName) {
      try {
        const request = JSON.stringify({sessionId: elementCandidates.sessionId, cwd, query: elementCandidates.fileName})
        const result = await window.webContents.executeJavaScript(`(async () => {
          const response = await fetch('/sidebar/api/fs.search', {
            method: 'POST', headers: {'content-type':'application/json'},
            body: ${JSON.stringify(request)}, signal: AbortSignal.timeout(2000)
          });
          const payload = await response.json();
          return response.ok && payload.ok ? payload.value : null;
        })()`)
        finderPath = generatedFileFinderPath(result, elementCandidates.fileName, cwd, existsSync)
      } catch { /* Keep the standard menu available if workspace search fails. */ }
    }
    if (window.isDestroyed()) return
    const template = buildContextMenuTemplate({ ...params, finderPath }, locale(), {
      openLink: (url) => {
        void openClientLink(window,url).catch(()=>{})
      },
      openDesktopLink: url=>{void shell.openExternal(url)},
      copyLink: (url) => clipboard.writeText(url),
      revealItem: (path) => shell.showItemInFolder(path),
      copyImage: () => {
        if (window.isDestroyed()) return
        window.webContents.copyImageAt(params.x, params.y)
      }
    })

    if(params.selectionText?.trim()&&params.selectionText.length<=600) {
      if(template.length)template.push({type:'separator'})
      template.push({label:locale()==='zh'?'记住选中内容':'Remember Selection',click:()=>{
        if(!window.isDestroyed())window.webContents.send('memory:save-selection',{content:params.selectionText,sessionId:elementCandidates.sessionId})
      }})
    }

    if (template.length === 0 || window.isDestroyed()) return
    Menu.buildFromTemplate(template).popup({ window })
  })
}

/** Native webpage views do not inherit their owner's WebContents menu. */
export function installWebPageContextMenu(contents:WebContents,owner:()=>BrowserWindow|undefined,locale:()=> 'en'|'zh',open:(url:string)=>void):void {
 contents.on('context-menu',(_event,params)=>{
  const window=owner();if(!window||window.isDestroyed()||contents.isDestroyed())return
  const template=buildContextMenuTemplate({...params,finderPath:''},locale(),{
   openLink:open,openDesktopLink:url=>{void shell.openExternal(url)},copyLink:url=>clipboard.writeText(url),
   copyImage:()=>{if(!contents.isDestroyed())contents.copyImageAt(params.x,params.y)},revealItem:()=>{}
  })
  if(template.length)Menu.buildFromTemplate(template).popup({window})
 })
}
