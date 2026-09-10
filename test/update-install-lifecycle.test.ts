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

it('arms rename recovery before quit and cancels it if native installation throws', async () => {
  const updater = native(), cancel = vi.fn()
  const beforeQuit = vi.fn(async () => cancel)
  updater.quitAndInstall.mockImplementation(() => { throw new Error('installer failed') })
  const result = expect(prepareNativeMacInstall(updater, 120_000, beforeQuit)).rejects.toThrow('installer failed')
  expect(beforeQuit).not.toHaveBeenCalled()
  updater.emit('update-downloaded')
  await result
  expect(beforeQuit).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalledOnce()
})
it('keeps the original app running when the rename guard cannot start', async () => {
  const updater = native()
  const result = expect(prepareNativeMacInstall(updater, 120_000, async () => { throw new Error('guard unavailable') })).rejects.toThrow('guard unavailable')
  updater.emit('update-downloaded')
  await result
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  expect(updater.listenerCount('update-downloaded')).toBe(0)
})
it('does not restart after a native error while asynchronous research saving is pending', async () => {
  const updater = native(), cancel = vi.fn()
  let finish!: () => void
  const saved = new Promise<void>(resolve => { finish = resolve })
  const result = expect(prepareNativeMacInstall(updater, 120_000, async () => { await saved; return cancel })).rejects.toThrow('native failed')
  updater.emit('update-downloaded')
  expect(() => updater.emit('error', Error('native failed'))).not.toThrow()
  await result
  finish(); await Promise.resolve(); await Promise.resolve()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalledOnce()
})
it('aborts the pending preparation before an expired attempt can record a restart', async () => {
  vi.useFakeTimers()
  const updater = native(), recordRestart = vi.fn()
  let finish!: () => void
  const saved = new Promise<void>(resolve => { finish = resolve })
  const result = expect(prepareNativeMacInstall(updater, 100, async signal => {
    await saved
    signal.throwIfAborted()
    recordRestart()
    return undefined
  })).rejects.toThrow('超时')
  updater.emit('update-downloaded')
  await vi.advanceTimersByTimeAsync(100)
  await result
  finish(); await Promise.resolve(); await Promise.resolve()
  expect(recordRestart).not.toHaveBeenCalled()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
})
