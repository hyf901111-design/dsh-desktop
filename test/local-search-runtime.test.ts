import { describe, expect, it } from 'vitest'
import type { BrowserSearchWindow } from '../src/main/search/browser-search-controller'
import { startLocalSearchRuntime } from '../src/main/search/local-search-runtime'
// @ts-expect-error The session-model plugin is a JavaScript runtime package without declarations.
import {searchLocalBrowser} from '../packages/dsh-web-search-session-model/index.js'

function fakeWindow(): BrowserSearchWindow & { destroyed: boolean } {
  let url = ''
  const value = {
    destroyed: false,
    webContents: {
      executeJavaScript: async (script: string) =>
        script.includes('document.body?.innerText')
          ? { url, title: 'Search results', text: 'ordinary results' }
          : { url, title: 'Search results', documentQuery: new URL(url).searchParams.get('q'), candidates: [{ title: 'Local result', url: 'https://example.com/local', snippet: 'summary' }], noResults: false },
      getURL: () => url,
      stop: () => undefined
    },
    loadURL: async (nextUrl: string) => {
      url = nextUrl
    },
    show: () => undefined,
    hide: () => undefined,
    setTitle: () => undefined,
    isDestroyed: () => value.destroyed,
    destroy: () => {
      value.destroyed = true
    }
  }
  return value
}

describe('local search main-process runtime', () => {
  it('serves browser results through its authenticated endpoint and disposes both resources', async () => {
    const window = fakeWindow()
    const runtime = await startLocalSearchRuntime({ createWindow: () => window })
    const response = await fetch(`${runtime.endpoint.url}/search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${runtime.endpoint.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ query: 'local query', maxResults: 3 })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      sources: [
        { title: 'Local result', url: 'https://example.com/local', snippet: 'summary' }
      ],
      truncated: false,
      provenance: { engine: 'duckduckgo', requestedQuery: 'local query', documentQuery: 'local query', pageTitle: 'Search results' }
    })

    await runtime.stop()
    expect(window.destroyed).toBe(true)
    await expect(
      fetch(`${runtime.endpoint.url}/search`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${runtime.endpoint.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ query: 'after stop' })
      })
    ).rejects.toBeInstanceOf(TypeError)
  })
})


it('carries the verified document query through the authenticated bridge into the public web search result',async()=>{
 const window=fakeWindow(),runtime=await startLocalSearchRuntime({createWindow:()=>window})
 try{
  const result=await searchLocalBrowser({query:'  local   query  ',maxResults:3},undefined,runtime.endpoint)
  expect(result.sources).toEqual([{title:'Local result',url:'https://example.com/local',snippet:'summary'}])
  expect(result.content).toContain('DuckDuckGo')
  expect(result.content).toContain('local   query')
 }finally{await runtime.stop()}
})

it('uses the account-backed Doubao search and retains its source label', async () => {
  const runtime = await startLocalSearchRuntime({
    createWindow: () => { throw Error('should not open a search window') },
    search: async () => ({ provider: 'doubao', truncated: false, sources: [{ url: 'https://example.org/', title: 'Doubao result' }] })
  })
  try {
    const result = await searchLocalBrowser({ query: 'public query', maxResults: 2 }, undefined, runtime.endpoint)
    expect(result.content).toContain('豆包搜索')
    expect(result.sources).toHaveLength(1)
  } finally {
    await runtime.stop()
  }
})

it('offers a separate hosted route and keeps browser search independent', async () => {
  const runtime = await startLocalSearchRuntime({
    createWindow: fakeWindow,
    searchHosted: async query => query === 'available'
      ? { provider: 'doubao', truncated: false, sources: [{ url: 'https://example.org/' }] }
      : undefined
  })
  try {
    const search = (query: string, hosted: boolean) =>
      searchLocalBrowser({ query, maxResults: 2 }, undefined, runtime.endpoint, hosted)
    await expect(search('available', true)).resolves.toMatchObject({ content: expect.stringContaining('豆包搜索') })
    await expect(search('unavailable', true)).resolves.toBeUndefined()
    await expect(search('unavailable', false)).resolves.toMatchObject({ content: expect.stringContaining('DuckDuckGo') })
  } finally {
    await runtime.stop()
  }
})
