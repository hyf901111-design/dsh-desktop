import { Readable } from 'node:stream'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { registerResearchContextRuntime, createFrozenResearchFileLoader, PREPARE_CONTEXT_PATH } from '../packages/dsh-research-task-runtime/context-runtime.js'
import { ResearchContextIndex, estimateContextTokens } from '../packages/dsh-research-task-runtime/context-index.js'
import { ResearchContextBridge } from '../src/main/state/research-context-bridge.ts'
import { apply, inject, isTrustedRequest, readJsonBody, loadResearchFileText } from '../packages/dsh-research-task-runtime/index.js'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
function fixture(options = {}) {
  const routes = new Map(), tools = new Map(), agents = new Map([['parent', { id: 'parent' }]])
  const ctx = { agents, typert: { lookups: new Map() }, webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) } }, tools: { register: (tool) => { tools.set(tool.name, tool); return () => tools.delete(tool.name) } } }
  const runtime = registerResearchContextRuntime(ctx, { isTrustedRequest, readJsonBody, loadFileText: loadResearchFileText, env: { SHERLOCK_RESEARCH_CONTEXT_URL: 'http://127.0.0.1:12345', SHERLOCK_RESEARCH_CONTEXT_TOKEN: 'private-token' }, fetch: async (url, init) => {
    expect(url).toBe('http://127.0.0.1:12345/snapshot')
    expect(init.headers.authorization).toBe('Bearer private-token')
    expect(JSON.parse(init.body)).toEqual({ sessionId: 'parent', captureId: 'capture' })
    return new Response(JSON.stringify({ sources: [{ id: 'report', title: '报告', kind: 'assistant-result', text: '失效边界：库存。\n'.repeat(300), sourceNodeIds: ['original'] }] }))
  }, ...options })
  cleanups.push(() => runtime.dispose())
  const request = async (body, headers = {}, method = 'POST') => {
    const req = Readable.from([JSON.stringify(body)])
    Object.assign(req, { method, headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', ...headers }, socket: { remoteAddress: '127.0.0.1' } })
    let result
    const res = { writeHead: (status) => { result = { status } }, end: (text) => { result.body = JSON.parse(text) } }
    await routes.get(PREPARE_CONTEXT_PATH).handler(req, res)
    return result
  }
  return { runtime, routes, tools, agents, ctx, request }
}
const prepareArgs = { sessionId: 'parent', captureId: 'capture', query: '失效边界' }
const exec = { agent: { session: { id: 'parent' } } }

describe('Research context runtime', () => {
  it('composes actual plugin setup with existing generation routes and cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'research-context-plugin-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = directory
    const f = fixture()
    await f.runtime.dispose()
    let dispose
    try {
      await apply({ ...f.ctx, effect: (setup) => { dispose = setup() } })
      expect(inject).toContain('tools')
      expect([...f.routes.keys()].sort()).toEqual(['/sherlock/research-context/prepare', '/sherlock/research-tasks/cancel', '/sherlock/research-tasks/inspect', '/sherlock/research-tasks/start'])
      expect(f.tools.size).toBe(3)
    } finally {
      await dispose?.()
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
    expect(f.routes.size).toBe(0)
    expect(f.tools.size).toBe(0)
  })
  it('prepares captured sources and registers schema-valid progressive tools owned by the executing session', async () => {
    const f = fixture()
    const prepared = await f.request(prepareArgs)
    expect(prepared.status).toBe(200)
    const packet = prepared.body
    expect(packet.initialContext).toContain('失效边界')
    expect(packet.initialContext).toContain('research_context_read')
    expect(JSON.stringify(packet)).not.toMatch(/private-token|12345|path/)
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(32768)
    expect(estimateContextTokens(JSON.stringify(packet))).toBeLessThanOrEqual(6000)
    for (const [name, args] of [['list', {}], ['search', { query: '库存' }], ['read', { sourceId: 'report' }]]) {
      const tool = f.tools.get(`research_context_${name}`)
      const input = { snapshotId: packet.snapshotId, ...args }
      expect(tool.parameters.properties.sessionId).toBeUndefined()
      expect(tool.parameters.properties.path).toBeUndefined()
      const value = await tool.execute(input, exec)
      expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([])
      const blocks = tool.output.render(input, value)
      expect(blocks).toEqual([{ type: 'text', text: JSON.stringify(value) }])
      expect(Buffer.byteLength(blocks[0].text)).toBeLessThanOrEqual(12288)
      expect(estimateContextTokens(blocks[0].text)).toBeLessThanOrEqual(1800)
      await expect(tool.execute(input, { agent: { session: { id: 'other' } } })).rejects.toThrow()
      await expect(tool.execute({ ...input, sessionId: 'parent', path: '/private/secret' }, exec)).rejects.toThrow()
      await expect(tool.execute(input, {})).rejects.toThrow()
    }
    await f.runtime.dispose()
    expect(f.tools.size).toBe(0)
    expect(f.routes.size).toBe(0)
  })
  it('runs the private HTTP transport and actual extractor end to end without publishing the authorized file path', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'research-context-http-')))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'report.md')
    await writeFile(path, '端到端授权资料，失效边界是库存增加。')
    const bridge = new ResearchContextBridge({ readCanvas: () => ({ files: [{ id: 'file', name: 'report.md', authorizationId: 'authorized' }], artifacts: [] }), resolveFile: async ({ sessionId, nodeId, authorizationId }) => sessionId === 'parent' && nodeId === 'file' && authorizationId === 'authorized' ? { path, name: 'report.md' } : null })
    const endpoint = await bridge.start()
    cleanups.push(() => bridge.stop())
    const capture = await bridge.capture({ sessionId: 'parent' })
    const f = fixture({ env: { SHERLOCK_RESEARCH_CONTEXT_URL: endpoint.url, SHERLOCK_RESEARCH_CONTEXT_TOKEN: endpoint.token }, fetch: globalThis.fetch })
    const { status, body: packet } = await f.request({ sessionId: 'parent', captureId: capture.captureId, query: '失效边界' })
    expect(status).toBe(200)
    expect(packet.initialContext).toContain('端到端授权资料')
    const tool = f.tools.get('research_context_read')
    const value = await tool.execute({ snapshotId: packet.snapshotId, sourceId: 'file' }, exec)
    expect(value).toMatchObject({ status: 'truncated', truncated: true })
    expect(value.text).toContain('库存增加')
    expect(JSON.stringify([packet, value])).not.toContain(path)
    expect(JSON.stringify([packet, value])).not.toContain(endpoint.token)
  })
  it('preserves bounded schema-valid results and cumulative source budget through the model render seam', async () => {
    const f = fixture()
    const { body: packet } = await f.request(prepareArgs)
    const read = f.tools.get('research_context_read')
    const input = { snapshotId: packet.snapshotId, sourceId: 'report' }
    let tokens = 0, bytes = 0, reachedLimit = false
    for (let i = 0; i < 30; i++) {
      const value = await read.execute(input, exec)
      expect(validateJsonSchemaValue(read.output.schema, value)).toEqual([])
      const rendered = read.output.render(input, value)[0].text
      expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(12288)
      expect(estimateContextTokens(rendered)).toBeLessThanOrEqual(1800)
      if (value.status === 'limited') { reachedLimit = true; break }
      bytes += Buffer.byteLength(rendered)
      tokens += estimateContextTokens(rendered)
    }
    expect(reachedLimit).toBe(true)
    expect(bytes).toBeLessThanOrEqual(65536)
    expect(tokens).toBeLessThanOrEqual(12000)
  })
  it('requires a same-origin POST, exact parameters and an existing parent including first-session resolution', async () => {
    const f = fixture()
    for (const [body, headers, method] of [[prepareArgs, { origin: 'https://evil.example' }, 'POST'], [prepareArgs, {}, 'GET'], [{ ...prepareArgs, path: '/private/secret' }, {}, 'POST'], [{ ...prepareArgs, sessionId: 'missing' }, {}, 'POST']]) {
      const result = await f.request(body, headers, method)
      expect(result.status).toBeGreaterThanOrEqual(400)
      expect(JSON.stringify(result.body)).not.toContain('/private')
    }
    f.agents.clear()
    f.ctx.typert.lookups.set('agent', { resolve: async (id) => { const parent = { id }; f.agents.set(id, parent); return parent } })
    expect((await f.request(prepareArgs)).status).toBe(200)
  })
  it('sanitizes transport errors and prevents asynchronous prepare after dispose', async () => {
    const failed = fixture({ fetch: async () => { throw new Error('/private/secrets private-token') } })
    expect(JSON.stringify((await failed.request(prepareArgs)).body)).not.toMatch(/private|token/)
    let finish
    const pending = fixture({ fetch: () => new Promise((resolve) => { finish = resolve }) })
    const response = pending.request(prepareArgs)
    while (!finish) await new Promise((resolve) => setImmediate(resolve))
    await pending.runtime.dispose()
    finish(new Response(JSON.stringify({ sources: [{ id: 'one', title: '资料', kind: 'artifact', text: '过期数据' }] })))
    expect((await response).status).toBeGreaterThanOrEqual(400)
  })
  it('does not retain an index snapshot when disposal races a file extraction already in progress', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'research-context-dispose-')))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'report.md')
    await writeFile(path, 'old')
    const file = await stat(path)
    let finish, observedIndex
    const original = ResearchContextIndex.prototype.prepare
    const observation = vi.spyOn(ResearchContextIndex.prototype, 'prepare').mockImplementation(function (args) { observedIndex = this; return original.call(this, args) })
    cleanups.push(() => observation.mockRestore())
    const f = fixture({ loadFileText: () => new Promise((resolve) => { finish = resolve }), fetch: async () => new Response(JSON.stringify({ sources: [{ id: 'file', title: '报告', kind: 'file', path, revision: { size: file.size, mtimeMs: file.mtimeMs } }] })) })
    const pending = f.request(prepareArgs)
    while (!finish) await new Promise((resolve) => setImmediate(resolve))
    await f.runtime.dispose()
    finish('old')
    expect((await pending).status).toBeGreaterThanOrEqual(400)
    expect(observedIndex.snapshots.size).toBe(0)
  })
  it('uses real extraction, rejects changed revisions before and after reading and times out without stale insertion', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'research-context-loader-')))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const path = join(directory, 'report.md')
    await writeFile(path, '研究事实')
    const file = await stat(path)
    const source = { id: 'report', title: '报告', kind: 'file', path, revision: { size: file.size, mtimeMs: file.mtimeMs } }
    const load = createFrozenResearchFileLoader(loadResearchFileText)
    expect(await load(source)).toEqual({ text: '研究事实', revision: source.revision })
    const mutate = createFrozenResearchFileLoader(async () => { await writeFile(path, '已变化'); return '不可信旧文' })
    await expect(mutate(source)).rejects.toThrow()
    await expect(load(source)).rejects.toThrow()
    const next = await stat(path)
    const slow = createFrozenResearchFileLoader(() => new Promise(() => {}), { timeoutMs: 5 })
    const index = new ResearchContextIndex({ loadFileText: slow })
    const packet = await index.prepare({ sessionId: 'parent', query: '研究', sources: [{ ...source, revision: { size: next.size, mtimeMs: next.mtimeMs } }] })
    expect(await index.read('parent', { snapshotId: packet.snapshotId, sourceId: 'report' })).toMatchObject({ status: 'unavailable', text: '' })
  })
})
