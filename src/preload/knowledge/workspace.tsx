import { fileEditorLabel, fileEditorMode, type FileEditorMode, type FileEditorSource } from '../../shared/file-editor.mjs'
import { sharedKnowledgeSessionFile, knowledgeSessionLabels as sharedModeLabels } from '../../shared/knowledge-sessions'
import { openSharedKnowledgeSession } from './session-directory'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  canOpenKnowledgeImage, knowledgeCategories, knowledgeFormat, knowledgeFormats, knowledgeSources, knowledgeSharedCategories, knowledgeSharedCatalogError, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument, type KnowledgeEdit, type KnowledgeFilter,
  type KnowledgeImportProgress, type KnowledgeSnapshot
} from '../../shared/knowledge-library'
import type { KnowledgeViewMessage, KnowledgeViewResult } from '../../main/knowledge/view-bridge'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { mountWorkspaceTopbarStyles, workspaceBackButton } from '../workspace-topbar'
import { canNavigateGlobalWorkspace, findWorkspaceSession, navigateGlobalWorkspace, navigateWorkspaceView, sessionWorkspaceViews, observeWorkspaceViews, takeWorkspaceViewsExpansion } from '../workspace-view-shortcuts'
import { icons } from '../scheduled/icons'
import type { MemoryBridge } from '../../shared/memory'
import { knowledgeSessionShareKey, type KnowledgeSessionEntry, type KnowledgeSessionEvidence,
  type KnowledgeSessionMode } from '../../shared/knowledge-sessions'
import { KnowledgeMemory } from './memory'
import { FileSearch } from './file-search'
import { categoryIcons, KnowledgeIcon, KnowledgeItemIcon } from './icons'
import { countFileFacets, emptyFileFacets, FilterMenu } from './filter-menu'
import { KnowledgePreviewContent, type KnowledgePreview } from './preview'
import { knowledgeSessionDirectoryLabels, KnowledgeSessionDirectory, openKnowledgeSession, useKnowledgeSessions } from './session-directory'
import { KnowledgePagination, useKnowledgePagination } from './pagination'
import { listKnowledgeRows, usePublishedKnowledgeSessions, type KnowledgeListRow } from './published-sessions'
import dropUploadIcon from './drop-upload.svg?inline'
import css from './workspace.css?raw'

interface Bridge {
  memory?: MemoryBridge
  openFileInEditor?(source: FileEditorSource, mode: FileEditorMode): Promise<void>
  openImageFactorySource?(sessionId: string): Promise<void>
  openImageFactoryCopy?(id: string): Promise<void>
  openImageProject?(id: string): Promise<void>
  request(method: 'received', args?: { refresh?: boolean }): Promise<KnowledgeDocument[]>
  request(method: 'share' | 'unshare', args: { id: string; category?: string }): Promise<KnowledgeSnapshot>
  request(method: 'share-session' | 'unshare-session', args: { id: string; mode: KnowledgeSessionMode; title: string; category?: string }): Promise<KnowledgeSnapshot>
  request(method: 'download', args: { id: string }): Promise<boolean>
  request(method: 'snapshot', args?: Record<string, unknown>): Promise<KnowledgeSnapshot>
  request(method: 'session-evidence', args: { ids: string[]; mode: KnowledgeSessionMode }): Promise<KnowledgeSessionEvidence[]>
  request(method: 'edit', args: KnowledgeEdit): Promise<KnowledgeSnapshot>
  request(method: 'recent-searches', args?: Record<string, never>): Promise<string[]>
  request(method: 'remember-search', args: { query: string }): Promise<string[]>
  request(method: 'pick', args?: Record<string, never>): Promise<string[]>
  request(method: 'import-file', args: { transferId: string; path: string; folderId?: string }): Promise<KnowledgeDocument>
  request(method: 'cancel-import', args: { transferId: string }): Promise<void>
  subscribeImportProgress?(listener: (event: KnowledgeImportProgress & { id: string }) => void): () => void
  request(method: 'preview', args: { id: string }): Promise<KnowledgePreview>
  request(method: 'open' | 'reveal', args: { id: string }): Promise<void>
  path(file: File): string
  subscribe(listener: () => void): () => void
  subscribeAction?(listener: (action: KnowledgeViewMessage) => void): () => void
  reply?(value: { id: string; result?: KnowledgeViewResult; error?: string }): void
}

type DialogState =
  | { type: 'create-folder' }
  | { type: 'rename-folder' | 'remove-folder'; id: string; name: string }
  | { type: 'rename' | 'move' | 'remove' | 'share'; row: KnowledgeDocument }
  | { type: 'share-session'; row: KnowledgeSessionEntry; mode: KnowledgeSessionMode }

type FileImport = KnowledgeImportProgress & {
  id: string
  path: string
  name: string
  folderId?: string
  status: 'adding' | 'cancelling' | 'failed'
  error?: string
}
const fileName = (path: string) => path.split(/[\\/]/u).at(-1) || path
const empty: KnowledgeSnapshot = { documents: [], folders: [] }
const defaultFilter: KnowledgeFilter = {}
const sessionSections = [ ['research', 'research'], ['notes', 'note'], ['spreadsheet', 'table'] ] as const
type FileMoveGesture = Pick<KnowledgeDocument, 'id' | 'folderId'> & {
  pointer: number; x: number; y: number; active: boolean; source: HTMLButtonElement
}
const formatBytes = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`

function buttonIcon(icon: React.ComponentProps<typeof KnowledgeIcon>['name'], text: string) {
  return <><KnowledgeIcon name={icon} /><span>{text}</span></>
}

export const knowledgeOpenEvent = 'sherlock:knowledge-open'

export function mountKnowledgeWorkspace(document: Document, host: WorkspaceSurfaceHost, bridge: Bridge) {
  const root = document.createElement('section')
  root.className = 'knowledge-workspace'
  root.setAttribute('aria-label', '知识库')
  mountWorkspaceTopbarStyles(document)
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const app = createRoot(root)
  host.register('knowledge', root)
  app.render(<KnowledgeWorkspace bridge={bridge} host={host} document={document} />)
  const open = (event: Event) => {
    const section = (event as CustomEvent).detail?.section
    if (section === 'memory' || section === 'files') {
      document.dispatchEvent(new CustomEvent('sherlock:knowledge-show-section', { detail: section }))
    }
    host.open('knowledge')
  }
  document.defaultView?.addEventListener(knowledgeOpenEvent, open)
  return () => {
    document.defaultView?.removeEventListener(knowledgeOpenEvent, open)
    host.close('knowledge')
    app.unmount()
    style.remove()
    root.remove()
  }
}

function KnowledgeWorkspace({ bridge, host, document }: { bridge: Bridge; host: WorkspaceSurfaceHost; document: Document }) {
  const [tab, setTab] = useState<'files' | 'memory'>('files')
  const [sessionMode, setSessionMode] = useState<KnowledgeSessionMode>()
  const [surfaceVisible, setSurfaceVisible] = useState(() => host.current()?.surface === 'knowledge')
  const evidenceFor = useCallback(async (mode: KnowledgeSessionMode, ids: string[], signal: AbortSignal) => {
    const records: KnowledgeSessionEvidence[] = []
    for (let start = 0; start < ids.length; start += 32) {
      signal.throwIfAborted()
      records.push(...await bridge.request('session-evidence', { mode, ids: ids.slice(start, start + 32) }))
    }
    return records
  }, [bridge])
  const sessionDirectories = useKnowledgeSessions(document, surfaceVisible && tab === 'files', evidenceFor)
  const sessions = sessionMode ? sessionDirectories[sessionMode] : undefined
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const views = useSyncExternalStore(
    listener => observeWorkspaceViews(document, listener), () => sessionWorkspaceViews(document))
  const workspaceToggle = useRef<HTMLButtonElement>(null)
  const hasWorkspaceSession = workspaceExpanded && (!!findWorkspaceSession(document) || canNavigateGlobalWorkspace(document))
  const [local, setSnapshot] = useState(empty)
  const [received, setReceived] = useState<KnowledgeDocument[]>([])
  const [receivedStatus, setReceivedStatus] = useState<{ loading: boolean; error?: string }>({ loading: false })
  const snapshot = { ...local, documents: [...local.documents, ...received] }
  const allFiles = listKnowledgeDocuments(snapshot, { category: 'all' })
  const imageCount = listKnowledgeDocuments(snapshot, { category: 'images' }).length
  const fileCount = allFiles.length - imageCount
  const [filter, setFilter] = useState<KnowledgeFilter>(defaultFilter)
  const filterState = useRef({ revision: crypto.randomUUID(), filter: defaultFilter, assistantFilter: false })
  const previousFilter = useRef<typeof filterState.current>()
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [assistantFilter, setAssistantFilter] = useState(false)
  const [draftFilter, setDraftFilter] = useState<KnowledgeFilter>()
  const [ready, setReady] = useState(false)
  const sessionCounts = sessionSections.map(([mode]) => sessionDirectories[mode]?.entries?.length)
  const totalFileCount = ready && sessionCounts.every(count => count !== undefined)
    ? sessionCounts.reduce<number>((total, count) => total + (count ?? 0), allFiles.length)
    : '—'
  const [loadError, setLoadError] = useState<string>()
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)
  const [choosingFiles, setChoosingFiles] = useState(false)
  const [imports, setImports] = useState<FileImport[]>([])
  const [completedImports, setCompletedImports] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<string[]>([])
  const searchSequence = useRef(0)
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; folder?: boolean; pointer: boolean }>()
  const [panelMenu, setPanelMenu] = useState<{
    host: HTMLElement; row: KnowledgeListRow; folders: KnowledgeSnapshot['folders']; shares: KnowledgeSnapshot['sessionShares']
  }>()
  const [dialog, setDialog] = useState<DialogState>()
  const sessionShare = dialog?.type === 'share-session'
    ? (panelMenu?.shares ?? local.sessionShares)?.[knowledgeSessionShareKey(dialog.mode, dialog.row.id)] : undefined
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<KnowledgePreview & { native?: boolean; loading?: boolean }>()
  const [dragging, setDragging] = useState(false)
  const fileBeingMoved = useRef<FileMoveGesture>()
  const movedClick = useRef<string>()
  const commitFileMove = useRef<(id: string, folderId: string) => void>()
  const [moveTarget, setMoveTarget] = useState<string>()
  const currentEpoch = useRef(0)
  const refreshSequence = useRef(0)
  const receivedSequence = useRef(0)
  const viewRead = useRef({ snapshot, section: tab, ready, receivedStatus })
  const pendingViewRequests = useRef(new Set<string>())
  const appliedSharedCatalog = useRef(false)
  const dragDepth = useRef(0)
  const selection = filter.category ?? 'all'
  const canDropFiles = ready && !busy && !choosingFiles && selection !== 'received' && selection !== 'images'
  useEffect(() => {
    dragDepth.current = 0
    setDragging(false)
  }, [canDropFiles, filter.folderId, selection, sessionMode, surfaceVisible, tab])
  const visibleImports = selection === 'all' ? imports.filter(item => !filter.folderId || item.folderId === filter.folderId) : []
  const selectedFolder = snapshot.folders.find(folder => folder.id === filter.folderId)
  const title = selectedFolder?.name ?? knowledgeCategories[selection]
  const publishedSessions = usePublishedKnowledgeSessions(document, local, surfaceVisible && selection === 'shared' && !sessionMode)
  const rows = listKnowledgeRows(snapshot, filter, publishedSessions).filter(row =>
    selection !== 'all' || filter.folderId || !row.imageProject)
  const { page, pages, setPage, scrollRef, start, end } = useKnowledgePagination<HTMLDivElement>(rows.length)
  const receivedCategories = [...new Set(snapshot.documents.flatMap(row => row.received ? [row.received.category] : []))]
    .sort((a, b) => a.localeCompare(b))
  const filterCount = countFileFacets(filter)
  const narrowed = Boolean(filter.query || filterCount)
  const panelRow = panelMenu?.row.id === menu?.id ? panelMenu?.row : undefined
  const target = menu && !panelRow?.publishedSession ? panelRow ?? snapshot.documents.find(row => row.id === menu.id) : undefined
  const editorMode = target && bridge.openFileInEditor ? fileEditorMode(target.name) : undefined
  const targetSession = menu && (panelRow?.publishedSession ?? publishedSessions.find(row => row.id === menu.id)?.publishedSession)
  const targetFolder = menu?.folder && snapshot.folders.find(row => row.id === menu.id)
  const filterButton = useRef<HTMLButtonElement>(null)
  const actionMenu = useRef<HTMLDivElement>(null)
  const tableRows = useRef<HTMLTableSectionElement>(null)
  const previewRequest = useRef(0)
  const refresh = useRef<() => void>(() => {})
  const resultScope = JSON.stringify([
    selection, filter.folderId, filter.sharedCategory, filter.sources, filter.formats,
    filter.savedOnly, filter.sort, filter.ascending, assistantFilter ? filter.query : undefined
  ])
  const previousResultScope = useRef(resultScope)

  useLayoutEffect(() => {
    const syncSurface = () => {
      const visible = host.current()?.surface === 'knowledge'
      setSurfaceVisible(visible)
      if (!visible) setWorkspaceExpanded(false)
      else if (takeWorkspaceViewsExpansion(document, findWorkspaceSession(document)?.dataset.eworkNotesSession, 'knowledge'))
        setWorkspaceExpanded(true)
    }
    syncSurface()
    document.addEventListener('sherlock:workspace-surface-change', syncSurface)
    return () => {
      document.removeEventListener('sherlock:workspace-surface-change', syncSurface)
    }
  }, [bridge, document, host])

  function openWorkspaceView(view: string) {
    const sessionId = findWorkspaceSession(document)?.dataset.eworkNotesSession
    if (view === 'knowledge') return
    if (!sessionId) { navigateGlobalWorkspace(document, view, () => host.revealConversation()); return }
    if (!navigateWorkspaceView(document, sessionId, view, () => host.revealConversation()))
      setNotice({ text: '此会话视图暂不可用，请先打开对应会话。', error: true })
  }

  useLayoutEffect(() => {
    viewRead.current = { snapshot, section: tab, ready, receivedStatus }
  })

  useLayoutEffect(() => {
    const popup = actionMenu.current
    const view = document.defaultView
    if (!menu || !popup || !view) return
    if (panelMenu) {
      popup.setAttribute('popover', 'manual')
      if (!popup.matches(':popover-open')) popup.showPopover()
    } else popup.removeAttribute('popover')
    const position = () => {
      const { width, height } = popup.getBoundingClientRect()
      const maxLeft = view.innerWidth - width - 8
      const maxTop = view.innerHeight - height - 8
      const left = menu.pointer && menu.left <= maxLeft ? menu.left : menu.left - width
      const top = menu.pointer && menu.top > maxTop ? menu.top - height : menu.top
      popup.style.left = `${Math.max(8, Math.min(maxLeft, left))}px`
      popup.style.top = `${Math.max(8, Math.min(maxTop, top))}px`
    }
    position()
    if (menu.pointer) popup.focus({ preventScroll: true })
    view.addEventListener('resize', position)
    return () => view.removeEventListener('resize', position)
  }, [document, menu, panelMenu, target?.sessionId])

  useLayoutEffect(() => {
    if (previousResultScope.current === resultScope) return
    previousResultScope.current = resultScope
    const list = tableRows.current
    const view = document.defaultView
    if (!list || !view) return
    const motion = view.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    const duration = parseFloat(view.getComputedStyle(list).getPropertyValue('--odyssey-motion-menu-duration')) || 140
    const animation = list.animate([{ opacity: .76 }, { opacity: 1 }], { duration, easing: 'ease-out' })
    const updateMotion = () => { if (motion.matches) animation.cancel() }
    motion.addEventListener('change', updateMotion)
    return () => {
      animation.cancel()
      motion.removeEventListener('change', updateMotion)
    }
  }, [document, resultScope])

  function loadSearchHistory(query?: string) {
    const sequence = ++searchSequence.current
    const request = query === undefined ? bridge.request('recent-searches', {}) : bridge.request('remember-search', { query })
    void request.then(items => {
      if (sequence === searchSequence.current) setRecent(items)
    }).catch(() => {})
  }

  useEffect(() => {
    const next = Math.min(...Object.values(completedImports))
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => setCompletedImports(items =>
      Object.fromEntries(Object.entries(items).filter(([, expires]) => expires > Date.now()))
    ), Math.max(0, next - Date.now()))
    return () => clearTimeout(timer)
  }, [completedImports])

  useEffect(() => {
    if (!notice || dialog) return
    const timer = setTimeout(() => {
      setNotice(current => current === notice ? undefined : current)
    }, 2000)
    return () => clearTimeout(timer)
  }, [notice, dialog])

  useEffect(() => {
    let disposed = false
    const load = async () => {
      const sequence = ++refreshSequence.current
      try {
        const next = await bridge.request('snapshot')
        if (!disposed && sequence === refreshSequence.current) {
          setSnapshot(next)
          setReady(true)
          setLoadError(undefined)
        }
      } catch (error) {
        if (!disposed && sequence === refreshSequence.current) {
          const text = '知识库暂时无法加载。' + message(error)
          if (viewRead.current.ready) setNotice({ text, error: true })
          else setLoadError(text)
        }
      }
    }
    refresh.current = () => { void load() }
    let wasActive = false
    const surface = () => {
      const active = host.current()?.surface === 'knowledge'
      if (active !== wasActive) {
        setPanelMenu(undefined)
        setMenu(undefined)
        setDialog(undefined)
        filterState.current = { ...filterState.current, revision: crypto.randomUUID() }
        wasActive = active
      }
      if (active) {
        void load()
        loadSearchHistory()
      } else {
        setMenu(undefined)
        setDraftFilter(undefined)
        finishFileDrag()
      }
    }
    const reset = () => {
      setPanelMenu(undefined)
      setMenu(undefined)
      currentEpoch.current++
      refreshSequence.current++
      previewRequest.current++
      receivedSequence.current++
      finishFileDrag()
      setSessionMode(undefined)
      setSnapshot(empty)
      setReceived([])
      setReceivedStatus({ loading: false })
      setReady(false)
      setLoadError(undefined)
      filterState.current = { revision: crypto.randomUUID(), filter: defaultFilter, assistantFilter: false }
      previousFilter.current = undefined
      setUndoAvailable(false)
      setAssistantFilter(false)
      setFilter(defaultFilter)
      setPage(1)
      setBusy(false)
      setChoosingFiles(false)
      setImports([])
      setCompletedImports({})
      setRecent([])
      searchSequence.current++
      setNotice(undefined)
      setPreview(undefined)
      setDialog(undefined)
      if (host.current()?.surface === 'knowledge') {
        void load()
        loadSearchHistory()
      }
    }
    const offImports = bridge.subscribeImportProgress?.(progress => {
      setImports(items => items.map(item => item.id === progress.id ? { ...item, ...progress } : item))
    })
    const off = bridge.subscribe(() => { if (host.current()?.surface === 'knowledge') void load() })
    const showSection = (event: Event) => {
      const section = (event as CustomEvent).detail
      if (section === 'memory' || section === 'files') setTab(section)
    }
    const catalogChanged = (event: Event) => {
      receivedSequence.current++
      setReceived((event as CustomEvent<KnowledgeDocument[]>).detail)
      setReceivedStatus({ loading: false })
    }
    document.addEventListener('sherlock:knowledge-show-section', showSection)
    document.addEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
    document.addEventListener('sherlock:workspace-surface-change', surface)
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    surface()
    return () => {
      disposed = true
      searchSequence.current++
      currentEpoch.current++
      previewRequest.current++
      off()
      offImports?.()
      document.removeEventListener('sherlock:knowledge-show-section', showSection)
      document.removeEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
      document.removeEventListener('sherlock:workspace-surface-change', surface)
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [bridge, host, document])

  async function refreshReceived(force: boolean) {
    const sequence = ++receivedSequence.current
    const epoch = currentEpoch.current
    setReceivedStatus({ loading: true })
    try {
      const rows = await bridge.request('received', { refresh: force })
      if (sequence === receivedSequence.current && epoch === currentEpoch.current) {
        document.dispatchEvent(new CustomEvent('sherlock:knowledge-shared-catalog', { detail: rows }))
      }
    } catch (error) {
      if (sequence === receivedSequence.current && epoch === currentEpoch.current) {
        setReceived([])
        setReceivedStatus({ loading: false, error: knowledgeSharedCatalogError(error) })
      }
    }
  }

  useEffect(() => {
    if (selection !== 'received') return
    if (!appliedSharedCatalog.current) void refreshReceived(false)
    appliedSharedCatalog.current = false
    const show = () => { if (host.current()?.surface === 'knowledge') void refreshReceived(false) }
    document.addEventListener('sherlock:workspace-surface-change', show)
    const sharedAccessChanged = () => { if (host.current()?.surface === 'knowledge') void refreshReceived(true) }
    document.addEventListener('sherlock:knowledge-shared-access-changed', sharedAccessChanged)
    return () => {
      document.removeEventListener('sherlock:workspace-surface-change', show)
      document.removeEventListener('sherlock:knowledge-shared-access-changed', sharedAccessChanged)
    }
  }, [selection, document, host])

  useEffect(() => {
    if (!draftFilter && !menu) return
    const close = (event: PointerEvent) => {
      if ((event.target as Element).closest('.knowledge-popup,[data-knowledge-popup-trigger]')) return
      setDraftFilter(undefined)
      setMenu(undefined)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (draftFilter) filterButton.current?.focus()
      setDraftFilter(undefined)
      setMenu(undefined)
    }
    const closeFromEditor = () => { setMenu(undefined); setDraftFilter(undefined) }
    document.addEventListener('sherlock:workspace-pointerdown', closeFromEditor)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('sherlock:workspace-pointerdown', closeFromEditor)
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [document, draftFilter, menu])

  function applyFilter(next: KnowledgeFilter, fromAssistant = false) {
    setSessionMode(undefined)
    const state = { revision: crypto.randomUUID(), filter: next }
    filterState.current = { ...state, assistantFilter: fromAssistant }
    setFilter(next)
    setAssistantFilter(fromAssistant)
    setPage(1)
    return state
  }

  function updateFilter(change: Partial<KnowledgeFilter>) {
    previousFilter.current = undefined
    setUndoAvailable(false)
    applyFilter({ ...filterState.current.filter, ...change })
  }

  function undoFilter() {
    const before = previousFilter.current
    if (!before) throw Error('没有可撤销的对话筛选。')
    previousFilter.current = undefined
    setUndoAvailable(false)
    return applyFilter(before.filter, before.assistantFilter)
  }

  useLayoutEffect(() => {
    document.dispatchEvent(new Event('sherlock:knowledge-filter-state'))
  }, [document, filter, tab, undoAvailable])

  useEffect(() => {
    const undo = (event: Event) => {
      const revision = (event as CustomEvent<{ revision?: string }>).detail?.revision
      if (!previousFilter.current || revision !== filterState.current.revision || !viewRead.current.ready ||
          host.current()?.surface !== 'knowledge' || viewRead.current.section !== 'files' ||
          document.querySelector('.VOzbGW_overlay')) return
      event.preventDefault()
      undoFilter()
    }
    document.addEventListener('sherlock:knowledge-filter-undo', undo)
    return () => document.removeEventListener('sherlock:knowledge-filter-undo', undo)
  }, [document, host])

  useEffect(() => {
    const pending = pendingViewRequests.current
    const off = bridge.subscribeAction?.(request => {
      const { id } = request
      if (request.action === 'cancel') { pending.delete(id); return }
      pending.add(id)
      const active = () => host.current()?.surface === 'knowledge' && !document.querySelector('.VOzbGW_overlay')
      const run = async () => {
        try {
          if (!active()) throw Error('请先回到知识库工作区。')
          const current = filterState.current
          if (request.action !== 'inspect' && request.revision !== current.revision) {
            throw Error('筛选条件已变化，请先读取当前列表。')
          }
          if (!viewRead.current.ready) throw Error('知识库文件列表还未加载，请稍后重试。')
          const before = request.action === 'undo' ? previousFilter.current : undefined
          if (request.action === 'undo' && !before) throw Error('没有可撤销的对话筛选。')
          const next = request.action === 'filter' ? request.filter : before?.filter ?? current.filter
          const fromShared = current.filter.category === 'received'
          const toShared = next.category === 'received'
          const { section, receivedStatus: status } = viewRead.current
          let catalog: KnowledgeDocument[] | undefined
          if (toShared && (!fromShared || status.loading || status.error)) {
            catalog = await bridge.request('received', { refresh: Boolean(status.error) })
            if (!pending.has(id)) return
            if (!active() || filterState.current.revision !== current.revision || viewRead.current.section !== section) {
              throw Error('筛选条件已变化，请先读取当前列表。')
            }
          }
          if (next.folderId && !viewRead.current.snapshot.folders.some(folder => folder.id === next.folderId)) {
            throw Error('文件夹已不存在。')
          }
          // The receipt describes the committed React view, including the loaded sharing catalog.
          if (request.action !== 'inspect' || catalog) flushSync(() => {
            if (catalog) {
              if (!fromShared && toShared) appliedSharedCatalog.current = true
              document.dispatchEvent(new CustomEvent('sherlock:knowledge-shared-catalog', { detail: catalog }))
            }
            if (request.action === 'inspect') return
            setTab('files')
            setDraftFilter(undefined)
            setMenu(undefined)
            if (request.action === 'undo') undoFilter()
            else {
              previousFilter.current = current
              setUndoAvailable(true)
              applyFilter(next, true)
            }
          })
          const committed = filterState.current
          const { snapshot, section: committedSection } = viewRead.current
          const matches = listKnowledgeDocuments(snapshot, committed.filter)
          bridge.reply?.({ id, result: { revision: committed.revision, filter: committed.filter, section: committedSection,
            count: matches.length, documents: matches.slice(0, 40), folders: snapshot.folders } })
        } catch (error) {
          if (pending.has(id)) bridge.reply?.({ id, error: message(error) })
        } finally { pending.delete(id) }
      }
      void run()
    })
    return () => { pending.clear(); off?.() }
  }, [bridge, document, host])

  function openDialog(next: DialogState) {
    setMenu(undefined)
    if (next.type === 'create-folder') setPanelMenu(undefined)
    setValue(next.type === 'rename' ? next.row.name.replace(/\.[^.]+$/u, '') :
      next.type === 'rename-folder' ? next.name : next.type === 'move' ? next.row.folderId ?? '' :
      next.type === 'share' ? next.row.share?.category ?? knowledgeSharedCategories[0] :
        next.type === 'share-session' ? local.sessionShares?.[knowledgeSessionShareKey(next.mode, next.row.id)]?.category ?? knowledgeSharedCategories[0] : '')
    setNotice(undefined)
    setDialog(next)
  }

  async function edit(input: KnowledgeEdit) {
    const epoch = currentEpoch.current
    setBusy(true)
    setMenu(undefined)
    try {
      const result = await bridge.request('edit', input)
      if (epoch !== currentEpoch.current) return
      setSnapshot(result)
      if (input.type === 'remove' && preview?.document.id === input.id) setPreview(undefined)
      if (input.type === 'remove-folder' && input.id === filter.folderId) updateFilter({ folderId: undefined })
      setDialog(undefined)
      setNotice({ text: input.type === 'move'
        ? `已将「${result.documents.find(row => row.id === input.id)?.name ?? '文件'}」移到「${result.folders.find(folder => folder.id === input.folderId)?.name ?? '未分组'}」。`
        : '已更新知识库。' })
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  function finishFileDrag() {
    const move = fileBeingMoved.current
    fileBeingMoved.current = undefined
    if (move?.source.hasPointerCapture(move.pointer)) move.source.releasePointerCapture(move.pointer)
    setMoveTarget(undefined)
  }

  commitFileMove.current = (id, folderId) => {
    if (host.current()?.surface === 'knowledge' && !busy && local.folders.some(folder => folder.id === folderId)) {
      void edit({ type: 'move', id, folderId })
    }
  }

  useEffect(() => {
    const folderAt = (event: PointerEvent, move: FileMoveGesture) => {
      const folderId = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('.knowledge-folder[data-knowledge-folder-id]')?.dataset.knowledgeFolderId
      return folderId !== move.folderId ? folderId : undefined
    }
    const move = (event: PointerEvent) => {
      const gesture = fileBeingMoved.current
      if (!gesture || gesture.pointer !== event.pointerId) return
      if (!gesture.active) {
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return
        gesture.active = true
        gesture.source.setPointerCapture(event.pointerId)
      }
      setMoveTarget(folderAt(event, gesture))
    }
    const drop = (event: PointerEvent) => {
      const gesture = fileBeingMoved.current
      if (!gesture || gesture.pointer !== event.pointerId) return
      if (gesture.active) {
        movedClick.current = gesture.id
        const folderId = folderAt(event, gesture)
        if (folderId) commitFileMove.current?.(gesture.id, folderId)
      }
      finishFileDrag()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', drop)
    document.addEventListener('pointercancel', finishFileDrag)
    document.defaultView?.addEventListener('blur', finishFileDrag)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', drop)
      document.removeEventListener('pointercancel', finishFileDrag)
      document.defaultView?.removeEventListener('blur', finishFileDrag)
    }
  }, [document])

  async function share(row: KnowledgeDocument, category?: string) {
    const epoch = currentEpoch.current
    setBusy(true)
    setMenu(undefined)
    try {
      const result = await bridge.request(category ? 'share' : 'unshare', { id: row.id, category })
      if (epoch !== currentEpoch.current) return
      setSnapshot(result)
      setDialog(undefined)
      setNotice({ text: category ? '已共享，其他用户可在知识库中查找此文件。' : '已取消共享。' })
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  async function shareSession(row: KnowledgeSessionEntry, mode: KnowledgeSessionMode, category?: string) {
    const epoch = currentEpoch.current
    setBusy(true)
    setNotice(undefined)
    try {
      const result = await bridge.request(category ? 'share-session' : 'unshare-session', { id: row.id, title: row.title, mode, category })
      if (epoch !== currentEpoch.current) return
      setSnapshot(result)
      setDialog(undefined)
      setNotice({ text: category ? '已发布只读快照。' : '已取消共享。' })
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  async function runImport(item: FileImport) {
    const epoch = currentEpoch.current
    try {
      const document = await bridge.request('import-file', { transferId: item.id, path: item.path, folderId: item.folderId })
      if (epoch !== currentEpoch.current) return
      setSnapshot(snapshot => snapshot.documents.some(row => row.id === document.id)
        ? snapshot : { ...snapshot, documents: [...snapshot.documents, document] })
      setImports(items => items.filter(row => row.id !== item.id))
      setCompletedImports(items => ({ ...items, [document.id]: Date.now() + 3600 }))
      if (!listKnowledgeDocuments({ documents: [document], folders: snapshot.folders }, filterState.current.filter).length) {
        setNotice({ text: `已添加 ${item.name}，当前筛选未显示该文件。` })
      }
      refresh.current()
    } catch (error) {
      if (epoch !== currentEpoch.current) return
      setImports(items => items.flatMap(row => {
        if (row.id !== item.id) return [row]
        return row.status === 'cancelling' ? [] : [{ ...row, status: 'failed', error: message(error) }]
      }))
    }
  }

  function retryImport(item: FileImport) {
    const retry = { ...item, id: crypto.randomUUID(), status: 'adding' as const, error: undefined, copied: 0, total: 0 }
    setImports(items => items.map(row => row.id === item.id ? retry : row))
    void runImport(retry)
  }

  async function cancelImport(item: FileImport) {
    if (item.status === 'failed') {
      setImports(items => items.filter(row => row.id !== item.id))
      return
    }
    const epoch = currentEpoch.current
    setImports(items => items.map(row => row.id === item.id ? { ...row, status: 'cancelling' } : row))
    try { await bridge.request('cancel-import', { transferId: item.id }) }
    catch (error) {
      if (epoch !== currentEpoch.current) return
      setImports(items => items.map(row => row.id === item.id ? { ...row, status: 'adding' } : row))
      setNotice({ text: message(error), error: true })
    }
  }

  async function addFiles(paths?: string[]) {
    const epoch = currentEpoch.current
    const folderId = filter.folderId
    setNotice(undefined)
    try {
      if (!paths) {
        setChoosingFiles(true)
        paths = await bridge.request('pick', {})
      }
      if (epoch !== currentEpoch.current || !paths.length) return
      if (paths.length > 64) throw Error('每次最多添加 64 个文件。')
      const batch: FileImport[] = paths.map(path => ({
        id: crypto.randomUUID(), path, name: fileName(path), folderId, status: 'adding', copied: 0, total: 0
      }))
      setImports(items => [...batch, ...items])
      if (selection !== 'all') selectCategory('all')
      setPage(1)
      for (const item of batch) void runImport(item)
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setChoosingFiles(false)
    }
  }

  async function openPreview(row: KnowledgeDocument) {
    if (row.imageProject && bridge.openImageProject) {
      await runFileAction(() => bridge.openImageProject!(row.id))
      return
    }
    if (openSharedKnowledgeSession(document, row)) return
    const request = ++previewRequest.current
    const openInPane = new CustomEvent('sherlock:knowledge-preview-file', {
      detail: { id: row.id, name: row.name }, cancelable: true
    })
    if (!document.dispatchEvent(openInPane)) {
      setPreview({ document: row, native: true })
      return
    }
    setPreview({ document: row, loading: true })
    try {
      const result = await bridge.request('preview', { id: row.id })
      if (request === previewRequest.current) setPreview(result)
    } catch (error) {
      if (request === previewRequest.current) {
        setPreview(undefined)
        setNotice({ text: message(error), error: true })
      }
    }
  }

  async function fileAction(method: 'open' | 'reveal', row: KnowledgeDocument) {
    setMenu(undefined)
    try { await bridge.request(method, { id: row.id }) }
    catch (error) { setNotice({ text: message(error), error: true }) }
  }

  function closePreview() {
    previewRequest.current++
    setPreview(undefined)
  }

  useEffect(() => {
    const showPanelMenu = (event: Event) => {
      const element = event.target as HTMLElement
      const host = element.closest<HTMLElement>('.knowledge-panel')
      const detail = (event as CustomEvent).detail
      if (busy || !host || !detail?.row || detail.row.id !== element.dataset.knowledgeFileId) return
      setPanelMenu({ host, row: detail.row, folders: detail.folders, shares: detail.shares })
      setDraftFilter(undefined)
      setDialog(undefined)
      setNotice(undefined)
      setMenu({ id: detail.row.id, left: detail.left, top: detail.top, pointer: true })
    }
    document.addEventListener('sherlock:knowledge-panel-file-menu', showPanelMenu)
    return () => document.removeEventListener('sherlock:knowledge-panel-file-menu', showPanelMenu)
  }, [document, busy])

  function showMenu(event: React.MouseEvent<HTMLElement>, id: string, folder?: boolean) {
    const pointer = event.type === 'contextmenu'
    if (pointer) event.preventDefault()
    if (busy) return
    setPanelMenu(undefined)
    const bounds = event.currentTarget.getBoundingClientRect()
    const atCursor = pointer && (event.clientX !== 0 || event.clientY !== 0)
    const top = atCursor ? event.clientY : bounds.bottom + 4
    const left = atCursor ? event.clientX : bounds.right
    setDraftFilter(undefined)
    setMenu(current => !pointer && current?.id === id ? undefined : { id, top, left, folder, pointer })
  }

  function selectCategory(category: KnowledgeCategory, folderId?: string) {
    if (category === 'received' && selection === 'received') void refreshReceived(true)
    updateFilter({ category, folderId, sharedCategory: undefined })
    setMenu(undefined)
    setDraftFilter(undefined)
    closePreview()
  }

  async function openSession(id: string, mode: KnowledgeSessionMode | 'chat') {
    const ok = await openKnowledgeSession(document, id, mode)
    if (ok && host.current()?.surface === 'knowledge') host.revealConversation()
    return ok
  }

  async function openPublishedSession(session: NonNullable<KnowledgeListRow['publishedSession']>) {
    setMenu(undefined)
    if (!await openSession(session.entry.id, session.mode)) setNotice({ text: '来源会话已不可用。', error: true })
  }

  async function runFileAction(open: () => Promise<void>) {
    if (busy) return
    const epoch = currentEpoch.current
    setMenu(undefined)
    setBusy(true)
    try { await open() }
    catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  function inActionHost(content: React.ReactNode) {
    return panelMenu ? createPortal(content, panelMenu.host) : content
  }

  const openInEditor = target && editorMode && <button type="button" disabled={busy} onClick={() =>
    void runFileAction(() => bridge.openFileInEditor!({
      id: target.id, sessionId: target.sessionId || findWorkspaceSession(document)?.dataset.eworkNotesSession
    }, editorMode))
  }>{fileEditorLabel(editorMode, document.documentElement.dataset.odysseyLocale === 'en')}</button>

  const openImageCopy = target && !target.imageProject && canOpenKnowledgeImage(target.name) && bridge.openImageFactoryCopy &&
    <button type="button" disabled={busy} onClick={() => void runFileAction(() => bridge.openImageFactoryCopy!(target.id))}>在「图像」中编辑副本</button>

  function submitDialog(event: React.FormEvent) {
    event.preventDefault()
    if (!dialog || busy) return
    switch (dialog.type) {
      case 'create-folder': void edit({ type: dialog.type, name: value }); break
      case 'rename-folder': void edit({ type: dialog.type, id: dialog.id, name: value }); break
      case 'remove-folder': void edit({ type: dialog.type, id: dialog.id }); break
      case 'rename': {
        const suffix = /\.[^.]+$/u.exec(dialog.row.name)?.[0] ?? ''
        void edit({ type: dialog.type, id: dialog.row.id, name: value.trim() + suffix })
        break
      }
      case 'share': void share(dialog.row, value); break
      case 'share-session': void shareSession(dialog.row, dialog.mode, value); break
      case 'move': void edit({ type: dialog.type, id: dialog.row.id, folderId: value || undefined }); break
      case 'remove': void edit({ type: dialog.type, id: dialog.row.id }); break
    }
  }

  return <>
    <header className="knowledge-header workspace-app-topbar" onKeyDown={event => {
      if (event.key !== 'Escape' || !workspaceExpanded) return
      event.preventDefault()
      event.stopPropagation()
      setWorkspaceExpanded(false)
      workspaceToggle.current?.focus({ preventScroll: true })
    }}>
      <div className="knowledge-back" onClick={() => host.back()} dangerouslySetInnerHTML={{ __html: workspaceBackButton() }} />
      <div className="workspace-app-title">
        <i aria-hidden="true" style={{ maskImage: `url('${icons.knowledge.replaceAll("'", '%27')}')` }} />
        <span>知识库</span>
      </div>
      <div className="eb-workspace-controls">
        <button type="button" className="eb-workspace-toggle" ref={workspaceToggle}
          aria-label={`${workspaceExpanded ? '收起' : '展开'}工作区页签`}
          title={`${workspaceExpanded ? '收起' : '展开'}工作区页签`}
          aria-expanded={workspaceExpanded} aria-controls="knowledge-workspace-tabs"
          onClick={() => setWorkspaceExpanded(value => !value)}><i aria-hidden="true" /></button>
        <nav id="knowledge-workspace-tabs" className="eb-workspace-tabs" data-navigation-tabs="" aria-label="工作区视图" aria-hidden={!workspaceExpanded} ref={node => { if (node) node.inert = !workspaceExpanded }}>
          <div className="eb-workspace-tab-list">
            {views.map(([view, label]) => <button key={view} type="button" data-workspace-native-view={view} aria-current={view === 'knowledge'} aria-label={`切换到${label}`}
              tabIndex={workspaceExpanded ? 0 : -1} disabled={!hasWorkspaceSession && view !== 'chat'}
              title={!hasWorkspaceSession && view !== 'chat' ? `选择会话后可打开${label}` : label}
              onClick={() => openWorkspaceView(view)}>{label}</button>)}
          </div>
          <button type="button" className="eb-workspace-edit" data-workspace-view-customize="" aria-label="自定义顶栏" title="自定义顶栏"><i aria-hidden="true" /></button>
        </nav>
      </div>
      <div className="knowledge-header-tabs">
        <button type="button" aria-current={tab === 'files' ? 'page' : undefined} onClick={() => {
          setTab('files')
          setSessionMode(undefined)
        }}>文件资料</button>
        <button type="button" aria-current={tab === 'memory' ? 'page' : undefined} onClick={() => {
          setMenu(undefined)
          setDraftFilter(undefined)
          setTab('memory')
        }}>经验记忆</button>
      </div>
    </header>
    {tab === 'memory' ? bridge.memory && <KnowledgeMemory document={document} bridge={bridge.memory} /> : <div className="knowledge-body">
      <nav className="knowledge-navigation" aria-label="知识库分类">
        {(Object.keys(knowledgeCategories) as KnowledgeCategory[]).filter(category => category !== 'images').map(category => <React.Fragment key={category}>
          <button type="button" aria-current={!sessionMode && !filter.folderId && selection === category && category !== 'all' ? 'page' : undefined}
            onClick={() => selectCategory(category)}>
            {buttonIcon(categoryIcons[category], knowledgeCategories[category])}
            <small><span>{category === 'all' ? totalFileCount : listKnowledgeDocuments(snapshot, { category }).length +
              (category === 'shared' ? Object.keys(local.sessionShares ?? {}).length : 0)}</span></small>
          </button>
          {category === 'all' && <div className="knowledge-session-sections" role="group" aria-label="所有文件子分类">
            <button type="button" aria-current={!sessionMode && !filter.folderId && selection === 'all' ? 'page' : undefined}
              onClick={() => selectCategory('all')}>{buttonIcon('document', '文件资料')}<small><span>{fileCount}</span></small></button>
            <button type="button" aria-current={!sessionMode && selection === 'images' ? 'page' : undefined}
              onClick={() => selectCategory('images')}>{buttonIcon('images', knowledgeCategories.images)}<small><span>{imageCount}</span></small></button>
            {sessionSections.map(([mode, icon]) => <button key={mode} type="button" aria-current={sessionMode === mode ? 'page' : undefined}
              onClick={() => {
                setSessionMode(mode)
                setMenu(undefined)
                setDraftFilter(undefined)
                closePreview()
              }}>{buttonIcon(icon, knowledgeSessionDirectoryLabels[mode])}<small><span>{sessionDirectories[mode]?.entries?.length ?? '—'}</span></small></button>)}
          </div>}
        </React.Fragment>)}
        <div className="knowledge-folder-heading"><span>文件夹</span>
          <button className="knowledge-square" type="button" aria-label="新建文件夹" disabled={busy || !ready}
            onClick={() => openDialog({ type: 'create-folder' })}><KnowledgeIcon name="add" /></button>
        </div>
        {snapshot.folders.map(folder => <div className="knowledge-folder" key={folder.id} data-knowledge-folder-id={folder.id}
          data-selected={!sessionMode && filter.folderId === folder.id} data-move-target={moveTarget === folder.id}>
          <button type="button" aria-current={!sessionMode && filter.folderId === folder.id ? 'page' : undefined} onClick={() => selectCategory('all', folder.id)}>
            <KnowledgeIcon name="folder" /><span data-odyssey-truncated-tooltip>{folder.name}</span>
            <small><span>{listKnowledgeDocuments(snapshot, { folderId: folder.id }).length}</span></small>
          </button>
          <button type="button" className="knowledge-square knowledge-folder-menu" data-knowledge-popup-trigger
            aria-label={`${folder.name}的更多操作`} aria-expanded={menu?.folder === true && menu.id === folder.id}
            onClick={event => showMenu(event, folder.id, true)}>
            <KnowledgeIcon name="more" />
          </button>
        </div>)}
      </nav>
      {sessionMode ? <KnowledgeSessionDirectory key={sessionMode} mode={sessionMode} entries={sessions?.entries ?? []}
        loading={sessions?.loading ?? true} error={sessions?.error ?? false} open={openSession}
        shares={local.sessionShares} share={(row, mode) => openDialog({ type: 'share-session', row, mode })} /> :
      <main className="knowledge-file-list" data-knowledge-file-drop-owner data-knowledge-undo-revision={undoAvailable ? filterState.current.revision : undefined} onDragEnter={event => {
        if (!canDropFiles || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dragDepth.current++
        setDragging(true)
      }} onDragLeave={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }} onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = canDropFiles ? 'copy' : 'none'
        if (canDropFiles) setDragging(true)
      }} onDrop={event => {
        if (!event.dataTransfer.types.includes('Files') && !event.dataTransfer.files.length) return
        event.preventDefault()
        event.stopPropagation()
        dragDepth.current = 0
        setDragging(false)
        if (!canDropFiles) return
        const paths = Array.from(event.dataTransfer.files, file => bridge.path(file)).filter(Boolean)
        if (paths.length) void addFiles(paths)
        else setNotice({ text: '请拖入本地文件。', error: true })
      }}>
        <div className="knowledge-tools">
          <h2 data-odyssey-truncated-tooltip>{title}{filter.sharedCategory && selection === 'received' && <span> / {filter.sharedCategory}</span>}</h2>
          <div className="knowledge-toolbar">
            <button ref={filterButton} type="button" className="knowledge-filter-trigger" aria-label="筛选"
              data-knowledge-popup-trigger aria-expanded={!!draftFilter} data-filtered={filterCount > 0} onClick={() => { setMenu(undefined); setDraftFilter(current => current ? undefined : filter) }}>
              {buttonIcon('filter', '筛选')}
              {filterCount > 0 && <span className="knowledge-filter-count" aria-hidden="true">{filterCount}</span>}
            </button>
            <FileSearch query={filter.query ?? ''} shared={selection === 'received'} recent={recent}
              change={query => updateFilter({ query })} remember={query => loadSearchHistory(query)} />
            {selection === 'received' && <button type="button" title="刷新共享目录" aria-label="刷新共享目录"
              disabled={receivedStatus.loading} onClick={() => void refreshReceived(true)}>刷新</button>}
            {selection !== 'received' && selection !== 'images' && <button type="button" className="knowledge-primary" disabled={busy || choosingFiles || !ready} onClick={() => void addFiles()}>
              {buttonIcon('add', '添加文件')}
            </button>}
            {draftFilter && <FilterMenu draft={draftFilter} change={setDraftFilter}
              reset={() => setDraftFilter(current => ({ ...current, ...emptyFileFacets }))}
              apply={() => {
                updateFilter({ sources: draftFilter.sources, formats: draftFilter.formats, savedOnly: draftFilter.savedOnly })
                setDraftFilter(undefined)
                filterButton.current?.focus()
              }} />}
          </div>
        </div>
        {(narrowed || assistantFilter) && <div className="knowledge-filter-summary">
          <span aria-live="polite">找到 {rows.length} 个文件</span>
          {[...(assistantFilter && selectedFolder ? [selectedFolder.name] : []), ...(filter.sources ?? []).map(source => knowledgeSources[source]), ...(filter.formats ?? []).map(format => knowledgeFormats[format]),
            ...(filter.savedOnly ? ['手动收藏'] : [])].map(label => (
            <span key={label} className="knowledge-tag" data-odyssey-truncated-tooltip>{label}</span>
          ))}
          <div className="knowledge-filter-summary-actions">
            {undoAvailable && <button type="button" onClick={undoFilter}>撤销</button>}
            <button type="button" onClick={() => updateFilter(assistantFilter ? {
              category: 'all', folderId: undefined, sharedCategory: undefined,
              query: '', sources: [], formats: [], savedOnly: false, sort: undefined, ascending: undefined
            } : { query: '', sources: [], formats: [], savedOnly: false })}>清除筛选</button>
          </div>
        </div>}
        <div className="knowledge-table-area" data-received={selection === 'received'}>
          {selection === 'received' && <div className="knowledge-shared-column">
            <span className="knowledge-shared-heading">分类</span>
            <nav className="knowledge-shared-folders" aria-label="共享分类">
              <button type="button" aria-current={!filter.sharedCategory ? 'page' : undefined}
                onClick={() => updateFilter({ sharedCategory: undefined })}>{buttonIcon('all', '全部文件')}</button>
              {receivedCategories.map(category => <button className="knowledge-shared-folder" key={category} type="button" aria-current={filter.sharedCategory === category ? 'page' : undefined}
                title={category} onClick={() => updateFilter({ sharedCategory: category })}>
                {buttonIcon('folder', category)}<KnowledgeIcon name="next" />
              </button>)}
            </nav>
          </div>}
          <div className="knowledge-table-content">
            <div className="knowledge-table-wrap" ref={scrollRef}>
              <table className="knowledge-table">
                <thead><tr>
                  {(['name', 'size', 'updatedAt'] as const).map((sort, index) => {
                    const active = (filter.sort ?? 'updatedAt') === sort
                    const ascending = filter.ascending ?? sort === 'name'
                    return <th key={sort} scope="col" aria-sort={active ? ascending ? 'ascending' : 'descending' : 'none'}>
                      <button type="button" onClick={() => updateFilter({ sort, ascending: active ? !ascending : sort === 'name' })}>
                        {['文件名', '文件大小', '更新时间'][index]}{active && (ascending ? ' ↑' : ' ↓')}
                      </button>
                    </th>
                  })}
                  <th scope="col">{selection === 'received' ? '共享人' : '操作'}</th>
                </tr></thead>
                <tbody ref={tableRows}>
                  {page === 1 && visibleImports.map(item => (
                    <tr key={item.id} className="knowledge-import-row" data-status={item.status}>
                      <td>
                        <div className="knowledge-file-name">
                          <KnowledgeItemIcon format={knowledgeFormat(item.name)} tile />
                          <div className="knowledge-file-content">
                            <span className="knowledge-file-title"><span title={item.name}>{item.name}</span></span>
                            <div className="knowledge-import-controls">
                              <small>手动上传 · {snapshot.folders.find(folder => folder.id === item.folderId)?.name ?? '未分组'}</small>
                              {item.status === 'failed' ? <>
                                <span className="knowledge-import-error" role="alert" title={item.error}>上传失败</span>
                                <button type="button" aria-label={`重试 ${item.name}`} onClick={() => retryImport(item)}>重试</button>
                              </> : <span role="status">{item.status === 'cancelling' ? '正在取消…' : item.total
                                ? `上传中 ${Math.min(100, Math.floor(100 * item.copied / item.total))}% · ${item.copied ? formatBytes(item.copied) : '0 B'} / ${formatBytes(item.total)}`
                                : '等待上传…'}</span>}
                              <button type="button" disabled={item.status === 'cancelling'} aria-label={`取消 ${item.name}`} onClick={() => void cancelImport(item)}>取消</button>
                            </div>
                            <progress className="knowledge-import-progress" aria-label={`${item.name}的上传进度`}
                              value={item.total ? Math.min(item.total, item.copied) : undefined} max={item.total || 1} />
                          </div>
                        </div>
                      </td>
                      <td>{item.total ? formatBytes(item.total) : '—'}</td>
                      <td>刚刚</td>
                      <td />
                    </tr>
                  ))}
                  {rows.slice(start, end).map(row => {
                    const session = row.received && sharedKnowledgeSessionFile(row.name, row.source)
                    const published = row.publishedSession
                    const title = session ? session.title : row.name
                    const completed = completedImports[row.id] !== undefined
                    const bytes = published && !row.size ? '—' : formatBytes(row.size)
                    const updatedAt = new Date(row.updatedAt)
                    const date = completed ? '刚刚' : updatedAt.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
                    return <tr key={row.id} data-selected={preview?.document.id === row.id} data-import-complete={completed || undefined}
                      data-knowledge-file-context-menu data-image-project={!!row.imageProject || undefined}
                      onClick={row.imageProject ? event => {
                        if (!(event.target as Element).closest('button, a, input') && !busy) void openPreview(row)
                      } : undefined}
                      onContextMenu={event => showMenu(event, row.id)}>
                      <td><button className="knowledge-file-name" type="button" title={title}
                        onClick={event => {
                          if (published) { void openPublishedSession(published); return }
                          if (event.detail && movedClick.current === row.id) { movedClick.current = undefined; return }
                          void openPreview(row)
                        }} onPointerDown={event => {
                          if (event.button !== 0 || event.pointerType === 'touch' || row.received || published || busy) return
                          movedClick.current = undefined
                          fileBeingMoved.current = { id: row.id, folderId: row.folderId, pointer: event.pointerId,
                            x: event.clientX, y: event.clientY, active: false, source: event.currentTarget }
                        }}>
                        <KnowledgeItemIcon format={published?.mode ?? (session ? session.mode : knowledgeFormat(row.name))} tile />
                        <span className="knowledge-file-content">
                          <span className="knowledge-file-title"><span>{title}</span>
                            {row.saved && <span className="knowledge-bookmarked" aria-label="手动收藏"><KnowledgeIcon name="bookmark" /></span>}
                            {row.starred && <span className="knowledge-tag" data-kind="star">重点</span>}
                            {row.share && <span className="knowledge-tag" data-kind="share">共享</span>}
                          </span>
                          {row.received ? <small className="knowledge-shared-metadata">
                            <span title={row.received.category}>{session ? sharedModeLabels[session.mode] + ' · ' : ''}{row.received.category}</span>
                            <span className="knowledge-shared-inline-size"> · {bytes}</span>
                            <time dateTime={updatedAt.toISOString()}> · {date}</time>
                            <span className="knowledge-shared-inline-owner" title={row.received.owner}> · {row.received.owner}</span>
                          </small> : <small>{(published
                            ? [sharedModeLabels[published.mode], row.share?.category]
                            : [knowledgeSources[row.source], row.sessionTitle, selection === 'shared' && row.share?.category,
                              snapshot.folders.find(folder => folder.id === row.folderId)?.name ?? '未分组']).filter(Boolean).join(' · ')}
                            {completed && <span role="status"> · 上传完成</span>}</small>}
                          {completed && <progress className="knowledge-import-progress" aria-label={`${row.name}的上传进度`}
                            value={row.size || 1} max={row.size || 1} />}
                        </span>
                      </button></td>
                      <td>{bytes}</td>
                      <td>{row.updatedAt ? <time dateTime={updatedAt.toISOString()}>{date}</time> : '—'}</td>
                      <td title={row.received?.owner}>{row.received?.owner}
                        <button type="button" className="knowledge-square" data-knowledge-popup-trigger disabled={busy}
                          aria-label={`${row.name}的更多操作`} aria-expanded={menu?.id === row.id}
                          onClick={event => showMenu(event, row.id)}><KnowledgeIcon name="more" /></button></td>
                    </tr>
                  })}
                </tbody>
              </table>
              {!rows.length && !visibleImports.length && (!ready && loadError ? <div className="knowledge-empty knowledge-load-error">
                <span role="alert">{loadError}</span>
                <button type="button" onClick={() => refresh.current()}>重试</button>
              </div> : selection === 'received' && receivedStatus.error ? <div className="knowledge-empty knowledge-load-error">
                <span role="alert">{receivedStatus.error}</span>
                <button type="button" onClick={() => void refreshReceived(true)}>重试</button>
              </div> : <p className="knowledge-empty">
                {selection === 'received' && receivedStatus.loading ? '正在加载他人共享…'
                  : ready ? narrowed ? '没有符合条件的文件。' : selection === 'received' ? '暂无他人共享的文件。' : '此分类暂无文件。'
                  : '正在加载文件…'}
              </p>)}
            </div>
            {canDropFiles && dragging && <div className="knowledge-drop-zone" role="status">
              <span className="knowledge-drop-icon"><img src={dropUploadIcon} alt="" width={28} height={28} /></span>
              <span>松开以上传文件</span>
            </div>}
            <KnowledgePagination label="文件分页" page={page} pages={pages} setPage={setPage} />
          </div>
        </div>
      </main>}
      {preview && !preview.native && <aside className="knowledge-preview" aria-label="文件预览">
        <header><strong title={preview.document.name}>{preview.document.name}</strong>
          <button className="knowledge-square" type="button" aria-label="关闭预览" onClick={closePreview}><KnowledgeIcon name="close" /></button></header>
        {preview.document.received && <button type="button" onClick={() => {
          void bridge.request('download', { id: preview.document.id }).catch(error => setNotice({ text: message(error), error: true }))
        }}>下载共享文件</button>}
        {!preview.document.received && <button type="button" onClick={() => void fileAction('open', preview.document)}>用系统应用打开</button>}
        <KnowledgePreviewContent file={preview} loading={preview.loading} />
      </aside>}
    </div>}
    {inActionHost(<>
    {notice && !dialog && <div className="knowledge-toast" role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    {(tab === 'files' || panelMenu) && menu && (target || targetFolder || targetSession) && <div ref={actionMenu} className="knowledge-popup knowledge-action-menu"
      role="group" tabIndex={-1} aria-label="更多操作">
      {target?.received && <>
        <button type="button" onClick={() => {
          setMenu(undefined)
          if (panelMenu) {
            if (!openSharedKnowledgeSession(document, target)) document.dispatchEvent(new CustomEvent('sherlock:knowledge-preview-file', { detail: { id: target.id, name: target.name } }))
          } else void openPreview(target)
        }}>{sharedKnowledgeSessionFile(target.name, target.source) ? '打开共享会话' : '预览文件'}</button>
        {!sharedKnowledgeSessionFile(target.name, target.source) && <>
          {openInEditor}
          {openImageCopy}
          <button type="button" onClick={() => void runFileAction(async () => { await bridge.request('download', { id: target.id }) })}>下载共享文件</button>
        </>}
      </>}
      {target && !target.received && <>
        <button type="button" onClick={() => openDialog({ type: 'move', row: target })}>移动到文件夹…</button>
        {target.imageProject && bridge.openImageProject &&
          <button type="button" disabled={busy} onClick={() => void runFileAction(() => bridge.openImageProject!(target.id))}>在「图像」中继续编辑</button>}
        {openImageCopy}
        {!target.imageProject && target.generatedBy === 'image-factory' && target.sessionId && bridge.openImageFactorySource &&
          <button type="button" disabled={busy} onClick={() => void runFileAction(() => bridge.openImageFactorySource!(target.sessionId!))}>打开来源画布</button>}
        {target.sessionId && <button type="button" onClick={async () => {
          setMenu(undefined)
          if (!await openSession(target.sessionId!, 'chat')) setNotice({ text: '来源会话已不可用。', error: true })
        }}>跳转至会话</button>}
        <button type="button" onClick={() => void fileAction('open', target)}>打开文件</button>
        {openInEditor}
        <button type="button" onClick={() => void fileAction('reveal', target)}>在文件夹中显示</button>
        <hr />
        <button type="button" onClick={() => void edit({ type: 'save', id: target.id, value: !target.saved })}>
          {target.saved ? '取消收藏' : '添加至收藏'}
        </button>
        <button type="button" onClick={() => void edit({ type: 'star', id: target.id, value: !target.starred })}>
          {target.starred ? '取消重点' : '设为重点'}
        </button>
        <button type="button" onClick={() => target.share ? void share(target) : openDialog({ type: 'share', row: target })}>
          {target.share ? '取消共享' : '设为共享'}
        </button>
        <button type="button" onClick={() => openDialog({ type: 'rename', row: target })}>重命名</button>
        <hr />
        <button className="knowledge-danger" type="button" onClick={() => openDialog({ type: 'remove', row: target })}>从知识库删除</button>
      </>}
      {targetSession && <>
        <button type="button" onClick={() => void openPublishedSession(targetSession)}>打开原会话</button>
        <button type="button" onClick={() => openDialog({ type: 'share-session', row: targetSession.entry, mode: targetSession.mode })}>管理共享</button>
      </>}
      {targetFolder && <>
        <button type="button" onClick={() => openDialog({ type: 'rename-folder', ...targetFolder })}>重命名文件夹</button>
        <button className="knowledge-danger" type="button" onClick={() => openDialog({ type: 'remove-folder', ...targetFolder })}>删除文件夹</button>
      </>}
    </div>}
    {dialog && <div className="knowledge-dialog-backdrop">
      <form className="knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title"
        onSubmit={submitDialog} onKeyDown={event => {
          if (!busy && event.key === 'Escape') { setDialog(undefined); setNotice(undefined) }
        }}>
        <h2 id="knowledge-dialog-title">{dialogTitle(dialog.type)}</h2>
        {dialog.type === 'share' || dialog.type === 'share-session' ? <>
          {dialog.type === 'share-session' ? <>
            <p className="knowledge-move-file" title={dialog.row.title}>{dialog.row.title}</p>
            <p>发布已保存内容的只读快照。其他已登录用户可在「他人共享」查看。修改会话后可重新发布。</p>
          </> : <p>共享后，其他已登录用户及其 Agent 可查找和引用此文件。</p>}
          <div className="knowledge-dialog-select">
            <select autoFocus aria-label="共享分类" value={value} onChange={event => setValue(event.target.value)}>
              {knowledgeSharedCategories.map(category => <option key={category}>{category}</option>)}
            </select>
            <KnowledgeIcon name="chevron" />
          </div>
        </> : dialog.type === 'move' ? <>
          <p className="knowledge-move-file" title={dialog.row.name}>{dialog.row.name}</p>
          <div className="knowledge-dialog-select">
            <select autoFocus aria-label="目标文件夹" value={value} onChange={event => setValue(event.target.value)}>
              <option value="">未分组</option>
              {(panelMenu?.folders ?? snapshot.folders).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <KnowledgeIcon name="chevron" />
          </div>
        </> : dialog.type === 'remove' ? <p>从知识库删除「{dialog.row.name}」？</p>
          : dialog.type === 'remove-folder' ? <p>删除「{dialog.name}」后，里面的文件会移到未分组。</p>
            : <input autoFocus aria-label="名称" maxLength={255} value={value} onChange={event => setValue(event.target.value)}
              onFocus={event => event.currentTarget.select()} required />}
        {notice?.error && <p role="alert" className="knowledge-danger">{notice.text}</p>}
        <footer>
          {dialog.type === 'share-session' && sessionShare && <button type="button" className="knowledge-danger knowledge-stop-sharing" disabled={busy}
            onClick={() => void shareSession(dialog.row, dialog.mode)}>取消共享</button>}
          <button type="button" disabled={busy} onClick={() => { setDialog(undefined); setNotice(undefined) }}>取消</button>
          <button type="submit" className="knowledge-primary" disabled={busy || dialog.type === 'move' && value === (dialog.row.folderId ?? '')}>
            {dialog.type === 'share-session' ? sessionShare ? '重新发布' : '发布' :
              dialog.type === 'move' ? '移动' : dialog.type.startsWith('remove') ? '删除' : '确认'}
          </button>
        </footer>
      </form>
    </div>}
    </>)}
  </>
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /u, '')
}

function dialogTitle(type: DialogState['type']) {
  return {
    'create-folder': '新建文件夹', 'rename-folder': '重命名文件夹', 'remove-folder': '删除文件夹',
    rename: '重命名文件', share: '共享至知识库', 'share-session': '共享只读会话', move: '移动到文件夹', remove: '从知识库删除'
  }[type]
}
