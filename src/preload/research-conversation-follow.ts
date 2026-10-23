import { anchorConversationDisclosures } from '../../packages/dsh-research-task-runtime/conversation-disclosure.js'

/** Follow the actual Research scrollports, including the portaled native chat. */
export function followResearchConversation(panel: HTMLElement) {
  const win = panel.ownerDocument.defaultView!
  let following = true, disposed = false, frame = 0
  const positions = new Map<HTMLElement, number>()
  const ports = () => [...new Set([
    panel.querySelector<HTMLElement>('[data-conversation-scroll]'),
    panel.querySelector<HTMLElement>('[data-research-conversation-host]'),
    panel.querySelector<HTMLElement>('[data-chat-flow]')?.parentElement
  ].filter((p): p is HTMLElement => !!p))]
  const revealing = () => [...panel.querySelectorAll('[data-ai-revealing]')].some(root => !root.closest('[hidden],[inert],[aria-hidden="true"]'))
  const settle = () => {
    frame = 0
    if (disposed || !following) return
    for (const port of ports()) {
      // The page's native follower owns the visible text frontier while revealing.
      if(revealing()){positions.set(port,port.scrollTop);continue}
      if (port.clientHeight && port.scrollHeight > port.clientHeight) port.scrollTop = port.scrollHeight
      positions.set(port, port.scrollTop)
    }
  }
  const schedule = () => { if (!disposed && following && !frame) frame = win.requestAnimationFrame(settle) }
  const scroll = (event: Event) => {
    const port = event.target as HTMLElement
    if (!ports().includes(port)) return
    if (port.dataset.conversationAnchoring) { positions.set(port, port.scrollTop); return }
    if(revealing()){positions.set(port,port.scrollTop);return}
    const previous = positions.get(port) ?? port.scrollTop
    if (port.scrollTop < previous - 2) following = false
    else if (port.scrollHeight - port.clientHeight - port.scrollTop < 40) following = true
    positions.set(port, port.scrollTop)
  }
  // Stop pending layout settles as soon as the reader intentionally scrolls up.
  const wheel = (event: WheelEvent) => { if (event.deltaY < 0 || revealing()) following = false }
  const key = (event: KeyboardEvent) => {
    if ((['PageUp', 'Home', 'ArrowUp'].includes(event.key) || revealing() && ['PageDown','End','ArrowDown'].includes(event.key)) && !(event.target as HTMLElement)?.closest('input,textarea,[contenteditable]')) following = false
  }
  const pointer=()=>{if(revealing())following=false}
  const revealFrame=()=>{if(revealing()){for(const port of ports())positions.set(port,port.scrollTop)}else schedule()}
  const observer = new win.MutationObserver(() => { observeSizes(); schedule() })
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : undefined
  const observed = new Set<Element>()
  const observeSizes = () => {
    for (const element of observed) if (!panel.contains(element)) { resize?.unobserve(element); observed.delete(element) }
    for (const port of ports()) for (const element of [port, ...port.children]) {
      if (!observed.has(element)) { observed.add(element); resize?.observe(element) }
    }
  }
  observer.observe(panel, { childList: true, subtree: true, characterData: true })
  panel.addEventListener('scroll', scroll, true)
  panel.addEventListener('wheel', wheel, { passive: true })
  panel.addEventListener('keydown', key)
  panel.addEventListener('pointerdown',pointer,true)
  panel.addEventListener('sherlock:assistant-reveal-frame',revealFrame)
  const stopAnchoring = anchorConversationDisclosures(panel, ports, () => { following = false })
  observeSizes()
  settle()
  schedule()
  return () => {
    disposed = true
    stopAnchoring()
    win.cancelAnimationFrame(frame)
    observer.disconnect()
    resize?.disconnect()
    panel.removeEventListener('scroll', scroll, true)
    panel.removeEventListener('wheel', wheel)
    panel.removeEventListener('keydown', key)
    panel.removeEventListener('pointerdown',pointer,true)
    panel.removeEventListener('sherlock:assistant-reveal-frame',revealFrame)
  }
}
