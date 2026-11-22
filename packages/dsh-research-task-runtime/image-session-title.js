const imageSession = /^image-task-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu
const placeholder = new Set(['新图像', 'New Image', 'New image'])
async function ownedTitle(sessionId, env = process.env) {
  const endpoint = env.SHERLOCK_RESEARCH_CONTEXT_URL
  if (!endpoint || !env.SHERLOCK_RESEARCH_CONTEXT_TOKEN) return
  const response = await fetch(endpoint + '/image-task-title', {
    method:'POST', redirect:'error', headers:{authorization:'Bearer '+env.SHERLOCK_RESEARCH_CONTEXT_TOKEN,'content-type':'application/json'},
    body:JSON.stringify({sessionId}), signal:AbortSignal.timeout(5000)
  })
  return response.ok ? response.json() : undefined
}

// Image task tabs are account-local. Bind only an initial name supported by
// the host's saved tab/canvas, before any human prompt or explicit rename.
export function registerImageSessionTitle(ctx, {isTrustedRequest,readJsonBody,readTitleEvidence=ownedTitle}) {
  return ctx.webServer.register({kind:'exact',path:'/sherlock/image-factory/session-title',handler:async(req,res)=>{
    const send=(code,body)=>{
      if (res.destroyed) return
      res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'})
      res.end(JSON.stringify(body))
    }
    if (req.method!=='POST' || !isTrustedRequest(req,true)) return send(403,{error:'请求已拒绝。'})
    try {
      const {sessionId,kind,title}=await readJsonBody(req)
      if (typeof sessionId!=='string' || !imageSession.test(sessionId) || typeof title!=='string' ||
          !title.trim() || title.length>255 || /[\p{Cc}]/u.test(title) || !['blank','template'].includes(kind) ||
          kind==='blank' && !placeholder.has(title)) return send(400,{error:'图像会话的标题参数无效。'})
      const session=ctx.sessions.get(sessionId)
      if (!session || session.header?.origin==='subagent' || session.header?.parentSession) return send(404,{error:'图像会话不可用。'})
      const evidence=await readTitleEvidence(sessionId)
      if (!evidence?.owned || kind==='template' && ![evidence.canvasTitle,evidence.tabTitle].includes(title)) return send(409,{error:'此账号的图像页签与标题尚未就绪。'})
      if (ctx.sessions.get(sessionId)!==session) return send(409,{error:'图像会话已切换。'})
      const current=session.events.findLast(event=>event.type==='session/title')?.data
      const hasOtherUse=session.events.some(event=>event.type==='user/message' && event.data?.source?.kind==='user' ||
        /^workspace-(?:research|spreadsheet|presentation|note|knowledge)\//u.test(event.type))
      const blank=current?.source?.kind==='fallback' && current.messageSeqs?.length===0 && placeholder.has(current.title)
      const automatic = !hasOtherUse && (!current || blank && kind === 'template')
      if (kind === 'template' && !session.events.some(event => event.type === 'workspace-image/edited')) {
        session.append('workspace-image/edited', {})
      }
      if (automatic) session.append('session/title',{title,messageSeqs:[],source:{kind:'fallback'}})
      // A retry may follow an append whose first flush failed, even after a manual rename.
      if (await ctx.sessions.flush(session)!==true) throw Error()
      return send(200,{ok:true,automatic})
    } catch { return send(503,{error:'图像会话标题暂未更新。'}) }
  }})
}
