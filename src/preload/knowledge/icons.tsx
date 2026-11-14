import React from 'react'
import type { KnowledgeCategory, KnowledgeFormat } from '../../shared/knowledge-library'

export const categoryIcons = {
  all: 'all', saved: 'bookmark', starred: 'star', shared: 'shared', received: 'received'
} as const satisfies Record<KnowledgeCategory, string>

const uiIcons = {
  all: 'M8 7H5.5A1.5 1.5 0 0 0 4 8.5v11A1.5 1.5 0 0 0 5.5 21H15m-5.5-4H18a1.5 1.5 0 0 0 1.5-1.5V8l-4-4h-6A1.5 1.5 0 0 0 8 5.5v10A1.5 1.5 0 0 0 9.5 17ZM15.5 4v4h4',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z',
  star: 'm12 3 2.75 5.8 6.4.85-4.65 4.45 1.15 6.4L12 17.4l-5.65 3.1 1.15-6.4-4.65-4.45 6.4-.85L12 3Z',
  shared: 'M13.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM3.5 19v-1a6.5 6.5 0 0 1 13 0v1m-.8-14.9a3.5 3.5 0 0 1 0 6.8m2 2.8a5.5 5.5 0 0 1 3 4.8v.5',
  received: 'M3.5 14 6 5h12l2.5 9v4a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Zm0 0H9l1.3 2h3.4l1.3-2h5.5',
  folder: 'M4 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2H19A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5Z',
  search: 'M15.5 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Zm-1.6 3.9 5.6 5.1',
  add: 'M5 12h14m-7-7v14',
  back: 'M19 12H5m6-6-6 6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  chevron: 'm7 10 5 5 5-5',
  next: 'm10 7 5 5-5 5',
  previous: 'm14 7-5 5 5 5',
  filter: 'M4 5h16l-6 7v5.5l-4 2v-7.5Z',
  panel: 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11A1.5 1.5 0 0 1 5.5 5ZM14.5 5v14'
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
