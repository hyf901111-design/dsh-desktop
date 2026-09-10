/** The page owns workspace stores; exchange only the correlated result across worlds. */
export function requestUpdatePagePreparation(doc: Document): Promise<void> {
  const win = doc.defaultView!, requestId = win.crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => { win.clearTimeout(timer); win.removeEventListener('sherlock:boards:reply', reply) }
    const reply = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (data?.requestId !== requestId) return
      cleanup()
      data.ok === true ? resolve() : reject(Error(typeof data.error === 'string' ? data.error : '研究保存失败'))
    }
    const timer = win.setTimeout(() => { cleanup(); win.dispatchEvent(new win.Event('sherlock:boards:update-resume')); reject(Error('研究页面保存超时，请重试更新。')) }, 35_000)
    win.addEventListener('sherlock:boards:reply', reply)
    win.dispatchEvent(new win.CustomEvent('sherlock:boards:request', { detail: { requestId, action: 'prepare-update' } }))
  })
}
