/** Clear admitted input immediately; a failed attempt may only restore its own untouched slot. */
export function admitSharedDraft(shell: any) {
  const before = shell?.snapshot
  if (!before) return { restore: () => false, untouched: () => false }
  shell.commitSend([], before.draft)
  const revision = shell.snapshot.draftRev
  const untouched = () => shell.snapshot.draftRev === revision && !shell.snapshot.draft
  return {
    untouched,
    restore: () => {
      if (!untouched()) return false
      shell.restoreDraftState(before)
      return true
    }
  }
}
