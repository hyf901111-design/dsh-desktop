export const NOTE_SESSION_EVENT = 'workspace-note/edited'

/** Native events retain note-only sessions and remember title ownership on replay. */
export function engageNoteSession(ctx, input) {
  if (typeof input?.sessionId !== 'string' || input.sessionId.length > 256 || typeof input.title !== 'string' || input.title.length > 1000) throw Error('笔记会话参数无效。')
  const session = ctx.sessions.get(input.sessionId)
  if (!session) throw Error('笔记会话不可用。')
  const titleEvent = session.events.findLast(e => e.type === 'session/title')
  const previous = session.events.findLast(e => e.type === NOTE_SESSION_EVENT)?.data
  let automatic = previous ? previous.automatic === true : !titleEvent?.data.title?.trim()
  if (previous && automatic && (titleEvent?.seq ?? -1) !== previous.lastAutoSeq) automatic = false
  let lastAutoSeq = previous?.lastAutoSeq ?? -1, lastAutoTitle = previous?.lastAutoTitle ?? ''
  // Publish participation before a title change; this is genuine note activity,
  // without manufacturing a conversation turn or an assistant message.
  if (!previous) session.append(NOTE_SESSION_EVENT, { automatic, lastAutoSeq, lastAutoTitle })
  const wanted = input.title.replace(/\s+/g, ' ').trim().slice(0, 120) || lastAutoTitle || '新笔记'
  if (automatic && titleEvent?.data.title !== wanted) {
    const accepted = ctx.sessionTitle.rename(session, wanted)
    lastAutoTitle = accepted.title
    lastAutoSeq = session.events.findLast(e => e.type === 'session/title').seq
  }
  const next = { automatic, lastAutoSeq, lastAutoTitle }
  if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) session.append(NOTE_SESSION_EVENT, next)
  return { ok: true, title: session.events.findLast(e => e.type === 'session/title')?.data.title || '', automatic }
}

export function registerNoteSessions(ctx, { isTrustedRequest, readJsonBody }) {
  return ctx.webServer.register({ kind: 'exact', path: '/sherlock/notes/session', handler: async (req, res) => {
    const send = (status, value) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) } }
    if (req.method !== 'POST' || !isTrustedRequest(req, true)) return send(403, { error: 'Request rejected' })
    try { send(200, engageNoteSession(ctx, await readJsonBody(req))) }
    catch (error) { send(503, { error: error.message || '笔记会话暂未保存，请重试。' }) }
  } })
}
