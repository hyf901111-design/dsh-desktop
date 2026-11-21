import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const listeners = new Set<(...args: any[]) => void>()
  const session = { on: (_event: string, listener: (...args: any[]) => void) => listeners.add(listener) }
  return { all: [] as any[], session, listeners, windows: [] as any[], close: vi.fn(), script: vi.fn(), options: [] as any[], load: vi.fn(async () => {}) }
})
vi.mock('electron', () => ({
  session: { defaultSession: mocks.session, fromPartition: () => mocks.session },
  webContents: { getAllWebContents: () => mocks.all },
  BrowserWindow: class {
    destroyed = false
    closed?: () => void
    constructor(options: any) { mocks.options.push(options); mocks.windows.push(this) }
    once(_event: string, listener: () => void) { this.closed = listener }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.closed?.(); mocks.close() }
    loadURL = mocks.load
    contents = { isDestroyed: () => this.destroyed, setWindowOpenHandler: vi.fn(), setAudioMuted: vi.fn(), on: vi.fn(), getURL: () => 'https://efund.feishu.cn/wiki/document', executeJavaScript: mocks.script }
    get webContents() { if (this.destroyed) throw Error('Object has been destroyed'); return this.contents }
  }
}))
import { readablePageUrl, pageNeedsLogin, readBrowserPage } from '../src/main/search/browser-page-reader'
afterEach(() => { vi.clearAllMocks(); mocks.all = []; mocks.options.length = 0; mocks.windows.length = 0; vi.useRealTimers() })
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
    expect(mocks.listeners.size).toBe(1)
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

  it('returns bounded observed links before the page body so source synthesis does not lose them',async()=>{
    const links=[{title:'公司发布最新经营与财务数据公告',date:'2026-10-20',url:'https://example.org/story/123'}]
    mocks.script.mockResolvedValueOnce({title:'公司公告',sourceText:'公告列表'.repeat(40),scrollWidth:1000,clientWidth:1000})
      .mockResolvedValueOnce({title:'公司公告',sourceText:'这是完整公告列表正文',complete:true,links})
    const result=await readBrowserPage('https://example.org/news',new AbortController().signal)
    const captured=result.body.content.match(/\[网页内链接记录\]\n([^\n]+)\n\[\/网页内链接记录\]/)?.[1]
    expect(JSON.parse(captured!)).toEqual({links})
    expect(result.body.content.indexOf('https://example.org/story/123')).toBeLessThan(result.body.content.indexOf('这是完整公告列表正文'))
    expect(result.truncated).toBe(false)
  })
})


it('exports the primary article record with the actual loaded URL before independent recommended-link records',async()=>{
 mocks.script.mockResolvedValueOnce({title:'主文',sourceText:'正文'.repeat(80),scrollWidth:1000,clientWidth:1000})
  .mockResolvedValueOnce({title:'政策解读 - 来源网站',sourceText:'主文完整正文',complete:true,article:{title:'煤电容量电价机制政策解读',date:'2026-01-30'},links:[{title:'另一条推荐记录',date:'2026-10-20',url:'https://example.org/recommended'}]})
 const result=await readBrowserPage('https://efund.feishu.cn/wiki/document',new AbortController().signal)
 const record=result.body.content.match(/\[网页主文记录\]\n([^\n]+)\n\[\/网页主文记录\]/)?.[1]
 expect(JSON.parse(record!)).toEqual({articles:[{title:'煤电容量电价机制政策解读',date:'2026-01-30',url:'https://efund.feishu.cn/wiki/document'}]})
 expect(result.body.content.indexOf('网页主文记录')).toBeLessThan(result.body.content.indexOf('网页内链接记录'))
})

it('isolates overlapping and late reader downloads, leaving a normal window on the same session free to save',async()=>{
 const blocked=(sender:unknown)=>{
  const event={preventDefault:vi.fn()}
  for (const listener of mocks.listeners) listener(event,{},sender)
  return event.preventDefault.mock.calls.length
 }
 const pending=()=>new Promise<void>(()=>{})
 mocks.load.mockImplementationOnce(pending).mockImplementationOnce(pending)
 const firstController=new AbortController(),secondController=new AbortController()
 const first=readBrowserPage('https://home.treasury.gov/first.csv',firstController.signal)
 const second=readBrowserPage('https://home.treasury.gov/second.csv',secondController.signal)
 const [one,two]=mocks.windows,oldSender=one.webContents,otherSender=two.webContents
 firstController.abort()
 expect(()=>one.webContents).toThrow('Object has been destroyed')
 expect(blocked(oldSender)).toBe(1);expect(blocked(otherSender)).toBe(1)
 expect(blocked({})).toBe(0);expect(blocked(undefined)).toBe(0)
 await expect(first).rejects.toMatchObject({name:'AbortError'})
 two.destroy()
 await expect(second).rejects.toThrow('could not load readable webpage')
 expect(blocked(otherSender)).toBe(1)
 expect(mocks.listeners.size).toBe(1)
})

it('settles the reader deadline even when the native navigation promise never finishes',async()=>{
 vi.useFakeTimers()
 mocks.load.mockImplementationOnce(()=>new Promise<void>(()=>{}))
 const read=readBrowserPage('https://home.treasury.gov/pending.csv',new AbortController().signal)
 const outcome=expect(read).rejects.toThrow('could not load readable webpage')
 await vi.advanceTimersByTimeAsync(90000)
 await outcome
 expect(mocks.close).toHaveBeenCalledOnce()
 expect(vi.getTimerCount()).toBe(0)
})

it.each(['ERR_ABORTED','ERR_FAILED'])('keeps the sender alive after %s until its attachment event',async code=>{
 vi.useFakeTimers()
 mocks.load.mockRejectedValueOnce(Object.assign(Error(code),{code}))
 const read=readBrowserPage('https://home.treasury.gov/rates.csv',new AbortController().signal)
 const result=expect(read).rejects.toThrow('could not load readable webpage')
 await vi.advanceTimersByTimeAsync(15)
 const reader=mocks.windows[0]
 expect(reader.isDestroyed()).toBe(false)
 const request={preventDefault:vi.fn()},other={preventDefault:vi.fn()}
 for(const listener of mocks.listeners){
   listener(other,{getURL:()=> 'https://home.treasury.gov/rates.csv'}, {})
   listener(request,{getURL:()=> 'https://home.treasury.gov/rates.csv'},reader.webContents)
 }
 await result
 expect(request.preventDefault).toHaveBeenCalledOnce();expect(other.preventDefault).not.toHaveBeenCalled()
 expect(reader.isDestroyed()).toBe(true);expect(vi.getTimerCount()).toBe(0)
})
