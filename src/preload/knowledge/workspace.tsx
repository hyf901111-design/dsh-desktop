import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  knowledgeCategories, knowledgeFormat, knowledgeFormats, knowledgeSources, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument, type KnowledgeEdit, type KnowledgeFilter,
  type KnowledgeFormat, type KnowledgeImportResult, type KnowledgeSnapshot, type KnowledgeSource
} from '../../shared/knowledge-library'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { mountWorkspaceTopbarStyles, workspaceBackButton } from '../workspace-topbar'
import { KnowledgeIcon } from './icons'
import css from './workspace.css?raw'

interface Bridge {
  request(method: 'snapshot', args?: Record<string, unknown>): Promise<KnowledgeSnapshot>
  request(method: 'edit', args: KnowledgeEdit): Promise<KnowledgeSnapshot>
  request(method: 'pick' | 'import', args: Record<string, unknown>): Promise<KnowledgeImportResult>
  request(method: 'preview', args: { id: string }): Promise<{ document: KnowledgeDocument; text?: string }>
  request(method: 'open' | 'reveal', args: { id: string }): Promise<void>
  path(file: File): string
  subscribe(listener: () => void): () => void
}

type DialogState =
  | { type: 'create-folder' }
  | { type: 'rename-folder' | 'remove-folder'; id: string; name: string }
  | { type: 'rename' | 'move' | 'remove'; row: KnowledgeDocument }

const pageSize = 10
const empty: KnowledgeSnapshot = { documents: [], folders: [] }
const categoryIcons = { all: 'all', saved: 'bookmark', starred: 'star', shared: 'shared', received: 'received' } as const
const defaultFilter: KnowledgeFilter = {}
const formatBytes = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`

function buttonIcon(icon: string, text: string) {
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
  const open = () => host.open('knowledge')
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
  const [snapshot, setSnapshot] = useState(empty)
  const [filter, setFilter] = useState<KnowledgeFilter>(defaultFilter)
  const [draftFilter, setDraftFilter] = useState<KnowledgeFilter>()
  const [page, setPage] = useState(1)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; folder?: boolean }>()
  const [dialog, setDialog] = useState<DialogState>()
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<{ document: KnowledgeDocument; text?: string }>()
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const currentEpoch = useRef(0)
  const refreshSequence = useRef(0)
  const dragDepth = useRef(0)
  const selection = filter.category ?? 'all'
  const selectedFolder = snapshot.folders.find(folder => folder.id === filter.folderId)
  const title = selectedFolder?.name ?? knowledgeCategories[selection]
  const rows = listKnowledgeDocuments(snapshot, filter)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const shownPage = Math.min(page, pages)
  const receivedCategories = [...new Set(snapshot.documents.flatMap(row => row.received ? [row.received.category] : []))]
    .sort((a, b) => a.localeCompare(b))
  const narrowed = Boolean(filter.query || filter.sources?.length || filter.formats?.length || filter.savedOnly)
  const target = menu && snapshot.documents.find(row => row.id === menu.id)
  const targetFolder = menu?.folder && snapshot.folders.find(row => row.id === menu.id)
  const filterButton = useRef<HTMLButtonElement>(null)
  const previewRequest = useRef(0)
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    let disposed = false
    const load = async () => {
      const sequence = ++refreshSequence.current
      try {
        const next = await bridge.request('snapshot')
        if (!disposed && sequence === refreshSequence.current) {
          setSnapshot(next)
          setReady(true)
          setNotice(current => current?.error && current.text.startsWith('知识库暂时无法加载') ? undefined : current)
        }
      } catch (error) {
        if (!disposed && sequence === refreshSequence.current) {
          setNotice({ text: '知识库暂时无法加载。' + message(error), error: true })
        }
      }
    }
    refresh.current = () => { void load() }
    const surface = () => {
      if (host.current()?.surface === 'knowledge') {
        void load()
      } else {
        setMenu(undefined)
        setDraftFilter(undefined)
      }
    }
    const reset = () => {
      currentEpoch.current++
      previewRequest.current++
      setSnapshot(empty)
      setReady(false)
      setFilter(defaultFilter)
      setPage(1)
      setBusy(false)
      setNotice(undefined)
      setPreview(undefined)
      setDialog(undefined)
      if (host.current()?.surface === 'knowledge') void load()
    }
    const off = bridge.subscribe(() => { if (host.current()?.surface === 'knowledge') void load() })
    document.addEventListener('sherlock:workspace-surface-change', surface)
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    surface()
    return () => {
      disposed = true
      currentEpoch.current++
      previewRequest.current++
      off()
      document.removeEventListener('sherlock:workspace-surface-change', surface)
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [bridge, host, document])

  useEffect(() => {
    const sync = () => setPanelOpen(document.querySelector('#odyssey-right-workspace-panel')?.getAttribute('aria-hidden') === 'false')
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-odyssey-panel-right', 'aria-hidden'] })
    sync()
    return () => observer.disconnect()
  }, [document])

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
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [document, draftFilter, menu])

  function updateFilter(change: Partial<KnowledgeFilter>) {
    setFilter(current => ({ ...current, ...change }))
    setPage(1)
  }

  function openDialog(next: DialogState) {
    setMenu(undefined)
    setValue(next.type === 'rename' ? next.row.name.replace(/\.[^.]+$/u, '') :
      next.type === 'rename-folder' ? next.name : next.type === 'move' ? next.row.folderId ?? '' : '')
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
      setNotice({ text: '已更新知识库。' })
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  async function addFiles(paths?: string[]) {
    const epoch = currentEpoch.current
    setBusy(true)
    setNotice(undefined)
    try {
      const args = paths ? { paths, folderId: filter.folderId } : { folderId: filter.folderId }
      const result = await bridge.request(paths ? 'import' : 'pick', args)
      if (epoch !== currentEpoch.current) return
      if (result.added.length) refresh.current()
      if (result.added.length || result.failed.length) setNotice({
        text: [
          result.added.length ? `已添加 ${result.added.length} 个文件。` : '',
          ...result.failed.map(file => `${file.name}：${file.message}`)
        ].join(' '),
        error: result.failed.length > 0
      })
    } catch (error) {
      if (epoch === currentEpoch.current) setNotice({ text: message(error), error: true })
    } finally {
      if (epoch === currentEpoch.current) setBusy(false)
    }
  }

  async function openPreview(row: KnowledgeDocument) {
    const request = ++previewRequest.current
    setPreview({ document: row })
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

  function showMenu(event: React.MouseEvent<HTMLButtonElement>, id: string, folder?: boolean) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const top = Math.min(bounds.bottom + 4, document.defaultView!.innerHeight - (folder ? 111 : 315))
    setDraftFilter(undefined)
    setMenu(current => current?.id === id ? undefined : { id, top, left: bounds.right, folder })
  }

  function selectCategory(category: KnowledgeCategory, folderId?: string) {
    updateFilter({ category, folderId, sharedCategory: undefined })
    setMenu(undefined)
    closePreview()
  }

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
      case 'move': void edit({ type: dialog.type, id: dialog.row.id, folderId: value || undefined }); break
      case 'remove': void edit({ type: dialog.type, id: dialog.row.id }); break
    }
  }

  return <>
    <header className="knowledge-header">
      <div className="knowledge-back" onClick={() => host.back()} dangerouslySetInnerHTML={{ __html: workspaceBackButton() }} />
      <strong>知识库</strong>
      <div className="knowledge-header-tabs">
        <button type="button" aria-current="page">文件资料</button>
        <button type="button" onClick={() => document.dispatchEvent(new CustomEvent('sherlock:memory-open'))}>经验记忆</button>
      </div>
      <button className="knowledge-panel-toggle" type="button" aria-label={panelOpen ? '收起右侧屏' : '打开右侧屏'}
        aria-expanded={panelOpen} onClick={() => document.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry=right]')?.click()}>
        <KnowledgeIcon name="panel" />
      </button>
    </header>
    <div className="knowledge-body">
      <nav className="knowledge-navigation" aria-label="知识库分类">
        {(Object.keys(knowledgeCategories) as KnowledgeCategory[]).map(category => <button key={category} type="button"
          aria-current={!filter.folderId && selection === category ? 'page' : undefined} onClick={() => selectCategory(category)}>
          {buttonIcon(categoryIcons[category], knowledgeCategories[category])}
          <small>{listKnowledgeDocuments(snapshot, { category }).length}</small>
        </button>)}
        <div className="knowledge-folder-heading"><span>文件夹</span>
          <button className="knowledge-square" type="button" aria-label="新建文件夹" disabled={busy || !ready}
            onClick={() => openDialog({ type: 'create-folder' })}><KnowledgeIcon name="add" /></button>
        </div>
        {snapshot.folders.map(folder => <div className="knowledge-folder" key={folder.id} data-selected={filter.folderId === folder.id}>
          <button type="button" aria-current={filter.folderId === folder.id ? 'page' : undefined} onClick={() => selectCategory('all', folder.id)}>
            {buttonIcon('folder', folder.name)}
            <small>{listKnowledgeDocuments(snapshot, { folderId: folder.id }).length}</small>
          </button>
          <button type="button" className="knowledge-square knowledge-folder-menu" data-knowledge-popup-trigger
            aria-label={`${folder.name}的更多操作`} onClick={event => showMenu(event, folder.id, true)}>
            <KnowledgeIcon name="more" />
          </button>
        </div>)}
      </nav>
      <main className="knowledge-file-list" onDragEnter={event => {
        if (selection === 'received' || !event.dataTransfer.types.includes('Files')) return
        dragDepth.current++
        setDragging(true)
      }} onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }} onDragOver={event => {
        if (selection !== 'received' && event.dataTransfer.types.includes('Files')) event.preventDefault()
      }} onDrop={event => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (busy || !ready || selection === 'received') return
        const paths = Array.from(event.dataTransfer.files, file => bridge.path(file)).filter(Boolean)
        if (paths.length) void addFiles(paths)
        else setNotice({ text: '请拖入本地文件。', error: true })
      }}>
        <div className="knowledge-tools">
          <h2>{title}</h2>
          <div className="knowledge-toolbar">
            <button ref={filterButton} type="button" data-knowledge-popup-trigger aria-expanded={!!draftFilter}
              data-filtered={narrowed} onClick={() => { setMenu(undefined); setDraftFilter(current => current ? undefined : filter) }}>
              {buttonIcon('filter', '筛选')}
            </button>
            <label className="knowledge-search">
              <KnowledgeIcon name="search" />
              <input aria-label="搜索文件" placeholder={selection === 'received' ? '搜索他人共享…' : '搜索文件…'}
                value={filter.query ?? ''} onChange={event => updateFilter({ query: event.currentTarget.value })} />
            </label>
            {selection !== 'received' && <button type="button" className="knowledge-primary" disabled={busy || !ready} onClick={() => void addFiles()}>
              {buttonIcon('add', busy ? '处理中…' : '添加文件')}
            </button>}
            {draftFilter && <FilterMenu draft={draftFilter} change={setDraftFilter}
              reset={() => setDraftFilter(current => ({ ...current, sources: [], formats: [], savedOnly: false }))}
              apply={() => {
                updateFilter({ sources: draftFilter.sources, formats: draftFilter.formats, savedOnly: draftFilter.savedOnly })
                setDraftFilter(undefined)
                filterButton.current?.focus()
              }} />}
          </div>
        </div>
        {narrowed && <div className="knowledge-filter-summary">
          <span aria-live="polite">找到 {rows.length} 个文件</span>
          {[...(filter.sources ?? []).map(source => knowledgeSources[source]), ...(filter.formats ?? []).map(format => knowledgeFormats[format]),
            ...(filter.savedOnly ? ['手动收藏'] : [])].map(label => <span key={label} className="knowledge-tag">{label}</span>)}
          <button type="button" onClick={() => updateFilter({ query: '', sources: [], formats: [], savedOnly: false })}>清除筛选</button>
        </div>}
        {notice && !dialog && <div className="knowledge-notice" role={notice.error ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          {!ready && <button type="button" onClick={() => refresh.current()}>重试</button>}
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(undefined)}>×</button>
        </div>}
        <div className="knowledge-table-area" data-received={selection === 'received'}>
          {selection === 'received' && <nav className="knowledge-shared-folders" aria-label="共享分类">
            <span>分类</span>
            {receivedCategories.map(category => <button key={category} type="button" aria-current={filter.sharedCategory === category ? 'page' : undefined}
              onClick={() => updateFilter({ sharedCategory: category })}>
              {buttonIcon('folder', category)}<KnowledgeIcon name="chevron" />
            </button>)}
          </nav>}
          <div className="knowledge-table-wrap">
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
              <tbody>
                {rows.slice((shownPage - 1) * pageSize, shownPage * pageSize).map(row =>
                  <tr key={row.id} data-selected={preview?.document.id === row.id}>
                    <td><button className="knowledge-file-name" type="button" title={row.name} onClick={() => void openPreview(row)}>
                      <span className="knowledge-file-icon"><KnowledgeIcon name={knowledgeFormat(row.name)} /></span>
                      <span className="knowledge-file-content">
                        <span className="knowledge-file-title"><span>{row.name}</span>
                          {row.saved && <span className="knowledge-bookmarked" aria-label="手动收藏"><KnowledgeIcon name="bookmark" /></span>}
                          {row.starred && <span className="knowledge-tag" data-kind="star">重点</span>}
                          {row.share && <span className="knowledge-tag" data-kind="share">共享</span>}
                        </span>
                        <small>{[knowledgeSources[row.source], row.sessionTitle,
                          snapshot.folders.find(folder => folder.id === row.folderId)?.name ?? (row.received ? '' : '未分组')].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button></td>
                    <td>{formatBytes(row.size)}</td>
                    <td><time dateTime={new Date(row.updatedAt).toISOString()}>
                      {new Date(row.updatedAt).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}
                    </time></td>
                    <td>{row.received ? row.received.owner :
                      <button type="button" className="knowledge-square" data-knowledge-popup-trigger disabled={busy}
                        aria-label={`${row.name}的更多操作`} aria-expanded={menu?.id === row.id}
                        onClick={event => showMenu(event, row.id)}><KnowledgeIcon name="more" /></button>}</td>
                  </tr>)}
              </tbody>
            </table>
            {!rows.length && <p className="knowledge-empty">
              {ready ? narrowed ? '没有符合条件的文件。' : selection === 'received' ? '暂无他人共享的文件。' : '此分类暂无文件。'
                : notice?.error ? '' : '正在加载文件…'}
            </p>}
          </div>
        </div>
        {pages > 1 && <nav className="knowledge-pagination" aria-label="文件分页">
          <button type="button" disabled={shownPage === 1} onClick={() => setPage(shownPage - 1)}>上一页</button>
          <span>{shownPage} / {pages}</span>
          <button type="button" disabled={shownPage === pages} onClick={() => setPage(shownPage + 1)}>下一页</button>
        </nav>}
        {dragging && <div className="knowledge-drop-zone">拖放文件到知识库</div>}
      </main>
      {preview && <aside className="knowledge-preview" aria-label="文件预览">
        <header><strong title={preview.document.name}>{preview.document.name}</strong>
          <button className="knowledge-square" type="button" aria-label="关闭预览" onClick={closePreview}>×</button></header>
        {preview.text !== undefined ? <pre>{preview.text}</pre> :
          <button type="button" onClick={() => void fileAction('open', preview.document)}>用系统应用打开</button>}
      </aside>}
    </div>
    {menu && (target || targetFolder) && <div className="knowledge-popup knowledge-action-menu"
      style={{ top: menu.top, left: menu.left }} aria-label="更多操作">
      {target && <>
        <button type="button" onClick={() => void fileAction('open', target)}>打开文件</button>
        <button type="button" onClick={() => void fileAction('reveal', target)}>在文件夹中显示</button>
        <hr />
        <button type="button" onClick={() => void edit({ type: 'save', id: target.id, value: !target.saved })}>
          {target.saved ? '取消收藏' : '收藏至知识库'}
        </button>
        <button type="button" onClick={() => void edit({ type: 'star', id: target.id, value: !target.starred })}>
          {target.starred ? '取消重点' : '设为重点'}
        </button>
        <button type="button" onClick={() => openDialog({ type: 'move', row: target })}>移动到…</button>
        <button type="button" onClick={() => openDialog({ type: 'rename', row: target })}>重命名</button>
        <hr />
        <button className="knowledge-danger" type="button" onClick={() => openDialog({ type: 'remove', row: target })}>从知识库删除</button>
      </>}
      {targetFolder && <>
        <button type="button" onClick={() => openDialog({ type: 'rename-folder', ...targetFolder })}>重命名文件夹</button>
        <button className="knowledge-danger" type="button" onClick={() => openDialog({ type: 'remove-folder', ...targetFolder })}>删除文件夹</button>
      </>}
    </div>}
    {dialog && <div className="knowledge-dialog-backdrop">
      <form className="knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title"
        onSubmit={submitDialog} onKeyDown={event => { if (!busy && event.key === 'Escape') setDialog(undefined) }}>
        <h2 id="knowledge-dialog-title">{dialogTitle(dialog.type)}</h2>
        {dialog.type === 'move' ? <select autoFocus aria-label="目标文件夹" value={value} onChange={event => setValue(event.target.value)}>
          <option value="">未分组</option>
          {snapshot.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select> : dialog.type === 'remove' ? <p>从知识库删除「{dialog.row.name}」？</p>
          : dialog.type === 'remove-folder' ? <p>删除「{dialog.name}」后，里面的文件会移到未分组。</p>
            : <input autoFocus aria-label="名称" maxLength={255} value={value} onChange={event => setValue(event.target.value)}
              onFocus={event => event.currentTarget.select()} required />}
        {notice?.error && <p role="alert" className="knowledge-danger">{notice.text}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={() => { setDialog(undefined); setNotice(undefined) }}>取消</button>
          <button type="submit" className="knowledge-primary" disabled={busy}>{dialog.type.startsWith('remove') ? '删除' : '确认'}</button>
        </footer>
      </form>
    </div>}
  </>
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /u, '')
}

function dialogTitle(type: DialogState['type']) {
  return {
    'create-folder': '新建文件夹', 'rename-folder': '重命名文件夹', 'remove-folder': '删除文件夹',
    rename: '重命名文件', move: '移动到文件夹', remove: '从知识库删除'
  }[type]
}

function FilterMenu({ draft, change, reset, apply }: {
  draft: KnowledgeFilter
  change: (next: KnowledgeFilter) => void
  reset: () => void
  apply: () => void
}) {
  const toggle = <T extends string>(values: T[] = [], value: T) =>
    values.includes(value) ? values.filter(item => item !== value) : [...values, value]
  return <div className="knowledge-popup knowledge-filter-menu" role="group" aria-label="筛选文件">
    <fieldset>
      <legend>来源</legend>
      <label className="knowledge-filter-all"><input type="checkbox" checked={!draft.sources?.length}
        onChange={() => change({ ...draft, sources: [] })} />不限</label>
      <div className="knowledge-filter-options" data-columns="2">
        {(Object.keys(knowledgeSources) as KnowledgeSource[]).map(source => <label key={source}>
          <input type="checkbox" checked={draft.sources?.includes(source) ?? false}
            onChange={() => change({ ...draft, sources: toggle(draft.sources, source) })} />
          {knowledgeSources[source]}
        </label>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>文件格式</legend>
      <label className="knowledge-filter-all"><input type="checkbox" checked={!draft.formats?.length}
        onChange={() => change({ ...draft, formats: [] })} />不限</label>
      <div className="knowledge-filter-options" data-columns="3">
        {(Object.keys(knowledgeFormats) as KnowledgeFormat[]).map(format => <label key={format}>
          <input type="checkbox" checked={draft.formats?.includes(format) ?? false}
            onChange={() => change({ ...draft, formats: toggle(draft.formats, format) })} />
          {knowledgeFormats[format]}
        </label>)}
      </div>
    </fieldset>
    <footer>
      <label><input type="checkbox" checked={draft.savedOnly ?? false}
        onChange={event => change({ ...draft, savedOnly: event.currentTarget.checked })} />仅看手动收藏</label>
      <button type="button" onClick={reset}>重置</button>
      <button type="button" className="knowledge-primary" onClick={apply}>完成</button>
    </footer>
  </div>
}
