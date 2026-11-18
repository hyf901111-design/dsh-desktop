import { randomUUID, timingSafeEqual } from 'node:crypto'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { boundedImageJson, ImageGenerationError, validateGeneratedImage } from './image-generation-provider.js'
import { hostedChatIdleTimeoutMs } from './hosted-ai-timeouts.js'

export const HOSTED_ARK_PROVIDER = 'ework-ark'
const displayName = 'EWork'
const defaultImage = 'doubao-seedream-5.0-flash'
const hostedRequestBytes = 12_000_000
const retryPolicy = resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, HOSTED_ARK_PROVIDER)

function bridgeOptions(raw) {
  try {
    const { url, token } = JSON.parse(raw)
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username ||
        parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/fund-research' || !/^[a-f0-9]{64}$/.test(token)) return
    return { base: parsed.origin + '/hosted-ai', token }
  } catch { return undefined }
}

function fitHostedChatPayload(payload) {
  const images = []
  for (const { content } of payload.messages) {
    if (!Array.isArray(content)) continue
    content.forEach((part, index) => {
      if (part.type === 'image_url') images.push({ content, index })
    })
  }
  const newest = images.at(-1)?.content
  const omitted = { type: 'text', text: '[较早的图片未随本次请求发送]' }
  let bytes = Buffer.byteLength(JSON.stringify(payload))
  let count = images.length
  // Keep the newest batch intact, and trim only older images when the gateway's bounds require it.
  for (const { content, index } of images) {
    if (content === newest || (count <= 4 && bytes <= hostedRequestBytes)) break
    bytes -= Buffer.byteLength(JSON.stringify(content[index])) - Buffer.byteLength(JSON.stringify(omitted))
    content[index] = omitted
    count--
  }
  if (count > 4) throw new Error('本次发送的图片太多，请选择最多四张图片后重试。')
  if (bytes > hostedRequestBytes) throw new Error('本次消息和图片过大，请压缩图片或缩短消息后重试。')
  return payload
}

export function isInterruptedModelStream(message) {
  return typeof message === 'string' && (message.includes('Stream ended without finish_reason') ||
    message.includes('HOSTED_AI_STREAM_INTERRUPTED') || message === '方舟输出中断，未自动重试。')
}

class HostedPiAiAdapter extends PiAiAdapter {
  async *stream(options) {
    for await (const event of super.stream(options)) {
      if (event.type !== 'finish' || event.reason.kind !== 'error') {
        yield event
        continue
      }
      const { failure } = event.reason
      const quotaWindow = /\bAI_QUOTA_(FIVE_HOUR|WEEK|MONTH)\b/.exec(failure.message)?.[1]
      let visibleFailure = failure
      if (quotaWindow) {
        const label = { FIVE_HOUR: '5 小时', WEEK: '本周', MONTH: '本月' }[quotaWindow]
        visibleFailure = { ...failure, code: 'AI_QUOTA_' + quotaWindow, message: `${label}剩余额度不足以开始本次模型调用。` }
      } else if (failure.message.includes('HOSTED_AI_PAYLOAD_TOO_LARGE') || failure.message.includes('本次消息和图片过大') ||
                 failure.message.includes('本次发送的图片太多')) {
        visibleFailure = { ...failure, code: 'HOSTED_AI_PAYLOAD_TOO_LARGE', message: '本次消息和图片过大，请压缩图片或缩短消息后重试。' }
      } else if (isInterruptedModelStream(failure.message)) {
        visibleFailure = { ...failure, code: 'TRANSPORT', message: '模型输出中断，请重新发起请求。' }
      }
      yield { ...event, reason: { ...event.reason, failure: visibleFailure } }
    }
  }
}

function adapterFor(ctx, base, apiKey, models) {
  const provider = HOSTED_ARK_PROVIDER
  const api = openAICompletionsApi()
  const piProvider = createProvider({
    id: provider, name: displayName, baseUrl: base,
    auth: { apiKey: { name: displayName, resolve: ({ credential }) => Promise.resolve({ auth: { apiKey: credential?.key }, source: displayName }) } },
    models: models.map(({ id, name, contextWindow, supportsImageInput }) => ({
      id, name, provider, api: 'openai-completions', baseUrl: base, input: supportsImageInput === true ? ['text', 'image'] : ['text'], contextWindow, maxTokens: 32768,
      reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens',
        ...(id.startsWith('deepseek-') ? { requiresThinkingAsText: false, thinkingFormat: 'deepseek' } : {}) }
    })),
    api: {
      ...api,
      streamSimple: (model, context, options) =>
        api.streamSimple(model, context, {
          ...options,
          headers: { ...options?.headers, 'x-ework-request-id': randomUUID() },
          onPayload: fitHostedChatPayload
        })
    }
  })
  const profiles = new Map([[provider, { displayName, piProvider, streamIdleTimeoutMs: hostedChatIdleTimeoutMs,
    configuredMaxTokens: new Map(models.map(({ id }) => [id, 16384])), retryPolicy }]])
  return new HostedPiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => apiKey, resolveAttachments: () => ctx.get?.('attachments') })
}

/** The only credential Pi sees is a loopback capability tied to one account generation. */
export function registerHostedAi(ctx, { request = globalThis.fetch, bridge = process.env.SHERLOCK_ACCOUNT_BRIDGE, pollMs = 10_000 } = {}) {
  const config = bridgeOptions(bridge)
  if (!config) return undefined
  const { base, token } = config
  let registration, state, fingerprint, pending, disposed = false
  let catalogUnavailable = false, retainUntil = 0
  const lifetime = new AbortController()
  const apply = value => {
    if (disposed) return
    const models = (Array.isArray(value?.models) ? value.models : []).filter(model =>
      model && /^[a-z0-9.-]{1,80}$/.test(model.id) && typeof model.name === 'string' &&
      Number.isSafeInteger(model.contextWindow) && model.contextWindow >= 8192 && model.contextWindow <= 2048000)
    const generation = value?.generation
    const active = Number.isSafeInteger(generation) && generation >= 0 && models.length > 0
    catalogUnavailable = false
    if (value?.status !== 'stale') retainUntil = active ? Date.now() + 60000 : 0
    const next = JSON.stringify(active ? [generation, models, value.image === true] : null)
    if (next === fingerprint) return
    fingerprint = next
    registration?.()
    registration = undefined
    state = undefined
    if (active) {
      const key = token + '.' + generation
      const adapter = adapterFor(ctx, base, key, models)
      registration = ctx.llm.registerAdapter([HOSTED_ARK_PROVIDER], adapter)
      state = { key, image: value.image === true }
    }
  }
  const unavailable = (clear = false) => {
    if (clear || Date.now() >= retainUntil) apply(undefined)
    catalogUnavailable = true
  }
  const refresh = () => pending ??= (async () => {
    try {
      const response = await request(base + '/catalog', { redirect: 'error', headers: { authorization: 'Bearer ' + token },
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]) })
      if (disposed) { await response.body?.cancel(); return }
      if (response.ok) {
        const value = await response.json()
        if (Array.isArray(value?.models) && typeof value.image === 'boolean') apply(value)
        else unavailable()
      } else {
        const value = await response.json().catch(() => undefined)
        unavailable(value?.status === 'session-changed' || value?.status === 'unavailable')
      }
    } catch { if (!disposed) unavailable() }
  })().finally(() => { pending = undefined })
  const unregisterAccountChange = ctx.webServer?.register({
    kind: 'exact', path: '/sherlock/hosted-ai/account-changed',
    async handler(req, res) {
      const authorization = Buffer.from(req.headers.authorization ?? '')
      const expected = Buffer.from('Bearer ' + token)
      if (req.method !== 'POST' || req.socket.remoteAddress !== '127.0.0.1' ||
          !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '') || req.headers.origin !== undefined ||
          authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
        res.writeHead(403).end()
        return
      }
      // An outstanding request may have started under the previous account.
      await pending
      if (disposed) {
        res.writeHead(503).end()
        return
      }
      await refresh()
      res.writeHead(204).end()
    }
  })
  void refresh()
  const timer = setInterval(() => void refresh(), pollMs)
  timer.unref?.()
  const image = {
    models: [
      { id: defaultImage, name: 'Seedream 5.0 Flash', description: '快速生图与改图' },
      { id: 'doubao-seedream-5-0-pro', name: 'Seedream 5.0 Pro', description: '复杂构图与精细生成' }
    ],
    available: () => state?.image === true,
    ready: () => pending,
    unavailable: () => catalogUnavailable,
    capture() {
      const access = state
      if (!access?.image) throw new ImageGenerationError('当前账号未开通 Seedream。')
      return async (input, { signal, maxBytes, requestId, assertCurrent }) => {
        const assertAccess = () => {
          if (access.key !== state?.key || !state.image || lifetime.signal.aborted)
            throw new ImageGenerationError('账号已切换或套餐权限已更新，请重新发起生图。')
        }
        assertAccess()
        if (input.background === 'transparent') throw new ImageGenerationError('Seedream 暂不支持透明背景，请改用普通背景。')
        assertCurrent?.()
        const references = input.references.map(image => 'data:' + image.mediaType + ';base64,' + Buffer.from(image.data).toString('base64'))
        const body = JSON.stringify({ model: input.model, prompt: input.prompt, size: input.size, references })
        if (Buffer.byteLength(body) > hostedRequestBytes) throw new ImageGenerationError('参考图过大，请压缩后重试。')
        const response = await request(base + '/images', { method: 'POST', redirect: 'error',
          headers: {
            'content-type': 'application/json', authorization: 'Bearer ' + access.key,
            ...(requestId ? { 'x-ework-request-id': requestId } : {})
          }, body,
          signal: AbortSignal.any([signal, lifetime.signal]) })
        if (!response.ok) {
          const error = await response.json().catch(() => null)
          const responseId = response.headers.get('x-ework-request-id')
          const detail = responseId && /^[-a-zA-Z0-9_]{1,128}$/.test(responseId) ? ' 请求编号 ' + responseId : ''
          throw new ImageGenerationError((error?.error?.message ?? 'Seedream 暂时不可用，请稍后重试。') + detail)
        }
        assertAccess()
        const result = await boundedImageJson(response, Math.ceil(maxBytes * 4 / 3) + 64 * 1024)
        assertAccess()
        if (typeof result?.data !== 'string') throw new ImageGenerationError('Seedream 未返回有效图片。')
        const data = Buffer.from(result.data, 'base64')
        return { data: validateGeneratedImage(data, maxBytes), mediaType: 'image/png' }
      }
    }
  }
  return { image, refresh, dispose() {
    disposed = true; state = undefined; lifetime.abort(); clearInterval(timer); unregisterAccountChange?.(); registration?.()
  } }
}
