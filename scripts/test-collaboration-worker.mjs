import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { cleanup } from '../services/collaboration/http.js'
import {
  createDocument,
  decodeDocument,
  encodeDocument,
  applyCanvasDiff,
  projectDocument
} from '../packages/dsh-research-collaboration/document.js'
import {
  toBase64,
  fromBase64
} from '../packages/dsh-research-collaboration/protocol.js'
const built = await build({
  // Test-only DO subclass holds both distinct board rooms after complete asset
  // validation and before either activation transaction. Production has no hook.
  stdin: {
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    sourcefile: 'collaboration-race-test-entry.js',
    contents: `
      import worker from './services/collaboration/worker.js';
      import {ResearchBoardRoom as BaseRoom} from './services/collaboration/room.js';
      export {ResearchNotifications} from './services/collaboration/notifications.js';
      export class ResearchBoardRoom extends BaseRoom {
        async validateAssets(canvas,assets,verifyObjects){
          await super.validateAssets(canvas,assets,verifyObjects);
          if(verifyObjects && (canvas.canvas ?? canvas).files.some(n=>n.id==='activation-race-file'||n.id==='activation-cleanup-race-file')) {
            const barrier=this.env.ACTIVATION_BARRIER.get(this.env.ACTIVATION_BARRIER.idFromName(assets[0].upload_id));
            await barrier.fetch('https://test.internal/arrive');
          }
        }
      }
      export class ActivationBarrier {
        constructor(){this.arrivals=0;this.ready=new Promise(resolve=>this.release=resolve);this.first=new Promise(resolve=>this.arrived=resolve)}
        async fetch(request){const path=new URL(request.url).pathname;if(path==='/await-first'){await this.first;return Response.json({arrivals:this.arrivals})}if(path==='/release'){this.release();return Response.json({released:true})}this.arrivals++;this.arrived();if(this.arrivals===2)this.release();await this.ready;return Response.json({arrivals:this.arrivals})}
      }
      export default worker;
    `
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['cloudflare:*', 'node:*']
})
const persist = mkdtempSync(path.join(tmpdir(), 'collaboration-worker-'))
const options = convertV4MiniflareOptions({
  resourcePersistencePath: persist,
  workers: [
    {
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-08-27',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { ACCOUNTS_DB: 'test-collaboration' },
      durableObjects: {
        ACTIVATION_BARRIER: { className: 'ActivationBarrier', useSQLite: true },
        RESEARCH_ROOMS: { className: 'ResearchBoardRoom', useSQLite: true },
        RESEARCH_NOTIFICATIONS: {
          className: 'ResearchNotifications',
          useSQLite: true
        }
      },
      r2Buckets: ['RESEARCH_ASSETS'],
      outboundService: () => {
        throw Error('Unexpected network')
      }
    }
  ]
})
let mf = new Miniflare(options)
const initial = {
  files: [],
  artifacts: [
    {
      id: 'a',
      kind: 'pasted-text',
      title: '金价',
      excerpt: '研究',
      x: 0,
      y: 0
    }
  ]
}
const tokens = ['1', '2', '3'].map((c) => c.repeat(64))
let seq = 0
const call = (user, path, body, method) =>
  mf.dispatchFetch('https://collab.local/v1/collaboration' + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      authorization: `Bearer ${tokens[user]}`,
      'content-type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
const ok = async (promise) => {
  const r = await promise
  assert.equal(r.status, 200, await r.clone().text())
  return r.json()
}
let boardId,
  epoch = 1
const command = (user, action, extra = {}) =>
  call(user, `/boards/${boardId}/commands`, {
    action,
    operationId: `op-${++seq}`,
    epoch,
    ...extra
  })
const connect = async (user, scope = 'board') => {
  const t = await ok(
    call(user, '/tickets', {
      scope,
      ...(scope === 'board' ? { boardId } : {})
    })
  )
  const r = await mf.dispatchFetch('https://collab.local' + t.url, {
    headers: { Upgrade: 'websocket' }
  })
  assert.equal(r.status, 101)
  const welcome = next(r.webSocket, 'welcome')
  r.webSocket.accept()
  return { ws: r.webSocket, ticket: t, welcome }
}
const next = (ws, type, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', receive)
      reject(Error(`No ${type}`))
    }, 5000)
    function receive(e) {
      const m = JSON.parse(e.data)
      if (m.type === type && predicate(m)) {
        clearTimeout(timer)
        ws.removeEventListener('message', receive)
        resolve(m)
      }
    }
    ws.addEventListener('message', receive)
  })
try {
  await mf.ready
  const db = await mf.getD1Database('ACCOUNTS_DB')
  for (const file of ['0001_accounts.sql', '0002_research_boards.sql'])
    await db.exec(
      readFileSync(
        new URL('../services/accounts/migrations/' + file, import.meta.url),
        'utf8'
      ).replaceAll('\n', ' ')
    )
  await db
    .prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)')
    .bind('seed', Math.floor(Date.now() / 1000) + 3600)
    .run()
  for (let i = 0; i < 3; i++) {
    await db
      .prepare(
        'INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)'
      )
      .bind(`u${i}`, `user${i}`, 'unused', 'seed', Date.now())
      .run()
    await db
      .prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)')
      .bind(hash(tokens[i]), `u${i}`, Math.floor(Date.now() / 1000) + 3600)
      .run()
  }
  await db
    .prepare('UPDATE research_public_ids SET public_id=? WHERE user_id=?')
    .bind('0000000007', 'u2')
    .run()
  const people = await Promise.all(tokens.map((_, i) => ok(call(i, '/me'))))
  assert.match(people[0].user.publicId, /^\d{10}$/)
  assert.equal(people[2].user.publicId, '0000000007')
  const raced = await Promise.all(
    Array.from({ length: 5 }, () => ok(call(0, '/me')))
  )
  assert.equal(new Set(raced.map((x) => x.user.publicId)).size, 1)
  assert.equal(
    (await call(0, '/users/lookup', { publicId: '9999999999' })).status,
    404
  )
  // Separate board/owner keeps terminal invitation checks independent of later roles.
  const terminalBoard = await ok(call(2, '/boards', {
    operationId: 'terminal-invites', title: '邀请终态', sourceRevision: 'terminal',
    capturedAt: new Date().toISOString(), snapshot: { canvas: { files: [], artifacts: [] }, history: [] }
  }))
  const terminalInvite = async (i, suffix) => (await ok(call(2, `/boards/${terminalBoard.board.boardId}/commands`, {
    action: 'invite', operationId: 'terminal-' + suffix, epoch: terminalBoard.board.sharingEpoch,
    publicId: people[i].user.publicId, role: 'viewer'
  }))).invitation
  const declined = await terminalInvite(0, 'decline')
  assert.equal((await ok(call(0, `/invitations/${declined.invitationId}/respond`, {
    operationId: 'decline-final', version: declined.version, decision: 'decline'
  }))).invitation.status, 'declined')
  const staleDecline = await call(0, `/invitations/${declined.invitationId}/respond`, {
    operationId: 'accept-declined', version: declined.version, decision: 'accept'
  })
  assert.equal(staleDecline.status, 409)
  assert.equal((await staleDecline.json()).error.details.invitation.status, 'declined')
  const expired = await terminalInvite(1, 'expire')
  await db.prepare('UPDATE board_invitations SET expires_at=? WHERE id=?').bind(Date.now() - 1, expired.invitationId).run()
  const staleExpired = await call(1, `/invitations/${expired.invitationId}/respond`, {
    operationId: 'accept-expired', version: expired.version, decision: 'accept'
  })
  assert.equal(staleExpired.status, 409)
  assert.equal((await staleExpired.json()).error.details.invitation.status, 'expired')
  assert.equal((await call(0, `/boards/${terminalBoard.board.boardId}`)).status, 403)
  assert.equal((await call(1, `/boards/${terminalBoard.board.boardId}`)).status, 403)
  console.log('PASS: declined/expired invitations remain terminal and never grant membership')
  const input = {
    operationId: 'create-1',
    title: '黄金 · 协作',
    sourceRevision: 'rev1',
    capturedAt: new Date().toISOString(),
    snapshot: { canvas: initial, history: [] }
  }
  const created = await ok(call(0, '/boards', input))
  boardId = created.board.boardId
  assert.equal((await ok(call(0, '/boards', input))).board.boardId, boardId)
  assert.equal((await call(1, `/boards/${boardId}`)).status, 403)
  const invite = await ok(
    command(0, 'invite', { publicId: people[1].user.publicId, role: 'editor' })
  )
  assert.equal(
    (
      await call(2, `/invitations/${invite.invitation.invitationId}/respond`, {
        operationId: 'bad',
        version: 1,
        decision: 'accept'
      })
    ).status,
    403
  )
  const ownerPending = await ok(call(0, `/boards/${boardId}`))
  assert.equal(
    ownerPending.pendingInvitations[0].invitationId,
    invite.invitation.invitationId
  )
  assert.equal(ownerPending.pendingInvitations[0].invitee.userId, 'u1')
  const accept = () =>
    ok(
      call(1, `/invitations/${invite.invitation.invitationId}/respond`, {
        operationId: `accept-${++seq}`,
        version: 1,
        decision: 'accept'
      })
    )
  assert.equal((await accept()).memberCount, 2)
  assert.equal((await accept()).memberCount, 2)
  const vi = await ok(
    command(0, 'invite', { publicId: people[2].user.publicId, role: 'viewer' })
  )
  await ok(
    call(2, `/invitations/${vi.invitation.invitationId}/respond`, {
      operationId: 'viewer-accept',
      version: 1,
      decision: 'accept'
    })
  )
  assert.equal((await command(2, 'message', { text: 'forbidden' })).status, 403)
  const owner = await connect(0),
    editor = await connect(1)
  await Promise.all([owner.welcome, editor.welcome])
  const twin = await connect(0)
  const twinWelcome = await twin.welcome
  assert.equal(twinWelcome.presence.filter((p) => p.userId === 'u0').length, 1)
  assert.equal(twinWelcome.presence.length, 2)
  twin.ws.close()
  assert.equal(
    (
      await mf.dispatchFetch('https://collab.local' + owner.ticket.url, {
        headers: { Upgrade: 'websocket' }
      })
    ).status,
    401
  )
  assert.deepEqual(
    (await ok(call(1, `/boards/${boardId}`))).pendingInvitations,
    []
  )
  const hint = {
    cursor: { x: 10, y: 20 },
    selectedIds: Array.from({ length: 100 }, (_, i) =>
      ('n' + i).padEnd(128, 'x')
    ),
    previews: [
      {
        collection: 'artifacts',
        nodeId: initial.artifacts[0].id,
        x: 120,
        y: 140,
        width: 400,
        height: 200
      }
    ]
  }
  while (Buffer.byteLength(JSON.stringify(hint)) > 8192) hint.selectedIds.pop()
  assert(Buffer.byteLength(JSON.stringify(hint)) > 8000)
  console.log(
    'PRESENCE_WORKERD_ACCEPTED_HINT_BYTES=' +
      Buffer.byteLength(JSON.stringify(hint))
  )
  const preview = next(owner.ws, 'presence', (m) =>
    m.presence.some((p) => p.userId === 'u1' && p.previews?.length)
  )
  editor.ws.send(JSON.stringify({ type: 'presence', ...hint }))
  assert.equal(
    (await preview).presence.find((p) => p.userId === 'u1').previews[0].x,
    120
  )
  const viewer = await connect(2)
  await viewer.welcome
  const forbiddenPreview = next(viewer.ws, 'error')
  viewer.ws.send(JSON.stringify({ type: 'presence', ...hint }))
  assert.equal((await forbiddenPreview).error.code, 'ACCESS_DENIED')
  viewer.ws.close()
  const oversized = next(editor.ws, 'error')
  editor.ws.send(
    JSON.stringify({
      type: 'presence',
      ...hint,
      selectedIds: Array(100).fill('x'.repeat(128))
    })
  )
  assert.equal((await oversized).error.code, 'PRESENCE_SIZE_LIMIT')
  const cleared = next(owner.ws, 'presence', (m) =>
    m.presence.some((p) => p.userId === 'u1' && !p.previews?.length)
  )
  editor.ws.send(
    JSON.stringify({
      type: 'presence',
      cursor: null,
      selectedIds: [],
      previews: []
    })
  )
  await cleared
  const state = await ok(call(1, `/boards/${boardId}`))
  const doc = decodeDocument(fromBase64(state.documentUpdate))
  const canvas = structuredClone(initial)
  canvas.artifacts[0].title = '共同结论'
  const update = applyCanvasDiff(doc, initial, canvas)
  const ack = next(editor.ws, 'ack'),
    changed = next(owner.ws, 'boardChanged')
  editor.ws.send(
    JSON.stringify({
      type: 'command',
      requestId: 'edit',
      command: {
        action: 'update',
        operationId: 'ws-edit',
        epoch,
        update: toBase64(update)
      }
    })
  )
  assert.equal((await ack).requestId, 'edit')
  const edited = await changed
  assert.equal(edited.snapshot.canvas.artifacts[0].title, '共同结论')
  assert.ok(edited.board.updatedAt > state.board.updatedAt)
  assert.deepEqual(edited.board.updatedBy, { userId: 'u1', username: 'user1' })
  const listed = await ok(call(0, '/boards'))
  assert.equal(listed.boards.find(b => b.boardId === boardId).updatedAt, edited.board.updatedAt)
  assert.equal(state.board.updatedBy.userId, 'u0', 'presence/invitations must not count as editing')
  // Two real accounts share a serialized queue; future messages never enter the active context.
  const qa = await ok(command(0, 'message', { text: 'A current' }))
  const ta = await ok(command(0, 'taskCreate', { requestMessageId: qa.message.id, conversation: true }))
  const qb = await ok(command(1, 'message', { text: 'B queued' }))
  const tb = await ok(command(1, 'taskCreate', { requestMessageId: qb.message.id, conversation: true }))
  const qc = await ok(command(0, 'message', { text: 'independent canvas generation' }))
  const tc = await ok(command(0, 'taskCreate', { requestMessageId: qc.message.id, targetId: 'a' }))
  const ca = await ok(command(0, 'taskClaim', { taskId: ta.task.taskId, executorId: 'main-A' }))
  const cc = await ok(command(0, 'taskClaim', { taskId: tc.task.taskId, executorId: 'component-A' }))
  assert.equal(cc.task.conversation, false)
  await ok(command(1, 'queuePromote', { taskId: tb.task.taskId }))
  const independent = await ok(call(0, `/boards/${boardId}`))
  assert.equal(independent.tasks.find(t => t.taskId === ta.task.taskId).yieldRequested, true)
  assert.ok(!independent.tasks.find(t => t.taskId === ta.task.taskId).stopRequested)
  assert.ok(!independent.tasks.find(t => t.taskId === tc.task.taskId).stopRequested)
  assert.equal(ca.task.contextSnapshot.messages.some(m => m.id === qb.message.id), false)
  assert.equal((await command(1, 'taskClaim', { taskId: tb.task.taskId, executorId: 'main-B' })).status, 409)
  assert.equal((await command(0, 'queueEdit', { taskId: tb.task.taskId, text: 'not mine' })).status, 409)
  await ok(command(1, 'queueEdit', { taskId: tb.task.taskId, text: 'B edited' }))
  const shared = await ok(call(0, `/boards/${boardId}`))
  assert.equal(shared.messages.find(m => m.id === qb.message.id).text, 'B edited')
  await ok(command(0, 'taskResult', { taskId: ta.task.taskId, leaseToken: ca.leaseToken, text: 'A completed' }))
  const cb = await ok(command(1, 'taskClaim', { taskId: tb.task.taskId, executorId: 'main-B' }))
  assert.equal(cb.task.contextSnapshot.messages.at(-1).text, 'B edited')
  assert.ok(cb.task.contextSnapshot.messages.some(m => m.text === 'A completed'))
  assert.equal((await command(1, 'queueDelete', { taskId: tb.task.taskId })).status, 409)
  await ok(command(1, 'taskResult', { taskId: tb.task.taskId, leaseToken: cb.leaseToken, text: 'B completed' }))
  const pausedMessage = await ok(command(0, 'message', { text: 'resume me after priority work' }))
  const pausedTask = await ok(command(0, 'taskCreate', { requestMessageId: pausedMessage.message.id }))
  const pausedClaim = await ok(command(0, 'taskClaim', { taskId: pausedTask.task.taskId, executorId: 'main-A-2' }))
  const priorityMessage = await ok(command(1, 'message', { text: 'priority work' }))
  const priorityTask = await ok(command(1, 'taskCreate', { requestMessageId: priorityMessage.message.id }))
  await ok(command(1, 'queuePromote', { taskId: priorityTask.task.taskId }))
  assert.equal((await command(1, 'taskClaim', { taskId: priorityTask.task.taskId, executorId: 'main-B-2' })).status, 409)
  assert.equal((await command(0, 'taskYield', { taskId: pausedTask.task.taskId, leaseToken: 'wrong', executorStopped: true })).status, 409)
  const checkpointRow = await db.prepare('SELECT state FROM research_boards WHERE id=?').bind(boardId).first()
  const checkpointState = JSON.parse(checkpointRow.state)
  checkpointState.tasks.find(t => t.taskId === pausedTask.task.taskId).leaseExpiresAt = Date.now() - 1
  await db.prepare('UPDATE research_boards SET state=? WHERE id=?').bind(JSON.stringify(checkpointState), boardId).run()
  assert.equal((await command(1, 'taskClaim', { taskId: priorityTask.task.taskId, executorId: 'still-blocked' })).status, 409)
  assert.equal((await command(0, 'taskYield', { taskId: pausedTask.task.taskId, executorId: 'wrong', executorStopped: true })).status, 409)
  const yielded = await ok(command(0, 'taskYield', { taskId: pausedTask.task.taskId, executorId: 'main-A-2', executorStopped: true }))
  assert.equal(yielded.task.status, 'pending')
  assert.equal(yielded.task.resumeCount, 1)
  assert.equal((await command(0, 'taskClaim', { taskId: pausedTask.task.taskId, executorId: 'too-early' })).status, 409)
  const priorityClaim = await ok(command(1, 'taskClaim', { taskId: priorityTask.task.taskId, executorId: 'main-B-2' }))
  await ok(command(1, 'taskResult', { taskId: priorityTask.task.taskId, leaseToken: priorityClaim.leaseToken, text: 'priority completed' }))
  const resumed = await ok(command(0, 'taskClaim', { taskId: pausedTask.task.taskId, executorId: 'main-A-resumed' }))
  assert.equal(resumed.task.resumeCount, 1)
  assert.ok(resumed.task.contextSnapshot.messages.some(m => m.text === 'priority completed'))
  assert.equal((await command(0, 'taskResult', { taskId: pausedTask.task.taskId, leaseToken: pausedClaim.leaseToken, text: 'stale' })).status, 409)
  await ok(command(0, 'taskResult', { taskId: pausedTask.task.taskId, leaseToken: resumed.leaseToken, text: 'original continued' }))
  console.log('PASS: priority request waits for checkpoint release, then original resumes with new lease and fresh context')
  await ok(command(0, 'taskResult', { taskId: tc.task.taskId, leaseToken: cc.leaseToken, text: 'component completed independently' }))
  console.log('PASS: component claims alongside main, main claims with pending/running component, promotion leaves component running')
  console.log('PASS: shared main-agent queue, cross-user authority and fresh context')
  const message = await ok(command(1, 'message', { text: '继续研究' }))
  const task = await ok(
    command(1, 'taskCreate', {
      requestMessageId: message.message.id,
      targetId: 'a'
    })
  )
  assert.equal(
    (
      await command(0, 'taskClaim', {
        taskId: task.task.taskId,
        executorId: 'other'
      })
    ).status,
    403
  )
  const beforeLease = (await ok(call(1, `/boards/${boardId}`))).board.updatedAt
  const claim = await ok(
    command(1, 'taskClaim', { taskId: task.task.taskId, executorId: 'device' })
  )
  await ok(command(1, 'taskHeartbeat', {taskId:task.task.taskId,leaseToken:claim.leaseToken}))
  assert.equal((await ok(call(0, `/boards/${boardId}`))).board.updatedAt, beforeLease, 'lease traffic must preserve edit time')
  assert.equal(
    (
      await command(1, 'taskResult', {
        taskId: task.task.taskId,
        leaseToken: 'wrong',
        text: 'bad'
      })
    ).status,
    409
  )
  console.log(
    'PASS: identity, invitations, roles, real WS updates and task claim'
  )
  const otherSession = '4'.repeat(64)
  await db
    .prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(hash(otherSession), 'u1', Math.floor(Date.now() / 1000) + 3600)
    .run()
  const stolenClaim = await mf.dispatchFetch(
    `https://collab.local/v1/collaboration/boards/${boardId}/commands`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${otherSession}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        action: 'taskClaim',
        operationId: claim.operationId,
        epoch,
        taskId: task.task.taskId,
        executorId: 'device'
      })
    }
  )
  assert.equal(
    stolenClaim.status,
    409,
    'claim receipt must remain bound to the original live executor session'
  )
  const disguisedClaim = await mf.dispatchFetch(
    `https://collab.local/v1/collaboration/boards/${boardId}/commands`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${otherSession}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        action: 'message',
        operationId: claim.operationId,
        epoch,
        text: 'reuse'
      })
    }
  )
  assert.equal(disguisedClaim.status, 409)
  assert.equal(
    (
      await call(1, `/boards/${boardId}/commands`, {
        action: 'taskClaim',
        operationId: claim.operationId,
        epoch,
        taskId: task.task.taskId,
        executorId: 'other-device'
      })
    ).status,
    409
  )
  const makeTask = async (targetId) => {
    const m = await ok(command(1, 'message', { text: '生成可保存结果' }))
    const t = await ok(
      command(1, 'taskCreate', { requestMessageId: m.message.id, targetId })
    )
    return {
      task: t.task,
      ...(await ok(
        command(1, 'taskClaim', {
          taskId: t.task.taskId,
          executorId: 'result-device'
        })
      ))
    }
  }
  const completedTask = await makeTask('a')
  const completed = await ok(
    command(1, 'taskResult', {
      taskId: completedTask.task.taskId,
      leaseToken: completedTask.leaseToken,
      node: { ...canvas.artifacts[0], excerpt: '任务成果' },
      text: '已完成'
    })
  )
  assert.equal(completed.task.resultState, 'applied')
  const movedTask = await makeTask('a')
  const movedBase = await ok(call(1, `/boards/${boardId}`))
  const movedCanvas = structuredClone(movedBase.snapshot.canvas)
  Object.assign(movedCanvas.artifacts[0], { x: 870, y: 920, width: 640, height: 540, stackOrder: 38, sizeMode: 'manual', generationStatus: 'running', generationError: '旧状态', refreshMinutes: 15 })
  await ok(command(1, 'update', { update: toBase64(applyCanvasDiff(decodeDocument(fromBase64(movedBase.documentUpdate)), movedBase.snapshot.canvas, movedCanvas)) }))
  const movedResult = await ok(command(1, 'taskResult', {
    taskId: movedTask.task.taskId, leaseToken: movedTask.leaseToken,
    node: { ...movedBase.snapshot.canvas.artifacts[0], excerpt: '拖动后仍显示生成结果', generationStatus: 'completed' }
  }))
  assert.equal(movedResult.task.resultState, 'applied', 'layout/progress changes are not content conflicts')
  const movedNode = (await ok(call(1, `/boards/${boardId}`))).snapshot.canvas.artifacts[0]
  assert.equal(movedNode.excerpt, '拖动后仍显示生成结果')
  for (const key of ['x', 'y', 'width', 'height', 'stackOrder', 'sizeMode', 'refreshMinutes']) assert.equal(movedNode[key], movedCanvas.artifacts[0][key], `preserve latest ${key}`)
  assert.equal(movedNode.generationStatus, 'completed')
  assert.equal(movedNode.generationError, undefined)
  const conflictTask = await makeTask('a')
  let latest = await ok(call(1, `/boards/${boardId}`))
  let change = structuredClone(latest.snapshot.canvas)
  change.artifacts[0].excerpt = '人工修订'
  let delta = applyCanvasDiff(
    decodeDocument(fromBase64(latest.documentUpdate)),
    latest.snapshot.canvas,
    change
  )
  await ok(command(1, 'update', { update: toBase64(delta) }))
  const conflict = await ok(
    command(1, 'taskResult', {
      taskId: conflictTask.task.taskId,
      leaseToken: conflictTask.leaseToken,
      node: { ...change.artifacts[0], excerpt: '迟到AI结果' }
    })
  )
  assert.equal(conflict.task.resultState, 'pendingResult')
  assert.equal(
    (await ok(call(1, `/boards/${boardId}`))).snapshot.canvas.artifacts[0]
      .excerpt,
    '人工修订'
  )
  latest = await ok(call(1, `/boards/${boardId}`))
  change = structuredClone(latest.snapshot.canvas)
  change.artifacts.push({ ...initial.artifacts[0], id: 'delete-me' })
  delta = applyCanvasDiff(
    decodeDocument(fromBase64(latest.documentUpdate)),
    latest.snapshot.canvas,
    change
  )
  await ok(command(1, 'update', { update: toBase64(delta) }))
  const deletedTask = await makeTask('delete-me')
  const offline = await ok(call(1, `/boards/${boardId}`))
  change = structuredClone(offline.snapshot.canvas)
  change.artifacts = change.artifacts.filter((n) => n.id !== 'delete-me')
  delta = applyCanvasDiff(
    decodeDocument(fromBase64(offline.documentUpdate)),
    offline.snapshot.canvas,
    change
  )
  await ok(command(1, 'update', { update: toBase64(delta) }))
  const deleted = await ok(
    command(1, 'taskResult', {
      taskId: deletedTask.task.taskId,
      leaseToken: deletedTask.leaseToken,
      node: { ...initial.artifacts[0], id: 'delete-me' }
    })
  )
  assert.equal(deleted.task.resultState, 'targetDeleted')
  const late = structuredClone(offline.snapshot.canvas)
  late.artifacts.find((n) => n.id === 'delete-me').title = '不应复活'
  delta = applyCanvasDiff(
    decodeDocument(fromBase64(offline.documentUpdate)),
    offline.snapshot.canvas,
    late
  )
  await ok(command(1, 'update', { update: toBase64(delta) }))
  assert.equal(
    (await ok(call(1, `/boards/${boardId}`))).snapshot.canvas.artifacts.some(
      (n) => n.id === 'delete-me'
    ),
    false
  )
  console.log(
    'PASS: task result apply/conflict/deletion and offline tombstone enforcement'
  )
  const failedGeneration = await makeTask('a')
  assert.equal((await command(0, 'taskStop', { taskId: failedGeneration.task.taskId, failureCode: 'EMPTY_OUTPUT' })).status, 403, 'only the initiating member reports a generation failure')
  assert.equal((await command(1, 'taskStop', { taskId: failedGeneration.task.taskId, failureCode: 'untrusted raw error /Users/private/token' })).status, 400)
  const failedTask = await ok(command(1, 'taskStop', { taskId: failedGeneration.task.taskId, failureCode: 'EMPTY_OUTPUT' }))
  assert.equal(failedTask.task.status, 'failed')
  assert.equal(failedTask.task.failureCode, 'EMPTY_OUTPUT')
  const peerFailure = (await ok(call(0, `/boards/${boardId}`))).tasks.find(t => t.taskId === failedGeneration.task.taskId)
  assert.equal(peerFailure.failureCode, 'EMPTY_OUTPUT')
  assert.equal(peerFailure.leaseHash, undefined)
  console.log('PASS: typed generation failure reaches peers without private diagnostics')
  const leaseRow = await db
    .prepare('SELECT state FROM research_boards WHERE id=?')
    .bind(boardId)
    .first()
  const leaseState = JSON.parse(leaseRow.state)
  leaseState.tasks.find((t) => t.taskId === task.task.taskId).leaseExpiresAt =
    Date.now() - 1
  await db
    .prepare('UPDATE research_boards SET state=? WHERE id=?')
    .bind(JSON.stringify(leaseState), boardId)
    .run()
  assert.equal(
    (
      await command(1, 'taskHeartbeat', {
        taskId: task.task.taskId,
        leaseToken: claim.leaseToken
      })
    ).status,
    409
  )
  const assetResponse = await mf.dispatchFetch(
    `https://collab.local/v1/collaboration/boards/${boardId}/assets`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokens[1]}`,
        'X-Operation-Id': 'asset1',
        'X-Sharing-Epoch': String(epoch),
        'X-Asset-Name': encodeURIComponent('研究资料.pdf'),
        'X-Asset-Size': '15',
        'content-type': 'text/plain'
      },
      body: 'private-content'
    }
  )
  const asset = await ok(Promise.resolve(assetResponse))
  assert.equal(
    (await call(2, `/boards/${boardId}/assets/${asset.asset.assetId}`)).status,
    200
  )
  console.log('PASS: private R2 asset upload and viewer read')
  const notice = await ok(call(1, '/notifications'))
  assert.ok(notice.notifications.length)
  await ok(call(1, '/notifications/read', {}))
  const nc = await connect(1, 'notifications')
  assert.ok((await nc.welcome).notifications.length)
  console.log('PASS: notification reconnect')
  const revoked = next(editor.ws, 'accessRevoked')
  const cancelOperation = {
    action: 'cancel',
    operationId: 'cancel-stable',
    epoch
  }
  const cancelled = await ok(
    call(0, `/boards/${boardId}/commands`, cancelOperation)
  )
  assert.equal(
    (await ok(call(0, `/boards/${boardId}/commands`, cancelOperation))).seq,
    cancelled.seq
  )
  assert.equal(cancelled.board.sharingState, 'ownerOnly')
  epoch = cancelled.board.sharingEpoch
  await revoked
  assert.equal((await call(1, `/boards/${boardId}`)).status, 403)
  assert.equal((await command(1, 'message', { text: 'late' })).status, 403)
  assert.equal(
    (await call(1, `/boards/${boardId}/assets/${asset.asset.assetId}`)).status,
    403
  )
  assert.equal(
    (await ok(call(0, `/boards/${boardId}`))).snapshot.canvas.artifacts[0]
      .title,
    '共同结论'
  )
  assert.equal(
    (await ok(call(1, `/boards/${boardId}/receipts/ws-edit`))).accepted,
    true
  )
  const reopened = await ok(command(0, 'reopen'))
  epoch = reopened.board.sharingEpoch
  const reinvite = await ok(
    command(0, 'invite', { publicId: people[1].user.publicId, role: 'editor' })
  )
  await ok(
    call(1, `/invitations/${reinvite.invitation.invitationId}/respond`, {
      operationId: 'rejoin',
      version: 1,
      decision: 'accept'
    })
  )
  assert.equal(
    (await command(1, 'update', { epoch: 1, update: toBase64(update) })).status,
    409
  )
  assert.equal(
    (
      await command(1, 'taskResult', {
        taskId: task.task.taskId,
        leaseToken: claim.leaseToken,
        text: 'late'
      })
    ).status,
    409
  )
  await ok(command(0, 'archive'))
  assert.equal((await call(1, `/boards/${boardId}`)).status, 200)
  assert.equal((await command(1, 'message', { text: 'archived' })).status, 409)
  await ok(command(0, 'restore'))
  assert.equal(
    (await command(1, 'message', { text: 'x'.repeat(17000) })).status,
    413
  )

  await ok(command(0, 'refreshPause', { paused: true }))
  const refreshMessage = await ok(
    command(1, 'message', { text: '刷新共享组件' })
  )
  assert.equal(
    (
      await command(1, 'taskCreate', {
        requestMessageId: refreshMessage.message.id,
        targetId: 'a',
        source: 'refresh'
      })
    ).status,
    409
  )
  await ok(command(0, 'refreshPause', { paused: false }))
  await ok(
    command(1, 'taskCreate', {
      requestMessageId: refreshMessage.message.id,
      targetId: 'a',
      source: 'refresh'
    })
  )
  assert.equal(
    (
      await command(1, 'taskCreate', {
        requestMessageId: refreshMessage.message.id,
        targetId: 'a',
        source: 'refresh'
      })
    ).status,
    409
  )
  const staging = await ok(call(0, '/uploads', { operationId: 'stage-create' }))
  const badName = await mf.dispatchFetch(
    `https://collab.local/v1/collaboration/uploads/${staging.uploadId}/assets/bad-name`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tokens[0]}`,
        'X-Asset-Name': encodeURIComponent('/Users/private/report.pdf'),
        'X-Asset-Size': '1',
        'content-type': 'application/pdf'
      },
      body: 'x'
    }
  )
  assert.equal(badName.status, 400)
  const stagedId = 'portable-file'
  const content = '网页已保存正文'
  const contentBytes = Buffer.from(content)
  const stageResponse = await mf.dispatchFetch(
    `https://collab.local/v1/collaboration/uploads/${staging.uploadId}/assets/${stagedId}`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tokens[0]}`,
        'X-Asset-Name': encodeURIComponent('研究资料.pdf'),
        'X-Asset-Size': String(contentBytes.length),
        'content-type': 'application/pdf'
      },
      body: contentBytes
    }
  )
  await ok(Promise.resolve(stageResponse))
  const concurrentId = 'concurrent-asset'
  const concurrent = await Promise.all(
    ['A', 'B'].map((value) =>
      mf.dispatchFetch(
        `https://collab.local/v1/collaboration/uploads/${staging.uploadId}/assets/${concurrentId}`,
        {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${tokens[0]}`,
            'X-Asset-Name': 'concurrent.txt',
            'X-Asset-Size': '1',
            'content-type': 'text/plain'
          },
          body: value
        }
      )
    )
  )
  assert.deepEqual(
    concurrent.map((r) => r.status).sort(),
    [200, 409],
    'same asset ID must remain immutable under concurrent uploads'
  )
  const exclusiveUpload = await ok(
    call(0, '/uploads', { operationId: 'exclusive-activation-upload' })
  )
  await ok(
    mf.dispatchFetch(
      `https://collab.local/v1/collaboration/uploads/${exclusiveUpload.uploadId}/assets/exclusive-file`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokens[0]}`,
          'X-Asset-Name': 'exclusive.txt',
          'X-Asset-Size': '9',
          'content-type': 'text/plain'
        },
        body: 'exclusive'
      }
    )
  )
  const exclusiveInput = {
    title: 'Exclusive activation',
    sourceRevision: 'exclusive-revision',
    capturedAt: new Date().toISOString(),
    uploadId: exclusiveUpload.uploadId,
    snapshot: {
      canvas: {
        files: [
          {
            id: 'activation-race-file',
            assetId: 'exclusive-file',
            name: 'exclusive.txt',
            source: 'computer',
            x: 0,
            y: 0
          }
        ],
        artifacts: []
      }
    }
  }
  const activations = await Promise.all(
    ['activate-a', 'activate-b'].map((operationId) =>
      call(0, '/boards', { ...exclusiveInput, operationId })
    )
  )
  assert.deepEqual(
    activations.map((r) => r.status).sort(),
    [200, 409],
    'two board DOs must not both claim one validated staging upload'
  )
  const winner = await activations.find((r) => r.status === 200).json()
  assert.equal(
    await (
      await call(0, `/boards/${winner.board.boardId}/assets/exclusive-file`)
    ).text(),
    'exclusive'
  )
  const exclusiveOwner = await db
    .prepare('SELECT board_id FROM research_uploads WHERE id=?')
    .bind(exclusiveUpload.uploadId)
    .first()
  assert.equal(exclusiveOwner.board_id, winner.board.boardId)
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM research_boards WHERE create_operation IN ('activate-a','activate-b')"
        )
        .first()
    ).n,
    1
  )
  const exclusiveAsset = await db
    .prepare('SELECT board_id FROM research_assets WHERE upload_id=?')
    .bind(exclusiveUpload.uploadId)
    .first()
  assert.equal(exclusiveAsset.board_id, winner.board.boardId)
  console.log(
    'PASS: deterministic two-room staging activation has one winner and preserves winner assets'
  )
  const cleanupUpload = await ok(
    call(0, '/uploads', { operationId: 'cleanup-versus-activation' })
  )
  await ok(
    mf.dispatchFetch(
      `https://collab.local/v1/collaboration/uploads/${cleanupUpload.uploadId}/assets/cleanup-file`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokens[0]}`,
          'X-Asset-Name': 'cleanup.txt',
          'X-Asset-Size': '1',
          'content-type': 'text/plain'
        },
        body: 'x'
      }
    )
  )
  const delayedCreation = call(0, '/boards', {
    ...exclusiveInput,
    operationId: 'activation-loses-to-cleanup',
    uploadId: cleanupUpload.uploadId,
    snapshot: {
      canvas: {
        files: [
          {
            id: 'activation-cleanup-race-file',
            assetId: 'cleanup-file',
            name: 'cleanup.txt',
            source: 'computer',
            x: 0,
            y: 0
          }
        ],
        artifacts: []
      }
    }
  })
  const barriers = await mf.getDurableObjectNamespace('ACTIVATION_BARRIER'),
    cleanupBarrier = barriers.get(barriers.idFromName(cleanupUpload.uploadId))
  await cleanupBarrier.fetch('https://test.internal/await-first')
  await db
    .prepare('UPDATE research_uploads SET expires_at=0 WHERE id=?')
    .bind(cleanupUpload.uploadId)
    .run()
  await cleanup({
    ACCOUNTS_DB: db,
    RESEARCH_ASSETS: await mf.getR2Bucket('RESEARCH_ASSETS'),
    RESEARCH_NOTIFICATIONS: await mf.getDurableObjectNamespace(
      'RESEARCH_NOTIFICATIONS'
    )
  })
  await cleanupBarrier.fetch('https://test.internal/release')
  assert.equal((await delayedCreation).status, 409)
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM research_boards WHERE create_operation='activation-loses-to-cleanup'"
        )
        .first()
    ).n,
    0
  )
  assert.equal(
    await (
      await call(0, `/boards/${winner.board.boardId}/assets/exclusive-file`)
    ).text(),
    'exclusive'
  )
  console.log(
    'PASS: cleanup claims defeat stale validated activation without touching active winner assets'
  )

  const stagingInput = {
    operationId: 'stage-board',
    title: '材料副本',
    capturedAt: new Date().toISOString(),
    sourceRevision: 'rev2',
    uploadId: staging.uploadId,
    snapshot: {
      canvas: {
        files: [
          {
            id: 'file',
            name: '研究资料.pdf',
            source: 'computer',
            assetId: stagedId,
            x: 0,
            y: 0
          }
        ],
        artifacts: []
      }
    }
  }
  const stagedBoard = await ok(call(0, '/boards', stagingInput))
  const stagedRead = await call(
    0,
    `/boards/${stagedBoard.board.boardId}/assets/${stagedId}`
  )
  assert.equal(await stagedRead.text(), content)
  assert.match(stagedRead.headers.get('content-disposition'), /%E7%A0%94/)
  // Transaction abort must not leave an accepted invitation or member behind.
  const atomicInvite = await ok(
    command(0, 'invite', { publicId: people[2].user.publicId, role: 'editor' })
  )
  await db.exec(
    "CREATE TRIGGER fail_notification BEFORE INSERT ON research_notifications BEGIN SELECT RAISE(ABORT,'synthetic transaction failure'); END;"
  )
  assert.equal(
    (
      await call(
        2,
        `/invitations/${atomicInvite.invitation.invitationId}/respond`,
        { operationId: 'atomic-accept', version: 1, decision: 'accept' }
      )
    ).status,
    503
  )
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM board_invitations WHERE id=?')
        .bind(atomicInvite.invitation.invitationId)
        .first()
    ).status,
    'pending'
  )
  assert.equal((await call(2, `/boards/${boardId}`)).status, 403)
  await db.exec('DROP TRIGGER fail_notification;')
  const revisedInvite = await ok(
    command(0, 'invite', { publicId: people[2].user.publicId, role: 'viewer' })
  )
  assert.equal(revisedInvite.invitation.version, 2)
  assert.equal(
    (
      await call(
        2,
        `/invitations/${atomicInvite.invitation.invitationId}/respond`,
        { operationId: 'outdated-version', version: 1, decision: 'accept' }
      )
    ).status,
    409
  )
  const pendingBefore = await ok(call(2, '/notifications'))
  await ok(call(2, '/notifications/read', {}))
  const pendingAfter = await ok(
    call(2, `/notifications?after=${pendingBefore.cursor}`)
  )
  assert.equal(pendingAfter.unreadCount, 0)
  assert.ok(pendingAfter.pendingCount > 0)
  assert.ok(
    pendingAfter.notifications.some((n) => n.invitation?.status === 'pending')
  )
  let paginationCursor = 0
  let previous = -1
  let pageCount = 0
  while (paginationCursor < pendingBefore.cursor && pageCount++ < 50) {
    const page = await ok(
      call(2, `/notifications?after=${paginationCursor}&limit=1`)
    )
    assert.ok(
      page.cursor > previous,
      'pending invites must not stall chronological cursor'
    )
    previous = paginationCursor
    paginationCursor = page.cursor
  }
  assert.equal(paginationCursor, pendingBefore.cursor)
  const preRaceEpoch = epoch
  const race = await Promise.all([
    call(2, `/invitations/${atomicInvite.invitation.invitationId}/respond`, {
      operationId: 'race-accept',
      version: revisedInvite.invitation.version,
      decision: 'accept'
    }),
    command(0, 'cancel')
  ])
  assert.ok([200, 409].includes(race[0].status))
  assert.equal(race[1].status, 200)
  epoch = (await race[1].json()).board.sharingEpoch
  assert.equal(epoch, preRaceEpoch + 1)
  if (race[0].status === 409)
    assert.equal(
      (await race[0].clone().json()).error.code,
      'INVITATION_UNAVAILABLE'
    )
  assert.deepEqual(
    (
      await db
        .prepare(
          "SELECT user_id FROM board_members WHERE board_id=? AND status='active'"
        )
        .bind(boardId)
        .all()
    ).results.map((r) => r.user_id),
    ['u0']
  )
  assert.equal((await call(2, `/boards/${boardId}`)).status, 403)
  const hugeCanvas = {
    files: [],
    artifacts: [{ ...initial.artifacts[0], excerpt: 'x'.repeat(500000) }]
  }
  const hugeHistory = Array.from({ length: 100 }, (_, i) => ({
    id: `m${i}`,
    role: 'user',
    text: 'y'.repeat(15000)
  }))
  const overState = await call(0, '/boards', {
    ...input,
    operationId: 'too-large-state',
    snapshot: { canvas: hugeCanvas, history: hugeHistory }
  })
  assert.equal(overState.status, 413)
  assert.equal(
    (
      await db
        .prepare(
          'SELECT COUNT(*) AS n FROM research_boards WHERE create_operation=?'
        )
        .bind('too-large-state')
        .first()
    ).n,
    0
  )
  assert.equal(
    (
      await call(0, '/boards', {
        ...input,
        operationId: 'too-many-nodes',
        snapshot: {
          canvas: {
            files: [],
            artifacts: Array.from({ length: 1001 }, (_, i) => ({
              ...initial.artifacts[0],
              id: `n${i}`
            }))
          }
        }
      })
    ).status,
    413
  )
  console.log(
    'PASS: D1 combined state rejected before activation, 1000-node limit'
  )
  // Durable restart: keep private temporary D1/DO/R2 roots, recreate workerd from scratch.
  await db
    .prepare(
      'UPDATE research_notification_outbox SET delivered_at=NULL WHERE recipient_id=?'
    )
    .bind('u0')
    .run()
  owner.ws.close()
  editor.ws.close()
  nc.ws.close()
  await mf.dispose()
  mf = new Miniflare(options)
  await mf.ready
  const restarted = await ok(call(0, `/boards/${boardId}`))
  assert.equal(restarted.snapshot.canvas.artifacts[0].title, '共同结论')
  assert.equal(
    (await ok(call(1, `/boards/${boardId}/receipts/ws-edit`))).accepted,
    true
  )
  assert.equal((await call(1, `/boards/${boardId}`)).status, 403)
  assert.equal(
    await (
      await call(0, `/boards/${stagedBoard.board.boardId}/assets/${stagedId}`)
    ).text(),
    content
  )
  const recoveredNotice = await connect(0, 'notifications')
  assert.ok((await recoveredNotice.welcome).notifications.length)
  recoveredNotice.ws.close()
  const restartedDb = await mf.getD1Database('ACCOUNTS_DB')
  assert.equal(
    (
      await restartedDb
        .prepare('SELECT status FROM board_invitations WHERE id=?')
        .bind(atomicInvite.invitation.invitationId)
        .first()
    ).status,
    race[0].status === 200 ? 'accepted' : 'cancelled'
  )
  console.log(
    'PASS: staging UTF-8 assets, atomic invitation rollback, cancel race, pending/read independence, fresh workerd durable restart'
  )
  const expiredUpload = await ok(
    call(0, '/uploads', { operationId: 'expired-staging' })
  )
  await ok(
    mf.dispatchFetch(
      `https://collab.local/v1/collaboration/uploads/${expiredUpload.uploadId}/assets/expired-file`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokens[0]}`,
          'X-Asset-Name': 'expired.txt',
          'X-Asset-Size': '1',
          'content-type': 'text/plain'
        },
        body: 'x'
      }
    )
  )
  const expiredAsset = await restartedDb
    .prepare('SELECT object_key FROM research_assets WHERE upload_id=?')
    .bind(expiredUpload.uploadId)
    .first()
  await restartedDb
    .prepare('UPDATE research_uploads SET expires_at=0 WHERE id=?')
    .bind(expiredUpload.uploadId)
    .run()
  await restartedDb
    .prepare(
      'UPDATE research_notifications SET created_at=0 WHERE invitation_id IS NULL'
    )
    .run()
  await cleanup({
    ACCOUNTS_DB: restartedDb,
    RESEARCH_ASSETS: await mf.getR2Bucket('RESEARCH_ASSETS'),
    RESEARCH_NOTIFICATIONS: await mf.getDurableObjectNamespace(
      'RESEARCH_NOTIFICATIONS'
    )
  })
  assert.equal(
    (
      await restartedDb
        .prepare(
          'SELECT COUNT(*) AS n FROM research_notifications WHERE created_at=0 AND invitation_id IS NULL'
        )
        .first()
    ).n,
    0
  )
  assert.equal(
    await (
      await mf.getR2Bucket('RESEARCH_ASSETS')
    ).head(expiredAsset.object_key),
    null
  )
  assert.equal(
    await (
      await call(0, `/boards/${stagedBoard.board.boardId}/assets/${stagedId}`)
    ).text(),
    content
  )
  console.log(
    'PASS: expired staging cleanup preserves active assets; processed notification retention'
  )
  const invalidatedChannel = await connect(1, 'notifications')
  await invalidatedChannel.welcome
  await restartedDb
    .prepare('DELETE FROM sessions WHERE user_id=?')
    .bind('u1')
    .run()
  assert.equal((await call(1, `/boards/${boardId}`)).status, 401)
  const invalidated = next(invalidatedChannel.ws, 'error')
  invalidatedChannel.ws.send(JSON.stringify({ type: 'ping' }))
  assert.equal((await invalidated).error.code, 'LOGIN_REQUIRED')
  invalidatedChannel.ws.close()
  console.log(
    'PASS: real D1/DO/R2/WebSocket copy, convergence, invitations, roles, cancellation, epoch, receipts, assets, task lease, notification recovery, sessions and limits'
  )
} finally {
  await mf.dispose()
  rmSync(persist, { recursive: true, force: true })
}
