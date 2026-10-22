import {afterEach, expect, it, vi} from 'vitest'
import {createNoteHistoryLoader} from '../src/preload/notes/history-loader'

afterEach(() => vi.useRealTimers())
const saved = {owner:'alice',rows:[{requestId:'old',phase:'replied',result:{kind:'conversation',markdown:'重启前的实际回执'}}]}

it('retries an unavailable cold session and publishes its durable history without another navigation', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockRejectedValueOnce(Error("Error invoking remote method 'notes:request': Error: 笔记会话不可用。")).mockResolvedValue(saved)
  const accept = vi.fn(), onError = vi.fn(), loader = createNoteHistoryLoader({load,accept,onError,currentEpoch:()=>1})
  const pending = loader.request('own-note')
  expect(loader.request('own-note')).toBe(pending)
  await vi.runAllTimersAsync(); await pending
  expect(load.mock.calls).toEqual([['own-note'],['own-note']])
  expect(accept).toHaveBeenCalledExactlyOnceWith('own-note',saved)
  expect(onError).not.toHaveBeenCalled()
})

it('distinguishes a starting runtime from a genuinely empty history', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockResolvedValueOnce({...saved,rows:[],pending:true}).mockResolvedValueOnce({owner:'alice',rows:[]})
  const accept = vi.fn(), loader = createNoteHistoryLoader({load,accept,onError:vi.fn(),currentEpoch:()=>1})
  const pending = loader.request('new-note'); await vi.runAllTimersAsync(); await pending
  expect(load).toHaveBeenCalledTimes(2)
  expect(accept).toHaveBeenCalledExactlyOnceWith('new-note',{owner:'alice',rows:[]})
})

it('bounds repeated unavailable reads and never publishes a fabricated empty history', async () => {
  vi.useFakeTimers()
  const error = Error('笔记会话不可用。'), load = vi.fn().mockRejectedValue(error), accept = vi.fn(), onError = vi.fn()
  const loader = createNoteHistoryLoader({load,accept,onError,currentEpoch:()=>1})
  const pending = loader.request('own-note'); await vi.runAllTimersAsync(); await pending
  expect(load).toHaveBeenCalledTimes(8); expect(accept).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledExactlyOnceWith(error)
})

it('does not retry account errors or accept malformed history', async () => {
  const accept = vi.fn(), onError = vi.fn(), error = Error('账号已变化，请重新打开笔记。')
  const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({owner:'alice'})
  const loader = createNoteHistoryLoader({load,accept,onError,currentEpoch:()=>1})
  await loader.request('own-note'); await loader.request('own-note')
  expect(load).toHaveBeenCalledTimes(2); expect(accept).not.toHaveBeenCalled(); expect(onError.mock.calls[0]![0]).toBe(error)
  expect(onError.mock.calls[1]![0].message).toBe('笔记会话记录无效。')
})

it('drops late responses after identity reset without deleting a new same-session job', async () => {
  let epoch = 1, finishOld!: (value:typeof saved)=>void, finishNew!: (value:typeof saved)=>void
  const load = vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve})).mockImplementationOnce(()=>new Promise(resolve=>{finishNew=resolve}))
  const accept = vi.fn(), loader = createNoteHistoryLoader({load,accept,onError:vi.fn(),currentEpoch:()=>epoch})
  const old = loader.request('own-note'); epoch++; loader.reset()
  const current = loader.request('own-note'); finishOld(saved); await old
  expect(loader.request('own-note')).toBe(current)
  finishNew({...saved,owner:'bob'}); await current
  expect(accept).toHaveBeenCalledExactlyOnceWith('own-note',{...saved,owner:'bob'})
})

it('stops waiting retries on reset and keeps two session histories isolated', async () => {
  vi.useFakeTimers()
  let epoch = 1
  const load = vi.fn().mockRejectedValueOnce(Error('笔记会话不可用。')).mockResolvedValue(saved), accept = vi.fn()
  const loader = createNoteHistoryLoader({load,accept,onError:vi.fn(),currentEpoch:()=>epoch})
  const old = loader.request('first'); await vi.advanceTimersByTimeAsync(1)
  epoch++; loader.reset(); await old
  await loader.request('second'); await vi.runAllTimersAsync()
  expect(load.mock.calls).toEqual([['first'],['second']]); expect(accept).toHaveBeenCalledExactlyOnceWith('second',saved)
})
