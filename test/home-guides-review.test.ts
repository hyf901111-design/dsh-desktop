// @vitest-environment happy-dom
import {afterEach,expect,test,vi} from 'vitest'
import {mountHomeGuides} from '../src/preload/home-guides'
import {createHomeGuideTimeline} from '../src/preload/home-guide-timeline'
let dispose=()=>{}
const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden')
afterEach(()=>{dispose();document.body.innerHTML='';hiddenDescriptor?Object.defineProperty(document,'hidden',hiddenDescriptor):delete (document as any).hidden;vi.useRealTimers()})
function fixture(){
 document.body.innerHTML='<main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="a"><button id="header-action">会话操作</button></header><div class="wSkVaW_scrollBody"><p>原生历史</p></div><div data-center-composer-host><textarea>已有草稿</textarea></div></div></main>'
 const runStep=vi.fn(async()=>{}),release=vi.fn(),mountNotes=vi.fn(async()=>({runStep,dispose:release}))
 const controller=mountHomeGuides(document,{mountNotes,mountPresentation:mountNotes});dispose=controller.dispose
 return{controller,runStep,release,mountNotes,text:document.querySelector('textarea')!}
}
test('does not automatically play a late mount after the page became hidden while preparing',async()=>{
 const f=fixture();let hidden=false,resolve!:(value:any)=>void
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden})
 f.mountNotes.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const pending=f.controller.start('note')
 hidden=true;document.dispatchEvent(new Event('visibilitychange'))
 resolve({runStep:f.runStep,dispose:f.release});await pending;await Promise.resolve()
 expect(f.runStep).not.toHaveBeenCalled()
 expect(document.querySelector('.odyssey-home-guide-footer button')?.textContent).toBe('继续')
})
test('makes the actual native history and active composer inert while leaving the session header usable',async()=>{
 const f=fixture();f.text.focus();await f.controller.start('note')
 const blocked=(element:HTMLElement)=>{for(let node:HTMLElement|null=element;node;node=node.parentElement){if(node.inert||node.hidden)return true}return false}
 expect(blocked(f.text)).toBe(true)
 expect(blocked(document.querySelector('.wSkVaW_scrollBody')!)).toBe(true)
 expect(blocked(document.getElementById('header-action')!)).toBe(false)
 f.controller.reset();expect(blocked(f.text)).toBe(false)
})
test('restores the latest run focus rather than an earlier run marker',async()=>{
 const f=fixture(),header=document.getElementById('header-action')!
 header.focus();await f.controller.start('note');f.controller.reset()
 f.text.focus();await f.controller.start('note');f.controller.reset()
 expect(document.activeElement).toBe(f.text)
 expect(document.querySelectorAll('[data-home-guide-return-focus]')).toHaveLength(0)
})
test('pausing before the pending operation microtask prevents it from starting until resume',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>{}),timeline=createHomeGuideTimeline({steps:[{id:'one',hold:0}],run})
 timeline.play();timeline.pause();await vi.advanceTimersByTimeAsync(10)
 expect(run).not.toHaveBeenCalled()
 timeline.play();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(1)
 timeline.dispose()
})
