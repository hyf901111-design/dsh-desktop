import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
  it('locks the first accepted bytes across valid replacement and restart without rewriting its version history', async () => {
    const f = await preparedFixture(), acceptedBytes = changedBytes(f.bytes), output = await outputFile(f, acceptedBytes)
    f.events.push(...ledger(f.prepared, output))
    const request = { sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual' }
    const accepted = (await f.service.complete(request)).value.documents[0].versionRecord
    const replacement = new PptxArchive(acceptedBytes)
    await writeFile(path.join(f.workspace, output), replacement.replace(new Map([['ppt/slides/slide2.xml', Buffer.from(replacement.read('ppt/slides/slide2.xml').toString().replace('修订年度', '后来替换的内容'))]])))
    const api = await import(modulePath), restart = new api.PptxAnnotationService(f.options)
    expect(await restart.lookupOutput({ sendingSessionId: 'session', path: output })).toMatchObject({ ok: true, value: { status: 'failed', code: 'invalid-output' } })
    expect(await restart.complete(request)).toMatchObject({ ok: true, value: { status: 'failed', documents: [{ status: 'failed', code: 'invalid-output', versionRecord: accepted }] } })
    expect(await restart.lookupOutput({ sendingSessionId: 'session', path: output })).toMatchObject({ ok: true, value: { status: 'failed', versionRecord: accepted } })
    const secondRestart = new api.PptxAnnotationService(f.options)
    expect(await secondRestart.complete(request)).toMatchObject({ ok: true, value: { status: 'failed', documents: [{ status: 'failed', code: 'invalid-output', versionRecord: accepted }] } })
    await writeFile(path.join(f.workspace, output), acceptedBytes)
    expect(await secondRestart.complete(request)).toMatchObject({ ok: true, value: { status: 'success', documents: [{ status: 'success', versionRecord: accepted }] } })
    expect(await readFile(path.join(f.workspace, 'deck.pptx'))).toEqual(f.bytes)
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
  expect(handlers.size).toBe(9)
  for (const handler of handlers.values()) {
    expect(() => handler({ sender: webContents, senderFrame: { processId: 11, routingId: 13 } }, source)).toThrow(/main EWork/)
    expect(() => handler({ sender: {}, senderFrame: webContents.mainFrame }, source)).toThrow(/main EWork/)
  }
  expect(await handlers.get('pptx:annotation:open')({ sender: webContents, senderFrame: webContents.mainFrame }, source)).toMatchObject({ ok: true })
})

async function presentationFixture(textSuffix = '') {
  const f = await preparedFixture()
  const text = '整体要求📈保留\n' + f.prepared.serializedReferences[0].text + '\n个人补充原文' + textSuffix
  const history = ledger(f.prepared, f.prepared.documents[0].outputRelativePath)
  history[2]!.data.content = [{ type: 'text', text }]
  f.events.push(...history)
  expect(await f.service.bindSubmission({ sendingSessionId: 'session', preparedId: f.prepared.preparedId })).toMatchObject({ ok: true, value: { status: 'bound', userSeq: 3, submissionId: 'rpc-actual' } })
  const input = { sendingSessionId: 'session', preparedId: f.prepared.preparedId, userSeq: 3, submissionId: 'rpc-actual', text }
  return { ...f, text, input }
}
async function treeBytes(root: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) Object.assign(result, await treeBytes(root, relative))
    else result[relative] = (await readFile(path.join(root, relative))).toString('base64')
  }
  return result
}

function resolveInput(reference: any) {
  const { expectedStateRevision: _revision, ...locator } = reference
  return { sendingSessionId: 'session', reference: locator }
}
describe('cold read-only annotation reference source resolution', () => {
  it('resolves only the persisted original source and physical page after restart without any edit token or writes', async () => {
    const f = await setup(), { doc, reference, state } = await marked(f), api = await import(modulePath), before = await treeBytes(f.root)
    const restart = new api.PptxAnnotationService(f.options)
    expect(restart.resolveReference).toBeTypeOf('function')
    const result = await restart.resolveReference(resolveInput(reference))
    expect(result).toMatchObject({ ok: true, value: { status: 'ready', reference: resolveInput(reference).reference, source, name: 'deck.pptx', path: await realpath(path.join(f.workspace, 'deck.pptx')), fileVersion: doc.version, mark: { id: state.marks[0].id, ordinal: 1, slideIndex: 0, slidePart: 'ppt/slides/slide2.xml' } } })
    expect(result.value).not.toHaveProperty('editToken'); expect(result.value).not.toHaveProperty('sourceUrl'); expect(result.value.mark).not.toHaveProperty('region')
    expect(await treeBytes(f.root)).toEqual(before)
  })

  it('denies unknown, cross-owner and forged sender identities without creating metadata or accepting guessed paths', async () => {
    const empty = await setup()
    expect(empty.service.resolveReference).toBeTypeOf('function')
    const unknown = { version: 1, sessionId: 'session', documentId: 'a'.repeat(64), fileVersion: 'b'.repeat(64), markId: 'mark-1' }
    expect(await empty.service.resolveReference(resolveInput(unknown))).toMatchObject({ ok: true, value: { status: 'denied' } })
    await expect(readdir(path.join(empty.root, 'state'))).rejects.toMatchObject({ code: 'ENOENT' })
    const f = await setup(), { reference } = await marked(f), input = resolveInput(reference)
    expect(await f.service.resolveReference({ ...input, sendingSessionId: 'other' })).toMatchObject({ ok: false, code: 'invalid' })
    expect(await f.service.resolveReference({ ...input, path: 'PPT标注修改/same-bytes.pptx' })).toMatchObject({ ok: false, code: 'invalid' })
    f.owner('bob'); const before = await treeBytes(f.root)
    expect(await f.service.resolveReference(input)).toMatchObject({ ok: true, value: { status: 'denied' } }); expect(await treeBytes(f.root)).toEqual(before)
  })

  it('reports deleted and stale references without a source or old coordinates, including an already reanchored mark', async () => {
    const deleted = await setup(), first = await marked(deleted)
    await deleted.service.mutate({ sessionId: 'session', documentId: first.doc.documentId, version: first.doc.version, expectedStateRevision: 1, operations: [{ op: 'remove', markId: first.reference.markId }] })
    const removed = await deleted.service.resolveReference(resolveInput(first.reference)); expect(removed).toMatchObject({ ok: true, value: { status: 'deleted' } }); expect(removed.value).not.toHaveProperty('source')
    const stale = await setup(), second = await marked(stale); await writeFile(path.join(stale.workspace, 'deck.pptx'), changedBytes(stale.bytes))
    const old = await stale.service.resolveReference(resolveInput(second.reference)); expect(old).toMatchObject({ ok: true, value: { status: 'stale' } }); expect(old.value).not.toHaveProperty('mark')
    const current = await opened(stale)
    await stale.service.mutate({ sessionId: 'session', documentId: second.doc.documentId, version: current.version, expectedStateRevision: 1, operations: [{ op: 'reanchor', markId: second.reference.markId, location: point }] })
    expect(await stale.service.resolveReference(resolveInput(second.reference))).toMatchObject({ ok: true, value: { status: 'stale' } })
    expect(await stale.service.resolveReference(resolveInput({ ...second.reference, fileVersion: current.version }))).toMatchObject({ ok: true, value: { status: 'ready', fileVersion: current.version } })
  })

  it('never substitutes a same-byte generated copy for the canonical original document', async () => {
    const f = await setup(), { reference } = await marked(f), copy = path.join(f.workspace, 'modified-output.pptx')
    await writeFile(copy, f.bytes); await rm(path.join(f.workspace, 'deck.pptx')); await symlink(copy, path.join(f.workspace, 'deck.pptx'))
    const result = await f.service.resolveReference(resolveInput(reference))
    expect(result).toMatchObject({ ok: true, value: { status: 'denied' } }); expect(result.value).not.toHaveProperty('path')
  })

  it('restores real NoteFile and Research read capabilities after cold loading without confusing their same-byte document identities', async () => {
    const f = await setup(), api = await import(modulePath), { ResearchFilePreviewRegistry, FileResearchPreviewAuthorizationStorage } = await import('../src/main/state/research-file-preview'), { NoteFiles } = await import('../src/main/notes/files')
    const storage = new FileResearchPreviewAuthorizationStorage(f.root)
    let registry = new ResearchFilePreviewRegistry({ storage })
    const makeFiles = () => new NoteFiles({ root: path.join(f.root, 'note-files'), registry, owner: () => 'alice', canRead: id => id === 'session', workspaceRoot: f.options.resolveWorkspace, reveal: () => {} })
    let files = makeFiles()
    const note = await files.admit('alice', 'session', { nodeId: 'note-file-resolve', relativePath: 'deck.pptx' }), research = await registry.admitFinder({ path: path.join(f.workspace, 'deck.pptx'), sessionId: 'session', nodeId: 'research-resolve' }, true)
    expect(research).toBeTruthy()
    const options = { ...f.options, resolveAuthorizedSource: async (sessionId: string, source: any) => {
      if (source.kind === 'note-file') { const file = await files.reference('alice', sessionId, source); return { path: file.path, root: path.dirname(file.path) } }
      return registry.resolvePptxEditIdentity({ sessionId, nodeId: source.nodeId, authorizationId: source.authorizationId })
    }, previewSource: async (sessionId: string, source: any) => {
      const reader = source.kind === 'note-file' ? (await files.bind('alice', sessionId, source)).previewSessionId : sessionId
      const preview = await registry.restore({ sessionId: reader, nodeId: source.nodeId, authorizationId: source.authorizationId }), verified = preview && await registry.resolvePptxEditSource(preview.url)
      return preview && verified ? { url: preview.url, path: verified.path } : null
    } }
    const service = new api.PptxAnnotationService(options), sources = [{ sessionId: 'session', source: { kind: 'note-file', nodeId: note.id, authorizationId: note.authorizationId } }, { sessionId: 'session', source: { kind: 'research', nodeId: 'research-resolve', authorizationId: research!.authorizationId } }]
    const references: any[] = []
    for (const source of sources) {
      const opened = (await service.open(source)).value, marked = (await service.mutate({ sessionId: 'session', documentId: opened.documentId, version: opened.version, expectedStateRevision: 0, operations: [{ op: 'put', mark: point }] })).value
      references.push({ version: 1, sessionId: 'session', documentId: opened.documentId, fileVersion: opened.version, markId: marked.marks[0].id })
    }
    expect(references[0].documentId).not.toBe(references[1].documentId)
    registry = new ResearchFilePreviewRegistry({ storage: new FileResearchPreviewAuthorizationStorage(f.root) }); files = makeFiles()
    const restart = new api.PptxAnnotationService(options), before = await treeBytes(f.root), results: any[] = []
    for (const [index, reference] of references.entries()) {
      const result = await restart.resolveReference(resolveInput(reference)); expect(result).toMatchObject({ ok: true, value: { status: 'ready', source: sources[index], reference } })
      expect(result.value.sourceUrl).toMatch(/^sherlock-preview:\/\//)
      const capability = await registry.resolvePptxEditSource(result.value.sourceUrl)
      expect(capability?.path).toBe(result.value.path); expect(capability?.identity.sessionId).toBe(index === 0 ? note.previewSessionId : 'session'); results.push(result.value)
    }
    expect(await treeBytes(f.root)).toEqual(before)
    const missingReader = new api.PptxAnnotationService({ ...options, previewSource: undefined })
    expect(await missingReader.resolveReference(resolveInput(references[0]))).toMatchObject({ ok: true, value: { status: 'denied' } })
    const wrongReader = new api.PptxAnnotationService({ ...options, previewSource: async () => ({ url: results[1].sourceUrl, path: results[1].path }) })
    expect(await wrongReader.resolveReference(resolveInput(references[0]))).toMatchObject({ ok: true, value: { status: 'denied' } })
    registry.revokeNode(note.previewSessionId, note.id)
    expect(await restart.resolveReference(resolveInput(references[0]))).toMatchObject({ ok: true, value: { status: 'denied' } })
  })

  it.each(['owner', 'revoked', 'deleted'])('does not return an old ready result after %s changes during authorization', async change => {
    const f = await setup(), { doc, reference } = await marked(f), api = await import(modulePath)
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), waiting = new Promise<void>(resolve => { release = resolve })
    const restart = new api.PptxAnnotationService({ ...f.options, resolveWorkspace: async (id: string) => { entered(); await waiting; return f.options.resolveWorkspace(id) } })
    const result = restart.resolveReference(resolveInput(reference)); await started
    if (change === 'owner') f.owner('bob')
    if (change === 'revoked') f.allow(false)
    if (change === 'deleted') await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 1, operations: [{ op: 'remove', markId: reference.markId }] })
    release(); const after = await result
    expect(after).toMatchObject(change === 'owner' ? { ok: false, code: 'forbidden' } : { ok: true, value: { status: change === 'deleted' ? 'deleted' : 'denied' } })
  })

  it('rereads a mark deleted while the last authorization check is waiting', async () => {
    const f = await setup(), { doc, reference } = await marked(f), api = await import(modulePath)
    let count = 0, entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), waiting = new Promise<void>(resolve => { release = resolve })
    const restart = new api.PptxAnnotationService({ ...f.options, resolveWorkspace: async (id: string) => { if (++count === 2) { entered(); await waiting } return f.options.resolveWorkspace(id) } })
    const result = restart.resolveReference(resolveInput(reference)); await started
    await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 1, operations: [{ op: 'remove', markId: reference.markId }] }); release()
    expect(await result).toMatchObject({ ok: true, value: { status: 'deleted' } })
  })
})

describe('read-only authoritative sent annotation presentation', () => {
  it('labels a frozen rectangle as a region even when it includes a named title node', async () => {
    const f = await setup(), { doc, reference } = await marked(f)
    await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 1, operations: [{ op: 'put', mark: { ...point, id: reference.markId, kind: 'rect', region: { x: 0.25, y: 0.5, width: 0.2, height: 0.2 } } }] })
    const prepared = (await f.service.prepare({ sendingSessionId: 'session', sendId: 'rectangle-label', expectedDraftRev: 5, references: [{ ...reference, expectedStateRevision: 2 }] })).value
    const manifest = JSON.parse(await readFile(path.join(f.workspace, prepared.manifestRelativePath), 'utf8'))
    expect(manifest.documents[0].marks[0].sourceNodes[0].name).toBe('标题')
    const text = prepared.serializedReferences[0].text; f.events.push(...ledger(prepared, prepared.documents[0].outputRelativePath))
    expect(await f.service.messagePresentation({ sendingSessionId: 'session', preparedId: prepared.preparedId, submissionId: 'rpc-actual', userSeq: 3, text })).toMatchObject({ ok: true, value: { spans: [{ label: '第1页 · 框选区域' }] } })
  })

  it('projects exact UTF16 spans from the persisted human submission with frozen marks after a cold restart', async () => {
    const f = await presentationFixture(), api = await import(modulePath)
    expect(f.service.messagePresentation).toBeTypeOf('function')
    await f.service.mutate({ sessionId: 'session', documentId: f.doc.documentId, version: f.doc.version, expectedStateRevision: 1, operations: [{ op: 'put', mark: { ...point, id: f.reference.markId, comment: '发送后另改的备注' } }] })
    const before = await treeBytes(f.root), restart = new api.PptxAnnotationService(f.options)
    const result = await restart.messagePresentation(f.input)
    expect(result).toMatchObject({ ok: true, value: { preparedId: f.prepared.preparedId, submissionId: 'rpc-actual', userSeq: 3, text: f.text, spans: [{ kind: 'pptx-annotation', start: '整体要求📈保留\n'.length, end: '整体要求📈保留\n'.length + f.prepared.serializedReferences[0].text.length, text: f.prepared.serializedReferences[0].text, ordinal: 1, comment: point.comment, reference: f.prepared.serializedReferences[0].reference }] } })
    expect(result.value?.skill).toBeUndefined()
    expect(result.value!.spans.every((span: { start: number; end: number; text: string }) => f.text.slice(span.start, span.end) === span.text)).toBe(true)
    expect(await treeBytes(f.root)).toEqual(before)
  })

  it('returns ordinary text unchanged for unknown, modified, wrong-sequence and wrong-RPC hints without creating metadata', async () => {
    const empty = await setup()
    expect(empty.service.messagePresentation).toBeTypeOf('function')
    expect(await empty.service.messagePresentation({ sendingSessionId: 'session', preparedId: '089686f5-1f15-446e-83c6-99955a1789e1', userSeq: 0, submissionId: 'ordinary-rpc', text: '普通用户的 /ework-skill-180a6a3f86f8942e 文本' })).toEqual({ ok: true, value: null })
    await expect(readdir(path.join(empty.root, 'state'))).rejects.toMatchObject({ code: 'ENOENT' })
    const f = await presentationFixture()
    for (const input of [{ ...f.input, text: f.text + '改过正文' }, { ...f.input, userSeq: 4 }, { ...f.input, submissionId: 'wrong-rpc' }, { ...f.input, sendingSessionId: 'other' }]) expect(await f.service.messagePresentation(input)).toEqual({ ok: true, value: null })
    f.owner('bob'); const before = await treeBytes(f.root)
    expect(await f.service.messagePresentation(f.input)).toEqual({ ok: true, value: null }); expect(await treeBytes(f.root)).toEqual(before)
  })

  it('recovers a consumed human submission read-only before its binding observer writes, including split native text parts', async () => {
    const f = await preparedFixture(), text = '中文📌' + f.prepared.serializedReferences[0].text, history = ledger(f.prepared, f.prepared.documents[0].outputRelativePath)
    const split = text.indexOf(f.prepared.preparedId) + 4
    history[2]!.data.content = [{ type: 'text', text: text.slice(0, split) }, { type: 'text', text: text.slice(split) }]
    f.events.push(...history); const before = await treeBytes(f.root), api = await import(modulePath), restart = new api.PptxAnnotationService(f.options)
    expect(await restart.messagePresentation({ sendingSessionId: 'session', preparedId: f.prepared.preparedId, submissionId: 'rpc-actual', userSeq: 3, text })).toMatchObject({ ok: true, value: { userSeq: 3, text, spans: [{ start: '中文📌'.length, ordinal: 1 }] } })
    expect(await treeBytes(f.root)).toEqual(before)
  })

  it('does not treat queued or ordinary manifest mentions as materialized annotation blocks', async () => {
    const queued = await preparedFixture(), text = queued.prepared.serializedReferences[0].text
    queued.events.push({ seq: 1, type: 'agent/inbox/spliced', data: { inserted: [{ id: 'queued', role: 'user', source: { kind: 'user', rpcId: 'rpc-actual' }, content: [{ type: 'text', text }] }] } })
    expect(await queued.service.messagePresentation({ sendingSessionId: 'session', preparedId: queued.prepared.preparedId, submissionId: 'rpc-actual', userSeq: 3, text })).toEqual({ ok: true, value: null })
    const ordinary = await preparedFixture(), literal = '仅讨论普通技能 /ework-skill-180a6a3f86f8942e 与清单 `' + ordinary.prepared.manifestRelativePath + '`', history = ledger(ordinary.prepared, ordinary.prepared.documents[0].outputRelativePath)
    history[2]!.data.content = [{ type: 'text', text: literal }]; ordinary.events.push(...history)
    expect(await ordinary.service.messagePresentation({ sendingSessionId: 'session', preparedId: ordinary.prepared.preparedId, submissionId: 'rpc-actual', userSeq: 3, text: literal })).toEqual({ ok: true, value: null })
  })

  it('orders two frozen marks by their actual UTF16 text positions without renumbering them', async () => {
    const f = await setup(), { doc, reference } = await marked(f)
    const added = await f.service.mutate({ sessionId: 'session', documentId: doc.documentId, version: doc.version, expectedStateRevision: 1, operations: [{ op: 'put', mark: { ...point, slideIndex: 1, slidePart: 'ppt/slides/slide1.xml', nodeIds: [], comment: '第二处冻结备注' } }] })
    const prepared = (await f.service.prepare({ sendingSessionId: 'session', sendId: 'two-marks', expectedDraftRev: 9, references: [{ ...reference, expectedStateRevision: 2 }, { ...reference, expectedStateRevision: 2, markId: added.value.marks[1].id }] })).value
    const prefix = '开场📈\n', middle = '\n中间全局要求📌\n', text = prefix + prepared.serializedReferences[1].text + middle + prepared.serializedReferences[0].text, history = ledger(prepared, prepared.documents[0].outputRelativePath)
    history[2]!.data.content = [{ type: 'text', text }]; f.events.push(...history)
    const result = await f.service.messagePresentation({ sendingSessionId: 'session', preparedId: prepared.preparedId, userSeq: 3, submissionId: 'rpc-actual', text })
    expect(result.ok).toBe(true); expect(result.value.spans.map((span: { ordinal: number }) => span.ordinal)).toEqual([2, 1]); expect(result.value.spans.map((span: { start: number }) => span.start)).toEqual([prefix.length, prefix.length + prepared.serializedReferences[1].text.length + middle.length])
  })

  it('refuses a changed immutable manifest instead of trusting a matching visible message', async () => {
    const f = await presentationFixture(), file = path.join(f.workspace, f.prepared.manifestRelativePath)
    await chmod(file, 0o600); await writeFile(file, '{"version":1,"changed":true}')
    expect(await f.service.messagePresentation(f.input)).toMatchObject({ ok: false, code: 'conflict' })
  })

  it('returns a skill span only for the actual builtin catalog and the unique terminal invocation in that human request', async () => {
    const wire = '/ework-skill-180a6a3f86f8942e', f = await presentationFixture('。' + wire), api = await import(modulePath)
    const bundle = path.join(f.root, 'bundled'), skill = path.join(bundle, 'efund-ppt-maker'); await mkdir(skill, { recursive: true })
    await writeFile(path.join(skill, 'SKILL.md'), '---\nname: efund-ppt-maker\ndescription: 制作正式演示文稿\n---\n\n# 正文\n')
    await writeFile(path.join(skill, '_meta.json'), JSON.stringify({ slug: 'efund-ppt-maker', source: 'eSkill', cnName: 'PPT制作助手', version: '1.0.0' }))
    const { IntegrationService } = await import('../src/main/integrations/service'), integrations = await IntegrationService.open({ root: path.join(f.root, 'integrations'), encryption: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, getOwnerId: () => 'alice', bundledSkillDirectory: bundle })
    try {
      const service = new api.PptxAnnotationService({ ...f.options, presentationSkill: async (id: 'builtin:efund-ppt-maker') => integrations.getPresentationSkill(id) }), before = await treeBytes(f.root)
      expect(await service.messagePresentation(f.input)).toMatchObject({ ok: true, value: { skill: { id: 'builtin:efund-ppt-maker', label: '/efund-ppt-maker', text: wire, start: f.text.length - wire.length, end: f.text.length } } })
      expect(await treeBytes(f.root)).toEqual(before)
      const human = f.events.find(event => event.type === 'user/message')!
      for (const text of [wire + '作为普通文本\n' + f.text, f.text + '仍为普通正文']) {
        human.data.content = [{ type: 'text', text }]
        const result = await service.messagePresentation({ ...f.input, text }); expect(result.ok).toBe(true); expect(result.ok && result.value?.skill).toBeUndefined()
      }
      human.data.content = [{ type: 'text', text: f.text }]
      await integrations.store.change(state => { state.bundledSkillPreferences ??= {}; state.bundledSkillPreferences.alice = { 'builtin:efund-ppt-maker': { enabled: false, revision: 1 } } })
      const disabled = await service.messagePresentation(f.input); expect(disabled.ok).toBe(true); expect(disabled.ok && disabled.value?.skill).toBeUndefined()
    } finally { await integrations.dispose() }
  })

  it('does not project a cancelled, nonhuman or ambiguous transport record', async () => {
    const cancelled = await presentationFixture(); await cancelled.service.cancel({ sessionId: 'session', sendId: cancelled.request.sendId })
    expect(await cancelled.service.messagePresentation(cancelled.input)).toMatchObject({ ok: false, code: 'cancelled' })
    const nonhuman = await presentationFixture(); nonhuman.events.find(event => event.type === 'user/message')!.data.source.kind = 'system'
    expect(await nonhuman.service.messagePresentation(nonhuman.input)).toEqual({ ok: true, value: null })
    const duplicate = await presentationFixture(); const human = duplicate.events.find(event => event.type === 'user/message')!
    const repeated = duplicate.text + '\n' + duplicate.prepared.serializedReferences[0].text; human.data.content = [{ type: 'text', text: repeated }]
    expect(await duplicate.service.messagePresentation({ ...duplicate.input, text: repeated })).toEqual({ ok: true, value: null })
    duplicate.events.push({ ...structuredClone(human), seq: 20, data: { ...human.data, source: { kind: 'user', rpcId: 'other-rpc' } } })
    expect(await duplicate.service.messagePresentation({ ...duplicate.input, text: repeated })).toMatchObject({ ok: false, code: 'ambiguous' })
  })

  it('requires the current source grant and discards a response after the account changes while reading history', async () => {
    const revoked = await presentationFixture(); revoked.allow(false)
    expect(await revoked.service.messagePresentation(revoked.input)).toMatchObject({ ok: false, code: 'forbidden' })
    const f = await presentationFixture(), api = await import(modulePath); let release!: () => void, reading = false
    const pending = new Promise<void>(resolve => { release = resolve })
    const restart = new api.PptxAnnotationService({ ...f.options, readHistory: async () => { reading = true; await pending; return { events: [...f.events], hasMore: false } } })
    const result = restart.messagePresentation(f.input); await expect.poll(() => reading).toBe(true); f.owner('bob'); release()
    expect(await result).toMatchObject({ ok: false, code: 'forbidden' })
  })
})
