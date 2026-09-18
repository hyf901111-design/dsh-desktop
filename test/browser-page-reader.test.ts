import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const session = { on: vi.fn(), removeListener: vi.fn() }
  return { all: [] as any[], session, close: vi.fn(), script: vi.fn(), options: [] as any[], load: vi.fn(async () => {}) }
})
vi.mock('electron', () => ({
  session: { defaultSession: mocks.session, fromPartition: () => mocks.session },
  webContents: { getAllWebContents: () => mocks.all },
  BrowserWindow: class {
    constructor(options: any) { mocks.options.push(options) }
    isDestroyed() { return false }
    destroy = mocks.close
    loadURL = mocks.load
    webContents = { setWindowOpenHandler: vi.fn(), setAudioMuted: vi.fn(), on: vi.fn(), getURL: () => 'https://efund.feishu.cn/wiki/document', executeJavaScript: mocks.script }
  }
}))
import { readablePageUrl, pageNeedsLogin, readBrowserPage } from '../src/main/search/browser-page-reader'
afterEach(() => { vi.clearAllMocks(); mocks.all = []; mocks.options.length = 0 })
describe('conversation browser page reader', () => {
  it('only admits web URLs and excludes local application endpoints', () => {
    expect(readablePageUrl('https://efund.feishu.cn/wiki/document')).toBe('https://efund.feishu.cn/wiki/document')
    for (const url of ['file:///tmp/secret','http://127.0.0.1:9000','http://localhost','http://[::1]','https://user:pass@example.com']) expect(() => readablePageUrl(url)).toThrow()
  })
  it('distinguishes a short login wall from an article explaining login', () => {
    expect(pageNeedsLogin('请先登录后继续访问文档')).toBe(true)
    expect(pageNeedsLogin('登录说明。' + '这是使用手册正文。'.repeat(200))).toBe(false)
  })
  it('uses the open frame session but collects the full document in a disposable window', async () => {
    const url='https://efund.feishu.cn/wiki/document'
    const executeJavaScript=vi.fn(async()=>({title:'使用手册',sourceText:'只有前两章',scrollWidth:1000,clientWidth:1000}))
    mocks.all=[{session:mocks.session,isDestroyed:()=>false,mainFrame:{framesInSubtree:[{url,executeJavaScript}]}}]
    mocks.script.mockResolvedValueOnce({title:'使用手册',sourceText:'正文'.repeat(80),scrollWidth:1000,clientWidth:1000})
      .mockResolvedValueOnce({title:'使用手册',sourceText:'一二三章完整正文',complete:true,images:2})
    const result=await readBrowserPage(url,new AbortController().signal)
    expect(result.body.content).toContain('一二三章完整正文')
    expect(result.body.content).toContain('图片内文字未提取')
    expect(result.truncated).toBe(false)
    expect(executeJavaScript).toHaveBeenCalledOnce()
    expect(mocks.options[0].webPreferences.session).toBe(mocks.session)
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.session.removeListener).toHaveBeenCalledOnce()
  })
  it('marks incomplete traversal explicitly instead of certifying the first screen as full text', async () => {
    mocks.script.mockResolvedValueOnce({title:'手册',sourceText:'正文'.repeat(80),scrollWidth:1000,clientWidth:1000})
      .mockResolvedValueOnce({title:'手册',sourceText:'缺少末章',complete:false,missingHeadings:1})
    const result=await readBrowserPage('https://efund.feishu.cn/wiki/document',new AbortController().signal)
    expect(result.truncated).toBe(true)
    expect(result.body.content).toContain('正文收集不完整')
    expect(result.body.content).toContain('尚缺 1 个目录章节')
  })
  it('honors cancellation before reading an open page', async () => {
    const controller=new AbortController();controller.abort()
    await expect(readBrowserPage('https://efund.feishu.cn/wiki/document',controller.signal)).rejects.toThrow()
    expect(mocks.options).toHaveLength(0)
  })
})
