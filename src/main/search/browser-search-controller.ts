import type { BrowserWindowConstructorOptions } from 'electron'
import {
  buildSearchUrls,
  isAllowedSearchLocation,
  isSearchChallenge,
  normalizeSearchResults,
  hasSearchQueryOverlap,
  orderedSearchEngines,
  searchSnapshotScript,
  type SearchEngineId,
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
  provider?: 'doubao'
  sources: SearchSource[]
  truncated: false
  status?: 'no_results'
  content?: string
  provenance?: { engine: SearchEngineId; requestedQuery: string; documentQuery: string; pageTitle: string }
}

interface SearchPageState {
  url: string
  title: string
  text: string
  noResults: boolean
}

class SearchVerificationError extends Error {}
class SearchQueryMismatchError extends Error {}

export function browserSearchWindowOptions(): BrowserWindowConstructorOptions {
  return {
    show: false,
    title: 'EWork Odyssey Web Search',
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
        await this.destroyWindow()
      }
    })
    this.tail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  dispose(): Promise<void> {
    this.disposed = true
    return this.destroyWindow()
  }

  private async destroyWindow(): Promise<void> {
    const retiring = this.window
    if (retiring.isDestroyed()) return
    // Navigation observers can settle our promises while Chromium still holds
    // its navigation reentrancy guard. Promise microtasks are too early to stop
    // or destroy that page; retire this exact window on a new event-loop turn.
    await new Promise<void>((resolve) => setImmediate(resolve))
    if (!retiring.isDestroyed()) {
      retiring.webContents.stop()
      retiring.destroy()
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
    let queryMismatch = false
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
            await this.completeVerification(window, signal)
            const location = window.webContents.getURL()
            if (!isAllowedSearchLocation(engine, location) || new URL(location).searchParams.get('q') !== query) {
              throw new Error('搜索页面已离开当前查询。')
            }
            const extracted = await this.executePageScript(window, searchSnapshotScript(engine), signal)
            const snapshot = extracted && typeof extracted === 'object' && !Array.isArray(extracted) ? extracted as Record<string, unknown> : null
            const documentUrl = typeof snapshot?.url === 'string' ? snapshot.url : ''
            const documentQuery = typeof snapshot?.documentQuery === 'string' ? snapshot.documentQuery : ''
            const sameQuery = (value: string) => value.trim().replace(/\s+/gu, ' ')
            // webContents can advertise a new location before its DOM has the
            // matching query/results. Never pair an address-bar query with a
            // previous document's rows. A hydration probe reuses the existing
            // four-probe budget; it neither navigates nor expands the deadline.
            if (!isAllowedSearchLocation(engine, documentUrl) || new URL(documentUrl).searchParams.get('q') !== query || sameQuery(documentQuery) !== sameQuery(query)) {
              if (attempt < 3) { await this.abortable(this.sleep(250), signal); continue }
              throw new Error('搜索结果文档尚未对应当前查询。')
            }
            const candidates = Array.isArray(snapshot?.candidates) ? (snapshot.candidates as SearchResultCandidate[]) : []
            const sources = normalizeSearchResults(candidates, maxResults)
            if (sources.length > 0 && !hasSearchQueryOverlap(query, sources)) throw new SearchQueryMismatchError('结果条目与查询缺少直接对应。')
            if (sources.length > 0) return { sources, truncated: false, provenance: { engine, requestedQuery: query, documentQuery, pageTitle: typeof snapshot?.title === 'string' ? snapshot.title.slice(0, 512) : '' } }
            if (snapshot?.noResults === true) {
              noResults = true
              engineHasNoResults = true
              break
            }
            if (attempt < 3) await this.abortable(this.sleep(250), signal)
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
          if (error instanceof SearchQueryMismatchError) { queryMismatch = true; continue }
          unreadablePage = true
        }
      }
    }
    if (noResults) {
      return {
        status: 'no_results', sources: [], truncated: false,
        content: queryMismatch ? '可用入口未找到匹配来源，其他入口返回的条目与查询缺少直接对应，未采用这些来源；不能据此推断数据或政策不存在。' : connectionFailed || unreadablePage || verificationFailed
          ? '可用搜索页面未找到匹配来源，另有搜索引擎暂不可用。请调整关键词或稍后重试；不能据此推断实时价格或数据不存在。'
          : '未找到与当前关键词匹配的可引用来源。请调整关键词；不能据此推断实时价格或数据不存在。'
      }
    }
    if (verificationFailed) throw new Error('可用搜索入口需要验证，已在后台跳过。请稍后重试；当前尚未取得可引用来源。')
    if (queryMismatch) throw new Error('搜索结果与当前查询缺少直接对应，已尝试备用入口，未采用这些来源。请调整关键词或稍后重试。')
    if (unreadablePage) throw new Error('暂时未能读取搜索结果，页面可能尚未加载完成或结构已变化。请稍后重试或调整关键词。')
    throw new Error('搜索引擎暂时无法连接，可能是网络超时或安全证书验证失败。请检查网络或稍后重试。')
  }

  private async completeVerification(
    window: BrowserSearchWindow,
    signal?: AbortSignal
  ): Promise<SearchPageState> {
    let state = await this.pageState(window, signal)
    if (!isSearchChallenge(state)) return state
    // Background research must never steal focus for a provider challenge.
    // Let the caller try the next independent engine without bypassing it.
    throw new SearchVerificationError('该搜索入口需要人工验证，已跳过。')
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
      return await this.abortable(Promise.race([window.webContents.executeJavaScript(script), deadline]), signal)
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
      await this.abortable(Promise.race([window.loadURL(url), navigationTimeout]), signal)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private throwIfUnavailable(signal?: AbortSignal): void {
    if (signal?.aborted === true) throw abortError(signal)
    if (this.disposed) {
      throw new Error('本地搜索当前不可用，请重新打开 EWork Odyssey 后重试。')
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
    signal?: AbortSignal
  ): Promise<T> {
    if (!signal) return operation
    if (signal.aborted) throw abortError(signal)
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        // Reject promptly; search() retires the renderer at the safe boundary.
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
