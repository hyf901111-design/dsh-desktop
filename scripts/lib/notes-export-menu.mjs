import {notesUiLocaleSource} from './notes-ui-locale.mjs'
export function EWorkNoteExportMenu({sessionId}) {
 useNoteUiLocale()
 const h=react.createElement, button=react.useRef(null), menu=react.useRef(null), submenu=react.useRef(null)
 const [position,setPosition]=react.useState(null),[branch,setBranch]=react.useState(null)
 const [preview,setPreview]=react.useState(false)
 const close=focus=>{
  setPosition(null);setBranch(null)
  if(focus)button.current?.focus()
 }
 react.useEffect(()=>{
  if(!position)return
  const outside=event=>{if(!button.current?.contains(event.target)&&!menu.current?.contains(event.target))close(false)}
  const resize=()=>close(false)
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',resize)
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',resize)}
 },[position])
 react.useLayoutEffect(()=>{
  if(position)menu.current?.querySelector('button:not(:disabled)')?.focus()
 },[position])
 react.useLayoutEffect(()=>{
  if(branch?.focus)submenu.current?.querySelector('button')?.focus()
 },[branch])
 const toggle=()=>{
  if(position){close(false);return}
  const rect=button.current.getBoundingClientRect()
  setPreview(!!button.current.parentElement.querySelector('.en-header-view-mode[aria-pressed=true]'))
  setPosition({left:Math.max(8,rect.right-160),top:rect.bottom+5})
 }
 const exportFormats=[['Word','docx'],['PDF','pdf'],['Markdown','md']]
 const openExport=(anchor,focus)=>{
  const rect=anchor.getBoundingClientRect(), outer=menu.current.getBoundingClientRect()
  const opensLeft=outer.left>=167
  const top=Math.max(8,Math.min(rect.top,window.innerHeight-18-exportFormats.length*32))
  setBranch({focus,opensLeft,top:top-outer.top-menu.current.clientTop})
 }
 const returnToParent=()=>{
  menu.current?.querySelector('[data-note-export]')?.focus()
  setBranch(null)
 }
 const dispatch=(kind,format)=>{
  close(true)
  document.dispatchEvent(new CustomEvent('sherlock:notes-'+kind,{detail:format?{sessionId,format}:{sessionId}}))
 }
 const icon=h('svg',{width:16,height:16,viewBox:'0 0 20 20',fill:'currentColor','aria-hidden':true},
  ...[4,10,16].map(cx=>h('circle',{key:cx,cx,cy:10,r:1.65})))
 const arrow=h('svg',{width:12,height:12,viewBox:'0 0 12 12',fill:'none','aria-hidden':true},
  h('path',{d:'M7.5 2.5 4 6l3.5 3.5',stroke:'currentColor',strokeWidth:1.25,strokeLinecap:'round',strokeLinejoin:'round'}))
 const menuLabel=noteUiText('更多笔记操作')
 return h(react.Fragment,null,h('span',{'data-en-challenge-tools':sessionId,className:'en-challenge-header-slot'}),
  h('span',{className:'en-header-icon-group'},
   h('span',{'data-en-view-mode-host':sessionId}),
   h('button',{ref:button,type:'button',className:'en-header-export',title:menuLabel,'aria-label':menuLabel,
    'aria-haspopup':'menu','aria-expanded':!!position,onClick:toggle,onKeyDown:event=>{if(event.key==='ArrowDown'&&!position){event.preventDefault();toggle()}}},icon)),
  position&&react_dom.createPortal(h('div',{
   ref:menu,role:'menu','aria-label':menuLabel,className:'en-export-menu',style:position,
   onKeyDown:event=>{
    const inChild=submenu.current?.contains(event.target)
    if(event.key==='Escape'){
     event.preventDefault();event.stopPropagation()
     if(inChild)returnToParent();else close(true)
    }else if(inChild&&event.key===(branch.opensLeft?'ArrowRight':'ArrowLeft')){
     event.preventDefault();returnToParent()
    }else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault()
     const items=[...(inChild?submenu.current:menu.current).querySelectorAll(':scope > button:not(:disabled)')]
     const direction=event.key==='ArrowDown'?1:-1
     items[(items.indexOf(document.activeElement)+direction+items.length)%items.length]?.focus()
    }
   }
  },
  h('button',{type:'button',role:'menuitem',disabled:preview,onPointerEnter:()=>setBranch(null),
   onClick:()=>dispatch('import')},noteUiText('导入')),
  h('button',{type:'button',role:'menuitem','data-note-export':true,
   'aria-haspopup':'menu','aria-expanded':!!branch,
   onPointerEnter:event=>{if(event.pointerType!=='touch'&&!branch)openExport(event.currentTarget,false)},
   onClick:event=>openExport(event.currentTarget,true),
   onKeyDown:event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();openExport(event.currentTarget,true)}}
  },noteUiText('导出'),arrow),
  branch&&h('div',{ref:submenu,role:'menu',className:'en-export-menu en-note-format-menu',
   'aria-label':noteUiText('笔记导出格式'),style:{top:branch.top,...(branch.opensLeft?{right:'100%'}:{left:'100%'})}},
   ...exportFormats.map(([label,format])=>h('button',{type:'button',role:'menuitem',key:format,onClick:()=>dispatch('export',format)},label)))),document.body))
}
export function patchNotesExportMenu(source) {
 const marker='/* ework:notes-export-menu:v1 */',anchor='function ConversationSessionHeader('
 const helpers=marker+'\n'+notesUiLocaleSource+'\n'+EWorkNoteExportMenu.toString()+'\n'
 if(source.includes(marker))source=source.slice(0,source.indexOf(marker))+helpers+source.slice(source.indexOf(anchor,source.indexOf(marker)))
 else {if(source.split(anchor).length!==2)throw Error('无法定位笔记操作菜单。');source=source.replace(anchor,helpers+anchor)}
 const start=source.indexOf('/* ework:notes-header-export:v1 */'),end=source.indexOf('renderSlot("conversation.session.header.utilities", {})]',start)
 if(start<0||end<0)throw Error('无法定位笔记共用顶栏操作按钮。')
 return source.slice(0,start)+`/* ework:notes-header-export:v1 */
children: [active?.id === 'notes' && (0,react_jsx_runtime.jsx)(EWorkNoteExportMenu,{sessionId}), `+source.slice(end)
}
