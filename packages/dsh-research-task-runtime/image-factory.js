import { timingSafeEqual } from 'node:crypto'
import { createOpenAIImageProvider, ImageGenerationError, validateGeneratedImage } from './image-generation-provider.js'

const path = '/sherlock/image-factory/generate'
const inputLimit = 8 * 1024 * 1024
const outputLimit = 20 * 1024 * 1024
const sizes = new Set(['1024x1024', '1024x1536', '1536x1024'])
const mediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

function authorized(req, token, isTrustedRequest) {
  if (!token || req.method !== 'POST' || !isTrustedRequest(req) ||
      (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)) return false
  const actual = Buffer.from(String(req.headers.authorization ?? ''))
  const expected = Buffer.from('Bearer ' + token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function imageFactoryInput(value) {
  const prompt = typeof value?.prompt === 'string' ? value.prompt.trim() : ''
  if (!prompt || prompt.length > 4000 || !sizes.has(value.size) ||
      typeof value.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.requestId)) {
    throw new ImageGenerationError('请输入有效的图片描述并选择画布比例。')
  }
  const references = []
  if (value.reference !== undefined) {
    const { data, mediaType } = value.reference ?? {}
    if (!mediaTypes.has(mediaType) || typeof data !== 'string' || !data || data.length % 4 ||
        data.length > Math.ceil(inputLimit / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new ImageGenerationError('参考图无效或过大。')
    }
    const bytes = Buffer.from(data, 'base64')
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    if (bytes.length < 24 || bytes.length > inputLimit || !(mediaType === 'image/png' ? png : mediaType === 'image/jpeg' ? jpeg : webp)) {
      throw new ImageGenerationError('参考图格式与图片内容不匹配。')
    }
    references.push({ data: bytes, mediaType })
  }
  return { prompt, size: value.size, requestId: value.requestId, references }
}

/** Workspace prompts use the same account catalog and image providers as conversation generation. */
export function registerImageFactory(ctx, { hosted, isTrustedRequest, token = process.env.SHERLOCK_IMAGE_FACTORY_TOKEN, local = createOpenAIImageProvider(ctx) }) {
  let active
  const unregister = ctx.webServer.register({ kind: 'exact', path, handler: async (req, res) => {
    const send = (code, body) => {
      if (!res.destroyed && !res.writableEnded) res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
    }
    if (!authorized(req, token, isTrustedRequest)) return send(403, { error: '图片工作区请求未授权。' })
    if (active) return send(409, { error: '请等待当前图片任务完成。' })
    const controller = new AbortController()
    active = controller
    const disconnect = () => controller.abort()
    res.once('close', disconnect)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)])
    try {
      const limit = Math.ceil(inputLimit / 3) * 4 + 32 * 1024
      if (Number(req.headers['content-length']) > limit) throw new ImageGenerationError('参考图过大。')
      let length = 0
      const chunks = []
      for await (const chunk of req) {
        length += chunk.length
        if (length > limit) throw new ImageGenerationError('参考图过大。')
        chunks.push(chunk)
      }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new ImageGenerationError('图片请求无法解析。') }
      const input = imageFactoryInput(body)
      await hosted?.ready?.()
      signal.throwIfAborted()
      const provider = hosted?.available() ? hosted : local
      if (provider === local && hosted?.unavailable?.()) throw new ImageGenerationError('套餐生图服务暂时不可用，请稍后重试。')
      const generate = provider.capture?.() ?? provider.generate.bind(provider)
      const result = await generate({ ...input, model: provider.models[0].id, quality: 'auto', background: 'auto' }, {
        signal, maxBytes: outputLimit, requestId: input.requestId, assertCurrent: () => signal.throwIfAborted(),
      })
      signal.throwIfAborted()
      const bytes = validateGeneratedImage(result.data, outputLimit)
      send(200, { data: Buffer.from(bytes).toString('base64') })
    } catch (error) {
      const message = signal.aborted
        ? signal.reason?.name === 'TimeoutError' ? '图像请求超时，请手动重试。' : '图像请求已取消。'
        : error instanceof ImageGenerationError ? error.message : '图像服务连接失败，请检查网络后重试。'
      send(422, { error: message })
    } finally {
      res.off('close', disconnect)
      active = undefined
    }
  } })
  return () => { unregister(); active?.abort() }
}
