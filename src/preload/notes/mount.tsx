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
  let reactRoot: Root | undefined, sessionId = '', frame = 0, lastAnchor: Element | null = null
  const nativeTab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-srb-tabs] [data-conversation-view-id="${id}"]`)
  const navigate = (id: string) => { host.close('notes'); if (id === 'new') document.querySelector<HTMLButtonElement>('.hHd-Xa_newSession')?.click(); else nativeTab(id)?.click() }
  const nativeControl = (kind: string) => {
    const original = [...document.querySelectorAll<HTMLButtonElement>('.pI_x6G_centerCol button')].find(b => !b.closest('.en-root') && (kind === 'permission' ? /完全访问|权限|Full Access|Default|默认/.test(b.textContent || '') : false))
    if (!original) return
    const bg = document.querySelector<HTMLElement>('.pI_x6G_centerCol'), inert = bg?.inert
    if (bg) bg.inert = false
    original.click()
    if (bg) bg.inert = inert ?? true
  }
  const render = () => { if (!sessionId) return; reactRoot ??= createRoot(surface); reactRoot.render(<NotesApp key={sessionId} sessionId={sessionId} bridge={bridge} dark={surface.dataset.dark === 'true'} navigate={navigate} nativeControl={nativeControl} />) }
  const open = (event?: Event) => {
    const id = document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession || ''
    if (!id || ((event as CustomEvent | undefined)?.detail?.sessionId && (event as CustomEvent).detail.sessionId !== id)) return
    sessionId = id; host.open('notes'); render()
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
  const identity = () => { reactRoot?.unmount(); reactRoot = undefined; sessionId = ''; host.close('notes') }
  document.addEventListener('sherlock:notes-open', open); document.addEventListener('sherlock:notes-close', close); document.addEventListener('click', onNativeTabClick, true); sync()
  return { resetIdentity: identity, dispose: () => { identity(); observer.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); style.remove(); surface.remove(); document.removeEventListener('sherlock:notes-open', open); document.removeEventListener('sherlock:notes-close', close); document.removeEventListener('click', onNativeTabClick, true) } }
}
