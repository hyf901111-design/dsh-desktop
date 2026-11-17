/** Versioned workspace context on an ordinary native user turn. */
export function readImageFactoryContext(text) {
  if (typeof text !== 'string') return
  const match = /\n<odyssey-image-workspace-v1>\n([^\n]{1,240000})\n<\/odyssey-image-workspace-v1>$/u.exec(text)
  if (!match) return
  try {
    const value = JSON.parse(match[1])
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.id) ||
        !['generate', 'edit', 'region', 'cutout', 'layer'].includes(value.operation) ||
        !['1024x1024', '1024x1536', '1536x1024'].includes(value.size) ||
        !Number.isInteger(value.width) || value.width < 1 || value.width > 4096 ||
        !Number.isInteger(value.height) || value.height < 1 || value.height > 4096 ||
        typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 100 ||
        typeof value.internalReference !== 'boolean' || value.operation === 'cutout' && !value.internalReference) return
    let targetLayer
    if (value.targetLayer !== undefined) {
      const { kind, label, description } = value.targetLayer ?? {}
      if (!['text', 'shape', 'brand', 'image'].includes(kind) || typeof label !== 'string' || !label.trim() ||
          label.length > 64 || typeof description !== 'string' || description.length > 1800 ||
          (kind === 'image' ? value.operation !== 'edit' || !value.internalReference : value.operation !== 'layer' || value.internalReference)) return
      targetLayer = { kind, label, description }
    }
    let targetLayers
    if (value.targetLayers !== undefined) {
      if (value.operation !== 'layer' || targetLayer || !Array.isArray(value.targetLayers) ||
          value.targetLayers.length < 1 || value.targetLayers.length > 100) return
      targetLayers = value.targetLayers.map((layer, index) => {
        const { key, kind, label, description } = layer ?? {}
        if (key !== index + 1 || !['text', 'shape', 'brand', 'image'].includes(kind) || typeof label !== 'string' ||
            !label.trim() || label.length > 64 || typeof description !== 'string' || description.length > 1800) throw Error('Invalid layer target')
        return { key, kind, label, description }
      })
      const images = targetLayers.filter(layer => layer.kind === 'image').length
      if (images > 1 || value.internalReference !== (images === 1)) return
    }
    if (value.operation === 'layer' && !targetLayer && !targetLayers) return
    let editBounds
    if (value.editBounds !== undefined) {
      if (value.operation !== 'region' || !value.internalReference || !value.editBounds) return
      const { left, top, right, bottom } = value.editBounds
      if (![left, top, right, bottom].every(edge => Number.isFinite(edge) && edge >= 0 && edge <= 1) ||
          left >= right || top >= bottom) return
      editBounds = { left, top, right, bottom }
    }
    return { id: value.id, operation: value.operation, size: value.size, width: value.width, height: value.height,
      title: value.title, internalReference: value.internalReference, ...(editBounds && { editBounds }), ...(targetLayer && { targetLayer }), ...(targetLayers && { targetLayers }), text: text.slice(0, match.index) }
  } catch { return }
}

export function stripImageFactoryContext(text) {
  return readImageFactoryContext(text)?.text ?? text
}

export function imageFactoryPrompt(text, context) {
  return stripImageFactoryContext(text) + '\n<odyssey-image-workspace-v1>\n' + JSON.stringify(context) + '\n</odyssey-image-workspace-v1>'
}
