/** Keep the workspace that owns a document once the document has been edited. */
export function markWorkspaceProjectEdited(document: Document, sessionId: string | null) {
  const window = document.defaultView
  if (!window || !sessionId) return
  try {
    const key = 'sherlock.research.directory-locked.v1:' + sessionId
    if (window.localStorage.getItem(key) === 'true') return
    window.localStorage.setItem(key, 'true')
  } catch {
    return
  }
  document.dispatchEvent(new window.CustomEvent('sherlock:workspace-project-edited', { detail: { sessionId } }))
}
