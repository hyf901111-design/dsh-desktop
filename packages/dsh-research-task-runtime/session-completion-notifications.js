// Read only the last public answer in this turn, never reasoning or tool output.
export function completionPreview(events, endSeq) {
  for (let index = (events?.length ?? 0) - 1; index >= 0; index--) {
    const event = events[index]
    if (event.seq >= endSeq) continue
    if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'user/message') break
    if (event.type !== 'assistant/message') continue
    const content = event.data?.message?.content
    const text = (Array.isArray(content) ? content : [])
      .filter(part => part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text).join(' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>~]+/g, '').replace(/\s+/gu, ' ').trim()
    const characters = Array.from(text)
    return characters.length > 120 ? characters.slice(0, 120).join('') + '…' : text
  }
  return ''
}

// Observe live terminal events only; never replay history or delay execution.
export function registerSessionCompletionNotifications(ctx, { env = process.env, request = fetch } = {}) {
  let endpoint
  try {
    endpoint = new URL(env.SHERLOCK_RESEARCH_CONTEXT_URL)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || !env.SHERLOCK_RESEARCH_CONTEXT_TOKEN) return () => {}
  } catch { return () => {} }
  const seen = new WeakMap()
  const pending = new Set()
  let disposed = false
  const off = ctx.on('session/event', (session, event) => {
    if (disposed || event.type !== 'turn/end' || event.data?.reason?.kind !== 'completed') return
    if (!session.header?.cwd || session.header.origin === 'subagent' || session.header.delegationDepth > 0) return
    if (!Number.isSafeInteger(event.seq) || event.seq < (session.firstLiveSeq ?? 0) || event.seq <= (seen.get(session) ?? -1)) return
    seen.set(session, event.seq)
    const title = session.events?.findLast(e => e.type === 'session/title')?.data?.title
    const preview = completionPreview(session.events, event.seq)
    const controller = new AbortController()
    pending.add(controller)
    // A notification is best effort. Bound lifetime and contain both synchronous
    // and asynchronous transport failures outside the session event observer.
    void Promise.resolve().then(() => {
      if (disposed) return
      return request(`${endpoint.origin}/session-completed`, {
        method: 'POST', redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        headers: { authorization: `Bearer ${env.SHERLOCK_RESEARCH_CONTEXT_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, seq: event.seq, title: typeof title === 'string' ? title.slice(0, 160) : '', preview })
      })
    }).catch(() => {}).finally(() => pending.delete(controller))
  })
  return () => { disposed = true; off(); for (const controller of pending) controller.abort(); pending.clear() }
}
