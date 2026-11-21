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

it('plays the opening without waiting for later speech and carries pending audio across an automatic turn', async () => {
  const calls = new Map(), audio = [], states = []
  function makeAudio() {
    const element = {play: vi.fn(async () => {}), pause() {}, load() {}, removeAttribute() {}}
    audio.push(element)
    return element
  }
  let page = 0
  const notes = ['开场白。请看这一页。', '换页了。', '']
  const narrator = createNarrator({ makeAudio,
    nextNotes: () => notes[page + 1] || '',
    changed: s => states.push(s),
    finished() { narrator.toggle(notes[++page] || '') },
    load(text) {
      expect(calls.has(text)).toBe(false)
      return new Promise(resolve => calls.set(text, () => resolve(new Blob([text]))))
    }
  })
  const tick = () => new Promise(resolve => setTimeout(resolve, 0))
  narrator.toggle(notes[0])
  expect([...calls.keys()]).toEqual(['开场白。', '请看这一页。'])
  calls.get('开场白。')()
  await tick()
  expect(states.at(-1)).toBe('playing')
  expect(calls.has('换页了。')).toBe(true)
  calls.get('换页了。')()
  calls.get('请看这一页。')()
  audio[0].onended()
  await tick()
  audio[1].onended()
  await tick()
  expect(page).toBe(1)
  expect(states.at(-1)).toBe('playing')
  audio[2].onended()
  expect(page).toBe(2)
  expect(states.at(-1)).toBe('idle')
})

it('keeps decimals intact and avoids a request per short list item', () => {
  expect(speechChunks('先看结果。增长约 2.25%，下一页再讨论。')[0]).toBe('先看结果。')
  const parts = speechChunks('先看结果。增长约 2.25%，下一页再讨论。')
  expect(parts.some(s => s.includes('2.25%'))).toBe(true)
  expect(speechChunks('开始。' + '请继续。'.repeat(30)).length).toBeLessThan(10)
})
