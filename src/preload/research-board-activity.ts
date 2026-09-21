/** Include descendants even after the main agent has handed off and become idle. */
export function researchBoardRunning(sessions: Record<string, any>, sessionId: string, artifacts: readonly any[] = []): boolean {
  const ids = new Set([sessionId])
  let changed = true
  while (changed) {
    changed = false
    for (const [id, node] of Object.entries(sessions)) {
      if (!ids.has(id) && ids.has(node.parentId)) { ids.add(id); changed = true }
    }
  }
  return [...ids].some(id => sessions[id]?.running === true || sessions[id]?.runningSubagentCount > 0) ||
    artifacts.some(node => ['queued', 'running'].includes(node.generationStatus))
}
