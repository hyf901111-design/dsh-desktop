import { expect, it, vi } from 'vitest'
import { handleRequest } from '../services/fund-data/http.js'

const accountToken = 'a'.repeat(64)
const providerKey = 'fixture-cloudflare-agent-plan-key'
const request = (path, body, token = accountToken) => new Request('https://updates.evanarts.com' + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body)
})

function env(fetch) {
  return {
    ACCOUNTS_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'user-a' }), run: async () => {} }) }) },
    VOLCENGINE_AGENT_PLAN_KEY: providerKey,
    VOLCENGINE_REQUEST_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    fetch
  }
}

it('authenticates the web search, forwards only the normalized query, and returns safe source fields', async () => {
  const upstream = vi.fn(async () => Response.json({ Result: { WebResults: [
    { Url: 'https://example.com/', Title: 'Result ' + providerKey, Snippet: 'A snippet', SiteName: 'Example News', PublishTime: '2026-11-12T08:30:00+08:00', Content: 'unused raw content' },
    { Url: 'javascript:alert(1)' },
    { Url: 'https://example.com/' },
    { Url: 'https://example.net/?key=' + providerKey }
  ] } }))
  const bindings = env(upstream)
  const path = '/v1/doubao/search'
  expect((await handleRequest(request(path, { query: 'public query' }, ''), bindings)).status).toBe(401)
  expect((await handleRequest(request(path, { query: '测'.repeat(101) }), bindings)).status).toBe(400)
  expect(upstream).not.toHaveBeenCalled()
  const response = await handleRequest(request(path, { query: ' public query ', maxResults: 3, ignored: 'private' }), bindings)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ provider: 'doubao', truncated: false, sources: [
    { url: 'https://example.com/', title: 'Result [redacted]', snippet: 'A snippet', siteName: 'Example News', publishedAt: '2026-11-12T08:30:00+08:00' }
  ] })
  expect(upstream).toHaveBeenCalledOnce()
  const [[url, options]] = upstream.mock.calls
  expect(url).toBe('https://open.feedcoopapi.com/search_api/web_search')
  expect(options.redirect).toBe('manual')
  expect(options.headers.authorization).toBe('Bearer ' + providerKey)
  expect(JSON.parse(options.body)).toEqual({
    Query: 'public query', SearchType: 'web', Count: 3, Filter: { NeedUrl: true }, QueryControl: { QueryRewrite: false }
  })
})

it('exposes a single MCP tool and confines provider credentials and session IDs to the Worker', async () => {
  const secretSession = 'private-provider-session'
  const upstream = vi.fn()
    .mockResolvedValueOnce(Response.json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }, { headers: { 'mcp-session-id': secretSession } }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(new Response('data: ' + JSON.stringify({ jsonrpc: '2.0', id: 2, result: {
      content: [{ type: 'text', text: '查询结果 ' + providerKey + ' ' + secretSession }]
    } }) + '\r\n\r\n', { headers: { 'content-type': 'text/event-stream' } }))
  const bindings = env(upstream)
  const rpc = (method, params) => request('/v1/datapro/mcp', { jsonrpc: '2.0', id: 7, method, params })
  const tools = await handleRequest(rpc('tools/list'), bindings)
  expect((await tools.json()).result.tools.map(tool => tool.name)).toEqual(['dataPro_search'])
  expect((await handleRequest(rpc('tools/call', { name: 'write' }), bindings)).status).toBe(400)
  expect(upstream).not.toHaveBeenCalled()
  const response = await handleRequest(rpc('tools/call', { name: 'dataPro_search', arguments: { query: ' 股票查询 ', ignored: 'private' } }), bindings)
  expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: '查询结果 [redacted] [redacted]' }] } })
  expect(response.headers.get('mcp-session-id')).toBeNull()
  expect(upstream.mock.calls.map(([url, options]) => [url, options.headers['X-Agent-Plan-Key'], JSON.parse(options.body).method])).toEqual([
    ['https://datapro.hqd.cn-beijing.volces.com/mcp', providerKey, 'initialize'],
    ['https://datapro.hqd.cn-beijing.volces.com/mcp', providerKey, 'notifications/initialized'],
    ['https://datapro.hqd.cn-beijing.volces.com/mcp', providerKey, 'tools/call']
  ])
  expect(upstream.mock.calls[2][1].headers['mcp-protocol-version']).toBe('2025-06-18')
  expect(upstream.mock.calls[2][1].headers['mcp-session-id']).toBe(secretSession)
  expect(JSON.parse(upstream.mock.calls[2][1].body).params).toEqual({ name: 'dataPro_search', arguments: { query: '股票查询' } })
})
