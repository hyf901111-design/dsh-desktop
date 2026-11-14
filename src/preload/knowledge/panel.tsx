import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  knowledgeCategories, knowledgeFormat, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument, type KnowledgeFilter, type KnowledgeSnapshot
} from '../../shared/knowledge-library'
import { emptyFileFacets, FilterMenu } from './filter-menu'
import { KnowledgeIcon } from './icons'
import { KnowledgePreviewContent, type KnowledgePreview } from './preview'
import css from './panel.css?raw'

type PanelBridge = {
  snapshot(): Promise<KnowledgeSnapshot>
  received(): Promise<KnowledgeDocument[]>
  preview(id: string): Promise<KnowledgePreview>
  open(id: string): Promise<void>
  download(id: string): Promise<boolean>
}

type PanelProps = { id?: string; document: Document; bridge: PanelBridge }
const size = (value: number) => value >= 1024 * 1024
  ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`
const categoryIcons = { all: 'all', saved: 'bookmark', starred: 'star', shared: 'shared', received: 'received' } as const

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
  return <section className="knowledge-panel" aria-label={id ? '知识库文件预览' : '知识库资料'}>
    {id ? <FilePreview id={id} bridge={bridge} document={document} /> : <FilePicker document={document} bridge={bridge} />}
  </section>
}

function FilePreview({ id, bridge, document }: PanelProps & { id: string }) {
  const [file, setFile] = useState<KnowledgePreview>()
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    const reset = () => { current = false; setFile(undefined); setError('账号已变化，请重新打开文件。') }
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    void bridge.preview(id).then(value => { if (current) setFile(value) }).catch(error => {
      if (current) setError(printError(error))
    })
    return () => {
      current = false
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [id, bridge, document])
  if (!file) return <p className="knowledge-panel-state" role={error ? 'alert' : 'status'}>{error || '正在打开文件…'}</p>
  return <>
    <header className="knowledge-preview-heading">
      <KnowledgeIcon name={knowledgeFormat(file.document.name)} />
      <strong title={file.document.name}>{file.document.name}</strong>
      <button type="button" onClick={() => {
        const action = file.document.received ? bridge.download(id) : bridge.open(id)
        void action.catch(error => setError(printError(error)))
      }}>{file.document.received ? '下载' : '在系统应用中打开'}</button>
    </header>
    {error && <p className="knowledge-panel-state" role="alert">{error}</p>}
    <KnowledgePreviewContent file={file} />
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
  const [state, setState] = useState({ ready: false, error: '' })
  const [referenceError, setReferenceError] = useState('')
  const location = useRef<HTMLDivElement>(null)
  const directoryTrigger = useRef<HTMLButtonElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let revision = 0
    const load = () => {
      const current = ++revision
      const local = bridge.snapshot()
      const source = category === 'received' ? Promise.all([local, bridge.received()])
        .then(([local, documents]) => ({ ...local, documents })) : local
      void source.then(rows => {
        if (current === revision) { setSnapshot(rows); setState({ ready: true, error: '' }) }
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
      setQuery('')
      setFacets({})
      setMenu(undefined)
      setReferenceError('')
      if (category === 'all') load()
      else revision++
    }
    load()
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    document.addEventListener('sherlock:knowledge-changed', load)
    return () => {
      revision++
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
      document.removeEventListener('sherlock:knowledge-changed', load)
    }
  }, [bridge, document, category])
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
  const sharedDirectory = category === 'received' && !sharedCategory && !query.trim()
  const sharedCounts = new Map<string, number>()
  if (sharedDirectory) for (const row of rows) {
    const label = row.received?.category
    if (label) sharedCounts.set(label, (sharedCounts.get(label) ?? 0) + 1)
  }
  const filterCount = Number(Boolean(facets.sources?.length)) + Number(Boolean(facets.formats?.length)) + Number(Boolean(facets.savedOnly))
  const title = snapshot.folders.find(row => row.id === folder)?.name ?? knowledgeCategories[category]
  const pick = (next: KnowledgeCategory, folderId?: string) => {
    if (next !== category) setState({ ready: false, error: '' })
    if (next === 'received') setFacets(current => ({ ...current, savedOnly: false }))
    setCategory(next)
    setSharedCategory(undefined)
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
    <header className="knowledge-panel-heading">
      <strong>文件资料</strong>
      <button type="button" onClick={() => document.defaultView!.dispatchEvent(new Event('sherlock:knowledge-open'))}>打开完整知识库</button>
    </header>
    <label className="knowledge-panel-search"><KnowledgeIcon name="search" />
      <input type="search" aria-label="搜索知识库文件" placeholder="搜索文件…" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <div className="knowledge-panel-location" ref={location}>
      {(folder || sharedCategory || category === 'received') && <button type="button" aria-label="返回上级"
        onClick={() => sharedCategory ? setSharedCategory(undefined) : pick('all')}>‹</button>}
      <button type="button" className="knowledge-panel-location-label" ref={directoryTrigger}
        aria-expanded={menu === 'directory'} onClick={() => setMenu(menu === 'directory' ? undefined : 'directory')}>
        <span>{title}{sharedCategory ? ` / ${sharedCategory}` : ''}</span><KnowledgeIcon name="chevron" />
      </button>
      <button type="button" className="knowledge-panel-filter" ref={filterTrigger} aria-expanded={menu === 'filter'}
        data-filtered={filterCount > 0} onClick={() => {
          if (menu === 'filter') setMenu(undefined)
          else { setDraftFacets(facets); setMenu('filter') }
        }}><KnowledgeIcon name="filter" />筛选{filterCount > 0 && <span>{filterCount}</span>}</button>
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
    {!state.ready && <p className="knowledge-panel-state" role="status">正在加载文件…</p>}
    {state.error && <p className="knowledge-panel-state" role="alert">{state.error}</p>}
    {referenceError && <p className="knowledge-panel-state" role="alert">{referenceError}</p>}
    <div className="knowledge-panel-rows">
      {sharedDirectory ? [...sharedCounts].map(([category, count]) =>
        <button type="button" className="knowledge-panel-directory" key={category} onClick={() => setSharedCategory(category)}>
          <KnowledgeIcon name="folder" /><span>{category}</span><small>{count}</small><span>›</span>
        </button>) : rows.map(row =>
        <div className="knowledge-panel-row" key={row.id}>
          <span className="knowledge-panel-file-icon"><KnowledgeIcon name={knowledgeFormat(row.name)} /></span>
          <button type="button" className="knowledge-panel-name" onClick={() => document.dispatchEvent(new CustomEvent('sherlock:knowledge-preview-file', {
            detail: { id: row.id, name: row.name }
          }))}>
            <span title={row.name}>{row.name}</span>
            <small>{row.received?.owner ?? snapshot.folders.find(folder => folder.id === row.folderId)?.name ?? (row.source === 'generated' ? '会话生成' : '手动上传')}</small>
          </button>
          <div className="knowledge-panel-action">
            <small>{size(row.size)}</small>
            <button type="button" aria-label={`引用文件 ${row.name}`} onClick={() => reference(row)}>@文件</button>
          </div>
        </div>)}
      {state.ready && !state.error && !(sharedDirectory ? sharedCounts.size : rows.length) &&
        <p className="knowledge-panel-state">暂无符合条件的文件。</p>}
    </div>
  </>
}

function printError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /u, '')
}
