const OPACITY_PROPERTY = '--odyssey-operations-case-opacity'
const FADE_OUT_MS = 110
const FADE_IN_MS = 170
const ease = (value: number) => value * value * (3 - 2 * value)

export interface HomeOperationsCaseTransition {
  select(index: number): void
  setVisible(visible: boolean): void
  dispose(): void
}

/** Swap the existing case only while its text and artwork are transparent. */
export function createHomeOperationsCaseTransition(options: {
  win: Window
  card: HTMLElement
  initialIndex: number
  onCommit(index: number): void
}): HomeOperationsCaseTransition {
  const { win, card, onCommit } = options
  const doc = card.ownerDocument
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let current = options.initialIndex, target = current
  let visible = false, disposed = false, frame = 0, opacity = 1
  let phase: 'out' | 'in' | null = null
  let started = 0, duration = 0, from = 1

  const paint = (value: number) => {
    opacity = Math.max(0, Math.min(1, value))
    card.style.setProperty(OPACITY_PROPERTY, String(opacity))
  }
  const cancel = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
  }
  const commit = () => {
    if (current === target) return
    current = target
    onCommit(current)
  }
  const flush = () => {
    cancel(); phase = null
    paint(0); commit(); paint(1)
  }
  const canAnimate = () => visible && !doc.hidden && !reduced.matches
  const tick = (time: number) => {
    frame = 0
    if (disposed || !phase) return
    if (!canAnimate()) { flush(); return }
    let fraction = Math.min(1, Math.max(0, (time - started) / duration))
    if (phase === 'out') {
      paint(from * (1 - ease(fraction)))
      if (fraction === 1) {
        // The URL and accessible copy are updated in place at opacity zero.
        paint(0); commit()
        if (disposed) return
        phase = 'in'; started += duration; from = 0; duration = FADE_IN_MS
        fraction = Math.min(1, Math.max(0, (time - started) / duration))
      }
    }
    if (phase === 'in') {
      paint(from + (1 - from) * ease(fraction))
      if (fraction === 1) { phase = null; paint(1) }
    }
    if (phase) frame = win.requestAnimationFrame(tick)
  }
  const begin = (next: 'out' | 'in') => {
    cancel()
    phase = next; started = win.performance.now(); from = opacity
    duration = Math.max(1, next === 'out' ? FADE_OUT_MS * opacity : FADE_IN_MS * (1 - opacity))
    frame = win.requestAnimationFrame(tick)
  }
  const onModeChange = () => { if (!canAnimate()) flush() }
  doc.addEventListener('visibilitychange', onModeChange)
  reduced.addEventListener('change', onModeChange)
  paint(1)

  return {
    select(next) {
      if (disposed || !Number.isFinite(next)) return
      next = Math.max(0, Math.min(2, Math.trunc(next)))
      if (next === target) return
      target = next
      if (!canAnimate()) { flush(); return }
      if (target === current) {
        if (phase === 'out') begin('in')
        return
      }
      // A new destination replaces the pending one; it never queues an old case.
      if (phase !== 'out') begin('out')
    },
    setVisible(next) {
      if (disposed || next === visible) return
      visible = next
      if (!next) flush()
    },
    dispose() {
      if (disposed) return
      flush(); disposed = true
      doc.removeEventListener('visibilitychange', onModeChange)
      reduced.removeEventListener('change', onModeChange)
      card.style.removeProperty(OPACITY_PROPERTY)
    }
  }
}
