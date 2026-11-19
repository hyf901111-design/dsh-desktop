/** A right-hand draft belongs to the visible application and center session. */
export function createRightProjectDrafts({ globalDraft, makeDraft }) {
  const listeners = new Set()
  const drafts = new Map()
  let visible, active
  const publish = entry => {
    if (entry === active) return
    active = entry
    for (const notify of listeners) notify()
  }
  const key = ({ sessionId, mode }) => JSON.stringify([sessionId, mode])
  const hasContent = ({ pending }) => {
    const { draft, imageIds, occurrences } = pending.shell.snapshot
    return Boolean(draft.trim() || imageIds?.length || occurrences?.length)
  }
  const hasActivity = entry => {
    const { busy, activating } = entry.pending.getSnapshot()
    return busy || activating || hasContent(entry)
  }
  const discard = entry => {
    drafts.delete(entry.id)
    entry.pending.dispose()
  }
  const leave = () => {
    if (active && !hasActivity(active)) discard(active)
    publish(undefined)
  }
  const open = workspaceId => {
    if (!visible || workspaceId === undefined) return
    const id = JSON.stringify([visible.key, workspaceId])
    if (active?.id === id) return
    leave()
    let entry = drafts.get(id)
    if (!entry) {
      entry = { ...visible, id, workspaceId }
      entry.pending = makeDraft(entry, {
        isActive: () => active === entry,
        settled: () => { if (active !== entry && !hasContent(entry) && drafts.get(id) === entry) discard(entry) }
      })
      drafts.set(id, entry)
    }
    publish(entry)
  }
  return {
    subscribe(notify) { listeners.add(notify); return () => listeners.delete(notify) },
    getSnapshot: () => active,
    hasActivityFor(context) {
      const owner = key(context)
      return [...drafts.values()].some(entry => entry.key === owner && hasActivity(entry))
    },
    show(context) {
      if (visible?.key === (context && key(context))) return
      const previousMode = visible?.mode
      leave()
      visible = context && { ...context, key: key(context) }
      const project = globalDraft.getManualWorkspace()
      if (project !== undefined && context?.followDefault && previousMode !== context.mode && project !== context.workspaceId) {
        open(project)
      }
    },
    select(context, workspaceId) {
      globalDraft.selectWorkspace(workspaceId)
      this.show(context)
      open(workspaceId)
    },
    reset() {
      visible = undefined
      for (const entry of drafts.values()) discard(entry)
      publish(undefined)
    }
  }
}
