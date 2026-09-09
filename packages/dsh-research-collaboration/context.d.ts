export type SourceReference = {
  collection: 'files' | 'artifacts'
  nodeId: string
  name?: string
  text?: string
  kind?: string
  assetId?: string
  assetVersion?: number
  contentType?: string
  size?: number
  nodeVersion?: number
}
export type RequestContext = {
  scope: 'board' | 'references'
  references: SourceReference[]
}
export type HumanRecord = {
  id: string
  role: 'user' | 'assistant'
  text: string
  references: SourceReference[]
  authorName?: string
  createdAt?: number
}
export function normalizeRequestContext(value?: unknown): RequestContext
export function portableReferences(refs?: unknown): SourceReference[]
export function exportHumanHistory(events: readonly unknown[]): HumanRecord[]
export function mergeHumanHistory(baseline?: any[], later?: any[]): any[]
export function resolveRequestContext(
  context: unknown,
  canvas: any,
  versions?: Record<string, number>
): RequestContext
export function historyAssetIds(history?: any[]): string[]

export function portableAssetIds(value: unknown): string[]

export function assertPortableHistoryText(text: string): string
