import { assertConversationClaim, mutateQueuedConversation, conversationContext } from '../../packages/dsh-research-collaboration/conversation-queue.js'
import {
  resolveRequestContext,
  historyAssetIds
} from '../../packages/dsh-research-collaboration/context.js'
import { createHash } from 'node:crypto'
import { generationContent, mergeGenerationResult } from '../../packages/dsh-research-collaboration/generation-result.js'
import { hash } from '../accounts/auth.js'
import {
  createDocument,
  decodeDocument,
  encodeDocument,
  projectDocument,
  applyCanvasDiff,
  freezeSnapshot,
  mergeDocumentUpdate,
  validateCanvas
} from '../../packages/dsh-research-collaboration/document.js'
import {
  LIMITS,
  toBase64,
  fromBase64,
  validatePresenceHints,
  taskFailureMessage
} from '../../packages/dsh-research-collaboration/protocol.js'
import {
  sql,
  activateUploadStatements,
  liveUser,
  identity,
  lookup,
  limit,
  state,
  membership,
  authorize,
  invitation,
  notificationStatements,
  flushOutbox
} from './repository.js'
import {
  fail,
  requiredString,
  assetName,
  operationId,
  role,
  json,
  errorResponse
} from './validation.js'
const now = () => Date.now()
const publicTask = (t) => {
  const { leaseHash, sessionHash, contextKey, ...value } = t
  return value
}
export class ResearchBoardRoom {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }
  async fetch(request) {
    // Request body chunks must arrive outside the DO input gate. Revalidate in the commit gate.
    const pathname = new URL(request.url).pathname
    if (pathname === '/stageAsset' || pathname === '/liveAsset') {
      try {
        const result = await (pathname === '/stageAsset'
          ? this.stageAsset(
              request,
              JSON.parse(request.headers.get('x-collaboration-context'))
            )
          : this.liveAsset(
              request,
              JSON.parse(request.headers.get('x-collaboration-context'))
            ))
        return result.__error
          ? json(result.__error, result.__status)
          : json(result)
      } catch (e) {
        return errorResponse(e)
      }
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (new URL(request.url).pathname === '/connect')
          return this.connect(
            JSON.parse(request.headers.get('x-collaboration-context'))
          )
        const input = await request.json()
        await this.ctx.storage.put('boardId', input.boardId)
        if (input.kind === 'create') return json(await this.create(input))
        if (input.kind === 'snapshot')
          return json(await this.snapshot(input.boardId, input.user))
        if (input.kind === 'respond') return json(await this.respond(input))
        if (input.kind === 'assetRead') {
          await authorize(this.env, input.boardId, input.user)
          const asset = await sql(
            this.env,
            'SELECT * FROM research_assets WHERE board_id=? AND id=?',
            input.boardId,
            input.assetId
          ).first()
          if (!asset) fail('ASSET_NOT_FOUND', 404)
          const object = await this.env.RESEARCH_ASSETS.get(asset.object_key)
          if (!object) fail('ASSET_UNAVAILABLE', 503)
          return new Response(object.body, {
            headers: {
              'Content-Type': asset.content_type,
              'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff'
            }
          })
        }
        return json(
          await this.command(input.boardId, input.user, input.command)
        )
      } catch (e) {
        return errorResponse(e)
      }
    })
  }
  async stageAsset(
    request,
    { user, uploadId, assetId, name, contentType, expectedBytes }
  ) {
    await liveUser(this.env, user)
    operationId(assetId)
    assetName(name)
    requiredString(contentType, 128)
    const upload = await sql(
      this.env,
      'SELECT * FROM research_uploads WHERE id=?',
      uploadId
    ).first()
    if (!upload || upload.user_id !== user.id) fail('UPLOAD_NOT_FOUND', 404)
    if (upload.board_id || upload.expires_at <= now())
      fail('UPLOAD_CLOSED', 409)
    const prior = await sql(
      this.env,
      'SELECT * FROM research_assets WHERE upload_id=? AND id=?',
      uploadId,
      assetId
    ).first()
    const total = await sql(
      this.env,
      'SELECT COALESCE(SUM(size),0) AS n FROM research_assets WHERE upload_id=?',
      uploadId
    ).first()
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
      fail('ASSET_SIZE_REQUIRED', 411)
    if (expectedBytes > LIMITS.assetBytes) fail('ASSET_SIZE_LIMIT', 413)
    const hasher = createHash('sha256')
    let size = 0
    const transform = new TransformStream({
      transform(chunk, controller) {
        size += chunk.byteLength
        if (
          size > LIMITS.assetBytes ||
          total.n + size > LIMITS.boardAssetBytes
        )
          throw Error('ASSET_TOO_LARGE')
        hasher.update(chunk)
        controller.enqueue(chunk)
      }
    })
    const key = `staging/${uploadId}/${assetId}/${crypto.randomUUID()}`
    if (prior) {
      const reader = request.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > LIMITS.assetBytes) fail('ASSET_SIZE_LIMIT', 413)
        hasher.update(value)
      }
      if (hasher.digest('hex') !== prior.content_hash)
        fail('ASSET_IMMUTABLE', 409)
      return {
        assetId: prior.id,
        size: prior.size,
        contentHash: prior.content_hash
      }
    }
    try {
      const fixed = new FixedLengthStream(expectedBytes)
      await Promise.all([
        request.body.pipeThrough(transform).pipeTo(fixed.writable),
        this.env.RESEARCH_ASSETS.put(key, fixed.readable, {
          httpMetadata: { contentType }
        })
      ])
    } catch (e) {
      if (/TOO_LARGE/.test(String(e))) fail('ASSET_SIZE_LIMIT', 413)
      throw e
    }
    const digest = hasher.digest('hex')
    const inserted = await sql(
      this.env,
      'INSERT INTO research_assets(id,upload_id,object_key,name,content_type,size,content_hash,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM research_uploads WHERE id=? AND board_id IS NULL AND expires_at>?) AND (SELECT COALESCE(SUM(size),0) FROM research_assets WHERE upload_id=?)+?<=? ON CONFLICT(upload_id,id) DO NOTHING',
      assetId,
      uploadId,
      key,
      name,
      contentType,
      size,
      digest,
      now(),
      uploadId,
      now(),
      uploadId,
      size,
      LIMITS.boardAssetBytes
    ).run()
    if (inserted.meta.changes !== 1) {
      const winner = await sql(
        this.env,
        'SELECT * FROM research_assets WHERE upload_id=? AND id=?',
        uploadId,
        assetId
      ).first()
      await this.env.RESEARCH_ASSETS.delete(key)
      if (!winner) fail('UPLOAD_CLOSED_OR_FULL', 409)
      if (winner.content_hash !== digest) fail('ASSET_IMMUTABLE', 409)
      return {
        assetId: winner.id,
        size: winner.size,
        contentHash: winner.content_hash,
        name: winner.name,
        contentType: winner.content_type,
        version: 1
      }
    }
    return {
      assetId,
      size,
      contentHash: digest,
      name,
      contentType,
      version: 1
    }
  }
  async liveAsset(request, input) {
    await authorize(this.env, input.boardId, input.user, {
      write: true,
      epoch: input.epoch
    })
    operationId(input.operationId)
    const prior = await this.receipt(
      input.boardId,
      input.user.id,
      input.operationId
    )
    if (prior) {
      if (prior.action !== 'assetWrite') fail('OPERATION_REUSED', 409)
      return prior
    }
    const uploadId = hash(
        `asset:${input.boardId}:${input.user.id}:${input.operationId}`
      ).slice(0, 32),
      assetId = uploadId
    await sql(
      this.env,
      'INSERT OR IGNORE INTO research_uploads(id,user_id,operation_id,expires_at) VALUES(?,?,?,?)',
      uploadId,
      input.user.id,
      `asset:${input.boardId}:${input.operationId}`,
      now() + 86400000
    ).run()
    const asset = await this.stageAsset(request, {
      ...input,
      uploadId,
      assetId
    })
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const { current } = await authorize(
          this.env,
          input.boardId,
          input.user,
          { write: true, epoch: input.epoch }
        )
        const existing = await this.receipt(
          input.boardId,
          input.user.id,
          input.operationId
        )
        if (existing) {
          if (existing.action !== 'assetWrite') fail('OPERATION_REUSED', 409)
          return existing
        }
        const total = await sql(
          this.env,
          'SELECT COALESCE(SUM(size),0) AS n FROM research_assets WHERE board_id=?',
          input.boardId
        ).first()
        if (total.n + asset.size > LIMITS.boardAssetBytes)
          fail('BOARD_ASSET_LIMIT', 413)
        return await this.commit(
          current,
          input.user,
          input.operationId,
          { asset: { ...asset, boardId: input.boardId } },
          activateUploadStatements(
            this.env,
            uploadId,
            input.user.id,
            input.boardId
          )
        )
      } catch (e) {
        const response = errorResponse(e)
        return { __error: await response.json(), __status: response.status }
      }
    })
  }
  async create({ boardId, user, input }) {
    await liveUser(this.env, user)
    operationId(input.operationId)
    const previous = await sql(
      this.env,
      'SELECT state FROM research_boards WHERE owner_id=? AND create_operation=?',
      user.id,
      input.operationId
    ).first()
    if (previous)
      return { board: JSON.parse(previous.state).board, created: false }
    const title = requiredString(input.title, 256),
      sourceRevision = requiredString(input.sourceRevision, 256)
    if (!Number.isFinite(Date.parse(input.capturedAt)))
      fail('INVALID_CAPTURE')
    const snapshot = freezeSnapshot(input.snapshot ?? {}),
      document = createDocument(snapshot.canvas)
    let uploadId =
      input.uploadId ??
      hash(`create-upload:${user.id}:${input.operationId}`).slice(0, 32)
    let upload = await sql(
      this.env,
      'SELECT * FROM research_uploads WHERE id=?',
      uploadId
    ).first()
    if (
      upload &&
      (upload.user_id !== user.id ||
        upload.board_id ||
        upload.expires_at <= now())
    )
      fail('INVALID_UPLOAD', 409)
    if (!upload) {
      if (input.uploadId) fail('UPLOAD_NOT_FOUND', 404)
      await sql(
        this.env,
        'INSERT INTO research_uploads(id,user_id,operation_id,expires_at) VALUES(?,?,?,?)',
        uploadId,
        user.id,
        `board:${input.operationId}`,
        now() + 86400000
      ).run()
    }
    for (const asset of input.assets ?? []) {
      const bytes = fromBase64(asset.dataBase64)
      await this.persistAsset(
        uploadId,
        asset.assetId ?? crypto.randomUUID(),
        asset.name,
        asset.contentType,
        bytes
      )
    }
    const assets = (
      await sql(
        this.env,
        'SELECT * FROM research_assets WHERE upload_id=?',
        uploadId
      ).all()
    ).results
    if (assets.reduce((s, a) => s + a.size, 0) > LIMITS.boardAssetBytes)
      fail('BOARD_ASSET_LIMIT', 413)
    await this.validateAssets(snapshot, assets, true)
    const board = {
      boardId,
      ownerId: user.id,
      title,
      lifecycle: 'active',
      sharingState: 'shared',
      sharingEpoch: 1,
      cutoffSeq: null,
      seq: 0,
      schemaVersion: 1,
      refreshPaused: false,
      capturedAt: input.capturedAt,
      createdAt: now(),
      updatedAt: now(),
      updatedBy: { userId: user.id, username: user.username }
    }
    const current = {
      board,
      sourceRevision,
      documentUpdate: toBase64(encodeDocument(document)),
      history: snapshot.history,
      messages: [],
      tasks: [],
      tombstones: [],
      nodeVersions: {}
    }
    for (const c of ['files', 'artifacts'])
      for (const n of snapshot.canvas[c])
        current.nodeVersions[`${c}:${n.id}`] = 1
    if (Buffer.byteLength(JSON.stringify(current)) > LIMITS.stateBytes)
      fail('BOARD_STATE_SIZE_LIMIT', 413)
    await this.env.ACCOUNTS_DB.batch([
      sql(
        this.env,
        'INSERT INTO research_boards(id,owner_id,create_operation,state,created_at) VALUES(?,?,?,?,?)',
        boardId,
        user.id,
        input.operationId,
        JSON.stringify(current),
        now()
      ),
      sql(
        this.env,
        "INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,'owner',?)",
        boardId,
        user.id,
        now()
      ),
      ...activateUploadStatements(this.env, uploadId, user.id, boardId)
    ])
    await this.checkpoint(current)
    return { board, created: true }
  }
  async validateAssets(canvas, assets, verifyObjects = false) {
    const available = new Set(assets.map((a) => a.id))
    const visit = (value) => {
      if (value && typeof value === 'object') {
        if (
          typeof value.assetId === 'string' &&
          !available.has(value.assetId)
        )
          fail('ASSET_NOT_READY', 409, { assetId: value.assetId })
        for (const child of Object.values(value)) visit(child)
      }
    }
    visit(canvas)
    for (const asset of verifyObjects ? assets : [])
      if (!(await this.env.RESEARCH_ASSETS.head(asset.object_key)))
        fail('ASSET_NOT_READY', 409, { assetId: asset.id })
  }
  async persistAsset(uploadId, assetId, name, contentType, data) {
    operationId(assetId)
    assetName(name)
    requiredString(contentType, 128)
    if (data.byteLength > LIMITS.assetBytes) fail('ASSET_SIZE_LIMIT', 413)
    const digest = hash(Buffer.from(data))
    const prior = await sql(
      this.env,
      'SELECT * FROM research_assets WHERE upload_id=? AND id=?',
      uploadId,
      assetId
    ).first()
    if (prior) {
      if (prior.content_hash !== digest) fail('ASSET_IMMUTABLE', 409)
      return prior
    }
    const key = `staging/${uploadId}/${assetId}`
    await this.env.RESEARCH_ASSETS.put(key, data, {
      httpMetadata: { contentType }
    })
    await sql(
      this.env,
      'INSERT INTO research_assets(id,upload_id,object_key,name,content_type,size,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?)',
      assetId,
      uploadId,
      key,
      name,
      contentType,
      data.byteLength,
      digest,
      now()
    ).run()
    return {
      id: assetId,
      object_key: key,
      size: data.byteLength,
      name,
      content_type: contentType,
      content_hash: digest
    }
  }
  async snapshot(boardId, user) {
    const { current, member } = await authorize(this.env, boardId, user)
    const members = (
      await sql(
        this.env,
        "SELECT m.user_id AS userId,u.username,m.role,m.version,m.joined_at AS joinedAt FROM board_members m JOIN users u ON u.id=m.user_id WHERE m.board_id=? AND m.status='active'",
        boardId
      ).all()
    ).results
    return {
      board: { ...current.board, role: member.role, memberCount: members.length },
      snapshot: {
        canvas: projectDocument(
          decodeDocument(fromBase64(current.documentUpdate))
        ),
        history: current.history
      },
      documentUpdate: current.documentUpdate,
      seq: current.board.seq,
      tombstones: current.tombstones,
      members,
      pendingInvitations:
        member.role === 'owner'
          ? (
              await sql(
                this.env,
                "SELECT i.id,i.invitee_id,i.role,i.version,i.expires_at,u.username,p.public_id FROM board_invitations i JOIN users u ON u.id=i.invitee_id JOIN research_public_ids p ON p.user_id=i.invitee_id WHERE i.board_id=? AND i.status='pending' AND i.expires_at>? AND i.epoch=? ORDER BY i.created_at,i.id",
                boardId,
                now(),
                current.board.sharingEpoch
              ).all()
            ).results.map((i) => ({
              invitationId: i.id,
              invitee: {
                userId: i.invitee_id,
                username: i.username,
                publicId: i.public_id
              },
              role: i.role,
              version: i.version,
              expiresAt: i.expires_at,
              status: 'pending'
            }))
          : [],
      messages: current.messages,
      tasks: current.tasks.map(publicTask)
    }
  }
  async receipt(boardId, userId, op) {
    const row = await sql(
      this.env,
      'SELECT response FROM research_receipts WHERE board_id=? AND user_id=? AND operation_id=?',
      boardId,
      userId,
      op
    ).first()
    return row ? JSON.parse(row.response) : null
  }
  async checkpoint(current) {
    try {
      await this.ctx.storage.put({
        boardId: current.board.boardId,
        checkpoint: current
      })
      await this.ctx.storage.setAlarm(now() + 10000)
    } catch {
      /* D1 committed checkpoint remains authority; next request/alarm repairs cache. */
    }
  }
  async commit(
    current,
    user,
    op,
    result,
    statements = [],
    action = 'assetWrite'
  ) {
    current.board.seq++
    // Presence, invitations and lease heartbeats are not content edits.
    if (['update', 'rename', 'message', 'taskApplyResult', 'assetWrite'].includes(action) ||
        (action === 'taskResult' && result.task?.status === 'completed')) {
      current.board.updatedAt = now()
      current.board.updatedBy = { userId: user.id, username: user.username }
    }
    const response = {
      action,
      operationId: op,
      seq: current.board.seq,
      epoch: current.board.sharingEpoch,
      ...result
    }
    const serialized = JSON.stringify(current)
    if (
      Buffer.byteLength(serialized) > LIMITS.stateBytes ||
      Buffer.byteLength(JSON.stringify(response)) > LIMITS.stateBytes
    )
      fail('BOARD_STATE_SIZE_LIMIT', 413)
    await this.env.ACCOUNTS_DB.batch([
      sql(
        this.env,
        'UPDATE research_boards SET state=? WHERE id=?',
        serialized,
        current.board.boardId
      ),
      ...statements,
      sql(
        this.env,
        'INSERT INTO research_receipts(board_id,user_id,operation_id,seq,epoch,response) VALUES(?,?,?,?,?,?)',
        current.board.boardId,
        user.id,
        op,
        current.board.seq,
        current.board.sharingEpoch,
        JSON.stringify(response)
      )
    ])
    await this.checkpoint(current)
    await this.broadcast(current.board.boardId)
    this.ctx.waitUntil(flushOutbox(this.env).catch(() => {}))
    return response
  }
  async command(boardId, user, command) {
    operationId(command.operationId)
    const action = command.action
    const controls = new Set([
      'rename',
      'refreshPause',
      'invite',
      'revokeInvitation',
      'memberRole',
      'removeMember',
      'archive',
      'restore',
      'cancel',
      'reopen'
    ])
    const control = controls.has(action)
    const { current, member } = await authorize(this.env, boardId, user, {
      owner: control,
      write: !control && action !== 'leave'
    })
    if (command.epoch === undefined) fail('EPOCH_REQUIRED')
    const prior = await this.receipt(boardId, user.id, command.operationId)
    if (prior) {
      if (prior.action !== action) fail('OPERATION_REUSED', 409)
      if (action === 'taskClaim') {
        const task = current.tasks.find((t) => t.taskId === command.taskId)
        if (
          !task ||
          task.status !== 'running' ||
          task.epoch !== current.board.sharingEpoch ||
          command.epoch !== task.epoch ||
          task.sessionHash !== user.session_hash ||
          task.executorId !== command.executorId ||
          task.leaseExpiresAt <= now() ||
          task.leaseHash !== hash(String(prior.leaseToken))
        )
          fail('STALE_LEASE', 409)
      } else if (
        !['cancel', 'reopen'].includes(action) &&
        command.epoch !== current.board.sharingEpoch
      )
        fail('STALE_EPOCH', 409, { epoch: current.board.sharingEpoch })
      return prior
    }
    if (command.epoch !== current.board.sharingEpoch)
      fail('STALE_EPOCH', 409, { epoch: current.board.sharingEpoch })
    const board = current.board,
      statements = []
    let result = {}
    const actor = await identity(this.env, user)
    const notify = (recipientId, type, invitationId = null, version = 1) =>
      statements.push(
        ...notificationStatements(this.env, {
          recipientId,
          board,
          type,
          actor,
          invitationId,
          version
        })
      )
    if (action === 'update') {
      const doc = decodeDocument(fromBase64(current.documentUpdate)),
        before = projectDocument(doc)
      mergeDocumentUpdate(
        doc,
        fromBase64(command.update),
        new Set(current.tombstones)
      )
      const after = projectDocument(doc)
      await this.validateAssets(
        after,
        (
          await sql(
            this.env,
            'SELECT * FROM research_assets WHERE board_id=?',
            boardId
          ).all()
        ).results
      )
      for (const c of ['files', 'artifacts']) {
        const next = new Map(after[c].map((n) => [n.id, n]))
        for (const node of before[c]) {
          const key = `${c}:${node.id}`
          if (!next.has(node.id)) current.tombstones.push(key)
        }
        for (const node of after[c]) {
          const old = before[c].find((n) => n.id === node.id)
          if (JSON.stringify(old) !== JSON.stringify(node))
            current.nodeVersions[`${c}:${node.id}`] =
              (current.nodeVersions[`${c}:${node.id}`] ?? 0) + 1
        }
      }
      current.documentUpdate = toBase64(encodeDocument(doc))
      result = { documentUpdate: current.documentUpdate }
    } else if (action === 'rename') {
      board.title = requiredString(command.title, 256)
      result = { board }
    } else if (action === 'invite') {
      if (board.lifecycle !== 'active' || board.sharingState !== 'shared')
        fail('BOARD_NOT_SHARED', 409)
      const target = await lookup(this.env, command.publicId)
      role(command.role)
      if (target.userId === user.id) fail('CANNOT_INVITE_SELF', 409)
      if (await membership(this.env, boardId, target.userId))
        fail('ALREADY_MEMBER', 409)
      const pending = await sql(
        this.env,
        "SELECT * FROM board_invitations WHERE board_id=? AND invitee_id=? AND status='pending'",
        boardId,
        target.userId
      ).first()
      if (pending && pending.expires_at > now()) {
        if (pending.role !== command.role) {
          pending.role = command.role
          pending.version++
          statements.push(
            sql(
              this.env,
              'UPDATE board_invitations SET role=?,version=?,updated_at=? WHERE id=?',
              pending.role,
              pending.version,
              now(),
              pending.id
            )
          )
          notify(target.userId, 'invitation', pending.id, pending.version)
        }
        result = { invitation: invitation(pending) }
      } else {
        const count = await sql(
          this.env,
          "SELECT COUNT(*) AS n FROM board_members WHERE board_id=? AND status='active'",
          boardId
        ).first()
        if (count.n >= LIMITS.members) fail('MEMBER_LIMIT', 409)
        const declined = await sql(
          this.env,
          "SELECT id FROM board_invitations WHERE board_id=? AND invitee_id=? AND inviter_id=? AND status='declined' AND updated_at>?",
          boardId,
          target.userId,
          user.id,
          now() - 86400000
        ).first()
        if (declined) fail('INVITATION_COOLDOWN', 429)
        await limit(
          this.env,
          `invites:${user.id}:${Math.floor(now() / 86400000)}`,
          20,
          86400000
        )
        if (pending)
          statements.push(
            sql(
              this.env,
              "UPDATE board_invitations SET status='expired',updated_at=? WHERE id=?",
              now(),
              pending.id
            )
          )
        const row = {
          id: crypto.randomUUID(),
          board_id: boardId,
          inviter_id: user.id,
          invitee_id: target.userId,
          role: command.role,
          version: 1,
          epoch: board.sharingEpoch,
          status: 'pending',
          expires_at: now() + 7 * 86400000,
          created_at: now()
        }
        statements.push(
          sql(
            this.env,
            'INSERT INTO board_invitations(id,board_id,inviter_id,invitee_id,role,version,epoch,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            row.id,
            boardId,
            user.id,
            target.userId,
            row.role,
            1,
            row.epoch,
            'pending',
            row.expires_at,
            row.created_at,
            now()
          )
        )
        notify(target.userId, 'invitation', row.id)
        result = { invitation: invitation(row) }
      }
    } else if (action === 'revokeInvitation') {
      const row = await sql(
        this.env,
        'SELECT * FROM board_invitations WHERE id=? AND board_id=?',
        command.invitationId,
        boardId
      ).first()
      if (!row) fail('INVITATION_NOT_FOUND', 404)
      if (row.status === 'pending') {
        row.status = 'cancelled'
        statements.push(
          sql(
            this.env,
            "UPDATE board_invitations SET status='cancelled',updated_at=? WHERE id=?",
            now(),
            row.id
          )
        )
        notify(row.invitee_id, 'invitationCancelled', row.id, row.version)
      }
      result = { invitation: invitation(row) }
    } else if (
      action === 'memberRole' ||
      action === 'removeMember' ||
      action === 'leave'
    ) {
      const targetId =
        action === 'leave' ? user.id : requiredString(command.userId)
      if (targetId === board.ownerId) fail('OWNER_REQUIRED', 409)
      const target = await membership(this.env, boardId, targetId)
      if (!target) fail('MEMBER_NOT_FOUND', 404)
      if (action === 'memberRole') {
        role(command.role)
        statements.push(
          sql(
            this.env,
            'UPDATE board_members SET role=?,version=version+1 WHERE board_id=? AND user_id=?',
            command.role,
            boardId,
            targetId
          )
        )
        result = {
          member: {
            ...target,
            role: command.role,
            version: target.version + 1
          }
        }
      } else {
        statements.push(
          sql(
            this.env,
            "UPDATE board_members SET status='revoked',version=version+1 WHERE board_id=? AND user_id=?",
            boardId,
            targetId
          )
        )
        result = { removedUserId: targetId }
      }
      if (action !== 'memberRole' || command.role === 'viewer')
        this.interruptTasks(current, targetId)
      notify(
        targetId,
        action === 'memberRole' ? 'roleChanged' : 'memberRemoved'
      )
    } else if (['archive', 'restore', 'cancel', 'reopen'].includes(action)) {
      const members = (
        await sql(
          this.env,
          "SELECT user_id FROM board_members WHERE board_id=? AND status='active'",
          boardId
        ).all()
      ).results
      if (action === 'archive') board.lifecycle = 'archived'
      if (action === 'restore') board.lifecycle = 'active'
      if (action === 'cancel') {
        board.sharingState = 'ownerOnly'
        board.sharingEpoch++
        board.cutoffSeq = board.seq
        board.cancelledAt = now()
        statements.push(
          sql(
            this.env,
            "UPDATE board_members SET status='revoked',version=version+1 WHERE board_id=? AND user_id<>?",
            boardId,
            board.ownerId
          )
        )
      }
      if (action === 'reopen') {
        if (board.lifecycle === 'archived') fail('BOARD_ARCHIVED', 409)
        board.sharingState = 'shared'
        board.sharingEpoch++
      }
      if (action === 'cancel' || action === 'archive') {
        this.interruptTasks(current)
        const invites = (
          await sql(
            this.env,
            "SELECT * FROM board_invitations WHERE board_id=? AND status='pending'",
            boardId
          ).all()
        ).results
        statements.push(
          sql(
            this.env,
            "UPDATE board_invitations SET status='cancelled',updated_at=? WHERE board_id=? AND status='pending'",
            now(),
            boardId
          )
        )
        for (const i of invites)
          notify(i.invitee_id, 'invitationCancelled', i.id, i.version)
      }
      for (const m of members)
        if (m.user_id !== user.id)
          notify(
            m.user_id,
            {
              archive: 'boardArchived',
              restore: 'boardRestored',
              cancel: 'sharingCancelled',
              reopen: 'sharingReopened'
            }[action]
          )
      result = { board }
    } else if (action === 'message') {
      if (
        typeof command.text === 'string' &&
        Buffer.byteLength(command.text) > LIMITS.messageBytes
      )
        fail('MESSAGE_SIZE_LIMIT', 413)
      requiredString(command.text, LIMITS.messageBytes)
      const message = {
        id: crypto.randomUUID(),
        author: actor,
        role: 'user',
        text: command.text,
        context: resolveRequestContext(
          command.context,
          projectDocument(decodeDocument(fromBase64(current.documentUpdate))),
          current.nodeVersions
        ),
        contextRevision: current.board.seq,
        createdAt: now()
      }
      current.messages.push(message)
      result = { message }
    } else if (action === 'refreshPause') {
      if (typeof command.paused !== 'boolean') fail('INVALID_INPUT')
      board.refreshPaused = command.paused
      if (command.paused)
        for (const task of current.tasks)
          if (
            task.source === 'refresh' &&
            ['pending', 'running'].includes(task.status)
          ) {
            task.status = 'interrupted'
            delete task.leaseHash
            delete task.sessionHash
          }
      result = { board }
    } else if (action === 'queueEdit' || action === 'queueDelete' || action === 'queuePromote') {
      try {
        const task = mutateQueuedConversation(current, command.taskId, user.id, {queueEdit:'edit',queueDelete:'delete',queuePromote:'promote'}[action], command.text)
        result = { task: publicTask(task) }
      } catch (error) { fail(error.code ?? 'INVALID_INPUT', error.status ?? 400) }
    } else if (action === 'taskCreate') {
      const message = current.messages.find(
        (m) => m.id === command.requestMessageId
      )
      if (!message || message.author.userId !== user.id)
        fail('REQUEST_AUTHOR_REQUIRED', 403)
      for (const ref of message.context?.references ?? []) {
        const key = `${ref.collection}:${ref.nodeId}`
        if (current.nodeVersions[key] !== ref.nodeVersion)
          fail('REFERENCED_SOURCE_CHANGED', 409, { name: ref.name })
      }
      const source = command.source ?? 'manual'
      if (!['manual', 'refresh'].includes(source)) fail('INVALID_TASK_SOURCE')
      if (source === 'refresh' && (board.refreshPaused || !command.targetId))
        fail('REFRESH_PAUSED_OR_MISSING_TARGET', 409)
      if (
        source === 'refresh' &&
        current.tasks.some(
          (t) =>
            t.source === 'refresh' &&
            t.targetId === command.targetId &&
            ['pending', 'running'].includes(t.status)
        )
      )
        fail('REFRESH_ALREADY_RUNNING', 409)
      const targetCollection = command.targetCollection ?? 'artifacts'
      if (!['artifacts', 'files'].includes(targetCollection))
        fail('INVALID_TARGET')
      const canvas = projectDocument(
        decodeDocument(fromBase64(current.documentUpdate))
      )
      if (
        command.targetId &&
        !canvas[targetCollection].some((n) => n.id === command.targetId)
      )
        fail('TARGET_NOT_FOUND', 404)
      if (
        source === 'refresh' &&
        command.refreshScheduleId !==
          canvas[targetCollection].find((n) => n.id === command.targetId)
            ?.refreshScheduleId
      )
        fail('REFRESH_SCHEDULE_CHANGED', 409)
      const taskId = crypto.randomUUID(),
        contextKey = `contexts/${boardId}/${taskId}`
      await this.env.RESEARCH_ASSETS.put(
        contextKey,
        JSON.stringify({
          canvas,
          history: current.history,
          messages: current.messages,
          seq: board.seq
        })
      )
      const task = {
        taskId,
        boardId,
        source,
        initiatorId: user.id,
        requestMessageId: message.id,
        contextRevision: board.seq,
        contextKey,
        targetId: command.targetId ?? null,
        targetCollection,
        targetVersion: command.targetId
          ? current.nodeVersions[`${targetCollection}:${command.targetId}`]
          : null,
        targetContentHash: command.targetId
          ? hash(generationContent(canvas[targetCollection].find(n => n.id === command.targetId)))
          : null,
        conversation: !command.targetId,
        queueOrder: current.board.seq,
        status: 'pending',
        epoch: board.sharingEpoch,
        createdAt: now()
      }
      current.tasks.push(task)
      result = { task: publicTask(task) }
    } else if (action === 'taskApplyResult') {
      const task = current.tasks.find((t) => t.taskId === command.taskId)
      if (!task?.result?.node) fail('RESULT_UNAVAILABLE', 409)
      if (task.resultState === 'applied') result = { task: publicTask(task) }
      else {
        if (!['pendingResult', 'targetDeleted'].includes(task.resultState))
          fail('RESULT_UNAVAILABLE', 409)
        const doc = decodeDocument(fromBase64(current.documentUpdate)),
          before = projectDocument(doc),
          after = structuredClone(before)
        const collection = task.targetCollection,
          index = after[collection].findIndex((n) => n.id === task.targetId),
          node = structuredClone(task.result.node)
        if (index < 0) {
          node.id = crypto.randomUUID()
          after[collection].push(node)
        } else {
          after[collection][index] = mergeGenerationResult(after[collection][index], node)
        }
        validateCanvas(after)
        applyCanvasDiff(doc, before, after)
        current.documentUpdate = toBase64(encodeDocument(doc))
        current.nodeVersions[`${collection}:${node.id}`] =
          (current.nodeVersions[`${collection}:${node.id}`] ?? 0) + 1
        task.resultState = 'applied'
        task.appliedTargetId = node.id
        result = { task: publicTask(task) }
      }
    } else if (
      ['taskClaim', 'taskHeartbeat', 'taskResult', 'taskStop'].includes(
        action
      )
    ) {
      const task = current.tasks.find((t) => t.taskId === command.taskId)
      if (!task) fail('TASK_NOT_FOUND', 404)
      if (
        task.initiatorId !== user.id &&
        !(action === 'taskStop' && member.role === 'owner')
      )
        fail('TASK_INITIATOR_REQUIRED', 403)
      if (action === 'taskClaim') {
        if (task.status !== 'pending') fail('LEASE_UNAVAILABLE', 409)
        try { assertConversationClaim(current, task) } catch (error) { fail(error.code, 409) }
        const leaseToken = crypto.randomUUID()
        task.status = 'running'
        task.executorId = requiredString(command.executorId)
        task.sessionHash = user.session_hash
        task.leaseHash = hash(leaseToken)
        task.leaseExpiresAt = now() + LIMITS.leaseMs
        const context = await this.env.RESEARCH_ASSETS.get(task.contextKey)
        if (!context) fail('CONTEXT_UNAVAILABLE', 503)
        const contextSnapshot = task.conversation ? {
          ...conversationContext(current, task),
          canvas: projectDocument(decodeDocument(fromBase64(current.documentUpdate))),
          seq: current.board.seq
        } : await context.json()
        result = {
          task: {
            ...publicTask(task),
            contextSnapshot
          },
          leaseToken
        }
      } else if (action === 'taskStop') {
        if (command.failureCode !== undefined) {
          if (task.initiatorId !== user.id) fail('TASK_INITIATOR_REQUIRED', 403)
          if (!taskFailureMessage(command.failureCode)) fail('INVALID_REQUEST', 400)
        }
        if (task.status === 'running' && task.conversation && command.executorStopped !== true) {
          task.stopRequested = true
        } else if (task.status === 'pending' || task.status === 'running') {
          if (task.status === 'running' && task.conversation &&
            (task.sessionHash !== user.session_hash || task.leaseHash !== hash(String(command.leaseToken)))) fail('STALE_LEASE', 409)
          task.status = command.failureCode ? 'failed' : 'interrupted'
          if (command.failureCode) task.failureCode = command.failureCode
          task.completedAt = now()
          delete task.leaseHash
          delete task.sessionHash
        }
        result = { task: publicTask(task) }
      } else {
        if (
          task.status !== 'running' ||
          task.leaseExpiresAt <= now() ||
          task.epoch !== board.sharingEpoch ||
          task.sessionHash !== user.session_hash ||
          task.leaseHash !== hash(String(command.leaseToken))
        )
          fail('STALE_LEASE', 409)
        if (action === 'taskHeartbeat') {
          task.leaseExpiresAt = now() + LIMITS.leaseMs
          result = { task: publicTask(task) }
        } else {
          if (
            command.text !== undefined &&
            Buffer.byteLength(
              requiredString(command.text, LIMITS.messageBytes)
            ) > LIMITS.messageBytes
          )
            fail('MESSAGE_SIZE_LIMIT', 413)
          if (command.node) {
            validateCanvas({
              files: task.targetCollection === 'files' ? [command.node] : [],
              artifacts:
                task.targetCollection === 'artifacts' ? [command.node] : []
            })
            if (command.node.id !== task.targetId) fail('TARGET_MISMATCH')
            await this.validateAssets(
              { files: [], artifacts: [command.node] },
              (
                await sql(
                  this.env,
                  'SELECT * FROM research_assets WHERE board_id=?',
                  boardId
                ).all()
              ).results
            )
          }
          task.status = 'completed'
          task.completedAt = now()
          task.result = {
            text: command.text ?? '',
            ...(command.node ? { node: command.node } : {})
          }
          delete task.leaseHash
          delete task.sessionHash
          const doc = decodeDocument(fromBase64(current.documentUpdate)),
            before = projectDocument(doc),
            target = before[task.targetCollection].find(
              (n) => n.id === task.targetId
            )
          if (command.node) {
            // Old running tasks predate targetContentHash. Their immutable
            // context remains the authority for this comparison after deploy.
            let contentHash = task.targetContentHash
            if (target && !contentHash) {
              const object = await this.env.RESEARCH_ASSETS.get(task.contextKey)
              const baseline = object && (await object.json()).canvas[task.targetCollection].find(n => n.id === task.targetId)
              if (baseline) contentHash = hash(generationContent(baseline))
            }
            if (!target) task.resultState = 'targetDeleted'
            else if (
              contentHash ? hash(generationContent(target)) !== contentHash :
                current.nodeVersions[`${task.targetCollection}:${task.targetId}`] !== task.targetVersion
            )
              task.resultState = 'pendingResult'
            else {
              const after = structuredClone(before)
              after[task.targetCollection] = after[task.targetCollection].map(
                (n) => (n.id === task.targetId ? mergeGenerationResult(n, command.node) : n)
              )
              applyCanvasDiff(doc, before, after)
              current.documentUpdate = toBase64(encodeDocument(doc))
              current.nodeVersions[
                `${task.targetCollection}:${task.targetId}`
              ]++
              task.resultState = 'applied'
            }
          }
          const message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            author: actor,
            taskId: task.taskId,
            requestMessageId: task.requestMessageId,
            text: command.text ?? '',
            createdAt: now()
          }
          current.messages.push(message)
          result = { task: publicTask(task) }
        }
      }
    } else fail('UNKNOWN_ACTION')
    return this.commit(
      current,
      user,
      command.operationId,
      result,
      statements,
      action
    )
  }
  interruptTasks(current, userId) {
    for (const t of current.tasks)
      if (
        (!userId || t.initiatorId === userId) &&
        ['pending', 'running'].includes(t.status)
      ) {
        t.status = 'interrupted'
        delete t.leaseHash
        delete t.sessionHash
      }
  }
  async respond({ boardId, user, input, invitationId }) {
    await liveUser(this.env, user)
    operationId(input.operationId)
    if (!['accept', 'decline'].includes(input.decision))
      fail('INVALID_DECISION')
    const row = await sql(
      this.env,
      'SELECT * FROM board_invitations WHERE id=? AND board_id=?',
      invitationId,
      boardId
    ).first()
    if (!row) fail('INVITATION_NOT_FOUND', 404)
    if (row.invitee_id !== user.id) fail('WRONG_RECIPIENT', 403)
    const current = await state(this.env, boardId),
      board = current.board
    if (input.version !== row.version)
      fail('INVITATION_VERSION_CHANGED', 409, { invitation: invitation(row) })
    if (
      row.status === 'accepted' &&
      (await membership(this.env, boardId, user.id))
    ) {
      const count = await sql(
        this.env,
        "SELECT COUNT(*) AS n FROM board_members WHERE board_id=? AND status='active'",
        boardId
      ).first()
      return { invitation: invitation(row), memberCount: count.n, boardId }
    }
    if (
      row.status !== 'pending' ||
      row.expires_at <= now() ||
      row.epoch !== board.sharingEpoch ||
      board.lifecycle !== 'active' ||
      board.sharingState !== 'shared'
    )
      fail('INVITATION_UNAVAILABLE', 409, { invitation: invitation(row) })
    const count = await sql(
      this.env,
      "SELECT COUNT(*) AS n FROM board_members WHERE board_id=? AND status='active'",
      boardId
    ).first()
    if (input.decision === 'accept' && count.n >= LIMITS.members)
      fail('MEMBER_LIMIT', 409)
    const prior = await this.receipt(boardId, user.id, input.operationId)
    if (prior) {
      if (prior.action !== 'respond') fail('OPERATION_REUSED', 409)
      return prior
    }
    row.status = input.decision === 'accept' ? 'accepted' : 'declined'
    const statements = [
      sql(
        this.env,
        'UPDATE board_invitations SET status=?,updated_at=? WHERE id=?',
        row.status,
        now(),
        row.id
      )
    ]
    if (row.status === 'accepted')
      statements.push(
        sql(
          this.env,
          "INSERT INTO board_members(board_id,user_id,role,status,version,joined_at) VALUES(?,?,?,'active',1,?) ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role,status='active',version=board_members.version+1,joined_at=excluded.joined_at",
          boardId,
          user.id,
          row.role,
          now()
        )
      )
    const actor = await identity(this.env, user)
    statements.push(
      ...notificationStatements(this.env, {
        recipientId: row.inviter_id,
        board,
        type: 'invitationResult',
        actor,
        invitationId: row.id,
        version: row.version
      }),
      ...notificationStatements(this.env, {
        recipientId: user.id,
        board,
        type: 'invitationResult',
        actor,
        invitationId: row.id,
        version: row.version
      })
    )
    return this.commit(
      current,
      user,
      input.operationId,
      {
        invitation: invitation(row),
        memberCount: count.n + (row.status === 'accepted' ? 1 : 0),
        boardId
      },
      statements,
      'respond'
    )
  }
  async connect({ user, boardId, epoch }) {
    await authorize(this.env, boardId, user, { epoch })
    const pair = new WebSocketPair(),
      socket = pair[1]
    const attachment = {
      user,
      boardId,
      epoch,
      joinedAt: now(),
      seenAt: now()
    }
    this.ctx.acceptWebSocket(socket)
    socket.serializeAttachment(attachment)
    await this.ctx.storage.put('boardId', boardId)
    await this.ctx.storage.setAlarm(now() + 10000)
    socket.send(
      JSON.stringify({
        type: 'welcome',
        scope: 'board',
        ...(await this.snapshot(boardId, user)),
        presence: await this.presence()
      })
    )
    await this.sendPresence()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  async webSocketMessage(socket, data) {
    await this.ctx.blockConcurrencyWhile(async () => {
      let requestId
      try {
        const a = socket.deserializeAttachment()
        const authority = await authorize(this.env, a.boardId, a.user, {
          epoch: a.epoch
        })
        if (
          typeof data !== 'string' ||
          Buffer.byteLength(data) > LIMITS.updateBytes * 1.4 + 4096
        )
          fail('MESSAGE_SIZE_LIMIT', 413)
        const message = JSON.parse(data)
        requestId = message.requestId
        a.seenAt = now()
        socket.serializeAttachment(a)
        if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
          await this.sendPresence()
        } else if (message.type === 'presence') {
          const hints = {
            cursor: message.cursor ?? null,
            selectedIds: message.selectedIds ?? [],
            previews: message.previews ?? []
          }
          if (
            hints.previews.length &&
            (authority.member.role === 'viewer' ||
              authority.current.board.lifecycle !== 'active')
          )
            fail('ACCESS_DENIED', 403)
          try {
            validatePresenceHints(
              hints,
              projectDocument(
                decodeDocument(fromBase64(authority.current.documentUpdate))
              )
            )
          } catch (error) {
            fail(
              error.message === 'PRESENCE_SIZE_LIMIT'
                ? 'PRESENCE_SIZE_LIMIT'
                : 'INVALID_PRESENCE',
              400
            )
          }
          const next = {
            ...a,
            ...hints,
            previewExpiresAt: hints.previews.length ? now() + 3000 : 0,
            previewSeq: authority.current.board.seq
          }
          if (Buffer.byteLength(JSON.stringify(next)) > 16000)
            fail('PRESENCE_SIZE_LIMIT', 413)
          socket.serializeAttachment(next)
          await this.sendPresence()
        } else if (message.type === 'command') {
          const result = await this.command(
            a.boardId,
            a.user,
            message.command
          )
          socket.send(JSON.stringify({ type: 'ack', requestId, ...result }))
        } else fail('UNKNOWN_MESSAGE')
      } catch (e) {
        const response = await errorResponse(e).json()
        try {
          socket.send(
            JSON.stringify({ type: 'error', requestId, ...response })
          )
          if (
            e.status === 401 ||
            e.code === 'ACCESS_REVOKED' ||
            e.code === 'STALE_EPOCH'
          )
            socket.close(4003, e.code)
        } catch {}
      }
    })
  }
  async presence() {
    const people = new Map()
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment()
      if (!a || now() - a.seenAt > LIMITS.leaseMs) continue
      try {
        const { member, current } = await authorize(
          this.env,
          a.boardId,
          a.user,
          {
            epoch: a.epoch
          }
        )
        if (!people.has(a.user.id))
          people.set(a.user.id, {
            userId: a.user.id,
            username: a.user.username,
            role: member.role,
            joinedAt: a.joinedAt,
            cursor: a.cursor ?? null,
            selectedIds: a.selectedIds ?? [],
            previews:
              member.role !== 'viewer' &&
              current.board.lifecycle === 'active' &&
              a.previewExpiresAt > now() &&
              a.previewSeq === current.board.seq
                ? (a.previews ?? [])
                : [],
            previewExpiresAt: a.previewExpiresAt ?? 0,
            previewSeq: a.previewSeq ?? 0
          })
      } catch {}
    }
    return [...people.values()].sort((a, b) => a.joinedAt - b.joinedAt)
  }
  async sendPresence() {
    const presence = await this.presence()
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment()
      try {
        await authorize(this.env, a.boardId, a.user, { epoch: a.epoch })
        socket.send(JSON.stringify({ type: 'presence', presence }))
      } catch {
        try {
          socket.close(4003, 'ACCESS_REVOKED')
        } catch {}
      }
    }
  }
  async broadcast(boardId) {
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment()
      try {
        await authorize(this.env, boardId, a.user, { epoch: a.epoch })
        socket.send(
          JSON.stringify({
            type: 'boardChanged',
            ...(await this.snapshot(boardId, a.user))
          })
        )
      } catch (e) {
        try {
          socket.send(
            JSON.stringify({
              type: 'accessRevoked',
              reason: e.code ?? 'ACCESS_REVOKED',
              epoch: (await state(this.env, boardId)).board.sharingEpoch
            })
          )
          socket.close(4003, 'ACCESS_REVOKED')
        } catch {}
      }
    }
    await this.sendPresence()
  }
  async webSocketClose() {
    await this.sendPresence()
  }
  async webSocketError() {
    await this.sendPresence()
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const boardId = await this.ctx.storage.get('boardId')
      if (!boardId) return
      const current = await state(this.env, boardId)
      let changed = false
      for (const task of current.tasks) {
        if (task.status === 'running') {
          let valid = task.leaseExpiresAt > now()
          try {
            await authorize(
              this.env,
              boardId,
              { id: task.initiatorId, session_hash: task.sessionHash },
              { write: true, epoch: task.epoch }
            )
          } catch {
            valid = false
          }
          if (!valid) {
            task.status = 'interrupted'
            delete task.leaseHash
            delete task.sessionHash
            changed = true
          }
        }
      }
      if (changed) {
        current.board.seq++
        await sql(
          this.env,
          'UPDATE research_boards SET state=? WHERE id=?',
          JSON.stringify(current),
          boardId
        ).run()
        await this.broadcast(boardId)
      }
      for (const socket of this.ctx.getWebSockets()) {
        const a = socket.deserializeAttachment()
        if (now() - a.seenAt > LIMITS.leaseMs)
          try {
            socket.close(4000, 'PRESENCE_EXPIRED')
          } catch {}
      }
      await this.sendPresence()
      await flushOutbox(this.env)
      if (
        this.ctx.getWebSockets().length ||
        current.tasks.some((t) => t.status === 'running')
      )
        await this.ctx.storage.setAlarm(now() + 10000)
    })
  }
}
