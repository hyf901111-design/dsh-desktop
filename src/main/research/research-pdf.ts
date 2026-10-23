import { createHash, randomUUID } from 'node:crypto'
import { BrowserWindow, session, type Session } from 'electron'

const MAX_HTML_BYTES = 4 * 1024 * 1024
const MAX_PDF_BYTES = 32 * 1024 * 1024
const MAX_TIMEOUT_MS = 45_000
const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

type ErrorCode = 'invalid-input' | 'busy' | 'timeout' | 'aborted' | 'unavailable' | 'render-failed'
export type ResearchPdfResult = { pdfBase64: string; sha256: string; bytes: number }

class ResearchPdfError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = 'ResearchPdfError' }
}

/** A one-job, offline print service. No account, default session or user file is accessible. */
export class ResearchPdfRenderer {
  private readonly timeoutMs: number
  private disposed = false
  private active?: { cancel(error: ResearchPdfError): void }

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? MAX_TIMEOUT_MS
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > MAX_TIMEOUT_MS) throw new Error('PDF 超时配置无效。')
  }

  async render(html: string, signal?: AbortSignal): Promise<ResearchPdfResult> {
    if (this.disposed) throw new ResearchPdfError('unavailable', 'PDF 生成服务未就绪。')
    if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new ResearchPdfError('invalid-input', 'PDF 仅接受不超过 4 MiB 的 HTML 内容。')
    if (signal?.aborted) throw new ResearchPdfError('aborted', 'PDF 生成已取消。')
    if (this.active) throw new ResearchPdfError('busy', 'PDF 生成忙碌，请稍后重试。')

    let window: BrowserWindow | undefined
    let isolated: Session | undefined
    let cancelled = false
    let rejectCancellation!: (error: ResearchPdfError) => void
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject })
    const active = { cancel: (error: ResearchPdfError) => {
      if (cancelled) return
      cancelled = true
      rejectCancellation(error)
      if (window && !window.isDestroyed()) window.destroy()
    } }
    this.active = active
    const abort = () => active.cancel(new ResearchPdfError('aborted', 'PDF 生成已取消。'))
    const timeout = setTimeout(() => active.cancel(new ResearchPdfError('timeout', 'PDF 生成超时。')), this.timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    const prevent = (event: { preventDefault(): void }) => event.preventDefault()
    const download = (event: { preventDefault(): void }, item: { cancel(): void }) => { event.preventDefault(); item.cancel() }

    // Start after the cancellation branch is attached, including synchronous Electron failures.
    const work = Promise.resolve().then(async () => {
      if (cancelled) throw new ResearchPdfError('aborted', 'PDF 生成已取消。')
      isolated = session.fromPartition(`research-pdf-${randomUUID()}`, { cache: false })
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      isolated.setPermissionCheckHandler(() => false)
      isolated.on('will-download', download)
      // The CSP precedes all caller markup; a later CSP cannot relax this policy.
      // Use an in-memory document so there is no file URL or temporary-file read capability.
      const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">${html}`
      const documentUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(document, 'utf8').toString('base64')}`
      isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !(details.resourceType === 'mainFrame' && details.url === documentUrl) }))
      window = new BrowserWindow({
        show: false, focusable: false, skipTaskbar: true, width: 1200, height: 1600, backgroundColor: '#ffffff',
        webPreferences: {
          session: isolated, javascript: false, nodeIntegration: false, nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, webSecurity: true,
          allowRunningInsecureContent: false, devTools: false, webviewTag: false, navigateOnDragDrop: false,
          backgroundThrottling: false
        }
      })
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', prevent)
      window.webContents.on('will-frame-navigate', prevent)
      window.webContents.on('will-redirect', prevent)
      window.webContents.on('will-attach-webview', prevent)
      await window.loadURL(documentUrl)
      if (cancelled) throw new ResearchPdfError('aborted', 'PDF 生成已取消。')
      const pdf = await window.webContents.printToPDF({
        pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 },
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="font-family:Arial,sans-serif;font-size:8px;color:#7c8792;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      })
      if (!Buffer.isBuffer(pdf) || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ResearchPdfError('render-failed', 'PDF 生成失败。')
      return { pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex'), bytes: pdf.length }
    })

    try { return await Promise.race([work, cancellation]) }
    catch (error) { throw error instanceof ResearchPdfError ? error : new ResearchPdfError('render-failed', 'PDF 生成失败。') }
    finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (window && !window.isDestroyed()) window.destroy()
      if (isolated) {
        isolated.removeListener('will-download', download)
        isolated.webRequest.onBeforeRequest(null)
        // Ephemeral session cleanup must not extend the hard job deadline.
        const completedSession = isolated
        void Promise.allSettled([
          () => completedSession.clearStorageData(), () => completedSession.clearCache(), () => completedSession.closeAllConnections()
        ].map(async cleanup => cleanup()))
      }
      if (this.active === active) this.active = undefined
    }
  }

  dispose(): void {
    this.disposed = true
    this.active?.cancel(new ResearchPdfError('aborted', 'PDF 生成已取消。'))
  }
}
