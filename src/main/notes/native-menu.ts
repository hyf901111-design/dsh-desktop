import { BrowserWindow, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import type { NoteMenuState, NoteMenuEvent, NoteMenuItem, NotesNativeMenu } from '../../shared/notes-menu'
import {validateNoteMenu,noteMenuPresentation,noteMenuDocumentHtml} from '../../shared/note-menu-presentation'
export {validateNoteMenu,noteMenuPresentation,noteMenuDocumentHtml} from '../../shared/note-menu-presentation'
import {noteMenuBounds,noteSubmenuBounds,noteMenuWorkArea} from '../../shared/note-menu-geometry'
export {noteMenuBounds,noteSubmenuBounds} from '../../shared/note-menu-geometry'
const MENU_SHADOW_INSET=24

/** Non-key macOS panels do not reliably deliver pointer moves to Chromium. */
export function noteMenuPointerScript(x:number,y:number):string {
  return `(()=>{const a=document.elementFromPoint(${JSON.stringify(x)},${JSON.stringify(y)})?.closest('a'),list=document.querySelector('[role=listbox]');document.querySelectorAll('a[data-pointer-hover]').forEach(item=>{if(item!==a)item.removeAttribute('data-pointer-hover')});if(a)a.setAttribute('data-pointer-hover','true');return {href:a?.href??null,submenu:a?.hasAttribute('data-submenu')??false,scroll:list?.scrollTop||0,scrollable:!!list&&list.scrollHeight>list.clientHeight}})()`
}
type OpenMenu = { input: NoteMenuState; painted?:NoteMenuState; owner: string; ticket: string; parent: BrowserWindow; popup: BrowserWindow; childPopup?:BrowserWindow; childReady?:Promise<unknown>; ready: Promise<unknown>; pending: boolean; updating: boolean; pointerTimer?:ReturnType<typeof setInterval>; pointerPending?:boolean; pointerSignature?:string; pointerPoint?:string; pointerScroll?:Map<BrowserWindow,number>; pointerScrollable?:boolean; unlisten(): void }
export class NoteNativeMenu implements NotesNativeMenu {
  private readonly nativeMaterial = process.platform === 'darwin'
  private readonly shadowInset = this.nativeMaterial ? 0 : MENU_SHADOW_INSET
  private current?: OpenMenu
  private retired = new Set<string>()
  constructor(private options: { getWindow(): BrowserWindow | undefined; owner(): string; canRead(sessionId: string): boolean;
    title?:string;displayBounds?:boolean;documentHtml?:string;presentation?:typeof noteMenuPresentation;
    emit?:(event:NoteMenuEvent)=>void;selectable?:(item:NoteMenuItem)=>boolean
  }) {}
  private createPopup(parent: BrowserWindow): BrowserWindow {
    return new BrowserWindow({ parent, title:this.options.title??'笔记斜杠菜单', width:312, height:98, show:false, frame:false, transparent:true,
      ...(this.nativeMaterial ? {type:'panel' as const,vibrancy:'menu' as const,visualEffectState:'active' as const,backgroundColor:'#00000000',roundedCorners:true} : {}),
      focusable:false, acceptFirstMouse:true, resizable:false, movable:false, minimizable:false, maximizable:false, fullscreenable:false,
      skipTaskbar:true, hasShadow:this.nativeMaterial, webPreferences:{partition:'notes-menu',nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false} })
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
    return popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(this.options.documentHtml??noteMenuDocumentHtml))
  }
  private navigate(state:OpenMenu,url:string):void {
      try {
        const link = new URL(url), [,action,id] = link.pathname.split('/'), revision = Number(link.searchParams.get('revision')), parentId=link.searchParams.get('parent')||undefined
        if (link.protocol !== 'ework-note-menu:' || link.hostname !== state.ticket || revision !== state.input.revision) return
        if (this.options.owner() !== state.owner || !this.options.canRead(state.input.sessionId)) { this.close(); return }
        const parentItem=state.input.items.find(item=>item.id===parentId),item=parentId?parentItem?.children?.find(item=>item.id===id):state.input.items.find(item=>item.id===id)
        if(!item||this.options.selectable?.(item)===false||parentId&&state.input.submenu?.parentId!==parentId||!['open','back','select'].includes(action!))return
        if(action==='open'||action==='back'){if(!item.children?.length||parentId)return}else{if(item.children)return;this.close()}
        state.parent.focus()
        this.emit(state,{revision,action:action as NoteMenuEvent['action'],itemId:id,...(parentId?{parentId}:{})})
      } catch { /* Invalid navigation never leaves the isolated menu. */ }
  }
  private emit(state:OpenMenu,event:Omit<NoteMenuEvent,'sessionId'|'owner'|'menuId'>):void {
    const value={sessionId:state.input.sessionId,owner:state.owner,menuId:state.input.menuId,...event}
    if(this.options.emit)this.options.emit(value);else state.parent.webContents.send('notes:menu-event',value)
  }
  private trackPointer(state:OpenMenu):void {
    state.pointerSignature=undefined;state.pointerScroll=new Map();state.pointerScrollable=false
    if(state.pointerTimer)return
    const tick=async()=>{
      if(this.current!==state||state.updating||state.pointerPending||state.parent.isDestroyed())return
      const input=state.input
      if(!this.currentInput(state,input)){if(this.current===state)this.close();return}
      const point=screen.getCursorScreenPoint(),pointKey=point.x+','+point.y,zoom=state.parent.webContents.getZoomFactor()
      const panes=[state.popup,state.childPopup].filter((pane):pane is BrowserWindow=>!!pane&&!pane.isDestroyed()&&pane.isVisible()).map(pane=>({pane,bounds:pane.getBounds()}))
      const signature=JSON.stringify([input.revision,point,zoom,panes.map(({bounds})=>bounds)])
      if(state.pointerSignature===signature&&!state.pointerScrollable)return
      const moved=state.pointerPoint!==pointKey
      state.pointerSignature=signature;state.pointerPoint=pointKey;state.pointerPending=true
      let scrollable=false
      try {
        for(const {pane,bounds} of panes){
          const hit=await pane.webContents.executeJavaScript(noteMenuPointerScript((point.x-bounds.x)/zoom,(point.y-bounds.y)/zoom)) as {href:string|null;submenu:boolean;scroll?:number;scrollable?:boolean}|null
          if(!this.currentInput(state,input))return
          scrollable||=hit?.scrollable===true
          const previousScroll=state.pointerScroll?.get(pane),scrolled=previousScroll!==undefined&&previousScroll!==(hit?.scroll||0);state.pointerScroll?.set(pane,hit?.scroll||0)
          // A wheel scroll changes the row under a stationary mouse. A normal
          // keyboard repaint resets this baseline and must not close its child.
          if(scrolled&&pane===state.popup&&input.submenu)this.navigate(state,`ework-note-menu://${state.ticket}/back/${input.submenu.parentId}?revision=${input.revision}`)
          else if((moved||scrolled)&&pane===state.popup&&typeof hit?.href==='string'){
            if(hit.submenu&&new URL(hit.href).pathname.split('/')[2]!==input.submenu?.parentId)this.navigate(state,hit.href)
            else if(!hit.submenu&&input.submenu)this.navigate(state,`ework-note-menu://${state.ticket}/back/${input.submenu.parentId}?revision=${input.revision}`)
          }
        }
      }catch { /* A dismissed pane may finish its last pointer update. */ }
      finally {if(this.currentInput(state,input))state.pointerScrollable=scrollable;state.pointerPending=false}
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
        const input = state.input, previous=state.painted, sameRows=(a:NoteMenuState['items']|undefined,b:NoteMenuState['items'])=>!!a&&a.map(item=>item.id).join(',')===b.map(item=>item.id).join(','), content = state.parent.getContentBounds(), zoom = state.parent.webContents.getZoomFactor()
        const anchor = { x:content.x + input.anchor.x * zoom, y:content.y + input.anchor.y * zoom, width:input.anchor.width * zoom, height:input.anchor.height * zoom }
        const display = screen.getDisplayNearestPoint({x:Math.round(anchor.x),y:Math.round(anchor.y)}).workArea
        const work = this.options.displayBounds?display:noteMenuWorkArea(display,content)
        if(work.width<=16||work.height<=16)throw Error('No visible notes menu viewport')
        const limits={height:(work.height-16)/zoom-this.shadowInset*2,width:(work.width-16)/zoom-this.shadowInset*2,shadowInset:this.shadowInset}
        const present=this.options.presentation??noteMenuPresentation
        const desired=present(input,state.ticket,limits)
        const bounds=noteMenuBounds(anchor,work,desired.root.height,zoom,desired.root.width,this.shadowInset)
        const presentation=present(input,state.ticket,{...limits,rootHeight:bounds.height/zoom-this.shadowInset*2})
        state.popup.setBounds(bounds)
        state.popup.webContents.setZoomFactor(zoom)
        const parentIndex=input.items.findIndex(item=>item.id===input.submenu?.parentId)
        const geometry=await state.popup.webContents.executeJavaScript(`(()=>{const top=${sameRows(previous?.items,input.items)?"document.querySelector('[role=listbox]')?.scrollTop||0":'0'};document.body.className=${JSON.stringify((input.dark?'dark':'')+(this.nativeMaterial?' native-material':''))};document.querySelector('main').innerHTML=${JSON.stringify(presentation.root.html)};const list=document.querySelector('[role=listbox]');if(list){list.scrollTop=top;${!input.submenu&&previous?.selectedIndex!==input.selectedIndex?"list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});":''}}return{pane:document.querySelector('.root-menu').getBoundingClientRect().toJSON(),item:document.getElementById('item-root-${parentIndex}')?.getBoundingClientRect().toJSON()};})()`) as {pane:Electron.Rectangle;item?:Electron.Rectangle}
        if (!this.currentInput(state,input)) { if(this.current===state&&state.input===input)this.close(); continue }
        state.popup.showInactive()
        if (presentation.child && geometry.item) {
          if (!state.childPopup) { state.childPopup=this.createPopup(state.parent);state.childReady=this.configurePopup(state,state.childPopup) }
          const child=state.childPopup;await state.childReady
          if (!this.currentInput(state,input) || child.isDestroyed()) continue
          const screenRect=(rect:Electron.Rectangle)=>({x:bounds.x+rect.x*zoom,y:bounds.y+rect.y*zoom,width:rect.width*zoom,height:rect.height*zoom})
          child.setBounds(noteSubmenuBounds(screenRect(geometry.pane),screenRect(geometry.item),work,presentation.child.height,presentation.child.width,zoom,this.shadowInset))
          child.webContents.setZoomFactor(zoom)
          const oldParent=previous?.items.find(item=>item.id===previous.submenu?.parentId),newParent=input.items.find(item=>item.id===input.submenu?.parentId),keepChild=previous?.submenu?.parentId===input.submenu?.parentId&&sameRows(oldParent?.children,newParent?.children||[]),revealChild=input.submenu?.keyboardActive!==false&&(previous?.submenu?.parentId!==input.submenu?.parentId||previous?.submenu?.selectedIndex!==input.submenu?.selectedIndex||previous?.submenu?.keyboardActive===false)
          await child.webContents.executeJavaScript(`(()=>{const top=${keepChild?"document.querySelector('[role=listbox]')?.scrollTop||0":'0'};document.body.className=${JSON.stringify((input.dark?'dark':'')+(this.nativeMaterial?' native-material':''))};document.querySelector('main').innerHTML=${JSON.stringify(presentation.child.html)};const list=document.querySelector('[role=listbox]');if(list){list.scrollTop=top;${revealChild?"list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});":''}}})()`)

          if (this.currentInput(state,input) && !child.isDestroyed()) child.showInactive()
        } else this.closeChild(state)
        state.painted=input
        this.trackPointer(state)
      }
    } catch { if (this.current === state) this.dismiss(state) }
    finally { state.updating = false }
  }
  private dismiss(state: OpenMenu): void {
    this.close()
    if (!state.parent.isDestroyed() && this.options.owner() === state.owner) this.emit(state,{revision:state.input.revision,action:'cancel'})
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
