import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'

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
  expect((await request('/' + shared.id, 0, { method: 'DELETE' })).status).toBe(200)
  expect((await request('/' + shared.id, 1)).status).toBe(404)
  expect((await (await request('', 1)).json()).documents).toEqual([])
  expect((await request(localId, 0, { ...data, headers: { ...data.headers, 'X-Asset-Size': '0' } })).status).toBe(400)
})
