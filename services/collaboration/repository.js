import { hash } from '../accounts/auth.js'
import { fail, publicId } from './validation.js'
export const sql = (env, text, ...values) =>
  env.ACCOUNTS_DB.prepare(text).bind(...values)
// A unique claim is shared by all board DOs and by cleanup. Its NOT NULL/PK
// constraints deliberately abort the surrounding D1 batch when a claim loses.
export function activateUploadStatements(env, uploadId, userId, boardId) {
  return [
    sql(
      env,
      "INSERT INTO research_upload_claims(upload_id,kind,board_id) VALUES ((SELECT id FROM research_uploads WHERE id=? AND user_id=? AND board_id IS NULL AND expires_at>?), 'activation', ?)",
      uploadId,
      userId,
      Date.now(),
      boardId
    ),
    sql(
      env,
      "UPDATE research_uploads SET board_id=? WHERE id=? AND board_id IS NULL AND EXISTS (SELECT 1 FROM research_upload_claims WHERE upload_id=? AND kind='activation' AND board_id=?)",
      boardId,
      uploadId,
      uploadId,
      boardId
    ),
    sql(
      env,
      "UPDATE research_assets SET board_id=? WHERE upload_id=? AND board_id IS NULL AND EXISTS (SELECT 1 FROM research_upload_claims WHERE upload_id=? AND kind='activation' AND board_id=?)",
      boardId,
      uploadId,
      uploadId,
      boardId
    )
  ]
}
export async function liveUser(env, identity) {
  if (!identity?.session_hash) fail('LOGIN_REQUIRED', 401)
  const user = await sql(
    env,
    'SELECT u.id,u.username,s.hash AS session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.user_id=? AND s.expires_at>? AND u.disabled=0',
    identity.session_hash,
    identity.id,
    Math.floor(Date.now() / 1000)
  ).first()
  if (!user) fail('LOGIN_REQUIRED', 401)
  return user
}
export async function identity(env, user) {
  let row = await sql(
    env,
    'SELECT public_id FROM research_public_ids WHERE user_id=?',
    user.id
  ).first()
  for (let attempt = 0; !row && attempt < 8; attempt++) {
    const random = new Uint32Array(2)
    crypto.getRandomValues(random)
    const value = (
      ((BigInt(random[0]) << 32n) | BigInt(random[1])) %
      10000000000n
    )
      .toString()
      .padStart(10, '0')
    await sql(
      env,
      'INSERT OR IGNORE INTO research_public_ids(user_id,public_id) VALUES(?,?)',
      user.id,
      value
    ).run()
    row = await sql(
      env,
      'SELECT public_id FROM research_public_ids WHERE user_id=?',
      user.id
    ).first()
  }
  if (!row) fail('IDENTITY_UNAVAILABLE', 503)
  return { userId: user.id, publicId: row.public_id, username: user.username }
}
export async function lookup(env, value) {
  publicId(value)
  const user = await sql(
    env,
    'SELECT u.id,u.username,p.public_id FROM research_public_ids p JOIN users u ON u.id=p.user_id WHERE p.public_id=? AND u.disabled=0',
    value
  ).first()
  if (!user) fail('USER_NOT_FOUND', 404)
  return { userId: user.id, publicId: user.public_id, username: user.username }
}
export async function limit(env, key, max, ms) {
  const now = Date.now()
  const r = await sql(
    env,
    'INSERT INTO research_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count',
    key,
    now + ms,
    now,
    now,
    now + ms
  ).first()
  if (r.count > max) fail('RATE_LIMITED', 429)
}
export async function state(env, id) {
  const row = await sql(
    env,
    'SELECT state FROM research_boards WHERE id=?',
    id
  ).first()
  if (!row) fail('BOARD_NOT_FOUND', 404)
  return JSON.parse(row.state)
}
export async function membership(env, id, userId) {
  return sql(
    env,
    "SELECT board_id AS boardId,user_id AS userId,role,status,version,joined_at AS joinedAt FROM board_members WHERE board_id=? AND user_id=? AND status='active'",
    id,
    userId
  ).first()
}
export async function authorize(
  env,
  id,
  user,
  { write = false, owner = false, epoch } = {}
) {
  await liveUser(env, user)
  const current = await state(env, id),
    member = await membership(env, id, user.id)
  if (
    !member ||
    (current.board.sharingState === 'ownerOnly' &&
      current.board.ownerId !== user.id)
  )
    fail('ACCESS_REVOKED', 403)
  if ((owner && member.role !== 'owner') || (write && member.role === 'viewer'))
    fail('ROLE_DENIED', 403)
  if (epoch !== undefined && epoch !== current.board.sharingEpoch)
    fail('STALE_EPOCH', 409, { epoch: current.board.sharingEpoch })
  if (write && current.board.lifecycle === 'archived')
    fail('BOARD_ARCHIVED', 409)
  return { current, member }
}
export function invitation(row) {
  return row
    ? {
        invitationId: row.id,
        boardId: row.board_id,
        inviterId: row.inviter_id,
        inviteeId: row.invitee_id,
        role: row.role,
        version: row.version,
        epoch: row.epoch,
        status:
          row.status === 'pending' && row.expires_at <= Date.now()
            ? 'expired'
            : row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at
      }
    : null
}
export async function ticket(env, user, scope, boardId) {
  let epoch = null
  if (scope === 'board') {
    const a = await authorize(env, boardId, user)
    epoch = a.current.board.sharingEpoch
  } else if (scope !== 'notifications') fail('INVALID_SCOPE')
  const value =
      crypto.randomUUID().replaceAll('-', '') +
      crypto.randomUUID().replaceAll('-', ''),
    expiresAt = Date.now() + 30000
  await sql(
    env,
    'INSERT INTO research_tickets(hash,user_id,session_hash,scope,board_id,epoch,expires_at) VALUES(?,?,?,?,?,?,?)',
    hash(value),
    user.id,
    user.session_hash,
    scope,
    boardId ?? null,
    epoch,
    expiresAt
  ).run()
  return {
    ticket: value,
    expiresAt,
    url: `/v1/collaboration/connect?ticket=${value}`,
    ...(epoch === null ? {} : { epoch })
  }
}
export async function redeem(env, value) {
  if (!/^[a-f0-9]{64}$/.test(value ?? '')) fail('INVALID_TICKET', 401)
  const row = await sql(
    env,
    'DELETE FROM research_tickets WHERE hash=? RETURNING *',
    hash(value)
  ).first()
  if (!row || row.expires_at <= Date.now()) fail('INVALID_TICKET', 401)
  const user = await liveUser(env, {
    id: row.user_id,
    session_hash: row.session_hash
  })
  if (row.scope === 'board')
    await authorize(env, row.board_id, user, { epoch: row.epoch })
  return { ...row, user }
}
export function room(env, id) {
  return env.RESEARCH_ROOMS.get(env.RESEARCH_ROOMS.idFromName(id))
}
export async function callRoom(env, id, payload) {
  return room(env, id).fetch('https://room.internal/', {
    method: 'POST',
    body: JSON.stringify({ ...payload, boardId: id })
  })
}
export async function notificationsPage(
  env,
  userId,
  after = 0,
  limitCount = 50
) {
  const rows = await sql(
    env,
    'SELECT * FROM research_notifications WHERE recipient_id=? AND cursor>? AND created_at>? ORDER BY cursor LIMIT ?',
    userId,
    after,
    Date.now() - 90 * 86400000,
    limitCount
  ).all()
  // Pending reminders are additional records, not part of the chronological page.
  // They must neither consume its limit nor advance past unseen intervening events.
  const pendingRows = await sql(
    env,
    "SELECT n.* FROM research_notifications n JOIN board_invitations i ON i.id=n.invitation_id WHERE n.recipient_id=? AND i.status='pending' AND i.expires_at>? AND n.event_version=i.version AND n.type='invitation'",
    userId,
    Date.now()
  ).all()
  const combined = new Map(
    [...rows.results, ...pendingRows.results].map((row) => [row.id, row])
  )
  const notifications = []
  for (const row of combined.values()) {
    const n = {
      ...JSON.parse(row.payload),
      notificationId: row.id,
      eventVersion: row.event_version,
      type: row.type,
      boardId: row.board_id,
      createdAt: row.created_at,
      readAt: row.read_at,
      cursor: row.cursor
    }
    if (row.invitation_id)
      n.invitation = invitation(
        await sql(
          env,
          'SELECT * FROM board_invitations WHERE id=?',
          row.invitation_id
        ).first()
      )
    notifications.push(n)
  }
  const unread = await sql(
    env,
    'SELECT COUNT(*) AS n FROM research_notifications WHERE recipient_id=? AND read_at IS NULL AND created_at>?',
    userId,
    Date.now() - 90 * 86400000
  ).first()
  const pending = await sql(
    env,
    "SELECT COUNT(*) AS n FROM board_invitations WHERE invitee_id=? AND status='pending' AND expires_at>?",
    userId,
    Date.now()
  ).first()
  return {
    notifications,
    cursor: Math.max(after, ...rows.results.map((n) => n.cursor)),
    unreadCount: unread.n,
    pendingCount: pending.n
  }
}
export function notificationStatements(
  env,
  { recipientId, board, type, actor, invitationId = null, version = 1 }
) {
  const id = crypto.randomUUID()
  return [
    sql(
      env,
      'INSERT INTO research_notifications(id,recipient_id,board_id,invitation_id,event_version,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
      id,
      recipientId,
      board.boardId,
      invitationId,
      version,
      type,
      JSON.stringify({ boardTitle: board.title, actor }),
      Date.now()
    ),
    sql(
      env,
      'INSERT INTO research_notification_outbox(id,notification_id,recipient_id) VALUES(?,?,?)',
      id,
      id,
      recipientId
    )
  ]
}
export async function submitProblemFeedback(env, user, operationId, message) {
  const recipient = await sql(env, 'SELECT id FROM users WHERE username=? AND disabled=0', 'hyf90').first()
  if (!recipient) fail('FEEDBACK_UNAVAILABLE', 503)
  const id = hash(JSON.stringify(['feedback', user.id, operationId]))
  const record = () => sql(env, 'SELECT payload FROM research_notifications WHERE id=?', id).first()
  let row = await record()
  if (!row) {
    await limit(env, `feedback:${user.id}`, 6, 60000)
    const payload = JSON.stringify({ boardTitle: '问题反馈', actor: { userId: user.id, username: user.username }, message })
    await env.ACCOUNTS_DB.batch([
      sql(env, `INSERT INTO research_notifications(id,recipient_id,board_id,event_version,type,payload,created_at)
        VALUES(?,?,'',1,'feedback',?,?) ON CONFLICT(id) DO NOTHING`, id, recipient.id, payload, Date.now()),
      sql(env, 'INSERT INTO research_notification_outbox(id,notification_id,recipient_id) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',
        id, id, recipient.id)
    ])
    row = await record()
  }
  if (!row || JSON.parse(row.payload).message !== message) fail('FEEDBACK_CONFLICT', 409)
  return id
}
export async function flushOutbox(env) {
  const rows = await sql(
    env,
    'SELECT o.*,n.payload,n.event_version,n.type,n.board_id,n.created_at,n.read_at,n.cursor,n.invitation_id FROM research_notification_outbox o JOIN research_notifications n ON n.id=o.notification_id WHERE o.delivered_at IS NULL LIMIT 100'
  ).all()
  for (const row of rows.results) {
    try {
      const notification = {
        ...JSON.parse(row.payload),
        notificationId: row.notification_id,
        eventVersion: row.event_version,
        type: row.type,
        boardId: row.board_id,
        createdAt: row.created_at,
        readAt: row.read_at,
        cursor: row.cursor
      }
      if (row.invitation_id)
        notification.invitation = invitation(
          await sql(
            env,
            'SELECT * FROM board_invitations WHERE id=?',
            row.invitation_id
          ).first()
        )
      const target = env.RESEARCH_NOTIFICATIONS.get(
        env.RESEARCH_NOTIFICATIONS.idFromName(row.recipient_id)
      )
      const result = await target.fetch(
        'https://notification.internal/deliver',
        {
          method: 'POST',
          body: JSON.stringify({ userId: row.recipient_id, notification })
        }
      )
      if (result.ok)
        await sql(
          env,
          'UPDATE research_notification_outbox SET delivered_at=?,attempts=attempts+1 WHERE id=?',
          Date.now(),
          row.id
        ).run()
    } catch {
      await sql(
        env,
        'UPDATE research_notification_outbox SET attempts=attempts+1 WHERE id=?',
        row.id
      ).run()
    }
  }
  return rows.results.length
}
