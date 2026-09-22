import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'

export const SKILL_IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxPackageBytes: 50 * 1024 * 1024,
  maxFiles: 1000
})

export type SkillImportErrorCode = 'UNSAFE_PATH' | 'INVALID_SKILL' | 'FILE_TOO_LARGE'
  | 'PACKAGE_TOO_LARGE' | 'TOO_MANY_FILES' | 'SOURCE_CHANGED' | 'SOURCE_CONFLICT'
  | 'PREVIEW_EXPIRED' | 'PREVIEW_STALE' | 'STORAGE_INVALID' | 'ROLLBACK_CONFLICT'

export class SkillImportError extends Error {
  constructor(public readonly code: SkillImportErrorCode, message: string) {
    super(message)
    this.name = 'SkillImportError'
  }
}

export interface SkillImportFile {
  path: string
  bytes: number
  digest: string
}

export interface SkillImportConflict {
  id: string
  name: string
  sourceId: string
  sameSource: boolean
  version: number
  digest: string
}

export interface SkillImportPreview {
  previewId: string
  sourceId: string
  sourceDigest: string
  name: string
  description: string
  bodyPreview: string
  dependencies: string[]
  files: SkillImportFile[]
  totalBytes: number
  conflicts: SkillImportConflict[]
  expiresAt: number
}

export interface ImportedSkill {
  id: string
  sourceId: string
  name: string
  description: string
  dependencies: string[]
  digest: string
  version: number
  installPath: string
  previousVersionPath?: string
  /** Opaque single-process token; only used if the owning service's metadata commit fails. */
  rollbackToken: string
}

interface CurrentSkill {
  schemaVersion: 1
  id: string
  sourceId: string
  name: string
  description: string
  dependencies: string[]
  digest: string
  version: number
  versionDirectory: string
  installedAt: number
  ownerAccountId?: string
}

interface Snapshot {
  root: string
  sourceId: string
  digest: string
  name: string
  description: string
  body: string
  dependencies: string[]
  files: Array<SkillImportFile & { content: Buffer }>
  totalBytes: number
}

function fail(code: SkillImportErrorCode, message: string): never {
  throw new SkillImportError(code, message)
}
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
function validId(id: string): boolean { return /^skill-[a-f0-9]{24}(?:-[a-f0-9]{8})?$/u.test(id) }
function baseId(sourceId: string, owner?: string): string { return `skill-${owner ? hash(`${owner}\0${sourceId}`).slice(0, 24) : sourceId.slice('local:'.length, 'local:'.length + 24)}` }

function safeRelativePath(value: string): string[] {
  if (!value || isAbsolute(value) || value.includes('\\') || value.includes(':') || value.includes('\0')) {
    fail('UNSAFE_PATH', '技能资源必须使用包内的相对路径。')
  }
  const segments = value.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    fail('UNSAFE_PATH', '技能资源路径不能跨越包目录。')
  }
  return segments
}

async function canonicalDirectory(path: string): Promise<string> {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('UNSAFE_PATH', '技能目录不能是符号链接。')
  return realpath(path)
}

/** Resource reads recheck every path segment; imported files do not gain ambient filesystem access. */
export async function readSkillResource(installPath: string, resourcePath: string): Promise<Buffer> {
  const root = await canonicalDirectory(installPath)
  const segments = safeRelativePath(resourcePath)
  let path = root
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment)
    const info = await lstat(path)
    if (info.isSymbolicLink() || (index < segments.length - 1 && !info.isDirectory())) {
      fail('UNSAFE_PATH', '技能资源包含不安全的链接或目录。')
    }
  }
  return readSafeFile(root, path)
}

async function readSafeFile(root: string, path: string): Promise<Buffer> {
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink > 1) {
    fail('UNSAFE_PATH', '技能包只允许普通文件，不能包含链接或特殊文件。')
  }
  if (before.size > SKILL_IMPORT_LIMITS.maxFileBytes) fail('FILE_TOO_LARGE', '技能单个文件不能超过 2 MiB。')
  const canonical = await realpath(path)
  const rel = relative(root, canonical)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('UNSAFE_PATH', '技能文件已移出所选目录。')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.nlink > 1) {
      fail('UNSAFE_PATH', '技能文件在读取时被替换。')
    }
    // A bounded read also protects against a file growing after lstat.
    const buffer = Buffer.alloc(Math.min(opened.size + 1, SKILL_IMPORT_LIMITS.maxFileBytes + 1))
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > SKILL_IMPORT_LIMITS.maxFileBytes) fail('FILE_TOO_LARGE', '技能单个文件不能超过 2 MiB。')
    const after = await handle.stat()
    const current = await lstat(path)
    if (after.size !== before.size || offset !== after.size || after.mtimeMs !== before.mtimeMs
      || current.ino !== before.ino || current.dev !== before.dev || current.isSymbolicLink()
      || await realpath(path) !== canonical) fail('SOURCE_CHANGED', '技能文件在读取过程中发生变化，请重新预览。')
    return buffer.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

function parseSkill(content: Buffer): Pick<Snapshot, 'name' | 'description' | 'body' | 'dependencies'> {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(content) } catch { fail('INVALID_SKILL', 'SKILL.md 必须使用 UTF-8 编码。') }
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  if (!match) fail('INVALID_SKILL', 'SKILL.md 缺少 YAML 名称和说明。')
  let value: unknown
  try {
    const document = parseDocument(match[1]!, { schema: 'core', uniqueKeys: true })
    if (document.errors.length || document.warnings.length) fail('INVALID_SKILL', '技能元信息包含无效或不支持的 YAML。')
    value = document.toJS({ maxAliasCount: 20 })
  } catch (error) {
    if (error instanceof SkillImportError) throw error
    fail('INVALID_SKILL', '无法解析技能元信息。')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SKILL', '技能元信息必须是对象。')
  const metadata = value as Record<string, unknown>
  const name = metadata.name
  const description = metadata.description
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f]/u.test(name)) {
    fail('INVALID_SKILL', '技能名称必须是 1–100 个字符。')
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 2000) {
    fail('INVALID_SKILL', '技能说明必须是 1–2000 个字符。')
  }
  const dependencies = metadata.dependencies ?? []
  if (!Array.isArray(dependencies) || dependencies.length > 100
    || dependencies.some(item => typeof item !== 'string' || !item.trim() || item.length > 256 || /[\u0000-\u001f]/u.test(item))) {
    fail('INVALID_SKILL', '技能连接依赖必须是字符串列表。')
  }
  const body = text.slice(match[0].length).trim()
  if (!body) fail('INVALID_SKILL', '技能正文不能为空。')
  return { name: name.trim(), description: description.trim(), body, dependencies: [...new Set(dependencies as string[])] }
}

async function snapshot(sourcePath: string): Promise<Snapshot> {
  const requested = resolve(sourcePath)
  const entry = await lstat(requested)
  if (entry.isSymbolicLink()) fail('UNSAFE_PATH', '请选择实际技能目录或 SKILL.md，不能选择符号链接。')
  if (!entry.isDirectory() && (!entry.isFile() || basename(requested) !== 'SKILL.md')) {
    fail('INVALID_SKILL', '请选择包含 SKILL.md 的目录或 SKILL.md 文件。')
  }
  const root = await canonicalDirectory(entry.isDirectory() ? requested : dirname(requested))
  const files: Snapshot['files'] = []
  const paths = new Set<string>()
  let totalBytes = 0
  let directories = 0
  async function walk(directory: string, prefix = '', depth = 0): Promise<void> {
    if (depth > 32 || ++directories > 2000) fail('UNSAFE_PATH', '技能包目录层级或目录数量过多。')
    for (const entryName of (await readdir(directory)).sort()) {
      const relativePath = prefix ? `${prefix}/${entryName}` : entryName
      safeRelativePath(relativePath)
      const path = join(directory, entryName)
      const info = await lstat(path)
      if (info.isSymbolicLink()) fail('UNSAFE_PATH', '技能包不能包含符号链接。')
      if (info.isDirectory()) {
        const canonical = await canonicalDirectory(path)
        if (canonical !== path) fail('UNSAFE_PATH', '技能目录在预览时被替换。')
        await walk(path, relativePath, depth + 1)
      } else {
        if (files.length >= SKILL_IMPORT_LIMITS.maxFiles) fail('TOO_MANY_FILES', '技能包最多包含 1000 个文件。')
        if (info.size > SKILL_IMPORT_LIMITS.maxFileBytes) fail('FILE_TOO_LARGE', '技能单个文件不能超过 2 MiB。')
        if (totalBytes + info.size > SKILL_IMPORT_LIMITS.maxPackageBytes) fail('PACKAGE_TOO_LARGE', '技能包总大小不能超过 50 MiB。')
        const normalizedPath = relativePath.normalize('NFC').toLowerCase()
        if (paths.has(normalizedPath)) fail('UNSAFE_PATH', '技能包包含在其他文件系统上冲突的文件名。')
        paths.add(normalizedPath)
        const content = await readSafeFile(root, path)
        totalBytes += content.length
        files.push({ path: relativePath, bytes: content.length, digest: hash(content), content })
      }
    }
  }
  await walk(root)
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const main = files.find(file => file.path === 'SKILL.md')
  if (!main) fail('INVALID_SKILL', '所选目录中没有 SKILL.md。')
  const digest = hash(JSON.stringify(files.map(({ path, bytes, digest }) => ({ path, bytes, digest }))))
  return { root, sourceId: `local:${hash(root)}`, digest, totalBytes, files, ...parseSkill(main.content) }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close()
    await rm(temporary, { force: true })
    throw error
  }
  await handle.close()
  try { await rename(temporary, path) } catch (error) { await rm(temporary, { force: true }); throw error }
}

/** Filesystem transaction only. IntegrationService owns permissions, metadata revision and OperationReceipt. */
export class SkillImportManager {
  private readonly managedRoot: string
  private readonly baseRoot: string
  private readonly ownerAccountId?: string
  private readonly now: () => number
  private readonly previewTtlMs: number
  private readonly previews = new Map<string, { preview: SkillImportPreview; sourceRoot: string }>()
  private readonly rollbacks = new Map<string, { current: CurrentSkill; previous?: CurrentSkill }>()
  private queue: Promise<void> = Promise.resolve()

  constructor(managedRoot: string, options: { now?: () => number; previewTtlMs?: number; ownerAccountId?: string } = {}) {
    if (options.ownerAccountId !== undefined && (!options.ownerAccountId || options.ownerAccountId.length > 512)) throw new TypeError('ownerAccountId must be a non-empty account id')
    this.ownerAccountId = options.ownerAccountId
    this.baseRoot = resolve(managedRoot)
    this.managedRoot = options.ownerAccountId ? resolve(managedRoot, 'owners', hash(options.ownerAccountId).slice(0, 32)) : resolve(managedRoot)
    this.now = options.now ?? Date.now
    this.previewTtlMs = options.previewTtlMs ?? 10 * 60 * 1000
    if (!Number.isFinite(this.previewTtlMs) || this.previewTtlMs <= 0) throw new TypeError('previewTtlMs must be positive')
  }

  async previewSkillImport(sourcePath: string): Promise<SkillImportPreview> {
    const source = await snapshot(sourcePath)
    const current = await this.installed()
    for (const [id, stored] of this.previews) if (stored.preview.expiresAt <= this.now()) this.previews.delete(id)
    while (this.previews.size >= 64) this.previews.delete(this.previews.keys().next().value!)
    const preview: SkillImportPreview = {
      previewId: randomUUID(), sourceId: source.sourceId, sourceDigest: source.digest,
      name: source.name, description: source.description, dependencies: source.dependencies,
      bodyPreview: source.body.slice(0, 12000), files: source.files.map(({ content: _, ...file }) => file),
      totalBytes: source.totalBytes, expiresAt: this.now() + this.previewTtlMs,
      conflicts: current.filter(item => item.sourceId === source.sourceId || item.name === source.name)
        .map(item => ({ id: item.id, name: item.name, sourceId: item.sourceId, sameSource: item.sourceId === source.sourceId, version: item.version, digest: item.digest }))
    }
    this.previews.set(preview.previewId, { preview, sourceRoot: source.root })
    return structuredClone(preview)
  }

  commitSkillImport(previewId: string, mode: 'replace' | 'copy'): Promise<ImportedSkill> {
    return this.serial(async () => {
      if (mode !== 'replace' && mode !== 'copy') fail('INVALID_SKILL', '请选择替换或另存技能。')
      const stored = this.previews.get(previewId)
      if (!stored || stored.preview.expiresAt <= this.now()) {
        this.previews.delete(previewId)
        fail('PREVIEW_EXPIRED', '技能预览已过期，请重新选择文件。')
      }
      const source = await snapshot(stored.sourceRoot)
      const preview = stored.preview
      if (source.digest !== preview.sourceDigest || source.sourceId !== preview.sourceId) fail('SOURCE_CHANGED', '技能文件已修改，请重新预览。')
      const current = await this.installed()
      const sourceBaseId = baseId(source.sourceId, this.ownerAccountId)
      const sameSource = current.find(item => item.id === sourceBaseId)
      const previous = mode === 'replace' ? sameSource : undefined
      if (mode === 'replace') {
        const expected = preview.conflicts.find(item => item.id === sourceBaseId)
        if (expected?.version !== previous?.version || expected?.digest !== previous?.digest) fail('PREVIEW_STALE', '已安装技能发生变化，请重新预览。')
        if (!previous && current.some(item => item.name === source.name && item.sourceId !== source.sourceId)) {
          fail('SOURCE_CONFLICT', '存在同名但不同来源的技能，请选择另存以保留两个版本。')
        }
      }
      const id = previous?.id ?? (current.some(item => item.id === sourceBaseId) ? `${sourceBaseId}-${randomUUID().slice(0, 8)}` : sourceBaseId)
      const root = await this.root(true)
      const home = join(root!, id)
      await mkdir(home, { recursive: true, mode: 0o700 })
      await canonicalDirectory(home)
      const versions = join(home, 'versions')
      await mkdir(versions, { recursive: true, mode: 0o700 })
      await canonicalDirectory(versions)
      const version = (previous?.version ?? 0) + 1
      const versionDirectory = `${version}-${source.digest.slice(0, 12)}-${randomUUID().slice(0, 8)}`
      const installPath = join(versions, versionDirectory)
      const staging = join(root!, `.staging-${randomUUID()}`)
      await mkdir(staging, { mode: 0o700 })
      let promoted = false
      const next: CurrentSkill = { schemaVersion: 1, id, sourceId: source.sourceId, name: source.name, description: source.description,
        dependencies: source.dependencies, digest: source.digest, version, versionDirectory, installedAt: this.now(), ...(this.ownerAccountId ? { ownerAccountId: this.ownerAccountId } : {}) }
      try {
        for (const file of source.files) {
          const target = join(staging, ...safeRelativePath(file.path))
          await mkdir(dirname(target), { recursive: true, mode: 0o700 })
          const handle = await open(target, 'wx', 0o600)
          try { await handle.writeFile(file.content); await handle.sync() } finally { await handle.close() }
        }
        await rename(staging, installPath)
        promoted = true
        await atomicJson(join(home, 'current.json'), next)
      } catch (error) {
        await rm(promoted ? installPath : staging, { recursive: true, force: true })
        throw error
      }
      this.previews.delete(previewId)
      const rollbackToken = randomUUID()
      this.rollbacks.set(rollbackToken, { current: next, previous })
      return { id, sourceId: source.sourceId, name: source.name, description: source.description, dependencies: [...source.dependencies],
        digest: source.digest, version, installPath, rollbackToken,
        ...(previous ? { previousVersionPath: join(versions, previous.versionDirectory) } : {}) }
    })
  }

  /** Call only when service metadata was not committed; refuses to undo a later successful installation. */
  rollbackSkillImport(receipt: ImportedSkill): Promise<void> {
    return this.serial(async () => {
      const saved = this.rollbacks.get(receipt.rollbackToken)
      if (!saved || saved.current.id !== receipt.id) fail('ROLLBACK_CONFLICT', '技能导入回滚凭证无效。')
      const installed = (await this.installed()).find(item => item.id === saved.current.id)
      if (!installed || installed.versionDirectory !== saved.current.versionDirectory) fail('ROLLBACK_CONFLICT', '技能已有更新版本，不能回滚此操作。')
      const root = await this.root(false)
      const home = join(root!, saved.current.id)
      if (saved.previous) await atomicJson(join(home, 'current.json'), saved.previous)
      else await rm(join(home, 'current.json'))
      await rm(join(home, 'versions', saved.current.versionDirectory), { recursive: true, force: true })
      this.rollbacks.delete(receipt.rollbackToken)
    })
  }

  /** Discard compensation state once IntegrationService has durably committed its metadata. */
  finalizeSkillImport(receipt: ImportedSkill): void { this.rollbacks.delete(receipt.rollbackToken) }

  /** Only this manager's owned installation is removed; the import source and rollback peers are untouched. */
  removeManagedSkill(id: string, expected: { resourceRoot?: string; sourceId?: string } = {}): Promise<{ removed: true; sourceId: string }> {
    return this.serial(async () => {
      if (!validId(id)) fail('UNSAFE_PATH', '技能标识不是受管理的安装目录。')
      const current = (await this.installed()).find(skill => skill.id === id)
      if (!current) fail('STORAGE_INVALID', '技能不属于当前账户的受管理目录，未删除任何文件。')
      const root = (await this.root(false))!
      const home = join(root, id)
      const resourceRoot = join(home, 'versions', current.versionDirectory)
      if ((expected.sourceId && current.sourceId !== expected.sourceId)
        || (expected.resourceRoot && await realpath(expected.resourceRoot) !== await realpath(resourceRoot))) {
        fail('STORAGE_INVALID', '技能文件与安装记录不一致，未删除任何文件。')
      }
      const tombstones = await readRetiredSources(root)
      tombstones.add(current.sourceId)
      // Persist the source suppression before removing the owned copy so the original filesystem skill never revives.
      await atomicJson(join(root, '.retired-sources.json'), [...tombstones].sort())
      const removed = join(root, `.removed-${id}-${randomUUID()}`)
      await rename(home, removed)
      await rm(removed, { recursive: true, force: true })
      for (const [token, saved] of this.rollbacks) if (saved.current.id === id) this.rollbacks.delete(token)
      return { removed: true, sourceId: current.sourceId }
    })
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async root(create: boolean): Promise<string | undefined> {
    if (this.ownerAccountId) {
      try {
        if (create) await mkdir(this.baseRoot, { recursive: true, mode: 0o700 })
        const base = await canonicalDirectory(this.baseRoot)
        const ownersPath = join(base, 'owners')
        if (create) await mkdir(ownersPath, { recursive: true, mode: 0o700 })
        const owners = await canonicalDirectory(ownersPath)
        const account = join(owners, hash(this.ownerAccountId).slice(0, 32))
        if (create) await mkdir(account, { recursive: true, mode: 0o700 })
        return await canonicalDirectory(account)
      } catch (error) { if (missing(error) && !create) return; throw error }
    }
    try { return await canonicalDirectory(this.managedRoot) } catch (error) {
      if (!missing(error)) throw error
      if (!create) return undefined
      await mkdir(this.managedRoot, { recursive: true, mode: 0o700 })
      return canonicalDirectory(this.managedRoot)
    }
  }

  private async installed(): Promise<CurrentSkill[]> {
    const root = await this.root(false)
    if (!root) return []
    const result: CurrentSkill[] = []
    for (const id of (await readdir(root)).filter(validId).sort()) {
      const home = join(root, id)
      await canonicalDirectory(home)
      let bytes: Buffer
      try { bytes = await readSafeFile(root, join(home, 'current.json')) } catch (error) { if (missing(error)) continue; throw error }
      let value: CurrentSkill
      try { value = JSON.parse(bytes.toString('utf8')) as CurrentSkill } catch { fail('STORAGE_INVALID', '已安装技能的记录损坏，请恢复备份。') }
      if (!value || value.schemaVersion !== 1 || value.id !== id || !/^local:[a-f0-9]{64}$/u.test(value.sourceId)
        || !Number.isSafeInteger(value.version) || value.version < 1 || !/^[a-f0-9]{64}$/u.test(value.digest)
        || !/^\d+-[a-f0-9]{12}-[a-f0-9]{8}$/u.test(value.versionDirectory)
        || typeof value.name !== 'string' || typeof value.description !== 'string'
        || !Array.isArray(value.dependencies) || value.dependencies.some(item => typeof item !== 'string')
        || value.ownerAccountId !== this.ownerAccountId) {
        fail('STORAGE_INVALID', '已安装技能的记录无效，未进行覆盖。')
      }
      await canonicalDirectory(join(home, 'versions'))
      await canonicalDirectory(join(home, 'versions', value.versionDirectory))
      result.push(value)
    }
    return result
  }
}

async function readRetiredSources(root: string): Promise<Set<string>> {
  try {
    const data: unknown = JSON.parse((await readSafeFile(root, join(root, '.retired-sources.json'))).toString('utf8'))
    if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !/^local:[a-f0-9]{64}$/u.test(id))) fail('STORAGE_INVALID', '技能兼容记录损坏，不能恢复旧目录自动加载。')
    return new Set(data)
  } catch (error) { if (missing(error)) return new Set(); throw error }
}

/** Source hashes only, across all account partitions and retained uninstall tombstones. No skill body or credential is exposed. */
export async function listManagedSkillSourceIds(managedRoot: string): Promise<string[]> {
  let root: string
  try { root = await canonicalDirectory(resolve(managedRoot)) } catch (error) { if (missing(error)) return []; throw error }
  const partitions = [root]
  try {
    const owners = await canonicalDirectory(join(root, 'owners'))
    for (const name of await readdir(owners)) if (/^[a-f0-9]{32}$/u.test(name)) partitions.push(await canonicalDirectory(join(owners, name)))
  } catch (error) { if (!missing(error)) throw error }
  const sources = new Set<string>()
  for (const partition of partitions) {
    for (const id of await readRetiredSources(partition)) sources.add(id)
    for (const name of await readdir(partition)) if (validId(name)) {
      const home = await canonicalDirectory(join(partition, name))
      try {
        const metadata = JSON.parse((await readSafeFile(home, join(home, 'current.json'))).toString('utf8')) as CurrentSkill
        if (metadata.id !== name || !/^local:[a-f0-9]{64}$/u.test(metadata.sourceId)) fail('STORAGE_INVALID', '技能来源记录损坏。')
        sources.add(metadata.sourceId)
      } catch (error) { if (!missing(error)) throw error }
    }
  }
  return [...sources].sort()
}
