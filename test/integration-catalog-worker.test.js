import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { generateKeyPairSync, verify } from 'node:crypto'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleIntegrationRequest } from '../services/integrations/worker.js'
import { canonicalManifestJson } from '../src/main/integrations/manifest'
import { IntegrationCatalog } from '../src/main/integrations/catalog'
const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const bundled = JSON.parse(await readFile(new URL('../build/integration-catalog/catalog.json', import.meta.url), 'utf8'))
const get = (env, suffix = '', headers = {}) => handleIntegrationRequest(new Request(`https://catalog.example.test/v1/integrations/catalog${suffix}`, { headers }), env)
async function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(await readFile(new URL('../services/integrations/migrations/0002_catalog.sql', import.meta.url), 'utf8'))
  cleanups.push(() => sqlite.close())
  const wrap = (sql, args = []) => ({ bind: (...values) => wrap(sql, values), first: async () => sqlite.prepare(sql).get(...args) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...args) }) })
  const insert = (entry, status = 'published') => sqlite.prepare('INSERT INTO integration_catalog_entries(id,kind,status,entry_json) VALUES(?,?,?,?)').run(entry.id, entry.kind, status, JSON.stringify(entry))
  return { sqlite, insert, env: { CATALOG_DB: { prepare: sql => wrap(sql) } } }
}

describe('public read-only integration catalog Worker', () => {
  it('serves real bundled entries without OAuth configuration or authentication and preserves client compatibility', async () => {
    const response = await get({}, '?kind=skill', { origin: 'https://other.example.test' })
    expect(response.status).toBe(200)
    const document = await response.json()
    expect(document.schemaVersion).toBe(1)
    expect(document.entries.map(entry => entry.name)).toContain('周报整理')
    expect(document.entries.every(entry => entry.kind === 'skill')).toBe(true)
    const root = await mkdtemp(join(tmpdir(), 'ework-worker-catalog-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
    await writeFile(join(root, 'catalog.json'), JSON.stringify(document))
    const consumer = new IntegrationCatalog({ bundledRoot: root, clientVersion: '1.0.6' })
    expect((await consumer.list('skill', [])).length).toBe(document.entries.length)
    expect((await get({}, '?kind=skill', { 'if-none-match': response.headers.get('etag') })).status).toBe(304)
  })

  it('filters unpublished rows and paginates stable published entries with a query-bound cursor', async () => {
    const f = await database()
    for (const entry of bundled.entries) f.insert(entry)
    const skill = bundled.entries.find(entry => entry.kind === 'skill')
    f.insert({ ...skill, id: 'draft-skill', name: '未发布' }, 'draft')
    f.insert({ ...skill, id: 'withdrawn-skill', name: '已撤回' }, 'withdrawn')
    const response = await get(f.env, '?kind=skill&limit=1'), first = await response.json()
    expect(response.status).toBe(200); expect(first.entries).toHaveLength(1); expect(first.nextCursor).toBeTypeOf('string')
    const next = await (await get(f.env, `?kind=skill&limit=1&cursor=${first.nextCursor}`)).json()
    expect(next.entries).toHaveLength(1); expect(next.nextCursor).toBeNull()
    expect(new Set([...first.entries, ...next.entries].map(entry => entry.id)).size).toBe(2)
    expect((await (await get(f.env, '?kind=skill&query=周报')).json()).entries.map(entry => entry.name)).toEqual(['周报整理'])
    expect((await get(f.env, `?kind=plugin&limit=1&cursor=${first.nextCursor}`)).status).toBe(400)
    const etag = response.headers.get('etag')
    f.sqlite.prepare("UPDATE integration_catalog_entries SET status='withdrawn' WHERE id=?").run(next.entries[0].id)
    expect((await get(f.env, '?kind=skill&limit=1', { 'if-none-match': etag })).status).toBe(200)
    expect((await get(f.env, `?kind=skill&limit=1&cursor=${first.nextCursor}`)).status).toBe(409)
  })

  it('rejects invalid manifests and malformed filters without exposing raw operator data or allowing writes', async () => {
    const f = await database(), broken = structuredClone(bundled.entries.find(entry => entry.kind === 'plugin'))
    broken.manifest.installScript = 'operator-private-data'
    f.insert(broken)
    const rejected = await get(f.env)
    expect(rejected.status).toBe(503); expect(await rejected.text()).not.toContain('operator-private-data')
    for (const query of ['?kind=unknown', '?kind=skill&kind=plugin', '?limit=999', '?cursor=bad']) expect((await get(f.env, query)).status).toBe(400)
    const write = await handleIntegrationRequest(new Request('https://catalog.example.test/v1/integrations/catalog', { method: 'POST', body: '{}' }), f.env)
    expect(write.status).toBe(405)
  })

  it('signs the exact canonical client payload with an optional deployment Ed25519 key', async () => {
    const keys = generateKeyPairSync('ed25519')
    const env = { CATALOG_SIGNING_PRIVATE_KEY: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
    const response = await get(env, '?kind=plugin'), document = await response.json()
    expect(response.status).toBe(200)
    expect(verify(null, Buffer.from(canonicalManifestJson({ schemaVersion: document.schemaVersion, entries: document.entries })), keys.publicKey, Buffer.from(document.signature, 'base64'))).toBe(true)
    expect((await get({ CATALOG_SIGNING_PRIVATE_KEY: 'invalid-key' })).status).toBe(503)
  })
})
