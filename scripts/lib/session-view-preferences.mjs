export function isSessionViewId(value) {
  return ['chat', 'research', 'notes', 'trajectory', 'spreadsheet'].includes(value)
}

export function hasSessionViewPreference(sessionId, view) {
  if (!isSessionViewId(view)) return false
  if (view !== 'chat') return true
  // Old native snapshots also wrote the default Chat view. Only the separate
  // preference records an explicit Chat choice over legacy canvas recovery.
  const key = 'ework.session.view.v1:' + sessionId
  // create() already reconciles the durable preference into its native store.
  // A local explicit choice (including the pending journal) needs no sync IPC.
  try { if (isSessionViewId(localStorage.getItem(key))) return true } catch {}
  try { if (isSessionViewId(window.dshDesktop?.researchCanvasStorage?.getItem(key))) return true } catch {}
  return false
}

// The workspace flow can reuse a blank scope which is not currently rendered.
// Record the explicit intent before open; a component-local event alone loses it.
export function installInitialChatViewIntent(chatStore, sessions, researchWorkspaces) {
  const key = Symbol.for('sherlock:initial-chat-reuse')
  const policy = { canReuse: id => {
    const page = sherlockBoardsAdapter
    const state = sessions.list.getSnapshot()
    // Blank spreadsheets and manually named sessions can have a pinned title.
    // Reuse only an unnamed session so the first Chat prompt can title it.
    return state.ids.includes(id) && state.byId[id]?.title === undefined && page?.getState?.()?.account?.status === 'ready' &&
      typeof page.isBoardOnly === 'function' && !page.isBoardOnly(id)
  } }
  window[key] = policy
  const chat = event => {
    const id = event.detail?.sessionId
    if (typeof id !== 'string' || !id || id.length > 1_000 || !sessions.list.getSnapshot().ids.includes(id)) return
    const binding = sessions.binding(id)
    if (!binding || binding.state === 'removed' || binding.kind === 'subagent') return
    if (sherlockBoardsAdapter?.isBoardOnly?.(id)) return
    clearInitialResearchSession(id)
    explicitHomeViewSessions.add(id)
    explicitResearchViewSessions.add(id)
    chatStore.create(id).actions.setView('chat')
  }
  const research = event => {
    const id = event.detail?.sessionId
    explicitHomeViewSessions.delete(id)
    if (event.detail?.newResearch === true && typeof id === 'string' && sessions.list.getSnapshot().ids.includes(id))
      researchWorkspaces?.for(id)?.initializeWorkbenchResponsiveArrange?.()
  }
  window.addEventListener('sherlock:conversation-initial-chat', chat)
  window.addEventListener('sherlock:conversation-initial-research', research)
  return () => {
    if (window[key] === policy) delete window[key]
    window.removeEventListener('sherlock:conversation-initial-chat', chat)
    window.removeEventListener('sherlock:conversation-initial-research', research)
  }
}

// Only explicit New Chat callbacks attach this predicate. Workspace selection
// and New Research retain their native reuse and per-session restoration paths.
export function patchNewChatSessionRuntime(source) {
  const changes = [
    ['async connectWorkspace(workspaceId) {', 'async connectWorkspace(workspaceId, canReuse) { /* ework:new-chat-reuse-filter:v1 */'],
    ['&& !researchSessionState(summary.id, false).engaged) return summary.id;', '&& !researchSessionState(summary.id, false).engaged && (typeof canReuse !== "function" || canReuse(summary.id) === true)) return summary.id;'],
    ['this.connectWorkspace(target).then((sessionId) => {\n\t\t\t\t\tbeforeOpen?.(sessionId);', 'this.connectWorkspace(target, typeof beforeOpen?.canReuse === "function" ? beforeOpen.canReuse : void 0).then((sessionId) => {\n\t\t\t\t\tbeforeOpen?.(sessionId);']
  ]
  const marker='/* ework:new-chat-reuse-filter:'
  const permissionMarker='/* ework:new-chat-permission-reuse:v1 */'
  const permissionChanges = [
    [changes[0][1], changes[0][1].replace('workspaceId, canReuse)', 'workspaceId, canReuse, permissionAllowsReuse)') + ' ' + permissionMarker],
    ['const attempt = this.sessions.create({ workspaceId }).finally(() => {',
      'const pendingCreate = this.connecting.get(workspaceId);\n\t\t\t\tif (pendingCreate !== void 0) return pendingCreate;\n\t\t\t\tconst attempt = this.sessions.create({ workspaceId }).finally(() => {'],
    [changes[1][1], changes[1][1].replace('=== true))', '=== true) && (!permissionAllowsReuse || await permissionAllowsReuse(summary.id)))')],
    [changes[2][1], 'const canReuse = typeof beforeOpen?.canReuse === "function" ? beforeOpen.canReuse : void 0;\n'
      + '\t\t\t\tconst preferences = canReuse && window[Symbol.for("sherlock:conversation-permission-default")];\n'
      + '\t\t\t\tconst connect = preferences ? preferences.prepareReuse().then(allows => {\n'
      + '\t\t\t\t\tif (this.sessions.list.getSnapshot().current !== current) return;\n'
      + '\t\t\t\t\treturn this.connectWorkspace(target, canReuse, allows);\n'
      + '\t\t\t\t}) : this.connectWorkspace(target, canReuse);\n'
      + '\t\t\t\tconnect.then((sessionId) => {\n'
      + '\t\t\t\t\tif (sessionId === void 0 || preferences && this.sessions.list.getSnapshot().current !== current) return;\n'
      + '\t\t\t\t\tbeforeOpen?.(sessionId);']
  ]
  if (source.includes(permissionMarker)) {
    if (source.split(marker).length!==2 || permissionChanges.some(([,next])=>source.split(next).length!==2))throw Error('New Chat runtime reuse hook drifted')
    return source
  }
  if(source.includes(marker)) {
    if(source.split(marker).length!==2 || changes.some(([,next])=>source.split(next).length!==2))throw Error('New Chat runtime reuse hook drifted')
  } else {
    for(const [before,next] of changes){if(source.split(before).length!==2)throw Error('New Chat runtime reuse anchor drifted');source=source.replace(before,next)}
  }
  for (const [before, next] of permissionChanges) source=source.replace(before,next)
  return source
}

export function patchNewChatSidebar(source) {
  const before='ctx.workspaces.startSession(workspaceId, (sessionId) => {\n\t\t\t\t\t\twindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId } }));\n\t\t\t\t\t});'
  const next='/* ework:sidebar-new-chat-reuse:v1 */\nctx.workspaces.startSession(workspaceId, Object.assign((sessionId) => {\nwindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId } }));\n}, { canReuse: id => window[Symbol.for("sherlock:initial-chat-reuse")]?.canReuse(id) === true }));'
  if(source.includes('/* ework:sidebar-new-chat-reuse:')){
    if(source.split('/* ework:sidebar-new-chat-reuse:').length!==2||source.split(next).length!==2)throw Error('New Chat sidebar reuse hook drifted')
  } else {
    if(source.split(before).length!==2)throw Error('New Chat sidebar reuse anchor drifted')
    source=source.replace(before,next)
  }
  const research='window.dispatchEvent(new CustomEvent("sherlock:conversation-initial-research", { detail: { sessionId } }));'
  const tagged=research.replace('{ sessionId }', '{ sessionId, newResearch: true }')
  if(source.includes(research)){
    if(source.split(research).length!==2||source.includes(tagged))throw Error('New Research sidebar intent anchor drifted')
    source=source.replace(research,tagged)
  }
  if(source.split(tagged).length!==2)throw Error('New Research sidebar intent missing')
  return source
}

export function useInitialChatSessionView(sessionId, storedView, actions) {
  const requested = explicitHomeViewSessions.has(sessionId)
  react.useLayoutEffect(() => {
    if (!requested || !explicitHomeViewSessions.has(sessionId) || typeof actions?.setView !== 'function') return
    // Commit through this real retained slot instance, not a detached create().
    actions.setView('chat')
    explicitHomeViewSessions.delete(sessionId)
  }, [sessionId, requested, actions])
  return requested ? 'chat' : storedView === 'trajectory' ? 'spreadsheet' : storedView
}

/** Keep the native per-session store/drafts; persist only the navigation preference. */
export function withSessionViewPreferences(handle) {
  const pendingBySession = new Map()
  const durableBySession = new Map()
  const writes = new Map()
  let frame = 0, timer = 0
  const viewWindow = typeof window === 'undefined' ? undefined : window
  const flush = () => {
    if (frame) viewWindow?.cancelAnimationFrame(frame)
    if (timer) viewWindow?.clearTimeout(timer)
    frame = timer = 0
    const batch = [...writes.values()]; writes.clear()
    for (const write of batch) write()
  }
  const schedule = () => {
    if (frame || timer) return
    // Paint the selected tab before the synchronous desktop disk bridge runs.
    // The origin journal below already protects reloads during this interval.
    if (viewWindow?.requestAnimationFrame) frame = viewWindow.requestAnimationFrame(() => {
      frame = 0; timer = viewWindow.setTimeout(flush, 0)
    })
    else flush()
  }
  viewWindow?.addEventListener('pagehide', flush)
  viewWindow?.document.addEventListener('visibilitychange', () => { if (viewWindow.document.hidden) flush() })
  return {
    ...handle,
    create(sessionId) {
      const instance = handle.create(sessionId)
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 1_000) return instance
      const key = 'ework.session.view.v1:' + sessionId
      const pendingKey = key + '.pending-native'
      const desktop = typeof window === 'undefined' ? undefined : window.dshDesktop?.researchCanvasStorage
      const origin = () => { try { return localStorage } catch { return undefined } }
      const read = storage => { try { return storage?.getItem(key) ?? null } catch { return null } }
      const clearPending = () => {
        pendingBySession.delete(sessionId)
        writes.delete(sessionId)
        try { origin()?.removeItem(pendingKey) } catch {}
      }
      const save = value => {
        writes.delete(sessionId)
        const previous = read(desktop)
        let acknowledged = false
        try { acknowledged = previous === value || desktop?.setItem(key, value) === true } catch {}
        durableBySession.set(sessionId, acknowledged ? value : previous)
        if (desktop && !acknowledged) {
          const pending = { view: value, previous }
          pendingBySession.set(sessionId, pending)
          try { origin()?.setItem(pendingKey, JSON.stringify(pending)) } catch {}
        } else clearPending()
        try { origin()?.setItem(key, value) } catch { /* Navigation remains usable when storage is unavailable. */ }
      }
      let pending = pendingBySession.get(sessionId)
      if (!pending) {
        try {
          const raw = origin()?.getItem(pendingKey)
          const record = raw && raw.length < 256 ? JSON.parse(raw) : null
          if (record && (isSessionViewId(record.view) || record.view === '') &&
              (record.previous === null || record.previous === '' || isSessionViewId(record.previous))) pending = record
        } catch {}
      }
      const durable = read(desktop)
      durableBySession.set(sessionId, durable)
      // A failed write may be newer than disk. Do not overwrite a later choice
      // made by another page after that failed write.
      const retryPending = pending && (durable === null || durable === pending.previous)
      const legacy = retryPending ? pending.view : durable ?? read(origin())
      const saved = legacy === 'trajectory' ? 'spreadsheet' : legacy
      if (pending && !retryPending) clearPending()
      if (isSessionViewId(saved)) instance.actions.setView(saved)
      else if (saved === '') instance.actions.setView(null)
      if (retryPending || legacy === 'trajectory') save(saved)
      else if (durable === null && (isSessionViewId(saved) || saved === '')) save(saved)
      // Non-default native views are explicit. A legacy Chat snapshot alone
      // cannot distinguish a choice from the old default, so do not promote it.
      else if (saved !== '' && !isSessionViewId(saved) && isSessionViewId(instance.getSnapshot().view) && instance.getSnapshot().view !== 'chat') save(instance.getSnapshot().view)
      return {
        ...instance,
        actions: {
          ...instance.actions,
          setView(view) {
            if (view === 'trajectory') view = 'spreadsheet'
            instance.actions.setView(view)
            if (isSessionViewId(view)) {
              // Keep the first durable baseline when rapid clicks coalesce.
              const baseline = pendingBySession.get(sessionId)
              const pending = { view, previous: baseline ? baseline.previous : durableBySession.get(sessionId) ?? null }
              pendingBySession.set(sessionId, pending)
              try { origin()?.setItem(pendingKey, JSON.stringify(pending)); origin()?.setItem(key, view) } catch {}
              writes.set(sessionId, () => save(view)); schedule()
            }
          }
        },
        clearPersisted() { instance.clearPersisted(); save('') }
      }
    }
  }
}

export function patchSessionViewPreferences(source) {
  const begin = '/* ework:session-view-preferences:v1 */'
  const end = '/* ework:session-view-preferences:end */'
  const helpers = `${begin}\n${isSessionViewId.toString()}\n${hasSessionViewPreference.toString()}\n${installInitialChatViewIntent.toString()}\n${useInitialChatSessionView.toString()}\n${withSessionViewPreferences.toString()}\nfunction createChatStore() { return withSessionViewPreferences(createNativeChatStore()); }\n${end}\n`
  if (source.includes(begin)) {
    const first = source.indexOf(begin), last = source.indexOf(end, first)
    if (last < 0) throw Error('Session view preference helper boundary missing')
    source = source.slice(0, first) + helpers + source.slice(last + end.length).replace(/^\n/, '')
  } else {
    const anchor = 'function createChatStore() {'
    if (source.split(anchor).length !== 2) throw Error('Session view store anchor drifted')
    source = source.replace(anchor, helpers + 'function createNativeChatStore() {')
  }
  const before = 'const persistedResearchRequested = blank && !explicitResearchViewSessions.has(sessionId) && isPersistedResearchSession(sessionId);'
  const previous = 'const persistedResearchRequested = blank && !isSessionViewId(storedView) && !explicitResearchViewSessions.has(sessionId) && isPersistedResearchSession(sessionId);'
  const after = 'const persistedResearchRequested = blank && !hasSessionViewPreference(sessionId, storedView) && !explicitResearchViewSessions.has(sessionId) && isPersistedResearchSession(sessionId);'
  for (const anchor of [before, previous]) {
    if (!source.includes(anchor)) continue
    if (source.split(anchor).length !== 3) throw Error('Session view recovery anchors drifted')
    source = source.replaceAll(anchor, after)
  }
  if (source.split(after).length !== 3) throw Error('Session view recovery anchors missing')
  const init = 'const chatStore = createChatStore();'
  const legacy = init + '\n/* ework:initial-chat-view-intent:v1 */\nctx.effect(() => installInitialChatViewIntent(chatStore, sessions), "ui-conversation: initial Chat view intent");'
  const installed = legacy.replace('installInitialChatViewIntent(chatStore, sessions)', 'installInitialChatViewIntent(chatStore, sessions, researchWorkspaces)')
  if (source.split(legacy).length === 2) source = source.replace(legacy, installed)
  if (source.includes('/* ework:initial-chat-view-intent:')) {
    if (source.split(installed).length !== 2 || source.split('/* ework:initial-chat-view-intent:').length !== 2) throw Error('Initial Chat view intent hook drifted')
  } else {
    if (source.split(init).length !== 2) throw Error('Initial Chat view intent apply anchor drifted')
    source = source.replace(init, installed)
  }
  const rootView = 'const directActiveView = useStore?.((s) => s.view ?? "chat");'
  const rootNext = 'const directActiveView = useInitialChatSessionView(sessionId, useStore?.((s) => s.view ?? "chat"), actions);'
  if (source.includes(rootView)) source = source.replace(rootView, rootNext)
  if (source.split(rootNext).length !== 2) throw Error('Initial Chat root view anchor drifted')
  const scopeView = 'const storedView = useStore((s) => s.view);'
  const scopeNext = 'const storedView = useInitialChatSessionView(sessionId, useStore((s) => s.view), actions);'
  if (source.includes(scopeView)) {
    if (source.split(scopeView).length !== 3) throw Error('Initial Chat scoped view anchors drifted')
    source = source.replaceAll(scopeView, scopeNext)
  }
  if (source.split(scopeNext).length !== 3) throw Error('Initial Chat scoped view anchors missing')
  return source
}
