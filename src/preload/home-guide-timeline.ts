export type GuidePhase = 'ready' | 'playing' | 'paused' | 'completed' | 'error' | 'disposed'
export type GuideStep = { id: string; hold: number }
export type GuideTimeline = ReturnType<typeof createHomeGuideTimeline>
type Clock = { remaining: number; deadline: number; timer?: ReturnType<typeof setTimeout>; resolve(): void; reject(error: Error): void }

/** One scene at a time. Reading time and action delays share the pause clock. */
export function createHomeGuideTimeline(options: {
  steps: readonly GuideStep[]
  run(step: string): Promise<void>
  onChange?(state: { phase: GuidePhase; index: number; holding: boolean; busy: boolean }): void
  onError?(error: unknown): void
}) {
  let phase: GuidePhase = 'ready', index = 0, active = false, holding = false, generation = 0, single = false
  let timer: ReturnType<typeof setTimeout> | undefined, deadline = 0, remaining = 0
  const gates = new Set<{ resolve(): void; reject(error: Error): void }>(), clocks = new Set<Clock>()
  const aborted = () => Object.assign(Error('教程已结束。'), { name: 'AbortError' })
  const snapshot = () => ({ phase, index, holding, busy: active && !holding })
  const notify = () => options.onChange?.(snapshot())
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const stopClocks = () => { for (const clock of clocks) if (clock.timer !== undefined) { clock.remaining = Math.max(0, clock.deadline - Date.now()); clearTimeout(clock.timer); clock.timer = undefined } }
  const startClock = (clock: Clock) => {
    if (phase !== 'playing' || clock.timer !== undefined) return
    clock.deadline = Date.now() + clock.remaining
    clock.timer = setTimeout(() => { clocks.delete(clock); clock.timer = undefined; clock.resolve() }, clock.remaining)
  }
  const rejectWaiters = () => {
    stopClocks()
    for (const gate of gates) gate.reject(aborted()); gates.clear()
    for (const clock of clocks) clock.reject(aborted()); clocks.clear()
  }
  const failed = (error: unknown) => {
    if (phase === 'disposed') return
    generation++; clear(); active = false; phase = 'error'; rejectWaiters(); notify(); options.onError?.(error)
  }
  const nextScene = () => {
    clear(); index++; active = false; holding = false; remaining = 0
    if (index >= options.steps.length) { phase = 'completed'; notify(); return }
    execute()
  }
  const schedule = () => { if (phase === 'playing') { deadline = Date.now() + remaining; timer = setTimeout(nextScene, remaining) } }
  const wake = () => { for (const gate of gates) gate.resolve(); gates.clear(); for (const clock of clocks) startClock(clock) }
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
      if (single) { single = false; phase = 'paused'; stopClocks() }
      notify(); schedule()
    }, error => { if (generation === attempt) failed(error) })
  }
  return {
    snapshot,
    retry() {
      if (phase !== 'error') return
      holding = false; phase = 'ready'; this.play()
    },
    play() {
      if (phase !== 'ready' && phase !== 'paused') return
      phase = 'playing'; single = false; wake(); notify()
      if (active) { if (holding) schedule() } else execute()
    },
    pause() {
      if (phase !== 'playing') return
      if (timer !== undefined) { remaining = Math.max(0, deadline - Date.now()); clear() }
      stopClocks(); phase = 'paused'; single = false; notify()
    },
    next() {
      if (phase === 'disposed' || phase === 'error' || phase === 'completed' || active && !holding) return
      single = phase !== 'playing'; phase = 'playing'; wake()
      if (holding) nextScene(); else execute()
    },
    wait(ms: number, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted || phase === 'disposed' || phase === 'error' || phase === 'completed') return Promise.reject(aborted())
      return new Promise((resolve, reject) => {
        const clean = () => { if (clock.timer !== undefined) clearTimeout(clock.timer); clocks.delete(clock); signal?.removeEventListener('abort', cancel) }
        const cancel = () => { clean(); reject(aborted()) }
        const clock: Clock = { remaining: Math.max(0, ms), deadline: 0, resolve: () => { clean(); resolve() }, reject: error => { clean(); reject(error) } }
        signal?.addEventListener('abort', cancel, { once: true }); clocks.add(clock); startClock(clock)
      })
    },
    waitUntilPlaying(): Promise<void> {
      if (phase === 'playing') return Promise.resolve()
      if (phase === 'disposed' || phase === 'error' || phase === 'completed') return Promise.reject(aborted())
      return new Promise((resolve, reject) => gates.add({ resolve, reject }))
    },
    dispose() {
      if (phase === 'disposed') return
      generation++; clear(); active = false; phase = 'disposed'; rejectWaiters(); notify()
    }
  }
}
