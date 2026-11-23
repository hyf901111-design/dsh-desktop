import type { KnowledgeDragFile } from '../shared/knowledge-drag'

export const writableResearchCanvas = '[data-research-canvas][data-research-preview-mode="edit"]:not([data-shared-readonly])'

const tickets = new Map<string, { canvas: HTMLElement; sessionId: string; fileId: string }>()

/** The validated panel drop uses the canvas's normal hit position, queue and durable file cards. */
export function dropKnowledgeOnResearchCanvas(canvas: HTMLElement, file: KnowledgeDragFile, point: { x: number; y: number }) {
  const win = canvas.ownerDocument.defaultView
  const sessionId = canvas.dataset.researchPreviewSession
  if (!win || !sessionId || !canvas.isConnected || !canvas.matches(writableResearchCanvas)) return false
  const ticket = win.crypto.randomUUID()
  const transfer = new win.DataTransfer()
  transfer.setData('application/x-sherlock-file', JSON.stringify({ name: file.label, knowledgeTicket: ticket }))
  tickets.set(ticket, { canvas, sessionId, fileId: file.id })
  const accepted = !canvas.dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true,
    clientX: point.x, clientY: point.y, dataTransfer: transfer }))
  if (!accepted) tickets.delete(ticket)
  else win.setTimeout(() => tickets.delete(ticket), 60_000)
  return accepted
}

export function takeResearchKnowledgeFile(ticket: string, sessionId: string) {
  const entry = tickets.get(ticket)
  tickets.delete(ticket)
  if (!entry || sessionId !== entry.sessionId || !entry.canvas.isConnected ||
      entry.canvas.dataset.researchPreviewSession !== sessionId || !entry.canvas.matches(writableResearchCanvas)) throw Error('画布或文件已切换，请重新拖入。')
  return entry.fileId
}
