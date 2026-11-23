export const KNOWLEDGE_FILE_DRAG_TYPE = 'application/x-ework-knowledge-file'
export type KnowledgeDragFile = { id: string; label: string }

export function isKnowledgeFileId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iu.test(value)
}

export function readKnowledgeDrag(transfer: DataTransfer | null): KnowledgeDragFile | undefined {
  if (!transfer?.types.includes(KNOWLEDGE_FILE_DRAG_TYPE)) return
  try {
    const file = JSON.parse(transfer.getData(KNOWLEDGE_FILE_DRAG_TYPE))
    if (isKnowledgeFileId(file?.id) && typeof file.label === 'string' && file.label.trim() && file.label.length <= 512)
      return { id: file.id, label: file.label }
  } catch { /* A drag in protected mode has no readable payload. */ }
}

export function isKnowledgeDragSource(row: Element | null, file: KnowledgeDragFile, sessionId?: string): boolean {
  if (!row?.isConnected || !row.matches('[draggable=true][data-knowledge-file-id]') ||
      row.getAttribute('data-knowledge-file-id') !== file.id) return false
  const host = row.closest<HTMLElement>('#odyssey-right-workspace-panel [data-knowledge-panel-host]')
  const name = row.querySelector<HTMLElement>('.knowledge-panel-name span[title]')?.title
  return !!host && (!sessionId || !host.dataset.knowledgePanelSession || host.dataset.knowledgePanelSession === sessionId) &&
    (!name || name === file.label)
}
