import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
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
  const request = async (body, headers = {}, method = 'POST', observe) => {
    const req = Readable.from([JSON.stringify(body)])
    Object.assign(req, { method, headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', ...headers }, socket: { remoteAddress: '127.0.0.1' } })
    let result
    const res = Object.assign(new EventEmitter(), { writeHead: (status) => { result = { status } }, end: (text) => { result.body = JSON.parse(text); res.writableEnded = true } })
    observe?.(req, res)
    await routes.get(PREPARE_CONTEXT_PATH).handler(req, res)
    return result
  }
  return { runtime, routes, tools, agents, ctx, request }
}
const prepareArgs = { sessionId: 'parent', captureId: 'capture', query: '失效边界' }
const exec = { agent: { session: { id: 'parent' } } }

describe('Research context runtime', () => {
  it('cancels a stalled snapshot response body and leaves no late prepare after disconnect', async () => {
    let streamStarted = false, cancelled = false, response, stream
    const f = fixture({ fetch: async () => new Response(new ReadableStream({
      start(controller) { stream = controller; streamStarted = true; controller.enqueue(Buffer.from('{"sources":')) },
      cancel() { cancelled = true }
    })) })
    const pending = f.request(prepareArgs, {}, 'POST', (_req, res) => { response = res })
    await vi.waitFor(() => expect(streamStarted).toBe(true))
    response.emit('close')
    try {
      await vi.waitFor(() => expect(cancelled).toBe(true), { timeout: 200 })
      expect(await pending).toBeUndefined()
    } finally {
      // Dispose must not keep a cancelled body reader alive either.
      if (!cancelled) stream.close()
      await pending
      await f.runtime.dispose()
    }
  })
  it('disposes an admitted prepare while its HTTP request body is still pending', async () => {
    let finish, settled = false
    const f = fixture({ readJsonBody: () => new Promise((resolve) => { finish = () => resolve(prepareArgs) }) })
    const pending = f.request(prepareArgs).finally(() => { settled = true })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const disposing = f.runtime.dispose()
    try {
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    } finally {
      finish()
      await pending
      await disposing
    }
  })
  it('rejects a pre-aborted execution signal without returning a registered tool result', async () => {
    const f = fixture()
    const { body: packet } = await f.request(prepareArgs)
    for (const kind of ['list', 'search', 'read']) {
      const args = { snapshotId: packet.snapshotId, ...(kind === 'search' ? { query: '库存' } : {}), ...(kind === 'read' ? { sourceId: 'report' } : {}) }
      await expect(f.tools.get(`research_context_${kind}`).execute(args, { ...exec, signal: AbortSignal.abort() })).rejects.toThrow()
    }
  })
  it('cancels the owned first scan extraction on exec abort and never starts the next file', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'context-scan-abort-')))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'file.md')
    await writeFile(path, '库存')
    const revision = await stat(path)
    const started = [], cleaned = []
    let finish
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ sources: Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, title: '报告', kind: 'file', path, revision })) })), loadFileText: async (source, signal) => {
      started.push(source.id)
      if (source.id !== 'f4') return 'ordinary'
      return new Promise((resolve, reject) => {
        finish = () => resolve('late')
        signal?.addEventListener('abort', () => { cleaned.push(source.id); reject(signal.reason) }, { once: true })
      })
    } })
    const { body: packet } = await f.request(prepareArgs)
    const controller = new AbortController()
    const pending = f.tools.get('research_context_search').execute({ snapshotId: packet.snapshotId, query: '库存' }, { ...exec, signal: controller.signal })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    controller.abort()
    finish()
    await expect(pending).rejects.toThrow()
    expect(started.slice(0, 4).sort()).toEqual(['f0', 'f1', 'f2', 'f3'])
    expect(started.slice(4)).toEqual(['f4'])
    expect(cleaned).toEqual(['f4'])
  })
  it.each(['disconnect', 'dispose'])('aborts in-flight prepare extraction and cleans request listeners on %s', async (mode) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'context-prepare-abort-')))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'file.md')
    await writeFile(path, '库存')
    const revision = await stat(path)
    let extractionSignal, finish, request, response
    let cleaned = false
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ sources: [{ id: 'f', title: '报告', kind: 'file', path, revision }] })), loadFileText: async (_source, signal) => new Promise((resolve, reject) => {
      extractionSignal = signal
      finish = () => resolve('late')
      signal?.addEventListener('abort', () => { cleaned = true; reject(signal.reason) }, { once: true })
    }) })
    const pending = f.request(prepareArgs, {}, 'POST', (req, res) => { request = req; response = res })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    if (mode === 'disconnect') response.emit('close')
    else await f.runtime.dispose()
    finish()
    const result = await pending
    expect(extractionSignal?.aborted).toBe(true)
    expect(cleaned).toBe(true)
    expect(result?.status ?? 400).toBeGreaterThanOrEqual(400)
    expect(request.listenerCount('aborted')).toBe(0)
    expect(response.listenerCount('close')).toBe(0)
  })
  it('aborts the extractor on frozen-loader timeout and skips a pre-aborted load', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'context-timeout-abort-')))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'file.md')
    await writeFile(path, '库存')
    const revision = await stat(path)
    let cleaned = false, extractionSignal
    const extract = vi.fn((_source, signal) => new Promise((_resolve, reject) => {
      extractionSignal = signal
      signal?.addEventListener('abort', () => { cleaned = true; reject(signal.reason) }, { once: true })
    }))
    const load = createFrozenResearchFileLoader(extract, { timeoutMs: 20 })
    await expect(load({ path, revision }, AbortSignal.abort())).rejects.toThrow()
    expect(extract).not.toHaveBeenCalled()
    await expect(load({ path, revision })).rejects.toThrow()
    expect(extractionSignal?.aborted).toBe(true)
    expect(cleaned).toBe(true)
  })
  it('continues budget-truncated Chinese search pages through every registered tool result', async () => {
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ sources: Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, title: `市场研究${i}`, kind: 'artifact', text: `库存${'中'.repeat(1200)}${i}`
    })) })) })
    const { body: packet } = await f.request(prepareArgs)
    const tool = f.tools.get('research_context_search')
    const ids = []
    let cursor
    for (let page = 0; page < 8; page++) {
      const args = { snapshotId: packet.snapshotId, query: '库存', ...(cursor ? { cursor } : {}) }
      const value = await tool.execute(args, exec)
      expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([])
      const rendered = tool.output.render(args, value)[0].text
      expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(12288)
      expect(estimateContextTokens(rendered)).toBeLessThanOrEqual(1800)
      expect(value.sources.length).toBeGreaterThan(0)
      ids.push(...value.sources.map((source) => source.sourceId))
      if (!value.cursor) break
      expect(value.cursor).not.toBe(cursor)
      cursor = value.cursor
    }
    expect(ids).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'])
  })
  it('returns useful first entries and advancing cursors even when metadata alone exceeds the tool budget', async () => {
    const sources = Array.from({ length: 2 }, (_, i) => ({
      id: `源${'甲'.repeat(200)}${i}`, title: '长标题'.repeat(170), kind: 'artifact',
      sourceUrl: `https://example.com/${'中文路径'.repeat(400)}`,
      sourceNodeIds: Array.from({ length: 16 }, (_, n) => `节点${n}${'乙'.repeat(250)}`),
      text: `库存${'中文'.repeat(900)}${i}`
    }))
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ sources })) })
    const { body: packet } = await f.request(prepareArgs)
    for (const kind of ['list', 'search', 'read']) {
      const tool = f.tools.get(`research_context_${kind}`)
      const args = { snapshotId: packet.snapshotId, ...(kind === 'search' ? { query: '库存' } : {}), ...(kind === 'read' ? { sourceId: sources[0].id } : {}) }
      const value = await tool.execute(args, exec)
      expect(value.status).not.toBe('limited')
      expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([])
      const entry = kind === 'read' ? value : value.sources[0]
      expect(entry?.sourceId).toBe(sources[0].id)
      expect(entry.sourceNodeIds[0]).toBe(sources[0].sourceNodeIds[0])
      expect(entry.sourceNodeIdsTruncated).toBe(true)
      if (kind !== 'list') expect(entry.text).toContain('库存')
      expect(value.cursor).toBeDefined()
      if (kind === 'read') expect(value.cursor).toBeGreaterThan(0)
      const rendered = tool.output.render(args, value)[0].text
      expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(12288)
      expect(estimateContextTokens(rendered)).toBeLessThanOrEqual(1800)
    }
  })
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
      expect(tool.parameters.properties.signal).toBeUndefined()
      const value = await tool.execute(input, exec)
      expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([])
      const blocks = tool.output.render(input, value)
      expect(blocks).toEqual([{ type: 'text', text: JSON.stringify(value) }])
      expect(Buffer.byteLength(blocks[0].text)).toBeLessThanOrEqual(12288)
      expect(estimateContextTokens(blocks[0].text)).toBeLessThanOrEqual(1800)
      await expect(tool.execute(input, { agent: { session: { id: 'other' } } })).rejects.toThrow()
      await expect(tool.execute({ ...input, sessionId: 'parent', path: '/private/secret' }, exec)).rejects.toThrow()
      await expect(tool.execute({ ...input, signal: {} }, exec)).rejects.toThrow()
      await expect(tool.execute(input, {})).rejects.toThrow()
    }
    await f.runtime.dispose()
    expect(f.tools.size).toBe(0)
    expect(f.routes.size).toBe(0)
  })
  it('discloses evidence absent from the first packet through the actual registered search and paged read tools', async () => {
    const tail = '深层唯一证据：库存激增会使变量关系失效。'
    const body = `黄金报告首轮摘要。\n${'A'.repeat(10000)}\n${tail}`
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ sources: [
      { id: 'report', title: '黄金报告', kind: 'assistant-result', text: body }
    ] })) })
    const prepared = await f.request({ ...prepareArgs, query: '黄金报告' })
    expect(prepared.status).toBe(200)
    expect(prepared.body.initialContext).not.toContain(tail)
    const snapshotId = prepared.body.snapshotId
    const search = f.tools.get('research_context_search')
    const found = await search.execute({ snapshotId, query: '深层唯一证据' }, exec)
    expect(found.sources.some((source) => source.sourceId === 'report' && source.text.includes(tail))).toBe(true)
    const read = f.tools.get('research_context_read')
    const chunks = []
    let cursor
    for (let page = 0; page < 6; page++) {
      const input = { snapshotId, sourceId: 'report', ...(cursor === undefined ? {} : { cursor }) }
      const value = await read.execute(input, exec)
      expect(validateJsonSchemaValue(read.output.schema, value)).toEqual([])
      expect(Buffer.byteLength(read.output.render(input, value)[0].text)).toBeLessThanOrEqual(12288)
      chunks.push(value.text)
      if (value.cursor === undefined) break
      expect(value.cursor).toBeGreaterThan(cursor ?? 0)
      cursor = value.cursor
    }
    expect(chunks.join('')).toContain(tail)
    await expect(read.execute({ snapshotId, sourceId: 'report' }, { agent: { session: { id: 'other' } } })).rejects.toThrow()
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
  it('marks a valid large native table as truncated through capture, prepare and its final read page', async () => {
    const bridge = new ResearchContextBridge({
      readCanvas: () => ({ files: [], artifacts: [
        { id: 'large', title: '大表', kind: 'generated-container', generationStatus: 'completed', containerSpec: { version: 1, type: 'table', title: '大表', columns: Array.from({ length: 12 }, (_, i) => `列${i}`), rows: Array.from({ length: 100 }, () => Array.from({ length: 12 }, () => 'a'.repeat(512))) } },
        { id: 'small', title: '小表', kind: 'generated-container', generationStatus: 'completed', containerSpec: { version: 1, type: 'table', title: '小表', columns: ['指标'], rows: [['100']] } }
      ] }), resolveFile: async () => null
    })
    const endpoint = await bridge.start()
    cleanups.push(() => bridge.stop())
    const capture = await bridge.capture({ sessionId: 'parent' })
    const response = await fetch(`${endpoint.url}/snapshot`, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}` }, body: JSON.stringify({ sessionId: 'parent', captureId: capture.captureId }) })
    const { sources } = await response.json()
    expect(sources[0].text.length).toBeLessThanOrEqual(120000)
    expect(sources[0].truncated).toBe(true)
    expect(sources[1].truncated).toBeUndefined()
    const f = fixture({ env: { SHERLOCK_RESEARCH_CONTEXT_URL: endpoint.url, SHERLOCK_RESEARCH_CONTEXT_TOKEN: endpoint.token }, fetch: globalThis.fetch })
    const { status, body: packet } = await f.request({ sessionId: 'parent', captureId: capture.captureId, query: '大表' })
    expect(status).toBe(200)
    expect(packet.initialContext).toContain('已截断')
    const read = f.tools.get('research_context_read')
    const last = await read.execute({ snapshotId: packet.snapshotId, sourceId: 'large', cursor: Array.from(sources[0].text).length - 50 }, exec)
    expect(last).toMatchObject({ status: 'truncated', truncated: true, limited: true })
    expect(last.cursor).toBeUndefined()
    expect(last.text).toContain('该资料在捕获时已截断')
    const small = await read.execute({ snapshotId: packet.snapshotId, sourceId: 'small' }, exec)
    expect(small).toMatchObject({ status: 'ready', limited: false })
    expect(small.text).toContain('小表\n指标\n100')
    expect(small.truncated).toBeUndefined()
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
    const observation = vi.spyOn(ResearchContextIndex.prototype, 'prepare').mockImplementation(function (...args) { observedIndex = this; return original.apply(this, args) })
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
