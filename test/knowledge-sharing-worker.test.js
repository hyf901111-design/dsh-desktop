import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { KnowledgeContent } from '../src/main/knowledge/content'
import { KnowledgeSharing } from '../src/main/knowledge/sharing'
import { knowledgeCapabilityHandlers, sharedKnowledgeCapabilityHandlers } from '../src/main/knowledge/capabilities'
import { KnowledgeStore } from '../src/main/knowledge/store'
import { ClientCapabilityService } from '../src/main/state/client-capability-service'
import { resolveKnowledgeReference } from '../src/main/knowledge/references'
import { CollaborationClient, collaborationRequestSpec } from '../src/main/collaboration-client'

let worker
const tokens = ['a'.repeat(64), 'b'.repeat(64)]
let db

beforeAll(async () => {
  const result = await build({
    entryPoints: ['services/collaboration/worker.js'], bundle: true, write: false, platform: 'neutral',
    format: 'esm', external: ['cloudflare:*', 'node:*']
  })
  worker = new Miniflare(convertV4MiniflareOptions({ workers: [{
    modules: true, script: result.outputFiles[0].text,
    compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACCOUNTS_DB: 'knowledge-test' }, r2Buckets: ['RESEARCH_ASSETS']
  }] }))
  db = await worker.getD1Database('ACCOUNTS_DB')
  for (const migration of ['0001_accounts.sql', '0002_research_boards.sql', '0006_knowledge_shares.sql']) {
    const sql = readFileSync(new URL('../services/accounts/migrations/' + migration, import.meta.url), 'utf8')
    await db.exec(sql.replaceAll('\n', ' '))
  }
  const expires = Math.floor(Date.now() / 1000) + 3600
  await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)').bind('seed', expires).run()
  for (const [index, token] of tokens.entries()) {
    await db.prepare('INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)')
      .bind('a' + index, 'user' + index, 'unused', 'seed', Date.now()).run()
    await db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(hash(token), 'a' + index, expires).run()
  }
}, 20_000)

afterAll(async () => { await worker?.dispose() })

const request = (path = '', account, options = {}) => worker.dispatchFetch('https://knowledge.test/v1/collaboration/knowledge' + path, {
  ...options, headers: { ...options.headers, ...account !== undefined && { authorization: 'Bearer ' + tokens[account] } }
})

it('renames an active share from the knowledge tool without changing its bytes or reviving it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ework-knowledge-rename-'))
  const makeClient = account => new CollaborationClient({
    authenticated: true, generation: 1, subscribeSessionChanged: () => () => {},
    async collaborationRequest(endpoint, signal) {
      const spec = collaborationRequestSpec(endpoint)
      const response = await request(spec.path.slice('/v1/collaboration/knowledge'.length), account,
        { method: spec.method, headers: spec.headers, body: spec.body, signal })
      if (!response.ok) throw Object.assign(Error('共享文件请求失败'), { status: response.status })
      return spec.raw ? response : response.json()
    }
  })
  const owner = makeClient(0), reader = makeClient(1)
  const sharing = new KnowledgeSharing({ client: owner, authenticated: () => true })
  const received = new KnowledgeSharing({ client: reader, authenticated: () => true })
  const content = new KnowledgeContent(() => ({}))
  const identity = () => ({ owner: 'a0', generation: 1 })
  const store = new KnowledgeStore(join(root, 'library'), identity, () => {})
  const edit = knowledgeCapabilityHandlers(store, sharing, content, {}, () => true).editKnowledgeDocument
  const filePath = join(root, '原文件名.md')
  const originalText = '# 共享正文保持原样'
  let sharedId
  const rename = (id, name) => request('/' + id, 0, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
  })
  try {
    await writeFile(filePath, originalText)
    const row = await store.importFile(filePath)
    await store.setSharing(row.id, (document, path, current) => sharing.publish(document, path, '技术文档', current))
    const [before] = await received.received(true)
    sharedId = before.id
    const storedObject = async () => db.prepare('SELECT object_key FROM knowledge_shares WHERE id=?').bind(sharedId).first('object_key')
    const objectKey = await storedObject()
    const denied = await request('/' + sharedId, 1, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '冒名.md' })
    })
    const renamed = '修订后的文件名.md'
    expect(await edit({ id: row.id, operation: 'rename', name: renamed }, {}, undefined)).toMatchObject({ status: 'succeeded' })
    expect((await store.snapshot()).documents[0]).toMatchObject({ name: renamed, share: { id: sharedId, category: '技术文档' } })
    const read = await received.read(sharedId)
    expect(read.document.name).toBe(renamed)
    expect(read.data.toString('utf8')).toBe(originalText)
    const [after] = await received.received(true)
    expect(after).toMatchObject({ id: sharedId, name: renamed, size: before.size, received: before.received })
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
    expect((await rename(sharedId, renamed)).status).toBe(200)
    expect((await received.received(true))[0].updatedAt).toBe(after.updatedAt)
    expect(denied.status).toBe(404)
    expect((await rename(sharedId, '扩展名不同.pdf')).status).toBe(400)
    expect(await storedObject()).toBe(objectKey)
    expect(await readFile((await store.file(row.id)).path, 'utf8')).toBe(originalText)
    const search = sharedKnowledgeCapabilityHandlers(received, content, () => true).searchSharedKnowledge
    expect((await search({ query: renamed }, {}, undefined)).data.documents.map(doc => doc.id)).toEqual([sharedId])
    expect((await search({ query: before.name }, {}, undefined)).data.documents).toEqual([])
    expect(await resolveKnowledgeReference({ kind: 'file', id: sharedId, label: before.name }, {
      sharing: received, content, store: { snapshot: async () => ({ folders: [], documents: [] }) },
      owner: () => ({ owner: 'a1', generation: 1 })
    })).toMatchObject({ label: renamed, documents: [{ id: sharedId, name: renamed, text: originalText }] })
    expect((await request('/' + sharedId, 0, { method: 'DELETE' })).status).toBe(200)
    expect((await rename(sharedId, '不应恢复.md')).status).toBe(404)
    await expect(edit({ id: row.id, operation: 'rename', name: '不应恢复.md' }, {}, undefined)).rejects.toThrow()
    expect((await store.snapshot()).documents[0].name).toBe(renamed)
    expect(await received.received(true)).toEqual([])
  } finally {
    if (sharedId) await request('/' + sharedId, 0, { method: 'DELETE' })
    owner.stop()
    reader.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('publishes privately stored bytes to other authenticated users and closes access immediately upon revocation', async () => {
  const localId = '/128cd56e-4003-4fd5-aab6-36c0f1977e0d'
  const body = '# Shared report\nContent'
  const data = {
    method: 'PUT', body, headers: {
      'Content-Type': 'application/octet-stream',
      'X-Asset-Name': encodeURIComponent('报告.md'),
      'X-Asset-Size': String(Buffer.byteLength(body)),
      'X-Knowledge-Category': encodeURIComponent('行业研究'),
      'X-Knowledge-Source': 'generated'
    }
  }
  expect((await request('', undefined)).status).toBe(401)
  const response = await request(localId, 0, data)
  expect(response.status).toBe(200)
  const shared = await response.json()
  expect((await (await request(localId, 0, data)).json()).id).toBe(shared.id)
  expect((await (await request('', 0)).json()).documents).toEqual([])
  const received = await (await request('', 1)).json()
  expect(received.documents).toMatchObject([{ id: shared.id, name: '报告.md', owner: 'user0', category: '行业研究', source: 'generated' }])
  expect((await request('/' + shared.id, undefined)).status).toBe(401)
  expect(await (await request('/' + shared.id, 1)).text()).toBe(body)
  expect((await request('/' + shared.id, 1, { method: 'DELETE' })).status).toBe(404)
  const recipient = new CollaborationClient({
    authenticated: true, generation: 1, subscribeSessionChanged: () => () => {},
    async collaborationRequest(endpoint, signal) {
      const spec = collaborationRequestSpec(endpoint)
      const response = await request(spec.path.slice('/v1/collaboration/knowledge'.length), 1,
        { method: spec.method, body: spec.body, headers: spec.headers, signal })
      if (!response.ok) throw Object.assign(Error('共享文件请求失败'), { status: response.status })
      return spec.raw ? response : response.json()
    }
  })
  const sharing = new KnowledgeSharing({ authenticated: () => true, client: recipient })
  const content = new KnowledgeContent(() => ({}))
  const reference = (kind, id) => resolveKnowledgeReference({ kind, id }, {
    sharing, content, store: { snapshot: async () => ({ folders: [], documents: [] }) },
    owner: () => ({ owner: 'user1', generation: 1 })
  })
  const host = new ClientCapabilityService({
    sharedKnowledge: current => sharedKnowledgeCapabilityHandlers(sharing, content, current),
    owner: () => 'user1', canRead: () => true, scheduled: () => false,
    send: () => {}, canvasAvailable: () => false, canvas: async () => {}, window: async () => {}
  })
  const sessionId = 'normal-conversation', turnId = 'turn-one'
  const call = (requestId, capability, args) => host.request({ sessionId, turnId, method: 'execute',
    call: { requestId, capability, arguments: args } })
  host.bind({ sessionId, mode: 'conversation', active: true })
  try {
    const catalog = await host.request({ sessionId, turnId, method: 'catalog' })
    expect(catalog.capabilities.filter(row => row.id.startsWith('knowledge.') && row.available).map(row => row.id))
      .toEqual(['knowledge.shared.search', 'knowledge.shared.read'])
    const matches = await call('search', 'knowledge.shared.search', { query: '报告', category: '行业研究', formats: ['markdown'] })
    expect(matches, matches.message).toMatchObject({ status: 'succeeded', data: { count: 1, documents: [{ id: shared.id, name: '报告.md' }], nextOffset: null } })
    const bodyHits = await call('search-body', 'knowledge.shared.search',
      { query: 'ＣＯＮＴＥＮＴ', scope: 'content', category: '行业研究' })
    expect(bodyHits, bodyHits.message).toMatchObject({ status: 'succeeded', data: {
      scope: 'content', count: 1, documents: [{ id: shared.id, received: { owner: 'user0' }, excerpt: body }],
      examined: 1, unreadable: 0, nextOffset: null
    } })
    expect((await call('search-category-name', 'knowledge.shared.search', { query: '行业研究' })).data.count).toBe(1)
    expect((await call('search-no-body', 'knowledge.shared.search', { query: 'Content' })).data.count).toBe(0)
    expect((await call('search-empty-scope', 'knowledge.shared.search', { query: ' ', scope: 'content' })).status).toBe('failed')
    expect(await call('inspect', 'knowledge.shared.read', { id: shared.id })).toMatchObject({
      status: 'succeeded', data: { text: body, document: { received: { owner: 'user0' } } }
    })
    expect(await reference('file', shared.id)).toMatchObject({
      kind: 'file', label: '报告.md', documents: [{ id: shared.id, text: body, sharer: 'user0' }]
    })
    expect(await reference('shared-category', '行业研究')).toMatchObject({
      count: 1, documents: [{ id: shared.id, text: body, sharer: 'user0' }], unavailableCount: 0
    })
    expect((await request('/' + shared.id, 0, { method: 'DELETE' })).status).toBe(200)
    expect(await call('inspect-new', 'knowledge.shared.read', { id: shared.id })).toMatchObject({ status: 'failed' })
    expect((await call('search-revoked-body', 'knowledge.shared.search', { query: 'Content', scope: 'content' })).data)
      .toMatchObject({ count: 0, documents: [], nextOffset: null })
    expect((await call('search-new', 'knowledge.shared.search', { query: '报告' })).data).toEqual({ count: 0, documents: [], nextOffset: null })
    await expect(reference('file', shared.id)).rejects.toThrow('已取消共享')
    await expect(reference('shared-category', '行业研究')).rejects.toThrow('暂无可引用')
  } finally { host.dispose() }
  expect((await request('/' + shared.id, 1)).status).toBe(404)
  expect((await (await request('', 1)).json()).documents).toEqual([])
  expect((await request(localId, 0, { ...data, headers: { ...data.headers, 'X-Asset-Size': '0' } })).status).toBe(400)
})

it('reuses the catalog during a long shared category reference and rechecks each file at read time', async () => {
  const publish = async (localId, name, body) => {
    const response = await request('/' + localId, 0, {
      method: 'PUT', body,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Asset-Name': encodeURIComponent(name),
        'X-Asset-Size': String(Buffer.byteLength(body)),
        'X-Knowledge-Category': encodeURIComponent('写作模板'),
        'X-Knowledge-Source': 'upload'
      }
    })
    expect(response.status).toBe(200)
    return (await response.json()).id
  }
  const revoked = await publish('79d391d1-deb1-4553-aaf0-3cbf4ee15199', 'B.md', 'revoked')
  const readable = await publish('79d391d1-deb1-4553-aaf0-3cbf4ee15200', 'A.md', 'readable')
  const now = Date.now()
  await db.prepare('UPDATE knowledge_shares SET updated_at=? WHERE id=?').bind(now - 10_000, revoked).run()
  let elapsed = 0
  let catalogRequests = 0
  const readRequests = []
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now + elapsed)
  const client = new CollaborationClient({
    authenticated: true, generation: 1, subscribeSessionChanged: () => () => {},
    async collaborationRequest(endpoint) {
      if (endpoint.kind === 'knowledge.list') catalogRequests++
      if (endpoint.kind === 'knowledge.file') {
        readRequests.push(endpoint.id)
        if (endpoint.id === readable) {
          expect((await request('/' + revoked, 0, { method: 'DELETE' })).status).toBe(200)
          elapsed = 12_000
        }
      }
      const spec = collaborationRequestSpec(endpoint)
      const response = await request(spec.path.slice('/v1/collaboration/knowledge'.length), 1)
      if (!response.ok) throw Object.assign(Error('共享文件请求失败'), { status: response.status })
      return spec.raw ? response : response.json()
    }
  })
  try {
    const result = await resolveKnowledgeReference({ kind: 'shared-category', id: '写作模板' }, {
      sharing: new KnowledgeSharing({ authenticated: () => true, client }),
      content: new KnowledgeContent(() => ({})),
      store: { snapshot: async () => ({ folders: [], documents: [] }) },
      owner: () => ({ owner: 'user1', generation: 1 })
    })
    expect(result).toMatchObject({
      count: 2, documents: [{ id: readable, text: 'readable' }], unavailableCount: 1
    })
    expect(catalogRequests).toBe(1)
    expect(readRequests).toEqual([readable, revoked])
  } finally {
    clock.mockRestore()
    client.stop()
    await request('/' + readable, 0, { method: 'DELETE' })
    await request('/' + revoked, 0, { method: 'DELETE' })
  }
})
