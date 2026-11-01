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

it.each([{x:20,y:700},{x:980,y:700},{x:980,y:40}])('keeps the root menu anchored while a taller library submenu opens and closes at $x/$y',anchor=>{
 vi.spyOn(window,'innerWidth','get').mockReturnValue(1280);vi.spyOn(window,'innerHeight','get').mockReturnValue(800)
 const f=fixture(),children=Array.from({length:32},(_,index)=>({id:'library-'+index,title:'组件 '+index,icon:'quote',subtext:'',group:'',badge:''})),input={...f.input,anchor:{...anchor,width:2,height:20},items:[{...f.input.items[0]!,children},...Array.from({length:5},(_,index)=>({id:'native-'+index,title:'命令 '+index,icon:'quote',subtext:'',group:'',badge:''}))]}
 const rect=(host:HTMLElement,selector:string)=>{const pane=host.querySelector<HTMLElement>(selector)!;return{x:parseFloat(host.style.left)+parseFloat(pane.style.left),y:parseFloat(host.style.top)+parseFloat(pane.style.top),width:parseFloat(pane.style.width),height:parseFloat(pane.style.height)}}
 f.menu.sync(input);const host=f.menu.element()!,before=rect(host,'.root-menu')
 f.menu.sync({...input,revision:2,submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}})
 expect(rect(host,'.root-menu')).toEqual(before);const child=rect(host,'.child-menu');expect(child.x).toBeGreaterThanOrEqual(8);expect(child.x+child.width).toBeLessThanOrEqual(1272);expect(child.y).toBeGreaterThanOrEqual(8);expect(child.y+child.height).toBeLessThanOrEqual(792)
 if(anchor.x>900)expect(child.x+child.width).toBeLessThanOrEqual(before.x)
 f.menu.sync({...input,revision:3});expect(rect(host,'.root-menu')).toEqual(before)
})

it.each([[900,554],[820,500],[620,390]])('keeps the long replay root on one safe side of the caret at %ipx', (height,caret)=>{
 vi.spyOn(window,'innerWidth','get').mockReturnValue(1380);vi.spyOn(window,'innerHeight','get').mockReturnValue(height)
 const f=fixture(),items=[...Array.from({length:40},(_,index)=>({id:'command-'+index,title:'Command '+index,icon:'quote',subtext:'',group:'',badge:''})),f.input.items[0]!],input={...f.input,anchor:{x:386,y:caret,width:1,height:24},items}
 f.menu.sync(input);const host=f.menu.element()!,root=host.querySelector<HTMLElement>('.root-menu')!,top=parseFloat(host.style.top)+parseFloat(root.style.top),menuHeight=parseFloat(root.style.height)
 expect(top).toBeGreaterThanOrEqual(8);expect(top+menuHeight).toBeLessThanOrEqual(caret-6);expect(top+menuHeight).toBeLessThanOrEqual(height-8);expect(root.style.width).toBe('264px');expect(root.querySelectorAll('[role=option]')).toHaveLength(41)
 const before={top:host.style.top,rootTop:root.style.top,height:root.style.height}
 f.menu.sync({...input,revision:2,submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}})
 const after=host.querySelector<HTMLElement>('.root-menu')!;expect({top:host.style.top,rootTop:after.style.top,height:after.style.height}).toEqual(before)
})

it('isolates only the owned replay list scrolling from editor document capture and removes the boundary on disposal',()=>{
 const captured=vi.fn();document.addEventListener('scroll',captured,true)
 const f=fixture();f.menu.sync(f.input);const host=f.menu.element()!,list=host.querySelector<HTMLElement>('.root-menu>[role=listbox]')!
 list.scrollTop=32;list.dispatchEvent(new Event('scroll'));expect(captured).not.toHaveBeenCalled()
 f.menu.sync({...f.input,revision:2,submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}})
 const child=host.querySelector<HTMLElement>('.child-menu>[role=listbox]')!;child.dispatchEvent(new Event('scroll'));expect(captured).not.toHaveBeenCalled();expect(f.events).toHaveLength(0)
 const root=host.querySelector<HTMLElement>('.root-menu>[role=listbox]')!;root.scrollTop=64;root.dispatchEvent(new Event('scroll'));expect(f.events.at(-1)).toMatchObject({action:'back',revision:2})
 const outside=document.createElement('div');document.body.append(outside);outside.dispatchEvent(new Event('scroll'));expect(captured).toHaveBeenCalledTimes(1)
 f.expire();root.dispatchEvent(new Event('scroll'));expect(captured).toHaveBeenCalledTimes(2);f.menu.dispose();document.body.append(list);list.dispatchEvent(new Event('scroll'));expect(captured).toHaveBeenCalledTimes(3);document.removeEventListener('scroll',captured,true)
})

it('does not consume scrolling from a closed menu list',()=>{
 const f=fixture();f.menu.sync(f.input);const list=f.menu.element()!.querySelector<HTMLElement>('.root-menu>[role=listbox]')!,captured=vi.fn();document.addEventListener('scroll',captured,true)
 f.menu.close();document.body.append(list);list.dispatchEvent(new Event('scroll'));expect(captured).toHaveBeenCalledTimes(1);expect(f.events).toHaveLength(0);document.removeEventListener('scroll',captured,true)
})
