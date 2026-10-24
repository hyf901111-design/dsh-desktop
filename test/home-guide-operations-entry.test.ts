// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest'
import { playHomeGuideFromOperations, type HomeGuideKind } from '../src/preload/home-guides'

test.each<HomeGuideKind>(['board', 'note', 'ppt'])('reveals the native input before replaying the %s example', async kind => {
 const abort = new AbortController(), start = vi.fn(async () => {})
 let reveal!: () => void
 const revealComposer = vi.fn(() => new Promise<void>(resolve => { reveal = resolve }))
 const pending = playHomeGuideFromOperations({ start }, kind, { signal: abort.signal, revealComposer })
 expect(revealComposer).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled()
 reveal(); await pending
 expect(start).toHaveBeenCalledExactlyOnceWith(kind, { replay: true })
})

test('does not reveal or start an operation that was already cancelled', async () => {
 const abort = new AbortController(), start = vi.fn(async () => {}), revealComposer = vi.fn(async () => {})
 abort.abort()
 await expect(playHomeGuideFromOperations({ start }, 'ppt', { signal: abort.signal, revealComposer })).rejects.toMatchObject({ name: 'AbortError' })
 expect(revealComposer).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled()
})

test('does not launch a late guide when the operation is cancelled during the input handover', async () => {
 const abort = new AbortController(), start = vi.fn(async () => {})
 let reveal!: () => void
 const pending = playHomeGuideFromOperations({ start }, 'ppt', { signal: abort.signal, revealComposer: () => new Promise<void>(resolve => { reveal = resolve }) })
 const result = pending.catch(error => error)
 abort.abort(); reveal()
 expect(await result).toMatchObject({ name: 'AbortError' }); expect(start).not.toHaveBeenCalled()
})

test('propagates a failed input handover without starting the guide', async () => {
 const error = Error('输入框暂未就绪'), start = vi.fn(async () => {})
 await expect(playHomeGuideFromOperations({ start }, 'ppt', { signal: new AbortController().signal, revealComposer: async () => { throw error } })).rejects.toBe(error)
 expect(start).not.toHaveBeenCalled()
})

test('keeps a guide preparation failure visible to the operations caller', async () => {
 const error = Error('示例工作区尚未就绪'), start = vi.fn(async () => { throw error })
 await expect(playHomeGuideFromOperations({ start }, 'ppt', { signal: new AbortController().signal, revealComposer: async () => {} })).rejects.toBe(error)
 expect(start).toHaveBeenCalledExactlyOnceWith('ppt', { replay: true })
})
