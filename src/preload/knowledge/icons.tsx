import React from 'react'
import type { KnowledgeFormat } from '../../shared/knowledge-library'
import { knowledgeDirectoryIcons } from '../../shared/knowledge-directory-icons.mjs'

export { categoryIcons } from '../../shared/knowledge-directory-icons.mjs'

const uiIcons = {
  ...knowledgeDirectoryIcons,
  search: 'M15.5 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Zm-1.6 3.9 5.6 5.1',
  add: 'M5 12h14m-7-7v14',
  back: 'M19 12H5m6-6-6 6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  chevron: 'm7 10 5 5 5-5',
  research: 'M4 4h16v16H4Zm0 6h16m-9 0v10',
  note: 'M6 3h8l4 4v14H6Zm8 0v4h4M9 11h6m-6 4h6m-6 3h3',
  table: 'M4 5h16v14H4Zm0 5h16M4 14h16M9 10v9m6-9v9',
  filter: 'M4 5h16l-6 7v5.5l-4 2v-7.5Z',
}

const fileMarks = {
  pdf: 'M9 16.8c1.6 0 4.4-5.4 3.1-5.2-1.1.2.7 4.6 3.7 4.5 1.5-.1.4-1.7-2.8-1-2 .5-4.9 1.8-4 1.7Z',
  markdown: 'M9 13.5h7m-8 3.5h7m-3.8-5-1.5 7m5.3-7-1.5 7',
  word: 'M8.5 12.5h7m-7 3h7m-7 3h5',
  excel: 'M8.5 12.5h7v6h-7Zm0 3h7m-3.5-3v6',
  ppt: 'M8.5 12h7v4.5h-7Zm3.5 4.5V19m-2 0h4',
  image: 'm8.5 17 2.5-3 2 2 1.5-2 2 3m-7-5h.01',
  audio: 'M11 17v-4l4-1v4m-4 1a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm4-1a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z',
  video: 'm10.5 12.5 5 2.75-5 2.75Z',
  other: ''
} satisfies Record<KnowledgeFormat, string>

type IconName = keyof typeof uiIcons | 'more'

export function KnowledgeIcon({ name }: { name: IconName }) {
  return <svg className="knowledge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'more' ? <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6" /> : <path d={uiIcons[name]} />}
  </svg>
}

export function KnowledgeFileIcon({ format, tile = false }: { format: KnowledgeFormat; tile?: boolean }) {
  return <span className="knowledge-file-icon" data-format={format} data-tile={tile} aria-hidden="true">
    <svg className="knowledge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h6.5L18.5 8v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Zm6.5 0V8h5" />
      {fileMarks[format] && <path d={fileMarks[format]} />}
    </svg>
  </span>
}
