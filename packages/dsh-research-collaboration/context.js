// Portable human records and explicit source identities. No runtime grants live here.
const id = (v) =>
  typeof v === 'string' &&
  /^[-\w:.]{1,128}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v)
const fail = (code) => {
  throw new Error(code)
}
// Network URLs may legitimately contain /var/... route segments. Exclude only
// explicit network URLs; file URLs and recognizable machine roots stay private.
export function assertPortableHistoryText(text) {
  const withoutUrls = text.replace(/\b(?:https?|ftp):\/\/[^\s<>"']+/gi, '')
  if (
    /file:\/\//i.test(withoutUrls) ||
    /(?:^|[^a-z0-9_])(?:[a-z]:[\\/]|\\\\[^\\\s]+\\|~[\\/]|\/(?:Users|home|private|tmp|var|Volumes|Applications|Library|System|etc|opt|usr|mnt|media|workspace|workspaces|root)\/)/i.test(
      withoutUrls
    )
  )
    fail('PRIVATE_PATH_IN_HISTORY')
  return text
}
function attachmentDiagnostic(message, event, index, attachment) {
  const record = id(message?.id)
    ? message.id
    : `event-${Number.isSafeInteger(event.seq) ? event.seq : index}`
  const rawName =
    attachment.name ??
    attachment.fileName ??
    attachment.filename ??
    attachment.title
  const name =
    typeof rawName === 'string'
      ? rawName
          .split(/[\\/]/)
          .pop()
          .split(/[?#]/)[0]
          .replace(/[^\p{L}\p{N} ._()（）-]/gu, '')
          .slice(0, 80)
          .trim()
      : ''
  return `HISTORY_UNSUPPORTED_ATTACHMENT: 消息 ${record}；类型 ${attachment.type}；材料 ${name || '未命名资料'}`
}
export function normalizeRequestContext(
  value = { scope: 'board', references: [] }
) {
  if (
    !value ||
    !['board', 'references'].includes(value.scope) ||
    !Array.isArray(value.references) ||
    Object.keys(value).some((k) => !['scope', 'references'].includes(k)) ||
    value.references.length > 1000
  )
    fail('INVALID_CONTEXT')
  const seen = new Set(),
    references = value.references.map((r) => {
      if (
        !r ||
        Object.keys(r).some((k) => !['collection', 'nodeId'].includes(k)) ||
        !['files', 'artifacts'].includes(r.collection) ||
        !id(r.nodeId)
      )
        fail('INVALID_REFERENCE')
      const key = r.collection + ':' + r.nodeId
      if (seen.has(key)) fail('DUPLICATE_REFERENCE')
      seen.add(key)
      return { collection: r.collection, nodeId: r.nodeId }
    })
  if (
    (value.scope === 'board' && references.length) ||
    (value.scope === 'references' && !references.length)
  )
    fail('INVALID_CONTEXT')
  return { scope: value.scope, references }
}
export function portableReferences(refs = []) {
  if (!Array.isArray(refs) || refs.length > 1000) fail('INVALID_REFERENCE')
  return refs.map((r) => {
    if (!r || !id(r.nodeId) || !['files', 'artifacts'].includes(r.collection))
      fail('INVALID_REFERENCE')
    const out = { collection: r.collection, nodeId: r.nodeId }
    for (const k of ['name', 'text', 'kind', 'assetId', 'contentType'])
      if (r[k] !== undefined) {
        if (typeof r[k] !== 'string' || r[k].length > 16000)
          fail('INVALID_REFERENCE')
        out[k] = assertPortableHistoryText(r[k])
      }
    for (const k of ['nodeVersion', 'assetVersion', 'size'])
      if (r[k] !== undefined) {
        if (!Number.isSafeInteger(r[k]) || r[k] < 0) fail('INVALID_REFERENCE')
        out[k] = r[k]
      }
    return out
  })
}
function unwrap(text) {
  const refs = []
  const prefix = '␞SHERLOCK_RESEARCH_'
  let body = ''
  let cursor = 0
  while (true) {
    const start = text.indexOf(prefix, cursor)
    if (start < 0) {
      body += text.slice(cursor)
      break
    }
    body += text.slice(cursor, start)
    const end = text.indexOf('␟', start)
    if (end < 0 || end - start > 262144) fail('INVALID_PRIVATE_REFERENCE')
    const match =
      /^␞SHERLOCK_RESEARCH_(FILES_V1|FILE_REFERENCE_V1|ARTIFACT_REFERENCE_V1) ([\s\S]*)$/.exec(
        text.slice(start, end)
      )
    if (!match) fail('INVALID_PRIVATE_REFERENCE')
    let value
    try {
      value = JSON.parse(match[2])
    } catch {
      fail('INVALID_PRIVATE_REFERENCE')
    }
    const file = (f) => {
      if (!id(f?.id) || typeof f.name !== 'string')
        fail('INVALID_PRIVATE_REFERENCE')
      refs.push({
        collection: 'files',
        nodeId: f.id,
        name: f.name.split(/[\\/]/).pop()
      })
      return '@' + f.name.split(/[\\/]/).pop()
    }
    const artifact = (a) => {
      if (!id(a?.id) || typeof a.title !== 'string')
        fail('INVALID_PRIVATE_REFERENCE')
      refs.push({
        collection: 'artifacts',
        nodeId: a.id,
        name: a.title,
        text: a.sourceText ?? a.excerpt ?? '',
        kind: a.kind ?? 'assistant-excerpt'
      })
      return '@' + a.title
    }
    if (match[1] === 'FILES_V1') {
      if (!value || typeof value !== 'object')
        fail('INVALID_PRIVATE_REFERENCE')
      for (const f of value.files ?? []) file(f)
      for (const a of value.artifacts ?? []) artifact(a)
    } else
      body += match[1] === 'FILE_REFERENCE_V1' ? file(value) : artifact(value)
    cursor = end + 1
  }
  assertPortableHistoryText(body)
  return { text: body, references: portableReferences(refs) }
}
export function exportHumanHistory(events) {
  const result = []
  for (const e of events) {
    if (e?.surfaceOp !== 'append') continue
    let message, role
    if (e.type === 'user/message' && e.data?.source?.kind === 'user') {
      message = e.data
      role = 'user'
    } else if (e.type === 'assistant/message') {
      message = e.data?.message
      role = 'assistant'
    } else continue
    const attachment = (message?.content ?? []).find((b) =>
      ['image', 'audio', 'video', 'file'].includes(b?.type)
    )
    if (attachment)
      fail(attachmentDiagnostic(message, e, result.length, attachment))
    const text = (message?.content ?? [])
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
    if (!text) continue
    const parsed = unwrap(text)
    if (new TextEncoder().encode(parsed.text).length > 16384)
      fail('HISTORY_TOO_LARGE')
    result.push({
      id: String(message.id ?? `event-${e.seq ?? result.length}`),
      role,
      ...parsed,
      ...(Number.isFinite(e.time) ? { createdAt: e.time } : {})
    })
  }
  if (result.length > 100) fail('HISTORY_TOO_LARGE')
  return result
}
export function resolveRequestContext(context, canvas, versions = {}) {
  const canonical = normalizeRequestContext(context)
  return {
    ...canonical,
    references: canonical.references.map((r) => {
      const n = canvas[r.collection].find((n) => n.id === r.nodeId)
      if (!n) fail('REFERENCED_SOURCE_UNAVAILABLE')
      return {
        ...r,
        nodeVersion: versions[`${r.collection}:${r.nodeId}`] ?? 0,
        name: n.displayName ?? n.name ?? n.title ?? '资料',
        ...(r.collection === 'artifacts'
          ? {
              text:
                n.sourceText ??
                n.excerpt ??
                n.text ??
                n.containerSpec?.content ??
                '',
              kind: n.kind ?? 'artifact'
            }
          : {}),
        ...(n.assetId
          ? { assetId: n.assetId, assetVersion: n.assetVersion ?? 1 }
          : {})
      }
    })
  }
}
export function historyAssetIds(history = []) {
  return history.flatMap((m) =>
    (m.references ?? []).flatMap((r) => (r.assetId ? [r.assetId] : []))
  )
}
export function mergeHumanHistory(baseline = [], later = []) {
  const seen = new Set(),
    out = []
  for (const m of [...baseline, ...later]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(structuredClone(m))
  }
  if (out.length > 100) fail('HISTORY_TOO_LARGE')
  return out
}

export function portableAssetIds(value) {
  const ids = new Set()
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (typeof v.assetId === 'string') ids.add(v.assetId)
    for (const child of Object.values(v)) walk(child)
  }
  walk(value)
  return [...ids]
}
