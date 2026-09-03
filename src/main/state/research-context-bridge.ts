import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { extname } from 'node:path'
import { registerTrustedMainWindowHandler, type TrustedWindow, type TrustedWindowEvent } from '../ipc-trust'
import type { ResearchCanvasStorage } from './research-canvas-storage'

const CAPTURE_TTL_MS = 10 * 60 * 1000
const MAX_BODY_BYTES = 8192
const SUPPORTED_EXTENSIONS = new Set('.c .cc .cpp .css .csv .go .h .hpp .html .java .js .json .jsx .kt .log .md .mjs .py .rb .rs .sh .sql .swift .toml .ts .tsx .txt .xml .yaml .yml .pdf .pptx'.split(' '))
type Node = Record<string, unknown>
type Source = { id: string; title: string; kind: string; text: string; status: string; path?: string; revision?: { size: number; mtimeMs: number }; truncated?: boolean; sourceNodeIds?: string[]; sourceUrl?: string }
type Canvas = { files: unknown[]; artifacts: unknown[] }
type Capture = { sessionId: string; createdAt: number; sources: Source[]; bytes: number }
type Options = {
  readCanvas(sessionId: string): Canvas | Promise<Canvas>
  resolveFile(value: { sessionId: string; nodeId: string; authorizationId: string }): Promise<{ path: string; name: string } | null>
  now?: () => number
  maxCaptures?: number
  maxStoredBytes?: number
}

function record(value: unknown): Node {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('资料参数无效。')
  return value as Node
}
function id(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 }
function text(value: unknown, limit = 120_000): string { return typeof value === 'string' ? value.slice(0, limit).trim() : '' }
function exact(value: unknown, keys: string[]): Node {
  const input = record(value)
  if (Object.keys(input).length !== keys.length || keys.some((key) => !id(input[key]))) throw new Error('资料参数无效。')
  return input
}
function publicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''
    return url.href.slice(0, 2048)
  } catch { return undefined }
}
// Only user-visible native fields enter evidence. Prompts, refresh errors,
// arbitrary object keys and web container URLs are never treated as page text.
function containerText(value: unknown): { text: string; truncated: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { text: '', truncated: false }
  let truncated = false
  const boundedText = (value: unknown, limit = 120_000): string => {
    if (typeof value === 'string' && value.length > limit) truncated = true
    return text(value, limit)
  }
  const boundedItems = <T>(items: T[], limit: number): T[] => {
    if (items.length > limit) truncated = true
    return items.slice(0, limit)
  }
  const scalar = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : boundedText(value, 4000)
  const spec = value as Node
  const heading = boundedText(spec.title, 512)
  let body = ''
  if (spec.type === 'markdown') body = boundedText(spec.content ?? spec.markdown)
  if (spec.type === 'table' && Array.isArray(spec.columns) && Array.isArray(spec.rows) && spec.rows.length) {
    const rows = boundedItems(spec.rows, 500).filter(Array.isArray).map((row) => boundedItems(row, 40).map(scalar))
    if (rows.some((row) => row.some((cell) => cell.trim()))) body = [boundedItems(spec.columns, 40).map(scalar).join(' | '), ...rows.map((row) => row.join(' | '))].join('\n')
  }
  if (spec.type === 'kpi' && Array.isArray(spec.items)) {
    body = boundedItems(spec.items, 100).filter((item) => item && typeof item === 'object' && !Array.isArray(item) && scalar(item.label) && scalar(item.value))
      .map((item) => `${scalar(item.label)}：${scalar(item.value)}${item.change === undefined ? '' : `（${scalar(item.change)}）`}`).join('\n')
  }
  if (spec.type === 'chart' && Array.isArray(spec.series)) {
    const labels = Array.isArray(spec.labels) ? boundedItems(spec.labels, 500).map(scalar) : []
    body = boundedItems(spec.series, 30).filter((series) => series && typeof series === 'object' && Array.isArray(series.values) && series.values.length > 0 && series.values.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))
      .map((series) => `${scalar(series.name)}\n${boundedItems(series.values, 500).map((value: unknown, index: number) => `${labels[index] ?? index}：${scalar(value)}`).join('\n')}`).join('\n')
  }
  const content = body.trim() ? boundedText(`${heading}\n${body}`) : ''
  return { text: content, truncated }
}

export function readStoredResearchCanvas(storage: ResearchCanvasStorage, sessionId: string): Canvas {
  const read = (kind: string): unknown[] => {
    const value = storage.getItem(`sherlock.research.canvas.${kind}.v1:${sessionId}`)
    if (!value) return []
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return { files: read('files'), artifacts: read('artifacts') }
}

export class ResearchContextBridge {
  private server?: Server
  private stopped = false
  private readonly captures = new Map<string, Capture>()
  private readonly now: () => number
  private readonly maxCaptures: number
  private readonly maxStoredBytes: number
  private readonly token = randomBytes(32).toString('hex')
  private endpoint?: { url: string; token: string }

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now
    this.maxCaptures = options.maxCaptures ?? 20
    this.maxStoredBytes = options.maxStoredBytes ?? 32 * 1024 * 1024
    if (![this.maxCaptures, this.maxStoredBytes].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('资料服务配置无效。')
  }

  async start(): Promise<{ url: string; token: string }> {
    if (this.endpoint) return this.endpoint
    if (this.stopped) throw new Error('资料服务已停止。')
    const server = createServer(async (req, res) => {
      const send = (status: number, body: unknown) => {
        const serialized = JSON.stringify(body)
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(serialized) })
        res.end(serialized)
      }
      if (!this.authorized(req)) return send(403, { error: '资料请求被拒绝。' })
      if (req.url !== '/snapshot' || req.method !== 'POST') return send(404, { error: '资料请求无效。' })
      try {
        const chunks: Buffer[] = []
        let size = 0
        if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new Error()
        for await (const part of req) {
          const chunk = Buffer.from(part); size += chunk.length
          if (size > MAX_BODY_BYTES) throw new Error()
          chunks.push(chunk)
        }
        const input = exact(JSON.parse(Buffer.concat(chunks).toString('utf8')), ['sessionId', 'captureId'])
        this.purge()
        const capture = this.captures.get(input.captureId as string)
        if (!capture || capture.sessionId !== input.sessionId || this.stopped) return send(404, { error: '资料捕获已失效。' })
        send(200, { sources: capture.sources })
      } catch { send(400, { error: '资料请求无效。' }) }
    })
    server.requestTimeout = 10_000
    server.headersTimeout = 10_000
    this.server = server
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
    const address = server.address()
    if (!address || typeof address === 'string' || this.stopped) { await this.stop(); throw new Error('资料服务不可用。') }
    this.endpoint = { url: `http://127.0.0.1:${address.port}`, token: this.token }
    return this.endpoint
  }

  async capture(value: unknown): Promise<{ captureId: string; totalSources: number }> {
    try { return await this.captureStored(value) } catch { throw new Error('无法捕获研究资料，请重试。') }
  }

  private async captureStored(value: unknown): Promise<{ captureId: string; totalSources: number }> {
    const { sessionId } = exact(value, ['sessionId']) as { sessionId: string }
    if (this.stopped) throw new Error('资料服务已停止。')
    const createdAt = this.now()
    const raw = await this.options.readCanvas(sessionId)
    // Freeze the entire stored canvas before the first asynchronous file check.
    const canvas: Canvas = JSON.parse(JSON.stringify(raw))
    if (!Array.isArray(canvas.files) || !Array.isArray(canvas.artifacts) || canvas.files.length + canvas.artifacts.length > 1000) throw new Error('画板资料过多。')
    const sources: Source[] = []
    const seen = new Set<string>()
    for (const rawNode of [...canvas.files, ...canvas.artifacts]) {
      if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue
      const node = rawNode as Node
      if (!id(node.id) || seen.has(node.id)) continue
      seen.add(node.id)
      const isFile = canvas.files.includes(rawNode)
      const source: Source = { id: node.id, title: text(isFile ? node.displayName ?? node.name : node.title, 512) || '未命名资料', kind: isFile ? 'file' : text(node.kind, 128) || 'artifact', text: '', status: 'unavailable' }
      if (isFile && id(node.authorizationId)) {
        try {
          const authorized = await this.options.resolveFile({ sessionId, nodeId: node.id, authorizationId: node.authorizationId })
          if (authorized) {
            const file = await stat(authorized.path)
            if (file.isFile() && file.size <= 64 * 1024 * 1024) {
              if (SUPPORTED_EXTENSIONS.has(extname(authorized.path).toLowerCase())) Object.assign(source, { path: authorized.path, revision: { size: file.size, mtimeMs: file.mtimeMs }, status: 'ready', truncated: true })
              else source.status = 'unsupported'
            }
          }
        } catch { /* Authorization or stat failure yields metadata only. */ }
      } else if (!isFile) {
        if (['assistant-result', 'assistant-excerpt'].includes(source.kind)) source.text = text(node.excerpt)
        if (source.kind === 'web-link') { source.text = text(node.sourceText); source.sourceUrl = publicUrl(node.url) }
        if (['generated-summary', 'generated-mind-map'].includes(source.kind)) {
          source.status = text(node.generationStatus, 128) || 'unavailable'
          if (['completed', 'settled'].includes(source.status)) source.text = text(node.excerpt)
        }
        if (source.kind === 'generated-container') {
          source.status = text(node.generationStatus, 128) || 'unavailable'
          const container = containerText(node.containerSpec)
          source.text = container.text
          if (container.truncated) source.truncated = true
          if (source.text && (node.refreshError || source.status !== 'completed')) {
            source.text = `[保留上次成功内容；刷新失败或尚未完成；上次成功时间：${typeof node.lastSuccessfulAt === 'number' && Number.isFinite(node.lastSuccessfulAt) ? node.lastSuccessfulAt : '未知'}]\n${source.text}`
          }
        }
        if (source.text) source.status = 'ready'
        if (Array.isArray(node.sourceNodeIds)) source.sourceNodeIds = node.sourceNodeIds.filter(id).slice(0, 256)
        if (typeof node.excerpt === 'string' && node.excerpt.length > 120_000 || typeof node.sourceText === 'string' && node.sourceText.length > 120_000) source.truncated = true
      }
      sources.push(source)
    }
    if (this.stopped || this.now() - createdAt > CAPTURE_TTL_MS) throw new Error('资料捕获已失效。')
    this.purge()
    const bytes = Buffer.byteLength(JSON.stringify(sources))
    if (bytes > this.maxStoredBytes) throw new Error('画板资料超过存储上限。')
    while (this.captures.size >= this.maxCaptures || [...this.captures.values()].reduce((sum, item) => sum + item.bytes, 0) + bytes > this.maxStoredBytes) this.captures.delete(this.captures.keys().next().value!)
    const captureId = randomUUID()
    this.captures.set(captureId, { sessionId, createdAt, sources, bytes })
    return { captureId, totalSources: sources.length }
  }

  private authorized(req: IncomingMessage): boolean {
    if (this.stopped || req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin !== undefined || req.headers.forwarded !== undefined || req.headers['x-forwarded-for'] !== undefined || req.headers['x-forwarded-host'] !== undefined || req.headers['x-real-ip'] !== undefined) return false
    if (this.endpoint && req.headers.host !== new URL(this.endpoint.url).host) return false
    const actual = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${this.token}`)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  private purge(): void {
    for (const [key, capture] of this.captures) if (this.now() - capture.createdAt > CAPTURE_TTL_MS) this.captures.delete(key)
  }
  async stop(): Promise<void> {
    this.stopped = true
    this.captures.clear()
    const server = this.server
    this.server = undefined
    this.endpoint = undefined
    if (server) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
  }
}

export function registerResearchContextHandlers(options: {
  ipcMain: { removeHandler(channel: string): void; handle(channel: string, handler: (event: TrustedWindowEvent, value: unknown) => unknown): unknown }
  getMainWindow(): TrustedWindow | undefined
  bridge: ResearchContextBridge
}): () => void {
  const channel = 'research:context:capture'
  options.ipcMain.removeHandler(channel)
  registerTrustedMainWindowHandler(options.ipcMain, channel, options.getMainWindow, (_event, value: unknown) => options.bridge.capture(value))
  return () => options.ipcMain.removeHandler(channel)
}
