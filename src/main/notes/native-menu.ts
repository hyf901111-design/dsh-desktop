import { BrowserWindow, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import type { NoteMenuState, NotesNativeMenu } from '../../shared/notes-menu'
import { noteLibraryIcons } from './library-icons'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!))
const MENU_SHADOW_INSET = 24
const BASIC_ICONS=['paragraph','heading','heading_2','heading_3','heading_4','numbered_list','bullet_list','check_list','code_block','quote','divider','toggle_list']
const paths:Record<string,string>={library:'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 11h5M11.5 9v5',paragraph:'M3 3h10M8 3v10',quote:'M2 4h4v4H3l-1 4M9 4h4v4h-3l-1 4',toggle_list:'M4 3l7 5-7 5z',numbered_list:'M6 4h8M6 8h8M6 12h8M2 2h1v4M1 9c3-2 4 0 2 2l-1 2h2',bullet_list:'M6 4h8M6 8h8M6 12h8M2 4h1M2 8h1M2 12h1',check_list:'M3 2h10v12H3zM5 8l2 2 4-4',code_block:'M5 4 1 8l4 4M11 4l4 4-4 4M9 2 7 14',divider:'M2 6h12M2 10h12',table:'M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12',image:'M2 2h12v12H2zM2 11l4-4 3 3 2-2 3 3M10 5h.01',video:'M5 3l8 5-8 5z',audio:'M5 12V4l8-2v9M5 10H2v4h3M13 9h-3v4h3',file:'M3 2h7l3 3v9H3zM10 2v4h3M5 9h6M5 12h6',emoji:'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1M4 10c2 3 6 3 8 0M5 5h.01M11 5h.01'}
const tone=(key:string)=>({image:'gold',video:'cyan',audio:'cyan',file:'cyan',table:'green',check_list:'blue',code_block:'green'}[key]||'neutral')
function menuIcon(key:string, library=false){
 if(library&&Object.hasOwn(noteLibraryIcons,key))return noteLibraryIcons[key]!.replaceAll('#9DA5B2','currentColor')
 const heading=key.match(/^(?:toggle_)?heading(?:_(\d))?$/)
 const content=heading?'<text x="1" y="12" stroke="none" fill="currentColor" font-size="12" font-family="-apple-system,sans-serif">'+(key.startsWith('toggle_')?'▸':'')+'H'+(heading[1]||'1')+'</text>':'<path d="'+(paths[key]||paths.paragraph)+'"/>'
 return '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+content+'</svg>'
}
export function validateNoteMenu(input: NoteMenuState): void {
  if (!input || !/^[\w-]{1,80}$/.test(input.menuId) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      typeof input.dark !== 'boolean' || !input.anchor || Object.values(input.anchor).length !== 4 ||
      !(['x','y','width','height'] as const).every(key => typeof input.anchor[key] === 'number' && Number.isFinite(input.anchor[key]) && Math.abs(input.anchor[key]) <= 20000) ||
      input.anchor.width < 0 || input.anchor.height < 0 || !Array.isArray(input.items) || input.items.length > 80 ||
      (input.selectedIndex !== undefined && (!Number.isInteger(input.selectedIndex) || input.selectedIndex < 0 || input.selectedIndex >= input.items.length))) throw Error('菜单内容无效。')
  const ids = new Set<string>()
  const check = (items:NoteMenuState['items'], child=false) => { for (const item of items) {
    if (!item || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) ||
        !(['title','subtext','group','badge','icon'] as const).every(key => typeof item[key] === 'string' && item[key].length <= 256)) throw Error('菜单选项无效。')
    ids.add(item.id)
    if(item.children){if(child||!Array.isArray(item.children)||item.children.length>110)throw Error('子菜单无效。');check(item.children,true)}
  }}
  check(input.items)
  if(input.submenu){const parent=input.items.find(item=>item.id===input.submenu!.parentId);if(!parent?.children?.length||!Number.isInteger(input.submenu.selectedIndex)||input.submenu.selectedIndex<0||input.submenu.selectedIndex>=parent.children.length)throw Error('子菜单选择无效。')}
}

/** The screen, rather than the parent window, bounds this native floating menu. */
export function noteMenuBounds(anchor: NoteMenuState['anchor'], work: Electron.Rectangle, desiredHeight: number, zoom = 1, desiredWidth = 264, shadowInset = 0): Electron.Rectangle {
  const margin = 8, inset = Math.ceil(shadowInset * zoom), width = Math.min(Math.ceil(desiredWidth * zoom), work.width - margin * 2), height = Math.min(Math.ceil(desiredHeight * zoom), work.height - margin * 2)
  const below = work.y + work.height - anchor.y - anchor.height - margin - 6 + inset, above = anchor.y - work.y - margin - 6 + inset
  const y = below >= height || below >= above ? anchor.y + anchor.height + 6 - inset : anchor.y - height - 6 + inset
  return { x: Math.round(Math.max(work.x + margin, Math.min(anchor.x - inset, work.x + work.width - width - margin))),
    y: Math.round(Math.max(work.y + margin, Math.min(y, work.y + work.height - height - margin))), width, height }
}

export function noteSubmenuBounds(pane:Electron.Rectangle,item:Electron.Rectangle,work:Electron.Rectangle,desiredHeight:number,desiredWidth:number,zoom=1):Electron.Rectangle {
  const inset=MENU_SHADOW_INSET*zoom,margin=8,gap=4*zoom,width=Math.min(Math.ceil(desiredWidth*zoom),work.width-margin*2),height=Math.min(Math.ceil(desiredHeight*zoom),work.height-margin*2)
  const right=pane.x+pane.width+gap-inset,left=pane.x-gap-(width-inset*2)-inset
  const x=right+width<=work.x+work.width-margin?right:left
  return {x:Math.round(Math.max(work.x+margin,Math.min(x,work.x+work.width-width-margin))),y:Math.round(Math.max(work.y+margin,Math.min(item.y-inset,work.y+work.height-height-margin))),width,height}
}
type MenuPane={html:string;height:number;width:number}
export function noteMenuPresentation(state: NoteMenuState, ticket: string, limits: {height?:number;width?:number} = {}): MenuPane&{root:MenuPane;child?:MenuPane} {
  const grid=state.items.some(item=>item.icon==='paragraph')&&state.items.some(item=>item.icon==='heading')&&state.items.some(item=>item.icon==='bullet_list')
  const basic=grid?state.items.filter(item=>BASIC_ICONS.includes(item.icon)):[],rest=grid?state.items.filter(item=>!BASIC_ICONS.includes(item.icon)):state.items
  const parent=state.items.find(item=>item.id===state.submenu?.parentId)
  const row=(item:NoteMenuState['items'][number],iconOnly=false,parentId?:string)=>{
    const index=parentId?parent!.children!.indexOf(item):state.items.indexOf(item),selected=parentId?index===state.submenu?.selectedIndex:!state.submenu&&index===state.selectedIndex
    const route=item.children?'open':'select',suffix=parentId?'&parent='+parentId:''
    return `<a role="option" aria-label="${escapeHtml(item.title)}" title="${escapeHtml(item.title+(item.badge?' · '+item.badge:''))}" aria-selected="${selected}" ${item.children?'aria-haspopup="menu" aria-expanded="'+(state.submenu?.parentId===item.id)+'" data-submenu=""':''} id="item-${parentId||'root'}-${index}" href="ework-note-menu://${ticket}/${route}/${item.id}?revision=${state.revision}${suffix}" class="${iconOnly?'basic-item':''}"><span class="icon ${parentId?'library-icon':tone(item.icon)}">${menuIcon(item.icon,!!parentId)}</span>${iconOnly?'':`<span class="label">${escapeHtml(item.title)}</span>`}${item.children?'<span class="chevron">›</span>':''}</a>`
  }
  const maxHeight=limits.height??Infinity,maxWidth=limits.width??Infinity
  // All commands are visible. Short displays add columns rather than a scroll area.
  const columns=(items:NoteMenuState['items'],baseHeight:number,columnWidth:number,parentId?:string)=>{
    const capacity=Math.max(32,maxHeight-baseHeight),showGroups=!!parentId&&capacity>=56
    const parts:{html:string;height:number}[]=[{html:'',height:0}],positions=new Map<string,number>();let group=''
    for(const item of items){
      let heading=showGroups&&item.group!==group?24:0,part=parts.at(-1)!
      if(part.height&&part.height+heading+32>capacity){part={html:'',height:0};parts.push(part);group='';heading=showGroups&&item.group?24:0}
      positions.set(item.id,baseHeight-7+part.height+heading)
      part.html+=(heading?'<h2>'+escapeHtml(item.group)+'</h2>':'')+row(item,false,parentId);part.height+=heading+32;group=item.group
    }
    return {html:'<div class="menu-columns" style="grid-template-columns:repeat('+parts.length+',minmax(0,1fr))">'+parts.map(part=>'<div>'+part.html+'</div>').join('')+'</div>',height:baseHeight+Math.max(...parts.map(part=>part.height)),width:Math.min(maxWidth,parts.length*columnWidth),positions}
  }
  const gridRows=Math.max(1,Math.floor((maxHeight-14-24-8-(rest.length?56:0))/32)),gridColumns=Math.max(6,Math.ceil(basic.length/gridRows))
  const basicHeight=basic.length?24+Math.ceil(basic.length/gridColumns)*32+8:0
  const basicHtml=basic.length?'<h2>基础格式</h2><div class="basic-grid" style="grid-template-columns:repeat('+gridColumns+',minmax(0,1fr));max-width:'+gridColumns*42+'px">'+basic.map(item=>row(item,true)).join('')+'</div>':''
  const root=columns(rest,14+basicHeight+(grid&&rest.length?24:0),264)
  root.width=Math.min(maxWidth,Math.max(root.width,basic.length?gridColumns*42+12:0))
  if(!state.items.length)root.height=50
  const rootHtml=`<section class="menu root-menu" style="height:${root.height}px;width:${root.width}px"><div id="items" role="listbox" aria-label="笔记斜杠菜单">${state.items.length?basicHtml+(grid&&rest.length?'<h2>插入</h2>':'')+root.html:'<p class="empty">没有匹配的命令</p>'}</div></section>`
  const child=parent?columns(parent.children!,46,260,parent.id):undefined,showRoot=!child||root.width+4+child.width<=maxWidth
  const childHtml=child?`<section class="menu child-menu" style="height:${child.height}px;width:${child.width}px"><div role="listbox" aria-label="组件库"><a class="back" href="ework-note-menu://${ticket}/back/${parent!.id}?revision=${state.revision}">‹ 组件库</a>${child.html}</div></section>`:''
  const childTop=showRoot&&child?Math.max(0,Math.min(root.positions.get(parent!.id)||0,maxHeight-child.height)):0
  const html=(showRoot?rootHtml:'')+(child?childHtml.replace('style="height:','style="margin-top:'+childTop+'px;height:'):'')
  return {html,height:Math.max(showRoot?root.height:0,(child?.height||0)+childTop)+MENU_SHADOW_INSET*2,width:(showRoot?root.width:0)+(child?(showRoot?4:0)+child.width:0)+MENU_SHADOW_INSET*2,root:{html:rootHtml,height:root.height+MENU_SHADOW_INSET*2,width:root.width+MENU_SHADOW_INSET*2},...(child?{child:{html:childHtml,height:child.height+MENU_SHADOW_INSET*2,width:child.width+MENU_SHADOW_INSET*2}}:{})}
}
export const noteMenuDocumentHtml = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>笔记斜杠菜单</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{font:13px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#252525;user-select:none;--bg:#fff;--hover:#e7e7e7;--muted:#777;--line:rgba(0,0,0,.10);--shadow:0 8px 24px -4px rgba(0,0,0,.16)}body.dark{color:#eee;--bg:#292929;--hover:#383838;--muted:#aaa;--line:rgba(255,255,255,.10);--shadow:0 8px 24px -4px rgba(0,0,0,.32)}
main{height:100%;display:flex;align-items:flex-start;gap:4px;padding:24px}.menu{width:264px;max-height:100%;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;background:var(--bg);box-shadow:var(--shadow);overflow:hidden;padding:6px 5px}.menu>[role=listbox]{flex:1;min-height:0;overflow:hidden}.menu-columns{display:grid;gap:8px;align-items:start}.library-icon{width:16px;height:16px;color:#667085}body.dark .library-icon{color:#9da5b2}h2{font-size:12px;font-weight:400;line-height:24px;margin:0;padding:0 8px;color:var(--muted)}a{height:32px;display:flex;align-items:center;gap:10px;padding:0 8px;text-decoration:none;color:inherit;border-radius:5px;cursor:pointer}a:hover,a[data-pointer-hover=true],a[aria-selected=true],a[aria-expanded=true]{background:var(--hover)}.icon{width:18px;height:18px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--muted)}.icon svg{display:block}.label{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.basic-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;margin:0 2px 8px}.basic-item{justify-content:center;padding:0}.basic-item .icon{color:inherit}.basic-item[aria-selected=true]{color:#568ef7;background:rgb(65 117 226 / .18)}.gold{color:#d7a23d}.cyan{color:#33b4d6}.green{color:#42aa85}.blue{color:#7988f3}.empty{padding:8px;margin:0}.chevron{color:var(--muted)}.child-menu{width:260px}
</style><main></main>`

/** Non-key macOS panels do not reliably deliver pointer moves to Chromium. */
export function noteMenuPointerScript(x:number,y:number):string {
  return `(()=>{const a=document.elementFromPoint(${JSON.stringify(x)},${JSON.stringify(y)})?.closest('a');document.querySelectorAll('a[data-pointer-hover]').forEach(item=>{if(item!==a)item.removeAttribute('data-pointer-hover')});if(a)a.setAttribute('data-pointer-hover','true');return a?{href:a.href,submenu:a.hasAttribute('data-submenu')}:null})()`
}
type OpenMenu = { input: NoteMenuState; owner: string; ticket: string; parent: BrowserWindow; popup: BrowserWindow; childPopup?:BrowserWindow; childReady?:Promise<unknown>; ready: Promise<unknown>; pending: boolean; updating: boolean; pointerTimer?:ReturnType<typeof setInterval>; pointerPending?:boolean; pointerSignature?:string; pointerPoint?:string; unlisten(): void }
export class NoteNativeMenu implements NotesNativeMenu {
  private current?: OpenMenu
  private retired = new Set<string>()
  constructor(private options: { getWindow(): BrowserWindow | undefined; owner(): string; canRead(sessionId: string): boolean }) {}
  private createPopup(parent: BrowserWindow): BrowserWindow {
    return new BrowserWindow({ parent, title:'笔记斜杠菜单', width:312, height:98, show:false, frame:false, transparent:true,
      ...(process.platform === 'darwin' ? {type:'panel' as const} : {}),
      focusable:false, acceptFirstMouse:true, resizable:false, movable:false, minimizable:false, maximizable:false, fullscreenable:false,
      skipTaskbar:true, hasShadow:false, webPreferences:{partition:'notes-menu',nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false} })
  }
  private checkBlur(state: OpenMenu): void {
    // Activating a menu briefly blurs the editor. Decide after focus has settled.
    setTimeout(() => {
      if (this.current === state && ![state.parent,state.popup,state.childPopup].some(win => win && !win.isDestroyed() && win.isFocused())) this.dismiss(state)
    }, 0)
  }
  private configurePopup(state: OpenMenu, popup: BrowserWindow): Promise<unknown> {
    popup.webContents.setWindowOpenHandler(() => ({action:'deny'}))
    popup.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    // Keep the editor key throughout a native click, including IME input.
    popup.on('blur', () => this.checkBlur(state))
    popup.on('closed', () => { if (this.current === state && (popup === state.popup || popup === state.childPopup)) this.dismiss(state) })
    popup.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
      if (this.current !== state) return
      this.navigate(state,url)
    })
    return popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(noteMenuDocumentHtml))
  }
  private navigate(state:OpenMenu,url:string):void {
      try {
        const link = new URL(url), [,action,id] = link.pathname.split('/'), revision = Number(link.searchParams.get('revision')), parentId=link.searchParams.get('parent')||undefined
        if (link.protocol !== 'ework-note-menu:' || link.hostname !== state.ticket || revision !== state.input.revision) return
        if (this.options.owner() !== state.owner || !this.options.canRead(state.input.sessionId)) { this.close(); return }
        const parentItem=state.input.items.find(item=>item.id===parentId),item=parentId?parentItem?.children?.find(item=>item.id===id):state.input.items.find(item=>item.id===id)
        if(!item||parentId&&state.input.submenu?.parentId!==parentId||!['open','back','select'].includes(action!))return
        if(action==='open'||action==='back'){if(!item.children?.length||parentId)return}else{if(item.children)return;this.close()}
        state.parent.focus()
        state.parent.webContents.send('notes:menu-event',{sessionId:state.input.sessionId,owner:state.owner,menuId:state.input.menuId,revision,action,itemId:id,...(parentId?{parentId}:{})})
      } catch { /* Invalid navigation never leaves the isolated menu. */ }
  }
  private trackPointer(state:OpenMenu):void {
    state.pointerSignature=undefined
    if(state.pointerTimer)return
    const tick=async()=>{
      if(this.current!==state||state.updating||state.pointerPending||state.parent.isDestroyed())return
      const input=state.input
      if(!this.currentInput(state,input)){if(this.current===state)this.close();return}
      const point=screen.getCursorScreenPoint(),pointKey=point.x+','+point.y,zoom=state.parent.webContents.getZoomFactor()
      const panes=[state.popup,state.childPopup].filter((pane):pane is BrowserWindow=>!!pane&&!pane.isDestroyed()&&pane.isVisible()).map(pane=>({pane,bounds:pane.getBounds()}))
      const signature=JSON.stringify([input.revision,point,zoom,panes.map(({bounds})=>bounds)])
      if(state.pointerSignature===signature)return
      const moved=state.pointerPoint!==pointKey
      state.pointerSignature=signature;state.pointerPoint=pointKey;state.pointerPending=true
      try {
        for(const {pane,bounds} of panes){
          const hit=await pane.webContents.executeJavaScript(noteMenuPointerScript((point.x-bounds.x)/zoom,(point.y-bounds.y)/zoom)) as {href:string;submenu:boolean}|null
          if(!this.currentInput(state,input))return
          // Keyboard repainting must not close a child under a stationary mouse.
          if(moved&&pane===state.popup&&typeof hit?.href==='string'){
            if(hit.submenu&&!input.submenu)this.navigate(state,hit.href)
            else if(!hit.submenu&&input.submenu)this.navigate(state,`ework-note-menu://${state.ticket}/back/${input.submenu.parentId}?revision=${input.revision}`)
          }
        }
      }catch { /* A dismissed pane may finish its last pointer update. */ }
      finally {state.pointerPending=false}
    }
    state.pointerTimer=setInterval(()=>{void tick()},40)
    state.pointerTimer.unref?.()
  }
  sync(input: NoteMenuState, owner: string): void {
    validateNoteMenu(input)
    const parent = this.options.getWindow()
    if (!parent || parent.isDestroyed() || !parent.isVisible() || !parent.isFocused() || owner !== this.options.owner() || !this.options.canRead(input.sessionId)) { this.close(); throw Error('笔记会话不可用。') }
    if (this.retired.has(input.menuId)) throw Error('菜单已关闭。')
    if (this.current && (this.current.input.menuId !== input.menuId || this.current.owner !== owner || this.current.input.sessionId !== input.sessionId || this.current.parent !== parent)) this.close()
    if (!this.current) {
      const popup = this.createPopup(parent)
      const state: OpenMenu = { input, owner, ticket:randomUUID(), parent, popup, pending:true, updating:false, ready:Promise.resolve(), unlisten:()=>{} }
      this.current = state
      const cancel = () => { if (this.current === state) this.dismiss(state) }, blur = () => this.checkBlur(state)
      const events = ['move','resize','hide','minimize','closed'] as const
      parent.on('blur',blur)
      for (const event of events) (parent as NodeJS.EventEmitter).on(event, cancel)
      const navigating = (_event:unknown,_url:string,_inPlace:boolean,isMainFrame:boolean) => { if(isMainFrame) cancel() }
      parent.webContents.on('did-start-navigation', navigating)
      state.unlisten = () => { parent.removeListener('blur',blur); for (const event of events) (parent as NodeJS.EventEmitter).removeListener(event, cancel); parent.webContents.removeListener('did-start-navigation', navigating) }
      state.ready = this.configurePopup(state,popup)
    }
    this.current.input = input
    this.current.pending = true
    void this.paint(this.current)
  }
  private currentInput(state: OpenMenu,input:NoteMenuState): boolean {
    return this.current === state && state.input === input && this.options.owner() === state.owner && this.options.canRead(input.sessionId) && !state.popup.isDestroyed()
  }
  private closeChild(state: OpenMenu): void {
    const child=state.childPopup;state.childPopup=undefined;state.childReady=undefined
    if (child && !child.isDestroyed()) child.destroy()
  }
  private async paint(state: OpenMenu): Promise<void> {
    if (state.updating) return
    state.updating = true
    try {
      await state.ready
      while (this.current === state && state.pending && !state.popup.isDestroyed()) {
        state.pending = false
        const input = state.input, content = state.parent.getContentBounds(), zoom = state.parent.webContents.getZoomFactor()
        const anchor = { x:content.x + input.anchor.x * zoom, y:content.y + input.anchor.y * zoom, width:input.anchor.width * zoom, height:input.anchor.height * zoom }
        const work = screen.getDisplayNearestPoint({x:Math.round(anchor.x),y:Math.round(anchor.y)}).workArea
        const presentation=noteMenuPresentation(input,state.ticket,{height:(work.height-16)/zoom-MENU_SHADOW_INSET*2,width:(work.width-16)/zoom-MENU_SHADOW_INSET*2})
        const bounds=noteMenuBounds(anchor,work,presentation.root.height,zoom,presentation.root.width,MENU_SHADOW_INSET)
        state.popup.setBounds(bounds)
        state.popup.webContents.setZoomFactor(zoom)
        const parentIndex=input.items.findIndex(item=>item.id===input.submenu?.parentId)
        const geometry=await state.popup.webContents.executeJavaScript(`document.body.className=${JSON.stringify(input.dark?'dark':'')};document.querySelector('main').innerHTML=${JSON.stringify(presentation.root.html)};({pane:document.querySelector('.root-menu').getBoundingClientRect().toJSON(),item:document.getElementById('item-root-${parentIndex}')?.getBoundingClientRect().toJSON()});`) as {pane:Electron.Rectangle;item?:Electron.Rectangle}
        if (!this.currentInput(state,input)) { if(this.current===state&&state.input===input)this.close(); continue }
        state.popup.showInactive()
        if (presentation.child && geometry.item) {
          if (!state.childPopup) { state.childPopup=this.createPopup(state.parent);state.childReady=this.configurePopup(state,state.childPopup) }
          const child=state.childPopup;await state.childReady
          if (!this.currentInput(state,input) || child.isDestroyed()) continue
          const screenRect=(rect:Electron.Rectangle)=>({x:bounds.x+rect.x*zoom,y:bounds.y+rect.y*zoom,width:rect.width*zoom,height:rect.height*zoom})
          child.setBounds(noteSubmenuBounds(screenRect(geometry.pane),screenRect(geometry.item),work,presentation.child.height,presentation.child.width,zoom))
          child.webContents.setZoomFactor(zoom)
          await child.webContents.executeJavaScript(`document.body.className=${JSON.stringify(input.dark?'dark':'')};document.querySelector('main').innerHTML=${JSON.stringify(presentation.child.html)};`)
          if (this.currentInput(state,input) && !child.isDestroyed()) child.showInactive()
        } else this.closeChild(state)
        this.trackPointer(state)
      }
    } catch { if (this.current === state) this.dismiss(state) }
    finally { state.updating = false }
  }
  private dismiss(state: OpenMenu): void {
    this.close()
    if (!state.parent.isDestroyed() && this.options.owner() === state.owner) state.parent.webContents.send('notes:menu-event',{sessionId:state.input.sessionId,owner:state.owner,menuId:state.input.menuId,revision:state.input.revision,action:'cancel'})
  }
  close(menuId?: string): void {
    const state = this.current
    if (!state || (menuId && menuId !== state.input.menuId)) return
    this.retired.add(state.input.menuId)
    if(this.retired.size>64)this.retired.delete(this.retired.values().next().value!)
    this.current = undefined; if(state.pointerTimer)clearInterval(state.pointerTimer); state.unlisten();this.closeChild(state)
    if (!state.popup.isDestroyed()) state.popup.destroy()
  }
}
