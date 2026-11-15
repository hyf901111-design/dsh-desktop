import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { noteUiText } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type { KnowledgeContent } from '../knowledge/content'

export const noteDocumentExtensions = ['pdf', 'txt', 'docx', 'md', 'markdown']

export async function readNoteDocument(
  file: { name: string; path: string }, content: KnowledgeContent, signal: AbortSignal, locale?: string
) {
  const extension = extname(file.name).slice(1).toLowerCase()
  if (!noteDocumentExtensions.includes(extension)) throw Error(noteUiText('请选择 PDF、TXT、Word（.docx）或 Markdown 文档。', locale))
  const info = await stat(file.path)
  if (!info.isFile()) throw Error(noteUiText('所选文件当前无法读取，请重新选择。', locale))
  const result = await content.read({ name: file.name, size: info.size }, file.path, signal)
  if (!result?.text.trim()) {
    const message = extension === 'pdf' ? 'PDF 中没有可读取的文字。扫描件可以作为附件插入。' : '文档中没有可导入的文字。'
    throw Error(noteUiText(message, locale))
  }
  const text = result.text.replace(/\r\n?/gu, '\n')
  if (result.truncated || text.split('\n', 5001).length > 5000) throw Error(noteUiText('文档内容过长，请拆分后导入。', locale))
  return { format: extension === 'md' || extension === 'markdown' ? 'markdown' as const : 'text' as const, text }
}
