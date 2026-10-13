import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NotesApp } from './editor'
import type { NotesBridge } from '../../shared/workspace-notes'
import { WorkspaceSurfaceHost } from '../workspace-surface-host'
import blockStyles from '@blocknote/mantine/style.css?inline'
import noteStyles from './style.css?inline'

export function mountNotes(document: Document, bridge: NotesBridge, host: WorkspaceSurfaceHost) {
  const style = document.createElement('style'); style.id = 'ework-notes-style'; style.textContent = blockStyles + '\n' + noteStyles; document.head.append(style)
  const surface = document.createElement('section'); surface.className = 'en-root'; surface.setAttribute('aria-label', '工作区笔记'); host.register('notes', surface)
  const editorHost = document.createElement('div'); editorHost.className = 'en-editor-host'
  const composerHost = document.createElement('div'); composerHost.className = 'en-native-composer-host sRp_composer'
  surface.append(editorHost,composerHost)
  const resize = new ResizeObserver(() => surface.style.setProperty('--en-native-composer-height', composerHost.offsetHeight + 'px')); resize.observe(composerHost)
  let reactRoot: Root | undefined, sessionId = '', frame = 0, lastAnchor: Element | null = null
  const nativeTab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-srb-tabs] [data-conversation-view-id="${id}"]`)
  const navigate = (id: string) => { host.close('notes'); if (id === 'new') document.querySelector<HTMLButtonElement>('.hHd-Xa_newSession')?.click(); else nativeTab(id)?.click() }
  const render = () => { if (!sessionId) return; reactRoot ??= createRoot(editorHost); reactRoot.render(<NotesApp key={sessionId} sessionId={sessionId} bridge={bridge} dark={surface.dataset.dark === 'true'} navigate={navigate} />) }
  const open = (event?: Event) => {
    const id = document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession || ''
    if (!id || ((event as CustomEvent | undefined)?.detail?.sessionId && (event as CustomEvent).detail.sessionId !== id)) return
    sessionId = id; composerHost.dataset.eworkNotesComposerHost = id; host.open('notes'); render()
    document.defaultView?.dispatchEvent(new CustomEvent('sherlock:notes-composer-host',{detail:{sessionId:id}}))
  }
  const onNativeTabClick = (event: Event) => { if ((event.target as Element)?.closest?.('[data-srb-tabs] [data-conversation-view-id=notes]')) open() }
  const close = (event: Event) => { if ((event as CustomEvent).detail?.sessionId === sessionId) host.close('notes') }
  const sync = () => {
    const id = document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession
    const anchor = id ? document.querySelector('[data-ework-note-view="' + CSS.escape(id) + '"]') : null
    if (anchor && (anchor !== lastAnchor || !host.current()) && !document.querySelector('.VOzbGW_overlay')) { lastAnchor = anchor; open() }
    else if (!anchor) lastAnchor = null
  }
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync() }) }); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ework-notes-session'] })
  const theme = new MutationObserver(render); theme.observe(surface, { attributes: true, attributeFilter: ['data-dark'] })
  const identity = () => { reactRoot?.unmount(); reactRoot = undefined; sessionId = ''; delete composerHost.dataset.eworkNotesComposerHost; host.close('notes'); document.dispatchEvent(new CustomEvent('sherlock:notes-reset')) }
  document.addEventListener('sherlock:notes-open', open); document.addEventListener('sherlock:notes-close', close); document.addEventListener('click', onNativeTabClick, true); sync()
  return { resetIdentity: identity, dispose: () => { identity(); observer.disconnect(); theme.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); style.remove(); surface.remove(); document.removeEventListener('sherlock:notes-open', open); document.removeEventListener('sherlock:notes-close', close); document.removeEventListener('click', onNativeTabClick, true) } }
}
