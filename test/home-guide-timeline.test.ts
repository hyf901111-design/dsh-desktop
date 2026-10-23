import { afterEach, expect, test, vi } from 'vitest'
import { createHomeGuideTimeline } from '../src/preload/home-guide-timeline'

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
