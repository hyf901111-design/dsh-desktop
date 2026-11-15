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

export type KnowledgeSessionShare = { id: string; category: string }
export const knowledgeSessionShareKey = (mode: KnowledgeSessionMode, sessionId: string) => `${mode}:${sessionId}`
