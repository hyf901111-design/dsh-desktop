import {fileEditorMode} from '../../shared/file-editor.mjs'
import {isKnowledgeDragSource, KNOWLEDGE_FILE_DRAG_TYPE, readKnowledgeDrag, type KnowledgeDragFile} from '../../shared/knowledge-drag'

export function mountSpreadsheetKnowledgeDrop(root: HTMLElement, sessionId: string, open: (file: KnowledgeDragFile) => void) {
  const doc = root.ownerDocument
  let source: { row: Element; file: KnowledgeDragFile } | undefined
  const end = () => {
    source = undefined
    delete root.dataset.knowledgeDropOver
  }
  // Chromium only exposes the payload on dragstart and drop. Keep the row
  // identity so dragover can accept a workbook without handling other files.
  const start = (event: DragEvent) => {
    end()
    const row = (event.target as Element | null)?.closest('[draggable=true][data-knowledge-file-id]')
    const file = readKnowledgeDrag(event.dataTransfer)
    if (row && file && fileEditorMode(file.label) === 'spreadsheet' && isKnowledgeDragSource(row, file, sessionId))
      source = { row, file }
  }
  const over = (event: DragEvent) => {
    if (!source || !event.dataTransfer?.types.includes(KNOWLEDGE_FILE_DRAG_TYPE) ||
        !isKnowledgeDragSource(source.row, source.file, sessionId)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    root.dataset.knowledgeDropOver = 'true'
  }
  const leave = (event: DragEvent) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) delete root.dataset.knowledgeDropOver
  }
  const drop = (event: DragEvent) => {
    const drag = source
    end()
    const file = readKnowledgeDrag(event.dataTransfer)
    if (!drag || !file || file.id !== drag.file.id || file.label !== drag.file.label ||
        !isKnowledgeDragSource(drag.row, file, sessionId)) return
    event.preventDefault()
    event.stopPropagation()
    open(file)
  }
  doc.addEventListener('dragstart', start)
  doc.addEventListener('dragend', end, true)
  doc.addEventListener('drop', end)
  root.addEventListener('dragover', over, true)
  root.addEventListener('dragleave', leave)
  root.addEventListener('drop', drop, true)
  return () => {
    end()
    doc.removeEventListener('dragstart', start)
    doc.removeEventListener('dragend', end, true)
    doc.removeEventListener('drop', end)
    root.removeEventListener('dragover', over, true)
    root.removeEventListener('dragleave', leave)
    root.removeEventListener('drop', drop, true)
  }
}
