import {officeSessionOwner} from './office-session-owner.js'
const copiedEvent = 'workspace-knowledge/copied'
const copyTitleSuffix = '（副本）'

export function registerKnowledgeSessions(ctx, { isTrustedRequest, readJsonBody }) {
  return ctx.webServer.register({ kind: 'exact', path: '/sherlock/knowledge/session-copy', handler: async (req, res) => {
    const send = (status, value) => {
      if (res.destroyed) return
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    if (req.method !== 'POST' || !isTrustedRequest(req, true)) return send(403, { error: '请求已拒绝。' })
    try {
      const { sessionId, title, existing, imported, officeMode, officeOwner } = await readJsonBody(req)
      if (typeof sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/u.test(sessionId) ||
          typeof title !== 'string' || !title.trim() || title.length > 256 ||
          (imported !== true && !title.endsWith(copyTitleSuffix)) || (imported !== undefined && imported !== true) ||
          (existing !== undefined && typeof existing !== 'boolean')) {
        throw Error('副本会话参数无效。')
      }
      const session = ctx.sessions.get(sessionId)
      if (!session || session.header.origin === 'subagent' || session.header.parentSession) {
        throw Error('副本会话不可用。')
      }
      if (!session.events.some(event => event.type === copiedEvent)) {
        const currentTitle = ctx.sessionTitle.get(session)?.title
        if (existing ? currentTitle !== title : currentTitle !== undefined || session.events.some(event => event.type === 'turn/start')) {
          throw Error('副本会话已发生变化，请重试。')
        }
        if (!existing) ctx.sessionTitle.rename(session, title)
        const owner = officeSessionOwner(officeOwner)
        session.append(copiedEvent, owner.officeOwner && ['note','spreadsheet','presentation'].includes(officeMode) ? {officeMode, ...owner} : {})
      }
      if (await ctx.sessions.flush(session) !== true) throw Error('副本会话尚未保存，请重试。')
      return send(200, { ok: true })
    } catch (error) {
      return send(400, { error: error.message })
    }
  } })
}
