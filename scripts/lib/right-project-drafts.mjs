/** Capture the visible project before switching application surfaces. */
export function installSidebarWorkspaceHandoff({ sessions, workspaces, pending, right, doc = document }) {
  let launch
  const current = () => {
    const projects = workspaces.list.getSnapshot()
    const { current: owner, byId } = sessions.list.getSnapshot()
    const draft = right.getSnapshot()
    if (draft && draft.sessionId === owner) return draft.workspaceId
    if (owner !== undefined) {
      const cwd = byId[owner]?.cwd
      const project = projects.items.find(item => item.sessionIds.includes(owner)) ??
        (cwd && projects.items.find(item => item.path === cwd))
      if (project) return project.workspaceId
      if (cwd && projects.phase === 'ready') return null
    }
    const selected = pending.getSnapshot().workspaceId
    return selected === undefined ? projects.recentWorkspaceId : selected
  }
  const capture = ({ detail: mode }) => {
    launch = { mode, owner: sessions.list.getSnapshot().current, workspaceId: current() }
  }
  const clear = () => { launch = undefined }
  const changed = ({ detail }) => { if (launch?.mode !== detail?.surface) clear() }
  doc.addEventListener('sherlock:sidebar-launch-workspace-app', capture)
  doc.addEventListener('sherlock:workspace-surface-change', changed)
  doc.addEventListener('sherlock:knowledge-identity-changed', clear)
  return {
    current,
    forSurface: (mode, owner) => launch && launch.mode === mode && launch.owner === owner ? launch.workspaceId : undefined,
    dispose() {
      clear()
      doc.removeEventListener('sherlock:sidebar-launch-workspace-app', capture)
      doc.removeEventListener('sherlock:workspace-surface-change', changed)
      doc.removeEventListener('sherlock:knowledge-identity-changed', clear)
    }
  }
}

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
      const project = context?.launchWorkspaceId === undefined
        ? globalDraft.getManualWorkspace() : context.launchWorkspaceId
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
