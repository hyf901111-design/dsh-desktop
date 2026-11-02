import { afterEach, expect, it, vi } from 'vitest'
import { BrowserWindow, screen } from 'electron'
import { NoteNativeMenu, noteMenuBounds, noteMenuPresentation, noteSubmenuBounds, validateNoteMenu, noteMenuDocumentHtml } from '../src/main/notes/native-menu'
import {noteMenuWorkArea} from '../src/shared/note-menu-geometry'
import type { NoteMenuState } from '../src/shared/notes-menu'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { NoteMenuIcon } from '../src/preload/notes/menu-icon'

vi.mock('electron',async()=>{
  const { EventEmitter } = await import('node:events')
  class Window extends EventEmitter {
    static instances:Window[]=[];destroyed=false;focused:boolean;webContents:any
    constructor(public options:any){super();this.focused=!options.parent;Window.instances.push(this);this.webContents=Object.assign(new EventEmitter(),{getZoomFactor:()=>1,setZoomFactor:vi.fn(),setWindowOpenHandler:vi.fn(),executeJavaScript:vi.fn(async (script:string)=>script.includes('elementFromPoint')?null:({pane:{x:24,y:24,width:264,height:46},item:{x:31,y:31,width:252,height:32}})),send:vi.fn(),session:{setPermissionRequestHandler:vi.fn()}})}
    isDestroyed=()=>this.destroyed;isVisible=()=>true;isFocused=()=>this.focused;getContentBounds=()=>({x:50,y:50,width:700,height:300})
    focus(){if(this.options.focusable===false)return;for(const win of Window.instances)if(win!==this&&win.focused){win.focused=false;win.emit('blur')}this.focused=true;this.emit('focus')}
    bounds={x:0,y:0,width:312,height:98};getBounds=()=>this.bounds
    setBounds=vi.fn(bounds=>{this.bounds=bounds});showInactive=vi.fn();loadURL=vi.fn(async()=>{});destroy(){this.destroyed=true;this.emit('closed')}
  }
  return {BrowserWindow:Window,screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:25,width:1440,height:1000}}),getCursorScreenPoint:vi.fn(()=>({x:0,y:0}))}}
})
const input = (overrides:Partial<NoteMenuState>={}):NoteMenuState => ({sessionId:'s',menuId:'menu-a',revision:1,dark:true,selectedIndex:0,anchor:{x:500,y:200,width:1,height:24},items:Array.from({length:12},(_,i)=>({id:`heading-${i}`,title:'一级标题',subtext:'用于顶级标题',group:'标题',badge:'⌘-Alt-1',icon:'heading'})),...overrides})
const instances=()=> (BrowserWindow as any).instances as any[]
afterEach(()=>{for(const win of instances())if(!win.isDestroyed())win.destroy();instances().length=0;(screen.getCursorScreenPoint as any).mockReturnValue({x:0,y:0})})
function fixture(){const parent=new BrowserWindow({}),owner={value:'alice'},allowed={value:true},menu=new NoteNativeMenu({getWindow:()=>parent,owner:()=>owner.value,canRead:()=>allowed.value});return{parent:parent as any,owner,allowed,menu}}

it('uses macOS native glass without blurring a transparent shadow gutter',async()=>{
 if(process.platform!=='darwin')return
 const {menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1)
 await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 expect(popup.options).toMatchObject({vibrancy:'menu',visualEffectState:'active',backgroundColor:'#00000000',hasShadow:true,roundedCorners:true})
 const presentation=noteMenuPresentation(input(),'ticket',{shadowInset:0})
 expect(presentation.root.width).toBe(264);expect(presentation.root.height).toBe(398)
 expect(popup.setBounds.mock.calls[0][0]).toMatchObject({width:264,height:186})
 const html=new Window()
 try{
  html.document.write(noteMenuDocumentHtml);html.document.body.className='dark native-material'
  html.document.querySelector('main')!.innerHTML=presentation.root.html
  expect(html.getComputedStyle(html.document.querySelector('main')!).padding).toBe('0px')
  expect(html.getComputedStyle(html.document.querySelector('.menu')!).boxShadow).toBe('none')
  expect(html.getComputedStyle(html.document.querySelector('.menu')!).borderWidth).toBe('0px')
 }finally{await html.happyDOM.close()}
})

it('fits its declared viewport including negative origins and keeps the caret clear',()=>{
 const bounds=noteMenuBounds({x:600,y:250,width:1,height:20},{x:0,y:25,width:1440,height:1000},720)
 expect(bounds.y+bounds.height).toBeGreaterThan(350);expect(bounds.y+bounds.height).toBeLessThanOrEqual(1017)
 const other=noteMenuBounds({x:-20,y:940,width:1,height:20},{x:-1280,y:25,width:1280,height:1000},1800)
 expect(other.x+other.width).toBeLessThanOrEqual(-8);expect(other.y).toBe(33);expect(other.height).toBe(901);expect(other.y+other.height).toBeLessThanOrEqual(934)
})
it('keeps the menu surface beside the caret when its shadow has transparent window padding',()=>{
 const work={x:0,y:25,width:1440,height:1000}
 const below=noteMenuBounds({x:600,y:250,width:1,height:20},work,566,1,312,24)
 expect(below.x+24).toBe(600);expect(below.y+24).toBe(276)
 const above=noteMenuBounds({x:600,y:900,width:1,height:20},work,566,1,312,24)
 expect(above.y+above.height-24).toBe(894)
})
it('intersects the parent content viewport with the display work area before placing a menu',()=>{
 expect(noteMenuWorkArea({x:0,y:25,width:2000,height:1415},{x:100,y:400,width:1380,height:900})).toEqual({x:100,y:400,width:1380,height:900})
 expect(noteMenuWorkArea({x:-1280,y:25,width:1280,height:1000},{x:-100,y:0,width:700,height:300})).toEqual({x:-100,y:25,width:100,height:275})
})
it.each([0,24])('keeps the visible menu above a low caret with zoom and shadow inset %i',shadow=>{
 const anchor={x:400,y:790,width:1,height:24},work={x:100,y:400,width:1380,height:620},zoom=1.25
 const bounds=noteMenuBounds(anchor,work,1000,zoom,264+shadow*2,shadow)
 expect(bounds.y).toBeGreaterThanOrEqual(408);expect(bounds.y+bounds.height).toBeLessThanOrEqual(1012)
 expect(bounds.y+bounds.height-shadow*zoom).toBeLessThanOrEqual(anchor.y-6)
 const result=noteMenuPresentation(input(),'ticket',{height:(work.height-16)/zoom-shadow*2,shadowInset:shadow,rootHeight:bounds.height/zoom-shadow*2})
 expect(result.root.height*zoom).toBeLessThanOrEqual(bounds.height+1)
})
it('rejects invalid payloads and escapes labels instead of rendering supplied markup',()=>{
 expect(()=>validateNoteMenu(input({anchor:{x:NaN,y:0,width:0,height:20}}))).toThrow()
 expect(()=>validateNoteMenu(input({items:[...input().items,input().items[0]!]}))).toThrow()
 const presentation=noteMenuPresentation(input({items:[{...input().items[0]!,title:'<script>bad()</script>',subtext:'"<&',icon:'<img>'}]}),'ticket')
 expect(presentation.html).toContain('&lt;script&gt;');expect(presentation.html).not.toContain('<script>');expect(presentation.html).not.toContain('<img>')
})
it('keeps all commands and shortcuts in a compact icon grid and list without descriptive subtext',()=>{
 const keys=['paragraph','heading','heading_2','heading_3','numbered_list','bullet_list','check_list','code_block','quote','divider','toggle_list','image','video','audio','file','table'],items=keys.map(key=>({id:key,icon:key,title:key,subtext:'冗长的功能说明',badge:'⌘-Alt-1',group:'分组'}))
 const result=noteMenuPresentation(input({items}),'ticket')
 expect(result.height).toBeLessThanOrEqual(360);expect(result.html).toContain('basic-grid');expect(result.html).toContain('<svg');expect(result.html).not.toContain('<small>');expect(result.html).not.toContain('冗长的功能说明')
 for(const item of items)expect(result.html).toContain('/select/'+item.id+'?revision=1')
 expect(result.html).toContain('⌘-Alt-1')
})
it.each(['sparkles','link'])('keeps the %s creation icon identical in native and inline menus at 18px',kind=>{
 const native=noteMenuPresentation(input({items:[{id:kind,icon:kind,title:kind,subtext:'',badge:'',group:''}]}),'ticket').html
 const document=new Window().document
 document.body.innerHTML=native+renderToStaticMarkup(React.createElement(NoteMenuIcon,{kind}))
 const [menu,inline]=Array.from(document.querySelectorAll('svg'))
 for(const icon of [menu!,inline!]){
  expect(icon.getAttribute('width')).toBe('18');expect(icon.getAttribute('height')).toBe('18');expect(icon.getAttribute('viewBox')).toBe('0 0 18 18')
  expect(icon.getAttribute('stroke-width')).toBe('1.5');expect(icon.getAttribute('fill')).toBe('none');expect(icon.getAttribute('stroke-linecap')).toBe('round');expect(icon.getAttribute('stroke-linejoin')).toBe('round')
 }
 expect(Array.from(menu!.querySelectorAll('path'),path=>path.getAttribute('d'))).toEqual(Array.from(inline!.querySelectorAll('path'),path=>path.getAttribute('d')))
 expect(menu!.querySelectorAll('path')).toHaveLength(2)
})
it('uses the exact research library SVG geometry for each component while preserving the quotation command icon',()=>{
 const names=['watchlist','quote','indices','news','announcements','calendar','custom']
 const children=names.map(icon=>({id:'library-'+icon,title:icon,icon,subtext:'',group:'组件库',badge:''}))
 const library={id:'library',title:'组件库',icon:'library',subtext:'',group:'',badge:'',children}
 const result=noteMenuPresentation(input({items:[library],submenu:{parentId:'library',selectedIndex:0}}),'ticket')
 for(const name of names){
  const asset=readFileSync(new URL('../build/figma-component-library/'+name+'.svg',import.meta.url),'utf8')
  for(const path of asset.matchAll(/ d="([^"]+)"/g))expect(result.html).toContain('d="'+path[1]+'"')
 }
 const quote=noteMenuPresentation(input({items:[{...children[1]!,id:'quote-command'}]}),'ticket')
 expect(quote.html).toContain('M2 4h4v4H3l-1 4M9 4h4v4h-3l-1 4')
})
it('shows only component choices in the child pane without a back title or group heading',()=>{
 const children=['watchlist','quote','custom'].map((icon,index)=>({id:icon,title:icon,icon,subtext:'',badge:'',group:index<2?'内置组件':'自定义组件'})),library={id:'library',title:'组件库',icon:'library',subtext:'',badge:'',group:'',children}
 const result=noteMenuPresentation(input({items:[library],submenu:{parentId:'library',selectedIndex:0}}),'ticket')
 expect(result.child!.html).not.toContain('<h2>');expect(result.child!.html).not.toContain('class="back"');expect(result.child!.html).not.toContain('‹ 组件库')
 expect(result.child!.html.match(/role="option"/g)).toHaveLength(3);expect(result.child!.html).toContain('aria-label="组件库"');expect(result.child!.height).toBe(14+3*32+48)
})
it('does not highlight the first child when opened by pointer, but retains keyboard selection',()=>{
 const children=['watchlist','quote'].map(icon=>({id:icon,title:icon,icon,subtext:'',badge:'',group:''})),library={id:'library',title:'组件库',icon:'library',subtext:'',badge:'',group:'',children}
 const pointer=input({items:[library],submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}})
 expect(noteMenuPresentation(pointer,'ticket').child!.html).not.toContain('aria-selected="true"')
 expect(noteMenuPresentation({...pointer,submenu:{...pointer.submenu!,keyboardActive:true}},'ticket').child!.html).toContain('aria-selected="true"')
 expect(()=>validateNoteMenu({...pointer,submenu:{...pointer.submenu!,keyboardActive:'yes' as any}})).toThrow('子菜单选择无效')
})
it('keeps native clicks from stealing editor focus and accepts only a current selection',async()=>{
 const {parent,menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1)
 await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 expect(popup.options.focusable).toBe(false);expect(popup.options.parent).toBe(parent);expect(popup.options.webPreferences).toMatchObject({nodeIntegration:false,sandbox:true,contextIsolation:true,partition:'notes-menu'})
 popup.focus();expect(parent.isFocused()).toBe(true);expect(popup.isFocused()).toBe(false);expect(popup.destroyed).toBe(false)
 expect(popup.setBounds.mock.calls[0][0].y).toBeGreaterThanOrEqual(58);expect(popup.setBounds.mock.calls[0][0].y+popup.setBounds.mock.calls[0][0].height).toBeLessThanOrEqual(244)
 const js=popup.webContents.executeJavaScript.mock.calls.find((call:any[])=>call[0].includes('innerHTML'))[0],ticket=js.match(/ework-note-menu:\/\/([\w-]+)\//)[1],event={preventDefault:vi.fn()}
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/heading-0?revision=0`);expect(parent.webContents.send).not.toHaveBeenCalled()
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/missing?revision=1`);expect(parent.webContents.send).not.toHaveBeenCalled()
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/heading-0?revision=1`)
 expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'select',itemId:'heading-0',revision:1,owner:'alice',sessionId:'s'}));expect(popup.destroyed).toBe(true);expect(parent.isFocused()).toBe(true);expect(event.preventDefault).toHaveBeenCalledTimes(3);expect(parent.listenerCount('blur')).toBe(0)
})
it('keeps query updates in one window and ignores cleanup of a superseded menu',async()=>{
 const {menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 menu.sync(input({revision:2,selectedIndex:1}),'alice');await vi.waitFor(()=>expect(popup.webContents.executeJavaScript.mock.calls.filter((call:any[])=>call[0].includes('innerHTML'))).toHaveLength(2));expect(instances()).toHaveLength(2)
 menu.sync(input({menuId:'menu-b'}),'alice');const second=instances().at(-1);menu.close('menu-a');expect(second.destroyed).toBe(false);menu.close('menu-b');expect(second.destroyed).toBe(true)
})
it('tracks the screen pointer in an inactive native pane and stops when the menu closes',async()=>{
 const {parent,menu}=fixture(),library={id:'library',title:'组件库',icon:'library',subtext:'',badge:'',group:'',children:[{id:'one',title:'自选股',icon:'watchlist',subtext:'',badge:'',group:''}]}
 menu.sync(input({items:[library]}),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 const ticket=popup.webContents.executeJavaScript.mock.calls[0][0].match(/ework-note-menu:\/\/([\w-]+)\//)[1]
 popup.webContents.executeJavaScript.mockImplementation(async (script:string)=>script.includes('elementFromPoint')?{href:`ework-note-menu://${ticket}/open/library?revision=1`,submenu:true}:({pane:{x:24,y:24,width:264,height:46},item:{x:31,y:31,width:252,height:32}}))
 ;(screen.getCursorScreenPoint as any).mockReturnValue({x:popup.bounds.x+42,y:popup.bounds.y+48})
 await vi.waitFor(()=>expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'open',itemId:'library'})))
 expect(parent.isFocused()).toBe(true);expect(popup.isFocused()).toBe(false)
 const count=popup.webContents.executeJavaScript.mock.calls.length;await new Promise(resolve=>setTimeout(resolve,100));expect(popup.webContents.executeJavaScript).toHaveBeenCalledTimes(count)
 menu.close();await new Promise(resolve=>setTimeout(resolve,100));expect(popup.webContents.executeJavaScript).toHaveBeenCalledTimes(count)
 ;(screen.getCursorScreenPoint as any).mockReturnValue({x:0,y:0})
})
it('keeps a keyboard-opened child under a stationary pointer and closes it only after moving to another root row',async()=>{
 const {parent,menu}=fixture(),library={id:'library',title:'组件库',icon:'library',subtext:'',badge:'',group:'',children:[{id:'one',title:'自选股',icon:'watchlist',subtext:'',badge:'',group:''}]},items=[input().items[0]!,library]
 menu.sync(input({items}),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 const ticket=popup.webContents.executeJavaScript.mock.calls[0][0].match(/ework-note-menu:\/\/([\w-]+)\//)[1],position={x:popup.bounds.x+42,y:popup.bounds.y+48}
 popup.webContents.executeJavaScript.mockImplementation(async (script:string)=>script.includes('elementFromPoint')?{href:`ework-note-menu://${ticket}/select/heading-0?revision=2`,submenu:false}:({pane:{x:24,y:24,width:264,height:46},item:{x:31,y:31,width:252,height:32}}))
 ;(screen.getCursorScreenPoint as any).mockReturnValue(position)
 await vi.waitFor(()=>expect(popup.webContents.executeJavaScript.mock.calls.some((call:any[])=>call[0].includes('elementFromPoint(42,48)'))).toBe(true))
 menu.sync(input({revision:2,items,submenu:{parentId:'library',selectedIndex:0}}),'alice')
 await vi.waitFor(()=>expect(instances()).toHaveLength(3));await new Promise(resolve=>setTimeout(resolve,100));expect(parent.webContents.send).not.toHaveBeenCalled()
 ;(screen.getCursorScreenPoint as any).mockReturnValue({...position,x:position.x+1})
 await vi.waitFor(()=>expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'back',itemId:'library'})))
 menu.close()
})
it('opens the second level without closing the native menu and validates child selections',async()=>{
 const {parent,menu}=fixture(),child={id:'library-one',title:'组件一',subtext:'',group:'自定义',badge:'',icon:'library'},library={id:'library',title:'组件库',subtext:'',group:'插入',badge:'',icon:'library',children:[child]}
 menu.sync(input({items:[library]}),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 const ticket=popup.webContents.executeJavaScript.mock.calls.find((call:any[])=>call[0].includes('innerHTML'))[0].match(/ework-note-menu:\/\/([\w-]+)\//)[1],event={preventDefault:vi.fn()}
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/open/library?revision=1`)
 expect(popup.destroyed).toBe(false);expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'open',itemId:'library'}))
 menu.sync(input({revision:2,items:[library],submenu:{parentId:'library',selectedIndex:0}}),'alice')
 const rootBounds=popup.setBounds.mock.calls[0][0]
 await vi.waitFor(()=>expect(instances()).toHaveLength(3));const childPopup=instances().at(-1)
 await vi.waitFor(()=>expect(childPopup.showInactive).toHaveBeenCalled())
 expect(popup.setBounds.mock.calls.at(-1)[0]).toEqual(rootBounds);expect(childPopup.setBounds.mock.calls.at(-1)[0].width).toBe(process.platform==='darwin'?260:308)
 childPopup.focus();expect(parent.isFocused()).toBe(true);expect(childPopup.isFocused()).toBe(false)
 expect(noteMenuPresentation(input({items:[library],submenu:{parentId:'library',selectedIndex:0}}),'ticket').html).toContain('组件一')
 childPopup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/library-one?revision=1&parent=library`)
 expect(popup.destroyed).toBe(false)
 childPopup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/library-one?revision=2&parent=library`)
 expect(parent.webContents.send).toHaveBeenLastCalledWith('notes:menu-event',expect.objectContaining({action:'select',parentId:'library',itemId:'library-one',revision:2}));expect(popup.destroyed).toBe(true);expect(childPopup.destroyed).toBe(true)
})
for(const change of ['blur','move','resize','hide','minimize','closed'])it(`closes and notifies the editor on parent ${change}`,async()=>{
 const {parent,menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled());if(change==='blur')parent.focused=false;parent.emit(change);await vi.waitFor(()=>expect(popup.destroyed).toBe(true));expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'cancel'}));expect(parent.listenerCount('blur')).toBe(0);parent.focus();expect(()=>menu.sync(input({revision:2}),'alice')).toThrow('已关闭')
})
it('drops pending and clicked results after account or session access changes',async()=>{
 const {parent,menu,owner,allowed}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled());const ticket=popup.webContents.executeJavaScript.mock.calls.find((call:any[])=>call[0].includes('innerHTML'))[0].match(/ework-note-menu:\/\/([\w-]+)\//)[1]
 owner.value='bob';popup.webContents.emit('will-navigate',{preventDefault:()=>{}},`ework-note-menu://${ticket}/select/heading-0?revision=1`);expect(popup.destroyed).toBe(true);expect(parent.webContents.send).not.toHaveBeenCalled();expect(()=>menu.sync(input(),'alice')).toThrow()
 allowed.value=false;expect(()=>menu.sync(input(),'bob')).toThrow()
})

it('anchors the submenu beside its parent row and flips within the screen at zoom',()=>{
 const work={x:0,y:25,width:1440,height:1000},pane={x:200,y:100,width:264,height:518},item={x:207,y:572,width:252,height:32}
 const beside=noteSubmenuBounds(pane,item,work,286,308)
 expect(beside.x+24).toBe(pane.x+pane.width+4);expect(beside.y+24).toBe(item.y)
 const left=noteSubmenuBounds({...pane,x:1160},item,work,286,308)
 expect(left.x+left.width-24).toBe(1156)
 const bottom=noteSubmenuBounds(pane,{...item,y:975},work,286,308)
 expect(bottom.y+bottom.height).toBe(1017)
 const zoom=noteSubmenuBounds({...pane,width:396},item,work,286,308,1.5)
 expect(zoom.x+36).toBe(pane.x+396+6);expect(zoom.y+36).toBe(item.y);expect(zoom.width).toBe(462)
})
it('closes only the child when returning to the root and revokes both panes on owner loss',async()=>{
 const {parent,menu,owner}=fixture(),library={id:'library',title:'组件库',subtext:'',group:'',badge:'',icon:'library',children:[{id:'one',title:'自选股',subtext:'',group:'',badge:'',icon:'watchlist'}]}
 menu.sync(input({items:[library],submenu:{parentId:'library',selectedIndex:0}}),'alice')
 const popup=instances()[1];await vi.waitFor(()=>expect(instances()).toHaveLength(3));const child=instances()[2];await vi.waitFor(()=>expect(child.showInactive).toHaveBeenCalled())
 const ticket=child.webContents.executeJavaScript.mock.calls.find((call:any[])=>call[0].includes('innerHTML'))[0].match(/ework-note-menu:\/\/([\w-]+)\//)[1]
 child.webContents.emit('will-navigate',{preventDefault:()=>{}},`ework-note-menu://${ticket}/back/library?revision=1`)
 expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'back'}))
 menu.sync(input({items:[library],revision:2}),'alice');await vi.waitFor(()=>expect(child.destroyed).toBe(true));expect(popup.destroyed).toBe(false)
 menu.sync(input({items:[library],revision:3,submenu:{parentId:'library',selectedIndex:0}}),'alice');await vi.waitFor(()=>expect(instances()).toHaveLength(4));const next=instances()[3];await vi.waitFor(()=>expect(next.showInactive).toHaveBeenCalled())
 owner.value='bob';next.webContents.emit('will-navigate',{preventDefault:()=>{}},`ework-note-menu://${ticket}/select/one?revision=3&parent=library`)
 expect(popup.destroyed).toBe(true);expect(next.destroyed).toBe(true)
})
it('localizes native headings and empty states with the owning editor locale',()=>{
 const items=['paragraph','heading','bullet_list','image'].map((icon,i)=>({id:'e-'+i,title:'User 中文 title',icon,subtext:'',badge:'',group:''}))
 const result=noteMenuPresentation(input({locale:'en',items}),'ticket');expect(result.html).toContain('Basic formatting');expect(result.html).toContain('Insert');expect(result.html).toContain('User 中文 title');expect(result.html).not.toContain('基础格式')
 expect(noteMenuPresentation(input({locale:'en',items:[],selectedIndex:undefined}),'t').html).toContain('No matching commands')
 expect(()=>validateNoteMenu(input({locale:'invalid' as any}))).toThrow()
})

it('keeps long native command and child lists at their original width with internal scrolling',()=>{
 const item=(id:string)=>({id,title:id,icon:'quote',subtext:'',badge:'',group:''}),children=Array.from({length:80},(_,index)=>item('child-'+index)),items=[...Array.from({length:30},(_,index)=>item('command-'+index)),{...item('library'),children}]
 const result=noteMenuPresentation(input({items,submenu:{parentId:'library',selectedIndex:79,keyboardActive:true}}),'ticket',{height:300,width:720,shadowInset:0})
 expect(result.root.width).toBe(264);expect(result.child!.width).toBe(260);expect(result.root.height).toBe(300);expect(result.child!.height).toBe(300)
 expect(result.root.html.match(/role="option"/g)).toHaveLength(31);expect(result.child!.html.match(/role="option"/g)).toHaveLength(80)
 expect(result.html).not.toContain('menu-columns');expect(noteMenuDocumentHtml).toContain('overflow-y:auto')
})
it('refreshes hover after scrolling below a stationary native pointer without closing keyboard-opened children on repaint',async()=>{
 const {parent,menu}=fixture(),library={id:'library',title:'组件库',icon:'library',subtext:'',badge:'',group:'',children:[{id:'quote',title:'行情',icon:'quote',subtext:'',badge:'',group:''}]},items=[...Array.from({length:40},(_,index)=>({...library,id:'command-'+index,children:undefined})),library];menu.sync(input({items}),'alice');const popup=instances()[1] as any
 await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled());const js=popup.webContents.executeJavaScript.mock.calls.find((call:any[])=>call[0].includes('innerHTML'))[0],ticket=js.match(/ework-note-menu:\/\/([\w-]+)\//)[1];let scroll=0
 popup.webContents.executeJavaScript.mockImplementation(async(script:string)=>script.includes('elementFromPoint')?{href:`ework-note-menu://${ticket}/select/other?revision=2`,submenu:false,scroll,scrollable:true}:({pane:{x:0,y:0,width:264,height:300},item:{x:7,y:7,width:252,height:32}}))
 await new Promise(resolve=>setTimeout(resolve,90));menu.sync(input({revision:2,items,submenu:{parentId:'library',selectedIndex:0,keyboardActive:true}}),'alice');await vi.waitFor(()=>expect(instances().at(-1).showInactive).toHaveBeenCalled());await new Promise(resolve=>setTimeout(resolve,90));expect(parent.webContents.send).not.toHaveBeenCalled();scroll=64
 await vi.waitFor(()=>expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'back',itemId:'library'})))
})
