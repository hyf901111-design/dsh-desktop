import { afterEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { NoteNativeMenu, noteMenuBounds, noteMenuPresentation, validateNoteMenu } from '../src/main/notes/native-menu'
import type { NoteMenuState } from '../src/shared/notes-menu'
import { readFileSync } from 'node:fs'

vi.mock('electron',async()=>{
  const { EventEmitter } = await import('node:events')
  class Window extends EventEmitter {
    static instances:Window[]=[];destroyed=false;webContents:any
    constructor(public options:any){super();Window.instances.push(this);this.webContents=Object.assign(new EventEmitter(),{getZoomFactor:()=>1,setZoomFactor:vi.fn(),setWindowOpenHandler:vi.fn(),executeJavaScript:vi.fn(async()=>{}),send:vi.fn(),session:{setPermissionRequestHandler:vi.fn()}})}
    isDestroyed=()=>this.destroyed;isVisible=()=>true;isFocused=()=>true;getContentBounds=()=>({x:50,y:50,width:700,height:300})
    setBounds=vi.fn();showInactive=vi.fn();loadURL=vi.fn(async()=>{});destroy(){this.destroyed=true;this.emit('closed')}
  }
  return {BrowserWindow:Window,screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:25,width:1440,height:1000}})}}
})
const input = (overrides:Partial<NoteMenuState>={}):NoteMenuState => ({sessionId:'s',menuId:'menu-a',revision:1,dark:true,selectedIndex:0,anchor:{x:500,y:200,width:1,height:24},items:Array.from({length:12},(_,i)=>({id:`heading-${i}`,title:'一级标题',subtext:'用于顶级标题',group:'标题',badge:'⌘-Alt-1',icon:'heading'})),...overrides})
const instances=()=> (BrowserWindow as any).instances as any[]
afterEach(()=>{for(const win of instances())if(!win.isDestroyed())win.destroy();instances().length=0})
function fixture(){const parent=new BrowserWindow({}),owner={value:'alice'},allowed={value:true},menu=new NoteNativeMenu({getWindow:()=>parent,owner:()=>owner.value,canRead:()=>allowed.value});return{parent:parent as any,owner,allowed,menu}}

it('extends beyond the parent but fits the selected screen including negative origins',()=>{
 const bounds=noteMenuBounds({x:600,y:250,width:1,height:20},{x:0,y:25,width:1440,height:1000},720)
 expect(bounds.y+bounds.height).toBeGreaterThan(350);expect(bounds.y+bounds.height).toBeLessThanOrEqual(1017)
 const other=noteMenuBounds({x:-20,y:940,width:1,height:20},{x:-1280,y:25,width:1280,height:1000},1800)
 expect(other.x+other.width).toBeLessThanOrEqual(-8);expect(other.y).toBe(33);expect(other.height).toBe(984)
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
 expect(result.html).toContain('⌘-Alt-1');expect(noteMenuPresentation(input({items:Array.from({length:80},(_,i)=>({...items.at(-1)!,id:'x'+i}))}),'ticket').height).toBe(480)
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
it('shows a non-key isolated floating window and returns only a current valid selection',async()=>{
 const {parent,menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1)
 await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 expect(popup.options.focusable).toBe(false);expect(popup.options.parent).toBe(parent);expect(popup.options.webPreferences).toMatchObject({nodeIntegration:false,sandbox:true,contextIsolation:true,partition:'notes-menu'})
 expect(popup.setBounds.mock.calls[0][0].y+popup.setBounds.mock.calls[0][0].height).toBeGreaterThan(350)
 const js=popup.webContents.executeJavaScript.mock.calls.at(-1)[0],ticket=js.match(/ework-note-menu:\/\/([\w-]+)\//)[1],event={preventDefault:vi.fn()}
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/heading-0?revision=0`);expect(parent.webContents.send).not.toHaveBeenCalled()
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/missing?revision=1`);expect(parent.webContents.send).not.toHaveBeenCalled()
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/heading-0?revision=1`)
 expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'select',itemId:'heading-0',revision:1,owner:'alice',sessionId:'s'}));expect(popup.destroyed).toBe(true);expect(event.preventDefault).toHaveBeenCalledTimes(3);expect(parent.listenerCount('blur')).toBe(0)
})
it('keeps query updates in one window and ignores cleanup of a superseded menu',async()=>{
 const {menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 menu.sync(input({revision:2,selectedIndex:1}),'alice');await vi.waitFor(()=>expect(popup.webContents.executeJavaScript).toHaveBeenCalledTimes(2));expect(instances()).toHaveLength(2)
 menu.sync(input({menuId:'menu-b'}),'alice');const second=instances().at(-1);menu.close('menu-a');expect(second.destroyed).toBe(false);menu.close('menu-b');expect(second.destroyed).toBe(true)
})
it('opens the second level without closing the native menu and validates child selections',async()=>{
 const {parent,menu}=fixture(),child={id:'library-one',title:'组件一',subtext:'',group:'自定义',badge:'',icon:'library'},library={id:'library',title:'组件库',subtext:'',group:'插入',badge:'',icon:'library',children:[child]}
 menu.sync(input({items:[library]}),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled())
 const ticket=popup.webContents.executeJavaScript.mock.calls.at(-1)[0].match(/ework-note-menu:\/\/([\w-]+)\//)[1],event={preventDefault:vi.fn()}
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/open/library?revision=1`)
 expect(popup.destroyed).toBe(false);expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'open',itemId:'library'}))
 menu.sync(input({revision:2,items:[library],submenu:{parentId:'library',selectedIndex:0}}),'alice')
 await vi.waitFor(()=>expect(popup.setBounds.mock.calls.at(-1)[0].width).toBe(528))
 expect(noteMenuPresentation(input({items:[library],submenu:{parentId:'library',selectedIndex:0}}),'ticket').html).toContain('组件一')
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/library-one?revision=1&parent=library`)
 expect(popup.destroyed).toBe(false)
 popup.webContents.emit('will-navigate',event,`ework-note-menu://${ticket}/select/library-one?revision=2&parent=library`)
 expect(parent.webContents.send).toHaveBeenLastCalledWith('notes:menu-event',expect.objectContaining({action:'select',parentId:'library',itemId:'library-one',revision:2}));expect(popup.destroyed).toBe(true)
})
for(const change of ['blur','move','resize','hide','minimize','closed'])it(`closes and notifies the editor on parent ${change}`,async()=>{
 const {parent,menu}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled());parent.emit(change);expect(popup.destroyed).toBe(true);expect(parent.webContents.send).toHaveBeenCalledWith('notes:menu-event',expect.objectContaining({action:'cancel'}));expect(parent.listenerCount('blur')).toBe(0);expect(()=>menu.sync(input({revision:2}),'alice')).toThrow('已关闭')
})
it('drops pending and clicked results after account or session access changes',async()=>{
 const {parent,menu,owner,allowed}=fixture();menu.sync(input(),'alice');const popup=instances().at(-1);await vi.waitFor(()=>expect(popup.showInactive).toHaveBeenCalled());const ticket=popup.webContents.executeJavaScript.mock.calls.at(-1)[0].match(/ework-note-menu:\/\/([\w-]+)\//)[1]
 owner.value='bob';popup.webContents.emit('will-navigate',{preventDefault:()=>{}},`ework-note-menu://${ticket}/select/heading-0?revision=1`);expect(popup.destroyed).toBe(true);expect(parent.webContents.send).not.toHaveBeenCalled();expect(()=>menu.sync(input(),'alice')).toThrow()
 allowed.value=false;expect(()=>menu.sync(input(),'bob')).toThrow()
})
