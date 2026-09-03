import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { ResearchContextIndex, estimateContextTokens } from '../packages/dsh-research-task-runtime/context-index.js'

const source = (id, text, overrides = {}) => ({
  id,
  kind: 'assistant-result',
  title: `${id} 标题`,
  text,
  ...overrides
})

const requireModule = createRequire(import.meta.url)

function fakeModule() {
  let fake
  const target = function () {}
  fake = new Proxy(target, {
    get: () => fake,
    apply: () => fake,
    construct: () => ({})
  })
  return fake
}

async function loadActualResearchSerializer() {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const react = requireModule('react')
  const jsxRuntime = requireModule('react/jsx-runtime')
  let descriptor
  runInNewContext(source, {
    AbortController: globalThis.AbortController,
    Date: globalThis.Date,
    TextEncoder: globalThis.TextEncoder,
    setTimeout,
    clearTimeout,
    btoa: globalThis.btoa,
    URL: globalThis.URL,
    document: undefined,
    window: { __ModuleLoader__: { load(value) { descriptor = value } }
    }
  })
  if (!descriptor) throw new Error('conversation bundle did not register')
  return descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    return fakeModule()
  })
}

function serializedHeader(client, packet) {
  return client.serializeResearchPrompt([], '', [], [], [], { version: 1, ...packet })
}

describe('ResearchContextIndex', () => {
  it('ranks Chinese evidence, keeps the question outside evidence, and isolates snapshots by session', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => 'file text', id: () => 'snapshot-a' })
    const packet = await index.prepare({
      sessionId: 'a',
      query: '黄金因子失效边界',
      sources: [
        source('report', '失效边界：高通胀下美元指数关系反转。', { title: '黄金因子报告' }),
        source('quote', '沪深300ETF 最新价4.6', { kind: 'generated-container', title: 'ETF行情' })
      ]
    })

    expect(packet.initialSourceIds[0]).toBe('report')
    expect(packet.initialContext).toContain('失效边界')
    expect(packet.initialContext).toContain('不可信资料')
    expect(packet.initialContext).toContain('research_context_read')
    expect(packet.initialContext).not.toContain('黄金因子失效边界')
    await expect(index.read('b', { snapshotId: packet.snapshotId, sourceId: 'report' })).rejects.toThrow(/会话|snapshot/i)
  })

  it('honors initial serialized-byte and token budgets including wrappers for long multilingual text', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'budget', query: 'English market', contextWindow: 1_000_000,
      sources: [source('long', `${'黄金风险 English market data '.repeat(12_000)}\n尾部`)]
    })

    expect(Buffer.byteLength(packet.initialContext, 'utf8')).toBeLessThanOrEqual(32 * 1024)
    expect(estimateContextTokens(packet.initialContext)).toBeLessThanOrEqual(6_000)
    expect(packet.initialContext).toMatch(/截断|剩余/i)
  })

  it('reserves the actual V1 serializer envelope, including suffix escaping, inside the initial budget', async () => {
    const client = await loadActualResearchSerializer()
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'serialized-budget', query: '市场证据',
      sources: Array.from({ length: 4 }, (_, number) => source(
        `quoted-${number}`, `${'市场证据 \u241f "quoted" 多语言资料。'.repeat(8_000)}`
      ))
    })
    const prompt = serializedHeader(client, packet)

    expect(prompt).toContain('\\u241f')
    expect(Buffer.byteLength(prompt, 'utf8')).toBeLessThanOrEqual(32 * 1024)
    expect(estimateContextTokens(prompt)).toBeLessThanOrEqual(6_000)
  })

  it('uses exactly eight percent of a known small context window and rejects an impossible minimum packet', async () => {
    const client = await loadActualResearchSerializer()
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'small-window', query: '黄金', contextWindow: 4_096,
      sources: [source('gold', '黄金失效边界的实际利率证据。')]
    })
    const prompt = serializedHeader(client, packet)

    expect(estimateContextTokens(prompt)).toBeLessThanOrEqual(Math.floor(4_096 * 0.08))
    await expect(index.prepare({
      sessionId: 'impossible-window', query: '黄金', contextWindow: 64,
      sources: [source('tiny', '黄金证据')]
    })).rejects.toThrow(/窗口|预算|context/i)
  })

  it('allocates a bounded catalog and reports only evidence provenance that remains in the packet', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'many-titles', query: 'needle evidence',
      sources: Array.from({ length: 100 }, (_, number) => source(`s${number}`, `NEEDLE_EVIDENCE_${number} needle evidence`, {
        title: `资料 ${number} ${'长标题'.repeat(100)}`
      }))
    })
    const evidence = packet.initialContext.split('\n\n证据：\n')[1]
    const evidenceIds = [...evidence.matchAll(/^\[([^｜\]]+)/gmu)].map((match) => match[1])

    expect(packet.initialContext).toContain('另有')
    expect(evidence).toMatch(/NEEDLE_EVIDENCE_\d+/)
    expect(packet.initialSourceIds).toEqual(evidenceIds)
  })

  it('reserves an explicit catalog continuation even when accepted rows nearly consume its allocation', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'catalog-continuation', query: '主题', contextWindow: 12_000,
      sources: Array.from({ length: 3 }, (_, number) => source(
        `源${'甲'.repeat(60)}${number}`, '主题相关证据', { title: `题${'乙'.repeat(70)}` }
      ))
    })

    expect(packet.initialContext).toMatch(/另有 \d+ 项资料未列出；可调用 research_context_list 继续。/)
  })

  it('keeps match-free sources in the catalog without using their body as initial evidence filler', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'relevance', query: '黄金失效边界',
      sources: [
        source('gold', '黄金失效边界：实际利率上行会压低估值。', { title: '黄金报告' }),
        source('travel', '旅行打包清单：袜子、护照、充电器。', { title: '旅行清单' })
      ]
    })
    const evidence = packet.initialContext.split('\n\n证据：\n')[1]

    expect(packet.initialContext).toContain('旅行清单')
    expect(packet.initialSourceIds).toEqual(['gold'])
    expect(evidence).toContain('实际利率')
    expect(evidence).not.toContain('袜子、护照、充电器')
  })

  it('does not treat a two-character security query as broad, while common summary intent remains diverse', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const specific = await index.prepare({
      sessionId: 'two-character', query: '黄金',
      sources: [
        source('gold', '黄金的失效边界与实际利率。'),
        source('travel', '旅行打包清单：袜子、护照、充电器。')
      ]
    })
    const broad = await index.prepare({
      sessionId: 'broad-intent', query: '总结当前画板资料',
      sources: [source('one', '第一项独立结论。'), source('two', '第二项独立结论。'), source('three', '第三项独立结论。')]
    })

    expect(specific.initialSourceIds).toEqual(['gold'])
    expect(broad.initialSourceIds).toEqual(expect.arrayContaining(['one', 'two', 'three']))
  })

  it('limits initial evidence identifiers as well as context text when many sources match', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const sources = Array.from({ length: 1_000 }, (_, number) => source(
      `id-${number}-${'x'.repeat(240)}`, `命中资料 ${number}`
    ))
    const packet = await index.prepare({ sessionId: 'many', query: '命中资料', sources })

    expect(Buffer.byteLength(JSON.stringify(packet), 'utf8')).toBeLessThanOrEqual(32 * 1024)
    expect(estimateContextTokens(JSON.stringify(packet))).toBeLessThanOrEqual(6_000)
    expect(packet.initialSourceIds.length).toBeLessThanOrEqual(4)
  })

  it('paginates the complete catalog beyond the initial packet without exposing source paths', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'catalog', query: '概览',
      sources: Array.from({ length: 30 }, (_, number) => source(`s-${number}`, `正文 ${number}`, {
        path: `/private/${number}.txt`
      }))
    })

    const first = await index.list('catalog', { snapshotId: packet.snapshotId })
    expect(first.sources.length).toBeGreaterThan(0)
    expect(first.sources.some((entry) => entry.sourceId === 's-29')).toBe(false)
    expect(first.cursor).toBeDefined()
    expect(JSON.stringify(first)).not.toContain('/private/')
    const second = await index.list('catalog', { snapshotId: packet.snapshotId, cursor: first.cursor })
    expect(second.sources[0].sourceId).not.toBe(first.sources[0].sourceId)
  })

  it('reads a Unicode-safe tail through a text cursor and reports remaining content', async () => {
    const body = `${'前'.repeat(2_000)}😀尾部证据\n${'后'.repeat(1_900)}最后一行`
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({ sessionId: 'tail', query: '尾部', sources: [source('tail', body)] })
    const first = await index.read('tail', { snapshotId: packet.snapshotId, sourceId: 'tail', cursor: 1_999 })
    expect(first.text).toContain('😀尾部证据')
    expect(first.text).not.toContain('\uFFFD')
    expect(first.cursor).toBeDefined()
    expect(first.limited).toBe(true)
    const last = await index.read('tail', { snapshotId: packet.snapshotId, sourceId: 'tail', cursor: first.cursor })
    expect(last.text).toContain('最后一行')
  })

  it('finds deep file evidence only after its scan-page and scans no more than eight unopened files per page', async () => {
    const loadFileText = vi.fn(async (entry) => ({
      text: entry.id === 'file-12' ? '深层命中：黄金风险对冲' : 'ordinary file',
      revision: entry.revision
    }))
    const index = new ResearchContextIndex({ loadFileText })
    const packet = await index.prepare({
      sessionId: 'search', query: '无关',
      sources: Array.from({ length: 13 }, (_, number) => source(`file-${number}`, undefined, {
        kind: 'file', path: `/trusted/${number}.txt`, revision: { size: 10, mtimeMs: 1 }
      }))
    })

    const first = await index.search('search', { snapshotId: packet.snapshotId, query: '深层命中' })
    expect(first.sources).toHaveLength(0)
    expect(loadFileText).toHaveBeenCalledTimes(8)
    expect(first.cursor).toBeDefined()
    const second = await index.search('search', { snapshotId: packet.snapshotId, query: '深层命中', cursor: first.cursor })
    expect(second.sources).toMatchObject([{ sourceId: 'file-12' }])
    expect(loadFileText).toHaveBeenCalledTimes(13)
  })

  it('paginates matching search results by a stable ranked source page without repeating the first hits', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'search-pages', query: '稳定排序',
      sources: Array.from({ length: 20 }, (_, number) => source(`match-${number}`, `稳定排序 命中 ${number}`))
    })

    const first = await index.search('search-pages', { snapshotId: packet.snapshotId, query: '稳定排序' })
    const second = await index.search('search-pages', {
      snapshotId: packet.snapshotId, query: '稳定排序', cursor: first.cursor
    })
    const third = await index.search('search-pages', {
      snapshotId: packet.snapshotId, query: '稳定排序', cursor: second.cursor
    })

    expect(first.sources.map((entry) => entry.sourceId)).toEqual(Array.from({ length: 8 }, (_, number) => `match-${number}`))
    expect(second.sources.map((entry) => entry.sourceId)).toEqual(Array.from({ length: 8 }, (_, number) => `match-${number + 8}`))
    expect(third.sources.map((entry) => entry.sourceId)).toEqual(Array.from({ length: 4 }, (_, number) => `match-${number + 16}`))
  })

  it('rotates broad summaries across independent sources rather than filling evidence from one source', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'broad', query: '总结',
      sources: [
        source('one', '第一项独立结论。'.repeat(700)),
        source('two', '第二项独立结论。'.repeat(700)),
        source('three', '第三项独立结论。'.repeat(700))
      ]
    })

    expect(packet.initialSourceIds).toEqual(expect.arrayContaining(['one', 'two', 'three']))
  })

  it('groups exact duplicate text with aliases and preserves source provenance', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'dupe', query: '结论', sources: [
        source('original', '同一份结论', { sourceNodeIds: ['node-a'] }),
        source('alias', '同一份结论', { sourceNodeIds: ['node-b'] })
      ]
    })
    const result = await index.read('dupe', { snapshotId: packet.snapshotId, sourceId: 'original' })

    expect(result.aliases).toEqual(expect.arrayContaining([{ sourceId: 'alias', title: 'alias 标题' }]))
    expect(result.sourceNodeIds).toEqual(['node-a'])
    expect(packet.initialContext).toContain('alias')
  })

  it('lists empty and unsupported sources as unavailable metadata without manufacturing a body', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'empty', query: '资料', sources: [
        source('empty', '   '),
        source('unsupported', undefined, { kind: 'image', status: 'unsupported' })
      ]
    })
    const listing = await index.list('empty', { snapshotId: packet.snapshotId })
    const empty = listing.sources.find((entry) => entry.sourceId === 'empty')
    const unsupported = listing.sources.find((entry) => entry.sourceId === 'unsupported')

    expect(empty).toMatchObject({ status: 'unavailable' })
    expect(unsupported).toMatchObject({ status: 'unsupported' })
    await expect(index.read('empty', { snapshotId: packet.snapshotId, sourceId: 'empty' })).resolves.toMatchObject({ status: 'unavailable', text: '' })
  })

  it('rejects unknown source IDs and expires snapshots without falling back to another snapshot', async () => {
    let clock = 0
    const index = new ResearchContextIndex({ loadFileText: async () => '', now: () => clock })
    const packet = await index.prepare({ sessionId: 'expiry', query: 'x', sources: [source('known', '正文')] })
    await expect(index.read('expiry', { snapshotId: packet.snapshotId, sourceId: 'invented' })).rejects.toThrow(/资料|source/i)
    clock = 2 * 60 * 60 * 1_000 + 1
    await expect(index.list('expiry', { snapshotId: packet.snapshotId })).rejects.toThrow(/过期|expired/i)
  })

  it('keeps a cloned source snapshot after the caller mutates original sources', async () => {
    const original = source('fixed', '原始正文', { sourceNodeIds: ['n1'] })
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({ sessionId: 'immutable', query: '原始', sources: [original] })
    original.text = '篡改正文'
    original.sourceNodeIds.push('n2')
    original.title = '篡改标题'

    await expect(index.read('immutable', { snapshotId: packet.snapshotId, sourceId: 'fixed' })).resolves.toMatchObject({
      title: 'fixed 标题', text: expect.stringContaining('原始正文'), sourceNodeIds: ['n1']
    })
  })

  it('turns failed or revision-changed lazy files into unavailable status instead of reading replacement content', async () => {
    const loadFileText = vi.fn(async (entry) => {
      if (entry.id === 'changed') return { text: 'new replacement text', revision: { size: 99, mtimeMs: 2 } }
      throw new Error('private path must not be echoed')
    })
    const index = new ResearchContextIndex({ loadFileText })
    const packet = await index.prepare({
      sessionId: 'files', query: '资料', sources: [
        source('changed', undefined, { kind: 'file', path: '/private/changed.pdf', revision: { size: 1, mtimeMs: 1 } }),
        source('failed', undefined, { kind: 'file', path: '/private/failed.pdf', revision: { size: 1, mtimeMs: 1 } })
      ]
    })

    await expect(index.read('files', { snapshotId: packet.snapshotId, sourceId: 'changed' })).resolves.toMatchObject({ status: 'unavailable', text: '' })
    await expect(index.read('files', { snapshotId: packet.snapshotId, sourceId: 'failed' })).resolves.toMatchObject({ status: 'unavailable', text: '' })
  })

  it('requires a matching returned revision for every revision-frozen file', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => 'stale extracted text' })
    const packet = await index.prepare({
      sessionId: 'frozen-file', query: '资料',
      sources: [source('frozen', undefined, {
        kind: 'file', path: '/trusted/frozen.pdf', revision: { size: 12, mtimeMs: 7 }
      })]
    })

    await expect(index.read('frozen-file', { snapshotId: packet.snapshotId, sourceId: 'frozen' })).resolves.toMatchObject({
      status: 'unavailable', text: ''
    })
  })

  it('rejects prepare and delayed reads that cross the snapshot TTL while waiting for a file loader', async () => {
    let clock = 0
    const expiredDuringPrepare = new ResearchContextIndex({
      now: () => clock,
      loadFileText: async () => {
        clock = 2 * 60 * 60 * 1_000 + 1
        return { text: 'late', revision: { size: 1, mtimeMs: 1 } }
      }
    })
    await expect(expiredDuringPrepare.prepare({
      sessionId: 'prepare-expiry', query: 'x',
      sources: [source('file', undefined, { kind: 'file', path: '/trusted/a', revision: { size: 1, mtimeMs: 1 } })]
    })).rejects.toThrow(/过期|expired/i)

    clock = 0
    let release
    const waiting = new Promise((resolve) => { release = resolve })
    const expiredDuringRead = new ResearchContextIndex({
      now: () => clock,
      loadFileText: async (entry) => {
        if (entry.id === 'late') await waiting
        return { text: '正文', revision: { size: 1, mtimeMs: 1 } }
      }
    })
    const packet = await expiredDuringRead.prepare({
      sessionId: 'read-expiry', query: 'x',
      sources: Array.from({ length: 5 }, (_, number) => source(number === 4 ? 'late' : `early-${number}`, undefined, {
        kind: 'file', path: `/trusted/${number}`, revision: { size: 1, mtimeMs: 1 }
      }))
    })
    const read = expiredDuringRead.read('read-expiry', { snapshotId: packet.snapshotId, sourceId: 'late' })
    clock = 2 * 60 * 60 * 1_000 + 1
    release()
    await expect(read).rejects.toThrow(/过期|expired/i)
  })

  it('rejects a delayed search when another prepare evicts its snapshot before the loader resolves', async () => {
    let release
    const waiting = new Promise((resolve) => { release = resolve })
    const index = new ResearchContextIndex({
      maxSnapshots: 1,
      loadFileText: async (entry) => {
        if (entry.id === 'late') await waiting
        return { text: 'needle evidence', revision: { size: 1, mtimeMs: 1 } }
      }
    })
    const packet = await index.prepare({
      sessionId: 'evicted-search', query: 'ordinary',
      sources: Array.from({ length: 5 }, (_, number) => source(number === 4 ? 'late' : `early-${number}`, undefined, {
        kind: 'file', title: number === 4 ? 'needle' : `ordinary-${number}`,
        path: `/trusted/${number}`, revision: { size: 1, mtimeMs: 1 }
      }))
    })
    const search = index.search('evicted-search', { snapshotId: packet.snapshotId, query: 'needle' })
    await index.prepare({
      sessionId: 'replacement', query: 'next',
      sources: [source('replacement', 'replacement body')]
    })
    release()
    await expect(search).rejects.toThrow(/不存在|snapshot/i)
  })

  it('accounts stable search-order caches against storage and rejects an evicted snapshot before returning results', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '', maxStoredBytes: 850 })
    const packet = await index.prepare({
      sessionId: 'cache-limit', query: '初始',
      sources: Array.from({ length: 2 }, (_, number) => source(`id-${number}-${'x'.repeat(100)}`, '正文'))
    })

    await expect(index.search('cache-limit', { snapshotId: packet.snapshotId, query: '新的排序问题' })).rejects.toThrow(/不存在|snapshot/i)
    expect(index.snapshots.has(packet.snapshotId)).toBe(false)
  })

  it('atomically limits concurrent tool reads and evicts old snapshots under configured storage limits', async () => {
    let number = 0
    const index = new ResearchContextIndex({
      loadFileText: async () => '', id: () => `snap-${++number}`,
      maxSnapshots: 1, maxStoredBytes: 8 * 1024 * 1024
    })
    const first = await index.prepare({ sessionId: 'limit', query: 'x', sources: [source('large', '证据'.repeat(100_000))] })
    const reads = await Promise.all(Array.from({ length: 12 }, () => index.read('limit', {
      snapshotId: first.snapshotId, sourceId: 'large'
    })))
    const exposedBytes = reads.reduce((total, item) => total + Buffer.byteLength(item.text, 'utf8'), 0)
    expect(exposedBytes).toBeLessThanOrEqual(64 * 1024)
    expect(reads.some((item) => item.status === 'limited')).toBe(true)

    await index.prepare({ sessionId: 'limit', query: 'y', sources: [source('next', 'new')] })
    await expect(index.list('limit', { snapshotId: first.snapshotId })).rejects.toThrow(/不存在|snapshot/i)
  })

  it('bounds list and search payloads when titles, URLs, provenance, and wrappers are large', async () => {
    const longTitle = '标题'.repeat(256)
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'wrapped', query: '命中',
      sources: Array.from({ length: 16 }, (_, number) => source(`wrapped-${number}`, '命中正文。'.repeat(300), {
        title: longTitle,
        sourceUrl: `https://example.com/${'路径'.repeat(800)}`,
        sourceNodeIds: Array.from({ length: 128 }, (__, node) => `node-${node}`)
      }))
    })

    const listing = await index.list('wrapped', { snapshotId: packet.snapshotId })
    const searching = await index.search('wrapped', { snapshotId: packet.snapshotId, query: '命中' })
    for (const result of [listing, searching]) {
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(12 * 1024)
      expect(estimateContextTokens(JSON.stringify(result))).toBeLessThanOrEqual(1_800)
    }
    expect(listing.cursor).toBeDefined()
    const continued = await index.list('wrapped', { snapshotId: packet.snapshotId, cursor: listing.cursor })
    expect(continued.sources[0].sourceId).not.toBe(listing.sources[0].sourceId)
  })

  it('caps untrusted provenance arrays before retaining a snapshot while preserving ordinary source node IDs', async () => {
    const index = new ResearchContextIndex({ loadFileText: async () => '' })
    const packet = await index.prepare({
      sessionId: 'metadata', query: '证据',
      sources: [source('nodes', '证据正文', {
        sourceNodeIds: Array.from({ length: 10_000 }, (_, number) => `node-${number}`)
      })]
    })
    const stored = index.snapshots.get(packet.snapshotId).sources[0]
    const result = await index.read('metadata', { snapshotId: packet.snapshotId, sourceId: 'nodes' })

    expect(stored.sourceNodeIds).toHaveLength(256)
    expect(result.sourceNodeIds).toEqual(Array.from({ length: 16 }, (_, number) => `node-${number}`))
    expect(result.sourceNodeIdsTruncated).toBe(true)
  })
})
