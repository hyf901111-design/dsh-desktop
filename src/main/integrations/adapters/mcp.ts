import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, join, delimiter } from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { IntegrationError, type AdapterResult, type Connection, type IntegrationErrorCode, type McpConfig } from '../../../shared/integrations'
import { networkFetch, validateNetworkTarget } from './network-policy'
import {isBundledDatayesId,DATAYES_GATEWAY} from '../bundled-datayes'
import { isBundledDataproId, DATAPRO_GATEWAY } from '../bundled-datapro'
import {isBundledTushareId,normalizeBundledTushareQuery,TUSHARE_GATEWAY} from '../bundled-tushare'

const MAX_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT = 30_000
const TOOL_CALL_TIMEOUT = 55_000
const DATAYES_QUOTA_NOTICE = '当前通联接口返回 HTTP 402 拒绝请求，仅此接口暂停 60 秒后可重试。这不代表其他数据包或整个账号的额度已用完，不能仅凭状态码判断账号余额。请继续使用其他已确认可用的通联接口，保留已取得的数据；必要时使用其他来源并明确标注，不要重复调用同一失败接口。'
const executeFile = promisify(execFile)
const SAFE_ENV = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LOGNAME', 'SHELL', 'TERM', 'USER', 'USERNAME', 'PROCESSOR_ARCHITECTURE', 'SYSTEMDRIVE', 'PROGRAMFILES']
const FORBIDDEN_ENV = /^(?:NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|EWORK_.*BRIDGE.*|SHERLOCK_.*BRIDGE.*)$/iu

export interface McpDiscoveredTool { name: string; description: string; inputSchema: Record<string, unknown> }
export interface McpConnectionResult { tools: McpDiscoveredTool[]; negotiatedVersion?: string }
interface Entry {
  id: string
  fingerprint: string
  config: McpConfig
  controller: AbortController
  client?: Client
  transport?: Transport
  ready: Promise<McpConnectionResult>
  settled: boolean
  closed: boolean
  closing: boolean
  secrets: string[]
  tools: McpDiscoveredTool[]
  negotiatedVersion?: string
  fatal?: IntegrationError
  activeCalls: number
  callQueue: Array<{start(): void; cancel(): void}>
  closePromise?: Promise<void>
}

function cancelled(): IntegrationError { return new IntegrationError('CANCELLED', 'MCP 操作已取消') }
function failure(code: IntegrationErrorCode, message: string): AdapterResult { return { isError: true, errorCode: code, content: [{ type: 'text', text: message }] } }
function aborted(signal: AbortSignal): void { if (signal.aborted) throw cancelled() }
function mappedError(error: unknown, signal: AbortSignal, duringCall = false): IntegrationError {
  if (signal.aborted) return cancelled()
  if (error instanceof IntegrationError) return error
  const message = error instanceof Error ? error.message : ''
  const code = (error as { code?: unknown } | undefined)?.code
  if (code === 401 || code === 403 || /UnauthorizedError|unauthorized|authorization required/iu.test(message)) return new IntegrationError('AUTH_REQUIRED', 'MCP 授权已失效，请重新连接')
  if (/ReadBuffer exceeded|maximum.*size|response.*large/iu.test(message)) return new IntegrationError('RESPONSE_TOO_LARGE', 'MCP 响应超过 8 MiB')
  if (code === 'ENOENT' || code === 'EACCES' || /protocol version is not supported|invalid initialize result/iu.test(message)) return new IntegrationError('INVALID_CONFIG', 'MCP 启动命令、权限或协议版本无效')
  if (duringCall) return new IntegrationError('RESULT_UNKNOWN', 'MCP 调用未收到完整结果；未自动重试，请核对服务结果')
  return new IntegrationError('RUNTIME_UNAVAILABLE', '无法连接 MCP 服务，请检查地址或启动命令')
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  aborted(signal)
  await new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', onAbort); resolve() }
    const timer = setTimeout(done, ms)
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(cancelled()) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  aborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(cancelled()) }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', onAbort); resolve(value) }, error => { signal.removeEventListener('abort', onAbort); reject(error) })
  })
}

async function executable(command: string, env: Record<string, string>): Promise<string> {
  if (!command || /[\0\r\n]/u.test(command)) throw new IntegrationError('INVALID_CONFIG', '请填写单独的 MCP 可执行程序，参数另行填写')
  const candidates = isAbsolute(command) ? [command] : command.includes('/') || command.includes('\\') ? [] : (env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command))
  for (const candidate of candidates) {
    try {
      if (!(await stat(candidate)).isFile()) continue
      await access(candidate, constants.X_OK)
      return candidate
    } catch { /* Check the next explicitly inherited PATH directory. */ }
  }
  throw new IntegrationError('INVALID_CONFIG', '找不到 MCP 可执行程序，或没有执行权限')
}

/** SDK uses shell:false. This additionally cleans up children observable before closing the parent. */
async function terminateDescendants(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try { await executeFile('taskkill', ['/pid', String(pid), '/t', '/f'], { timeout: 2000, windowsHide: true }) } catch { /* Already exited. */ }
    return
  }
  try {
    const { stdout } = await executeFile('/bin/ps', ['-axo', 'pid=,ppid='], { timeout: 2000, maxBuffer: 1024 * 1024 })
    const processes = stdout.trim().split('\n').map(line => line.trim().split(/\s+/u).map(Number)).filter(pair => pair.length === 2)
    const descendants: number[] = []
    const pending = [pid]
    const visited = new Set<number>([pid])
    while (pending.length) {
      const parent = pending.shift()
      for (const [child, parentId] of processes) if (parentId === parent && child && !visited.has(child)) {
        visited.add(child); descendants.push(child); pending.push(child)
      }
    }
    for (const child of descendants.reverse()) { try { process.kill(child, 'SIGTERM') } catch { /* Already exited. */ } }
    for (const child of descendants) { try { process.kill(child, 'SIGKILL') } catch { /* Already exited. */ } }
  } catch { /* SDK still closes and escalates signals for the directly owned child. */ }
}

export class McpSupervisor {
  private readonly entries = new Map<string, Entry>()
  private readonly datayesQuotaUntil = new Map<string, number>()
  constructor(private readonly vault: { read(ref: string): Promise<string> },private readonly datayesRequest?:(body:string,signal:AbortSignal)=>Promise<Response>,private readonly tushareRequest?:(body:string,signal:AbortSignal)=>Promise<Response>, private readonly dataproRequest?:(body:string,signal:AbortSignal)=>Promise<Response>) {}

  async connect(connection: Connection, signal: AbortSignal): Promise<McpConnectionResult> {
    return this.connectSession(connection, signal, true)
  }

  private async connectSession(connection: Connection, signal: AbortSignal, recoverSession: boolean): Promise<McpConnectionResult> {
    aborted(signal)
    if (connection.config.type !== 'mcp') throw new IntegrationError('INVALID_CONFIG', '连接不是 MCP 类型')
    const config = structuredClone(connection.config)
    const fingerprint = createHash('sha256').update(JSON.stringify([connection.configDigest, config])).digest('hex')
    const previous = this.entries.get(connection.id)
    if (previous && previous.fingerprint === fingerprint && !previous.closed && !previous.closing) {
      if (!previous.settled) return structuredClone(await withSignal(previous.ready, signal))
      // Reuse the transport, but refresh tool discovery so changed schemas reach the owning service.
      try {
        return structuredClone(await this.discover(previous, signal))
      } catch (error) {
        // A server may expire its Streamable HTTP session while the desktop
        // stays open. Discovery has no business side effects and runs before
        // invoke(); rebuild this rejected session without replaying tool calls.
        if (config.transport === 'http' && (error as {code?:unknown})?.code === 404 && !signal.aborted) {
          if (this.entries.get(connection.id) === previous) previous.closed = true
          // The first caller installs the replacement synchronously. Other
          // cards join that entry's ready promise instead of reconnecting again.
          if (recoverSession) return this.connectSession(connection, signal, false)
        }
        throw mappedError(error, signal)
      }
    }
    const entry: Entry = { id: connection.id, config, fingerprint, controller: new AbortController(), ready: Promise.resolve({ tools: [] }), settled: false, closed: false, closing: false, secrets: [], tools: [], activeCalls: 0, callQueue: [] }
    this.entries.set(connection.id, entry)
    const onAbort = () => entry.controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    entry.ready = (async () => {
      try {
        if (previous) await this.closeEntry(previous)
        const result = await this.establish(entry)
        entry.settled = true
        return result
      } catch (error) {
        await this.closeEntry(entry)
        if (this.entries.get(connection.id) === entry) this.entries.delete(connection.id)
        throw mappedError(error, signal)
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    })()
    return structuredClone(await entry.ready)
  }

  async invoke(connectionId: string, rawToolName: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AdapterResult> {
    const entry = this.entries.get(connectionId)
    if (!entry?.settled || entry.closed || entry.closing || !entry.client) return failure('RUNTIME_UNAVAILABLE', 'MCP 尚未连接，请先测试连接')
    if (!entry.tools.some(tool => tool.name === rawToolName)) return failure('NOT_FOUND', '该工具不在 MCP 已发现的工具列表中')
    if (signal.aborted) return failure('CANCELLED', 'MCP 操作已取消')
    // Business quota errors are independent of successful MCP discovery. Share
    // this short cooldown across parent/subtask calls to the same built-in API.
    // Other APIs and personal connections remain independently usable.
    const quotaKey = isBundledDatayesId(connectionId)
      ? JSON.stringify([connectionId, rawToolName, typeof args.nameEn === 'string' ? args.nameEn : rawToolName === 'call_api' ? args.url : null])
      : undefined
    for (const [key, until] of this.datayesQuotaUntil) if (until <= Date.now()) this.datayesQuotaUntil.delete(key)
    const quotaBlocked = () => quotaKey && (this.datayesQuotaUntil.get(quotaKey) ?? 0) > Date.now()
    if (quotaBlocked()) return failure('RUNTIME_UNAVAILABLE', DATAYES_QUOTA_NOTICE)
    const combined = AbortSignal.any([signal, entry.controller.signal])
    let acquired = false
    try {
      if (Buffer.byteLength(JSON.stringify(args), 'utf8') > MAX_BYTES) throw new IntegrationError('INVALID_CONFIG', 'MCP 请求参数过大')
      await this.acquireCall(entry, combined)
      acquired = true
      aborted(combined)
      if (entry.closed || entry.closing || !entry.client) throw new IntegrationError('RUNTIME_UNAVAILABLE', 'MCP 连接已断开')
      if (quotaBlocked()) return failure('RUNTIME_UNAVAILABLE', DATAYES_QUOTA_NOTICE)
      const wireArgs=isBundledTushareId(connectionId)&&rawToolName==='tushare_query'?normalizeBundledTushareQuery(args):args
      const result = await entry.client.callTool({ name: rawToolName, arguments: wireArgs }, undefined, { signal: combined, timeout: TOOL_CALL_TIMEOUT, maxTotalTimeout: TOOL_CALL_TIMEOUT })
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_BYTES) throw new IntegrationError('RESPONSE_TOO_LARGE', 'MCP 响应超过 8 MiB')
      const rawContent = Array.isArray(result.content) ? result.content : []
      const content = rawContent.flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return []
        const value = item as Record<string, unknown>
        if (value.type === 'text' && typeof value.text === 'string') return [{ type: 'text' as const, text: this.redact(value.text, entry) }]
        if (value.type === 'resource' && value.resource && typeof value.resource === 'object' && 'text' in value.resource && typeof value.resource.text === 'string') return [{ type: 'text' as const, text: this.redact(value.resource.text, entry) }]
        return [{ type: 'text' as const, text: '工具返回了非文本资源；当前连接只显示文本结果。' }]
      })
      if (!content.length && result.structuredContent) content.push({ type: 'text', text: this.redact(JSON.stringify(result.structuredContent), entry) })
      if (!content.length) content.push({ type: 'text', text: '工具调用完成（无文本结果）' })
      if (quotaKey && result.isError && content.some(item => /HTTP\s*402\b|["\\]code["\\\s]*:\s*402\b|订单额度已用完|quota\s+(?:exhausted|exceeded)/iu.test(item.text))) {
        this.datayesQuotaUntil.set(quotaKey, Date.now() + 60_000)
        return failure('RUNTIME_UNAVAILABLE', DATAYES_QUOTA_NOTICE)
      }
      return { content, ...(result.isError ? { isError: true } : {}) }
    } catch (error) {
      const failureError = entry.fatal ?? mappedError(error, combined, true)
      return failure(failureError.code, failureError.message)
    } finally {
      if (acquired) {
        entry.activeCalls--
        if (!entry.closed && !entry.closing && !entry.controller.signal.aborted) entry.callQueue.shift()?.start()
      }
    }
  }

  private async acquireCall(entry: Entry, signal: AbortSignal): Promise<void> {
    aborted(signal)
    if (entry.activeCalls < 4) { entry.activeCalls++; return }
    if (entry.callQueue.length >= 64) throw new IntegrationError('TIMEOUT', 'MCP 等待队列已满，请稍后重试')
    // Queue unsent work instead of reporting a local concurrency limit as a
    // failed business request. Calls already sent are never replayed here.
    await new Promise<void>((resolve, reject) => {
      const waiting = {
        start: () => { signal.removeEventListener('abort', waiting.cancel); entry.activeCalls++; resolve() },
        cancel: () => {
          signal.removeEventListener('abort', waiting.cancel)
          const index = entry.callQueue.indexOf(waiting)
          if (index >= 0) entry.callQueue.splice(index, 1)
          reject(cancelled())
        }
      }
      entry.callQueue.push(waiting)
      signal.addEventListener('abort', waiting.cancel, {once: true})
    })
  }

  async dispose(connectionId: string): Promise<void> {
    const entry = this.entries.get(connectionId)
    if (!entry) return
    this.entries.delete(connectionId)
    await this.closeEntry(entry)
  }

  async disposeAll(): Promise<void> { await Promise.all([...this.entries.keys()].map(id => this.dispose(id))) }

  private redact(text: string, entry: Entry): string {
    return entry.secrets.reduce((value, secret) => secret ? value.split(secret).join('[凭据已隐藏]') : value, text)
  }

  private async establish(entry: Entry): Promise<McpConnectionResult> {
    const signal = entry.controller.signal
    for (let attempt = 0; attempt < 10; attempt++) {
      aborted(signal)
      try {
        entry.closed = false
        entry.fatal = undefined
        const transport = await this.transport(entry)
        aborted(signal)
        entry.transport = transport
        const client = new Client({ name: 'ework-integrations', version: '1.0.0' }, { capabilities: {} })
        entry.client = client
        const setProtocolVersion = transport.setProtocolVersion?.bind(transport)
        transport.setProtocolVersion = version => { entry.negotiatedVersion = version; setProtocolVersion?.(version) }
        client.onclose = () => { entry.closed = true }
        client.onerror = error => {
          const mapped = mappedError(error, signal)
          if (mapped.code === 'RESPONSE_TOO_LARGE' || mapped.code === 'AUTH_REQUIRED' || mapped.code === 'NETWORK_BLOCKED') entry.fatal = mapped
        }
        await client.connect(transport, { signal, timeout: REQUEST_TIMEOUT, maxTotalTimeout: REQUEST_TIMEOUT })
        return await this.discover(entry, signal)
      } catch (error) {
        const mapped = entry.fatal ?? mappedError(error, signal)
        await this.closeTransport(entry, false)
        if (signal.aborted) throw cancelled()
        if (mapped.code !== 'RUNTIME_UNAVAILABLE' || isBundledDatayesId(entry.id) || attempt === 9) throw mapped
        // Retry only connection/discovery, never tool execution. One supervisor owns the budget.
        const delay = Math.min(30_000, 500 * 2 ** attempt)
        await wait(Math.round(delay * (0.9 + Math.random() * 0.1)), signal)
      }
    }
    throw new IntegrationError('RUNTIME_UNAVAILABLE', 'MCP 重连次数已用完')
  }

  private async transport(entry: Entry): Promise<Transport> {
    const config = entry.config
    aborted(entry.controller.signal)
    if (config.transport === 'stdio') {
      const env: Record<string, string> = {}
      for (const key of SAFE_ENV) if (process.env[key] && !process.env[key]!.startsWith('()')) env[key] = process.env[key]!
      for (const [key, ref] of Object.entries(config.env ?? {})) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || FORBIDDEN_ENV.test(key)) throw new IntegrationError('INVALID_CONFIG', 'MCP 环境变量名称不安全')
        if (typeof ref !== 'string' || !ref) throw new IntegrationError('INVALID_CONFIG', 'MCP 环境变量须引用已保存的凭据')
        const value = await this.credential(ref)
        env[key] = value
        entry.secrets.push(value)
      }
      const command = await executable(config.command ?? '', env)
      if (config.args?.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new IntegrationError('INVALID_CONFIG', 'MCP 参数必须是独立字符串')
      if (config.cwd && (!isAbsolute(config.cwd) || !(await stat(config.cwd)).isDirectory())) throw new IntegrationError('INVALID_CONFIG', 'MCP 工作目录必须是实际存在的绝对目录')
      const transport = new StdioClientTransport({ command, args: config.args ?? [], env, cwd: config.cwd, stderr: 'pipe', maxBufferSize: MAX_BYTES })
      // Drain diagnostics without forwarding secrets, raw process output, or unbounded logs.
      transport.stderr?.on('data', () => undefined)
      return transport
    }
    if (config.transport !== 'http' || !config.url) throw new IntegrationError('INVALID_CONFIG', '请填写 MCP HTTP 地址')
    let url: URL
    try { url = new URL(config.url) } catch { throw new IntegrationError('INVALID_CONFIG', 'MCP HTTP 地址无效') }
    await validateNetworkTarget(url, config.network)
    const headers = new Headers()
    if (config.auth.type !== 'none') {
      if (!config.auth.credentialRef) throw new IntegrationError('AUTH_REQUIRED', '请保存 MCP 认证凭据')
      const credential = await this.credential(config.auth.credentialRef)
      entry.secrets.push(credential)
      const name = config.auth.type === 'bearer' ? 'Authorization' : config.auth.headerName ?? 'X-API-Key'
      if (!/^[A-Za-z0-9-]+$/u.test(name) || /^(?:host|connection|content-length|transfer-encoding|proxy-authorization|mcp-session-id|mcp-protocol-version)$/iu.test(name) || /[\r\n]/u.test(credential)) throw new IntegrationError('INVALID_CONFIG', 'MCP 认证 Header 配置无效')
      headers.set(name, config.auth.type === 'bearer' ? `Bearer ${credential}` : credential)
    }
    return new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      // Disable SDK replay/reconnect; only safe connect/discovery is retried by establish().
      reconnectionOptions: { initialReconnectionDelay: 500, maxReconnectionDelay: 30_000, reconnectionDelayGrowFactor: 2, maxRetries: 0 },
      fetch: async (input, init = {}) => {
        const signal=AbortSignal.any([entry.controller.signal,...(init.signal?[init.signal]:[])])
        let response:Response
        if(isBundledTushareId(entry.id)) {
          if(url.href!==TUSHARE_GATEWAY||String(input)!==TUSHARE_GATEWAY||!this.tushareRequest)throw new IntegrationError('ACCESS_DENIED','内置 Tushare 服务地址无效')
          if(init.method!=='POST'||typeof init.body!=='string')return new Response(null,{status:405})
          response=await this.tushareRequest(init.body,signal)
        } else if (isBundledDataproId(entry.id)) {
          if (url.href !== DATAPRO_GATEWAY || String(input) !== DATAPRO_GATEWAY || !this.dataproRequest)
            throw new IntegrationError('ACCESS_DENIED', '内置专业数据集服务地址无效')
          if (init.method !== 'POST' || typeof init.body !== 'string') return new Response(null, { status: 405 })
          response = await this.dataproRequest(init.body, signal)
        } else if(isBundledDatayesId(entry.id)) {
          if(url.href!==DATAYES_GATEWAY||String(input)!==DATAYES_GATEWAY||!this.datayesRequest)throw new IntegrationError('ACCESS_DENIED','内置通联服务地址无效')
          if(init.method!=='POST'||typeof init.body!=='string')return new Response(null,{status:405})
          response=await this.datayesRequest(init.body,signal)
        } else response = await networkFetch(input, { ...init, signal }, { ...config.network, allowedOrigins: config.network.allowedOrigins?.length ? config.network.allowedOrigins : [url.origin] }, { timeoutMs: TOOL_CALL_TIMEOUT + 3000 })
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel()
          throw new IntegrationError('AUTH_REQUIRED', 'MCP 服务拒绝授权，请检查凭据和访问范围')
        }
        return response
      }
    })
  }

  private async credential(ref: string): Promise<string> {
    try {
      const value = await this.vault.read(ref)
      if (typeof value !== 'string' || !value) throw new Error('empty credential')
      return value
    } catch { throw new IntegrationError('AUTH_REQUIRED', '无法读取 MCP 凭据，请重新保存') }
  }

  private async discover(entry: Entry, signal: AbortSignal): Promise<McpConnectionResult> {
    const tools: McpDiscoveredTool[] = []
    const names = new Set<string>()
    const cursors = new Set<string>()
    let totalBytes = 0
    let cursor: string | undefined
    do {
      aborted(signal)
      if (!entry.client || entry.closed || entry.closing) throw new IntegrationError('RUNTIME_UNAVAILABLE', 'MCP 连接已断开')
      const result = await entry.client.listTools(cursor ? { cursor } : {}, { signal, timeout: REQUEST_TIMEOUT, maxTotalTimeout: REQUEST_TIMEOUT })
      totalBytes += Buffer.byteLength(JSON.stringify(result), 'utf8')
      if (totalBytes > MAX_BYTES) throw new IntegrationError('RESPONSE_TOO_LARGE', 'MCP 工具描述过大')
      for (const tool of result.tools) {
        if (names.has(tool.name) || !tool.name || tool.name.length > 256 || tools.length >= 1000) throw new IntegrationError('INVALID_CONFIG', 'MCP 工具列表重复、名称无效或超过 1000 个工具')
        names.add(tool.name)
        const inputSchema = JSON.parse(JSON.stringify(tool.inputSchema, (_key, value: unknown) => typeof value === 'string' ? this.redact(value, entry) : value)) as Record<string, unknown>
        tools.push({ name: tool.name, description: this.redact(tool.description ?? '', entry), inputSchema })
      }
      cursor = result.nextCursor
      if (cursor && (cursors.has(cursor) || cursors.size >= 100)) throw new IntegrationError('INVALID_CONFIG', 'MCP 工具分页游标无效')
      if (cursor) cursors.add(cursor)
    } while (cursor)
    entry.tools = tools
    return { tools: structuredClone(tools), ...(entry.negotiatedVersion ? { negotiatedVersion: entry.negotiatedVersion } : {}) }
  }

  private async closeEntry(entry: Entry): Promise<void> {
    if (entry.closePromise) return entry.closePromise
    entry.closing = true
    for (const waiting of [...entry.callQueue]) waiting.cancel()
    entry.closePromise = (async () => {
      // Abort pending startup promptly. A ready HTTP session gets a best-effort DELETE first.
      if (!entry.settled) entry.controller.abort()
      await this.closeTransport(entry, true)
      entry.controller.abort()
      entry.closed = true
      entry.secrets = []
    })()
    return entry.closePromise
  }

  private async closeTransport(entry: Entry, terminateSession: boolean): Promise<void> {
    const transport = entry.transport
    if (transport instanceof StdioClientTransport && transport.pid) await terminateDescendants(transport.pid)
    if (terminateSession && transport instanceof StreamableHTTPClientTransport && transport.sessionId && !entry.controller.signal.aborted) {
      const timer = setTimeout(() => entry.controller.abort(), 1500)
      try { await transport.terminateSession() } catch { /* DELETE is optional; local close still revokes the connection. */ } finally { clearTimeout(timer) }
    }
    await entry.client?.close().catch(() => undefined)
    await transport?.close().catch(() => undefined)
    entry.client = undefined
    entry.transport = undefined
  }
}
