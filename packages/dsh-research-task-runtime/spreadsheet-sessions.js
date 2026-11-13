export const SPREADSHEET_CREATED = 'workspace-spreadsheet/created'

export function registerSpreadsheetSessions(ctx, {isTrustedRequest, readJsonBody}) {
  return ctx.webServer.register({kind:'exact',path:'/sherlock/spreadsheet/session',handler:async(req,res)=>{
    const send=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}}
    if(req.method!=='POST'||!isTrustedRequest(req,true))return send(403,{error:'请求已拒绝。'})
    try {
      const input=await readJsonBody(req)
      if(typeof input?.sessionId!=='string'||!input.sessionId||input.sessionId.length>256||!['en','zh'].includes(input.locale))
        throw Error('表格会话参数无效。')
      const session=ctx.sessions.get(input.sessionId)
      if(!session||session.header?.origin==='subagent')throw Error('表格会话不可用。')
      let created=session.events.find(event=>event.type===SPREADSHEET_CREATED)
      if(!created){
        if(session.events.some(event=>['session/title','turn/start','user/message','workspace-note/edited'].includes(event.type)))
          throw Error('仅可初始化刚创建的表格会话。')
        const title=ctx.sessionTitle.rename(session,input.locale==='en'?'New Spreadsheet':'新表格')
        created=session.append(SPREADSHEET_CREATED,{titleSeq:title.eventSeq})
      }
      if(await ctx.sessions.flush(session)!==true)throw Error('新表格尚未保存，请重试。')
      return send(200,{ok:true,titleSeq:created.data.titleSeq})
    }catch(error){return send(400,{error:error.message})}
  }})
}
