export function presentationCodec() {
  return {
    trigger: '@',
    name: 'presentation-reference',
    order: 10006,
    candidates: async () => [],
    onPick: () => undefined,
    codec: {
      clipboardText: (raw) => JSON.parse(raw).label,
      serialize: async (raw) => {
        const r = JSON.parse(raw)
        return '〔演示引用 ' + JSON.stringify(r.label) + ' #' + r.token + '〕'
      }
    }
  }
}
// A provisional reference follows the current selection. Focusing the composer
// pins it at the caret through the same InputMachine used by Notes and Research.
export function installPresentationReferences({ win, doc, sessions, getInput }) {
  const carets = new WeakMap()
  const comments = new Map()
  let pending, ghost, shellOff, observed
  const publish = () => {
    for (const [id, value] of comments) {
      if (value.shell.disposed || !value.shell.snapshot.occurrences.some(o => o.occurrenceId === id)) comments.delete(id)
    }
    const sessionId = doc.body.dataset.eworkPresentationSession
    if (!sessionId || !observed) return
    const ids = observed.snapshot.occurrences.flatMap((o) => {
      if (o.source !== 'presentation-reference') return []
      try {
        const r = JSON.parse(o.ref)
        return r.kind === 'mark' ? [r.id] : []
      } catch {
        return []
      }
    })
    win.dispatchEvent(
      new win.CustomEvent('sherlock:presentation-referenced-marks', { detail: { sessionId, ids } })
    )
  }
  const observe = (shell) => {
    if (shell === observed) return
    shellOff?.()
    observed = shell
    shellOff = shell?.state?.subscribe(publish)
    publish()
  }
  const clear = () => {
    pending = undefined
    ghost?.remove()
    ghost = undefined
  }
  const active = (ref) => {
    if (
      !ref ||
      sessions.list.getSnapshot().current !== ref.sessionId ||
      doc.body.dataset.eworkPresentationSession !== ref.sessionId
    )
      return
    const input = [
      ...doc.querySelectorAll('[data-research-composer-host] textarea[data-odyssey-file-reference-session]')
    ].find(
      (el) =>
        el.dataset.odysseyFileReferenceSession === ref.sessionId && el.getClientRects().length && !el.disabled
    )
    const shell = getInput(ref.sessionId)
    if (input && shell && !shell.disposed && shell.snapshot.phase === 'plain') {
      observe(shell)
      return { input, shell }
    }
  }
  const insert = (ref, state) => {
    const { input, shell } = state,
      before = shell.snapshot
    if (before.occurrences.filter((o) => o.source === 'presentation-reference').length >= 24) {
      shell.notify('error', '一条消息最多引用 24 个演示选区。')
      return
    }
    const hint = carets.get(input)
    const offset =
      hint?.revision === before.draftRev
        ? hint.offset
        : input.value.length === before.draft.length
          ? (input.selectionEnd ?? before.draft.length)
          : before.draft.length
    const accepted = shell.insertReference(
      {
        source: 'presentation-reference',
        ref: JSON.stringify(ref),
        label: ref.label,
        clipboardText: ref.label
      },
      { start: offset, end: offset, draftRev: before.draftRev }
    )
    if (accepted) {
      const snapshot = shell.snapshot,
        caret = offset + snapshot.draft.length - before.draft.length
      carets.set(input, { revision: snapshot.draftRev, offset: caret })
      win.requestAnimationFrame(() => {
        if (
          input.isConnected &&
          shell.snapshot.draftRev === snapshot.draftRev &&
          input.value === snapshot.draft
        ) {
          input.setSelectionRange(caret, caret)
          carets.delete(input)
        }
      })
    }
  }
  const select = (event) => {
    if (event.detail?.kind !== 'mark-comment') clear()
    const raw = event.detail,
      state = active(raw)
    if (!state) return
    if (raw.kind === 'mark-comment') {
      if (typeof raw.comment !== 'string' || raw.comment.length > 1000) return
      const { shell } = state
      const occurrence = shell.snapshot.occurrences.find(o => {
        if (o.source !== 'presentation-reference') return false
        try { const r = JSON.parse(o.ref); return r.kind === 'mark' && r.id === raw.id && r.documentId === raw.documentId && r.slideId === raw.slideId } catch { return false }
      })
      if (!occurrence) return
      const prior = comments.get(occurrence.occurrenceId)
      const start = occurrence.offset + 1 + (shell.snapshot.draft[occurrence.offset + 1] === ' ' ? 1 : 0)
      const end = start + (prior?.text.length ?? 0)
      // Own only the comment inserted for this native reference. Preserve other drafts and later user edits.
      if (prior && (prior.shell !== shell || shell.snapshot.draft.slice(start, end) !== prior.text)) return
      if (shell.insertText(raw.comment, { start, end, draftRev: shell.snapshot.draftRev }))
        comments.set(occurrence.occurrenceId, { shell, text: raw.comment })
      return
    }
    if (raw.kind === 'removed-mark') {
      const { shell } = state
      const matches = shell.snapshot.occurrences.filter((o) => {
        if (o.source !== 'presentation-reference') return false
        try {
          return JSON.parse(o.ref).id === raw.id
        } catch {
          return false
        }
      })
      for (const o of matches.reverse()) {
        const draft = shell.snapshot.draft
        shell.setDraft(draft.slice(0, o.offset) + draft.slice(o.offset + 1), {
          start: o.offset,
          end: o.offset + 1,
          insertedLength: 0
        })
      }
      return
    }
    if (typeof raw.label !== 'string' || !raw.kind) return
    const ref = { ...raw, token: win.crypto.randomUUID().replaceAll('-', '').slice(0, 12) }
    const same = state.shell.snapshot.occurrences.some((o) => {
      if (o.source !== 'presentation-reference') return false
      try {
        const r = JSON.parse(o.ref)
        return (
          r.documentId === ref.documentId &&
          r.slideId === ref.slideId &&
          r.kind === ref.kind &&
          r.id === ref.id &&
          r.start === ref.start &&
          r.quote === ref.quote
        )
      } catch {
        return false
      }
    })
    if (same) return
    if (raw.explicit) {
      insert(ref, state)
      return
    }
    const backdrop = state.input.parentElement?.querySelector('[data-input-backdrop]')
    if (!backdrop) return
    pending = ref
    ghost = doc.createElement('span')
    ghost.className = 'ew-sheet-pending-reference'
    ghost.dataset.provisional = 'true'
    ghost.dataset.referenceSource = 'presentation-reference'
    const glyph = doc.createElement('span')
    glyph.className = 'ew-presentation-chip-icon'
    glyph.setAttribute('aria-hidden', 'true')
    const label = doc.createElement('span')
    label.textContent = ref.label
    ghost.append(glyph, label)
    backdrop.append(ghost)
  }
  const confirm = (event) => {
    const ref = pending,
      state = active(ref)
    if (!state || !event.isTrusted || event.target !== state.input) return
    clear()
    insert(ref, state)
  }
  const esc = (e) => {
    if (e.key === 'Escape') clear()
  }
  const off = sessions.list.subscribe(() => {
    if (pending && !active(pending)) clear()
  })
  win.addEventListener('sherlock:presentation-selection', select)
  doc.addEventListener('focusin', confirm, true)
  doc.addEventListener('pointerup', confirm, true)
  doc.addEventListener('keydown', esc, true)
  return () => {
    off()
    shellOff?.()
    comments.clear()
    clear()
    win.removeEventListener('sherlock:presentation-selection', select)
    doc.removeEventListener('focusin', confirm, true)
    doc.removeEventListener('pointerup', confirm, true)
    doc.removeEventListener('keydown', esc, true)
  }
}
export function presentationMessageParts(text) {
  if (typeof text !== 'string') return null
  const parts = []
  let cursor = 0
  for (const m of text.matchAll(/〔演示引用 ("(?:[^"\\\n]|\\.)*") #[a-f0-9]{12}〕/g)) {
    if (m.index > cursor) parts.push({ text: text.slice(cursor, m.index) })
    parts.push({ source: 'presentation-reference', label: JSON.parse(m[1]) })
    cursor = m.index + m[0].length
  }
  if (!parts.length) return null
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}
