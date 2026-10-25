// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { mountHomeGuides } from '../src/preload/home-guides'
let dispose = () => {}, off = () => {}
const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden')
function visibility(hidden:boolean){Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'))}
afterEach(async () => { await dispose(); off(); document.body.innerHTML = ''; delete document.documentElement.dataset.homeGuideTransition; delete document.documentElement.dataset.homeGuideTransitionSession;hiddenDescriptor?Object.defineProperty(document,'hidden',hiddenDescriptor):delete(document as any).hidden; vi.useRealTimers() })
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
 const adapters={prepareHandoff:vi.fn(async(_session:any,_signal:AbortSignal):Promise<void|(()=>void)>=>{}),mountNotes:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush})),mountPresentation:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush}))}
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
test.each(['board','note','ppt'] as const)('autoplays %s without playback controls and still exits through Escape',async kind=>{
 const f=fixture(),receive=(event:Event)=>{const d=(event as CustomEvent).detail;if(d.command!=='dispose')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:d.requestId,runId:d.runId,ok:true}}))}
 window.addEventListener('sherlock:home-guide-native-request',receive)
 try{
  await f.controller.start(kind);await Promise.resolve()
  expect(document.querySelector('[data-home-guide] [role=toolbar],.odyssey-home-guide-footer,[data-home-guide] [data-control]')).toBeNull()
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing')
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await Promise.resolve();await Promise.resolve()
  expect(document.querySelector('[data-home-guide]')).toBeNull();expect(f.text.value).toBe('原有草稿')
 }finally{window.removeEventListener('sherlock:home-guide-native-request',receive)}
})
test('starts the first real scene immediately and keeps reading time after its action',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('note');await vi.advanceTimersByTimeAsync(0)
 expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write'])
 expect(document.querySelector('[data-home-guide]')?.getAttribute('aria-label')).not.toContain('离线')
 expect(document.querySelector('[role=toolbar]')).toBeNull()
 await vi.advanceTimersByTimeAsync(1299);expect(f.runStep).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','challenge'])
})
test('PPT keeps the real history and input usable instead of mounting a replacement page',async()=>{
 const f=fixture();await f.controller.start('ppt')
 expect(f.text.closest<HTMLElement>('.wSkVaW_root')?.dataset.homeGuideLive).toBe('true')
 expect(f.text.parentElement?.inert).not.toBe(true);expect(document.querySelector<HTMLElement>('.wSkVaW_scrollBody')?.inert).not.toBe(true)
 expect(f.adapters.mountPresentation.mock.calls[0]?.[2]).toMatchObject({sessionId:'example-ppt',fresh:true})
})
test.each(['note','ppt'] as const)('briefly explains token-free %s playback below the header and removes the notice',async kind=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start(kind)
 const notice=document.querySelector<HTMLElement>('.odyssey-home-guide-mode-notice')
 expect(notice?.textContent).toBe('当前为演示模式，不消耗 Token')
 expect(notice?.closest('[data-home-guide]')).not.toBeNull()
 expect(document.querySelector('[data-center-composer-host] .odyssey-home-guide-mode-notice')).toBeNull()
 await vi.advanceTimersByTimeAsync(5300)
 expect(document.querySelector('.odyssey-home-guide-mode-notice')).toBeNull()
})
test('keeps the saved note visible until the ordinary editor is ready to take over',async()=>{
 vi.useFakeTimers();const f=fixture();let ready!:()=>void
 f.adapters.prepareHandoff.mockImplementationOnce(()=>new Promise<void>(resolve=>{ready=resolve}))
 await f.controller.start('note');await vi.advanceTimersByTimeAsync(50000)
 expect(f.flush).toHaveBeenCalledOnce()
 expect(f.adapters.prepareHandoff).toHaveBeenCalledWith(expect.objectContaining({kind:'note',sessionId:'example-note'}),expect.any(AbortSignal))
 expect(f.release).not.toHaveBeenCalled();expect(document.querySelector('[data-home-guide]')).not.toBeNull()
 ready();await vi.advanceTimersByTimeAsync(0)
 expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull()
})
test('commits a ready same-session note handoff before cancelling its preparation signal',async()=>{
 vi.useFakeTimers();const f=fixture(),shown=vi.fn()
 f.adapters.prepareHandoff.mockImplementationOnce(async(_session:any,signal:AbortSignal)=>()=>{if(!signal.aborted)shown()})
 await f.controller.start('note');await vi.advanceTimersByTimeAsync(50000)
 expect(shown).toHaveBeenCalledOnce();expect(f.release).toHaveBeenCalledOnce()
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
 expect(f.runStep).not.toHaveBeenCalled();expect(document.querySelector('[data-home-guide]')).toBeNull();expect(f.release).toHaveBeenCalledOnce();expect(f.text.parentElement?.inert).toBe(false)
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
  await f.controller.start('board');await vi.advanceTimersByTimeAsync(0);expect(pending.command).toBe('board-library')
  visibility(true);await vi.advanceTimersByTimeAsync(35000)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused')
  visibility(false)
  window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:pending.requestId,runId:pending.runId,ok:true}}));await vi.advanceTimersByTimeAsync(10)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing')
 }finally{window.removeEventListener('sherlock:home-guide-native-request',receive)}
})

test('builds all six board components after native readiness, with reading time after each completed action',async()=>{
 vi.useFakeTimers();const f=fixture(),commands:string[]=[];let mount:any,library:any
 const scenes:[string,number][]=[['board-library',900],['board-indices',1400],['board-watchlist',1100],['board-quote',1100],['board-news',1100],['board-announcements',1200],['board-calendar',1000],['board-link',2200],['board-add',2200],['board-arrange',3000],['board-smart-container',1000],['board-smart-generate',3000]]
 const reply=(detail:any)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,ok:true}}))
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;commands.push(detail.command);if(detail.command==='mount-board')mount=detail;else if(detail.command==='board-library')library=detail;else if(detail.command!=='dispose')reply(detail)}
 window.addEventListener('sherlock:home-guide-native-request',receive)
 try{
  const starting=f.controller.start('board');await vi.waitFor(()=>expect(mount).toBeDefined())
  await vi.advanceTimersByTimeAsync(5000);expect(commands).toEqual(['mount-board'])
  reply(mount);await starting;await vi.advanceTimersByTimeAsync(0)
  expect(commands).toEqual(['mount-board','board-library'])
  await vi.advanceTimersByTimeAsync(3000);expect(commands).toHaveLength(2)
  reply(library);await vi.advanceTimersByTimeAsync(0)
  expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(true)
  for(let index=0;index<scenes.length;index++){
   expect(commands).toEqual(['mount-board',...scenes.slice(0,index+1).map(scene=>scene[0])])
   const hold=scenes[index]![1]
   if(index===6){
    await vi.advanceTimersByTimeAsync(300);visibility(true)
    await vi.advanceTimersByTimeAsync(5000);expect(commands.at(-1)).toBe('board-calendar')
    visibility(false);await vi.advanceTimersByTimeAsync(hold-301)
   }else await vi.advanceTimersByTimeAsync(hold-1)
   expect(commands.at(-1)).toBe(scenes[index]![0]);await vi.advanceTimersByTimeAsync(1)
  }
  expect(commands).toEqual(['mount-board',...scenes.map(scene=>scene[0]),'dispose'])
  expect(document.querySelector('[data-home-guide]')).toBeNull();expect(f.header.dataset.eworkNotesSession).toBe('example-board');expect(f.text.value).toBe('原有草稿')
 }finally{window.removeEventListener('sherlock:home-guide-native-request',receive)}
})

test('stops the board on a failed calendar action before linking, selecting stocks or claiming a saved result',async()=>{
 vi.useFakeTimers();const f=fixture(),commands:string[]=[]
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;commands.push(detail.command);if(detail.command==='dispose')return;window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,ok:detail.command!=='board-calendar',message:detail.command==='board-calendar'?'日历工具未能打开':undefined}}))}
 window.addEventListener('sherlock:home-guide-native-request',receive)
 try{
  await f.controller.start('board');await vi.advanceTimersByTimeAsync(50000)
  expect(commands).toEqual(['mount-board','board-library','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar'])
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error')
  expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('日历工具未能打开')
  expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(false)
 }finally{window.removeEventListener('sherlock:home-guide-native-request',receive)}
})

test('keeps the stock search budget at ninety active seconds while excluding paused time',async()=>{
 vi.useFakeTimers();const f=fixture();let adding=false
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.command==='board-add'){adding=true;return}if(detail.command!=='dispose')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,ok:true}}))}
 window.addEventListener('sherlock:home-guide-native-request',receive)
 try{
  await f.controller.start('board');await vi.advanceTimersByTimeAsync(10000);expect(adding).toBe(true)
  await vi.advanceTimersByTimeAsync(35000);expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing')
  visibility(true);await vi.advanceTimersByTimeAsync(120000)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused')
  visibility(false);await vi.advanceTimersByTimeAsync(54999)
  expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing')
  await vi.advanceTimersByTimeAsync(1);expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error')
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
test('PPT assigns reading holds to the visible work without an introduction or bottom instruction slot',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('ppt');await vi.advanceTimersByTimeAsync(0)
 expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief'])
 expect(document.querySelector('.odyssey-home-guide-status')?.textContent).not.toContain('离线')
 expect(document.querySelector('.pI_x6G_centerCol')?.getAttribute('style')||'').not.toContain('controls-height')
 await vi.advanceTimersByTimeAsync(1599);expect(f.runStep).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send'])
 await vi.advanceTimersByTimeAsync(700);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan'])
 await vi.advanceTimersByTimeAsync(2599);expect(f.runStep).toHaveBeenCalledTimes(3)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan','layout'])
 await vi.advanceTimersByTimeAsync(2599);expect(f.runStep).toHaveBeenCalledTimes(4)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['brief','send','plan','layout','deliver'])
})

test('hands the saved scene back to the real client after completion',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('note');await vi.advanceTimersByTimeAsync(50000)
 expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','challenge','review','select','optimize','replace','consensus-select','consensus-evidence','consensus-optimize','consensus-replace','note-task-compose','note-task-review','note-task-apply','note-select-paragraph','note-rewrite','note-rewrite-apply','note-return-top']);expect(f.flush).toHaveBeenCalledOnce();expect(f.release).toHaveBeenCalledOnce()
 expect(document.querySelector('[data-home-guide]')).toBeNull();expect(document.querySelector('.odyssey-home-guide-pointer')).toBeNull();expect(f.text.parentElement?.inert).toBe(false)
})
test('keeps mount and completion save faults visible without playback controls',async()=>{
 vi.useFakeTimers();const f=fixture();f.adapters.mountNotes.mockRejectedValueOnce(Error('笔记打开失败'));await f.controller.start('note')
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error');expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('笔记打开失败');expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(false)
 await f.controller.reset();f.flush.mockRejectedValueOnce(Error('保存冲突'));await f.controller.start('note');await vi.advanceTimersByTimeAsync(50000)
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error');expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('保存冲突');expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(false)
})
