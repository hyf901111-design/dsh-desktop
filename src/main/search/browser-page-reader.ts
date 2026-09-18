import { BrowserWindow, webContents } from 'electron'
import { inspectResearchWebContent, normalizeResearchLinkUrl } from '../state/research-link-frame'

export function readablePageUrl(value: unknown): string {
  const url = normalizeResearchLinkUrl(value)
  if (!url) throw Error('Only HTTP(S) webpage URLs are supported.')
  const host = new URL(url).hostname
  if (/^(localhost|127\.|0\.|169\.254\.|\[::|\[fe80:)/i.test(host)) throw Error('Local application endpoints cannot be read as webpages.')
  return url
}
export function pageNeedsLogin(text: string) {
  return text.trim().length < 1200 && /(?:登录|sign in|log in|扫码).{0,35}(?:访问|继续|查看|账户|account)|(?:请先|需要|立即).{0,12}登录/i.test(text)
}
export async function readBrowserPage(rawUrl: string, signal: AbortSignal) {
  const url = readablePageUrl(rawUrl)
  const result = (page: { url: string; title: string; sourceText: string }) => ({ url: page.url, statusCode: 200, body: { kind: 'text' as const, content: `${page.title}\n\n${page.sourceText}` }, truncated: page.sourceText.length >= 120000 })
  // A page already open in a canvas has the exact document and login context the user sees.
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    for (const frame of contents.mainFrame.framesInSubtree) {
      if (normalizeResearchLinkUrl(frame.url) !== url) continue
      signal.throwIfAborted()
      const page = await inspectResearchWebContent(frame, () => frame.url)
      if (page?.sourceText && !pageNeedsLogin(page.sourceText)) return result(page)
    }
  }
  let last: Awaited<ReturnType<typeof inspectResearchWebContent>> = null
  // Iframe link components use the default session; native link surfaces use this persistent partition.
  for (const partition of [undefined, 'persist:research-web-pages']) {
    signal.throwIfAborted()
    const window = new BrowserWindow({ show: false, width: 1100, height: 900, webPreferences: { ...(partition ? { partition } : {}), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } })
    const close = () => { if (!window.isDestroyed()) window.destroy() }
    const timeout = setTimeout(close, 20000)
    signal.addEventListener('abort', close, { once: true })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.setAudioMuted(true)
    if (partition) {
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      window.webContents.session.setPermissionCheckHandler(() => false)
    }
    const preventDownload = (event: Electron.Event, _item: Electron.DownloadItem, contents: Electron.WebContents) => { if (contents === window.webContents) event.preventDefault() }
    const browserSession = window.webContents.session
    browserSession.on('will-download', preventDownload)
    const guard = (event: { preventDefault(): void }, target: string) => { try { readablePageUrl(target) } catch { event.preventDefault() } }
    window.webContents.on('will-navigate', guard)
    window.webContents.on('will-redirect', guard)
    try {
      await window.loadURL(url)
      let previous = '', stable = 0
      for (let attempt = 0; attempt < 20 && !window.isDestroyed(); attempt++) {
        signal.throwIfAborted()
        const page = await inspectResearchWebContent(window.webContents, () => window.webContents.getURL())
        if (page?.sourceText) {
          last = page
          stable = page.sourceText === previous ? stable + 1 : 0
          previous = page.sourceText
          if (page.sourceText.length > 100 && stable >= 2 && !pageNeedsLogin(page.sourceText)) return result(page)
        }
        await new Promise(resolve => setTimeout(resolve, 400))
      }
    } catch (error) { if (signal.aborted) throw error } finally { browserSession.removeListener('will-download', preventDownload); clearTimeout(timeout); signal.removeEventListener('abort', close); close() }
  }
  signal.throwIfAborted()
  if (last?.sourceText) return result(last)
  throw Error('The browser could not load readable webpage content. Open the URL in a research link component to inspect it.')
}
