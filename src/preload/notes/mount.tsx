import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {flushSync} from 'react-dom'
import { NotesApp,type NotesSaveBinding } from './editor'
import type { NotesBridge } from '../../shared/workspace-notes'
import { WorkspaceSurfaceHost } from '../workspace-surface-host'
import blockStyles from '@blocknote/mantine/style.css?inline'
import noteStyles from './style.css?inline'
import challengeStyles from './challenge.css?inline'

export function mountNotes(document: Document, bridge: NotesBridge, host: WorkspaceSurfaceHost) {
  const style = document.createElement('style'); style.id = 'ework-notes-style'; style.textContent = blockStyles + '\n' + noteStyles + '\n' + challengeStyles; document.head.append(style)
  const surface = document.createElement('section'); surface.className = 'en-root'; surface.setAttribute('aria-label', t("工作区笔记")); host.register('notes', surface)
  const editorHost = document.createElement('div'); editorHost.className = 'en-editor-host'
  surface.append(editorHost)
  let reactRoot: Root | undefined, sessionId = '', frame = 0, lastAnchor: Element | null = null
  type Entry={instanceId:string;retaining:boolean;capabilityRetaining:boolean;saveBinding:NotesSaveBinding;flush?:()=>Promise<void>}
  const entries=new Map<string,Entry>(),handoffPreloads=new Set<string>();let resetting=false
  const nativeTab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-srb-tabs] [data-conversation-view-id="${id}"]`)
  const navigate = (id: string) => { host.close('notes'); if (id === 'new') document.querySelector<HTMLButtonElement>('.hHd-Xa_newSession')?.click(); else nativeTab(id)?.click() }
  const renderEntries=()=>{
    if(resetting||!reactRoot&&!entries.size)return
    reactRoot??=createRoot(editorHost)
    reactRoot.render(<>{[...entries].map(([id,entry])=><div key={entry.instanceId} data-note-editor-session={id} data-note-editor-active={id===sessionId&&!handoffPreloads.has(id)?'true':'false'} style={{height:'100%',minHeight:0,display:id===sessionId?'contents':'none'}} hidden={id!==sessionId} ref={node=>{if(node)(node as HTMLElement&{inert:boolean}).inert=id!==sessionId||handoffPreloads.has(id)}}><NotesApp sessionId={id} active={id===sessionId&&!handoffPreloads.has(id)} activityId={entry.instanceId} bridge={bridge} dark={surface.dataset.dark==='true'} navigate={navigate} saveBinding={entry.saveBinding}/></div>)}</>)
  }
  const render = () => {
    if(!sessionId||resetting)return
    if(!entries.has(sessionId)){
      const entry={instanceId:crypto.randomUUID(),retaining:false,capabilityRetaining:false,saveBinding:{}} as Entry
      entry.saveBinding={ready:flush=>{entry.flush=flush},dispose:flush=>{if(entry.flush===flush)entry.flush=undefined}}
      entries.set(sessionId,entry)
    }
    for(const [id,entry]of entries)if(id!==sessionId&&!entry.retaining&&!entry.capabilityRetaining)entries.delete(id)
    renderEntries()
  }
  const prepareGuide=async(id:string)=>{
    const entry=entries.get(id);if(!entry)return
    if(entry.retaining||entry.capabilityRetaining)throw Error('此笔记仍有任务正在完成，请稍后重新打开示例。')
    if(!entry.flush)throw Error('笔记尚在读取，请稍后重新打开示例。')
    // A failed/conflicting save leaves the original instance alive. Only a
    // confirmed snapshot may hand the session to the tutorial's editor.
    await entry.flush()
    if(entries.get(id)!==entry)return
    if(entry.retaining||entry.capabilityRetaining)throw Error('此笔记仍有任务正在完成，请稍后重新打开示例。')
    entries.delete(id)
    handoffPreloads.delete(id)
    if(sessionId===id){sessionId='';lastAnchor=null;host.close('notes')}
    flushSync(renderEntries)
  }
  const finishGuide=async(id:string,signal:AbortSignal)=>{
    const current=()=>!signal.aborted&&!resetting&&document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession===id&&!!document.querySelector('[data-ework-note-view="'+CSS.escape(id)+'"]')
    const cancelled=()=>new DOMException('笔记演示已结束。','AbortError')
    if(!current())throw cancelled()
    // Read the confirmed snapshot behind the guide before removing its editor.
    // Opening the surface is deferred to the same frame as the actual handoff.
    handoffPreloads.add(id);sessionId=id;render()
    const entry=entries.get(id),deadline=performance.now()+8000
    while(true){
      if(!current()||entries.get(id)!==entry)throw cancelled()
      const body=surface.querySelector<HTMLElement>('[data-note-source-session="'+CSS.escape(id)+'"]')
      const scroll=body?.querySelector<HTMLElement>('.en-document-scroll')
      if(entry?.flush&&scroll&&body?.querySelector('.bn-editor')){
        scroll.scrollTop=0
        return ()=>{if(current()&&entries.get(id)===entry){handoffPreloads.delete(id);flushSync(renderEntries);host.open('notes')}}
      }
      if(performance.now()>deadline)throw Error('笔记尚未加载完成，已保留演示内容。')
      await new Promise<void>((resolve,reject)=>{
        const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(cancelled())}
        const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},16)
        signal.addEventListener('abort',stop,{once:true})
      })
    }
  }
  const activity=(event:Event)=>{
    const value=(event as CustomEvent).detail,entry=entries.get(value?.sessionId)
    if(resetting||!entry||entry.instanceId!==value.instanceId||typeof value.retaining!=='boolean'||entry.retaining===value.retaining)return
    entry.retaining=value.retaining;render()
  }
  const capabilityActivity=(event:Event)=>{
    const value=(event as CustomEvent).detail,entry=entries.get(value?.sessionId)
    if(resetting||!entry||entry.instanceId!==value.instanceId||typeof value.retaining!=='boolean'||entry.capabilityRetaining===value.retaining)return
    entry.capabilityRetaining=value.retaining;render()
  }
  const open = (event?: Event) => {
    if (document.querySelector('[data-home-guide]') || document.documentElement.hasAttribute('data-home-guide-transition')) return
    const id = document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession || ''
    if (!id || ((event as CustomEvent | undefined)?.detail?.sessionId && (event as CustomEvent).detail.sessionId !== id)) return
    sessionId = id;handoffPreloads.delete(id);host.open('notes');render()
  }
  const onNativeTabClick = (event: Event) => { if ((event.target as Element)?.closest?.('[data-srb-tabs] [data-conversation-view-id=notes]')) open() }
  const close = (event: Event) => { if ((event as CustomEvent).detail?.sessionId === sessionId) host.close('notes') }
  let locale = document.documentElement.dataset.odysseyLocale
  const sync = () => {
    if (document.querySelector('[data-home-guide]') || document.documentElement.hasAttribute('data-home-guide-transition')) return
    if (locale !== document.documentElement.dataset.odysseyLocale) { locale = document.documentElement.dataset.odysseyLocale; surface.setAttribute('aria-label',t('工作区笔记'));render() }
    const id = document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession
    const anchor = id ? document.querySelector('[data-ework-note-view="' + CSS.escape(id) + '"]') : null
    if (anchor && (anchor !== lastAnchor || !host.current()) && !document.querySelector('.VOzbGW_overlay')) { lastAnchor = anchor; open() }
    else if (!anchor) lastAnchor = null
  }
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync() }) }); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ework-notes-session', 'data-odyssey-locale', 'data-home-guide-transition'] })
  const theme = new MutationObserver(render); theme.observe(surface, { attributes: true, attributeFilter: ['data-dark'] })
  const identity = () => { resetting=true;entries.clear();handoffPreloads.clear();reactRoot?.unmount();reactRoot=undefined;sessionId='';host.close('notes');resetting=false;document.dispatchEvent(new CustomEvent('sherlock:notes-reset')) }
  document.addEventListener('sherlock:notes-capability-activity',capabilityActivity);document.addEventListener('sherlock:notes-challenge-activity',activity);document.addEventListener('sherlock:notes-open', open); document.addEventListener('sherlock:notes-close', close); document.addEventListener('click', onNativeTabClick, true); sync()
  return { prepareGuide,finishGuide,resetIdentity: identity, dispose: () => { identity(); observer.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); style.remove(); surface.remove(); document.removeEventListener('sherlock:notes-capability-activity',capabilityActivity);document.removeEventListener('sherlock:notes-challenge-activity',activity);document.removeEventListener('sherlock:notes-open', open); document.removeEventListener('sherlock:notes-close', close); document.removeEventListener('click', onNativeTabClick, true) } }
}
