import React from 'react'
import all from './assets/all.svg?inline'
import bookmark from './assets/bookmark.svg?inline'
import shared from './assets/shared.svg?inline'
import received from './assets/received.svg?inline'
import folder from './assets/folder.svg?inline'
import markdown from './assets/markdown.svg?inline'
import search from './assets/search.svg?inline'
import add from './assets/add.svg?inline'
import more from './assets/more.svg?inline'
import star from '../browser/assets/star-outline.svg?inline'
import chevron from '../browser/assets/chevron.svg?inline'

const assets = { all, bookmark, shared, received, folder, markdown, search, add, more, star, chevron }

export function KnowledgeIcon({ name }: { name: string }) {
  if (name === 'markdown') return <img className="knowledge-icon" src={markdown} alt="" />
  if (Object.hasOwn(assets, name)) return <i className="knowledge-icon" aria-hidden="true"
    style={{ '--knowledge-icon': `url("${assets[name as keyof typeof assets].replaceAll('"', '%22')}")` } as React.CSSProperties} />
  const symbols: Record<string, string> = {
    filter: 'M3 5h18l-7 8v5l-4 2v-7Z',
    panel: 'M3 5h18v14H3zM15 5v14',
    pdf: 'M7 16c3-1 6-5 6-5-1 4 3 2 4 4-2 2-4-2-10 2',
    word: 'M8 11h8m-8 3h8m-8 3h6',
    excel: 'M7 11h10v7H7zm0 3.5h10m-5-3.5v7',
    ppt: 'M7 11h10v5H7zm5 5v3',
    image: 'M7 17l3-4 2 2 2-3 3 5',
    audio: 'M10 17v-5l6-2v5m-6 2a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m6-2a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
    video: 'M9 11l6 3-6 3z'
  }
  return <svg className={`knowledge-icon knowledge-icon--${name}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name !== 'filter' && name !== 'panel' && <path d="M6 3h8l5 5v13H5V4a1 1 0 0 1 1-1zm8 0v5h5" />}
    {symbols[name] && <path d={symbols[name]} />}
  </svg>
}
