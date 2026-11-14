import { safeStorage } from 'electron'
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import {
  collaborationOrigin,
  collaborationRequestSpec,
  type CollaborationEndpoint
} from './collaboration-client'
import { ResearchBoardsError } from '../shared/research-boards'
import {IntegrationError} from '../shared/integrations'
import type { BrowserSearchResult } from './search/browser-search-controller'
import { hostedChatBridgeTimeoutMs } from '../../packages/dsh-research-task-runtime/hosted-ai-timeouts.js'

type AccountProfile = { id: string; username: string; createdAt: number }
type AccountIdentity = { id: string; profile?: AccountProfile }
type HostedCatalog = { models: unknown[]; image: boolean; memory?: boolean }
type HostedCatalogResult = HostedCatalog & { status?: 'stale' }
const emptyHostedCatalog: HostedCatalog = { models: [], image: false }
const hostedCatalogTtlMs = 60_000
const hostedCatalogRetryMs = 30_000
const hostedCatalogStaleMs = hostedCatalogTtlMs + 60_000

function readAccountIdentity(value: unknown): AccountIdentity | undefined {
  const { id, username, createdAt } = (value ?? {}) as Partial<AccountProfile>
  if (typeof id !== 'string' || !id || id.length > 256) return undefined
  if (
    typeof username === 'string' && username && username.length <= 128 &&
    typeof createdAt === 'number' && Number.isSafeInteger(createdAt) && createdAt >= 0
  )
    return { id, profile: { id, username, createdAt } }
  return { id }
}

export class AccountService {
  private readonly origin: string
  private token?: string
  private identity?: AccountIdentity
  private server?: Server
  private serial: Promise<unknown> = Promise.resolve()
  private sessionRevalidation?: { generation: number; result: Promise<void> }
  private sessionGeneration = 0
  private suspended = false
  private sessionAbort = new AbortController()
  private hostedCatalog?: {
    expires: number
    confirmed?: { value: HostedCatalog; at: number }
    result?: HostedCatalogResult
    pending?: Promise<HostedCatalogResult | undefined>
  }
  private readonly listeners = new Set<() => void>()
  constructor(
    private directory: string,
    private readonly collaborationOptions: {
      origin?: string
      fetch?: typeof fetch
      onHostedQuotaChanged?: () => void
    } = {}
  ) {
    this.origin = collaborationOrigin(collaborationOptions.origin)
  }
  get generation() {
    return this.sessionGeneration
  }
  get authenticated() {
    return !!this.token && !this.suspended
  }
  get accountId(): string | undefined {
    return this.authenticated ? this.identity?.id : undefined
  }
  private async rememberIdentity(user: unknown): Promise<boolean> {
    const identity = readAccountIdentity(user)
    if (!identity || !this.token) return false
    const changed = this.identity?.id !== identity.id
    this.identity = identity
    const data = JSON.stringify({
      ...(identity.profile ?? { id: identity.id }),
      fingerprint: createHash('sha256').update(this.token).digest('hex')
    })
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const file = join(this.directory, 'account-identity')
      await writeFile(`${file}.tmp`, data, { mode: 0o600 })
      await rename(`${file}.tmp`, file)
    } catch {
      // The current online identity remains valid if the cache write fails.
    }
    return changed
  }
  subscribeSessionChanged(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  async datayesMcpRequest(body:string,signal:AbortSignal):Promise<Response> {
    if(!this.authenticated)throw new IntegrationError('AUTH_REQUIRED','请先登录 EWork 后使用内置通联 MCP')
    const generation=this.generation
    const response=await (this.collaborationOptions.fetch??fetch)(`${this.origin}/v1/datayes/mcp`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${this.token}`},body,signal:AbortSignal.any([this.sessionAbort.signal,signal,AbortSignal.timeout(58000)])})
    if(generation!==this.generation){await response.body?.cancel();throw new IntegrationError('ACCESS_DENIED','账户已变化，已取消通联请求')}
    if(response.status===429||response.status>=500){
      const upstream=response.headers.get('x-ework-datayes-status')
      const stage=response.headers.get('x-ework-datayes-stage')
      const diagnostic=/^(usage|initialize|initialized|tools\/list|tools\/call)$/.test(stage??'')?stage:undefined
      console.warn('[datayes] service unavailable',{status:response.status,stage:diagnostic,upstreamStatus:/^\d{3}$/.test(upstream??'')?Number(upstream):undefined})
      await response.body?.cancel()
      throw new IntegrationError('RUNTIME_UNAVAILABLE',response.status===429?'通联请求较多，请稍后重试':'通联数据服务暂时不可用，请稍后重新测试')
    }
    return response
  }
  async tushareMcpRequest(body:string,signal:AbortSignal):Promise<Response> {
    if(!this.authenticated)throw new IntegrationError('AUTH_REQUIRED','请先登录 EWork 后使用 Tushare 数据源')
    const generation=this.generation
    const response=await (this.collaborationOptions.fetch??fetch)(`${this.origin}/v1/tushare/mcp`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${this.token}`},body,signal:AbortSignal.any([this.sessionAbort.signal,signal,AbortSignal.timeout(30000)])})
    if(generation!==this.generation){await response.body?.cancel();throw new IntegrationError('ACCESS_DENIED','账户已变化，已取消 Tushare 请求')}
    return response
  }
  async dataproMcpRequest(body: string, signal: AbortSignal): Promise<Response> {
    return this.volcengineRequest('/v1/datapro/mcp', body, signal, '火山方舟专业数据集', 50_000)
  }
  async searchHosted(query: string, maxResults: number, signal: AbortSignal): Promise<BrowserSearchResult | undefined> {
    signal.throwIfAborted()
    if (!this.authenticated || Array.from(query.trim()).length > 100) return
    const generation = this.generation
    try {
      const response = await this.hostedRequest('quota', signal)
      if (!response.ok) {
        await response.body?.cancel()
        return
      }
      const { quota } = await response.json()
      if (generation !== this.generation || quota?.paused !== false ||
          ![quota.fiveHour?.remaining, quota.week?.remaining].every(value => Number.isFinite(value) && value > 0)) return
      signal.throwIfAborted()
      const result = await this.doubaoSearch(query, maxResults, signal)
      if (generation === this.generation) return result
    } catch {
      signal.throwIfAborted()
      // Missing quota, invalid sessions and provider errors leave the original search path available.
    }
  }
  async doubaoSearch(query: string, maxResults: number, signal: AbortSignal): Promise<BrowserSearchResult> {
    if (Array.from(query.trim()).length > 100)
      throw new IntegrationError('INVALID_CONFIG', '豆包搜索查询最多 100 个字符，请缩短关键词后重试。')
    const response = await this.volcengineRequest(
      '/v1/doubao/search', JSON.stringify({ query, maxResults }), signal, '豆包搜索', 24_000
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw new IntegrationError(
        response.status === 401 ? 'AUTH_REQUIRED' : 'RUNTIME_UNAVAILABLE',
        response.status === 401 ? 'EWork 登录已失效，请重新登录后使用豆包搜索。' : '豆包搜索暂时不可用，请稍后重试。'
      )
    }
    const result: BrowserSearchResult = await response.json()
    if (result?.provider !== 'doubao' || !Array.isArray(result.sources))
      throw new IntegrationError('RUNTIME_UNAVAILABLE', '豆包搜索返回了无效结果。')
    return result
  }
  private async volcengineRequest(
    path: '/v1/datapro/mcp' | '/v1/doubao/search', body: string, signal: AbortSignal,
    name: string, timeout: number
  ): Promise<Response> {
    if (!this.authenticated) throw new IntegrationError('AUTH_REQUIRED', `请先登录 EWork 后使用${name}。`)
    const generation = this.generation
    const combined = AbortSignal.any([this.sessionAbort.signal, signal, AbortSignal.timeout(timeout)])
    const response = await (this.collaborationOptions.fetch ?? fetch)(this.origin + path, {
      method: 'POST', redirect: 'error', body, signal: combined,
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${this.token}` }
    })
    if (generation !== this.generation) {
      await response.body?.cancel()
      throw new IntegrationError('ACCESS_DENIED', 'EWork 账号已切换，本次请求已取消。')
    }
    return response
  }
  private changed() {
    this.sessionGeneration++
    this.hostedCatalog = undefined
    this.sessionAbort.abort()
    this.sessionAbort = new AbortController()
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {}
    }
  }
  async collaborationRequest(
    endpoint: CollaborationEndpoint,
    signal?: AbortSignal
  ): Promise<unknown> {
    const spec = collaborationRequestSpec(endpoint)
    if (!this.authenticated)
      throw new ResearchBoardsError(
        'LOGIN_REQUIRED',
        '请先登录账户。',
        false,
        undefined,
        401
      )
    const generation = this.generation
    const current = () => {
      if (generation !== this.generation)
        throw new ResearchBoardsError('SESSION_CHANGED')
    }
    try {
      const response = await (this.collaborationOptions.fetch ?? fetch)(
        `${collaborationOrigin(this.collaborationOptions.origin)}${spec.path}`,
        {
          method: spec.method,
          redirect: 'error',
          headers: { ...spec.headers, authorization: `Bearer ${this.token}` },
          ...(spec.body === undefined
            ? {}
            : { body: spec.body, duplex: 'half' }),
          signal: AbortSignal.any([
            this.sessionAbort.signal,
            AbortSignal.timeout(
              ['asset.stage', 'asset.add', 'asset.get'].includes(endpoint.kind)
                ? 120_000
                : 25_000
            ),
            ...(signal ? [signal] : [])
          ])
        } as RequestInit
      )
      current()
      if (spec.raw && response.ok) return response
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      if (reader) {
        for (;;) {
          const part = await reader.read()
          current()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > 6 * 1024 * 1024) {
            await reader.cancel()
            throw new ResearchBoardsError('RESPONSE_TOO_LARGE')
          }
          chunks.push(part.value)
        }
      }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        error?: {
          code: string
          message?: string
          retryable?: boolean
          details?: unknown
        }
      }
      current()
      if (!response.ok) {
        if (response.status === 401 && value.error?.code === 'LOGIN_REQUIRED') {
          // A collaboration worker failure can look like an expired account session.
          // Only the account endpoint can revoke the local session after revalidation.
          await this.revalidateSession(generation)
          current()
          throw new ResearchBoardsError(
            'COLLABORATION_UNAVAILABLE', '协作服务暂时不可用，请稍后重试。', true, undefined, 503
          )
        }
        throw new ResearchBoardsError(
          value.error?.code ?? 'COLLABORATION_UNAVAILABLE',
          value.error?.message,
          value.error?.retryable ?? response.status >= 500,
          value.error?.details,
          response.status
        )
      }
      return value
    } catch (error) {
      if (generation !== this.generation)
        throw new ResearchBoardsError('SESSION_CHANGED')
      if (error instanceof ResearchBoardsError) throw error
      throw new ResearchBoardsError(
        'NETWORK_ERROR',
        '网络暂时不可用，本人的修改已保留。',
        true
      )
    }
  }
  private async hostedRequest(path: string, signal: AbortSignal, body?: Buffer, requestId?: string): Promise<Response> {
    if (!this.authenticated) return Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 })
    const timeout = body === undefined ? 8000 : path === 'chat/completions' ? hostedChatBridgeTimeoutMs : 310000
    const response = await (this.collaborationOptions.fetch ?? fetch)(this.origin + '/v1/hosted-ai/' + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', body: body as Uint8Array<ArrayBuffer> | undefined,
      headers: {
        authorization: 'Bearer ' + this.token, 'content-type': 'application/json',
        ...(requestId ? { 'x-ework-request-id': requestId } : {})
      },
      signal: AbortSignal.any([signal, this.sessionAbort.signal, AbortSignal.timeout(timeout)])
    })
    return response
  }
  private async readHostedCatalog(): Promise<HostedCatalogResult | undefined> {
    if (!this.authenticated || !this.accountId) return emptyHostedCatalog
    const generation = this.generation
    const cache = this.hostedCatalog ??= { expires: 0 }
    if (!cache.pending && Date.now() >= cache.expires) {
      cache.pending = this.refreshHostedCatalog(cache, generation).finally(() => { cache.pending = undefined })
    }
    return cache.pending ?? cache.result
  }
  private async refreshHostedCatalog(cache: NonNullable<AccountService['hostedCatalog']>, generation: number): Promise<HostedCatalogResult | undefined> {
    let value: HostedCatalog | undefined
    try {
      const response = await this.hostedRequest('catalog', this.sessionAbort.signal)
      if (response.ok) {
        const result = await response.json()
        if (Array.isArray(result?.models) && typeof result.image === 'boolean') {
          value = { models: result.models, image: result.image, ...(result.memory === true ? { memory: true } : {}) }
        }
      } else {
        await response.body?.cancel()
        if (response.status === 401 || response.status === 403) {
          // Revoke this catalog immediately, and let the account endpoint confirm sign-out.
          cache.confirmed = undefined
          if (response.status === 401) await this.revalidateSession(generation)
          else value = emptyHostedCatalog
        }
      }
    } catch {}
    if (generation !== this.generation) return undefined
    const now = Date.now()
    if (value) {
      cache.confirmed = { value, at: now }
      cache.expires = now + hostedCatalogTtlMs
      return cache.result = value
    }
    const last = cache.confirmed
    const staleUntil = last ? last.at + hostedCatalogStaleMs : 0
    if (last && now < staleUntil) {
      cache.expires = Math.min(now + hostedCatalogRetryMs, staleUntil)
      return cache.result = { ...last.value, status: 'stale' }
    }
    cache.expires = now + hostedCatalogRetryMs
    return cache.result = undefined
  }
  async openVikingMemory(owner: string, query: string, remember: boolean): Promise<string[]> {
    if (!this.authenticated || this.accountId !== owner) return []
    const generation = this.generation
    try {
      const catalog = await this.readHostedCatalog()
      if (!catalog?.memory || catalog.status === 'stale' || generation !== this.generation) return []
      const response = await this.hostedRequest('memory', AbortSignal.timeout(4000), Buffer.from(JSON.stringify({query,remember})))
      if (!response.ok) { await response.body?.cancel(); return [] }
      const result = await response.json()
      return generation === this.generation && Array.isArray(result?.memories) ?
        result.memories.filter((value: unknown) => typeof value === 'string').slice(0,4) : []
    } catch { return [] }
  }
  private async hostedBridge(req: IncomingMessage, res: ServerResponse, secret: string): Promise<void> {
    const path = req.url?.slice('/hosted-ai/'.length)
    const generation = this.generation
    const equal = (value: string) => {
      const supplied = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + value)
      return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    }
    if (path === 'catalog' && req.method === 'GET' && equal(secret)) {
      if (!this.authenticated || !this.accountId) { res.setHeader('content-type','application/json'); res.end(JSON.stringify(emptyHostedCatalog)); return }
      const result = await this.readHostedCatalog()
      res.setHeader('content-type','application/json')
      res.setHeader('cache-control','no-store')
      if (generation !== this.generation) {
        // Tell the runtime which login superseded this request without returning its catalog.
        res.writeHead(409).end(JSON.stringify({ generation: this.generation, status: 'session-changed' }))
      } else if (result) res.end(JSON.stringify({ ...result, generation }))
      else res.writeHead(503).end(JSON.stringify({ generation, status: 'unavailable' }))
      return
    }
    if (!['chat/completions', 'images'].includes(path ?? '') || req.method !== 'POST' || !equal(secret + '.' + generation) || !this.authenticated) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'LOGIN_REQUIRED', message: '请登录后重新选择云端模型。' } }))
      return
    }
    const signal = new AbortController()
    res.once('close', () => signal.abort())
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of req) {
      if ((bytes += chunk.length) > 12_000_000) {
        const message = path === 'images' ? '参考图过大，请压缩后重试。' : '本次消息和图片过大，请压缩图片或缩短消息后重试。'
        res.writeHead(413, { 'content-type': 'application/json' }).end(JSON.stringify({
          error: { code: 'HOSTED_AI_PAYLOAD_TOO_LARGE', message }
        }))
        return
      }
      chunks.push(chunk)
    }
    if (generation !== this.generation || signal.signal.aborted) { res.writeHead(401).end(); return }
    try {
      const suppliedId = req.headers['x-ework-request-id']
      const idPattern = path === 'images' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
      const requestId = typeof suppliedId === 'string' && idPattern.test(suppliedId) ? suppliedId : undefined
      const response = await this.hostedRequest(path!, signal.signal, Buffer.concat(chunks), requestId)
      if (generation !== this.generation || signal.signal.aborted) { await response.body?.cancel(); res.writeHead(401).end(); return }
      const responseId = response.headers.get('x-ework-request-id')
      res.writeHead(response.status, {
        'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store',
        ...(responseId && /^[-a-zA-Z0-9_]{1,128}$/.test(responseId) ? { 'x-ework-request-id': responseId } : {})
      })
      if (response.body) await pipeline(Readable.from(response.body as unknown as AsyncIterable<Uint8Array>), res)
      else res.end()
    } catch {
      if (res.destroyed) return
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({
        error: { code: 'HOSTED_AI_UNAVAILABLE', message: '暂时无法连接云端模型服务，请稍后重试。' }
      }))
    } finally {
      if (generation === this.generation && this.authenticated) this.collaborationOptions.onHostedQuotaChanged?.()
    }
  }
  private async hostedQuota(): Promise<unknown> {
    if (!this.authenticated) return { user: null }
    const generation = this.generation
    try {
      const response = await this.hostedRequest('quota', this.sessionAbort.signal)
      const result = await response.json()
      if (generation !== this.generation) return { user: null }
      if (response.status === 401 && result?.error?.code === 'LOGIN_REQUIRED') {
        // Only the authority for the account can invalidate the local login.
        await this.revalidateSession(generation)
        if (this.authenticated) return { error: { code: 'HOSTED_AI_UNAVAILABLE' } }
      }
      return result
    } catch { return { error: { code: 'HOSTED_AI_UNAVAILABLE' } } }
  }
  private async hostedCatalogStatus(): Promise<{ catalogStatus: 'ready' | 'stale' | 'unavailable' | 'inactive' }> {
    const generation = this.generation
    if (!this.authenticated || !this.accountId) return { catalogStatus: 'inactive' }
    const result = await this.readHostedCatalog()
    if (generation !== this.generation) return { catalogStatus: 'inactive' }
    return { catalogStatus: !result ? 'unavailable' : result.status ?? (result.models.length ? 'ready' : 'inactive') }
  }
  async start() {
    try {
      if (safeStorage.isEncryptionAvailable())
        this.token = safeStorage.decryptString(
          await readFile(join(this.directory, 'account-session'))
        )
    } catch {}
    if (this.token) {
      try {
        const identity = JSON.parse(await readFile(join(this.directory, 'account-identity'), 'utf8'))
        if (identity.fingerprint === createHash('sha256').update(this.token).digest('hex'))
          this.identity = readAccountIdentity(identity)
      } catch {}
      this.changed()
    }
    const secret = randomBytes(32).toString('hex')
    this.server = createServer((req, res) => {
      void (async () => {
        if (req.url?.startsWith('/hosted-ai/')) {
          const port = (this.server?.address() as AddressInfo | null)?.port
          if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== '127.0.0.1:' + port ||
              req.headers.origin !== undefined || req.headers['sec-fetch-site'] === 'cross-site' ||
              ['forwarded','x-forwarded-for','x-forwarded-host','x-real-ip'].some(header=>req.headers[header]!==undefined)) {
            res.writeHead(403).end(); return
          }
          await this.hostedBridge(req, res, secret)
          return
        }
        const supplied = Buffer.from(req.headers.authorization ?? '')
        const expected = Buffer.from(`Bearer ${secret}`)
        if (
          req.headers.origin ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected) ||
          req.url !== '/fund-research' ||
          req.method !== 'POST'
        ) {
          res.writeHead(403).end()
          return
        }
        if (!this.token) {
          res
            .writeHead(401, { 'content-type': 'application/json' })
            .end(JSON.stringify({ error: { code: 'LOGIN_REQUIRED' } }))
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          size += chunk.length
          if (size > 16 * 1024) {
            res.writeHead(413).end()
            return
          }
          chunks.push(chunk)
        }
        const response = await fetch(`${this.origin}/v1/fund-research/query`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.token}`
          },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(75000)
        })
        const data = await response.text()
        if (data.length > 128 * 1024) throw Error('Large response')
        res
          .writeHead(response.status, {
            'content-type': 'application/json',
            'cache-control': 'no-store'
          })
          .end(data)
      })().catch(() => {
        if (res.destroyed) return
        if (res.headersSent) { res.destroy(); return }
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'FUND_SERVICE_UNAVAILABLE' } }))
      })
    })
    this.server.requestTimeout = 10000
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve)
    )
    return {
      url: `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/fund-research`,
      token: secret
    }
  }
  stop() {
    this.sessionAbort.abort()
    this.server?.close()
    this.server?.closeAllConnections()
  }
  invoke(action: string, input: unknown) {
    if (action === 'ai-quota') return this.hostedQuota()
    if (action === 'ai-catalog-status') return this.hostedCatalogStatus()
    return this.serialize(() => this.perform(action, input))
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation)
    this.serial = result.catch(() => {})
    return result
  }
  private revalidateSession(generation: number): Promise<void> {
    if (this.sessionRevalidation?.generation === generation)
      return this.sessionRevalidation.result
    const result = this.serialize(async () => {
      if (generation === this.generation) await this.perform('me', undefined)
    }).finally(() => {
      if (this.sessionRevalidation?.result === result) this.sessionRevalidation = undefined
    })
    this.sessionRevalidation = { generation, result }
    return result
  }
  private async clear() {
    this.token = undefined
    this.identity = undefined
    this.suspended = false
    this.changed()
    await rm(join(this.directory, 'account-session'), { force: true })
    await rm(join(this.directory, 'account-identity'), { force: true })
  }
  private async perform(action: string, input: unknown): Promise<unknown> {
    if (
      !['me', 'login', 'register', 'password', 'logout', 'usage'].includes(
        action
      )
    )
      return { error: { code: 'INVALID_REQUEST' } }
    if (!this.token && ['me', 'usage'].includes(action)) return { user: null }
    if (!this.token && action === 'logout') return { ok: true }
    const accountFailure = (error = { code: 'ACCOUNT_SERVICE_UNAVAILABLE' }) => {
      const user = action === 'me' ? this.identity?.profile : undefined
      return user ? { user, error } : { error }
    }
    const suspend = action === 'logout' || action === 'password'
    if (suspend) {
      this.suspended = true
      this.changed()
    }
    try {
      const response = await (this.collaborationOptions.fetch ?? fetch)(`${this.origin}/v1/account/${action}`, {
        method: ['me', 'usage'].includes(action) ? 'GET' : 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        ...(['me', 'usage'].includes(action)
          ? {}
          : { body: JSON.stringify(input ?? {}) }),
        signal: AbortSignal.timeout(20000)
      })
      const value = (await response.json()) as {
        token?: string
        user?: unknown
        error?: { code: string }
      }
      if (response.status === 401 && value.error?.code === 'LOGIN_REQUIRED') {
        await this.clear()
        if (action === 'logout') return { ok: true }
      }
      if (!response.ok) return accountFailure(value.error)
      if (action === 'me' && !readAccountIdentity(value.user)?.profile) return accountFailure()
      if (action === 'logout' || action === 'password') await this.clear()
      if (value.token) {
        if (!/^[a-f0-9]{64}$/.test(value.token)) throw Error('Invalid session')
        if (!safeStorage.isEncryptionAvailable())
          return { error: { code: 'SECURE_STORAGE_UNAVAILABLE' } }
        await mkdir(this.directory, { recursive: true, mode: 0o700 })
        const file = join(this.directory, 'account-session')
        await writeFile(`${file}.tmp`, safeStorage.encryptString(value.token), {
          mode: 0o600
        })
        await rename(`${file}.tmp`, file)
        this.token = value.token
        this.identity = undefined
        this.suspended = false
        await this.rememberIdentity(value.user)
        this.changed()
      }
      else if(value.user&&await this.rememberIdentity(value.user))this.changed()
      const { token: _token, ...publicValue } = value
      return publicValue
    } catch {
      return accountFailure()
    } finally {
      if (suspend && this.suspended) {
        this.suspended = false
        this.changed()
      }
    }
  }
}
