import type { KnowledgeCategory } from './knowledge-library'

type DirectoryIcon = 'all' | 'bookmark' | 'star' | 'shared' | 'received' | 'folder' | 'next' | 'previous'

export const categoryIcons: Readonly<Record<KnowledgeCategory, DirectoryIcon>>
export const knowledgeDirectoryIcons: Readonly<Record<DirectoryIcon, string>>
