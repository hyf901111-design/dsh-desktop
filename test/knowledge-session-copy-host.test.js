import { expect, test, vi } from 'vitest'
import { registerKnowledgeSessions } from '../packages/dsh-research-task-runtime/knowledge-sessions.js'

const sessionId = 'session-0ec3c0e2-043a-481b-aeca-ab81b053a100'
const title = '销售分析（副本）'

function testRoute(events = []) {
  const session = { id: sessionId, header: {}, events, append(type, data) { events.push({ type, data }) } }
  const flush = vi.fn(async () => true)
  const rename = vi.fn((target, name) => target.append('session/title', { title: name }))
  let handler
  registerKnowledgeSessions({
    webServer: { register(route) { handler = route.handler } },
    sessions: { get: id => id === sessionId ? session : undefined, flush },
    sessionTitle: { get: target => target.events.findLast(event => event.type === 'session/title')?.data, rename }
  }, { isTrustedRequest: req => req.trusted, readJsonBody: async req => req.input })
  return {
    events, flush, rename,
    async request(input, trusted = true) {
      let status, body
      await handler({ method: 'POST', trusted, input }, {
        writeHead(code) { status = code },
        end(response) { body = JSON.parse(response) }
      })
      return { status, body }
    }
  }
}

test('persists the copy title and participation once and acknowledges only after a successful flush', async () => {
  const route = testRoute()
  route.flush.mockResolvedValueOnce(false)
  expect((await route.request({ sessionId, title })).status).toBe(400)
  expect(await route.request({ sessionId, title })).toEqual({ status: 200, body: { ok: true } })
  expect(route.events.map(event => event.type)).toEqual(['session/title', 'workspace-knowledge/copied'])
  expect(route.flush).toHaveBeenCalledTimes(2)
})

test('recovers a legacy copy without renaming it and rejects other sessions and origins', async () => {
  const route = testRoute([{ type: 'session/title', data: { title } }])
  expect((await route.request({ sessionId, title }, false)).status).toBe(403)
  expect((await route.request({ sessionId, title: '其他标题（副本）', existing: true })).status).toBe(400)
  expect((await route.request({ sessionId, title })).status).toBe(400)
  expect((await route.request({ sessionId, title, existing: true })).status).toBe(200)
  expect(route.rename).not.toHaveBeenCalled()
  expect(route.events.map(event => event.type)).toEqual(['session/title', 'workspace-knowledge/copied'])
})

test('keeps a file import under its own title and persists the workspace entry', async () => {
  const route = testRoute()
  const name = '销售分析'
  expect((await route.request({ sessionId, title: name })).status).toBe(400)
  expect((await route.request({ sessionId, title: name, imported: true })).status).toBe(200)
  expect(route.rename).toHaveBeenCalledWith(expect.anything(), name)
  expect(route.events.map(event => event.type)).toEqual(['session/title', 'workspace-knowledge/copied'])
})
