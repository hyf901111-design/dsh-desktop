import { createHash, randomBytes } from 'node:crypto'
import { constants, realpathSync } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust'
import type { ResearchFilePreviewRegistry, ResearchFilePreviewDescriptor } from './research-file-preview'

export const RESEARCH_CLIPBOARD_FORMAT = 'application/x-sherlock-research-components'
const MAX_TEXT = 1024 * 1024
const MAX_SNAPSHOT = 2 * MAX_TEXT
const MAX_HTML_ENVELOPE = 6 * MAX_TEXT + 512
const MAX_FILES = 100
const MAX_FILE = 64 * MAX_TEXT
const MAX_BATCH = 128 * MAX_TEXT
const MAX_STORE = 512 * MAX_TEXT
const FILE_FORMATS = ['NSFilenamesPboardType', 'text/uri-list', 'public.file-url', 'FileNameW']
type RecordValue = Record<string, unknown>
export type ClipboardAsset = { assetId: string; name: string; size: number; mimeType: string; previewable: boolean }
export type ClipboardNode = RecordValue & { id: string; kind: string; x: number; y: number; assetId?: string }
export type ResearchClipboardRead = { kind: 'empty' } | { kind: 'text'; text: string } | { kind: 'files'; files: ClipboardAsset[] } | { kind: 'components'; nodes: ClipboardNode[] }
export type ResearchClipboardAdmission = ResearchFilePreviewDescriptor & { path: string }
export interface NativeResearchClipboard {
  availableFormats(): string[]
  has?(format: string): boolean
  readBuffer(format: string): Buffer
  readText(): string
  readHTML(): string
  readImage(): { isEmpty(): boolean; toPNG(): Buffer; getSize(): { width: number; height: number } }
  write(value: { text: string; html: string }): void
}
type Options = { userDataPath: string; clipboard: NativeResearchClipboard; registry: ResearchFilePreviewRegistry; revealFile(target: string): void }
type AssetManifest = ClipboardAsset & { version: 1; sha256: string }
const newId = () => randomBytes(24).toString('hex')
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value)
const boundedId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 512
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('剪贴板组件数据无效。')
  return value as RecordValue
}
function boundedText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > max) throw new Error('剪贴板文字或组件内容过大。')
  return value
}
function safeName(value: string): string {
  const name = path.basename(value).replace(/[\x00-\x1f\x7f/\\:]/g, '_').trim()
  if (!name || name === '.' || name === '..' || Buffer.byteLength(name) > 240) throw new Error('文件名称无效或过长。')
  return name
}
function hash(value: Buffer): string { return createHash('sha256').update(value).digest('hex') }
function exactKeys(value: RecordValue, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => key in value) }
function publicUrl(value: unknown): string {
  const url = new URL(boundedText(value, 8192))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('组件网址无效。')
  return url.href
}
// Native component data is declarative only: no arbitrary objects or script fields.
const SPEC_KEYS = new Set(['version', 'variant', 'description', 'type', 'title', 'content', 'markdown', 'chartType', 'labels', 'series', 'name', 'values', 'columns', 'rows', 'items', 'label', 'value', 'change', 'tone', 'url', 'children', 'text', 'id', 'root'])
function safeSpec(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new Error('组件内容嵌套过深。')
  if (typeof value === 'string') return boundedText(value)
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    if (value.length > 2000) throw new Error('组件内容过多。')
    return value.map((item) => safeSpec(item, depth + 1))
  }
  const input = record(value); const output: RecordValue = {}
  for (const [key, item] of Object.entries(input)) {
    if (!SPEC_KEYS.has(key)) throw new Error('组件包含不支持的内容字段。')
    output[key] = key === 'url' ? publicUrl(item) : safeSpec(item, depth + 1)
  }
  return output
}
function sanitizeNode(value: unknown): ClipboardNode {
  const input = record(value)
  if (!boundedId(input.id) || !['file', 'pasted-text', 'assistant-result', 'assistant-excerpt', 'web-link', 'generated-summary', 'generated-mind-map', 'generated-container'].includes(String(input.kind)) ||
      ![input.x, input.y].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7)) throw new Error('剪贴板组件或位置无效。')
  const output: ClipboardNode = { id: input.id, kind: input.kind as string, x: input.x as number, y: input.y as number }
  for (const key of ['width', 'height', 'aspectRatio', 'stackOrder']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || (input[key] as number) < 0 || (input[key] as number) > 1e6) throw new Error('组件尺寸无效。')
    output[key] = input[key]
  }
  if (input.sizeMode === 'auto' || input.sizeMode === 'manual') output.sizeMode = input.sizeMode
  for (const key of ['title', 'displayName', 'name', 'messageId', 'generationDetail']) if (input[key] !== undefined) output[key] = boundedText(input[key], 2048)
  for (const key of ['excerpt', 'sourceText', 'containerPrompt']) if (input[key] !== undefined) output[key] = boundedText(input[key])
  if (input.kind === 'web-link') { output.url = publicUrl(input.url); output.titleMode = ['custom', 'manual'].includes(String(input.titleMode)) ? 'custom' : 'auto' }
  if (input.containerSpec !== undefined) {
    const spec = record(input.containerSpec)
    if (!['markdown', 'table', 'chart', 'kpi', 'web', 'mind-map'].includes(String(spec.type))) throw new Error('组件类型不支持复制。')
    output.containerSpec = safeSpec(spec)
  }
  if (String(input.kind).startsWith('generated-')) {
    output.generationStatus = input.containerSpec !== undefined ? 'completed'
      : ['queued', 'running', 'pending'].includes(String(input.generationStatus)) ? 'interrupted'
      : ['draft', 'failed', 'cancelled', 'interrupted'].includes(String(input.generationStatus)) ? input.generationStatus
      : input.containerSpec !== undefined || typeof input.excerpt === 'string' && input.excerpt.trim() ? 'completed' : 'failed'
    if (input.kind === 'generated-container') output.refreshMinutes = 0
  }
  if (input.creationMode === 'selection') output.creationMode = 'selection'
  if (input.sourceNodeIds !== undefined) {
    if (!Array.isArray(input.sourceNodeIds) || input.sourceNodeIds.length > MAX_FILES || !input.sourceNodeIds.every(boundedId)) throw new Error('来源列表无效。')
    output.sourceNodeIds = [...input.sourceNodeIds]
  }
  if (input.generationSources !== undefined) {
    if (!Array.isArray(input.generationSources) || input.generationSources.length > MAX_FILES) throw new Error('来源列表无效。')
    output.generationSources = input.generationSources.map((raw) => {
      const source = record(raw)
      if (!boundedId(source.id) || !['file', 'artifact', 'text', 'web'].includes(String(source.type))) throw new Error('来源无效。')
      // Frozen provenance is metadata, never a new filesystem/preview capability.
      const result: RecordValue = { id: source.id, type: source.type, title: boundedText(source.title, 2048) }
      if (typeof source.text === 'string') result.text = boundedText(source.text, 120_000)
      if (source.type === 'web' && source.url !== undefined) result.url = publicUrl(source.url)
      return result
    })
  }
  if (input.kind === 'file' && opaque(input.assetId)) output.assetId = input.assetId
  return output
}

// Parse only the bounded array-of-strings subset Finder puts on the pasteboard.
function plistPaths(bytes: Buffer): string[] {
  if (bytes.subarray(0, 8).toString() === 'bplist00') {
    if (bytes.length < 40) throw new Error('文件剪贴板无效。')
    const trailer = bytes.length - 32; const offsetSize = bytes[trailer + 6]!; const refSize = bytes[trailer + 7]!
    const integer = (at: number, size: number): number => {
      if (size < 1 || size > 8 || at < 8 || at + size > bytes.length) throw new Error('文件剪贴板无效。')
      const n = size === 8 ? Number(bytes.readBigUInt64BE(at)) : bytes.readUIntBE(at, size)
      if (!Number.isSafeInteger(n)) throw new Error('文件剪贴板无效。')
      return n
    }
    const count = integer(trailer + 8, 8); const root = integer(trailer + 16, 8); const table = integer(trailer + 24, 8)
    if (count > 1024 || root >= count || table + count * offsetSize > trailer) throw new Error('文件剪贴板无效。')
    const object = (index: number, array: boolean): string[] | string => {
      if (index >= count) throw new Error('文件剪贴板无效。')
      let at = integer(table + index * offsetSize, offsetSize)
      if (at < 8 || at >= table) throw new Error('文件剪贴板无效。')
      const type = bytes[at]! >> 4; let length = bytes[at++]! & 15
      if (length === 15) { const marker = bytes[at++]; if (marker === undefined || marker >> 4 !== 1 || (marker & 15) > 3) throw new Error('文件剪贴板无效。'); const size = 2 ** (marker & 15); length = integer(at, size); at += size }
      if (array && type === 10 && length <= MAX_FILES && at + length * refSize <= table) return Array.from({ length }, (_, i) => object(integer(at + i * refSize, refSize), false) as string)
      if (!array && [5, 6].includes(type) && length <= 8192 && at + length * (type === 6 ? 2 : 1) <= table) {
        const data = Buffer.from(bytes.subarray(at, at + length * (type === 6 ? 2 : 1)))
        return type === 6 ? data.swap16().toString('utf16le') : data.toString('utf8')
      }
      throw new Error('文件剪贴板无效。')
    }
    return object(root, true) as string[]
  }
  const xml = bytes.toString('utf8')
  const array = xml.match(/<array>\s*([\s\S]*?)\s*<\/array>/)?.[1]
  if (array === undefined || /<!ENTITY/i.test(xml)) throw new Error('文件剪贴板无效。')
  const matches = [...array.matchAll(/<string>([^<]*)<\/string>/g)]
  if (array.replace(/<string>[^<]*<\/string>/g, '').trim()) throw new Error('文件剪贴板无效。')
  return matches.map((match) => match[1]!.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]!))
}

export class ResearchCanvasClipboard {
  private readonly root: string
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly options: Options) { this.root = path.join(realpathSync(options.userDataPath), 'research-clipboard') }
  private has(format: string): boolean { return this.options.clipboard.has?.(format) ?? this.options.clipboard.availableFormats().includes(format) }
  private reference(): string | null {
    if (this.has(RESEARCH_CLIPBOARD_FORMAT)) {
      const data = this.options.clipboard.readBuffer(RESEARCH_CLIPBOARD_FORMAT)
      if (data.length !== 48 || !opaque(data.toString())) throw new Error('Sherlock 剪贴板引用无效，请重新复制。')
      return data.toString()
    }
    const html = this.options.clipboard.readHTML()
    if (!/<meta\b[^>]*\bname\s*=\s*(?:"sherlock-research-clipboard"|'sherlock-research-clipboard'|sherlock-research-clipboard(?=\s|\/?>))/i.test(html)) return null
    if (html.length > MAX_HTML_ENVELOPE) throw new Error('Sherlock 剪贴板引用无效，请重新复制。')
    const ref = html.match(/<meta name="sherlock-research-clipboard" content="([a-f0-9]{48})">/)?.[1]
    if (!ref) throw new Error('Sherlock 剪贴板引用无效，请重新复制。')
    return ref
  }
  private nativePaths(): string[] | null {
    const format = FILE_FORMATS.find((name) => this.has(name))
    if (!format) return null
    const bytes = this.options.clipboard.readBuffer(format)
    if (bytes.length > MAX_TEXT) throw new Error('剪贴板文件列表过大。')
    let values = format === 'NSFilenamesPboardType' ? plistPaths(bytes) : (format === 'FileNameW' ? bytes.toString('utf16le') : bytes.toString('utf8')).split(/[\r\n\0]+/).filter((line) => line && !line.startsWith('#'))
    if (format === 'text/uri-list' && values.every((value) => !value.startsWith('file:'))) return null
    if (values.length === 0 || values.length > MAX_FILES) throw new Error('一次最多粘贴 100 个文件。')
    values = values.map((value) => {
      const target = format === 'NSFilenamesPboardType' || format === 'FileNameW' ? value : fileURLToPath(value)
      if (!path.isAbsolute(target) || target.length > 8192 || target.includes('\0')) throw new Error('文件剪贴板路径无效。')
      return target
    })
    return [...new Set(values)]
  }
  async inspect(): Promise<{ available: boolean }> {
    try {
      const ref = this.reference()
      if (ref) { await this.readSnapshot(ref); return { available: true } }
      const files = this.nativePaths()
      if (files) { await Promise.all(files.map((file) => this.fileBytes(file, MAX_FILE, true))); return { available: true } }
      if (!this.options.clipboard.readImage().isEmpty()) return { available: true }
      return { available: boundedText(this.options.clipboard.readText()).length > 0 }
    } catch { return { available: false } }
  }
  copy(value: unknown): Promise<{ ok: boolean; error?: string }> {
    return this.serial(async () => {
      const created: string[] = []
      try {
        const input = record(value)
        if (!exactKeys(input, ['sessionId', 'nodes']) || !boundedId(input.sessionId) || !Array.isArray(input.nodes) || input.nodes.length === 0 || input.nodes.length > MAX_FILES) throw new Error('一次最多复制 100 个组件。')
        const nodes = input.nodes.map(sanitizeNode)
        if (new Set(nodes.map((node) => node.id)).size !== nodes.length || Buffer.byteLength(JSON.stringify(nodes)) > MAX_SNAPSHOT) throw new Error('组件内容过大或标识重复。')
        await this.ensureStore()
        let total = 0
        for (const [i, node] of nodes.entries()) if (node.kind === 'file') {
          const raw = record(input.nodes[i]); let source: { path: string; name: string } | null
          if (opaque(raw.assetId)) { const asset = await this.loadAsset(raw.assetId); source = { path: asset.path, name: asset.manifest.name } }
          else source = await this.options.registry.resolveExportSource({ sessionId: input.sessionId, nodeId: node.id, authorizationId: raw.authorizationId })
          if (!source) throw new Error('源文件不可用，请重新添加后复制。')
          const bytes = await this.fileBytes(source.path, MAX_FILE)
          total += bytes.length; if (total > MAX_BATCH) throw new Error('一次复制文件总量不能超过 128 MiB。')
          const asset = await this.storeAsset(source.name, bytes, created)
          Object.assign(node, asset)
        }
        const snapshotId = newId(); const target = path.join(this.root, 'snapshots', `${snapshotId}.json`)
        const snapshot = { version: 1, nodes }
        if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT) throw new Error('组件快照不能超过 2 MiB。')
        await this.atomicJson(target, snapshot); created.push(target)
        const text = nodes.map((node) => String(node.excerpt || node.title || node.name || 'Sherlock 组件')).join('\n\n').slice(0, MAX_TEXT)
        // A single Electron write preserves both the opaque HTML envelope and text fallback.
        this.options.clipboard.write({ text, html: `<meta name="sherlock-research-clipboard" content="${snapshotId}"><span>${text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!)}</span>` })
        return { ok: true }
      } catch (error) {
        await Promise.all(created.map((target) => rm(target, { force: true, recursive: true }).catch(() => {})))
        return { ok: false, error: error instanceof Error && !('code' in error) ? error.message : '复制失败，文件或存储不可用，请重试。' }
      }
    })
  }
  read(): Promise<ResearchClipboardRead> {
    return this.serial(async () => {
      try {
        const ref = this.reference()
        if (ref) return { kind: 'components', nodes: await this.readSnapshot(ref) }
        const paths = this.nativePaths()
        const created: string[] = []
        try {
          if (paths) {
            await this.ensureStore(); const files: ClipboardAsset[] = []; let total = 0
            for (const target of paths) {
              const bytes = await this.fileBytes(target, MAX_FILE); total += bytes.length
              if (total > MAX_BATCH) throw new Error('一次粘贴文件总量不能超过 128 MiB。')
              files.push(await this.storeAsset(path.basename(target), bytes, created))
            }
            return { kind: 'files', files }
          }
          const image = this.options.clipboard.readImage()
          if (!image.isEmpty()) {
            const size = image.getSize()
            if (size.width * size.height > 40_000_000) throw new Error('剪贴板图片过大。')
            await this.ensureStore()
            return { kind: 'files', files: [await this.storeAsset('剪贴板图片.png', image.toPNG(), created)] }
          }
          const text = boundedText(this.options.clipboard.readText())
          return text ? { kind: 'text', text } : { kind: 'empty' }
        } catch (error) { await Promise.all(created.map((target) => rm(target, { recursive: true, force: true }).catch(() => {}))); throw error }
      } catch (error) { throw new Error(error instanceof Error && !('code' in error) ? error.message : '剪贴板资源已失效或不可用，请重新复制。') }
    })
  }
  async admit(value: unknown): Promise<ResearchClipboardAdmission | null> {
    try {
      const input = record(value)
      if (!exactKeys(input, ['assetId', 'sessionId', 'nodeId']) || !opaque(input.assetId) || !boundedId(input.sessionId) || !boundedId(input.nodeId)) return null
      const asset = await this.loadAsset(input.assetId)
      if (!asset.manifest.previewable) return null
      const descriptor = await this.options.registry.admitFinder({ path: asset.path, sessionId: input.sessionId, nodeId: input.nodeId })
      return descriptor === null ? null : { ...descriptor, path: asset.path }
    } catch { return null }
  }
  async open(value: unknown): Promise<{ ok: boolean }> {
    try {
      const input = record(value)
      if (!exactKeys(input, ['assetId']) || !opaque(input.assetId)) return { ok: false }
      const asset = await this.loadAsset(input.assetId)
      if (asset.manifest.previewable) return { ok: false }
      this.options.revealFile(asset.path)
      return { ok: true }
    } catch { return { ok: false } }
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const pending = this.queue.then(operation, operation); this.queue = pending.catch(() => {}); return pending }
  private async ensureStore(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    for (const dir of [this.root, path.join(this.root, 'assets'), path.join(this.root, 'snapshots')]) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== dir) throw new Error('剪贴板存储位置无效。')
    }
    if ((await readdir(path.join(this.root, 'assets'))).length >= 4096 || (await readdir(path.join(this.root, 'snapshots'))).length >= 4096) throw new Error('剪贴板持久存储已满。')
  }
  private async fileBytes(target: string, limit: number, inspectOnly = false): Promise<Buffer> {
    const before = await lstat(target)
    if (!before.isFile() || before.isSymbolicLink()) throw new Error('只能复制常规文件，不能复制文件夹或链接。')
    if (before.size > limit) throw new Error('单个文件不能超过 64 MiB。')
    if (inspectOnly) return Buffer.alloc(0)
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) throw new Error('复制期间文件已更改。')
      const bytes = Buffer.alloc(stat.size)
      let offset = 0
      while (offset < bytes.length) { const result = await handle.read(bytes, offset, bytes.length - offset, offset); if (!result.bytesRead) break; offset += result.bytesRead }
      const after = await handle.stat()
      if (offset !== bytes.length || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('复制期间文件已更改。')
      return bytes
    } finally { await handle.close() }
  }
  private async contained(target: string): Promise<void> {
    const root = await realpath(this.root); const actual = await realpath(target)
    if (root !== this.root || actual !== target || !actual.startsWith(`${root}${path.sep}`)) throw new Error('剪贴板资源位置无效。')
  }
  private async atomicJson(target: string, value: unknown): Promise<void> {
    const temporary = `${target}.${newId()}.tmp`
    try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await rename(temporary, target) }
    finally { await rm(temporary, { force: true }).catch(() => {}) }
  }
  private async storeAsset(name: string, bytes: Buffer, created: string[]): Promise<ClipboardAsset> {
    if (bytes.length > MAX_FILE) throw new Error('单个文件不能超过 64 MiB。')
    name = safeName(name)
    let total = bytes.length
    for (const id of await readdir(path.join(this.root, 'assets'))) {
      if (!opaque(id)) continue
      const manifestPath = path.join(this.root, 'assets', id, 'manifest.json')
      await this.contained(manifestPath)
      const manifest = record(JSON.parse((await this.fileBytes(manifestPath, 8192)).toString()))
      if (typeof manifest.size !== 'number' || !Number.isSafeInteger(manifest.size) || manifest.size < 0 || manifest.size > MAX_FILE) throw new Error('剪贴板资源记录无效。')
      total += manifest.size
    }
    if (total > MAX_STORE) throw new Error('剪贴板持久存储已满（512 MiB）。')
    const assetId = newId(); const directory = path.join(this.root, 'assets', assetId)
    await mkdir(directory, { mode: 0o700 }); created.push(directory)
    const contentDirectory = path.join(directory, 'content')
    await mkdir(contentDirectory, { mode: 0o700 })
    const storedPath = path.join(contentDirectory, name)
    await writeFile(storedPath, bytes, { flag: 'wx', mode: 0o600 })
    const preview = await this.options.registry.inspectFile(storedPath)
    const asset: ClipboardAsset = { assetId, name, size: bytes.length, mimeType: preview?.contentType ?? 'application/octet-stream', previewable: preview !== null }
    await this.atomicJson(path.join(directory, 'manifest.json'), { ...asset, version: 1, sha256: hash(bytes) })
    return asset
  }
  private async loadAsset(assetId: string): Promise<{ manifest: AssetManifest; path: string }> {
    if (!opaque(assetId)) throw new Error('剪贴板资源标识无效。')
    const manifestPath = path.join(this.root, 'assets', assetId, 'manifest.json')
    await this.contained(manifestPath)
    const raw = record(JSON.parse((await this.fileBytes(manifestPath, 8192)).toString()))
    if (!exactKeys(raw, ['assetId', 'name', 'size', 'mimeType', 'previewable', 'version', 'sha256']) || raw.version !== 1 || raw.assetId !== assetId || typeof raw.name !== 'string' || safeName(raw.name) !== raw.name || typeof raw.size !== 'number' || !Number.isSafeInteger(raw.size) || raw.size < 0 || raw.size > MAX_FILE || typeof raw.previewable !== 'boolean' || typeof raw.mimeType !== 'string' || raw.mimeType.length > 256 || typeof raw.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sha256)) throw new Error('剪贴板资源记录无效。')
    const manifest = raw as AssetManifest; const target = path.join(this.root, 'assets', assetId, 'content', manifest.name)
    await this.contained(target)
    const bytes = await this.fileBytes(target, MAX_FILE)
    if (bytes.length !== manifest.size || hash(bytes) !== manifest.sha256) throw new Error('剪贴板资源已更改，请重新复制。')
    const preview = await this.options.registry.inspectFile(target)
    if ((preview !== null) !== manifest.previewable || (preview?.contentType ?? 'application/octet-stream') !== manifest.mimeType) throw new Error('剪贴板文件格式验证失败。')
    return { manifest, path: target }
  }
  private async readSnapshot(id: string): Promise<ClipboardNode[]> {
    const target = path.join(this.root, 'snapshots', `${id}.json`); await this.contained(target)
    const snapshot = record(JSON.parse((await this.fileBytes(target, MAX_SNAPSHOT)).toString()))
    if (!exactKeys(snapshot, ['version', 'nodes']) || snapshot.version !== 1 || !Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0 || snapshot.nodes.length > MAX_FILES) throw new Error('剪贴板组件快照无效。')
    const nodes = snapshot.nodes.map(sanitizeNode)
    if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('剪贴板组件标识重复。')
    for (const node of nodes) if (node.kind === 'file') {
      if (!opaque(node.assetId)) throw new Error('剪贴板文件引用无效。')
      const { manifest } = await this.loadAsset(node.assetId)
      const { version: _version, sha256: _sha256, ...metadata } = manifest; Object.assign(node, metadata)
    }
    return nodes
  }
}

export function registerResearchClipboardHandlers(options: {
  ipcMain: { removeHandler(channel: string): void; handle(channel: string, handler: (event: any, value: unknown) => unknown): unknown }
  getMainWindow(): TrustedWindow | undefined
  service: ResearchCanvasClipboard
}): void {
  for (const method of ['inspect', 'copy', 'read', 'admit', 'open'] as const) {
    const channel = `research:clipboard:${method}`; options.ipcMain.removeHandler(channel)
    registerTrustedMainWindowHandler(options.ipcMain, channel, options.getMainWindow, (_event, value: unknown) => options.service[method](value))
  }
}
