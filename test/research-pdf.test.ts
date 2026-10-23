import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchPdfRenderer } from '../src/main/research/research-pdf'

const mock = vi.hoisted(() => ({ windows: [] as any[], sessions: [] as any[], load: undefined as undefined | (() => Promise<void>), print: undefined as undefined | (() => Promise<Buffer>) }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    session: { fromPartition: vi.fn((partition, options) => {
      const value = Object.assign(new EventEmitter(), {
        partition, options, webRequest: { onBeforeRequest: vi.fn() },
        setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
        clearStorageData: vi.fn(async () => {}), clearCache: vi.fn(async () => {}), closeAllConnections: vi.fn(async () => {})
      })
      mock.sessions.push(value)
      return value
    }) },
    BrowserWindow: class extends EventEmitter {
      options: any
      destroyed = false
      webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler: vi.fn(),
        printToPDF: vi.fn(() => mock.print?.() ?? Promise.resolve(Buffer.from('%PDF-1.7\nreport\n%%EOF')))
      })
      loadURL = vi.fn(async (_url: string) => { await mock.load?.() })
      constructor(options: any) { super(); this.options = options; mock.windows.push(this) }
      isDestroyed() { return this.destroyed }
      destroy() { this.destroyed = true; this.emit('closed') }
    }
  }
})

const renderers: ResearchPdfRenderer[] = []
beforeEach(() => { mock.windows = []; mock.sessions = []; mock.load = undefined; mock.print = undefined })
afterEach(() => { for (const renderer of renderers.splice(0)) renderer.dispose() })
function renderer(timeoutMs = 1000) { const value = new ResearchPdfRenderer({ timeoutMs }); renderers.push(value); return value }

describe('isolated research report PDF renderer', () => {
  it('prints the supplied HTML in a hidden sandbox and returns verified bytes and digest', async () => {
    const service = renderer()
    const pdf = Buffer.from('%PDF-1.7\nreport\n%%EOF')
    const result = await service.render('<!doctype html><html><head><style>h1{color:#005096}</style></head><body><h1>研究报告</h1><svg><text>现金流</text></svg></body></html>')
    expect(result).toEqual({ pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex'), bytes: pdf.length })
    const window = mock.windows[0], isolated = mock.sessions[0]
    expect(window.options).toMatchObject({ show: false, focusable: false, skipTaskbar: true, webPreferences: { session: isolated, javascript: false, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false } })
    expect(isolated.partition).not.toMatch(/^persist:/)
    expect(isolated.options).toEqual({ cache: false })
    const document = Buffer.from(window.loadURL.mock.calls[0][0].split(',')[1], 'base64').toString('utf8')
    expect(document.indexOf('Content-Security-Policy')).toBeLessThan(document.indexOf('研究报告'))
    expect(document).toContain("default-src 'none'")
    expect(document).toContain('<svg>')
    expect(window.webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, footerTemplate: expect.stringContaining('pageNumber') }))
    expect(window.destroyed).toBe(true)
    expect(isolated.clearStorageData).toHaveBeenCalled()
    await service.render('<h1>第二份报告</h1>')
    expect(mock.sessions[1].partition).not.toEqual(isolated.partition)
  })

  it('denies external and file resources, child documents, navigation, windows, permissions and downloads', async () => {
    await renderer().render('<h1>报告</h1>')
    const window = mock.windows[0], isolated = mock.sessions[0]
    const intercept = isolated.webRequest.onBeforeRequest.mock.calls[0][0]
    for (const [url, resourceType] of [['https://example.com/data', 'image'], ['http://127.0.0.1/private', 'xhr'], ['file:///private/data', 'image'], ['data:text/html,child', 'subFrame']]) {
      const callback = vi.fn(); intercept({ url, resourceType }, callback); expect(callback).toHaveBeenCalledWith({ cancel: true })
    }
    const popup = window.webContents.setWindowOpenHandler.mock.calls[0][0]
    expect(popup({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    const permission = isolated.setPermissionRequestHandler.mock.calls[0][0], callback = vi.fn()
    permission(null, 'media', callback); expect(callback).toHaveBeenCalledWith(false)
    expect(isolated.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false)
    // Recreate a pending render so its event guards have not yet been removed by cleanup.
    mock.load = () => new Promise(() => {})
    const controller = new AbortController(), pending = renderer().render('<h1>报告</h1>', controller.signal)
    await Promise.resolve()
    const active = mock.windows[1], activeSession = mock.sessions[1]
    for (const eventName of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
      const preventDefault = vi.fn(); active.webContents.emit(eventName, { preventDefault }); expect(preventDefault).toHaveBeenCalled()
    }
    const preventDefault = vi.fn(), cancel = vi.fn()
    activeSession.emit('will-download', { preventDefault }, { cancel })
    expect(preventDefault).toHaveBeenCalled(); expect(cancel).toHaveBeenCalled()
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })

  it('rejects blank, non-string and oversized HTML without opening a renderer', async () => {
    const service = renderer()
    for (const html of ['', ' ', null, '中'.repeat(1_398_102)]) await expect(service.render(html as string)).rejects.toMatchObject({ code: 'invalid-input' })
    expect(mock.windows).toHaveLength(0)
  })

  it('rejects concurrent jobs, cancels hung loading on timeout and releases the slot', async () => {
    mock.load = () => new Promise(() => {})
    const service = renderer(20), pending = service.render('<h1>报告</h1>')
    await expect(service.render('<h1>另一份</h1>')).rejects.toMatchObject({ code: 'busy' })
    await expect(pending).rejects.toMatchObject({ code: 'timeout' })
    expect(mock.windows).toHaveLength(1); expect(mock.windows[0].destroyed).toBe(true)
    mock.load = undefined
    expect((await service.render('<h1>重试</h1>')).bytes).toBeGreaterThan(0)
  })

  it('aborts printing, cleans up the window and refuses work after disposal', async () => {
    mock.print = () => new Promise(() => {})
    const service = renderer(), controller = new AbortController()
    const pending = service.render('<h1>报告</h1>', controller.signal)
    await new Promise(resolve => setTimeout(resolve, 0))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    expect(mock.windows[0].destroyed).toBe(true)
    mock.print = undefined
    service.dispose()
    await expect(service.render('<h1>报告</h1>')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('disposes an active job without leaving the hidden window alive', async () => {
    mock.load = () => new Promise(() => {})
    const service = renderer(), pending = service.render('<h1>报告</h1>')
    await Promise.resolve()
    service.dispose()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    expect(mock.windows[0].destroyed).toBe(true)
    expect(mock.sessions[0].closeAllConnections).toHaveBeenCalled()
  })

  it('rejects invalid or oversized PDF bytes and sanitizes Chromium failures after cleanup', async () => {
    const service = renderer()
    for (const data of [Buffer.from('not a PDF'), Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(32 * 1024 * 1024)])]) {
      mock.print = async () => data
      await expect(service.render('<h1>报告</h1>')).rejects.toMatchObject({ code: 'render-failed', message: 'PDF 生成失败。' })
      expect(mock.windows.at(-1).destroyed).toBe(true)
    }
    mock.load = async () => { throw Error('/private/credentials should never escape') }
    await expect(service.render('<h1>报告</h1>')).rejects.toMatchObject({ code: 'render-failed', message: 'PDF 生成失败。' })
    expect(mock.windows.at(-1).destroyed).toBe(true)
    mock.load = undefined
    mock.print = async () => { throw Error('/private/print-error should never escape') }
    await expect(service.render('<h1>报告</h1>')).rejects.toMatchObject({ code: 'render-failed', message: 'PDF 生成失败。' })
    expect(mock.windows.at(-1).destroyed).toBe(true)
  })
})
