import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {parse} from '@babel/parser'
import {it,expect} from 'vitest'
import {sessionTitleSubject,sessionTitleFallbackSubject,sessionTitleFramedMessages,sessionTitlePrompt,patchSessionTitleSubject,patchSessionTitleLlmSubject} from '../scripts/lib/session-title-subject.mjs'

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
 const source=patchSessionTitleSubject(await readFile('node_modules/@deepseek-ai/dsh-session-title/lib/index.js','utf8'))
 parse(source,{sourceType:'module'});expect(patchSessionTitleSubject(source)).toBe(source)
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
