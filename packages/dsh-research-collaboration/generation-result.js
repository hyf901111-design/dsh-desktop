// Layout and execution indicators are independent of the content being generated.
// Keep nodeVersions for general document/reference revisions; use this narrower
// comparison only when committing a leased generation result.
const layoutFields = new Set('x y width height rotation scale stackOrder zIndex order parentId groupId sizeMode aspectRatio containerSizePreset layout collapsed refreshMinutes refreshScheduleId workbenchRevealAt'.split(' '))
const runtimeFields = new Set('generationStatus generationError generationStartedAt generationCompletedAt generationTaskId generationLastSeq generationChildSessionId lastSuccessfulAt refreshError updatedAt'.split(' '))
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  return value
}
export function generationContent(node) {
  return JSON.stringify(stable(Object.fromEntries(Object.entries(node).filter(([k]) =>
    !layoutFields.has(k) && !runtimeFields.has(k) &&
    // Containers render containerSpec; excerpt is a derived placeholder/error
    // caption. Text cards and mind maps do render excerpt, so keep it for them.
    !(node.kind === 'generated-container' && k === 'excerpt')
  ))))
}
export function mergeGenerationResult(latest, result) {
  const node = structuredClone(result)
  for (const key of layoutFields) {
    if (Object.hasOwn(latest, key)) node[key] = structuredClone(latest[key])
    else delete node[key]
  }
  return node
}
