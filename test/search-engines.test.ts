import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  extractSearchResults,
  isAllowedSearchLocation,
  isSearchChallenge,
  normalizeSearchResults,
  orderedSearchEngines,
  searchExtractionScript,
  searchSnapshotScript,
  hasSearchQueryOverlap
} from '../src/main/search/search-engines'

describe('local browser search engines', () => {
  it.each([
    ['2026年10月 煤价 保供稳价 发改委 电煤 政策','北京市人民政府门户网站','提供北京市政府信息',false],
    ['煤电容量电价 国家发改委 2026','容量电价政策','煤电固定成本回收',true],
    ['沪深300ETF 510300 最新净值','510300 净值','',true],
    ['气候','Climate report','',true],
    ['open source AI','Untranslated source title','',true],
    ['"容量电价" 煤电 2026 政策','容量的意思','煤电报道未出现完整引号短语',false],
    ['"capacity tariff" latest','Capacity tariff policy','',true]
  ])('only rejects a directly observable query mismatch: %s',(query,title,snippet,expected)=>{
    expect(hasSearchQueryOverlap(query,[{title,snippet,url:'https://example.org/article'}])).toBe(expected)
  })
  it('builds encoded Bing and DuckDuckGo search URLs without carrying user state', () => {
    expect(buildSearchUrl('bing', '英伟达 2026 财报')).toBe(
      'https://www.bing.com/search?q=%E8%8B%B1%E4%BC%9F%E8%BE%BE+2026+%E8%B4%A2%E6%8A%A5'
    )
    expect(buildSearchUrl('duckduckgo', 'open source AI')).toBe(
      'https://html.duckduckgo.com/html/?q=open+source+AI'
    )
  })

  it('allows only the configured engine hosts over HTTPS', () => {
    expect(isAllowedSearchLocation('bing', 'https://www.bing.com/search?q=test')).toBe(true)
    expect(isAllowedSearchLocation('bing', 'https://cn.bing.com/search?q=test')).toBe(true)
    expect(isAllowedSearchLocation('duckduckgo', 'https://html.duckduckgo.com/html/?q=test')).toBe(true)
    expect(isAllowedSearchLocation('duckduckgo', 'https://duckduckgo.com/verify')).toBe(true)
    expect(isAllowedSearchLocation('bing', 'http://www.bing.com/search?q=test')).toBe(false)
    expect(isAllowedSearchLocation('bing', 'https://bing.com.example.test/search')).toBe(false)
    expect(isAllowedSearchLocation('duckduckgo', 'https://example.test/')).toBe(false)
  })

  it('normalizes safe public results, removes duplicates, and honors the limit', () => {
    expect(
      normalizeSearchResults(
        [
          {
            title: ' First result ',
            url: 'https://example.com/report',
            snippet: '  Useful summary.  '
          },
          {
            title: 'Duplicate',
            url: 'https://example.com/report',
            snippet: 'ignored'
          },
          { title: 'Unsafe', url: 'javascript:alert(1)', snippet: 'ignored' },
          { title: '', url: 'https://example.org/news', snippet: '' },
          { title: 'Third', url: 'https://third.example/item', snippet: 'third' }
        ],
        2
      )
    ).toEqual([
      {
        title: 'First result',
        url: 'https://example.com/report',
        snippet: 'Useful summary.'
      },
      { url: 'https://example.org/news' }
    ])
  })

  it('detects verification pages from the URL, title, or visible page marker', () => {
    expect(
      isSearchChallenge({
        url: 'https://www.bing.com/turing/captcha/challenge',
        title: 'Bing',
        text: ''
      })
    ).toBe(true)
    expect(
      isSearchChallenge({
        url: 'https://html.duckduckgo.com/html/?q=test',
        title: 'Human Verification',
        text: ''
      })
    ).toBe(true)
    expect(
      isSearchChallenge({
        url: 'https://www.bing.com/search?q=test',
        title: 'test - Search',
        text: 'Please verify you are a human before continuing.'
      })
    ).toBe(true)
    expect(
      isSearchChallenge({
        url: 'https://www.bing.com/search?q=test',
        title: 'test - Search',
        text: 'Ordinary search results'
      })
    ).toBe(false)
  })

  it('prefers Bing for Chinese queries and DuckDuckGo otherwise', () => {
    expect(orderedSearchEngines('苹果公司最新财报')).toEqual(['bing', 'duckduckgo'])
    expect(orderedSearchEngines('Apple latest earnings')).toEqual(['duckduckgo', 'bing'])
  })

  it('extracts Bing result titles, links, and snippets from the rendered page', () => {
    const window = new Window({ url: 'https://www.bing.com/search?q=test' })
    window.document.body.innerHTML = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://example.com/a">Result A</a></h2>
          <div class="b_caption"><p>Summary A</p></div>
        </li>
      </ol>
    `

    expect(extractSearchResults('bing', window.document as unknown as Document)).toEqual([
      { title: 'Result A', url: 'https://example.com/a', snippet: 'Summary A' }
    ])
  })

  it('extracts DuckDuckGo result titles, links, and snippets from the rendered page', () => {
    const window = new Window({ url: 'https://html.duckduckgo.com/html/?q=test' })
    window.document.body.innerHTML = `
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="https://example.org/b">Result B</a>
        </h2>
        <a class="result__snippet">Summary B</a>
      </div>
    `

    expect(
      extractSearchResults('duckduckgo', window.document as unknown as Document)
    ).toEqual([{ title: 'Result B', url: 'https://example.org/b', snippet: 'Summary B' }])
  })

  it('provides a self-contained extraction script for Electron web contents', () => {
    const window = new Window({ url: 'https://www.bing.com/search?q=test' })
    window.document.body.innerHTML = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://example.net/c">Result C</a></h2>
          <div class="b_caption"><p>Summary C</p></div>
        </li>
      </ol>
    `

    expect(window.eval(searchExtractionScript('bing'))).toEqual([
      { title: 'Result C', url: 'https://example.net/c', snippet: 'Summary C' }
    ])
  })
})


it('captures the current query, document URL and result rows together without using hidden query fields',()=>{
 const window=new Window({url:'https://cn.bing.com/search?q=%E7%85%A4%E7%94%B5%E6%94%BF%E7%AD%96'})
 window.document.title='煤电政策 - 搜索';window.document.body.innerHTML='<input id="sb_form_q" value="煤电政策"><ol id="b_results"><li class="b_algo"><h2><a href="https://example.org/policy">煤电容量电价政策</a></h2></li></ol>'
 expect(window.eval(searchSnapshotScript('bing'))).toEqual({url:window.location.href,title:'煤电政策 - 搜索',documentQuery:'煤电政策',noResults:false,candidates:[{title:'煤电容量电价政策',url:'https://example.org/policy'}]})
 window.document.body.innerHTML='<input name="q" type="hidden" value="旧查询"><input name="q" value="current policy"><div class="result"><a class="result__a" href="https://example.org/new">Current result</a></div>'
 expect(window.eval(searchSnapshotScript('duckduckgo')).documentQuery).toBe('current policy')
})
