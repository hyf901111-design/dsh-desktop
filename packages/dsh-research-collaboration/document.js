import { portableReferences, assertPortableHistoryText } from './context.js'
import * as Y from 'yjs'
import { LIMITS } from './protocol.js'
const collections = ['files', 'artifacts']
const nodeFields = new Set(
  'sizeMode aspectRatio source mediaType contentType previewEligible stackOrder rotation scale messageId titleMode sourceText containerPrompt containerSpec refreshMinutes refreshScheduleId refreshError lastSuccessfulAt generationStatus generationSources generationDetail generationError generationStartedAt generationCompletedAt creationMode workbenchId workbenchIndex workbenchRevealAt workbenchColumns workbenchSpan workbenchLayoutVersion containerSizePreset id kind title excerpt text content html data config chart table rows columns series options x y width height zIndex order parentId groupId sourceNodeIds assetId assetVersion name displayName mimeType size sourceUrl url capturedAt status version color style layout collapsed format language description citation citations references createdAt updatedAt'.split(
    ' '
  )
)
nodeFields.add('preserveGenerationSize')
const textFields = new Set([
  'title',
  'excerpt',
  'text',
  'content',
  'description',
  'sourceText',
  'containerPrompt'
])
const forbidden =
  /^(?:__proto__|prototype|constructor|path|filePath|localPath|sourceSessionId|sessionId|token|accessToken|apiKey|password|authorization|authorizationId|toolAuthorization|credentials|harness|logs|rawLogs|tasks|role|members|sharingEpoch|selected|viewport|captureId|snapshotId|generationTaskId|generationChildSessionId|generationLastSeq|leaseToken|executorId)$/i
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function safe(value, depth = 0, strip = false) {
  if (depth > 20) throw Error('INVALID_DOCUMENT')
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('INVALID_DOCUMENT')
    return value
  }
  if (typeof value === 'string') {
    if (
      /^(?:file:\/\/|[A-Za-z]:\\|\/(?:Users|home|private|tmp)\/)/.test(value)
    ) {
      if (strip) return ''
      throw Error('PRIVATE_PATH')
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v) => safe(v, depth + 1, strip))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (forbidden.test(k)) {
        if (strip) continue
        throw Error('FORBIDDEN_FIELD')
      }
      out[k] = safe(v, depth + 1, strip)
    }
    return out
  }
  throw Error('INVALID_DOCUMENT')
}
function cleanNode(node) {
  const out = {}
  for (const [k, v] of Object.entries(node))
    // IPC preserves explicit undefined on optional renderer fields; portable
    // snapshots are JSON documents, so omitted fields have no representation.
    if (v !== undefined && nodeFields.has(k) && !forbidden.test(k)) out[k] = safe(v, 0, true)
  if (
    ['pending', 'running', 'queued', 'generating'].includes(
      out.generationStatus
    )
  ) {
    out.generationStatus = 'interrupted'
    out.generationError = '复制时未完成'
  }
  return out
}
export function validateCanvas(canvas) {
  if (!canvas || Object.keys(canvas).some((k) => !collections.includes(k)))
    throw Error('INVALID_DOCUMENT')
  let count = 0
  for (const c of collections) {
    if (!Array.isArray(canvas[c])) throw Error('INVALID_DOCUMENT')
    const ids = new Set()
    for (const node of canvas[c]) {
      count++
      if (
        !node ||
        typeof node.id !== 'string' ||
        !/^[-\w:.]{1,128}$/.test(node.id) ||
        ids.has(node.id) ||
        Object.keys(node).some((k) => !nodeFields.has(k))
      )
        throw Error('INVALID_NODE')
      ids.add(node.id)
      safe(node)
    }
  }
  if (
    count > LIMITS.nodes ||
    Buffer.byteLength(JSON.stringify(canvas)) > LIMITS.documentBytes
  )
    throw Error('DOCUMENT_TOO_LARGE')
}
function shared(value, key) {
  if (typeof value === 'string' && textFields.has(key)) {
    const t = new Y.Text()
    t.insert(0, value)
    return t
  }
  if (Array.isArray(value)) {
    const a = new Y.Array()
    a.push(value.map((v) => shared(v, '')))
    return a
  }
  if (value && typeof value === 'object') {
    const m = new Y.Map()
    for (const [k, v] of Object.entries(value)) m.set(k, shared(v, k))
    return m
  }
  return value
}
function patchText(t, before, after) {
  let prefix = 0
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++
  const remove = before.length - prefix - suffix
  if (remove) t.delete(prefix, remove)
  const insert = after.slice(prefix, after.length - suffix)
  if (insert) t.insert(prefix, insert)
}
function patchArray(array, before, after) {
  // Keep integrated child arrays/maps in place: replacing a Y.Array loses cell edits.
  if (before.length !== after.length) {
    let prefix = 0
    while (
      prefix < before.length &&
      prefix < after.length &&
      equal(before[prefix], after[prefix])
    )
      prefix++
    let suffix = 0
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      equal(
        before[before.length - 1 - suffix],
        after[after.length - 1 - suffix]
      )
    )
      suffix++
    const remove = before.length - prefix - suffix
    if (remove) array.delete(prefix, remove)
    const insert = after.slice(prefix, after.length - suffix)
    if (insert.length)
      array.insert(
        prefix,
        insert.map((v) => shared(v, ''))
      )
    return
  }
  for (let index = 0; index < after.length; index++) {
    if (equal(before[index], after[index])) continue
    const current = array.get(index),
      value = after[index],
      old = before[index]
    if (
      current instanceof Y.Array &&
      Array.isArray(value) &&
      Array.isArray(old)
    )
      patchArray(current, old, value)
    else if (
      current instanceof Y.Map &&
      value &&
      old &&
      typeof value === 'object' &&
      typeof old === 'object' &&
      !Array.isArray(value)
    )
      patchMap(current, old, value)
    else {
      array.delete(index, 1)
      array.insert(index, [shared(value, '')])
    }
  }
}
function patchMap(map, before, after) {
  for (const key of Object.keys(before)) if (!(key in after)) map.delete(key)
  for (const [key, value] of Object.entries(after)) {
    if (equal(before[key], value)) continue
    const current = map.get(key)
    if (
      current instanceof Y.Text &&
      typeof value === 'string' &&
      typeof before[key] === 'string'
    )
      patchText(current, before[key], value)
    else if (
      current instanceof Y.Array &&
      Array.isArray(value) &&
      Array.isArray(before[key])
    )
      patchArray(current, before[key], value)
    else if (
      current instanceof Y.Map &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      before[key] &&
      typeof before[key] === 'object'
    )
      patchMap(current, before[key], value)
    else map.set(key, shared(value, key))
  }
}
export function createDocument(canvas = { files: [], artifacts: [] }) {
  validateCanvas(canvas)
  const doc = new Y.Doc()
  applyCanvasDiff(doc, { files: [], artifacts: [] }, canvas)
  return doc
}
export const encodeDocument = (doc) => Y.encodeStateAsUpdate(doc)
export function decodeDocument(bytes) {
  const doc = new Y.Doc()
  for (const c of collections) doc.getMap(c)
  Y.applyUpdate(doc, bytes)
  return doc
}
export function projectDocument(doc) {
  return Object.fromEntries(
    collections.map((c) => [
      c,
      [...doc.getMap(c).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v.toJSON())
    ])
  )
}
export function applyCanvasDiff(doc, before, after) {
  validateCanvas(after)
  const vector = Y.encodeStateVector(doc)
  doc.transact(() => {
    for (const c of collections) {
      const map = doc.getMap(c),
        old = new Map(before[c].map((n) => [n.id, n])),
        next = new Map(after[c].map((n) => [n.id, n]))
      for (const id of old.keys()) if (!next.has(id)) map.delete(id)
      for (const [id, node] of next) {
        if (!old.has(id)) map.set(id, shared(node, ''))
        else if (map.has(id)) patchMap(map.get(id), old.get(id), node)
      }
    }
  })
  return Y.encodeStateAsUpdate(doc, vector)
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
export function freezeSnapshot(input) {
  const canvas = Object.fromEntries(
    collections.map((c) => [c, (input.canvas?.[c] ?? []).map(cleanNode)])
  )
  validateCanvas(canvas)
  const history = (input.history ?? []).map((m, i) => ({
    id: String(m.id ?? `history-${i}`),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: assertPortableHistoryText(String(m.text ?? '')),
    ...(m.references ? { references: portableReferences(m.references) } : {}),
    ...(typeof m.authorName === 'string' ? { authorName: m.authorName } : {}),
    ...(typeof m.createdAt === 'number' ? { createdAt: m.createdAt } : {})
  }))
  if (
    history.length > LIMITS.history ||
    history.some((m) => Buffer.byteLength(m.text) > LIMITS.messageBytes)
  )
    throw Error('HISTORY_TOO_LARGE')
  return freeze({ canvas, history })
}
function validateSharedStructure(doc) {
  const seen = new Set()
  function visit(value, depth = 0) {
    if (depth > 20) throw Error('INVALID_DOCUMENT')
    if (value instanceof Y.AbstractType) {
      if (seen.has(value)) return
      seen.add(value)
      if (value.constructor === Y.Map) {
        for (const [key, child] of value) {
          if (forbidden.test(key)) throw Error('FORBIDDEN_FIELD')
          visit(child, depth + 1)
        }
      } else if (value.constructor === Y.Array) {
        for (const child of value.toArray()) visit(child, depth + 1)
      } else if (value.constructor === Y.Text) {
        if (Object.keys(value.getAttributes()).length)
          throw Error('FORBIDDEN_TEXT_ATTRIBUTES')
        for (const delta of value.toDelta())
          if (
            typeof delta.insert !== 'string' ||
            Object.keys(delta.attributes ?? {}).length
          )
            throw Error('FORBIDDEN_TEXT_FORMAT_OR_EMBED')
        safe(value.toString(), depth)
      } else throw Error('FORBIDDEN_SHARED_TYPE')
    } else safe(value, depth)
  }
  for (const name of collections) {
    const root = doc.getMap(name)
    for (const node of root.values()) visit(node)
  }
  // toDelta/toJSON omit formatting that was subsequently cleared and historical
  // map values. Inspect every retained struct that encodeStateAsUpdate will send.
  // Plain-text collaboration never needs format/embed/binary/subdocument structs.
  for (const structs of doc.store.clients.values())
    for (const struct of structs) {
      if (struct instanceof Y.GC) continue
      if (!(struct instanceof Y.Item)) throw Error('FORBIDDEN_SHARED_STRUCT')
      const content = struct.content
      if (
        content instanceof Y.ContentFormat ||
        content instanceof Y.ContentEmbed ||
        content instanceof Y.ContentBinary ||
        content instanceof Y.ContentDoc
      )
        throw Error('FORBIDDEN_ENCODED_CONTENT')
      if (
        struct.parentSub !== null &&
        forbidden.test(struct.parentSub) &&
        !collections.some((name) => struct.parent === doc.getMap(name))
      )
        throw Error('FORBIDDEN_FIELD')
      if (content instanceof Y.ContentType) visit(content.type)
      else if (
        content instanceof Y.ContentAny ||
        content instanceof Y.ContentJSON
      )
        for (const value of content.getContent()) safe(value)
      else if (content instanceof Y.ContentString) safe(content.str)
      else if (!(content instanceof Y.ContentDeleted))
        throw Error('FORBIDDEN_ENCODED_CONTENT')
    }
}
export function mergeDocumentUpdate(doc, bytes, tombstones = new Set()) {
  if (bytes.length > LIMITS.updateBytes) throw Error('UPDATE_TOO_LARGE')
  // Inspect incoming history before Yjs GC can discard cleared formatting.
  // Reject it rather than accepting an update with private embedded metadata.
  let incoming
  try {
    incoming = Y.decodeUpdate(bytes)
  } catch {
    throw Error('INVALID_DOCUMENT')
  }
  for (const struct of incoming.structs) {
    const content = struct.content
    if (
      content instanceof Y.ContentFormat ||
      content instanceof Y.ContentEmbed ||
      content instanceof Y.ContentBinary ||
      content instanceof Y.ContentDoc
    )
      throw Error('FORBIDDEN_ENCODED_CONTENT')
    if (
      content instanceof Y.ContentType &&
      ![Y.Map, Y.Array, Y.Text].includes(content.type.constructor)
    )
      throw Error('FORBIDDEN_SHARED_TYPE')
  }
  const candidate = decodeDocument(encodeDocument(doc))
  Y.applyUpdate(candidate, bytes)
  if ([...candidate.share.keys()].some((k) => !collections.includes(k)))
    throw Error('FORBIDDEN_FIELD')
  // Unresolved Yjs structs could hide forbidden fields until a later update; reject them.
  if (candidate.store.pendingStructs || candidate.store.pendingDs)
    throw Error('INCOMPLETE_UPDATE')
  for (const c of collections) {
    for (const [id, node] of candidate.getMap(c)) {
      if (!(node instanceof Y.Map) || node.get('id') !== id)
        throw Error('INVALID_NODE')
    }
  }
  validateSharedStructure(candidate)
  for (const key of tombstones) {
    const colon = key.indexOf(':')
    candidate.getMap(key.slice(0, colon)).delete(key.slice(colon + 1))
  }
  validateCanvas(projectDocument(candidate))
  const encoded = encodeDocument(candidate)
  if (encoded.length > LIMITS.documentBytes) throw Error('DOCUMENT_TOO_LARGE')
  Y.applyUpdate(doc, encoded)
  candidate.destroy()
  return encodeDocument(doc)
}
