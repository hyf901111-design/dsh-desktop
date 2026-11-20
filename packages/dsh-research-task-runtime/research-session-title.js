import { assertPrivateResearchSession } from './board-runtime.js'

export function registerResearchSessionTitles(ctx, { isTrustedRequest, readJsonBody }) {
  return ctx.webServer.register({
    kind: 'exact',
    path: '/sherlock/research/session-title',
    handler: async (req, res) => {
      const send = (status, body) => {
        if (res.destroyed) return
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      if (req.method !== 'POST' || !isTrustedRequest(req, true)) return send(403, { error: '请求已拒绝。' })
      try {
        const { sessionId, locale, components } = await readJsonBody(req)
        if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256 ||
            !['zh', 'en'].includes(locale) || !Array.isArray(components) || components.length > 6 ||
            components.some(title => typeof title !== 'string' || !title.trim() || title.length > 120)) {
          return send(400, { error: '看板标题参数无效。' })
        }
        await assertPrivateResearchSession(sessionId)
        const session = ctx.sessions.get(sessionId)
        if (!session || session.header?.origin === 'subagent') return send(404, { error: '看板会话不可用。' })
        const route = session.requestHeader()?.config ?? ctx.agentDefaultModel.currentSelection()
        const automatic = ctx.sessionTitle.updateResearchTitle(session, { locale, components }, route)
        if (automatic && await ctx.sessions.flush(session) !== true) throw Error('看板标题尚未保存。')
        send(200, { ok: true, automatic })
      } catch {
        send(503, { error: '看板标题暂未更新。' })
      }
    }
  })
}
