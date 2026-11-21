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

// A canvas with its own name may share a session with an ordinary chat.
// Manual names and image topics may follow the sidebar; a chat topic stays there.
function maySyncImageTabTitle(events, expected) {
  const current = events.findLast(event => event.type === 'session/title')?.data
  if (!current || current.title !== expected) return false
  if (current.source?.kind === 'user' || !current.messageSeqs?.length) return true
  const named = new Set(current.messageSeqs)
  return !events.some(event => named.has(event.seq) && (
    event.type.startsWith('workspace-') || event.type === 'user/message' && event.data?.source?.kind === 'user' &&
    event.data.source.clientMode && event.data.source.clientMode !== 'image'))
}

// The renderer receives only the requested metadata, even for a long model run.
export function registerImageHistoryMode(ctx, {isTrustedRequest, readJsonBody, checkPrivate = assertPrivateResearchSession}) {
  return ctx.webServer.register({kind:'exact', path:'/sherlock/image-factory/history-mode', handler:async(req,res)=>{
    const send = (code, body) => {
      if (res.destroyed) return
      res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'})
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST' || !isTrustedRequest(req,true)) return send(403,{error:'请求已拒绝。'})
    try {
      const {sessionId, expectedTitle} = await readJsonBody(req)
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(sessionId)) return send(400,{error:'会话不可用。'})
      await checkPrivate(sessionId)
      const live = ctx.sessions.get(sessionId)
      const saved = live ? undefined : await ctx.sessionPersistence.readFrom(sessionId,0)
      const header = live?.header ?? saved?.meta
      if (!header || header.origin === 'subagent' || header.parentSession) return send(404,{error:'会话不可用。'})
      const events = live?.events ?? saved.events
      if (typeof expectedTitle === 'string') return send(200,{syncTitle:maySyncImageTabTitle(events,expectedTitle)})
      return send(200,{mode:imageHistoryMode(events)})
    } catch { return send(404,{error:'会话不可用。'}) }
  }})
}
