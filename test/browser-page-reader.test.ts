import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ all: [] as any[] }))
vi.mock('electron', () => ({ BrowserWindow: vi.fn(), webContents: { getAllWebContents: () => mocks.all } }))
import { readablePageUrl, pageNeedsLogin, readBrowserPage } from '../src/main/search/browser-page-reader'
describe('conversation browser page reader', () => {
  it('only admits web URLs and excludes local application endpoints', () => {
    expect(readablePageUrl('https://efund.feishu.cn/wiki/document')).toBe('https://efund.feishu.cn/wiki/document')
    for (const url of ['file:///tmp/secret','http://127.0.0.1:9000','http://localhost','http://[::1]','https://user:pass@example.com']) expect(() => readablePageUrl(url)).toThrow()
  })
  it('distinguishes a short login wall from an article explaining login', () => {
    expect(pageNeedsLogin('请先登录后继续访问文档')).toBe(true)
    expect(pageNeedsLogin('登录说明。' + '这是使用手册正文。'.repeat(200))).toBe(false)
  })
  it('reuses the actual rendered document from a matching open link frame', async () => {
    const url='https://efund.feishu.cn/wiki/document'
    const executeJavaScript=vi.fn(async()=>({title:'使用手册',sourceText:'客户端已登录后的文档正文',scrollWidth:1000,clientWidth:1000}))
    mocks.all=[{isDestroyed:()=>false,mainFrame:{framesInSubtree:[{url,executeJavaScript}]}}]
    const result=await readBrowserPage(url,new AbortController().signal)
    expect(result.body.content).toContain('客户端已登录后的文档正文')
    expect(result.url).toBe(url)
    expect(executeJavaScript).toHaveBeenCalledOnce()
  })
  it('honors cancellation before reading an open page', async () => {
    const controller=new AbortController();controller.abort()
    await expect(readBrowserPage('https://efund.feishu.cn/wiki/document',controller.signal)).rejects.toThrow()
  })
})
