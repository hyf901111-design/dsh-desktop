import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import {
  BrowserSearchController,
  browserSearchWindowOptions,
  configureBrowserSearchSecurity,
  type BrowserSearchWindow
} from '../src/main/search/browser-search-controller'

type PageState = { url: string; title: string; text: string; noResults?: boolean }

class FakeSearchWindow implements BrowserSearchWindow {
  readonly loaded: string[] = []
  readonly webContents: BrowserSearchWindow['webContents']
  visible = false
  destroyed = false
  stopped = false
  title = ''
  activeLoads = 0
  maxActiveLoads = 0
  currentUrl = ''
  pageStates: PageState[] = []
  lastPageState?: PageState
  results = new Map<string, unknown[]>()
  loadBarrier?: Promise<void>

  constructor() {
    this.webContents = {
      executeJavaScript: async (script) => {
        if (script.includes('document.body?.innerText')) {
          this.lastPageState = this.pageStates.shift() ?? { url: this.currentUrl, title: 'Search results', text: 'ordinary results' }
          return this.lastPageState
        }
        const engine = this.currentUrl.includes('bing.com') ? 'bing' : 'duckduckgo'
        const candidates = this.results.get(engine) ?? []
        return script.includes('documentQuery:') ? { url: this.currentUrl, title: this.lastPageState?.title ?? '', documentQuery: new URL(this.currentUrl).searchParams.get('q'), candidates, noResults: this.lastPageState?.noResults ?? false } : candidates
      },
      getURL: () => this.currentUrl,
      stop: () => {
        if (this.destroyed) throw new Error('Object has been destroyed')
        this.stopped = true
      }
    }
  }

  async loadURL(url: string): Promise<void> {
    if (this.destroyed) throw new Error('Object has been destroyed')
    this.loaded.push(url)
    this.currentUrl = url
    this.activeLoads += 1
    this.maxActiveLoads = Math.max(this.maxActiveLoads, this.activeLoads)
    await this.loadBarrier
    this.activeLoads -= 1
  }

  show(): void {
    this.visible = true
  }

  hide(): void {
    this.visible = false
  }

  setTitle(title: string): void {
    this.title = title
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    this.destroyed = true
  }
}

describe('BrowserSearchController', () => {
  it('requests a hidden sandboxed window in a non-persistent partition', () => {
    expect(browserSearchWindowOptions()).toMatchObject({
      show: false,
      title: 'EWork Odyssey Web Search',
      webPreferences: {
        partition: 'sherlock-web-search',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    })
    expect(browserSearchWindowOptions().webPreferences?.preload).toBeUndefined()
  })

  it('denies permissions, popups, downloads, and audio in the search session', async () => {
    let permissionDecision: ((allowed: boolean) => void) | undefined
    let permissionCheck: (() => boolean) | undefined
    let downloadHandler: ((event: { preventDefault(): void }) => void) | undefined
    let popupHandler: (() => { action: string }) | undefined
    let audioMuted = false
    const searchSession = {
      setPermissionRequestHandler: (
        handler: (_webContents: unknown, _permission: string, decide: (allowed: boolean) => void) => void
      ) => {
        handler(undefined, 'geolocation', (allowed) => {
          permissionDecision?.(allowed)
        })
      },
      setPermissionCheckHandler: (handler: () => boolean) => {
        permissionCheck = handler
      },
      on: (_event: 'will-download', handler: (event: { preventDefault(): void }) => void) => {
        downloadHandler = handler
      }
    }
    const window = {
      webContents: {
        setWindowOpenHandler: (handler: () => { action: string }) => {
          popupHandler = handler
        },
        setAudioMuted: (muted: boolean) => {
          audioMuted = muted
        }
      }
    }
    const permissionResult = new Promise<boolean>((resolve) => {
      permissionDecision = resolve
    })

    configureBrowserSearchSecurity(window, searchSession)

    let downloadPrevented = false
    downloadHandler?.({ preventDefault: () => (downloadPrevented = true) })
    await expect(permissionResult).resolves.toBe(false)
    expect(permissionCheck?.()).toBe(false)
    expect(popupHandler?.()).toEqual({ action: 'deny' })
    expect(downloadPrevented).toBe(true)
    expect(audioMuted).toBe(true)
  })

  it('tries the secondary engine when the first page has no usable sources', async () => {
    const window = new FakeSearchWindow()
    window.results.set('duckduckgo', [])
    window.results.set('bing', [
      { title: 'Bing result', url: 'https://example.com/result', snippet: 'summary' }
    ])
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('latest earnings', 5)).resolves.toMatchObject({
      sources: [
        { title: 'Bing result', url: 'https://example.com/result', snippet: 'summary' }
      ],
      truncated: false
    })
    expect(window.loaded).toEqual([
      'https://html.duckduckgo.com/html/?q=latest+earnings',
      'https://www.bing.com/search?q=latest+earnings'
    ])
  })

  it('stops a stalled navigation and tries the secondary engine', async () => {
    const window = new FakeSearchWindow()
    const normalLoad = window.loadURL.bind(window)
    let firstLoad = true
    window.loadURL = async (url: string) => {
      if (firstLoad) {
        firstLoad = false
        window.loaded.push(url)
        window.currentUrl = url
        await new Promise<void>(() => undefined)
      }
      await normalLoad(url)
    }
    window.results.set('bing', [
      { title: 'Fallback result', url: 'https://example.com/fallback', snippet: 'summary' }
    ])
    const controller = new BrowserSearchController({
      createWindow: () => window,
      navigationTimeoutMs: 5
    })

    await expect(controller.search('stalled first engine', 5)).resolves.toMatchObject({
      sources: [
        {
          title: 'Fallback result',
          url: 'https://example.com/fallback',
          snippet: 'summary'
        }
      ],
      truncated: false
    })
    expect(window.stopped).toBe(true)
    expect(window.loaded).toEqual([
      'https://html.duckduckgo.com/html/?q=stalled+first+engine',
      'https://www.bing.com/search?q=stalled+first+engine'
    ])
  })

  it('retries the allowed regional Bing entry when the global entry cannot connect', async () => {
    const window = new FakeSearchWindow()
    const load = window.loadURL.bind(window)
    window.loadURL = async (url) => {
      if (new URL(url).hostname === 'www.bing.com') {
        window.loaded.push(url)
        throw new Error('net::ERR_CONNECTION_TIMED_OUT')
      }
      await load(url)
    }
    window.results.set('bing', [{ title: 'ETF', url: 'https://example.cn/510300' }])
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('沪深300ETF 510300', 5)).resolves.toMatchObject({
      sources: [{ title: 'ETF', url: 'https://example.cn/510300' }]
    })
    expect(window.loaded.map((url) => new URL(url).hostname)).toEqual(['www.bing.com', 'cn.bing.com'])
    expect(new URL(window.loaded[1]!).searchParams.get('q')).toBe('沪深300ETF 510300')
  })

  it('waits briefly for rendered results instead of treating the first empty DOM as failure', async () => {
    const window = new FakeSearchWindow()
    let waits = 0
    const controller = new BrowserSearchController({
      createWindow: () => window,
      sleep: async () => {
        waits += 1
        window.results.set('bing', [{ title: '已加载', url: 'https://example.cn/loaded' }])
      }
    })

    await expect(controller.search('基金净值', 5)).resolves.toMatchObject({
      sources: [{ title: '已加载', url: 'https://example.cn/loaded' }]
    })
    expect(waits).toBe(1)
    expect(window.loaded).toHaveLength(1)
  })

  it('reports an explicit no-results page as no_results without inventing a source', async () => {
    const window = new FakeSearchWindow()
    const execute = window.webContents.executeJavaScript
    window.webContents.executeJavaScript = async (script) => script.includes('document.body?.innerText')
      ? { url: window.currentUrl, title: '搜索', text: '没有找到相关结果', noResults: true }
      : script.includes('documentQuery:') ? {url:window.currentUrl,title:'搜索',documentQuery:new URL(window.currentUrl).searchParams.get('q'),candidates:[],noResults:true} : execute(script)
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('不存在的搜索词', 5)).resolves.toMatchObject({
      status: 'no_results', sources: [], truncated: false, content: expect.stringContaining('未找到')
    })
    expect(window.loaded).toHaveLength(2)
  })

  it('recognizes actual engine no-results markup but not a result snippet saying no results', async () => {
    const page = new Window({ url: 'https://www.bing.com/search?q=test' })
    let noResults = true
    const controller = new BrowserSearchController({ createWindow: () => {
      const window = new FakeSearchWindow()
      const load = window.loadURL.bind(window)
      window.loadURL = async (url) => {
        await load(url)
        page.happyDOM.setURL(url)
        page.document.body.innerHTML = noResults
          ? '<ol id="b_results"><li class="b_no">没有找到相关结果</li></ol>'
          : '<ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/report">报告</a></h2><div class="b_caption"><p>No results is the reported status.</p></div></li></ol>'
        const input=page.document.createElement('input');input.id='sb_form_q';input.name='q';input.value=new URL(url).searchParams.get('q')??'';page.document.body.prepend(input)
      }
      window.webContents.executeJavaScript = async (script) => page.eval(script)
      return window
    } })
    try {
      await expect(controller.search('test', 5)).resolves.toMatchObject({ status: 'no_results', sources: [] })
      noResults = false
      await expect(controller.search('报告', 5)).resolves.toMatchObject({ sources: [{ url: 'https://example.com/report' }] })
    } finally {
      await page.happyDOM.close()
    }
  })

  it('keeps connection failures distinct from a successful empty search', async () => {
    const window = new FakeSearchWindow()
    window.loadURL = async (url) => { window.loaded.push(url); throw new Error('net::ERR_CERT_COMMON_NAME_INVALID') }
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('基金净值', 5)).rejects.toThrow('搜索引擎暂时无法连接')
    expect(window.loaded).toHaveLength(3)
    expect(window.destroyed).toBe(true)
  })

  it('bounds an unrecognized empty page instead of returning a fabricated no-results state', async () => {
    const window = new FakeSearchWindow()
    let waits = 0
    const controller = new BrowserSearchController({ createWindow: () => window, sleep: async () => { waits += 1 } })

    await expect(controller.search('基金净值', 5)).rejects.toThrow('未能读取搜索结果')
    expect(window.loaded).toHaveLength(3)
    expect(waits).toBeLessThanOrEqual(9)
  })

  it('does not accept stale results from a different query after navigation', async () => {
    const window = new FakeSearchWindow()
    window.loadURL = async (url) => {
      window.loaded.push(url)
      window.currentUrl = 'https://www.bing.com/search?q=old-query'
    }
    window.results.set('bing', [{ title: '旧数据', url: 'https://example.com/stale' }])
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('新查询', 5)).rejects.toThrow('未能读取搜索结果')
  })

  it('bounds a stalled extraction script and keeps the search queue usable', async () => {
    const window = new FakeSearchWindow()
    const replacement = new FakeSearchWindow()
    replacement.results.set('bing', [{ url: 'https://example.cn/recovered' }])
    const windows = [window, replacement]
    window.webContents.executeJavaScript = async () => new Promise(() => undefined)
    const controller = new BrowserSearchController({ createWindow: () => windows.shift()!, scriptTimeoutMs: 5 })

    await expect(controller.search('查询', 5)).rejects.toThrow('未能读取搜索结果')
    expect(window.destroyed).toBe(true)
    await expect(controller.search('恢复', 5)).resolves.toMatchObject({ sources: [{ url: 'https://example.cn/recovered' }] })
  })

  it('skips a challenged engine without showing a window and uses the next provider', async () => {
    const window = new FakeSearchWindow()
    window.pageStates = [
      {
        url: 'https://www.bing.com/turing/captcha/challenge',
        title: 'Human Verification',
        text: 'verify you are a human'
      },
      {
        url: 'https://www.bing.com/search?q=%E8%8B%B9%E6%9E%9C',
        title: '苹果 - Search',
        text: 'ordinary results'
      }
    ]
    window.results.set('duckduckgo', [
      { title: 'Result', url: 'https://example.cn/result', snippet: 'summary' }
    ])
    const visibility: boolean[] = []
    const controller = new BrowserSearchController({
      createWindow: () => window,
      sleep: async () => {
        visibility.push(window.visible)
      }
    })

    await controller.search('苹果', 5)

    expect(visibility).toEqual([])
    expect(window.loaded.some(url => url.includes('duckduckgo'))).toBe(true)
    expect(window.visible).toBe(false)
  })

  it('stops before navigation when the caller is already aborted', async () => {
    const window = new FakeSearchWindow()
    const controller = new BrowserSearchController({ createWindow: () => window })
    const abort = new AbortController()
    abort.abort(new Error('cancelled'))

    await expect(controller.search('cancel me', 5, abort.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
    expect(window.loaded).toEqual([])
  })

  it('serializes concurrent searches through one browser session', async () => {
    const window = new FakeSearchWindow()
    const replacement = new FakeSearchWindow()
    let releaseFirst!: () => void
    window.loadBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    for (const frame of [window, replacement]) frame.results.set('duckduckgo', [
      { title: 'Result', url: 'https://example.com/result', snippet: 'summary' }
    ])
    const windows = [window, replacement]
    const controller = new BrowserSearchController({ createWindow: () => {
      if (windows.length === 1) expect(window.destroyed).toBe(true)
      return windows.shift()!
    } })

    const first = controller.search('first query', 5)
    const second = controller.search('second query', 5)
    await Promise.resolve()
    expect(replacement.loaded).toEqual([])
    releaseFirst()
    await Promise.all([first, second])

    expect(window.maxActiveLoads).toBe(1)
    expect([...window.loaded, ...replacement.loaded]).toEqual([
      'https://html.duckduckgo.com/html/?q=first+query',
      'https://html.duckduckgo.com/html/?q=second+query'
    ])
  })

  it('destroys a cancelled navigation before allowing the queued query to start', async () => {
    const window = new FakeSearchWindow()
    window.loadBarrier = new Promise(() => undefined)
    const replacement = new FakeSearchWindow()
    replacement.results.set('bing', [{ url: 'https://example.cn/next' }])
    const windows = [window, replacement]
    const controller = new BrowserSearchController({ createWindow: () => windows.shift()! })
    const abort = new AbortController()
    const first = controller.search('取消', 5, abort.signal)
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const next = controller.search('继续', 5)
    await Promise.resolve()
    expect(window.loaded).toHaveLength(1)
    abort.abort()
    await rejected
    await expect(next).resolves.toMatchObject({ sources: [{ url: 'https://example.cn/next' }] })
    expect(window.stopped).toBe(true)
    expect(window.destroyed).toBe(true)
    expect(replacement.destroyed).toBe(true)
  })

  it('isolates back-to-back searches from a completed page that keeps navigating', async () => {
    const windows: FakeSearchWindow[] = []
    const partitions: Array<string | undefined> = []
    const controller = new BrowserSearchController({
      createWindow: (options) => {
        partitions.push(options.webPreferences?.partition)
        const window = new FakeSearchWindow()
        const load = window.loadURL.bind(window)
        const execute = window.webContents.executeJavaScript
        let oldPageNavigating = false
        window.loadURL = async (url) => {
          if (oldPageNavigating) throw Object.assign(new Error('net::ERR_ABORTED'), { code: 'ERR_ABORTED', url })
          await load(url)
        }
        window.results.set('bing', [{ title: '510300 净值', url: 'https://example.cn/510300' }])
        window.webContents.executeJavaScript = async (script) => {
          const result = await execute(script)
          // Completing our extraction does not stop timers/navigation belonging
          // to the result document. Those still abort a later load in this frame.
          if (!script.includes('document.body?.innerText')) queueMicrotask(() => { oldPageNavigating = true })
          return result
        }
        windows.push(window)
        return window
      }
    })

    const results = await Promise.all([
      controller.search('沪深300ETF 510300 最新净值', 5),
      controller.search('沪深300ETF 510300 最新净值', 5),
      controller.search('沪深300ETF 510300 最新净值', 5)
    ])

    expect(results.map((result) => result.sources[0]?.url)).toEqual(Array(3).fill('https://example.cn/510300'))
    expect(windows).toHaveLength(3)
    expect(windows.every((window) => window.destroyed)).toBe(true)
    expect(new Set(partitions)).toEqual(new Set(['sherlock-web-search']))
  })

  it('does not accumulate session download listeners when creating replacement windows', () => {
    let listeners = 0
    const searchSession = {
      setPermissionRequestHandler: () => undefined,
      setPermissionCheckHandler: () => undefined,
      on: () => { listeners += 1 }
    }
    const window = { webContents: { setWindowOpenHandler: () => undefined, setAudioMuted: () => undefined } }
    configureBrowserSearchSecurity(window, searchSession)
    configureBrowserSearchSecurity(window, searchSession)
    expect(listeners).toBe(1)
  })

  it('destroys its isolated window when disposed', () => {
    const window = new FakeSearchWindow()
    const controller = new BrowserSearchController({ createWindow: () => window })
    controller.dispose()
    expect(window.destroyed).toBe(true)
  })

  it('can be disposed after its isolated window was already destroyed', () => {
    const window = new FakeSearchWindow()
    const controller = new BrowserSearchController({ createWindow: () => window })
    window.destroy()

    expect(() => controller.dispose()).not.toThrow()
  })

  it('recreates the isolated window after the main-window lifecycle destroys it', async () => {
    const firstWindow = new FakeSearchWindow()
    const secondWindow = new FakeSearchWindow()
    for (const window of [firstWindow, secondWindow]) {
      window.results.set('duckduckgo', [
        { title: 'Result', url: 'https://example.com/result', snippet: 'summary' }
      ])
    }
    const windows = [firstWindow, secondWindow]
    const controller = new BrowserSearchController({
      createWindow: () => windows.shift()!
    })

    await controller.search('first', 5)
    firstWindow.destroy()
    await controller.search('second', 5)

    expect(secondWindow.loaded).toEqual([
      'https://html.duckduckgo.com/html/?q=second'
    ])
  })
})


it('rejects results whose document query differs from the requested query even when webContents already shows the new URL',async()=>{
 const window=new FakeSearchWindow()
 window.webContents.executeJavaScript=async script=>script.includes('document.body?.innerText')?{url:window.currentUrl,title:'煤电政策 - 搜索',text:'ordinary results'}:
  script.includes('documentQuery:')?{url:window.currentUrl,title:'煤 - 搜索',documentQuery:'煤',candidates:[{title:'煤的百科',url:'https://example.org/old-query'}]}:
  [{title:'煤的百科',url:'https://example.org/old-query'}]
 const controller=new BrowserSearchController({createWindow:()=>window,sleep:async()=>{}})
 await expect(controller.search('煤电政策',5)).rejects.toThrow('未能读取搜索结果')
})

it('keeps the search engine and actual page query beside valid results for native provenance diagnosis',async()=>{
 const window=new FakeSearchWindow(),query='煤电容量电价 国家发改委 2026'
 window.webContents.executeJavaScript=async script=>script.includes('document.body?.innerText')?{url:window.currentUrl,title:query+' - 搜索',text:'ordinary results'}:
  script.includes('documentQuery:')?{url:window.currentUrl,title:query+' - 搜索',documentQuery:query,candidates:[{title:'容量电价政策',url:'https://example.org/policy'}]}:
  [{title:'容量电价政策',url:'https://example.org/policy'}]
 const controller=new BrowserSearchController({createWindow:()=>window})
 const result=await controller.search(query,5)
 expect(result.sources).toEqual([{title:'容量电价政策',url:'https://example.org/policy'}])
 expect(result).toMatchObject({provenance:{engine:'bing',requestedQuery:query,documentQuery:query,pageTitle:query+' - 搜索'}})
})


it('waits for the current document query to hydrate without issuing another navigation or widening its probe limit',async()=>{
 const window=new FakeSearchWindow();let probes=0,waits=0
 window.webContents.executeJavaScript=async script=>script.includes('document.body?.innerText')?{url:window.currentUrl,title:'煤电政策 - 搜索',text:'ordinary results'}:
 {url:window.currentUrl,title:'煤电政策 - 搜索',documentQuery:++probes===1?'煤':'煤电政策',candidates:[{title:'已匹配政策',url:'https://example.org/policy'}]}
 const controller=new BrowserSearchController({createWindow:()=>window,sleep:async()=>{waits++}})
 await expect(controller.search('煤电政策',5)).resolves.toMatchObject({sources:[{url:'https://example.org/policy'}],provenance:{documentQuery:'煤电政策'}})
 expect(window.loaded).toHaveLength(1);expect(probes).toBe(2);expect(waits).toBe(1)
})

it.each([
 ['2026 煤电 容量电价 政策 国家发改委 电价 煤炭保供稳价','CNKI Off-Campus Access for Colleges/Universities/Institutions','Partners: Tsinghua University Library CARSI'],
 ['"容量电价" 煤电 2026 政策 news','容量（物体或空间容纳物质的数量）_百度百科','容量是描述物体或空间容纳物质多少的物理量']
])('falls back with the identical query when the real page has unrelated result rows: %s',async(query,title,snippet)=>{
 const window=new FakeSearchWindow()
 window.webContents.executeJavaScript=async script=>script.includes('document.body?.innerText')?{url:window.currentUrl,title:query+' - 搜索',text:'ordinary results'}:{url:window.currentUrl,title:query+' - 搜索',documentQuery:query,candidates:window.currentUrl.startsWith('https://cn.bing.com/')?[{title:'关于完善发电侧容量电价机制的通知',snippet:'2026年煤电容量电价政策',url:'https://example.org/official-capacity-policy'}]:[{title,snippet,url:'https://example.org/unrelated'}]}
 const controller=new BrowserSearchController({createWindow:()=>window,sleep:async()=>{}})
 const result=await controller.search(query,5)
 expect(result.sources).toEqual([{title:'关于完善发电侧容量电价机制的通知',snippet:'2026年煤电容量电价政策',url:'https://example.org/official-capacity-policy'}])
 expect(window.loaded).toHaveLength(2)
 expect(window.loaded.every(url=>new URL(url).searchParams.get('q')===query)).toBe(true)
 expect(result.provenance?.documentQuery).toBe(query)
})

it('does not adopt unrelated rows even when every page echoes the full query, and exhausts only existing engine entries',async()=>{
 const window=new FakeSearchWindow(),query='煤电 容量电价 政策 2026'
 window.webContents.executeJavaScript=async script=>script.includes('document.body?.innerText')?{url:window.currentUrl,title:query,text:'ordinary results'}:{url:window.currentUrl,title:query,documentQuery:query,candidates:[{title:'CNKI Off-Campus Access',snippet:'University Library',url:'https://example.org/cnki'}]}
 const controller=new BrowserSearchController({createWindow:()=>window,sleep:async()=>{}})
 await expect(controller.search(query,5)).rejects.toThrow('与当前查询缺少直接对应')
 expect(window.loaded).toHaveLength(3)
 expect(window.loaded.every(url=>new URL(url).searchParams.get('q')===query)).toBe(true)
 expect(window.destroyed).toBe(true)
})
