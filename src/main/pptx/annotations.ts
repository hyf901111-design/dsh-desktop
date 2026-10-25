import { randomUUID } from 'node:crypto'
import { chmod, lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  parsePptxAnnotationMarkDraft, parsePptxAnnotationReference, parsePptxAnnotationSource, parsePptxAnnotationMessagePresentationInput,
  type PptxAnnotationSource, type PptxAnnotationMark, type PptxAnnotationState, type PptxAnnotationOpenValue,
  type PptxAnnotationResult, type PptxAnnotationErrorCode, type PptxAnnotationPrepareInput,
  type PptxAnnotationPrepareValue, type PptxAnnotationPreparedReference, type PptxAnnotationBindValue,
  type PptxAnnotationCompleteValue, type PptxAnnotationVersionRecord,
  type PptxAnnotationOutputValue, type PptxAnnotationMessagePresentationValue,
} from '../../shared/pptx-annotations'
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust'
import { PptxAnnotationStore, annotationContains, annotationDirectory, annotationHash, annotationWriteExclusive } from './annotations-store'
import { annotationContentChanged, readAnnotationPptx } from './annotations-files'

export type PptxAnnotationHistoryEvent = { seq: number; type: string; data: any }
export type PptxAnnotationHistoryPage = { events: PptxAnnotationHistoryEvent[]; hasMore: boolean }
export type PptxAnnotationOptions = {
  root: string
  owner(): string | null | undefined
  resolveWorkspace(sessionId: string): Promise<string | null>
  /** Research/NoteFile adapters derive their identity from actual sessionId in Main. */
  resolveAuthorizedSource(sessionId: string, source: Exclude<PptxAnnotationSource, { kind: 'workspace' }>): Promise<{ path: string; root: string } | null>
  readHistory(input: { sessionId: string; beforeSeq?: number; maxMessages: 100 }): Promise<PptxAnnotationHistoryPage>
  presentationSkill?(id: 'builtin:efund-ppt-maker'): Promise<{ id: string; invocationName: string; label: string } | null>
  now?(): Date
}
type StoredDocument = {
  owner: string; sessionId: string; documentId: string; source: PptxAnnotationSource; target: string
  revision: number; nextOrdinal: number; marks: PptxAnnotationMark[]; deleted: PptxAnnotationMark[]
}
type PreparedDocument = PptxAnnotationPrepareValue['documents'][number] & {
  source: PptxAnnotationSource; target: string; inputVersion: string; slideSize: { width: number; height: number }
  marks: Array<PptxAnnotationMark & { sourceText: string; sourceNodes: Array<{ id: string; nodeId: string; type: string; name: string; geometry: unknown; parentId?: string }> }>
}
type Prepared = {
  owner: string; sessionId: string; sendId: string; fingerprint: string; preparedId: string; workspace: string
  manifestHash: string; value: PptxAnnotationPrepareValue; documents: PreparedDocument[]
  binding?: PptxAnnotationBindValue; completed?: PptxAnnotationCompleteValue; cancelled?: boolean
  historyFloor: number
}
class AnnotationError extends Error { constructor(readonly code: PptxAnnotationErrorCode, message: string) { super(message) } }
const fail = (code: PptxAnnotationErrorCode, message: string): never => { throw new AnnotationError(code, message) }
const record = (input: unknown): Record<string, any> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid', 'PPT 标注请求无效。')
  return input as Record<string, any>
}
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\u0000-\u001f]/.test(value)) fail('invalid', 'PPT 标注标识无效。')
  return value as string
}
const revision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('invalid', 'PPT 标注修订号无效。')
  return value as number
}
const textContent = (message: any) => Array.isArray(message?.content) ? message.content.filter((part: any) => part?.type === 'text' && typeof part.text === 'string').map((part: any) => part.text).join('\n') : ''
const userMessage = (event: PptxAnnotationHistoryEvent) => event.data?.message ?? event.data
const isHuman = (message: any) => message?.role === 'user' && message?.source?.kind === 'user'
const canonicalJson = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

export class PptxAnnotationService {
  private readonly store: PptxAnnotationStore
  private tail: Promise<unknown> = Promise.resolve()
  private readonly cancellations = new Set<string>()
  constructor(private readonly options: PptxAnnotationOptions) { this.store = new PptxAnnotationStore(options.root) }
  private owner() { return identifier(this.options.owner()) }
  private current(owner: string) { if (owner !== this.options.owner()) fail('forbidden', '账户已切换，PPT 标注请求已停止。') }
  private async transaction<T>(work: (owner: string) => Promise<T>): Promise<PptxAnnotationResult<T>> {
    try {
      const owner = this.owner(), operation = this.tail.catch(() => {}).then(async () => { this.current(owner); return work(owner) })
      this.tail = operation.catch(() => {})
      return { ok: true, value: await operation }
    } catch (error) { return { ok: false, code: error instanceof AnnotationError ? error.code : 'unavailable', error: error instanceof Error ? error.message : 'PPT 标注暂不可用。' } }
  }
  private key(owner: string, sessionId: string, sendId: string) { return JSON.stringify([owner, sessionId, sendId]) }
  private async authorize(owner: string, sessionId: string, source: PptxAnnotationSource) {
    this.current(owner)
    const workspacePath = await this.options.resolveWorkspace(sessionId)
    if (!workspacePath) fail('forbidden', '当前真实会话没有可读取的工作区。')
    const workspace = await realpath(workspacePath!)
    const binding = source.kind === 'workspace' ? { path: path.resolve(workspace, source.relativePath), root: workspace } : await this.options.resolveAuthorizedSource(sessionId, source)
    if (!binding) fail('forbidden', 'PPT 文件授权已失效，请重新打开。')
    const root = await realpath(binding!.root), target = await realpath(binding!.path)
    this.current(owner)
    if (!annotationContains(root, target) || path.extname(target).toLowerCase() !== '.pptx') fail('forbidden', '文件不属于已授权的 PPT 工作区。')
    return { workspace, target }
  }
  private state(doc: StoredDocument, version: string): PptxAnnotationState {
    return { revision: doc.revision, nextOrdinal: doc.nextOrdinal, marks: doc.marks.map(mark => ({ ...structuredClone(mark), stale: mark.fileVersion !== version })).sort((a, b) => a.ordinal - b.ordinal) }
  }
  private async document(owner: string, sessionId: string, documentId: string) {
    const doc = await this.store.read<StoredDocument>(owner, sessionId, `document:${documentId}`)
    if (!doc || doc.owner !== owner || doc.sessionId !== sessionId || doc.documentId !== documentId) fail('forbidden', '此标注不属于当前会话，请重新打开 PPT。')
    const source = parsePptxAnnotationSource(doc!.source), authorized = await this.authorize(owner, sessionId, source)
    if (authorized.target !== doc!.target || annotationHash(authorized.target) !== documentId) fail('forbidden', 'PPT 授权路径已变化，请重新打开。')
    return { doc: doc!, ...authorized }
  }
  private async currentDocument(owner: string, sessionId: string, documentId: string) {
    const result = await this.document(owner, sessionId, documentId), file = await readAnnotationPptx(result.target)
    const again = await this.authorize(owner, sessionId, result.doc.source)
    if (again.target !== result.target || again.workspace !== result.workspace) fail('forbidden', 'PPT 授权已变化。')
    return { ...result, file }
  }
  async open(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationOpenValue>> {
    return this.transaction(async owner => {
      const input = record(value), sessionId = identifier(input.sessionId), source = parsePptxAnnotationSource(input.source)
      const authorized = await this.authorize(owner, sessionId, source), file = await readAnnotationPptx(authorized.target)
      const documentId = annotationHash(authorized.target), key = `document:${documentId}`
      const existing = await this.store.read<StoredDocument>(owner, sessionId, key)
      const doc: StoredDocument = existing ?? { owner, sessionId, documentId, source, target: authorized.target, revision: 0, nextOrdinal: 1, marks: [], deleted: [] }
      // A newly opened equivalent authorization can renew a revoked old binding, never its coordinates.
      const again = await this.authorize(owner, sessionId, source)
      if (again.target !== authorized.target || again.workspace !== authorized.workspace) fail('forbidden', 'PPT 授权已变化。')
      doc.source = source
      await this.store.write(owner, sessionId, key, doc)
      this.current(owner)
      return { documentId, version: file.version, name: path.basename(authorized.target), slideSize: file.slideSize, slides: file.scene.slides, state: this.state(doc, file.version) }
    })
  }
  async mutate(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationState>> {
    return this.transaction(async owner => {
      const input = record(value), sessionId = identifier(input.sessionId), documentId = identifier(input.documentId)
      const { doc, file } = await this.currentDocument(owner, sessionId, documentId)
      if (input.version !== file.version) fail('stale', 'PPT 已变更版本，请重新定位标注。')
      if (revision(input.expectedStateRevision) !== doc.revision) fail('conflict', 'PPT 标注已变化，请刷新后重试。')
      if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 128) fail('invalid', '标注操作数量无效。')
      const next = structuredClone(doc)
      for (const raw of input.operations) {
        const operation = record(raw)
        if (operation.op === 'put' || operation.op === 'reanchor') {
          const old = operation.op === 'reanchor' ? next.marks.find(mark => mark.id === identifier(operation.markId)) : undefined
          if (operation.op === 'reanchor' && !old) fail('invalid', '重新定位的标注不存在。')
          const draft = parsePptxAnnotationMarkDraft(operation.op === 'reanchor' ? { ...record(operation.location), id: old!.id, comment: old!.comment } : operation.mark)
          const slide = file.scene.slides[draft.slideIndex]
          if (!slide || slide.part !== draft.slidePart) fail('invalid', '标注页码与 PPT 物理页面不一致。')
          const nodes = draft.nodeIds.map(id => slide!.nodes.find(node => node.id === id || node.nodeId === id))
          if (nodes.some(node => !node)) fail('invalid', '标注对象不属于此页面。')
          draft.nodeIds = nodes.map(node => node!.id)
          const previous = draft.id ? next.marks.find(mark => mark.id === draft.id) : undefined
          if (draft.id && !previous) fail('invalid', '不能自定义或复用标注编号。')
          if (previous?.fileVersion !== undefined && previous.fileVersion !== file.version && operation.op !== 'reanchor') fail('reanchor-required', '旧版本标注需要重新定位后才能修改。')
          const mark: PptxAnnotationMark = { ...draft, id: previous?.id ?? randomUUID(), ordinal: previous?.ordinal ?? next.nextOrdinal++, revision: (previous?.revision ?? 0) + 1, fileVersion: file.version, stale: false }
          if (previous) next.marks[next.marks.indexOf(previous)] = mark
          else { if (next.marks.length >= 256) fail('invalid', '此 PPT 标注过多。'); next.marks.push(mark) }
        } else if (operation.op === 'remove' || operation.op === 'restore') {
          const markId = identifier(operation.markId), from = operation.op === 'remove' ? next.marks : next.deleted, to = operation.op === 'remove' ? next.deleted : next.marks
          const index = from.findIndex(mark => mark.id === markId)
          if (index < 0) fail('invalid', '标注已不存在。')
          const [mark] = from.splice(index, 1); mark!.revision++; to.push(mark!)
        } else fail('invalid', '不支持此 PPT 标注操作。')
      }
      next.revision++
      const fresh = await this.currentDocument(owner, sessionId, documentId)
      if (fresh.file.version !== file.version) fail('stale', '保存标注时 PPT 已变化。')
      await this.store.write(owner, sessionId, `document:${documentId}`, next)
      this.current(owner)
      return this.state(next, file.version)
    })
  }
  private async assertActive(owner: string, prepared: Prepared, readOnly = false) {
    this.current(owner)
    if (prepared.cancelled || this.cancellations.has(this.key(owner, prepared.sessionId, prepared.sendId)) || await (readOnly ? this.store.readExisting(owner, prepared.sessionId, `cancel:${prepared.sendId}`) : this.store.read(owner, prepared.sessionId, `cancel:${prepared.sendId}`))) fail('cancelled', '本次 PPT 修改已取消，输入草稿已保留。')
    for (const doc of prepared.documents) {
      const auth = await this.authorize(owner, prepared.sessionId, doc.source)
      if (auth.target !== doc.target || auth.workspace !== prepared.workspace) fail('forbidden', 'PPT 来源授权已变化。')
    }
  }
  private async prepared(owner: string, sessionId: string, id: string) {
    const prepared = await this.store.read<Prepared>(owner, sessionId, `prepared:${id}`)
    if (!prepared || prepared.owner !== owner || prepared.sessionId !== sessionId || prepared.preparedId !== id) fail('forbidden', '此 PPT 修改任务不属于当前会话。')
    await this.assertActive(owner, prepared!)
    return prepared!
  }
  private async savePrepared(prepared: Prepared) {
    await this.store.write(prepared.owner, prepared.sessionId, `prepared:${prepared.preparedId}`, prepared)
    for (const doc of prepared.documents) await this.store.write(prepared.owner, prepared.sessionId, `output:${doc.outputRelativePath}`, { preparedId: prepared.preparedId, documentId: doc.documentId })
    await this.store.write(prepared.owner, prepared.sessionId, `send:${prepared.sendId}`, prepared.preparedId)
    this.current(prepared.owner)
  }
  private async freshReferences(owner: string, input: PptxAnnotationPrepareInput) {
    const grouped = new Map<string, { fileVersion: string; references: PptxAnnotationPreparedReference[] }>()
    for (const raw of input.references) {
      const { expectedStateRevision, ...rawReference } = record(raw)
      const ref = parsePptxAnnotationReference(rawReference, input.sendingSessionId)
      revision(expectedStateRevision)
      const existing = grouped.get(ref.documentId)
      if (existing && existing.fileVersion !== ref.fileVersion) fail('conflict', '同一 PPT 的不同版本不能合并为一次修改。')
      const group = existing ?? { fileVersion: ref.fileVersion, references: [] }
      group.references.push({ ...ref, expectedStateRevision }); grouped.set(ref.documentId, group)
    }
    if (grouped.size > 16) fail('invalid', '一次修改最多引用 16 份 PPT。')
    const documents: Array<Omit<PreparedDocument, 'inputRelativePath' | 'outputRelativePath' | 'inputVersion'> & { bytes: Buffer }> = []
    let total = 0
    for (const [documentId, group] of grouped) {
      const { doc, file, target } = await this.currentDocument(owner, input.sendingSessionId, documentId)
      if (file.version !== group.fileVersion) fail('stale', 'PPT 已变化，旧定位未应用；请重新定位后发送。')
      const marks: PreparedDocument['marks'] = []
      for (const ref of group.references) {
        if (ref.expectedStateRevision !== doc.revision) fail('conflict', '标注备注已变化，请核对当前内容后重新发送。')
        const mark = doc.marks.find(item => item.id === ref.markId)
        if (!mark) fail('invalid', '引用的标注已被删除。')
        if (mark!.fileVersion !== file.version) fail('reanchor-required', '标注仍指向旧 PPT 版本，请重新定位。')
        if (marks.some(item => item.id === mark!.id)) continue
        const slide = file.scene.slides[mark!.slideIndex]
        if (!slide || slide.part !== mark!.slidePart) fail('stale', '标注页面已变化。')
        const nodeIds = new Set(mark!.nodeIds.map(id => id.split('#node:').at(-1)))
        const sourceText = slide!.fields.filter(field => !nodeIds.size || nodeIds.has(field.nodeId)).map(field => field.text).join('\n').slice(0, 8000)
        const sourceNodes = slide!.nodes.filter(node => nodeIds.has(node.nodeId)).map(({ id, nodeId, type, name, geometry, parentId }) => ({ id, nodeId, type, name, geometry, ...(parentId ? { parentId } : {}) }))
        marks.push({ ...structuredClone(mark!), sourceText, sourceNodes })
      }
      total += file.bytes.length
      if (total > 256 * 1024 * 1024) fail('invalid', 'PPT 修改批次文件总量过大。')
      documents.push({ documentId, fileVersion: file.version, markIds: marks.map(mark => mark.id), source: doc.source, target, marks, bytes: file.bytes, slideSize: file.slideSize })
    }
    return documents
  }
  async prepare(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationPrepareValue>> {
    return this.transaction(async owner => {
      const input = record(value) as PptxAnnotationPrepareInput
      const sessionId = identifier(input.sendingSessionId), sendId = identifier(input.sendId)
      revision(input.expectedDraftRev)
      if (!Array.isArray(input.references) || !input.references.length || input.references.length > 256) fail('invalid', 'PPT 标注引用数量无效。')
      if (this.cancellations.has(this.key(owner, sessionId, sendId)) || await this.store.read(owner, sessionId, `cancel:${sendId}`)) fail('cancelled', '本次 PPT 修改已取消。')
      // Input bytes and current comments are deliberately NOT reread for an identical retry.
      const fingerprint = annotationHash(canonicalJson({ expectedDraftRev: input.expectedDraftRev, references: input.references, retryOfPreparedId: input.retryOfPreparedId ?? null }))
      const existingId = await this.store.read<string>(owner, sessionId, `send:${sendId}`)
      if (existingId) {
        const existing = await this.prepared(owner, sessionId, existingId)
        if (existing.fingerprint !== fingerprint) fail('conflict', '相同发送标识的内容已变化，请重新发送。')
        return structuredClone(existing.value)
      }
      const root = await this.options.resolveWorkspace(sessionId)
      if (!root) fail('forbidden', '真实会话工作区不可用。')
      const workspace = await realpath(root!), preparedId = randomUUID()
      let frozen: Awaited<ReturnType<PptxAnnotationService['freshReferences']>>
      if (input.retryOfPreparedId) {
        const original = await this.prepared(owner, sessionId, identifier(input.retryOfPreparedId))
        const expected = original.value.serializedReferences.map(item => JSON.stringify(item.reference))
        for (const raw of input.references) { const { expectedStateRevision: _revision, ...ref } = raw; if (!expected.includes(JSON.stringify(parsePptxAnnotationReference(ref, sessionId)))) fail('conflict', '重试必须使用原修改任务的标注快照。') }
        if (new Set(input.references.map(raw => raw.documentId + ':' + raw.markId)).size !== expected.length) fail('conflict', '重试标注与原修改任务不一致。')
        frozen = []
        for (const doc of original.documents) {
          const snapshot = await this.stagedFile(original, doc.inputRelativePath)
          if (snapshot.version !== doc.inputVersion) fail('conflict', '原修改任务的输入快照已变化。')
          frozen.push({ ...doc, bytes: snapshot.bytes })
        }
      } else frozen = await this.freshReferences(owner, input)
      // The batch UUID is not published yet: no legitimate submission can predate this watermark.
      // This also bounds recovery in sessions containing years of unrelated tool history.
      const baseline = await this.options.readHistory({ sessionId, maxMessages: 100 })
      if (!Array.isArray(baseline.events)) fail('unavailable', '无法确认当前真实会话的提交记录。')
      const historyFloor = Math.max(-1, ...baseline.events.filter(event => Number.isSafeInteger(event.seq) && event.seq >= 0).map(event => event.seq))
      this.current(owner)
      if (this.cancellations.has(this.key(owner, sessionId, sendId))) fail('cancelled', '本次 PPT 修改已取消。')
      const directory = await annotationDirectory(workspace, `.ework/pptx-annotations/${preparedId}`)
      const outputDirectory = await annotationDirectory(workspace, `PPT标注修改/${preparedId}`)
      const documents: PreparedDocument[] = []
      for (const [index, source] of frozen.entries()) {
        const name = path.basename(source.target, path.extname(source.target)).replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 80) || 'PPT'
        const inputTarget = path.join(directory, `${index + 1}-source.pptx`), outputTarget = path.join(outputDirectory, `${index + 1}-${name}-修改版.pptx`)
        await annotationWriteExclusive(inputTarget, source.bytes); await chmod(inputTarget, 0o400)
        const { bytes: _bytes, ...doc } = source
        documents.push({ ...doc, inputVersion: annotationHash(source.bytes), inputRelativePath: path.relative(workspace, inputTarget).split(path.sep).join('/'), outputRelativePath: path.relative(workspace, outputTarget).split(path.sep).join('/') })
      }
      const manifestRelativePath = `.ework/pptx-annotations/${preparedId}/manifest.json`
      const manifest = JSON.stringify({ version: 1, preparedId, instruction: '读取输入副本及全部标注。使用已有公司 PPT 技能修改，保留未涉及页面。只写各自指定的输出路径，不覆盖原件和输入副本。输出必须是实际可打开的 PPTX，并在最终回复逐一提供精确输出链接。', documents: documents.map(({ target: _target, source: _source, inputVersion: _version, ...doc }) => doc) }, null, 2)
      await annotationWriteExclusive(path.join(directory, 'manifest.json'), manifest); await chmod(path.join(directory, 'manifest.json'), 0o400)
      const references = input.references.map(({ expectedStateRevision: _revision, ...ref }) => parsePptxAnnotationReference(ref, sessionId))
      const serializedReferences = references.map(reference => {
        const doc = documents.find(doc => doc.documentId === reference.documentId)!, mark = doc.marks.find(mark => mark.id === reference.markId)!
        return { reference, text: `[PPT 标注 ${mark.ordinal} · 第 ${mark.slideIndex + 1} 页]\n修改清单：\`${manifestRelativePath}\`\n输入副本：\`${doc.inputRelativePath}\`\n必须另存到：\`${doc.outputRelativePath}\`\n按清单里的物理页、位置和备注完成真实 PPT 修改；保留原件。` }
      })
      const prepared: Prepared = { owner, sessionId, sendId, fingerprint, preparedId, workspace, historyFloor, manifestHash: annotationHash(manifest), value: { preparedId, manifestRelativePath, documents: documents.map(({ documentId, fileVersion, inputRelativePath, outputRelativePath, markIds }) => ({ documentId, fileVersion, inputRelativePath, outputRelativePath, markIds })), serializedReferences }, documents }
      await this.assertActive(owner, prepared)
      // Catch a source change during staging before publishing this prepared batch.
      if (!input.retryOfPreparedId) for (const doc of documents) if ((await readAnnotationPptx(doc.target)).version !== doc.fileVersion) fail('stale', '准备修改期间原 PPT 已变化。')
      await this.savePrepared(prepared)
      await this.assertActive(owner, prepared)
      return structuredClone(prepared.value)
    })
  }
  private async stagedFile(prepared: Prepared, relative: string) {
    const target = path.resolve(prepared.workspace, relative), canonical = await realpath(target)
    if (!annotationContains(prepared.workspace, canonical) || canonical !== target) fail('invalid-output', 'PPT 修改文件路径已变化。')
    return readAnnotationPptx(target)
  }
  private async verifyManifest(prepared: Prepared) {
    const target = path.resolve(prepared.workspace, prepared.value.manifestRelativePath), canonical = await realpath(target), info = await lstat(target)
    if (target !== canonical || !annotationContains(prepared.workspace, target) || !info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024 || annotationHash(await readFile(target)) !== prepared.manifestHash) fail('conflict', '本次修改的不可变清单已变化，未采用候选文件。')
  }
  private async history(owner: string, prepared: Prepared, readOnly = false): Promise<PptxAnnotationHistoryEvent[]> {
    await this.verifyManifest(prepared)
    const events = new Map<number, PptxAnnotationHistoryEvent>()
    let beforeSeq: number | undefined
    for (let page = 0; page < 100; page++) {
      await this.assertActive(owner, prepared, readOnly)
      const history = await this.options.readHistory({ sessionId: prepared.sessionId, maxMessages: 100, ...(beforeSeq === undefined ? {} : { beforeSeq }) })
      await this.assertActive(owner, prepared, readOnly)
      if (!Array.isArray(history.events)) fail('unavailable', '实际提交记录暂不可读取。')
      const part = history.events.filter(event => Number.isFinite(event.seq) && typeof event.type === 'string').sort((a, b) => a.seq - b.seq)
      for (const event of part) if (event.seq > prepared.historyFloor) events.set(event.seq, event)
      // Read through the complete containing turn, not just the matching user event's page.
      if (!history.hasMore || !part.length || part[0]!.seq <= prepared.historyFloor) return [...events.values()].sort((a, b) => a.seq - b.seq)
      const oldest = part[0]!.seq
      if (beforeSeq !== undefined && oldest >= beforeSeq) fail('unavailable', '实际提交记录分页没有前进。')
      beforeSeq = oldest
    }
    return fail('unavailable', '提交历史过长，暂时无法安全确认本次 PPT 修改。')
  }
  private proof(events: PptxAnnotationHistoryEvent[], prepared: Prepared, hint?: string): PptxAnnotationBindValue {
    const owns = (message: any) => isHuman(message) && textContent(message).includes('`' + prepared.value.manifestRelativePath + '`')
    const messages = events.filter(event => event.type === 'user/message' && owns(userMessage(event)))
    const queued = events.filter(event => event.type === 'agent/inbox/spliced').flatMap(event => Array.isArray(event.data?.inserted) ? event.data.inserted : []).filter(owns)
    const rpcs = new Set([...messages.map(event => userMessage(event)), ...queued].map(message => message.source?.rpcId).filter((id): id is string => typeof id === 'string' && !!id))
    if (rpcs.size > 1) fail('ambiguous', '此修改清单存在多次实际提交，无法安全判断交付归属。')
    const rpc = rpcs.values().next().value as string | undefined
    if (!rpc || (hint && hint !== rpc)) return { status: 'pending', ...(hint ? { submissionId: hint } : {}) }
    const consumed = messages.filter(event => userMessage(event).source.rpcId === rpc)
    if (consumed.length > 1) fail('ambiguous', '此 PPT 修改请求存在多条消费记录。')
    if (!consumed.length) return { status: 'queued', submissionId: rpc, userMessageId: queued.find(message => message.source.rpcId === rpc)?.id }
    const event = consumed[0]!, message = userMessage(event)
    const start = events.filter(item => item.seq < event.seq && item.type === 'step/start').at(-1)
    const turn = start?.data?.turn, step = start?.data?.step
    const alreadyEnded = start && events.some(item => item.seq > start.seq && item.seq < event.seq && ((item.type === 'turn/end' && item.data?.turn === turn) || (item.type === 'step/end' && item.data?.turn === turn && item.data?.step === step)))
    if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step) || turn <= 0 || step <= 0 || alreadyEnded) return { status: 'pending', submissionId: rpc, userMessageId: message.id, userSeq: event.seq }
    return { status: 'bound', submissionId: rpc, userMessageId: message.id, userSeq: event.seq, turn, step }
  }
  async bindSubmission(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationBindValue>> {
    return this.transaction(async owner => {
      const input = record(value), sessionId = identifier(input.sendingSessionId), prepared = await this.prepared(owner, sessionId, identifier(input.preparedId))
      const hint = input.submissionId === undefined ? undefined : identifier(input.submissionId)
      if (prepared.binding?.status !== 'pending' && hint && prepared.binding?.submissionId && hint !== prepared.binding.submissionId) fail('conflict', '修改任务已绑定另一次真实提交。')
      const proof = this.proof(await this.history(owner, prepared), prepared, hint ?? prepared.binding?.submissionId)
      if (proof.status !== 'pending') { prepared.binding = proof; await this.savePrepared(prepared) }
      return proof
    })
  }
  private delivery(events: PptxAnnotationHistoryEvent[], proof: PptxAnnotationBindValue) {
    const after = events.filter(event => event.seq > proof.userSeq!)
    const cutoff = after.find(event => event.type === 'user/message' && isHuman(userMessage(event)) && userMessage(event).source.rpcId !== proof.submissionId)
    const end = after.find(event => event.type === 'turn/end' && event.data?.turn === proof.turn)
    const limit = Math.min(cutoff?.seq ?? Infinity, end?.seq ?? Infinity)
    const text = after.filter(event => event.seq < limit && event.type === 'assistant/message' && event.data?.turn === proof.turn && Number.isSafeInteger(event.data?.step) && event.data.step >= proof.step!).map(event => textContent(event.data.message)).join('\n')
    if (cutoff && (!end || cutoff.seq < end.seq)) return { status: 'failed' as const, text }
    if (!end) return { status: 'pending' as const, text }
    return { status: end.data?.reason?.kind === 'completed' ? 'completed' as const : 'failed' as const, text }
  }
  async complete(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationCompleteValue>> {
    return this.transaction(async owner => {
      const input = record(value), sessionId = identifier(input.sendingSessionId), submissionId = identifier(input.submissionId)
      const prepared = await this.prepared(owner, sessionId, identifier(input.preparedId))
      const events = await this.history(owner, prepared), proof = this.proof(events, prepared, submissionId)
      if (proof.status !== 'bound') return { status: 'pending', documents: prepared.documents.map(doc => ({ documentId: doc.documentId, status: 'pending' as const })) }
      if (prepared.binding?.submissionId && prepared.binding.submissionId !== submissionId) fail('conflict', 'PPT 修改交付不属于已绑定的提交。')
      prepared.binding = proof
      const delivery = this.delivery(events, proof)
      if (delivery.status === 'pending') { await this.savePrepared(prepared); return { status: 'pending', documents: prepared.documents.map(doc => ({ documentId: doc.documentId, status: 'pending' as const })) } }
      const documents: PptxAnnotationCompleteValue['documents'] = []
      for (const doc of prepared.documents) {
        const previous = prepared.completed?.documents.find(item => item.documentId === doc.documentId)?.versionRecord
        try {
          if (delivery.status !== 'completed') fail('submission-unconfirmed', '对应实际任务未完成，或后续独立请求已开始；未采用此候选文件。')
          // A bare mention is not a public delivered link. Only this preallocated output is admissible.
          const links = [...delivery.text.matchAll(/\[[^\]\n]*\]\(<?([^\n>]+?)>?\)/g)].map(match => { try { return decodeURIComponent(match[1]!) } catch { return match[1]! } })
          const expected = path.resolve(prepared.workspace, doc.outputRelativePath)
          if (!links.some(link => link === doc.outputRelativePath || link === expected || link === 'file://' + expected || link === './' + doc.outputRelativePath)) fail('submission-unconfirmed', '实际回复没有交付此修改任务指定的 PPT 文件。')
          const source = await readAnnotationPptx(doc.target)
          if (source.version !== doc.fileVersion) fail('source-changed', '原 PPT 已发生外部修改；新候选文件已保留，请人工核对。')
          const before = await this.stagedFile(prepared, doc.inputRelativePath)
          if (before.version !== doc.inputVersion) fail('conflict', '本次修改的输入快照已变化。')
          let output: Awaited<ReturnType<typeof readAnnotationPptx>>
          try { output = await this.stagedFile(prepared, doc.outputRelativePath) } catch { fail('invalid-output', '实际输出不是可安全打开的独立 PPTX 文件。') }
          if (previous && previous.version !== output!.version) fail('invalid-output', '首次验收的 PPT 输出已被替换，原版本记录已保留；请核对候选文件。')
          if (output!.inode === source.inode || !annotationContentChanged(before, output!)) fail('unchanged', '输出 PPT 没有实际内容变化，未登记为修改成功。')
          await this.assertActive(owner, prepared)
          if ((await readAnnotationPptx(doc.target)).version !== doc.fileVersion) fail('source-changed', '校验期间原 PPT 已变化，候选文件已保留。')
          const versionRecord: PptxAnnotationVersionRecord = previous ?? { id: randomUUID(), sourceDocumentId: doc.documentId, sourceVersion: doc.fileVersion, documentId: annotationHash(expected), version: output!.version, relativePath: doc.outputRelativePath, preparedId: prepared.preparedId, submissionId, createdAt: (this.options.now?.() ?? new Date()).toISOString(), reanchorRequired: true }
          await this.store.write(owner, sessionId, `version:${versionRecord.id}`, versionRecord)
          documents.push({ documentId: doc.documentId, status: 'success', newFileRelativePath: doc.outputRelativePath, versionRecord })
        } catch (error) { documents.push({ documentId: doc.documentId, status: 'failed', code: error instanceof AnnotationError ? error.code : 'invalid-output', error: error instanceof Error ? error.message : 'PPT 输出校验失败。', ...(previous ? { versionRecord: previous } : {}) }) }
      }
      const successes = documents.filter(doc => doc.status === 'success').length
      const completed: PptxAnnotationCompleteValue = { status: successes === documents.length ? 'success' : successes ? 'partial' : 'failed', documents }
      await this.assertActive(owner, prepared)
      prepared.completed = completed; await this.savePrepared(prepared)
      return completed
    })
  }
  async lookupOutput(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationOutputValue>> {
    return this.transaction(async owner => {
      const input = record(value), sessionId = identifier(input.sendingSessionId), location = identifier(input.path)
      const root = await this.options.resolveWorkspace(sessionId)
      if (!root) return null
      const workspace = await realpath(root), rawRoot = path.resolve(root), rawTarget = path.resolve(rawRoot, location)
      const canonicalTarget = path.resolve(workspace, location)
      // Preserve preallocated identity even if its output has since become a bad symlink.
      // Resolve the trusted workspace alias (/var vs /private/var), never an unknown file alias.
      const relative = annotationContains(rawRoot, rawTarget) ? path.relative(rawRoot, rawTarget).split(path.sep).join('/') : annotationContains(workspace, canonicalTarget) ? path.relative(workspace, canonicalTarget).split(path.sep).join('/') : null
      if (relative === null) return null
      const index = await this.store.read<{ preparedId: string; documentId: string }>(owner, sessionId, `output:${relative}`)
      if (!index) return null
      const prepared = await this.store.read<Prepared>(owner, sessionId, `prepared:${index.preparedId}`)
      if (!prepared || prepared.owner !== owner || prepared.sessionId !== sessionId || prepared.workspace !== workspace || !prepared.documents.some(doc => doc.documentId === index.documentId && doc.outputRelativePath === relative)) return null
      this.current(owner)
      const base = { preparedId: prepared.preparedId, documentId: index.documentId, ...(prepared.binding?.submissionId ? { submissionId: prepared.binding.submissionId } : {}) }
      if (prepared.cancelled || await this.store.read(owner, sessionId, `cancel:${prepared.sendId}`)) return { ...base, status: 'failed', code: 'cancelled', error: '此 PPT 修改已取消。' }
      const result = prepared.completed?.documents.find(doc => doc.documentId === index.documentId)
      if (result?.status === 'success') {
        try {
          const output = await this.stagedFile(prepared, relative)
          if (output.version !== result.versionRecord?.version) throw Error('输出文件已被替换。')
        } catch { return { ...base, status: 'failed', code: 'invalid-output', error: '已核验的 PPT 输出已变化或不可读取，请重新核对候选文件。' } }
        this.current(owner)
      }
      return result ? { ...base, ...result } : { ...base, status: 'pending' }
    })
  }
  async messagePresentation(value: unknown): Promise<PptxAnnotationResult<PptxAnnotationMessagePresentationValue>> {
    return this.transaction(async owner => {
      let input: ReturnType<typeof parsePptxAnnotationMessagePresentationInput>
      try { input = parsePptxAnnotationMessagePresentationInput(value) } catch { return fail('invalid', '消息呈现凭据无效。') }
      const sessionId = input.sendingSessionId, prepared = await this.store.readExisting<Prepared>(owner, sessionId, `prepared:${input.preparedId}`)
      if (!prepared || prepared.owner !== owner || prepared.sessionId !== sessionId || prepared.preparedId !== input.preparedId) return null
      await this.assertActive(owner, prepared, true)
      const events = await this.history(owner, prepared, true)
      // Native Bubble joins text parts without separators. Normalize only this read-only proof view.
      const nativeMessage = (message: any) => ({ ...message, content: [{ type: 'text', text: Array.isArray(message?.content) ? message.content.filter((part: any) => part?.type === 'text' && typeof part.text === 'string').map((part: any) => part.text).join('') : '' }] })
      const proofEvents = events.map(event => event.type === 'user/message' ? { ...event, data: nativeMessage(userMessage(event)) } : event.type === 'agent/inbox/spliced' && Array.isArray(event.data?.inserted) ? { ...event, data: { ...event.data, inserted: event.data.inserted.map(nativeMessage) } } : event)
      const proof = this.proof(proofEvents, prepared, input.submissionId)
      if (proof.status !== 'bound' || proof.submissionId !== input.submissionId || proof.userSeq !== input.userSeq) return null
      if (prepared.binding?.submissionId && prepared.binding.submissionId !== proof.submissionId || prepared.binding?.status === 'bound' && prepared.binding.userSeq !== proof.userSeq) return null
      const event = proofEvents.find(event => event.type === 'user/message' && event.seq === proof.userSeq), message = event && userMessage(event)
      if (!isHuman(message) || textContent(message) !== input.text) return null
      const spans: NonNullable<PptxAnnotationMessagePresentationValue>['spans'] = []
      for (const item of prepared.value.serializedReferences) {
        const raw = item.text, start = input.text.indexOf(raw)
        if (!raw || start < 0 || input.text.indexOf(raw, start + 1) !== -1) return null
        const reference = parsePptxAnnotationReference(item.reference, sessionId), doc = prepared.documents.find(doc => doc.documentId === reference.documentId && doc.fileVersion === reference.fileVersion), mark = doc?.marks.find(mark => mark.id === reference.markId && mark.fileVersion === reference.fileVersion)
        if (!mark || !Number.isSafeInteger(mark.ordinal) || mark.ordinal <= 0) return null
        const name = mark.kind === 'rect' ? '框选区域' : mark.sourceNodes[0]?.name?.trim().slice(0, 60) || '位置'
        spans.push({ kind: 'pptx-annotation', start, end: start + raw.length, text: raw, reference, ordinal: mark.ordinal, label: `第${mark.slideIndex + 1}页 · ${name}`, comment: mark.comment })
      }
      spans.sort((a, b) => a.start - b.start)
      if (!spans.length || spans.some((span, index) => span.start < (spans[index - 1]?.end ?? 0) || span.end > input.text.length || input.text.slice(span.start, span.end) !== span.text)) return null
      const result: NonNullable<PptxAnnotationMessagePresentationValue> = { preparedId: prepared.preparedId, submissionId: proof.submissionId!, userSeq: proof.userSeq!, text: input.text, spans }
      const skill = await this.options.presentationSkill?.('builtin:efund-ppt-maker').catch(() => null)
      if (skill?.id === 'builtin:efund-ppt-maker' && /^ework-skill-[a-f0-9]{16}$/.test(skill.invocationName) && typeof skill.label === 'string' && skill.label.trim() && skill.label.length <= 200 && !/[\u0000-\u001f]/.test(skill.label)) {
        const raw = '/' + skill.invocationName, start = input.text.length - raw.length
        if (input.text.endsWith(raw) && input.text.indexOf(raw) === start && spans.every(span => span.end <= start)) result.skill = { start, end: input.text.length, text: raw, id: 'builtin:efund-ppt-maker', label: skill.label }
      }
      await this.assertActive(owner, prepared, true)
      return result
    })
  }
  async cancel(value: unknown): Promise<PptxAnnotationResult<{ cancelled: boolean }>> {
    const input = record(value), sessionId = identifier(input.sessionId), sendId = identifier(input.sendId), owner = this.owner()
    this.cancellations.add(this.key(owner, sessionId, sendId))
    return this.transaction(async current => {
      if (current !== owner) fail('forbidden', '账户已切换。')
      await this.store.write(owner, sessionId, `cancel:${sendId}`, true)
      const id = await this.store.read<string>(owner, sessionId, `send:${sendId}`)
      if (id) { const prepared = await this.store.read<Prepared>(owner, sessionId, `prepared:${id}`); if (prepared) { prepared.cancelled = true; await this.savePrepared(prepared) } }
      return { cancelled: true }
    })
  }
}

export function registerPptxAnnotationHandlers(options: { ipcMain: { removeHandler(channel: string): void; handle(channel: string, handler: (event: any, value: unknown) => unknown): unknown }; getMainWindow(): TrustedWindow | undefined; service: PptxAnnotationService }) {
  for (const action of ['open', 'mutate', 'prepare', 'bindSubmission', 'complete', 'lookupOutput', 'messagePresentation', 'cancel'] as const) {
    const channel = `pptx:annotation:${action}`
    options.ipcMain.removeHandler(channel)
    registerTrustedMainWindowHandler(options.ipcMain, channel, options.getMainWindow, (_event, value: unknown) => options.service[action](value))
  }
}
