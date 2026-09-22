import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

export async function createMcpHttpFixture(options = {}) {
  const metrics = { initializes: 0, calls: 0, unauthorized: 0, deletes: 0, requests: 0 }
  const sessions = new Map()
  const servers = new Set()
  let attempts = 0
  const listener = createServer(async (request, response) => {
    metrics.requests++
    if (options.secret && request.headers.authorization !== `Bearer ${options.secret}`) {
      metrics.unauthorized++
      response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'authorization required' }))
      return
    }
    if (++attempts <= (options.failRequests ?? 0)) { response.writeHead(503).end('temporarily unavailable'); return }
    let body
    if (request.method === 'POST') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      body = JSON.parse(raw)
    }
    let transport = sessions.get(request.headers['mcp-session-id'])
    if (!transport && isInitializeRequest(body)) {
      metrics.initializes++
      const server = new Server({ name: 'ework-http-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, query => ({
        tools: [{ name: query.params?.cursor ? 'second' : 'echo', inputSchema: { type: 'object', additionalProperties: true } }],
        ...(!query.params?.cursor ? { nextCursor: 'second-page' } : {})
      }))
      server.setRequestHandler(CallToolRequestSchema, async (query, extra) => {
        metrics.calls++
        if (query.params.arguments?.wait) await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 10000)
          extra.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelled')) }, { once: true })
        })
        return { content: [{ type: 'text', text: JSON.stringify({ args: query.params.arguments, calls: metrics.calls }) }] }
      })
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true, onsessioninitialized: sessionId => sessions.set(sessionId, transport) })
      servers.add(server)
      await server.connect(transport)
    }
    if (!transport) { response.writeHead(404).end('session missing'); return }
    if (request.method === 'DELETE') metrics.deletes++
    try { await transport.handleRequest(request, response, body) } catch { if (!response.headersSent) response.writeHead(500).end() }
  })
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${listener.address().port}/mcp`, metrics,
    async close() {
      await Promise.all([...servers].map(server => server.close()))
      listener.closeAllConnections()
      await new Promise(resolve => listener.close(resolve))
    }
  }
}
