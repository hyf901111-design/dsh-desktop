import { assertPrivateResearchSession } from './board-runtime.js'

export function imageHistoryMode(events) {
  let imageCall = false
  for (let i = events.length - 1; i >= 0; i--) {
    const {type, data} = events[i]
    if (type === 'user/message' && data?.source?.kind === 'user') {
      if (data.source.clientMode) return data.source.clientMode === 'image' ? 'image' : 'other'
      return imageCall ? 'legacy-image' : 'legacy'
    }
    if (type === 'tool/call' && data?.name === 'image_generate') imageCall = true
    if (type === 'workspace-research/title-context' || /^workspace-(?:note|spreadsheet|presentation)\/(?:created|edited|conversation)$/u.test(type)) return 'other'
  }
  return 'unused'
}

// Only the mode travels to the renderer. Even long model runs need no history transfer on a sidebar click.
export function registerImageHistoryMode(ctx, {isTrustedRequest, readJsonBody, checkPrivate = assertPrivateResearchSession}) {
  return ctx.webServer.register({kind:'exact', path:'/sherlock/image-factory/history-mode', handler:async(req,res)=>{
    const send = (code, body) => {
      if (res.destroyed) return
      res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'})
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST' || !isTrustedRequest(req,true)) return send(403,{error:'请求已拒绝。'})
    try {
      const {sessionId} = await readJsonBody(req)
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(sessionId)) return send(400,{error:'会话不可用。'})
      await checkPrivate(sessionId)
      const live = ctx.sessions.get(sessionId)
      const saved = live ? undefined : await ctx.sessionPersistence.readFrom(sessionId,0)
      const header = live?.header ?? saved?.meta
      if (!header || header.origin === 'subagent' || header.parentSession) return send(404,{error:'会话不可用。'})
      return send(200,{mode:imageHistoryMode(live?.events ?? saved.events)})
    } catch { return send(404,{error:'会话不可用。'}) }
  }})
}
