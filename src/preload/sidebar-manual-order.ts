/** Preserve manual positions, promoting only new activity since the saved snapshot. */
export function promoteSidebarOrder(entries: Array<{ key: string; time: number }>, saved: string[], previous: Record<string, number> = {}) {
  const keys = new Set(entries.map(e => e.key))
  const order = [...saved.filter(key => keys.has(key)), ...entries.filter(e => !saved.includes(e.key)).map(e => e.key)]
  const promoted = entries.filter(e => previous[e.key] === undefined ? Object.keys(previous).length > 0 : e.time > previous[e.key]!).sort((a, b) => b.time - a.time).map(e => e.key)
  const promotedKeys = new Set(promoted)
  const next = [...promoted, ...order.filter(key => !promotedKeys.has(key))]
  const updatedAt = Object.fromEntries(entries.map(e => [e.key, e.time]))
  return { order: next, updatedAt, changed: JSON.stringify(saved) !== JSON.stringify(next) || JSON.stringify(previous) !== JSON.stringify(updatedAt) }
}
