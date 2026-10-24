import {afterEach,expect,it,vi} from 'vitest'
import {readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {installModelSelection} from '@deepseek-ai/dsh-agent'
import {presentationRuntimeFixture} from './fixtures/home-presentation-runtime.js'
const mod=await import('../packages/dsh-research-task-runtime/home-presentation-runtime.js').catch(()=>({}))
// Human-readable streaming intentionally takes longer than an immediate fixture.
vi.setConfig({testTimeout:25000})
const clean=[]
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
const until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('native event timeout')}
async function fixture(){expect(mod.createHomePresentationRuntime,'offline native execution helper').toBeTypeOf('function');const f=await presentationRuntimeFixture();clean.push(f.dispose);return f}
it('uses the real agent loop, native todo/tool events and durable editable file without a model request',async()=>{
 const f=await fixture(),prepared=await f.runtime.prepare(f.input)
 expect(prepared.brief).toBe(mod.createHomePresentationBrief(f.metadata))
 expect(prepared.sourcePath).toBe(join(f.cwd,'Vanguard-2026经济与市场展望.pdf'))
 expect(await readFile(prepared.sourcePath)).toEqual(f.sourceBytes)
 expect(prepared.outline).toHaveLength(f.metadata.presentationSlides)
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await until(()=>f.agent.session.events.some(e=>e.type==='user/message'))
 expect(f.agent.session.events.some(e=>e.type==='assistant/message')).toBe(false)
 await f.runtime.playback({...f.input,playing:true})
 for(const stage of ['plan','layout','deliver'])await f.runtime.checkpoint({...f.input,stage})
 await f.agent.whenIdle();expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 const events=f.agent.session.events
 expect(events.filter(e=>e.type==='user/message')).toHaveLength(1)
 expect(events.filter(e=>e.type==='todo/write').length).toBeGreaterThanOrEqual(3)
 expect(events.findLast(e=>e.type==='todo/write').data.todos.every(t=>t.status==='completed')).toBe(true)
 expect(events.filter(e=>e.type==='tool/call').map(e=>e.data.name)).toEqual(['todo_write','todo_write','home_presentation_publish','todo_write'])
 const assistantText=events.filter(e=>e.type==='assistant/message').flatMap(e=>e.data.message.content??[]).filter(block=>block.type==='text').map(block=>block.text).join('\n')
 expect(assistantText.split('\n').filter(line=>/^\d+\./u.test(line))).toHaveLength(f.metadata.chapters.length)
 expect(assistantText).not.toContain(f.metadata.pageOutline.map(page=>page.slide+'. '+page.title).join('\n'))
 expect(JSON.stringify(events)).toContain('离线预制')
 expect(JSON.stringify(events)).toContain('人工智能周期与资产配置.pptx')
 expect(await readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).toEqual(f.bytes)
 const persisted=await f.ctx.sessionPersistence.inspect('demo')
 expect(persisted.events.filter(e=>e.type==='assistant/message').length).toBeGreaterThan(0)
 expect(JSON.stringify(persisted.events)).toContain('原研报、PPT和制作记录均已保存')
 const outsider=await f.create('outside-session');outsider.followup(createUserMessage({content:[{type:'text',text:'正常会话'}],source:{kind:'user'}}));await outsider.whenIdle()
 expect(f.outside).toHaveLength(1)
})
it('rejects unbound/nonempty sessions and reused runs, and pause/dispose cannot produce late files',async()=>{
 const f=await fixture();await expect(f.runtime.prepare({...f.input,sessionId:'missing'})).rejects.toThrow()
 await expect(f.runtime.prepare({...f.input,cwd:tmpdir()})).rejects.toThrow()
 await f.runtime.prepare(f.input);await expect(f.runtime.prepare({...f.input,runId:'different'})).rejects.toThrow()
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await until(()=>f.agent.session.events.some(e=>e.type==='user/message'))
 const waiting=f.runtime.checkpoint({...f.input,stage:'plan'});await new Promise(r=>setTimeout(r,30))
 expect(f.agent.session.events.some(e=>e.type==='todo/write')).toBe(false)
 await f.runtime.disposeRun(f.input);await expect(waiting).rejects.toThrow();await f.agent.whenIdle()
 await expect(readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).rejects.toThrow()
 expect(f.outside).toEqual([])
 f.agent.followup(createUserMessage({content:[{type:'text',text:'取消后继续正常提问'}],source:{kind:'user'}}));await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1)
})
it('pauses between native steps and never overwrites an existing delivered file',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await f.runtime.checkpoint({...f.input,stage:'plan'});await f.runtime.playback({...f.input,playing:false})
 const layout=f.runtime.checkpoint({...f.input,stage:'layout'});let done=false;void layout.then(()=>done=true)
 await new Promise(r=>setTimeout(r,50));expect(done).toBe(false);expect(f.agent.session.events.filter(e=>e.type==='todo/write')).toHaveLength(1)
 await f.runtime.playback({...f.input,playing:true});await layout
 const path=join(f.cwd,'人工智能周期与资产配置.pptx');await writeFile(path,'用户已保存的文件')
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow(/预置文件未能保存/)
 await f.agent.whenIdle();expect(await readFile(path,'utf8')).toBe('用户已保存的文件');expect(f.outside).toEqual([])
})
it('does not prepare a nonempty native session',async()=>{
 const f=await fixture()
 f.agent.followup(createUserMessage({content:[{type:'text',text:'已有正常会话'}],source:{kind:'user'}}));await f.agent.whenIdle()
 await expect(f.runtime.prepare(f.input)).rejects.toThrow(/空白/)
 expect(f.outside).toHaveLength(1)
})
it('rejects changed user input on the isolated route without falling through to a real model',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:'请改成实际调用模型'}],source:{kind:'user'}}))
 await expect(f.runtime.checkpoint({...f.input,stage:'plan'})).rejects.toThrow(/离线预置只接受/)
 await f.agent.whenIdle();expect(f.outside).toEqual([]);await expect(readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).rejects.toThrow()
})
it.each(['disposeRun','dispose'])('cancels preparation through %s while durable ownership flush is pending without hijacking later ordinary messages',async method=>{
 const f=await fixture(),flush=f.ctx.sessions.flush.bind(f.ctx.sessions)
 let reached,release
 const entering=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve})
 f.ctx.sessions.flush=async session=>{if(session===f.agent.session){reached();await gate}return flush(session)}
 const preparing=f.runtime.prepare(f.input)
 await entering
 await f.runtime[method](f.input)
 release()
 await expect(preparing).rejects.toThrow(/停止|变化/)
 f.agent.followup(createUserMessage({content:[{type:'text',text:'退出演示后正常提问'}],source:{kind:'user'}}));await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1)
 expect(f.errors).toEqual([])
})
it('keeps a disposed run tombstone when its late prepare request arrives',async()=>{
 const f=await fixture();await f.runtime.disposeRun(f.input)
 await expect(f.runtime.prepare(f.input)).rejects.toThrow(/停止|变化/)
 f.agent.followup(createUserMessage({content:[{type:'text',text:'正常提问'}],source:{kind:'user'}}));await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1)
})

it('releases the completed route before the user continues in the saved example conversation',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 for(const stage of ['plan','layout','deliver'])await f.runtime.checkpoint({...f.input,stage})
 await f.agent.whenIdle()
 f.agent.followup(createUserMessage({content:[{type:'text',text:'请帮我继续调整第二页的措辞'}],source:{kind:'user'}}));await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1)
 expect(f.errors).toEqual([])
})
it('does not install the preset route when normal user content arrives during preparation flush',async()=>{
 const f=await fixture(),flush=f.ctx.sessions.flush.bind(f.ctx.sessions)
 let reached,release
 const entering=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve})
 f.ctx.sessions.flush=async session=>{if(session===f.agent.session){reached();await gate}return flush(session)}
 const preparing=f.runtime.prepare(f.input);await entering
 f.agent.followup(createUserMessage({content:[{type:'text',text:'我已有实际任务'}],source:{kind:'user'}}));await f.agent.whenIdle()
 release();await expect(preparing).rejects.toThrow(/变化|内容/)
 expect(f.outside).toHaveLength(1)
})

it('preserves a changed source attachment and refuses to publish a mismatched report presentation',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await f.runtime.checkpoint({...f.input,stage:'plan'});await f.runtime.checkpoint({...f.input,stage:'layout'})
 const source=join(f.cwd,'Vanguard-2026经济与市场展望.pdf');await writeFile(source,'用户替换的研报')
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow(/预置文件未能保存/)
 await f.agent.whenIdle();expect(await readFile(source,'utf8')).toBe('用户替换的研报')
 await expect(readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).rejects.toThrow()
 expect(f.outside).toEqual([])
})
it('derives the report-to-PPT brief from the delivered page count and asks for substantive evidence and a company-standard contents page',()=>{
 expect(mod.createHomePresentationBrief).toBeTypeOf('function')
 const brief=mod.createHomePresentationBrief({presentationSlides:16})
 expect(brief).toContain('16页');expect(brief).not.toContain('8页')
 expect(brief).toContain('目录');expect(brief).toContain('图表');expect(brief).toContain('数据');expect(brief).toContain('研究观点')
})

it('keeps the preset offline even when the ordinary host model-selection waterfall is installed first',async()=>{
 const f=await fixture();installModelSelection(f.agent.ctx,{current:{provider:'outside',model:'normal'}})
 await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 const plan=f.runtime.checkpoint({...f.input,stage:'plan'});void plan.catch(()=>{})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}));await f.until(()=>f.outside.length>0||f.agent.session.events.some(e=>e.type==='todo/write'))
 expect(f.outside).toEqual([])
 await plan
 for(const stage of ['layout','deliver'])await f.runtime.checkpoint({...f.input,stage})
 await f.agent.whenIdle();expect(f.outside).toEqual([])
})
it.each([false,true])('accepts an immediate ordinary followup while tutorial cancellation settles (host model selection: %s)',async withSelection=>{
 const f=await fixture();if(withSelection)installModelSelection(f.agent.ctx,{current:{provider:'outside',model:'normal'}})
 await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 await f.until(()=>f.agent.session.events.some(e=>e.type==='request/header'))
 const stopping=f.runtime.disposeRun(f.input)
 f.agent.followup(createUserMessage({content:[{type:'text',text:'结束演示后立刻继续普通问题'}],source:{kind:'user'}}))
 await stopping;await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1);expect(f.errors).toEqual([])
 expect(f.agent.session.events.filter(e=>e.type==='user/message').at(-1).data.content[0].text).toBe('结束演示后立刻继续普通问题')
})
