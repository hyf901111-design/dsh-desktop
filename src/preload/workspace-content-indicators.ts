import { workspaceContentViews, type WorkspaceContentView } from '../shared/navigation-shortcuts'
import { findWorkspaceSession, observeWorkspaceViews, sessionWorkspaceViews } from './workspace-view-shortcuts'

/** Project content without replacing any of the tab buttons or their focus. */
export function mountWorkspaceContentIndicators(document: Document, read: (
  sessionId: string | null, views: readonly WorkspaceContentView[]
) => Promise<WorkspaceContentView[]>) {
  const win = document.defaultView!
  const root = document.documentElement
  let owner: string | null = null
  let requested: WorkspaceContentView[] = []
  let available: WorkspaceContentView[] = []
  let revision = 0
  let loading = false
  let open = false
  let frame = 0
  let disposed = false
  const publish = () => {
    const header = findWorkspaceSession(document)
    const hasChat = !!owner && header?.dataset.eworkNotesSession === owner && header.hasAttribute('data-workspace-chat-content')
    const next = (hasChat ? ['chat', ...available] : available).join(' ')
    if (next) {
      if (root.dataset.workspaceViewContent !== next) root.dataset.workspaceViewContent = next
    } else if (root.hasAttribute('data-workspace-view-content')) root.removeAttribute('data-workspace-view-content')
  }
  const refresh = () => {
    if (document.hidden || loading || !requested.length || !open) return
    const ticket = revision
    loading = true
    void read(owner, requested).then(result => {
      if (!disposed && ticket === revision) {
        available = result
        publish()
      }
    }).catch(() => {}).finally(() => {
      loading = false
      if (!disposed && ticket !== revision) refresh()
    })
  }
  const sync = () => {
    frame = 0
    const header = findWorkspaceSession(document)
    const onHome = !document.body.dataset.workspaceSurface && header?.closest('.wSkVaW_root')?.getAttribute('data-odyssey-page') === 'home'
    const nextOwner = onHome ? null : header?.dataset.eworkNotesSession || null
    const next = nextOwner
      ? workspaceContentViews.filter(view => sessionWorkspaceViews(document).some(([id]) => id === view))
      : []
    const changed = nextOwner !== owner || next.join() !== requested.join()
    const expanded = !!document.querySelector('.eb-workspace-tabs[aria-hidden=false]')
    const opened = expanded && !open
    open = expanded
    if (changed) {
      owner = nextOwner
      requested = next
      available = []
      revision++
    }
    if (changed || opened) refresh()
    publish()
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(sync) }
  const onIdentity = () => {
    revision++
    available = []
    publish()
    refresh()
  }
  const observer = new win.MutationObserver(schedule)
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['aria-hidden', 'data-ework-notes-session', 'data-workspace-chat-content', 'data-odyssey-page', 'data-workspace-surface']
  })
  const unobserve = observeWorkspaceViews(document, schedule)
  document.addEventListener('sherlock:knowledge-identity-changed', onIdentity)
  document.addEventListener('sherlock:workspace-surface-change', refresh)
  document.addEventListener('visibilitychange', refresh)
  const timer = win.setInterval(refresh, 1200)
  sync()
  return () => {
    disposed = true
    observer.disconnect()
    unobserve()
    win.cancelAnimationFrame(frame)
    win.clearInterval(timer)
    document.removeEventListener('sherlock:knowledge-identity-changed', onIdentity)
    document.removeEventListener('sherlock:workspace-surface-change', refresh)
    document.removeEventListener('visibilitychange', refresh)
    root.removeAttribute('data-workspace-view-content')
  }
}
