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
        body: JSON.stringify({ sessionId: session.id, seq: event.seq, title: typeof title === 'string' ? title.slice(0, 160) : '' })
      })
    }).catch(() => {}).finally(() => pending.delete(controller))
  })
  return () => { disposed = true; off(); for (const controller of pending) controller.abort(); pending.clear() }
}
