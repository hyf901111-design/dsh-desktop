export const SPREADSHEET_CREATED = 'workspace-spreadsheet/created'
export const SPREADSHEET_EDITED = 'workspace-spreadsheet/edited'

export function registerSpreadsheetSessions(ctx, {isTrustedRequest, readJsonBody}) {
  return registerDocumentSessions(ctx,{isTrustedRequest,readJsonBody},'spreadsheet')
}
export function registerDocumentSessions(ctx,{isTrustedRequest,readJsonBody},kind){
  const presentation=kind==='presentation', noun=presentation?'演示':'表格'
  const createdType=presentation?'workspace-presentation/created':SPREADSHEET_CREATED
  const editedType=presentation?'workspace-presentation/edited':SPREADSHEET_EDITED
  return ctx.webServer.register({kind:'exact',path:'/sherlock/'+kind+'/session',handler:async(req,res)=>{
    const send=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}}
    if(req.method!=='POST'||!isTrustedRequest(req,true))return send(403,{error:'请求已拒绝。'})
    try {
      const input=await readJsonBody(req)
      if(typeof input?.sessionId!=='string'||!input.sessionId||input.sessionId.length>256||
        (input.action!=='retain'&&(input.action!==undefined||!['en','zh'].includes(input.locale))))
        throw Error(noun+'会话参数无效。')
      const session=ctx.sessions.get(input.sessionId)
      if(!session||session.header?.origin==='subagent')throw Error(noun+'会话不可用。')
      if(input.action==='retain'){
        const previous = session.events.findLast(event => event.type === editedType)
        const title = input.title
        if (presentation && title !== undefined && (typeof title !== 'string' || title.length > 256))
          throw Error('演示名称无效。')
        if (!previous) session.append(editedType, {})
        if (presentation && title?.trim()) {
          const current = session.events.findLast(event => event.type === 'session/title')
          const created = session.events.find(event => event.type === createdType)
          const lastAutoSeq = previous?.data.titleSeq ?? created?.data.titleSeq
          // A manual sidebar rename takes ownership, even if it used the same text.
          const wanted = Array.from(title.trim().replace(/\s+/g, ' ')).slice(0, 120).join('')
          if ((!current || current.seq === lastAutoSeq) && wanted !== current?.data.title &&
              (wanted !== '未命名演示文稿' || previous?.data.titleSeq !== undefined)) {
            const accepted = ctx.sessionTitle.rename(session, wanted)
            session.append(editedType, {titleSeq: accepted.eventSeq})
          }
        }
        if(await ctx.sessions.flush(session)!==true)throw Error(noun+'会话尚未保存，请重试。')
        return send(200,{ok:true})
      }
      let created=session.events.find(event=>event.type===createdType)
      if(!created){
        if(session.events.some(event=>['session/title','turn/start','user/message','workspace-note/edited'].includes(event.type)))
          throw Error('仅可初始化刚创建的'+noun+'会话。')
        const title=ctx.sessionTitle.rename(session,input.locale==='en'?(presentation?'New Presentation':'New Spreadsheet'):'新'+noun)
        created=session.append(createdType,{titleSeq:title.eventSeq,provisional:true})
      }
      if(await ctx.sessions.flush(session)!==true)throw Error('新'+noun+'尚未保存，请重试。')
      return send(200,{ok:true,titleSeq:created.data.titleSeq})
    }catch(error){return send(400,{error:error.message})}
  }})
}
