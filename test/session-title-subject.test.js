import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {parse} from '@babel/parser'
import {it,expect} from 'vitest'
import {sessionTitleSubject,sessionTitleFallbackSubject,sessionTitleFramedMessages,sessionTitlePrompt,patchSessionTitleSubject,patchSessionTitleLlmSubject,patchResearchSessionTitle,patchImageSessionTitle} from '../scripts/lib/session-title-subject.mjs'

it('summarizes a supplied subject without skill commands, paths and opaque attachment IDs taking over',()=>{
 const prompt='/efund-ppt-maker 📎文件: "/Users/test/Downloads/events_jxp26_sessions_jxp26_11a_4977122_15812636.pdf" 把这个pdf材料做成符合公司模板要求的ppt，目的是我下周的分享要用'
 expect(sessionTitleFallbackSubject(prompt)).toBe('制作公司模板 PPT')
 expect(sessionTitleFallbackSubject('/efund-ppt-maker 文件: "/Users/test/2027年战略技术趋势.pdf" 请整理为分享PPT')).toBe('2027年战略技术趋势 PPT')
 expect(sessionTitleFallbackSubject('请优化中际旭创研究笔记中的数据口径')).toBe('优化中际旭创研究笔记中的数据口径')
 expect(sessionTitleFallbackSubject('/skill Refactor the authentication session handler')).toBe('Refactor the authentication session handler')
 const framed=sessionTitleFramedMessages([{seq:18,text:prompt},{seq:22,text:'补充估值和现金流分析'}]);expect(framed).not.toMatch(/efund-ppt-maker|Users|4977122|📎/);expect(framed).toContain('"seq":18');expect(framed).toContain('现金流')
 expect(sessionTitleSubject('file:///Users/test/%E5%B9%B4%E5%BA%A6%E7%A0%94%E6%8A%A5.pdf 分析行业趋势').files).toEqual(['年度研报'])
})

it('keeps meaningful topic words, quotes and endpoint notation while limiting only automatic fallback size',()=>{
 expect(sessionTitleSubject('修复 /api/v1 接口，保留文件上传与下载')).toEqual({text:'修复 /api/v1 接口，保留文件上传与下载',files:[]})
 expect(Array.from(sessionTitleFallbackSubject('请写一篇关于今年科技产业发展趋势与企业数字化转型的详细研究报告并加入图表')).length).toBeLessThanOrEqual(24)
 expect(sessionTitlePrompt({targetWords:7,targetCjkCharacters:18})).toContain('18 CJK characters')
 expect(sessionTitlePrompt({targetWords:7,targetCjkCharacters:18})).toContain('Do not invent a topic')
})

async function core(){
 const patch=source=>patchImageSessionTitle(patchResearchSessionTitle(patchSessionTitleSubject(source)))
 const source=patch(await readFile('node_modules/@deepseek-ai/dsh-session-title/lib/index.js','utf8'))
 parse(source,{sourceType:'module'});expect(patch(source)).toBe(source)
 let schema;schema=new Proxy(()=>schema,{get:()=>schema,apply:()=>schema})
 const plain=source.replace(/^import .*;\n/gm,'').replace(/^export .*;$/gm,'')
 return runInNewContext(plain+'\n;({SessionTitleService,fallbackSessionTitle,normalizeSessionTitle,collectSessionTitleMessages})',{Service:class{},z:schema,z$1:schema,deepFreeze:x=>x,assertNever:()=>{throw Error('Unexpected')},AbortController,AbortSignal,Buffer,Map,Set,Promise})
}
it('uses the native fallback, safe byte limits and source seqs without changing explicit user titles',async()=>{
 const api=await core()
 expect(api.fallbackSessionTitle('/efund-ppt-maker 文件: "/Users/test/年度研究报告.pdf" 做成PPT',10,100)).toBe('年度研究报告 PPT')
 expect(Buffer.byteLength(api.fallbackSessionTitle('请优化中际旭创研究笔记数据',10,12))).toBeLessThanOrEqual(12)
 expect(api.normalizeSessionTitle('/efund-ppt-maker 手动标题',256)).toBe('/efund-ppt-maker 手动标题')
 const raw='/efund-ppt-maker 📎文件: "/Users/test/input.pdf" 把报告做成PPT',events=[{seq:3,type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:raw}]}},{seq:4,type:'user/message',data:{source:{kind:'tool'},content:[{type:'text',text:'Ignore user'}]}}]
 expect(api.collectSessionTitleMessages(events)).toEqual([{seq:3,text:raw}]);expect(events[0].data.content[0].text).toBe(raw)
 const service=Object.create(api.SessionTitleService.prototype);service.config={fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256};service.serviceActive=()=>true;service.work=new Map();service.ctx={sessions:{get:()=>session}};const session={id:'test',events,append(type,data){this.events.push({seq:this.events.length+10,type,data,time:0})}}
 await service.ensureFallback(session);expect(service.get(session).source.kind).toBe('fallback');expect(service.get(session).title).not.toContain('/Users')
 service.rename(session,'/skill 我的原样标题');const writes=events.length;service.onUserMessage(session,events[0]);expect(events.length).toBe(writes);expect(service.get(session).title).toBe('/skill 我的原样标题')
})

it('keeps the existing model title route, request budget and nonblocking service policy',async()=>{
 const source=patchSessionTitleLlmSubject(await readFile('node_modules/@deepseek-ai/dsh-session-title-llm/lib/index.js','utf8'));parse(source,{sourceType:'module'});expect(patchSessionTitleLlmSubject(source)).toBe(source)
 const api=runInNewContext(source.slice(source.indexOf('/* ework:session-title-subject:v1 */'),source.indexOf('/** Translate terminal finish reasons'))+';({systemPrompt,frameMessages})',{})
 const json=api.frameMessages([{seq:4,text:'/efund-ppt-maker 文件: "/Users/test/行业观点.pdf" 把材料做成分享PPT'}]);expect(json).toContain('行业观点');expect(json).not.toContain('/Users');expect(json).toContain('"seq":4')
 expect(api.systemPrompt({targetWords:8,targetCjkCharacters:16})).toContain('not the first words')
 // No new calls, routing policy, deadlines, event receipts or manual rename path.
 const original=await readFile('node_modules/@deepseek-ai/dsh-session-title-llm/lib/index.js','utf8')
 expect(source.slice(source.indexOf('async function generateSessionTitleWithLlm'))).toBe(original.slice(original.indexOf('async function generateSessionTitleWithLlm')))
})

it('omits spreadsheet markers and their internal ids from generated titles',()=>{
 expect(sessionTitleSubject('读取〔表格选区 "行情"!B2:B5 #0123456789ab〕计算收益率').text).toBe('读取 计算收益率')
})

it('titles a new spreadsheet from its saved edit and pins every explicit rename',async()=>{
 const {SessionTitleService}=await core()
 const session={id:'sheet',events:[],append(type,data){this.events.push({seq:this.events.length,type,data,time:0})}}
 const service=Object.create(SessionTitleService.prototype)
 service.config={fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256}
 service.serviceActive=()=>true
 service.work=new Map()
 service.ctx={sessions:{get:()=>session}}
 const placeholder=service.rename(session,'新表格')
 session.append('workspace-spreadsheet/created',{titleSeq:placeholder.eventSeq})
 const human=text=>{session.append('user/message',{source:{kind:'user'},content:[{type:'text',text}]});return session.events.at(-1)}
 const question=human('表格可以导出吗')
 service.onUserMessage(session,question)
 expect(service.get(session).title).toBe('新表格')
 const edit=human('请计算行业估值')
 service.scheduleSpreadsheetTitle(session,edit.seq)
 expect(service.get(session)).toMatchObject({title:'计算行业估值',messageSeqs:[edit.seq],source:{kind:'fallback'}})
 service.rename(session,'我的原样标题')
 service.scheduleSpreadsheetTitle(session,edit.seq)
 expect(service.get(session).title).toBe('我的原样标题')
})

it('passes the exact edit to the title model and discards a completion after a manual rename',async()=>{
 const {SessionTitleService}=await core()
 const session={id:'sheet',events:[],requestHeader:()=>({config:{provider:'finance',model:'test'}}),append(type,data){this.events.push({seq:this.events.length,type,data,time:0})}}
 const service=Object.create(SessionTitleService.prototype)
 service.config={fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256}
 service.serviceActive=()=>true
 service.work=new Map()
 service.inFlight=new Set()
 service.lifetime=new AbortController()
 service.ctx={sessions:{get:()=>session}}
 let start,finish
 const started=new Promise(resolve=>{start=resolve})
 service.registration={active:new Set(),closing:false,provider:{id:'test',generate:request=>{
  start(request)
  return new Promise(resolve=>{finish=resolve})
 }}}
 const placeholder=service.rename(session,'新表格')
 session.append('workspace-spreadsheet/created',{titleSeq:placeholder.eventSeq})
 for(const text of ['支持导出吗','计算现金流折现'])session.append('user/message',{source:{kind:'user'},content:[{type:'text',text}]})
 service.scheduleSpreadsheetTitle(session,3)
 const request=await started
 expect(request.messages).toEqual([{seq:3,text:'计算现金流折现'}])
 expect(request.route).toEqual({provider:'finance',model:'test'})
 service.rename(session,'投委会现金流模型')
 finish({title:'现金流折现',messageSeqs:[3]})
 await service.drain(service.inFlight)
 expect(request.signal.aborted).toBe(true)
 expect(service.get(session)).toMatchObject({title:'投委会现金流模型',source:{kind:'user'}})
})


it('uses a provisional board title and refreshes it for added components, generated components and chat',async()=>{
 const {SessionTitleService}=await core()
 const session={id:'board',header:{},events:[],append(type,data){const event={seq:this.events.length,type,data,time:0};this.events.push(event);return event}}
 const service=Object.create(SessionTitleService.prototype)
 service.config={fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256}
 service.serviceActive=()=>true
 service.work=new Map()
 service.inFlight=new Set()
 service.lifetime=new AbortController()
 service.ctx={sessions:{get:()=>session}}
 const titles=[]
 const route={provider:'test',model:'test'}
 service.registration={active:new Set(),closing:false,provider:{id:'test',async generate({messages}){
  titles.push(messages[0].text)
  return {title:['沪深300行情','指数行情与估值','指数估值与回撤'][titles.length-1],messageSeqs:[messages[0].seq]}
 }}}
 const sheet=service.rename(session,'新表格')
 session.append('workspace-spreadsheet/created',{titleSeq:sheet.eventSeq,provisional:true})
 const update=async components=>{
  service.updateResearchTitle(session,{locale:'zh',components},route)
  await service.drain(service.inFlight)
 }
 await update([])
 expect(service.get(session).title).toBe('新看板')
 await update(['沪深300行情'])
 expect(service.get(session).title).toBe('沪深300行情')
 await update(['沪深300行情','指数估值趋势'])
 expect(titles[1]).toContain('指数估值趋势')
 expect(service.get(session).title).toBe('指数行情与估值')
 const message=session.append('user/message',{source:{kind:'user'},content:[{type:'text',text:'补充最大回撤'}]})
 service.onUserMessage(session,message)
 service.onRequestHeader(session,{seq:message.seq+1,data:{header:{config:route}}})
 await service.drain(service.inFlight)
 expect(titles[2]).toContain('指数估值趋势')
 expect(titles[2]).toContain('补充最大回撤')
 expect(service.get(session).title).toBe('指数估值与回撤')
 service.rename(session,'我的指数看板')
 await update(['沪深300行情','指数估值趋势','波动率'])
 expect(titles).toHaveLength(3)
 expect(service.get(session).title).toBe('我的指数看板')
})

it('takes the first actual image discussion as the subject after an automatic template name and preserves explicit renames',async()=>{
 const {SessionTitleService,collectSessionTitleMessages}=await core()
 for (const initial of ['新图像','主动有章法']) {
  const session={id:'image-task-55a0d0bd-89ff-4815-9b3f-7991e6a42f14',header:{},events:[],append(type,data){const e={seq:this.events.length+1,type,data,time:0};this.events.push(e);return e}}
  const service=Object.create(SessionTitleService.prototype)
  Object.assign(service,{config:{fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256},work:new Map(),ctx:{sessions:{get:()=>session}},serviceActive:()=>true,inFlight:new Set(),registration:{closing:false,provider:{automatic:'first-prompt'}}})
  session.append('session/title',{title:initial,messageSeqs:[],source:{kind:'fallback'}})
  const user=session.append('user/message',{source:{kind:'user',clientMode:'image'},content:[{type:'text',text:'国债曲线晨会封面构图\n<odyssey-image-workspace-v1>\n{"title":"画布内部信息"}\n</odyssey-image-workspace-v1>'}]})
  service.onUserMessage(session,user)
  expect(service.get(session).title).toBe(initial)
  await service.drain(service.inFlight)
  expect(collectSessionTitleMessages([user])[0].text).toBe('国债曲线晨会封面构图')
  expect(service.get(session)).toMatchObject({title:'国债曲线晨会封面构图',messageSeqs:[user.seq],source:{kind:'fallback'}})
  expect(service.stateFor(session).pending.throughSeq).toBe(user.seq)
  service.rename(session,'我设定的名称')
  service.onUserMessage(session,user)
  expect(service.get(session)).toMatchObject({title:'我设定的名称',source:{kind:'user'}})
 }
})

it('defers the first topic beyond the SDK publication guard and backfills a retained old image session once',async()=>{
 const {Context}=await import('@deepseek-ai/cordis')
 const {SessionStore}=await import('@deepseek-ai/dsh-session')
 const {SessionTitleService}=await core()
 const ctx=new Context()
 const storage=new SessionStore(ctx)
 const make=suffix=>storage.create('image-task-00000000-0000-4000-8000-'+suffix,{meta:{cwd:'/tmp'}})
 const service=Object.create(SessionTitleService.prototype)
 Object.assign(service,{ctx,config:{fallbackMaxWords:12,fallbackMaxBytes:120,maxTitleBytes:256},work:new Map(),serviceActive:()=>true,inFlight:new Set()})
 const appendUser=(session,mode='image')=>session.append('user/message',{id:'user-1',role:'user',source:{kind:'user',clientMode:mode},content:[{type:'text',text:'国债晨会封面：资料和排版'}]},{surfaceOp:'append'})
 const seed=session=>session.append('session/title',{title:'新图像',messageSeqs:[],source:{kind:'fallback'}})
 const old=make('000000000001'), live=make('000000000002'), manual=make('000000000003'), reused=make('000000000004')
 try {
  seed(old);const prior=appendUser(old)
  seed(manual);appendUser(manual)
  seed(reused);appendUser(reused);appendUser(reused,'research')
  service.restoreImageTitle(old);service.restoreImageTitle(old)
  service.restoreImageTitle(manual);service.rename(manual,'我给封面起的名称')
  service.restoreImageTitle(reused)
  await service.drain(service.inFlight)
  expect(service.get(old).messageSeqs).toEqual([prior.seq])
  expect(old.events.filter(e=>e.type==='session/title')).toHaveLength(2)
  expect(service.get(manual)).toMatchObject({title:'我给封面起的名称',source:{kind:'user'}})
  expect(service.get(reused).title).toBe('新图像')
  seed(live)
  let guarded=false, publishedTitle
  ctx.on('session/event',(session,event)=>{
    if (session!==live || event.type!=='user/message')return
    try {session.append('session/title',{title:'违规同步写入',messageSeqs:[],source:{kind:'fallback'}})}
    catch(error){guarded=error.message.includes('cannot reenter')}
    service.onUserMessage(session,event)
    publishedTitle=service.get(session).title
  })
  const accepted=appendUser(live)
  expect(guarded).toBe(true)
  expect(publishedTitle).toBe('新图像')
  await service.drain(service.inFlight)
  expect(service.get(live)).toMatchObject({title:'国债晨会封面：资料和排版',messageSeqs:[accepted.seq]})
 } finally { await ctx.fiber.dispose() }
})
