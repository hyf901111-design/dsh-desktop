/** Keep a disclosure header under the reader's eyes while its body grows below. */
export function anchorConversationDisclosures(root, ports, onRead = () => {}) {
  const win = root.ownerDocument.defaultView
  let frame = 0, restore
  const finish = () => { win.cancelAnimationFrame(frame); restore?.(); restore = undefined }
  const click = event => {
    const control = event.target?.closest?.('summary,button[aria-expanded]')
    if (!control || !root.contains(control) || !control.closest('[data-chat-flow], [data-shared-native-task], .odyssey-canvas-task-message')) return
    finish()
    const scrollports = [...new Set(ports())].filter(port => port && port.contains(control))
    if (!scrollports.length) return
    const top = control.getBoundingClientRect().top
    for (const port of scrollports) {
      port.dataset.conversationReading = 'true'
      port.dataset.conversationAnchoring = 'true'
    }
    onRead()
    restore = () => scrollports.forEach(port => {
      delete port.dataset.conversationAnchoring
    })
    const settle = () => {
      if (!control.isConnected) return
      // Inner-to-outer: once the inner port has restored the header, the outer
      // port sees zero displacement instead of applying the same delta twice.
      for (const port of [...scrollports].reverse()) {
        const delta = control.getBoundingClientRect().top - top
        if (Math.abs(delta) > .5) port.scrollTop += delta
      }
    }
    frame = win.requestAnimationFrame(() => {
      settle()
      frame = win.requestAnimationFrame(() => { settle(); finish() })
    })
  }
  root.addEventListener('click', click, true)
  return () => { finish(); root.removeEventListener('click', click, true) }
}
