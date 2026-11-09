import type {BrowserWindow} from 'electron'
import type {NoteMenuState,NoteMenuEvent,NoteMenuItem} from '../shared/notes-menu'
import {NoteNativeMenu} from './notes/native-menu'
import {componentMenuPresentation,componentMenuDocumentHtml,type ComponentMenuItem} from '../shared/component-menu-presentation'
import {buildNativeComponentMenu} from './native-component-menu'

/** Reuse the anchored, non-key popup transport; callbacks remain in the owner renderer. */
export class ComponentPopupMenu{
 private current?:{state:NoteMenuState;resolve:(id:string|null)=>void}
 private popup:NoteNativeMenu
 constructor(private parent:BrowserWindow){
  this.popup=new NoteNativeMenu({getWindow:()=>parent,owner:()=>String(parent.webContents.id),canRead:()=>!!this.current&&!parent.isDestroyed(),title:'组件操作菜单',displayBounds:true,documentHtml:componentMenuDocumentHtml,presentation:componentMenuPresentation,selectable:item=>!this.disabled(item),emit:event=>this.receive(event)})
 }
 private disabled(item:NoteMenuItem){return (item as ComponentMenuItem).disabled===true||(item as ComponentMenuItem).separator===true}
 show(value:unknown):Promise<string|null>{
  this.close()
  return new Promise((resolve,reject)=>{
   try{
    if(!value||typeof value!=='object')throw Error('菜单参数无效')
    const input=value as Record<string,unknown>,template=buildNativeComponentMenu(input.items,()=>{},image=>image)
    if(!template.length)throw Error('没有可用菜单项')
    let separator=0
    const convert=(rows:typeof template):ComponentMenuItem[]=>rows.map(row=>({id:row.id??'separator-'+separator++,title:row.label??'',subtext:'',group:'',badge:'',icon:'',disabled:row.enabled===false,separator:row.type==='separator',...(typeof row.icon==='string'?{image:row.icon}:{}),...(typeof row.checked==='boolean'?{checked:row.checked}:{}),...(Array.isArray(row.submenu)?{children:convert(row.submenu)}:{})}))
    const state:NoteMenuState={sessionId:'component-menu',menuId:input.menuId as string,revision:0,dark:input.dark===true,anchor:input.anchor as NoteMenuState['anchor'],items:convert(template),selectedIndex:undefined}
    this.current={state,resolve};this.popup.sync(state,String(this.parent.webContents.id))
   }catch(error){this.current=undefined;this.popup.close();reject(error)}
  })
 }
 close(menuId?:unknown){
  const current=this.current;if(!current||menuId!==undefined&&menuId!==current.state.menuId)return
  this.current=undefined;this.popup.close(current.state.menuId);current.resolve(null)
 }
 private update(change:Partial<NoteMenuState>){
  const current=this.current;if(!current)return
  current.state={...current.state,...change,revision:current.state.revision+1};this.popup.sync(current.state,String(this.parent.webContents.id))
 }
 private receive(event:NoteMenuEvent){
  const current=this.current;if(!current||event.menuId!==current.state.menuId||event.revision!==current.state.revision)return
  if(event.action==='cancel'){this.close();return}
  if(event.action==='open'){
   const index=current.state.items.findIndex(item=>item.id===event.itemId),parent=current.state.items[index]
   if(parent?.children?.length&&!this.disabled(parent))this.update({selectedIndex:index,submenu:{parentId:parent.id,selectedIndex:0,keyboardActive:false}})
  }else if(event.action==='back')this.update({submenu:undefined})
  else if(event.action==='select'){
   const items=event.parentId?current.state.items.find(item=>item.id===event.parentId)?.children:current.state.items,item=items?.find(item=>item.id===event.itemId)
   if(!item||item.children||this.disabled(item))return
   this.current=undefined;this.popup.close(current.state.menuId);current.resolve(item.id)
  }
 }
 key(menuId:unknown,key:unknown){
  const current=this.current;if(!current||current.state.menuId!==menuId||typeof key!=='string')return
  if(key==='Escape'){this.close();return}
  const state=current.state,parent=state.submenu?state.items.find(item=>item.id===state.submenu!.parentId):undefined,items=parent?.children??state.items,selected=state.submenu?.selectedIndex??state.selectedIndex
  if(key==='ArrowLeft'&&parent){this.update({submenu:undefined});return}
  const item=selected===undefined?undefined:items[selected]
  if(key==='Enter'||key==='ArrowRight'){
   if(item&&!this.disabled(item))this.receive({sessionId:state.sessionId,owner:'',menuId:state.menuId,revision:state.revision,action:item.children?'open':'select',itemId:item.id,...(parent?{parentId:parent.id}:{})})
   return
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(key))return
  const enabled=items.flatMap((item,index)=>this.disabled(item)?[]:[index]);if(!enabled.length)return
  const at=enabled.indexOf(selected??-1),start=at<0?(key==='ArrowUp'?0:-1):at
  const next=key==='Home'?enabled[0]!:key==='End'?enabled.at(-1)!:enabled[(start+(key==='ArrowUp'?-1:1)+enabled.length)%enabled.length]!
  this.update(parent?{submenu:{parentId:parent.id,selectedIndex:next,keyboardActive:true}}:{selectedIndex:next})
 }
}
