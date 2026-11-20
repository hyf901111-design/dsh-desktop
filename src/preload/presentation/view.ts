import type { IpcRenderer } from 'electron'
import { presentationHeader } from './header'
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
  failure?: string
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
  const paintHeader = () => {
    const e = current,
      node =
        e?.host
          .closest('[data-odyssey-page=presentation]')
          ?.querySelector<HTMLElement>('[data-ework-presentation-actions]') ?? null
    header.paint(node, {
      hasDeck: !!e?.documentId,
      writable: !!e?.editable,
      locked: !!e?.locked,
      busy: switching || !e?.ready
    })
  }
  const header = presentationHeader(doc, {
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
    e.documentId = record.deck?.id ?? null
    e.failure = undefined
    paintHeader()
    post(e, 'load', { record, recent, dark: dark(), editable: e.editable && !e.locked, slideId: e.slideId })
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
          post(e, 'error', { message: String(err) })
          return
        }
        await new Promise((resolve) => win.setTimeout(resolve, 80))
      }
    }
  }
  const barriers = new Map<string, (error?: string) => void>()
  async function flushEditor(e: Editor, locking = false) {
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
      post(e, 'flush', { id, locking })
    })
    await e.queue
    if (current !== e || e.failure) throw Error(e.failure || '演示页签已切换。')
  }
  const reset = () => {
    if (current) {
      publishSelection(current)
      current.frame.remove()
    }
    current = undefined
    paintHeader()
    delete doc.body.dataset.eworkPresentationSession
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
    host.append(frame)
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
    if (!e.ready) return
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
        if (d.type === 'save') e.failure = message
        post(e, 'error', { message, conflict: d.type === 'save' })
      })
  }
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
      ipc.removeListener('presentation:import', openFile)
      ipc.removeListener('presentation:changed', changed)
      win.removeEventListener('message', onMessage)
      reset()
      header.dispose()
      style.remove()
    }
  }
}
