import type {MenuItemConstructorOptions} from 'electron'
/** Presentation only. Never accept Electron roles or executable renderer commands. */
export function buildNativeComponentMenu(value:unknown,choose:(id:string)=>void,icon?:(value:string)=>MenuItemConstructorOptions['icon']):MenuItemConstructorOptions[]{
 const seen=new Set<string>();let count=0
 const rows=(value:unknown,depth=0):MenuItemConstructorOptions[]=>{
  if(!Array.isArray(value)||value.length>40||depth>1)return []
  return value.flatMap<MenuItemConstructorOptions>((raw:unknown)=>{
   if(!raw||typeof raw!=='object'||++count>80)return []
   const item=raw as Record<string,unknown>
   if(item.separator===true)return [{type:'separator' as const}]
   if(typeof item.id!=='string'||!/^[-\w:]{1,80}$/u.test(item.id)||seen.has(item.id)||typeof item.label!=='string'||!item.label.trim()||item.label.length>120)return []
   seen.add(item.id);const id=item.id,enabled=item.disabled!==true,submenu=item.children===undefined?undefined:rows(item.children,depth+1)
   if(submenu&&!submenu.length)return []
   const image=typeof item.icon==='string'&&item.icon.length<=32768&&/^data:image\/png;base64,[A-Za-z\d+/=]+$/u.test(item.icon)?icon?.(item.icon):undefined
   return [{id,label:item.label,enabled,...(image?{icon:image}:{}),...(typeof item.checked==='boolean'?{type:'checkbox' as const,checked:item.checked}:{}),...(submenu?{submenu}:{click:()=>{if(enabled)choose(id)}})}]
  })
 }
 return rows(value)
}
