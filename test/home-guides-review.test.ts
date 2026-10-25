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
 expect(f.runStep).not.toHaveBeenCalled();expect(document.querySelector<HTMLElement>('[data-home-guide]')?.dataset.phase).toBe('paused');expect(document.querySelector('.odyssey-home-guide-footer')).toBeNull()
 hidden=false;document.dispatchEvent(new Event('visibilitychange'));await vi.waitFor(()=>expect(f.runStep).toHaveBeenCalledOnce())
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
 expect(document.querySelector('.odyssey-home-guide-status')?.textContent).toBe('点击 AI 挑战')
 await vi.advanceTimersByTimeAsync(200);expect(document.querySelector<HTMLElement>('.odyssey-home-guide-pointer')?.hidden).toBe(false);expect(replies).toHaveLength(1)
 await vi.advanceTimersByTimeAsync(900);expect(replies[1]).toMatchObject({requestId:'current',ok:true});expect(clicked).not.toHaveBeenCalled();expect(document.activeElement).toBe(focused)
 await f.controller.reset();expect(document.querySelector('.odyssey-home-guide-pointer')).toBeNull();window.removeEventListener('sherlock:home-guide-cue-reply',receive)
})
test('manual navigation stops playback and reveals the saved native surface',async()=>{
 const f=fixture();await f.controller.start('note');document.getElementById('another-session')!.click()
 await Promise.resolve();expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull()
})
test('keeps the current guide during a pure native sidebar layout toggle but still exits on session navigation',async()=>{
 const f=fixture(),sidebar=document.querySelector('[data-dsh-sidebar-root]')!,toggle=document.createElement('button')
 toggle.className='hHd-Xa_toggle';toggle.innerHTML='<span>折叠侧栏</span>';sidebar.prepend(toggle)
 let collapsed=false;toggle.addEventListener('click',()=>{collapsed=!collapsed})
 await f.controller.start('note');const guide=document.querySelector('[data-home-guide]')
 toggle.querySelector('span')!.click();await Promise.resolve()
 expect(collapsed).toBe(true);expect(document.querySelector('[data-home-guide]')).toBe(guide);expect(f.release).not.toHaveBeenCalled()
 document.getElementById('another-session')!.click();await Promise.resolve()
 expect(f.release).toHaveBeenCalledOnce();expect(document.querySelector('[data-home-guide]')).toBeNull()
})
test('resolves a serializable cue through its run-scoped DOM token and acknowledges the real target',async()=>{
 vi.useFakeTimers();const f=fixture();await f.controller.start('note');await vi.advanceTimersByTimeAsync(0)
 const target=document.getElementById('header-action')!,id=document.querySelector<HTMLElement>('[data-home-guide]')!.dataset.homeGuide!,requestId='native-world',token=id+':'+requestId+':target',replies:any[]=[]
 target.getBoundingClientRect=()=>({left:20,top:30,width:90,height:30,right:110,bottom:60,x:20,y:30,toJSON:()=>({})});target.setAttribute('data-home-guide-cue-target',token)
 const receive=(event:Event)=>replies.push((event as CustomEvent).detail);window.addEventListener('sherlock:home-guide-cue-reply',receive)
 try{const detail=JSON.parse(JSON.stringify({runId:id,requestId,targetToken:token,action:'click'}));window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail}));await vi.advanceTimersByTimeAsync(900);expect(replies).toEqual([{runId:id,requestId,ok:true}]);expect(document.querySelector<HTMLElement>('.odyssey-home-guide-pointer')?.dataset.state).toBe('idle')}
 finally{window.removeEventListener('sherlock:home-guide-cue-reply',receive)}
})
test('rejects missing, duplicate and other-request tokens without falling back to a supplied DOM reference',async()=>{
 const f=fixture();await f.controller.start('note');const target=document.getElementById('header-action')!,id=document.querySelector<HTMLElement>('[data-home-guide]')!.dataset.homeGuide!,replies:any[]=[]
 const receive=(event:Event)=>replies.push((event as CustomEvent).detail);window.addEventListener('sherlock:home-guide-cue-reply',receive)
 try{for(const requestId of['missing','duplicate','old']){const token=id+':'+requestId+':target';if(requestId==='duplicate'){target.setAttribute('data-home-guide-cue-target',token);const duplicate=document.createElement('div');duplicate.setAttribute('data-home-guide-cue-target',token);document.body.append(duplicate)}window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:id,requestId,targetToken:requestId==='old'?id+':other:target':token,target}}))}expect(replies).toHaveLength(3);expect(replies.every(reply=>reply.ok===false)).toBe(true);expect(document.querySelector<HTMLElement>('.odyssey-home-guide-pointer')?.hidden).toBe(true)}
 finally{window.removeEventListener('sherlock:home-guide-cue-reply',receive)}
})
