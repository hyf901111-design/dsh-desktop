import { createHash } from 'node:crypto'
import { knowledgeSessionLabels, knowledgeSessionShareKey, type KnowledgeSessionMode } from '../../shared/knowledge-sessions'
import { noteMarkdown } from '../notes/export'
import { writeWorkbookFile } from '../spreadsheet/files'
import { researchContainerText, readStoredResearchCanvas } from '../state/research-context-bridge'
import type { NoteContent } from '../../shared/workspace-notes'
import type { Workbook } from '../../shared/spreadsheet/workbook'
import { noteHasContent, researchHasContent, workbookHasContent } from './session-content'

type Canvas = ReturnType<typeof readStoredResearchCanvas>
type CanvasNode = { id?: string; authorizationId?: string; title?: string; name?: string; displayName?: string;
  excerpt?: unknown; sourceText?: unknown; containerSpec?: { type?: string } }
type Snapshot =
  | { mode: 'research'; canvas: Canvas; readFile(node: CanvasNode, name: string): Promise<string | undefined> }
  | { mode: 'notes'; note: NoteContent }
  | { mode: 'spreadsheet'; workbook: Workbook | null }

const cleanTitle = (title: unknown) => typeof title === 'string' ? title.replace(/[\\/\p{Cc}]/gu, ' ').trim().slice(0, 120) : ''
const heading = (title: string) => title.replace(/[\\#*[\]`_<>]/gu, '\\$&')
const body = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function knowledgeSessionShareId(mode: KnowledgeSessionMode, sessionId: string): string {
  const bytes = createHash('sha256').update('knowledge-session-share\0' + knowledgeSessionShareKey(mode, sessionId)).digest('hex')
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-8${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`
}

export async function createKnowledgeSessionSnapshot(input: Snapshot, sessionTitle: string) {
  const documentTitle = input.mode === 'notes' ? input.note.title : input.mode === 'spreadsheet' ? input.workbook?.name : undefined
  const title = cleanTitle(sessionTitle) || cleanTitle(documentTitle) || '未命名会话'
  const name = `${title} · ${knowledgeSessionLabels[input.mode]}`
  if (input.mode === 'spreadsheet' && input.workbook && workbookHasContent(input.workbook)) {
    return { name: name + '.xlsx', data: await writeWorkbookFile(input.workbook, 'xlsx', input.workbook.sheetOrder[0]!) }
  }
  if (input.mode === 'notes' && noteHasContent(input.note)) {
    return { name: name + '.md', data: Buffer.from(noteMarkdown({ ...input.note, title: input.note.title || title })) }
  }
  if (input.mode !== 'research' || !researchHasContent(input.canvas)) throw Error('此会话暂无可共享的保存内容。')

  const sections = ['# ' + heading(title)]
  for (const item of input.canvas.artifacts) {
    if (!item || typeof item !== 'object') continue
    const node = item as CanvasNode
    if (node.containerSpec?.type === 'board-tabs') continue
    const content = researchContainerText(node.containerSpec)
    sections.push('## ' + heading(cleanTitle(node.title) || '研究组件'),
      content.text || body(node.excerpt) || body(node.sourceText) || '此组件暂无可预览正文。')
    if (content.truncated) sections.push('此组件的正文较长，仅显示部分内容。')
  }
  for (const item of input.canvas.files) {
    if (!item || typeof item !== 'object') continue
    const node = item as CanvasNode
    const name = cleanTitle(node.displayName || node.name) || '未命名附件'
    sections.push('## ' + heading(name), await input.readFile(node, name) || '此附件仅显示文件名。')
  }
  return { name: name + '.md', data: Buffer.from(sections.join('\n\n') + '\n') }
}
