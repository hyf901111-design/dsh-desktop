import {noteUiText} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import type {NoteMenuState} from './notes-menu'
import {noteLibraryIcons} from '../main/notes/library-icons'
import {noteCreationIcon} from './note-creation-icons'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!))
const MENU_SHADOW_INSET = 24
const BASIC_ICONS=['paragraph','heading','heading_2','heading_3','heading_4','numbered_list','bullet_list','check_list','code_block','quote','divider','toggle_list']
const paths:Record<string,string>={library:'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 11h5M11.5 9v5',paragraph:'M3 3h10M8 3v10',quote:'M2 4h4v4H3l-1 4M9 4h4v4h-3l-1 4',toggle_list:'M4 3l7 5-7 5z',numbered_list:'M6 4h8M6 8h8M6 12h8M2 2h1v4M1 9c3-2 4 0 2 2l-1 2h2',bullet_list:'M6 4h8M6 8h8M6 12h8M2 4h1M2 8h1M2 12h1',check_list:'M3 2h10v12H3zM5 8l2 2 4-4',code_block:'M5 4 1 8l4 4M11 4l4 4-4 4M9 2 7 14',divider:'M2 6h12M2 10h12',table:'M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12',image:'M2 2h12v12H2zM2 11l4-4 3 3 2-2 3 3M10 5h.01',video:'M5 3l8 5-8 5z',audio:'M5 12V4l8-2v9M5 10H2v4h3M13 9h-3v4h3',file:'M3 2h7l3 3v9H3zM10 2v4h3M5 9h6M5 12h6',emoji:'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1M4 10c2 3 6 3 8 0M5 5h.01M11 5h.01'}
const tone=(key:string)=>({sparkles:'blue',link:'cyan',image:'gold',video:'cyan',audio:'cyan',file:'cyan',table:'green',check_list:'blue',code_block:'green'}[key]||'neutral')
function menuIcon(key:string, library=false){
 if(library&&Object.hasOwn(noteLibraryIcons,key))return noteLibraryIcons[key]!.replaceAll('#9DA5B2','currentColor')
 const creation=noteCreationIcon(key)
 if(creation)return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:'+creation.color+'">'+creation.paths.map(path=>'<path d="'+path+'"/>').join('')+'</svg>'
 const heading=key.match(/^(?:toggle_)?heading(?:_(\d))?$/)
 const content=heading?'<text x="1" y="12" stroke="none" fill="currentColor" font-size="12" font-family="-apple-system,sans-serif">'+(key.startsWith('toggle_')?'▸':'')+'H'+(heading[1]||'1')+'</text>':'<path d="'+(paths[key]||paths.paragraph)+'"/>'
 return '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+content+'</svg>'
}
export function validateNoteMenu(input: NoteMenuState): void {
  if (!input || !/^[\w-]{1,80}$/.test(input.menuId) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      typeof input.dark !== 'boolean' || (input.locale !== undefined && input.locale !== 'en' && input.locale !== 'zh') || !input.anchor || Object.values(input.anchor).length !== 4 ||
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
  if(input.submenu){const parent=input.items.find(item=>item.id===input.submenu!.parentId);if(!parent?.children?.length||!Number.isInteger(input.submenu.selectedIndex)||input.submenu.selectedIndex<0||input.submenu.selectedIndex>=parent.children.length||(input.submenu.keyboardActive!==undefined&&typeof input.submenu.keyboardActive!=='boolean'))throw Error('子菜单选择无效。')}
}

/** The screen, rather than the parent window, bounds this native floating menu. */
type MenuPane={html:string;height:number;width:number}
export function noteMenuPresentation(state: NoteMenuState, ticket: string, limits: {height?:number;width?:number;shadowInset?:number} = {}): MenuPane&{root:MenuPane;child?:MenuPane} {
  const shadowInset=limits.shadowInset??MENU_SHADOW_INSET
  const t=(value:string)=>noteUiText(value,state.locale)
  const grid=state.items.some(item=>item.icon==='paragraph')&&state.items.some(item=>item.icon==='heading')&&state.items.some(item=>item.icon==='bullet_list')
  const basic=grid?state.items.filter(item=>BASIC_ICONS.includes(item.icon)):[],rest=grid?state.items.filter(item=>!BASIC_ICONS.includes(item.icon)):state.items
  const parent=state.items.find(item=>item.id===state.submenu?.parentId)
  const row=(item:NoteMenuState['items'][number],iconOnly=false,parentId?:string)=>{
    const index=parentId?parent!.children!.indexOf(item):state.items.indexOf(item),selected=parentId?state.submenu?.keyboardActive!==false&&index===state.submenu?.selectedIndex:!state.submenu&&index===state.selectedIndex
    const route=item.children?'open':'select',suffix=parentId?'&parent='+parentId:''
    return `<a role="option" aria-label="${escapeHtml(item.title)}" title="${escapeHtml(item.title+(item.badge?' · '+item.badge:''))}" aria-selected="${selected}" ${item.children?'aria-haspopup="menu" aria-expanded="'+(state.submenu?.parentId===item.id)+'" data-submenu=""':''} id="item-${parentId||'root'}-${index}" href="ework-note-menu://${ticket}/${route}/${item.id}?revision=${state.revision}${suffix}" class="${iconOnly?'basic-item':''}"><span class="icon ${parentId?'library-icon':tone(item.icon)}">${menuIcon(item.icon,!!parentId)}</span>${iconOnly?'':`<span class="label">${escapeHtml(item.title)}</span>`}${item.children?'<span class="chevron">›</span>':''}</a>`
  }
  const maxHeight=limits.height??Infinity,maxWidth=limits.width??Infinity
  // Keep native and replay menus at their established width. Long rosters
  // scroll within one pane instead of adding columns across the document.
  const list=(items:NoteMenuState['items'],baseHeight:number,columnWidth:number,parentId?:string)=>{
    const positions=new Map(items.map((item,index)=>[item.id,baseHeight-7+index*32]))
    return {html:'<div class="menu-list">'+items.map(item=>row(item,false,parentId)).join('')+'</div>',height:Math.min(maxHeight,baseHeight+items.length*32),width:Math.min(maxWidth,columnWidth),positions}
  }
  const gridColumns=6
  const basicHeight=basic.length?24+Math.ceil(basic.length/gridColumns)*32+8:0
  const basicHtml=basic.length?'<h2>'+t('基础格式')+'</h2><div class="basic-grid" style="grid-template-columns:repeat('+gridColumns+',minmax(0,1fr));max-width:'+gridColumns*42+'px">'+basic.map(item=>row(item,true)).join('')+'</div>':''
  const root=list(rest,14+basicHeight+(grid&&rest.length?24:0),264)
  root.width=Math.min(maxWidth,Math.max(root.width,basic.length?gridColumns*42+12:0))
  if(!state.items.length)root.height=50
  const rootHtml=`<section class="menu root-menu" style="height:${root.height}px;width:${root.width}px"><div id="items" role="listbox" aria-label="${t('笔记斜杠菜单')}">${state.items.length?basicHtml+(grid&&rest.length?'<h2>'+t('插入')+'</h2>':'')+root.html:'<p class="empty">'+t('没有匹配的命令')+'</p>'}</div></section>`
  const child=parent?list(parent.children!,14,260,parent.id):undefined,showRoot=!child||root.width+4+child.width<=maxWidth
  const childHtml=child?`<section class="menu child-menu" style="height:${child.height}px;width:${child.width}px"><div role="listbox" aria-label="${t('组件库')}">${child.html}</div></section>`:''
  const childTop=showRoot&&child?Math.max(0,Math.min(root.positions.get(parent!.id)||0,maxHeight-child.height)):0
  const html=(showRoot?rootHtml:'')+(child?childHtml.replace('style="height:','style="margin-top:'+childTop+'px;height:'):'')
  return {html,height:Math.max(showRoot?root.height:0,(child?.height||0)+childTop)+shadowInset*2,width:(showRoot?root.width:0)+(child?(showRoot?4:0)+child.width:0)+shadowInset*2,root:{html:rootHtml,height:root.height+shadowInset*2,width:root.width+shadowInset*2},...(child?{child:{html:childHtml,height:child.height+shadowInset*2,width:child.width+shadowInset*2}}:{})}
}
export const noteMenuDocumentHtml = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>Note commands</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{font:13px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#252525;user-select:none;--bg:rgba(255, 255, 255, 0.78);--hover:#e7e7e7;--muted:#777;--line:rgba(0,0,0,.10);--shadow:0 8px 24px -4px rgba(0,0,0,.16)}body.dark{color:#eee;--bg:rgba(43, 43, 43, 0.68);--hover:#383838;--muted:#aaa;--line:rgba(255,255,255,.10);--shadow:0 8px 24px -4px rgba(0,0,0,.32)}
main{height:100%;display:flex;align-items:flex-start;gap:4px;padding:24px}.menu{width:264px;max-height:100%;display:flex;flex-direction:column;border:0;border-radius:10px;background:var(--bg);box-shadow:var(--shadow);backdrop-filter:blur(36px) saturate(1.2);-webkit-backdrop-filter:blur(36px) saturate(1.2);overflow:hidden;padding:6px 5px}.menu>[role=listbox]{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--muted) transparent}.menu-list{display:block}.menu>[role=listbox]::-webkit-scrollbar{width:4px}.menu>[role=listbox]::-webkit-scrollbar-thumb{background:var(--muted);border-radius:4px}.library-icon{width:16px;height:16px;color:#667085}body.dark .library-icon{color:#9da5b2}h2{font-size:12px;font-weight:400;line-height:24px;margin:0;padding:0 8px;color:var(--muted)}a{height:32px;display:flex;align-items:center;gap:10px;padding:0 8px;text-decoration:none;color:inherit;border-radius:5px;cursor:pointer}a:hover,a[data-pointer-hover=true],a[aria-selected=true],a[aria-expanded=true]{background:var(--hover)}.icon{width:18px;height:18px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--muted)}.icon svg{display:block}.label{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.basic-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;margin:0 2px 8px}.basic-item{justify-content:center;padding:0}.basic-item .icon{color:inherit}.basic-item[aria-selected=true]{color:#568ef7;background:rgb(65 117 226 / .18)}.gold{color:#d7a23d}.cyan{color:#33b4d6}.green{color:#42aa85}.blue{color:#7988f3}.empty{padding:8px;margin:0}.chevron{color:var(--muted)}.child-menu{width:260px}
body.native-material main{padding:0}body.native-material .menu{box-shadow:none}
</style><main></main>`
