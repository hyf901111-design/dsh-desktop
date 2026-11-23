import * as React from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { sidebarVisitsKey, parseSidebarVisits } from '../shared/sidebar-session-storage.mjs'
import { projectSkillText } from '../shared/skill-display.mjs'
import type { ResearchBoardsState } from '../shared/research-boards'
import { sidebarUsageTimes, subscribeSidebarUsage } from '../../scripts/lib/sidebar-session-recency.mjs'
import type { ResearchBoardsPage } from './research-boards-ui'
import type { SidebarSearchResult } from './sidebar-session-search'

type Status = { state: React.ComponentProps<typeof StateDot>['state']; label: string }
export type RecentSession = SidebarSearchResult & { status?: Status; location?: string }
const visitPrefix = 'ework.sidebar.visit.v1:'

// Visits belong to the recent view. The directory has its own manual ordering and edit clock.
// Desktop storage survives the local server changing port. Per-session browser keys
// remain useful for migration, same-origin notifications and browser-only previews.
export function trackSidebarVisits(doc: Document, current: () => string | undefined, refresh: () => void) {
  const win = doc.defaultView!
  const cache = new Map<string, number>()
  const desktop = (win as any).dshDesktop?.researchCanvasStorage
  let loaded = false, last = 0, previous = current()
  function writeUpdates(rows: [string, number][]) {
    if (!rows.length) return
    try { desktop?.setItem(sidebarVisitsKey, JSON.stringify(rows)) } catch {}
  }
  function collectEdits(updates: [string, number][]) {
    for (const [id, at] of Object.entries(sidebarUsageTimes())) {
      if (Number.isSafeInteger(at) && at > (cache.get(id) ?? 0)) {
        cache.set(id, at)
        last = Math.max(last, at)
        updates.push([id, at])
      }
    }
  }
  function load() {
    if (loaded) return
    loaded = true
    try {
      for (const [id, at] of parseSidebarVisits(desktop?.getItem(sidebarVisitsKey)) ?? []) cache.set(id, at)
    } catch {}
    const migration: [string, number][] = []
    try {
      const local = win.localStorage
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (!key?.startsWith(visitPrefix)) continue
        const id = key.slice(visitPrefix.length), at = Number(local.getItem(key))
        if (id && id.length <= 1024 && Number.isSafeInteger(at) && at > (cache.get(id) ?? 0)) {
          cache.set(id, at)
          migration.push([id, at])
        }
      }
    } catch {}
    collectEdits(migration)
    writeUpdates(migration)
    for (const at of cache.values()) last = Math.max(last, at)
  }
  function time(id: string) {
    load()
    return cache.get(id) ?? 0
  }
  function record(id: string) {
    load()
    last = Math.max(Date.now(), last + 1)
    cache.set(id, last)
    writeUpdates([[id, last]])
    try { win.localStorage.setItem(visitPrefix + id, String(last)) } catch {}
  }
  function edited() {
    load()
    const updates: [string, number][] = []
    collectEdits(updates)
    writeUpdates(updates)
  }
  function selected() {
    const id = current()
    if (id && id !== previous) record(id)
    previous = id
  }
  function reopened(event: Event) {
    const id = current(), requested = (event as CustomEvent).detail?.sessionId
    if (id && (!requested || requested === id)) { record(id); refresh() }
  }
  function storage(event: StorageEvent) {
    if (event.key === null) { cache.clear(); loaded = false }
    else if (event.key.startsWith(visitPrefix)) {
      const id = event.key.slice(visitPrefix.length), at = Number(event.newValue)
      if (!Number.isSafeInteger(at) || at <= 0) return
      cache.set(id, Math.max(cache.get(id) ?? 0, at))
      last = Math.max(last, at)
    } else return
    refresh()
  }
  const picks = ['sherlock:history-session-selected', 'sherlock:search-session-opened']
  for (const name of picks) doc.addEventListener(name, reopened)
  doc.addEventListener('sherlock-sidebar-recency', edited)
  win.addEventListener('storage', storage)
  return { time, selected, dispose() {
    for (const name of picks) doc.removeEventListener(name, reopened)
    doc.removeEventListener('sherlock-sidebar-recency', edited)
    win.removeEventListener('storage', storage)
  } }
}

export function recentSidebarRows(state: ResearchBoardsState, workspaceRows: RecentSession[], excluded: (id: string) => boolean,
  sessionEditedAt: (id: string) => number | undefined, visited: (id: string) => number, english: boolean): RecentSession[] {
  const rows = new Map<string, RecentSession>(), activity = sidebarUsageTimes()
  function add(row: RecentSession) {
    const id = row.sessionId
    if (id && excluded(id)) return
    const key = id || row.key, existing = rows.get(key)
    const time = Math.max(row.time || 0, existing?.time ?? 0,
      id ? sessionEditedAt(id) ?? 0 : 0, id ? activity[id] ?? 0 : 0, id ? visited(id) : 0)
    rows.set(key, { ...row, title: projectSkillText(row.title), time })
  }
  for (const row of workspaceRows) add(row)
  for (const f of state.favorites) {
    if (f.pinned !== false) add({ key: 'favorite:' + f.favoriteId, area: 'boards', sessionId: f.sessionId,
      title: f.title, location: english ? 'Personal boards' : '个人看板', time: f.updatedAt ?? f.createdAt })
  }
  for (const b of state.boards) {
    if (b.pinned) add({ key: 'board:' + b.boardId, area: 'boards', boardId: b.boardId,
      sessionId: b.localSessionId, title: b.title,
      location: b.sharingState === 'shared' ? (english ? 'Shared boards' : '协作看板') : (english ? 'Personal boards' : '个人看板'), time: b.updatedAt ?? b.createdAt })
  }
  return [...rows.values()].sort((a, b) => b.time - a.time || a.key.localeCompare(b.key))
}

function RunningBoard({ page, id, english }: { page: ResearchBoardsPage; id: string; english: boolean }) {
  const subscribe = React.useCallback((fn: () => void) => page.subscribeActivity(id, fn), [page, id])
  const running = React.useSyncExternalStore(subscribe, () => page.isRunning(id))
  return running ? <span role="img" aria-label={english ? 'Running' : '任务运行中'}><StateDot state="ongoing" /></span> : null
}

export function SidebarRecentSessions({ page, english }: { page: ResearchBoardsPage; english: boolean }) {
  const [, refresh] = React.useReducer(n => n + 1, 0)
  React.useLayoutEffect(() => {
    const off = page.subscribeSearch(refresh), offActivity = subscribeSidebarUsage(refresh)
    const offLabels = (window as any).__eworkSkillPresentationV1?.subscribe(refresh)
    window.addEventListener('sherlock-sidebar-skin', refresh)
    window.addEventListener('sherlock:research-session-engaged', refresh)
    refresh()
    return () => {
      off(); offActivity(); offLabels?.()
      window.removeEventListener('sherlock-sidebar-skin', refresh)
      window.removeEventListener('sherlock:research-session-engaged', refresh)
    }
  }, [page])
  const rows = page.recentSessions(english), current = page.current()
  const names = new Set<string>(), duplicates = new Set<string>()
  for (const row of rows) {
    if (names.has(row.title)) duplicates.add(row.title)
    names.add(row.title)
  }
  async function open(row: RecentSession) {
    try {
      let id = row.sessionId
      if (row.boardId) id = await page.openBoard(row.boardId)
      else if (id && row.area === 'boards') await page.openPersonal(id)
      else if (id) page.openSearchSession(id)
      if (id && page.current() === id) document.dispatchEvent(new CustomEvent('sherlock:search-session-opened', {
        detail: { sessionId: row.area === 'workspaces' ? id : undefined }
      }))
    } catch (error) { page.showError(error) }
  }
  return <nav data-sidebar-recent-list="" aria-label={english ? 'Recent conversations' : '最近使用的会话'}>
    {rows.map(row => <button type="button" key={row.key} data-recent-key={row.key}
      aria-current={row.sessionId && row.sessionId === current ? 'true' : undefined} title={row.location ? row.title + ' · ' + row.location : row.title} onClick={() => void open(row)}>
      {row.area === 'boards' && row.sessionId ? <RunningBoard page={page} id={row.sessionId} english={english} />
        : row.status && <span role="img" aria-label={row.status.label}><StateDot state={row.status.state} /></span>}
      <span data-ui-preserve="">{row.title}</span>
      {duplicates.has(row.title) && <small data-ui-preserve="">{row.location}</small>}
    </button>)}
    {!rows.length && <p>{english ? 'No conversations yet' : '暂无会话'}</p>}
  </nav>
}
