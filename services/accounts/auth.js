import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHash
} from 'node:crypto'
import { MIN_NEW_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './password-policy.js'
const now = () => Math.floor(Date.now() / 1000)
export const hash = (value) => createHash('sha256').update(value).digest('hex')
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
export const authError = (code, status = 401) =>
  json({ error: { code } }, status)
// OWASP scrypt profile: 32 MiB, N=2^15, r=8, p=3. Cloudflare caps PBKDF2 at 100k.
const passwordHash = (password, salt = randomBytes(16).toString('hex')) =>
  `scrypt-v1:${salt}:${scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`
function verify(password, stored) {
  const validFormat = /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored)
  const candidate = passwordHash(password, validFormat ? stored.split(':')[1] : '0'.repeat(32))
  return validFormat && candidate.length === stored.length &&
    timingSafeEqual(Buffer.from(candidate), Buffer.from(stored))
}
export async function authenticate(request, env) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!token || !env.ACCOUNTS_DB) return null
  return env.ACCOUNTS_DB.prepare(
    'SELECT u.id,u.username,u.created_at,s.hash AS session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>? AND u.disabled=0'
  )
    .bind(hash(token), now())
    .first()
}
async function limited(db, key) {
  const expires = now() + 900
  const row = await db
    .prepare(
      'INSERT INTO auth_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count'
    )
    .bind(key, expires, now(), now(), expires)
    .first()
  return row.count > 15
}
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw Error('INVALID_REQUEST')
  const reader = request.body?.getReader()
  if (!reader) throw Error('INVALID_REQUEST')
  const chunks = []
  let size = 0
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('INVALID_REQUEST')), 5000)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      size += value.length
      if (size > 4096) throw Error('INVALID_REQUEST')
      chunks.push(Buffer.from(value))
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('INVALID_REQUEST')
    return value
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  createdAt: user.created_at
})
async function session(db, user) {
  const token = randomBytes(32).toString('hex'),
    expiresAt = now() + 30 * 86400
  const inserted = await db
    .prepare(
      'INSERT INTO sessions(hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=? AND disabled=0'
    )
    .bind(hash(token), expiresAt, user.id, user.password_hash)
    .run()
  if (inserted.meta.changes !== 1) return authError('INVALID_CREDENTIALS')
  return json({ user: publicUser(user), token, expiresAt })
}
export async function handleAccountRequest(request, env) {
  const path = new URL(request.url).pathname,
    db = env.ACCOUNTS_DB
  if (!db) return authError('ACCOUNT_SERVICE_UNAVAILABLE', 503)
  try {
    if (path === '/v1/account/login' || path === '/v1/account/register') {
      const registering = path === '/v1/account/register'
      if (request.method !== 'POST') return authError('METHOD_NOT_ALLOWED', 405)
      const ip = request.headers.get('cf-connecting-ip')
      if (!ip) return authError('ACCOUNT_SERVICE_UNAVAILABLE', 503)
      if (await limited(db, `ip:${hash(ip)}`))
        return authError('TOO_MANY_ATTEMPTS', 429)
      const input = await body(request)
      if (
        typeof input.username !== 'string' ||
        !/^[\p{L}\p{N}_-]{3,32}$/u.test(input.username) ||
        typeof input.password !== 'string' ||
        input.password.length < (registering ? MIN_NEW_PASSWORD_LENGTH : 1) ||
        input.password.length > MAX_PASSWORD_LENGTH
      )
        return authError('INVALID_CREDENTIAL_FORMAT', 400)
      if (await limited(db, `user:${hash(input.username.toLowerCase())}`))
        return authError('TOO_MANY_ATTEMPTS', 429)
      if (registering) {
        if (
          typeof input.invite !== 'string' ||
          !/^[-a-zA-Z0-9]{16,128}$/.test(input.invite)
        )
          return authError('INVALID_INVITE', 400)
        const user = {
          id: crypto.randomUUID(),
          username: input.username,
          created_at: now(),
          password_hash: passwordHash(input.password)
        }
        try {
          await db
            .prepare(
              'INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)'
            )
            .bind(
              user.id,
              user.username,
              user.password_hash,
              hash(input.invite),
              user.created_at
            )
            .run()
        } catch (e) {
          return authError(
            String(e).includes('INVALID_INVITE')
              ? 'INVALID_INVITE'
              : 'REGISTRATION_REJECTED',
            400
          )
        }
        return await session(db, user)
      }
      const user = await db
        .prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE')
        .bind(input.username)
        .first()
      const valid = verify(
        input.password,
        user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(64)}`
      )
      if (!user || user.disabled || !valid)
        return authError('INVALID_CREDENTIALS')
      return await session(db, user)
    }
    const user = await authenticate(request, env)
    if (!user) return authError('LOGIN_REQUIRED')
    if (path === '/v1/account/me' && request.method === 'GET')
      return json({ user: publicUser(user) })
    if (path === '/v1/account/logout' && request.method === 'POST') {
      await db
        .prepare('DELETE FROM sessions WHERE hash=?')
        .bind(user.session_hash)
        .run()
      return json({ ok: true })
    }
    if (path === '/v1/account/password' && request.method === 'POST') {
      if (await limited(db, `password:${user.id}`))
        return authError('TOO_MANY_ATTEMPTS', 429)
      const input = await body(request)
      if (
        typeof input.currentPassword !== 'string' ||
        input.currentPassword.length < 1 ||
        input.currentPassword.length > MAX_PASSWORD_LENGTH ||
        typeof input.password !== 'string' ||
        input.password.length < MIN_NEW_PASSWORD_LENGTH ||
        input.password.length > MAX_PASSWORD_LENGTH
      )
        return authError('INVALID_CREDENTIAL_FORMAT', 400)
      const current = await db
        .prepare('SELECT password_hash FROM users WHERE id=?')
        .bind(user.id)
        .first()
      if (!verify(input.currentPassword, current.password_hash))
        return authError('INVALID_CREDENTIALS')
      await db.batch([
        db
          .prepare(
            'UPDATE users SET password_hash=? WHERE id=? AND password_hash=?'
          )
          .bind(passwordHash(input.password), user.id, current.password_hash),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
      ])
      return json({ ok: true })
    }
    if (path === '/v1/account/usage' && request.method === 'GET') {
      const result = await db
        .prepare(
          'SELECT capability,COUNT(*) AS requests,SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS succeeded FROM usage_events WHERE user_id=? AND started_at>=? GROUP BY capability'
        )
        .bind(user.id, now() - 30 * 86400)
        .all()
      return json({ periodDays: 30, usage: result.results })
    }
    return authError('NOT_FOUND', 404)
  } catch (error) {
    return error?.message === 'INVALID_REQUEST'
      ? authError('INVALID_REQUEST', 400)
      : authError('ACCOUNT_SERVICE_UNAVAILABLE', 503)
  }
}
