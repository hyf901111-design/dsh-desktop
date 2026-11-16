/** Open image task tabs, linked to the same native sessions as the conversation pane. */
export function createImageFactoryTasks({ sessions, win, isActive, signal, syncSession, getWorkspace, setView, storage }) {
  let tabs = [], active, draftSession, openToken, loading, epoch, emitted
  const validScope = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/u.test(value)
  const publish = (force = false) => {
    const busy = !!openToken || !!loading
    if (!force && emitted?.tabs === tabs && emitted.active === active && emitted.busy === busy) return
    emitted = { tabs, active, busy }
    signal('task-state', emitted)
  }
  const save = () => {
    if (epoch !== undefined) void storage.write({ epoch, tabs: tabs.filter(tab => tab.scope !== null) }).catch(() => {})
  }
  const load = () => {
    if (!storage || epoch !== undefined || loading) return
    const token = {}
    loading = token
    void storage.read().then(value => {
      if (loading !== token) return
      epoch = value.epoch
      const restored = Array.isArray(value.tabs) ? value.tabs.filter(tab => validScope(tab?.scope)) : []
      const current = new Map(tabs.map(tab => [tab.scope, tab]))
      tabs = [...restored.map(tab => current.get(tab.scope) ?? tab), ...tabs.filter(tab => !restored.some(saved => saved.scope === tab.scope))].slice(-32)
    }).catch(() => {}).finally(() => {
      if (loading !== token) return
      loading = undefined
      save()
      publish()
    })
  }
  function sync(scope) {
    if (!isActive()) return
    active = scope
    if (scope === null) draftSession = sessions.list.getSnapshot().current
    if (!tabs.some(tab => tab.scope === scope)) {
      tabs = [...tabs.slice(-31), { scope }]
      save()
    }
    load()
    publish()
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
  function select(scope) {
    const sessionId = scope === null ? draftSession : scope
    if (sessionId && sessions.binding(sessionId)) {
      setView?.(sessionId)
      sessions.open(sessionId)
    } else if (scope === null) sessions.clear()
    else throw Error('该图片任务的会话已不可用。')
    syncSession(true)
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
    } finally {
      if (openToken === token) { openToken = undefined; publish() }
    }
  }
  async function action({ kind, scope } = {}) {
    if (!isActive() || openToken || loading) return
    try {
      if (kind === 'new') { await create(); return }
      const index = tabs.findIndex(tab => tab.scope === scope)
      if (index < 0) return
      if (kind === 'select') {
        if (scope !== active) select(scope)
      } else if (kind === 'close') {
        if (scope === active) {
          const neighbor = tabs[index + 1] ?? tabs[index - 1]
          if (!neighbor) { await create(scope); return }
          select(neighbor.scope)
        }
        tabs = tabs.filter(tab => tab.scope !== scope)
        save()
        publish()
      }
    } catch (error) {
      if (isActive()) signal('task-error', { message: error?.message || '图片任务暂不可用。' })
    }
  }
  function reset() {
    tabs = []
    active = draftSession = openToken = loading = epoch = undefined
    publish()
  }
  return { sync, action, setTitle, bindDraft, publish, reset }
}
