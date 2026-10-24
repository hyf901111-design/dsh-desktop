// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { mountHomeGuides } from '../src/preload/home-guides'
let dispose = () => {}, off = () => {}
afterEach(async () => { await dispose(); off(); document.body.innerHTML = ''; delete document.documentElement.dataset.homeGuideTransition; delete document.documentElement.dataset.homeGuideTransitionSession; vi.useRealTimers() })
function fixture(fresh = true) {
 document.body.innerHTML = '<main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="original"><div data-srb-tabs><button data-conversation-view-id="chat" aria-selected="true">对话</button><button data-conversation-view-id="notes" aria-selected="false">笔记</button><button data-conversation-view-id="research" aria-selected="false">研究</button></div></header><div class="wSkVaW_scrollBody">已保存历史</div><div data-center-composer-host><textarea>原有草稿</textarea></div></div></main>'
 const header=document.querySelector<HTMLElement>('header')!, text=document.querySelector('textarea')!, requests:any[]=[]
 for(const button of header.querySelectorAll('button'))button.addEventListener('click',()=>{for(const tab of header.querySelectorAll('button'))tab.setAttribute('aria-selected',String(tab===button))})
 let prepare:((detail:any)=>void)|undefined, open:((detail:any,reply:(value:any)=>void)=>void)|undefined
 const listener=(event:Event)=>{const detail=(event as CustomEvent).detail;requests.push(detail)
  const reply=(result:any)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:detail.requestId,ok:true,...result}}))
  if(detail.command==='prepare'){if(prepare){prepare(detail);return}reply({sessionId:'example-'+detail.kind+(detail.replay?'-new':''),cwd:'/tmp/example',title:'已保存示例',fresh:detail.replay||fresh})}
  else if(detail.command==='open'){header.dataset.eworkNotesSession=detail.sessionId;if(open){open(detail,reply);return}reply({sessionId:detail.sessionId,cwd:'/tmp/example',title:'已保存示例'});window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))}
 }
 window.addEventListener('sherlock:home-guide-session-request',listener);off=()=>window.removeEventListener('sherlock:home-guide-session-request',listener)
 const runStep=vi.fn(async(_step:string)=>{}),release=vi.fn(),flush=vi.fn(async()=>{})
 const adapters={mountNotes:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush})),mountPresentation:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush}))}
 const controller=mountHomeGuides(document,adapters);dispose=controller.dispose
 return{controller,adapters,runStep,release,flush,text,header,requests,setOpen:(fn:(detail:any,reply:(value:any)=>void)=>void)=>{open=fn},setPrepare:(fn:(detail:any)=>void)=>{prepare=fn}}
}
test('prepares and opens an independent saved session before mounting the tutorial',async()=>{
 const f=fixture();await f.controller.start('note')
 expect(f.requests.map(r=>r.command)).toEqual(['prepare','open'])
 expect(f.adapters.mountNotes.mock.calls[0]?.[2]).toMatchObject({sessionId:'example-note',cwd:'/tmp/example',fresh:true})
 expect(f.header.dataset.eworkNotesSession).toBe('example-note');expect(f.text.value).toBe('原有草稿')
 await f.controller.reset();expect(f.release).toHaveBeenCalledOnce();expect(f.header.dataset.eworkNotesSession).toBe('example-note')
})
test('gives the introduction reading time and offers next without prematurely executing content',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('note');await vi.advanceTimersByTimeAsync(1000)
 expect(f.runStep).not.toHaveBeenCalled();expect(document.querySelector('[role=status]')?.textContent).toContain('研究笔记')
 const next=document.querySelector<HTMLButtonElement>('[data-home-guide-next]')!;expect(next).not.toBeNull();next.click()
 await vi.advanceTimersByTimeAsync(0);expect(f.runStep).toHaveBeenCalledWith('write')
})
test('PPT keeps the real history and input usable instead of mounting a replacement page',async()=>{
 const f=fixture();await f.controller.start('ppt')
 expect(f.text.closest<HTMLElement>('.wSkVaW_root')?.dataset.homeGuideLive).toBe('true')
 expect(f.text.parentElement?.inert).not.toBe(true);expect(document.querySelector<HTMLElement>('.wSkVaW_scrollBody')?.inert).not.toBe(true)
 expect(f.adapters.mountPresentation.mock.calls[0]?.[2]).toMatchObject({sessionId:'example-ppt',fresh:true})
})
test('flushes the note before releasing its view and never restores an old session',async()=>{
 const f=fixture();await f.controller.start('note');let finish!:()=>void
 f.flush.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}))
 const closing=f.controller.reset();expect(f.flush).toHaveBeenCalledOnce();expect(f.release).not.toHaveBeenCalled()
 expect(document.querySelector('[data-home-guide]')).not.toBeNull();finish();await closing
 expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull();expect(f.header.dataset.eworkNotesSession).toBe('example-note')
})
test('does not open a late prepared example after the user navigates elsewhere',async()=>{
 const f=fixture();let delayed:any;f.setPrepare(detail=>{delayed=detail})
 const starting=f.controller.start('note');await Promise.resolve();await Promise.resolve()
 f.header.dataset.eworkNotesSession='elsewhere';window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))
 window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:delayed.requestId,ok:true,sessionId:'example-note',cwd:'/tmp/example',title:'示例',fresh:true}}))
 await expect(starting).rejects.toMatchObject({name:'AbortError'});expect(f.requests.filter(r=>r.command==='open')).toHaveLength(0);expect(f.header.dataset.eworkNotesSession).toBe('elsewhere')
})
test('revisits the saved example without replaying over it and replay requests a fresh copy',async()=>{
 const f=fixture(false);await f.controller.start('note');await Promise.resolve()
 expect(f.runStep).not.toHaveBeenCalled();expect(document.querySelector('[role=status]')?.textContent).toContain('保留')
 await f.controller.start('note',{replay:true})
 expect(f.requests.filter(r=>r.command==='prepare').at(-1)?.replay).toBe(true);expect(f.header.dataset.eworkNotesSession).toBe('example-note-new')
})

 test('respects a manual tab click while an owned open acknowledgement is pending',async()=>{
  const f=fixture();let reply:((value:any)=>void)|undefined
  f.setOpen((_detail,done)=>{reply=done})
  const starting=f.controller.start('note');const result=starting.catch(error=>error.name)
  await vi.waitFor(()=>expect(reply).toBeTypeOf('function'))
  f.header.querySelector<HTMLButtonElement>('[data-conversation-view-id=chat]')!.click()
  reply!({sessionId:'example-note',cwd:'/tmp/example',title:'示例'})
  expect(await result).toBe('AbortError');expect(document.querySelector('[data-home-guide]')).toBeNull()
 })

test('reports a failed save after leaving without trapping navigation or claiming success',async()=>{
 const f=fixture();await f.controller.start('note');f.flush.mockRejectedValueOnce(Error('版本冲突，请保留草稿后重试'))
 await f.controller.reset(false)
 expect(document.querySelector('[data-home-guide]')).toBeNull();expect(document.querySelector('[role=alert]')?.textContent).toContain('版本冲突')
 expect(f.header.dataset.eworkNotesSession).toBe('example-note');expect(f.release).toHaveBeenCalledOnce()
})

test('a board action can remain paused for more than its active timeout budget',async()=>{
 vi.useFakeTimers();const f=fixture();let pending:any
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.command==='mount-board')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,ok:true}}));else if(detail.command!=='dispose')pending=detail}
 window.addEventListener('sherlock:home-guide-native-request',receive)
 try{
  await f.controller.start('board');await vi.advanceTimersByTimeAsync(0);document.querySelector<HTMLButtonElement>('[data-home-guide-next]')!.click();await vi.advanceTimersByTimeAsync(0);expect(pending.command).toBe('board-library')
  document.querySelector<HTMLButtonElement>('.odyssey-home-guide-footer button')!.click();await vi.advanceTimersByTimeAsync(35000)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused')
  document.querySelector<HTMLButtonElement>('.odyssey-home-guide-footer button')!.click()
  window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:pending.requestId,runId:pending.runId,ok:true}}));await vi.advanceTimersByTimeAsync(10)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing')
 }finally{window.removeEventListener('sherlock:home-guide-native-request',receive)}
})

test('reveals the native conversation only after a still-owned handover has finished',async()=>{
 const f=fixture(),reveal=vi.fn();await f.controller.dispose()
 const save=vi.fn(async()=>{}),controller=mountHomeGuides(document,{...f.adapters,beforeOpen:save,revealConversation:reveal});dispose=controller.dispose
 await controller.start('note');expect(save).toHaveBeenCalledOnce();expect(reveal).toHaveBeenCalledOnce()
 await controller.reset(false);let finish!:()=>void;save.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}));reveal.mockClear()
 const starting=controller.start('note').catch(error=>error.name);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 const sidebar=document.createElement('aside');sidebar.setAttribute('data-dsh-sidebar-root','');sidebar.innerHTML='<button>打开技能页面</button>';document.body.append(sidebar);sidebar.querySelector('button')!.click();document.body.dataset.workspaceSurface='integrations';finish()
 expect(await starting).toBe('AbortError');expect(reveal).not.toHaveBeenCalled();delete document.body.dataset.workspaceSurface
})
test('PPT gives readable phase holds and consistently describes an offline walkthrough',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('ppt');await vi.advanceTimersByTimeAsync(0)
 expect(document.querySelector('[role=status]')?.textContent).toContain('离线')
 // Skip the introduction only; the actual brief, source/structure and layout
 // holds remain on the shared pause clock and cannot blink past the reader.
 document.querySelector<HTMLButtonElement>('[data-home-guide-next]')!.click();await vi.advanceTimersByTimeAsync(0)
 expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief'])
 await vi.advanceTimersByTimeAsync(6499);expect(f.runStep).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send'])
 await vi.advanceTimersByTimeAsync(2500);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan'])
 await vi.advanceTimersByTimeAsync(8499);expect(f.runStep).toHaveBeenCalledTimes(3)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan','layout'])
 expect(document.querySelector('[role=status]')?.textContent).not.toContain('正在完成公司模板排版')
 await vi.advanceTimersByTimeAsync(7499);expect(f.runStep).toHaveBeenCalledTimes(4)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan','layout','deliver'])
})
