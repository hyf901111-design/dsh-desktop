import {notesUiLocaleSource} from './notes-ui-locale.mjs'
export function EWorkNoteExportMenu({sessionId}) {
 useNoteUiLocale();
 const h=react.createElement,[open,setOpen]=react.useState(false),button=react.useRef(null),menu=react.useRef(null),[position,setPosition]=react.useState({left:0,top:0})
 const close=focus=>{setOpen(false);if(focus)button.current?.focus()}
 react.useEffect(()=>{if(!open)return;const outside=event=>{if(!button.current?.contains(event.target)&&!menu.current?.contains(event.target))close(false)};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true)},[open])
 react.useLayoutEffect(()=>{if(open)menu.current?.querySelector('button')?.focus()},[open])
 const icon=h('svg',{width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.25,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M8 10V2m-3 3 3-3 3 3M3 9v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9'}))
 const toggle=()=>{if(open){close(false);return}const r=button.current.getBoundingClientRect();setPosition({left:Math.max(8,r.right-160),top:r.bottom+5});setOpen(true)}
 return h(react.Fragment,null,h('span',{'data-en-challenge-tools':sessionId,className:'en-challenge-header-slot'}),h('button',{ref:button,type:'button',className:'en-header-export',title:noteUiText('导出笔记'),'aria-label':noteUiText('导出笔记'),'aria-haspopup':'menu','aria-expanded':open,onClick:toggle,onKeyDown:event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();toggle()}}},icon),
 open&&react_dom.createPortal(h('div',{ref:menu,role:'menu','aria-label':noteUiText('笔记导出格式'),className:'en-export-menu',style:position,onKeyDown:event=>{const items=[...menu.current.querySelectorAll('button')],i=items.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();close(true)}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();items[(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}}},
 ...[['Word','docx'],['PDF','pdf'],['Markdown','md']].map(([label,format])=>h('button',{type:'button',role:'menuitem',key:format,onClick:()=>{close(true);document.dispatchEvent(new CustomEvent('sherlock:notes-export',{detail:{sessionId,format}}))}},label))),document.body))
}
export function patchNotesExportMenu(source) {
 const marker='/* ework:notes-export-menu:v1 */',anchor='function ConversationSessionHeader('
 const helpers=marker+'\n'+notesUiLocaleSource+'\n'+EWorkNoteExportMenu.toString()+'\n'
 if(source.includes(marker))source=source.slice(0,source.indexOf(marker))+helpers+source.slice(source.indexOf(anchor,source.indexOf(marker)))
 else {if(source.split(anchor).length!==2)throw Error('无法定位笔记导出菜单。');source=source.replace(anchor,helpers+anchor)}
 const start=source.indexOf('/* ework:notes-header-export:v1 */'),end=source.indexOf('renderSlot("conversation.session.header.utilities", {})]',start)
 if(start<0||end<0)throw Error('无法定位笔记共用顶栏导出按钮。')
 return source.slice(0,start)+`/* ework:notes-header-export:v1 */
children: [active?.id === 'notes' && (0,react_jsx_runtime.jsx)(EWorkNoteExportMenu,{sessionId}), `+source.slice(end)
}
