import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  canvasFonts, canvasImageTypes, canvasUuid, maximumCanvasImageBytes, maximumCanvasLayers, validCanvasScope, validCanvasSize,
  type CanvasScope, type CanvasImageType, type CanvasRead, type CanvasWrite, type StoredCanvas, type StoredImageLayer,
  type ImageFactoryTaskTab,
} from '../../shared/image-factory-canvas'
import { atomicWrite } from '../integrations/store'

const metadataLimit = 320 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const validId = (value: unknown): value is string => typeof value === 'string' && canvasUuid.test(value)
const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const metadataName = 'canvas.json'
type Identity = { owner: string; generation: number }
const imageLayer = (canvas?: StoredCanvas) => canvas?.layers.find((layer): layer is StoredImageLayer => layer.kind === 'image')

function readTaskTabs(value: unknown): ImageFactoryTaskTab[] {
  if (!Array.isArray(value) || value.length > 32) throw Error('图片任务页签数据无效。')
  const seen = new Set<string>()
  return value.map(tab => {
    if (!tab || typeof tab.scope !== 'string' || !validCanvasScope(tab.scope) || seen.has(tab.scope) ||
        (tab.title !== undefined && (typeof tab.title !== 'string' || tab.title.length > 255)) ||
        (tab.pinned !== undefined && typeof tab.pinned !== 'boolean'))
      throw Error('图片任务页签数据无效。')
    seen.add(tab.scope)
    return { scope: tab.scope, ...(tab.title && { title: tab.title }), ...(tab.pinned && { pinned: true }) }
  })
}

function readMetadata(value: unknown): StoredCanvas {
  const canvas = value as StoredCanvas
  if (!canvas || canvas.version !== 1 || !validId(canvas.id) || typeof canvas.title !== 'string' ||
      !canvas.title.trim() || canvas.title.length > 255 || !validCanvasSize(canvas.width, canvas.height) ||
      !Array.isArray(canvas.layers) || canvas.layers.length > maximumCanvasLayers ||
      (canvas.aiWatermark !== undefined && canvas.aiWatermark !== true)) throw Error('画布数据无效。')
  const ids = new Set<string>()
  let images = 0
  const layers = canvas.layers.map(layer => {
    if (!layer || !validId(layer.id) || ids.has(layer.id)) throw Error('画布图层无效。')
    ids.add(layer.id)
    if (layer.kind === 'image' && ++images === 1 && validId(layer.assetId) && canvasImageTypes.includes(layer.mediaType))
      return { kind: layer.kind, id: layer.id, assetId: layer.assetId, mediaType: layer.mediaType }
    if (layer.kind !== 'text' || typeof layer.text !== 'string' || layer.text.length > 500 ||
        !Number.isFinite(layer.x) || !Number.isFinite(layer.y) || !unit(layer.width) || layer.width <= 0 ||
        !Number.isFinite(layer.fontSize) || layer.fontSize < 8 || layer.fontSize > 600 ||
        !canvasFonts.some(font => font.family === layer.family) || ![400, 500, 600, 700].includes(layer.weight) ||
        !['left', 'center', 'right'].includes(layer.align) || !/^#[a-fA-F0-9]{6}$/u.test(layer.color))
      throw Error('画布图层无效。')
    const { id, kind, text, x, y, width, fontSize, family, weight, align, color } = layer
    return { id, kind, text, x, y, width, fontSize, family, weight, align, color }
  })
  return { version: 1, id: canvas.id, title: canvas.title, width: canvas.width, height: canvas.height, layers,
    ...(canvas.aiWatermark && { aiWatermark: canvas.aiWatermark }),
  }
}

async function readBounded(path: string, limit: number) {
  const info = await lstat(path)
  if (!info.isFile() || info.size > limit) throw Error('画布文件无法读取。')
  return readFile(path)
}

function checkImage(data: Buffer, mediaType: CanvasImageType) {
  const png = data.subarray(0, 8).equals(pngSignature)
  const jpg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  const webp = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  if (data.byteLength < 24 || data.byteLength > maximumCanvasImageBytes ||
      !(mediaType === 'image/png' ? png : mediaType === 'image/jpeg' ? jpg : webp)) throw Error('画布原图格式无效。')
}

/** Account-local editable canvases. All updates and draft adoption are serialized for one account. */
export class ImageFactoryCanvases {
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly root: string, private readonly identity: () => Identity) {}

  private directory(owner: string, scope: CanvasScope) {
    if (!validCanvasScope(scope)) throw Error('画布会话无效。')
    const account = createHash('sha256').update(owner).digest('hex')
    const key = scope === null ? 'draft' : createHash('sha256').update(scope).digest('hex')
    return join(this.root, account, key)
  }

  private run<T>(action: (owner: string, epoch: number, current: () => void) => Promise<T>, epoch?: number) {
    const session = this.identity()
    const current = () => {
      const actual = this.identity()
      if (actual.owner !== session.owner || actual.generation !== session.generation ||
          (epoch !== undefined && epoch !== session.generation)) throw Error('账号已切换，请重新打开「图像」应用。')
    }
    const pending = (this.queues.get(session.owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
      current()
      return action(session.owner, session.generation, current)
    })
    this.queues.set(session.owner, pending)
    const clear = () => { if (this.queues.get(session.owner) === pending) this.queues.delete(session.owner) }
    void pending.then(clear, clear)
    return pending
  }

  private async readCanvas(directory: string) {
    try { return readMetadata(JSON.parse((await readBounded(join(directory, metadataName), metadataLimit)).toString('utf8'))) }
    catch (error) { if (!missing(error)) throw error }
  }

  read(scope: CanvasScope): Promise<CanvasRead> {
    return this.run(async (owner, epoch, current) => {
      const directory = this.directory(owner, scope)
      const canvas = await this.readCanvas(directory)
      const layer = imageLayer(canvas)
      let image
      if (layer) {
        const data = await readBounded(join(directory, 'image-' + layer.assetId), maximumCanvasImageBytes)
        checkImage(data, layer.mediaType)
        image = { data: new Uint8Array(data), mediaType: layer.mediaType }
      }
      current()
      return { epoch, canvas, image }
    })
  }

  readTabs() {
    return this.run(async (owner, epoch, current) => {
      let tabs: ImageFactoryTaskTab[] = []
      let closed: ImageFactoryTaskTab[] = []
      try {
        const file = join(dirname(this.directory(owner, null)), 'task-tabs.json')
        const stored = JSON.parse((await readBounded(file, 128 * 1024)).toString('utf8'))
        tabs = readTaskTabs(Array.isArray(stored) ? stored : stored?.tabs)
        if (!Array.isArray(stored)) closed = readTaskTabs(stored?.closed)
      } catch (error) { if (!missing(error)) throw error }
      current()
      return { epoch, tabs, ...(closed.length && { closed }) }
    })
  }

  async writeTabs(value: unknown) {
    const input = value as { epoch?: number; tabs?: unknown; closed?: unknown } | undefined
    if (!input || typeof input.epoch !== 'number' || !Number.isSafeInteger(input.epoch)) throw Error('图片任务页签数据无效。')
    const tabs = readTaskTabs(input.tabs)
    const closed = input.closed === undefined ? [] : readTaskTabs(input.closed)
    return this.run(async (owner, _epoch, current) => {
      const directory = dirname(this.directory(owner, null))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      current()
      await atomicWrite(join(directory, 'task-tabs.json'), JSON.stringify(closed.length ? { tabs, closed } : tabs))
    }, input.epoch)
  }

  async write(value: CanvasWrite) {
    if (!value || !Number.isSafeInteger(value.epoch) ||
        (value.image !== undefined && (!(value.image instanceof Uint8Array) || value.image.byteLength > maximumCanvasImageBytes)))
      throw Error('画布数据无效。')
    const canvas = readMetadata(value.canvas)
    const data = value.image === undefined ? undefined : Buffer.from(value.image)
    const layer = imageLayer(canvas)
    if (!layer && data) throw Error('缺少画布图片图层。')
    if (layer && data) checkImage(data, layer.mediaType)
    const metadata = JSON.stringify(canvas)
    if (Buffer.byteLength(metadata) > metadataLimit) throw Error('画布图层内容过长。')
    return this.run(async (owner, _epoch, current) => {
      const directory = this.directory(owner, value.scope)
      const file = join(directory, metadataName)
      const previous = imageLayer(await this.readCanvas(directory))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      if (layer && previous?.assetId !== layer.assetId && !data) throw Error('画布原图还没有保存。')
      if (layer && data && previous?.assetId !== layer.assetId) {
        current()
        await atomicWrite(join(directory, 'image-' + layer.assetId), data)
      }
      current()
      await atomicWrite(file, metadata)
      if (data || previous?.assetId !== layer?.assetId) {
        const files = await readdir(directory).catch(() => [])
        await Promise.all(files.filter(name => name.startsWith('image-') && validId(name.slice(6)) && name !== 'image-' + layer?.assetId)
          .map(name => rm(join(directory, name), { force: true }).catch(() => {})))
      }
    }, value.epoch)
  }

  /** The first prompt moves its standalone draft into the newly created conversation. */
  adopt(sessionId: string, epoch: number) {
    if (typeof sessionId !== 'string' || !Number.isSafeInteger(epoch)) return Promise.reject(Error('画布会话无效。'))
    return this.run(async (owner, _epoch, current) => {
      const from = this.directory(owner, null), to = this.directory(owner, sessionId)
      if (!await this.readCanvas(from)) return false
      if (await this.readCanvas(to)) return false
      await mkdir(dirname(to), { recursive: true, mode: 0o700 })
      current()
      await rename(from, to)
      return true
    }, epoch)
  }

  /** Roll back a copy only after its new session is confirmed absent. */
  discardStaged(sessionId: string, epoch: number) {
    return this.run(async (owner, _epoch, current) => {
      current()
      await rm(this.directory(owner, sessionId), { force: true, recursive: true })
    }, epoch)
  }

  drain() { return Promise.allSettled(this.queues.values()) }
}
