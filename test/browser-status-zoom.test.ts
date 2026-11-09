import {afterEach,expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {BrowserAppView} from '../src/preload/browser/view'
import type {BrowserSnapshot} from '../src/shared/browser-app'

const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const dispose of cleanup.splice(0))await dispose()})
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
async function fixture(url='https://example.com/'){
 const w=new Window(),state:BrowserSnapshot={tabs:[{id:'one',url,title:'Example',private:false,pinned:false,muted:false,zoom:1.25,loading:false,canBack:false,canForward:false}],activeId:'one',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}},calls:{method:string;input:Record<string,unknown>}[]=[]
 let receive!:(value:BrowserSnapshot)=>void
 const view=new BrowserAppView(w.document as any,{subscribe:fn=>{receive=fn;return()=>{}},source:async()=>{},request:async(method,input={})=>{calls.push({method,input});if(method==='capture')return '';if(method==='zoom')state.tabs.find(t=>t.id===input.id)!.zoom=Number(input.value);return structuredClone(state)}},{register:(_name:string,root:HTMLElement)=>w.document.body.append(root as any),open:()=>{},close:()=>{},current:()=>({surface:'browser'})} as any)
 cleanup.push(async()=>{view.dispose();await w.happyDOM.abort()});await view.open('owner')
 const click=async(selector:string)=>{const button=view.root.querySelector<HTMLButtonElement>(selector)!;expect(button).not.toBeNull();button.focus();button.click();await settle()}
 const publish=()=>receive(structuredClone(state))
 return {w,state,view,calls,click,publish}
}

it('opens zoom controls from the status percentage and reuses current-tab zoom/reset actions',async()=>{
 const {view,calls,click}=await fixture()
 await click('.eb-status button')
 const panel=()=>view.root.querySelector('[data-browser-panel=zoom]')
 expect(panel()).not.toBeNull();expect(calls.filter(c=>c.method==='zoom')).toEqual([])
 expect(view.root.querySelector('.eb-status button')!.getAttribute('aria-expanded')).toBe('true')
 await click('[data-browser-panel=zoom] [data-action=zoom-in]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:1.35})
 expect(view.root.querySelector('.eb-status button')!.textContent).toBe('135%');expect(panel()!.querySelector('[data-action=zoom-reset]')!.textContent).toBe('135%')
 await click('[data-browser-panel=zoom] [data-action=zoom-reset]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:1});expect(view.root.querySelector('.eb-status button')!.textContent).toBe('100%');expect(panel()).not.toBeNull()
})

it('clamps at 25–300 percent and follows actual active-tab zoom updates',async()=>{
 const {state,view,calls,click,publish}=await fixture();state.tabs[0]!.zoom=2.95;publish();await click('.eb-status button');await click('[data-browser-panel=zoom] [data-action=zoom-in]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:3});expect(view.root.querySelector<HTMLButtonElement>('[data-action=zoom-in]')!.disabled).toBe(true)
 state.tabs.push({...state.tabs[0]!,id:'two',zoom:.25});state.activeId='two';publish()
 expect(view.root.querySelector('.eb-status button')!.textContent).toBe('25%');expect(view.root.querySelector<HTMLButtonElement>('[data-action=zoom-out]')!.disabled).toBe(true)
 await click('[data-browser-panel=zoom] [data-action=zoom-in]');expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'two',value:.35})
 state.tabs[1]!.zoom=.3;publish();await click('[data-browser-panel=zoom] [data-action=zoom-out]');expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'two',value:.25})
})

it('dismisses with Escape, outside clicks or the percentage trigger and restores trigger focus',async()=>{
 const {w,view,click}=await fixture();await click('.eb-status button')
 expect(view.root.querySelector('[data-browser-panel=zoom]')).not.toBeNull()
 w.document.activeElement!.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle()
 expect(view.root.querySelector('[data-browser-panel=zoom]')).toBeNull();expect(view.root.querySelector('.eb-status button')).toBe(w.document.activeElement)
 await click('.eb-status button');w.document.body.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));await settle();expect(view.root.querySelector('[data-browser-panel=zoom]')).toBeNull()
 await click('.eb-status button');view.root.querySelector('.eb-status button')!.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}) as any);await click('.eb-status button');expect(view.root.querySelector('[data-browser-panel=zoom]')).toBeNull()
})

it('explains unavailable zoom on an empty tab without sending a native zoom request',async()=>{
 const {view,calls,click}=await fixture('');await click('.eb-status button')
 const panel=view.root.querySelector('[data-browser-panel=zoom]')!
 expect(panel).not.toBeNull();expect(panel.textContent).toContain('打开网页后可调整缩放');expect([...panel.querySelectorAll<HTMLButtonElement>('.eb-zoom-controls button')].every(button=>button.disabled)).toBe(true);expect(calls.some(c=>c.method==='zoom')).toBe(false)
})
