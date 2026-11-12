import type { Canvas } from '../shared/research-boards'

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function mergeFields(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  latest: Record<string, unknown>
) {
  const merged = new Map(Object.entries(latest))
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    const before = base[key], edited = local[key], remote = latest[key]
    if (equal(before, edited)) continue
    if (!Object.hasOwn(local, key)) merged.delete(key)
    else if (isRecord(before) && isRecord(edited) && isRecord(remote))
      merged.set(key, mergeFields(before, edited, remote))
    else merged.set(key, edited)
  }
  return Object.fromEntries(merged)
}

/** Apply the pending changes on the latest canvas. Arrays are replaced as a unit. */
export function mergeSharedCanvas(base: Canvas, local: Canvas, latest: Canvas): Canvas {
  const merged: Canvas = { files: [], artifacts: [] }
  for (const collection of ['files', 'artifacts'] as const) {
    const index = (canvas: Canvas) => new Map(canvas[collection].map(node => [node.id, node]))
    const before = index(base), draft = index(local), refreshed = index(latest)
    for (const id of before.keys())
      if (!draft.has(id)) refreshed.delete(id)
    for (const [id, edited] of draft) {
      const original = before.get(id), remote = refreshed.get(id)
      if (equal(original, edited)) continue
      if (remote) refreshed.set(id, { ...mergeFields(original ?? {}, edited, remote), id })
      // Deleted nodes are tombstoned. A local addition is the only way to add a new ID.
      else if (!original) refreshed.set(id, edited)
    }
    merged[collection] = [...refreshed.values()]
  }
  return merged
}
