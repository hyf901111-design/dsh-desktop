import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KNOWN_SESSION_EVENT_TYPES, Session } from '@deepseek-ai/dsh-session'
import { PersistenceCoordinator } from '@deepseek-ai/dsh-session-persistence'
import {
  SessionModelSearchProvider,
  resolveSessionSearchOptions,
  resolveSessionSearchRoute,
  searchLocalBrowser
} from '../packages/dsh-web-search-session-model/index.js'

const servers = new Set()

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve())
        })
    )
  )
  servers.clear()
})

async function listen(handler) {
  const server = createServer(handler)
  servers.add(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind')
  return `http://127.0.0.1:${address.port}`
}

function fakeContext({
  baseURL,
  credential = 'user-model-key',
  provider = 'openai',
  model = 'gpt-5.6-sol',
  api = 'openai-responses',
  includeProfile = true
}) {
  const credentialRefs = []
  const ctx = {
    agents: {
      currentInitiator() {
        return {
          session: {
            requestHeader() {
              return {
                config: { provider, model }
              }
            },
            append() {}
          }
        }
      }
    },
    settings: {
      get(namespace) {
        if (namespace !== 'llm-pi-ai') return undefined
        return {
          providers: includeProfile
            ? {
                [provider]: {
                  ...(baseURL ? { baseURL: `${baseURL}/llmapi/v1` } : {}),
                  api,
                  apiKeyEnv: `${provider.toUpperCase().replaceAll('-', '_')}_API_KEY`
                }
              }
            : {}
        }
      }
    },
    credentials: {
      async resolve(ref) {
        credentialRefs.push(ref)
        return credential ? { value: credential } : undefined
      }
    },
    get(name) {
      return this[name]
    }
  }
  return { ctx, credentialRefs }
}

describe('current-session model web search', () => {
  it('replays legacy session-model search events from persisted sessions', async () => {
    const id = 'session-web-search-legacy-replay-test'
    const meta = Session.create(id).header
    const events = [
      {
        type: 'web/session-model-search-llm-request',
        seq: 0,
        time: 1,
        data: {
          endpoint: 'https://example.com/responses',
          provider: 'openai',
          model: 'gpt-5.6-sol',
          apiKeyRef: 'OPENAI_API_KEY',
          body: { model: 'gpt-5.6-sol', input: 'current facts' }
        }
      }
    ]
    const ctx = {
      effect() {},
      on() {},
      sessions: {
        list: () => []
      }
    }
    const backend = {
      name: 'legacy-search-event-fixture',
      async loadStored() {
        return { meta, events, revision: 'fixture-revision' }
      }
    }
    const persistence = new PersistenceCoordinator(ctx, backend)

    await expect(persistence.readFrom(id, 0)).resolves.toMatchObject({
      events: [{ type: 'web/session-model-search-llm-request', seq: 0 }]
    })
  })

  it('keeps persisted search diagnostics replayable after a Harness restart', async () => {
    const session = Session.create('session-web-search-replay-test')
    session.append('request/header', {
      header: {
        config: { provider: 'openai', model: 'gpt-5.6-sol' }
      },
      reason: 'initial'
    })
    const { ctx } = fakeContext({ baseURL: 'https://example.com' })
    ctx.agents.currentInitiator = () => ({ session })
    const options = await resolveSessionSearchOptions(ctx)

    options.recordRequest?.({
      endpoint: 'https://example.com/responses',
      provider: 'openai',
      model: 'gpt-5.6-sol',
      apiKeyRef: 'OPENAI_API_KEY',
      body: { model: 'gpt-5.6-sol', input: 'current facts' }
    })

    expect(
      session.events.every(
        (event) => KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true
      )
    ).toBe(true)
  })

  it('uses the selected model endpoint and credential and maps Responses citations', async () => {
    const requests = []
    const baseURL = await listen(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(body)
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          output: [
            {
              type: 'web_search_call',
              action: {
                sources: [
                  { url: 'https://example.com/a', title: 'Source A' },
                  { url: 'https://example.com/b', title: 'Source B' }
                ]
              }
            },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'A concise sourced answer.',
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://example.com/a',
                      title: 'Source A duplicate'
                    },
                    {
                      type: 'url_citation',
                      url: 'https://example.com/c',
                      title: 'Source C'
                    }
                  ]
                }
              ]
            }
          ]
        })
      )
    })
    const { ctx, credentialRefs } = fakeContext({ baseURL })
    const provider = new SessionModelSearchProvider(() => resolveSessionSearchOptions(ctx))

    const result = await provider.search({ query: 'current facts', maxResults: 8 })

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      url: '/llmapi/v1/responses',
      authorization: 'Bearer user-model-key',
      body: {
        model: 'gpt-5.6-sol',
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources']
      }
    })
    expect(requests[0].body.input).toContain('current facts')
    expect(credentialRefs).toEqual(['OPENAI_API_KEY'])
    expect(result).toEqual({
      content: 'A concise sourced answer.',
      sources: [
        { url: 'https://example.com/a', title: 'Source A' },
        { url: 'https://example.com/b', title: 'Source B' },
        { url: 'https://example.com/c', title: 'Source C' }
      ],
      truncated: false
    })
  })

  it('uses the authenticated local browser for Kimi Coding without resolving its model key', async () => {
    const localRequests = []
    const localURL = await listen(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      localRequests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(body)
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          sources: [
            {
              url: 'https://example.com/kimi-result',
              title: 'Kimi local result',
              snippet: 'Current information'
            }
          ],
          truncated: false
        })
      )
    })
    const { ctx, credentialRefs } = fakeContext({
      baseURL: 'https://api.kimi.com/coding',
      provider: 'kimi-coding',
      model: 'kimi-for-coding',
      api: 'anthropic-messages'
    })
    const provider = new SessionModelSearchProvider({
      mode: () => 'auto',
      resolveRoute: () => resolveSessionSearchRoute(ctx),
      resolveNativeOptions: () => resolveSessionSearchOptions(ctx),
      searchLocal: (request, signal) =>
        searchLocalBrowser(request, signal, {
          url: localURL,
          token: 'local-only-token'
        })
    })

    await expect(provider.search({ query: 'current facts', maxResults: 4 })).resolves.toEqual({
      sources: [
        {
          url: 'https://example.com/kimi-result',
          title: 'Kimi local result',
          snippet: 'Current information'
        }
      ],
      truncated: false
    })
    expect(localRequests).toEqual([
      {
        url: '/search',
        authorization: 'Bearer local-only-token',
        body: { query: 'current facts', maxResults: 4 }
      }
    ])
    expect(credentialRefs).toEqual([])
  })

  it('falls back locally when a native Responses route rejects web search', async () => {
    const baseURL = await listen((_request, response) => {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'unknown web_search tool' } }))
    })
    const { ctx } = fakeContext({ baseURL })
    let localCalls = 0
    const provider = new SessionModelSearchProvider({
      mode: () => 'auto',
      resolveRoute: () => resolveSessionSearchRoute(ctx),
      resolveNativeOptions: () => resolveSessionSearchOptions(ctx),
      searchLocal: async () => {
        localCalls += 1
        return {
          sources: [{ url: 'https://example.com/fallback', title: 'Fallback' }],
          truncated: false
        }
      }
    })

    await expect(provider.search({ query: 'fallback query', maxResults: 5 })).resolves.toEqual({
      sources: [{ url: 'https://example.com/fallback', title: 'Fallback' }],
      truncated: false
    })
    expect(localCalls).toBe(1)
  })

  it('preserves an explicit local no_results status as readable evidence absence', async () => {
    const localURL = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'no_results', content: '未找到可引用来源，不能推断实时价格。', sources: [], truncated: false }))
    })
    await expect(searchLocalBrowser({ query: '不存在的基金', maxResults: 5 }, undefined, {
      url: localURL, token: 'local-only-token'
    })).resolves.toEqual({ status: 'no_results', content: '未找到可引用来源，不能推断实时价格。', sources: [], truncated: false })
  })

  it('preserves existing nonempty local summaries while rejecting an unexplained empty response', async () => {
    let content = '检索服务返回的有效摘要'
    const localURL = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ content, sources: [], truncated: false }))
    })
    const endpoint = { url: localURL, token: 'local-only-token' }
    await expect(searchLocalBrowser({ query: '摘要', maxResults: 5 }, undefined, endpoint)).resolves.toMatchObject({ content })
    content = ''
    await expect(searchLocalBrowser({ query: '摘要', maxResults: 5 }, undefined, endpoint)).rejects.toMatchObject({ code: 'WEB_LOCAL_SEARCH_FAILED' })
  })

  it('does not classify a malformed bridge response as an empty search', async () => {
    let body = null
    const localURL = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    })
    const endpoint = { url: localURL, token: 'local-only-token' }
    await expect(searchLocalBrowser({ query: '查询', maxResults: 5 }, undefined, endpoint)).rejects.toMatchObject({ code: 'WEB_LOCAL_SEARCH_FAILED' })
    body = { status: 'no_results' }
    await expect(searchLocalBrowser({ query: '查询', maxResults: 5 }, undefined, endpoint)).rejects.toMatchObject({ code: 'WEB_LOCAL_SEARCH_FAILED' })
  })

  it('uses local search for an unknown provider profile instead of demanding an API route', async () => {
    const { ctx, credentialRefs } = fakeContext({
      provider: 'custom-model',
      model: 'private-model',
      includeProfile: false
    })
    const provider = new SessionModelSearchProvider({
      mode: () => 'auto',
      resolveRoute: () => resolveSessionSearchRoute(ctx),
      resolveNativeOptions: () => resolveSessionSearchOptions(ctx),
      searchLocal: async () => ({
        sources: [{ url: 'https://example.com/custom' }],
        truncated: false
      })
    })

    await expect(provider.search({ query: 'custom route', maxResults: 5 })).resolves.toMatchObject({
      sources: [{ url: 'https://example.com/custom' }]
    })
    expect(credentialRefs).toEqual([])
  })

  it('does not fall back after cancellation', async () => {
    const { ctx } = fakeContext({
      provider: 'kimi-coding',
      model: 'kimi-for-coding',
      api: 'anthropic-messages'
    })
    let localCalls = 0
    const provider = new SessionModelSearchProvider({
      mode: () => 'auto',
      resolveRoute: () => resolveSessionSearchRoute(ctx),
      resolveNativeOptions: () => resolveSessionSearchOptions(ctx),
      searchLocal: async () => {
        localCalls += 1
        return { sources: [], truncated: false }
      }
    })
    const abort = new AbortController()
    abort.abort(new Error('cancelled'))

    await expect(provider.search({ query: 'cancelled', maxResults: 5 }, abort.signal)).rejects.toMatchObject({
      code: 'WEB_ABORTED'
    })
    expect(localCalls).toBe(0)
  })

  it('honors native-only and off modes without silently using the browser', async () => {
    const { ctx } = fakeContext({
      provider: 'kimi-coding',
      model: 'kimi-for-coding',
      api: 'anthropic-messages'
    })
    let localCalls = 0
    const dependencies = {
      resolveRoute: () => resolveSessionSearchRoute(ctx),
      resolveNativeOptions: () => resolveSessionSearchOptions(ctx),
      searchLocal: async () => {
        localCalls += 1
        return { sources: [], truncated: false }
      }
    }
    const nativeOnly = new SessionModelSearchProvider({
      ...dependencies,
      mode: () => 'native-only'
    })
    const off = new SessionModelSearchProvider({ ...dependencies, mode: () => 'off' })

    await expect(nativeOnly.search({ query: 'native only', maxResults: 5 })).rejects.toMatchObject({
      code: 'WEB_NATIVE_SEARCH_REQUIRED'
    })
    await expect(off.search({ query: 'off', maxResults: 5 })).rejects.toMatchObject({
      code: 'WEB_SEARCH_DISABLED'
    })
    expect(localCalls).toBe(0)
  })
})

it('fetches rendered page content through the authenticated desktop route', async () => {
  const { fetchLocalBrowser } = await import('../packages/dsh-web-search-session-model/index.js')
  let seen
  const url = await listen((req,res) => {
    seen = {path:req.url,token:req.headers.authorization}
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({url:'https://example.com/doc',statusCode:200,body:{kind:'text',content:'文档正文'},truncated:false}))
  })
  const result = await fetchLocalBrowser({url:'https://example.com/doc'},undefined,{url,token:'test-token'})
  expect(seen).toEqual({path:'/fetch',token:'Bearer test-token'})
  expect(result.body.content).toBe('文档正文')
})


it('preserves a verified local query and engine as readable provenance without losing the actual sources',async()=>{
 const query='煤电容量电价 国家发改委 2026',provenance={engine:'bing',requestedQuery:query,documentQuery:query,pageTitle:query+' - 搜索'}
 const localURL=await listen((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({sources:[{url:'https://example.org/policy',title:'容量电价政策'}],truncated:false,provenance}))})
 const result=await searchLocalBrowser({query,maxResults:5},undefined,{url:localURL,token:'test-token'})
 expect(result.sources).toEqual([{url:'https://example.org/policy',title:'容量电价政策'}])
 expect(result.content).toContain('Bing')
 expect(result.content).toContain(query)
})

it('does not claim verified query provenance for a local result carrying another document query',async()=>{
 const query='煤电容量电价',localURL=await listen((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({sources:[{url:'https://example.org/coal'}],truncated:false,provenance:{engine:'bing',requestedQuery:query,documentQuery:'煤',pageTitle:'煤 - 搜索'}}))})
 await expect(searchLocalBrowser({query,maxResults:5},undefined,{url:localURL,token:'test-token'})).rejects.toMatchObject({code:'WEB_LOCAL_SEARCH_FAILED'})
})


it('does not turn query provenance alone into a successful search with no sources or evidence',async()=>{
 const query='煤电政策',localURL=await listen((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({sources:[],truncated:false,provenance:{engine:'bing',requestedQuery:query,documentQuery:query,pageTitle:query+' - 搜索'}}))})
 await expect(searchLocalBrowser({query,maxResults:5},undefined,{url:localURL,token:'test-token'})).rejects.toMatchObject({code:'WEB_LOCAL_SEARCH_FAILED'})
})

it('routes desktop auto mode directly to Doubao even with a model-native search route', async () => {
  const resolveRoute = vi.fn(async () => ({ nativeKind: 'openai-responses' }))
  const searchDefault = vi.fn(async () => ({ sources: [{ url: 'https://example.org' }], truncated: false }))
  const provider = new SessionModelSearchProvider({ mode: () => 'auto', resolveRoute, searchDefault })
  const request = { query: 'public query', maxResults: 2 }
  await expect(provider.search(request)).resolves.toMatchObject({ sources: [{ url: 'https://example.org' }] })
  expect(searchDefault).toHaveBeenCalledWith(request, undefined)
  expect(resolveRoute).not.toHaveBeenCalled()
  searchDefault.mockRejectedValueOnce(new Error('Doubao unavailable'))
  await expect(provider.search(request)).rejects.toThrow('Doubao unavailable')
  expect(resolveRoute).not.toHaveBeenCalled()
})
