import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import {
  BrowserSearchController,
  browserSearchWindowOptions,
  configureBrowserSearchSecurity,
  type BrowserSearchWindow
} from '../src/main/search/browser-search-controller'

type PageState = { url: string; title: string; text: string }

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
  results = new Map<string, unknown[]>()
  loadBarrier?: Promise<void>

  constructor() {
    this.webContents = {
      executeJavaScript: async (script) => {
        if (script.includes('document.body?.innerText')) {
          return (
            this.pageStates.shift() ?? {
              url: this.currentUrl,
              title: 'Search results',
              text: 'ordinary results'
            }
          )
        }
        const engine = this.currentUrl.includes('bing.com') ? 'bing' : 'duckduckgo'
        return this.results.get(engine) ?? []
      },
      getURL: () => this.currentUrl,
      stop: () => {
        if (this.destroyed) throw new Error('Object has been destroyed')
        this.stopped = true
      }
    }
  }

  async loadURL(url: string): Promise<void> {
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
      title: 'Sherlock Web Search',
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

    await expect(controller.search('latest earnings', 5)).resolves.toEqual({
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

    await expect(controller.search('stalled first engine', 5)).resolves.toEqual({
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
      : execute(script)
    const controller = new BrowserSearchController({ createWindow: () => window })

    await expect(controller.search('不存在的搜索词', 5)).resolves.toMatchObject({
      status: 'no_results', sources: [], truncated: false, content: expect.stringContaining('未找到')
    })
    expect(window.loaded).toHaveLength(2)
  })

  it('recognizes actual engine no-results markup but not a result snippet saying no results', async () => {
    const window = new FakeSearchWindow()
    const page = new Window({ url: 'https://www.bing.com/search?q=test' })
    let noResults = true
    const load = window.loadURL.bind(window)
    window.loadURL = async (url) => {
      await load(url)
      page.document.body.innerHTML = noResults
        ? '<ol id="b_results"><li class="b_no">没有找到相关结果</li></ol>'
        : '<ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/report">报告</a></h2><div class="b_caption"><p>No results is the reported status.</p></div></li></ol>'
    }
    window.webContents.executeJavaScript = async (script) => page.eval(script)
    const controller = new BrowserSearchController({ createWindow: () => window })
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
    const execute = window.webContents.executeJavaScript
    window.webContents.executeJavaScript = async () => new Promise(() => undefined)
    const controller = new BrowserSearchController({ createWindow: () => window, scriptTimeoutMs: 5 })

    await expect(controller.search('查询', 5)).rejects.toThrow('未能读取搜索结果')
    window.webContents.executeJavaScript = execute
    window.results.set('bing', [{ url: 'https://example.cn/recovered' }])
    await expect(controller.search('恢复', 5)).resolves.toMatchObject({ sources: [{ url: 'https://example.cn/recovered' }] })
  })

  it('shows the isolated window only while human verification is required', async () => {
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
    window.results.set('bing', [
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

    expect(visibility).toEqual([true])
    expect(window.title).toBe('完成搜索验证')
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
    let releaseFirst!: () => void
    window.loadBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    window.results.set('duckduckgo', [
      { title: 'Result', url: 'https://example.com/result', snippet: 'summary' }
    ])
    const controller = new BrowserSearchController({ createWindow: () => window })

    const first = controller.search('first query', 5)
    const second = controller.search('second query', 5)
    await Promise.resolve()
    releaseFirst()
    await Promise.all([first, second])

    expect(window.maxActiveLoads).toBe(1)
    expect(window.loaded).toEqual([
      'https://html.duckduckgo.com/html/?q=first+query',
      'https://html.duckduckgo.com/html/?q=second+query'
    ])
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
