import type { IpcRenderer } from 'electron'
import { mountPresentationKnowledgeDrop } from './knowledge-drop'
import { parsePresentationFile } from './import-file'
import { presentationHeader } from './header'
import { openPresentationArchiveDialog } from './archive-dialog'
import { setWorkspaceSidebars, type WorkspaceSidebars } from '../workspace-sidebars'
import styles from './view.css?raw'
import icon from '../../../build/brand/odyssey-app-presentation.svg?raw'
import { markWorkspaceProjectEdited } from '../workspace-project-lock'

const origin = 'odyssey-presentation://editor'
type Editor = {
  frame: HTMLIFrameElement
  host: HTMLElement
  sessionId: string
  ready: boolean
  generation?: string
  owner?: string
  documentId: string | null
  slideId?: string
  revision: number
  locked: boolean
  editable: boolean
  queue: Promise<void>
  disposeDrop?: () => void
  beforeFocus?: WorkspaceSidebars
  failure?: string
}
function restoreSidebars(doc: Document, editor: Editor) {
  if (!editor.beforeFocus) return
  setWorkspaceSidebars(doc, editor.beforeFocus)
  editor.beforeFocus = undefined
}

export function mountPresentation(doc: Document, ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>) {
  const win = doc.defaultView!
  const style = doc.createElement('style')
  style.textContent =
    ':root{--ew-presentation-icon:url("data:image/svg+xml,' + encodeURIComponent(icon) + '")}\n' + styles
  doc.head.append(style)
  let current: Editor | undefined,
    disposed = false
  const dark = () => doc.body.hasAttribute('data-ds-dark-theme') || doc.documentElement.dataset.theme === 'dark'
  const post = (e: Editor, type: string, data: Record<string, unknown> = {}) =>
    e.frame.contentWindow?.postMessage({ channel: 'odyssey-presentation', type, ...data }, origin)
  const request = (e: Editor, method: string, data: Record<string, unknown> = {}) =>
    ipc.invoke('presentation:request', method, { ...data, sessionId: e.sessionId, generation: e.generation })
  const publishSelection = (e: Editor, reference?: Record<string, unknown>) =>
    win.dispatchEvent(
      new CustomEvent('sherlock:presentation-selection', {
        detail: { ...reference, sessionId: e.sessionId, documentId: e.documentId }
      })
    )
  let switching = false
  let lastReplyTarget = ''
  const paintHeader = () => {
    const e = current,
      node =
        e?.host
          .closest('[data-odyssey-page=presentation]')
          ?.querySelector<HTMLElement>('[data-ework-presentation-actions]') ?? null
    const replyStatus = !e?.documentId || !e.ready ? 'empty' : !e.editable || e.locked || switching || e.failure ? 'readonly' : 'editable'
    const target = e ? e.sessionId + ':' + replyStatus : ''
    if (lastReplyTarget !== target) {
      lastReplyTarget = target
      if (e) doc.body.dataset.eworkPresentationReply = replyStatus
      else delete doc.body.dataset.eworkPresentationReply
      doc.dispatchEvent(new CustomEvent('sherlock:presentation-reply-target'))
    }
    header.paint(node, {
      hasDeck: !!e?.documentId,
      writable: !!e?.editable,
      locked: !!e?.locked,
      busy: switching || !e?.ready
    })
  }
  let closeArchive: (() => void) | undefined
  function openArchive() {
    const editor = current
    if (!editor?.ready || !editor.documentId || doc.querySelector('.presentation-archive-dialog[open]')) return
    const documentId = editor.documentId
    const sessionTitle = editor.host.closest('[data-odyssey-page=presentation]')?.querySelector<HTMLElement>('[title="双击修改会话标题"]')?.textContent?.trim() ||
      doc.title.replace(/\s*[—–-]\s*EWork Odyssey.*$/iu, '').trim() || '新演示'
    closeArchive = openPresentationArchiveDialog(doc, sessionTitle, async (name, format) => {
      await flushEditor(editor)
      if (current !== editor || editor.documentId !== documentId) throw Error('文稿已切换，请重新保存。')
      const saved = await request(editor, 'archive', { name, format, sessionTitle, documentId, revision: editor.revision })
      if (current === editor) post(editor, 'status', { message: (saved.updated ? '已更新知识库文件 · ' : '已保存至知识库 · ') + saved.name })
    })
  }
  const header = presentationHeader(doc, {
    archive: openArchive,
    async toggle() {
      const e = current
      if (!e?.ready || !e.editable || switching) return
      switching = true
      paintHeader()
      try {
        await flushEditor(e, !e.locked)
        const locked = await request(e, 'lock', { locked: !e.locked })
        if (current !== e) return
        e.locked = locked
        post(e, 'edit-mode', { editable: e.editable && !locked })
      } catch (err) {
        if (current === e) {
          post(e, 'edit-mode', {editable: e.editable && !e.locked})
          post(e, 'error', { message: String(err) })
        }
      } finally {
        switching = false
        paintHeader()
      }
    },
    async import(file) {
      const e = current
      if (!e?.ready || !e.editable || e.locked) return
      if (file.size > 64 * 1024 * 1024) {
        post(e, 'status', { message: '文件超过 64 MB。' })
        return
      }
      try {
        const bytes = await file.arrayBuffer()
        if (current === e && !e.locked) post(e, 'header-import', { bytes, title: file.name })
      } catch {
        if (current === e) post(e, 'status', { message: '文件读取失败。' })
      }
    },
    export() {
      if (current?.documentId) post(current, 'header-export')
    }
  })
  const hydrate = (e: Editor, record: any, recent?: unknown) => {
    e.revision = record.revision
    delete e.host.dataset.presentationDisplayedDocument
    e.documentId = record.deck?.id ?? null
    e.failure = undefined
    e.host.dataset.presentationEmptyReady = String(e.ready && !e.documentId && !e.host.hasAttribute('data-presentation-frame-pending'))
    paintHeader()
    if (!e.documentId) restoreSidebars(doc, e)
    post(e, 'load', { record, recent, dark: dark(), editable: e.editable && !e.locked, slideId: e.slideId, focused: !!e.beforeFocus })
  }
  function markSaved(e: Editor) {
    markWorkspaceProjectEdited(doc, e.sessionId)
    doc.dispatchEvent(new CustomEvent('sherlock:presentation-saved', { detail: { sessionId: e.sessionId } }))
  }
  async function load(e: Editor) {
    for (let i = 0; i < 45 && current === e; i++) {
      try {
        const state = await request(e, 'load')
        if (current !== e) return
        e.generation = state.generation
        e.owner = state.owner
        e.editable = state.editable
        e.locked = !!state.locked
        e.slideId = state.slideId
        e.ready = true
        hydrate(e, state.record, state.recent)
        return
      } catch (err) {
        if (i === 44) {
          post(e, 'theme', {dark: dark()})
          post(e, 'error', { message: String(err) })
          return
        }
        await new Promise((resolve) => win.setTimeout(resolve, 80))
      }
    }
  }
  const barriers = new Map<string, (error?: string) => void>()
  async function editorCommand(e: Editor, type: string, data: Record<string, unknown>) {
    if (!e.ready) throw Error('演示尚未就绪。')
    const id = win.crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const timer = win.setTimeout(() => {
        barriers.delete(id)
        reject(Error('演示编辑器尚未完成保存。'))
      }, 5000)
      barriers.set(id, (error) => {
        win.clearTimeout(timer)
        barriers.delete(id)
        if (error) reject(Error(error))
        else resolve()
      })
      post(e, type, { id, ...data })
    })
    await e.queue
    if (current !== e || e.failure) throw Error(e.failure || '演示页签已切换。')
  }
  const flushEditor = (e: Editor, locking = false) => editorCommand(e, 'flush', {locking})
  const reset = () => {
    if (current) {
      publishSelection(current)
      closeArchive?.()
      closeArchive = undefined
      restoreSidebars(doc, current)
      current.disposeDrop?.()
      delete current.host.dataset.presentationDisplayedDocument
      delete current.host.dataset.presentationFramePending
      delete current.host.dataset.presentationEmptyReady
      current.frame.remove()
    }
    current = undefined
    delete doc.body.dataset.eworkPresentationSession
    paintHeader()
  }
  const sync = () => {
    if (disposed) return
    const host = doc.querySelector<HTMLElement>(
      '.pI_x6G_centerCol [data-odyssey-page=presentation] [data-ework-presentation-view]:not([data-odyssey-subagent-panel] *)'
    )
    if (current && current.host === host) {
      paintHeader()
      return
    }
    reset()
    if (!host?.dataset.eworkPresentationView) return
    const frame = doc.createElement('iframe')
    host.dataset.presentationFramePending = 'true'
    frame.title = '演示文稿编辑器'
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads')
    frame.allow = 'fullscreen'
    frame.src = origin + '/index.html?host=' + encodeURIComponent(win.location.origin)
    current = {
      frame,
      host,
      sessionId: host.dataset.eworkPresentationView,
      ready: false,
      locked: false,
      editable: false,
      documentId: null,
      revision: 0,
      queue: Promise.resolve()
    }
    doc.body.dataset.eworkPresentationSession = current.sessionId
    paintHeader()
    host.append(frame)
    const e = current
    e.disposeDrop = mountPresentationKnowledgeDrop(host, {
      empty: () => current === e && e.ready && !e.documentId,
      writable: () => e.editable && !e.locked && !switching,
      status: message => post(e, 'status', { message }),
      async importFile(file, signal) {
        const revision = e.revision
        const check = () => {
          signal.throwIfAborted()
          if (current !== e || !host.isConnected || e.revision !== revision || e.documentId)
            throw Error('演示页签或文稿已变化，请重新拖入。')
          if (!e.editable || e.locked || switching) throw Error('当前演示文稿只读。')
        }
        check()
        frame.inert = true
        try {
          await flushEditor(e)
          check()
          const { bytes, name } = await ipc.invoke('knowledge:request', 'presentation-drop-file', file)
          check()
          const deck = await parsePresentationFile(doc, bytes, name, signal)
          check()
          const slideId = deck.slides[0]?.id
          const saved = await request(e, 'save', { revision, deck, create: true, slideId })
          if (current !== e || !host.isConnected) throw Error('演示页签已切换。')
          e.slideId = slideId
          hydrate(e, { revision: saved, deck })
          markSaved(e)
        } finally { frame.inert = false }
      }
    })
  }
  const dismissEditorMenus = () => {
    if (current?.ready) post(current, 'dismiss-menus')
  }
  doc.addEventListener('pointerdown', dismissEditorMenus, true)
  const onMessage = (event: MessageEvent) => {
    const e = current,
      d = event.data
    if (
      !e ||
      event.source !== e.frame.contentWindow ||
      event.origin !== origin ||
      d?.channel !== 'odyssey-presentation'
    )
      return
    if (d.type === 'pointerdown') {
      doc.dispatchEvent(new Event('sherlock:workspace-pointerdown'))
      return
    }
    if (d.type === 'ready') {
      void load(e)
      return
    }
    if (d.type === 'painted' && (d.documentId || null) === e.documentId) {
      delete e.host.dataset.presentationFramePending
      e.host.dataset.presentationEmptyReady = String(e.ready && !e.documentId)
      return
    }
    if (!e.ready) return
    if (d.type === 'open-archive') { openArchive(); return }
    if (d.type === 'workspace-focus') {
      if (typeof d.active !== 'boolean') return
      if (d.active && !e.beforeFocus) e.beforeFocus = setWorkspaceSidebars(doc, { left: false, right: false })
      if (!d.active) restoreSidebars(doc, e)
      post(e, 'workspace-focus', { active: !!e.beforeFocus })
      return
    }
    if (d.type === 'flushed') {
      barriers.get(d.id)?.(d.error)
      return
    }
    if (d.type === 'selection') {
      publishSelection(e, d.reference)
      return
    }
    if (d.type === 'import-error') {
      void request(e, 'import-error', { importId: d.importId }).catch(() => {})
      return
    }
    if (d.type === 'position') {
      if (d.documentId === e.documentId && d.slideId) e.host.dataset.presentationDisplayedDocument = d.documentId
      e.slideId = d.slideId
      void request(e, 'position', { documentId: d.documentId, slideId: d.slideId }).catch(() => {})
      return
    }
    e.queue = e.queue
      .then(async () => {
        if (d.type === 'save') {
          if (e.failure) throw Error(e.failure)
          if (d.revision !== e.revision) throw Error('文稿已更新，请导出当前编辑稿或重新载入。')
          e.revision = await request(e, 'save', {
            revision: d.revision,
            deck: d.deck,
            create: d.create,
            importId: d.importId,
            slideId: d.slideId
          })
          e.documentId = d.deck.id
          e.host.dataset.presentationEmptyReady = 'false'
          paintHeader()
          markSaved(e)
          post(e, 'saved', { revision: e.revision })
        } else if (d.type === 'open') {
          const record = await request(e, 'open', { revision: e.revision, id: d.id })
          hydrate(e, record)
        } else if (d.type === 'export') {
          const saved = await request(e, 'export', {
            bytes: new Uint8Array(d.bytes),
            title: d.title,
            format: d.format
          })
          post(e, 'status', { message: saved ? '已导出' : '已取消导出' })
        } else if (d.type === 'undo') await request(e, 'undo', { revision: e.revision })
        else if (d.type === 'reload') await load(e)
      })
      .catch((error) => {
        const message = String(error instanceof Error ? error.message : error).replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          ''
        )
        if (d.type === 'save') { e.failure = message; paintHeader() }
        post(e, 'error', { message, conflict: d.type === 'save' })
      })
  }
  const submittedMarks = (event: Event) => {
    const e = current, detail = (event as CustomEvent).detail
    if (e?.ready && detail?.sessionId === e.sessionId && detail.documentId === e.documentId)
      post(e, 'submitted-marks', { documentId: e.documentId, ids: detail.ids })
  }
  win.addEventListener('sherlock:presentation-marks-submitted', submittedMarks)
  const committedMarks = (event: Event) => {
    const e = current,
      d = (event as CustomEvent).detail
    if (e?.ready && d?.sessionId === e.sessionId) post(e, 'referenced-marks', { ids: d.ids })
  }
  win.addEventListener('sherlock:presentation-referenced-marks', committedMarks)
  const openFile = (_event: unknown, value: any) => {
    const e = current
    if (
      !e?.ready ||
      e.owner !== value.owner ||
      e.sessionId !== value.sessionId ||
      e.generation !== value.generation
    )
      return
    post(e, 'import', {
      bytes: value.bytes,
      title: value.title,
      revision: value.revision,
      importId: value.importId
    })
  }
  const changed = (_event: unknown, value: any) => {
    const e = current
    if (e?.ready && e.owner === value.owner && e.sessionId === value.sessionId) {
      // A conflict keeps the unsaved editor available for exporting or recovery.
      e.queue = e.queue.then(() => {
        if (current === e && !e.failure && value.record.revision > e.revision) {
          publishSelection(e)
          hydrate(e, value.record)
          markSaved(e)
        }
      })
    }
  }
  const observer = new win.MutationObserver(sync)
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-odyssey-page', 'data-ework-presentation-view']
  })
  const theme = new win.MutationObserver(() => {
    if (current?.ready) post(current, 'theme', { dark: dark() })
  })
  theme.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  ipc.on('presentation:import', openFile)
  ipc.on('presentation:changed', changed)
  win.addEventListener('message', onMessage)
  sync()
  return {
    reset: () => {
      reset()
      sync()
    },
    async flush(sessionId: string) {
      const e = current
      if (!e?.ready || e.sessionId !== sessionId) return
      await flushEditor(e)
    },
    async insertReply(sessionId: string, text: string) {
      const e = current
      if (!e?.ready || e.sessionId !== sessionId || !e.documentId || !e.slideId || e.failure)
        throw Error('请先打开可编辑的演示文稿。')
      if (e.locked || !e.editable || switching) throw Error('请先解锁演示文稿。')
      if (typeof text !== 'string' || !text.trim()) throw Error('这条回复没有可插入的文字。')
      await editorCommand(e, 'insert-reply', { documentId: e.documentId, slideId: e.slideId, text })
    },
    async admit(sessionId: string, prompt: string, references: unknown, useSlide = true) {
      const e = current
      if (!e?.ready || e.sessionId !== sessionId) throw Error('演示尚未就绪。')
      await flushEditor(e)
      if (current !== e) throw Error('演示页签已切换。')
      return request(e, 'admit', {
        documentId: e.documentId,
        slideId: e.slideId,
        prompt,
        references,
        useSlide
      })
    },
    dispose() {
      disposed = true
      doc.removeEventListener('pointerdown', dismissEditorMenus, true)
      observer.disconnect()
      theme.disconnect()
      win.removeEventListener('sherlock:presentation-referenced-marks', committedMarks)
      win.removeEventListener('sherlock:presentation-marks-submitted', submittedMarks)
      ipc.removeListener('presentation:import', openFile)
      ipc.removeListener('presentation:changed', changed)
      win.removeEventListener('message', onMessage)
      reset()
      header.dispose()
      style.remove()
    }
  }
}
