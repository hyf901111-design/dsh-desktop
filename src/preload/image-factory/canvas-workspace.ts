import type { CanvasImageType, CanvasScope, CanvasStorage, StoredCanvas, StoredImageLayer } from '../../shared/image-factory-canvas'
import { loadRaster } from './raster'
import type { ImageLayer, ImageScene } from './layers'

type RestoreStatus = 'idle' | 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Entry = {
  scope: CanvasScope; status: RestoreStatus; save: SaveStatus; epoch?: number; scene?: ImageScene
  reading?: Promise<void>; writing?: Promise<void>; assetId?: string; revision: number; retained: number; dirty?: boolean
}

const imageLayer = (scene?: ImageScene) => scene?.layers.find((layer): layer is ImageLayer => layer.kind === 'image')

export class CanvasWorkspace {
  private readonly entries = new Map<CanvasScope, Entry>()
  private readonly listeners = new Set<() => void>()
  private readonly adoptions = new Map<string, Promise<void>>()
  private scope: CanvasScope = null
  private disposed = false
  private current = { scope: null as CanvasScope, status: 'idle' as RestoreStatus, save: 'idle' as SaveStatus, scene: undefined as ImageScene | undefined }

  constructor(private readonly doc: Document, private readonly storage: CanvasStorage) {}

  getSnapshot = () => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  select(scope: CanvasScope) {
    const previous = this.scope
    if (previous !== scope && this.entries.get(previous)?.dirty) this.commit(previous)
    this.scope = scope
    // Continue showing the standalone canvas until the adopted session can display it.
    const keepDraftVisible = scope !== null && this.adoptions.has(scope) && this.current.scope === null && this.current.scene
    if (!keepDraftVisible) this.publish(scope)
    if (previous !== scope) this.evict(previous)
    void this.ready(scope).then(() => {
      if (this.current.scope !== scope) this.publish(scope)
    }).catch(() => {})
  }

  async ready(scope: CanvasScope): Promise<ImageScene | undefined> {
    if (scope !== null) await this.adoptions.get(scope)?.catch(() => {})
    if (this.disposed) throw Error('「图像」应用已关闭。')
    const entry = this.entry(scope)
    if (entry.status !== 'ready') {
      entry.reading ??= this.load(scope, entry)
      await entry.reading
    }
    return entry.scene
  }

  retain(scope: CanvasScope) {
    const entry = this.entry(scope)
    entry.retained++
    return () => { entry.retained--; this.evict(entry.scope) }
  }

  epoch(scope: CanvasScope) { return this.entries.get(scope)?.epoch }

  change(scope: CanvasScope, apply: (scene?: ImageScene) => ImageScene | undefined, persist = true) {
    const entry = this.entries.get(scope)
    if (this.disposed || entry?.status !== 'ready') return false
    const previous = entry.scene
    const next = apply(previous)
    if (!next || next === previous) return false
    const oldRaster = imageLayer(previous)?.raster
    if (oldRaster && oldRaster !== imageLayer(next)?.raster) URL.revokeObjectURL(oldRaster.url)
    entry.scene = next
    if (persist) this.save(scope, entry)
    else { entry.dirty = true; this.publish(scope) }
    return true
  }

  commit(scope: CanvasScope) {
    const entry = this.entries.get(scope)
    if (!this.disposed && entry?.status === 'ready' && entry.scene) this.save(scope, entry, entry.save === 'error')
  }

  adopt(sessionId: string) {
    const existing = this.adoptions.get(sessionId)
    if (existing) return existing
    const release = this.retain(null)
    const pending = this.moveDraft(sessionId).finally(() => { release(); this.adoptions.delete(sessionId) })
    this.adoptions.set(sessionId, pending)
    return pending
  }

  private async moveDraft(sessionId: string) {
    await this.ready(null)
    const draft = this.entry(null)
    if (draft.dirty || draft.save === 'error') this.commit(null)
    await draft.writing
    if (this.disposed || draft.save === 'error' || draft.epoch === undefined) throw Error('草稿画布未保存，请重试。')
    if (draft.scene && await this.storage.adopt(sessionId, draft.epoch)) {
      if (this.disposed) return
      const target = this.entries.get(sessionId)
      if (target) await target.reading?.catch(() => {})
      if (this.disposed) return
      this.drop(sessionId)
      draft.scope = sessionId
      this.entries.set(sessionId, draft)
      this.entries.delete(null)
      this.publish(this.scope)
      this.evict(sessionId)
    }
  }

  dispose() {
    this.disposed = true
    for (const scope of this.entries.keys()) this.drop(scope)
    this.listeners.clear()
  }

  private entry(scope: CanvasScope) {
    let entry = this.entries.get(scope)
    if (!entry) {
      entry = { scope, status: 'idle', save: 'idle', revision: 0, retained: 0 }
      this.entries.set(scope, entry)
    }
    return entry
  }

  private publish(scope: CanvasScope) {
    if (scope !== this.scope || this.disposed) return
    const { scene, status = 'idle', save = 'idle' } = this.entries.get(scope) ?? {}
    this.current = { scope, scene, status, save }
    for (const listener of this.listeners) listener()
  }

  private drop(scope: CanvasScope) {
    const raster = imageLayer(this.entries.get(scope)?.scene)?.raster
    if (raster) URL.revokeObjectURL(raster.url)
    this.entries.delete(scope)
  }

  private evict(scope: CanvasScope) {
    const entry = this.entries.get(scope)
    if (scope !== this.scope && entry && !entry.retained && !entry.reading && !entry.writing && entry.save !== 'error') this.drop(scope)
  }

  private async load(scope: CanvasScope, entry: Entry) {
    entry.status = 'loading'
    this.publish(scope)
    let restored: ImageLayer | undefined
    try {
      const data = await this.storage.read(scope)
      const storedImage = data.canvas?.layers.find((layer): layer is StoredImageLayer => layer.kind === 'image')
      if (storedImage && data.image) {
        const bytes = Uint8Array.from(data.image.data)
        const raster = await loadRaster(this.doc, new Blob([bytes], { type: storedImage.mediaType }))
        restored = { ...storedImage, raster, data: bytes }
      }
      if (this.disposed || this.entries.get(scope) !== entry) return
      if (storedImage && (!restored || restored.raster.width !== data.canvas?.width || restored.raster.height !== data.canvas.height))
        throw Error('保存的图片与画布尺寸不一致。')
      if (data.canvas) {
        const layers = data.canvas.layers.map(layer => layer.kind === 'image' ? restored! : layer)
        const { version: _version, ...canvas } = data.canvas
        entry.scene = { ...canvas, layers }
        entry.assetId = restored?.assetId
        restored = undefined
      }
      entry.epoch = data.epoch
      entry.status = 'ready'
      entry.save = entry.scene ? 'saved' : 'idle'
    } catch (error) {
      entry.status = 'error'
      throw error
    } finally {
      if (restored) URL.revokeObjectURL(restored.raster.url)
      entry.reading = undefined
      this.publish(scope)
      this.evict(scope)
    }
  }

  private save(scope: CanvasScope, entry: Entry, retry = false) {
    const scene = entry.scene
    if (!scene || entry.epoch === undefined) return
    const asset = imageLayer(scene)
    const image = asset && (retry || entry.save === 'error' || asset.assetId !== entry.assetId) ? asset.data : undefined
    const revision = ++entry.revision
    const canvas: StoredCanvas = {
      version: 1, id: scene.id, title: scene.title, width: scene.width, height: scene.height,
      ...(scene.aiWatermark && { aiWatermark: scene.aiWatermark }),
      layers: scene.layers.filter(layer => layer.kind !== 'text' || layer.text.trim()).map(layer => layer.kind === 'image' ? { kind: 'image', id: layer.id, assetId: layer.assetId, mediaType: layer.mediaType } : layer),
    }
    entry.assetId = asset?.assetId
    entry.dirty = false
    entry.save = 'saving'
    const settled = (status: SaveStatus) => {
      if (entry.revision !== revision) return
      entry.writing = undefined
      entry.save = status
      this.publish(scope)
      this.evict(scope)
    }
    entry.writing = this.storage.write({ scope, epoch: entry.epoch, canvas, image }).then(() => settled('saved'), () => settled('error'))
    this.publish(scope)
  }
}

export async function createImageLayer(doc: Document, blob: Blob, assetId: string, id: string, mediaType: CanvasImageType): Promise<ImageLayer> {
  const data = new Uint8Array(await blob.arrayBuffer())
  return { kind: 'image', id, assetId, mediaType, data, raster: await loadRaster(doc, blob) }
}
