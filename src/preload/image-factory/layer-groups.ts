import type { CanvasLayer } from './layers'

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
  // Use one delta for the whole selection so members retain their spacing.
  const overlays = layers.filter(layer => layer.kind !== 'text')
  for (const layer of overlays) {
    dx = Math.max(-layer.x, Math.min(1 - layer.x - layer.width, dx))
    dy = Math.max(-layer.y, Math.min(1 - layer.y - layer.height, dy))
  }
  return layers.map(layer => dx || dy ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer)
}

export function removeLayerUnits(layers: CanvasLayer[], ids: readonly string[]) {
  const remaining = layers.filter(layer => !ids.includes(layer.id) && !ids.includes(layerUnitId(layer)))
  const sizes = new Map<string, number>()
  for (const layer of remaining) if (isEditableLayer(layer) && layer.groupId)
    sizes.set(layer.groupId, (sizes.get(layer.groupId) ?? 0) + 1)
  return ungroupLayers(remaining, [...sizes].filter(([, size]) => size === 1).map(([id]) => id))
}
