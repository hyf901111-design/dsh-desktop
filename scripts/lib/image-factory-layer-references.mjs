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

export function readImageLayerReceipt(nodes, id) {
  function visit(call) {
    if ((call?.name ?? call?.call?.name) === 'image_edit_layer' && !call.isError) {
      for (const block of call.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (value.kind === 'odyssey-image-layer-edit' && value.id === id) return value.patch
        } catch {}
      }
    }
    for (const child of call?.subCalls ?? []) {
      const found = visit(child)
      if (found) return found
    }
  }
  for (const node of nodes) {
    if (node.kind !== 'tool-call') continue
    const found = visit(node.data?.root)
    if (found) return found
  }
}
