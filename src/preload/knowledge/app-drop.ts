import { fileEditorMode } from '../../shared/file-editor.mjs'
import { dropKnowledgeOnResearchCanvas, writableResearchCanvas } from '../research-knowledge-drop'
import { canOpenKnowledgeImage } from '../../shared/knowledge-library'
import { isKnowledgeDragSource, readKnowledgeDrag } from '../../shared/knowledge-drag'

type DropActions = {
  openPresentation(id: string, session: string | undefined, current: () => boolean): Promise<void>
  openImage(id: string, current: () => boolean): Promise<void>
}

function destination(doc: Document) {
  const floating = doc.body.dataset.workspaceSurface
  if (floating) {
    if (!['image-factory', 'browser'].includes(floating)) return
    const host = doc.querySelector<HTMLElement>(`body > [data-workspace-surface="${floating}"]:not([hidden])`)
    if (host) return { host, mode: floating }
  } else {
    const host = doc.querySelector<HTMLElement>('.pI_x6G_centerCol [data-odyssey-page]:not([data-odyssey-subagent-panel] *)')
    if (!host) return
    if (host.matches('[data-ework-turn-mode=image]') || host.querySelector('[data-mode-welcome=image-factory]')) return { host, mode: 'image-factory' }
    const mode = host.dataset.odysseyPage
    if (mode === 'research') {
      const canvas = host.matches(writableResearchCanvas) ? host : host.querySelector<HTMLElement>(writableResearchCanvas)
      if (canvas) return { host: canvas, mode: 'canvas' }
    }
    if (mode && ['presentation', 'spreadsheet', 'research', 'conversation', 'home'].includes(mode)) return { host, mode }
  }
}

/** The overlay receives drops over native webpages and nested editor frames as well as the document. */
export function mountKnowledgeAppDrop(doc: Document, actions: DropActions) {
  const win = doc.defaultView!
  let zone: HTMLElement | undefined
  let opening = false
  function clear() { zone?.remove(); zone = undefined }
  function start(event: DragEvent) {
    clear()
    const row = (event.target as Element | null)?.closest<HTMLElement>('[data-knowledge-file-id]')
    const file = readKnowledgeDrag(event.dataTransfer)
    const target = destination(doc)
    if (opening || !row || !file || !target || !isKnowledgeDragSource(row, file)) return
    const session = row.closest<HTMLElement>('[data-knowledge-panel-host]')?.dataset.knowledgePanelSession
    const current = () => {
      const active = destination(doc)
      return active?.host === target.host && active.mode === target.mode && isKnowledgeDragSource(row, file, session)
    }
    const editor = fileEditorMode(file.label)
    // These two native editors own their in-place import and read-only checks.
    if (target.mode === 'spreadsheet' && editor === 'spreadsheet' ||
        target.mode === 'presentation' && editor === 'presentation' && target.host.querySelector('[data-presentation-empty-ready=true]')) return
    const copyDeck = target.mode === 'presentation' && editor === 'presentation'
    const copyImage = target.mode === 'image-factory' && canOpenKnowledgeImage(file.label)
    const area = target.host.getBoundingClientRect()
    if (!area.width || !area.height) return
    const overlay = doc.createElement('div')
    overlay.className = 'knowledge-app-drop'
    overlay.dataset.knowledgeAppDrop = target.mode
    overlay.setAttribute('role', 'status')
    overlay.style.left = area.left + 'px'
    overlay.style.top = area.top + 'px'
    overlay.style.width = area.width + 'px'
    overlay.style.height = area.height + 'px'
    const cue = doc.createElement('span')
    cue.textContent = target.mode === 'canvas' ? '松开以添加到当前画布' : copyDeck ? '松开以打开演示文稿副本' : copyImage ? '松开以打开图像副本' : '松开以在当前对话引用文件'
    overlay.append(cue)
    zone = overlay
    doc.body.append(overlay)
    overlay.ondragover = over => {
      if (!over.dataTransfer) return
      over.preventDefault()
      over.dataTransfer.dropEffect = 'copy'
      overlay.dataset.over = ''
    }
    overlay.ondragleave = leave => { if (!overlay.contains(leave.relatedTarget as Node | null)) delete overlay.dataset.over }
    overlay.ondrop = drop => {
      drop.preventDefault()
      drop.stopPropagation()
      const received = readKnowledgeDrag(drop.dataTransfer)
      clear()
      if (!received || received.id !== file.id || received.label !== file.label || !current()) return
      if (target.mode === 'canvas' && dropKnowledgeOnResearchCanvas(target.host, file, { x: drop.clientX, y: drop.clientY })) return
      if (!copyDeck && !copyImage) {
        row.querySelector<HTMLButtonElement>('.knowledge-panel-action button')?.click()
        return
      }
      opening = true
      const operation = copyDeck ? actions.openPresentation(file.id, session, current) : actions.openImage(file.id, current)
      void operation.catch(error => {
        if (current()) row.dispatchEvent(new win.CustomEvent('sherlock:knowledge-drop-error', { bubbles: true,
          detail: error instanceof Error ? error.message : String(error) }))
      }).finally(() => { opening = false })
    }
  }
  doc.addEventListener('dragstart', start)
  doc.addEventListener('dragend', clear, true)
  doc.addEventListener('drop', clear)
  win.addEventListener('resize', clear)
  return () => {
    clear()
    doc.removeEventListener('dragstart', start)
    doc.removeEventListener('dragend', clear, true)
    doc.removeEventListener('drop', clear)
    win.removeEventListener('resize', clear)
  }
}
