import type { IpcRenderer } from 'electron'
import { openHomePresentationReference } from '../../../scripts/lib/home-guide-presentation-native.mjs'

const format = 'application/x-ework-knowledge-file'
const completed = new WeakMap<DragEvent, { done: Promise<void>; cancel(): void }>()
type KnowledgeFile = { id: string; label: string }
type Controls = { waitFor(read: () => boolean, message: string): Promise<void>; cue(node: HTMLElement, label: string): Promise<void> }
const invalid = '请从右侧知识库拖入 .pptx 文件。'

function readFile(transfer: DataTransfer | null): KnowledgeFile {
  let file: KnowledgeFile | undefined
  try { file = JSON.parse(transfer?.getData(format) ?? '') } catch { /* Not a knowledge file. */ }
  if (!file || typeof file.id !== 'string' || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iu.test(file.id) ||
      typeof file.label !== 'string' || !/\.pptx$/iu.test(file.label)) throw Error(invalid)
  return file
}

/** The top document owns the knowledge rows; a drop surface covers the cross-origin editor only during their drag. */
export function mountPresentationKnowledgeDrop(host: HTMLElement, options: {
  empty(): boolean
  writable(): boolean
  importFile(file: KnowledgeFile, signal: AbortSignal): Promise<void>
  status(message: string): void
}) {
  const doc = host.ownerDocument
  const zone = doc.createElement('div')
  zone.dataset.presentationKnowledgeDrop = ''
  zone.className = 'presentation-knowledge-drop'
  zone.hidden = true
  zone.setAttribute('role', 'status')
  zone.setAttribute('aria-live', 'polite')
  host.append(zone)
  let drag: { row: HTMLElement; id: string } | undefined
  let importing: AbortController | undefined
  const end = () => {
    if (drag) delete drag.row.dataset.presentationDragging
    drag = undefined
    if (!importing) zone.hidden = true
    delete zone.dataset.over
  }
  const start = (event: DragEvent) => {
    end()
    const row = (event.target as Element | null)?.closest<HTMLElement>('#odyssey-right-workspace-panel [data-knowledge-panel-host] [draggable=true][data-knowledge-file-id]')
    if (importing || !options.empty() || !row?.dataset.knowledgeFileId || !event.dataTransfer?.types.includes(format)) return
    drag = { row, id: row.dataset.knowledgeFileId }
    row.dataset.presentationDragging = 'true'
    let hint = '松开以导入 PowerPoint 副本'
    try { readFile(event.dataTransfer) } catch { hint = invalid }
    zone.textContent = options.writable() ? hint : '当前演示文稿只读。'
    zone.hidden = false
  }
  zone.ondragover = event => {
    if (!drag || !event.dataTransfer?.types.includes(format)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    zone.dataset.over = 'true'
  }
  zone.ondragleave = () => { delete zone.dataset.over }
  zone.ondrop = event => {
    if (!drag || importing || !event.dataTransfer?.types.includes(format)) return
    event.preventDefault()
    event.stopPropagation()
    const source = drag
    const controller = new AbortController()
    importing = controller
    end()
    const done = (async () => {
      const file = readFile(event.dataTransfer)
      if (file.id !== source.id || !source.row.isConnected || !host.isConnected || !options.empty())
        throw Error('知识库文件或演示页签已切换，请重新拖入。')
      if (!options.writable()) throw Error('当前演示文稿只读。')
      zone.textContent = '正在导入 ' + file.label
      await options.importFile(file, controller.signal)
    })().finally(() => {
      if (importing === controller) { importing = undefined; end() }
    })
    completed.set(event, { done, cancel: () => controller.abort() })
    void done.catch(error => {
      if (!controller.signal.aborted)
        options.status(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, ''))
    })
  }
  doc.addEventListener('dragstart', start)
  doc.addEventListener('dragend', end, true)
  doc.addEventListener('drop', end)
  return () => {
    importing?.abort()
    doc.removeEventListener('dragstart', start)
    doc.removeEventListener('dragend', end, true)
    doc.removeEventListener('drop', end)
    zone.remove()
  }
}

/** Exercise the same row and drop handler that accept a user's drag. */
export async function preparePresentationGuideDrop(doc: Document, sessionId: string, ipc: Pick<IpcRenderer, 'invoke'>, controls: Controls) {
  const win = doc.defaultView!
  const host = Array.from(doc.querySelectorAll<HTMLElement>('.pI_x6G_centerCol [data-ework-presentation-view]')).find(
    node => node.dataset.eworkPresentationView === sessionId && !node.closest('[data-odyssey-subagent-panel]'))
  if (!host) throw Error('请回到当前会话的演示页签。')
  const { fileId } = await ipc.invoke('knowledge:presentation-guide-source', 'delivered-pptx') as { fileId: string }
  if (!host.isConnected || doc.body.dataset.eworkPresentationSession !== sessionId) throw Error('演示页签已切换。')
  host.dataset.eworkPresentationGuideFile = fileId
  let row: HTMLElement | undefined
  let transfer: DataTransfer | undefined
  let cancelDrop: (() => void) | undefined
  const send = (node: HTMLElement, type: string, payload: DataTransfer) => {
    const event = new win.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: payload })
    node.dispatchEvent(event)
    return event
  }
  const dispose = () => {
    cancelDrop?.()
    if (row && transfer) send(row, 'dragend', transfer)
    transfer = undefined
    if (host.dataset.eworkPresentationGuideFile === fileId) delete host.dataset.eworkPresentationGuideFile
  }
  try {
    const result = await openHomePresentationReference(doc, fileId, controls)
    const source = result.file
    row = source
    await controls.waitFor(() => host.dataset.presentationEmptyReady === 'true', '演示空白页尚未就绪。')
    const target = host.querySelector<HTMLElement>('[data-presentation-knowledge-drop]')!
    return {
      row: source, target, dispose,
      begin() {
        if (!host.isConnected || result.row() !== source || !target?.isConnected) throw Error('演示示例的来源文件或页签已变化。')
        transfer = new win.DataTransfer()
        send(source, 'dragstart', transfer)
        if (target.hidden || readFile(transfer).id !== fileId) throw Error('未能从知识库拖出示例演示文稿。')
        return transfer
      },
      async drop(payload: DataTransfer) {
        if (payload !== transfer || !source.isConnected || !target.isConnected || target.hidden)
          throw Error('演示页签已变化，请重试。')
        send(target, 'dragover', payload)
        const accepted = completed.get(send(target, 'drop', payload))
        if (!accepted) throw Error('演示空白页未接收文件。')
        cancelDrop = accepted.cancel
        try {
          await accepted.done
          await controls.waitFor(() => host.isConnected && !!host.dataset.presentationDisplayedDocument, '文稿已导入，编辑画布尚未就绪。')
        } finally { cancelDrop = undefined; dispose() }
      }
    }
  } catch (error) { dispose(); throw error }
}
