export function isSessionViewId(value) {
  return ['chat', 'research', 'notes', 'trajectory'].includes(value)
}

/** Keep the native per-session store/drafts; persist only the navigation preference. */
export function withSessionViewPreferences(handle) {
  const pendingBySession = new Map()
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
        try { origin()?.removeItem(pendingKey) } catch {}
      }
      const save = value => {
        const previous = read(desktop)
        let acknowledged = false
        try { acknowledged = desktop?.setItem(key, value) === true } catch {}
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
      // A failed write may be newer than disk. Do not overwrite a later choice
      // made by another page after that failed write.
      const retryPending = pending && (durable === null || durable === pending.previous)
      const saved = retryPending ? pending.view : durable ?? read(origin())
      if (pending && !retryPending) clearPending()
      if (isSessionViewId(saved)) instance.actions.setView(saved)
      else if (saved === '') instance.actions.setView(null)
      if (retryPending) save(saved)
      else if (durable === null && (isSessionViewId(saved) || saved === '')) save(saved)
      // Migrate an existing native session preference without changing its draft.
      else if (saved !== '' && !isSessionViewId(saved) && isSessionViewId(instance.getSnapshot().view)) save(instance.getSnapshot().view)
      return {
        ...instance,
        actions: {
          ...instance.actions,
          setView(view) {
            instance.actions.setView(view)
            if (isSessionViewId(view)) save(view)
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
  const helpers = `${begin}\n${isSessionViewId.toString()}\n${withSessionViewPreferences.toString()}\nfunction createChatStore() { return withSessionViewPreferences(createNativeChatStore()); }\n${end}\n`
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
  const after = 'const persistedResearchRequested = blank && !isSessionViewId(storedView) && !explicitResearchViewSessions.has(sessionId) && isPersistedResearchSession(sessionId);'
  if (source.includes(before)) {
    if (source.split(before).length !== 3) throw Error('Session view recovery anchors drifted')
    source = source.replaceAll(before, after)
  } else if (source.split(after).length !== 3) throw Error('Session view recovery anchors missing')
  return source
}
