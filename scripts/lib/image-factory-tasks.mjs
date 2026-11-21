/** Open image task tabs, linked to the same native sessions as the conversation pane. */
export function createImageFactoryTasks({ sessions, win, isActive, signal, syncSession, getWorkspace, getDefaultWorkspace = getWorkspace, standaloneDirectory, setView, storage, archiveTask, requestTitle, canSyncTitle, blankTitle = () => '新图像', isBoardOnly = () => false }) {
  let tabs = [], closed = [], active, draftSession, openToken, loading, pendingSync, epoch, emitted, publishedTabs, lastCreated
  let entryProject, navigation = 0, pendingFresh = false, account = {}, freshQueue = Promise.resolve()
  const checking = new Set(), replacements = new Set(), sending = new Map()
  const owned = id => [...tabs, ...closed].find(tab => tab.scope === id && tab.temporary)
  function keep(id) {
    if (!owned(id)) return
    const commit = values => values.map(tab => {
      if (tab.scope !== id) return tab
      const { temporary, ...retained } = tab
      return retained
    })
    tabs = commit(tabs)
    closed = commit(closed)
    save()
    publish()
  }
  function admission(id) {
    if (!owned(id)) return () => {}
    const start = account
    sending.set(id, (sending.get(id) ?? 0) + 1)
    return ok => {
      if (account !== start) return
      if (ok) keep(id)
      const count = sending.get(id) - 1
      if (count) sending.set(id, count)
      else sending.delete(id)
      observe()
    }
  }
  const blank = id => {
    const row = sessions.list.getSnapshot().byId?.[id]
    const session = sessions.binding(id)?.session?.getSnapshot?.()
    if (!row || !session) return undefined
    if (isBoardOnly(id) || row.blank === false || row.running || row.pendingInteraction || session.blank === false ||
        session.running || session.pending?.length || session.queue?.length || session.chat?.order?.length ||
        row.title && row.title !== '新图像' && row.title !== 'New image') return false
    return row.blank === true ? true : undefined
  }
  const titleChecks = new Map()
  function sessionTitleForTab(scope, row) {
    const title = row?.title
    if (!title || title === '新图像' || title === 'New image' || title === 'New Image') return
    if (!canSyncTitle || !scope?.startsWith('image-task-')) return title
    const prior = titleChecks.get(scope)
    if (prior?.title === title && (prior.pending || prior.allowed || row.running || prior.updated === row.updatedAt)) return prior.allowed ? title : undefined
    const check = {title, updated:row.updatedAt, pending:true, allowed:false}
    titleChecks.set(scope,check)
    void canSyncTitle(scope,title).then(allowed => {
      if (titleChecks.get(scope) !== check) return
      check.pending = false
      check.allowed = allowed
      if (allowed && sessions.list.getSnapshot().byId?.[scope]?.title === title) observe()
    }).catch(() => { if (titleChecks.get(scope) === check) titleChecks.delete(scope) })
  }
  function observe() {
    const eligible = id => owned(id) && !sending.has(id) && !replacements.has(id) && openToken?.tab.scope !== id &&
      (!isActive() || sessions.list.getSnapshot().current !== id)
    for (const tab of [...tabs, ...closed]) {
      const id = tab.scope
      const row = sessions.list.getSnapshot().byId?.[id]
      if (!tab.temporary && row?.title && row.title !== tab.title && sessionTitleForTab(id,row)) setTitle({scope:id,title:row.title},true)
      if (!tab.temporary || checking.has(id) || !archiveTask || !storage?.hasCanvas || epoch === undefined) continue
      const vacant = blank(id)
      if (vacant === false) { keep(id); continue }
      if (vacant !== true || !eligible(id)) continue
      const start = account
      checking.add(id)
      void storage.hasCanvas(id, epoch).then(async canvas => {
        if (account !== start || !owned(id)) return
        if (canvas || blank(id) === false) { keep(id); return }
        if (!eligible(id) || blank(id) !== true) return
        await archiveTask(id)
        if (account !== start) return
        tabs = tabs.filter(item => item.scope !== id)
        closed = closed.filter(item => item.scope !== id)
        if (active === id && sessions.list.getSnapshot().current !== id) active = undefined
        save()
        publish()
      }).catch(() => {}).finally(() => { if (start === account) checking.delete(id) })
    }
  }
  function enterFresh(workspace = getDefaultWorkspace?.(), loaded = false, revision = ++navigation) {
    if (!isActive()) return
    if (!loaded) load()
    if (loading) { pendingFresh = { workspace, revision }; publish(); return }
    const start = account
    freshQueue = freshQueue.then(async () => {
      if (start !== account || !isActive()) return
      await action({ kind: 'new', fresh: true, workspace, revision })
    })
    return freshQueue
  }
  const validScope = value => value === null ||
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/u.test(value) && !isBoardOnly(value)
  const canOpen = tab => {
    if (tab.scope === null) return true
    const binding = sessions.binding(tab.scope)
    return !!binding && binding.state !== 'removed'
  }
  const tabKey = tab => tab.key ?? tab.scope ?? ''
  const uniqueTab = tab => tabs.some(open => tabKey(open) === tabKey(tab))
    ? { ...tab, key: 'tab:' + win.crypto.randomUUID() } : tab
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
      canRestore: closed.some(tab => !replacements.has(tab.scope) && !tabs.some(open => open.scope === tab.scope) && canOpen(tab)) }
    signal('task-state', emitted)
  }
  const save = () => {
    if (epoch === undefined) return
    const persisted = values => values.map(({ key, ...tab }) => tab)
    return storage.write({ epoch, tabs: persisted(tabs), ...(closed.length > 0 && { closed: persisted(closed) }) }).catch(() => {})
  }
  function saveTitle(id, kind, title) {
    const start = account
    const stored = save()
    if (stored) void stored.then(() => {
      if (start === account && tabs.some(tab => tab.scope === id)) return requestTitle?.(id, kind, title)
    }).catch(() => {})
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
        ...tabs.filter(tab => !closedScopes.has(tab.scope) && !restored.some(saved => saved.scope === tab.scope))].slice(0, 32)
    }).catch(() => {}).finally(() => {
      if (loading !== token) return
      loading = undefined
      const requested = pendingSync
      pendingSync = undefined
      const fresh = pendingFresh
      pendingFresh = false
      if (isActive() && fresh) void enterFresh(fresh.workspace, true, fresh.revision)
      else if (isActive()) {
        if (epoch !== undefined) syncSession(true, requested?.reopen ? requested.scope : undefined, requested?.entry)
        else if (requested) reconcile(requested.scope, requested.reopen, requested.entry)
      }
      save()
      publish()
      observe()
    })
  }
  function sync(scope, reopen = false, entry = false) {
    if (!isActive()) return scope
    load()
    if (openToken && scope !== openToken.tab.scope && !reopen) return active
    if (!loading) return reconcile(scope, reopen, entry)
    pendingSync = { scope, reopen: reopen || (pendingSync?.scope === scope && pendingSync.reopen),
      entry: entry || pendingSync?.entry }
    publish()
    return scope ?? undefined
  }
  function afterProjectChange(project) {
    const matches = tab => canOpen(tab) && getWorkspace(tab.scope ?? draftSession ?? null) === project
    // Keep a legacy standalone drawing accessible, and keep all edited tabs if the strip is full.
    const next = tabs.find(tab => tab.scope === active && matches(tab)) ?? tabs.findLast(matches) ??
      tabs.find(tab => tab.scope === null) ?? (tabs.length >= 32 ? tabs.findLast(canOpen) : undefined)
    if (next) {
      active = next.scope
      select(next.scope, false)
      publish()
      return next.scope
    }
    if (tabs.length >= 32) {
      publish()
      return undefined
    }
    if (closed.some(tab => tab.scope === null)) {
      if (!openToken) void action({ kind: 'new' })
      return undefined
    }
    active = null
    tabs = [...tabs, uniqueTab({ scope: null })]
    save()
    select(null, false)
    publish()
    return null
  }
  function projectSelected(project) {
    if (isActive()) entryProject = project
  }
  function reconcile(scope, reopen, entry) {
    if (entry) {
      const project = getDefaultWorkspace?.()
      const changed = entryProject !== undefined && project !== undefined && project !== entryProject
      if (project !== undefined) entryProject = project
      if (changed && !reopen) return afterProjectChange(project)
    }
    const known = tabs.find(tab => tab.scope === scope)
    const closedTab = closed.find(tab => tab.scope === scope)
    const project = entry ? getWorkspace?.() : undefined
    const canResume = tab => canOpen(tab) && (!entry || tab.scope !== null && tab.scope === scope ||
      project !== undefined && getWorkspace(tab.scope ?? draftSession ?? null) === project)
    // Native workspace sessions can arrive after the app has selected its tab.
    // Only an explicit canvas request can introduce another session at that point.
    if (!reopen && (entry || (scope !== null && !known && !closedTab))) {
      const previous = tabs.find(tab => tab.scope === active && canResume(tab) && (entry || !tab.temporary)) ??
        (entry ? (known && canResume(known) ? known : tabs.findLast(canResume)) : undefined)
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
      const available = tabs.filter(tab => canResume(tab) && (tab.scope !== null || skipClosed))
      const next = available.find(tab => tab.scope === active) ?? available.at(-1)
      if (next) {
        if (skipClosed || entry) select(next.scope, false)
        return next.scope
      }
      if (skipClosed) {
        if (entry && scope !== null && project !== undefined) {
          if (!openToken) void action({ kind: 'new' })
          return undefined
        }
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
    if (!known && tabs.length >= 32) {
      const previous = tabs.find(tab => tab.scope === active && canOpen(tab)) ?? tabs.findLast(canOpen)
      if (previous) select(previous.scope, false)
      if (reopen) signal('task-error', { message: '最多打开 32 个图片任务，请先关闭不用的页签。' })
      return previous?.scope
    }
    active = scope
    if (scope === null) draftSession = sessions.list.getSnapshot().current
    if (closedTab) {
      closed = closed.filter(tab => tab !== closedTab)
      tabs = [...tabs, uniqueTab(closedTab)].sort(pinnedFirst)
      save()
    } else if (!known) {
      tabs = [...tabs, uniqueTab({ scope })]
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
  function registerReplacement(scope) {
    if (!validScope(scope) || !scope?.startsWith('image-task-') || owned(scope)) return
    replacements.add(scope)
    closed = [{ scope, temporary: true }, ...closed].slice(0, 32)
    return save()
  }
  function releaseReplacement(id) { replacements.delete(id); observe() }
  function replaceActive(previous, scope) {
    if (!isActive() || openToken || loading || active !== previous || !validScope(scope) || !canOpen({ scope }) ||
        !tabs.some(tab => tab.scope === previous) || tabs.some(tab => tab.scope === scope)) return false
    const original = tabs.find(tab => tab.scope === previous)
    closed = closed.filter(tab => tab.scope !== scope)
    if (original.temporary) rememberClosed([original])
    const theme = !original.temporary && original.title && original.title !== '新图像' && original.title !== 'New image' ? original.title : undefined
    tabs = tabs.map(tab => tab === original ? { scope, key: tabKey(tab), ...(theme ? { title: theme } : { temporary: true }),
      ...(tab.pinned && { pinned: true }) } : tab)
    saveTitle(scope, theme ? 'template' : 'blank', theme ?? blankTitle())
    active = scope
    if (previous === null) draftSession = undefined
    if (lastCreated === previous) lastCreated = undefined
    save()
    publish()
    return true
  }
  function setTitle({ scope, title } = {}, fromSession = false) {
    if (typeof title !== 'string' || !title.trim()) return
    const tab = tabs.find(item => item.scope === scope)
    if (!tab) return
    if (!fromSession) keep(scope)
    const row = sessions.list.getSnapshot().byId?.[scope]
    const saved = fromSession || row?.title === title ? title : sessionTitleForTab(scope,row)
    const label = (saved || title).trim().slice(0, 255)
    if (tab.title === label) return
    tabs = tabs.map(item => item.scope === scope ? { ...item, title: label } : item)
    if (!fromSession && scope?.startsWith('image-task-')) saveTitle(scope, 'template', title.trim().slice(0, 255))
    else save()
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
    if (sync) {
      const project = getWorkspace?.(sessionId ?? null)
      if (project !== undefined) projectSelected(project)
      syncSession(true)
    }
  }
  async function create(replacedTab, template, workspaceId = getDefaultWorkspace?.(), revision = navigation) {
    const replacing = replacedTab?.scope
    if (replacing === undefined && tabs.length >= 32) throw Error('最多打开 32 个图片任务，请先关闭不用的页签。')
    const before = sessions.list.getSnapshot().current
    const id = 'image-task-' + win.crypto.randomUUID()
    const token = { tab: { scope: id, temporary: true }, replacing }
    openToken = token
    publish()
    try {
      const directory = workspaceId === null ? { cwd: await standaloneDirectory() } : workspaceId ? { workspaceId } : {}
      if (openToken !== token) return
      if (archiveTask && storage?.hasCanvas) {
        await registerReplacement(id)
        if (openToken !== token) return
      }
      const sessionId = await sessions.create({ sessionId: id, ...directory })
      if (openToken !== token) return
      if (sessionId !== id || !sessions.binding(id)) throw Error('新图片任务未能打开。')
      closed = closed.filter(tab => tab.scope !== id)
      if (replacedTab) {
        tabs = tabs.filter(tab => tab.scope !== replacing)
        rememberClosed([replacedTab])
      }
      lastCreated = id
      tabs = [...tabs, token.tab]
      if (template) { keep(id); setTitle({ scope: id, title: template }) }
      else saveTitle(id, 'blank', blankTitle())
      if (revision === navigation && isActive() && sessions.list.getSnapshot().current === before) select(id)
      return id
    } finally {
      if (openToken === token) {
        openToken = undefined
        replacements.delete(id)
        publish()
        observe()
      }
    }
  }
  function rememberClosed(removed) {
    const scopes = new Set(removed.map(tab => tab.scope))
    closed = [...removed, ...closed.filter(tab => !scopes.has(tab.scope))].slice(0, 32)
  }
  const pinnedFirst = (left, right) => Number(!!right.pinned) - Number(!!left.pinned)
  async function action({ kind, scope, before, template, fresh, workspace, revision } = {}) {
    if ((!isActive() && kind !== 'close') || openToken || loading) return
    try {
      if (kind === 'new') {
        const current = sessions.list.getSnapshot().current
        if (typeof template === 'string' && template.trim() && owned(current) && blank(current) === true) {
          setTitle({ scope: current, title: template })
          return current
        }
        const displaced = fresh && tabs.length >= 32 && (tabs.find(tab => tab.temporary) ?? tabs.find(tab => !tab.pinned) ?? tabs[0])
        return await create(displaced || undefined, template, workspace, revision)
      }
      if (kind === 'restore') {
        const tab = closed.find(item => !replacements.has(item.scope) && !tabs.some(open => open.scope === item.scope) && canOpen(item))
        if (!tab) return
        if (tabs.length >= 32) throw Error('最多打开 32 个图片任务，请先关闭不用的页签。')
        closed = closed.filter(item => item !== tab)
        tabs = [...tabs, uniqueTab(tab)].sort(pinnedFirst)
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
    account = {}; navigation++; titleChecks.clear(); checking.clear(); replacements.clear(); sending.clear(); pendingFresh = false
    tabs = []
    closed = []
    active = draftSession = openToken = loading = pendingSync = epoch = lastCreated = entryProject = undefined
    publish()
  }
  const historyTab = id => ({ epoch, tab: [...tabs, ...closed].find(item => item.scope === id) })
  function leave() { navigation++; observe() }
  return { historyTab, load, sync, action, enterFresh, leave, admission, observe, registerReplacement, releaseReplacement, setTitle, bindDraft, replaceActive, projectSelected, publish, reset, isCreating: () => !!openToken }
}
