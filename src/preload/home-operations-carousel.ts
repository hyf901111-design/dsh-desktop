const CASE_DURATION_MS = 6000
export const HOME_OPERATIONS_CASE_COUNT = 6
const PROGRESS_PROPERTY = '--odyssey-operations-case-progress'

export interface HomeOperationsCarousel {
  setVisible(visible: boolean): void
  select(index: number): void
  dispose(): void
}

/** The timer owns case selection and track progress, independently of scrolling. */
export function createHomeOperationsCarousel(options: {
  win: Window
  card: HTMLElement
  initialIndex: number
  onChange(index: number): void
}): HomeOperationsCarousel {
  const { win, card, onChange } = options
  const doc = card.ownerDocument
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let index = Math.max(0, Math.min(HOME_OPERATIONS_CASE_COUNT - 1, Math.trunc(options.initialIndex)))
  let elapsed = 0, lastTime: number | null = null, frame = 0
  let visible = false, hovered = false, keyboardFocused = false, disposed = false

  const canRun = () => visible && !doc.hidden && !reduced.matches && !hovered && !keyboardFocused
  const render = () => card.style.setProperty(PROGRESS_PROPERTY, String(Math.min(1, elapsed / CASE_DURATION_MS)))
  const account = (now: number) => {
    if (lastTime === null) return
    elapsed += Math.max(0, now - lastTime)
    lastTime = now
    const advances = Math.floor(elapsed / CASE_DURATION_MS)
    if (advances) {
      elapsed %= CASE_DURATION_MS
      index = (index + advances) % HOME_OPERATIONS_CASE_COUNT
      onChange(index)
    }
  }
  const cancel = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0; lastTime = null
  }
  const tick = (time: number) => {
    frame = 0
    if (disposed || !canRun()) { lastTime = null; return }
    account(time); render()
    if (!disposed && canRun()) frame = win.requestAnimationFrame(tick)
  }
  const sync = () => {
    if (disposed) return
    const now = win.performance.now()
    account(now)
    if (!canRun()) cancel()
    else if (!frame) { lastTime = now; frame = win.requestAnimationFrame(tick) }
    render()
  }
  const syncFocus = () => {
    if (disposed) return
    const focused = doc.activeElement
    keyboardFocused = !!focused && card.contains(focused) && focused.matches(':focus-visible')
    sync()
  }
  const onPointerEnter = () => { hovered = true; sync() }
  const onPointerLeave = () => { hovered = false; sync() }
  const onPointerDown = () => {
    // A mouse-selected page may retain focus after the pointer leaves. Only
    // keyboard focus pauses the carousel beyond that pointer interaction.
    keyboardFocused = false
    sync()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    keyboardFocused = true
    sync()
  }
  const onFocusOut = () => win.queueMicrotask(syncFocus)
  card.addEventListener('pointerenter', onPointerEnter)
  card.addEventListener('pointerleave', onPointerLeave)
  card.addEventListener('pointerdown', onPointerDown)
  card.addEventListener('keydown', onKeyDown)
  card.addEventListener('focusin', syncFocus)
  card.addEventListener('focusout', onFocusOut)
  doc.addEventListener('visibilitychange', sync)
  reduced.addEventListener('change', sync)
  render()

  return {
    setVisible(next) {
      if (disposed || visible === next) return
      visible = next
      if (next) {
        hovered = card.matches(':hover')
        const focused = doc.activeElement
        keyboardFocused = !!focused && card.contains(focused) && focused.matches(':focus-visible')
      }
      sync()
    },
    select(next) {
      if (disposed || !Number.isFinite(next)) return
      index = Math.max(0, Math.min(HOME_OPERATIONS_CASE_COUNT - 1, Math.trunc(next)))
      elapsed = 0
      lastTime = frame ? win.performance.now() : null
      onChange(index)
      sync()
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancel()
      card.removeEventListener('pointerenter', onPointerEnter)
      card.removeEventListener('pointerleave', onPointerLeave)
      card.removeEventListener('pointerdown', onPointerDown)
      card.removeEventListener('keydown', onKeyDown)
      card.removeEventListener('focusin', syncFocus)
      card.removeEventListener('focusout', onFocusOut)
      doc.removeEventListener('visibilitychange', sync)
      reduced.removeEventListener('change', sync)
      card.style.removeProperty(PROGRESS_PROPERTY)
    }
  }
}
