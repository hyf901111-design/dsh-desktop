// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest'
import {createHomeGuideNoteMenu} from '../src/preload/home-guide-note-menu'
import type {NoteMenuState} from '../src/shared/notes-menu'
const close:(()=>void)[]=[]
afterEach(()=>{for(const fn of close.splice(0))fn();document.body.replaceChildren();vi.restoreAllMocks()})
function fixture(){
 document.documentElement.dataset.homeGuidePointerRun='menu-run';const controller=new AbortController(),events:any[]=[];let alive=true
 Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value(){}});Object.defineProperty(HTMLElement.prototype,'hidePopover',{configurable:true,value(){}})
 const receive=(event:Event)=>events.push((event as CustomEvent).detail);document.addEventListener('sherlock:notes-menu-event',receive)
 const menu=createHomeGuideNoteMenu(document,{runId:'menu-run',sessionId:'menu-session',signal:controller.signal,current:()=>alive})
 const item=(id:string,title:string)=>({id,title,icon:id,subtext:'',group:'',badge:''}),input:NoteMenuState={sessionId:'menu-session',menuId:'menu-one',revision:1,dark:false,anchor:{x:20,y:30,width:1,height:20},selectedIndex:undefined,items:[{...item('library','组件库'),children:[item('quote','行情面板')]}]}
 close.push(()=>{alive=false;menu.dispose();document.removeEventListener('sherlock:notes-menu-event',receive)})
 return{menu,input,events,controller,expire:()=>alive=false}
}
it('reuses the original two-level renderer and emits only its exact current revision callback',()=>{
 const f=fixture();f.menu.sync(f.input);const root=f.menu.element()!,parent=root.querySelector<HTMLAnchorElement>('.root-menu a')!
 parent.dispatchEvent(new Event('pointerover',{bubbles:true}));expect(f.events).toEqual([{owner:'home-guide:menu-run',sessionId:'menu-session',menuId:'menu-one',revision:1,action:'open',itemId:'library'}])
 f.menu.sync({...f.input,revision:2,submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}})
 parent.click();expect(f.events).toHaveLength(1)
 expect(root.querySelector('meta')).toBeNull();expect(root.querySelector('style')?.textContent?.startsWith('@scope ([data-home-guide-note-menu])')).toBe(true);expect(root.style.background).toBe('transparent');expect(parseFloat(root.style.width)).toBeLessThan(600)
 expect(()=>f.menu.sync({...f.input,revision:1})).toThrow('变化');f.menu.close('other-menu');expect(f.menu.element()).toBe(root)
 const child=root.querySelector<HTMLAnchorElement>('.child-menu a')!;child.click();child.click();expect(f.events.filter(event=>event.action==='select')).toHaveLength(1);expect(f.events.at(-1)).toMatchObject({revision:2,action:'select',itemId:'quote',parentId:'library'});expect(root.isConnected).toBe(false);expect(()=>f.menu.sync(f.input)).toThrow('结束')
})
it.each(['cancel','mode','abort','owner','aba'])('retires the owned menu after %s and never resurrects a late callback',async kind=>{
 const f=fixture();f.menu.sync(f.input);const root=f.menu.element()!,link=root.querySelector('a')!
 if(kind==='cancel')document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));if(kind==='mode')document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change',{detail:{surface:'chat'}}));if(kind==='abort')f.controller.abort();if(kind==='owner'){f.expire();link.click()};if(kind==='aba'){document.documentElement.dataset.homeGuidePointerRun='other';document.documentElement.dataset.homeGuidePointerRun='menu-run';await Promise.resolve()}
 const count=f.events.length;link.click();expect(f.events).toHaveLength(count);expect(()=>f.menu.sync(f.input)).toThrow();if(kind!=='owner')expect(root.isConnected).toBe(false)
})
it('rejects an unadmitted session or malformed menu before attaching any visible surface',()=>{const f=fixture();expect(()=>f.menu.sync({...f.input,sessionId:'other'})).toThrow();expect(()=>f.menu.sync({...f.input,items:[{id:'bad',title:'bad'} as any]})).toThrow();expect(f.menu.element()).toBeUndefined()})
