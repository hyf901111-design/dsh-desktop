import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fixture } from './fixtures/pptx'
import { PptxArchive } from '../src/main/pptx/archive'

const modulePath = '../src/main/pptx/annotations'
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'ppt-annotations-')); dirs.push(root)
  const workspace = path.join(root, 'workspace')
  const { mkdir } = await import('node:fs/promises'); await mkdir(workspace)
  const bytes = new PptxArchive(fixture()).replace(new Map([['ppt/presentation.xml', Buffer.from(new PptxArchive(fixture()).read('ppt/presentation.xml').toString().replace('</p:presentation>', '<p:sldSz cx="12192000" cy="6858000"/></p:presentation>'))]]))
  await writeFile(path.join(workspace, 'deck.pptx'), bytes)
  let owner = 'alice', allowed = true
  const events: any[] = []
  const options = { root: path.join(root, 'state'), owner: () => owner, resolveWorkspace: async (id: string) => id === 'session' && allowed ? workspace : null,
    resolveAuthorizedSource: async (sessionId: string, source: any) => allowed && sessionId === 'session' && source.authorizationId === 'grant' ? { path: path.join(workspace, 'deck.pptx'), root: workspace } : null,
    readHistory: async () => ({ events: [...events], hasMore: false }),
  }
  const api = await import(modulePath).catch(() => ({} as Record<string, any>))
  expect(api.PptxAnnotationService).toBeTypeOf('function')
  const service = new api.PptxAnnotationService(options)
  return { root, workspace, bytes, options, service, events, owner: (value: string) => { owner = value }, allow: (value: boolean) => { allowed = value } }
}
const source = { sessionId: 'session', source: { kind: 'workspace', relativePath: 'deck.pptx' } }
const point = { slideIndex: 0, slidePart: 'ppt/slides/slide2.xml', kind: 'point', region: { x: 0.25, y: 0.5 }, nodeIds: ['2'], comment: '更新此处标题及数据' }
async function opened(f: Awaited<ReturnType<typeof setup>>) { const result = await f.service.open(source); expect(result.ok).toBe(true); return result.value }
async function marked(f: Awaited<ReturnType<typeof setup>>) {
  const doc = await opened(f)
  const result = await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 0, operations: [{ op: 'put', mark: point }] })
  expect(result.ok).toBe(true)
  return { doc, state: result.value, reference: { version: 1, sessionId: 'session', documentId: doc.documentId, fileVersion: doc.version, markId: result.value.marks[0].id, expectedStateRevision: result.value.revision } }
}

describe('durable PPT annotation source and state', () => {
  it('reads true physical page order and size without edit tokens or modifying the original', async () => {
    const f = await setup(), doc = await opened(f)
    expect(doc.slideSize).toEqual({ width: 1280, height: 720 })
    expect(doc.slides.map((slide: any) => slide.part)).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml'])
    expect(doc).not.toHaveProperty('editToken'); expect(doc).not.toHaveProperty('basisToken')
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
  })
  it('persists stable ordinals, rejects stale CAS and preserves deleted numbering on restore', async () => {
    const f = await setup(), { doc, state } = await marked(f), id = state.marks[0].id
    const mutate = (revision: number, operations: any[]) => f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: revision, operations })
    expect(await mutate(0, [{ op: 'remove', markId: id }])).toMatchObject({ ok: false, code: 'conflict' })
    expect((await mutate(1, [{ op: 'remove', markId: id }])).value.marks).toEqual([])
    expect((await mutate(2, [{ op: 'put', mark: { ...point, slideIndex: 1, slidePart: 'ppt/slides/slide1.xml' } }])).value.marks[0].ordinal).toBe(2)
    expect((await mutate(3, [{ op: 'restore', markId: id }])).value.marks.map((mark: any) => mark.ordinal)).toEqual([1, 2])
    const api = await import(modulePath); const restart = new api.PptxAnnotationService(f.options)
    expect((await restart.open(source)).value.state.marks.map((mark: any) => mark.ordinal)).toEqual([1, 2])
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
  })
  it('rechecks real session, owner, revoked authorization and canonical path at each operation', async () => {
    const f = await setup(), { doc, reference } = await marked(f)
    expect(await f.service.open({ ...source, sessionId: 'other' })).toMatchObject({ ok: false })
    expect(await f.service.open({ ...source, source: { kind: 'workspace', relativePath: '../escape.pptx' } })).toMatchObject({ ok: false })
    const external = path.join(f.root, 'outside.pptx'); await writeFile(external, f.bytes); await symlink(external, path.join(f.workspace, 'escape.pptx'))
    expect(await f.service.open({ ...source, source: { kind: 'workspace', relativePath: 'escape.pptx' } })).toMatchObject({ ok: false })
    const request = { sendingSessionId: 'session', sendId: 'send-1', expectedDraftRev: 4, references: [reference] }
    f.owner('bob'); expect(await f.service.prepare(request)).toMatchObject({ ok: false })
    f.owner('alice'); f.allow(false); expect(await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 1, operations: [{ op: 'put', mark: point }] })).toMatchObject({ ok: false })
  })
  it('does not silently reuse old page coordinates after an external version change', async () => {
    const f = await setup(), { reference } = await marked(f)
    const archive = new PptxArchive(f.bytes), changed = archive.replace(new Map([['ppt/slides/slide2.xml', Buffer.from(archive.read('ppt/slides/slide2.xml').toString().replace('年度', '新年度'))]]))
    await writeFile(path.join(f.workspace, 'deck.pptx'), changed)
    expect((await opened(f)).state.marks[0].stale).toBe(true)
    expect(await f.service.prepare({ sendingSessionId: 'session', sendId: 'stale', expectedDraftRev: 1, references: [reference] })).toMatchObject({ ok: false, code: 'stale' })
  })
})

function changedBytes(bytes: Uint8Array, metadataOnly = false) {
  const archive = new PptxArchive(bytes), part = metadataOnly ? 'ppt/presentation.xml' : 'ppt/slides/slide2.xml'
  const text = archive.read(part).toString()
  return archive.replace(new Map([[part, Buffer.from(metadataOnly ? text.replace('<p:presentation ', '<p:presentation ignored="true" ') : text.replace('年度', '修订年度'))]]))
}
function ledger(prepared: any, output: string, rpcId = 'rpc-actual', start = 1) {
  return [
    { seq: start, type: 'turn/start', data: { turn: 1 } },
    { seq: start + 1, type: 'step/start', data: { turn: 1, step: 1 } },
    { seq: start + 2, type: 'user/message', data: { id: 'user-1', role: 'user', source: { kind: 'user', rpcId }, content: [{ type: 'text', text: prepared.serializedReferences.map((r: any) => r.text).join('\n') }] } },
    { seq: start + 3, type: 'step/start', data: { turn: 1, step: 2 } },
    { seq: start + 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: `已完成：[下载修改版](${output})` }] } } },
    { seq: start + 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
}
async function preparedFixture(sendId = 'send-1') {
  const f = await setup(), markedValue = await marked(f)
  const request = { sendingSessionId: 'session', sendId, expectedDraftRev: 4, references: [markedValue.reference] }
  const result = await f.service.prepare(request); expect(result.ok).toBe(true)
  return { ...f, ...markedValue, request, prepared: result.value }
}
async function outputFile(f: Awaited<ReturnType<typeof preparedFixture>>, bytes = changedBytes(f.bytes)) {
  const relative = f.prepared.documents[0].outputRelativePath, target = path.join(f.workspace, relative)
  await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes)
  return relative
}

describe('immutable annotation submissions and verified new versions', () => {
  it('snapshots source/mark text, deduplicates a document and reuses an identical send after comments change', async () => {
    const f = await preparedFixture(), input = path.join(f.workspace, f.prepared.documents[0].inputRelativePath)
    expect(await readFile(input)).toEqual(f.bytes)
    const manifest = JSON.parse(await readFile(path.join(f.workspace, f.prepared.manifestRelativePath), 'utf8'))
    expect(manifest.documents[0].marks[0]).toMatchObject({ ordinal: 1, slideIndex: 0, slidePart: 'ppt/slides/slide2.xml', comment: '更新此处标题及数据' })
    expect(manifest.documents[0].marks[0].sourceText).toContain('年度报告')
    expect(manifest.documents[0].slideSize).toEqual({ width: 1280, height: 720 })
    expect(manifest.documents[0].marks[0].sourceNodes[0]).toMatchObject({ nodeId: '2', name: '标题', type: 'shape' })
    expect(f.prepared.documents).toHaveLength(1)
    await f.service.mutate({ sessionId: 'session', documentId: f.doc.documentId, version: f.doc.version, expectedStateRevision: 1, operations: [{ op: 'put', mark: { ...point, id: f.reference.markId, comment: '用户之后的新备注' } }] })
    expect(await f.service.prepare(f.request)).toEqual({ ok: true, value: f.prepared })
    expect((await readFile(path.join(f.workspace, f.prepared.manifestRelativePath), 'utf8'))).not.toContain('用户之后的新备注')
    expect(await f.service.prepare({ ...f.request, expectedDraftRev: 5 })).toMatchObject({ ok: false, code: 'conflict' })
  })
  it('creates an exclusive retry output while retaining the original immutable source and notes', async () => {
    const f = await preparedFixture(); await outputFile(f)
    const retry = await f.service.prepare({ ...f.request, sendId: 'send-retry', retryOfPreparedId: f.prepared.preparedId })
    expect(retry.ok).toBe(true)
    expect(retry.value.documents[0].outputRelativePath).not.toBe(f.prepared.documents[0].outputRelativePath)
    expect(await readFile(path.join(f.workspace, retry.value.documents[0].inputRelativePath))).toEqual(f.bytes)
    const manifest = JSON.parse(await readFile(path.join(f.workspace, retry.value.manifestRelativePath), 'utf8'))
    expect(manifest.documents[0].marks[0].comment).toBe('更新此处标题及数据')
    expect(await readFile(path.join(f.workspace, f.prepared.documents[0].outputRelativePath))).toEqual(changedBytes(f.bytes))
  })
  it('binds only a real prompt containing this exact batch, recovers after restart, and accepts a later assistant step', async () => {
    const f = await preparedFixture(), output = await outputFile(f)
    expect(await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-spoof' })).toMatchObject({ ok: true, value: { status: 'pending' } })
    f.events.push(...ledger(f.prepared, output))
    const api = await import(modulePath), restart = new api.PptxAnnotationService(f.options)
    expect(await restart.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId })).toMatchObject({ ok: true, value: { status: 'bound', submissionId: 'rpc-actual', userSeq: 3, turn: 1, step: 1 } })
    const result = await restart.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
    expect(result).toMatchObject({ ok: true, value: { status: 'success', documents: [{ status: 'success', newFileRelativePath: output, versionRecord: { sourceDocumentId: f.doc.documentId, sourceVersion: f.doc.version, reanchorRequired: true } }] } })
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
  })
  it('retains a queued RPC without binding it to an unrelated user or the next turn', async () => {
    const f = await preparedFixture()
    const queued = { id: 'queued-user', role: 'user', source: { kind: 'user', rpcId: 'rpc-queue' }, content: [{ type: 'text', text: f.prepared.serializedReferences[0].text }] }
    f.events.push({ seq: 1, type: 'agent/inbox/spliced', data: { inserted: [queued] } }, ...ledger({ serializedReferences: [{ text: '其他任务' }] }, 'other.pptx', 'rpc-other', 2))
    expect(await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-queue' })).toMatchObject({ ok: true, value: { status: 'queued', submissionId: 'rpc-queue' } })
    expect(await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-queue' })).toMatchObject({ ok: true, value: { status: 'pending' } })
  })
  it('rejects unchanged ZIP bytes and metadata-only differences even when an assistant says it is done', async () => {
    for (const output of ['same', 'metadata']) {
      const f = await preparedFixture(`send-${output}`), relative = await outputFile(f, output === 'same' ? f.bytes : changedBytes(f.bytes, true))
      f.events.push(...ledger(f.prepared, relative)); await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
      expect(await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'failed', documents: [{ status: 'failed', code: 'unchanged' }] } })
    }
  })
  it('does not adopt an output delivered only after another independent human message', async () => {
    const f = await preparedFixture(), output = await outputFile(f), events = ledger(f.prepared, output)
    events.splice(3, 0, { seq: 3.5, type: 'user/message', data: { id: 'later-human', role: 'user', source: { kind: 'user', rpcId: 'later' }, content: [{ type: 'text', text: '另外一个任务' }] } } as any)
    f.events.push(...events); await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
    expect(await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'failed', documents: [{ code: 'submission-unconfirmed' }] } })
  })
  it('keeps an output candidate but refuses success after the original source changes', async () => {
    const f = await preparedFixture(), output = await outputFile(f)
    f.events.push(...ledger(f.prepared, output)); await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
    await writeFile(path.join(f.workspace, 'deck.pptx'), changedBytes(f.bytes))
    expect(await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'failed', documents: [{ code: 'source-changed' }] } })
    expect(await readFile(path.join(f.workspace, output))).toEqual(changedBytes(f.bytes))
  })
  it('cancels a prepared batch durably without deleting marks or touching a newer draft', async () => {
    const f = await preparedFixture()
    expect(await f.service.cancel({ sessionId: 'session', sendId: 'send-1' })).toMatchObject({ ok: true, value: { cancelled: true } })
    const api = await import(modulePath), restart = new api.PptxAnnotationService(f.options)
    expect(await restart.prepare(f.request)).toMatchObject({ ok: false, code: 'cancelled' })
    expect((await restart.open(source)).value.state.marks).toHaveLength(1)
    expect(await restart.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc' })).toMatchObject({ ok: false, code: 'cancelled' })
  })
  it('recovers exact output ownership across restart while leaving ordinary files and other sessions untouched', async () => {
    const f = await preparedFixture(), api = await import(modulePath), restart = new api.PptxAnnotationService(f.options)
    const output = f.prepared.documents[0].outputRelativePath
    expect(await restart.lookupOutput({ sendingSessionId: 'session', path: 'ordinary.pptx' })).toEqual({ ok: true, value: null })
    expect(await restart.lookupOutput({ sendingSessionId: 'other', path: path.join(f.workspace, output) })).toEqual({ ok: true, value: null })
    expect(await restart.lookupOutput({ sendingSessionId: 'session', path: path.join(f.workspace, output) })).toMatchObject({ ok: true, value: { preparedId: f.prepared.preparedId, documentId: f.doc.documentId, status: 'pending' } })
    await restart.cancel({ sessionId: 'session', sendId: 'send-1' })
    expect(await restart.lookupOutput({ sendingSessionId: 'session', path: output })).toMatchObject({ ok: true, value: { status: 'failed', code: 'cancelled' } })
  })
  it('does not keep a stale success label after the verified output has been replaced', async () => {
    const f = await preparedFixture(), output = await outputFile(f)
    f.events.push(...ledger(f.prepared, output)); await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
    expect(await f.service.lookupOutput({ sendingSessionId: 'session', path: output })).toMatchObject({ ok: true, value: { status: 'success' } })
    await writeFile(path.join(f.workspace, output), 'corrupt replacement')
    expect(await f.service.lookupOutput({ sendingSessionId: 'session', path: output })).toMatchObject({ ok: true, value: { status: 'failed', code: 'invalid-output' } })
  })
  it('uses a preparation history watermark instead of scanning unrelated ancient turns', async () => {
    const f = await setup(), { reference } = await marked(f)
    f.events.push(...Array.from({ length: 1001 }, (_, seq) => ({ seq, type: 'tool/result', data: {} })))
    let reads = 0
    f.options.readHistory = async (input?: any) => { reads++; const events = f.events.filter(event => input?.beforeSeq === undefined || event.seq < input.beforeSeq); return { events: events.slice(-100), hasMore: events.length > 100 } }
    const prepared = (await f.service.prepare({ sendingSessionId: 'session', sendId: 'long-history', expectedDraftRev: 1, references: [reference] })).value
    const target = path.join(f.workspace, prepared.documents[0].outputRelativePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, changedBytes(f.bytes))
    f.events.push(...ledger(prepared, prepared.documents[0].outputRelativePath, 'rpc-actual', 1001))
    expect(await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: prepared.preparedId })).toMatchObject({ ok: true, value: { status: 'bound', userSeq: 1003 } })
    expect(await f.service.complete({ sendingSessionId: 'session', preparedId: prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'success' } })
    expect(reads).toBe(3)
  })
  it('uses semantic request fingerprints rather than object key insertion order for an identical send', async () => {
    const f = await preparedFixture()
    const ref = f.reference
    const reordered = { expectedStateRevision: ref.expectedStateRevision, markId: ref.markId, fileVersion: ref.fileVersion, documentId: ref.documentId, sessionId: ref.sessionId, version: ref.version }
    expect(await f.service.prepare({ ...f.request, references: [reordered] })).toEqual({ ok: true, value: f.prepared })
  })
  it('does not bind a user record to an already ended previous step', async () => {
    const f = await preparedFixture(), events = ledger(f.prepared, 'none')
    events.splice(2, 0, { seq: 2.5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    f.events.push(...events)
    expect(await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'pending' } })
  })
  it('retains two distinct input documents and reports partial completion without adopting a corrupt sibling', async () => {
    const f = await setup(), first = await marked(f)
    await writeFile(path.join(f.workspace, 'other.pptx'), f.bytes)
    const second = (await f.service.open({ ...source, source: { kind: 'workspace', relativePath: 'other.pptx' } })).value
    const state = (await f.service.mutate({ sessionId: 'session', documentId: second.documentId, version: second.version, expectedStateRevision: 0, operations: [{ op: 'put', mark: point }] })).value
    const secondRef = { ...first.reference, documentId: second.documentId, markId: state.marks[0].id }
    const prepared = (await f.service.prepare({ sendingSessionId: 'session', sendId: 'two', expectedDraftRev: 3, references: [first.reference, secondRef] })).value
    expect(prepared.documents).toHaveLength(2)
    for (const [index, doc] of prepared.documents.entries()) { const target = path.join(f.workspace, doc.outputRelativePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, index ? 'not a PPTX' : changedBytes(f.bytes)) }
    const output = prepared.documents[0].outputRelativePath
    const events = ledger(prepared, output)
    events[4]!.data.message!.content[0]!.text += `\n[第二份](${prepared.documents[1].outputRelativePath})`
    f.events.push(...events)
    await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: prepared.preparedId, submissionId: 'rpc-actual' })
    expect(await f.service.complete({ sendingSessionId: 'session', preparedId: prepared.preparedId, submissionId: 'rpc-actual' })).toMatchObject({ ok: true, value: { status: 'partial', documents: [{ status: 'success' }, { status: 'failed', code: 'invalid-output' }] } })
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
    expect(await readFile(path.join(f.workspace, 'other.pptx'))).toEqual(f.bytes)
  })
  it('rejects tampered manifests and snapshot bytes even after a real task claims success', async () => {
    for (const which of ['manifest', 'input']) {
      const f = await preparedFixture(`tamper-${which}`), output = await outputFile(f)
      f.events.push(...ledger(f.prepared, output))
      const target = path.join(f.workspace, which === 'manifest' ? f.prepared.manifestRelativePath : f.prepared.documents[0].inputRelativePath)
      await chmod(target, 0o600); await writeFile(target, which === 'manifest' ? '{}' : changedBytes(f.bytes))
      const result = await f.service.complete({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' })
      expect(which === 'manifest' ? result : result.value.documents[0]).toMatchObject(which === 'manifest' ? { ok: false, code: 'conflict' } : { status: 'failed', code: 'conflict' })
    }
  })
  it('cancels during a pending authorization read before a prepared result can be published', async () => {
    const f = await setup(), { reference } = await marked(f)
    let release!: () => void, entered!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const old = f.options.resolveWorkspace; let block = true
    f.options.resolveWorkspace = async id => { if (block) { block = false; entered(); await gate }; return old(id) }
    const request = { sendingSessionId: 'session', sendId: 'late-cancel', expectedDraftRev: 1, references: [reference] }
    const preparing = f.service.prepare(request); await waiting
    const cancelling = f.service.cancel({ sessionId: 'session', sendId: 'late-cancel' }); release()
    expect(await preparing).toMatchObject({ ok: false, code: 'cancelled' })
    expect(await cancelling).toMatchObject({ ok: true })
    expect((await opened(f)).state.marks).toHaveLength(1)
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
  })
})

it('reauthorizes real Research and NoteFile identities, never a renderer supplied note-files session alias', async () => {
  const f = await setup(), { ResearchFilePreviewRegistry } = await import('../src/main/state/research-file-preview'), { NoteFiles } = await import('../src/main/notes/files')
  let records: any[] = []
  const registry = new ResearchFilePreviewRegistry({ storage: { load: () => records, save: value => { records = [...value]; return true } } })
  const files = new NoteFiles({ root: path.join(f.root, 'note-files'), registry, owner: () => 'alice', canRead: id => id === 'session', workspaceRoot: f.options.resolveWorkspace, reveal: () => {} })
  const note = await files.admit('alice', 'session', { nodeId: 'note-file-abc', relativePath: 'deck.pptx' })
  const research = await registry.admitFinder({ path: path.join(f.workspace, 'deck.pptx'), sessionId: 'session', nodeId: 'research-node' }, true)
  expect(research).toBeTruthy()
  const api = await import(modulePath)
  const service = new api.PptxAnnotationService({ ...f.options, resolveAuthorizedSource: async (sessionId: string, source: any) => {
    if (source.kind === 'note-file') { const ref = await files.reference('alice', sessionId, source); return { path: ref.path, root: path.dirname(ref.path) } }
    return registry.resolvePptxEditIdentity({ sessionId, authorizationId: source.authorizationId, nodeId: source.nodeId })
  } })
  const noteInput = { sessionId: 'session', source: { kind: 'note-file', nodeId: note.id, authorizationId: note.authorizationId } }
  expect(await service.open(noteInput)).toMatchObject({ ok: true })
  expect(await service.open({ ...noteInput, sessionId: note.previewSessionId })).toMatchObject({ ok: false })
  const researchInput = { sessionId: 'session', source: { kind: 'research', nodeId: 'research-node', authorizationId: research!.authorizationId } }
  expect(await service.open(researchInput)).toMatchObject({ ok: true })
  registry.revokeNode('session', 'research-node'); expect(await service.open(researchInput)).toMatchObject({ ok: false })
  files.revoke('alice', 'session', note.id); expect(await service.open(noteInput)).toMatchObject({ ok: false })
})

it('rejects every privileged annotation action from subframes and unrelated windows', async () => {
  const f = await setup(), api = await import(modulePath), handlers = new Map<string, any>()
  const webContents = { mainFrame: { processId: 11, routingId: 12 } }, window = { isDestroyed: () => false, webContents }
  api.registerPptxAnnotationHandlers({ service: f.service, getMainWindow: () => window, ipcMain: { removeHandler: (channel: string) => handlers.delete(channel), handle: (channel: string, handler: any) => handlers.set(channel, handler) } })
  expect(handlers.size).toBe(7)
  for (const handler of handlers.values()) {
    expect(() => handler({ sender: webContents, senderFrame: { processId: 11, routingId: 13 } }, source)).toThrow(/main EWork/)
    expect(() => handler({ sender: {}, senderFrame: webContents.mainFrame }, source)).toThrow(/main EWork/)
  }
  expect(await handlers.get('pptx:annotation:open')({ sender: webContents, senderFrame: webContents.mainFrame }, source)).toMatchObject({ ok: true })
})
