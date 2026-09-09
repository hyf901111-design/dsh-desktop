/** Selection actions require usable content, including completed generated containers. */
export function selectionNodeReady(node: {
  kind?: string
  generationStatus?: string
  containerSpec?: unknown
}) {
  if (
    [
      'draft',
      'queued',
      'pending',
      'running',
      'generating',
      'resolving'
    ].includes(node.generationStatus ?? '')
  )
    return false
  return node.kind !== 'generated-container' || !!node.containerSpec
}
export function boardEditTime(value?: number, now = Date.now()) {
  if (!value || !Number.isFinite(value)) return '—'
  const age = Math.max(0, now - value)
  if (age < 60000) return '刚刚'
  for (const [size, label] of [
    [31536000000, '年'],
    [2592000000, '个月'],
    [86400000, '天'],
    [3600000, '小时'],
    [60000, '分钟']
  ] as const)
    if (age >= size) return `${Math.floor(age / size)}${label}`
  return '刚刚'
}
