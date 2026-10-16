import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareNativeMacInstall } from '../src/main/update/native-install'
import { finishQuitCleanup } from '../src/main/quit-cleanup'

function native() {
  return Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() })
}
afterEach(() => vi.useRealTimers())
it('prepares Squirrel without quitting before the explicit restart action', async () => {
  const updater = native()
  const result = prepareNativeMacInstall(updater)
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  updater.emit('update-downloaded')
  await result
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
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
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
})
it('joins a native command still running after the first wait times out', async () => {
  vi.useFakeTimers()
  const updater = native()
  let executing = false
  updater.checkForUpdates.mockImplementation(() => {
    if (executing) updater.emit('error', Error('The command is disabled and cannot be executed'))
    executing = true
  })
  const first = expect(prepareNativeMacInstall(updater, 100)).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(100)
  await first
  const retry = prepareNativeMacInstall(updater).then(() => 'ready', error => error.message)
  executing = false
  updater.emit('update-downloaded')
  expect(await retry).toBe('ready')
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
})
it('remembers a native completion that arrives between a timeout and its retry', async () => {
  vi.useFakeTimers()
  const updater = native()
  const first = expect(prepareNativeMacInstall(updater, 100)).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(100)
  await first
  updater.emit('update-downloaded')
  const retry = prepareNativeMacInstall(updater, 100).then(() => 'ready', error => error.message)
  await vi.advanceTimersByTimeAsync(100)
  expect(await retry).toBe('ready')
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
})
it('handles a native failure after all callers timed out and allows a fresh preparation', async () => {
  vi.useFakeTimers()
  const updater = native()
  const first = expect(prepareNativeMacInstall(updater, 100)).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(100)
  await first
  expect(() => updater.emit('error', Error('archive invalid'))).not.toThrow()
  const retry = prepareNativeMacInstall(updater)
  updater.emit('update-downloaded')
  await retry
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
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

it('aborts preparation without leaving a late completion listener',async()=>{
  const updater=native(),controller=new AbortController()
  const pending=expect(prepareNativeMacInstall(updater,120_000,controller.signal)).rejects.toThrow('cancelled')
  controller.abort(Error('cancelled'));await pending
  updater.emit('update-downloaded');expect(updater.quitAndInstall).not.toHaveBeenCalled()
  expect(updater.listenerCount('update-downloaded')).toBe(0)
  expect(updater.listenerCount('error')).toBe(0)
})
it('never starts a native check for an already cancelled preparation',async()=>{
  const updater=native(),controller=new AbortController();controller.abort(Error('cancelled'))
  await expect(prepareNativeMacInstall(updater,120_000,controller.signal)).rejects.toThrow('cancelled')
  expect(updater.checkForUpdates).not.toHaveBeenCalled();expect(updater.quitAndInstall).not.toHaveBeenCalled()
})
