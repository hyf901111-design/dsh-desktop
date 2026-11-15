import React from 'react'
import { createRoot } from 'react-dom/client'
import { NotesApp } from '../notes/editor'
import { mountSharedSpreadsheet } from '../spreadsheet/view'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import type { KnowledgeDocument } from '../../shared/knowledge-library'
import { knowledgeSessionLabels, sharedKnowledgeSessionFile, type SharedKnowledgeSession, type KnowledgeSessionCopy } from '../../shared/knowledge-sessions'
import { openKnowledgeSession } from './session-directory'
import { KnowledgeIcon } from './icons'
import { HeaderViewModeIcon } from '../header-view-mode-icon'

export function mountSharedKnowledgeSessions(document: Document, host: WorkspaceSurfaceHost,
  read: (id: string) => Promise<{ session: SharedKnowledgeSession; updatedAt: number }>,
  canRead: (id: string, updatedAt: number) => Promise<boolean>,
  copy: (id: string, updatedAt: number, fromSession?: string) => Promise<KnowledgeSessionCopy>) {
  const surface = document.createElement('section')
  surface.className = 'knowledge-workspace knowledge-shared-session'
  surface.setAttribute('aria-label', '共享会话')
  host.register('shared-session', surface)
  const style = document.createElement('style')
  style.textContent = `
    .knowledge-shared-session{display:flex;flex-direction:column}
    .knowledge-shared-session>header{display:flex;align-items:center;gap:10px;padding:0 46px 0 18px;min-height:46px;flex:none}
    .knowledge-shared-session>header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
    body:has([data-dsh-panel-host][data-odyssey-panel-right="open"]) .knowledge-shared-session>header{padding-right:10px}
    .knowledge-shared-session-actions{display:flex;align-items:center;flex:none;gap:8px;margin-left:auto;white-space:nowrap}
    .knowledge-shared-session-actions button{background:var(--knowledge-field)}
    .knowledge-shared-session-actions button:hover:not(:disabled){background:var(--knowledge-control-hover)}
    .knowledge-session-copy-notice{position:absolute;right:10px;top:46px;z-index:4;margin:0;padding:8px 12px;
      max-width:calc(100% - 20px);background:var(--knowledge-menu);border:1px solid var(--knowledge-line);border-radius:8px}
    .knowledge-shared-session-mode{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:var(--knowledge-field);color:var(--knowledge-ink)}
    .knowledge-shared-session-mode svg{flex:none}
    .knowledge-shared-session-body>[data-research-canvas]{position:absolute;inset:0;height:auto}
    .knowledge-shared-session-body{flex:1;position:relative;min-height:0;min-width:0;overflow:hidden}
    .knowledge-shared-session-body>.en-root{position:absolute;inset:0;border-radius:0}
    .knowledge-shared-session-body>.ew-sheet{height:100%}
    .knowledge-shared-session-status{display:grid;place-items:center;height:100%;margin:0;padding:24px;text-align:center}
  `
  document.head.append(style)
  let cleanView: (() => void) | undefined
  let request = 0
  let current: { id: string; updatedAt: number } | undefined
  let checking = false

  function clear() {
    request++
    current = undefined
    cleanView?.()
    cleanView = undefined
    surface.replaceChildren()
  }
  function status(body: HTMLElement, text: string, error = false) {
    const message = document.createElement('p')
    message.className = 'knowledge-shared-session-status'
    message.role = error ? 'alert' : 'status'
    message.textContent = text
    body.replaceChildren(message)
  }
  function close() {
    if (host.current()?.surface === 'shared-session') host.back()
    else host.close('shared-session')
    clear()
  }
  const lifecycle = () => { if (host.current()?.surface !== 'shared-session' && surface.childElementCount) clear() }
  const appearance = new MutationObserver(() => {
    const notes = surface.querySelector<HTMLElement>('.en-root')
    if (notes) notes.dataset.dark = surface.dataset.dark
  })
  appearance.observe(surface, { attributes: true, attributeFilter: ['data-dark'] })

  async function open(event: Event) {
    const row = (event as CustomEvent<KnowledgeDocument>).detail
    const entry = row?.received && sharedKnowledgeSessionFile(row.name, row.source)
    if (!entry) return
    clear()
    const token = request
    const header = document.createElement('header')
    const headerRoot = createRoot(header)
    let copying = false
    let copied: KnowledgeSessionCopy | undefined
    let notice = ''
    const failureText = (error: unknown) =>
      (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
    const renderHeader = () => headerRoot.render(<>
      <button type="button" className="knowledge-square" aria-label="返回知识库" onClick={close}><KnowledgeIcon name="back" /></button>
      <strong title={entry.title}>{entry.title}</strong>
      <div className="knowledge-shared-session-actions">
        <button type="button" disabled={!current || copying} onClick={() => void createCopy()}>
          {copying ? '正在创建…' : copied ? '打开副本' : '创建副本'}
        </button>
        <span className="knowledge-shared-session-mode" title="共享会话仅供查看"
          aria-label={knowledgeSessionLabels[entry.mode] + '预览 · 只读'}><HeaderViewModeIcon preview />预览</span>
      </div>
      {notice && <p className="knowledge-session-copy-notice" role="status">{notice}</p>}
    </>)
    async function createCopy() {
      const source = current
      if (!source || copying || token !== request) return
      copying = true
      notice = ''
      renderHeader()
      try {
        const from = document.querySelector<HTMLElement>('.pI_x6G_centerCol [data-srb-session-header][data-ework-notes-session]')?.dataset.eworkNotesSession
        copied ??= await copy(source.id, source.updatedAt, from)
        // Session registration arrives on the resident client's catalog stream.
        for (let attempt = 0; attempt < 12 && token === request; attempt++) {
          if (await openKnowledgeSession(document, copied.id, copied.mode)) {
            if (token === request && host.current()?.surface === 'shared-session') host.revealConversation()
            return
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        notice = copied.named ? '副本已创建，可从左侧工作区打开。' : '副本已创建，可从左侧工作区打开并修改名称。'
      } catch (error) {
        notice = failureText(error)
      } finally {
        copying = false
        if (token === request && current) renderHeader()
      }
    }
    renderHeader()
    const body = document.createElement('div')
    body.className = 'knowledge-shared-session-body'
    surface.replaceChildren(header, body)
    cleanView = () => headerRoot.unmount()
    host.open('shared-session')
    status(body, '正在打开共享会话…')
    try {
      const result = await read(row.id)
      if (token !== request) return
      const { session } = result
      const scope = 'knowledge-view:' + crypto.randomUUID()
      body.replaceChildren()
      body.dataset.knowledgeSharedMode = session.mode
      let dispose: (() => void) | undefined
      if (session.mode === 'notes') {
        const note = document.createElement('div')
        note.className = 'en-root'
        note.dataset.dark = surface.dataset.dark
        const editor = document.createElement('div')
        editor.className = 'en-editor-host'
        note.append(editor)
        body.append(note)
        const root = createRoot(editor)
        const deny = async () => { throw Error('共享笔记仅供查看。') }
        root.render(<NotesApp sessionId={scope} sharedReadOnly dark={surface.dataset.dark === 'true'}
          active={false} bridge={{
            request: method => method === 'load' ? Promise.resolve({ saved: session.note }) : deny(),
            draft: deny
          }} navigate={() => {}} />)
        dispose = () => root.unmount()
      } else if (session.mode === 'spreadsheet') {
        dispose = mountSharedSpreadsheet(body, scope, session.workbook)
      } else {
        body.id = scope
        const mount = new CustomEvent('sherlock:knowledge-research-view', {
          cancelable: true, detail: { scope, canvas: session.canvas, layout: session.layout }
        })
        if (document.dispatchEvent(mount)) throw Error('研究模式暂时无法打开，请重试。')
        dispose = () => document.dispatchEvent(new CustomEvent('sherlock:knowledge-research-view-close', { detail: scope }))
      }
      cleanView = () => { dispose?.(); headerRoot.unmount() }
      current = { id: row.id, updatedAt: result.updatedAt }
      renderHeader()
    } catch (error) {
      if (token !== request) return
      status(body, failureText(error), true)
    }
  }

  async function revalidate() {
    const entry = current
    if (!entry || checking || document.hidden) return
    checking = true
    try {
      if (!await canRead(entry.id, entry.updatedAt) && current === entry) {
        current = undefined
        const body = surface.querySelector<HTMLElement>('.knowledge-shared-session-body')
        cleanView?.()
        cleanView = undefined
        if (body) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'knowledge-square'
          button.textContent = '返回知识库'
          button.onclick = close
          surface.querySelector('header')?.replaceChildren(button)
          status(body, '共享会话已更新或取消共享，请返回知识库重新打开。', true)
        }
      }
    } catch { /* A network failure cannot confirm revocation. */ }
    finally { checking = false }
  }

  document.addEventListener('sherlock:knowledge-open-shared-session', open)
  document.addEventListener('sherlock:workspace-surface-change', lifecycle)
  document.addEventListener('sherlock:knowledge-identity-changed', close)
  document.addEventListener('sherlock:knowledge-account-changed', close)
  document.defaultView?.addEventListener('focus', revalidate)
  const timer = setInterval(revalidate, 30000)
  return () => {
    document.removeEventListener('sherlock:knowledge-open-shared-session', open)
    document.removeEventListener('sherlock:workspace-surface-change', lifecycle)
    document.removeEventListener('sherlock:knowledge-identity-changed', close)
    document.removeEventListener('sherlock:knowledge-account-changed', close)
    document.defaultView?.removeEventListener('focus', revalidate)
    clearInterval(timer)
    appearance.disconnect()
    close()
    style.remove()
    surface.remove()
  }
}
