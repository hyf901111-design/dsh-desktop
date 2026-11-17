import React from 'react'
import type { KnowledgeFormat } from '../../shared/knowledge-library'
import type { KnowledgeSessionMode } from '../../shared/knowledge-sessions'
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
  document: 'M6 3h8l4 4v14H6Zm8 0v4h4',
  note: 'M6 3h8l4 4v14H6Zm8 0v4h4M9 11h6m-6 4h6m-6 3h3',
  table: 'M4 5h16v14H4Zm0 5h16M4 14h16M9 10v9m6-9v9',
  filter: 'M4 5h16l-6 7v5.5l-4 2v-7.5Z',
}

type ItemFormat = KnowledgeFormat | KnowledgeSessionMode

const letterP = 'M5.1 15.7V8.3h2.4a2.1 2.1 0 0 1 0 4.2H5.1'
const ruledPage = 'M13.5 8.1h5.4m-5.4 2.6h5.4m-5.4 2.6h5.4m-5.4 2.6h5.4'
const gridPage = 'M13.4 8h5.7v8h-5.7Zm2.9 0v8m-2.9-5.3h5.7m-5.7 2.6h5.7'

const itemGlyphs = {
  pdf: {
    cover: letterP,
    page: 'M14 13.8c1.4-1.6 2-3.7 1.6-5.5-.2-1 .9-1.1 1.1 0 .4 1.8 1 2.6 2.2 3.3-2.1-.3-3.9 0-4.9 1m-.5 3.5h5.4'
  },
  ppt: { cover: letterP, page: 'M13.4 8h5.7v6h-5.7Zm1.5 4.5v-.8m1.5.8v-1.7m1.4 1.7v-2.5m-4.3 6h5.4' },
  markdown: { cover: 'M4.3 15.7V8.4l2.7 3.4 2.7-3.4v7.3', page: 'M16.3 8v6m-2.5-2.4 2.5 2.4 2.5-2.4m-5.3 4.5h5.4' },
  word: { cover: 'm4 8.3 1.3 7.4L7 11l1.7 4.7L10 8.3', page: ruledPage },
  excel: { cover: 'm4.7 8.5 4.6 7m0-7-4.6 7', page: gridPage },
  audio: { cover: 'M6.1 14.6a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Zm0 0V8.7l3.4-.9v2.7', page: 'M13.7 11v2m1.7-3.4v4.8m1.7-6.4v8m1.7-5.4v2.8' },
  video: { cover: 'M5 8.8 9.6 12 5 15.2Z', page: 'M13.5 8.4h5.4v7.2h-5.4Zm1.8 1.8 2 1.8-2 1.8Z' },
  other: { cover: 'M5 8.3h2.5L9 9.8v5.9H5Z', page: 'M13.5 8.1h5.4m-5.4 2.6h5.4m-5.4 2.6h3.5' },
  research: { cover: 'M4.3 9h5.4v6H4.3Zm0 2h5.4m-3 0v4', page: 'M13.4 8h5.7v8h-5.7Zm0 1.8h5.7m-3 0V16m.1-3.1h2.9' },
  notes: { cover: 'M4.9 15.6V8.4l4.2 7.2V8.4', page: 'M14.2 8.2h4.7m-4.7 2.6h4.7m-4.7 2.6h4.7m-4.7 2.6h3m-4.3-8.7v9.5' },
  spreadsheet: { cover: 'M9.5 8.9a3 3 0 0 0-2.1-.7c-2.6 0-3 2.6-.5 3.6s2.7 3.9 0 3.9a3.5 3.5 0 0 1-2.2-.8', page: 'M13.4 8h5.7v8h-5.7Zm0 2.2h5.7m-2.8 0V16m-2.9-2.9h5.7' },
} satisfies Record<Exclude<ItemFormat, 'image'>, { cover: string; page: string }>

type IconName = keyof typeof uiIcons | 'more'

export function KnowledgeIcon({ name }: { name: IconName }) {
  return <svg className="knowledge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'more' ? <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6" /> : <path d={uiIcons[name]} />}
  </svg>
}

export function KnowledgeItemIcon({ format, tile = false }: { format: ItemFormat; tile?: boolean }) {
  return <span className="knowledge-file-icon" data-format={format} data-tile={tile} aria-hidden="true">
    {format === 'image' ? <svg className="knowledge-icon" viewBox="0 0 24 24">
      <rect x="2" y="4.5" width="20" height="15" rx="2.5" fill="var(--knowledge-icon-color)" />
      <circle cx="16.5" cy="9" r="1.6" fill="#fff" />
      <path fill="#fff" d="M4.5 17l5.2-6.2 3.1 3.7 2.3-2.2 4.4 4.7z" />
    </svg> : <svg className="knowledge-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 4.5h11.4a.6.6 0 0 1 .6.6v13.8a.6.6 0 0 1-.6.6H9Z"
        stroke="var(--knowledge-icon-color)" strokeWidth="1.15" />
      <path fill="none" stroke="var(--knowledge-icon-color)" strokeWidth="1.05" strokeLinecap="round"
        strokeLinejoin="round" d={itemGlyphs[format].page} />
      <path fill="var(--knowledge-icon-color)" d="M2 4.6 12 2.4v19.2L2 19.4Z" />
      <path fill="none" stroke="#fff" strokeWidth="1.55" strokeLinecap="round"
        strokeLinejoin="round" d={itemGlyphs[format].cover} />
    </svg>}
  </span>
}
