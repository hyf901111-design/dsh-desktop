export function readImageLayerReference(raw) {
  const value = JSON.parse(raw)
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
  if (!value || (value.scope !== null && (typeof value.scope !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(value.scope))) ||
      !uuid.test(value.sceneId) || !uuid.test(value.layerId) || typeof value.label !== 'string' ||
      !value.label.trim() || value.label.length > 64 || /[\p{Cc}]/u.test(value.label)) throw Error('图层引用无效。')
  return { scope: value.scope, sceneId: value.sceneId, layerId: value.layerId, label: value.label }
}

export function imageLayerReferenceCodec() {
  return {
    trigger: '@', name: 'image-factory-layer', order: 10007, candidates: async () => [], onPick: () => undefined,
    codec: {
      clipboardText: raw => { try { return readImageLayerReference(raw).label } catch { return '' } },
      serialize: async raw => '〔odyssey-layer:' + encodeURIComponent(JSON.stringify(readImageLayerReference(raw))) + '〕',
    },
  }
}

export function imageLayerReferenceParts(text) {
  return typeof text === 'string' ? [...text.matchAll(/〔odyssey-layer:([^〕\n]{1,2300})〕/gu)] : []
}

/** Assign stable turn-local numbers in draft order, preserving every occurrence. */
export function bindImageLayerReferences(content) {
  const references = new Map()
  let hasInstructions = false
  const parts = content.map(part => {
    if (part.type !== 'text') return part
    const matches = imageLayerReferenceParts(part.text)
    let cursor = 0, text = ''
    for (const match of matches) {
      const reference = readImageLayerReference(decodeURIComponent(match[1]))
      const id = JSON.stringify([reference.scope, reference.sceneId, reference.layerId])
      const target = references.get(id) ?? { ...reference, key: references.size + 1 }
      references.set(id, target)
      const before = part.text.slice(cursor, match.index)
      hasInstructions ||= !!before.trim()
      text += before + '〔图层 ' + target.key + '：' + target.label.replace(/[〔〕]/gu, '') + '〕'
      cursor = match.index + match[0].length
    }
    const remaining = part.text.slice(cursor)
    hasInstructions ||= !!remaining.trim()
    return { ...part, text: text + remaining }
  })
  return { parts, layers: [...references.values()], hasInstructions }
}

export function readImageLayerReceipts(nodes, id) {
  const edits = new Map()
  function visit(call) {
    if ((call?.name ?? call?.call?.name) === 'image_edit_layer' && !call.isError) {
      for (const block of call.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (value.kind === 'odyssey-image-layer-edit' && value.id === id && value.patch && typeof value.patch === 'object')
            edits.set(value.target ?? 1, { ...edits.get(value.target ?? 1), ...value.patch })
        } catch {}
      }
    }
    for (const child of call?.subCalls ?? []) visit(child)
  }
  for (const node of nodes) if (node.kind === 'tool-call') visit(node.data?.root)
  return edits
}
