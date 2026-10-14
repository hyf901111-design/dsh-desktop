import React, { useEffect, useRef, useState } from 'react'
import { SuggestionMenu as SuggestionMenuExtension } from '@blocknote/core/extensions'
import { useBlockNoteEditor, useExtensionState, type SuggestionMenuProps, type DefaultReactSuggestionItem } from '@blocknote/react'
import type { NotesBridge } from '../../shared/workspace-notes'
import type { NoteMenuEvent, NoteMenuItem } from '../../shared/notes-menu'

export type NoteSlashItem = DefaultReactSuggestionItem & {key?:string;children?:NoteSlashItem[]}

/** Callbacks stay in the editor; only the menu's presentation crosses IPC. */
export function NativeSlashMenu(props: SuggestionMenuProps<NoteSlashItem> & {bridge:NotesBridge;sessionId:string;dark:boolean}) {
  const editor = useBlockNoteEditor(), state = useExtensionState(SuggestionMenuExtension)
  const menuId = useRef(crypto.randomUUID()), revision = useRef(0), current = useRef(props), latestRevision = useRef(0), wasShowing = useRef(false)
  const [submenu,setSubmenu]=useState<{parentId:string;selectedIndex:number;keyboardActive:boolean}>(), sub=useRef(submenu), menuState=useRef(state)
  sub.current=submenu;menuState.current=state
  current.current = props
  const itemId = (item: NoteSlashItem, index:number) => `${(item as any).key || 'item'}-${index}`
  useEffect(() => {
    const cancel = () => editor.getExtension(SuggestionMenuExtension)?.closeMenu()
    const receive = (event:Event) => {
      const value = (event as CustomEvent<NoteMenuEvent>).detail
      if (value?.sessionId !== props.sessionId || value.menuId !== menuId.current) return
      if (value.action === 'cancel') { cancel(); return }
      if (value.revision !== latestRevision.current) return
      if(value.action==='back'){setSubmenu(undefined);return}
      if(value.parentId){
        const parent=current.current.items.find((item,index)=>itemId(item,index)===value.parentId)
        const child=parent?.children?.find((item,index)=>itemId(item,index)===value.itemId)
        if(child&&sub.current?.parentId===value.parentId){const ext=editor.getExtension(SuggestionMenuExtension);ext?.closeMenu();ext?.clearQuery();child.onItemClick()}
        return
      }
      const item = current.current.items.find((item,index) => itemId(item,index) === value.itemId)
      if(item?.children?.length){setSubmenu({parentId:value.itemId!,selectedIndex:0,keyboardActive:false});return}
      if (item) current.current.onItemClick?.(item)
    }
    const surface = (event:Event) => { if ((event as CustomEvent).detail?.surface !== 'notes') cancel() }
    const key=(event:KeyboardEvent)=>{
      if(!menuState.current?.show||event.isComposing)return
      const open=sub.current,parent=open?current.current.items.find((item,index)=>itemId(item,index)===open.parentId):current.current.items[current.current.selectedIndex??0]
      if(open&&parent?.children?.length&&['ArrowDown','ArrowUp','Home','End','ArrowLeft','Enter'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation()
        if(event.key==='ArrowLeft'){setSubmenu(undefined);return}
        if(event.key==='Enter'){const ext=editor.getExtension(SuggestionMenuExtension);ext?.closeMenu();ext?.clearQuery();parent.children[open.selectedIndex]!.onItemClick();return}
        const count=parent.children.length,index=event.key==='Home'?0:event.key==='End'?count-1:!open.keyboardActive?(event.key==='ArrowDown'?0:count-1):(open.selectedIndex+(event.key==='ArrowDown'?1:-1)+count)%count
        setSubmenu({...open,selectedIndex:index,keyboardActive:true});return
      }
      if(!open&&parent?.children?.length&&['Enter','ArrowRight'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();setSubmenu({parentId:itemId(parent,current.current.items.indexOf(parent)),selectedIndex:0,keyboardActive:true})
      }
    }
    document.addEventListener('keydown',key,true)
    document.addEventListener('sherlock:notes-menu-event',receive)
    document.addEventListener('sherlock:workspace-surface-change',surface)
    return () => {
      document.removeEventListener('keydown',key,true);document.removeEventListener('sherlock:notes-menu-event',receive);document.removeEventListener('sherlock:workspace-surface-change',surface)
      void props.bridge.request('menu-close',{sessionId:props.sessionId,menuId:menuId.current}).catch(()=>{})
    }
  },[editor,props.bridge,props.sessionId])
  useEffect(()=>setSubmenu(undefined),[state?.query,state?.show])
  useEffect(() => {
    if (!state?.show) {
      if(wasShowing.current){void props.bridge.request('menu-close',{sessionId:props.sessionId,menuId:menuId.current}).catch(()=>{});menuId.current=crypto.randomUUID();wasShowing.current=false}
      return
    }
    if (!state.referencePos || (!props.items.length && props.loadingState !== 'loaded')) return
    wasShowing.current=true
    const next = ++revision.current;latestRevision.current = next
    const {x,y,width,height} = state.referencePos
    const serialize=(item:NoteSlashItem,index:number):NoteMenuItem=>({id:itemId(item,index),title:item.title,subtext:item.subtext||'',group:item.group||'',badge:item.badge||'',icon:(item as any).iconKey||item.key||'paragraph',...(item.children?{children:item.children.map(serialize)}:{})})
    const items=props.items.map(serialize)
    const validSubmenu=submenu&&items.find(item=>item.id===submenu.parentId)?.children?.[submenu.selectedIndex]?submenu:undefined
    void props.bridge.request('menu-sync',{sessionId:props.sessionId,menuId:menuId.current,revision:next,dark:props.dark,selectedIndex:props.selectedIndex,anchor:{x,y,width,height},items,submenu:validSubmenu}).catch(() => {
      if(latestRevision.current === next) editor.getExtension(SuggestionMenuExtension)?.closeMenu()
    })
  },[submenu,props.items,props.selectedIndex,props.dark,props.loadingState,state?.referencePos,state?.show,props.bridge,props.sessionId,editor])
  // Retain the editor's accessible list and active descendant while the visible
  // panel is rendered in a non-key native window. Arrow/Enter/IME stay here.
  return <div id="bn-suggestion-menu" className="en-native-menu-accessible" role="listbox" aria-label="笔记斜杠菜单">{props.items.map((item,index)=><div key={itemId(item,index)} id={`bn-suggestion-menu-item-${index}`} role="option" aria-selected={props.selectedIndex===index} aria-haspopup={item.children?'menu':undefined}>{item.title}</div>)}{submenu?<div role="listbox" aria-label="组件库">{props.items.find((item,index)=>itemId(item,index)===submenu.parentId)?.children?.map((item,index)=><div key={itemId(item,index)} role="option" aria-selected={submenu.keyboardActive&&submenu.selectedIndex===index}>{item.title}</div>)}</div>:null}</div>
}
