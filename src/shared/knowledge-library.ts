import type { KnowledgeSessionShare } from './knowledge-sessions'

export const knowledgeCategories = {
  all: '所有文件',
  saved: '手动收藏',
  starred: '重点文件',
  shared: '我的共享',
  received: '他人共享'
} as const

export const knowledgeFormats = {
  pdf: 'PDF', ppt: 'PPT', markdown: 'Markdown', word: 'Word', excel: 'Excel',
  image: '图片', audio: '音频', video: '视频', other: '其他'
} as const

export const knowledgeSharedCategories = ['行业研究', '产品设计', '业务流程', '写作模板', '技术文档', '数据分析', '其他'] as const

export const knowledgeSources = { generated: '会话生成', upload: '手动上传' } as const
export const maxEditableKnowledgeBytes = 128 * 1024
export const sharedKnowledgeCitationUrl = (id: string) => 'sherlock-knowledge://file/' + id

export function knowledgeRequestError(error: unknown): string {
  const message = typeof (error as Error)?.message === 'string' ? (error as Error).message : String(error ?? '')
  return message.replace(/^Error invoking remote method (['"])knowledge:request\1:\s*(?:Error:\s*)?/u, '')
}

export function knowledgeSharedCatalogError(error: unknown): string {
  switch (knowledgeRequestError(error).replace(/^ResearchBoardsError:\s*/u, '').trim()) {
    case 'LOGIN_REQUIRED':
    case '请先登录账户。':
    case '请登录后查看他人共享。':
      return '请登录后查看他人共享。'
    case 'SESSION_CHANGED':
    case '账号已变化，请重新打开知识库。':
      return '账号已变化，请重试。'
    default:
      return '暂时无法加载他人共享。'
  }
}

export type KnowledgeCategory = keyof typeof knowledgeCategories
export type KnowledgeFormat = keyof typeof knowledgeFormats
export type KnowledgeSource = keyof typeof knowledgeSources

export interface KnowledgeFolder {
  id: string
  name: string
}

export interface KnowledgeDocument {
  id: string
  name: string
  size: number
  updatedAt: number
  source: KnowledgeSource
  folderId?: string
  sessionId?: string
  sessionTitle?: string
  generatedBy?: 'image-factory'
  saved: boolean
  starred: boolean
  share?: { id: string; category: string }
  received?: { owner: string; category: string }
}

export interface KnowledgeSnapshot {
  documents: KnowledgeDocument[]
  folders: KnowledgeFolder[]
  sessionShares?: Record<string, KnowledgeSessionShare>
}

export interface KnowledgeFilter {
  query?: string
  category?: KnowledgeCategory
  folderId?: string
  sharedCategory?: string
  sources?: KnowledgeSource[]
  formats?: KnowledgeFormat[]
  savedOnly?: boolean
  sort?: 'name' | 'size' | 'updatedAt'
  ascending?: boolean
}

const extensions: Record<Exclude<KnowledgeFormat, 'other'>, string[]> = {
  pdf: ['pdf'],
  ppt: ['ppt', 'pptx', 'odp'],
  markdown: ['md', 'markdown', 'mdx'],
  word: ['doc', 'docx', 'odt', 'rtf'],
  excel: ['xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'avif', 'bmp', 'tif', 'tiff'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'aiff', 'caf'],
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']
}
const formatsByExtension = new Map(Object.entries(extensions).flatMap(([format, values]) =>
  values.map(value => [value, format as KnowledgeFormat] as const)
))

export function knowledgeFormat(name: string): KnowledgeFormat {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? formatsByExtension.get(name.slice(dot + 1).toLowerCase()) ?? 'other' : 'other'
}

export function canAutomaticallyCollect(name: string): boolean {
  return !name.startsWith('.') && knowledgeFormat(name) !== 'other'
}

export function listKnowledgeDocuments<T extends KnowledgeDocument>(
  snapshot: { folders: KnowledgeFolder[]; documents: T[] }, filter: KnowledgeFilter
): T[] {
  const words = filter.query?.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean) ?? []
  const folderNames = new Map(snapshot.folders.map(folder => [folder.id, folder.name]))
  const category = filter.category ?? 'all'
  const sort = filter.sort ?? 'updatedAt'
  const direction = (filter.ascending ?? sort === 'name') ? 1 : -1
  return snapshot.documents.filter(row => {
    if (Boolean(row.received) !== (category === 'received')) return false
    if (category === 'saved' && !row.saved || category === 'starred' && !row.starred || category === 'shared' && !row.share) return false
    if (filter.folderId && row.folderId !== filter.folderId) return false
    if (filter.sharedCategory && row.received?.category !== filter.sharedCategory) return false
    if (filter.sources?.length && !filter.sources.includes(row.source)) return false
    if (filter.formats?.length && !filter.formats.includes(knowledgeFormat(row.name))) return false
    if (filter.savedOnly && !row.saved) return false
    if (!words.length) return true
    const text = [row.name, row.sessionTitle, row.received?.owner, row.received?.category, row.share?.category, folderNames.get(row.folderId ?? '')].join(' ').toLocaleLowerCase()
    return words.every(word => text.includes(word))
  }).sort((a, b) => {
    const order = sort === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a[sort] - b[sort]
    return order * direction || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}

export type KnowledgeEdit =
  | { type: 'create-folder'; name: string }
  | { type: 'rename-folder'; id: string; name: string }
  | { type: 'remove-folder'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'move'; id: string; folderId?: string }
  | { type: 'star'; id: string; value: boolean }
  | { type: 'save'; id: string; value: boolean }
  | { type: 'remove'; id: string }

export interface KnowledgeImportResult {
  added: KnowledgeDocument[]
  failed: Array<{ name: string; message: string }>
}

export interface KnowledgeImportProgress {
  copied: number
  total: number
}
