import type { CanvasLayer, ImageScene } from './layers'
import { containedRasterBounds, type Point, type Region, type Size } from './raster'

export type EditableLayer = Exclude<CanvasLayer, { kind: 'image' }>

export const isEditableLayer = (layer: CanvasLayer): layer is EditableLayer => layer.kind !== 'image'
export const layerUnitId = (layer: CanvasLayer) => isEditableLayer(layer) ? layer.groupId ?? layer.id : layer.id

export function groupLayers(layers: CanvasLayer[], selection: readonly string[], groupId: string) {
  const selected = layers.filter(layer => isEditableLayer(layer) && (selection.includes(layerUnitId(layer)) || selection.includes(layer.id)))
  if (selected.length < 2) return layers
  const ids = new Set(selected.map(layer => layer.id))
  const grouped = selected.map(layer => ({ ...layer, groupId }))
  const top = selected.at(-1)
  return layers.flatMap(layer => layer === top ? grouped : ids.has(layer.id) ? [] : [layer])
}

export function ungroupLayers(layers: CanvasLayer[], selection: readonly string[]) {
  return layers.map(layer => {
    if (!isEditableLayer(layer) || !layer.groupId || !selection.includes(layer.groupId)) return layer
    const { groupId: _group, ...editable } = layer
    return editable
  })
}

export function moveLayerUnits(layers: CanvasLayer[], id: string, targetId: string, above: boolean) {
  const source = layers.find(layer => layer.id === id || layerUnitId(layer) === id)
  const target = layers.find(layer => layer.id === targetId || layerUnitId(layer) === targetId)
  if (!source || !target) return layers
  const unit = layerUnitId(source)
  const targetUnit = layerUnitId(target)
  if (unit === targetUnit) return layers
  const moving = layers.filter(layer => layerUnitId(layer) === unit)
  const remaining = layers.filter(layer => layerUnitId(layer) !== unit)
  const remainingUnits = remaining.map(layerUnitId)
  const index = above ? remainingUnits.lastIndexOf(targetUnit) + 1 : remainingUnits.indexOf(targetUnit)
  remaining.splice(index, 0, ...moving)
  return remaining.every((layer, index) => layers[index] === layer) ? layers : remaining
}

export function translateLayers(layers: EditableLayer[], dx: number, dy: number) {
  return layers.map(layer => dx || dy ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer)
}

export function duplicateLayers(layers: EditableLayer[]) {
  const counts = new Map<string, number>()
  for (const { groupId } of layers) if (groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + 1)
  const groups = new Map<string, string>()
  return layers.map(({ groupId, ...layer }) => {
    if (!groupId || counts.get(groupId) === 1) return { ...layer, id: crypto.randomUUID() }
    const id = groups.get(groupId) ?? crypto.randomUUID()
    groups.set(groupId, id)
    return { ...layer, id: crypto.randomUUID(), groupId: id }
  })
}

export function transformLayers(layers: EditableLayer[], source: Size, target: Size, scale: number, offset: Point) {
  return layers.map(layer => {
    const position = {
      x: (layer.x * source.width * scale + offset.x) / target.width,
      y: (layer.y * source.height * scale + offset.y) / target.height,
      width: layer.width * source.width * scale / target.width,
    }
    return layer.kind === 'text'
      ? { ...layer, ...position, fontSize: Math.min(600, Math.max(8, layer.fontSize * scale)) }
      : { ...layer, ...position, height: layer.height * source.height * scale / target.height }
  })
}

export function scaleGroup(layers: EditableLayer[], canvas: Size, bounds: Region, handle: string, dx: number, dy: number) {
  const { x, y, width, height } = bounds
  const west = handle.endsWith('w'), north = handle.startsWith('n')
  const horizontal = west ? -dx : dx, vertical = north ? -dy : dy
  const requested = 1 + (width * horizontal + height * vertical) / (width ** 2 + height ** 2)
  const text = layers.filter(layer => layer.kind === 'text')
  const min = Math.min(1, Math.max(8 / Math.max(width, height), ...text.map(layer => 8 / layer.fontSize)))
  const max = Math.min(...text.map(layer => 600 / layer.fontSize))
  const scale = Math.min(max, Math.max(min, requested))
  return transformLayers(layers, canvas, canvas, scale, {
    x: (x + (west ? width : 0)) * (1 - scale),
    y: (y + (north ? height : 0)) * (1 - scale),
  })
}

export function resizeCanvas(scene: ImageScene, target: Size): ImageScene {
  if (scene.width === target.width && scene.height === target.height) return scene
  const image = scene.layers.find(layer => layer.kind === 'image')
  // The original raster is stable across ratio changes, so switching back
  // restores the same picture placement without resampling the source.
  const artSize = image?.raster ?? scene
  const before = containedRasterBounds(artSize, scene)
  const after = image ? containedRasterBounds(artSize, target)
    : { x: (target.width - scene.width) / 2, y: (target.height - scene.height) / 2, width: scene.width }
  const scale = after.width / before.width
  const offset = { x: after.x - before.x * scale, y: after.y - before.y * scale }
  const resized = new Map(transformLayers(scene.layers.filter(isEditableLayer), scene, target, scale, offset).map(layer => [layer.id, layer]))
  return { ...scene, width: target.width, height: target.height, layers: scene.layers.map(layer => resized.get(layer.id) ?? layer) }
}

export function removeLayerUnits(layers: CanvasLayer[], ids: readonly string[]) {
  const remaining = layers.filter(layer => !ids.includes(layer.id) && !ids.includes(layerUnitId(layer)))
  const sizes = new Map<string, number>()
  for (const layer of remaining) if (isEditableLayer(layer) && layer.groupId)
    sizes.set(layer.groupId, (sizes.get(layer.groupId) ?? 0) + 1)
  return ungroupLayers(remaining, [...sizes].filter(([, size]) => size === 1).map(([id]) => id))
}
