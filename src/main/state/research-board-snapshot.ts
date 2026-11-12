import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync
} from 'node:fs'
import { join, extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { FrozenBoardFiles, type FrozenFile } from './research-board-assets'
import { digest } from './research-board-request-journal'
import { remapBoardTabs, restoreLegacyBoardTabMembership } from './research-board-tab-membership'
import { freezeSnapshot } from '../../../packages/dsh-research-collaboration/document.js'
import {
  mergeHumanHistory,
  portableAssetIds
} from '../../../packages/dsh-research-collaboration/context.js'
import type {
  Canvas,
  Snapshot,
  BoardSnapshot
} from '../../shared/research-boards'
function copiedAssetName(response: Response, references: any[]): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  let assetName: string | undefined
  if (encoded) {
    try {
      assetName = decodeURIComponent(encoded.trim())
    } catch {}
  }
  if (!assetName) assetName = /filename="([^"\r\n]+)"/i.exec(disposition)?.[1]
  // Asset metadata is authoritative; canvas filenames precede display-only
  // generation-source titles. One owned file serves every reference to its ID.
  const names = [assetName, ...references.flatMap((n) => [n.name, n.title])]
    .filter((name): name is string => typeof name === 'string')
    .map((name) =>
      name
        .split(/[\\/]/)
        .pop()!
        .replace(/[\x00-\x1f]/g, '')
        .trim()
    )
    .filter((name) => name && name !== '.' && name !== '..')
  const original = names.find((name) => extname(name).length > 1)
  if (original) return original
  const contentType = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
  const suffix: Record<string, string> = {
    'text/plain': '.txt',
    'text/csv': '.csv',
    'text/markdown': '.md',
    'application/json': '.json',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      '.pptx'
  }
  return (names[0] ?? '研究资料') + (suffix[contentType ?? ''] ?? '')
}
type Options = {
  root: string
  readCanvas(sessionId: string): Canvas
  writeCanvas?(sessionId: string, canvas: Canvas): void
  history(
    sessionId: string,
    signal: AbortSignal
  ): Promise<{ history: any[]; revision: string }>
  resolveSource(
    sessionId: string,
    node: any
  ): Promise<{ path: string; name: string; contentType?: string } | null>
  runtime(action: string, body: any, signal: AbortSignal): Promise<any>
  authorize(accountId: string, boardId: string, epoch?: number): void
  download(
    accountId: string,
    boardId: string,
    assetId: string,
    signal: AbortSignal
  ): Promise<Response>
  admit?(path: string, sessionId: string, nodeId: string): Promise<any>
}
const sourceRevision = (s: any) =>
  digest([s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs])
type Capture = {
  id: string
  accountId: string
  sessionId: string
  sourceRevision: string
  capturedAt: string
  snapshot: Snapshot
  files: Record<string, FrozenFile>
}
export class ResearchBoardSnapshots {
  readonly files: FrozenBoardFiles
  private state: any = {
    captures: {},
    operations: {},
    copies: {},
    imports: {}
  }
  private file: string
  private flights = new Map<string, Promise<any>>()
  constructor(private options: Options) {
    mkdirSync(options.root, { recursive: true, mode: 0o700 })
    this.file = join(options.root, 'snapshots.json')
    if (existsSync(this.file))
      this.state = JSON.parse(readFileSync(this.file, 'utf8'))
    this.files = new FrozenBoardFiles(join(options.root, 'files'))
  }
  private save() {
    const data = JSON.stringify(this.state)
    if (Buffer.byteLength(data) > 96 * 1024 * 1024)
      throw Error('SNAPSHOT_STORAGE_LIMIT')
    writeFileSync(this.file + '.tmp', data, { mode: 0o600 })
    renameSync(this.file + '.tmp', this.file)
  }
  importFor(sessionId: string) {
    const item = this.state.imports[sessionId]
    return item ? structuredClone(item) : null
  }
  async cloneLocalImport(sourceId: string, destinationId: string) {
    const source = this.state.imports[sourceId]
    if (source) {
      this.state.imports[destinationId] = structuredClone(source)
      this.save()
    }
  }
  async ownedSource(sessionId: string, nodeId: string) {
    const imported = this.importFor(sessionId)
    const assetId =
      imported?.nodeFiles?.[nodeId] ??
      imported?.history
        .flatMap((h: any) => h.references ?? [])
        .find((r: any) => r.nodeId === nodeId)?.assetId
    const f = imported?.files[assetId]
    if (!f || !(await this.files.verify(f))) return null
    return {
      path: this.files.path(f),
      name: f.name,
      contentType: f.contentType
    }
  }
  private async freeze(
    sessionId: string,
    accountId: string,
    signal: AbortSignal,
    includeHistory = true
  ): Promise<Capture> {
    const canvas = structuredClone(this.options.readCanvas(sessionId))
    const before = digest(canvas)
    const exported = includeHistory
      ? await this.options.history(sessionId, signal)
      : null
    if (digest(this.options.readCanvas(sessionId)) !== before)
      throw Error('SOURCE_CHANGED')
    signal.throwIfAborted()
    restoreLegacyBoardTabMembership(canvas)
    const history = exported
      ? mergeHumanHistory(
          this.importFor(sessionId)?.history ?? [],
          exported.history
        )
      : []
    const idMap = new Map<string, string>(),
      fileMap: Record<string, FrozenFile> = {}
    const assetByNode = new Map<string, string>()
    const sourceChecks: Array<{ path: string; revision: string }> = []
    const remap = (id: string) => {
      if (!idMap.has(id)) idMap.set(id, randomUUID())
      return idMap.get(id)!
    }
    const captureFile = async (node: any) => {
      if (assetByNode.has(node.id)) return assetByNode.get(node.id)!
      const source = await this.options.resolveSource(sessionId, node)
      signal.throwIfAborted()
      if (!source)
        throw Error(`RESOURCE_UNAVAILABLE: ${node.name ?? node.id}`)
      sourceChecks.push({
        path: source.path,
        revision: sourceRevision(await stat(source.path))
      })
      const frozen = await this.files.freeze(
        source.path,
        source.name,
        signal,
        source.contentType
      )
      const assetId = randomUUID()
      fileMap[assetId] = frozen
      assetByNode.set(node.id, assetId)
      return assetId
    }
    for (const n of [...canvas.files, ...canvas.artifacts]) remap(n.id)
    for (const m of history) remap(m.id)
    for (const n of canvas.files) {
      n.assetId = await captureFile(n)
      n.assetVersion = 1
      delete n.collaborationAssetId
    }
    for (const node of canvas.artifacts)
      for (const source of (node.generationSources ?? []) as any[])
        if (source.type === 'file') {
          source.assetId = await captureFile({
            ...source,
            name: source.title
          })
          source.assetVersion = 1
        }
    for (const m of history)
      for (const r of m.references ?? []) {
        if (r.collection === 'files') {
          const node = canvas.files.find((n) => n.id === r.nodeId) ?? {
            id: r.nodeId,
            name: r.name
          }
          r.assetId = await captureFile(node)
          r.assetVersion = 1
          r.contentType = fileMap[r.assetId]!.contentType
          r.size = fileMap[r.assetId]!.size
        }
        r.nodeId = remap(r.nodeId)
      }
    const rewrite = (v: any, k = ''): any =>
      k === 'interactionState' ? structuredClone(v) : Array.isArray(v)
        ? v.map((x) => rewrite(x, k))
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v).map(([key, value]) => [
                key,
                (key === 'containerSpec' && remapBoardTabs(value, remap)) || rewrite(value, key)
              ])
            )
          : typeof v === 'string' &&
              [
                'id',
                'messageId',
                'parentId',
                'groupId',
                'sourceNodeIds',
                'linkedWatchlistId',
                'linkedSourceId'
              ].includes(k)
            ? remap(v)
            : v
    const safeCanvas = rewrite(canvas)
    for (const n of safeCanvas.artifacts) {
      n.refreshMinutes = 0
      delete n.refreshScheduleId
    }
    // History reference IDs were already rewritten; do not remap them twice.
    const safeHistory = history.map((m) => ({ ...m, id: remap(m.id) }))
    const snapshot = freezeSnapshot({
      canvas: safeCanvas,
      history: safeHistory
    })
    for (const source of sourceChecks)
      if (sourceRevision(await stat(source.path)) !== source.revision)
        throw Error('SOURCE_CHANGED')
    if (digest(this.options.readCanvas(sessionId)) !== before)
      throw Error('SOURCE_CHANGED')
    signal.throwIfAborted()
    const captured: Capture = {
      id: randomUUID(),
      accountId,
      sessionId,
      sourceRevision: digest([
        before,
        exported?.revision ?? null,
        snapshot,
        Object.values(fileMap).map((f) => f.sha256)
      ]),
      capturedAt: new Date().toISOString(),
      snapshot,
      files: fileMap
    }
    this.state.captures[captured.id] = captured
    this.save()
    return captured
  }
  async preview(input: {
    sessionId: string
    accountId: string
    includeHistory?: boolean
    signal: AbortSignal
  }) {
    const c = await this.freeze(
      input.sessionId,
      input.accountId,
      input.signal,
      input.includeHistory
    )
    return {
      captureId: c.id,
      sourceRevision: c.sourceRevision,
      nodeCount:
        c.snapshot.canvas.files.length + c.snapshot.canvas.artifacts.length,
      historyCount: c.snapshot.history.length,
      assetBytes: Object.values(c.files).reduce((s, f) => s + f.size, 0)
    }
  }
  async capture(input: {
    sessionId: string
    accountId: string
    operationId: string
    captureId?: string
    includeHistory?: boolean
    signal: AbortSignal
  }) {
    const key = digest([input.accountId, input.operationId])
    let captureId = this.state.operations[key] ?? input.captureId
    if (
      this.state.operations[key] &&
      input.captureId &&
      captureId !== input.captureId
    )
      throw Error('CAPTURE_MISMATCH')
    const c: Capture = captureId
      ? this.state.captures[captureId]
      : await this.freeze(input.sessionId, input.accountId, input.signal)
    if (
      !c ||
      c.accountId !== input.accountId ||
      c.sessionId !== input.sessionId
    )
      throw Error('CAPTURE_UNAVAILABLE')
    if (input.includeHistory === false && c.snapshot.history.length)
      throw Error('SHARE_SCOPE_CHANGED')
    input.signal.throwIfAborted()
    for (const f of Object.values(c.files))
      if (!(await this.files.verify(f))) throw Error('RESOURCE_UNAVAILABLE')
    this.state.operations[key] = c.id
    this.save()
    return {
      sourceRevision: c.sourceRevision,
      capturedAt: c.capturedAt,
      snapshot: structuredClone(c.snapshot),
      assets: Object.entries(c.files).map(([assetId, f]) => ({
        assetId,
        name: f.name,
        size: f.size,
        contentType: f.contentType,
        open: () => this.files.body(f)
      })),
      dispose: () => {}
    }
  }
  async prepareCopy(input: {
    accountId: string
    boardId: string
    snapshot: BoardSnapshot
    signal: AbortSignal
  }) {
    const existing = Object.values(this.state.copies).find(
      (c: any) =>
        c.accountId === input.accountId &&
        c.boardId === input.boardId &&
        !c.completed
    ) as any
    if (existing) {
      this.options.authorize(input.accountId, input.boardId, existing.epoch)
      return {
        copyId: existing.copyId,
        title: existing.title,
        localSessionId: existing.localSessionId
      }
    }
    const key = input.accountId + ':' + input.boardId
    if (this.flights.has(key)) return this.flights.get(key)
    const work = (async () => {
      const epoch = input.snapshot.board.sharingEpoch
      this.options.authorize(input.accountId, input.boardId, epoch)
      const snap = structuredClone(input.snapshot.snapshot)
      restoreLegacyBoardTabMembership(snap.canvas)
      for (const n of snap.canvas.artifacts) {
        n.refreshMinutes = 0
        delete n.refreshScheduleId
      }
      snap.history = mergeHumanHistory(
        snap.history,
        input.snapshot.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          authorName: m.author?.username ?? m.authorName,
          createdAt: m.createdAt,
          references: m.context?.references ?? []
        }))
      )
      const ids = new Map<string, string>()
      const map = (id: string) => {
        if (!ids.has(id)) ids.set(id, randomUUID())
        return ids.get(id)!
      }
      const assets: Record<string, FrozenFile> = {}
      const refs = [
        ...snap.canvas.files,
        ...snap.history.flatMap((h: any) => h.references ?? []),
        ...snap.canvas.artifacts.flatMap(
          (n: any) => n.generationSources ?? []
        )
      ]
      for (const n of refs) {
        if (!n.assetId || assets[String(n.assetId)]) continue
        const response = await this.options.download(
          input.accountId,
          input.boardId,
          String(n.assetId),
          input.signal
        )
        this.options.authorize(input.accountId, input.boardId, epoch)
        assets[String(n.assetId)] = await this.files.download(
          response,
          copiedAssetName(
            response,
            refs.filter((ref: any) => ref.assetId === n.assetId)
          ),
          input.signal
        )
      }
      const rewrite = (v: any, k = ''): any =>
        k === 'interactionState' ? structuredClone(v) : Array.isArray(v)
          ? v.map((x) => rewrite(x, k))
          : v && typeof v === 'object'
            ? Object.fromEntries(
                Object.entries(v).map(([key, value]) => [
                  key,
                  (key === 'containerSpec' && remapBoardTabs(value, map)) || rewrite(value, key)
                ])
              )
            : typeof v === 'string' &&
                [
                  'id',
                  'nodeId',
                  'messageId',
                  'sourceNodeIds',
                  'parentId',
                  'groupId',
                  'linkedWatchlistId',
                  'linkedSourceId'
                ].includes(k)
              ? map(v)
              : v
      const copyId = randomUUID()
      this.options.authorize(input.accountId, input.boardId, epoch)
      input.signal.throwIfAborted()
      const c = {
        copyId,
        accountId: input.accountId,
        boardId: input.boardId,
        epoch,
        title: input.snapshot.board.title + ' · 个人副本',
        snapshot: rewrite(snap),
        files: assets,
        createdAt: Date.now()
      }
      this.state.copies[copyId] = c
      this.save()
      return { copyId, title: c.title }
    })()
    this.flights.set(key, work)
    try {
      return await work
    } finally {
      this.flights.delete(key)
    }
  }
  completedCopy(accountId: string, copyId: string, sessionId: string) {
    const c = this.state.copies[copyId]
    if (c?.completed && c.accountId === accountId) {
      if (c.localSessionId !== sessionId) throw Error('BINDING_CONFLICT')
      return { localSessionId: sessionId }
    }
    return null
  }
  canResumeCopy(accountId: string, copyId: string, sessionId: string) {
    const c = this.state.copies[copyId]
    if (
      !c?.installCanvas ||
      c.accountId !== accountId ||
      c.localSessionId !== sessionId
    )
      return false
    const current = this.options.readCanvas(sessionId)
    return (['files', 'artifacts'] as const).every(
      (k) =>
        !current[k].length ||
        digest(current[k]) === digest(c.installCanvas[k])
    )
  }
  async finalizeCopy(input: {
    accountId: string
    copyId: string
    localSessionId: string
    signal: AbortSignal
  }) {
    const c = this.state.copies[input.copyId]
    if (c?.localSessionId && c.localSessionId !== input.localSessionId)
      throw Error('BINDING_CONFLICT')
    const key = 'finalize:' + input.accountId + ':' + input.copyId
    const existing = this.flights.get(key)
    if (existing) return existing
    const work = this.finalizeCopyOnce(input)
    this.flights.set(key, work)
    try {
      return await work
    } finally {
      this.flights.delete(key)
    }
  }
  private async finalizeCopyOnce(input: {
    accountId: string
    copyId: string
    localSessionId: string
    signal: AbortSignal
  }) {
    const done = this.completedCopy(
      input.accountId,
      input.copyId,
      input.localSessionId
    )
    if (done) return done
    const c = this.state.copies[input.copyId]
    if (
      !c ||
      c.accountId !== input.accountId ||
      (c.localSessionId && c.localSessionId !== input.localSessionId)
    )
      throw Error('BINDING_CONFLICT')
    this.options.authorize(c.accountId, c.boardId, c.epoch)
    c.localSessionId = input.localSessionId
    this.save()
    await this.options.runtime(
      'fresh',
      {
        sessionId: input.localSessionId,
        copyId: input.copyId,
        createdAfter: c.createdAt
      },
      input.signal
    )
    if (
      c.installCanvas &&
      !this.canResumeCopy(input.accountId, input.copyId, input.localSessionId)
    )
      throw Error('DESTINATION_CHANGED')
    const canvas: Canvas = structuredClone(
      c.installCanvas ?? c.snapshot.canvas
    )
    for (const node of canvas.files) {
      const sourceNode = c.snapshot.canvas.files.find(
        (n: any) => n.id === node.id
      )
      const f = c.files[String(sourceNode.assetId)] as FrozenFile
      if (!f || !(await this.files.verify(f)))
        throw Error('RESOURCE_UNAVAILABLE')
      node.path = this.files.path(f)
      node.source = 'computer'
      delete node.assetId
      delete node.collaborationAssetId
      const grant =
        node.previewEligible === false
          ? null
          : await this.options.admit?.(
              node.path as string,
              input.localSessionId,
              node.id
            )
      if (grant)
        Object.assign(node, {
          authorizationId: grant.authorizationId,
          contentType: grant.contentType
        })
      else {
        node.previewEligible = false
        node.personalImportFile = true
        delete node.authorizationId
        delete node.contentType
      }
    }
    for (const node of canvas.artifacts)
      for (const source of (node.generationSources ?? []) as any[])
        if (source.type === 'file') {
          const f = c.files[source.assetId]
          if (!f || !(await this.files.verify(f)))
            throw Error('RESOURCE_UNAVAILABLE')
          source.path = this.files.path(f)
          delete source.assetId
          delete source.assetVersion
        }
    this.options.authorize(c.accountId, c.boardId, c.epoch)
    await this.options.runtime(
      'fresh-check',
      { sessionId: input.localSessionId, copyId: input.copyId },
      input.signal
    )
    try {
      input.signal.throwIfAborted()
      this.options.authorize(c.accountId, c.boardId, c.epoch)
      c.installCanvas = canvas
      this.save()
      this.options.writeCanvas?.(input.localSessionId, canvas)
      this.state.imports[input.localSessionId] = {
        copyId: c.copyId,
        history: c.snapshot.history,
        files: c.files,
        nodeFiles: Object.fromEntries(
          [
            ...c.snapshot.canvas.files,
            ...c.snapshot.canvas.artifacts.flatMap(
              (n: any) => n.generationSources ?? []
            )
          ]
            .filter((n: any) => n.assetId)
            .map((n: any) => [n.id, n.assetId])
        ),
        createdAt: Date.now()
      }
      c.completed = true
      this.save()
      return { localSessionId: input.localSessionId }
    } finally {
      await this.options
        .runtime(
          'fresh-release',
          { sessionId: input.localSessionId, copyId: input.copyId },
          AbortSignal.timeout(5000)
        )
        .catch(() => {})
    }
  }
}
