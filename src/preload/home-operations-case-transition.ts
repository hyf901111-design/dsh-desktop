const CROSSFADE_MS = 400
const ease = (value: number) => value * value * (3 - 2 * value)

export interface HomeOperationsCaseTransition {
  select(index: number): void
  setVisible(visible: boolean): void
  dispose(): void
}

type CaseLayer = { node: HTMLElement, index: number, weight: number, from: number }

/** Mix complete cases in a transparent isolated group, leaving the card shell steady. */
export function createHomeOperationsCaseTransition(options: {
  win: Window
  card: HTMLElement
  initialIndex: number
  createLayer(index: number): HTMLElement
  onCommit(index: number): void
}): HomeOperationsCaseTransition {
  const { win, card, createLayer, onCommit } = options
  const doc = card.ownerDocument
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  const stack = doc.createElement('div')
  stack.className = 'odyssey-operations-case-stack'
  card.prepend(stack)
  const layers = new Map<number, CaseLayer>()
  let target = options.initialIndex
  let visible = false, disposed = false, frame = 0, started = 0, running = false

  const addLayer = (index: number) => {
    const node = createLayer(index)
    node.classList.add('odyssey-operations-case-layer')
    node.dataset.odysseyOperationsCaseLayer = ''
    node.dataset.case = String(index)
    const layer = { node, index, weight: 0, from: 0 }
    layers.set(index, layer)
    // The newest semantic copy is first; all older visual copies are inert.
    stack.prepend(node)
    return layer
  }
  const paint = () => {
    for (const layer of layers.values()) {
      layer.node.style.opacity = String(layer.weight)
      const semantic = layer.index === target
      layer.node.inert = !semantic
      layer.node.setAttribute('aria-hidden', String(!semantic))
    }
  }
  const cancel = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
  }
  const finish = () => {
    cancel(); running = false
    const selected = layers.get(target) || addLayer(target)
    for (const [index, layer] of layers) {
      if (index !== target) { layer.node.remove(); layers.delete(index) }
    }
    selected.weight = selected.from = 1
    paint()
    delete stack.dataset.odysseyOperationsCaseBlending
  }
  const canAnimate = () => visible && !doc.hidden && !reduced.matches
  const advance = (time: number) => {
    if (!running) return
    const fraction = Math.max(0, Math.min(1, (time - started) / CROSSFADE_MS))
    const blend = ease(fraction)
    for (const layer of layers.values()) {
      const destination = layer.index === target ? 1 : 0
      layer.weight = layer.from + (destination - layer.from) * blend
    }
    paint()
    if (fraction === 1) finish()
  }
  const tick = (time: number) => {
    frame = 0
    if (disposed || !running) return
    if (!canAnimate()) { finish(); return }
    advance(time)
    if (running) frame = win.requestAnimationFrame(tick)
  }
  const onModeChange = () => { if (!canAnimate()) finish() }
  doc.addEventListener('visibilitychange', onModeChange)
  reduced.addEventListener('change', onModeChange)
  addLayer(target).weight = 1
  paint()

  return {
    select(next) {
      if (disposed || !Number.isFinite(next)) return
      next = Math.max(0, Math.min(2, Math.trunc(next)))
      if (next === target) return
      // Capture the current mixture before retargeting. Rapid selections retain
      // every visible weight rather than replacing a partially painted case.
      const now = win.performance.now()
      advance(now); cancel()
      target = next
      const selected = layers.get(target) || addLayer(target)
      stack.prepend(selected.node)
      for (const layer of layers.values()) layer.from = layer.weight
      paint(); onCommit(target)
      if (disposed) return
      if (!canAnimate()) { finish(); return }
      stack.dataset.odysseyOperationsCaseBlending = ''
      started = now; running = true
      frame = win.requestAnimationFrame(tick)
    },
    setVisible(next) {
      if (disposed || next === visible) return
      visible = next
      if (!next) finish()
    },
    dispose() {
      if (disposed) return
      finish(); disposed = true
      doc.removeEventListener('visibilitychange', onModeChange)
      reduced.removeEventListener('change', onModeChange)
    }
  }
}
