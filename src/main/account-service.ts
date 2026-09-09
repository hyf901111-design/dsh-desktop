import { safeStorage } from 'electron'
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import {
  collaborationOrigin,
  collaborationRequestSpec,
  type CollaborationEndpoint
} from './collaboration-client'
import { ResearchBoardsError } from '../shared/research-boards'
const ORIGIN = 'https://updates.evanarts.com'
export class AccountService {
  private token?: string
  private server?: Server
  private serial: Promise<unknown> = Promise.resolve()
  private sessionGeneration = 0
  private suspended = false
  private sessionAbort = new AbortController()
  private readonly listeners = new Set<() => void>()
  constructor(
    private directory: string,
    private readonly collaborationOptions: {
      origin?: string
      fetch?: typeof fetch
    } = {}
  ) {
    collaborationOrigin(collaborationOptions.origin)
  }
  get generation() {
    return this.sessionGeneration
  }
  get authenticated() {
    return !!this.token && !this.suspended
  }
  subscribeSessionChanged(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private changed() {
    this.sessionGeneration++
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
        if (response.status === 401 && value.error?.code === 'LOGIN_REQUIRED')
          await this.clear()
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
  async start() {
    try {
      if (safeStorage.isEncryptionAvailable())
        this.token = safeStorage.decryptString(
          await readFile(join(this.directory, 'account-session'))
        )
    } catch {}
    if (this.token) this.changed()
    const secret = randomBytes(32).toString('hex')
    this.server = createServer((req, res) => {
      void (async () => {
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
        const response = await fetch(`${ORIGIN}/v1/fund-research/query`, {
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
        if (!res.headersSent)
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
    const result = this.serial.then(() => this.perform(action, input))
    this.serial = result.catch(() => {})
    return result
  }
  private async clear() {
    this.token = undefined
    this.suspended = false
    this.changed()
    await rm(join(this.directory, 'account-session'), { force: true })
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
    const suspend = action === 'logout' || action === 'password'
    if (suspend) {
      this.suspended = true
      this.changed()
    }
    try {
      const response = await fetch(`${ORIGIN}/v1/account/${action}`, {
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
      if (!response.ok)
        return {
          error: value.error ?? { code: 'ACCOUNT_SERVICE_UNAVAILABLE' }
        }
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
        this.suspended = false
        this.changed()
      }
      const { token: _token, ...publicValue } = value
      return publicValue
    } catch {
      return { error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }
    } finally {
      if (suspend && this.suspended) {
        this.suspended = false
        this.changed()
      }
    }
  }
}
