import type { Canvas } from 'dsh-research-collaboration/document'
import type { SavedNote } from './workspace-notes'
import type { Workbook } from './spreadsheet/workbook'

export const knowledgeSessionLabels = { research: '研究模式', notes: '笔记模式', spreadsheet: '表格模式' } as const

export type KnowledgeSessionMode = keyof typeof knowledgeSessionLabels
export type KnowledgeSessionEntry = {
  id: string
  title: string
  workspace?: string
  updatedAt: number
  researchBoard?: boolean
}

export type KnowledgeSessionEvidence = {
  id: string
  hasContent: boolean
}

export type KnowledgeSessionCopy = { id: string; mode: KnowledgeSessionMode; named: boolean }

export type KnowledgeSessionShare = { id: string; category: string }
export const knowledgeSessionShareKey = (mode: KnowledgeSessionMode, sessionId: string) => `${mode}:${sessionId}`

export type SharedKnowledgeSession = { title: string; version: 1 } & (
  | { mode: 'research'; canvas: Canvas; layout?: Array<[prefix: string, suffix: string, value: string]> }
  | { mode: 'notes'; note: SavedNote }
  | { mode: 'spreadsheet'; workbook: Workbook }
)

export function sharedKnowledgeSessionFile(name: string, source: string) {
  if (source !== 'generated') return
  const native = /^(.*)\.ework-session-(research|notes|spreadsheet)$/u.exec(name)
  if (native) return { title: native[1]!, mode: native[2] as KnowledgeSessionMode, legacy: false }

  for (const mode of Object.keys(knowledgeSessionLabels) as KnowledgeSessionMode[]) {
    const marker = ' · ' + knowledgeSessionLabels[mode] + (mode === 'spreadsheet' ? '.xlsx' : '.md')
    if (name.endsWith(marker)) return { title: name.slice(0, -marker.length), mode, legacy: true }
  }
}

export const legacyKnowledgeSessionMessage = '此会话使用旧版共享格式，请发布者在知识库中重新发布。'
