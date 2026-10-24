// @vitest-environment happy-dom
import {afterEach,expect,test,vi} from 'vitest'
import {mountHomeGuides} from '../src/preload/home-guides'
let dispose:()=>unknown=()=>{},off=()=>{}
const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden')
afterEach(async()=>{await dispose();off();document.body.innerHTML='';hiddenDescriptor?Object.defineProperty(document,'hidden',hiddenDescriptor):delete (document as any).hidden;vi.useRealTimers()})
function fixture(){
 document.body.innerHTML='<main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="a"><button id="header-action">会话操作</button></header><div class="wSkVaW_scrollBody"><p>原生历史</p></div><div data-center-composer-host><textarea>已有草稿</textarea></div></div></main><aside data-dsh-sidebar-root><button id="another-session">另一会话</button></aside>'
 const listener=(event:Event)=>{const d=(event as CustomEvent).detail;if(d.command==='open')document.querySelector<HTMLElement>('header')!.dataset.eworkNotesSession=d.sessionId;window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:d.requestId,ok:true,sessionId:d.command==='open'?d.sessionId:'sample-note',cwd:'/tmp/sample',title:'示例笔记',fresh:true}}))}
 window.addEventListener('sherlock:home-guide-session-request',listener);off=()=>window.removeEventListener('sherlock:home-guide-session-request',listener)
 const runStep=vi.fn(async()=>{}),release=vi.fn(),mountNotes=vi.fn(async(_doc:Document,_host:HTMLElement,_options:any)=>({runStep,dispose:release}))
 const controller=mountHomeGuides(document,{mountNotes,mountPresentation:mountNotes});dispose=controller.dispose
 return{controller,runStep,release,mountNotes,text:document.querySelector('textarea')!}
}
test('does not autoplay a late mount after the page became hidden while preparing',async()=>{
 const f=fixture();let hidden=false,resolve!:(value:any)=>void
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden})
 f.mountNotes.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const pending=f.controller.start('note');await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'))
 hidden=true;document.dispatchEvent(new Event('visibilitychange'));resolve({runStep:f.runStep,dispose:f.release});await pending
 expect(f.runStep).not.toHaveBeenCalled();expect(document.querySelector('.odyssey-home-guide-footer button')?.textContent).toBe('继续播放')
})
test('keeps the underlying note input inert but the real session header navigable',async()=>{
 const f=fixture();await f.controller.start('note')
 expect(f.text.parentElement?.inert).toBe(true);expect(document.querySelector<HTMLElement>('.wSkVaW_scrollBody')?.inert).toBe(true)
 expect(document.querySelector<HTMLElement>('header')?.inert).not.toBe(true)
 await f.controller.reset();expect(f.text.parentElement?.inert).toBe(false);expect(f.text.value).toBe('已有草稿')
})
test('acknowledges a scoped visual pointer only after travel and a click pulse without invoking the target',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('note');const target=document.getElementById('header-action')!,clicked=vi.fn(),replies:any[]=[]
 target.addEventListener('click',clicked);const focused=document.activeElement
 target.getBoundingClientRect=()=>({left:20,top:30,width:90,height:30,right:110,bottom:60,x:20,y:30,toJSON:()=>({})})
 const id=document.querySelector<HTMLElement>('[data-home-guide]')!.dataset.homeGuide
 const receive=(event:Event)=>replies.push((event as CustomEvent).detail);window.addEventListener('sherlock:home-guide-cue-reply',receive)
 window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:'old-run',requestId:'old',target,label:'陈旧提示'}}))
 expect(document.querySelector<HTMLElement>('.odyssey-home-guide-pointer')?.hidden).toBe(true);expect(replies[0]).toMatchObject({requestId:'old',ok:false})
 window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:id,requestId:'current',target,label:'点击 AI 挑战'}}))
 expect(document.querySelector('[role=status]')?.textContent).toBe('点击 AI 挑战')
 await vi.advanceTimersByTimeAsync(200);expect(document.querySelector<HTMLElement>('.odyssey-home-guide-pointer')?.hidden).toBe(false);expect(replies).toHaveLength(1)
 await vi.advanceTimersByTimeAsync(900);expect(replies[1]).toMatchObject({requestId:'current',ok:true});expect(clicked).not.toHaveBeenCalled();expect(document.activeElement).toBe(focused)
 await f.controller.reset();expect(document.querySelector('.odyssey-home-guide-pointer')).toBeNull();window.removeEventListener('sherlock:home-guide-cue-reply',receive)
})
test('manual navigation stops playback and reveals the saved native surface',async()=>{
 const f=fixture();await f.controller.start('note');document.getElementById('another-session')!.click()
 await Promise.resolve();expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull()
})
