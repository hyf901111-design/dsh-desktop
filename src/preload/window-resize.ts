/** Forward the macOS window's resize borders and the home header's blank drag area. */
export function mountWindowResize(doc: Document, send: (gesture: string | { dx: number; dy: number } | null) => void): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  const host = doc.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.dataset.odysseyWindowResize = ''
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = doc.createElement('style')
  style.textContent = `:host{position:fixed;inset:0;z-index:2147483647;pointer-events:none}div{position:absolute;pointer-events:auto;-webkit-app-region:no-drag;touch-action:none} [data-edge=n],[data-edge=s]{left:24px;right:24px;height:10px;cursor:ns-resize}[data-edge=n]{top:0}[data-edge=s]{bottom:0}[data-edge=e],[data-edge=w]{top:24px;bottom:24px;width:10px;cursor:ew-resize}[data-edge=e]{right:0}[data-edge=w]{left:0}[data-edge=ne],[data-edge=nw],[data-edge=se],[data-edge=sw]{width:24px;height:24px}[data-edge=ne],[data-edge=nw]{top:0}[data-edge=se],[data-edge=sw]{bottom:0}[data-edge=ne],[data-edge=se]{right:0}[data-edge=nw],[data-edge=sw]{left:0}[data-edge=nw]{clip-path:polygon(0 0,100% 0,100% 10px,10px 10px,10px 100%,0 100%)}[data-edge=ne]{clip-path:polygon(0 0,100% 0,100% 100%,14px 100%,14px 10px,0 10px)}[data-edge=sw]{clip-path:polygon(0 0,10px 0,10px 14px,100% 14px,100% 100%,0 100%)}[data-edge=se]{clip-path:polygon(14px 0,100% 0,100% 100%,0 100%,0 14px,14px 14px)}[data-edge=nw],[data-edge=se]{cursor:nwse-resize}[data-edge=ne],[data-edge=sw]{cursor:nesw-resize}`
  shadow.append(style)
  let active = false
  let moveOrigin: { pointerId: number; x: number; y: number; dx: number; dy: number } | undefined
  const stop = () => { if (active) { active = false; moveOrigin = undefined; send(null) } }
  const start = (target: HTMLElement, operation: string, event: PointerEvent) => {
    if (active || !event.isTrusted || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    active = true
    target.setPointerCapture(event.pointerId)
    target.addEventListener('lostpointercapture', stop, { once: true })
    if (operation === 'move') moveOrigin = { pointerId: event.pointerId, x: event.screenX, y: event.screenY, dx: 0, dy: 0 }
    send(operation)
  }
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const handle = doc.createElement('div')
    handle.dataset.edge = edge
    handle.addEventListener('pointerdown', event => start(handle, edge, event))
    shadow.append(handle)
  }
  const moveWindow = (event: PointerEvent) => {
    if (!event.isTrusted || moveOrigin?.pointerId !== event.pointerId) return
    const dx = event.screenX - moveOrigin.x, dy = event.screenY - moveOrigin.y
    if (dx === moveOrigin.dx && dy === moveOrigin.dy) return
    moveOrigin.dx = dx
    moveOrigin.dy = dy
    send({ dx, dy })
  }
  const finish = (event: PointerEvent) => { moveWindow(event); stop() }
  win.addEventListener('pointermove', moveWindow, true)
  win.addEventListener('pointerup', finish, true)
  win.addEventListener('pointercancel', stop, true)
  win.addEventListener('blur', stop)
  const move = (event: PointerEvent) => {
    const target = event.target instanceof win.Element ? event.target.closest<HTMLElement>('[data-odyssey-window-move]') : undefined
    if (!target || win.getComputedStyle(target).getPropertyValue('--odyssey-popup-window-drag').trim() === 'no-drag') return
    start(target, 'move', event)
  }
  doc.documentElement.setAttribute('data-odyssey-native-window-move', '')
  doc.addEventListener('pointerdown', move)
  // The application can replace body children during its initial React mount.
  doc.documentElement.append(host)
  return () => {
    stop()
    host.remove()
    doc.documentElement.removeAttribute('data-odyssey-native-window-move')
    doc.removeEventListener('pointerdown', move)
    win.removeEventListener('pointermove', moveWindow, true)
    win.removeEventListener('pointerup', finish, true)
    win.removeEventListener('pointercancel', stop, true)
    win.removeEventListener('blur', stop)
  }
}
