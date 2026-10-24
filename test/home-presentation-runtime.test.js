import {afterEach,expect,it} from 'vitest'
import {readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {presentationRuntimeFixture} from './fixtures/home-presentation-runtime.js'
const mod=await import('../packages/dsh-research-task-runtime/home-presentation-runtime.js').catch(()=>({}))
const clean=[]
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
const until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('native event timeout')}
async function fixture(){expect(mod.createHomePresentationRuntime,'offline native execution helper').toBeTypeOf('function');const f=await presentationRuntimeFixture();clean.push(f.dispose);return f}
it('uses the real agent loop, native todo/tool events and durable editable file without a model request',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input)
 f.agent.followup(createUserMessage({content:[{type:'text',text:mod.HOME_PRESENTATION_BRIEF}],source:{kind:'user'}}))
 await until(()=>f.agent.session.events.some(e=>e.type==='user/message'))
 expect(f.agent.session.events.some(e=>e.type==='assistant/message')).toBe(false)
 await f.runtime.playback({...f.input,playing:true})
 for(const stage of ['plan','layout','deliver'])await f.runtime.checkpoint({...f.input,stage})
 await f.agent.whenIdle();expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 const events=f.agent.session.events
 expect(events.filter(e=>e.type==='user/message')).toHaveLength(1)
 expect(events.filter(e=>e.type==='todo/write').length).toBeGreaterThanOrEqual(3)
 expect(events.findLast(e=>e.type==='todo/write').data.todos.every(t=>t.status==='completed')).toBe(true)
 expect(JSON.stringify(events)).toContain('离线预置')
 expect(JSON.stringify(events)).toContain('公司风格演示示例.pptx')
 expect(await readFile(join(f.cwd,'公司风格演示示例.pptx'))).toEqual(f.bytes)
 await f.ctx.sessions.flush(f.agent.session)
 const persisted=await f.ctx.sessionPersistence.inspect('demo')
 expect(persisted.events.filter(e=>e.type==='assistant/message').length).toBeGreaterThan(0)
 const outsider=await f.create('outside-session');outsider.followup(createUserMessage({content:[{type:'text',text:'正常会话'}],source:{kind:'user'}}));await outsider.whenIdle()
 expect(f.outside).toHaveLength(1)
})
it('rejects unbound/nonempty sessions and reused runs, and pause/dispose cannot produce late files',async()=>{
 const f=await fixture();await expect(f.runtime.prepare({...f.input,sessionId:'missing'})).rejects.toThrow()
 await expect(f.runtime.prepare({...f.input,cwd:tmpdir()})).rejects.toThrow()
 await f.runtime.prepare(f.input);await expect(f.runtime.prepare({...f.input,runId:'different'})).rejects.toThrow()
 f.agent.followup(createUserMessage({content:[{type:'text',text:mod.HOME_PRESENTATION_BRIEF}],source:{kind:'user'}}))
 await until(()=>f.agent.session.events.some(e=>e.type==='user/message'))
 const waiting=f.runtime.checkpoint({...f.input,stage:'plan'});await new Promise(r=>setTimeout(r,30))
 expect(f.agent.session.events.some(e=>e.type==='todo/write')).toBe(false)
 await f.runtime.disposeRun(f.input);await expect(waiting).rejects.toThrow();await f.agent.whenIdle()
 await expect(readFile(join(f.cwd,'公司风格演示示例.pptx'))).rejects.toThrow()
 expect(f.outside).toEqual([])
})
it('pauses between native steps and never overwrites an existing delivered file',async()=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:mod.HOME_PRESENTATION_BRIEF}],source:{kind:'user'}}))
 await f.runtime.checkpoint({...f.input,stage:'plan'});await f.runtime.playback({...f.input,playing:false})
 const layout=f.runtime.checkpoint({...f.input,stage:'layout'});let done=false;void layout.then(()=>done=true)
 await new Promise(r=>setTimeout(r,50));expect(done).toBe(false);expect(f.agent.session.events.filter(e=>e.type==='todo/write')).toHaveLength(1)
 await f.runtime.playback({...f.input,playing:true});await layout
 const path=join(f.cwd,'公司风格演示示例.pptx');await writeFile(path,'用户已保存的文件')
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
 await f.agent.whenIdle();expect(f.outside).toEqual([]);await expect(readFile(join(f.cwd,'公司风格演示示例.pptx'))).rejects.toThrow()
})
it('cancels preparation while durable ownership flush is pending without hijacking later ordinary messages',async()=>{
 const f=await fixture(),flush=f.ctx.sessions.flush.bind(f.ctx.sessions)
 let reached,release
 const entering=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve})
 f.ctx.sessions.flush=async session=>{if(session===f.agent.session){reached();await gate}return flush(session)}
 const preparing=f.runtime.prepare(f.input)
 await entering
 await f.runtime.disposeRun(f.input)
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
