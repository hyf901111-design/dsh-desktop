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
 const view=new BrowserAppView(w.document as any,{subscribe:fn=>{receive=fn;return()=>{}},source:async()=>{},request:async(method,input={})=>{calls.push({method,input});if(method==='capture')return '';if(method==='translation-restore')state.translation={state:'idle',completed:0,total:0,canRestore:false};if(method==='zoom')state.tabs.find(t=>t.id===input.id)!.zoom=Number(input.value);return structuredClone(state)}},{register:(_name:string,root:HTMLElement)=>w.document.body.append(root as any),open:()=>{},close:()=>{},current:()=>({surface:'browser'})} as any)
 cleanup.push(async()=>{view.dispose();await w.happyDOM.abort()});await view.open('owner')
 const click=async(selector:string)=>{const button=view.root.querySelector<HTMLButtonElement>(selector)!;expect(button).not.toBeNull();button.focus();button.click();await settle()}
 const publish=()=>receive(structuredClone(state))
 return {w,state,view,calls,click,publish}
}

it('restores the translated page directly from its toolbar state',async()=>{
 const {state,view,calls,click,publish}=await fixture();state.translation={state:'translated',completed:8,total:8,canRestore:true};publish()
 await click('[data-action=translation-progress]')
 expect(calls.filter(c=>c.method==='translation-restore')).toEqual([{method:'translation-restore',input:{}}])
 expect(view.root.querySelector('.eb-toast')?.textContent||'').not.toContain('右键菜单');expect(view.root.querySelector('[data-action=translation-progress]')).toBeNull()
})

it('keeps zoom controls in More while the browser status bar is removed',async()=>{
 const {view,calls,click}=await fixture()
 await click('.eb-toolbar [data-action=menu]')
 const panel=()=>view.root.querySelector('[data-browser-panel=menu]')
 expect(panel()).not.toBeNull();expect(calls.filter(c=>c.method==='zoom')).toEqual([])
 expect(view.root.querySelector('.eb-status')).toBeNull()
 await click('[data-browser-panel=menu] [data-action=zoom-in]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:1.35})
 expect(panel()!.querySelector('[data-action=zoom-reset]')!.textContent).toBe('135%')
 await click('[data-browser-panel=menu] [data-action=zoom-reset]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:1});expect(panel()).not.toBeNull()
})

it('clamps at 25–300 percent and follows actual active-tab zoom updates',async()=>{
 const {state,view,calls,click,publish}=await fixture();state.tabs[0]!.zoom=2.95;publish();await click('.eb-toolbar [data-action=menu]');await click('[data-browser-panel=menu] [data-action=zoom-in]')
 expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'one',value:3});expect(view.root.querySelector<HTMLButtonElement>('[data-action=zoom-in]')!.disabled).toBe(true)
 state.tabs.push({...state.tabs[0]!,id:'two',zoom:.25});state.activeId='two';publish()
 expect(view.root.querySelector('[data-action=zoom-reset]')!.textContent).toBe('25%');expect(view.root.querySelector<HTMLButtonElement>('[data-action=zoom-out]')!.disabled).toBe(true)
 await click('[data-browser-panel=menu] [data-action=zoom-in]');expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'two',value:.35})
 state.tabs[1]!.zoom=.3;publish();await click('[data-browser-panel=menu] [data-action=zoom-out]');expect(calls.filter(c=>c.method==='zoom').at(-1)?.input).toEqual({id:'two',value:.25})
})

it('dismisses with Escape, outside clicks or the More trigger and restores trigger focus',async()=>{
 const {w,view,click}=await fixture();await click('.eb-toolbar [data-action=menu]')
 expect(view.root.querySelector('[data-browser-panel=menu]')).not.toBeNull()
 w.document.activeElement!.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle()
 expect(view.root.querySelector('[data-browser-panel=menu]')).toBeNull();expect(view.root.querySelector('.eb-toolbar [data-action=menu]')).toBe(w.document.activeElement)
 await click('.eb-toolbar [data-action=menu]');w.document.body.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));await settle();expect(view.root.querySelector('[data-browser-panel=menu]')).toBeNull()
 await click('.eb-toolbar [data-action=menu]');view.root.querySelector('.eb-toolbar [data-action=menu]')!.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}) as any);await click('.eb-toolbar [data-action=menu]');expect(view.root.querySelector('[data-browser-panel=menu]')).toBeNull()
})

it('disables unavailable zoom on an empty tab without sending a native zoom request',async()=>{
 const {view,calls,click}=await fixture('');await click('.eb-toolbar [data-action=menu]')
 const panel=view.root.querySelector('[data-browser-panel=menu]')!
 expect(panel).not.toBeNull();expect([...panel.querySelectorAll<HTMLButtonElement>('.eb-zoom-controls button')].every(button=>button.disabled)).toBe(true);expect(calls.some(c=>c.method==='zoom')).toBe(false)
})

for(const canRestore of [true,false])it('restores a partial translation directly and removes its status even with stale restore metadata '+canRestore,async()=>{const {state,view,calls,click,publish}=await fixture();state.translation={state:'partial',completed:3,total:8,canRestore,error:'部分框架未覆盖'};publish();await click('[data-action=translation-progress]');expect(calls.filter(c=>c.method==='translation-restore')).toHaveLength(1);expect(view.root.querySelector('[data-action=translation-progress]')).toBeNull()})
