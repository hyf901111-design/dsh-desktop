import { sharedKnowledgeSessionFile, knowledgeSessionLabels as sharedModeLabels } from '../../shared/knowledge-sessions'
import { openSharedKnowledgeSession } from './session-directory'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  knowledgeCategories, knowledgeFormat, listKnowledgeDocuments, maxEditableKnowledgeBytes,
  type KnowledgeCategory, type KnowledgeDocument, type KnowledgeFilter, type KnowledgeSnapshot
} from '../../shared/knowledge-library'
import type { MemoryBridge } from '../../shared/memory'
import { KnowledgeMemory } from './memory'
import { countFileFacets, emptyFileFacets, FilterMenu } from './filter-menu'
import { categoryIcons, KnowledgeIcon, KnowledgeItemIcon } from './icons'
import { KnowledgePreviewContent, type KnowledgePreview } from './preview'
import css from './panel.css?raw'

type PanelBridge = {
  memory?: MemoryBridge
  snapshot(): Promise<KnowledgeSnapshot>
  received(refresh?: boolean): Promise<KnowledgeDocument[]>
  preview(id: string): Promise<KnowledgePreview>
  markdown(id: string): Promise<{ text: string; revision: string }>
  saveMarkdown(id: string, revision: string, text: string): Promise<{ document: KnowledgeDocument; revision: string }>
  open(id: string): Promise<void>
  download(id: string): Promise<boolean>
}

type PanelProps = { id?: string; document: Document; bridge: PanelBridge }
const size = (value: number) => value >= 1024 * 1024
  ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`

export function mountKnowledgePanels(document: Document, bridge: PanelBridge) {
  const roots = new Map<HTMLElement, ReturnType<typeof createRoot>>()
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const scan = () => {
    for (const [host, root] of roots) if (!host.isConnected) {
      roots.delete(host)
      root.unmount()
    }
    for (const host of document.querySelectorAll<HTMLElement>('[data-knowledge-panel-host]')) {
      if (roots.has(host)) continue
      const root = createRoot(host)
      roots.set(host, root)
      root.render(<KnowledgePanel id={host.dataset.knowledgePanelFile} document={document} bridge={bridge} />)
    }
  }
  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  scan()
  return () => {
    observer.disconnect()
    roots.forEach(root => root.unmount())
    roots.clear()
    style.remove()
  }
}

function KnowledgePanel({ id, document, bridge }: PanelProps) {
  const [section, setSection] = useState<'files' | 'memory'>('files')
  const panel = useRef<HTMLElement>(null)
  const showFiles = section === 'files'
  useEffect(() => {
    const reset = () => setSection('files')
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    return () => document.removeEventListener('sherlock:knowledge-identity-changed', reset)
  }, [document])
  return <section ref={panel} className="knowledge-panel" aria-label={id ? '知识库文件预览' : '知识库资料'}>
    {id ? <FilePreview id={id} bridge={bridge} document={document} panel={panel} /> : <>
      <header className="knowledge-panel-heading">
        <div className="knowledge-panel-sections" role="group" aria-label="知识库页签">
          <button type="button" aria-pressed={showFiles} onClick={() => setSection('files')}>文件资料</button>
          {bridge.memory && <button type="button" aria-pressed={!showFiles} onClick={() => setSection('memory')}>经验记忆</button>}
        </div>
        <button type="button" onClick={() => document.defaultView?.dispatchEvent(
          new CustomEvent('sherlock:knowledge-open', { detail: { section } })
        )}>打开完整知识库</button>
      </header>
      <div className="knowledge-panel-files" hidden={!showFiles}>
        <FilePicker document={document} bridge={bridge} />
      </div>
      {!showFiles && bridge.memory && <KnowledgeMemory document={document} bridge={bridge.memory} compact />}
    </>}
  </section>
}

function FilePreview({ id, bridge, document, panel }: PanelProps & { id: string; panel: React.RefObject<HTMLElement> }) {
  const [file, setFile] = useState<KnowledgePreview>()
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<{ text: string; original: string; revision: string }>()
  const [busy, setBusy] = useState(false)
  const [editingMessage, setEditingMessage] = useState('')
  const epoch = useRef(0)
  const name = file?.document.name
  useEffect(() => {
    const host = panel.current?.parentElement
    if (!host || !name) return
    host.dataset.knowledgePreviewTitle = name
    return () => { delete host.dataset.knowledgePreviewTitle }
  }, [name, panel])
  useEffect(() => {
    let current = true
    let sequence = 0
    let loaded: KnowledgePreview | undefined
    const shared = /^[a-f0-9]{32}$/u.test(id)
    const reset = () => {
      current = false
      epoch.current++
      setDraft(undefined)
      setBusy(false)
      setFile(undefined)
      setError('账号已变化，请重新打开文件。')
    }
    const load = async (recheck = false, catalog?: KnowledgeDocument[]) => {
      if (!current) return
      const request = ++sequence
      const isLatest = () => current && request === sequence
      if (recheck) {
        if (!catalog) {
          const rows = await bridge.received(true).catch(() => undefined)
          if (isLatest() && rows) document.dispatchEvent(new CustomEvent('sherlock:knowledge-shared-catalog', { detail: rows }))
          return
        }
        const entry = catalog.find(row => row.id === id)
        if (!entry) {
          loaded = undefined
          setFile(undefined)
          setError('该文件已取消共享或不可用。')
          return
        }
        if (loaded && entry.updatedAt === loaded.document.updatedAt && !loaded.previewError) return
      }
      try {
        const value = await bridge.preview(id)
        if (!isLatest()) return
        loaded = value
        setFile(value)
        setError('')
      } catch (error) {
        if (!isLatest()) return
        loaded = undefined
        setFile(undefined)
        setError(printError(error))
      }
    }
    const changed = () => { void load(shared) }
    const recheckVisible = () => {
      const node = panel.current
      if (document.visibilityState !== 'hidden' && node?.getClientRects().length &&
          !node.closest('[aria-hidden="true"], [inert]')) void load(true)
    }
    const catalogChanged = (event: Event) => { void load(true, (event as CustomEvent<KnowledgeDocument[]>).detail) }
    const win = document.defaultView
    const timer = shared ? win?.setInterval(recheckVisible, 15_000) : undefined
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    document.addEventListener('sherlock:knowledge-changed', changed)
    if (shared) {
      document.addEventListener('sherlock:knowledge-shared-access-changed', recheckVisible)
      document.addEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
      win?.addEventListener('focus', recheckVisible)
    }
    void load()
    return () => {
      current = false
      epoch.current++
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
      document.removeEventListener('sherlock:knowledge-changed', changed)
      if (shared) {
        if (timer !== undefined) win?.clearInterval(timer)
        document.removeEventListener('sherlock:knowledge-shared-access-changed', recheckVisible)
        document.removeEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
        win?.removeEventListener('focus', recheckVisible)
      }
    }
  }, [id, bridge, document, panel])
  if (!file && !draft) return <p className="knowledge-panel-state" role={error ? 'alert' : 'status'}>{error || '正在打开文件…'}</p>
  const canEdit = file && !file.document.received && !file.document.share && knowledgeFormat(file.document.name) === 'markdown' &&
    file.document.size <= maxEditableKnowledgeBytes
  const edit = async () => {
    const version = epoch.current
    setBusy(true)
    setError('')
    setEditingMessage('')
    try {
      const markdown = await bridge.markdown(id)
      if (version === epoch.current) setDraft({ ...markdown, original: markdown.text })
    } catch (error) {
      if (version === epoch.current) setError(printError(error))
    } finally { if (version === epoch.current) setBusy(false) }
  }
  const save = async () => {
    if (!draft || busy || draft.original === draft.text) return
    const version = epoch.current
    setBusy(true)
    setError('')
    try {
      const next = await bridge.saveMarkdown(id, draft.revision, draft.text)
      if (version !== epoch.current) return
      setFile({ document: next.document, text: draft.text })
      setDraft(undefined)
      setEditingMessage('正文已保存。')
    } catch (error) {
      if (version === epoch.current) setError(printError(error))
    } finally { if (version === epoch.current) setBusy(false) }
  }
  return <>
    {file && <header className="knowledge-preview-heading">
      <KnowledgeItemIcon format={knowledgeFormat(file.document.name)} />
      <strong title={file.document.name}>{file.document.name}</strong>
      {!draft && canEdit && <button type="button" disabled={busy} onClick={() => void edit()}>编辑</button>}
      {!draft && <button type="button" disabled={busy} onClick={() => {
        const action = file.document.received ? bridge.download(id) : bridge.open(id)
        void action.catch(error => setError(printError(error)))
      }}>{file.document.received ? '下载' : '用系统应用打开'}</button>}
    </header>}
    {error && <p className="knowledge-panel-state" role="alert">{error}</p>}
    {editingMessage && <p className="knowledge-panel-state" role="status">{editingMessage}</p>}
    {draft ? <>
      <textarea aria-label="Markdown 正文" className="knowledge-markdown-editor" spellCheck={false} value={draft.text}
        disabled={busy} autoFocus onChange={event => setDraft({ ...draft, text: event.currentTarget.value })} />
      <footer className="knowledge-markdown-actions">
        <button type="button" disabled={busy} onClick={() => { setDraft(undefined); setError('') }}>取消</button>
        <button type="button" disabled={busy || draft.original === draft.text} onClick={() => void save()}>保存</button>
      </footer>
    </> : file && <KnowledgePreviewContent file={file} />}
  </>
}

function FilePicker({ document, bridge }: Omit<PanelProps, 'id'>) {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>({ documents: [], folders: [] })
  const [category, setCategory] = useState<KnowledgeCategory>('all')
  const [folder, setFolder] = useState<string>()
  const [sharedCategory, setSharedCategory] = useState<string>()
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<KnowledgeFilter>({})
  const [draftFacets, setDraftFacets] = useState<KnowledgeFilter>()
  const [menu, setMenu] = useState<'directory' | 'filter'>()
  const [allShared, setAllShared] = useState(false)
  const [state, setState] = useState({ ready: false, error: '' })
  const [referenceError, setReferenceError] = useState('')
  const location = useRef<HTMLDivElement>(null)
  const directoryTrigger = useRef<HTMLButtonElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const browsingReceived = category === 'received'
  useEffect(() => {
    let revision = 0
    const load = (force = false, catalog?: KnowledgeDocument[]) => {
      const current = ++revision
      const local = bridge.snapshot()
      const source = browsingReceived ? Promise.all([local, catalog ?? bridge.received(force)])
        .then(([local, documents]) => ({ ...local, documents })) : local
      void source.then(rows => {
        if (current !== revision) return
        setSnapshot(rows)
        setState({ ready: true, error: '' })
        if (browsingReceived && catalog === undefined) {
          location.current?.dispatchEvent(new CustomEvent('sherlock:knowledge-shared-catalog', {
            bubbles: true, detail: rows.documents
          }))
        }
      }).catch(error => {
        if (current === revision) setState({ ready: true, error: printError(error) })
      })
    }
    const reset = () => {
      setSnapshot({ documents: [], folders: [] })
      setState({ ready: false, error: '' })
      setCategory('all')
      setFolder(undefined)
      setSharedCategory(undefined)
      setAllShared(false)
      setQuery('')
      setFacets({})
      setMenu(undefined)
      setReferenceError('')
      if (!browsingReceived) load()
      else revision++
    }
    load()
    const changed = () => load()
    const sharedAccessChanged = () => { if (browsingReceived) load(true) }
    const catalogChanged = (event: Event) => {
      if (browsingReceived && event.target !== location.current) load(false, (event as CustomEvent<KnowledgeDocument[]>).detail)
    }
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    document.addEventListener('sherlock:knowledge-changed', changed)
    document.addEventListener('sherlock:knowledge-shared-access-changed', sharedAccessChanged)
    document.addEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
    return () => {
      revision++
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
      document.removeEventListener('sherlock:knowledge-changed', changed)
      document.removeEventListener('sherlock:knowledge-shared-access-changed', sharedAccessChanged)
      document.removeEventListener('sherlock:knowledge-shared-catalog', catalogChanged)
    }
  }, [bridge, document, browsingReceived])
  useEffect(() => {
    if (!menu) return
    const outside = (event: PointerEvent) => {
      if (location.current && !event.composedPath().includes(location.current)) setMenu(undefined)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMenu(undefined)
      const trigger = menu === 'filter' ? filterTrigger : directoryTrigger
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [document, menu])
  const rows = listKnowledgeDocuments(snapshot, { ...facets, category, folderId: folder, sharedCategory, query })
  const sharedDirectory = browsingReceived && !allShared && !sharedCategory && !query.trim()
  const sharedCounts = new Map<string, number>()
  if (sharedDirectory) for (const row of rows) {
    const label = row.received?.category
    if (label) sharedCounts.set(label, (sharedCounts.get(label) ?? 0) + 1)
  }
  const hasRows = (sharedDirectory ? sharedCounts.size : rows.length) > 0
  const filterCount = countFileFacets(facets)
  const title = snapshot.folders.find(row => row.id === folder)?.name ?? knowledgeCategories[category]
  const pick = (next: KnowledgeCategory, folderId?: string) => {
    if ((next === 'received') !== browsingReceived) setState({ ready: false, error: '' })
    if (next === 'received') setFacets(current => ({ ...current, savedOnly: false }))
    setCategory(next)
    setSharedCategory(undefined)
    setAllShared(false)
    setFolder(folderId)
    setMenu(undefined)
  }
  const reference = (row: KnowledgeDocument) => {
    const requestId = crypto.randomUUID()
    const result = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail.requestId !== requestId) return
      document.removeEventListener('sherlock:knowledge-reference-status', result)
      setReferenceError(detail.ok ? '' : detail.message)
    }
    document.addEventListener('sherlock:knowledge-reference-status', result)
    setTimeout(() => document.removeEventListener('sherlock:knowledge-reference-status', result), 4000)
    document.dispatchEvent(new CustomEvent('sherlock:knowledge-reference-file', {
      detail: { id: row.id, label: row.name, requestId, activateChat: true }
    }))
  }
  return <>
    <label className="knowledge-panel-search"><KnowledgeIcon name="search" />
      <input type="search" aria-label="搜索知识库文件" placeholder="搜索文件…" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <div className="knowledge-panel-location" ref={location}>
      {(folder || browsingReceived) && <button type="button" aria-label="返回上级"
        onClick={() => {
          if (sharedCategory || allShared) { setSharedCategory(undefined); setAllShared(false) }
          else pick('all')
        }}><KnowledgeIcon name="previous" /></button>}
      <button type="button" className="knowledge-panel-location-label" ref={directoryTrigger}
        aria-expanded={menu === 'directory'} onClick={() => setMenu(menu === 'directory' ? undefined : 'directory')}>
        <span>{title}{allShared ? ' / 全部文件' : sharedCategory ? ` / ${sharedCategory}` : ''}</span><KnowledgeIcon name="chevron" />
      </button>
      <button type="button" className="knowledge-panel-filter knowledge-filter-trigger" aria-label="筛选" ref={filterTrigger} aria-expanded={menu === 'filter'}
        data-filtered={filterCount > 0} onClick={() => {
          if (menu === 'filter') setMenu(undefined)
          else { setDraftFacets(facets); setMenu('filter') }
        }}><KnowledgeIcon name="filter" />筛选{filterCount > 0 && <span className="knowledge-filter-count" aria-hidden="true">{filterCount}</span>}</button>
      {menu === 'directory' && <div className="knowledge-panel-menu" aria-label="知识库目录">
        {Object.entries(knowledgeCategories).map(([id, label]) =>
          <button key={id} type="button" aria-current={category === id && !folder ? 'page' : undefined}
            onClick={() => pick(id as KnowledgeCategory)}><KnowledgeIcon name={categoryIcons[id as KnowledgeCategory]} />{label}</button>)}
        {snapshot.folders.length > 0 && <span>文件夹</span>}
        {snapshot.folders.map(folder => <button key={folder.id} type="button" onClick={() => pick('all', folder.id)}>
          <KnowledgeIcon name="folder" /> {folder.name}
        </button>)}
      </div>}
      {menu === 'filter' && draftFacets && <FilterMenu draft={draftFacets} change={setDraftFacets}
        showSavedOnly={category !== 'received'} reset={() => setDraftFacets(emptyFileFacets)}
        apply={() => { setFacets(draftFacets); setMenu(undefined); filterTrigger.current?.focus() }} />}
    </div>
    {state.error && hasRows && <p className="knowledge-panel-state" role="alert">{state.error}</p>}
    {referenceError && <p className="knowledge-panel-state" role="alert">{referenceError}</p>}
    <div className="knowledge-panel-rows"
      key={JSON.stringify([category, folder, sharedCategory, allShared])}
      data-ready={state.ready && !state.error}>
      {!state.ready && <p className="knowledge-panel-state knowledge-panel-empty" role="status">正在加载文件…</p>}
      {state.error && !hasRows && <p className="knowledge-panel-state knowledge-panel-empty" role="alert">{state.error}</p>}
      {state.ready && !state.error && sharedDirectory && <button type="button" className="knowledge-panel-directory" onClick={() => setAllShared(true)}>
        <KnowledgeIcon name="all" /><span>全部文件</span><small>{rows.length}</small><KnowledgeIcon name="next" />
      </button>}
      {state.ready && (sharedDirectory ? [...sharedCounts].map(([category, count]) =>
        <button type="button" className="knowledge-panel-directory" key={category} onClick={() => setSharedCategory(category)}>
          <KnowledgeIcon name="folder" /><span>{category}</span><small>{count}</small><KnowledgeIcon name="next" />
        </button>) : rows.map(row => {
        const session = row.received && sharedKnowledgeSessionFile(row.name, row.source)
        const title = session ? session.title : row.name
        return <div className="knowledge-panel-row" key={row.id}>
          <KnowledgeItemIcon format={session ? session.mode : knowledgeFormat(row.name)} tile />
          <button type="button" className="knowledge-panel-name" onClick={() => {
            if (!openSharedKnowledgeSession(document, row)) document.dispatchEvent(new CustomEvent('sherlock:knowledge-preview-file', {
              detail: { id: row.id, name: row.name }
            }))
          }}>
            <span title={title}>{title}</span>
            <small>{row.received ? [session && sharedModeLabels[session.mode], row.received.category, row.received.owner].filter(Boolean).join(' · ')
              : snapshot.folders.find(folder => folder.id === row.folderId)?.name ?? (row.source === 'generated' ? '会话生成' : '手动上传')}</small>
          </button>
          <div className="knowledge-panel-action" data-session={session ? true : undefined}>
            <small>{size(row.size)}</small>
            {!session && <button type="button" aria-label={`引用文件 ${row.name}`} onClick={() => reference(row)}>@文件</button>}
          </div>
        </div>
      }))}
      {state.ready && !state.error && !hasRows &&
        <p className="knowledge-panel-state knowledge-panel-empty">暂无符合条件的文件。</p>}
    </div>
  </>
}

function printError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /u, '')
}
