import { LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { ImageGenerationError, validateGeneratedImage } from './image-generation-provider.js'

export const HOSTED_ARK_PROVIDER = 'ework-ark'
const displayName = 'EWork'
const defaultImage = 'doubao-seedream-5.0-flash'

function bridgeOptions(raw) {
  try {
    const { url, token } = JSON.parse(raw)
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username ||
        parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/fund-research' || !/^[a-f0-9]{64}$/.test(token)) return
    return { base: parsed.origin + '/hosted-ai', token }
  } catch { return undefined }
}

function adapterFor(ctx, base, apiKey, models) {
  const provider = HOSTED_ARK_PROVIDER
  const piProvider = createProvider({
    id: provider, name: displayName, baseUrl: base,
    auth: { apiKey: { name: displayName, resolve: ({ credential }) => Promise.resolve({ auth: { apiKey: credential?.key }, source: displayName }) } },
    models: models.map(({ id, name, contextWindow, supportsImageInput }) => ({
      id, name, provider, api: 'openai-completions', baseUrl: base, input: supportsImageInput === true ? ['text', 'image'] : ['text'], contextWindow, maxTokens: 32768,
      reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens',
        ...(id.startsWith('deepseek-') ? { requiresThinkingAsText: false, thinkingFormat: 'deepseek' } : {}) }
    })),
    api: openAICompletionsApi()
  })
  const profiles = new Map([[provider, { displayName, piProvider, streamIdleTimeoutMs: 120000,
    configuredMaxTokens: new Map(models.map(({ id }) => [id, 16384])), retryPolicy: { maxRetries: 0 } }]])
  return new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => apiKey, resolveAttachments: () => ctx.get?.('attachments') })
}

/** The only credential Pi sees is a loopback capability tied to one account generation. */
export function registerHostedAi(ctx, { request = globalThis.fetch, bridge = process.env.SHERLOCK_ACCOUNT_BRIDGE, pollMs = 2000 } = {}) {
  const config = bridgeOptions(bridge)
  if (!config) return undefined
  const { base, token } = config
  let registration, state, fingerprint, pending, disposed = false
  const lifetime = new AbortController()
  const apply = value => {
    const models = (Array.isArray(value?.models) ? value.models : []).filter(model =>
      model && /^[a-z0-9.-]{1,80}$/.test(model.id) && typeof model.name === 'string' &&
      Number.isSafeInteger(model.contextWindow) && model.contextWindow >= 8192 && model.contextWindow <= 2048000)
    const generation = value?.generation
    const active = Number.isSafeInteger(generation) && generation >= 0 && models.length > 0
    const next = JSON.stringify(active ? [generation, models, value.image === true] : null)
    if (next === fingerprint || disposed) return
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
  const refresh = () => pending ??= (async () => {
    try {
      const response = await request(base + '/catalog', { redirect: 'error', headers: { authorization: 'Bearer ' + token },
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]) })
      if (response.ok) apply(await response.json())
      else { await response.body?.cancel(); apply(undefined) }
    } catch { apply(undefined) }
  })().finally(() => { pending = undefined })
  void refresh()
  const timer = setInterval(() => void refresh(), pollMs)
  timer.unref?.()
  const image = {
    models: [
      { id: defaultImage, name: 'Seedream 5.0 Flash', description: '快速生图与改图' },
      { id: 'doubao-seedream-5-0-pro', name: 'Seedream 5.0 Pro', description: '复杂构图与精细生成' }
    ],
    available: () => state?.image === true,
    capture() {
      const access = state
      if (!access?.image) throw new ImageGenerationError('当前账号未开通 Seedream。')
      return async (input, { signal, maxBytes, assertCurrent }) => {
        if (access !== state || lifetime.signal.aborted) throw new ImageGenerationError('账号已切换，请重新发起生图。')
        if (input.background === 'transparent') throw new ImageGenerationError('Seedream 暂不支持透明背景，请改用普通背景。')
        assertCurrent?.()
        const references = input.references.map(image => 'data:' + image.mediaType + ';base64,' + Buffer.from(image.data).toString('base64'))
        const body = JSON.stringify({ model: input.model, prompt: input.prompt, size: input.size, references })
        if (Buffer.byteLength(body) > 12_000_000) throw new ImageGenerationError('参考图过大，请压缩后重试。')
        const response = await request(base + '/images', { method: 'POST', redirect: 'error',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access.key }, body,
          signal: AbortSignal.any([signal, lifetime.signal]) })
        if (!response.ok) {
          const error = await response.json().catch(() => null)
          throw new ImageGenerationError(error?.error?.message ?? 'Seedream 暂时不可用，请稍后重试。')
        }
        if (access !== state) throw new LlmError('账号已切换', 'ABORTED')
        const data = Buffer.from((await response.json()).data ?? '', 'base64')
        return { data: validateGeneratedImage(data, maxBytes), mediaType: 'image/png' }
      }
    }
  }
  return { image, refresh, dispose() {
    disposed = true; state = undefined; lifetime.abort(); clearInterval(timer); registration?.()
  } }
}
