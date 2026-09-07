import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareNativeMacInstall } from '../src/main/update/native-install'
import { finishQuitCleanup } from '../src/main/quit-cleanup'

function native() {
  return Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() })
}
afterEach(() => vi.useRealTimers())
it('waits for Squirrel to be ready before quitting', async () => {
  const updater = native()
  const result = prepareNativeMacInstall(updater)
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  updater.emit('update-downloaded')
  await result
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  expect(updater.listenerCount('error')).toBe(0)
})
it('times out without leaving a callback that quits later and allows retry', async () => {
  vi.useFakeTimers()
  const updater = native()
  const result = expect(prepareNativeMacInstall(updater, 100)).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(100)
  await result
  updater.emit('update-downloaded')
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  const retry = prepareNativeMacInstall(updater)
  updater.emit('update-downloaded')
  await retry
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
})
it('cleans up on native failure and synchronous failure', async () => {
  const updater = native()
  const result = expect(prepareNativeMacInstall(updater)).rejects.toThrow('denied')
  updater.emit('error', new Error('denied'))
  await result
  expect(updater.listenerCount('update-downloaded')).toBe(0)
  updater.checkForUpdates.mockImplementation(() => { throw new Error('busy') })
  await expect(prepareNativeMacInstall(updater)).rejects.toThrow('busy')
  expect(updater.listenerCount('error')).toBe(0)
})
it('does not hang application quit when a service never finishes stopping', async () => {
  vi.useFakeTimers()
  const quit = vi.fn(), warn = vi.fn()
  const done = finishQuitCleanup([() => new Promise(() => {})], quit, warn, 100)
  await vi.advanceTimersByTimeAsync(100)
  await done
  expect(quit).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out'))
})
it('waits for all cleanup tasks, including when one throws', async () => {
  const quit = vi.fn(), warn = vi.fn(), stopped = vi.fn()
  await finishQuitCleanup([() => { throw new Error('failed') }, async () => stopped()], quit, warn)
  expect(stopped).toHaveBeenCalledOnce()
  expect(quit).toHaveBeenCalledOnce()
  expect(warn).toHaveBeenCalledOnce()
})
