import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  knowledgeCategories, knowledgeFormat, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument, type KnowledgeSnapshot
} from '../../shared/knowledge-library'
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
  const [menu, setMenu] = useState(false)
  const [state, setState] = useState({ ready: false, error: '' })
  useEffect(() => {
    let revision = 0
    const load = () => {
      const current = ++revision
      const source = category === 'received'
        ? bridge.received().then(documents => ({ documents, folders: [] }))
        : bridge.snapshot()
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
      load()
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
  const rows = listKnowledgeDocuments(snapshot, { category, folderId: folder, sharedCategory, query })
  const categories = [...new Set(snapshot.documents.flatMap(row => row.received ? [row.received.category] : []))]
  const title = snapshot.folders.find(row => row.id === folder)?.name ?? knowledgeCategories[category]
  const pick = (next: KnowledgeCategory, folderId?: string) => {
    setCategory(next)
    setSharedCategory(undefined)
    setFolder(folderId)
    setMenu(false)
  }
  const reference = (row: KnowledgeDocument) => {
    const result = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail.ok) setState({ ready: true, error: detail.message })
      else setState({ ready: true, error: '' })
    }
    document.addEventListener('sherlock:knowledge-reference-status', result, { once: true })
    setTimeout(() => document.removeEventListener('sherlock:knowledge-reference-status', result), 4000)
    document.dispatchEvent(new CustomEvent('sherlock:knowledge-reference-file', { detail: { id: row.id, label: row.name, activateChat: true } }))
  }
  return <>
    <header className="knowledge-panel-heading">
      <strong>文件资料</strong>
      <button type="button" onClick={() => document.defaultView!.dispatchEvent(new Event('sherlock:knowledge-open'))}>打开完整知识库</button>
    </header>
    <label className="knowledge-panel-search"><KnowledgeIcon name="search" />
      <input type="search" aria-label="搜索知识库文件" placeholder="搜索文件…" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <div className="knowledge-panel-location">
      {(folder || sharedCategory) && <button type="button" aria-label="返回上级" onClick={() => sharedCategory ? setSharedCategory(undefined) : pick('all')}>‹</button>}
      <button type="button" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        {title}{sharedCategory ? ` / ${sharedCategory}` : ''} <KnowledgeIcon name="chevron" />
      </button>
      {menu && <div className="knowledge-panel-menu" onKeyDown={event => { if (event.key === 'Escape') setMenu(false) }}>
        {Object.entries(knowledgeCategories).map(([id, label]) =>
          <button key={id} type="button" onClick={() => pick(id as KnowledgeCategory)}>{label}</button>)}
        {snapshot.folders.map(folder => <button key={folder.id} type="button" onClick={() => pick('all', folder.id)}>
          <KnowledgeIcon name="folder" /> {folder.name}
        </button>)}
      </div>}
    </div>
    {!state.ready && <p className="knowledge-panel-state" role="status">正在加载文件…</p>}
    {state.error && <p className="knowledge-panel-state" role="alert">{state.error}</p>}
    <div className="knowledge-panel-rows">
      {category === 'received' && !sharedCategory && !query ? categories.map(category =>
        <button type="button" className="knowledge-panel-directory" key={category} onClick={() => setSharedCategory(category)}>
          <KnowledgeIcon name="folder" /><span>{category}</span><small>{snapshot.documents.filter(row => row.received?.category === category).length}</small><span>›</span>
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
      {state.ready && !state.error && !(category === 'received' && !sharedCategory && !query ? categories.length : rows.length) &&
        <p className="knowledge-panel-state">暂无符合条件的文件。</p>}
    </div>
  </>
}

function printError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /u, '')
}
