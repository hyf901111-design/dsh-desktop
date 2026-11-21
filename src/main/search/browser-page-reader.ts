import { BrowserWindow, webContents, session, type Session } from 'electron'
import { renderedPageContentScript } from './rendered-page-content'
import { inspectResearchWebContent, normalizeResearchLinkUrl } from '../state/research-link-frame'

export function readablePageUrl(value: unknown): string {
  const url = normalizeResearchLinkUrl(value)
  if (!url) throw Error('Only HTTP(S) webpage URLs are supported.')
  const host = new URL(url).hostname
  if (/^(localhost|127\.|0\.|169\.254\.|\[::|\[fe80:)/i.test(host)) throw Error('Local application endpoints cannot be read as webpages.')
  return url
}
export function pageNeedsLogin(text: string) {
  return text.trim().length < 1200 && /扫码登录|登录飞书|扫码成功|(?:登录|sign in|log in|扫码).{0,35}(?:访问|继续|查看|账户|account)|(?:请先|需要|立即).{0,12}登录/i.test(text)
}
type PageContent = { url: string; title: string; sourceText: string; complete: boolean; images?: number; missingHeadings?: number; article?: { title: string; date: string }; links?: { title: string; url: string; date?: string }[] }
function pageArticleRecord(page: PageContent) {
  const article = page.article
  if (!article || typeof article.title !== 'string' || !article.title.trim() || article.title.length > 256 || /[\r\n]/.test(article.title) || typeof article.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(article.date) || !Number.isFinite(Date.parse(article.date)) || new Date(article.date).toISOString().slice(0, 10) !== article.date) return ''
  let url: string; try { url = readablePageUrl(page.url) } catch { return '' }
  return `[网页主文记录]\n${JSON.stringify({ articles: [{ title: article.title, date: article.date, url }] })}\n[/网页主文记录]\n\n`
}
function pageLinkRecords(page: PageContent) {
  if (!Array.isArray(page.links)) return ''
  const links: NonNullable<PageContent['links']> = []
  let bytes = 0
  for (const link of page.links.slice(0, 200)) {
    if (!link || typeof link.title !== 'string' || !link.title.trim() || link.title.length > 256 || typeof link.url !== 'string' || link.url.length > 2048) continue
    let url: string; try { url = readablePageUrl(link.url) } catch { continue }
    const date = typeof link.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(link.date) && Number.isFinite(Date.parse(link.date)) && new Date(link.date).toISOString().slice(0, 10) === link.date ? link.date : undefined
    const value = { title: link.title, url, ...(date ? { date } : {}) }
    bytes += Buffer.byteLength(JSON.stringify(value)); if (bytes > 50_000) break
    links.push(value)
  }
  return links.length ? `[网页内链接记录]\n${JSON.stringify({ links })}\n[/网页内链接记录]\n\n` : ''
}
// Chromium may dispatch a download after its originating window has closed.
// Keep one listener per Session and identify only disposable reader contents,
// without dereferencing destroyed native objects or retaining past windows.
const readerSessions = new WeakSet<Session>()
const readerContents = new WeakMap<Electron.WebContents, () => void>()
function preventReaderDownloads(browserSession: Session, contents: Electron.WebContents, onDownload: () => void) {
  readerContents.set(contents,onDownload)
  if (readerSessions.has(browserSession)) return
  browserSession.on('will-download', (event, _item, sender) => {
    const handled = readerContents.get(sender)
    if (handled) { event.preventDefault(); handled() }
  })
  readerSessions.add(browserSession)
}

export async function readBrowserPage(rawUrl: string, signal: AbortSignal) {
  const url = readablePageUrl(rawUrl)
  signal.throwIfAborted()
  const result = (page: PageContent) => ({ url: page.url, statusCode: 200,
    body: { kind: 'text' as const, content: `${page.title.replace(/\s+/g, ' ').slice(0, 512)}\n\n[网页读取状态：${page.complete ? '已滚动至文末，完成正文收集' : '正文收集不完整，请勿当作全文'}${page.images ? `；含 ${page.images} 张图片，图片内文字未提取` : ''}${page.missingHeadings ? `；尚缺 ${page.missingHeadings} 个目录章节` : ''}]\n\n${pageArticleRecord(page)}${pageLinkRecords(page)}${page.sourceText}` },
    truncated: !page.complete || page.sourceText.length >= 120000 })
  let best: PageContent | null = null
  const sessions: Session[] = []
  // Reuse authentication, but do not move the user's live canvas viewport.
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    for (const frame of contents.mainFrame.framesInSubtree) {
      if (normalizeResearchLinkUrl(frame.url)?.split('#')[0] !== url.split('#')[0]) continue
      if (contents.session && !sessions.includes(contents.session)) sessions.push(contents.session)
      signal.throwIfAborted()
      const page = await inspectResearchWebContent(frame, () => frame.url)
      if (page?.sourceText && !pageNeedsLogin(page.sourceText)) best = { ...page, complete: false }
    }
  }
  for (const candidate of [session.defaultSession, session.fromPartition('persist:research-web-pages')]) if (!sessions.includes(candidate)) sessions.push(candidate)
  for (const browserSession of sessions) {
    signal.throwIfAborted()
    const window = new BrowserWindow({ show: false, width: 1100, height: 900, webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } })
    const contents = window.webContents
    const close = () => { if (!window.isDestroyed()) window.destroy() }
    const closed = new Promise<void>(resolve => window.once('closed', () => resolve()))
    const downloaded = new Promise<void>(resolve => preventReaderDownloads(browserSession, contents, resolve))
    const timeout = setTimeout(close, 90_000)
    signal.addEventListener('abort', close, { once: true })
    const collect = async () => {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      contents.setAudioMuted(true)
      const guard = (event: { preventDefault(): void }, target: string) => { try { readablePageUrl(target) } catch { event.preventDefault() } }
      contents.on('will-navigate', guard)
      contents.on('will-redirect', guard)
      await window.loadURL(url)
      // Wait for the SPA shell to become a document, then traverse its real scrollport.
      for (let attempt = 0; attempt < 20 && !contents.isDestroyed(); attempt++) {
        signal.throwIfAborted()
        const page = await inspectResearchWebContent(contents, () => contents.getURL())
        if (contents.isDestroyed() || page?.sourceText && pageNeedsLogin(page.sourceText)) return
        if (page && page.sourceText.length > 100) {
          const collected = await contents.executeJavaScript(renderedPageContentScript())
          signal.throwIfAborted()
          if (contents.isDestroyed() || typeof collected?.sourceText !== 'string') return
          const full: PageContent = { ...collected, url: readablePageUrl(contents.getURL()) }
          if (!pageNeedsLogin(full.sourceText)) return full
          return
        }
        await new Promise(resolve => setTimeout(resolve, 400))
      }
    }
    try {
      const full = await Promise.race([collect(), closed])
      signal.throwIfAborted()
      if (full && full.complete) return result(full)
      if (full && (!best || full.sourceText.length > best.sourceText.length)) best = full
    } catch (error) {
      signal.throwIfAborted()
      // Attachments abort navigation before Chromium emits will-download.
      // Keep the real sender alive until that event, or settle a plain abort.
      const navigationError = (error as {code?:string})?.code
      if (navigationError === 'ERR_ABORTED' || navigationError === 'ERR_FAILED') {
        let grace: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([downloaded,closed,new Promise<void>(resolve => { grace = setTimeout(resolve,1200) })]) }
        finally { clearTimeout(grace) }
      }
    }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', close); close() }
  }
  signal.throwIfAborted()
  if (best?.sourceText) return result(best)
  throw Error('The browser could not load readable webpage content. Open the URL in a research link component to inspect it.')
}
