import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import * as filesystem from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { Worker } from 'node:worker_threads'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { apply, loadResearchFileText } from '../packages/dsh-research-task-runtime/index.js'
import { createFrozenResearchFileLoader, PREPARE_CONTEXT_PATH } from '../packages/dsh-research-task-runtime/context-runtime.js'

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: vi.fn() }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original()
  return { ...actual, stat: vi.fn(actual.stat) }
})
const cleanups = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  getDocument.mockReset()
})
const turn = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
async function file(name, contents = 'owned test bytes') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'research-owned-abort-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, name)
  await writeFile(path, contents)
  return { path, revision: await stat(path) }
}
function stalledPdf() {
  const content = deferred(), cleanup = deferred()
  const page = { getTextContent: vi.fn(() => content.promise), cleanup: vi.fn() }
  const document = { numPages: 2, getPage: vi.fn(async () => page), destroy: vi.fn(() => cleanup.promise) }
  getDocument.mockImplementation(() => ({ promise: Promise.resolve(document), destroy: document.destroy }))
  return { content, cleanup, page, document }
}

describe('owned research file cancellation', () => {
  it.each(['slide-count', 'slide-bytes', 'total-bytes'])('retains the PPTX %s extraction guard in the worker', async (limit) => {
    const count = limit === 'slide-count' ? 501 : limit === 'total-bytes' ? 9 : 1
    const xml = limit === 'slide-count' ? '<a:t>x</a:t>' : 'x'.repeat(2 * 1024 * 1024 + (limit === 'slide-bytes' ? 1 : 0))
    const source = await file('limits.pptx', zipSync(Object.fromEntries(Array.from({ length: count }, (_, i) => [`ppt/slides/slide${i + 1}.xml`, strToU8(xml)]))))
    await expect(loadResearchFileText(source)).rejects.toMatchObject({ code: 'SOURCE_TOO_LARGE' })
  })
  it.each(['frozen', 'extractor'])('stops the %s metadata wait before extraction after cancellation', async (kind) => {
    const source = await file('report.md', '库存')
    const lookup = deferred()
    const observed = vi.mocked(filesystem.stat).mockClear().mockImplementationOnce(() => lookup.promise)
    const controller = new AbortController()
    const load = kind === 'frozen' ? createFrozenResearchFileLoader(loadResearchFileText, { cooperativeCancellation: true }) : loadResearchFileText
    let settled = false
    const pending = load(source, controller.signal).then((value) => ({ value }), (error) => ({ error })).finally(() => { settled = true })
    await vi.waitFor(() => expect(observed).toHaveBeenCalled())
    controller.abort()
    try {
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
    } finally {
      lookup.resolve(source.revision)
      await pending
    }
    expect((await pending).error).toBeInstanceOf(Error)
  })
  it.each(['md', 'pdf', 'pptx'])('rejects pre-aborted %s extraction before touching a missing file', async (extension) => {
    await expect(loadResearchFileText({ path: `/does-not-exist/report.${extension}` }, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('destroys the PDF loading task and waits for cleanup when aborted before document resolution', async () => {
    const source = await file('report.pdf')
    const loading = deferred(), cleanup = deferred()
    const destroy = vi.fn(() => cleanup.promise)
    getDocument.mockReturnValue({ promise: loading.promise, destroy })
    const controller = new AbortController()
    let settled = false
    const pending = loadResearchFileText(source, controller.signal).finally(() => { settled = true })
    const outcome = pending.then((value) => ({ value }), (error) => ({ error }))
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1))
    controller.abort()
    try {
      await vi.waitFor(() => expect(destroy).toHaveBeenCalledTimes(1))
      expect(settled).toBe(false)
    } finally {
      loading.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'late' }] }), cleanup() {} }) })
      cleanup.resolve()
      await outcome
    }
    expect((await outcome).error).toMatchObject({ name: 'AbortError' })
    expect(destroy).toHaveBeenCalledTimes(1)
  })
  it('cancels a PDF text request without fetching another page and waits for document destruction', async () => {
    const source = await file('report.pdf')
    const pdf = stalledPdf()
    const controller = new AbortController()
    let settled = false
    const pending = loadResearchFileText(source, controller.signal).finally(() => { settled = true })
    const outcome = pending.then((value) => ({ value }), (error) => ({ error }))
    await vi.waitFor(() => expect(pdf.page.getTextContent).toHaveBeenCalledTimes(1))
    controller.abort()
    try {
      await vi.waitFor(() => expect(pdf.document.destroy).toHaveBeenCalledTimes(1))
      expect(settled).toBe(false)
      expect(pdf.page.cleanup).toHaveBeenCalledTimes(1)
    } finally {
      pdf.content.resolve({ items: [{ str: 'late' }] })
      pdf.cleanup.resolve()
      await outcome
    }
    expect((await outcome).error).toMatchObject({ name: 'AbortError' })
    expect(pdf.document.getPage).toHaveBeenCalledTimes(1)
    expect(pdf.document.destroy).toHaveBeenCalledTimes(1)
  })
  it('waits for owned PDF cleanup before frozen-loader timeout rejects', async () => {
    const source = await file('report.pdf')
    const pdf = stalledPdf()
    const load = createFrozenResearchFileLoader(loadResearchFileText, { timeoutMs: 80, cooperativeCancellation: true })
    let settled = false
    const pending = load(source).finally(() => { settled = true })
    const outcome = pending.then((value) => ({ value }), (error) => ({ error }))
    try {
      await vi.waitFor(() => expect(pdf.document.destroy).toHaveBeenCalledTimes(1))
      expect(settled).toBe(false)
    } finally {
      pdf.content.resolve({ items: [{ str: 'late' }] })
      pdf.cleanup.resolve()
      await outcome
    }
    expect((await outcome).error).toBeInstanceOf(Error)
  })
  it('terminates the real PPTX worker and observes its exit before abort rejection', async () => {
    const source = await file('report.pptx', zipSync({ 'ppt/slides/slide1.xml': strToU8('<a:p><a:t>库存证据</a:t></a:p>') }))
    const controller = new AbortController()
    const emit = Worker.prototype.emit
    let exited = false, started = false
    vi.spyOn(Worker.prototype, 'emit').mockImplementation(function (event, ...args) {
      if (event === 'online') {
        started = true
        this.once('exit', () => { exited = true })
        controller.abort()
      }
      return emit.call(this, event, ...args)
    })
    await expect(loadResearchFileText(source, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(started).toBe(true)
    expect(exited).toBe(true)
  })
  it('uses cooperative extraction in actual plugin prepare and waits for every sibling cleanup on dispose', async () => {
    const source = await file('report.pdf')
    const directory = join(source.path, '..')
    vi.stubEnv('DSH_HOME', directory)
    vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_URL', 'http://127.0.0.1:12345')
    vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_TOKEN', 'test-owned-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ sources: Array.from({ length: 4 }, (_, i) => ({ ...source, id: `f${i}`, kind: 'file', title: '报告' })) })))
    const documents = []
    getDocument.mockImplementation(() => {
      const content = deferred(), cleanup = deferred()
      const document = { numPages: 1, getPage: async () => ({ getTextContent: () => content.promise, cleanup() {} }), destroy: vi.fn(() => cleanup.promise) }
      documents.push({ document, content, cleanup })
      return { promise: Promise.resolve(document), destroy: document.destroy }
    })
    const routes = new Map()
    let dispose
    await apply({ agents: new Map([['parent', { id: 'parent' }]]), typert: { lookups: new Map() }, tools: { register: () => () => {} }, webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) } }, effect: (setup) => { dispose = setup() } })
    const req = Object.assign(Readable.from([JSON.stringify({ sessionId: 'parent', captureId: 'capture', query: '库存' })]), { method: 'POST', headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310' }, socket: { remoteAddress: '127.0.0.1' } })
    let status
    const res = Object.assign(new EventEmitter(), { writeHead: (value) => { status = value }, end() { this.writableEnded = true } })
    const pending = routes.get(PREPARE_CONTEXT_PATH).handler(req, res)
    await vi.waitFor(() => expect(documents).toHaveLength(4))
    let disposed = false, secondDisposed = false
    const disposing = dispose().then(() => { disposed = true })
    const secondDisposing = dispose().then(() => { secondDisposed = true })
    try {
      await vi.waitFor(() => expect(documents.every(({ document }) => document.destroy.mock.calls.length === 1)).toBe(true))
      for (const entry of documents.slice(0, 3)) entry.cleanup.resolve()
      await turn()
      expect(disposed).toBe(false)
      expect(secondDisposed).toBe(false)
    } finally {
      for (const entry of documents) { entry.content.resolve({ items: [{ str: 'late' }] }); entry.cleanup.resolve() }
      await disposing
      await secondDisposing
      await pending
    }
    expect(status).toBeGreaterThanOrEqual(400)
    expect(routes.size).toBe(0)
  })
})
