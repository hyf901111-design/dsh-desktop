import { isResearchTool } from './research-capabilities.js'
import { argumentsMatchSchema } from './research-schema.js'
import { serviceError } from './contract.js'
import { researchHash } from './research-operations.js'

const OFFICIAL_MCP_ENDPOINT = 'https://stargate.yingmi.com/mcp/v2'
const PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26'])
const RESPONSE_LIMIT_BYTES = 1024 * 1024
const NAV_HISTORY_TOOL = 'BatchGetFundNavHistory'


function privateFailure(state = 'failed') {
  const error = new Error('Private fund data request failed.')
  Object.defineProperty(error, 'state', { value: state })
  return error
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function validCredential(value) {
  return typeof value === 'string' && value.trim().length >= 8 && value.length <= 4_096
}

function validateArguments(inputSchema, args) {
  let valid
  try { valid = argumentsMatchSchema(inputSchema, args) }
  catch { throw serviceError('RESEARCH_SCHEMA_UNSUPPORTED') }
  if (!valid) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
}

function requestAbort(signal, timeoutMs) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}

async function readRpcResponse(response, id, signal) {
  const contentType = response.headers.get('content-type') ?? ''
  const isSse = contentType.includes('text/event-stream')
  if (!isSse && !contentType.includes('application/json')) throw privateFailure('incompatible')
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > RESPONSE_LIMIT_BYTES)) {
    throw privateFailure('incompatible')
  }
  const reader = response.body?.getReader?.()
  if (!reader) throw privateFailure('incompatible')
  const decoder = new TextDecoder()
  let buffer = ''
  let bytes = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (value !== undefined) {
        if (!(value instanceof Uint8Array)) throw privateFailure('incompatible')
        bytes += value.byteLength
        if (bytes > RESPONSE_LIMIT_BYTES) throw privateFailure('incompatible')
        buffer += decoder.decode(value, { stream: !done })
      }
      if (!isSse && done) {
        let parsed
        try { parsed = JSON.parse(buffer) } catch { throw privateFailure('incompatible') }
        return rpcValue(parsed, id)
      }
      if (isSse) {
        buffer = buffer.replace(/\r\n/gu, '\n')
        if (done && buffer && !buffer.endsWith('\n\n')) buffer += '\n\n'
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = block.split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /u, ''))
            .join('\n')
          if (!data) continue
          let message
          try { message = JSON.parse(data) } catch { throw privateFailure('incompatible') }
          if (record(message).id === id) return rpcValue(message, id)
        }
      }
      if (done) throw privateFailure('incompatible')
    }
  } catch (error) {
    if (error?.state) throw error
    throw privateFailure()
  } finally {
    signal?.removeEventListener('abort', cancel)
    cancel()
    try { reader.releaseLock() } catch {}
  }
}

function rpcValue(value, id) {
  const message = record(value)
  if (message.jsonrpc !== '2.0' || message.id !== id) throw privateFailure('incompatible')
  if (message.error !== undefined || !Object.hasOwn(message, 'result')) throw privateFailure()
  return message.result
}

function toolPayload(result, name) {
  const response = record(result)
  if (response.isError === true) throw privateFailure()
  if (response.structuredContent !== undefined) return response.structuredContent
  const texts = Array.isArray(response.content)
    ? response.content
      .map(record)
      .filter((entry) => entry.type === 'text')
      .map((entry) => entry.text)
    : []
  if (texts.length !== 1 || typeof texts[0] !== 'string') throw privateFailure('incompatible')
  try {
    return JSON.parse(texts[0])
  } catch {
    if (name === NAV_HISTORY_TOOL && /^\[1\]:\s*\n[ \t]+- fundCode:/u.test(texts[0])) return texts[0]
    throw privateFailure('incompatible')
  }
}

export function createYingmiMcpClient({
  apiKey,
  fetch: request = globalThis.fetch,
  timeoutMs = 15_000
}) {
  if (!validCredential(apiKey)) throw privateFailure('credential_missing')
  if (typeof request !== 'function') throw new TypeError('A fetch implementation is required.')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError('Private MCP timeout is invalid.')
  }
  let sessionId
  let protocolVersion = PROTOCOL_VERSIONS[0]
  let sequence = 0
  let initialization
  let listedTools
  let halted

  const headers = () => ({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'x-api-key': apiKey.trim(),
    'MCP-Protocol-Version': protocolVersion,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
  })

  const rpcRequest = async (method, params, {
    notification = false,
    retrySession = true,
    expectedSchemaHash,
    signal
  } = {}) => {
    if (signal?.aborted) throw privateFailure()
    if (halted) throw halted
    const operation = requestAbort(signal, timeoutMs)
    const id = ++sequence
    try {
      const response = await request(OFFICIAL_MCP_ENDPOINT, {
        method: 'POST',
        headers: headers(),
        redirect: 'error',
        cache: 'no-store',
        signal: operation.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(notification ? {} : { id }),
          method,
          ...(params === undefined ? {} : { params })
        })
      })
      if (response.status === 404 && sessionId && retrySession &&
          method !== 'initialize' && method !== 'notifications/initialized') {
        sessionId = undefined
        initialization = undefined
        listedTools = undefined
        await ensureInitialized(signal)
        if (method === 'tools/call') {
          const requestedName = record(params).name
          const args = record(params).arguments
          const refreshed = (await listTools(signal)).find((entry) => entry.name === requestedName)
          if (!isResearchTool(requestedName) || !refreshed) throw privateFailure('incompatible')
          if (expectedSchemaHash && researchHash(refreshed.inputSchema) !== expectedSchemaHash) throw serviceError('RESEARCH_SCHEMA_CHANGED')
          validateArguments(refreshed.inputSchema, args)
        }
        return rpcRequest(method, params, { notification, retrySession: false, expectedSchemaHash, signal })
      }
      if (response.status === 401 || response.status === 403) throw privateFailure('unauthorized')
      if (response.status === 429) throw privateFailure('rate_limited')
      if (!response.ok) throw privateFailure()
      if (notification) {
        await response.body?.cancel?.().catch(() => {})
        return undefined
      }
      const receivedSession = response.headers.get('Mcp-Session-Id')
      if (method === 'initialize' && receivedSession !== null) {
        if (!/^[\x21-\x7e]{1,512}$/u.test(receivedSession)) throw privateFailure('incompatible')
        sessionId = receivedSession
      }
      return await readRpcResponse(response, id, operation.signal)
    } catch (error) {
      const state = error?.state
      if (state === 'unauthorized' || state === 'rate_limited') halted = error
      if (state || error?.code?.startsWith('RESEARCH_')) throw error
      throw privateFailure()
    } finally {
      operation.dispose()
    }
  }

  const ensureInitialized = async (signal) => {
    initialization ??= (async () => {
      const result = record(await rpcRequest('initialize', {
        protocolVersion: PROTOCOL_VERSIONS[0],
        capabilities: {},
        clientInfo: { name: 'sherlock-fund-runtime', version: '0.1.0' }
      }, { signal }))
      if (typeof result.protocolVersion !== 'string' ||
          !PROTOCOL_VERSIONS.includes(result.protocolVersion) ||
          !Object.hasOwn(record(result.capabilities), 'tools')) {
        throw privateFailure('incompatible')
      }
      protocolVersion = result.protocolVersion
      await rpcRequest('notifications/initialized', undefined, { notification: true, signal })
    })()
    try {
      await initialization
    } catch (error) {
      initialization = undefined
      throw error
    }
  }

  const listTools = async (signal) => {
    await ensureInitialized(signal)
    listedTools ??= (async () => {
      const result = []
      const seenNames = new Set()
      const seenCursors = new Set()
      let cursor
      for (let page = 0; page < 10; page += 1) {
        const response = record(await rpcRequest('tools/list', cursor ? { cursor } : {}, { signal }))
        if (!Array.isArray(response.tools)) throw privateFailure('incompatible')
        for (const entry of response.tools) {
          const tool = record(entry)
          if (typeof tool.name !== 'string' || seenNames.has(tool.name) ||
              !tool.inputSchema || typeof tool.inputSchema !== 'object') {
            throw privateFailure('incompatible')
          }
          seenNames.add(tool.name)
          result.push(Object.freeze({ name: tool.name, inputSchema: record(tool.inputSchema),
            ...(typeof tool.description === 'string' ? { description: tool.description } : {}) }))
          if (result.length > 256) throw privateFailure('incompatible')
        }
        if (response.nextCursor === undefined) return Object.freeze(result)
        if (typeof response.nextCursor !== 'string' || !response.nextCursor ||
            seenCursors.has(response.nextCursor)) {
          throw privateFailure('incompatible')
        }
        cursor = response.nextCursor
        seenCursors.add(cursor)
      }
      throw privateFailure('incompatible')
    })()
    return listedTools
  }

  return Object.freeze({
    async callTool(name, args, { signal } = {}) {
      if (!isResearchTool(name)) throw privateFailure('incompatible')
      const tool = (await listTools(signal)).find((entry) => entry.name === name)
      if (!tool) throw privateFailure('incompatible')
      validateArguments(tool.inputSchema, args)
      const result = await rpcRequest('tools/call', { name, arguments: args }, { signal })
      return toolPayload(result, name)
    },
    async callToolResult(name, args, { signal, schemaHash } = {}) {
      if (!isResearchTool(name)) throw privateFailure('incompatible')
      const tool = (await listTools(signal)).find(entry => entry.name === name)
      if (!tool) throw serviceError('RESEARCH_CAPABILITY_UNAVAILABLE')
      validateArguments(tool.inputSchema, args)
      const result = await rpcRequest('tools/call', { name, arguments: args }, { signal, expectedSchemaHash: schemaHash })
      if (!result || typeof result !== 'object') throw privateFailure()
      if (result.isError === true) throw serviceError('RESEARCH_QUERY_FAILED')
      return result
    },
    async listTools({ signal } = {}) {
      return listTools(signal)
    },
    async close() {
      if (!sessionId) return
      const cleanup = requestAbort(undefined, 3_000)
      try {
        await request(OFFICIAL_MCP_ENDPOINT, {
          method: 'DELETE',
          headers: headers(),
          redirect: 'error',
          cache: 'no-store',
          signal: cleanup.signal
        })
      } catch {
        // Cleanup must not replace the completed research result.
      } finally {
        cleanup.dispose()
        sessionId = undefined
      }
    }
  })
}

export { OFFICIAL_MCP_ENDPOINT }
