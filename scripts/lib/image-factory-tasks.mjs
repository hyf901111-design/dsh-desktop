/** Open image task tabs, linked to the same native sessions as the conversation pane. */
export function createImageFactoryTasks({ sessions, win, isActive, signal, syncSession, getWorkspace, setView, storage, isBoardOnly = () => false }) {
  let tabs = [], closed = [], active, draftSession, openToken, loading, pendingSync, epoch, emitted
  const validScope = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/u.test(value) && !isBoardOnly(value)
  const publish = (force = false) => {
    const busy = !!openToken || !!loading
    if (!force && emitted?.tabs === tabs && emitted.active === active && emitted.busy === busy) return
    emitted = { tabs, active, busy, canRestore: closed.some(tab => !tabs.some(open => open.scope === tab.scope) &&
      (tab.scope === null || sessions.binding(tab.scope))) }
    signal('task-state', emitted)
  }
  const save = () => {
    if (epoch === undefined) return
    const recent = closed.filter(tab => tab.scope !== null)
    void storage.write({ epoch, tabs: tabs.filter(tab => tab.scope !== null), ...(recent.length > 0 && { closed: recent }) }).catch(() => {})
  }
  const load = () => {
    if (!storage || epoch !== undefined || loading) return
    const token = {}
    loading = token
    void storage.read().then(value => {
      if (loading !== token) return
      epoch = value.epoch
      closed = Array.isArray(value.closed) ? value.closed.filter(tab => validScope(tab?.scope)) : []
      const closedScopes = new Set(closed.map(tab => tab.scope))
      const restored = Array.isArray(value.tabs) ? value.tabs.filter(tab => validScope(tab?.scope) && !closedScopes.has(tab.scope)) : []
      const current = new Map(tabs.map(tab => [tab.scope, tab]))
      tabs = [...restored.map(tab => ({ ...tab, ...current.get(tab.scope) })),
        ...tabs.filter(tab => !closedScopes.has(tab.scope) && !restored.some(saved => saved.scope === tab.scope))].slice(-32)
    }).catch(() => {}).finally(() => {
      if (loading !== token) return
      loading = undefined
      const requested = pendingSync
      pendingSync = undefined
      if (isActive()) {
        if (epoch !== undefined) syncSession(true, requested?.reopen ? requested.scope : undefined, requested?.entry)
        else if (requested) reconcile(requested.scope, requested.reopen, requested.entry)
      }
      save()
      publish()
    })
  }
  function sync(scope, reopen = false, entry = false) {
    if (!isActive()) return scope
    load()
    if (!loading) return reconcile(scope, reopen, entry)
    pendingSync = { scope, reopen: reopen || (pendingSync?.scope === scope && pendingSync.reopen),
      entry: entry || pendingSync?.entry }
    publish()
    return scope
  }
  function reconcile(scope, reopen, entry) {
    const closedTab = scope === null ? undefined : closed.find(tab => tab.scope === scope)
    const skipClosed = closedTab && !reopen
    // Home clears the SDK selection before hiding Images. Keep the open tab
    // here, and only select its session when Images is explicitly entered.
    const home = scope === null && active !== null && sessions.list.getSnapshot().current === undefined
    if (skipClosed || home) {
      const available = tabs.filter(tab => tab.scope !== null && sessions.binding(tab.scope))
      const next = available.find(tab => tab.scope === active) ?? available.at(-1)
      if (next) {
        if (skipClosed || entry) select(next.scope, false)
        return next.scope
      }
      if (skipClosed) {
        draftSession = undefined
        sessions.clear()
        return null
      }
    }
    active = scope
    if (scope === null) draftSession = sessions.list.getSnapshot().current
    if (closedTab) {
      closed = closed.filter(tab => tab !== closedTab)
      tabs = [...tabs.slice(-31), closedTab].sort(pinnedFirst)
      save()
    } else if (!tabs.some(tab => tab.scope === scope)) {
      tabs = [...tabs.slice(-31), { scope }]
      save()
    }
    publish()
    return scope
  }
  function bindDraft(sessionId) {
    if (draftSession !== sessionId && draftSession !== undefined) return
    const draft = tabs.find(tab => tab.scope === null)
    if (!draft) return
    tabs = tabs.filter(tab => tab.scope !== sessionId).map(tab => tab === draft ? { ...tab, scope: sessionId } : tab)
    save()
    publish()
  }
  function setTitle({ scope, title } = {}) {
    if (typeof title !== 'string' || !title.trim()) return
    const tab = tabs.find(item => item.scope === scope)
    const label = title.trim().slice(0, 255)
    if (!tab || tab.title === label) return
    tabs = tabs.map(item => item === tab ? { ...tab, title: label } : item)
    save()
    publish()
  }
  function select(scope, sync = true) {
    const sessionId = scope === null ? draftSession : scope
    if (sessionId && isBoardOnly(sessionId)) throw Error('看板会话不能作为图片任务打开。')
    if (scope === null) active = null
    if (sessionId && sessions.binding(sessionId)) {
      setView?.(sessionId)
      sessions.open(sessionId)
    } else if (scope === null) sessions.clear()
    else throw Error('该图片任务的会话已不可用。')
    if (sync) syncSession(true)
  }
  async function create(replacing) {
    if (replacing === undefined && tabs.length >= 32) throw Error('最多打开 32 个图片任务，请先关闭不用的页签。')
    const before = sessions.list.getSnapshot().current
    const token = {}
    openToken = token
    publish()
    try {
      const workspaceId = getWorkspace?.()
      const id = 'image-task-' + win.crypto.randomUUID()
      const sessionId = await sessions.create({ sessionId: id, ...(workspaceId && { workspaceId }) })
      if (openToken !== token) return
      if (sessionId !== id || !sessions.binding(id)) throw Error('新图片任务未能打开。')
      if (replacing !== undefined) tabs = tabs.filter(tab => tab.scope !== replacing)
      tabs = [...tabs, { scope: id }]
      save()
      if (isActive() && sessions.list.getSnapshot().current === before) select(id)
      return id
    } finally {
      if (openToken === token) { openToken = undefined; publish() }
    }
  }
  function rememberClosed(removed) {
    const scopes = new Set(removed.map(tab => tab.scope))
    closed = [...removed, ...closed.filter(tab => !scopes.has(tab.scope))].slice(0, 32)
  }
  const pinnedFirst = (left, right) => Number(!!right.pinned) - Number(!!left.pinned)
  async function action({ kind, scope, before } = {}) {
    if ((!isActive() && kind !== 'close') || openToken || loading) return
    try {
      if (kind === 'new') { await create(); return }
      if (kind === 'restore') {
        const tab = closed.find(item => !tabs.some(open => open.scope === item.scope) &&
          (item.scope === null || sessions.binding(item.scope)))
        if (!tab) return
        if (tabs.length >= 32) throw Error('最多打开 32 个图片任务，请先关闭不用的页签。')
        closed = closed.filter(item => item !== tab)
        tabs = [...tabs, tab].sort(pinnedFirst)
        select(tab.scope)
        save()
        publish()
        return
      }
      const index = tabs.findIndex(tab => tab.scope === scope)
      if (index < 0) return
      if (kind === 'select') {
        if (scope !== active) select(scope)
      } else if (kind === 'pin') {
        tabs = tabs.map(item => item.scope === scope ? { ...item, pinned: !item.pinned } : item).sort(pinnedFirst)
        save()
        publish()
      } else if (kind === 'close-others') {
        if (scope !== active) select(scope)
        const removed = tabs.filter(item => item.scope !== scope)
        tabs = tabs.filter(item => item.scope === scope)
        rememberClosed(removed.reverse())
        save()
        publish()
      } else if (kind === 'reorder') {
        if (scope === before || before !== undefined && !tabs.some(item => item.scope === before)) return
        const tab = tabs[index]
        const next = tabs.filter(item => item !== tab)
        next.splice(before === undefined ? next.length : next.findIndex(item => item.scope === before), 0, tab)
        tabs = next
        save()
        publish()
      } else if (kind === 'close') {
        const tab = tabs[index]
        const neighbor = tabs[index + 1] ?? tabs[index - 1]
        if (!neighbor) {
          if (!await create(scope)) return
        } else if (isActive() && scope === active) select(neighbor.scope)
        tabs = tabs.filter(tab => tab.scope !== scope)
        rememberClosed([tab])
        save()
        publish()
      }
    } catch (error) {
      if (isActive()) signal('task-error', { message: error?.message || '图片任务暂不可用。' })
    }
  }
  function reset() {
    tabs = []
    closed = []
    active = draftSession = openToken = loading = pendingSync = epoch = undefined
    publish()
  }
  return { sync, action, setTitle, bindDraft, publish, reset }
}
