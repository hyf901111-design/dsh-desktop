import type { BrowserWindowConstructorOptions } from 'electron'
import {
  buildSearchUrls,
  isAllowedSearchLocation,
  isSearchChallenge,
  normalizeSearchResults,
  orderedSearchEngines,
  searchExtractionScript,
  type SearchResultCandidate,
  type SearchSource
} from './search-engines'

export interface BrowserSearchWindow {
  readonly webContents: {
    executeJavaScript(script: string): Promise<unknown>
    getURL(): string
    stop(): void
  }
  loadURL(url: string): Promise<void>
  show(): void
  hide(): void
  setTitle(title: string): void
  isDestroyed(): boolean
  destroy(): void
}

export interface BrowserSearchControllerOptions {
  createWindow(options: BrowserWindowConstructorOptions): BrowserSearchWindow
  sleep?(durationMs: number): Promise<void>
  navigationTimeoutMs?: number
  verificationTimeoutMs?: number
  scriptTimeoutMs?: number
}

export interface BrowserSearchResult {
  sources: SearchSource[]
  truncated: false
  status?: 'no_results'
  content?: string
}

interface SearchPageState {
  url: string
  title: string
  text: string
  noResults: boolean
}

class SearchVerificationError extends Error {}

export function browserSearchWindowOptions(): BrowserWindowConstructorOptions {
  return {
    show: false,
    title: 'Sherlock Web Search',
    width: 960,
    height: 720,
    webPreferences: {
      partition: 'sherlock-web-search',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  }
}

const securedSearchSessions = new WeakSet<object>()

export function configureBrowserSearchSecurity(
  window: {
    webContents: {
      setWindowOpenHandler(handler: () => { action: 'deny' }): void
      setAudioMuted(muted: boolean): void
    }
  },
  searchSession: {
    setPermissionRequestHandler(
      handler: (
        webContents: unknown,
        permission: string,
        decide: (allowed: boolean) => void
      ) => void
    ): void
    setPermissionCheckHandler(handler: () => boolean): void
    on(event: 'will-download', handler: (event: { preventDefault(): void }) => void): void
  }
): void {
  // Replacement windows use the same in-memory session. Register its download
  // listener once; the per-window protections still apply to every new frame.
  if (!securedSearchSessions.has(searchSession)) {
    searchSession.setPermissionRequestHandler((_webContents, _permission, decide) => {
      decide(false)
    })
    searchSession.setPermissionCheckHandler(() => false)
    searchSession.on('will-download', (event) => {
      event.preventDefault()
    })
    securedSearchSessions.add(searchSession)
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.setAudioMuted(true)
}

export class BrowserSearchController {
  private window: BrowserSearchWindow
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private readonly options: BrowserSearchControllerOptions) {
    this.window = options.createWindow(browserSearchWindowOptions())
  }

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<BrowserSearchResult> {
    const operation = this.tail.then(async () => {
      try {
        return await this.runSearch(query, maxResults, signal)
      } finally {
        // Serializing our promises does not stop scripts/redirects in a loaded
        // search page. Retire that renderer before the next request can start.
        // The next window keeps the same partition and verification cookies.
        this.destroyWindow()
      }
    })
    this.tail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  dispose(): void {
    this.disposed = true
    this.destroyWindow()
  }

  private destroyWindow(): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.stop()
      this.window.destroy()
    }
  }

  private async runSearch(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<BrowserSearchResult> {
    this.throwIfUnavailable(signal)
    const window = this.currentWindow()
    let noResults = false
    let connectionFailed = false
    let unreadablePage = false
    let verificationFailed = false
    for (const engine of orderedSearchEngines(query)) {
      // The global Bing entry can stall before its regional redirect. Retry only
      // the existing allowed regional host, once, with the exact same query.
      for (const url of buildSearchUrls(engine, query)) {
        this.throwIfUnavailable(signal)
        try {
          await this.loadUrl(window, url, signal)
        } catch (error) {
          if (isAbortError(error) || signal?.aborted === true) throw abortError(signal)
          connectionFailed = true
          // Never extract a previous document after a failed navigation.
          continue
        }
        this.throwIfUnavailable(signal)
        if (!isAllowedSearchLocation(engine, window.webContents.getURL())) {
          unreadablePage = true
          continue
        }
        try {
          let engineHasNoResults = false
          // Navigation completion is not the same as rendered results being
          // ready. Four probes add at most 750 ms of waiting per loaded page.
          for (let attempt = 0; attempt < 4; attempt += 1) {
            this.throwIfUnavailable(signal)
            const state = await this.completeVerification(window, signal)
            const location = window.webContents.getURL()
            if (!isAllowedSearchLocation(engine, location) || new URL(location).searchParams.get('q') !== query) {
              throw new Error('搜索页面已离开当前查询。')
            }
            const extracted = await this.executePageScript(window, searchExtractionScript(engine), signal)
            const candidates = Array.isArray(extracted) ? (extracted as SearchResultCandidate[]) : []
            const sources = normalizeSearchResults(candidates, maxResults)
            if (sources.length > 0) return { sources, truncated: false }
            if (state.noResults) {
              noResults = true
              engineHasNoResults = true
              break
            }
            if (attempt < 3) await this.abortable(this.sleep(250), signal, window)
          }
          // A completed no-results page is conclusive for this engine. Its
          // regional entry is not a new search provider, so do not repeat it.
          if (engineHasNoResults) break
          unreadablePage = true
        } catch (error) {
          if (isAbortError(error) || signal?.aborted === true) throw abortError(signal)
          if (error instanceof SearchVerificationError) {
            verificationFailed = true
            break
          }
          unreadablePage = true
        }
      }
    }
    if (noResults) {
      return {
        status: 'no_results', sources: [], truncated: false,
        content: connectionFailed || unreadablePage || verificationFailed
          ? '可用搜索页面未找到匹配来源，另有搜索引擎暂不可用。请调整关键词或稍后重试；不能据此推断实时价格或数据不存在。'
          : '未找到与当前关键词匹配的可引用来源。请调整关键词；不能据此推断实时价格或数据不存在。'
      }
    }
    if (verificationFailed) throw new Error('搜索验证尚未完成，请在搜索验证窗口完成验证后重试。当前尚未取得可引用来源。')
    if (unreadablePage) throw new Error('暂时未能读取搜索结果，页面可能尚未加载完成或结构已变化。请稍后重试或调整关键词。')
    throw new Error('搜索引擎暂时无法连接，可能是网络超时或安全证书验证失败。请检查网络或稍后重试。')
  }

  private async completeVerification(
    window: BrowserSearchWindow,
    signal?: AbortSignal
  ): Promise<SearchPageState> {
    let state = await this.pageState(window, signal)
    if (!isSearchChallenge(state)) return state
    window.setTitle('完成搜索验证')
    window.show()
    const startedAt = Date.now()
    const timeoutMs = this.options.verificationTimeoutMs ?? 5 * 60_000
    try {
      while (isSearchChallenge(state)) {
        if (Date.now() - startedAt >= timeoutMs) {
          throw new SearchVerificationError('搜索验证等待超时。')
        }
        await this.abortable(this.sleep(1_000), signal, window)
        state = await this.pageState(window, signal)
      }
    } finally {
      window.hide()
    }
    return state
  }

  private async pageState(window: BrowserSearchWindow, signal?: AbortSignal): Promise<SearchPageState> {
    const value = await this.executePageScript(window, `({
        url: location.href,
        title: document.title,
        text: document.body?.innerText?.slice(0, 4000) ?? '',
        noResults: Array.from(document.querySelectorAll('#b_results .b_no, .no-results, .result--no-result')).some((node) =>
          !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' &&
          /no results|did not match|没有(?:找到|与)|未找到|找不到|无结果/iu.test(node.textContent ?? ''))
      })`, signal)
    if (typeof value !== 'object' || value === null) {
      return { url: '', title: '', text: '', noResults: false }
    }
    const page = value as Record<string, unknown>
    return {
      url: typeof page.url === 'string' ? page.url : '',
      title: typeof page.title === 'string' ? page.title : '',
      text: typeof page.text === 'string' ? page.text : '',
      noResults: page.noResults === true
    }
  }

  private async executePageScript(window: BrowserSearchWindow, script: string, signal?: AbortSignal): Promise<unknown> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('读取搜索页面超时。')), this.options.scriptTimeoutMs ?? 3_000)
    })
    try {
      return await this.abortable(Promise.race([window.webContents.executeJavaScript(script), deadline]), signal, window)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private sleep(durationMs: number): Promise<void> {
    return this.options.sleep?.(durationMs) ??
      new Promise<void>((resolve) => setTimeout(resolve, durationMs))
  }

  private async loadUrl(
    window: BrowserSearchWindow,
    url: string,
    signal?: AbortSignal
  ): Promise<void> {
    const timeoutMs = this.options.navigationTimeoutMs ?? 15_000
    let timeout: ReturnType<typeof setTimeout> | undefined
    const navigationTimeout = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        window.webContents.stop()
        reject(new Error('Search navigation timed out.'))
      }, timeoutMs)
    })
    try {
      await this.abortable(Promise.race([window.loadURL(url), navigationTimeout]), signal, window)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private throwIfUnavailable(signal?: AbortSignal): void {
    if (signal?.aborted === true) throw abortError(signal)
    if (this.disposed) {
      throw new Error('本地搜索当前不可用，请重新打开 Sherlock 后重试。')
    }
  }

  private currentWindow(): BrowserSearchWindow {
    if (this.window.isDestroyed()) {
      this.window = this.options.createWindow(browserSearchWindowOptions())
    }
    return this.window
  }

  private async abortable<T>(
    operation: Promise<T>,
    signal?: AbortSignal,
    window: BrowserSearchWindow = this.window
  ): Promise<T> {
    if (!signal) return operation
    if (signal.aborted) throw abortError(signal)
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        window.webContents.stop()
        reject(abortError(signal))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      operation.then(
        (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        }
      )
    })
  }
}

function abortError(signal?: AbortSignal): DOMException {
  return new DOMException(
    signal?.reason instanceof Error ? signal.reason.message : 'Search aborted.',
    'AbortError'
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
