// Serialized into isolated documents. A wheel gesture belongs to the nearest
// scrollable ancestor that still has room along the gesture's dominant axis.
export function researchFrameWheelMessage(event, interactive) {
  if (!event.isTrusted || event.defaultPrevented || !event.cancelable) return null
  const {deltaX, deltaY} = event
  if (!deltaX && !deltaY) return null
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
  const axis = vertical ? 'overflowY' : 'overflowX'
  const delta = vertical ? deltaY : deltaX
  const zoom = event.metaKey || event.ctrlKey
  if (interactive && !zoom) {
    for (const el of event.composedPath()) {
      if (el.nodeType !== 1) continue
      const root = el === document.scrollingElement
      let overflow = getComputedStyle(el)[axis]
      if (root && overflow === 'visible' && el === document.documentElement && document.body) {
        overflow = getComputedStyle(document.body)[axis]
      }
      if (!(/^(auto|scroll|overlay)$/.test(overflow) || root && overflow === 'visible')) continue
      const max = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
      if (max <= 1) continue
      const position = vertical ? el.scrollTop : el.scrollLeft
      const rtl = !vertical && getComputedStyle(el).direction === 'rtl'
      const minPosition = rtl ? -max : 0, maxPosition = rtl ? 0 : max
      if (delta > 0 ? position < maxPosition - 1 : position > minPosition + 1) return null
    }
  }
  const viewport = document.documentElement
  const pixels = (amount, extent) => Math.max(-4096, Math.min(4096,
    amount * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? extent : 1)))
  return {
    type: zoom ? 'sherlock-content-zoom' : 'sherlock-content-pan',
    x: Math.max(0, Math.min(1, event.clientX / Math.max(1, viewport.clientWidth))),
    y: Math.max(0, Math.min(1, event.clientY / Math.max(1, viewport.clientHeight))),
    deltaX: pixels(deltaX, viewport.clientWidth), deltaY: pixels(deltaY, viewport.clientHeight),
    ...(zoom ? {ctrlKey: event.ctrlKey} : {})
  }
}

// Used only in the board representation of a local file. A file shown in a
// separate viewer keeps its native scrolling until a board supplies selection.
function installBoardFileWheel(frameWheel) {
  if (parent === window) return
  let selected = null
  addEventListener('message', event => {
    const data = event.data
    if (event.source === parent && data?.type === 'sherlock-workbench-selection' &&
        Object.keys(data).length === 2 && typeof data.selected === 'boolean') selected = data.selected
  })
  document.addEventListener('wheel', event => {
    if (selected === null || event.metaKey || event.ctrlKey || event.altKey) return
    const message = frameWheel(event, selected)
    if (!message) return
    event.preventDefault()
    parent.postMessage(message, '*')
  }, {passive: false})
}

export const boardFileWheelScript = '(' + installBoardFileWheel.toString() + ')(' + researchFrameWheelMessage.toString() + ')'
export const boardFileWheelSuffix = '\n<script>' + boardFileWheelScript + '</script>'
