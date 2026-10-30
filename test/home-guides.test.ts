// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { mountHomeGuides } from '../src/preload/home-guides'
let dispose = () => {}, off = () => {}
const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden')
const focusDescriptor=Object.getOwnPropertyDescriptor(document,'hasFocus')
function focus(focused:boolean){Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>focused});window.dispatchEvent(new Event(focused?'focus':'blur'))}
function visibility(hidden:boolean){Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'))}
afterEach(async () => { await dispose(); off(); document.body.innerHTML = ''; delete document.documentElement.dataset.homeGuideTransition; delete document.documentElement.dataset.homeGuideTransitionSession;hiddenDescriptor?Object.defineProperty(document,'hidden',hiddenDescriptor):delete(document as any).hidden;focusDescriptor?Object.defineProperty(document,'hasFocus',focusDescriptor):delete(document as any).hasFocus; vi.useRealTimers() })
function fixture(fresh = true) {
 focus(true)
 document.body.innerHTML = '<main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="original"><div data-srb-tabs><button data-conversation-view-id="chat" aria-selected="true">对话</button><button data-conversation-view-id="notes" aria-selected="false">笔记</button><button data-conversation-view-id="research" aria-selected="false">研究</button></div></header><div class="wSkVaW_scrollBody">已保存历史</div><div data-center-composer-host><textarea>原有草稿</textarea></div></div></main>'
 const header=document.querySelector<HTMLElement>('header')!, text=document.querySelector('textarea')!, requests:any[]=[]
 for(const button of header.querySelectorAll('button'))button.addEventListener('click',()=>{for(const tab of header.querySelectorAll('button'))tab.setAttribute('aria-selected',String(tab===button))})
 let prepare:((detail:any)=>void)|undefined, open:((detail:any,reply:(value:any)=>void)=>void)|undefined
 const listener=(event:Event)=>{const detail=(event as CustomEvent).detail;requests.push(detail)
  const reply=(result:any)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:detail.requestId,ok:true,...result}}))
  if(detail.command==='prepare'){if(prepare){prepare(detail);return}reply({sessionId:'example-'+detail.kind+(detail.replay?'-new':''),cwd:'/tmp/example',title:'已保存示例',fresh:detail.replay||fresh})}
  else if(detail.command==='open'){header.dataset.eworkNotesSession=detail.sessionId;if(open){open(detail,reply);return}reply({sessionId:detail.sessionId,cwd:'/tmp/example',title:'已保存示例'});window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))}
  else if(detail.command==='activate-title')reply({sessionId:detail.sessionId,cwd:'/tmp/example',title:'已保存示例'})
 }
 window.addEventListener('sherlock:home-guide-session-request',listener);off=()=>window.removeEventListener('sherlock:home-guide-session-request',listener)
 const runStep=vi.fn(async(_step:string)=>{}),release=vi.fn(),flush=vi.fn(async()=>{})
 const adapters={mountWorkbench:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush})),prepareHandoff:vi.fn(async(_session:any,_signal:AbortSignal):Promise<void|(()=>void)>=>{}),mountNotes:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush})),mountPresentation:vi.fn(async(_document:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release,flush}))}
 const controller=mountHomeGuides(document,adapters);dispose=controller.dispose
 return{controller,adapters,runStep,release,flush,text,header,requests,setOpen:(fn:(detail:any,reply:(value:any)=>void)=>void)=>{open=fn},setPrepare:(fn:(detail:any)=>void)=>{prepare=fn}}
}
test.each(['ppt','report','note'] as const)('defers the %s title until its actual send or initial write succeeds',async kind=>{
 vi.useFakeTimers();const f=fixture(),order:string[]=[];let sent!:()=>void
 f.runStep.mockImplementation(async step=>{order.push(step);if(step===(kind==='note'?'write':'send'))await new Promise<void>(resolve=>{sent=resolve})})
 await f.controller.start(kind,{replay:true});await vi.advanceTimersByTimeAsync(1800)
 expect(order).toEqual(kind==='note'?['write']:['brief','send']);expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
 sent();await vi.advanceTimersByTimeAsync(0)
 expect(f.requests.filter(row=>row.command==='activate-title')).toEqual([expect.objectContaining({kind,sessionId:'example-'+kind+'-new'})])
 await f.controller.reset(false)
})
test.each(['reject','cancel'])('does not rename when a send checkpoint is %s',async outcome=>{
 vi.useFakeTimers();const f=fixture();let fail!:(error:Error)=>void,finish!:()=>void
 f.runStep.mockImplementation(async step=>{if(step==='send')await new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject})})
 await f.controller.start('ppt',{replay:true});await vi.advanceTimersByTimeAsync(1800)
 if(outcome==='reject')fail(Error('发送未被接纳'));else{await f.controller.reset(false);finish()}
 await vi.advanceTimersByTimeAsync(0);expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
})
test('waits for foreground playback when an admitted send finishes while hidden',async()=>{
 vi.useFakeTimers();const f=fixture();let sent!:()=>void
 f.runStep.mockImplementation(async step=>{if(step==='send')await new Promise<void>(resolve=>{sent=resolve})})
 await f.controller.start('ppt',{replay:true});await vi.advanceTimersByTimeAsync(1800);visibility(true);sent();await vi.advanceTimersByTimeAsync(0)
 expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
 visibility(false);await vi.advanceTimersByTimeAsync(0);expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(1)
 await f.controller.reset(false)
})
test.each([true,false])('names the board only after its first component is persisted (%s)',async accepted=>{
 vi.useFakeTimers();const f=fixture();let finish!:(ok:boolean)=>void
 const native=(event:Event)=>{const detail=(event as CustomEvent).detail,reply=(ok=true)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,ok,message:ok?undefined:'组件未保存'}}));if(detail.command==='board-indices')finish=reply;else reply()}
 window.addEventListener('sherlock:home-guide-native-request',native)
 try{await f.controller.start('board',{replay:true});await vi.advanceTimersByTimeAsync(1100)
  expect(finish).toBeTypeOf('function');expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
  finish(accepted);await vi.advanceTimersByTimeAsync(0)
  expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(accepted?1:0)
 }finally{window.removeEventListener('sherlock:home-guide-native-request',native);await f.controller.reset(false)}
})
function operationsEntryFixture(){
 const f=fixture(),center=document.querySelector<HTMLElement>('.pI_x6G_centerCol')!,resident=f.header.parentElement!,card=document.createElement('div'),back=document.createElement('button'),events:string[]=[],abort=new AbortController()
 resident.dataset.odysseyPage='home';card.className='odyssey-operations-usecase';back.dataset.odysseyHomeOperationsToggle='';center.append(card,back)
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON:()=>({})})
 card.getBoundingClientRect=()=>rect(140,160,420,140);back.getBoundingClientRect=()=>rect(330,350,32,32)
 for(const[ i,tab]of [...f.header.querySelectorAll<HTMLButtonElement>('button')].entries()){tab.getBoundingClientRect=()=>rect(100+i*80,20,72,30);tab.addEventListener('click',()=>events.push('tab:'+tab.dataset.conversationViewId))}
 back.addEventListener('click',()=>events.push('return'))
 const context={signal:abort.signal,revealComposer:vi.fn(async()=>back.click()),handoff:vi.fn()}
 f.setPrepare(detail=>{events.push('prepare');window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:detail.requestId,ok:true,sessionId:'example-note-new',cwd:'/tmp/example',title:'已保存示例',fresh:true}}))})
 f.setOpen((detail,reply)=>{events.push('open');reply({sessionId:detail.sessionId,cwd:'/tmp/example'})})
 return{...f,center,card,back,events,abort,context}
}
test('prepares the separate example while approaching the real Notes tab, before leaving the source composer',async()=>{
 vi.useFakeTimers();const f=operationsEntryFixture(),pending=f.controller.start('note',{replay:true,entry:f.context} as any)
 await vi.advanceTimersByTimeAsync(2600);await pending
 expect(f.events.slice(0,4)).toEqual(['return','prepare','tab:notes','open']);expect(f.context.handoff).toHaveBeenCalledOnce();expect(f.text.value).toBe('原有草稿')
 await f.controller.reset(false);expect(document.querySelector('[data-home-guide-pointer]')).toBeNull()
})
test.each(['ppt','report'] as const)('opens the independent %s composer without clicking the source Chat tab',async kind=>{
 vi.useFakeTimers();const f=operationsEntryFixture(),pending=f.controller.start(kind,{replay:true,entry:f.context} as any)
 await vi.advanceTimersByTimeAsync(2600);await pending
 expect(f.events).toEqual(['return','prepare','open']);expect(f.context.handoff).toHaveBeenCalledOnce();expect(f.text.value).toBe('原有草稿')
 await f.controller.reset(false)
})
test.each(['abort','draft','composition','navigation','escape'])('cancels an operations entry on %s before any independent session is prepared',async change=>{
 vi.useFakeTimers();const f=operationsEntryFixture(),pending=f.controller.start('note',{replay:true,entry:f.context} as any).then(()=>null,error=>error)
 await vi.advanceTimersByTimeAsync(64)
 if(change==='abort')f.abort.abort();else if(change==='draft'){f.text.value='保留我刚输入的新草稿📈';f.text.dispatchEvent(new Event('input',{bubbles:true}))}else if(change==='composition')f.text.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));else if(change==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else f.header.querySelector<HTMLButtonElement>('[data-conversation-view-id="research"]')!.click()
 await vi.advanceTimersByTimeAsync(1600)
 expect(await pending).toMatchObject({name:'AbortError'});expect(f.requests).toEqual([]);expect(f.context.handoff).not.toHaveBeenCalled();expect(document.querySelector('[data-home-guide-pointer]')).toBeNull()
 expect(f.text.value).toBe(change==='draft'?'保留我刚输入的新草稿📈':'原有草稿')
})
test('keeps a failed real composer return visible without preparing a guide',async()=>{
 vi.useFakeTimers();const f=operationsEntryFixture(),error=Error('输入区尚未就绪');f.context.revealComposer.mockRejectedValue(error)
 const pending=f.controller.start('note',{replay:true,entry:f.context}).then(()=>null,error=>error);await vi.advanceTimersByTimeAsync(1600)
 expect(await pending).toBe(error);expect(f.requests).toEqual([]);expect(f.context.handoff).not.toHaveBeenCalled();expect(document.querySelector('[data-home-guide-pointer]')).toBeNull()
})
test('does not continue after cancellation during the real input handover wait',async()=>{
 vi.useFakeTimers();const f=operationsEntryFixture();let reveal!:()=>void
 f.context.revealComposer.mockImplementation(()=>{f.back.click();return new Promise<void>(resolve=>{reveal=resolve})})
 const pending=f.controller.start('note',{replay:true,entry:f.context}).then(()=>null,error=>error)
 await vi.advanceTimersByTimeAsync(900);expect(f.context.revealComposer).toHaveBeenCalledOnce();f.abort.abort();reveal();await vi.advanceTimersByTimeAsync(0)
 expect(await pending).toMatchObject({name:'AbortError'});expect(f.events).toEqual(['return']);expect(f.requests).toEqual([]);expect(f.context.handoff).not.toHaveBeenCalled();expect(f.text.value).toBe('原有草稿');expect(document.querySelector('[data-home-guide-pointer]')).toBeNull()
})
test('holds a prepared entry while the platform focus gate is paused and resumes without repeating preparation',async()=>{
 vi.useFakeTimers();const f=operationsEntryFixture();let complete!:()=>void
 f.setPrepare(detail=>{f.events.push('prepare');complete=()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:detail.requestId,ok:true,sessionId:'example-note-new',cwd:'/tmp/example',title:'已保存示例',fresh:true}}))})
 const pending=f.controller.start('note',{replay:true,entry:f.context});await vi.advanceTimersByTimeAsync(1600);expect(complete).toBeTypeOf('function')
 focus(false);complete();await vi.advanceTimersByTimeAsync(1500);expect(f.events).toEqual(['return','prepare']);expect(f.context.handoff).not.toHaveBeenCalled()
 focus(true);await vi.advanceTimersByTimeAsync(1600);await pending;expect(f.events).toEqual(['return','prepare','tab:notes','open']);expect(f.requests.filter(request=>request.command==='prepare')).toHaveLength(1)
})
test('does not open the prepared example when the actual native tab did not accept its mode action',async()=>{
 vi.useFakeTimers();const f=operationsEntryFixture(),tab=f.header.querySelector<HTMLButtonElement>('[data-conversation-view-id="notes"]')!
 tab.addEventListener('click',event=>event.stopImmediatePropagation(),true)
 const pending=f.controller.start('note',{replay:true,entry:f.context}).then(()=>null,error=>error);await vi.advanceTimersByTimeAsync(3000)
 expect(await pending).toMatchObject({message:'模式入口尚未就绪，请重试。'});expect(f.requests.map(request=>request.command)).toEqual(['prepare']);expect(f.text.value).toBe('原有草稿');expect(document.querySelector('[data-home-guide-pointer]')).toBeNull()
})
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
 await vi.advanceTimersByTimeAsync(1099);expect(f.runStep).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','note-chart-compose'])
})
test('PPT keeps the real history and input usable instead of mounting a replacement page',async()=>{
 const f=fixture();await f.controller.start('ppt')
 expect(f.text.closest<HTMLElement>('.wSkVaW_root')?.dataset.homeGuideLive).toBe('true')
 expect(f.text.parentElement?.inert).not.toBe(true);expect(document.querySelector<HTMLElement>('.wSkVaW_scrollBody')?.inert).not.toBe(true)
 expect(f.adapters.mountPresentation.mock.calls[0]?.[2]).toMatchObject({sessionId:'example-ppt',fresh:true})
})
test.each(['note','ppt','report'] as const)('does not add a token notice over the %s example',async kind=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start(kind)
 const notice=document.querySelector<HTMLElement>('.odyssey-home-guide-mode-notice')
 expect(notice).toBeNull()
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
 const scenes:[string,number][]=[['board-library',900],['board-indices',1400],['board-watchlist',1100],['board-quote',1100],['board-arrange-foundation',1800],['board-news',1100],['board-announcements',1200],['board-calendar',1000],['board-arrange',3000],['board-link',2200],['board-add',2200],['board-smart-container',1000],['board-smart-generate',3000]]
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
   if(index===7){
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
  expect(commands).toEqual(['mount-board','board-library','board-indices','board-watchlist','board-quote','board-arrange-foundation','board-news','board-announcements','board-calendar'])
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
  await f.controller.start('board');await vi.advanceTimersByTimeAsync(14800);expect(adding).toBe(true)
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
 expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace','note-select-paragraph','note-rewrite','note-rewrite-apply','note-task-compose','note-task-review','note-task-apply','note-task-saved','note-return-top']);expect(f.flush).toHaveBeenCalledOnce();expect(f.release).toHaveBeenCalledOnce()
 expect(document.querySelector('[data-home-guide]')).toBeNull();expect(document.querySelector('.odyssey-home-guide-pointer')).toBeNull();expect(f.text.parentElement?.inert).toBe(false)
})
test('keeps mount and completion save faults visible without playback controls',async()=>{
 vi.useFakeTimers();const f=fixture();f.adapters.mountNotes.mockRejectedValueOnce(Error('笔记打开失败'));await f.controller.start('note')
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error');expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('笔记打开失败');expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(false)
 await f.controller.reset();f.flush.mockRejectedValueOnce(Error('保存冲突'));await f.controller.start('note');await vi.advanceTimersByTimeAsync(50000)
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('error');expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('保存冲突');expect(document.querySelector('.odyssey-home-guide-fault')?.hasAttribute('hidden')).toBe(false)
})

// A token-owned note selection is the only cue that may publish live drag frames.
function dragTarget(token:string,x:number,y:number){
 const node=document.createElement('span');node.setAttribute('data-home-guide-cue-target',token);node.getBoundingClientRect=()=>({left:x,top:y,right:x+2,bottom:y+2,width:2,height:2,x,y,toJSON(){return{}}});document.body.append(node);return node
}
test('publishes live JSON selection frames from the same note pointer drag before acknowledgement',async()=>{
 vi.useFakeTimers();const f=fixture();f.runStep.mockImplementation(()=>new Promise(()=>{}));await f.controller.start('note')
 const runId=document.documentElement.dataset.homeGuidePointerRun!,requestId='selection-one',targetToken=runId+':'+requestId+':target',fromTargetToken=runId+':'+requestId+':from'
 dragTarget(fromTargetToken,120,140);dragTarget(targetToken,400,260)
 const frames:any[]=[],replies:any[]=[],receive=(event:Event)=>frames.push((event as CustomEvent).detail),reply=(event:Event)=>replies.push((event as CustomEvent).detail)
 window.addEventListener('sherlock:home-guide-cue-progress',receive);window.addEventListener('sherlock:home-guide-cue-reply',reply)
 try{
  window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId,requestId,targetToken,fromTargetToken,action:'drag',selection:true}}))
  await vi.advanceTimersByTimeAsync(800)
  const moving=frames.filter(frame=>frame.phase==='dragging');expect(moving.length).toBeGreaterThan(2);expect(replies).toEqual([])
  expect(new Set(moving.map(frame=>frame.x)).size).toBeGreaterThan(2)
  for(const frame of frames){expect(frame.runId).toBe(runId);expect(frame.requestId).toBe(requestId);expect(Number.isFinite(frame.x)&&Number.isFinite(frame.y)).toBe(true);expect(JSON.parse(JSON.stringify(frame))).toEqual(frame);expect(Object.values(frame).every(value=>['string','number'].includes(typeof value))).toBe(true)}
  await vi.advanceTimersByTimeAsync(1000);expect(frames.some(frame=>frame.phase==='released')).toBe(true);expect(replies).toEqual([{runId,requestId,ok:true,message:undefined}])
 }finally{window.removeEventListener('sherlock:home-guide-cue-progress',receive);window.removeEventListener('sherlock:home-guide-cue-reply',reply)}
})
test.each([['note',false],['ppt',true]] as const)('does not publish selection frames for %s cues without a note selection lease',async(kind,selection)=>{
 vi.useFakeTimers();const f=fixture();f.runStep.mockImplementation(()=>new Promise(()=>{}));await f.controller.start(kind)
 const runId=document.documentElement.dataset.homeGuidePointerRun!,requestId='no-selection',targetToken=runId+':'+requestId+':target',fromTargetToken=runId+':'+requestId+':from'
 dragTarget(fromTargetToken,120,140);dragTarget(targetToken,400,260)
 const frames:any[]=[],receive=(event:Event)=>frames.push((event as CustomEvent).detail);window.addEventListener('sherlock:home-guide-cue-progress',receive)
 try{window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId,requestId,targetToken,fromTargetToken,action:'drag',selection}}));await vi.advanceTimersByTimeAsync(1800);expect(frames).toEqual([])}finally{window.removeEventListener('sherlock:home-guide-cue-progress',receive)}
})

test('pauses a newly opened note before its first actor action when the native editor has no window focus',async()=>{
 vi.useFakeTimers();const f=fixture();focus(false);await f.controller.start('note');await vi.advanceTimersByTimeAsync(35000)
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused');expect(f.runStep).not.toHaveBeenCalled()
 focus(true);await vi.advanceTimersByTimeAsync(0);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write'])
})
test('preserves a note review readiness budget across window blur and resumes the same step on focus',async()=>{
 vi.useFakeTimers();const f=fixture();let reviewed=false
 f.runStep.mockImplementation(async step=>{if(step==='review'){await f.adapters.mountNotes.mock.calls[0]![2].wait(10000);reviewed=true}})
 await f.controller.start('note');await vi.advanceTimersByTimeAsync(11300);expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review'])
 await vi.advanceTimersByTimeAsync(500);focus(false);await vi.advanceTimersByTimeAsync(35000)
 expect(reviewed).toBe(false);expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused');expect(f.release).not.toHaveBeenCalled()
 focus(true);await vi.advanceTimersByTimeAsync(9499);expect(reviewed).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(reviewed).toBe(true)
 expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('playing');expect(f.runStep.mock.calls.map(call=>call[0])).toEqual(['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review'])
 await f.controller.reset(false);focus(false);focus(true);await vi.advanceTimersByTimeAsync(35000);expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull()
})

test('plays the workbench in research mode with the real composer alive and hands off the same session',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('workbench',{replay:true});await vi.advanceTimersByTimeAsync(0)
 expect(f.adapters.mountWorkbench).toHaveBeenCalledOnce()
 expect(f.header.querySelector('[data-conversation-view-id="research"]')?.getAttribute('aria-selected')).toBe('true')
 expect(f.text.closest('.wSkVaW_root')?.getAttribute('data-home-guide-live')).toBe('true')
 expect(f.text.parentElement?.inert).not.toBe(true)
 expect(f.runStep).toHaveBeenCalledWith('wb-00')
 expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
 await vi.advanceTimersByTimeAsync(10000)
 expect(f.requests.filter(row=>row.command==='activate-title')).toEqual([expect.objectContaining({kind:'workbench',sessionId:'example-workbench-new'})])
 await vi.advanceTimersByTimeAsync(90000)
 expect(f.runStep.mock.calls.map(row=>row[0])).toEqual(Array.from({length:25},(_,i)=>'wb-'+String(i).padStart(2,'0')))
 expect(f.flush).toHaveBeenCalledOnce();expect(f.release).toHaveBeenCalledOnce()
 expect(document.querySelector('[data-home-guide]')).toBeNull();expect(f.header.dataset.eworkNotesSession).toBe('example-workbench-new')
})

test('pauses the workbench when the native window loses focus and resumes at the same stage',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('workbench');await vi.advanceTimersByTimeAsync(0)
 focus(false);const count=f.runStep.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(f.runStep).toHaveBeenCalledTimes(count)
 focus(true);await vi.advanceTimersByTimeAsync(10000);expect(f.runStep.mock.calls.length).toBeGreaterThan(count)
 await f.controller.reset(false);expect(f.flush).toHaveBeenCalledOnce();expect(f.release).toHaveBeenCalledOnce()
})

test('opens a saved workbench directly without mounting a fresh-only actor or replaying over edits',async()=>{
 const f=fixture(false);f.adapters.mountWorkbench.mockRejectedValue(Error('请使用独立的空白研究示例。'))
 await f.controller.start('workbench')
 expect(f.adapters.mountWorkbench).not.toHaveBeenCalled();expect(f.runStep).not.toHaveBeenCalled()
 expect(f.header.dataset.eworkNotesSession).toBe('example-workbench')
 expect(f.header.querySelector('[data-conversation-view-id="research"]')?.getAttribute('aria-selected')).toBe('true')
 expect(f.text.value).toBe('原有草稿');expect(document.querySelector('[data-home-guide]')).toBeNull()
 expect(f.header.parentElement?.hasAttribute('data-home-guide-resident')).toBe(false)
 expect(f.requests.filter(row=>row.command==='activate-title')).toHaveLength(0)
})
