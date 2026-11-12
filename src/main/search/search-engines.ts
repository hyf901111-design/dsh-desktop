export type SearchEngineId = 'bing' | 'duckduckgo'

export interface SearchResultCandidate {
  title?: unknown
  url?: unknown
  snippet?: unknown
}

export interface SearchSource {
  url: string
  title?: string
  snippet?: string
  siteName?: string
  publishedAt?: string
}

const SEARCH_HOSTS: Record<SearchEngineId, ReadonlySet<string>> = {
  bing: new Set(['www.bing.com', 'cn.bing.com']),
  duckduckgo: new Set(['html.duckduckgo.com', 'duckduckgo.com', 'www.duckduckgo.com'])
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/\s+/gu, ' ').trim()
  return cleaned.length > 0 ? cleaned : undefined
}

function publicHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined
  const parsed = new URL(value)
  return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
}

export function buildSearchUrl(engine: SearchEngineId, query: string): string {
  const url = new URL(
    engine === 'bing' ? 'https://www.bing.com/search' : 'https://html.duckduckgo.com/html/'
  )
  url.searchParams.set('q', query)
  return url.href
}

export function buildSearchUrls(engine: SearchEngineId, query: string): string[] {
  const primary = buildSearchUrl(engine, query)
  if (engine !== 'bing') return [primary]
  const regional = new URL(primary)
  regional.hostname = 'cn.bing.com'
  return [primary, regional.href]
}

export function isAllowedSearchLocation(engine: SearchEngineId, url: string): boolean {
  if (!URL.canParse(url)) return false
  const parsed = new URL(url)
  return parsed.protocol === 'https:' && SEARCH_HOSTS[engine].has(parsed.hostname.toLowerCase())
}

export function normalizeSearchResults(
  candidates: SearchResultCandidate[],
  maxResults: number
): SearchSource[] {
  const limit = Math.max(0, Math.floor(maxResults))
  const seen = new Set<string>()
  const sources: SearchSource[] = []
  for (const candidate of candidates) {
    const url = publicHttpUrl(candidate.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title = cleanText(candidate.title)
    const snippet = cleanText(candidate.snippet)
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {})
    })
    if (sources.length >= limit) break
  }
  return sources
}

/** Reject only obvious lexical mismatches; overlap does not prove relevance. */
export function hasSearchQueryOverlap(query: string, sources: SearchSource[]): boolean {
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
  // Inspect source rows, never the page title or echoed query metadata.
  const observed = sources.map(source => normalize([source.title, source.snippet, source.url].filter(Boolean).join(' ')))
  const quoted = [...query.matchAll(/"([^"\r\n]{2,128})"|“([^”\r\n]{2,128})”/gu)].map(match => normalize(match[1] ?? match[2] ?? '')).filter(Boolean)
  if (quoted.some(phrase => !observed.some(text => text.includes(phrase)))) return false
  if (!/[\p{Script=Han}]/u.test(query)) return true
  const context = new Set(['最新','近期','实时','政策','新闻','资讯','消息','资料','信息','公告','通知','官网','官方','news','latest','recent','official'])
  const words = [...new Set((normalize(query).match(/[\p{L}\p{N}]+/gu) ?? []).filter(word =>
    word.length >= 2 && !context.has(word) && !/^20\d{2}(?:年(?:\d{1,2}月(?:\d{1,2}日)?)?)?$/u.test(word) && (!/^\d+$/u.test(word) || word.length === 6)))]
  // A single unsegmented Chinese expression has no reliable word boundary.
  // Keep it compatible; do not guess dictionary segmentation or translations.
  if (words.length < 2) return true
  const fragments = words.flatMap(word => {
    if (!/^[\p{Script=Han}]+$/u.test(word)) return [word]
    const characters = [...word]
    return characters.slice(1).map((character, i) => characters[i] + character)
  })
  return fragments.some(fragment => observed.some(text => text.includes(fragment)))
}

export function isSearchChallenge(page: {
  url: string
  title: string
  text: string
}): boolean {
  const haystack = `${page.url}\n${page.title}\n${page.text}`.toLowerCase()
  return /(?:captcha|challenge|human verification|verify you are a human|unusual traffic)/u.test(
    haystack
  )
}

export function orderedSearchEngines(query: string): SearchEngineId[] {
  return /[\p{Script=Han}]/u.test(query)
    ? ['bing', 'duckduckgo']
    : ['duckduckgo', 'bing']
}

function textOf(element: Element | null): string | undefined {
  return cleanText(element?.textContent)
}

export function extractSearchResults(
  engine: SearchEngineId,
  document: Document
): SearchResultCandidate[] {
  const rows =
    engine === 'bing'
      ? document.querySelectorAll('#b_results .b_algo')
      : document.querySelectorAll('.result')
  return Array.from(rows).flatMap((row) => {
    const link = row.querySelector<HTMLAnchorElement>(
      engine === 'bing' ? 'h2 a[href]' : 'a.result__a[href]'
    )
    if (!link) return []
    const snippet = textOf(
      row.querySelector(engine === 'bing' ? '.b_caption p' : '.result__snippet')
    )
    return [
      {
        url: link.href,
        ...(textOf(link) ? { title: textOf(link) } : {}),
        ...(snippet ? { snippet } : {})
      }
    ]
  })
}

export function searchExtractionScript(engine: SearchEngineId): string {
  const rowSelector = engine === 'bing' ? '#b_results .b_algo' : '.result'
  const linkSelector = engine === 'bing' ? 'h2 a[href]' : 'a.result__a[href]'
  const snippetSelector = engine === 'bing' ? '.b_caption p' : '.result__snippet'
  return `(() => {
    const clean = (value) => {
      if (typeof value !== 'string') return undefined
      const text = value.replace(/\\s+/gu, ' ').trim()
      return text.length > 0 ? text : undefined
    }
    return Array.from(document.querySelectorAll(${JSON.stringify(rowSelector)})).flatMap((row) => {
      const link = row.querySelector(${JSON.stringify(linkSelector)})
      if (!link) return []
      const title = clean(link.textContent)
      const snippet = clean(row.querySelector(${JSON.stringify(snippetSelector)})?.textContent)
      return [{
        url: link.href,
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {})
      }]
    })
  })()`
}


/** Read the result rows and their real document query in one DOM evaluation. */
export function searchSnapshotScript(engine: SearchEngineId): string {
  const selector = engine === 'bing' ? '#sb_form_q' : 'input[name="q"]:not([type="hidden"]),textarea[name="q"]'
  return `(() => {
    const candidates = ${searchExtractionScript(engine)}
    const queries = [...new Set(Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .filter(input => !input.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(input).display !== 'none' && getComputedStyle(input).visibility !== 'hidden')
      .map(input => input.value).filter(value => typeof value === 'string' && value.trim()))]
    return {
      url: location.href,
      title: document.title,
      documentQuery: queries.length === 1 ? queries[0] : null,
      noResults: Array.from(document.querySelectorAll('#b_results .b_no, .no-results, .result--no-result')).some(node =>
        !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' &&
        /no results|did not match|没有(?:找到|与)|未找到|找不到|无结果/iu.test(node.textContent ?? '')),
      candidates
    }
  })()`
}
