import { authenticate } from '../accounts/auth.js'
import { AiQuotaError, AiQuotaLedger } from '../accounts/ai-quota.js'
import { openVikingKey, vikingMemory } from './openviking.js'
import { ARK_TEXT_MODELS, ARK_IMAGE_MODELS, ARK_PLAN_BASE } from './ark-catalog.js'

const ROOT = '/v1/hosted-ai/'
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const json = (body, status = 200) => Response.json(body, { status, headers })
const fail = (code, status, message) => json({ error: { code, message } }, status)
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const validCount = x => Number.isSafeInteger(x) && x >= 0
const nonempty = x => typeof x === 'string' && x.trim().length > 0
const modelMap = new Map(ARK_TEXT_MODELS.map(model => [model.id, model]))
const encoder = new TextEncoder()

async function readJson(request, maxBytes) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !request.body) throw Error('body')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const reader = request.body.getReader()
  const signal = AbortSignal.timeout(10000)
  const cancel = () => void reader.cancel().catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  try {
    let input = '', size = 0
    for (;;) {
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      if ((size += value.byteLength) > maxBytes) throw Error('limit')
      input += decoder.decode(value, { stream: true })
    }
    return JSON.parse(input + decoder.decode())
  } finally { signal.removeEventListener('abort', cancel); cancel() }
}

function chatInput(input) {
  if (!object(input) || !modelMap.has(input.model) || input.stream !== true ||
    !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 512) throw Error('input')
  const model = modelMap.get(input.model)
  const max = input.max_completion_tokens ?? input.max_tokens ?? 8192
  if (!validCount(max) || max === 0) throw Error('max_tokens')
  const out = {
    model: model.id, stream: true, stream_options: { include_usage: true },
    max_tokens: Math.min(max, 32768),
    // Preserve multi-turn tool calls. Do not pass URL-bearing inputs or backend tools.
    messages: input.messages.map(msg => {
      if (!object(msg) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(msg.role)) throw Error('role')
      const { role } = msg
      let content = msg.content
      if (Array.isArray(content)) {
        if (!content.every(part => part?.type === 'text' && typeof part.text === 'string')) throw Error('modality')
        content = content.map(part => part.text).join('\n')
      }
      if (typeof content !== 'string' && !(role === 'assistant' && content == null && Array.isArray(msg.tool_calls))) throw Error('content')
      const message = { role: role === 'developer' ? 'system' : role, content: content ?? null }
      if (role === 'assistant' && Array.isArray(msg.tool_calls)) {
        if (msg.tool_calls.length > 64) throw Error('calls')
        message.tool_calls = msg.tool_calls.map(call => {
          if (call?.type !== 'function' || !nonempty(call.id) || !nonempty(call.function?.name) || typeof call.function.arguments !== 'string') throw Error('call')
          return { id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments } }
        })
      }
      if (role === 'assistant' && typeof msg.reasoning_content === 'string') message.reasoning_content = msg.reasoning_content
      if (role === 'tool') {
        if (!nonempty(msg.tool_call_id)) throw Error('tool_call_id')
        message.tool_call_id = msg.tool_call_id
      }
      return message
    })
  }
  if (input.temperature !== undefined) {
    if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) throw Error('temperature')
    out.temperature = input.temperature
  }
  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools) || input.tools.length > 128) throw Error('tools')
    out.tools = input.tools.map(tool => {
      if (tool?.type !== 'function' || !nonempty(tool.function?.name) || !object(tool.function.parameters)) throw Error('tool')
      const { name, description, parameters } = tool.function
      return { type: 'function', function: { name, ...(typeof description === 'string' ? { description } : {}), parameters } }
    })
    if (out.tools.length) out.tool_choice = 'auto'
  }
  const wire = JSON.stringify(out)
  const inputBound = Math.min(model.contextWindow, encoder.encode(wire).length + 4096 + out.messages.length * 24)
  return { wire, amountUnits: (inputBound + out.max_tokens) * model.unitsPerToken,
    billed: usage => (usage.prompt_tokens + usage.completion_tokens) * model.unitsPerToken }
}

function imageInput(input) {
  if (!object(input) || !ARK_IMAGE_MODELS.has(input.model) || !nonempty(input.prompt) || input.prompt.length > 16000 ||
      !['auto', '1024x1024', '1024x1536', '1536x1024'].includes(input.size)) throw Error('input')
  const refs = input.references ?? []
  if (!Array.isArray(refs) || refs.length > 4 || !refs.every(ref => typeof ref === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(ref))) throw Error('reference')
  const { units } = ARK_IMAGE_MODELS.get(input.model)
  const refUnits = input.model === 'doubao-seedream-5-0-pro' ? Math.max(0, refs.length - 1) * 6_600_000 : 0
  return { wire: JSON.stringify({ model: input.model, prompt: input.prompt + ({'1024x1024':'\n画面比例：1:1。','1024x1536':'\n画面比例：2:3。','1536x1024':'\n画面比例：3:2。'}[input.size] ?? ''),
    size: '1K', output_format: 'png', response_format: 'b64_json',
    // Seedream 5.0 Pro and Flash generate a single image by default.
    stream: false, watermark: true,
    ...(refs.length ? { image: refs.length === 1 ? refs[0] : refs } : {})
  }), amountUnits: units + refUnits }
}

const trustedUsage = usage => object(usage) && validCount(usage.prompt_tokens) && validCount(usage.completion_tokens) &&
  usage.total_tokens === usage.prompt_tokens + usage.completion_tokens

// Emit only successful protocol events. Do not relay upstream errors or headers.
function chatStream(body, settle, estimate) {
  let buffer = '', usage, done = false
  const decoder = new TextDecoder()
  async function drain(controller) {
    for (;;) {
      const next = buffer.indexOf('\n')
      if (next < 0) break
      const line = buffer.slice(0, next).trimEnd()
      buffer = buffer.slice(next + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (done) continue
      if (data === '[DONE]') {
        if (!usage) throw Error('Hosted AI ended without usage')
        await settle(estimate.billed(usage))
        done = true
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        continue
      }
      const frame = JSON.parse(data)
      if (!object(frame) || frame.error || !Array.isArray(frame.choices)) throw Error('Hosted AI stream failed')
      if (trustedUsage(frame.usage)) usage = frame.usage
      const event = { id: frame.id, object: 'chat.completion.chunk', created: frame.created, model: frame.model,
        choices: frame.choices.map(choice => ({ index: choice.index, delta: choice.delta, finish_reason: choice.finish_reason })),
        ...(trustedUsage(frame.usage) ? { usage: frame.usage } : {}) }
      controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'))
    }
    if (buffer.length > 2_000_000) throw Error('Hosted AI frame too large')
  }
  const interrupted = controller => {
    if (done) return
    done = true
    controller.enqueue(encoder.encode('data: ' + JSON.stringify({error:{message:'方舟输出中断，未自动重试。',type:'server_error',code:'HOSTED_AI_STREAM_INTERRUPTED'}}) + '\n\n'))
  }
  return body.pipeThrough(new TransformStream({
    async transform(chunk, controller) {
      if (done) return
      try { buffer += decoder.decode(chunk, { stream: true }); await drain(controller) }
      catch { interrupted(controller) }
    },
    async flush(controller) {
      if (done) return
      try { buffer += decoder.decode() + '\n'; await drain(controller) }
      finally { interrupted(controller) }
    }
  }))
}

export function createHostedAiHandler({ send = fetch, ledgerFor = db => new AiQuotaLedger(db) } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url)
    const action = url.pathname.slice(ROOT.length)
    if (url.search || !url.pathname.startsWith(ROOT) || !['catalog','quota','chat/completions','images','memory'].includes(action)) return fail('NOT_FOUND', 404)
    const readOnly = action === 'catalog' || action === 'quota'
    if (request.method !== (readOnly ? 'GET' : 'POST')) return fail('METHOD_NOT_ALLOWED', 405)
    try {
      const user = await authenticate(request, env)
      if (!user) return fail('LOGIN_REQUIRED', 401, '请先登录 EWork。')
      const allow = (env.ARK_AUTHORIZED_ACCOUNT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const active = env.ARK_HOSTED_MODE === 'authorized-agent-plan' && nonempty(env.ARK_AGENT_PLAN_KEY) && allow.includes(user.id)
      const ledger = ledgerFor(env.ACCOUNTS_DB)
      if (action === 'quota') {
        const { fiveHour, week, paused } = await ledger.user(user.id)
        return json({ quota: { fiveHour, week, paused, unit: 'AFP' } })
      }
      const memoryKey = allow.includes(user.id) && openVikingKey(env, user.id)
      if (action === 'catalog') {
        if ((!active && !memoryKey) || !(await ledger.user(user.id)).eligible) return json({ models: [], image: false })
        return json({ models: active ? ARK_TEXT_MODELS.map(({ unitsPerToken, ...model }) => model) : [],
          image: active && env.ARK_ENABLE_SEEDREAM === 'true', ...(memoryKey ? { memory: true } : {}) })
      }
      if (action === 'memory') {
        if (!memoryKey || !(await ledger.user(user.id)).eligible) return fail('HOSTED_AI_NOT_ENABLED', 403)
        if (!env.ARK_LIMITER || !(await env.ARK_LIMITER.limit({ key: 'memory:' + user.id })).success) return fail('HOSTED_AI_BUSY', 429)
        return json(await vikingMemory(send, request, memoryKey, user.id, await readJson(request, 8000), readJson))
      }
      const image = action === 'images'
      if (!active || image && env.ARK_ENABLE_SEEDREAM !== 'true') return fail('HOSTED_AI_NOT_ENABLED', 403, '当前账号未开通该云端能力。')
      if (!env.ARK_LIMITER || !(await env.ARK_LIMITER.limit({ key: user.id })).success) return fail('HOSTED_AI_BUSY', 429, '请求较多，请稍后重试。')
      let input
      try { input = (image ? imageInput : chatInput)(await readJson(request, image ? 12_000_000 : 2_000_000)) }
      catch { return fail('INVALID_REQUEST', 400, '方舟请求参数无效或超出大小限制。') }
      const requestId = request.headers.get('x-ework-request-id') || crypto.randomUUID()
      const key = { userId: user.id, requestId }
      const { duplicate } = await ledger.reserve({ ...key, amountUnits: input.amountUnits })
      if (duplicate) return fail('HOSTED_AI_DUPLICATE', 409, '请求已受理，请勿重复提交。')
      const settle = actualUnits => ledger.settle({ ...key, actualUnits })
      const response = await send(ARK_PLAN_BASE + (image ? '/images/generations' : '/chat/completions'), {
        method: 'POST', redirect: 'manual',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(image ? 240000 : 300000)]),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.ARK_AGENT_PLAN_KEY },
        body: input.wire
      })
      if (!response.ok) {
        await response.body?.cancel()
        // On a definitive validation/auth/rate-limit rejection no generation occurred.
        if ([400, 401, 403, 404, 422, 429].includes(response.status)) await settle(0)
        return fail('HOSTED_AI_UPSTREAM', response.status === 429 ? 429 : 502, '方舟暂时未能完成请求。')
      }
      if (!image) {
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return fail('HOSTED_AI_UPSTREAM', 502)
        return new Response(chatStream(response.body, settle, input), { headers: { ...headers, 'content-type': 'text/event-stream' } })
      }
      const result = await readJson(response, 14_000_000)
      const b64 = result?.data?.length === 1 ? result.data[0]?.b64_json : undefined
      if (typeof b64 !== 'string' || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(b64)) return fail('HOSTED_AI_UPSTREAM', 502)
      await settle(input.amountUnits)
      return json({ data: b64 })
    } catch (error) {
      if (error instanceof AiQuotaError) return fail(error.code, error.status, error.message)
      return fail('HOSTED_AI_UNAVAILABLE', 503, '云端 AI 暂时不可用。')
    }
  }
}
export default { fetch: createHostedAiHandler() }
