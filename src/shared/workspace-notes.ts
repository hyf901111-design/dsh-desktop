export type NoteContent = { title: string; blocks: any[]; yjs: string }
export type SavedNote = NoteContent & { revision: number; updatedAt: number }
export type DraftNote = NoteContent & { baseRevision: number; updatedAt: number; clientId: string }
export type NoteLoad = { saved: SavedNote; draft?: DraftNote }
export type NoteSave = { status: 'saved'; saved: SavedNote } | { status: 'conflict'; saved: SavedNote }
export const noteText = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : noteText(item?.text ?? item?.content)).join('') : ''
export function noteOutline(blocks: any[]): Array<{ id: string; level: number; text: string }> {
  const result: Array<{ id: string; level: number; text: string }> = []
  const visit = (items: any[], depth: number) => {
    if (depth > 32) return
    for (const block of items) {
      if (block?.type === 'heading' && typeof block.id === 'string') result.push({ id: block.id, level: Math.min(4, Math.max(1, Number(block.props?.level) || 1)), text: noteText(block.content) || '未命名标题' })
      if (Array.isArray(block?.children)) visit(block.children, depth + 1)
    }
  }
  visit(blocks, 0)
  return result
}
export function canApplySuggestion(captured: { documentId: string; fingerprint: string }, current: { documentId: string; fingerprint: string }): boolean {
  return captured.documentId === current.documentId && captured.fingerprint === current.fingerprint
}
export type NoteAiResult = { kind: 'text'; markdown: string } | { kind: 'component'; node: Record<string, any> }
export type NotesBridge = {
  request(method: string, input: any): Promise<any>
  draft(input: { sessionId: string; clientId: string; revision: number; content: NoteContent }): Promise<void>
}
