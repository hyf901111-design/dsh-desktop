import { expect, it, vi } from 'vitest'
import { createNarrator, speechChunks } from '../packages/presentation-editor/overlay/narration'

it('bounds long notes without losing text or splitting surrogate pairs', () => {
  const text = '讲完这句。' + '甲'.repeat(597) + '😀'.repeat(450) + '结束。'
  const chunks = speechChunks(text)
  expect(chunks.join('')).toBe(text)
  expect(chunks.every(chunk => chunk.length <= 600 && chunk.isWellFormed())).toBe(true)
})

it('ignores stale synthesis after changing slides and pauses while speech is loading', async () => {
  const jobs = []
  const changed = vi.fn(), finished = vi.fn()
  const audio = {play: vi.fn(async () => {}), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn()}
  const narrator = createNarrator({ changed, finished, makeAudio: () => audio,
    load: (text, demo, signal) => new Promise(resolve => jobs.push({text, signal, resolve})) })
  narrator.toggle('第一页')
  narrator.stop()
  narrator.toggle('第二页')
  narrator.toggle('第二页')
  expect(jobs[0].signal.aborted).toBe(true)
  jobs[0].resolve(new Blob(['old']))
  jobs[1].resolve(new Blob(['new']))
  await Promise.resolve()
  expect(audio.play).not.toHaveBeenCalled()
  narrator.toggle('第二页')
  await Promise.resolve()
  expect(audio.play).toHaveBeenCalledTimes(1)
  const ended = audio.onended
  narrator.stop()
  ended()
  expect(finished).not.toHaveBeenCalled()
})
