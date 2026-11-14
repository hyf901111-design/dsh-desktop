import { cleanupKnowledgeUploads, handleKnowledgeRequest } from './knowledge.js'
import { authenticate, hash } from '../accounts/auth.js'
import { LIMITS } from '../../packages/dsh-research-collaboration/protocol.js'
import {
  sql,
  identity,
  lookup,
  limit,
  state,
  authorize,
  ticket,
  redeem,
  room,
  callRoom,
  notificationsPage,
  flushOutbox
} from './repository.js'
import {
  json,
  jsonBody,
  fail,
  operationId,
  requiredString,
  errorResponse
} from './validation.js'
export async function handleRequest(request, env, ctx) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/v1\/collaboration/, '')
    if (!url.pathname.startsWith('/v1/collaboration/')) fail('NOT_FOUND', 404)
    if (path === '/connect') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
        fail('UPGRADE_REQUIRED', 426)
      const t = await redeem(env, url.searchParams.get('ticket'))
      const target =
        t.scope === 'board'
          ? room(env, t.board_id)
          : env.RESEARCH_NOTIFICATIONS.get(
              env.RESEARCH_NOTIFICATIONS.idFromName(t.user.id)
            )
      return target.fetch('https://internal/connect', {
        headers: {
          Upgrade: 'websocket',
          'x-collaboration-context': JSON.stringify({
            user: t.user,
            boardId: t.board_id,
            epoch: t.epoch
          })
        }
      })
    }
    const user = await authenticate(request, env)
    if (!user) fail('LOGIN_REQUIRED', 401)
    if (path === '/knowledge' || path.startsWith('/knowledge/')) {
      return await handleKnowledgeRequest(request, env, user, path)
    }
    if (path === '/me' && request.method === 'GET')
      return json({ user: await identity(env, user) })
    if (path === '/users/lookup' && request.method === 'POST') {
      await limit(env, `lookup:${user.id}`, 5, 60000)
      return json({
        user: await lookup(env, (await jsonBody(request, 4096)).publicId)
      })
    }
    if (path === '/tickets' && request.method === 'POST') {
      const input = await jsonBody(request, 4096)
      return json(await ticket(env, user, input.scope, input.boardId))
    }
    if (path === '/boards' && request.method === 'POST') {
      const input = await jsonBody(request)
      operationId(input.operationId)
      const boardId = hash(`${user.id}:${input.operationId}`).slice(0, 32)
      return callRoom(env, boardId, { kind: 'create', user, input })
    }
    if (path === '/boards' && request.method === 'GET') {
      const rows = await sql(
        env,
        "SELECT b.state,m.role,(SELECT COUNT(*) FROM board_members a WHERE a.board_id=b.id AND a.status='active') AS member_count FROM research_boards b JOIN board_members m ON m.board_id=b.id WHERE m.user_id=? AND m.status='active' ORDER BY b.created_at DESC",
        user.id
      ).all()
      return json({
        boards: rows.results.map((r) => ({
          ...JSON.parse(r.state).board,
          role: r.role,
          memberCount: r.member_count
        }))
      })
    }
    if (path === '/uploads' && request.method === 'POST') {
      const input = await jsonBody(request, 4096)
      operationId(input.operationId)
      const id = hash(`upload:${user.id}:${input.operationId}`).slice(0, 32)
      await sql(
        env,
        'INSERT OR IGNORE INTO research_uploads(id,user_id,operation_id,expires_at) VALUES(?,?,?,?)',
        id,
        user.id,
        input.operationId,
        Date.now() + 86400000
      ).run()
      const upload = await sql(
        env,
        'SELECT * FROM research_uploads WHERE id=?',
        id
      ).first()
      if (upload.expires_at <= Date.now() && !upload.board_id)
        fail('UPLOAD_EXPIRED', 409)
      return json({
        uploadId: id,
        expiresAt: upload.expires_at,
        boardId: upload.board_id
      })
    }
    const staged = path.match(/^\/uploads\/([-\w]+)\/assets\/([-\w:.]+)$/)
    if (staged && request.method === 'PUT')
      return room(env, `upload:${staged[1]}`).fetch(
        'https://room.internal/stageAsset',
        {
          method: 'POST',
          headers: {
            'x-collaboration-context': JSON.stringify({
              user,
              uploadId: staged[1],
              assetId: staged[2],
              name: decodeName(request.headers.get('X-Asset-Name')),
              contentType:
                request.headers.get('content-type') ??
                'application/octet-stream',
              expectedBytes: Number(
                request.headers.get('X-Asset-Size') ??
                  request.headers.get('content-length') ??
                  -1
              )
            })
          },
          body: request.body,
          duplex: 'half'
        }
      )
    if (path === '/notifications' && request.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0),
        pageSize = Number(url.searchParams.get('limit') ?? 50)
      if (
        !Number.isSafeInteger(after) ||
        after < 0 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      )
        fail('INVALID_CURSOR')
      ctx.waitUntil(flushOutbox(env).catch(() => {}))
      return json(await notificationsPage(env, user.id, after, pageSize))
    }
    if (path === '/notifications/read' && request.method === 'POST') {
      const input = await jsonBody(request, 32768)
      if (input.notificationIds !== undefined) {
        if (
          !Array.isArray(input.notificationIds) ||
          input.notificationIds.length > 100
        )
          fail('INVALID_INPUT')
        for (const id of input.notificationIds) requiredString(id)
        if (input.notificationIds.length)
          await env.ACCOUNTS_DB.batch(
            input.notificationIds.map((id) =>
              sql(
                env,
                'UPDATE research_notifications SET read_at=COALESCE(read_at,?) WHERE recipient_id=? AND id=?',
                Date.now(),
                user.id,
                id
              )
            )
          )
      } else
        await sql(
          env,
          'UPDATE research_notifications SET read_at=COALESCE(read_at,?) WHERE recipient_id=?',
          Date.now(),
          user.id
        ).run()
      return json({ ok: true })
    }
    const respond = path.match(/^\/invitations\/([-\w]+)\/respond$/)
    if (respond && request.method === 'POST') {
      const row = await sql(
        env,
        'SELECT board_id,invitee_id FROM board_invitations WHERE id=?',
        respond[1]
      ).first()
      if (!row) fail('INVITATION_NOT_FOUND', 404)
      if (row.invitee_id !== user.id) fail('WRONG_RECIPIENT', 403)
      return callRoom(env, row.board_id, {
        kind: 'respond',
        user,
        invitationId: respond[1],
        input: await jsonBody(request, 4096)
      })
    }
    const route = path.match(/^\/boards\/([-\w]+)(?:\/(.*))?$/)
    if (route) {
      const boardId = route[1],
        tail = route[2]
      if (!tail && request.method === 'GET')
        return callRoom(env, boardId, { kind: 'snapshot', user })
      if (tail === 'commands' && request.method === 'POST')
        return callRoom(env, boardId, {
          user,
          command: await jsonBody(request, LIMITS.updateBytes * 1.4 + 65536)
        })
      if (tail?.startsWith('receipts/') && request.method === 'GET') {
        const op = operationId(tail.slice(9))
        const row = await sql(
          env,
          'SELECT seq,epoch FROM research_receipts WHERE board_id=? AND user_id=? AND operation_id=?',
          boardId,
          user.id,
          op
        ).first()
        return json({ operationId: op, accepted: !!row, ...(row ?? {}) })
      }
      if (tail === 'assets' && request.method === 'POST') {
        const op = operationId(request.headers.get('X-Operation-Id')),
          epoch = Number(request.headers.get('X-Sharing-Epoch'))
        return room(env, boardId).fetch('https://room.internal/liveAsset', {
          method: 'POST',
          headers: {
            'x-collaboration-context': JSON.stringify({
              user,
              boardId,
              operationId: op,
              epoch,
              name: decodeName(request.headers.get('X-Asset-Name')),
              contentType:
                request.headers.get('content-type') ??
                'application/octet-stream',
              expectedBytes: Number(
                request.headers.get('X-Asset-Size') ??
                  request.headers.get('content-length') ??
                  -1
              )
            })
          },
          body: request.body,
          duplex: 'half'
        })
      }
      if (tail?.startsWith('assets/') && request.method === 'GET')
        return callRoom(env, boardId, {
          kind: 'assetRead',
          user,
          assetId: tail.slice(7)
        })
    }
    fail('NOT_FOUND', 404)
  } catch (e) {
    return errorResponse(e)
  }
}
function decodeName(value) {
  try {
    return requiredString(decodeURIComponent(value ?? ''), 256)
  } catch {
    fail('INVALID_ASSET_NAME')
  }
}
export async function cleanup(env) {
  await cleanupKnowledgeUploads(env).catch(() => {})
  await flushOutbox(env)
  const abandoned = (
    await sql(
      env,
      'SELECT id FROM research_uploads WHERE board_id IS NULL AND expires_at<? LIMIT 100',
      Date.now()
    ).all()
  ).results
  for (const upload of abandoned) {
    // Persist a cleanup claim before any external R2 delete. A competing
    // activation uses the same unique key and cannot pass its D1 batch.
    await sql(
      env,
      "INSERT OR IGNORE INTO research_upload_claims(upload_id,kind,board_id) SELECT id,'cleanup',NULL FROM research_uploads WHERE id=? AND board_id IS NULL AND expires_at<?",
      upload.id,
      Date.now()
    ).run()
    const claim = await sql(
      env,
      'SELECT kind FROM research_upload_claims WHERE upload_id=?',
      upload.id
    ).first()
    if (claim?.kind !== 'cleanup') continue
    const assets = (
      await sql(
        env,
        'SELECT object_key FROM research_assets WHERE upload_id=? AND board_id IS NULL',
        upload.id
      ).all()
    ).results
    for (const asset of assets)
      await env.RESEARCH_ASSETS.delete(asset.object_key)
    await env.ACCOUNTS_DB.batch([
      sql(
        env,
        'DELETE FROM research_assets WHERE upload_id=? AND board_id IS NULL',
        upload.id
      ),
      sql(
        env,
        "DELETE FROM research_upload_claims WHERE upload_id=? AND kind='cleanup'",
        upload.id
      ),
      sql(
        env,
        'DELETE FROM research_uploads WHERE id=? AND board_id IS NULL',
        upload.id
      )
    ])
  }
  await sql(
    env,
    'DELETE FROM research_tickets WHERE expires_at<?',
    Date.now()
  ).run()
  await sql(
    env,
    "UPDATE board_invitations SET status='expired',updated_at=? WHERE status='pending' AND expires_at<?",
    Date.now(),
    Date.now()
  ).run()
  const expiredNotifications =
    "SELECT n.id FROM research_notifications n LEFT JOIN board_invitations i ON i.id=n.invitation_id WHERE n.created_at<? AND (i.id IS NULL OR i.status<>'pending')"
  const cutoff = Date.now() - 90 * 86400000
  await env.ACCOUNTS_DB.batch([
    sql(
      env,
      `DELETE FROM research_notification_outbox WHERE notification_id IN (${expiredNotifications})`,
      cutoff
    ),
    sql(
      env,
      `DELETE FROM research_notifications WHERE id IN (${expiredNotifications})`,
      cutoff
    )
  ])
}
