/** Open image task tabs, linked to the same native sessions as the conversation pane. */
export function createImageFactoryTasks({ sessions, win, isActive, signal, syncSession, getWorkspace, setView, storage, isBoardOnly = () => false }) {
  let tabs = [], closed = [], active, draftSession, openToken, loading, pendingSync, epoch, emitted, publishedTabs, lastCreated
  const validScope = value => value === null ||
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/u.test(value) && !isBoardOnly(value)
  const canOpen = tab => {
    if (tab.scope === null) return true
    const binding = sessions.binding(tab.scope)
    return !!binding && binding.state !== 'removed'
  }
  const publish = (force = false) => {
    const creating = openToken?.tab.scope
    const selected = creating ?? active
    const busy = !!creating || !!loading
    if (!force && publishedTabs === tabs && emitted?.active === selected &&
        emitted.busy === busy && emitted.creating === creating) return
    publishedTabs = tabs
    const displayed = openToken
      ? [...tabs.filter(tab => tab.scope !== openToken.replacing && tab.scope !== creating), openToken.tab]
      : tabs
    emitted = { tabs: displayed, active: selected, busy, creating, fresh: lastCreated,
      canRestore: closed.some(tab => !tabs.some(open => open.scope === tab.scope) && canOpen(tab)) }
    signal('task-state', emitted)
  }
  const save = () => {
    if (epoch === undefined) return
    void storage.write({ epoch, tabs, ...(closed.length > 0 && { closed }) }).catch(() => {})
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
    return scope ?? undefined
  }
  function reconcile(scope, reopen, entry) {
    const known = tabs.find(tab => tab.scope === scope)
    const closedTab = closed.find(tab => tab.scope === scope)
    // Native workspace sessions can arrive after the app has selected its tab.
    // Only an explicit canvas request can introduce another session at that point.
    if (!reopen && (entry || (scope !== null && !known && !closedTab))) {
      const previous = tabs.find(tab => tab.scope === active && canOpen(tab)) ??
        (entry ? (known && canOpen(known) ? known : tabs.findLast(canOpen)) : undefined)
      if (previous && (previous.scope !== scope ||
          (scope === null && sessions.list.getSnapshot().current !== draftSession))) {
        select(previous.scope, false)
        return previous.scope
      }
    }
    const skipClosed = closedTab && !reopen
    // Keep image tabs when the SDK has no selection. Restore a tab's session
    // only when Images is explicitly entered.
    const home = scope === null && active !== null && sessions.list.getSnapshot().current === undefined
    if (skipClosed || home) {
      const available = tabs.filter(tab => canOpen(tab) && (tab.scope !== null || skipClosed))
      const next = available.find(tab => tab.scope === active) ?? available.at(-1)
      if (next) {
        if (skipClosed || entry) select(next.scope, false)
        return next.scope
      }
      if (skipClosed) {
        if (scope !== null) {
          draftSession = undefined
          sessions.clear()
          return reconcile(null, false, entry)
        }
        active = undefined
        if (entry && !openToken) void action({ kind: 'new' })
        publish()
        return undefined
      }
    }
    active = scope
    if (scope === null) draftSession = sessions.list.getSnapshot().current
    if (closedTab) {
      closed = closed.filter(tab => tab !== closedTab)
      tabs = [...tabs.slice(-31), closedTab].sort(pinnedFirst)
      save()
    } else if (!known) {
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
  async function create(replacedTab) {
    const replacing = replacedTab?.scope
    if (replacing === undefined && tabs.length >= 32) throw Error('最多打开 32 个图片任务，请先关闭不用的页签。')
    const before = sessions.list.getSnapshot().current
    const id = 'image-task-' + win.crypto.randomUUID()
    const token = { tab: { scope: id }, replacing }
    openToken = token
    publish()
    try {
      const workspaceId = getWorkspace?.()
      const sessionId = await sessions.create({ sessionId: id, ...(workspaceId && { workspaceId }) })
      if (openToken !== token) return
      if (sessionId !== id || !sessions.binding(id)) throw Error('新图片任务未能打开。')
      if (replacedTab) {
        tabs = tabs.filter(tab => tab.scope !== replacing)
        rememberClosed([replacedTab])
      }
      lastCreated = id
      tabs = [...tabs, token.tab]
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
      if (kind === 'new') return await create()
      if (kind === 'restore') {
        const tab = closed.find(item => !tabs.some(open => open.scope === item.scope) && canOpen(item))
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
        const neighbor = tabs.slice(index + 1).find(canOpen) ?? tabs.slice(0, index).findLast(canOpen)
        if (!neighbor && (tabs.length === 1 || isActive() && scope === active)) {
          await create(tab)
          return
        }
        tabs = tabs.filter(tab => tab.scope !== scope)
        rememberClosed([tab])
        save()
        if (neighbor && isActive() && scope === active) select(neighbor.scope)
        publish()
      }
    } catch (error) {
      if (isActive()) signal('task-error', { message: error?.message || '图片任务暂不可用。' })
    }
  }
  function reset() {
    tabs = []
    closed = []
    active = draftSession = openToken = loading = pendingSync = epoch = lastCreated = undefined
    publish()
  }
  return { sync, action, setTitle, bindDraft, publish, reset, isCreating: () => !!openToken }
}
