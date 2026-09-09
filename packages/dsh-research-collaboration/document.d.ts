import type * as Y from 'yjs'
export type CanvasNode = { id: string; [field: string]: unknown }
export type Canvas = { files: CanvasNode[]; artifacts: CanvasNode[] }
export type HistoryRecord = {
  id: string
  role: 'user' | 'assistant'
  text: string
  references?: Array<{
    collection: string
    nodeId: string
    [key: string]: unknown
  }>
  authorName?: string
  createdAt?: number
}
export type Snapshot = { canvas: Canvas; history: HistoryRecord[] }
export function createDocument(canvas?: Canvas): Y.Doc
export function encodeDocument(doc: Y.Doc): Uint8Array
export function decodeDocument(bytes: Uint8Array): Y.Doc
export function projectDocument(doc: Y.Doc): Canvas
export function applyCanvasDiff(
  doc: Y.Doc,
  before: Canvas,
  after: Canvas
): Uint8Array
export function freezeSnapshot(input: {
  canvas: Canvas
  history?: HistoryRecord[]
  [field: string]: unknown
}): Readonly<Snapshot>
export function mergeDocumentUpdate(
  doc: Y.Doc,
  bytes: Uint8Array,
  tombstones?: Set<string>
): Uint8Array
export function validateCanvas(canvas: Canvas): void
