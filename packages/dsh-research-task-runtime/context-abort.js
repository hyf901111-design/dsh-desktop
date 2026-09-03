// For boundaries not owned by this runtime (transport/injected loaders). Owned
// extractors instead await their abort cleanup before settling.
export async function abortable(run, signal) {
  signal?.throwIfAborted()
  if (!signal) return run()
  let onAbort
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return run() }), aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
