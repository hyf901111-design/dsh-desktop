import {
  cancelledError,
  hashPayload,
  normalizeResearchResult,
  toPublicFundResearchError,
  unavailableError,
  validateResearchRequest
} from './contract.js'

const OPERATION_KEYS = new Set(['name', 'buildArguments', 'normalize'])

function aborted(signal) {
  if (signal?.aborted) throw cancelledError()
}

function fixedFailure(error, signal) {
  throw toPublicFundResearchError(error, signal)
}

function normalizePrivateTerms(value) {
  if (!Array.isArray(value)) throw new TypeError('Private fund data terms must be an array.')
  const terms = [...new Set(value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => [...entry].length >= 2))]
  if (terms.length === 0) throw new TypeError('At least one private fund data term is required.')
  return Object.freeze(terms)
}

function validateOperations(operations) {
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
    throw new TypeError('Fund data operations must be an object.')
  }
  const result = new Map()
  for (const [task, value] of Object.entries(operations)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Fund data operation is invalid.')
    }
    if (Object.keys(value).some((key) => !OPERATION_KEYS.has(key))) {
      throw new TypeError('Fund data operation contains an unknown field.')
    }
    if (typeof value.name !== 'string' || !value.name.trim()) {
      throw new TypeError('Fund data operation name is invalid.')
    }
    if (typeof value.buildArguments !== 'function' || typeof value.normalize !== 'function') {
      throw new TypeError('Fund data operation adapters are required.')
    }
    result.set(task, Object.freeze({
      name: value.name.trim(),
      buildArguments: value.buildArguments,
      normalize: value.normalize
    }))
  }
  return result
}

export function createPrivateToolProvider({
  invoke,
  operations,
  privateTerms = [],
  timeoutMs = 30_000,
  clock = () => new Date()
}) {
  if (typeof invoke !== 'function') throw new TypeError('A private fund data invoker is required.')
  const mapped = validateOperations(operations)
  const protectedTerms = normalizePrivateTerms(privateTerms)
  return Object.freeze({
    async research(input, { signal } = {}) {
      const request = validateResearchRequest(input)
      aborted(signal)
      const operation = mapped.get(request.task)
      if (!operation) throw unavailableError()
      const scope = operationAbort(signal, timeoutMs)
      try {
        const argumentsValue = operation.buildArguments(request)
        if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
          throw unavailableError()
        }
        if (Buffer.byteLength(JSON.stringify(argumentsValue)) > 32 * 1024) throw unavailableError()
        const raw = await scope.run(() => invoke({
          name: operation.name,
          arguments: argumentsValue,
          signal: scope.signal
        }))
        const receivedAt = clock().toISOString()
        const normalized = await scope.run(() => operation.normalize(raw, {
          request,
          receivedAt,
          signal: scope.signal
        }))
        return normalizeResearchResult(normalized, {
          request,
          receivedAt,
          rawHash: hashPayload(raw),
          privateTerms: [...protectedTerms, operation.name]
        })
      } catch (error) {
        fixedFailure(error, signal)
      } finally {
        scope.dispose()
      }
    }
  })
}

function safeGatewayOrigin(endpoint) {
  const url = new URL(endpoint)
  const loopback = url.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Fund data gateway endpoint is invalid.')
  }
  return url.origin
}

function operationAbort(signal, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError('Fund data timeout is invalid.')
  }
  const controller = new AbortController()
  let rejectStopped
  let stopped = false
  const stoppedPromise = new Promise((_resolve, reject) => { rejectStopped = reject })
  const stop = (external) => {
    if (stopped) return
    stopped = true
    controller.abort()
    rejectStopped(external ? cancelledError() : unavailableError())
  }
  const onAbort = () => stop(true)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => stop(false), timeoutMs)
  return {
    signal: controller.signal,
    run(start) {
      return Promise.race([Promise.resolve().then(start), stoppedPromise])
    },
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

async function readBoundedResponse(response, operation, maximumBytes) {
  const reader = response.body?.getReader?.()
  if (!reader) throw unavailableError()
  const chunks = []
  let length = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  operation.signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { value, done } = await operation.run(() => reader.read())
      if (done) break
      if (!(value instanceof Uint8Array)) throw unavailableError()
      length += value.byteLength
      if (length > maximumBytes) {
        cancel()
        throw unavailableError()
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    operation.signal.removeEventListener('abort', cancel)
    try { reader.releaseLock() } catch {}
  }
  return Buffer.concat(chunks, length).toString('utf8')
}

export function createPrivateGatewayProvider({
  endpoint,
  token,
  fetch: request = globalThis.fetch,
  privateTerms = [],
  timeoutMs = 30_000,
  clock = () => new Date()
}) {
  const origin = safeGatewayOrigin(endpoint)
  if (typeof token !== 'string' || !token.trim() || token.length > 4_096) {
    throw new TypeError('Fund data gateway credential is invalid.')
  }
  if (typeof request !== 'function') throw new TypeError('A fetch implementation is required.')
  const protectedTerms = normalizePrivateTerms(privateTerms)
  return Object.freeze({
    async research(input, { signal } = {}) {
      const normalizedRequest = validateResearchRequest(input)
      aborted(signal)
      const operation = operationAbort(signal, timeoutMs)
      try {
        const response = await operation.run(() => request(`${origin}/v1/fund-research/query`, {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: operation.signal,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(normalizedRequest)
        }))
        const declaredLength = response.headers.get('content-length')
        if (!response.ok || (declaredLength !== null &&
            (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > 1024 * 1024))) {
          throw unavailableError()
        }
        const raw = await readBoundedResponse(response, operation, 1024 * 1024)
        const receivedAt = clock().toISOString()
        return normalizeResearchResult(JSON.parse(raw), {
          request: normalizedRequest,
          receivedAt,
          rawHash: hashPayload(raw),
          privateTerms: protectedTerms
        })
      } catch (error) {
        fixedFailure(error, signal)
      } finally {
        operation.dispose()
      }
    }
  })
}

export function createUnavailableProvider() {
  return Object.freeze({
    async research(input, { signal } = {}) {
      validateResearchRequest(input)
      aborted(signal)
      throw unavailableError()
    }
  })
}

export function createProviderFromEnvironment({
  env = process.env,
  fetch = globalThis.fetch,
  clock = () => new Date()
} = {}) {
  const endpoint = env.SHERLOCK_FUND_DATA_GATEWAY_URL?.trim()
  const token = env.SHERLOCK_FUND_DATA_GATEWAY_TOKEN?.trim()
  const protectedTerms = (env.SHERLOCK_FUND_DATA_PRIVATE_TERMS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (!endpoint || !token || protectedTerms.length === 0) return createUnavailableProvider()
  try {
    return createPrivateGatewayProvider({ endpoint, token, fetch, clock, privateTerms: protectedTerms })
  } catch {
    return createUnavailableProvider()
  }
}
