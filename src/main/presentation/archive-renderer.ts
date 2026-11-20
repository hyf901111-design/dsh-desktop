import { app, BrowserWindow, session } from 'electron'
import { handleEditorAsset } from './protocol'
import type { Deck } from './store'

export async function renderPresentationArchive(deck: Deck, format: 'pptx' | 'pdf', assetRoot = app.getAppPath()) {
  const isolated = session.fromPartition('odyssey-presentation-archive', { cache: false })
  if (!isolated.protocol.isProtocolHandled('odyssey-presentation')) {
    isolated.protocol.handle('odyssey-presentation', request => handleEditorAsset(assetRoot, request))
    isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
    isolated.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*'] },
      (_request, reply) => reply({ cancel: true }))
  }
  const window = new BrowserWindow({
    show: false, width: 960, height: 720,
    webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  const timeout = setTimeout(() => { if (!window.isDestroyed()) window.destroy() }, 120_000)
  try {
    await window.loadURL('odyssey-presentation://editor/index.html?archive')
    const result = await window.webContents.executeJavaScript(
      'window.renderPresentationArchive(' + JSON.stringify(deck) + ',' + JSON.stringify(format) + ')')
    if (format === 'pptx') {
      if (!(result instanceof ArrayBuffer) || !result.byteLength) throw Error('未能生成 PowerPoint。')
      return Buffer.from(result)
    }
    if (result !== deck.slides.length) throw Error('幻灯片未能全部载入，请重新保存。')
    return await window.webContents.printToPDF({
      preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  } finally {
    clearTimeout(timeout)
    if (!window.isDestroyed()) window.destroy()
  }
}
