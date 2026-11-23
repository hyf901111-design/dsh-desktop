import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { hash } from '../services/accounts/auth.js'
import { collaborationRequestSpec } from '../src/main/collaboration-client'

it('delivers feedback only to hyf90, preserves it across reconnects and deduplicates retries', async () => {
  const bundle = await build({ entryPoints: ['services/collaboration/worker.js'], bundle: true, write: false,
    platform: 'neutral', format: 'esm', external: ['cloudflare:*', 'node:*'] })
  const worker = new Miniflare(convertV4MiniflareOptions({ workers: [{
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACCOUNTS_DB: 'feedback-test' },
    durableObjects: { RESEARCH_NOTIFICATIONS: { className: 'ResearchNotifications', useSQLite: true } }
  }] }))
  let socket
  try {
    const db = await worker.getD1Database('ACCOUNTS_DB')
    for (const name of ['0001_accounts', '0002_research_boards']) {
      const sql = await readFile('services/accounts/migrations/' + name + '.sql', 'utf8')
      await db.exec(sql.replaceAll('\n', ' '))
    }
    const expires = Math.floor(Date.now() / 1000) + 3600
    await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)').bind('fixture', expires).run()
    const sender = 'a'.repeat(64), recipient = 'b'.repeat(64)
    for (const [id, username, token] of [['sender', '提交人', sender], ['recipient', 'hyf90', recipient]]) {
      await db.prepare('INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)')
        .bind(id, username, 'unused', 'fixture', Date.now()).run()
      await db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(hash(token), id, expires).run()
    }
    const origin = 'https://local.test'
    const call = (token, endpoint) => {
      const spec = collaborationRequestSpec(endpoint)
      return worker.dispatchFetch(origin + spec.path, { ...spec, headers: { ...spec.headers, authorization: 'Bearer ' + token } })
    }
    const ticket = await (await call(recipient, { kind: 'ticket', scope: 'notifications' })).json()
    const connection = await worker.dispatchFetch(origin + ticket.url, { headers: { Upgrade: 'websocket' } })
    expect(connection.status).toBe(101)
    socket = connection.webSocket
    const delivered = new Promise(resolve => socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.type === 'notification') resolve(message.notification)
    }))
    socket.accept()
    const input = { kind: 'notifications.feedback', operationId: 'retry-1', message: '图片没有显示\n第二行' }
    expect((await call('invalid', input)).status).toBe(401)
    const responses = await Promise.all([call(sender, input), call(sender, input)])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const [created, replay] = await Promise.all(responses.map(response => response.json()))
    expect(replay).toEqual(created)
    expect(await delivered).toMatchObject({ ...created, type: 'feedback', message: input.message, actor: { username: '提交人' } })
    socket.close()
    socket = undefined
    const list = async token => (await call(token, { kind: 'notifications.list', after: 0 })).json()
    expect((await list(sender)).notifications).toEqual([])
    expect(await list(recipient)).toMatchObject({ unreadCount: 1, notifications: [{ ...created, message: input.message }] })
    expect((await call(sender, { ...input, message: 'different' })).status).toBe(409)
    await call(recipient, { kind: 'notifications.read', notificationIds: [created.notificationId] })
    expect((await list(recipient)).unreadCount).toBe(0)
  } finally {
    socket?.close()
    await worker.dispose()
  }
}, 20000)
