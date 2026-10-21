/** Bound uncooperative transports too; late results never enter the review sink. */
export function abortable(operation, signal) {
  signal?.throwIfAborted()
  if (!signal) return Promise.resolve(operation)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('挑战检查已取消。'))
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function deadline(parent, milliseconds) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('挑战检查超时。')), milliseconds)
  timer.unref?.()
  return { signal: parent ? AbortSignal.any([parent, controller.signal]) : controller.signal, dispose: () => clearTimeout(timer) }
}

export function uniqueQuote(text, quote) {
  if (typeof text !== 'string' || typeof quote !== 'string' || !quote.trim()) return false
  const start = text.indexOf(quote)
  return start >= 0 && text.indexOf(quote, start + 1) < 0
}
