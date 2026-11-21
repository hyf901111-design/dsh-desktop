export function installImageHistoryNavigation({ doc, win, sessions, storage, historyTab, isBoardOnly, viewFor }) {
  let pick = 0, navigation = 0
  const invalidate = () => { navigation++ }
  const picked = event => {
    const id = event.detail?.sessionId
    const request = ++pick
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(id)) return
    // Both the native workspace row and the search dialog finish their normal close/open events first.
    queueMicrotask(async () => {
      const surfaceVersion = navigation
      const selected = () => request === pick && surfaceVersion === navigation && sessions.list.getSnapshot().current === id &&
        !isBoardOnly(id) && (!viewFor || viewFor(id) === 'chat')
      if (!selected() || !storage?.read || !win.fetch) return
      try {
        let { tab, epoch } = historyTab?.(id) ?? {}
        if (epoch === undefined) {
          const saved = await storage.read()
          epoch = saved.epoch
          tab = [...saved.tabs, ...(saved.closed ?? [])].find(item => item.scope === id)
        }
        if (!selected()) return
        if (tab?.temporary) return
        const dedicated = /^image-task-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id)
        const canvas = await storage.hasCanvas(id, epoch)
        if (!selected() || !tab && !canvas && !dedicated) return
        const response = await win.fetch('/sherlock/image-factory/history-mode', {
          method: 'POST', headers: { 'content-type':'application/json' },
          body: JSON.stringify({ sessionId:id })
        })
        if (!response.ok || !selected()) return
        const { mode } = await response.json()
        if (!selected()) return
        if (mode === 'image' || canvas && (mode === 'legacy-image' || mode === 'legacy' && dedicated) ||
            mode === 'unused' && (canvas || dedicated && tab?.title && !tab.temporary)) {
          doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-restore-history', { detail:{ sessionId:id } }))
        }
      } catch { /* A stale account or missing history leaves the native session open. */ }
    })
  }
  const selectionEvents = ['sherlock:history-session-selected', 'sherlock:search-session-opened']
  for (const name of selectionEvents) doc.addEventListener(name, picked)
  doc.addEventListener('sherlock:workspace-surface-change', invalidate)
  doc.addEventListener('sherlock:image-factory-reset', invalidate)
  return () => {
    pick++; invalidate()
    for (const name of selectionEvents) doc.removeEventListener(name, picked)
    doc.removeEventListener('sherlock:workspace-surface-change', invalidate)
    doc.removeEventListener('sherlock:image-factory-reset', invalidate)
  }
}
