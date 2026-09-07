import { safeStorage } from 'electron'
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
const ORIGIN = 'https://updates.evanarts.com'
export class AccountService {
  private token?: string
  private server?: Server
  private serial: Promise<unknown> = Promise.resolve()
  constructor(private directory: string) {}
  async start() {
    try {
      if (safeStorage.isEncryptionAvailable())
        this.token = safeStorage.decryptString(
          await readFile(join(this.directory, 'account-session'))
        )
    } catch {}
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
          if (size > 2048) {
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
        return { error: value.error ?? { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }
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
      }
      const { token: _token, ...publicValue } = value
      return publicValue
    } catch {
      return { error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }
    }
  }
}
