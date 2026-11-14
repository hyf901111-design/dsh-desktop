import { hash } from '../accounts/auth.js'
import { limit, sql } from './repository.js'
import { assetName, bytes, fail, json, jsonBody, requiredString } from './validation.js'

const maxBytes = 25 * 1024 * 1024
const sharePath = /^\/knowledge\/([a-f0-9]{32})$/u
const documentPath = /^\/knowledge\/([a-f0-9-]{36})$/u

function header(request, name) {
  try { return decodeURIComponent(request.headers.get(name) ?? '') }
  catch { fail('INVALID_INPUT') }
}

function card(row) {
  return { id: row.id, name: row.name, size: row.size, updatedAt: row.updated_at,
    source: row.source, category: row.category, owner: row.username }
}

function extension(name) {
  const value = name.trim()
  const dot = value.lastIndexOf('.')
  return dot > 0 ? value.slice(dot).toLowerCase() : ''
}

export async function handleKnowledgeRequest(request, env, user, path) {
  if (path === '/knowledge' && request.method === 'GET') {
    const url = new URL(request.url)
    const after = url.searchParams.get('after') ?? ''
    const stamp = Number(url.searchParams.get('at') ?? Number.MAX_SAFE_INTEGER)
    if (after && !/^[a-f0-9]{32}$/u.test(after) || !Number.isSafeInteger(stamp) || stamp < 0) fail('INVALID_CURSOR')
    const rows = await sql(env, `
      SELECT k.*, u.username FROM knowledge_shares k
      JOIN users u ON u.id=k.owner_id AND u.disabled=0
      WHERE k.revoked_at IS NULL AND k.owner_id<>? AND (k.updated_at<? OR (k.updated_at=? AND k.id>?))
      ORDER BY k.updated_at DESC,k.id LIMIT 101
    `, user.id, stamp, stamp, after).all()
    const result = rows.results.slice(0, 100)
    const last = result.at(-1)
    return json({ documents: result.map(card), next: rows.results.length > 100 ? { at: last.updated_at, after: last.id } : null })
  }
  if (request.method === 'PUT') {
    const match = documentPath.exec(path)
    if (!match) fail('NOT_FOUND', 404)
    const id = hash(`knowledge:${user.id}:${match[1]}`).slice(0, 32)
    const name = assetName(header(request, 'X-Asset-Name'))
    const category = requiredString(header(request, 'X-Knowledge-Category').trim(), 80)
    if (/[\\/\p{Cc}]/u.test(category)) fail('INVALID_INPUT')
    const source = request.headers.get('X-Knowledge-Source')
    if (!['upload', 'generated'].includes(source)) fail('INVALID_INPUT')
    const expected = Number(request.headers.get('X-Asset-Size') ?? -1)
    if (!Number.isSafeInteger(expected) || expected < 0 || expected > maxBytes) fail('SIZE_LIMIT', 413)
    await limit(env, `knowledge-publish:${user.id}`, 40, 60000)
    const data = await bytes(request, maxBytes)
    if (data.byteLength !== expected) fail('INCOMPLETE_UPLOAD')
    const key = `knowledge/${id}/${crypto.randomUUID()}`
    const now = Date.now()
    await sql(env, 'INSERT INTO knowledge_share_uploads(object_key,created_at) VALUES(?,?)', key, now).run()
    await env.RESEARCH_ASSETS.put(key, data)
    await sql(env, `
      INSERT INTO knowledge_shares(id, owner_id, name, category, source, size, object_key, updated_at, revoked_at)
      VALUES(?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,
      source=excluded.source,size=excluded.size,object_key=excluded.object_key,updated_at=excluded.updated_at,revoked_at=NULL
      WHERE knowledge_shares.owner_id=excluded.owner_id
    `, id, user.id, name, category, source, data.byteLength, key, now).run()
    return json({ id, category })
  }
  const match = sharePath.exec(path)
  if (!match) fail('NOT_FOUND', 404)
  if (request.method === 'PATCH') {
    const { name: input } = await jsonBody(request, 4096)
    const name = assetName(input).trim().normalize()
    if (!name || name.length > 255 || name === '.' || name === '..' || /\p{Cc}/u.test(name)) fail('INVALID_ASSET_NAME')
    const row = await sql(env, `
      SELECT name, object_key FROM knowledge_shares WHERE id=? AND owner_id=? AND revoked_at IS NULL
    `, match[1], user.id).first()
    if (!row) fail('NOT_FOUND', 404)
    if (extension(name) !== extension(row.name)) fail('INVALID_ASSET_NAME')
    const updated = await sql(env, `
      UPDATE knowledge_shares
      SET name=?, updated_at=CASE WHEN name<>? THEN MAX(updated_at + 1, ?) ELSE updated_at END
      WHERE id=? AND owner_id=? AND object_key=? AND revoked_at IS NULL
      RETURNING name
    `, name, name, Date.now(), match[1], user.id, row.object_key).first()
    if (!updated) fail('NOT_FOUND', 404)
    return json(updated)
  }
  if (request.method === 'DELETE') {
    const result = await sql(env, 'UPDATE knowledge_shares SET revoked_at=? WHERE id=? AND owner_id=?', Date.now(), match[1], user.id).run()
    if (!result.meta.changes) fail('NOT_FOUND', 404)
    return json({ revoked: true })
  }
  if (request.method === 'GET') {
    const row = await sql(env, `
      SELECT k.* FROM knowledge_shares k JOIN users u ON u.id=k.owner_id AND u.disabled=0
      WHERE k.id=? AND k.revoked_at IS NULL
    `, match[1]).first()
    if (!row) fail('NOT_FOUND', 404)
    const file = await env.RESEARCH_ASSETS.get(row.object_key)
    const stillShared = await sql(env, 'SELECT name, updated_at FROM knowledge_shares WHERE id=? AND object_key=? AND revoked_at IS NULL', row.id, row.object_key).first()
    if (!file || !stillShared) {
      await file?.body.cancel().catch(() => {})
      fail('NOT_FOUND', 404)
    }
    return new Response(file.body, { headers: {
      'content-type': 'application/octet-stream', 'content-length': String(row.size),
      'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(stillShared.name),
      'x-knowledge-updated-at': String(stillShared.updated_at),
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
    } })
  }
  fail('NOT_FOUND', 404)
}

export async function cleanupKnowledgeUploads(env) {
  // Keep more than the maximum upload lifetime before reclaiming unreferenced blobs.
  const abandoned = await sql(env, `
    SELECT u.object_key FROM knowledge_share_uploads u
    WHERE u.created_at<? AND NOT EXISTS (
      SELECT 1 FROM knowledge_shares k WHERE k.object_key=u.object_key AND k.revoked_at IS NULL
    ) LIMIT 100
  `, Date.now() - 86400000).all()
  for (const row of abandoned.results) {
    await env.RESEARCH_ASSETS.delete(row.object_key)
    await sql(env, 'DELETE FROM knowledge_share_uploads WHERE object_key=?', row.object_key).run()
  }
}
