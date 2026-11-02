import type {CapabilityReceipt} from '../../packages/dsh-research-task-runtime/client-capabilities.js'
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
type NoteCapabilityResult = {capabilitySummary?:string;capabilityReceipts?:CapabilityReceipt[]}
export type NoteInlineOrder='before-components'|'after-components'
export type NoteDocumentResult = ({ kind: 'text'; markdown: string;inlineOrder?:NoteInlineOrder;textFallback?:true } | { kind: 'component'; node: Record<string, any>;targetBlockId?:string;sourceResult?:{status:'verified';refreshStatus:'unbound';recipe:any;sourceNames?:string[]} }) & NoteCapabilityResult
export type NoteAiResult = NoteDocumentResult | ({ kind: 'conversation'; markdown: string;requiresReply?:boolean;notice?:'read-only-incomplete' } & NoteCapabilityResult)
export type NoteInsertionAnchor = {documentId:string;blockId:string;position:Record<string,any>}

/** Electron's Notes transport wrapper is diagnostic detail, not a user error. */
export function noteGenerationError(error:unknown):string {
  const message=typeof error==='string'?error:typeof (error as Error)?.message==='string'?(error as Error).message:String(error??'')
  return message.replace(/^Error invoking remote method (['"])notes:request\1:\s*(?:Error:\s*)?/u,'')
}

/** Only an affirmative creation clause reserves a component in the document. */
export function noteComponentRequest(prompt:string):boolean {
  return prompt.split(/[，,。；;\n]/u).some(clause=>
    !/(?:不要|不用|不必|不需要|无需|无须|别|不).{0,10}(?:创建|生成|制作|做|画|添加)/u.test(clause)&&
    /(?:创建|生成|制作|做|画|添加).*(?:组件|图表|表格|时间线|新闻)/u.test(clause))
}
export type NotesBridge = {
  filePath?(file:File):string
  request(method: string, input: any): Promise<any>
  draft(input: { sessionId: string; clientId: string; revision: number; content: NoteContent }): Promise<void>
}
export async function restoreNoteDraft(bridge: NotesBridge, sessionId: string, loaded: NoteLoad): Promise<NoteLoad> {
  const draft = loaded.draft
  if (!draft) return loaded
  const content = { title: draft.title, blocks: draft.blocks, yjs: draft.yjs }
  const result: NoteSave = await bridge.request('save', { sessionId, revision: loaded.saved.revision, content, clientId: draft.clientId })
  if (result.status !== 'saved') throw Error('已有较新保存版本，请重新读取后对比草稿。')
  return { saved: result.saved }
}
export type NoteSuggestionPreview = { result: NoteDocumentResult; fingerprint: string; selectedText: string; from: number; to: number; cursor: string }
export function noteSuggestionPreview(result: NoteDocumentResult, captured: { fingerprint: string; text: string; from: number; to: number; cursor: string }): NoteSuggestionPreview {
  return { result, fingerprint: captured.fingerprint, selectedText: captured.text, from: captured.from, to: captured.to, cursor: captured.cursor }
}
