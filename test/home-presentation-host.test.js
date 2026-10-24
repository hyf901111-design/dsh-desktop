import {afterEach,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
const clean=[]
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
it('runs the preset through the actual registered Workspace, host API, integration skill and complete research middleware',async()=>{
 const f=await presentationHostFixture();clean.push(f.dispose)
 const workspace=await f.registry.resolveByPath(f.cwd)
 expect(workspace.sessionIds).toEqual([f.agent.id])
 const prepared=await f.command('prepare');expect(prepared.outline).toHaveLength(f.metadata.presentationSlides)
 await f.command('playback',{playing:true});await f.prompt(f.message())
 for(const stage of ['plan','layout','deliver'])await f.command('checkpoint',{stage})
 await f.agent.whenIdle();expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 const events=f.agent.session.events
 expect(events.some(e=>e.type==='user/message'&&e.data.source?.kind==='skill-invocation')).toBe(true)
 expect(events.findLast(e=>e.type==='todo/write').data.todos.every(t=>t.status==='completed')).toBe(true)
 expect(await readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).toEqual(await readFile('packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx'))
 expect(await readFile(prepared.sourcePath)).toEqual(await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf'))
 await f.ctx.sessions.flush(f.agent.session)
 const saved=await f.ctx.sessionPersistence.loadStored(f.agent.id)
 expect(saved.events.some(e=>e.type==='todo/write')).toBe(true)
 expect(JSON.stringify(saved.events)).toContain('原研报、PPT和制作记录均已保存')
 const history=await f.request(f.api.sessions.history,{sessionId:f.agent.id,maxMessages:100})
 expect(JSON.stringify(history.events)).toContain('人工智能周期与资产配置.pptx')
 await f.prompt('演示结束后继续普通会话');await f.agent.whenIdle();expect(f.outside).toHaveLength(1)
},30000)
it('keeps the production capability guard when a cwd-only session has no registered Workspace',async()=>{
 const f=await presentationHostFixture({bindWorkspace:false});clean.push(f.dispose)
 expect(await f.registry.resolveByPath(f.cwd)).toBeUndefined()
 await f.command('prepare');await f.command('playback',{playing:true});await f.prompt(f.message())
 await expect(f.command('checkpoint',{stage:'plan'})).rejects.toThrow(/工作区不可用/)
 await f.agent.whenIdle();expect(f.outside).toEqual([])
 await expect(readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).rejects.toThrow()
},15000)
it('rejects a second human prompt despite trusted skill instructions and restores ordinary routing after cancellation',async()=>{
 const f=await presentationHostFixture();clean.push(f.dispose)
 await f.command('prepare');await f.command('playback',{playing:true});await f.prompt(f.message())
 await f.command('checkpoint',{stage:'plan'})
 await f.prompt('改变这次演示的需求','steer')
 await expect(f.command('checkpoint',{stage:'layout'})).rejects.toThrow(/离线预置只接受/)
 await f.agent.whenIdle();expect(f.outside).toEqual([])
 expect(f.agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user')).toHaveLength(2)
 await f.command('dispose');await f.prompt('退出后继续普通会话');await f.agent.whenIdle()
 expect(f.outside).toHaveLength(1)
 await expect(readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).rejects.toThrow()
},20000)
