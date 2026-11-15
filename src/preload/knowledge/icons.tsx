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
  note: 'M6 3h8l4 4v14H6Zm8 0v4h4M9 11h6m-6 4h6m-6 3h3',
  table: 'M4 5h16v14H4Zm0 5h16M4 14h16M9 10v9m6-9v9',
  filter: 'M4 5h16l-6 7v5.5l-4 2v-7.5Z',
}

type ItemFormat = KnowledgeFormat | KnowledgeSessionMode

const filePage = 'M7 3h6l5.5 5.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 .9V8a1 1 0 0 0 1 1h3.6Z'
// Interior details are cutouts so the tile color shows through the solid glyph.
const itemGlyphs = {
  pdf: filePage + 'M8.3 17.5c-.8-.5.1-1.8 2.4-2.5.4-.8.8-1.6.9-2.2-.4-1.2-.2-2.4.6-2.5 1-.1 1.1 1.2.6 2.5.2.5.5 1 .9 1.4 2.1-.3 3.2.2 2.9 1.1-.3.9-1.9.8-3.2-.1-.8.1-1.4.3-2 .5-1 1.7-2.3 2.3-3.1 1.8Zm3.6-2.8 1-.2-.6-.7Z',
  ppt: 'M3.5 4h17a1 1 0 0 1 1 1v1H21v9a1.5 1.5 0 0 1-1.5 1.5H13V18l2.8 2.6-1.2 1.3-2.6-2.4-2.6 2.4-1.2-1.3L11 18v-1.5H4.5A1.5 1.5 0 0 1 3 15V6h-.5V5a1 1 0 0 1 1-1ZM7 11v3h2v-3Zm4-2v5h2V9Zm4-2v7h2V7Z',
  markdown: 'M4 5.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM5 8v8h2v-4.4L9.2 14l2.3-2.4V16h2V8h-2l-2.3 2.7L7 8Zm11.5 1v4h-1.7l2.7 3 2.7-3h-1.7V9Z',
  word: filePage + 'M8 11h7.5v1.5H8Zm0 3h7.5v1.5H8Zm0 3h5v1.5H8Z',
  excel: filePage + 'M8 11h3v2H8Zm4 0h3.5v2H12Zm-4 3h3v2H8Zm4 0h3.5v2H12Zm-4 3h3v1.5H8Zm4 0h3.5v1.5H12Z',
  image: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3.2 3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM5.5 17h13l-4.5-6-3.5 4.3-2-2.5Z',
  audio: 'M10 6a1.5 1.5 0 0 1 1.2-1.5l7-1.5A1.5 1.5 0 0 1 20 4.5V16c0 1.7-1.5 3-3.4 3-1.7 0-3.1-1-3.1-2.5s1.5-2.9 3.4-2.9c.4 0 .7.1 1.1.2V8.4l-6 1.3V18c0 1.7-1.6 3-3.4 3-1.7 0-3.1-1-3.1-2.5s1.5-2.9 3.4-2.9c.4 0 .7.1 1.1.2Z',
  video: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm5 3.5v7l5.5-3.5Z',
  other: filePage,
  research: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 3v2h12V7Zm0 4v6h4v-6Zm6 0v2.2h6V11Zm0 4.2V17h6v-1.8Z',
  notes: 'M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1H3v-2h2v-3H3v-2h2V8H3V6h2V5a2 2 0 0 1 2-2Zm2 4v2h7V7Zm0 4v2h7v-2Zm0 4v2h4v-2Z',
  spreadsheet: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 3v2h12V7Zm0 4v2h5v-2Zm7 0v2h5v-2Zm-7 4v2h5v-2Zm7 0v2h5v-2Z',
} satisfies Record<ItemFormat, string>

type IconName = keyof typeof uiIcons | 'more'

export function KnowledgeIcon({ name }: { name: IconName }) {
  return <svg className="knowledge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'more' ? <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6" /> : <path d={uiIcons[name]} />}
  </svg>
}

export function KnowledgeItemIcon({ format, tile = false }: { format: ItemFormat; tile?: boolean }) {
  return <span className="knowledge-file-icon" data-format={format} data-tile={tile} aria-hidden="true">
    <svg className="knowledge-icon" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d={itemGlyphs[format]} />
    </svg>
  </span>
}
