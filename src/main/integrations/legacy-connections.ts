import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { emptyConnectionDraft, type ConnectionDraft } from '../../shared/integration-ui'

export type LegacyConnectionSource = { path: string; layer: 'profile' | 'home' | 'overlay'; profile?: string }
export type LegacyConnectionInput = {
  field: string
  reason: 'secret-removed' | 'environment-reference' | 'configuration-required'
  reference?: { kind: 'environment'; name: string }
}
export type LegacyConnectionPreviewItem = {
  id: string
  status: 'draft' | 'compatibility'
  source: LegacyConnectionSource & { pointer: string; digest?: string; entryId?: string }
  name: string
  legacyDisabled?: boolean
  draft?: ConnectionDraft
  requiresInput: LegacyConnectionInput[]
  message: string
}
export type LegacyConnectionPreview = { version: 1; status: 'preview'; items: LegacyConnectionPreviewItem[]; notes: string[] }

const MAX_BYTES = 1024 * 1024
const MAX_ROWS = 1000
const MCP_PACKAGES = new Set(['dsh-mcp-client', '@deepseek-ai/dsh-mcp-client'])
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const label = (value: unknown, fallback: string) => typeof value === 'string' && /^[\p{L}\p{N} _.@/-]{1,128}$/u.test(value) ? value : fallback
const input = (field: string, value?: unknown): LegacyConnectionInput => {
  const reference = envReference(value)
  return reference ? { field, reason: 'environment-reference', reference: { kind: 'environment', name: reference } } : { field, reason: 'secret-removed' }
}
function envReference(value: unknown): string | undefined {
  if (record(value) && typeof value.environmentReference === 'string') return value.environmentReference
  if (typeof value !== 'string') return undefined
  return /^(?:\$\{(?:env\.)?([A-Za-z_][A-Za-z0-9_]*)\}|\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\})$/.exec(value)?.slice(1).find(Boolean)
}
function expression(value: string): Record<string, unknown> {
  // Preserve only a variable identifier. Never evaluate or return the expression source.
  const ref = /^\s*process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])\s*$/.exec(value)?.slice(1).find(Boolean)
  return ref ? { legacyDynamic: true, environmentReference: ref } : { legacyDynamic: true }
}

/** Mirrors the desktop's real DSH web-profile patch stack. Model settings and generated cordis.yml are not connections. */
export function legacyConnectionSources(options: { userDataRoot: string; profile?: string; overlays?: string[] }): LegacyConnectionSource[] {
  const profile = options.profile ?? 'web'
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(profile)) throw new Error('旧连接 profile 无效')
  const sources: LegacyConnectionSource[] = [
    { path: resolve(options.userDataRoot, 'harness/profiles', profile, 'cordis.patch.yml'), layer: 'profile', profile },
    { path: resolve(options.userDataRoot, 'harness/cordis.patch.yml'), layer: 'home' },
    ...(options.overlays ?? []).map(path => ({ path: resolve(path), layer: 'overlay' as const }))
  ]
  return [...new Map(sources.map(source => [source.path, source])).values()]
}

/** Read-only and deliberately non-executable: a draft is neither a takeover nor an authorization. */
export async function previewLegacyConnections(options: { sources: LegacyConnectionSource[] }): Promise<LegacyConnectionPreview> {
  if (options.sources.length > 64) throw new Error('旧连接配置来源过多')
  const items: LegacyConnectionPreviewItem[] = []
  const occurrences = new Map<string, number>()
  let scannedRows = 0
  const add = (source: LegacyConnectionSource, pointer: string, hash?: string, row?: Record<string, unknown>) => {
    const entryId = typeof row?.id === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(row.id) ? row.id : undefined
    const item: LegacyConnectionPreviewItem = {
      id: `legacy-connection:${digest(`${source.path}\0${pointer}`)}`,
      status: 'compatibility', source: { ...source, pointer, ...(hash ? { digest: hash } : {}), ...(entryId ? { entryId } : {}) },
      name: label(record(row?.config) ? row.config.serverName : undefined, '旧连接配置'), requiresInput: [],
      message: '旧配置格式或作用域不能可靠转换，保留原配置，请手动添加连接。'
    }
    if (typeof row?.disabled === 'boolean') item.legacyDisabled = row.disabled
    items.push(item)
    return item
  }
  for (const source of options.sources) {
    let content: string
    try {
      const stat = await lstat(source.path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || stat.nlink !== 1) throw new Error('unsafe source')
      const handle = await open(source.path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const before = await handle.stat()
        if (before.ino !== stat.ino || before.dev !== stat.dev || before.size > MAX_BYTES) throw new Error('source changed')
        const buffer = Buffer.alloc(MAX_BYTES + 1)
        let bytes = 0
        while (bytes < buffer.length) {
          const result = await handle.read(buffer, bytes, buffer.length - bytes, bytes)
          if (!result.bytesRead) break
          bytes += result.bytesRead
        }
        const after = await handle.stat()
        if (bytes > MAX_BYTES || bytes !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('source changed')
        content = buffer.subarray(0, bytes).toString('utf8')
      } finally { await handle.close() }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      add(source, '').message = '旧配置不是安全的普通文件、超过 1 MiB 或无法读取，原文件未修改。'
      continue
    }
    const hash = digest(content)
    let document: unknown
    try {
      const parsed = parseDocument(content, { schema: 'core', customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: expression }] })
      if (parsed.errors.length || parsed.warnings.length) throw new Error('invalid yaml')
      document = parsed.toJS({ maxAliasCount: 0 })
      if (!Array.isArray(document)) throw new Error('not a patch array')
    } catch {
      add(source, '', hash).message = '旧配置格式、标签或别名不受支持，未执行表达式，原文件未修改。'
      continue
    }
    const walk = (rows: unknown[], pointer: string, inserted: boolean, scoped: boolean, depth: number) => {
      if (depth > 20) throw new Error('nested configuration')
      for (const [index, value] of rows.entries()) {
        if (++scannedRows > MAX_ROWS) throw new Error('too many rows')
        if (!record(value)) continue
        const at = `${pointer}/${index}`
        if (typeof value.id === 'string') occurrences.set(value.id, (occurrences.get(value.id) ?? 0) + 1)
        if (Array.isArray(value.insert)) walk(value.insert, `${at}/insert`, true, scoped || typeof value.id === 'string', depth + 1)
        if (value.group && Array.isArray(value.config)) walk(value.config, `${at}/config`, true, true, depth + 1)
        const config = record(value.config) ? value.config : undefined
        const isMcp = typeof value.name === 'string' && MCP_PACKAGES.has(value.name)
        const looksLikeConnection = isMcp || config?.transport === 'stdio' || config?.transport === 'streamable-http' ||
          (/mcp|(?:^|[-_])api(?:$|[-_])/i.test(String(value.name ?? '') + ' ' + String(value.id ?? '')) && !!config)
        if (!looksLikeConnection) continue
        const item = add(source, at, hash, value)
        if (!isMcp || !inserted || scoped || !config) continue
        toDraft(item, config)
      }
    }
    const start = items.length
    try { walk(document as unknown[], '', false, false, 0) }
    catch {
      items.splice(start)
      add(source, '', hash).message = '旧配置条目或嵌套层数超过预览限额，原文件未修改。'
    }
  }
  // Patches replace whole config fields, and bundles are another layer. Do not invent an effective merged server.
  for (const item of items) if (item.source.entryId && (occurrences.get(item.source.entryId) ?? 0) > 1) {
    item.status = 'compatibility'; delete item.draft; item.requiresInput = []
    item.message = '此连接在多个配置层被定义或覆盖，生效配置和旧连接关停方式需先确认，未生成迁移草稿。'
  }
  return { version: 1, status: 'preview', items, notes: [
    '预览不会运行命令、连接服务器、读取环境变量值或修改原文件。旧启用状态不代表新工具授权。',
    '保存新连接前需确认原 MCP 实例已停用，并重新选择工作区和允许的工具；预览不执行接管。',
    '当前仅识别明确的 DSH MCP 插入配置。未发现可靠的旧通用 API 连接格式时保留兼容状态；模型 Provider 设置不作为工具 API 迁移。'
  ] }
}

function toDraft(item: LegacyConnectionPreviewItem, config: Record<string, unknown>) {
  if (config.transport !== 'stdio' && config.transport !== 'streamable-http') return
  const draft = emptyConnectionDraft(config.transport === 'stdio' ? 'mcp-stdio' : 'mcp-http')
  draft.name = item.name
  if (config.transport === 'stdio') {
    if (typeof config.command !== 'string' || !/^[A-Za-z0-9_./\\:-]{1,1024}$/.test(config.command)) return
    draft.command = config.command
    draft.args = '[]'
    // Any argument can carry a credential, including positional arguments. Never echo old argument values.
    if (config.args !== undefined && (!Array.isArray(config.args) || config.args.length)) item.requiresInput.push({ field: 'args', reason: 'configuration-required' })
    if (typeof config.cwd === 'string' && isAbsolute(config.cwd) && !/[\r\n\0$]/.test(config.cwd) && config.cwd.length <= 4096) draft.cwd = config.cwd
    else if (config.cwd) item.requiresInput.push({ field: 'cwd', reason: 'configuration-required' })
    if (config.env !== undefined && !record(config.env)) return
    const envKeys: string[] = []
    for (const [key, value] of Object.entries(config.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)) { item.requiresInput.push({ field: 'env', reason: 'configuration-required' }); continue }
      envKeys.push(`${key}=`)
      item.requiresInput.push(input(`env.${key}`, value))
    }
    draft.env = envKeys.join('\n')
  } else {
    if (typeof config.url !== 'string' || /\$\{|[\r\n\0]/.test(config.url)) return
    let url: URL
    try { url = new URL(config.url); if (!['https:', 'http:'].includes(url.protocol)) return } catch { return }
    if (url.username || url.password || url.search || url.hash) item.requiresInput.push(input('url'))
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''
    draft.url = url.toString()
    if (config.headers !== undefined && !record(config.headers)) return
    const headers = Object.entries(config.headers ?? {})
    const authorization = headers.find(([key]) => key.toLowerCase() === 'authorization')
    const apiKey = headers.find(([key]) => /^(?:x-)?api[-_]key$/i.test(key))
    if (authorization) { draft.authType = 'bearer'; item.requiresInput.push(input('secret', authorization[1])) }
    else if (apiKey) { draft.authType = 'api-key'; draft.headerName = apiKey[0]; item.requiresInput.push(input('secret', apiKey[1])) }
    for (const [key, value] of headers) {
      if (key === (authorization ?? apiKey)?.[0]) continue
      item.requiresInput.push(input(/^[A-Za-z0-9-]{1,128}$/.test(key) ? `headers.${key}` : 'headers', value))
    }
  }
  item.status = 'draft'; item.draft = draft
  item.message = '仅生成去凭据草稿；旧连接仍保持原状。请补全配置、确认旧实例停用并重新授权工具后再使用。'
}
