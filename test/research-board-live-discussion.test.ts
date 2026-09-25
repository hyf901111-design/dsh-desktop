import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
// @ts-expect-error The hosted page supplies React.
import * as React from 'react'
// @ts-expect-error Runtime test renderer.
import { createRoot } from 'react-dom/client'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Menu: () => null, IconEllipsisOutline16: () => null, IconSearchOutline16: () => null, IconPersonalizationOutline16: () => null, IconCloseFill14: () => null, IconFolderOpenOutline16: () => null, IconEditOutline16: () => null, IconTriangleRightFill14: () => null }))
import { ResearchBoardDiscussion } from '../src/preload/research-boards-ui'
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const fn of cleanups.splice(0)) await fn(); vi.unstubAllGlobals() })
async function mount(component = false) {
 const w = new Window(); vi.stubGlobal('window', w); vi.stubGlobal('document', w.document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
 let revision=1
 const listeners=new Set<()=>void>()
 const view:any={ boardId:'b',seq:7,permissions:{read:true},history:[],canvas:{artifacts:[{id:'c',title:'行业走势图'}]},messages:[{id:'q',role:'user',text:'请整理资料',author:{username:'甲'}}],tasks:[{taskId:'t',requestMessageId:'q',conversation:!component,targetId:component?'c':null,status:'running',progress:{startedAt:Date.now()-12000,lastActivityAt:Date.now(),outputChars:10,events:[{seq:1,type:'tool-started',tool:'检索网页',detail:'行业报告'},{seq:2,type:'tool-finished',failed:false}]}}] }
 const page:any={subscribe:(f:()=>void)=>{listeners.add(f);return()=>listeners.delete(f)},version:()=>revision,getView:()=>view,getState:()=>({}),retryRequest:()=>null,call:vi.fn(async()=>[]),showError:vi.fn()}
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host as unknown as HTMLElement)
 await React.act(async()=>root.render(React.createElement(ResearchBoardDiscussion,{page,sessionId:'s'})))
 cleanups.push(async()=>{await React.act(async()=>root.unmount());await w.happyDOM.abort()})
 return {host,view,emit:async()=>{revision++;await React.act(async()=>listeners.forEach(f=>f()))}}
}
it('shows bounded real activity immediately and updates without changing cloud seq or switching sessions',async()=>{
 const f=await mount();expect(f.host.textContent).toContain('检索网页');expect(f.host.textContent).toContain('行业报告');expect(f.host.textContent).toContain('12 秒')
 f.view.tasks[0].progress.events.push({seq:3,type:'tool-started',tool:'读取文件',detail:'核对资料'})
 await f.emit();expect(f.host.textContent).toContain('核对资料');expect(f.view.seq).toBe(7)
 f.view.tasks[0].status='completed';f.view.messages.push({id:'a',role:'assistant',taskId:'t',requestMessageId:'q',text:'完整回复已到达'})
 await f.emit();expect(f.host.textContent).toContain('完整回复已到达');expect(f.host.querySelector('.srb-task-progress')).toBeNull()
})
it('distinguishes independent component requests and results from main conversation turns',async()=>{
 const f=await mount(true)
 const group=f.host.querySelector('[data-request-message-id="q"]')!
 expect(group.getAttribute('data-execution-kind')).toBe('component')
 expect(group.textContent).toContain('组件子智能体');expect(group.textContent).toContain('独立执行');expect(group.textContent).toContain('行业走势图')
 f.view.tasks[0].status='completed';f.view.messages.push({id:'a',role:'assistant',taskId:'t',requestMessageId:'q',text:'研究组件已更新。'})
 await f.emit();expect(f.host.querySelector('[data-message-id="a"]')?.getAttribute('data-execution-kind')).toBe('component')
})
it('keeps main requests styled as conversation when they also own delegated component results',async()=>{
 const f=await mount();f.view.tasks.push({taskId:'child',requestMessageId:'q',targetId:'c',conversation:false,status:'completed'})
 f.view.messages.push({id:'child-result',role:'assistant',requestMessageId:'q',taskId:'child',text:'面板已完成'})
 await f.emit();expect(f.host.querySelector('[data-request-message-id="q"]')?.getAttribute('data-execution-kind')).toBe('conversation')
 expect(f.host.querySelector('[data-message-id="child-result"]')?.getAttribute('data-execution-kind')).toBe('component')
})
it('shows the sent message while its conversation task is still queued',async()=>{
 const f=await mount()
 f.view.tasks[0].status='pending'
 await f.emit()
 expect(f.host.querySelector('[data-message-id="q"]')?.textContent).toContain('请整理资料')
})
