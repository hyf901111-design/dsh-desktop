import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareUpdateRestart } from '../src/main/update/restart-preparation'
afterEach(() => vi.useRealTimers())
function fixture() {
  const ipc = new EventEmitter()
  const webContents = Object.assign(new EventEmitter(), { mainFrame: { processId: 1, routingId: 2 }, send: vi.fn(), isDestroyed: () => false })
  const window = { isDestroyed: () => false, webContents }
  const save = vi.fn(async () => {})
  const run = () => prepareUpdateRestart(window as any, ipc as any, save, 100)
  const reply = (error?: string) => ipc.emit('updates:prepared', { sender: webContents, senderFrame: webContents.mainFrame }, webContents.send.mock.calls[0]![1], error)
  return { ipc, webContents, window, save, run, reply }
}
it('waits for a correlated trusted renderer reply and then actual main-process persistence', async () => {
  const f = fixture(), promise = f.run()
  f.ipc.emit('updates:prepared', { sender: f.webContents, senderFrame: { processId: 1, routingId: 3 } }, f.webContents.send.mock.calls[0]![1])
  expect(f.save).not.toHaveBeenCalled()
  f.reply()
  await promise
  expect(f.save).toHaveBeenCalledOnce()
  expect(f.ipc.listenerCount('updates:prepared')).toBe(0)
  expect(f.webContents.listenerCount('destroyed')).toBe(0)
})
it('fails closed on renderer save failure, timeout, absent window, and destruction', async () => {
  vi.useFakeTimers()
  const failed = fixture(), error = expect(failed.run()).rejects.toThrow('本地写入失败')
  failed.reply('本地写入失败'); await error
  expect(failed.save).not.toHaveBeenCalled()
  const timed = fixture(), timeout = expect(timed.run()).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(100); await timeout
  timed.reply(); expect(timed.save).not.toHaveBeenCalled()
  await expect(prepareUpdateRestart(undefined, timed.ipc as any, timed.save)).rejects.toThrow('窗口')
  const destroyed = fixture(), gone = expect(destroyed.run()).rejects.toThrow('窗口')
  destroyed.webContents.emit('destroyed'); await gone
  destroyed.reply(); expect(destroyed.save).not.toHaveBeenCalled()
})
it('propagates main persistence failures and ignores duplicate renderer acknowledgements', async () => {
  const f = fixture(); f.save.mockRejectedValueOnce(Error('队列未确认'))
  const rejected = expect(f.run()).rejects.toThrow('队列未确认')
  f.reply(); f.reply(); await rejected
  expect(f.save).toHaveBeenCalledOnce()
})
