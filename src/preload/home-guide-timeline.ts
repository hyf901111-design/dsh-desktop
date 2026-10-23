export type GuidePhase = 'ready' | 'playing' | 'paused' | 'completed' | 'error' | 'disposed'
export type GuideStep = { id: string; hold: number }
export type GuideTimeline = ReturnType<typeof createHomeGuideTimeline>

/** Serial tutorial operations with a pausable clock; owns no application state. */
export function createHomeGuideTimeline(options: {
  steps: readonly GuideStep[]
  run(step: string): Promise<void>
  onChange?(state: { phase: GuidePhase; index: number }): void
  onError?(error: unknown): void
}) {
  let phase: GuidePhase = 'ready', index = 0, active = false, holding = false, generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined, deadline = 0, remaining = 0
  const gates = new Set<{ resolve(): void; reject(error: Error): void }>()
  const aborted = () => Object.assign(Error('教程已结束。'), { name: 'AbortError' })
  const notify = () => options.onChange?.({ phase, index })
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const failed = (error: unknown) => {
    if (phase === 'disposed') return
    generation++; clear(); active = false; phase = 'error'
    for (const gate of gates) gate.reject(aborted())
    gates.clear(); notify(); options.onError?.(error)
  }
  const next = () => {
    clear()
    index++; active = false; holding = false; remaining = 0
    if (index >= options.steps.length) { phase = 'completed'; notify(); return }
    execute()
  }
  const schedule = () => {
    if (phase !== 'playing') return
    deadline = Date.now() + remaining
    timer = setTimeout(next, remaining)
  }
  const execute = () => {
    if (phase !== 'playing' || active) return
    if (!options.steps[index]) { phase = 'completed'; notify(); return }
    active = true
    const attempt = generation, step = options.steps[index]!
    notify()
    void Promise.resolve().then(async () => {
      if (phase === 'paused') await new Promise<void>((resolve, reject) => gates.add({ resolve, reject }))
      if (generation !== attempt || phase === 'disposed') return
      return options.run(step.id)
    }).then(() => {
      if (generation !== attempt || phase === 'disposed') return
      remaining = Math.max(0, step.hold); holding = true
      schedule()
    }, error => { if (generation === attempt) failed(error) })
  }
  return {
    snapshot: () => ({ phase, index }),
    play() {
      if (phase !== 'ready' && phase !== 'paused') return
      phase = 'playing'; notify()
      for (const gate of gates) gate.resolve()
      gates.clear()
      if (active) { if (holding) schedule() }
      else execute()
    },
    pause() {
      if (phase !== 'playing') return
      if (timer !== undefined) { remaining = Math.max(0, deadline - Date.now()); clear() }
      phase = 'paused'; notify()
    },
    waitUntilPlaying(): Promise<void> {
      if (phase === 'playing') return Promise.resolve()
      if (phase === 'disposed' || phase === 'error' || phase === 'completed') return Promise.reject(aborted())
      return new Promise((resolve, reject) => gates.add({ resolve, reject }))
    },
    dispose() {
      if (phase === 'disposed') return
      generation++; clear(); active = false; phase = 'disposed'
      for (const gate of gates) gate.reject(aborted())
      gates.clear(); notify()
    }
  }
}
