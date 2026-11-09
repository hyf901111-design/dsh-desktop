import type {NoteMenuState,NoteMenuItem} from './notes-menu'
export type ComponentMenuItem=NoteMenuItem&{disabled?:boolean;separator?:boolean;image?:string;checked?:boolean}
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function componentMenuPresentation(state:NoteMenuState,ticket:string,limits:{height?:number;rootHeight?:number;width?:number;shadowInset?:number}={}){
 const inset=limits.shadowInset??0,parent=state.items.find(item=>item.id===state.submenu?.parentId)
 const pane=(items:ComponentMenuItem[],width:number,parentId?:string)=>{
  const height=Math.max(1,Math.min(16+items.reduce((sum,item)=>sum+(item.separator?11:33),0),limits.height??Infinity,parentId?Infinity:limits.rootHeight??Infinity))
  const html=items.map((item,index)=>{
   if(item.separator)return '<div class="divider" role="separator"></div>'
   const selected=parentId?state.submenu?.keyboardActive!==false&&state.submenu?.selectedIndex===index:!state.submenu&&state.selectedIndex===index
   const href=item.disabled?'':`href="ework-note-menu://${ticket}/${item.children?'open':'select'}/${item.id}?revision=${state.revision}${parentId?'&parent='+parentId:''}"`
   const image=item.image&&/^data:image\/png;base64,[A-Za-z\d+/=]+$/u.test(item.image)&&item.image.length<=32768?`<img width="16" height="16" src="${item.image}" alt="">`:''
   return `<a role="option" id="item-${parentId||'root'}-${index}" aria-label="${esc(item.title)}" aria-disabled="${!!item.disabled}" aria-selected="${selected}" ${href} ${item.children?'data-submenu="" aria-haspopup="menu" aria-expanded="'+(state.submenu?.parentId===item.id)+'"':''}>${parentId?'':`<span class="icon">${image}</span>`}<span class="label">${esc(item.title)}</span>${item.children?'<span class="chevron">›</span>':item.checked?'<span>✓</span>':''}</a>`
  }).join('')
  width=Math.min(width,limits.width??Infinity)
  return {html:`<section class="menu ${parentId?'child-menu':'root-menu'}" style="width:${width}px;height:${height}px"><div role="listbox" aria-label="组件操作">${html}</div></section>`,height:height+inset*2,width:width+inset*2}
 }
 const root=pane(state.items as ComponentMenuItem[],206),child=parent?.children?pane(parent.children as ComponentMenuItem[],/组件设置|settings/iu.test(parent.title)?248:116,parent.id):undefined
 return {...root,root,...(child?{child}:{})}
}
export const componentMenuDocumentHtml=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; base-uri 'none'; form-action 'none'"><title>组件操作菜单</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}body{font:400 12px/16px Inter,"Noto Sans SC",system-ui;color:#292b2f;--bg:rgba(255,255,255,.78);--hover:rgba(0,0,0,.055);--line:rgba(0,0,0,.10);user-select:none}body.dark{color:#eee;--bg:rgba(43,43,43,.68);--hover:rgba(255,255,255,.075);--line:rgba(255,255,255,.10)}main{height:100%;padding:0}.menu{padding:7px;border:1px solid var(--line);border-radius:10px;background:var(--bg);height:100%;backdrop-filter:blur(36px) saturate(1.2)}[role=listbox]{height:100%;overflow:auto;scrollbar-width:thin}a{height:33px;display:flex;align-items:center;gap:9px;padding:7px 8px;color:inherit;text-decoration:none;border-radius:3px;cursor:pointer;white-space:nowrap}a:is([data-pointer-hover=true],[aria-selected=true],[aria-expanded=true]):not([aria-disabled=true]){background:var(--hover)}[role=listbox]:has(a[data-pointer-hover=true]) a:not([data-pointer-hover=true]){background:transparent}a[aria-disabled=true]{opacity:.4;cursor:default}.icon{display:flex;width:16px;height:16px;flex:none}.icon img{display:block;width:16px;height:16px;opacity:.8}body.dark .icon img{filter:invert(1)}.label{flex:1;overflow:hidden;text-overflow:ellipsis}.divider{height:1px;background:var(--line);margin:5px}.chevron{color:inherit}
</style><main></main>`
