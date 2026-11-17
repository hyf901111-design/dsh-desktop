import type { KnowledgeCategory } from './knowledge-library'

type DirectoryIcon = 'all' | 'images' | 'bookmark' | 'star' | 'shared' | 'received' | 'folder' | 'next' | 'previous'

export const categoryIcons: Readonly<Record<KnowledgeCategory, DirectoryIcon>>
export const knowledgeDirectoryIcons: Readonly<Record<DirectoryIcon, string>>
