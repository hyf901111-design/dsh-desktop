import { afterEach, expect, test, vi } from 'vitest'
import { createHomeGuideTimeline } from '../src/preload/home-guide-timeline'

test('retries the failed scene without repeating a completed scene', async () => {
  vi.useFakeTimers()
  const played: string[] = []
  let failed = false
  const timeline = createHomeGuideTimeline({
    steps: [{ id: 'first', hold: 0 }, { id: 'second', hold: 0 }],
    async run(step) {
      played.push(step)
      if (step === 'second' && !failed) {
        failed = true
        throw Error('control not ready')
      }
    }
  })
  timeline.play()
  await vi.runAllTimersAsync()
  expect(timeline.snapshot()).toMatchObject({ phase: 'error', index: 1 })
  timeline.retry()
  await vi.runAllTimersAsync()
  expect(played).toEqual(['first', 'second', 'second'])
  expect(timeline.snapshot().phase).toBe('completed')
  timeline.dispose()
})

afterEach(() => vi.useRealTimers())

test('keeps atomic steps ordered and provides readable holds', async () => {
  vi.useFakeTimers()
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 500 }, { id: 'b', hold: 200 }], run: async step => { seen.push(step) } })
  timeline.play()
  await vi.advanceTimersByTimeAsync(499)
  expect(seen).toEqual(['a'])
  await vi.advanceTimersByTimeAsync(1)
  expect(seen).toEqual(['a', 'b'])
  await vi.advanceTimersByTimeAsync(200)
  expect(timeline.snapshot().phase).toBe('completed')
  timeline.dispose()
})

test('pause freezes the remaining hold and blocks adapter gates', async () => {
  vi.useFakeTimers()
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 500 }, { id: 'b', hold: 0 }], run: async step => { seen.push(step) } })
  timeline.play()
  await vi.advanceTimersByTimeAsync(200)
  timeline.pause()
  let passed = false
  void timeline.waitUntilPlaying().then(() => { passed = true })
  await vi.advanceTimersByTimeAsync(2000)
  expect(seen).toEqual(['a']); expect(passed).toBe(false)
  timeline.play()
  await vi.advanceTimersByTimeAsync(299)
  expect(seen).toEqual(['a']); expect(passed).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(seen).toEqual(['a', 'b'])
  timeline.dispose()
})

test('dispose rejects gates and late async completion cannot advance', async () => {
  vi.useFakeTimers()
  let resolve!: () => void
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 1 }, { id: 'b', hold: 0 }], run: async step => { seen.push(step); await new Promise<void>(done => { resolve = done }) } })
  timeline.play(); await vi.advanceTimersByTimeAsync(0)
  timeline.pause()
  const gate = timeline.waitUntilPlaying().catch(error => error.name)
  timeline.dispose(); resolve()
  await vi.advanceTimersByTimeAsync(100)
  expect(await gate).toBe('AbortError'); expect(seen).toEqual(['a'])
})

test('async failure stops once and repeated play does not run concurrent steps', async () => {
  vi.useFakeTimers()
  const run = vi.fn(async () => { throw Error('unavailable') })
  const onError = vi.fn()
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 1 }], run, onError })
  timeline.play(); timeline.play()
  await vi.advanceTimersByTimeAsync(100)
  expect(run).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledTimes(1)
  expect(timeline.snapshot().phase).toBe('error')
  timeline.dispose()
})

test('a zero hold that finishes while paused still advances after resume', async () => {
  vi.useFakeTimers()
  let resolve!: () => void
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 0 }, { id: 'b', hold: 1 }], run: async step => { seen.push(step); if (step === 'a') await new Promise<void>(done => { resolve = done }) } })
  timeline.play(); await vi.advanceTimersByTimeAsync(0)
  timeline.pause(); resolve(); await vi.advanceTimersByTimeAsync(1)
  timeline.play(); await vi.advanceTimersByTimeAsync(2)
  expect(seen).toEqual(['a', 'b']); expect(timeline.snapshot().phase).toBe('completed')
  timeline.dispose()
})

test('next advances one readable scene while paused without starting autoplay', async () => {
  vi.useFakeTimers()
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 4000 }, { id: 'b', hold: 4000 }, { id: 'c', hold: 4000 }], run: async id => { seen.push(id) } })
  timeline.play(); await vi.advanceTimersByTimeAsync(20); timeline.pause()
  timeline.next(); await vi.advanceTimersByTimeAsync(20)
  expect(seen).toEqual(['a', 'b']); expect(timeline.snapshot().phase).toBe('paused')
  await vi.advanceTimersByTimeAsync(8000); expect(seen).toEqual(['a', 'b'])
  timeline.dispose()
})

test('action waits spend only playing time and reject when the tutorial is disposed', async () => {
  vi.useFakeTimers()
  let done = false
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 4000 }], run: async () => { await timeline.wait(1000); done = true } })
  timeline.play(); await vi.advanceTimersByTimeAsync(400); timeline.pause()
  await vi.advanceTimersByTimeAsync(8000); expect(done).toBe(false)
  timeline.play(); await vi.advanceTimersByTimeAsync(599); expect(done).toBe(false)
  await vi.advanceTimersByTimeAsync(1); expect(done).toBe(true)
  const waiting = timeline.wait(4000).catch(error => error.name)
  timeline.dispose(); expect(await waiting).toBe('AbortError')
})

test('next cannot skip an operation still waiting for its real result', async () => {
  vi.useFakeTimers()
  let release!: () => void
  const seen: string[] = []
  const timeline = createHomeGuideTimeline({ steps: [{ id: 'a', hold: 4000 }, { id: 'b', hold: 4000 }], run: async id => { seen.push(id); if (id === 'a') await new Promise<void>(resolve => { release = resolve }) } })
  timeline.play(); await vi.advanceTimersByTimeAsync(0); timeline.next(); timeline.next()
  expect(seen).toEqual(['a'])
  release(); await vi.advanceTimersByTimeAsync(0); expect(timeline.snapshot().holding).toBe(true)
  timeline.next(); await vi.advanceTimersByTimeAsync(0); expect(seen).toEqual(['a', 'b'])
  timeline.dispose()
})
