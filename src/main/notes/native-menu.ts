import { BrowserWindow, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import type { NoteMenuState, NotesNativeMenu } from '../../shared/notes-menu'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!))
const icons: Record<string, string> = {
  heading:'H1', heading_2:'H2', heading_3:'H3', heading_4:'H4', heading_5:'H5', heading_6:'H6',
  paragraph:'T', quote:'❞', toggle_list:'▸', numbered_list:'1.', bullet_list:'☷', check_list:'☑',
  code_block:'‹›', divider:'―', table:'▦', image:'▧', video:'▷', audio:'♫', file:'▤', emoji:'☺'
}
export function validateNoteMenu(input: NoteMenuState): void {
  if (!input || !/^[\w-]{1,80}$/.test(input.menuId) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      typeof input.dark !== 'boolean' || !input.anchor || Object.values(input.anchor).length !== 4 ||
      !(['x','y','width','height'] as const).every(key => typeof input.anchor[key] === 'number' && Number.isFinite(input.anchor[key]) && Math.abs(input.anchor[key]) <= 20000) ||
      input.anchor.width < 0 || input.anchor.height < 0 || !Array.isArray(input.items) || input.items.length > 80 ||
      (input.selectedIndex !== undefined && (!Number.isInteger(input.selectedIndex) || input.selectedIndex < 0 || input.selectedIndex >= input.items.length))) throw Error('菜单内容无效。')
  const ids = new Set<string>()
  for (const item of input.items) {
    if (!item || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) ||
        !(['title','subtext','group','badge','icon'] as const).every(key => typeof item[key] === 'string' && item[key].length <= 256)) throw Error('菜单选项无效。')
    ids.add(item.id)
  }
}

/** The screen, rather than the parent window, bounds this native floating menu. */
export function noteMenuBounds(anchor: NoteMenuState['anchor'], work: Electron.Rectangle, desiredHeight: number, zoom = 1): Electron.Rectangle {
  const margin = 8, width = Math.min(Math.ceil(320 * zoom), work.width - margin * 2), height = Math.min(Math.ceil(desiredHeight * zoom), work.height - margin * 2)
  const below = work.y + work.height - anchor.y - anchor.height - margin - 6, above = anchor.y - work.y - margin - 6
  const y = below >= height || below >= above ? anchor.y + anchor.height + 6 : anchor.y - height - 6
  return { x: Math.round(Math.max(work.x + margin, Math.min(anchor.x, work.x + work.width - width - margin))),
    y: Math.round(Math.max(work.y + margin, Math.min(y, work.y + work.height - height - margin))), width, height }
}

export function noteMenuPresentation(state: NoteMenuState, ticket: string): { html: string; height: number } {
  let previous = '', groups = 0
  const rows = state.items.map((item, index) => {
    const group = item.group !== previous && item.group ? `<h2>${escapeHtml(item.group)}</h2>` : ''; previous = item.group; if (group) groups++
    const glyph = icons[item.icon] || (item.icon.startsWith('toggle_heading') ? '▸ H' : 'T')
    return `${group}<a role="option" aria-selected="${index === state.selectedIndex}" id="item-${index}" href="ework-note-menu://${ticket}/select/${item.id}?revision=${state.revision}"><span class="icon" aria-hidden="true">${glyph}</span><span class="label"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtext)}</small></span>${item.badge ? `<kbd>${escapeHtml(item.badge)}</kbd>` : ''}</a>`
  }).join('')
  return { html: `<div id="items" role="listbox" aria-label="笔记斜杠菜单">${rows || '<p class="empty">正在读取选项…</p>'}</div><footer>↑↓ 选择&nbsp; · &nbsp;↵ 插入&nbsp; · &nbsp;Esc 关闭</footer>`, height: state.items.length ? 16 + groups * 24 + state.items.length * 52 + 28 : 90 }
}
const documentHtml = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>笔记斜杠菜单</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{font:13px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#252525;user-select:none;--bg:#f5f5f5;--hover:#e7e7e7;--muted:#777;--line:#ddd;--icon:#e5e5e5}body.dark{color:#eee;--bg:#272727;--hover:#383838;--muted:#aaa;--line:#414141;--icon:#191919}
main{height:100%;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden;padding:7px 3px 0}#items{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent}h2{font-size:12px;font-weight:500;line-height:24px;margin:0;padding:0 10px;color:var(--muted)}a{height:52px;display:flex;align-items:center;gap:10px;padding:6px 10px;text-decoration:none;color:inherit;border-radius:6px}a:hover,a[aria-selected=true]{background:var(--hover)}.icon{width:34px;height:34px;flex:none;display:grid;place-items:center;background:var(--icon);border-radius:5px;font-size:17px}.label{flex:1;min-width:0}strong,small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}strong{font-size:13px;font-weight:500}small{font-size:11px;line-height:16px;color:var(--muted)}kbd{flex:none;font:9px/16px -apple-system,sans-serif;background:var(--icon);border-radius:8px;padding:0 5px;color:var(--muted)}footer{flex:none;height:28px;border-top:1px solid var(--line);font-size:11px;line-height:27px;color:var(--muted);padding:0 10px}.empty{padding:8px 10px;margin:0}
</style><main></main>`

type OpenMenu = { input: NoteMenuState; owner: string; ticket: string; parent: BrowserWindow; popup: BrowserWindow; ready: Promise<unknown>; pending: boolean; updating: boolean; unlisten(): void }
export class NoteNativeMenu implements NotesNativeMenu {
  private current?: OpenMenu
  private retired = new Set<string>()
  constructor(private options: { getWindow(): BrowserWindow | undefined; owner(): string; canRead(sessionId: string): boolean }) {}
  sync(input: NoteMenuState, owner: string): void {
    validateNoteMenu(input)
    const parent = this.options.getWindow()
    if (!parent || parent.isDestroyed() || !parent.isVisible() || !parent.isFocused() || owner !== this.options.owner() || !this.options.canRead(input.sessionId)) { this.close(); throw Error('笔记会话不可用。') }
    if (this.retired.has(input.menuId)) throw Error('菜单已关闭。')
    if (this.current && (this.current.input.menuId !== input.menuId || this.current.owner !== owner || this.current.input.sessionId !== input.sessionId || this.current.parent !== parent)) this.close()
    if (!this.current) {
      const popup = new BrowserWindow({ parent, title:'笔记斜杠菜单', width:320, height:90, show:false, frame:false, transparent:true,
        focusable:false, acceptFirstMouse:true, resizable:false, movable:false, minimizable:false, maximizable:false, fullscreenable:false,
        skipTaskbar:true, hasShadow:true, webPreferences:{partition:'notes-menu',nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false} })
      const state: OpenMenu = { input, owner, ticket:randomUUID(), parent, popup, pending:true, updating:false, ready:Promise.resolve(), unlisten:()=>{} }
      this.current = state
      const cancel = () => { if (this.current === state) this.dismiss(state) }
      const events = ['blur','move','resize','hide','minimize','closed'] as const
      for (const event of events) (parent as NodeJS.EventEmitter).on(event, cancel)
      const navigating = (_event:unknown,_url:string,_inPlace:boolean,isMainFrame:boolean) => { if(isMainFrame) cancel() }
      parent.webContents.on('did-start-navigation', navigating)
      state.unlisten = () => { for (const event of events) (parent as NodeJS.EventEmitter).removeListener(event, cancel); parent.webContents.removeListener('did-start-navigation', navigating) }
      popup.webContents.setWindowOpenHandler(() => ({action:'deny'}))
      popup.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
      popup.webContents.on('will-navigate', (event, url) => {
        event.preventDefault()
        if (this.current !== state) return
        try {
          const link = new URL(url), id = link.pathname.slice('/select/'.length), revision = Number(link.searchParams.get('revision'))
          if (link.protocol !== 'ework-note-menu:' || link.hostname !== state.ticket || !link.pathname.startsWith('/select/') || revision !== state.input.revision || !state.input.items.some(item => item.id === id)) return
          if (this.options.owner() !== state.owner || !this.options.canRead(state.input.sessionId)) { this.close(); return }
          this.close()
          state.parent.webContents.send('notes:menu-event',{sessionId:state.input.sessionId,owner:state.owner,menuId:state.input.menuId,revision,action:'select',itemId:id})
        } catch { /* Invalid navigation never leaves the isolated menu. */ }
      })
      popup.on('closed',cancel)
      state.ready = popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentHtml))
    }
    this.current.input = input
    this.current.pending = true
    void this.paint(this.current)
  }
  private async paint(state: OpenMenu): Promise<void> {
    if (state.updating) return
    state.updating = true
    try {
      await state.ready
      while (this.current === state && state.pending && !state.popup.isDestroyed()) {
        state.pending = false
        const input = state.input, presentation = noteMenuPresentation(input,state.ticket), content = state.parent.getContentBounds(), zoom = state.parent.webContents.getZoomFactor()
        const anchor = { x:content.x + input.anchor.x * zoom, y:content.y + input.anchor.y * zoom, width:input.anchor.width * zoom, height:input.anchor.height * zoom }
        const work = screen.getDisplayNearestPoint({x:Math.round(anchor.x),y:Math.round(anchor.y)}).workArea
        state.popup.setBounds(noteMenuBounds(anchor,work,presentation.height,zoom))
        state.popup.webContents.setZoomFactor(zoom)
        await state.popup.webContents.executeJavaScript(`document.body.className=${JSON.stringify(input.dark?'dark':'')};document.querySelector('main').innerHTML=${JSON.stringify(presentation.html)};document.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});`)
        if (this.current === state && this.options.owner() === state.owner && this.options.canRead(input.sessionId) && !state.popup.isDestroyed()) state.popup.showInactive()
        else if (this.current === state) this.close()
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
    this.current = undefined; state.unlisten()
    if (!state.popup.isDestroyed()) state.popup.destroy()
  }
}
