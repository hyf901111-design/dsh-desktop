import {afterEach,expect,it} from 'vitest'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {installModelSelection} from '@deepseek-ai/dsh-agent'
import {Context} from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import {reportRuntimeFixture} from './fixtures/home-report-runtime.js'
import * as mod from '../packages/dsh-research-task-runtime/home-report-runtime.js'
import {HOME_REPORT_HTML_FILE,HOME_REPORT_PDF_FILE} from '../packages/dsh-research-task-runtime/home-report-contract.js'
const clean=[]
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
const until=async(fn)=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('native report event timeout')}
async function fixture(title='研究报告示例（演示案例）'){expect(mod.createHomeReportRuntime).toBeTypeOf('function');const f=await reportRuntimeFixture();clean.push(f.dispose);await writeFile(join(f.home,'research-board-directories.json'),JSON.stringify({report:{sessionId:f.input.sessionId,path:f.cwd,title}}));return f}

it.each(['研究报告示例','研究报告示例 · 练习副本','研究报告示例（演示案例）','研究报告示例 · 练习副本（演示案例）'])('prepares the registered native report session titled %s',async title=>{
 const f=await fixture(title)
 expect(await f.runtime.prepare(f.input)).toMatchObject({ready:true,reportTitle:f.metadata.reportTitle})
 expect(f.agent.session.events.some(event=>event.type==='home-guide/report')).toBe(true)
 expect(f.outside).toEqual([])
})
it('refuses a renamed report session before taking ownership',async()=>{
 const f=await fixture('研究报告示例（演示案例） · 练习副本')
 await expect(f.runtime.prepare(f.input)).rejects.toThrow('专属目录')
 expect(f.agent.session.events.some(event=>event.type==='home-guide/report')).toBe(false)
 expect(f.outside).toEqual([])
})

it('saves both real artifact formats through the actual agent tools and preserves public history without a model call',async()=>{
 const f=await fixture()
 installModelSelection(f.agent.ctx,{current:{provider:'outside',model:'normal'}})
 const prepared=await f.runtime.prepare(f.input)
 expect(prepared).toMatchObject({ready:true,reportTitle:f.metadata.reportTitle,researchAsOf:'2026-10-23',deliveryPaths:{html:join(f.cwd,HOME_REPORT_HTML_FILE),pdf:join(f.cwd,HOME_REPORT_PDF_FILE)}})
 expect(prepared).not.toHaveProperty('sourcePath')
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await until(()=>f.agent.session.events.some(event=>event.type==='user/message'));expect(f.outside).toEqual([])
 await f.runtime.playback({...f.input,playing:true})
 await f.runtime.checkpoint({...f.input,stage:'plan'});await f.runtime.playback({...f.input,playing:false})
 let layoutDone=false;const layout=f.runtime.checkpoint({...f.input,stage:'layout'}).then(()=>{layoutDone=true})
 await new Promise(resolve=>setTimeout(resolve,40));expect(layoutDone).toBe(false)
 await expect(readFile(prepared.pdfPath)).rejects.toThrow()
 await f.runtime.playback({...f.input,playing:true});await layout;await f.runtime.checkpoint({...f.input,stage:'deliver'})
 await f.agent.whenIdle()
 expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 expect(await readFile(prepared.htmlPath)).toEqual(f.html);expect(await readFile(prepared.pdfPath)).toEqual(f.pdf)
 const events=f.agent.session.events
 expect(events.filter(event=>event.type==='tool/call').map(event=>event.data.name)).toEqual(['todo_write','todo_write','home_report_publish','todo_write'])
 expect(events.findLast(event=>event.type==='todo/write').data.todos.every(todo=>todo.status==='completed')).toBe(true)
 const disk=await f.ctx.sessionPersistence.inspect('report-demo')
 expect(JSON.stringify(disk.events)).toContain(HOME_REPORT_HTML_FILE);expect(JSON.stringify(disk.events)).toContain(HOME_REPORT_PDF_FILE)
 expect(events.find(event=>event.type==='home-guide/report').data.provenance.sessionId).toBe(f.metadata.provenance.sessionId)
 const reply=events.filter(event=>event.type==='assistant/message').flatMap(event=>event.data.message.content.filter(block=>block.type==='text').map(block=>block.text)).join('\n')
 expect(reply).toContain(f.metadata.keyFindings[0]);expect(reply).not.toContain('实时生成')
 f.agent.followup(createUserMessage({content:[{type:'text',text:'保存后继续普通问题'}],source:{kind:'user'}}));await f.agent.whenIdle();expect(f.outside).toHaveLength(1)
},25000)
it('refuses foreign, nonempty or nonfresh sessions without taking over their model route',async()=>{
 const f=await fixture()
 await expect(f.runtime.prepare({...f.input,fresh:false})).rejects.toThrow()
 await expect(f.runtime.prepare({...f.input,cwd:f.root})).rejects.toThrow()
 const other=await f.create('unregistered');await expect(f.runtime.prepare({...f.input,sessionId:other.id})).rejects.toThrow()
 f.agent.followup(createUserMessage({content:[{type:'text',text:'普通历史'}],source:{kind:'user'}}));await f.agent.whenIdle()
 await expect(f.runtime.prepare(f.input)).rejects.toThrow();expect(f.outside).toHaveLength(1)
})
it('pauses before work and cancellation prevents late files while immediately restoring normal routing',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input)
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}));await until(()=>f.agent.session.events.some(event=>event.type==='user/message'))
 const waiting=f.runtime.checkpoint({...f.input,stage:'plan'});waiting.catch(()=>{})
 await new Promise(resolve=>setTimeout(resolve,40));expect(f.agent.session.events.some(event=>event.type==='todo/write')).toBe(false)
 const stopping=f.runtime.disposeRun(f.input)
 f.agent.followup(createUserMessage({content:[{type:'text',text:'停止后马上继续提问'}],source:{kind:'user'}}));await stopping;await f.agent.whenIdle()
 await expect(waiting).rejects.toThrow();expect(f.outside).toHaveLength(1)
 await expect(readFile(join(f.cwd,HOME_REPORT_HTML_FILE))).rejects.toThrow();await expect(readFile(join(f.cwd,HOME_REPORT_PDF_FILE))).rejects.toThrow()
})
it('rejects changed input on the isolated route and never falls through to a real model',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 const waiting=f.runtime.checkpoint({...f.input,stage:'plan'});waiting.catch(()=>{})
 f.agent.followup(createUserMessage({content:[{type:'text',text:'另外发起一个实际任务'}],source:{kind:'user'}}))
 await expect(waiting).rejects.toThrow();await f.agent.whenIdle();expect(f.outside).toEqual([])
 await expect(readFile(join(f.cwd,HOME_REPORT_HTML_FILE))).rejects.toThrow()
})
it('keeps a cancelled preparation tombstone and preserves content entered during a pending ownership flush',async()=>{
 const f=await fixture();await f.runtime.disposeRun(f.input);await expect(f.runtime.prepare(f.input)).rejects.toThrow()
 const another={...f.input,runId:'second-run'},flush=f.ctx.sessions.flush.bind(f.ctx.sessions)
 let entered,release;const waiting=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve})
 f.ctx.sessions.flush=async session=>{if(session===f.agent.session){entered();await gate}return flush(session)}
 const preparing=f.runtime.prepare(another);await waiting
 f.agent.followup(createUserMessage({content:[{type:'text',text:'准备中已输入真实需求'}],source:{kind:'user'}}));await f.agent.whenIdle();release()
 await expect(preparing).rejects.toThrow();expect(f.outside).toHaveLength(1)
})
it('preserves a user-saved PDF and never publishes a half-pair in its place',async()=>{
 const f=await fixture(),prepared=await f.runtime.prepare(f.input)
 await writeFile(prepared.pdfPath,'用户已经保存的文件');await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 for(const stage of ['plan','layout'])await f.runtime.checkpoint({...f.input,stage})
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow(/预置报告未能保存/);await f.agent.whenIdle()
 expect(await readFile(prepared.pdfPath,'utf8')).toBe('用户已经保存的文件');await expect(readFile(prepared.htmlPath)).rejects.toThrow();expect(f.outside).toEqual([])
},20000)
it('admits only trusted POST commands with the fixed report route and does not accept asset path overrides',async()=>{
 expect(mod.registerHomeReportRuntime).toBeTypeOf('function')
 const ctx=new Context();new LlmRuntime(ctx)
 let route,input,trusted=false
 ctx.provide('webServer',{register(value){route=value;return()=>{route=null}}})
 const dispose=mod.registerHomeReportRuntime(ctx,{isTrustedRequest:()=>trusted,readJsonBody:async()=>input})
 try{
  expect(route.path).toBe('/sherlock/home-guide/report')
  const send=async(method,body)=>{input=body;let status,payload;await route.handler({method},{writeHead(value){status=value},end(value){payload=JSON.parse(value)}});return{status,payload}}
  expect(await send('POST',{action:'dispose',sessionId:'s',runId:'r'})).toMatchObject({status:403,payload:{ok:false}})
  trusted=true;expect(await send('GET',{})).toMatchObject({status:403,payload:{ok:false}})
  expect(await send('POST',{action:'prepare',sessionId:'s',runId:'r',cwd:'/tmp',fresh:true,assetsDirectory:'/outside'})).toMatchObject({status:409,payload:{ok:false}})
  expect(await send('POST',{action:'dispose',sessionId:'s',runId:'r'})).toMatchObject({status:200,payload:{ok:true}})
  expect(await send('POST',{action:'prepare',sessionId:'s',runId:'r',cwd:'/tmp',fresh:true})).toMatchObject({status:409,payload:{ok:false}})
 }finally{await dispose();await ctx.fiber.dispose()}
})
