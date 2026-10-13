import React, { useEffect, useRef } from 'react'
import { SuggestionMenu as SuggestionMenuExtension } from '@blocknote/core/extensions'
import { useBlockNoteEditor, useExtensionState, type SuggestionMenuProps, type DefaultReactSuggestionItem } from '@blocknote/react'
import type { NotesBridge } from '../../shared/workspace-notes'
import type { NoteMenuEvent, NoteMenuItem } from '../../shared/notes-menu'

/** Callbacks stay in the editor; only the menu's presentation crosses IPC. */
export function NativeSlashMenu(props: SuggestionMenuProps<DefaultReactSuggestionItem> & {bridge:NotesBridge;sessionId:string;dark:boolean}) {
  const editor = useBlockNoteEditor(), state = useExtensionState(SuggestionMenuExtension)
  const menuId = useRef(crypto.randomUUID()), revision = useRef(0), current = useRef(props), latestRevision = useRef(0), wasShowing = useRef(false)
  current.current = props
  const itemId = (item: DefaultReactSuggestionItem, index:number) => `${(item as any).key || 'item'}-${index}`
  useEffect(() => {
    const cancel = () => editor.getExtension(SuggestionMenuExtension)?.closeMenu()
    const receive = (event:Event) => {
      const value = (event as CustomEvent<NoteMenuEvent>).detail
      if (value?.sessionId !== props.sessionId || value.menuId !== menuId.current) return
      if (value.action === 'cancel') { cancel(); return }
      if (value.revision !== latestRevision.current) return
      const item = current.current.items.find((item,index) => itemId(item,index) === value.itemId)
      if (item) current.current.onItemClick?.(item)
    }
    const surface = (event:Event) => { if ((event as CustomEvent).detail?.surface !== 'notes') cancel() }
    document.addEventListener('sherlock:notes-menu-event',receive)
    document.addEventListener('sherlock:workspace-surface-change',surface)
    return () => {
      document.removeEventListener('sherlock:notes-menu-event',receive);document.removeEventListener('sherlock:workspace-surface-change',surface)
      void props.bridge.request('menu-close',{sessionId:props.sessionId,menuId:menuId.current}).catch(()=>{})
    }
  },[editor,props.bridge,props.sessionId])
  useEffect(() => {
    if (!state?.show) {
      if(wasShowing.current){void props.bridge.request('menu-close',{sessionId:props.sessionId,menuId:menuId.current}).catch(()=>{});menuId.current=crypto.randomUUID();wasShowing.current=false}
      return
    }
    if (!state.referencePos || (!props.items.length && props.loadingState !== 'loaded')) return
    wasShowing.current=true
    const next = ++revision.current;latestRevision.current = next
    const {x,y,width,height} = state.referencePos
    const items:NoteMenuItem[] = props.items.map((item,index) => ({id:itemId(item,index),title:item.title,subtext:item.subtext||'',group:item.group||'',badge:item.badge||'',icon:(item as any).key||'paragraph'}))
    void props.bridge.request('menu-sync',{sessionId:props.sessionId,menuId:menuId.current,revision:next,dark:props.dark,selectedIndex:props.selectedIndex,anchor:{x,y,width,height},items}).catch(() => {
      if(latestRevision.current === next) editor.getExtension(SuggestionMenuExtension)?.closeMenu()
    })
  },[props.items,props.selectedIndex,props.dark,props.loadingState,state?.referencePos,state?.show,props.bridge,props.sessionId,editor])
  // Retain the editor's accessible list and active descendant while the visible
  // panel is rendered in a non-key native window. Arrow/Enter/IME stay here.
  return <div id="bn-suggestion-menu" className="en-native-menu-accessible" role="listbox" aria-label="笔记斜杠菜单">{props.items.map((item,index)=><div key={itemId(item,index)} id={`bn-suggestion-menu-item-${index}`} role="option" aria-selected={props.selectedIndex===index}>{item.title}</div>)}</div>
}
