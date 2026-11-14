/** Plain-data contract. IPC never accepts a path outside a trusted source binding. */
export const PPTX_ANNOTATION_REFERENCE_SOURCE = 'pptx-annotation' as const
export type PptxAnnotationSource =
  | { kind: 'workspace'; relativePath: string }
  | { kind: 'research'; authorizationId: string; nodeId: string }
  | { kind: 'note-file'; authorizationId: string; nodeId: string }
  | { kind: 'knowledge-file'; nodeId: string }

export type PptxAnnotationReference = {
  version: 1; sessionId: string; documentId: string; fileVersion: string; markId: string
}
export type PptxAnnotationRegion = { x: number; y: number; width?: number; height?: number }
export type PptxAnnotationMarkDraft = {
  id?: string; slideIndex: number; slidePart: string; kind: 'point' | 'rect'
  region: PptxAnnotationRegion; nodeIds: string[]; comment: string
}
export type PptxAnnotationMark = PptxAnnotationMarkDraft & {
  id: string; ordinal: number; revision: number; fileVersion: string; stale: boolean
}
export type PptxAnnotationState = { revision: number; nextOrdinal: number; marks: PptxAnnotationMark[] }
export type PptxAnnotationSlide = {
  index: number; part: string
  fields: Array<{ id: string; text: string; nodeId?: string; label: string; paragraphIndex?: number; row?: number; column?: number }>
  nodes: Array<{
    id: string; nodeId: string; part: string; type: string; name: string; parentId?: string
    geometry: { x: number; y: number; width: number; height: number; rotation: number } | null
  }>
}
export type PptxAnnotationOpenInput = { sessionId: string; source: PptxAnnotationSource }
export type PptxAnnotationOpenValue = {
  documentId: string; version: string; name: string
  slideSize: { width: number; height: number }; slides: PptxAnnotationSlide[]; state: PptxAnnotationState
}
export type PptxAnnotationMutation =
  | { op: 'put'; mark: PptxAnnotationMarkDraft }
  | { op: 'remove' | 'restore'; markId: string }
  | { op: 'reanchor'; markId: string; location: Omit<PptxAnnotationMarkDraft, 'id' | 'comment'> }
export type PptxAnnotationMutateInput = {
  sessionId: string; documentId: string; version: string; expectedStateRevision: number
  operations: PptxAnnotationMutation[]
}
export type PptxAnnotationPreparedReference = PptxAnnotationReference & { expectedStateRevision: number }
export type PptxAnnotationPrepareInput = {
  sendingSessionId: string; sendId: string; expectedDraftRev: number
  references: PptxAnnotationPreparedReference[]; retryOfPreparedId?: string
}
export type PptxAnnotationPreparedDocument = {
  documentId: string; fileVersion: string; inputRelativePath: string; outputRelativePath: string; markIds: string[]
}
export type PptxAnnotationPrepareValue = {
  preparedId: string; manifestRelativePath: string; documents: PptxAnnotationPreparedDocument[]
  serializedReferences: Array<{ reference: PptxAnnotationReference; text: string }>
}
export type PptxAnnotationBindInput = { sendingSessionId: string; preparedId: string; submissionId?: string }
export type PptxAnnotationBindValue = {
  status: 'pending' | 'queued' | 'bound'; submissionId?: string
  userMessageId?: string; userSeq?: number; turn?: number; step?: number
}
export type PptxAnnotationCompleteInput = { sendingSessionId: string; preparedId: string; submissionId: string }
export type PptxAnnotationVersionRecord = {
  id: string; sourceDocumentId: string; sourceVersion: string; documentId: string; version: string
  relativePath: string; preparedId: string; submissionId: string; createdAt: string; reanchorRequired: true
}
export type PptxAnnotationCompleteValue = {
  status: 'pending' | 'success' | 'partial' | 'failed'
  documents: Array<{
    documentId: string; status: 'pending' | 'success' | 'failed'; code?: PptxAnnotationErrorCode
    error?: string; versionRecord?: PptxAnnotationVersionRecord; newFileRelativePath?: string
  }>
}
export type PptxAnnotationOutputValue = null | {
  preparedId: string; documentId: string; submissionId?: string
  status: 'pending' | 'success' | 'failed'; code?: PptxAnnotationErrorCode; error?: string
  versionRecord?: PptxAnnotationVersionRecord; newFileRelativePath?: string
}
export type PptxAnnotationMessagePresentationInput = {
  sendingSessionId: string; preparedId: string; userSeq: number; submissionId: string; text: string
}
export type PptxAnnotationMessagePresentationValue = null | {
  preparedId: string; submissionId: string; userSeq: number; text: string
  spans: Array<{
    kind: 'pptx-annotation'; start: number; end: number; text: string
    reference: PptxAnnotationReference; ordinal: number; label: string; comment: string
  }>
  skill?: { start: number; end: number; text: string; id: 'builtin:efund-ppt-maker'; label: string }
}
export type PptxAnnotationResolveReferenceInput = { sendingSessionId: string; reference: PptxAnnotationReference }
export type PptxAnnotationResolveReferenceValue =
  | {
      status: 'ready'; reference: PptxAnnotationReference; source: PptxAnnotationOpenInput
      path: string; name: string; fileVersion: string; sourceUrl?: string
      mark: Pick<PptxAnnotationMark, 'id' | 'ordinal' | 'slideIndex' | 'slidePart'>
    }
  | { status: 'stale' | 'deleted' | 'denied'; error: string }
export type PptxAnnotationErrorCode =
  | 'invalid' | 'forbidden' | 'unavailable' | 'conflict' | 'stale' | 'reanchor-required'
  | 'cancelled' | 'not-ready' | 'ambiguous' | 'source-changed' | 'unchanged' | 'invalid-output'
  | 'submission-unconfirmed'
export type PptxAnnotationResult<T> = { ok: true; value: T } | { ok: false; code: PptxAnnotationErrorCode; error: string }
export type PptxAnnotationBridge = {
  open(input: PptxAnnotationOpenInput): Promise<PptxAnnotationResult<PptxAnnotationOpenValue>>
  mutate(input: PptxAnnotationMutateInput): Promise<PptxAnnotationResult<PptxAnnotationState>>
  prepare(input: PptxAnnotationPrepareInput): Promise<PptxAnnotationResult<PptxAnnotationPrepareValue>>
  bindSubmission(input: PptxAnnotationBindInput): Promise<PptxAnnotationResult<PptxAnnotationBindValue>>
  complete(input: PptxAnnotationCompleteInput): Promise<PptxAnnotationResult<PptxAnnotationCompleteValue>>
  lookupOutput(input: { sendingSessionId: string; path: string }): Promise<PptxAnnotationResult<PptxAnnotationOutputValue>>
  messagePresentation(input: PptxAnnotationMessagePresentationInput): Promise<PptxAnnotationResult<PptxAnnotationMessagePresentationValue>>
  resolveReference(input: PptxAnnotationResolveReferenceInput): Promise<PptxAnnotationResult<PptxAnnotationResolveReferenceValue>>
  cancel(input: { sessionId: string; sendId: string }): Promise<PptxAnnotationResult<{ cancelled: boolean }>>
}

function object(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('无效的标注数据')
  return value as Record<string, unknown>
}
function text(value: unknown, limit = 1024): string {
  if (typeof value !== 'string' || !value || value.length > limit || /[\u0000-\u001f]/.test(value)) throw new Error('无效的标注标识')
  return value
}
export function parsePptxAnnotationMessagePresentationInput(value: unknown): PptxAnnotationMessagePresentationInput {
  const item = object(value, ['sendingSessionId', 'preparedId', 'userSeq', 'submissionId', 'text'])
  const sendingSessionId = text(item.sendingSessionId), preparedId = text(item.preparedId), submissionId = text(item.submissionId)
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(preparedId) || !Number.isSafeInteger(item.userSeq) || Number(item.userSeq) < 0 || typeof item.text !== 'string' || !item.text || item.text.length > 1024 * 1024 || item.text.includes('\0')) throw new Error('消息呈现凭据无效')
  return { sendingSessionId, preparedId, userSeq: Number(item.userSeq), submissionId, text: item.text }
}
export function parsePptxAnnotationResolveReferenceInput(value: unknown): PptxAnnotationResolveReferenceInput {
  const item = object(value, ['sendingSessionId', 'reference']), sendingSessionId = text(item.sendingSessionId)
  return { sendingSessionId, reference: parsePptxAnnotationReference(item.reference, sendingSessionId) }
}
export function parsePptxAnnotationSource(value: unknown): PptxAnnotationSource {
  const item = object(value, ['kind', 'relativePath', 'authorizationId', 'nodeId'])
  if (item.kind === 'workspace') {
    const relativePath = text(item.relativePath, 4096)
    if (Object.keys(item).length !== 2 || /^(?:[\\/]|[A-Za-z]:)/.test(relativePath) || relativePath.split(/[\\/]/).some(part => part === '..' || !part)) throw new Error('无效的工作区路径')
    return { kind: 'workspace', relativePath }
  }
  if (item.kind === 'knowledge-file' && Object.keys(item).length === 2 && typeof item.nodeId === 'string' &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(item.nodeId)) {
    return { kind: item.kind, nodeId: item.nodeId }
  }
  if ((item.kind !== 'research' && item.kind !== 'note-file') || Object.keys(item).length !== 3) throw new Error('无效的文件授权')
  return { kind: item.kind, authorizationId: text(item.authorizationId), nodeId: text(item.nodeId) }
}
export function parsePptxAnnotationReference(value: unknown, sendingSessionId?: string): PptxAnnotationReference {
  const item = object(value, ['version', 'sessionId', 'documentId', 'fileVersion', 'markId'])
  if (item.version !== 1) throw new Error('标注引用版本无效')
  const sessionId = text(item.sessionId), documentId = text(item.documentId), fileVersion = text(item.fileVersion), markId = text(item.markId)
  if ((sendingSessionId && sessionId !== sendingSessionId) || !/^[a-f0-9]{64}$/.test(documentId) || !/^[a-f0-9]{64}$/.test(fileVersion)) throw new Error('标注引用不属于当前会话或文件版本')
  return { version: 1, sessionId, documentId, fileVersion, markId }
}
export function parsePptxAnnotationMarkDraft(value: unknown): PptxAnnotationMarkDraft {
  const item = object(value, ['id', 'slideIndex', 'slidePart', 'kind', 'region', 'nodeIds', 'comment'])
  if (!Number.isSafeInteger(item.slideIndex) || Number(item.slideIndex) < 0 || !/^ppt\/slides\/[^/\\]+\.xml$/.test(text(item.slidePart)) || (item.kind !== 'point' && item.kind !== 'rect')) throw new Error('标注页码或类型无效')
  const region = object(item.region, ['x', 'y', 'width', 'height'])
  for (const key of ['x', 'y']) if (typeof region[key] !== 'number' || !Number.isFinite(region[key]) || region[key] < 0 || region[key] > 1) throw new Error('标注坐标超出页面')
  if (item.kind === 'point' && ('width' in region || 'height' in region)) throw new Error('点标注不能包含框尺寸')
  if (item.kind === 'rect') {
    for (const key of ['width', 'height']) if (typeof region[key] !== 'number' || !Number.isFinite(region[key]) || region[key] <= 0 || region[key] > 1) throw new Error('框选尺寸无效')
    if (Number(region.x) + Number(region.width) > 1.000000001 || Number(region.y) + Number(region.height) > 1.000000001) throw new Error('框选超出页面')
  }
  const nodeIds = item.nodeIds ?? []
  if (!Array.isArray(nodeIds) || nodeIds.length > 200 || new Set(nodeIds).size !== nodeIds.length) throw new Error('标注对象无效')
  const comment = item.comment ?? ''
  if (typeof comment !== 'string' || comment.length > 16000 || comment.includes('\0')) throw new Error('标注备注无效')
  return {
    ...(item.id === undefined ? {} : { id: text(item.id) }), slideIndex: Number(item.slideIndex), slidePart: String(item.slidePart),
    kind: item.kind, region: { ...region } as PptxAnnotationRegion, nodeIds: nodeIds.map(id => text(id)), comment,
  }
}
