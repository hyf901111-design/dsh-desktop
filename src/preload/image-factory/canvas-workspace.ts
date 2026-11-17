import type { CanvasImageType, CanvasScope, CanvasStorage, StoredCanvas, StoredImageLayer } from '../../shared/image-factory-canvas'
import { loadRaster, type Raster } from './raster'
import type { ImageLayer, ImageScene } from './layers'

type RestoreStatus = 'idle' | 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Entry = {
  scope: CanvasScope; status: RestoreStatus; save: SaveStatus; epoch?: number; scene?: ImageScene
  reading?: Promise<void>; writing?: Promise<void>; assetId?: string; revision: number; retained: number; dirty?: boolean
  past: ImageScene[]; future: ImageScene[]; beforeEdit?: ImageScene; coalescing?: string; rasters: Set<Raster>
}

const historyLimit = 50
const cachedHistories = 6
const rasterHistoryLimit = 3
const sameScene = (a: ImageScene, b: ImageScene) => a === b ||
  a.id === b.id && a.title === b.title && a.width === b.width && a.height === b.height && a.aiWatermark === b.aiWatermark &&
  a.layers.length === b.layers.length && a.layers.every((layer, index) => layer === b.layers[index])

const imageLayer = (scene?: ImageScene) => scene?.layers.find((layer): layer is ImageLayer => layer.kind === 'image')

export class CanvasWorkspace {
  private readonly entries = new Map<CanvasScope, Entry>()
  private readonly listeners = new Set<() => void>()
  private readonly adoptions = new Map<string, Promise<void>>()
  private scope: CanvasScope = null
  private disposed = false
  private current = { scope: null as CanvasScope, status: 'idle' as RestoreStatus, save: 'idle' as SaveStatus, scene: undefined as ImageScene | undefined, canUndo: false, canRedo: false }

  constructor(private readonly doc: Document, private readonly storage: CanvasStorage) {}

  getSnapshot = () => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  select(scope: CanvasScope) {
    const previous = this.scope
    if (previous !== scope) {
      if (this.entries.get(previous)?.dirty) this.commit(previous)
      this.finishEdit(previous)
    }
    this.scope = scope
    const selected = this.entries.get(scope)
    if (selected) {
      // Keep the most recently selected canvases at the end of the cache.
      this.entries.delete(scope)
      this.entries.set(scope, selected)
    }
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

  change(scope: CanvasScope, apply: (scene?: ImageScene) => ImageScene | undefined, persist = true, editKey?: string) {
    const entry = this.entries.get(scope)
    if (this.disposed || entry?.status !== 'ready') return false
    const previous = entry.scene
    const next = apply(previous)
    if (!next || next === previous || previous && sameScene(previous, next)) {
      if (persist && entry.dirty) this.commit(scope)
      return false
    }
    if (!editKey || editKey !== entry.coalescing) entry.beforeEdit ??= previous
    entry.scene = next
    if (persist) {
      this.recordEdit(entry, editKey)
      this.save(scope, entry)
    } else {
      entry.dirty = true
      this.collectRasters(entry)
      this.publish(scope)
    }
    return true
  }

  commit(scope: CanvasScope) {
    const entry = this.entries.get(scope)
    if (!this.disposed && entry?.status === 'ready' && entry.scene) {
      if (entry.dirty) this.recordEdit(entry)
      this.save(scope, entry, entry.save === 'error')
    }
  }

  finishEdit(scope: CanvasScope) {
    const entry = this.entries.get(scope)
    if (!entry?.coalescing) return
    entry.coalescing = undefined
    const previous = entry.past.at(-1)
    if (previous && entry.scene && sameScene(previous, entry.scene)) entry.past.pop()
    this.collectRasters(entry)
    this.publish(scope)
  }

  undo(scope: CanvasScope) { return this.restore(scope, 'past', 'future') }
  redo(scope: CanvasScope) { return this.restore(scope, 'future', 'past') }

  private restore(scope: CanvasScope, from: 'past' | 'future', to: 'past' | 'future') {
    const entry = this.entries.get(scope)
    if (this.disposed || entry?.status !== 'ready' || !entry.scene) return false
    if (entry.dirty) this.recordEdit(entry)
    this.finishEdit(scope)
    const next = entry[from].pop()
    if (!next) return false
    entry[to].push(entry.scene)
    entry.scene = next
    this.collectRasters(entry)
    this.save(scope, entry)
    return true
  }

  private recordEdit(entry: Entry, editKey?: string) {
    const previous = entry.beforeEdit
    entry.beforeEdit = undefined
    if (previous && entry.scene && !sameScene(previous, entry.scene)) {
      entry.past.push(previous)
      entry.future = []
      entry.past = entry.past.slice(-historyLimit)
      const rasters = new Set([imageLayer(entry.scene)?.raster])
      for (let index = entry.past.length - 1; index >= 0; index--) {
        const raster = imageLayer(entry.past[index])?.raster
        if (!raster) continue
        rasters.add(raster)
        if (rasters.size > rasterHistoryLimit) {
          entry.past = entry.past.slice(index + 1)
          break
        }
      }
    }
    entry.coalescing = editKey
    this.collectRasters(entry)
  }

  private collectRasters(entry: Entry) {
    const references = new Set<Raster>()
    for (const scene of [entry.scene, entry.beforeEdit, ...entry.past, ...entry.future]) {
      const raster = imageLayer(scene)?.raster
      if (raster) references.add(raster)
    }
    for (const raster of entry.rasters) if (!references.has(raster)) URL.revokeObjectURL(raster.url)
    entry.rasters = references
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
      entry = { scope, status: 'idle', save: 'idle', revision: 0, retained: 0, past: [], future: [], rasters: new Set() }
      this.entries.set(scope, entry)
    }
    return entry
  }

  private publish(scope: CanvasScope) {
    if (scope !== this.scope || this.disposed) return
    const { scene, status = 'idle', save = 'idle', past, future, beforeEdit } = this.entries.get(scope) ?? {}
    this.current = { scope, scene, status, save, canUndo: !!(past?.length || beforeEdit), canRedo: !!future?.length && !beforeEdit }
    for (const listener of this.listeners) listener()
  }

  private drop(scope: CanvasScope) {
    for (const raster of this.entries.get(scope)?.rasters ?? []) URL.revokeObjectURL(raster.url)
    this.entries.delete(scope)
  }

  private evict(scope: CanvasScope) {
    const entry = this.entries.get(scope)
    if (scope === this.scope || !entry || entry.retained || entry.reading || entry.writing || entry.save === 'error') return
    if (!entry.past.length && !entry.future.length) { this.drop(scope); return }
    const inactive = [...this.entries.values()].filter(item => item.scope !== this.scope &&
      !item.retained && !item.reading && !item.writing && item.save !== 'error')
    for (const item of inactive.slice(0, Math.max(0, inactive.length - cachedHistories))) this.drop(item.scope)
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
        this.collectRasters(entry)
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
